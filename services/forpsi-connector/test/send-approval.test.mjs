import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, mail } from './fixtures.mjs';
import { SendApproval } from '../src/send-approval.mjs';

test('exact message requires SO.ai approval and retries never send twice',async()=>{
  const f=fixture(),flow=new SendApproval(f.store,f.env,f.outbox,f.now);
  const args={mailboxId:'mail-a',message:mail,requestId:crypto.randomUUID()};
  const preview=await flow.prepare(f.principal,args,false);
  assert.equal(preview.from,'alice@example.com');
  assert.deepEqual(preview.attachments,[]);
  assert.equal((await flow.prepare(f.principal,args,false)).proposalId,preview.proposalId);
  assert.equal(f.calls.length,0);
  assert.equal((await f.store.rows('SELECT COUNT(*) AS n FROM outbox'))[0].n,0);
  await assert.rejects(flow.prepare(f.principal,{...args,message:{...mail,text:'changed'}},false),
    /IDEMPOTENCY_CONFLICT/);
  await assert.rejects(flow.approve(f.principal,preview.proposalId,1),/SEND_DISABLED/);
  f.env.SEND_ENABLED='true';
  await assert.rejects(flow.approve(f.principal,preview.proposalId,2),/PROPOSAL_VERSION_CONFLICT/);
  const result=await flow.approve(f.principal,preview.proposalId,1);
  assert.equal(result.job.state,'sent');
  assert.equal((await flow.approve(f.principal,preview.proposalId,1)).job.id,result.job.id);
  assert.equal(f.calls.filter(call=>call[0]==='send').length,1);
  const outsider={id:'bob',scopes:f.principal.scopes};
  await assert.rejects(flow.status(outsider,preview.proposalId),/PROPOSAL_NOT_FOUND/);
  await f.store.run("UPDATE grants SET revoked=1 WHERE principal_id='alice' AND action='send'");
  await assert.rejects(flow.approve(f.principal,preview.proposalId,1),/ACCESS_DENIED/);
});

test('scheduled proposal is inert until approval and then waits for scheduled execution',async()=>{
  const f=fixture(),flow=new SendApproval(f.store,f.env,f.outbox,f.now);
  const sendAt=new Date(f.now()+3600000).toISOString();
  const args={mailboxId:'mail-a',message:mail,requestId:crypto.randomUUID(),sendAt};
  const proposal=await flow.prepare(f.principal,args,true);
  assert.equal(proposal.sendAt,sendAt);
  f.env.SEND_ENABLED='true';
  const approved=await flow.approve(f.principal,proposal.proposalId,1);
  assert.equal(approved.job.state,'queued');
  assert.equal(f.calls.length,0);
  f.setTime(f.now()+3600001);await f.outbox.tick();
  assert.equal(f.calls.filter(call=>call[0]==='send').length,1);
  await assert.rejects(flow.prepare(f.principal,{...args,requestId:crypto.randomUUID(),
    sendAt:new Date(f.now()-1000).toISOString()},true),/INVALID_SEND_TIME/);
});

test('cancelling an unapproved proposal blocks later approval',async()=>{
  const f=fixture(),flow=new SendApproval(f.store,f.env,f.outbox,f.now);
  const p=await flow.prepare(f.principal,{mailboxId:'mail-a',message:mail,
    requestId:crypto.randomUUID()},false);
  assert.deepEqual(await flow.cancel(f.principal,p.proposalId,1),
    {proposalId:p.proposalId,state:'cancelled'});
  f.env.SEND_ENABLED='true';
  await assert.rejects(flow.approve(f.principal,p.proposalId,1),/PROPOSAL_NOT_PENDING/);
  assert.equal(f.calls.length,0);
});
