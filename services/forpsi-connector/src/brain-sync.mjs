import { MailBrain } from './mail-brain.mjs';
import { workHash } from './work-v2-contract.mjs';
import { projectAttention } from './work-v2-resolver.mjs';

export async function runBrainSync({store,providerFactory,env,now=Date.now}) {
  if(env.MAIL_BRAIN_ENABLED!=='true'||env.MAIL_BRAIN_SCHEDULED_SYNC_ENABLED!=='true')
    return {status:'disabled',attempted:0};
  const rows=await store.rows(`SELECT DISTINCT c.mailbox_id,c.principal_id FROM brain_consents c
    JOIN principals p ON p.id=c.principal_id AND p.active=1 AND p.tenant_id=c.tenant_id
    JOIN mailboxes m ON m.id=c.mailbox_id AND m.active=1 AND m.tenant_id=c.tenant_id
    JOIN grants g ON g.principal_id=p.id AND g.mailbox_id=m.id AND g.action='read' AND g.revoked=0
    WHERE c.revoked_at IS NULL AND (NOT EXISTS (
      SELECT 1 FROM brain_sync_cursors s WHERE s.tenant_id=c.tenant_id AND s.mailbox_id=c.mailbox_id)
      OR EXISTS (SELECT 1 FROM brain_sync_cursors s WHERE s.tenant_id=c.tenant_id
        AND s.mailbox_id=c.mailbox_id AND (s.status!='complete' OR s.last_complete_at<?))
      ${env.MAIL_BRAIN_V2_ENABLED==='true'?`OR EXISTS (SELECT 1 FROM brain_cases b
        LEFT JOIN brain_work_heads_v2 h ON h.case_id=b.id
        LEFT JOIN brain_projection_revisions_v2 r ON r.id=h.published_revision
        WHERE b.tenant_id=c.tenant_id AND b.mailbox_id=c.mailbox_id AND b.merged_into_case_id IS NULL
          AND (r.id IS NULL OR COALESCE(json_extract(r.document_json,'$.analyzedInputRevision'),-1)!=b.revision))`:''})
    ORDER BY c.mailbox_id,c.principal_id LIMIT 8`,now()-900000);
  const attempted=new Set(),results=[];
  for(const row of rows){if(attempted.has(row.mailbox_id))continue;
    attempted.add(row.mailbox_id);
    const brain=new MailBrain({store,principal:{id:row.principal_id,scopes:['forpsi:read']},
      providerFactory,env,now});
    try{results.push(await brain.sync({mailboxId:row.mailbox_id,limit:20}));}
    catch(error){results.push({mailboxId:row.mailbox_id,status:'failed',code:error.message});}
  }
  return {status:'attempted',attempted:attempted.size,results};
}

export async function purgeClosedBrainCases({store,env,now=Date.now}) {
  if(env.MAIL_BRAIN_ENABLED!=='true')return {deleted:0};
  await store.run('DELETE FROM brain_drafts WHERE expires_at<?',now());
  const cutoff=now()-365*86400000;
  const migrated=await store.first("SELECT name FROM sqlite_master WHERE type='table' AND name='brain_work_heads_v2'");
  if(migrated)await store.run('DELETE FROM brain_view_manifests_v2 WHERE expires_at<?',now());
  const rows=await store.rows(`SELECT id FROM brain_cases WHERE state='done' AND done_at<?
    ${migrated?'AND NOT EXISTS (SELECT 1 FROM brain_work_heads_v2 h WHERE h.case_id=brain_cases.id)':''}
    ORDER BY done_at LIMIT 50`,cutoff);
  if(migrated){
    const candidates=await store.rows(`SELECT h.case_id id,h.revision,h.published_revision,b.revision source_revision,r.document_json,r.document_hash
      FROM brain_work_heads_v2 h JOIN brain_projection_revisions_v2 r ON r.id=h.published_revision
      JOIN brain_cases b ON b.id=h.case_id
      WHERE h.updated_at<? AND b.updated_at<? AND h.analysis_lease_until<=? AND h.guard_revision=r.guard_revision
      AND COALESCE(json_extract(r.document_json,'$.analyzedInputRevision'),-1)=b.revision
      AND EXISTS (SELECT 1 FROM brain_work_commands_v2 c WHERE c.case_id=h.case_id
        AND json_extract(c.result_json,'$.action')='close_case') ORDER BY h.updated_at LIMIT 50`,cutoff,cutoff,now());
    for(const candidate of candidates){
      if(workHash(candidate.document_json)!==candidate.document_hash)continue;
      const projection=JSON.parse(candidate.document_json);
      if(projection.pendingEventIds.length||projection.workItems.some(i=>['open','unresolved'].includes(i.status)))continue;
      const overrides=(await store.rows("SELECT document_json FROM brain_work_overrides_v2 WHERE case_id=? AND scope='shared'",candidate.id))
        .map(r=>JSON.parse(r.document_json));
      const view=projectAttention({projection,principalId:'retention',asOf:now(),canRead:()=>true,overrides});
      if(view.signals.length)continue;
      rows.push({...candidate,v2:true});
    }
  }
  let deleted=0;
  for(const row of rows){const {id}=row;
    const eligible=row.v2?`SELECT c.id FROM brain_cases c JOIN brain_work_heads_v2 h ON h.case_id=c.id
      WHERE c.id=? AND h.revision=? AND h.published_revision=? AND c.revision=?
        AND c.updated_at<? AND h.updated_at<? AND h.analysis_lease_until<=?`:
      `SELECT id FROM brain_cases WHERE id=? AND state='done' AND done_at<?
        ${migrated?'AND NOT EXISTS (SELECT 1 FROM brain_work_heads_v2 h WHERE h.case_id=brain_cases.id)':''}`;
    const values=row.v2?[id,row.revision,row.published_revision,row.source_revision,cutoff,cutoff,now()]:[id,cutoff];
    const results=await store.db.batch([
      store.db.prepare(`DELETE FROM brain_drafts WHERE case_id IN (${eligible})`).bind(...values),
      store.db.prepare(`DELETE FROM brain_attachments WHERE message_id IN
        (SELECT id FROM brain_messages WHERE case_id IN (${eligible}))`).bind(...values),
      store.db.prepare(`DELETE FROM brain_commitments WHERE case_id IN (${eligible})`).bind(...values),
      store.db.prepare(`DELETE FROM brain_action_observations WHERE case_id IN (${eligible})`).bind(...values),
      store.db.prepare(`DELETE FROM brain_case_events WHERE case_id IN (${eligible})`).bind(...values),
      store.db.prepare(`DELETE FROM brain_messages WHERE case_id IN (${eligible})`).bind(...values),
      ...(migrated?[store.db.prepare(`DELETE FROM brain_work_commands_v2 WHERE case_id IN (${eligible})`).bind(...values)]:[]),
      store.db.prepare(`DELETE FROM brain_cases WHERE id IN (${eligible})`).bind(...values),
    ]);
    deleted+=results.at(-1)?.meta?.changes??0;
  }
  return {deleted};
}
