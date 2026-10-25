import {getCoreDatabase,getArchiveDatabase,getAuditDatabase} from './databases.js';
import {DEFAULT_D1_MAX_BYTES,CAPACITY_THRESHOLDS} from './database-capacity.js';

const fail=code=>{throw Object.assign(new Error(code),{code,status:503});};
const ceiling=DEFAULT_D1_MAX_BYTES*CAPACITY_THRESHOLDS.accelerateArchive/100;
export async function checkJobsImportCapacity(env,contract,{entity,reserveBytes=1000000}={}) {
  const jobsOnly=['ServiceList','ServiceListItem'].includes(entity);
  // Dedicated opt-in only. Never borrow the receivables opt-in or lower the global stop.
  if(String(env.D1_CAPACITY_BLOCK_BULK_WRITES)==='true'&&!(jobsOnly&&String(env.VISTOS_JOBS_BULK_IMPORT_APPROVED)==='true'))fail('d1_bulk_capacity_blocked');
  if(!jobsOnly)return {}; // Existing non-job flows retain their previous gates.
  const evidence=contract.capacityEvidence;
  if(!evidence?.approvedAt||!evidence?.estimateEvidenceId)fail('vistos_capacity_plan_unverified');
  const measured={};
  for(const [domain,get] of [['core',getCoreDatabase],['archive',getArchiveDatabase],['audit',getAuditDatabase]]) {
    const plan=evidence.domains?.[domain],maximum=Number(plan?.maxSizeBytes);
    if(!Number.isSafeInteger(maximum)||maximum<=0||maximum>ceiling)fail('vistos_capacity_plan_unverified');
    const result=await get(env).prepare('SELECT 1 AS capacity_probe').all(),size=Number(result.meta?.size_after);
    if(!Number.isSafeInteger(size)||size<=0)fail('vistos_capacity_measurement_unavailable');
    if(size+Math.max(1000000,reserveBytes)>=maximum)fail('vistos_target_capacity_exceeded');
    measured[domain]={sizeBytes:size,maxSizeBytes:maximum};
  }
  return measured;
}
