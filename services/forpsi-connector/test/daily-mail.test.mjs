import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { Workflow } from '../src/workflow.mjs';
import { executeTool } from '../src/mcp.mjs';
import { mailAppWidget, MAIL_APP_UI_URI } from '../src/mail-app-widget.mjs';

const ref=(uid,folder='INBOX')=>({folder,uid,uidValidity:folder==='Sent'?'7':'3'});
const message=(uid,{folder='INBOX',from='customer@example.net',to='alice@example.com',
  subject='Zakázka',text='Prosím potvrďte termín.',date='2026-09-25T09:00:00Z',
  messageId=`<mail-${uid}@example.net>`,inReplyTo=null,references=[]}={})=>({
  reference:ref(uid,folder),from:[{address:from}],to:[{address:to}],cc:[],subject,text,date,
  messageId,inReplyTo,references,attachments:[],truncated:false,
});

function setup(){
  const f=fixture();
  const messages=[message(12),message(11,{from:'updates@example.net',subject:'Novinky',
    text:'Přehled novinek tohoto týdne.'})];
  const calls=[];
  const provider={
    async listFolders(){calls.push('folders');return {folders:[
      {path:'INBOX',selectable:true},{path:'Sent',selectable:true}]};},
    async search({folder,limit,beforeUid}){
      calls.push('search');
      const found=messages.filter(x=>x.reference.folder===folder&&
        (!beforeUid||x.reference.uid<beforeUid)).sort((a,b)=>b.reference.uid-a.reference.uid);
      return {messages:found.slice(0,limit),nextBeforeUid:found.length>limit?
        found[limit-1].reference.uid:null,uidValidity:folder==='Sent'?'7':'3'};
    },
    async read(reference){
      calls.push('read');const found=messages.find(x=>x.reference.folder===reference.folder&&
        x.reference.uid===reference.uid&&x.reference.uidValidity===reference.uidValidity);
      if(!found)throw new Error('MESSAGE_NOT_FOUND');return structuredClone(found);
    },
    async send(){calls.push('send');throw new Error('UNEXPECTED_SEND');},
    async move(){calls.push('move');throw new Error('UNEXPECTED_MOVE');},
    async flags(){calls.push('flags');throw new Error('UNEXPECTED_FLAGS');},
  };
  const ctx={store:f.store,principal:{id:'alice',scopes:['forpsi:read']},
    providerFactory:()=>provider,env:{...f.env,CHATGPT_INTERACTIVE_SETUP_ENABLED:'true'},
    organizer:{messageLabels:async()=>[]},outbox:f.outbox,now:f.now};
  return {f,ctx,workflow:new Workflow(ctx),messages,calls};
}

test('daily mail opens with a safe default profile before onboarding approval',async()=>{
  const {workflow,messages,calls}=setup();
  const list=await workflow.start({mailboxId:'mail-a',view:'priority',limit:2});
  assert.deepEqual(list.items.map(x=>x.reference.uid),[12,11]);
  assert.deepEqual(list.items.map(x=>x.priority),['review','review']);
  const page=await workflow.readBatch({listId:list.listId,offset:0,limit:2});
  assert.equal(page.messages[0].text,'Prosím potvrďte termín.');
  assert.equal(page.messages[1].subject,'Novinky');
  messages.unshift(message(13,{subject:'Nová příchozí'}));
  assert.deepEqual((await workflow.current({listId:list.listId})).items.map(x=>x.reference.uid),[12,11]);
  assert.ok(!calls.some(x=>['send','move','flags'].includes(x)));
});

test('ChatGPT proposal validates source text and revision, then drives the same numbered list',async()=>{
  const {workflow,ctx,f}=setup();
  const list=await workflow.start({mailboxId:'mail-a',view:'priority',limit:2});
  const input={listId:list.listId,expectedRevision:0,coverageComplete:true,evaluations:[
    {number:1,priority:'high',reason:'Zákazník žádá potvrzení termínu.',quote:'Prosím potvrďte termín.'},
    {number:2,priority:'review',reason:'Jen přehled novinek.',quote:'Přehled novinek tohoto týdne.'}]};
  await assert.rejects(workflow.submitViewAnalysis({...input,evaluations:[
    {...input.evaluations[0],quote:'Tohle ve zprávě není.'},input.evaluations[1]]}),
  /ANALYSIS_EVIDENCE_MISMATCH/);
  const saved=await workflow.submitViewAnalysis(input);
  assert.equal(saved.analysisRevision,1);
  assert.equal(saved.items[0].priority,'high');
  assert.equal(saved.items[0].priorityReason,'Zákazník žádá potvrzení termínu.');
  await assert.rejects(workflow.submitViewAnalysis(input),/ANALYSIS_VERSION_CONFLICT/);
  await f.store.run("INSERT INTO grants VALUES ('bob','mail-a','read',0)");
  const other=new Workflow({...ctx,principal:{id:'bob',scopes:['forpsi:read']}});
  await assert.rejects(other.readBatch({listId:list.listId,offset:0,limit:1}),/WORKLIST_NOT_FOUND/);
  await assert.rejects(other.submitViewAnalysis(input),/WORKLIST_NOT_FOUND/);
});

test('thread detail includes a relevant own Sent reply and reports bounded coverage',async()=>{
  const {workflow,messages}=setup();
  messages.push(message(22,{folder:'Sent',from:'alice@example.com',to:'customer@example.net',
    subject:'Re: Zakázka',text:'Termín potvrzuji.',inReplyTo:'<mail-12@example.net>',
    references:['<mail-12@example.net>']}));
  const thread=await workflow.thread({mailboxId:'mail-a',message:ref(12)});
  assert.deepEqual(thread.messages.map(x=>x.reference.folder),['INBOX','Sent']);
  assert.equal(thread.messages[1].text,'Termín potvrzuji.');
  assert.equal(thread.coverage.sentFolder,'Sent');
});

test('connection status is grant bound and never exposes another mailbox',async()=>{
  const {ctx,f}=setup();
  const status=await executeTool('get_mail_connection_status',{},ctx);
  assert.equal(status.connection,'Připojeno');
  assert.deepEqual(status.mailboxes.map(x=>x.address),['alice@example.com']);
  await f.store.run("UPDATE grants SET revoked=1 WHERE principal_id='alice' AND mailbox_id='mail-a' AND action='read'");
  const revoked=await executeTool('get_mail_connection_status',{},ctx);
  assert.equal(revoked.connection,'Nepřipojeno');
  assert.deepEqual(revoked.mailboxes,[]);
});

test('open exact number, mark done and prepare an unsendable reply across a new chat',async()=>{
  const {workflow,ctx,messages,calls}=setup();
  const list=await workflow.start({mailboxId:'mail-a',view:'recent',limit:2});
  messages.unshift(message(13,{subject:'Nová příchozí'}));
  const opened=await workflow.review({listId:list.listId,action:'open',number:2});
  assert.equal(opened.position,2);
  assert.equal(opened.message.subject,'Novinky');
  const result=await workflow.command({listId:list.listId,command:'1 hotovo. 2 odlož do pondělí.'});
  assert.deepEqual(result.results.map(x=>x.status),['completed','completed']);
  assert.equal(result.results[1].dueDate,'2026-09-28');
  const reply=await workflow.draftReply({listId:list.listId,number:2,
    text:'Dobrý den, děkuji za zprávu.',signatureMode:'none'});
  const resumed=await new Workflow(ctx).resume({listId:list.listId});
  assert.equal(resumed.position,2);
  assert.equal(resumed.items[0].state,'done');
  assert.equal(resumed.draft.id,reply.draftId);
  assert.equal(resumed.draft.message.text,'Dobrý den, děkuji za zprávu.');
  assert.equal(resumed.draft.message.sendable,false);
  assert.ok(!calls.some(x=>['send','move','flags'].includes(x)));
});

test('forward remains a proposal and never guesses a missing recipient',async()=>{
  const {workflow,ctx}=setup();
  const list=await workflow.start({mailboxId:'mail-a',limit:1});
  await assert.rejects(workflow.draftForward({listId:list.listId,number:1,
    recipient:'účetní',text:'Přeposílám.'}),/RECIPIENT_NOT_APPROVED/);
  const draft=await workflow.draftForward({listId:list.listId,number:1,
    recipient:'accounting@example.net',text:'Přeposílám.'});
  const stored=await new Workflow(ctx).previewDraft({draftId:draft.draftId});
  assert.deepEqual(stored.message.to,['accounting@example.net']);
  assert.equal(stored.message.attachments.length,0);
  assert.equal(stored.sendable,false);
});

test('frozen onboarding preserves its saved state while daily mail stays available',async()=>{
  const {workflow,ctx,f}=setup();
  const frozen={...ctx,env:{...ctx.env,ONBOARDING_FROZEN:'true'}};
  await assert.rejects(executeTool('begin_mail_setup',{
    mailboxId:'mail-a',consent:false},frozen),/SETUP_PAUSED/);
  assert.equal((await f.store.rows('SELECT COUNT(*) AS n FROM workflow_onboarding'))[0].n,0);
  const list=await new Workflow(frozen).start({mailboxId:'mail-a',view:'priority',limit:2});
  assert.equal(list.items.length,2);
  assert.equal(list.semanticStatus,'awaiting_chatgpt');
  assert.ok(!mailAppWidget.includes('innerHTML'));
  assert.match(mailAppWidget,/process_worklist_command/);
  assert.match(mailAppWidget,/preview_workflow_draft/);
  assert.match(MAIL_APP_UI_URI,/mail-app-v2/);
});

test('daily mail keeps native mailbox mutations unavailable while personal states work',async()=>{
  const {ctx,workflow,calls}=setup();
  const safe={...ctx,env:{...ctx.env,MCP_NATIVE_MUTATIONS_ENABLED:'false'}};
  await assert.rejects(executeTool('set_message_flags',{
    mailboxId:'mail-a',message:ref(12),seen:true},safe),/MCP_NATIVE_ACTIONS_PAUSED/);
  const list=await new Workflow(safe).start({mailboxId:'mail-a',limit:1});
  const done=await executeTool('process_worklist_command',{
    listId:list.listId,command:'1 hotovo'},safe);
  assert.equal(done.results[0].state,'done');
  assert.ok(!calls.some(x=>['send','move','flags'].includes(x)));
});

test('main mail view shows the current ChatGPT assessment instead of old sender ranking',async()=>{
  const {ctx,f}=setup();
  await f.store.run('INSERT INTO workflow_profile_versions VALUES (?,?,?,?,?,?,1)',
    'tenant-a','alice','mail-a',1,JSON.stringify({importantContacts:['updates@example.net']}),f.now());
  const list=await executeTool('start_mail_view',{mailboxId:'mail-a',limit:2},ctx);
  assert.deepEqual(list.items.map(x=>x.priority),['review','review']);
  assert.equal(list.semanticStatus,'awaiting_chatgpt');
  const page=await executeTool('read_worklist_batch',{listId:list.listId,offset:0,limit:2},ctx);
  assert.equal(page.nextOffset,null);
  const analyzed=await executeTool('submit_mail_view_analysis',{
    listId:list.listId,expectedRevision:list.analysisRevision,coverageComplete:true,evaluations:[
      {number:1,priority:'high',reason:'Konkrétní žádost o termín.',quote:'Prosím potvrďte termín.'},
      {number:2,priority:'review',reason:'Přehled bez osobního požadavku.',quote:'Přehled novinek tohoto týdne.'}]},ctx);
  const card=await executeTool('render_mail_app',{listId:list.listId},ctx);
  assert.equal(analyzed.analysisRevision,1);
  assert.deepEqual(card.items.map(x=>x.priority),['high','review']);
  assert.equal(card.items[1].from,'updates@example.net');
  assert.equal(card.listId,list.listId);
});

test('a later Sent resolution may support a current priority only within the same thread',async()=>{
  const {workflow,messages}=setup();
  messages.push(message(22,{folder:'Sent',from:'alice@example.com',to:'customer@example.net',
    text:'Termín jsem již potvrdila.',inReplyTo:'<mail-12@example.net>',
    references:['<mail-12@example.net>']}));
  messages.push(message(23,{folder:'Sent',from:'alice@example.com',to:'other@example.net',
    text:'Jiný požadavek jsem vyřídila.'}));
  const list=await workflow.start({mailboxId:'mail-a',view:'priority',limit:1,freshAnalysis:true});
  await assert.rejects(workflow.submitViewAnalysis({listId:list.listId,expectedRevision:0,
    coverageComplete:true,evaluations:[{number:1,priority:'review',
      reason:'Vyřešeno jinde.',quote:'Jiný požadavek jsem vyřídila.',
      evidenceReference:ref(23,'Sent')}]}),/ANALYSIS_EVIDENCE_UNRELATED/);
  const current=await workflow.submitViewAnalysis({listId:list.listId,expectedRevision:0,
    coverageComplete:true,evaluations:[{number:1,priority:'review',
      reason:'Novější vlastní odpověď už termín potvrdila.',quote:'Termín jsem již potvrdila.',
      evidenceReference:ref(22,'Sent')}]});
  assert.equal(current.items[0].priority,'review');
  assert.deepEqual(current.items[0].semanticEvidence.reference,ref(22,'Sent'));
});

test('current view reports messages beyond its bounded scan instead of calling them unimportant',async()=>{
  const {ctx}=setup();
  const list=await executeTool('start_mail_view',{
    mailboxId:'mail-a',limit:1,scanLimit:1,since:'2026-09-01'},ctx);
  assert.equal(list.scannedCount,1);
  assert.equal(list.displayedCount,1);
  assert.equal(list.olderUnscanned,true);
  assert.equal(list.items[0].priority,'review');
});
