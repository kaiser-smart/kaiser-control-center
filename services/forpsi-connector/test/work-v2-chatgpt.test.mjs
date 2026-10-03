import test from 'node:test';
import assert from 'node:assert/strict';
import { workFixture } from './work-v2-fixtures.mjs';
import { workHash } from '../src/work-v2-contract.mjs';
import { WorkStoreV2 } from '../src/work-v2-store.mjs';
import { MailBrain } from '../src/mail-brain.mjs';
import { createWorker } from '../src/worker.mjs';

async function setup(){const f=await workFixture();f.env.MAIL_BRAIN_V2_ANALYSIS_MODE='chatgpt';
  f.env.MAIL_BRAIN_V2_DAILY_CALL_LIMIT='0';let calls=0;
  f.work.analyzer=async()=>{calls++;throw Error('UNEXPECTED_MODEL_API_CALL');};
  return {...f,modelCalls:()=>calls};}
const args=async f=>({caseId:f.first.caseId,analysisToken:(await f.work.prepareAnalysis({caseId:f.first.caseId})).analysisToken,
  analysis:await f.proposal()});
const count=async(f,table)=>(await f.store.first(`SELECT COUNT(*) n FROM ${table}`)).n;

test('ChatGPT receives real stored context and persists unapproved proposals, with no API call or daily API allowance',async()=>{
  const f=await setup(),queue=await f.work.analysisQueue();
  assert.equal(queue.totalPending,1);assert.equal(queue.cases[0].caseId,f.first.caseId);
  const prepared=await f.work.prepareAnalysis({caseId:f.first.caseId});
  assert.equal(prepared.analysisSource,'chatgpt');assert.equal(prepared.input.messages[0].authoredText,'Pošlu podklady.');
  assert.ok(prepared.input.messages[0].segments[0].id);assert.match(prepared.instructions,/untrusted data/);
  const command={caseId:f.first.caseId,analysisToken:prepared.analysisToken,analysis:await f.proposal()};
  const first=await f.work.submitAnalysis(command);
  assert.deepEqual(await f.work.submitAnalysis(command),first);
  assert.equal(await count(f,'brain_work_events_v2'),1);assert.equal(await count(f,'brain_work_commands_v2'),1);
  assert.equal(await count(f,'brain_fact_decisions_v2'),0);
  assert.equal((await f.work.getCase({caseId:f.first.caseId})).proposals.length,1);
  assert.equal((await f.work.analysisQueue()).totalPending,0);
  assert.equal((await f.work.attention()).counts.activeObligations.items,0);
  assert.equal((await f.store.first('SELECT run_kind FROM brain_projection_runs_v2')).run_kind,'chatgpt');
  assert.equal(f.modelCalls(),0);
});

test('more than twenty independent ChatGPT submissions do not spend or hit the API budget',async()=>{
  const f=await setup();
  for(let n=0;n<21;n++)await f.work.submitAnalysis(await args(f));
  assert.equal(await count(f,'brain_work_events_v2'),1);
  assert.equal((await f.store.first("SELECT COUNT(*) n FROM brain_projection_runs_v2 WHERE run_kind='chatgpt'")).n,21);
  assert.equal((await f.store.first("SELECT COUNT(*) n FROM brain_projection_runs_v2 WHERE run_kind='extraction'")).n,0);
  assert.equal(f.modelCalls(),0);
});

test('native mode blocks direct and sync-triggered API analysis, even with a nonzero API budget',async()=>{
  const f=await setup();f.env.MAIL_BRAIN_V2_DAILY_CALL_LIMIT='500';
  await assert.rejects(f.work.refresh({caseId:f.first.caseId}),/WORK_CHATGPT_ANALYSIS_REQUIRED/);
  assert.equal((await f.work.refreshNext({id:'mail-a',tenant_id:'tenant-a'})).attempted,0);
  delete f.env.MAIL_BRAIN_V2_ANALYSIS_MODE;
  await assert.rejects(f.work.refresh({caseId:f.first.caseId}),/WORK_CHATGPT_ANALYSIS_REQUIRED/);
  assert.equal(f.modelCalls(),0);assert.equal(await count(f,'brain_projection_runs_v2'),0);
});

test('prepared analysis is signed, scoped to its principal and case, and expires',async()=>{
  const f=await setup(),command=await args(f);
  const parts=command.analysisToken.split('.'),payload=JSON.parse(Buffer.from(parts[0],'base64url'));
  payload.expiresAt+=99999999;
  await assert.rejects(f.work.submitAnalysis({...command,analysisToken:Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+parts[1]}),/WORK_ANALYSIS_CONTEXT_INVALID/);
  await assert.rejects(f.work.submitAnalysis({...command,caseId:crypto.randomUUID()}),/WORK_ANALYSIS_CONTEXT_INVALID/);
  const other=new WorkStoreV2(new MailBrain({...f,principal:{id:'bob',scopes:['forpsi:read']}}));
  await assert.rejects(other.submitAnalysis(command),/WORK_ANALYSIS_CONTEXT_INVALID/);
  f.setTime(f.now()+900001);
  await assert.rejects(f.work.submitAnalysis(command),/WORK_ANALYSIS_CONTEXT_EXPIRED/);
  assert.equal(await count(f,'brain_work_events_v2'),0);
});

test('source content, new messages, entity changes and a concurrent interpretation invalidate prepared proposals',async()=>{
  for(const change of ['source','arrival','entity','revision']){
    const f=await setup(),command=await args(f);
    if(change==='source')await f.store.run('UPDATE brain_messages SET content_hash=? WHERE id=?',workHash('changed'),f.first.messageId);
    if(change==='arrival')await f.add('Zadání se změnilo.',2,'<v2-1@example.test>');
    if(change==='entity')await f.store.run("UPDATE brain_entities_v2 SET address='changed@example.com' WHERE id='alice'");
    if(change==='revision')await f.work.refresh({caseId:f.first.caseId},{events:[],signals:[]});
    await assert.rejects(f.work.submitAnalysis(command),/WORK_SOURCE_CHANGED|WORK_ANALYSIS_CONTEXT_CHANGED/);
    assert.equal(await count(f,'brain_work_commands_v2'),0);
  }
});

test('revoked access and consent prevent both new preparation and submission; a foreign source is never returned',async()=>{
  for(const change of ['grant','consent','foreign_source']){
    const f=await setup(),command=await args(f);
    if(change==='grant')await f.store.run("UPDATE grants SET revoked=1 WHERE principal_id='alice' AND action='read'");
    if(change==='consent')await f.store.run('UPDATE brain_consents SET revoked_at=?',f.now());
    if(change==='foreign_source')await f.store.run("UPDATE brain_messages SET mailbox_id='mail-b' WHERE id=?",f.first.messageId);
    await assert.rejects(f.work.prepareAnalysis({caseId:f.first.caseId}));
    await assert.rejects(f.work.submitAnalysis(command));
    assert.equal(await count(f,'brain_work_events_v2'),0);
  }
});

test('a consent change at the publication boundary rolls back every proposal and receipt',async()=>{
  const f=await setup(),command=await args(f),batch=f.db.batch;
  f.db.batch=async statements=>{await f.store.run('UPDATE brain_consents SET consented_at=consented_at+1');return batch(statements);};
  await assert.rejects(f.work.submitAnalysis(command),/WORK_VERSION_CONFLICT/);
  assert.equal(await count(f,'brain_work_commands_v2'),0);assert.equal(await count(f,'brain_work_events_v2'),0);
  assert.equal(await count(f,'brain_projection_revisions_v2'),0);
});

test('an altered retry cannot replace the saved result and fabricated quotes never become accepted work',async()=>{
  const f=await setup(),command=await args(f);command.analysis.events[0].evidence.action[0].quote='Fabricated quote';
  await f.work.submitAnalysis(command);
  await assert.rejects(f.accept(),/WORK_EVIDENCE_REQUIRED/);
  await assert.rejects(f.work.submitAnalysis({...command,analysis:{events:[],signals:[]}}),/WORK_REQUEST_CONFLICT/);
  assert.equal(await count(f,'brain_fact_decisions_v2'),0);assert.equal(f.modelCalls(),0);
});

test('real MCP transport advertises and executes the complete ChatGPT proposal flow with read-only OAuth scopes',async()=>{
  const f=await setup();f.principal.scopes=['forpsi:read'];f.env.ONBOARDING_FROZEN='true';
  f.env.MCP_NATIVE_MUTATIONS_ENABLED='false';
  const worker=createWorker({authenticate:async()=>f.principal,providerFactory:f.providerFactory});
  const rpc=async(method,params={})=>(await (await worker.fetch(new Request('https://mail.example/mcp',{
    method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),f.env)).json()).result;
  const call=async(name,arguments_)=>rpc('tools/call',{name,arguments:arguments_});
  const list=await rpc('tools/list');
  for(const name of ['list_work_analysis','prepare_work_analysis','submit_work_analysis']){
    assert.ok(list.tools.some(t=>t.name===name));assert.deepEqual(list.tools.find(t=>t.name===name).securitySchemes[0].scopes,['forpsi:read']);}
  assert.ok(!list.tools.some(t=>t.name==='submit_setup_analysis'));
  const prepared=(await call('prepare_work_analysis',{caseId:f.first.caseId})).structuredContent.data;
  const command={caseId:f.first.caseId,analysisToken:prepared.analysisToken,analysis:await f.proposal()};
  const submitted=await call('submit_work_analysis',command);assert.equal(submitted.isError,undefined);
  assert.equal(submitted.structuredContent.data.analysisSource,'chatgpt');
  const detail=(await call('case_get',{caseId:f.first.caseId})).structuredContent.data;
  assert.equal(detail.work.proposals.length,1);assert.equal(detail.work.projection.workItems.length,0);
  const view=(await call('render_attention',{version:'2.2'})).structuredContent.data;
  assert.equal(view.analysisSource,'chatgpt');assert.equal(view.counts.attentionSignals.signals,1);
  const forged=await call('submit_work_analysis',{...command,approved:true});assert.equal(forged.isError,true);
  assert.equal(await count(f,'brain_fact_decisions_v2'),0);
  f.env.MAIL_BRAIN_V2_ENABLED='false';
  assert.ok(!(await rpc('tools/list')).tools.some(t=>t.name==='submit_work_analysis'));
});
