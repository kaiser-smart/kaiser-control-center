import {getVistosById, getVistosPage, getVistosSchemaEntity, loginVistosExecute} from './vistos-execute-client.js';
import {vistosSchemaColumnNames} from './vistos-contacts-audit.js';
import {numericId, referenceIds} from './vistos-values.js';
import {mergeSourceFields} from './vistos-source-model.js';

// Installation diagnosis exposes identifiers and availability, never source financial or personal values.
// No permissions, contracts, checkpoints or source records are changed by this probe.
export const AUDIT_ENTITIES = ['ServiceList', 'ServiceListItem', 'InvoiceIssued', 'Payment', 'BusinessUnit'];
const EXCLUDE = /password|passwd|secret|token|cookie|authorization|credential/i;
const ID_FIELDS = ['AssignedToCompany_FK', 'Issuer_FK', 'BusinessUnit_FK', 'Evidovatnafirmu', 'CustomerCompany_FK',
  'CustomerBranch_FK', 'ServiceList_FK', 'MasterParent_FK', 'Contract_FK', 'ContractRow_FK', 'InvoiceIssued_FK',
  'Auto_FK', 'AllocatedVehicle', 'RidicContact_FK', 'Status_FK', 'Type_FK', 'Currency_FK', 'Product_FK', 'UOM_FK'];
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
function ascending(rows) { return rows.every((r,i) => numericId(r.Id) && (i===0 || BigInt(r.Id)>BigInt(rows[i-1].Id))); }
export async function auditVistosRead(env,{entity='ServiceList',id=null,start=0}={}) {
  if (!AUDIT_ENTITIES.includes(entity)||!Number.isSafeInteger(start)||start<0||start>10000000||(id!==null&&!numericId(id))) throw Object.assign(new Error('invalid_read_audit'),{code:'invalid_read_audit',status:400});
  const readEnv={...env,VISTOS_EXACT_DECIMALS:true};
  const session=await loginVistosExecute(readEnv),schema=await getVistosSchemaEntity(readEnv,session,entity);
  const fields=vistosSchemaColumnNames(schema).filter(k=>!EXCLUDE.test(k));
  const base=new URL(env.VISTOS_API_BASE_URL);
  const result={testedAt:new Date().toISOString(),entity,apiOrigin:base.origin,installationPath:base.pathname,
    readOnly:true,writesVistos:false,writesD1:Number(env.VISTOS_SHARED_REQUESTS_PER_MINUTE)>0,writesBusinessData:false,completeImport:false,fields};
  if (!fields.includes('Id')) return {...result,status:'schema_without_id'};
  // This is a bounded diagnostic: 3 pages of 5 and at most one explicit detail.
  const order=[{ColumnName:'Id',Direction:'asc'}];
  const first=await getVistosPage(readEnv,session,entity,fields,null,start,5,{order});
  const second=await getVistosPage(readEnv,session,entity,fields,null,start+5,5,{order});
  const repeat=await getVistosPage(readEnv,session,entity,fields,null,start,5,{order});
  result.count={total:first.total,filtered:first.filtered,evidence:first.countEvidence};
  result.order={requested:order,ascending:ascending([...first.rows,...second.rows]),repeatStable:JSON.stringify(first.rows.map(r=>r.Id))===JSON.stringify(repeat.rows.map(r=>r.Id)),
    countStable:first.filtered===second.filtered&&first.filtered===repeat.filtered,ids:[...first.rows,...second.rows].map(r=>numericId(r.Id))};
  result.list=first.rows.map(r=>readAuditRecord(r,'list',entity));
  result.storageSample={rows:first.rows.length,sourceBytes:first.rows.map(r=>new TextEncoder().encode(JSON.stringify(r)).length),
    fieldEnvelopeBytes:first.rows.map(r=>new TextEncoder().encode(JSON.stringify(mergeSourceFields({},r,{entity,observedAt:result.testedAt}))).length)};
  const detailId=id||numericId(first.rows[0]?.Id);
  if(detailId) {
    try {
      const {row,diagnostics}=await getVistosById(readEnv,session,entity,detailId,fields);
      if(!row||numericId(row.Id)!==detailId)throw Object.assign(new Error('vistos_record_identity_mismatch'),{code:'vistos_record_identity_mismatch'});
      result.detail={...readAuditRecord(row,'detail',entity),requestedId:detailId};
    } catch(error) {result.detail={requestedId:detailId,errorCode:/^[a-z0-9_]+$/.test(error.code||'')?error.code:'detail_unavailable',upstreamStatus:error.upstreamStatus||null};}
  }
  result.status='read_complete';
  return result;
}
