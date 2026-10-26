import {json} from '../../../_lib/auth.js';
import {jobsRunnerTokenMatches} from '../../../_lib/vistos-jobs-server-bridge.js';
import {runVistosJobsPayments} from '../../../_lib/vistos-jobs-runner.js';

export async function handleJobsServerRun({request,env},run=runVistosJobsPayments) {
  const token=(request.headers.get('Authorization')||'').match(/^Bearer (.+)$/)?.[1];
  if(!jobsRunnerTokenMatches(token,env.VISTOS_JOBS_RUNNER_TOKEN))return json({code:'vistos_jobs_runner_unauthorized'},401);
  if(String(env.VISTOS_JOBS_RUNNER_ENABLED)!=='true'||String(env.VISTOS_READ_SYNC_ENABLED)!=='true')return json({status:'disabled',reads:0,blocked:0});
  // No body-controlled operation, installation, permissions or source URL.
  // Every source read still requires its persisted contract, module rule and capacity check.
  try {
    const result=await run({...env,VISTOS_PAYMENT_WRITE_ENABLED:'false',VISTOS_JOB_EXECUTION_ENABLED:'false'},{onlyJobs:true,maxBatches:12});
    const reads=result.reads||[];
    return json({status:result.status,reads:reads.length,blocked:reads.filter(r=>r.status==='blocked').length});
  }catch{return json({code:'vistos_jobs_server_unavailable'},503);}
}
export const onRequestPost=context=>handleJobsServerRun(context);
export const onRequestGet=()=>json({code:'method_not_allowed'},405,{Allow:'POST'});
