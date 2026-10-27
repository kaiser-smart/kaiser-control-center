import {jobAuditFilter} from './vistos-read-audit.js';
import {checkJobsImportCapacity} from './vistos-import-capacity.js';
import { getModuleDatabase } from './databases.js';
import { hasPermission } from '../../src/permissions.js';
import { decodeSourceFields, normalizeSourceRecord, discloseFields, fieldValues } from './vistos-source-model.js';
import { numericId, sourceTime, referenceIds } from './vistos-values.js';
import { getVistosPage, getVistosById, loginVistosExecute } from './vistos-execute-client.js';

export function integrationDb(env) { return getModuleDatabase(env,{moduleName:'vistos-jobs-payments',allowedDomains:['core','archive','audit'],defaultDomain:'archive'}); }
export function integrationError(code,status=409) { return Object.assign(new Error(code),{code,status}); }
export async function loadIntegrationContract(db, installation) {
  const row=await db.prepare('SELECT * FROM vistos_integration_contracts WHERE installation=?').bind(installation).first();
  if(!row) return {installation,revision:'unverified',companyIds:[],entities:{},writer:{}};
  return {...JSON.parse(row.contract_json),installation,revision:row.revision};
}
export function assertVistosInstallation(env,contract) {
  let origin=null;try{origin=new URL(env.VISTOS_API_BASE_URL).origin;}catch{}
  if(!env.VISTOS_INSTALLATION_ID||env.VISTOS_INSTALLATION_ID!==contract.installation||!origin||contract.apiOrigin!==origin)throw integrationError('vistos_installation_unverified');
}
export async function authorizedIntegrationScope(env,user,{companyId=null,installation=null}={}) {
  const db=integrationDb(env);
  const result=await db.prepare('SELECT installation,company_id FROM vistos_company_access WHERE user_id=?').bind(user.id).all();
  const rows=result.results||[];
  const installations=[...new Set(rows.map(r=>r.installation))];
  const chosen=installation || (installations.length===1?installations[0]:null);
  if(!chosen) throw integrationError('vistos_company_scope_required',403);
  const companies=rows.filter(r=>r.installation===chosen).map(r=>r.company_id);
  if(!companies.length || (companyId && !companies.includes(companyId))) throw integrationError('vistos_company_forbidden',403);
  return {db,installation:chosen,companies:companyId?[companyId]:companies,user,
    rights:{finance:hasPermission(user,'jobs','view_finance'),personal:hasPermission(user,'jobs','view_personal'),tracking:hasPermission(user,'vehicle-tracking','view'),manage:hasPermission(user,'integrations','manage')}};
}
export const RECORD_COLUMNS=['id','installation','entity','source_id','company_id','number','customer','place','service','planned_start','planned_end','planned_day','status','driver_id','vehicle_ids_json','parent_id','unassigned','needs_review','fields_json','fingerprint','source_modified','received_at','detail_at','mapping_version'];
export async function flushIntegrationAudit(db,{onlyJobs=false}={}) {
  for (const table of (onlyJobs?['vistos_evidence_events']:['vistos_evidence_events','vistos_command_events'])) {
    const {results=[]}=await db.prepare(`SELECT * FROM ${table} WHERE delivered_at IS NULL ORDER BY created_at LIMIT 100`).all();
    for(const row of results) {
      await db.prepare(`INSERT INTO vistos_integration_events(id,entity_id,company_id,kind,actor,before_value,after_value,fields_json,created_at)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(row.id,row.record_id||row.command_id,row.company_id,row.kind||'payment_transition',row.actor,
        row.before_fingerprint||row.before_state||null,row.after_fingerprint||row.after_state||null,row.changed_fields_json||'[]',row.created_at).run();
      await db.prepare(`UPDATE ${table} SET delivered_at=? WHERE id=?`).bind(new Date().toISOString(),row.id).run();
    }
  }
}
// Items inherit the company only from an imported parent in the same installation.
// A customer reference or an unresolved parent can never widen company visibility.
export async function normalizeImportedRecord(db,row,options) {
  const {entity,installation,contract}=options,rules=contract.entities?.[entity]||{};
  let record=await normalizeSourceRecord(row,options);
  if(record&&entity==='ServiceListItem'&&rules.inheritCompanyFromParent===true&&record.parent_id) {
    const parent=await db.prepare("SELECT company_id FROM vistos_source_records WHERE installation=? AND entity='ServiceList' AND source_id=?").bind(installation,record.parent_id).first();
    record=await normalizeSourceRecord(row,{...options,parentCompanyId:parent?.company_id||null});
  }
  return record;
}
export async function syncVistosBatch(env,{installation,entity,mode='initial_backfill',actor='scheduler',pageSize=100,source=null,detailSource=null,now=new Date().toISOString()}={}) {
  if(!['ServiceList','ServiceListItem','Payment','InvoiceIssued'].includes(entity)||(!['initial_backfill','delta','reconciliation','priority_backfill'].includes(mode)&&!/^parent:[1-9][0-9]*$/.test(mode))) throw integrationError('invalid_sync_stream',400);
  if(String(env.VISTOS_READ_SYNC_ENABLED)!=='true') throw integrationError('vistos_read_sync_disabled',503);
  const db=integrationDb(env),contract=await loadIntegrationContract(db,installation),rules=contract.entities?.[entity];
  if(!rules?.readVerified || !rules.orderVerified || !contract.companyIds?.length || !contract.capacityEvidence?.approvedAt) throw integrationError('vistos_read_contract_unverified',503);
  const priority=mode==='priority_backfill',parentId=mode.startsWith('parent:')?mode.slice(7):null;
  let boundedFilter=null,parentFingerprint=null;
  if(priority) {
    if(entity!=='ServiceList'||!rules.priorityFilterVerified||!rules.detailOnImport)throw integrationError('vistos_priority_filter_unverified');
    boundedFilter=jobAuditFilter({entity,modifiedFrom:rules.priorityWindow?.from,modifiedTo:rules.priorityWindow?.to});
    if(!boundedFilter)throw integrationError('vistos_priority_filter_unverified');
  }
  if(parentId) {
    if(entity!=='ServiceListItem'||!rules.parentFilterVerified||rules.parentField!=='ServiceList_FK')throw integrationError('vistos_parent_filter_unverified');
    const parent=await db.prepare("SELECT company_id,fingerprint FROM vistos_source_records WHERE installation=? AND entity='ServiceList' AND source_id=?").bind(installation,parentId).first();
    if(!parent||!contract.companyIds.includes(parent.company_id))throw integrationError('vistos_parent_scope_unverified');
    boundedFilter=jobAuditFilter({entity,parentId});
    parentFingerprint=parent.fingerprint;
  }
  if(mode==='delta'&&!rules.modifiedFilterVerified) throw integrationError('vistos_delta_filter_unverified',503);
  if(rules.detailOnImport&&!rules.detailVerified)throw integrationError('vistos_detail_contract_unverified',503);
  pageSize=Math.max(1,Math.min(rules.detailOnImport?20:100,Math.trunc(pageSize)||100));
  const resource=`${installation}:${entity}`,owner=crypto.randomUUID(),expires=new Date(Date.parse(now)+120000).toISOString();
  const claim=await db.prepare(`INSERT INTO vistos_sync_entity_locks(resource,owner,expires_at) VALUES(?,?,?)
    ON CONFLICT(resource) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE expires_at<?`).bind(resource,owner,expires,now).run();
  if(!claim.meta?.changes) return {status:'running',joined:true};
  const checkpointId=`${resource}:${mode}`,runId=crypto.randomUUID();
  let count=0;
  try {
    await db.prepare(`INSERT INTO vistos_sync_checkpoints(id,installation,entity,mode,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(checkpointId,installation,entity,mode,now).run();
    let cp=await db.prepare('SELECT * FROM vistos_sync_checkpoints WHERE id=?').bind(checkpointId).first();
    if(['vistos_page_count_changed','vistos_page_order_unstable','vistos_page_range_mismatch'].includes(cp.error_code)) {
      // Restart a new comparison generation; never erase previously observed records.
      await db.prepare("UPDATE vistos_sync_checkpoints SET generation=generation+1,offset=0,last_source_id=NULL,expected_count=NULL,status='queued',error_code=NULL WHERE id=?").bind(cp.id).run();
      cp=await db.prepare('SELECT * FROM vistos_sync_checkpoints WHERE id=?').bind(cp.id).first();
    }
    if(priority&&(cp.window_from!==rules.priorityWindow.from||cp.window_to!==rules.priorityWindow.to)) {
      await db.prepare("UPDATE vistos_sync_checkpoints SET generation=generation+1,offset=0,last_source_id=NULL,expected_count=NULL,status='queued',error_code=NULL,window_from=?,window_to=? WHERE id=?").bind(rules.priorityWindow.from,rules.priorityWindow.to,cp.id).run();
      cp=await db.prepare('SELECT * FROM vistos_sync_checkpoints WHERE id=?').bind(cp.id).first();
    }
    const parentCurrent=parentId&&JSON.parse(cp.comparison_json||'null')?.parentFingerprint===parentFingerprint&&cp.last_success_at>new Date(Date.parse(now)-86400000).toISOString();
    if(cp.status==='compared' && (mode==='initial_backfill'||parentCurrent||priority)) return {status:'compared',alreadyRead:true};
    if(cp.status==='compared') {
      await db.prepare(`UPDATE vistos_sync_checkpoints SET generation=generation+1,offset=0,last_source_id=NULL,expected_count=NULL,status='queued',window_from=NULL,window_to=NULL WHERE id=?`).bind(cp.id).run();
      cp=await db.prepare('SELECT * FROM vistos_sync_checkpoints WHERE id=?').bind(cp.id).first();
    }
    if(mode==='delta'&&!cp.window_to) {
      const from=new Date(Date.parse(cp.confirmed_through||now)-3600000).toISOString();
      await db.prepare('UPDATE vistos_sync_checkpoints SET window_from=?,window_to=? WHERE id=?').bind(from,now,cp.id).run();cp.window_from=from;cp.window_to=now;
    }
    await db.prepare('INSERT INTO vistos_sync_runs(id,installation,entity,mode,status,started_at,scope_json) VALUES(?,?,?,?,?,?,?)').bind(runId,installation,entity,mode,'running',now,JSON.stringify(contract.companyIds)).run();
    // Record capacity failures like any other attempt, before contacting Vistos.
    // Previously the preflight threw before any checkpoint/run could report it.
    await checkJobsImportCapacity(env,contract,{entity});
    const readEnv={...env,VISTOS_EXACT_DECIMALS:true,VISTOS_REQUIRE_SHARED_BUDGET:true,syncRequestDeadline:Math.min(env.syncRequestDeadline||Infinity,Date.now()+90000)};
    if(!source)assertVistosInstallation(env,contract);
    const session=source?null:await loginVistosExecute(readEnv);
    const filter=boundedFilter||(mode==='delta'?{Modified_From:cp.window_from,Modified_To:cp.window_to}:null);
    const page=source?await source({offset:cp.offset,length:pageSize,filter}):await getVistosPage(readEnv,session,entity,rules.columns,filter,cp.offset,pageSize,{order:rules.idOrder});
    if(!page.countEvidence?.filteredReported || !Number.isSafeInteger(page.filtered)||page.filtered<0) throw integrationError('vistos_count_unverified');
    if(cp.expected_count!==null&&page.filtered!==cp.expected_count) throw integrationError('vistos_page_count_changed');
    if(page.rows.length>pageSize||(!page.rows.length&&cp.offset<page.filtered)||cp.offset+page.rows.length>page.filtered) throw integrationError('vistos_page_range_mismatch');
    let last=cp.last_source_id?BigInt(cp.last_source_id):0n;
    const statements=[];let pendingBytes=0;
    for(const row of page.rows) {
      const id=numericId(row.Id); if(!id||BigInt(id)<=last) throw integrationError('vistos_page_order_unstable'); last=BigInt(id);
      if(mode==='delta') { const t=sourceTime(row.Modified).instant;if(!t||t<cp.window_from||t>=cp.window_to) throw integrationError('vistos_modified_filter_ignored'); }
      if(parentId&&!referenceIds(row,'ServiceList_FK','list').includes(parentId))throw integrationError('vistos_parent_filter_ignored');
      const previous=await db.prepare('SELECT * FROM vistos_source_records WHERE installation=? AND entity=? AND source_id=?').bind(installation,entity,id).first();
      let record=await normalizeImportedRecord(db,row,{installation,entity,contract,previous,now});
      if(rules.detailOnImport) {
        // A failed detail rolls back this page's data/checkpoint; retry is read-only.
        // One shared login and a bounded page prevent a detail call per new session.
        if(source&&!detailSource)throw integrationError('vistos_detail_source_missing');
        const detail=detailSource?await detailSource(id):(await getVistosById(readEnv,session,entity,id,rules.detailColumns||rules.columns||[])).row;
        if(numericId(detail?.Id)!==id)throw integrationError('vistos_detail_identity_mismatch');
        if(parentId&&!referenceIds(detail,'ServiceList_FK','detail').includes(parentId))throw integrationError('vistos_parent_filter_ignored');
        if(priority) {
          const t=detail.Modified;
          if(typeof t!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(t)||t<cp.window_from||t>=cp.window_to)throw integrationError('vistos_modified_filter_ignored');
        }
        record=await normalizeImportedRecord(db,detail,{installation,entity,contract,previous:record||previous,kind:'detail',now});
        if(!record)throw integrationError('vistos_detail_version_older');
        // The audit compares the committed revision, not the intermediate list merge.
        const before=previous?fieldValues(decodeSourceFields(previous.fields_json)):{};
        const after=fieldValues(decodeSourceFields(record.fields_json));
        record.changedFields=Object.keys(after).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));
      }
      if(record && record.fingerprint!==previous?.fingerprint) {
        pendingBytes+=new TextEncoder().encode(record.fields_json).length*3+8192;
        const columns=RECORD_COLUMNS;
        statements.push(db.prepare(`INSERT INTO vistos_source_records(${columns.join(',')}) SELECT ${columns.map(()=>'?').join(',')} WHERE EXISTS(SELECT 1 FROM vistos_sync_entity_locks WHERE resource=? AND owner=?)
          ON CONFLICT(installation,entity,source_id) DO UPDATE SET ${columns.filter(c=>!['id','installation','entity','source_id'].includes(c)).map(c=>`${c}=excluded.${c}`).join(',')}`).bind(...columns.map(c=>record[c]),resource,owner));
        statements.push(db.prepare(`INSERT INTO vistos_evidence_events(id,record_id,company_id,kind,actor,before_fingerprint,after_fingerprint,changed_fields_json,created_at)
          SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM vistos_sync_entity_locks WHERE resource=? AND owner=?)`).bind(`${runId}:${id}`,record.id,record.company_id,'source_changed',actor,previous?.fingerprint||null,record.fingerprint,JSON.stringify(record.changedFields),now,resource,owner));
      }
      if(entity==='Payment'&&record?.fingerprint!==previous?.fingerprint){
        const old=previous?fieldValues(decodeSourceFields(previous.fields_json)):{};
        const invoices=[...new Set([...referenceIds(old,'InvoiceIssued_FK','detail'),...referenceIds(row,'InvoiceIssued_FK','list')])];
        for(const invoiceId of invoices)statements.push(db.prepare(`INSERT INTO vistos_detail_refresh_queue(installation,entity,source_id,requested_at) SELECT ?,'InvoiceIssued',?,? WHERE EXISTS(SELECT 1 FROM vistos_sync_entity_locks WHERE resource=? AND owner=?) ON CONFLICT(installation,entity,source_id) DO UPDATE SET requested_at=excluded.requested_at`).bind(installation,invoiceId,now,resource,owner));
      }
      statements.push(db.prepare('INSERT INTO vistos_sync_seen(checkpoint_id,generation,source_id,fingerprint) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM vistos_sync_entity_locks WHERE resource=? AND owner=?) ON CONFLICT DO NOTHING').bind(cp.id,cp.generation,id,record?.fingerprint||previous?.fingerprint||'',resource,owner));
    }
    count=page.rows.length;
    const next=cp.offset+count,done=next===page.filtered;
    statements.push(db.prepare(`UPDATE vistos_sync_checkpoints SET offset=?,expected_count=?,last_source_id=?,status=?,updated_at=?,error_code=NULL,
      last_success_at=CASE WHEN ? THEN ? ELSE last_success_at END,confirmed_through=CASE WHEN ? AND mode='delta' THEN window_to ELSE confirmed_through END
      WHERE id=? AND offset=? AND EXISTS(SELECT 1 FROM vistos_sync_entity_locks WHERE resource=? AND owner=?)`).bind(next,page.filtered,String(last),done?'compared':'partial',now,done?1:0,now,done?1:0,cp.id,cp.offset,resource,owner));
    await checkJobsImportCapacity(env,contract,{entity,reserveBytes:pendingBytes});
    const results=await db.batch(statements);
    if(!results.at(-1)?.meta?.changes) throw integrationError('vistos_lease_lost');
    await db.prepare(`UPDATE vistos_sync_runs SET status=?,finished_at=?,rows_seen=? WHERE id=?`).bind(done?'compared':'partial',new Date().toISOString(),count,runId).run();
    let comparison=null;
    if(done&&mode!=='delta') {
      const initial=mode==='reconciliation'&&cp.generation===1?await db.prepare("SELECT id,generation FROM vistos_sync_checkpoints WHERE installation=? AND entity=? AND mode='initial_backfill' AND status='compared'").bind(installation,entity).first():null;
      const baseline=cp.generation>1?{id:cp.id,generation:cp.generation-1}:initial;
      if(baseline){
        const changes=await db.prepare(`SELECT SUM(CASE WHEN previous.source_id IS NULL THEN 1 ELSE 0 END) added,
          SUM(CASE WHEN previous.source_id IS NOT NULL AND previous.fingerprint<>current.fingerprint THEN 1 ELSE 0 END) changed
          FROM vistos_sync_seen current LEFT JOIN vistos_sync_seen previous ON previous.checkpoint_id=? AND previous.generation=? AND previous.source_id=current.source_id
          WHERE current.checkpoint_id=? AND current.generation=?`).bind(baseline.id,baseline.generation,cp.id,cp.generation).first();
        const missing=await db.prepare(`SELECT COUNT(*) count FROM vistos_sync_seen previous LEFT JOIN vistos_sync_seen current
          ON current.checkpoint_id=? AND current.generation=? AND current.source_id=previous.source_id
          WHERE previous.checkpoint_id=? AND previous.generation=? AND current.source_id IS NULL`).bind(cp.id,cp.generation,baseline.id,baseline.generation).first();
        comparison={baseline,added:changes.added||0,changed:changes.changed||0,missing:missing.count,missingMeaning:'not_observed_not_deleted'};
      } else comparison={baseline:null,observed:next};
      if(parentId)comparison.parentFingerprint=parentFingerprint;
      await db.prepare('UPDATE vistos_sync_checkpoints SET comparison_json=? WHERE id=? AND generation=?').bind(JSON.stringify(comparison),cp.id,cp.generation).run();
    }
    await flushIntegrationAudit(db,{onlyJobs:['ServiceList','ServiceListItem'].includes(entity)});
    if(done)await db.prepare('DELETE FROM vistos_sync_seen WHERE checkpoint_id=? AND generation<?').bind(cp.id,Math.max(1,cp.generation-1)).run();
    return {status:done?'compared':'partial',offset:next,expected:page.filtered,completeImport:false,quality:'offset_scan_compared',comparison,runId};
  } catch(error) {
    const code=/^[a-z0-9_]+$/.test(error.code||'')?error.code:'vistos_sync_failed';
    await db.prepare(`UPDATE vistos_sync_checkpoints SET status='partial',error_code=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM vistos_sync_entity_locks WHERE resource=? AND owner=?)`).bind(code,now,checkpointId,resource,owner).run();
    await db.prepare(`UPDATE vistos_sync_runs SET status='error',finished_at=?,error_code=?,rows_seen=? WHERE id=?`).bind(new Date().toISOString(),code,count,runId).run();
    throw integrationError(code,error.status||502);
  } finally { await db.prepare('DELETE FROM vistos_sync_entity_locks WHERE resource=? AND owner=?').bind(resource,owner).run(); }
}
export function publicSourceRecord(row,rights) {
  const fields=discloseFields(decodeSourceFields(row.fields_json),rights);
  const values=fieldValues(fields);
  return {id:row.id,number:row.number||values.Number||`Vistos ${row.source_id}`,companyId:row.company_id,status:row.status,
    customer:row.customer,place:row.place,service:row.service,plannedStart:row.planned_start,plannedEnd:row.planned_end,plannedDay:row.planned_day,
    driverId:rights.personal?row.driver_id:null,vehicleIds:JSON.parse(row.vehicle_ids_json),unassigned:Boolean(row.unassigned),needsReview:Boolean(row.needs_review),
    receivedAt:row.received_at,detailAt:row.detail_at,fields};
}
export async function readScopedRecord(scope,id,entity='ServiceList') {
  const row=await scope.db.prepare(`SELECT * FROM vistos_source_records WHERE id=? AND installation=? AND entity=? AND company_id IN (${scope.companies.map(()=>'?')})`).bind(id,scope.installation,entity,...scope.companies).first();
  if(!row) throw integrationError('vistos_record_not_found',404);return row;
}

export async function refreshSourceDetail(env,installation,id) {
  const db=integrationDb(env),previous=await db.prepare('SELECT * FROM vistos_source_records WHERE id=? AND installation=?').bind(id,installation).first();
  if(!previous)throw integrationError('vistos_record_not_found',404);
  const contract=await loadIntegrationContract(db,installation),rules=contract.entities?.[previous.entity];
  if(String(env.VISTOS_READ_SYNC_ENABLED)!=='true'||!rules?.detailVerified)throw integrationError('vistos_detail_contract_unverified');
  assertVistosInstallation(env,contract);
  const readEnv={...env,VISTOS_EXACT_DECIMALS:true,VISTOS_REQUIRE_SHARED_BUDGET:true},session=await loginVistosExecute(readEnv);
  const {row}=await getVistosById(readEnv,session,previous.entity,previous.source_id,rules.detailColumns||rules.columns||[]);
  if(numericId(row.Id)!==previous.source_id)throw integrationError('vistos_detail_identity_mismatch');
  const now=new Date().toISOString(),record=await normalizeImportedRecord(db,row,{installation,entity:previous.entity,contract,previous,kind:'detail',now});
  if(!record)return {status:'older_detail_ignored'};
  // Compare-and-swap prevents a slow detail from overwriting a concurrently imported revision.
  const columns=RECORD_COLUMNS.filter(c=>!['id','installation','entity','source_id'].includes(c));
  const statements=[];
  if(record.fingerprint!==previous.fingerprint)statements.push(db.prepare(`INSERT INTO vistos_evidence_events(id,record_id,company_id,kind,actor,before_fingerprint,after_fingerprint,changed_fields_json,created_at)
    SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM vistos_source_records WHERE id=? AND fingerprint=?)`).bind(crypto.randomUUID(),id,record.company_id,'detail_changed','scheduler',previous.fingerprint,record.fingerprint,JSON.stringify(record.changedFields),now,id,previous.fingerprint));
  statements.push(db.prepare(`UPDATE vistos_source_records SET ${columns.map(c=>c+'=?')} WHERE id=? AND fingerprint=?`).bind(...columns.map(c=>record[c]),id,previous.fingerprint));
  const updated=await db.batch(statements);
  if(!updated.at(-1)?.meta?.changes)return {status:'revision_changed'};
  return {status:'read'};
}

export async function persistVerifiedSourceReadback(db,installation,entity,row,contract,{kind='detail',actor='scheduler'}={}) {
  const id=numericId(row?.Id);if(!id)throw integrationError('source_identity_missing');
  const previous=await db.prepare('SELECT * FROM vistos_source_records WHERE installation=? AND entity=? AND source_id=?').bind(installation,entity,id).first();
  const record=await normalizeImportedRecord(db,row,{installation,entity,contract,previous,kind});if(!record)return {status:'older_or_unversioned'};
  const statements=[],columns=RECORD_COLUMNS;
  const guard=previous?'EXISTS(SELECT 1 FROM vistos_source_records WHERE id=? AND fingerprint=?)':'NOT EXISTS(SELECT 1 FROM vistos_source_records WHERE installation=? AND entity=? AND source_id=?)';
  const args=previous?[previous.id,previous.fingerprint]:[installation,entity,id];
  if(record.fingerprint!==previous?.fingerprint)statements.push(db.prepare(`INSERT INTO vistos_evidence_events(id,record_id,company_id,kind,actor,before_fingerprint,after_fingerprint,changed_fields_json,created_at)
    SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),record.id,record.company_id,'verified_readback',actor,previous?.fingerprint||null,record.fingerprint,JSON.stringify(record.changedFields),record.received_at,...args));
  statements.push(db.prepare(`INSERT INTO vistos_source_records(${columns}) SELECT ${columns.map(()=>'?')} WHERE ${guard}
    ON CONFLICT(installation,entity,source_id) DO UPDATE SET ${columns.filter(c=>!['id','installation','entity','source_id'].includes(c)).map(c=>`${c}=excluded.${c}`)}`).bind(...columns.map(c=>record[c]),...args));
  const result=await db.batch(statements);return {status:result.at(-1)?.meta?.changes?'stored':'revision_changed'};
}
