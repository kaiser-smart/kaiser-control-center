import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAnalysisProxy} from '../functions/api/forpsi/analysis.js';
import {openAiBrainAnalyzer} from '../services/forpsi-connector/src/brain-analyzer.mjs';

const secret='s'.repeat(40);
const env={FORPSI_ADMIN_TOKEN:secret,OPENAI_API_KEY:'private-server-key'};
const message={from:[{address:'a@example.net'}],to:[{address:'b@example.net'}],
  subject:'Poptávka',text:'Prosím o odpověď.'};
const proposed={state:'todo',category:'request',reason:'Odpověď je požadována.',
  quote:'Prosím o odpověď.',nextAction:'Odpovědět',amountMinor:null,currency:null,
  commitments:[]};
const modelReply={output:[{content:[{type:'output_text',text:JSON.stringify(proposed)}]}]};

test('analysis proxy accepts only the shared server secret and a bounded strict request',async()=>{
  let forwarded;
  const fetcher=async(url,init)=>{forwarded={url,init};return Response.json(modelReply);};
  const workerEnv={FORPSI_ANALYSIS_PROXY_URL:'https://smart-odpady.ai/api/forpsi/analysis',
    CONNECTOR_ADMIN_TOKEN:secret,FORPSI_ANALYSIS_MODEL:'gpt-5-mini'};
  const output=await openAiBrainAnalyzer({message,direction:'inbound',
    mailboxAddress:'b@example.net'},workerEnv,{fetcher:async(url,init)=>{
    assert.equal(url,workerEnv.FORPSI_ANALYSIS_PROXY_URL);
    assert.equal(init.headers.authorization,`Bearer ${secret}`);
    const request=new Request(url,init);
    return handleAnalysisProxy({request,env,fetcher});
  }});
  assert.deepEqual(output,proposed);
  assert.equal(forwarded.url,'https://api.openai.com/v1/responses');
  assert.equal(forwarded.init.headers.authorization,'Bearer private-server-key');
  assert.equal(JSON.parse(forwarded.init.body).store,false);
  assert.equal(JSON.parse(forwarded.init.body).reasoning.effort,'minimal');
  assert.equal(JSON.parse(forwarded.init.body).max_output_tokens,2400);
  for(const supplied of [null,'Bearer wrong']){
    const request=new Request('https://smart-odpady.ai/api/forpsi/analysis',{
      method:'POST',headers:{'content-type':'application/json',
        ...(supplied?{authorization:supplied}:{})},body:forwarded.init.body});
    const response=await handleAnalysisProxy({request,env,fetcher});
    assert.equal(response.status,401);
  }
  const request=new Request('https://smart-odpady.ai/api/forpsi/analysis',{
    method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},
    body:JSON.stringify({...JSON.parse(forwarded.init.body),store:true})});
  assert.equal((await handleAnalysisProxy({request,env,fetcher})).status,400);
});

test('analysis proxy hides upstream failures',async()=>{
  let body;
  const workerEnv={FORPSI_ANALYSIS_PROXY_URL:'https://smart-odpady.ai/api/forpsi/analysis',
    CONNECTOR_ADMIN_TOKEN:secret,FORPSI_ANALYSIS_MODEL:'gpt-5-mini'};
  await openAiBrainAnalyzer({message,direction:'inbound',mailboxAddress:'b@example.net'},
    workerEnv,{fetcher:async(_url,init)=>{body=init.body;return Response.json(modelReply);}});
  const request=new Request('https://smart-odpady.ai/api/forpsi/analysis',{
    method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body});
  const response=await handleAnalysisProxy({request,env,
    fetcher:async()=>new Response('private provider diagnostic',{status:429})});
  assert.equal(response.status,503);
  const diagnostic=await response.json();
  assert.equal(diagnostic.upstreamStatus,429);
  assert.equal(JSON.stringify(diagnostic).includes('private provider diagnostic'),false);
  await assert.rejects(openAiBrainAnalyzer({message,direction:'inbound',
    mailboxAddress:'b@example.net'},workerEnv,{fetcher:async(url,init)=>
    handleAnalysisProxy({request:new Request(url,init),env,
      fetcher:async()=>new Response('private provider diagnostic',{status:429})})}),
  /MODEL_ANALYSIS_HTTP_429/);
});
