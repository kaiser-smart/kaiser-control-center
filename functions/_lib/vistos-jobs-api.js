import { json, requireUserPermission } from './auth.js';
import { hasPermission } from '../../src/permissions.js';
import { authorizedIntegrationScope, integrationError, loadIntegrationContract, publicSourceRecord, readScopedRecord, syncVistosBatch, flushIntegrationAudit } from './vistos-integration-store.js';
import { confirmJobExecution } from './vistos-job-execution.js';
import { decodeSourceFields, fieldValues } from './vistos-source-model.js';
import { invoiceAccountingState, decimal, referenceIds, exactJsonParse } from './vistos-values.js';
import { previewTransfers, submitTransfers, processPaymentCommand, confirmAllocation, preparePaymentCorrection, submitPaymentCorrection, TRANSFER_LABELS } from './vistos-payment-outbox.js';

import { pragueDayBounds } from './vistos-time.js';
export { pragueDayBounds };
export async function listJobs(scope,url) {
  const params=url.searchParams,contract=await loadIntegrationContract(scope.db,scope.installation),rules=contract.entities.ServiceList||{};
  const verifiedDate=Boolean(rules.plannedField&&rules.verifiedFields?.includes(rules.plannedField));
  const where=['installation=?',"entity='ServiceList'",`company_id IN (${scope.companies.map(()=>'?')})`],bind=[scope.installation,...scope.companies];
  const q=params.get('q')||'';if(q.length>200)throw integrationError('search_too_long',400);
  if(q){where.push("(number LIKE ? ESCAPE '\\' OR customer LIKE ? ESCAPE '\\' OR place LIKE ? ESCAPE '\\')");const term='%'+q.replace(/[\\%_]/g,'\\$&')+'%';bind.push(term,term,term);}
  let dateFilterIndex=-1,dateBindStart=-1;
  const period=params.get('period')||(verifiedDate?'today':'all');
  if(period!=='all') {
    if(!verifiedDate)throw integrationError('planned_date_unverified',400);
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    let first=today,last=today;
    if(period==='week') {const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);first=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);last=d.toISOString().slice(0,10);}
    else if(period==='custom'){first=params.get('from')||'';last=params.get('to')||'';}
    else if(period!=='today')throw integrationError('invalid_period',400);
    const from=pragueDayBounds(first).from,to=pragueDayBounds(last).to;if(to<=from)throw integrationError('invalid_period',400);
    dateFilterIndex=where.length;dateBindStart=bind.length;
    where.push('((planned_day>=? AND planned_day<=?) OR (planned_start<? AND (planned_end>? OR planned_start>=?)))');bind.push(first,last,to,from,from);
  }
  for(const [param,column] of [['status','status'],['driver','driver_id'],['customer','customer']]){
    const value=params.get(param);if(value){if(value.length>150)throw integrationError('filter_invalid',400);where.push(`${column}=?`);bind.push(value);}
  }
  const vehicle=params.get('vehicle');if(vehicle){where.push('EXISTS(SELECT 1 FROM json_each(vehicle_ids_json) WHERE value=?)');bind.push(vehicle);}
  const quality=params.get('quality');if(quality==='unassigned')where.push('unassigned=1');else if(quality==='review')where.push('needs_review=1');else if(quality==='unknown_date')where.push('planned_day IS NULL AND planned_start IS NULL');
  const sizes=[25,50,100],size=Number(params.get('pageSize')||50);if(!sizes.includes(size))throw integrationError('invalid_page_size',400);
  const page=Number(params.get('page')||1);if(!Number.isSafeInteger(page)||page<1||page>100000)throw integrationError('invalid_page',400);
  const sorts={term:'COALESCE(planned_start,planned_day) IS NULL, COALESCE(planned_start,planned_day) ASC',number:'number ASC',status:'status ASC'};
  const sort=sorts[params.get('sort')||'term'];if(!sort)throw integrationError('invalid_sort',400);
  const filter=where.join(' AND ');
  const stats=await scope.db.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(status='in_progress'),0) AS inProgress,COALESCE(SUM(unassigned),0) AS unassigned,COALESCE(SUM(needs_review),0) AS review,
    COALESCE(SUM(planned_day IS NULL AND planned_start IS NULL),0) AS unknownDate FROM vistos_source_records WHERE ${filter}`).bind(...bind).first();
  if(dateFilterIndex>=0){
    const withoutDate=where.filter((_,i)=>i!==dateFilterIndex),withoutDateBind=bind.filter((_,i)=>i<dateBindStart||i>=dateBindStart+5);
    const unknown=await scope.db.prepare(`SELECT COUNT(*) AS count FROM vistos_source_records WHERE ${withoutDate.join(' AND ')} AND planned_day IS NULL AND planned_start IS NULL`).bind(...withoutDateBind).first();stats.unknownDate=unknown.count;
  }
  const {results=[]}=await scope.db.prepare(`SELECT * FROM vistos_source_records WHERE ${filter} ORDER BY ${sort},source_id,id LIMIT ? OFFSET ?`).bind(...bind,size,(page-1)*size).all();
  const {results:streams=[]}=await scope.db.prepare(`SELECT mode,status,offset,expected_count,last_success_at,updated_at,error_code FROM vistos_sync_checkpoints WHERE installation=? AND entity='ServiceList'`).bind(scope.installation).all();
  const importProgress=await scope.db.prepare(`SELECT COUNT(*) AS total,MAX(r.received_at) AS lastReceivedAt,
    COALESCE(SUM(CASE WHEN c.status='compared' AND json_extract(c.comparison_json,'$.parentFingerprint')=r.fingerprint THEN 0 ELSE 1 END),0) AS itemsPending
    FROM vistos_source_records r LEFT JOIN vistos_sync_checkpoints c ON c.installation=r.installation AND c.entity='ServiceListItem' AND c.mode='parent:'||r.source_id
    WHERE r.installation=? AND r.entity='ServiceList' AND r.company_id IN (${scope.companies.map(()=>'?')})`).bind(scope.installation,...scope.companies).first();
  return {rows:results.map(r=>publicSourceRecord(r,scope.rights)),stats,pagination:{page,pageSize:size,total:stats.total},period,dateVerified:verifiedDate,
    streams,importProgress,rights:scope.rights,companies:scope.companies,sourceCountConfirmed:false};
}
async function integrationStatus(scope) {
  const contract=await loadIntegrationContract(scope.db,scope.installation);
  const {results:streams=[]}=await scope.db.prepare('SELECT entity,mode,status,offset,expected_count,last_success_at,updated_at,error_code,comparison_json FROM vistos_sync_checkpoints WHERE installation=?').bind(scope.installation).all();
  const {results:runs=[]}=await scope.db.prepare('SELECT id,entity,mode,status,started_at,finished_at,rows_seen,error_code FROM vistos_sync_runs WHERE installation=? ORDER BY started_at DESC LIMIT 50').bind(scope.installation).all();
  const {results:tracking=[]}=await scope.db.prepare('SELECT status,COUNT(*) AS days,MAX(read_at) AS lastReadAt FROM vistos_tcars_trip_days WHERE installation=? GROUP BY status').bind(scope.installation).all();
  return {streams,runs,tracking,contractRevision:contract.revision,lastMoneyTransfer:null,lastAccountingReview:contract.writer?.lastAccountingReview||null,
    missing:contract.revision==='unverified'?['read_contract','company_mapping','date_semantics','writer_exclusivity']:[],writer:{configured:Boolean(contract.writer?.permissionsVerified),lookupVerified:contract.writer?.lookupVerified===true,accountingModelVerified:contract.writer?.accountingModelVerified===true},sourceCountConfirmed:false};
}
async function transfers(scope,url,env) {
  const status=url.searchParams.get('status'),page=Number(url.searchParams.get('page')||1),pageSize=50;
  const sourceTotal=async(entity,sourceId=null)=>(await scope.db.prepare(`SELECT COUNT(*) total FROM vistos_source_records WHERE installation=? AND entity=? AND company_id IN (${scope.companies.map(()=>'?')}) ${sourceId?'AND source_id=?':''}`).bind(scope.installation,entity,...scope.companies,...(sourceId?[sourceId]:[])).first()).total;
  if(!Number.isSafeInteger(page)||page<1||page>100000)throw integrationError('invalid_page',400);
  if(url.searchParams.get('view')==='invoices') {
    const invoiceId=url.searchParams.get('invoice');
    const {results=[]}=await scope.db.prepare(`SELECT * FROM vistos_source_records WHERE installation=? AND entity='InvoiceIssued' AND company_id IN (${scope.companies.map(()=>'?')}) ${invoiceId?'AND source_id=?':''} ORDER BY received_at DESC,id LIMIT ? OFFSET ?`).bind(scope.installation,...scope.companies,...(invoiceId?[invoiceId]:[]),pageSize,(page-1)*pageSize).all();
    const contract=await loadIntegrationContract(scope.db,scope.installation);
    return {rows:[],invoices:results.map(row=>({id:row.id,sourceId:row.source_id,companyId:row.company_id,receivedAt:row.received_at,number:row.number,
      fields:publicSourceRecord(row,{finance:true,personal:false}).fields,accounting:invoiceAccountingState(fieldValues(decodeSourceFields(row.fields_json)),{modelVerified:contract.writer?.accountingModelVerified===true})})),page,pagination:{page,pageSize,total:await sourceTotal('InvoiceIssued',invoiceId)},writerEnabled:false};
  }
  if(status==='source_only') {
    const {results=[]}=await scope.db.prepare(`SELECT * FROM vistos_source_records WHERE installation=? AND entity='Payment' AND company_id IN (${scope.companies.map(()=>'?')}) ORDER BY received_at DESC,id LIMIT ? OFFSET ?`).bind(scope.installation,...scope.companies,pageSize,(page-1)*pageSize).all();
    return {rows:results.map(r=>({id:r.id,state:'source_only',fields:publicSourceRecord(r,{finance:true,personal:false}).fields})),page,pagination:{page,pageSize,total:await sourceTotal('Payment')},writerEnabled:false};
  }
  const where=`installation=? AND company_id IN (${scope.companies.map(()=>'?')})`,bind=[scope.installation,...scope.companies];
  if(status&&!Object.hasOwn(TRANSFER_LABELS,status))throw integrationError('invalid_transfer_status',400);
  const {results=[]}=await scope.db.prepare(`SELECT id,allocation_id,company_id,invoice_source_id,payment_source_id,state,payload_json,error_code,updated_at FROM vistos_payment_commands WHERE ${where}${status?' AND state=?':''} ORDER BY created_at DESC,id LIMIT ? OFFSET ?`).bind(...bind,...(status?[status]:[]),pageSize,(page-1)*pageSize).all();
  const {results:stats=[]}=await scope.db.prepare(`SELECT state,COUNT(*) AS count FROM vistos_payment_commands WHERE ${where} GROUP BY state`).bind(...bind).all();
  const {results:pending=[]}=await scope.db.prepare(`SELECT allocation_id,payload_json FROM vistos_allocation_confirmations WHERE ${where} AND status='confirmed' AND NOT EXISTS(SELECT 1 FROM vistos_payment_commands c WHERE c.allocation_id=vistos_allocation_confirmations.allocation_id) LIMIT 50`).bind(...bind).all();
  const contract=await loadIntegrationContract(scope.db,scope.installation),candidates=[];let candidatesMore=false;
  if(contract.bank?.verified){
    // CORE matches and ARCHIVE source records cannot participate in a D1 cross-domain JOIN.
    const {results:matches=[]}=await scope.db.prepare(`SELECT m.id,m.matched_amount,m.invoice_id,p.raw_payload,p.booking_date,p.source,i.visto_invoice_id FROM receivable_payment_matches m
      JOIN receivable_payment_transactions p ON p.id=m.payment_transaction_id JOIN receivable_invoices i ON i.id=m.invoice_id
      WHERE NOT EXISTS(SELECT 1 FROM vistos_allocation_confirmations a WHERE a.allocation_id=m.id) ORDER BY m.id LIMIT ? OFFSET ?`).bind(pageSize,(page-1)*pageSize).all();
    candidatesMore=matches.length===pageSize;
    for(const m of matches){
      const source=await scope.db.prepare(`SELECT source_id,company_id FROM vistos_source_records WHERE source_id=? AND entity='InvoiceIssued' AND installation=? AND company_id IN (${scope.companies.map(()=>'?')})`).bind(String(m.visto_invoice_id),scope.installation,...scope.companies).first();
      if(!source)continue;
      try{const raw=exactJsonParse(m.raw_payload),at=path=>String(path||'').split('.').filter(Boolean).reduce((v,k)=>v?.[k],raw),currencyId=contract.bank.currencyIds?.[at(contract.bank.currencyPath)],bankAccount=at(contract.bank.accountPath);
      if(m.source!==contract.bank.source||!currencyId||typeof bankAccount!=='string')continue;
      candidates.push({id:m.id,invoiceSourceId:source.source_id,companyId:source.company_id,currencyId,bankAccount,bankDate:m.booking_date,transactionAmount:decimal(at(contract.bank.amountPath)).source,suggestedAmount:String(m.matched_amount),revision:crypto.randomUUID()});
    }catch{}}
  }
  return {candidates,rows:results.map(r=>({...r,payload:JSON.parse(r.payload_json),payload_json:undefined})),pending:pending.map(r=>({id:r.allocation_id,payload:JSON.parse(r.payload_json)})),stats,page,pagination:{page,pageSize,hasNext:candidatesMore||results.length===pageSize,total:stats.filter(s=>!status||s.state===status).reduce((n,s)=>n+s.count,0)},writerEnabled:String(env.VISTOS_PAYMENT_WRITE_ENABLED)==='true'};
}
const ERROR_TEXT={vistos_company_scope_required:'Chybí potvrzený firemní rozsah přístupu.',vistos_company_forbidden:'K této firmě nemáte přístup.',vistos_read_sync_disabled:'Načítání zatím není aktivováno.',vistos_read_contract_unverified:'Nejprve je nutné ověřit datový kontrakt Vistosu.',d1_bulk_capacity_blocked:'Import čeká na ověření kapacity databáze.',transfer_gate_blocked:'Přenos čeká na ověření účetních podmínek.',tracking_permission_required:'Nemáte oprávnění ke sledování vozidel.'};
export async function handleVistosRequest(context,action) {
  const {request,env,params={}}=context,url=new URL(request.url),mutating=request.method==='POST';
  const module=action.startsWith('transfer')||action==='allocation-confirm'?'receivables':action.startsWith('integration')?'integrations':'jobs';
  const permission=action==='allocation-confirm'?'manage':module==='integrations'?'manage':action==='transfer-preview'||action==='transfer-submit'||action.startsWith('transfer-correction')?'vistos_write':action==='execution-confirm'?'manage':'view';
  const auth=await requireUserPermission(env,request,module,permission);if(auth.response)return auth.response;
  try {
    if(mutating&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)throw integrationError('origin_forbidden',403);
    let body={};if(mutating){const text=await request.text();if(text.length>32000)throw integrationError('request_too_large',413);try{body=JSON.parse(text);}catch{throw integrationError('invalid_json',400);}}
    const scope=await authorizedIntegrationScope(env,auth.user,{companyId:url.searchParams.get('company'),installation:url.searchParams.get('installation')});
    if(module==='receivables'&&!scope.rights.finance)throw integrationError('finance_permission_required',403);
    if(action==='jobs-list')return json(await listJobs(scope,url));
    if(action==='integration-status')return json(await integrationStatus(scope));
    if(action==='integration-sync') {
      const contract=await loadIntegrationContract(scope.db,scope.installation);
      if(contract.companyIds.some(id=>!scope.companies.includes(id)))throw integrationError('full_sync_scope_required',403);
      return json(await syncVistosBatch(env,{installation:scope.installation,entity:body.entity,mode:body.mode,actor:scope.user.id}));
    }
    if(action==='transfer-list')return json(await transfers(scope,url,env));
    if(action==='transfer-preview')return json(await previewTransfers(scope,body.ids,env));
    if(action==='transfer-submit')return json(await submitTransfers(scope,body,env));
    if(action==='transfer-correction-preview') {const p=await preparePaymentCorrection(scope,params.id,body,env);return json({operation:p.operation,amount:p.p.amount,invoiceSourceId:p.p.invoiceSourceId,fingerprint:p.fingerprint});}
    if(action==='transfer-correction-submit')return json(await submitPaymentCorrection(scope,params.id,body,env));
    if(action==='allocation-confirm')return json(await confirmAllocation(scope,body));
    if(action==='transfer-verify') {
      const c=await scope.db.prepare(`SELECT id FROM vistos_payment_commands WHERE id=? AND installation=? AND company_id IN (${scope.companies.map(()=>'?')})`).bind(params.id,scope.installation,...scope.companies).first();
      if(!c)throw integrationError('transfer_not_found',404);
      return json(await processPaymentCommand(env,c.id,{verifyOnly:true,actor:scope.user.id}));
    }
    if(action==='preferences') {
      if(mutating){const columns=Array.isArray(body.columns)?body.columns.filter(c=>['amount','quantity','invoice'].includes(c)&& (c!=='amount'||scope.rights.finance)):[];
        await scope.db.prepare('INSERT INTO vistos_user_preferences(user_id,columns_json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET columns_json=excluded.columns_json,updated_at=excluded.updated_at').bind(scope.user.id,JSON.stringify(columns),new Date().toISOString()).run();return json({columns});}
      const row=await scope.db.prepare('SELECT columns_json FROM vistos_user_preferences WHERE user_id=?').bind(scope.user.id).first();return json({columns:JSON.parse(row?.columns_json||'[]')});
    }
    const job=await readScopedRecord(scope,params.id);
    if(action==='job-items-refresh') {
      if(!mutating)throw integrationError('method_not_allowed',405);
      if(!scope.rights.manage)throw integrationError('integration_manage_required',403);
      return json(await syncVistosBatch(env,{installation:scope.installation,entity:'ServiceListItem',mode:'parent:'+job.source_id,actor:scope.user.id}));
    }
    if(action==='job-detail') {
      const page=Number(url.searchParams.get('itemsPage')||1),pageSize=100;
      if(!Number.isSafeInteger(page)||page<1||page>100000)throw integrationError('invalid_page',400);
      const itemScope="entity='ServiceListItem' AND installation=? AND parent_id=? AND company_id IN ("+scope.companies.map(()=>'?')+")";
      const total=(await scope.db.prepare(`SELECT COUNT(*) AS total FROM vistos_source_records WHERE ${itemScope}`).bind(scope.installation,job.source_id,...scope.companies).first()).total;
      const {results:items=[]}=await scope.db.prepare(`SELECT * FROM vistos_source_records WHERE ${itemScope} ORDER BY source_id,id LIMIT ? OFFSET ?`).bind(scope.installation,job.source_id,...scope.companies,pageSize,(page-1)*pageSize).all();
      const contract=await loadIntegrationContract(scope.db,scope.installation);
      const coverage=await scope.db.prepare("SELECT status,comparison_json FROM vistos_sync_checkpoints WHERE installation=? AND entity='ServiceListItem' AND mode=?").bind(scope.installation,'parent:'+job.source_id).first();
      return json({job:publicSourceRecord(job,scope.rights),items:items.map(r=>publicSourceRecord(r,scope.rights)),itemsPagination:{page,pageSize,total,hasNext:page*pageSize<total},itemsPartial:coverage?.status!=='compared'||JSON.parse(coverage?.comparison_json||'null')?.parentFingerprint!==job.fingerprint,
        itemsAvailable:contract.entities?.ServiceListItem?.readVerified===true&&Boolean(contract.entities.ServiceListItem.parentField),attachmentsAvailable:false,rights:scope.rights});
    }
    if(action==='job-history') {
      const before=url.searchParams.get('before')||'9999';
      const {results=[]}=await scope.db.prepare(`SELECT id,kind,actor,created_at FROM vistos_integration_events WHERE entity_id=? AND company_id=? AND (created_at || '|' || id)<? ORDER BY created_at DESC,id DESC LIMIT 51`).bind(job.id,job.company_id,before).all();
      return json({events:results.slice(0,50),next:results.length>50?results[49].created_at+'|'+results[49].id:null});
    }
    if(action==='job-execution'||action==='execution-confirm') {
      if(!scope.rights.tracking)throw integrationError('tracking_permission_required',403);
      if(action==='execution-confirm'){const result=await confirmJobExecution(scope,job.id,body);await flushIntegrationAudit(scope.db);return json(result);}
      const latest=await scope.db.prepare('SELECT * FROM job_execution_evidence WHERE job_id=? AND company_id=? ORDER BY revision DESC LIMIT 1').bind(job.id,job.company_id).first();
      if(!latest)return json({assignmentStatus:'unavailable',coverageStatus:'unavailable',reasons:['history_not_imported'],useForPayroll:false});
      const evidence=JSON.parse(latest.evidence_json);
      if(!scope.rights.personal){delete evidence.driver;for(const trip of evidence.trips||[]) {delete trip.driver;delete trip.responsiblePerson;}}
      const confirmation=await scope.db.prepare('SELECT decision,created_at FROM vistos_execution_confirmations WHERE evidence_id=?').bind(latest.id).first();
      return json({...evidence,id:latest.id,revision:latest.revision,confirmation,canConfirm:hasPermission(scope.user,'jobs','manage')});
    }
    throw integrationError('route_not_found',404);
  }catch(error){const code=/^[a-z0-9_]+$/.test(error.code||'')?error.code:'vistos_storage_unavailable';return json({error:ERROR_TEXT[code]||'Údaje se nepodařilo načíst nebo ověřit. Zkontrolujte podmínky propojení.',code},error.status||503);}
}
