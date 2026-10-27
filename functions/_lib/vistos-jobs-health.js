// Health uses completed attempts, never merely an HTTP 200 or a source date.
// Return aggregate state only for the caller's installation and companies.
export async function jobsSyncHealth(scope,{pending=true,now=Date.now()}={}) {
  const filter=`installation=? AND entity IN ('ServiceList','ServiceListItem') AND EXISTS
    (SELECT 1 FROM json_each(scope_json) WHERE value IN (${scope.companies.map(()=>'?')}))`;
  const args=[scope.installation,...scope.companies];
  const latest=await scope.db.prepare(`SELECT status,error_code,started_at,finished_at FROM vistos_sync_runs WHERE ${filter} ORDER BY started_at DESC,id DESC LIMIT 1`).bind(...args).first();
  const success=await scope.db.prepare(`SELECT MAX(finished_at) AS at FROM vistos_sync_runs WHERE ${filter} AND status IN ('partial','compared') AND error_code IS NULL`).bind(...args).first();
  const lastSuccessAt=success?.at||null;
  const stale=!lastSuccessAt||now-Date.parse(lastSuccessAt)>15*60000;
  const code=/^[a-z0-9_]+$/.test(latest?.error_code||'')?latest.error_code:null;
  const status=latest?.status==='error'?'blocked':pending&&stale?'stalled':lastSuccessAt?'ok':'unknown';
  return {status,code,lastAttemptAt:latest?.started_at||null,lastSuccessAt};
}
