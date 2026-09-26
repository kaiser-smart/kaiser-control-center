import { Workflow } from './workflow.mjs';

// Called by the 15-minute server cron. An approved personal preference determines
// which user's mailbox state is refreshed. It does not send ChatGPT notifications.
export async function runPersonalSync({store,providerFactory,env,now=Date.now}){
  if(env.CONNECTOR_ENABLED!=='true'||env.WORKFLOW_SYNC_ENABLED!=='true')
    return {enabled:false,attempted:0};
  const at=now(),owners=await store.rows(`SELECT DISTINCT v.tenant_id,v.principal_id,v.mailbox_id,v.profile_json
    FROM workflow_profile_versions v
    JOIN principals p ON p.id=v.principal_id AND p.active=1 AND p.tenant_id=v.tenant_id
    JOIN mailboxes m ON m.id=v.mailbox_id AND m.active=1 AND m.tenant_id=v.tenant_id
    JOIN grants g ON g.principal_id=p.id AND g.mailbox_id=m.id AND g.action='read' AND g.revoked=0
    LEFT JOIN workflow_sync_cursors c ON c.tenant_id=v.tenant_id AND c.principal_id=v.principal_id
      AND c.mailbox_id=v.mailbox_id
    WHERE v.active=1 AND json_extract(v.profile_json,'$.synchronization.mode')='interval'
    ORDER BY COALESCE(c.next_due,0),v.principal_id LIMIT 100`);
  const result={enabled:true,eligible:0,attempted:0,succeeded:0,failed:0,skipped:0};
  for(const owner of owners){
    const sync=JSON.parse(owner.profile_json).synchronization;
    if(sync?.mode!=='interval'||!Number.isInteger(sync.minutes)||sync.minutes<15||sync.minutes>240||sync.minutes%15){
      result.skipped++;continue;
    }
    result.eligible++;
    await store.run(`INSERT OR IGNORE INTO workflow_sync_cursors
      (tenant_id,principal_id,mailbox_id,next_due,lease_until) VALUES (?,?,?,0,0)`,
      owner.tenant_id,owner.principal_id,owner.mailbox_id);
    const claimed=await store.first(`UPDATE workflow_sync_cursors SET lease_until=?
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND next_due<=? AND lease_until<=?
      RETURNING next_due`,at+120000,owner.tenant_id,owner.principal_id,owner.mailbox_id,at,at);
    if(!claimed){result.skipped++;continue;}
    result.attempted++;
    let outcome='completed';
    try{
      const refresh=await new Workflow({store,principal:{id:owner.principal_id,scopes:['forpsi:read']},
        providerFactory,env,now}).refresh({mailboxId:owner.mailbox_id,limit:50});
      outcome=refresh.complete?'completed':'partial';result.succeeded++;
    }catch{outcome='failed';result.failed++;}
    await store.run(`UPDATE workflow_sync_cursors SET next_due=?,lease_until=0,last_run=?,last_outcome=?
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND lease_until=?`,
      at+sync.minutes*60000,at,outcome,owner.tenant_id,owner.principal_id,owner.mailbox_id,at+120000);
    await store.audit({id:owner.principal_id},owner.mailbox_id,'workflow.sync',outcome);
  }
  return result;
}
