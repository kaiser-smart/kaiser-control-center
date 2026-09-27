import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, mail } from '../services/forpsi-connector/test/fixtures.mjs';
import { SendApproval } from '../services/forpsi-connector/src/send-approval.mjs';
import { createWorker } from '../services/forpsi-connector/src/worker.mjs';
import { SOAI_ISSUER } from '../services/forpsi-connector/src/admin-access.mjs';
import { createSessionCookie } from '../functions/_lib/auth.js';
import { onRequestPost } from '../functions/api/forpsi/send.js';

test('SO.ai session approves only its own proposal, exact version and same origin',async()=>{
  const f=fixture(),user={id:'sender',name:'TEST sender',email:'sender@example.test',
    role:'readonly',active:true,status:'active'};
  const other={id:'coworker',name:'TEST coworker',email:'other@example.test',
    role:'readonly',active:true,status:'active'};
  const secret='synthetic-send-service-token-longer-than32';
  await f.store.run('INSERT INTO principals VALUES (?,?,?,?,1)','sender','tenant-a',SOAI_ISSUER,user.id);
  for(const action of ['read','send'])await f.store.run('INSERT INTO grants VALUES (?,?,?,0)',
    'sender','mail-a',action);
  Object.assign(f.env,{FORPSI_TENANT_ID:'tenant-a',CONNECTOR_ADMIN_TOKEN:secret,SEND_ENABLED:'true'});
  const principal={id:'sender',scopes:['forpsi:read','forpsi:send']};
  const flow=new SendApproval(f.store,f.env,f.outbox);
  const proposal=await flow.prepare(principal,{mailboxId:'mail-a',message:mail,
    requestId:crypto.randomUUID()},false);
  const worker=createWorker({providerFactory:f.providerFactory});
  const env={AUTH_MODE:'mock',AUTH_USERS_JSON:JSON.stringify([user,other]),FORPSI_ADMIN_TOKEN:secret,
    FORPSI_CONNECTOR:{fetch:req=>worker.fetch(req,f.env)}};
  const cookie=(await createSessionCookie(env,user)).split(';')[0];
  const otherCookie=(await createSessionCookie(env,other)).split(';')[0];
  const call=(body,headers={})=>onRequestPost({env,request:new Request('https://so.test/api/forpsi/send',{
    method:'POST',headers:{cookie,origin:'https://so.test','content-type':'application/json',...headers},
    body:JSON.stringify(body)})});
  const status={operation:'status',proposalId:proposal.proposalId};
  assert.equal((await call(status,{origin:'https://evil.test'})).status,403);
  assert.equal((await call({...status,actorId:'alice'})).status,400);
  assert.equal((await call(status,{cookie:''})).status,401);
  assert.equal((await call(status,{cookie:otherCookie})).status,403);
  const preview=await call(status);assert.equal(preview.status,200);
  assert.equal((await preview.json()).data.text,mail.text);
  assert.equal((await call({operation:'approve',proposalId:proposal.proposalId,version:2})).status,409);
  assert.equal(f.calls.length,0);
  const sent=await call({operation:'approve',proposalId:proposal.proposalId,version:1});
  assert.equal(sent.status,200);assert.equal((await sent.json()).data.job.state,'sent');
  assert.equal((await call({operation:'approve',proposalId:proposal.proposalId,version:1})).status,200);
  assert.equal(f.calls.filter(c=>c[0]==='send').length,1);
});
