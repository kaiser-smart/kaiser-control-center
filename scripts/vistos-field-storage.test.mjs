import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mergeSourceFields,encodeSourceFields,decodeSourceFields,normalizeSourceRecord,discloseFields,fieldValues} from '../functions/_lib/vistos-source-model.js';
import {publicSourceRecord} from '../functions/_lib/vistos-integration-store.js';

test('compact storage preserves all values, missing values and per-field provenance across list/detail reads',async()=>{
  let fields=mergeSourceFields({}, {Id:1,Number:'Z-1',Description:'<b>text</b>',PriceWithTax:'123456789012345.678901',CustomUnknown:{Id:27,nested:[null,'',0,false]},DateStart:'2026-10-25T02:30:00'}, {entity:'ServiceList',kind:'detail',observedAt:'2026-10-25T10:00:00Z',verifiedFields:['Number']});
  fields=mergeSourceFields(fields,{Id:1,Number:'Z-1',Description:null},{entity:'ServiceList',kind:'list',observedAt:'2026-10-25T11:00:00Z',verifiedFields:['Number']});
  fields.Extra={label:'Custom label',section:'custom',disclosure:'unclassified',availability:'error',stale:true};
  const compact=encodeSourceFields(fields,'ServiceList'),decoded=decodeSourceFields(compact);
  assert.deepEqual(decoded,fields);assert.deepEqual(decodeSourceFields(JSON.stringify(fields)),fields);
  assert.ok(compact.length<JSON.stringify(fields).length*0.45,`${compact.length} vs ${JSON.stringify(fields).length}`);
  assert.equal(decoded.Description.value,'<b>text</b>');assert.equal(decoded.Description.source,'detail');assert.equal(decoded.Description.stale,true);
  assert.equal(Object.hasOwn(decoded.Extra,'value'),false);
  assert.equal(decoded.CustomUnknown.disclosure,'unclassified');assert.equal(discloseFields(decoded,{finance:true,personal:true}).CustomUnknown,undefined);
  assert.equal(fieldValues(decoded).DateStart,'2026-10-25T02:30:00');
  const cleared=mergeSourceFields(decoded,{Id:1,Description:null},{entity:'ServiceList',kind:'detail',observedAt:'2026-10-25T12:00:00Z'});
  assert.equal(decodeSourceFields(encodeSourceFields(cleared,'ServiceList')).Description.value,null);
});

test('new and legacy stored records merge identically and produce the same public API',async()=>{
  const contract={revision:'test',companyIds:['1'],entities:{ServiceList:{fixedCompanyId:'1',verifiedFields:['Number'],numberField:'Number'}}};
  const options={installation:'test',entity:'ServiceList',contract,kind:'detail',now:'2026-10-25T10:00:00Z'};
  const first=await normalizeSourceRecord({Id:1,Number:'Z-1',Modified:'2026-10-25T09:00:00Z',Description:'evidence'},options);
  const legacy={...first,fields_json:JSON.stringify(decodeSourceFields(first.fields_json))};
  const next={Id:1,Number:'Z-1',Modified:'2026-10-25T10:30:00Z'};
  const a=await normalizeSourceRecord(next,{...options,kind:'list',now:'2026-10-25T11:00:00Z',previous:first});
  const b=await normalizeSourceRecord(next,{...options,kind:'list',now:'2026-10-25T11:00:00Z',previous:legacy});
  assert.deepEqual(a,b);assert.deepEqual(publicSourceRecord(first,{}),publicSourceRecord(legacy,{}));
  assert.throws(()=>decodeSourceFields({$vistosFields:2}),/storage_invalid/);
});

test('job bulk opt-in requires measured capacity in every domain and does not enable finance flows',async()=>{
 const {checkJobsImportCapacity}=await import('../functions/_lib/vistos-import-capacity.js');
 const binding=size=>({prepare:()=>({all:async()=>({meta:{size_after:size}})})});
 const env={D1_CAPACITY_BLOCK_BULK_WRITES:'true',DB_CORE:binding(2000000),DB_ARCHIVE:binding(2000000000),DB_AUDIT:binding(1000000)};
 const contract={capacityEvidence:{approvedAt:'2026-10-25',estimateEvidenceId:'measured-sample',domains:Object.fromEntries(['core','archive','audit'].map(d=>[d,{maxSizeBytes:8000000000}]))}};
 await assert.rejects(checkJobsImportCapacity({...env,RECEIVABLES_INVOICE_SYNC_ENABLED:'true'},contract,{entity:'ServiceList'}),e=>e.code==='d1_bulk_capacity_blocked');
 const approved={...env,VISTOS_JOBS_BULK_IMPORT_APPROVED:'true'};
 assert.equal((await checkJobsImportCapacity(approved,contract,{entity:'ServiceList'})).archive.sizeBytes,2000000000);
 await assert.rejects(checkJobsImportCapacity(approved,contract,{entity:'Payment'}),e=>e.code==='d1_bulk_capacity_blocked');
 await assert.rejects(checkJobsImportCapacity({...approved,DB_AUDIT:binding(null)},contract,{entity:'ServiceList'}),e=>e.code==='vistos_capacity_measurement_unavailable');
 await assert.rejects(checkJobsImportCapacity({...approved,DB_ARCHIVE:binding(7999500000)},contract,{entity:'ServiceList'}),e=>e.code==='vistos_target_capacity_exceeded');
 await assert.rejects(checkJobsImportCapacity(approved,{capacityEvidence:{approvedAt:'x'}},{entity:'ServiceList'}),e=>e.code==='vistos_capacity_plan_unverified');
});

test('capacity recovery resumes the 806-job incident within explicit hard ceilings',async()=>{
 const {checkJobsImportCapacity}=await import('../functions/_lib/vistos-import-capacity.js');
 const binding=size=>({prepare:()=>({all:async()=>({meta:{size_after:size}})})});
 const env={D1_CAPACITY_BLOCK_BULK_WRITES:'true',VISTOS_JOBS_BULK_IMPORT_APPROVED:'true',DB_CORE:binding(268607488),DB_ARCHIVE:binding(2407587840),DB_AUDIT:binding(1273753600)};
 const evidence={approvedAt:'2026-10-26',estimateEvidenceId:'pilot',domains:{core:{maxSizeBytes:300000000},archive:{maxSizeBytes:2400000000},audit:{maxSizeBytes:1270000000}}};
 const contract={capacityEvidence:evidence};
 await assert.rejects(checkJobsImportCapacity(env,contract,{entity:'ServiceList'}),e=>e.code==='vistos_target_capacity_exceeded');
 evidence.autoRecovery={approvedAt:'2026-10-27',evidenceId:'incident-806',maxSizeBytes:{core:500000000,archive:7000000000,audit:3000000000}};
 const recovered=await checkJobsImportCapacity(env,contract,{entity:'ServiceList'});
 assert.equal(recovered.archive.maxSizeBytes,2500000000);
 assert.equal(recovered.audit.maxSizeBytes,1300000000);
 assert.equal(evidence.domains.archive.maxSizeBytes,2400000000); // no implicit contract rewrite
 for(const [domain,key,limit] of [['core','DB_CORE',500000000],['archive','DB_ARCHIVE',7000000000],['audit','DB_AUDIT',3000000000]]){
  await assert.rejects(checkJobsImportCapacity({...env,[key]:binding(limit-500000)},contract,{entity:'ServiceListItem'}),e=>e.code==='vistos_target_capacity_exceeded',domain);
 }
 await assert.rejects(checkJobsImportCapacity(env,contract,{entity:'ServiceList',reserveBytes:NaN}),e=>e.code==='vistos_capacity_plan_unverified');
 await assert.rejects(checkJobsImportCapacity({...env,DB_ARCHIVE:binding(null)},contract,{entity:'ServiceList'}),e=>e.code==='vistos_capacity_measurement_unavailable');
 await assert.rejects(checkJobsImportCapacity({...env,VISTOS_JOBS_BULK_IMPORT_APPROVED:'false'},contract,{entity:'ServiceList'}),e=>e.code==='d1_bulk_capacity_blocked');
 await assert.rejects(checkJobsImportCapacity(env,contract,{entity:'Payment'}),e=>e.code==='d1_bulk_capacity_blocked');
 evidence.autoRecovery.maxSizeBytes.archive=8000000000;
 await assert.rejects(checkJobsImportCapacity(env,contract,{entity:'ServiceList'}),e=>e.code==='vistos_capacity_plan_unverified');
});
