import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../services/forpsi-connector/test/fixtures.mjs';
import { executeAdmin } from '../services/forpsi-connector/src/admin.mjs';
import { createWorker } from '../services/forpsi-connector/src/worker.mjs';
import { Onboarding } from '../services/forpsi-connector/src/onboarding.mjs';
import { SOAI_ISSUER } from '../services/forpsi-connector/src/admin-access.mjs';
import { createSessionCookie } from '../functions/_lib/auth.js';
import { onRequestPost } from '../functions/api/forpsi/setup.js';

test('SO.ai session actor alone approves its own exact setup version through Pages and Worker',async()=>{
  const f=fixture(),user={id:'setup-reader',name:'TEST setup',email:'reader@example.test',role:'readonly',
    active:true,status:'active'},secret='synthetic-setup-service-token-longer-than32';
  Object.assign(f.env,{SOAI_MAIL_ENABLED:'true',FORPSI_TENANT_ID:'tenant-a',CONNECTOR_ADMIN_TOKEN:secret,
    SOAI_PUBLIC_URL:'https://so.test'});
  await executeAdmin('access_save',{id:'mail-a',revision:1,userId:user.id,actions:['read']},
    {...f,tenant:'tenant-a',actorId:'admin'});
  const identity=await f.store.identity(SOAI_ISSUER,user.id);
  const provider={async listFolders(){return {folders:[{path:'INBOX',selectable:true}]};},
    async search(){return {messages:[],nextBeforeUid:null};}};
  const setup=new Onboarding({store:f.store,principal:{id:identity.id,scopes:['forpsi:read']},
    providerFactory:()=>provider,env:f.env});
  const began=await setup.begin({mailboxId:'mail-a',consent:true,folders:['INBOX']});
  let state=await setup.analyze({sessionId:began.sessionId});
  while(state.nextQuestion){const q=state.nextQuestion;state=await setup.answer({sessionId:began.sessionId,
    questionId:q.id,answer:q.options.at(-1)});}
  const worker=createWorker({providerFactory:()=>provider});
  const env={AUTH_MODE:'mock',AUTH_USERS_JSON:JSON.stringify([user]),FORPSI_ADMIN_TOKEN:secret,
    FORPSI_CONNECTOR:{fetch:r=>worker.fetch(r,f.env)}};
  const cookie=(await createSessionCookie(env,user)).split(';')[0];
  const call=(body,headers={})=>onRequestPost({env,request:new Request('https://so.test/api/forpsi/setup',{
    method:'POST',headers:{cookie,origin:'https://so.test','content-type':'application/json',...headers},
    body:JSON.stringify(body)})});
  assert.equal((await call({operation:'status',sessionId:began.sessionId})).status,200);
  assert.equal((await call({operation:'approve',sessionId:began.sessionId,proposalVersion:state.proposal.version},
    {origin:'https://evil.test'})).status,403);
  assert.equal((await call({operation:'approve',sessionId:began.sessionId,proposalVersion:state.proposal.version,
    actorId:'alice'})).status,400);
  assert.equal((await call({operation:'approve',sessionId:began.sessionId,proposalVersion:state.proposal.version+1})).status,409);
  assert.equal((await setup.preferences({mailboxId:'mail-a'})).status,'not_configured');
  const approved=await call({operation:'approve',sessionId:began.sessionId,proposalVersion:state.proposal.version});
  assert.equal(approved.status,200);assert.equal((await approved.json()).data.approved,true);
  assert.equal((await setup.preferences({mailboxId:'mail-a'})).status,'approved');
});
