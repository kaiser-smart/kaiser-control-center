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
let writes = 0, exportCalls = 0;
// Tests remove only wall-clock waits; production uses the existing limiter.
globalThis.setTimeout = (fn,ms,...args) => originalTimeout(fn,0,...args);
globalThis.fetch = async (url,options = {}) => {
  if (url.includes("vistos.example.test")) {
    const body = JSON.parse(options.body);
    if (body.LoginParam) return Response.json({status:"OK",data:{}},{headers:{"set-cookie":"VistosAccessToken=synthetic; Path=/"}});
    assert.ok(body.GetByIdParam,"CSV only reads a single current Contact");
    return Response.json({status:"OK",data:current});
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
  if (url.includes("/profiles/email-address/")) return providerProfile ? Response.json(providerProfile) : new Response(null,{status:404});
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
} finally { globalThis.fetch=originalFetch; }
console.log("CSV coordinator: reservation, complete export, collisions, source freshness, UI arming, per-row readback, safety stop, restart and fairness passed");
