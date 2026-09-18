import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { __test, stepVistosLeadHubCsvImport } from "../functions/_lib/vistos-leadhub-profile-sync.js";
import { VistosContinuationController } from "../workers/vistos-leadhub-profile-sync-runner.js";
import { onRequestPost } from "../functions/api/receivables/vistos/leadhub-sync-internal.js";

const prefix = "protected-sync/vistos-leadhub-profiles", key = `${prefix}/state.json`;
class MemoryR2 {
  constructor(seed) { this.values = new Map(Object.entries(seed).map(([k,v]) => [k, JSON.stringify(v)])); }
  async get(k) { const value = this.values.get(k); return value === undefined ? null : { json: async () => JSON.parse(value) }; }
  async put(k,v,options = {}) {
    if (options.onlyIf?.get("If-None-Match") === "*" && this.values.has(k)) return null;
    this.values.set(k,String(v)); return { key:k };
  }
  async delete(k) { this.values.delete(k); }
  read(k = key) { return JSON.parse(this.values.get(k)); }
}
const fields = ["Id", "Modified", "Email1", "FirstName", "LastName", "DoNotWorkCompany", "Parent_FK"];
const row = { Id:"42", Modified:"2026-09-16T00:00:00Z", Email1:"synthetic@example.test", FirstName:"pan", LastName:"Novák", DoNotWorkCompany:false, Parent_FK:10 };
const item = { contactId:"42", normalizedEmail:row.Email1, firstName:row.FirstName, lastName:row.LastName,
  rowHash:__test.fingerprint(row), sourceModified:row.Modified, desired:"active", historical:true };
const seed = { [key]: { baselineRunId:"synthetic", snapshotKey:"snapshot", checkpoint:"2026-09-16T00:01:00Z", historicalImport:{created:0},
  totals:{created:0}, profiles:{}, pending:[item], manifestIdentityChecks:{42:{ action:"CREATE", email:row.Email1 }} },
  snapshot:{ rows:[row], schemaMetadata:fields.map(field => ({field})) } };
const opts = {batchId:"synthetic-csv-01", batchSize:5};
const env = storage => ({ R2_ARCHIVE:storage, LEADHUB_API_TOKEN:"synthetic", VISTOS_API_BASE_URL:"https://vistos.example.test",
  VISTOS_API_USERNAME:"synthetic", VISTOS_API_PASSWORD:"synthetic" });
for (const name of ["pan"," PANE ","paní","paní.","slečna","Mr."]) assert.equal(__test.csvFirstName(name), "");
for (const name of ["Radim","Pankrác","Panayotis","Jan Novák"]) assert.equal(__test.csvFirstName(name),name);
for (const status of ["RESERVED","CHECKED"]) {
  const batch = {items:[{...item,status}]};
  assert.equal(__test.csvReservationMatches(batch,{...item,normalizedEmail:"new@example.test"}),true);
  assert.equal(__test.csvReservationMatches(batch,{...item,contactId:"43"}),true);
  assert.equal(__test.csvReservationMatches(batch,{...item,contactId:"43",normalizedEmail:"other@example.test"}),false);
}
for (const status of ["ADOPTED","SKIP"]) assert.equal(__test.csvReservationMatches({items:[{...item,status}]},item),false);
const response = await onRequestPost({ request:new Request("https://example.test/internal",{method:"POST",body:JSON.stringify({mode:"csv-step",...opts})}), env:{} });
assert.equal(response.status,401,"CSV does not introduce a public endpoint");

const originalFetch = globalThis.fetch, originalTimeout = globalThis.setTimeout;
let exportProfiles = [{ credentials:{ email_address:"unrelated@example.test",user_id:null },tags:[] }];
let providerProfile = null, suppressed = false, states = [], campaigns = [], current = row;
let multipleRows = null, multipleProfiles = null;
let writes = 0, exportCalls = 0;
// Tests remove only wall-clock waits; production uses the existing limiter.
globalThis.setTimeout = (fn,ms,...args) => originalTimeout(fn,0,...args);
globalThis.fetch = async (url,options = {}) => {
  if (url.includes("vistos.example.test")) {
    const body = JSON.parse(options.body);
    if (body.LoginParam) return Response.json({status:"OK",data:{}},{headers:{"set-cookie":"VistosAccessToken=synthetic; Path=/"}});
    assert.ok(body.GetByIdParam,"CSV only reads a single current Contact");
    return Response.json({status:"OK",data:multipleRows?.get(String(body.GetByIdParam.EntityId)) || current});
  }
  if (url.endsWith("/segments/query/profiles")) {
    assert.deepEqual(JSON.parse(options.body),{segments:[{targetingBlocks:[]}]});
    exportCalls++; return Response.json({job_id:"synthetic-job"},{status:202});
  }
  assert.equal(options.method || "GET","GET","CSV coordinator must not write profiles, tags, subscriptions or send messages");
  if (url.endsWith("/segments")) return Response.json([{id:"b17444f7663241a0adb31b9a47dcf1a0"}]);
  if (url.endsWith("/jobs/synthetic-job")) return Response.json({job_id:"synthetic-job",state:"done",errors:null});
  if (url.endsWith("/result")) return new Response(gzipSync(exportProfiles.map(p=>JSON.stringify(p)).join("\n")));
  if (url.includes("/campaigns?")) return Response.json(campaigns);
  if (url.includes("/subscriptions/")) return Response.json(url.endsWith("/suppressed") ? {is_suppressed:suppressed} : {subscriptions:states});
  if (url.includes("/profiles/email-address/")) {
    const profile=multipleProfiles ? multipleProfiles.get(decodeURIComponent(url.split('/').at(-1))) : providerProfile;
    return profile ? Response.json(profile) : new Response(null,{status:404});
  }
  writes++; throw new Error("Unexpected endpoint");
};
try {
  const storage = new MemoryR2(seed), config = env(storage);
  const step = extra => stepVistosLeadHubCsvImport(config,{...opts,...extra});
  for (const expected of ["WORKSPACE","EXPORT","EXPORT_WAIT","PREFLIGHT","PREFLIGHT","READY"]) {
    assert.equal((await step()).status,expected);
    assert.equal(storage.read().checkpoint,seed[key].checkpoint);
  }
  assert.equal(exportCalls,1);
  assert.equal(storage.read().csvBatch.items[0].firstName,"");
  const prepared = storage.read(storage.read().csvBatch.preparedKey);
  assert.deepEqual(prepared.format,["user_id","email","firstname","lastname"]);
  assert.deepEqual(prepared.rows,[["vistos-contact-42",row.Email1,"","Novák"]]);
  assert.equal(prepared.tags,false); assert.equal(prepared.subscribe,false);
  assert.equal((await step()).status,"READY","restart cannot import or arm itself");
  assert.equal((await step({submittedBatchId:opts.batchId,receipt:"premature"})).status,"READY","UI receipt cannot bypass arming");
  assert.equal((await step({armBatchId:opts.batchId})).status,"ARMED");
  await assert.rejects(()=>step({submittedBatchId:opts.batchId}),e=>e.code==="csv_receipt_missing");
  assert.equal((await step({submittedBatchId:opts.batchId,receipt:"Synthetic UI job completed: 1 row, 0 skipped"})).status,"VERIFY");
  assert.equal((await step()).counts.CHECKED,1,"missing result is never successful and never triggers a retry write");
  assert.equal(storage.read().totals.created,0);
  providerProfile = {credentials:{user_id:"vistos-contact-42",email_address:row.Email1,first_name:null,last_name:"Novák"},tags:[]};
  const beforeAdoption = structuredClone(storage.read());
  for (const scenario of ["foreign-id","subscription-change","suppression-change","missing-name"]) {
    const isolated = new MemoryR2({...seed,[key]:beforeAdoption});
    const saved = structuredClone(providerProfile);
    if (scenario==="foreign-id") providerProfile.credentials.user_id="foreign";
    if (scenario==="missing-name") providerProfile.credentials.last_name="";
    states=scenario==="subscription-change"?[{code:"news",state:"subscribed"}]:[];
    suppressed=scenario==="suppression-change";
    await assert.rejects(()=>stepVistosLeadHubCsvImport(env(isolated),opts));
    assert.equal(isolated.read().csvBatch.phase,"BLOCKED");
    assert.ok(isolated.read().safetyIncident);
    assert.equal(isolated.read().totals.created,0);
    providerProfile=saved;
  }
  states=[]; suppressed=false;
  await step(); assert.equal((await step()).status,"ADOPTED");
  await step();
  const adopted=storage.read();
  assert.equal(adopted.totals.created,1,"repeated readback cannot double count");
  assert.equal(adopted.profiles[42].active,false,"CSV profile alone is not completed targeting");
  assert.equal(adopted.profiles[42].profileOnly,true);
  assert.equal(adopted.pending[0].profileAlreadyCreated,true);
  assert.equal(adopted.pending[0].businessFlags,undefined,"CSV does not invent document flags");
  assert.equal(adopted.checkpoint,seed[key].checkpoint);
  assert.equal(adopted.profiles[42].subscriptions.length,0);
  assert.equal(writes,0);
  const manySeed=structuredClone(seed);
  const manyRows=Array.from({length:5},(_,i)=>({...row,Id:String(100+i),Email1:`synthetic-${i}@example.test`}));
  multipleRows=new Map(manyRows.map(r=>[r.Id,r])); multipleProfiles=new Map();
  manySeed.snapshot.rows=manyRows;
  manySeed[key].pending=manyRows.map(r=>({...item,contactId:r.Id,normalizedEmail:r.Email1,rowHash:__test.fingerprint(r)}));
  manySeed[key].manifestIdentityChecks=Object.fromEntries(manyRows.map(r=>[r.Id,{action:'CREATE',email:r.Email1}]));
  const many=new MemoryR2(manySeed), nextMany=extra=>stepVistosLeadHubCsvImport(env(many),{...opts,...extra});
  exportProfiles=[];
  for(let i=0;i<5;i++) await nextMany();
  assert.equal(many.read().csvBatch.items.filter(i=>i.status==='CHECKED').length,5,'one short step checks five rows with one source login');
  await nextMany(); await nextMany({armBatchId:opts.batchId}); await nextMany({submittedBatchId:opts.batchId,receipt:'synthetic five-row UI import'});
  for(const r of manyRows.slice(1))multipleProfiles.set(r.Email1,{credentials:{user_id:`vistos-contact-${r.Id}`,email_address:r.Email1,first_name:null,last_name:r.LastName},tags:[]});
  await nextMany();
  assert.equal(many.read().csvBatch.items.filter(i=>i.status==='ADOPTED').length,4,'missing first result does not block confirmed independent results');
  assert.equal(many.read().csvBatch.items[0].status,'CHECKED');
  assert.equal(many.read().totals.created,4);
  await nextMany();assert.equal(many.read().totals.created,4,'absent result is never retried as a write or double-counted');
  assert.equal(writes,0);
  multipleProfiles=new Map();
  const bounded=new MemoryR2(manySeed), nextBounded=()=>stepVistosLeadHubCsvImport(env(bounded),opts);
  for(let i=0;i<4;i++) await nextBounded();
  const fixtureFetch=globalThis.fetch, realNow=Date.now; let elapsed=0;
  Date.now=()=>realNow()+elapsed;
  globalThis.fetch=async(url,options)=>{ const result=await fixtureFetch(url,options);
    if(url.includes('/profiles/email-address/'))elapsed+=21000; return result; };
  try { await nextBounded(); }
  finally { Date.now=realNow;globalThis.fetch=fixtureFetch; }
  assert.equal(bounded.read().csvBatch.items.filter(i=>i.status==='CHECKED').length,1,'slow reads yield with remaining reservations intact');
  assert.equal(bounded.read().csvBatch.items.filter(i=>i.status==='RESERVED').length,4);

  // The explicit whole-remainder scope reserves EVERY safe pending identity,
  // not another canary. Each READ block remains bounded and resumable.
  const fullSeed=structuredClone(seed);
  const fullRows=Array.from({length:47},(_,i)=>({...row,Id:String(1000+i),Email1:`whole-${i}@example.test`}));
  multipleRows=new Map(fullRows.map(r=>[r.Id,r])); multipleProfiles=new Map();
  fullSeed.snapshot.rows=fullRows;
  fullSeed[key].checkpoint=new Date().toISOString();
  fullSeed[key].pending=fullRows.map(r=>({...item,contactId:r.Id,normalizedEmail:r.Email1,rowHash:__test.fingerprint(r)}));
  fullSeed[key].manifestIdentityChecks=Object.fromEntries(fullRows.map(r=>[r.Id,{action:'CREATE',email:r.Email1}]));
  const full=new MemoryR2(fullSeed), fullOptions={...opts,scope:'remaining',batchSize:1};
  const nextFull=extra=>stepVistosLeadHubCsvImport(env(full),{...fullOptions,...extra});
  exportProfiles=[];
  const exportCountBeforeFull=exportCalls;
  for(let i=0;i<4;i++) await nextFull();
  assert.equal(full.read().csvBatch.items.length,47,'whole remainder must not truncate to batchSize or twenty');
  await nextFull();
  assert.equal(full.read().csvBatch.items.filter(i=>i.status==='CHECKED').length,28,'one block stays below the documented 30/min endpoint ceiling');
  await nextFull();
  assert.equal(full.read().csvBatch.items.filter(i=>i.status==='CHECKED').length,47);
  await nextFull();
  assert.equal(full.read().csvBatch.phase,'EXPORT','all preflight observations require a NEW full identity export');
  assert.equal(full.read().csvBatch.preparedKey,undefined,'no upload file before final identity revalidation');
  const sourceChanged=full.read();
  sourceChanged.pending.find(p=>p.contactId===fullRows[2].Id).desired='inactive';
  await full.put(key,JSON.stringify(sourceChanged));
  exportProfiles=[{credentials:{email_address:fullRows[0].Email1,user_id:'foreign-owner'},tags:[]},
    {credentials:{email_address:'different@example.test',user_id:`vistos-contact-${fullRows[1].Id}`},tags:[]}];
  await nextFull(); await nextFull();
  assert.equal(exportCalls-exportCountBeforeFull,2);
  assert.equal(full.read().csvBatch.phase,'READY');
  const fullPrepared=full.read(full.read().csvBatch.preparedKey);
  assert.equal(fullPrepared.rows.length,44);
  assert.ok(fullPrepared.finalIdentityRequestedAt);
  assert.ok(fullPrepared.safetyReadStartedAt);
  assert.ok(fullPrepared.safetyReadFinishedAt);
  assert.equal(full.read().csvBatch.items.filter(i=>i.status==='SKIP').length,3);
  assert.equal(full.read().checkpoint,fullSeed[key].checkpoint,'full CSV never rewinds delta');
  const readyFull=structuredClone(full.read());
  for(const scenario of ['stale-delta','expired-final-export','missing-final-export']) {
    const testState=structuredClone(readyFull);
    if(scenario==='stale-delta') testState.checkpoint='2020-01-01T00:00:00Z';
    if(scenario==='expired-final-export') testState.csvBatch.validUntil='2020-01-01T00:00:00Z';
    if(scenario==='missing-final-export') delete testState.csvBatch.finalIdentityJobId;
    const isolated=new MemoryR2({...fullSeed,[key]:testState});
    await assert.rejects(()=>stepVistosLeadHubCsvImport(env(isolated),{...fullOptions,armBatchId:opts.batchId}));
    assert.equal(isolated.read().csvBatch.phase,'READY');
  }
  await nextFull({armBatchId:opts.batchId});
  await nextFull({submittedBatchId:opts.batchId,receipt:'SYNTHETIC_WHOLE_IMPORT_44'});
  for(const r of fullRows.slice(23)) multipleProfiles.set(r.Email1,{credentials:{user_id:`vistos-contact-${r.Id}`,email_address:r.Email1,first_name:null,last_name:r.LastName},tags:[]});
  await nextFull(); await nextFull(); await nextFull();
  assert.equal(Object.keys(full.read().profiles).length,24,'twenty missing leading results do not starve the rest of the file');
  assert.equal(full.read().csvBatch.phase,'VERIFY','missing results are not successes');
  for(const r of fullRows.slice(3,23)) multipleProfiles.set(r.Email1,{credentials:{user_id:`vistos-contact-${r.Id}`,email_address:r.Email1,first_name:null,last_name:r.LastName},tags:[]});
  await nextFull(); await nextFull(); await nextFull(); await nextFull();
  assert.equal(full.read().csvBatch.phase,'ADOPTED');
  assert.equal(Object.keys(full.read().profiles).length,44,'all identities adopted separately under same ledger');
  assert.equal(full.read().totals.created,44);
  await nextFull(); assert.equal(full.read().totals.created,44,'restart cannot count the whole file twice');
  assert.equal(writes,0);
  multipleRows=null;multipleProfiles=null;

  providerProfile=null;
  for (const scenario of ["isolate", "no-request", "wrong-batch", "recent", "known-receipt"]) {
    const uncertain=structuredClone(beforeAdoption);
    uncertain.csvBatch.receipt="UI_SUBMIT_OUTCOME_UNKNOWN_SYNTHETIC";
    uncertain.csvBatch.submittedObservedAt="2026-01-01T00:00:00Z";
    if(scenario==="recent") uncertain.csvBatch.submittedObservedAt=new Date().toISOString();
    if(scenario==="known-receipt") uncertain.csvBatch.receipt="CONFIRMED_IMPORT_RECEIPT";
    const isolated=new MemoryR2({...seed,[key]:uncertain});
    const options={...opts,quarantineBatchId:scenario==="no-request"?undefined:scenario==="wrong-batch"?"different-batch":opts.batchId};
    await stepVistosLeadHubCsvImport(env(isolated),options);
    const result=await stepVistosLeadHubCsvImport(env(isolated),options);
    if(scenario==="isolate") {
      assert.equal(result.status,"QUARANTINED");
      assert.equal(isolated.read().quarantinedIdentities[42].reason,"CSV_SUBMISSION_UNVERIFIED");
      assert.equal(isolated.read().pending.length,0);
      assert.equal(isolated.read().totals.created,0,"quarantine is not successful import");
      assert.equal(isolated.read().checkpoint,uncertain.checkpoint);
      assert.equal((await stepVistosLeadHubCsvImport(env(isolated),{batchId:"independent-batch"})).status,"EMPTY");
      assert.ok(isolated.read(`${prefix}/csv/${opts.batchId}/receipt.json`),"uncertain receipt is preserved");
    } else {
      assert.equal(result.status,"VERIFY");
      assert.equal(isolated.read().csvBatch.items[0].status,"CHECKED");
    }
  }

  // Export collision, current-source mismatch, expired preflight and source
  // changes during the human/UI handoff all fail closed before CSV submission.
  providerProfile=null;
  for (const scenario of ["email-collision","id-collision","source-change","expired","pending-change"]) {
    const s=new MemoryR2(seed); const next=extra=>stepVistosLeadHubCsvImport(env(s),{...opts,...extra});
    exportProfiles = scenario==="email-collision" ? [{credentials:{email_address:row.Email1,user_id:null},tags:[]}]
      : scenario==="id-collision" ? [{credentials:{email_address:"other@example.test",user_id:"vistos-contact-42"},tags:[]}]:[];
    current=scenario==="source-change"?{...row,DoNotWorkCompany:true}:row;
    for(let i=0;i<6;i++) await next();
    if (["email-collision","id-collision","source-change"].includes(scenario)) {
      assert.equal(s.read().csvBatch.phase,"EMPTY"); assert.equal(s.read().csvBatch.items[0].status,"SKIP");
    } else {
      const value=s.read();
      if(scenario==="expired") value.csvBatch.validUntil="2020-01-01T00:00:00Z";
      else value.pending[0].desired="inactive";
      await s.put(key,JSON.stringify(value));
      await assert.rejects(()=>next({armBatchId:opts.batchId}),e=>e.code==="csv_preflight_expired_or_changed");
      assert.equal(s.read().csvBatch.phase,"READY");
    }
  }
  assert.equal(writes,0);
} finally { globalThis.fetch=originalFetch; globalThis.setTimeout=originalTimeout; }

// The same durable alarm alternates ordinary writer work with CSV/business.
const data=new Map(); const storage={ get:async k=>data.get(k),put:async(k,v)=>data.set(k,structuredClone(v)),setAlarm:async()=>{} };
const config={VISTOS_LEADHUB_SYNC_TOKEN:"synthetic",CSV_BATCH_ID:opts.batchId,BUSINESS_READ_ENABLED:"true"};
const modes=[]; let csvPhase="PREFLIGHT";
globalThis.fetch=async (_,options)=>{const body=JSON.parse(options.body); modes.push(body.mode);
  if(body.mode==="csv-step") assert.equal(body.batchId,opts.batchId);
  return Response.json({pending:10,status:body.mode==="csv-step"?csvPhase:"ACTIVE"});};
try {
  for(let i=0;i<6;i++) await new VistosContinuationController(storage,config).alarm();
  assert.deepEqual(modes.slice(0,5),["csv-step","execute-import","business-read","execute-import","csv-step"]);
  csvPhase="READY";
  for(let i=0;i<4;i++) await new VistosContinuationController(storage,config).alarm();
  const readyCalls=modes.filter(m=>m==="csv-step").length;
  for(let i=0;i<4;i++) await new VistosContinuationController(storage,config).alarm();
  assert.equal(modes.filter(m=>m==="csv-step").length,readyCalls,"ready CSV does not burn quota while waiting for UI");
  data.clear(); modes.length=0; csvPhase='PREFLIGHT'; config.CSV_SCOPE='remaining';
  for(let i=0;i<12;i++) await new VistosContinuationController(storage,config).alarm();
  assert.deepEqual(modes.slice(0,7),['execute-import','business-read','csv-step','csv-step','csv-step','csv-step','execute-import']);
  assert.equal(modes.filter(m=>m==='csv-step').length,8,'whole remainder consumes READ slots without extra canary runs');
  assert.equal(modes.filter(m=>m==='execute-import').length,3,'ordinary writer is not starved');
} finally { globalThis.fetch=originalFetch; }
console.log("CSV coordinator: reservation, complete export, collisions, source freshness, UI arming, per-row readback, safety stop, restart and fairness passed");
