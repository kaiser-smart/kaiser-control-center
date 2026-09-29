import test from 'node:test';
import assert from 'node:assert/strict';
import {openAiBrainAnalyzer} from '../src/brain-analyzer.mjs';
import {createAnalysisAudit,safeAnalysisAudit,analysisErrorCode} from '../src/brain-analysis-audit.mjs';

const env={FORPSI_ANALYSIS_MODEL:'gpt-5-mini',FORPSI_ANALYSIS_API_KEY:'private-test-key'};
const input={message:{text:'Prosím o odpověď.',subject:'Private subject',from:[],to:[]},
  direction:'inbound',mailboxAddress:'test@example.net'};
const modelResponse=proposal=>Response.json({status:'completed',
  output:[{content:[{type:'output_text',text:JSON.stringify(proposal)}]}]});

for(const [name,configuration,reason] of [
  ['model absent',{},'MODEL_NOT_CONFIGURED'],
  ['transport absent',{FORPSI_ANALYSIS_MODEL:'gpt-5-mini'},'ANALYSIS_TRANSPORT_NOT_CONFIGURED'],
  ['invalid proxy credentials',{FORPSI_ANALYSIS_MODEL:'gpt-5-mini',
    FORPSI_ANALYSIS_PROXY_URL:'https://smart-odpady.ai/api/forpsi/analysis',
    CONNECTOR_ADMIN_TOKEN:'short'},'ANALYSIS_TRANSPORT_NOT_CONFIGURED']
])test(`analyzer records ineligible configuration: ${name}`,async()=>{
  const audit=createAnalysisAudit(configuration);let calls=0;
  await assert.rejects(openAiBrainAnalyzer(input,configuration,{audit,fetcher:()=>{calls++;}}),
    new RegExp(reason));
  assert.equal(calls,0);assert.equal(audit.analyzerEligible,false);
  assert.equal(audit.eligibilityReason,reason);assert.equal(audit.modelRequestAttempted,false);
});

test('analyzer records a confirmed model response and parsed proposal without content',async()=>{
  const audit=createAnalysisAudit(env);
  const proposal={state:'todo',quote:'Prosím o odpověď.',reason:'private response'};
  const result=await openAiBrainAnalyzer(input,env,{audit,fetcher:async()=>modelResponse(proposal)});
  assert.deepEqual(result,proposal);
  assert.equal(audit.analyzerEligible,true);assert.equal(audit.modelRequestAttempted,true);
  assert.equal(audit.modelRequestSent,true);assert.equal(audit.modelResponseReceived,true);
  assert.equal(audit.responseParsed,true);assert.equal(audit.proposalReturned,true);
  assert.equal(audit.httpStatus,200);
  assert.ok(!JSON.stringify(safeAnalysisAudit({...audit,...proposal,token:env.FORPSI_ANALYSIS_API_KEY}))
    .includes('private'));
});

for(const [name,response,error,parsed] of [
  ['HTTP error',()=>Response.json({error:'private failure'},{status:429}),'MODEL_ANALYSIS_HTTP_429',false],
  ['incomplete',()=>Response.json({status:'incomplete',output:[]}),'MODEL_ANALYSIS_INCOMPLETE',false],
  ['empty',()=>Response.json({status:'completed',output:[]}),'MODEL_ANALYSIS_EMPTY_OUTPUT',false],
  ['malformed envelope',()=>new Response('{invalid'),'MODEL_ANALYSIS_INVALID_JSON',false],
  ['malformed proposal',()=>Response.json({output:[{content:[{type:'output_text',text:'private not JSON'}]}]}),
    'MODEL_ANALYSIS_INVALID_JSON',false],
])test(`analyzer safely records ${name}`,async()=>{
  const audit=createAnalysisAudit(env);
  await assert.rejects(openAiBrainAnalyzer(input,env,{audit,fetcher:async()=>response()}),new RegExp(error));
  assert.equal(audit.modelRequestSent,true);assert.equal(audit.modelResponseReceived,true);
  assert.equal(audit.responseParsed,parsed);assert.equal(audit.proposalReturned,false);
});

test('network failure does not falsely claim the request reached the model',async()=>{
  const audit=createAnalysisAudit(env);
  await assert.rejects(openAiBrainAnalyzer(input,env,{audit,fetcher:async()=>{
    throw new Error('private transport error');}}));
  assert.equal(audit.modelRequestAttempted,true);assert.equal(audit.modelRequestSent,null);
  assert.equal(audit.modelResponseReceived,false);
  assert.equal(analysisErrorCode(new Error('PRIVATE_SECRET')),'MODEL_TRANSPORT_ERROR');
});

test('proxy rejection is distinct from an upstream model response',async()=>{
  const proxyEnv={FORPSI_ANALYSIS_MODEL:'gpt-5-mini',
    FORPSI_ANALYSIS_PROXY_URL:'https://smart-odpady.ai/api/forpsi/analysis',
    CONNECTOR_ADMIN_TOKEN:'test-admin-token'.repeat(3)};
  for(const [status,body,sent,received] of [[401,{error:'ACCESS_DENIED'},false,false],
    [503,{error:'ANALYSIS_UNAVAILABLE'},null,false],
    [503,{error:'ANALYSIS_UNAVAILABLE',upstreamStatus:429},true,true]]){
    const audit=createAnalysisAudit(proxyEnv);
    await assert.rejects(openAiBrainAnalyzer(input,proxyEnv,{audit,
      fetcher:async()=>Response.json(body,{status})}));
    assert.equal(audit.proxyConfigured,true);assert.equal(audit.apiKeyConfigured,false);
    assert.equal(audit.modelRequestSent,sent);assert.equal(audit.modelResponseReceived,received);
  }
});

test('model request specifies literal authored-text evidence without changing response schema',async()=>{
  let payload;
  await openAiBrainAnalyzer(input,env,{fetcher:async(_url,init)=>{
    payload=JSON.parse(init.body);return modelResponse({state:'todo',quote:'Prosím o odpověď.'});}});
  const prompt=payload.input[0].content;
  assert.match(prompt,/copy one meaningful contiguous substring/);
  assert.match(prompt,/Never translate, paraphrase/);
  assert.match(prompt,/return an empty quote/);
  assert.deepEqual(payload.text.format.schema.properties.state.enum,['todo','decision','waiting','information']);
  assert.deepEqual(payload.text.format.schema.properties.quote,{type:'string'});
  assert.equal(payload.store,false);
});
