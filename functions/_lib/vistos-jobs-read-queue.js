import {syncVistosBatch} from './vistos-integration-store.js';

export const VISTOS_JOBS_CRON='* * * * *';
export const JOBS_RUN_BUDGET_MS=80000;
const ITEM_BACKLOG_LIMIT=80;
const STOP_CODES=new Set(['vistos_request_budget_exhausted','writer_deadline_exceeded','vistos_target_capacity_exceeded','d1_bulk_capacity_blocked']);

// A single installation lease also protects overlapping minute ticks. Individual
// pages retain their entity lease, atomic checkpoint and shared provider budget.
export async function runJobsReadQueue(env,db,contract,{maxBatches=12,deadline=Date.now()+JOBS_RUN_BUDGET_MS,clock=Date.now,syncBatch=syncVistosBatch}={}) {
  const installation=contract.installation,resource=installation+':jobs-runner',owner=crypto.randomUUID();
  const now=new Date(clock()).toISOString(),expires=new Date(deadline+20000).toISOString();
  const claim=await db.prepare(`INSERT INTO vistos_sync_entity_locks(resource,owner,expires_at) VALUES(?,?,?)
    ON CONFLICT(resource) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE expires_at<?`).bind(resource,owner,expires,now).run();
  if(!claim.meta?.changes)return [];
  const reads=[],limit=Math.max(1,Math.min(12,Math.trunc(maxBatches)||1));
  const canStart=()=>reads.length<limit&&clock()+10000<deadline;
  const read=async(entity,mode)=>{
    let result;
    try{result=await syncBatch({...env,syncRequestDeadline:deadline},{installation,entity,mode});}
    catch(error){result={status:'blocked',code:/^[a-z0-9_]+$/.test(error.code||'')?error.code:'vistos_operation_unavailable'};}
    reads.push({name:entity+':'+mode,...result});
    return !STOP_CODES.has(result.code)&&!result.joined;
  };
  try {
    const items=contract.entities?.ServiceListItem;
    const parentReads=items?.readVerified&&items.parentFilterVerified;
    const companies=contract.companyIds||[];
    if(!companies.length)return reads;
    const scope=companies.map(()=>'?').join(',');
    const pending=`(c.status IS NULL OR c.status<>'compared' OR COALESCE(json_extract(c.comparison_json,'$.parentFingerprint'),'')<>r.fingerprint)`;
    const join=`FROM vistos_source_records r LEFT JOIN vistos_sync_checkpoints c ON c.installation=r.installation AND c.entity='ServiceListItem' AND c.mode='parent:'||r.source_id
      WHERE r.installation=? AND r.entity='ServiceList' AND r.company_id IN (${scope})`;
    const backlog=parentReads?await db.prepare(`SELECT COUNT(*) AS count ${join} AND ${pending}`).bind(installation,...companies).first():null;
    // Stop adding headers when their items fall behind; resume automatically once
    // the queue drains. This bounds the visible gap instead of growing it forever.
    if(contract.entities?.ServiceList?.readVerified&&Number(backlog?.count||0)<ITEM_BACKLOG_LIMIT&&canStart()) {
      const cp=await db.prepare("SELECT status FROM vistos_sync_checkpoints WHERE installation=? AND entity='ServiceList' AND mode='priority_backfill'").bind(installation).first();
      const mode=contract.entities.ServiceList.priorityFilterVerified&&cp?.status!=='compared'?'priority_backfill':'initial_backfill';
      if(!await read('ServiceList',mode))return reads;
    }
    if(parentReads&&canStart()) {
      const staleBefore=new Date(clock()-86400000).toISOString();
      const {results:parents=[]}=await db.prepare(`SELECT r.source_id ${join} AND (${pending} OR c.last_success_at<?)
        ORDER BY CASE WHEN c.status='compared' THEN 1 ELSE 0 END,COALESCE(c.updated_at,''),r.planned_day DESC,r.source_id DESC LIMIT ?`)
        .bind(installation,...companies,staleBefore,limit-reads.length).all();
      for(const parent of parents) {
        if(!canStart())break;
        if(!await read('ServiceListItem','parent:'+parent.source_id))break;
      }
    } else if(items?.readVerified&&canStart())await read('ServiceListItem','initial_backfill');
    return reads;
  } finally {
    await db.prepare('DELETE FROM vistos_sync_entity_locks WHERE resource=? AND owner=?').bind(resource,owner).run();
  }
}
