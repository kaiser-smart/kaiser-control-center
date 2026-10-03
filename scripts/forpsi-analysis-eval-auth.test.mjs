import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleAnalysisProxy} from '../functions/api/forpsi/analysis.js';
import {openAiBrainAnalyzer} from '../services/forpsi-connector/src/brain-analyzer.mjs';
import {createWorker} from '../services/forpsi-connector/src/worker.mjs';

const url='https://smart-odpady.ai/api/forpsi/analysis';
const admin='SYNTHETIC-ADMIN-SECRET-ONLY-FOR-LOCAL-TESTS';
const token='e'.repeat(64); // Synthetic fixture, never a deployed secret.
const sha256=value=>createHash('sha256').update(value).digest('hex');
const modelReply={output:[{content:[{type:'output_text',text:'{}'}]}]};
async function fixture(){
  const bodies=[];
  for(let i=0;i<7;i++)await openAiBrainAnalyzer({direction:'inbound',mailboxAddress:'us@example.test',
    message:{from:[{address:'them@example.test'}],to:[{address:'us@example.test'}],
      subject:`Synthetic ${i}`,text:'Prosím o odpověď.'}},
    {FORPSI_ANALYSIS_PROXY_URL:url,CONNECTOR_ADMIN_TOKEN:token,FORPSI_ANALYSIS_MODEL:'gpt-5-mini'},
    {fetcher:async(_url,init)=>{bodies.push(init.body);return Response.json(modelReply);}});
  const policy={token,expiresAt:Date.now()+3600000,requestSha256:bodies.map(sha256)};
  const env={FORPSI_ADMIN_TOKEN:admin,OPENAI_API_KEY:'SYNTHETIC-OPENAI-KEY',
    FORPSI_ANALYSIS_EVAL_TOKEN:JSON.stringify(policy)};
  const request=(body=bodies[0],bearer=token,target=url)=>new Request(target,{method:'POST',
    headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json'},body});
  return {bodies,policy,env,request};
}

test('eval accepts only the seven exact requests; all forwarding uses the existing model endpoint',async()=>{
  const f=await fixture();let calls=0;
  const fetcher=async(target,init)=>{
    calls++;assert.equal(target,'https://api.openai.com/v1/responses');
    assert.equal(init.headers.authorization,'Bearer SYNTHETIC-OPENAI-KEY');
    assert.equal(init.redirect,'manual');
    const body=JSON.parse(init.body);
    assert.equal(body.model,'gpt-5-mini');assert.equal(body.store,false);
    assert.equal(body.reasoning.effort,'minimal');assert.equal(body.text.format.strict,true);
    return Response.json(modelReply);
  };
  for(const body of f.bodies)
    assert.equal((await handleAnalysisProxy({request:f.request(body),env:f.env,fetcher})).status,200);
  for(const mutate of [body=>{body.store=true;},body=>{body.model='other';},
    body=>{body.reasoning.effort='high';},body=>{body.text.format.schema={};},
    body=>{body.input[0].content+=' changed';},body=>{body.input[1].content+=' ';},
    body=>{body.extra='not approved';}]){
    const body=JSON.parse(f.bodies[0]);mutate(body);
    assert.equal((await handleAnalysisProxy({request:f.request(JSON.stringify(body)),env:f.env,fetcher})).status,400);
  }
  assert.equal(calls,7);
});

test('missing, expired, malformed or revoked eval policy and other URLs fail before upstream',async()=>{
  const f=await fixture();let calls=0;
  const fetcher=async()=>{calls++;throw Error('unexpected upstream');};
  for(const policy of [undefined,'invalid','null','[]','{}',
    JSON.stringify({...f.policy,expiresAt:0}),
    JSON.stringify({...f.policy,expiresAt:String(Date.now()+3600000)}),
    JSON.stringify({...f.policy,token:undefined}),
    JSON.stringify({...f.policy,expiresAt:undefined}),
    JSON.stringify({...f.policy,requestSha256:undefined}),
    JSON.stringify({...f.policy,extra:'not allowed'}),
    JSON.stringify({...f.policy,requestSha256:[]}),
    JSON.stringify({...f.policy,requestSha256:Array(7).fill(f.policy.requestSha256[0])})]){
    const env={...f.env,FORPSI_ANALYSIS_EVAL_TOKEN:policy};
    assert.equal((await handleAnalysisProxy({request:f.request(),env,fetcher})).status,401);
  }
  assert.equal((await handleAnalysisProxy({request:f.request(undefined,'f'.repeat(64)),env:f.env,fetcher})).status,401);
  for(const target of [`${url}?x=1`,`${url}/`,url.replace('smart-odpady.ai','other.test')])
    assert.equal((await handleAnalysisProxy({request:f.request(undefined,token,target),env:f.env,fetcher})).status,401);
  for(const method of ['GET','PUT','PATCH','DELETE','OPTIONS'])
    assert.equal((await handleAnalysisProxy({request:new Request(url,{method}),env:f.env,fetcher})).status,405);
  assert.equal((await handleAnalysisProxy({request:f.request('x'.repeat(12001)),env:f.env,fetcher})).status,400);
  assert.equal(calls,0);
});

test('admin authorization still works when the evaluation policy is absent or broken',async()=>{
  const f=await fixture();let calls=0;
  for(const policy of [undefined,'invalid',JSON.stringify({...f.policy,expiresAt:0})]){
    const response=await handleAnalysisProxy({request:f.request(undefined,admin),
      env:{...f.env,FORPSI_ANALYSIS_EVAL_TOKEN:policy},fetcher:async(_url,init)=>{
        calls++;assert.equal(init.redirect,'manual');return Response.json(modelReply);
      }});
    assert.equal(response.status,200);
  }
  assert.equal(calls,3);
});

test('eval token grants no Pages or Worker mail, brain, send, setup, admin or MCP access',async()=>{
  const f=await fixture();let forbiddenCalls=0;
  const deny=()=>{forbiddenCalls++;throw Error('forbidden capability');};
  const db=new Proxy({},{get:deny});
  const env={...f.env,AUTH_MODE:'production',DB:db,FORPSI_CONNECTOR:{fetch:deny}};
  for(const path of ['brain','mail','send','setup','admin','personal-settings','oauth/access']){
    const module=await import(`../functions/api/forpsi/${path}.js`);
    const handler=module.onRequestPost??module.onRequest;
    const request=new Request(`https://smart-odpady.ai/api/forpsi/${path}`,{method:'POST',
      headers:{authorization:`Bearer ${token}`,origin:'https://smart-odpady.ai',
        'content-type':'application/json'},body:'{"operation":"overview","payload":{}}'});
    assert.equal((await handler({request,env})).status,401,path);
  }
  const worker=createWorker({providerFactory:deny,calendarFactory:deny,contactFactory:deny});
  const workerEnv={CONNECTOR_ENABLED:'true',CONNECTOR_ADMIN_TOKEN:admin,DB:db,
    FORPSI_ANALYSIS_EVAL_TOKEN:f.env.FORPSI_ANALYSIS_EVAL_TOKEN,
    MCP_RESOURCE:'https://worker.test/mcp',OAUTH_ISSUER:'https://issuer.test',
    OAUTH_JWKS_URL:'https://issuer.test/jwks'};
  for(const path of ['/internal/brain','/internal/mail','/internal/send','/internal/setup',
    '/internal/admin','/internal/personal-settings','/mcp']){
    const request=new Request(`https://worker.test${path}`,{method:'POST',
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}'});
    assert.equal((await worker.fetch(request,workerEnv)).status,401,path);
  }
  assert.equal(forbiddenCalls,0,'No D1, provider, SMTP, outbox or service call is reached');
});

test('hash uses exact received bytes, including BOM and whitespace; client hashes are ignored',async()=>{
  const f=await fixture();let calls=0;
  const fetcher=async()=>{calls++;return Response.json(modelReply);};
  const bytes=Buffer.from(f.bodies[0],'utf8');
  const withBom=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),bytes]);
  assert.equal((await handleAnalysisProxy({request:f.request(withBom),env:f.env,fetcher})).status,400);
  const policy={...f.policy,requestSha256:[sha256(withBom),...f.policy.requestSha256.slice(1)]};
  const env={...f.env,FORPSI_ANALYSIS_EVAL_TOKEN:JSON.stringify(policy)};
  assert.equal((await handleAnalysisProxy({request:f.request(withBom),env,fetcher})).status,200);
  assert.equal((await handleAnalysisProxy({request:f.request(bytes),env,fetcher})).status,400);
  const altered=f.request(f.bodies[0]+' ');
  altered.headers.set('x-request-sha256',f.policy.requestSha256[0]);
  assert.equal((await handleAnalysisProxy({request:altered,env:f.env,fetcher})).status,400);
  assert.equal(calls,1);
});

test('eval allowlist does not bypass method, content type, request size or model settings',async()=>{
  const f=await fixture();let calls=0;
  const fetcher=async()=>{calls++;throw Error('unexpected upstream');};
  for(const mutate of [b=>{b.model='other';},b=>{b.store=true;},
    b=>{b.reasoning.effort='high';},b=>{b.max_output_tokens=2401;},
    b=>{b.text.format.strict=false;},b=>{b.text.format.name='other';},
    b=>{b.text.format.type='text';},b=>{b.input[0].role='user';}]){
    const body=JSON.parse(f.bodies[0]);mutate(body);const raw=JSON.stringify(body);
    const policy={...f.policy,requestSha256:[sha256(raw),...f.policy.requestSha256.slice(1)]};
    const env={...f.env,FORPSI_ANALYSIS_EVAL_TOKEN:JSON.stringify(policy)};
    assert.equal((await handleAnalysisProxy({request:f.request(raw),env,fetcher})).status,400);
  }
  for(const raw of [f.bodies[0]+' '.repeat(12001),Buffer.from('ž'.repeat(8001))]){
    const policy={...f.policy,requestSha256:[sha256(raw),...f.policy.requestSha256.slice(1)]};
    const env={...f.env,FORPSI_ANALYSIS_EVAL_TOKEN:JSON.stringify(policy)};
    assert.equal((await handleAnalysisProxy({request:f.request(raw),env,fetcher})).status,400);
  }
  const length=f.request();length.headers.set('content-length','16001');
  assert.equal((await handleAnalysisProxy({request:length,env:f.env,fetcher})).status,413);
  const type=f.request();type.headers.set('content-type','text/plain');
  assert.equal((await handleAnalysisProxy({request:type,env:f.env,fetcher})).status,415);
  assert.equal(calls,0);
});

test('eval checks server time and deactivation rejects before parsing or calling OpenAI',async()=>{
  const f=await fixture();let calls=0;
  const fetcher=async()=>{calls++;throw Error('unexpected upstream');};
  const env={...f.env,FORPSI_ANALYSIS_EVAL_TOKEN:JSON.stringify({...f.policy,expiresAt:Date.now()-1})};
  const request=f.request();request.headers.set('date','Tue, 01 Jan 2000 00:00:00 GMT');
  assert.equal((await handleAnalysisProxy({request,env,fetcher})).status,401);
  delete env.FORPSI_ANALYSIS_EVAL_TOKEN;
  assert.equal((await handleAnalysisProxy({request:f.request('{}'),env,fetcher})).status,401);
  assert.equal(calls,0);
});

test('eval rejects upstream redirects, unexpected hosts, invalid JSON and oversized responses without retry',async()=>{
  const f=await fixture();
  for(const kind of ['redirect','host','json','size']){
    let calls=0;
    const response=await handleAnalysisProxy({request:f.request(),env:f.env,fetcher:async(_url,init)=>{
      calls++;assert.equal(init.redirect,'manual');
      if(kind==='redirect')return new Response(null,{status:302,headers:{location:'https://other.test'}});
      if(kind==='json')return new Response('invalid');
      if(kind==='size')return Response.json({value:'x'.repeat(100001)});
      const result=Response.json(modelReply);Object.defineProperty(result,'url',{value:'https://other.test'});
      return result;
    }});
    assert.equal(response.status,503);assert.equal(calls,1);
  }
});
