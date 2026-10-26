import { getVistosById, loginVistosExecute } from './vistos-execute-client.js';
import { integrationDb, loadIntegrationContract, syncVistosBatch, refreshSourceDetail, persistVerifiedSourceReadback, flushIntegrationAudit, assertVistosInstallation } from './vistos-integration-store.js';
import { processPaymentCommand } from './vistos-payment-outbox.js';
import { enrichJobExecution } from './vistos-tracking-enrichment.js';
import {runJobsReadQueue,JOBS_RUN_BUDGET_MS} from './vistos-jobs-read-queue.js';

// Short, sequential tasks share the existing connector budget. No browser polling starts an import.
export async function runVistosJobsPayments(env,{now=new Date(),maxBatches=12,onlyJobs=false}={}) {
  if(String(env.VISTOS_JOBS_RUNNER_ENABLED)!=='true')return {status:'disabled'};
  const db=integrationDb(env),summary={status:'partial',reads:[],commands:[],execution:[]};
  const {results:contracts=[]}=await db.prepare('SELECT installation FROM vistos_integration_contracts ORDER BY installation').all();
  const {results:ruleRows=[]}=await db.prepare("SELECT id FROM module_rules WHERE id IN ('jobs-vistos-read','jobs-tcars-evidence','receivables-vistos-writer') AND status='active'").all();
  const active=new Set(ruleRows.map(r=>r.id));
  const deadline=Date.now()+JOBS_RUN_BUDGET_MS;
  let batches=0;
  for(const {installation}of contracts){
    const contract=await loadIntegrationContract(db,installation);
    const safe=async(name,fn)=>{try{return {name,...await fn()};}catch(error){return {name,status:'blocked',code:/^[a-z0-9_]+$/.test(error.code||'')?error.code:'vistos_operation_unavailable'};}};
    // Verification survives a writer rollback. No blocked/failed command is automatically resubmitted.
    if(!onlyJobs) {
    const {results:commands=[]}=await db.prepare(`SELECT id,state FROM vistos_payment_commands WHERE installation=? AND state IN ('ready','sending','verifying','outcome_unknown','recalculation_pending') ORDER BY CASE WHEN state='ready' THEN 1 ELSE 0 END,updated_at LIMIT 5`).bind(installation).all();
    for(const command of commands)if(command.state!=='ready'||active.has('receivables-vistos-writer'))summary.commands.push(await safe('payment',()=>processPaymentCommand(env,command.id)));
    }
    if(String(env.VISTOS_READ_SYNC_ENABLED)==='true'&&active.has('jobs-vistos-read')) {
      if(onlyJobs) {
        if((contract.entities?.ServiceList?.readVerified||contract.entities?.ServiceListItem?.readVerified)&&batches<maxBatches&&Date.now()+10000<deadline){
          const reads=await runJobsReadQueue(env,db,contract,{maxBatches:maxBatches-batches,deadline});
          summary.reads.push(...reads);batches+=reads.length;
        }
      }
      for(const entity of (onlyJobs?[]:['ServiceList','ServiceListItem','InvoiceIssued','Payment'])) {
        const rules=contract.entities?.[entity];if(!rules?.readVerified)continue;
        // Delta first, then one historical page. No single history job owns the entity indefinitely.
        for(const mode of [...(rules.modifiedFilterVerified?['delta']:[]),'initial_backfill',...(now.getUTCHours()<5?['reconciliation']:[])]) {
          if(batches++>=Math.min(40,maxBatches))break;
          summary.reads.push(await safe(entity+':'+mode,()=>syncVistosBatch(env,{installation,entity,mode})));
        }
      }
      if(!onlyJobs) {
      const {results:refresh=[]}=await db.prepare('SELECT * FROM vistos_detail_refresh_queue WHERE installation=? ORDER BY requested_at LIMIT 4').bind(installation).all();
      for(const task of refresh)if(contract.entities?.[task.entity]?.detailVerified)summary.reads.push(await safe('invoice_refresh',async()=>{
        assertVistosInstallation(env,contract);
        const readEnv={...env,VISTOS_EXACT_DECIMALS:true,VISTOS_REQUIRE_SHARED_BUDGET:true},session=await loginVistosExecute(readEnv);
        const {row}=await getVistosById(readEnv,session,task.entity,task.source_id,contract.entities[task.entity].detailColumns);
        if(String(row.Id)!==task.source_id)throw new Error('source_identity_mismatch');
        const result=await persistVerifiedSourceReadback(db,installation,task.entity,row,contract);
        if(result.status==='stored')await db.prepare('DELETE FROM vistos_detail_refresh_queue WHERE installation=? AND entity=? AND source_id=? AND requested_at=?').bind(installation,task.entity,task.source_id,task.requested_at).run();
        return result;
      }));
      }
      const {results:details=[]}=await db.prepare(`SELECT id,entity FROM vistos_source_records WHERE installation=? AND (${onlyJobs?"entity IN ('ServiceList','ServiceListItem') AND":''} (detail_at IS NULL OR detail_at<source_modified)) ORDER BY COALESCE(detail_at,''),received_at DESC LIMIT 4`).bind(installation).all();
      for(const record of details)if(contract.entities?.[record.entity]?.detailVerified&&(!onlyJobs||(batches++<maxBatches&&Date.now()+10000<deadline)))summary.reads.push(await safe('detail',()=>refreshSourceDetail(onlyJobs?{...env,syncRequestDeadline:deadline}:env,installation,record.id)));
    }
    if(String(env.VISTOS_JOB_EXECUTION_ENABLED)==='true'&&active.has('jobs-tcars-evidence')){
      const {results:jobs=[]}=await db.prepare(`SELECT r.* FROM vistos_source_records r LEFT JOIN vistos_execution_checks c ON c.job_id=r.id
        WHERE r.installation=? AND r.entity='ServiceList' AND r.company_id IS NOT NULL AND (c.checked_at IS NULL OR c.checked_at<?)
        ORDER BY CASE WHEN r.planned_day>=? OR r.planned_start>=? THEN 0 ELSE 1 END,COALESCE(c.checked_at,''),r.id LIMIT 4`).bind(installation,new Date(now-3600000).toISOString(),new Date(now-2*86400000).toISOString().slice(0,10),new Date(now-2*86400000).toISOString()).all();
      for(const job of jobs){const outcome=await safe('execution',()=>enrichJobExecution(env,job,contract,{now}));summary.execution.push(outcome);
        await db.prepare('INSERT INTO vistos_execution_checks(job_id,checked_at,error_code) VALUES(?,?,?) ON CONFLICT(job_id) DO UPDATE SET checked_at=excluded.checked_at,error_code=excluded.error_code').bind(job.id,now.toISOString(),outcome.code||null).run();}
    }
  }
  await flushIntegrationAudit(db,{onlyJobs});return summary;
}
