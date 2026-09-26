import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { Onboarding } from '../src/onboarding.mjs';
import { Workflow } from '../src/workflow.mjs';

function setup(sent=true){
  const f=fixture(),calls=[];
  const incoming={reference:{folder:'INBOX',uid:10,uidValidity:'3'},subject:'Zakázka',
    from:[{address:'client@example.net'}],to:[{address:'alice@example.com'}],cc:[],
    date:'2026-09-20T08:00:00.000Z',messageId:'<in@example.net>',text:'Prosím o potvrzení.'};
  const outgoing={reference:{folder:'Sent',uid:11,uidValidity:'5'},subject:'Re: Zakázka',
    from:[{address:'alice@example.com'}],to:[{address:'client@example.net'}],cc:[],
    date:'2026-09-21T08:00:00.000Z',messageId:'<out@example.net>',text:'Děkuji.'};
  const provider={
    async listFolders(){calls.push('folders');return {folders:[{path:'INBOX',selectable:true},{path:'Sent',selectable:true},
      {path:'Trash',specialUse:'\\Trash',selectable:true}]};},
    async search(args){calls.push(['search',args.folder,args.since,args.before]);
      if(args.folder==='Sent')return {messages:sent?[outgoing]:[],nextBeforeUid:null};
      return {messages:[incoming],nextBeforeUid:null};},
    async read(ref){calls.push(['read',ref.folder]);return ref.folder==='Sent'?outgoing:incoming;},
  };
  const ctx={store:f.store,principal:f.principal,providerFactory:()=>provider,env:f.env,
    now:()=>Date.parse('2026-09-26T12:00:00Z')};
  return {f,calls,provider,ctx,onboarding:new Onboarding(ctx)};
}

test('declined analysis stores deferral without accessing provider history',async()=>{
  const {onboarding,calls}=setup();
  const result=await onboarding.begin({mailboxId:'mail-a',consent:false});
  assert.equal(result.status,'deferred');assert.deepEqual(calls,[]);
  await assert.rejects(onboarding.analyze({sessionId:result.sessionId}),/ONBOARDING_CONSENT_REQUIRED/);
});

test('90-day bounded metadata sampling records limits and adapts questions to the history',async()=>{
  const a=setup(true),b=setup(false);
  const started=await a.onboarding.begin({mailboxId:'mail-a',consent:true,days:90});
  const analyzed=await a.onboarding.analyze({sessionId:started.sessionId});
  assert.equal(analyzed.coverage.length,6);
  assert.equal(analyzed.completeCoverage,true);
  assert.equal(analyzed.nextQuestion.id,'important_contacts');
  assert.deepEqual(analyzed.observations.twoWay.map(x=>x.address),['client@example.net']);
  assert.ok(a.calls.every(x=>Array.isArray(x)?x[0]!=='read':true));
  const bStarted=await b.onboarding.begin({mailboxId:'mail-a',consent:true,days:90});
  const bAnalyzed=await b.onboarding.analyze({sessionId:bStarted.sessionId});
  assert.equal(bAnalyzed.nextQuestion.id,'direct_vs_cc');
  assert.deepEqual(bAnalyzed.observations.twoWay,[]);
});

test('questions persist across restart, cannot exceed 20, and approve exact personal version',async()=>{
  const {f,ctx,onboarding}=setup();
  await f.store.run("INSERT INTO grants VALUES ('bob','mail-a','read',0)");
  const started=await onboarding.begin({mailboxId:'mail-a',consent:true});
  let state=await onboarding.analyze({sessionId:started.sessionId});
  while(state.nextQuestion){
    const q=state.nextQuestion;
    state=await new Onboarding(ctx).answer({sessionId:started.sessionId,questionId:q.id,
      answer:q.id==='important_contacts'?'client@example.net':q.options[0]});
  }
  assert.ok(state.questionCount<=19);assert.equal(state.readyToApprove,true);
  const approved=await onboarding.approve({sessionId:started.sessionId,proposalVersion:state.proposal.version,confirmed:true});
  assert.equal(approved.profile.importantContacts[0],'client@example.net');
  assert.equal((await new Onboarding(ctx).preferences({mailboxId:'mail-a'})).version,1);
  const bob=new Onboarding({...ctx,principal:{id:'bob',scopes:['forpsi:read']}});
  assert.equal((await bob.preferences({mailboxId:'mail-a'})).status,'not_configured');
  await assert.rejects(bob.status({sessionId:started.sessionId}),/ONBOARDING_NOT_FOUND/);
  const restored=await onboarding.revert({mailboxId:'mail-a',version:1,confirmed:true});
  assert.equal(restored.version,2);
});

test('approved personal signature has plain and escaped HTML preview and is inserted once into a proposal',async()=>{
  const {f,ctx,onboarding,provider}=setup();
  const signature=await onboarding.signature({mailboxId:'mail-a',fullText:'Alice <Kaiser>\nTelefon 123',
    shortText:'Alice',expectedRevision:0,confirmed:true});
  assert.equal(signature.sample.html.includes('&lt;Kaiser&gt;'),true);
  assert.equal(signature.sample.html.includes('<Kaiser>'),false);
  assert.equal(signature.senderAddress,'alice@example.com');
  const workflow=new Workflow(ctx);
  const list=await workflow.start({mailboxId:'mail-a',limit:1});
  // The sample provider searches INBOX for the worklist and never invokes SMTP.
  const reply=await workflow.review({listId:list.listId,action:'reply'});
  assert.equal(reply.draft.sendable,false);
  const draft=(await workflow.resume({listId:list.listId})).draft;
  assert.equal(draft.message.from,'alice@example.com');
  assert.equal(draft.message.text,'Alice');
  assert.equal(draft.message.text.match(/Alice/g).length,1);
  const revised=await workflow.updateDraft({draftId:draft.id,revision:draft.revision,message:{to:draft.message.to,
    cc:[],bcc:[],subject:'Re: Zakázka',text:'Nový text\n\nAlice'}});
  assert.equal(revised.message.text.match(/Alice/g).length,1);
  assert.equal(revised.confirmationInvalidated,true);
  assert.equal((await f.store.rows('SELECT COUNT(*) AS n FROM outbox'))[0].n,0);
});

test('derived profile can be removed without touching mail or personal signature',async()=>{
  const {f,onboarding,calls}=setup();
  await onboarding.signature({mailboxId:'mail-a',fullText:'Alice',shortText:'A',expectedRevision:0,confirmed:true});
  const session=await onboarding.begin({mailboxId:'mail-a',consent:true});
  await onboarding.analyze({sessionId:session.sessionId});
  const beforeCalls=calls.length;
  const removed=await onboarding.remove({mailboxId:'mail-a',confirmed:true});
  assert.equal(removed.mailMessagesUnchanged,true);
  assert.equal((await onboarding.preferences({mailboxId:'mail-a'})).status,'not_configured');
  assert.equal((await onboarding.getSignature({mailboxId:'mail-a'})).configured,true);
  assert.equal(calls.length,beforeCalls);
  assert.equal((await f.store.rows('SELECT COUNT(*) AS n FROM workflow_observations'))[0].n,0);
});
