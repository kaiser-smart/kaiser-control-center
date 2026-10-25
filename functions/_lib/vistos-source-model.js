import { VISTOS_FIELD_REGISTRY } from './vistos-field-registry.js';
import { numericId, referenceIds, sourceTime, fingerprint, stableJson } from './vistos-values.js';

export const FIELD_LABELS = Object.freeze({known:'',null:'Nevyplněno ve Vistosu',empty:'Nevyplněno ve Vistosu',not_exposed:'Vistos neposkytuje',forbidden:'Nedostupné pro tento přístup',unverified:'Význam čeká na ověření',error:'Načtení se nezdařilo'});
const secret = /password|passwd|secret|token|cookie|authorization|credential/i;
export function registryFor(entity) {
  const result = {};
  for (const entry of VISTOS_FIELD_REGISTRY.filter(f => f.source_entity === entity)) {
    for (const field of entry.candidate_source_fields) {
      result[field] = {label:entry.label_cs, disclosure:entry.disclosure_class, section:entry.ui_section};
      if (field.endsWith('_FK')) {
        result[`${field}_RecordId`] = result[field];
        result[`${field}_Caption`] = result[field];
      }
    }
  }
  return result;
}
// Storage v1 interns repeated provenance, availability and disclosure metadata once per
// record. Values (including null/empty/zero) and the absence of a value are lossless.
// Only presentation labels/sections from the registry are regenerated; disclosure
// remains persisted so a registry edit cannot accidentally expose protected data.
export function encodeSourceFields(fields, entity) {
  const registry=registryFor(entity), metadata=[], indexes=new Map(), entries={};
  for (const [key,field] of Object.entries(fields)) {
    const {value,...meta}=field;
    if(meta.label===(registry[key]?.label||key))delete meta.label;
    if(meta.section===(registry[key]?.section||'all'))delete meta.section;
    const signature=stableJson(meta);
    if(!indexes.has(signature)){indexes.set(signature,metadata.length);metadata.push(meta);}
    entries[key]=Object.hasOwn(field,'value')?[indexes.get(signature),value]:[indexes.get(signature)];
  }
  return JSON.stringify({$vistosFields:1,entity,metadata,entries});
}
export function decodeSourceFields(json) {
  const stored=typeof json==='string'?JSON.parse(json):json;
  if(!Object.hasOwn(stored,'$vistosFields'))return stored; // Existing records stay readable.
  if(stored.$vistosFields!==1||!Array.isArray(stored.metadata)||!stored.entries||typeof stored.entity!=='string')throw new Error('vistos_field_storage_invalid');
  const registry=registryFor(stored.entity);
  return Object.fromEntries(Object.entries(stored.entries).map(([key,entry])=>{
    if(!Array.isArray(entry)||entry.length<1||entry.length>2||!stored.metadata[entry[0]])throw new Error('vistos_field_storage_invalid');
    return [key,{label:registry[key]?.label||key,section:registry[key]?.section||'all',...stored.metadata[entry[0]],...(entry.length===2?{value:entry[1]}:{})}];
  }));
}
function safeEvidence(value, depth=0) {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.map(v=>safeEvidence(v,depth+1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k])=>!secret.test(k)).map(([k,v])=>[k,safeEvidence(v,depth+1)]));
  return value;
}
export function mergeSourceFields(previous={}, row={}, {entity,kind='list',observedAt,verifiedFields=[],error=null}={}) {
  const registry=registryFor(entity), fields={...previous};
  for (const key of new Set([...Object.keys(registry),...Object.keys(previous),...Object.keys(row)])) {
    if (secret.test(key)) continue;
    const old=previous[key];
    const present=Object.hasOwn(row,key);
    const availability=error || (!present?'not_exposed':row[key]===null?'null':row[key]===''?'empty':verifiedFields.includes(key)?'known':'unverified');
    // Missing fields, transport errors and list nulls cannot destroy detail evidence.
    const retain=!present || Boolean(error) || (kind==='list' && old?.source==='detail' && (row[key]===null || row[key]===''));
    fields[key]={...(old||{}),label:registry[key]?.label||key,disclosure:registry[key]?.disclosure||'unclassified',
      section:registry[key]?.section||'all', availability, lastObservedAt:observedAt,
      ...(retain?{stale:Boolean(old)}:{value:safeEvidence(row[key]),source:kind,valueObservedAt:observedAt,stale:false})};
  }
  return fields;
}
// Expanded foreign objects have independent classifications. Expose only their stable ID;
// an operational parent must never smuggle nested personal/financial attributes.
function publicValue(value) {
  if (Array.isArray(value)) return value.map(publicValue);
  if (value && typeof value === 'object') return numericId(value.Id ?? value.id) ? {Id:numericId(value.Id ?? value.id)} : null;
  return value;
}
export function discloseFields(fields, rights) {
  return Object.fromEntries(Object.entries(fields).filter(([,v])=>v.disclosure==='operational'
    || (v.disclosure==='financial' && rights.finance)
    || (v.disclosure==='personal' && rights.personal)).map(([k,v])=>[k,{...v,...(Object.hasOwn(v,'value')?{value:publicValue(v.value)}:{})}]));
}
export function fieldValues(fields) { return Object.fromEntries(Object.entries(fields).filter(([,v])=>Object.hasOwn(v,'value')).map(([k,v])=>[k,v.value])); }
export async function normalizeSourceRecord(row, {installation,entity,contract={},previous=null,kind='list',parentCompanyId=null,now=new Date().toISOString()}={}) {
  const id=numericId(row.Id);
  if (!id) throw Object.assign(new Error('source_identity_missing'),{code:'source_identity_missing'});
  const rules=contract.entities?.[entity]||{};
  const previousFields=previous?decodeSourceFields(previous.fields_json):{};
  const fields=mergeSourceFields(previousFields,row,{entity,kind,observedAt:now,verifiedFields:rules.verifiedFields||[]});
  const values=fieldValues(fields);
  const refs=field=>referenceIds(values,field,fields[field]?.source||kind);
  const company=entity==='ServiceListItem'&&rules.inheritCompanyFromParent===true?parentCompanyId:rules.companyField?refs(rules.companyField)[0]:rules.fixedCompanyId;
  const companyId=company && contract.companyIds?.includes(String(company))?String(company):null;
  const modified=sourceTime(row.Modified).instant;
  if (previous?.source_modified && modified && modified<previous.source_modified) return null;
  // Unknown source order cannot overwrite a differing existing version.
  if (previous && !modified && previous.source_modified) return null;
  const verified=field=>rules.verifiedFields?.includes(field);
  const text=field=>field && registryFor(entity)[field]?.disclosure==='operational' && verified(field) && values[field]!=null && typeof values[field]!=='object'?String(values[field]):null;
  const date=rules.plannedField && verified(rules.plannedField)?sourceTime(values[rules.plannedField]):null;
  const end=rules.plannedEndField && verified(rules.plannedEndField)?sourceTime(values[rules.plannedEndField]):null;
  const rawStatus=rules.statusField?values[rules.statusField]:null;
  const status=rules.statusMap?.[String(rawStatus)]||'unverified';
  // Live metadata distinguishes dbo.Vehicle from crm.Enumeration. Never combine
  // their numeric IDs: equal numbers do not identify the same vehicle.
  const vehicles=[...new Set((rules.vehicleFields||['Vozidlo_FK']).flatMap(refs))];
  const driver=refs('RidicContact_FK')[0]||null;
  const parent=rules.parentField?refs(rules.parentField)[0]||null:null;
  const semanticContent=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,{value:v.value,availability:v.availability,source:v.source,disclosure:v.disclosure}]));
  return {id:previous?.id||crypto.randomUUID(),installation,entity,source_id:id,company_id:companyId,
    number:text(rules.numberField),customer:text(rules.customerField),place:text(rules.placeField),service:text(rules.serviceField),
    planned_start:date?.instant||null,planned_end:end?.instant||null,planned_day:date?.kind==='date'?date.raw:null,status,
    driver_id:driver,vehicle_ids_json:JSON.stringify(vehicles),parent_id:parent,
    // Source references are not verified canonical/HR assignments.
    unassigned:1,needs_review:!companyId || status==='unverified' || !date || !driver || !vehicles.length ? 1:0,
    fields_json:encodeSourceFields(fields,entity),fingerprint:await fingerprint({semanticContent,companyId,mapping:contract.revision}),
    source_modified:modified,received_at:now,detail_at:kind==='detail'?now:previous?.detail_at||null,mapping_version:contract.revision||'unverified',
    changedFields:Object.keys(fields).filter(k=>stableJson(previousFields[k]?.value)!==stableJson(fields[k]?.value))};
}
