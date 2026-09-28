import { MailBrain } from './mail-brain.mjs';

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
        AND s.mailbox_id=c.mailbox_id AND (s.status!='complete' OR s.last_complete_at<?)))
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
  const rows=await store.rows(`SELECT id FROM brain_cases WHERE state='done' AND done_at<?
    ORDER BY done_at LIMIT 50`,cutoff);
  for(const {id} of rows){
    const eligible=`SELECT id FROM brain_cases WHERE id=? AND state='done' AND done_at<?`;
    await store.db.batch([
      store.db.prepare(`DELETE FROM brain_drafts WHERE case_id IN (${eligible})`).bind(id,cutoff),
      store.db.prepare(`DELETE FROM brain_attachments WHERE message_id IN
        (SELECT id FROM brain_messages WHERE case_id IN (${eligible}))`).bind(id,cutoff),
      store.db.prepare(`DELETE FROM brain_commitments WHERE case_id IN (${eligible})`).bind(id,cutoff),
      store.db.prepare(`DELETE FROM brain_action_observations WHERE case_id IN (${eligible})`).bind(id,cutoff),
      store.db.prepare(`DELETE FROM brain_case_events WHERE case_id IN (${eligible})`).bind(id,cutoff),
      store.db.prepare(`DELETE FROM brain_messages WHERE case_id IN (${eligible})`).bind(id,cutoff),
      store.db.prepare(`DELETE FROM brain_cases WHERE id=? AND state='done' AND done_at<?`).bind(id,cutoff),
    ]);
  }
  return {deleted:rows.length};
}
