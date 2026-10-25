import {getVistosById, getVistosPage, getVistosSchemaEntity, loginVistosExecute} from './vistos-execute-client.js';
import {vistosSchemaColumnNames} from './vistos-contacts-audit.js';
import {numericId, referenceIds} from './vistos-values.js';
import {mergeSourceFields,encodeSourceFields} from './vistos-source-model.js';

// Installation diagnosis exposes identifiers and availability, never source financial or personal values.
// No permissions, contracts, checkpoints or source records are changed by this probe.
export const AUDIT_ENTITIES = ['ServiceList', 'ServiceListItem', 'InvoiceIssued', 'Payment', 'BusinessUnit'];
const EXCLUDE = /password|passwd|secret|token|cookie|authorization|credential/i;
const ID_FIELDS = ['AssignedToCompany_FK', 'Issuer_FK', 'BusinessUnit_FK', 'Evidovatnafirmu', 'CustomerCompany_FK',
  'CustomerBranch_FK', 'ServiceList_FK', 'MasterParent_FK', 'Contract_FK', 'ContractRow_FK', 'InvoiceIssued_FK',
  'Auto_FK', 'Vozidlo_FK', 'AllocatedVehicle', 'RidicContact_FK', 'Status_FK', 'Type_FK', 'Currency_FK', 'Product_FK', 'UOM_FK'];
const TIME_FIELDS = ['Created', 'Modified', 'DateOfServiceList', 'DateOfRealization', 'DateStart', 'DateEnd', 'StartOfResolution', 'EndOfResolution'];
function shape(value) { return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value; }
export function readAuditRecord(row, kind, entity) {
  const fields = Object.fromEntries(Object.entries(row).filter(([k]) => !EXCLUDE.test(k)).map(([key, value]) => [key, {type:shape(value), empty:value === ''}]));
  const references = Object.fromEntries(ID_FIELDS.filter(k => Object.hasOwn(row,k)||Object.hasOwn(row,k+'_RecordId')).map(k => [k, {
    ids:referenceIds(row,k,kind), type:shape(row[k]), recordIdPresent:Object.hasOwn(row,k+'_RecordId')
  }]));
  const times = Object.fromEntries(TIME_FIELDS.filter(k => Object.hasOwn(row,k)).map(k => [k, typeof row[k] === 'string' ? row[k].slice(0,50) : null]));
  const result = {id:numericId(row.Id), fields, references, times};
  if (entity === 'BusinessUnit') result.company = Object.fromEntries(['Name','CompanyName','IdentificationNumber','ICO'].filter(k=>typeof row[k]==='string').map(k=>[k,row[k].slice(0,160)]));
  return result;
}
// Metadata object IDs were previously documented for this installation. Validate the
// entity name and every parent reference; an ignored metadata filter is not evidence.
async function jobFieldMetadata(env,session,entity) {
  const objectId={ServiceList:137,ServiceListItem:138}[entity];
  if(!objectId)return null;
  try {
    const {row:object}=await getVistosById(env,session,'DbObject',String(objectId),['Id','Name','EntityName','TableName','Caption']);
    if(numericId(object?.Id)!==String(objectId)||!['Name','EntityName','TableName'].some(k=>String(object[k]||'').split('.').at(-1)===entity))return {status:'object_identity_unverified'};
    const columns=['Id','Name','Caption','ColumnName','DbColumnName','DbObject_FK','Type_FK','DataType','LocalizationString','ReferenceDbObject_FK'];
    const page=await getVistosPage(env,session,'DbColumn',columns,{DbObject_FK:objectId},0,500,{order:'Id asc'});
    if(!page.rows.every(r=>referenceIds(r,'DbObject_FK','list').includes(String(objectId))))return {status:'metadata_filter_unverified'};
    const scalar=v=>typeof v==='string'?v.slice(0,250):typeof v==='number'?v:null;
    return {status:'read',objectId:String(objectId),complete:page.countEvidence.filteredReported&&page.filtered===page.rows.length,
      fields:page.rows.filter(r=>!EXCLUDE.test(String(r.ColumnName||r.DbColumnName||r.Name||''))).map(r=>({
        field:scalar(r.ColumnName||r.DbColumnName||r.Name),caption:scalar(r.LocalizationString||r.Caption),
        datatype:scalar(r.DataType||r.Type_FK),reference:scalar(r.ReferenceDbObject_FK),referenceIds:referenceIds(r,'ReferenceDbObject_FK','list')
      }))};
  }catch(error){return {status:'unavailable',errorCode:/^[a-z0-9_]+$/.test(error.code||'')?error.code:'metadata_unavailable'};}
}
function ascending(rows) { return rows.every((r,i) => numericId(r.Id) && (i===0 || BigInt(r.Id)>BigInt(rows[i-1].Id))); }
export function jobAuditFilter({entity,modifiedFrom=null,modifiedTo=null,parentId=null}) {
  if(!modifiedFrom&&!modifiedTo&&!parentId)return null;
  const invalid=()=>{throw Object.assign(new Error('invalid_job_audit_filter'),{code:'invalid_job_audit_filter',status:400});};
  if(!['ServiceList','ServiceListItem'].includes(entity))invalid();
  if(parentId) {
    if(entity!=='ServiceListItem'||!numericId(parentId)||modifiedFrom||modifiedTo)invalid();
    return {ServiceList_FK:[Number(parentId)]};
  }
  // Preserve source wall-clock syntax. This probe does not assert a time zone.
  const valid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'Z'))&&new Date(value+'Z').toISOString().slice(0,19)===value;
  if(!valid(modifiedFrom)||!valid(modifiedTo)||modifiedFrom>=modifiedTo||Date.parse(modifiedTo+'Z')-Date.parse(modifiedFrom+'Z')>92*86400000)invalid();
  return {Modified_From:modifiedFrom,Modified_To:modifiedTo};
}
export async function auditVistosRead(env,{entity='ServiceList',id=null,start=0,modifiedFrom=null,modifiedTo=null,parentId=null}={}) {
  if (!AUDIT_ENTITIES.includes(entity)||!Number.isSafeInteger(start)||start<0||start>10000000||(id!==null&&!numericId(id))) throw Object.assign(new Error('invalid_read_audit'),{code:'invalid_read_audit',status:400});
  const filter=jobAuditFilter({entity,modifiedFrom,modifiedTo,parentId});
  const readEnv={...env,VISTOS_EXACT_DECIMALS:true};
  const session=await loginVistosExecute(readEnv),schema=await getVistosSchemaEntity(readEnv,session,entity);
  const fields=vistosSchemaColumnNames(schema).filter(k=>!EXCLUDE.test(k));
  const base=new URL(env.VISTOS_API_BASE_URL);
  const result={testedAt:new Date().toISOString(),entity,apiOrigin:base.origin,installationPath:base.pathname,
    readOnly:true,writesVistos:false,writesD1:Number(env.VISTOS_SHARED_REQUESTS_PER_MINUTE)>0,writesBusinessData:false,completeImport:false,fields};
  if (!fields.includes('Id')) return {...result,status:'schema_without_id'};
  // Bounded business read: 3 pages of 5 and one detail, plus at most two metadata reads.
  const order=[{ColumnName:'Id',Direction:'asc'}];
  const first=await getVistosPage(readEnv,session,entity,fields,filter,start,5,{order});
  const second=await getVistosPage(readEnv,session,entity,fields,filter,start+5,5,{order});
  const repeat=await getVistosPage(readEnv,session,entity,fields,filter,start,5,{order});
  if(filter) {
    const rows=[...first.rows,...second.rows,...repeat.rows];
    const matches=row=>parentId?referenceIds(row,'ServiceList_FK','list').includes(String(parentId)):
      typeof row.Modified==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(row.Modified)&&row.Modified>=modifiedFrom&&row.Modified<modifiedTo;
    result.filterEvidence={requested:filter,rowsChecked:rows.length,allObservedRowsMatch:rows.every(matches),nonEmpty:first.rows.length>0,
      excludedRowsReported:first.countEvidence.totalReported&&first.countEvidence.filteredReported&&first.filtered<first.total,completeProof:false};
  }
  result.count={total:first.total,filtered:first.filtered,evidence:first.countEvidence};
  result.order={requested:order,ascending:ascending([...first.rows,...second.rows]),repeatStable:JSON.stringify(first.rows.map(r=>r.Id))===JSON.stringify(repeat.rows.map(r=>r.Id)),
    countStable:first.filtered===second.filtered&&first.filtered===repeat.filtered,ids:[...first.rows,...second.rows].map(r=>numericId(r.Id))};
  result.list=first.rows.map(r=>readAuditRecord(r,'list',entity));
  result.storageSample={rows:first.rows.length,sourceBytes:first.rows.map(r=>new TextEncoder().encode(JSON.stringify(r)).length),
    fieldEnvelopeBytes:first.rows.map(r=>new TextEncoder().encode(JSON.stringify(mergeSourceFields({},r,{entity,observedAt:result.testedAt}))).length),
    compactFieldBytes:first.rows.map(r=>new TextEncoder().encode(encodeSourceFields(mergeSourceFields({},r,{entity,observedAt:result.testedAt}),entity)).length)};
  const detailId=id||numericId(first.rows[0]?.Id);
  if(detailId) {
    try {
      const {row,diagnostics}=await getVistosById(readEnv,session,entity,detailId,fields);
      if(!row||numericId(row.Id)!==detailId)throw Object.assign(new Error('vistos_record_identity_mismatch'),{code:'vistos_record_identity_mismatch'});
      result.detail={...readAuditRecord(row,'detail',entity),requestedId:detailId};
      const merged=mergeSourceFields(mergeSourceFields({},first.rows.find(r=>numericId(r.Id)===detailId)||{},{entity,observedAt:result.testedAt}),row,{entity,kind:'detail',observedAt:result.testedAt});
      result.detail.storage={sourceBytes:new TextEncoder().encode(JSON.stringify(row)).length,mergedCompactFieldBytes:new TextEncoder().encode(encodeSourceFields(merged,entity)).length};
    } catch(error) {result.detail={requestedId:detailId,errorCode:/^[a-z0-9_]+$/.test(error.code||'')?error.code:'detail_unavailable',upstreamStatus:error.upstreamStatus||null};}
  }
  result.metadata=await jobFieldMetadata(readEnv,session,entity);
  result.status='read_complete';
  return result;
}
