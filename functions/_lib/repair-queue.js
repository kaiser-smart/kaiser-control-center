import { digest, repairError } from './repair-input.js';
export const REPAIR_STATES = Object.freeze({queued:'Ve frontě',claimed:'Analyzuje se',validated:'Otestováno',deploying:'Nasazuje se',deployed:'Nasazeno – ověřte prosím',rolled_back:'Vráceno na předchozí verzi',failed:'Oprava se nezdařila',needs_decision:'Vyžaduje zvláštní rozhodnutí'});
const transitions={claimed:['validated','failed','needs_decision'],validated:['deploying','failed','needs_decision'],deploying:['deployed','rolled_back','needs_decision'],deployed:[],rolled_back:[],failed:[],needs_decision:[]};
export async function authorizeRunner(request,env) {
  const expected=String(env.REPAIR_RUNNER_TOKEN||'');
  if(expected.length<32 || env.REPAIR_AUTOMATION_ENABLED!=='true') throw repairError('Automatizace není aktivovaná.',503);
  const given=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  if(await digest(given)!==await digest(expected)) throw repairError('Neplatné přihlášení běhu.',401);
}
export async function claimRepair(db,runId,now=new Date().toISOString(),token=crypto.randomUUID()+crypto.randomUUID()) {
  if(!/^\d{1,20}-\d{1,3}$/.test(runId)) throw repairError('Neplatný identifikátor běhu.');
  // Never retry an ambiguous deployment automatically after a crash or timeout.
  await db.prepare("UPDATE repair_queue SET state='needs_decision', detail='Běh nedokončil ověření v časovém limitu. Je nutná kontrola produkce.',updated_at=? WHERE state IN ('claimed','validated','deploying') AND lease_until < ?").bind(now,now).run();
  const previous=await db.prepare('SELECT case_id FROM repair_queue WHERE run_id=?').bind(runId).first();
  if(previous) throw repairError('Tento běh již převzal hlášení.',409);
  const until=new Date(Date.parse(now)+55*60000).toISOString();
  const row=await db.prepare(`UPDATE repair_queue SET state='claimed',run_id=?,lease_hash=?,lease_until=?,updated_at=?
    WHERE case_id=(SELECT q.case_id FROM repair_queue q JOIN self_repair_cases c ON c.id=q.case_id WHERE q.state='queued' AND EXISTS(SELECT 1 FROM cross_database_workflows w WHERE w.idempotency_key='self-repair-user-report:' || c.client_request_id AND w.status='completed') ORDER BY q.created_at LIMIT 1)
    AND state='queued' AND NOT EXISTS(SELECT 1 FROM repair_queue WHERE state IN ('claimed','validated','deploying')) RETURNING *`).bind(runId,await digest(token),until,now).first();
  if(!row) return null;
  const report=await db.prepare('SELECT id,title,description,expected_behavior,source_route,module_key FROM self_repair_cases WHERE id=?').bind(row.case_id).first();
  return {caseId:row.case_id,runId,lease:token,report};
}
export function validateTransition(row,input) {
  if(!transitions[row.state]?.includes(input.state)) throw repairError('Nepovolený přechod stavu.',409);
  for(const key of ['base_sha','patch_sha','result_sha']) if(input[key] && !/^[a-f0-9]{40,64}$/.test(input[key])) throw repairError('Neplatný otisk.');
  for(const key of ['deployment_id','rollback_id']) if(input[key] && !/^[a-f0-9-]{36}$/.test(input[key])) throw repairError('Neplatné nasazení.');
  if(input.state==='validated' && (!/^[a-f0-9]{40}$/.test(input.base_sha||'') || !/^[a-f0-9]{64}$/.test(input.patch_sha||''))) throw repairError('Chybí doklad kontroly změn.');
  if(input.state==='deploying' && (!/^[a-f0-9]{40}$/.test(input.result_sha||'') || !input.rollback_id)) throw repairError('Chybí plán návratu.');
  if(input.state==='deployed' && (!input.deployment_id || input.result_sha!==row.result_sha || input.checks_passed!==true)) throw repairError('Nasazení není ověřené.');
  if(input.state==='rolled_back' && (input.rollback_id!==row.rollback_id || input.checks_passed!==true)) throw repairError('Návrat není ověřený.');
}
export async function finishRepair(db,input,now=new Date().toISOString()) {
  const row=await db.prepare('SELECT * FROM repair_queue WHERE case_id=?').bind(input.caseId).first();
  if(!row || row.run_id!==input.runId || row.lease_hash!==await digest(String(input.lease||'')) || row.lease_until<now) throw repairError('Neplatný nebo expirovaný běh.',409);
  if(row.state===input.state) return {ok:true,state:row.state};
  validateTransition(row,input);
  const r=await db.prepare(`UPDATE repair_queue SET state=?,detail=?,base_sha=COALESCE(?,base_sha),patch_sha=COALESCE(?,patch_sha),result_sha=COALESCE(?,result_sha),deployment_id=COALESCE(?,deployment_id),rollback_id=COALESCE(?,rollback_id),updated_at=? WHERE case_id=? AND state=? AND lease_hash=?`).bind(input.state,String(input.detail||'').slice(0,1200),input.base_sha||null,input.patch_sha||null,input.result_sha||null,input.deployment_id||null,input.rollback_id||null,now,row.case_id,row.state,row.lease_hash).run();
  if(!r.meta?.changes) throw repairError('Stav mezitím změnil jiný běh.',409);
  return {ok:true,state:input.state};
}
