import {getCoreDatabase,getArchiveDatabase,getAuditDatabase} from './databases.js';
import {DEFAULT_D1_MAX_BYTES,CAPACITY_THRESHOLDS} from './database-capacity.js';

const fail=code=>{throw Object.assign(new Error(code),{code,status:503});};
const ceiling=DEFAULT_D1_MAX_BYTES*CAPACITY_THRESHOLDS.accelerateArchive/100;
const recoveryCeiling=DEFAULT_D1_MAX_BYTES*CAPACITY_THRESHOLDS.warning/100;
// The pilot allowance is a soft limit only when an explicit, bounded recovery
// plan exists. Never expand the D1 limit or the global bulk-write permissions.
export function jobsCapacityAllowance(evidence,domain,size,reserveBytes) {
  const maximum=Number(evidence.domains?.[domain]?.maxSizeBytes);
  if(!Number.isSafeInteger(maximum)||maximum<=0||maximum>ceiling)fail('vistos_capacity_plan_unverified');
  const recovery=evidence.autoRecovery;
  if(!recovery)return maximum;
  const hard=Number(recovery.maxSizeBytes?.[domain]);
  if(!recovery.approvedAt||!recovery.evidenceId||!Number.isSafeInteger(hard)||hard<maximum||hard>recoveryCeiling)fail('vistos_capacity_plan_unverified');
  // Recompute from a live measurement on every page (also just before commit).
  // A 25 MB buffer and 100 MB steps avoid stopping at yesterday's pilot budget.
  return Math.min(hard,Math.max(maximum,Math.ceil((size+reserveBytes+25000000)/100000000)*100000000));
}
export async function checkJobsImportCapacity(env,contract,{entity,reserveBytes=1000000}={}) {
  const jobsOnly=['ServiceList','ServiceListItem'].includes(entity);
  // Dedicated opt-in only. Never borrow the receivables opt-in or lower the global stop.
  if(String(env.D1_CAPACITY_BLOCK_BULK_WRITES)==='true'&&!(jobsOnly&&String(env.VISTOS_JOBS_BULK_IMPORT_APPROVED)==='true'))fail('d1_bulk_capacity_blocked');
  if(!jobsOnly)return {}; // Existing non-job flows retain their previous gates.
  const evidence=contract.capacityEvidence;
  if(!evidence?.approvedAt||!evidence?.estimateEvidenceId)fail('vistos_capacity_plan_unverified');
  const measured={};
  if(!Number.isFinite(reserveBytes)||reserveBytes<0)fail('vistos_capacity_plan_unverified');
  const reserve=Math.max(1000000,Math.ceil(reserveBytes));
  for(const [domain,get] of [['core',getCoreDatabase],['archive',getArchiveDatabase],['audit',getAuditDatabase]]) {
    const result=await get(env).prepare('SELECT 1 AS capacity_probe').all(),size=Number(result.meta?.size_after);
    if(!Number.isSafeInteger(size)||size<=0)fail('vistos_capacity_measurement_unavailable');
    const maximum=jobsCapacityAllowance(evidence,domain,size,reserve);
    if(size+reserve>=maximum)fail('vistos_target_capacity_exceeded');
    measured[domain]={sizeBytes:size,maxSizeBytes:maximum};
  }
  return measured;
}
