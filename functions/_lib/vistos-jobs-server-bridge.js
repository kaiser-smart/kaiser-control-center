// The existing scheduler calls the credential-bearing Pages runtime. No Vistos
// credentials are copied into the scheduler, and the service token authorizes
// only the fixed jobs-only handler (never a caller-supplied entity or URL).
export function jobsRunnerTokenMatches(received, expected) {
  if(typeof received!=='string'||typeof expected!=='string'||expected.length<32||received.length!==expected.length)return false;
  let diff=0;for(let i=0;i<expected.length;i++)diff|=received.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
export async function runVistosJobsServerBridge(env,{fetcher=fetch}={}) {
  if(String(env.VISTOS_JOBS_RUNNER_ENABLED)!=='true')return {status:'disabled'};
  if(typeof env.VISTOS_JOBS_RUNNER_TOKEN!=='string'||env.VISTOS_JOBS_RUNNER_TOKEN.length<32)return {status:'blocked',code:'vistos_jobs_runner_token_missing'};
  const base=String(env.APP_BASE_URL||'https://smart-odpady.ai').replace(/\/+$/,'');
  if(base!=='https://smart-odpady.ai')return {status:'blocked',code:'vistos_jobs_runner_origin_invalid'};
  try {
    const response=await fetcher(base+'/api/integrations/vistos/jobs-run-internal',{
      method:'POST',headers:{Authorization:`Bearer ${env.VISTOS_JOBS_RUNNER_TOKEN}`,'Content-Type':'application/json'},
      body:'{}',redirect:'manual',signal:AbortSignal.timeout(110000)
    });
    // workerd rejects redirect:error before sending a request. Manual + explicit
    // rejection keeps the same no-redirect policy without forwarding the token.
    if(response.status>=300&&response.status<400)return {status:'blocked',code:'vistos_jobs_redirect_rejected'};
    const result=await response.json().catch(()=>({}));
    if(!response.ok)return {status:'blocked',code:/^[a-z0-9_]+$/.test(result.code||'')?result.code:'vistos_jobs_server_unavailable'};
    return {status:['partial','disabled','blocked'].includes(result.status)?result.status:'partial',
      reads:Number.isSafeInteger(result.reads)?result.reads:0,blocked:Number.isSafeInteger(result.blocked)?result.blocked:0};
  }catch{return {status:'blocked',code:'vistos_jobs_server_unavailable'};}
}
