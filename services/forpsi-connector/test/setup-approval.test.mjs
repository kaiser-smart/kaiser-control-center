import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { SOAI_ISSUER } from '../src/admin-access.mjs';
import { Onboarding } from '../src/onboarding.mjs';
import { createWorker } from '../src/worker.mjs';
import { executeTool } from '../src/mcp.mjs';

test('model confirmed=true cannot approve; authenticated SO.ai identity approves only its exact profile version',async()=>{
  const f=fixture(),secret='x'.repeat(40);
  await f.store.run('INSERT INTO principals VALUES (?,?,?,?,1)','soai-alice','tenant-a',SOAI_ISSUER,'user-alice');
  await f.store.run("INSERT INTO grants VALUES ('soai-alice','mail-a','read',0)");
  const principal={id:'soai-alice',scopes:['forpsi:read']};
  const provider={async listFolders(){return {folders:[{path:'INBOX',selectable:true}]};},
    async search(){return {messages:[],nextBeforeUid:null};}};
  const env={...f.env,CONNECTOR_ADMIN_TOKEN:secret,FORPSI_TENANT_ID:'tenant-a',SOAI_MAIL_ENABLED:'true',
    SOAI_PUBLIC_URL:'https://development.example'};
  const ctx={store:f.store,principal,providerFactory:()=>provider,env,now:f.now};
  const onboarding=new Onboarding(ctx);
  const start=await onboarding.begin({mailboxId:'mail-a',consent:true,folders:['INBOX']});
  let state=await onboarding.analyze({sessionId:start.sessionId});
  while(state.nextQuestion){const q=state.nextQuestion;
    state=await onboarding.answer({sessionId:start.sessionId,questionId:q.id,answer:q.options.at(-1)});}
  assert.equal(state.readyToApprove,true);
  assert.equal(state.approvalAvailable,true);
  assert.match(state.approvalUrl,/\/forpsi-setup\/\?session=/);
  const attempted=await executeTool('approve_mail_setup',{
    sessionId:start.sessionId,proposalVersion:state.proposal.version,confirmed:true},ctx)
    .then(()=>null,error=>error);
  assert.match(String(attempted),/APPROVAL_UI_REQUIRED/);
  assert.equal((await onboarding.preferences({mailboxId:'mail-a'})).status,'not_configured');
  const worker=createWorker({providerFactory:()=>provider});
  const request=(actorId,version,token=secret)=>new Request('https://forpsi.internal/internal/setup',{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({operation:'approve',actorId,sessionId:start.sessionId,proposalVersion:version})});
  assert.equal((await worker.fetch(request('user-alice',state.proposal.version,'bad'),env)).status,401);
  assert.equal((await worker.fetch(request('other-user',state.proposal.version),env)).status,403);
  assert.equal((await worker.fetch(request('user-alice',state.proposal.version+1),env)).status,409);
  const approved=await worker.fetch(request('user-alice',state.proposal.version),env);
  assert.equal(approved.status,200);
  assert.equal((await approved.json()).data.approved,true);
  assert.equal((await onboarding.preferences({mailboxId:'mail-a'})).status,'approved');
});
