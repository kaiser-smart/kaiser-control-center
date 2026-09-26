import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { Workflow, dueDate, parseCommands } from '../src/workflow.mjs';
import { Shortcuts } from '../src/shortcuts.mjs';
import { createWorker } from '../src/worker.mjs';

const reference = uid => ({ folder:'INBOX',uid,uidValidity:'3' });
function setup() {
  const f=fixture(), messages=[
    {reference:reference(11),messageId:'<root@example.net>',references:[],date:'2026-09-25T09:00:00.000Z',
      from:[{address:'client@example.net'}],subject:'Zakázka',text:'Prosím o potvrzení.',attachments:[]},
    {reference:reference(10),messageId:'<invoice@example.net>',references:[],date:'2026-09-25T08:00:00.000Z',
      from:[{address:'supplier@example.net'}],subject:'Faktura',text:'Faktura je přiložena.',attachments:[]},
    {reference:reference(9),messageId:'<third@example.net>',references:[],date:'2026-09-25T07:00:00.000Z',
      from:[{address:'third@example.net'}],subject:'Termín',text:'Schůzka v pondělí.',attachments:[]},
  ];
  const calls=[];
  let attachmentProof=[];
  const provider={
    async search({limit}) {calls.push('search');return {messages:messages.slice(0,limit),nextBeforeUid:null};},
    async read(ref) {calls.push(['read',ref.uid]);const item=messages.find(m=>m.reference.uid===ref.uid);
      if(!item)throw new Error('not found');return structuredClone(item);},
    async inspectPdfAttachments() {calls.push('inspect-pdf');return attachmentProof;},
  };
  const ctx={store:f.store,principal:f.principal,providerFactory:()=>provider,env:f.env,now:f.now};
  return {f,messages,calls,ctx,provider,workflow:new Workflow(ctx),setAttachmentProof:value=>{attachmentProof=value;}};
}

test('snapshot numbers survive new mail and a compound instruction reports partial result', async()=>{
  const {workflow,messages,calls}=setup();
  const first=await workflow.start({mailboxId:'mail-a',limit:3});
  assert.deepEqual(first.items.map(i=>i.number),[1,2,3]);
  messages.unshift({reference:reference(12),messageId:'<new@example.net>',references:[],
    date:'2026-09-26T08:00:00.000Z',from:[{address:'new@example.net'}],subject:'Nová',text:'Nová zpráva'});
  const result=await workflow.command({listId:first.listId,command:'1 vyřízeno. 2 přepošli účetní. 3 odlož na pondělí.',timeZone:'Europe/Prague'});
  assert.deepEqual(result.results.map(x=>x.status),['completed','needs_clarification','completed']);
  assert.equal(result.results[1].reason,'RECIPIENT_NOT_APPROVED');
  assert.equal(result.results[2].dueDate,'2026-09-28');
  const after=await workflow.current({listId:first.listId});
  assert.deepEqual(after.items.map(i=>i.reference.uid),[11,10,9]);
  assert.deepEqual(after.items.map(i=>i.state),['done','todo','snoozed']);
  assert.ok(!calls.some(x=>['send','move','flags'].includes(x)));
});

test('review next only skips; restart and another chat recover position and encrypted draft',async()=>{
  const {f,ctx,workflow}=setup();
  const list=await workflow.start({mailboxId:'mail-a',limit:3});
  const next=await workflow.review({listId:list.listId,action:'next'});
  assert.equal(next.position,2);
  assert.equal((await workflow.current({listId:list.listId})).items[0].state,'todo');
  const reply=await workflow.review({listId:list.listId,action:'reply'});
  assert.equal(reply.draft.sendable,false);
  const afterRestart=new Workflow(ctx);
  const resume=await afterRestart.resume({});
  assert.equal(resume.listId,list.listId);
  assert.equal(resume.position,2);
  assert.equal(resume.draft.kind,'reply');
  assert.equal(resume.draft.message.sendable,false);
  assert.equal(resume.draft.message.to[0],'supplier@example.net');
  assert.equal((await f.store.rows('SELECT COUNT(*) AS n FROM outbox'))[0].n,0);
});

test('done survives repeat sync but a genuinely new inbound reply reopens; own reply does not',async()=>{
  const {ctx,workflow,messages}=setup();
  const list=await workflow.start({mailboxId:'mail-a',limit:3});
  await workflow.command({listId:list.listId,command:'1 vyřízeno'});
  assert.deepEqual((await workflow.refresh({mailboxId:'mail-a'})).reopened,[]);
  assert.equal((await new Workflow(ctx).current({listId:list.listId})).items[0].state,'done');
  messages.unshift({reference:reference(13),messageId:'<own@example.net>',references:['<root@example.net>'],
    date:'2026-09-26T10:00:00.000Z',from:[{address:'alice@example.com'}],subject:'Re: Zakázka',text:'Odpověď'});
  assert.deepEqual((await workflow.refresh({mailboxId:'mail-a'})).reopened,[]);
  messages.unshift({reference:reference(14),messageId:'<reply@example.net>',references:['<root@example.net>'],
    date:'2026-09-26T11:00:00.000Z',from:[{address:'client@example.net'}],subject:'Re: Zakázka',text:'Ještě doplnění'});
  assert.equal((await workflow.refresh({mailboxId:'mail-a'})).reopened.length,1);
  assert.equal((await workflow.refresh({mailboxId:'mail-a'})).reopened.length,0);
  assert.equal((await workflow.current({listId:list.listId})).items[0].state,'todo');
});

test('newest reply remains authoritative after repeated sync; old numbered message cannot close it',async()=>{
  const {workflow,messages}=setup();
  const list=await workflow.start({mailboxId:'mail-a',limit:1});
  await workflow.command({listId:list.listId,command:'1 vyřízeno'});
  const newer={reference:reference(21),messageId:'<reply-new@example.net>',references:['<root@example.net>'],
    date:'2026-09-26T11:00:00.000Z',from:[{address:'client@example.net'}],subject:'Re: Zakázka',text:'Nové rozhodnutí'};
  const older={reference:reference(20),messageId:'<reply-old@example.net>',references:['<root@example.net>'],
    date:'2026-09-26T10:00:00.000Z',from:[{address:'client@example.net'}],subject:'Re: Zakázka',text:'Starší doplnění'};
  messages.unshift(older,newer);
  assert.equal((await workflow.refresh({mailboxId:'mail-a'})).reopened.length,1);
  assert.deepEqual((await workflow.refresh({mailboxId:'mail-a'})).reopened,[]);
  const current=await workflow.current({listId:list.listId});
  assert.equal(current.items[0].newerReply,true);
  assert.deepEqual(current.items[0].newerReplyReference,newer.reference);
  const stale=await workflow.command({listId:list.listId,command:'1 vyřízeno'});
  assert.equal(stale.results[0].reason,'NEW_REPLY_REQUIRES_NEW_LIST');
  assert.equal((await workflow.current({listId:list.listId})).items[0].state,'todo');
});

test('personal state and drafts do not leak to another employee with the same mailbox grant',async()=>{
  const {f,workflow,ctx}=setup();
  await f.store.run("INSERT INTO grants VALUES ('bob','mail-a','read',0)");
  const list=await workflow.start({mailboxId:'mail-a',limit:2});
  await workflow.command({listId:list.listId,command:'1 vyřízeno'});
  await workflow.review({listId:list.listId,action:'reply'});
  const bob=new Workflow({...ctx,principal:{id:'bob',scopes:['forpsi:read']}});
  await assert.rejects(bob.current({listId:list.listId}),/WORKLIST_NOT_FOUND/);
  await assert.rejects(bob.resume({listId:list.listId}),/WORKLIST_NOT_FOUND/);
  const bobList=await bob.start({mailboxId:'mail-a',limit:2});
  assert.equal(bobList.items[0].state,'todo');
  assert.equal((await bob.resume({})).draft,null);
});

test('time zone and command parser reject ambiguity and keep concrete due dates',()=>{
  assert.equal(dueDate('pondělí',Date.parse('2026-09-27T23:30:00Z'),'Europe/Prague'),'2026-10-05');
  assert.equal(dueDate('2026-09-28',Date.parse('2026-09-26T12:00:00Z')),'2026-09-28');
  assert.throws(()=>parseCommands('vyřízeno'),/COMMAND_AMBIGUOUS/);
  assert.throws(()=>parseCommands('1 vyřízeno. 1 odlož na pondělí'),/COMMAND_AMBIGUOUS/);
  assert.throws(()=>dueDate('včera',Date.now(),'Europe/Prague'));
});

test('shortcuts require explicit approval, stay personal, and invoice ambiguity never creates a send job',async()=>{
  const {f,ctx,workflow,setAttachmentProof}=setup();
  await f.store.run("INSERT INTO grants VALUES ('bob','mail-a','read',0)");
  const list=await workflow.start({mailboxId:'mail-a',limit:3}),manager=new Shortcuts(ctx);
  const proposal=await manager.propose({mailboxId:'mail-a',name:'Fakturu účetní',phrases:['fakturu účetní'],definition:{
    kind:'invoice_forward',recipient:'faktury@kaiserservis.cz',attachmentRule:'single_verified_invoice_pdf',
    style:'stručný',signatureMode:'short'}});
  await assert.rejects(manager.use({listId:list.listId,number:2,shortcutId:proposal.id}),/SHORTCUT_NOT_APPROVED/);
  const approved=await manager.approve({mailboxId:'mail-a',shortcutId:proposal.id,version:proposal.version,approved:true});
  assert.equal(approved.approved,true);
  assert.equal((await manager.use({listId:list.listId,number:2,shortcutId:proposal.id})).reason,'INVOICE_ATTACHMENT_MISSING');
  setAttachmentProof([{index:0,filename:'one.pdf',size:100,isPdf:true,sha256:'a'.repeat(64)},
    {index:1,filename:'two.pdf',size:120,isPdf:true,sha256:'b'.repeat(64)}]);
  assert.equal((await manager.use({listId:list.listId,number:2,shortcutId:proposal.id})).reason,'INVOICE_ATTACHMENT_AMBIGUOUS');
  setAttachmentProof([{index:0,filename:'one.pdf',size:100,isPdf:true,sha256:'a'.repeat(64)}]);
  assert.equal((await manager.use({listId:list.listId,number:2,shortcutId:proposal.id})).reason,'INVOICE_CONTENT_UNVERIFIED');
  const prepared=await manager.use({listId:list.listId,number:2,shortcutId:proposal.id,
    selectedAttachmentIndex:0,selectedSha256:'a'.repeat(64),confirmedInvoice:true});
  assert.equal(prepared.status,'prepared');assert.equal(prepared.sendable,false);
  assert.equal(prepared.invoiceIdentification,'user_confirmed');
  const draft=(await workflow.resume({listId:list.listId})).draft;
  assert.equal(draft.message.attachments[0].sha256,'a'.repeat(64));
  assert.equal((await f.store.rows('SELECT COUNT(*) AS n FROM outbox'))[0].n,0);
  const bob=new Shortcuts({...ctx,principal:{id:'bob',scopes:['forpsi:read']}});
  assert.equal((await bob.list({mailboxId:'mail-a'})).shortcuts.length,0);
  await assert.rejects(bob.use({listId:list.listId,number:2,shortcutId:proposal.id}),/WORKLIST_NOT_FOUND/);
  const edited=await manager.propose({mailboxId:'mail-a',shortcutId:proposal.id,version:approved.version,
    name:'Fakturu účetní',phrases:['fakturu účetní'],definition:{kind:'invoice_forward',recipient:'other@example.net',
      attachmentRule:'single_verified_invoice_pdf',style:'stručný',signatureMode:'short'}},true);
  assert.equal(edited.approved,false);
  await assert.rejects(manager.use({listId:list.listId,number:2,shortcutId:proposal.id}),/SHORTCUT_NOT_APPROVED/);
});

test('priority view uses approved personal evidence, keeps unknown senders visible, and hides done items',async()=>{
  const {f,workflow,messages}=setup();
  await f.store.run('INSERT INTO workflow_profile_versions VALUES (?,?,?,?,?,?,1)',
    'tenant-a','alice','mail-a',1,JSON.stringify({importantContacts:['client@example.net'],directVsCc:'direct_first'}),Date.now());
  messages.unshift({reference:reference(12),messageId:'<new@example.net>',references:[],
    date:'2026-09-26T08:00:00.000Z',from:[{address:'new@example.net'}],subject:'Nová poptávka',text:'Prosím o nabídku'});
  const first=await workflow.start({mailboxId:'mail-a',limit:2,view:'priority'});
  assert.equal(first.items[0].from,'client@example.net');
  assert.equal(first.items[0].priority,'high');
  assert.equal(first.items[0].priorityReason,'Uživatelem schválený důležitý kontakt.');
  assert.equal(first.items[1].from,'new@example.net');
  assert.equal(first.items[1].priority,'review');
  await workflow.command({listId:first.listId,command:'1 vyřízeno'});
  const second=await workflow.start({mailboxId:'mail-a',limit:2,view:'priority'});
  assert.equal(second.items.some(i=>i.from==='client@example.net'),false);
  assert.equal(second.items[0].from,'new@example.net');
});

test('priority view exposes a new inbound reply to a completed thread on first open',async()=>{
  const {workflow,messages}=setup();
  const list=await workflow.start({mailboxId:'mail-a',limit:1});
  await workflow.command({listId:list.listId,command:'1 vyřízeno'});
  messages.unshift({reference:reference(22),messageId:'<priority-reply@example.net>',references:['<root@example.net>'],
    date:'2026-09-26T11:00:00.000Z',from:[{address:'client@example.net'}],subject:'Re: Zakázka',text:'Nový požadavek'});
  const priority=await workflow.start({mailboxId:'mail-a',limit:3,view:'priority'});
  assert.equal(priority.items[0].reference.uid,22);
  assert.equal(priority.items[0].state,'todo');
  assert.equal(priority.items.filter(i=>i.from==='client@example.net').length,1);
});

test('server scheduler reopens new inbound work without an open chat and sends nothing',async()=>{
  const {f,workflow,messages,provider}=setup();
  await f.store.run('INSERT INTO workflow_profile_versions VALUES (?,?,?,?,?,?,1)',
    'tenant-a','alice','mail-a',1,JSON.stringify({synchronization:{mode:'interval',minutes:15}}),f.now());
  const list=await workflow.start({mailboxId:'mail-a',limit:1});
  await workflow.command({listId:list.listId,command:'1 vyřízeno'});
  messages.unshift({reference:reference(16),messageId:'<scheduled-reply@example.net>',references:['<root@example.net>'],
    date:'2026-09-26T11:00:00.000Z',from:[{address:'client@example.net'}],subject:'Re: Zakázka',text:'Další dotaz'});
  const worker=createWorker({providerFactory:()=>provider});
  await worker.scheduled({}, {...f.env,WORKFLOW_SYNC_ENABLED:'true'});
  assert.equal((await workflow.current({listId:list.listId})).items[0].state,'todo');
  assert.equal((await f.store.rows('SELECT COUNT(*) AS n FROM outbox'))[0].n,0);
  assert.equal((await f.store.rows("SELECT COUNT(*) AS n FROM audit WHERE action='workflow.sync' AND outcome='completed'"))[0].n,1);
});
