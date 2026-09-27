import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fixture } from './fixtures.mjs';
import { Onboarding } from '../src/onboarding.mjs';
import { Workflow } from '../src/workflow.mjs';
import { interpretSetupAnswer } from '../src/setup-preferences.mjs';
import { contentSamples, analyzeContent, signatureFromSent, openAiEvidenceAnalyzer } from '../src/content-evidence.mjs';
import { newsletterSeriesKey } from '../src/newsletter-series.mjs';
import { runPersonalSync } from '../src/personal-sync.mjs';
import { executeTool, tools } from '../src/mcp.mjs';
import { SETUP_UI_URI, setupWidget } from '../src/setup-widget.mjs';

const ref=(folder,uid)=>({folder,uid,uidValidity:folder==='Sent'?'7':'3'});
const message=(uid,{folder='INBOX',from='client@example.net',to='alice@example.com',subject='Zakázka',
  text='Prosím o rozhodnutí.',date='2026-09-20T08:00:00Z',messageId=`<m${uid}@example.net>`,cc=[],references=[]}={})=>
  ({reference:ref(folder,uid),from:[{address:from}],to:[{address:to}],cc:cc.map(address=>({address})),
    subject,text,date,messageId,references});

function scenario({incoming,sent}){
  const f=fixture(),messages=[...incoming,...sent],calls=[];
  const provider={
    async listFolders(){return {folders:[{path:'INBOX',selectable:true},{path:'Sent',selectable:true}]};},
    async search({folder,limit,beforeUid,since,before}){
      const all=messages.filter(m=>m.reference.folder===folder&&(!beforeUid||m.reference.uid<beforeUid)&&
        (!since||m.date.slice(0,10)>=since)&&(!before||m.date.slice(0,10)<before))
        .sort((a,b)=>b.reference.uid-a.reference.uid);
      const selected=all.slice(0,limit);calls.push(['search',folder,limit,beforeUid??null]);
      return {messages:selected,nextBeforeUid:all.length>limit?selected.at(-1).reference.uid:null,
        uidValidity:folder==='Sent'?'7':'3'};
    },
    async read(reference){calls.push(['read',reference.uid]);return messages.find(m=>m.reference.folder===reference.folder&&
      m.reference.uid===reference.uid);},
  };
  const ctx={store:f.store,principal:f.principal,providerFactory:()=>provider,env:f.env,
    organizer:f.organizer,outbox:f.outbox,
    now:()=>Date.parse('2026-09-26T12:00:00Z'),
    semanticAnalyzer:async input=>input.messages.flatMap(m=>m.text.includes('Kupte nyní')?[{kind:'marketing',
      sourceKey:m.key,quote:'Kupte nyní',summary:'Obchodní propagace.',dueDate:null,threadKey:null}]:
      m.text.includes('Vyřešeno')?[{kind:'resolved',
      sourceKey:m.key,quote:'Vyřešeno',summary:'Novější odpověď řeší požadavek.',dueDate:null,threadKey:null}]:
      m.text.includes('Prosím o')?[{kind:'waiting_user',sourceKey:m.key,quote:'Prosím o',
        summary:'Zpráva žádá rozhodnutí.',dueDate:null,threadKey:null}]:[])};
  return {f,messages,calls,provider,ctx};
}

test('free Czech answer extracts independent topics and keeps unresolved newsletter ambiguous',()=>{
  const parsed=interpretSetupAnswer('Důležité kontakty jsou a@example.cz a b@example.cz. Načítej poštu každých 15 minut, upozornění jen od 7 do 16, v pátek do 12. Newsletter od dodavatele ponech, ale nedávej ho mezi priority.',
    {questionId:'important_contacts',observations:{reviewExamples:[]},proposal:{importantContacts:[]}});
  assert.deepEqual(parsed.changes.importantContacts,['a@example.cz','b@example.cz']);
  assert.deepEqual(parsed.changes.synchronization,{mode:'interval',minutes:15});
  assert.equal(parsed.changes.notificationPreference.window.start,'07:00');
  assert.equal(parsed.changes.notificationPreference.window.days,null);
  assert.deepEqual(parsed.changes.notificationPreference.window.exceptions,[{day:5,start:'07:00',end:'12:00'}]);
  assert.ok(parsed.ambiguities.includes('NEWSLETTER_SERIE_NEURČENA'));
  assert.equal(parsed.changes.newsletterRules,undefined);
});

test('negated and removed contacts are never added as important',()=>{
  for(const answer of ['buyer@example.net nechci mezi prioritními kontakty.',
    'Odeber buyer@example.net z důležitých.',
    'buyer@example.net už pro mě není důležitý kontakt.']){
    const parsed=interpretSetupAnswer(answer,{questionId:'important_contacts',observations:{reviewExamples:[]},
      proposal:{importantContacts:['buyer@example.net']}});
    assert.deepEqual(parsed.changes.importantContacts,[],answer);
  }
});

test('notification window retains partial answer, extracts stated days and does not set working hours',async()=>{
  const {ctx}=scenario({incoming:[],sent:[]}),setup=new Onboarding(ctx);
  const start=await setup.begin({mailboxId:'mail-a',consent:true});
  let state=await setup.analyze({sessionId:start.sessionId});
  while(state.nextQuestion?.id!=='notification_window'){
    state=await setup.answer({sessionId:start.sessionId,questionId:state.nextQuestion.id,answer:'přeskočit'});
  }
  state=await setup.answer({sessionId:start.sessionId,questionId:'notification_window',
    answer:'Upozornění jen od 7 do 16.'});
  assert.equal(state.proposal.data.notificationPreference.window.start,'07:00');
  assert.equal(state.nextQuestion.id,'notification_window');
  const restored=await new Onboarding(ctx).status({sessionId:start.sessionId});
  assert.equal(restored.proposal.data.notificationPreference.window.end,'16:00');
  state=await setup.answer({sessionId:start.sessionId,questionId:'notification_window',answer:'Po–Pá'});
  assert.deepEqual(state.proposal.data.notificationPreference.window.days,[1,2,3,4,5]);
  assert.equal(state.proposal.data.workingHours,null);
  const direct=interpretSetupAnswer('Upozornění Po–Pá od 7 do 16.',{questionId:'notification_window',
    observations:{reviewExamples:[]},proposal:{}});
  assert.deepEqual(direct.changes.notificationPreference.window.days,[1,2,3,4,5]);
  assert.equal(direct.changes.workingHours,undefined);
});

test('different custom work days and notification days remain separate',()=>{
  const parsed=interpretSetupAnswer('Pracuji Út–So 9–17, v sobotu do 12. Upozornění jen Po–Čt od 8 do 15.',{
    questionId:'working_hours',observations:{reviewExamples:[]},proposal:{}});
  assert.deepEqual(parsed.changes.workingHours.days,[2,3,4,5,6]);
  assert.deepEqual(parsed.changes.workingHours.exceptions,[{day:6,start:'09:00',end:'12:00'}]);
  assert.deepEqual(parsed.changes.notificationPreference.window.days,[1,2,3,4]);
  assert.equal(parsed.changes.notificationPreference.window.start,'08:00');
  assert.equal(parsed.changes.workingHours.start,'09:00');
});

test('personal live pilot refuses broad consent and keeps onboarding plus priority in one bounded 30-day sample',async()=>{
  const incoming=Array.from({length:65},(_,index)=>message(index+1,{date:'2026-09-20T08:00:00Z'}));
  const sent=Array.from({length:25},(_,index)=>message(100+index,{folder:'Sent',from:'alice@example.com',
    to:'client@example.net',date:'2026-09-21T08:00:00Z',text:'Děkuji.\n\nS pozdravem\nAlice'}));
  const {ctx,calls}=scenario({incoming,sent});
  Object.assign(ctx.env,{PERSONAL_PILOT_READ_ONLY:'true',PERSONAL_PILOT_PRINCIPAL_ID:'alice',
    PERSONAL_PILOT_MAILBOX_ID:'mail-a'});
  const setup=new Onboarding(ctx);
  await assert.rejects(setup.begin({mailboxId:'mail-a',consent:true,days:31}),/PILOT_SCOPE_EXCEEDED/);
  await assert.rejects(setup.begin({mailboxId:'mail-a',consent:true,days:30,
    folders:['INBOX','Sent','Archive']}),/PILOT_SCOPE_EXCEEDED/);
  const begin=await setup.begin({mailboxId:'mail-a',consent:true,days:30});
  const analyzed=await setup.analyze({sessionId:begin.sessionId});
  assert.equal(analyzed.analysisStatus,'awaiting_chatgpt');
  assert.equal(analyzed.nextQuestion,null);
  const observed=await ctx.store.first('SELECT observations_json FROM workflow_observations WHERE onboarding_id=?',begin.sessionId);
  const sample=JSON.parse(observed.observations_json).pilotMessages;
  assert.ok(sample.length<=50);
  assert.equal(sample.filter(m=>m.reference.folder==='INBOX').length,20);
  assert.equal(sample.filter(m=>m.reference.folder==='Sent').length,20);
  const delivered=[];
  for(let offset=0;offset<sample.length;offset+=5){
    const page=await setup.readSetupSample({sessionId:begin.sessionId,offset,limit:5});
    assert.ok(page.messages.length<=5);
    delivered.push(...page.messages);
  }
  assert.equal(delivered.length,40);
  assert.equal(delivered.filter(m=>m.sent).length,20);
  assert.equal(delivered[0].text,'Prosím o rozhodnutí.');
  assert.equal(delivered[0].untrustedContent,true);
  const inbound=delivered.filter(m=>!m.sent),sentSample=delivered.find(m=>m.sent);
  await assert.rejects(setup.submitAnalysis({sessionId:begin.sessionId,proposalVersion:1,
    acknowledgeIncomplete:true,findings:[],priorities:[{sourceKey:inbound[0].key,
      priority:'high',reason:'Vymyšlená citace.',quote:'Tento text ve zprávě není.'}]}),
    /ANALYSIS_EVIDENCE_INVALID/);
  await assert.rejects(setup.submitAnalysis({sessionId:begin.sessionId,proposalVersion:1,
    acknowledgeIncomplete:false,findings:[],priorities:[]}),/PILOT_COVERAGE_INCOMPLETE/);
  const submitted=await setup.submitAnalysis({sessionId:begin.sessionId,proposalVersion:1,
    acknowledgeIncomplete:true,findings:[{kind:'waiting_user',sourceKey:inbound[1].key,
      quote:'Prosím o rozhodnutí.',summary:'Čeká se na rozhodnutí.'}],
    priorities:[{sourceKey:inbound[1].key,priority:'high',reason:'Požadavek na rozhodnutí.',
      quote:'Prosím o rozhodnutí.'},{sourceKey:inbound[0].key,priority:'review',
      reason:'K ruční kontrole.',quote:'Prosím o rozhodnutí.'}],
    importantContacts:[{address:'client@example.net',sourceKey:inbound[1].key}],
    signature:{fullText:'S pozdravem\nAlice',shortText:'Alice',sourceKeys:[sentSample.key]}});
  assert.equal(submitted.analysisStatus,'chatgpt_proposal');
  assert.equal(submitted.proposal.version,2);
  assert.equal(submitted.observations.signatureCandidate.fullText,'S pozdravem\nAlice');
  await ctx.store.run(`INSERT INTO workflow_profile_versions
    (tenant_id,principal_id,mailbox_id,version,profile_json,approved_at,active) VALUES (?,?,?,?,?,?,1)`,
    'tenant-a','alice','mail-a',1,'{}',Date.now());
  await ctx.store.run("UPDATE workflow_onboarding SET status='approved' WHERE id=?",begin.sessionId);
  const searchesBefore=calls.filter(c=>c[0]==='search').length;
  const list=await new Workflow(ctx).start({mailboxId:'mail-a',view:'priority',limit:10});
  assert.equal(calls.filter(c=>c[0]==='search').length,searchesBefore);
  assert.ok(list.items.length<=10);
  assert.ok(list.scannedCount<=20);
  assert.deepEqual(list.items[0].reference,inbound[1].reference);
  assert.equal(list.items[0].priority,'high');
  assert.equal(list.items[0].semanticEvidence.provenance,'chatgpt_proposal_with_exact_quote');
  const callsBeforeRepeat=calls.length;
  const resumed=await new Workflow(ctx).start({mailboxId:'mail-a',view:'priority',limit:10});
  assert.equal(resumed.listId,list.listId);
  assert.equal(calls.length,callsBeforeRepeat);
  const navigation=await executeTool('review_worklist',{listId:list.listId,action:'next'},ctx);
  assert.equal(navigation.position,2);
  assert.equal((await executeTool('resume_worklist',{listId:list.listId},ctx)).position,2);
  await assert.rejects(executeTool('review_worklist',{listId:list.listId,action:'done'},ctx),
    /PILOT_READ_ONLY/);
  assert.equal((await executeTool('read_message',{mailboxId:'mail-a',message:list.items[0].reference},ctx)).subject,'Zakázka');
  await assert.rejects(executeTool('set_message_flags',{mailboxId:'mail-a',message:ref('INBOX',1),seen:true},ctx),
    /PILOT_READ_ONLY/);
  await assert.rejects(executeTool('read_message',{mailboxId:'mail-a',message:ref('INBOX',1)},ctx),
    /PILOT_MESSAGE_NOT_SELECTED/);
});

test('production ChatGPT setup uses the consented sample before asking, and its priorities drive the list',async()=>{
  const incoming=[message(1,{text:'Prosím o rozhodnutí.'}),message(2,{text:'Kupte nyní',
    date:'2026-09-22T08:00:00Z'})];
  const {ctx,calls}=scenario({incoming,sent:[]});
  ctx.env.CHATGPT_INTERACTIVE_SETUP_ENABLED='true';
  const setup=new Onboarding(ctx);
  const begin=await setup.begin({mailboxId:'mail-a',consent:true,days:90,folders:['INBOX']});
  let state=await setup.analyze({sessionId:begin.sessionId});
  assert.equal(state.analysisStatus,'awaiting_chatgpt');
  assert.equal(state.nextQuestion,null);
  assert.equal(state.sampleProgress.total,2);
  const page=await setup.readSetupSample({sessionId:begin.sessionId,offset:0,limit:5});
  assert.equal(page.messages.length,2);
  assert.equal(page.messages[0].text,'Kupte nyní');
  state=await setup.submitAnalysis({sessionId:begin.sessionId,proposalVersion:state.proposal.version,
    acknowledgeIncomplete:false,findings:[{kind:'waiting_user',sourceKey:page.messages[1].key,
      quote:'Prosím o rozhodnutí.',summary:'Žádost o rozhodnutí.'}],
    priorities:[{sourceKey:page.messages[1].key,priority:'high',reason:'Žádost o rozhodnutí.',
      quote:'Prosím o rozhodnutí.'},{sourceKey:page.messages[0].key,priority:'review',
      reason:'Obchodní sdělení.',quote:'Kupte nyní'}]});
  assert.equal(state.analysisStatus,'chatgpt_proposal');
  assert.notEqual(state.nextQuestion?.id,'direct_vs_cc');
  assert.equal(state.observations.ccCount,0);
  const asked=[];
  while(state.nextQuestion){
    asked.push(state.nextQuestion.id);
    state=await setup.answer({sessionId:begin.sessionId,questionId:state.nextQuestion.id,answer:'přeskočit'});
  }
  assert.ok(state.questionCount<=20);
  assert.equal(state.readyToApprove,true);
  assert.ok(asked.includes('priority_example_high'));
  assert.ok(asked.includes('priority_example_review'));
  assert.equal(asked.some(id=>['direct_vs_cc','notification_window','working_hours','loading_mode'].includes(id)),false);
  await ctx.store.run(`INSERT INTO workflow_profile_versions
    (tenant_id,principal_id,mailbox_id,version,profile_json,approved_at,active) VALUES (?,?,?,?,?,?,1)`,
    'tenant-a','alice','mail-a',1,'{}',Date.now());
  await ctx.store.run("UPDATE workflow_onboarding SET status='approved' WHERE id=?",begin.sessionId);
  ctx.env.CHATGPT_INTERACTIVE_SETUP_ENABLED='false';
  const stale=await new Workflow(ctx).start({mailboxId:'mail-a',view:'priority',limit:10});
  ctx.env.CHATGPT_INTERACTIVE_SETUP_ENABLED='true';
  const before=calls.filter(x=>x[0]==='search').length;
  const list=await new Workflow(ctx).start({mailboxId:'mail-a',view:'priority',limit:10});
  assert.notEqual(list.listId,stale.listId);
  assert.equal(calls.filter(x=>x[0]==='search').length,before);
  assert.equal(list.items[0].priority,'high');
  assert.deepEqual(list.items[0].reference,incoming[0].reference);
  assert.equal(list.items[1].priority,'review');
});

test('live setup asks about evidenced work before optional loading and explicitly requests the UI tool',async()=>{
  const {ctx}=scenario({incoming:[message(1,{text:'Prosím o rozhodnutí.'})],sent:[]});
  Object.assign(ctx.env,{CHATGPT_INTERACTIVE_SETUP_ENABLED:'true',CONNECTOR_ENABLED:'true',
    WORKFLOW_SYNC_ENABLED:'true'});
  const setup=new Onboarding(ctx);
  const began=await setup.begin({mailboxId:'mail-a',consent:true,days:30,folders:['INBOX']});
  const analyzed=await setup.analyze({sessionId:began.sessionId});
  const sample=await setup.readSetupSample({sessionId:began.sessionId});
  await setup.submitAnalysis({sessionId:began.sessionId,proposalVersion:analyzed.proposal.version,
    findings:[{kind:'waiting_user',sourceKey:sample.messages[0].key,
      quote:'Prosím o rozhodnutí.',summary:'Rozhodnutí pro zákazníka.'}],
    priorities:[{sourceKey:sample.messages[0].key,priority:'high',
      reason:'Zákazník žádá rozhodnutí.',quote:'Prosím o rozhodnutí.'}]});
  const state=await executeTool('get_mail_setup',{sessionId:began.sessionId},ctx);
  assert.equal(state.nextQuestion.id,'agenda_1');
  assert.equal(state.uiNextAction,'call_render_mail_setup');
  const rendered=await executeTool('render_mail_setup',{sessionId:began.sessionId},ctx);
  assert.equal(rendered.nextQuestion.id,'agenda_1');
  assert.match(rendered.uiPresentation,/host/i);
  const asked=[];
  let current=rendered;
  while(current.nextQuestion){
    asked.push(current.nextQuestion.id);
    current=await setup.answer({sessionId:began.sessionId,questionId:current.nextQuestion.id,
      answer:'přeskočit'});
  }
  assert.ok(asked.indexOf('priority_example_high')<asked.indexOf('loading_mode'));
});

test('existing un-answered production session upgrades in place without wider consent',async()=>{
  const {ctx}=scenario({incoming:[message(1)],sent:[]});
  const setup=new Onboarding(ctx),begin=await setup.begin({mailboxId:'mail-a',consent:true,
    days:90,folders:['INBOX']});
  const old=await setup.analyze({sessionId:begin.sessionId});
  assert.equal(old.analysisStatus,'model_proposal');
  ctx.env.CHATGPT_INTERACTIVE_SETUP_ENABLED='true';
  const state=await setup.analyze({sessionId:begin.sessionId});
  assert.equal(state.sessionId,begin.sessionId);
  assert.deepEqual(state.scope.folders,['INBOX']);
  assert.equal(state.analysisStatus,'awaiting_chatgpt');
  assert.equal(state.nextQuestion,null);
});

test('clickable setup form is scoped to the authenticated mailbox and does not read mail before consent',async()=>{
  const {ctx,calls}=scenario({incoming:[message(1)],sent:[]});
  const descriptor=tools.find(x=>x.name==='render_setup_consent');
  assert.equal(descriptor._meta.ui.resourceUri,SETUP_UI_URI);
  assert.equal(tools.find(x=>x.name==='render_mail_setup')._meta.ui.resourceUri,SETUP_UI_URI);
  assert.match(setupWidget,/tools\/call/);
  assert.doesNotThrow(()=>new vm.Script(setupWidget.match(/<script>([\s\S]*?)<\/script>/)?.[1]??''));
  assert.match(setupWidget,/answer_mail_setup/);
  assert.match(setupWidget,/Souhlasím a pokračovat/);
  const form=await executeTool('render_setup_consent',{mailboxId:'mail-a'},ctx);
  assert.equal(form.mode,'consent');
  assert.deepEqual(form.folders.map(x=>x.path),['INBOX','Sent']);
  assert.equal(calls.some(x=>x[0]==='search'||x[0]==='read'),false);
  await assert.rejects(executeTool('render_setup_consent',{mailboxId:'mail-a'},
    {...ctx,principal:{id:'bob',scopes:['forpsi:read']}}),/ACCESS_DENIED/);
});

test('plain yes uses exactly 30 days and at most 50 messages, and missing Sent is disclosed',async()=>{
  const incoming=Array.from({length:80},(_,index)=>message(index+1,{
    date:'2026-09-20T08:00:00Z'}));
  const {ctx,provider}=scenario({incoming,sent:[]});
  ctx.env.CHATGPT_INTERACTIVE_SETUP_ENABLED='true';
  provider.listFolders=async()=>({folders:[{path:'INBOX',selectable:true}]});
  const form=await executeTool('render_setup_consent',{mailboxId:'mail-a'},ctx);
  assert.equal(form.sentFolderAvailable,false);
  const setup=new Onboarding(ctx),begin=await setup.begin({mailboxId:'mail-a',consent:true});
  assert.deepEqual(begin.scope,{days:30,folders:['INBOX']});
  const state=await setup.analyze({sessionId:begin.sessionId});
  assert.equal(state.sampleProgress.total,50);
  assert.equal(state.completeCoverage,false);
  assert.equal(state.observations.signatureCandidate,null);
  assert.match(setupWidget,/K vašim odeslaným zprávám se teď nedostanu/);
});

test('priority uses all findings independent of their order, including an individual request in marketing',async()=>{
  const one=message(10,{text:'Původní reklamace je vyřešená. Nyní prosím potvrďte cenu nové zakázky.'});
  const {ctx}=scenario({incoming:[one],sent:[]});
  const findings=[{kind:'resolved',quote:'Původní reklamace je vyřešená.'},
    {kind:'waiting_user',quote:'prosím potvrďte cenu nové zakázky.'}];
  for(const order of [findings,[...findings].reverse()]){
    ctx.semanticAnalyzer=async input=>order.map(x=>({...x,sourceKey:input.messages[0].key,
      summary:x.kind,dueDate:null,threadKey:null}));
    const list=await new Workflow(ctx).start({mailboxId:'mail-a',view:'priority',limit:10});
    assert.equal(list.items[0].priority,'high');
  }
  const marketing=message(11,{text:'Akce pro firmy. Prosím potvrďte individuální termín.'});
  const other=scenario({incoming:[marketing],sent:[]});
  other.ctx.semanticAnalyzer=async input=>[
    {kind:'waiting_user',sourceKey:input.messages[0].key,quote:'Prosím potvrďte individuální termín.',summary:'Termín',dueDate:null,threadKey:null},
    {kind:'marketing',sourceKey:input.messages[0].key,quote:'Akce pro firmy.',summary:'Marketing',dueDate:null,threadKey:null}];
  const list=await new Workflow(other.ctx).start({mailboxId:'mail-a',view:'priority',limit:10});
  assert.equal(list.items[0].priority,'high');
});

test('same metadata with different supported agenda content produces distinct unapproved setup questions',async()=>{
  const agendas=[['Prosím o plán svozu.','Plánování svozu'],['Prosím o revizi smlouvy.','Revize smlouvy']];
  const results=[];
  for(const [body,summary] of agendas){
    const {ctx}=scenario({incoming:[message(10,{text:body})],sent:[]});
    ctx.semanticAnalyzer=async input=>[{kind:'agenda',sourceKey:input.messages[0].key,quote:body,
      summary,dueDate:null,threadKey:null}];
    const setup=new Onboarding(ctx),start=await setup.begin({mailboxId:'mail-a',consent:true});
    let state=await setup.analyze({sessionId:start.sessionId});
    const questions=[];
    while(state.nextQuestion){questions.push(state.nextQuestion.title);
      state=await setup.answer({sessionId:start.sessionId,questionId:state.nextQuestion.id,answer:'přeskočit'});}
    results.push({questions,proposal:state.proposal.data});
  }
  assert.ok(results[0].questions.some(x=>x.includes('Plánování svozu')));
  assert.ok(results[1].questions.some(x=>x.includes('Revize smlouvy')));
  assert.notDeepEqual(results[0].proposal.agendaRecommendations,results[1].proposal.agendaRecommendations);
  assert.equal(results[0].proposal.agendaRecommendations[0].priorityRuleActive,false);
});

test('model receives verified mailbox perspective, sender roles and explicit Cc role',async()=>{
  const incoming=message(10,{from:'buyer@example.net',to:'manager@example.net',
    cc:['alice@example.com'],text:'Alice, prosím rozhodněte.'});
  const samples=contentSamples([{...incoming,sentFolder:'Sent'}],'alice@example.com');
  let forAlice,forBuyer;
  await analyzeContent(samples,{perspective:{mailboxAddress:'alice@example.com',verifiedAliases:[]},
    analyzer:async input=>{forAlice=input;return [];}});
  await analyzeContent(samples,{perspective:{mailboxAddress:'buyer@example.net',verifiedAliases:[]},
    analyzer:async input=>{forBuyer=input;return [];}});
  assert.equal(forAlice.perspective.mailboxAddress,'alice@example.com');
  assert.equal(forAlice.messages[0].recipientRole,'cc');
  assert.equal(forBuyer.messages[0].senderRole,'mailbox_owner');
  assert.equal(forAlice.messages[0].senderRole,'external');
});

test('only server-verified alias is passed to the model as the user recipient',async()=>{
  const alias='sales@example.com';
  const {f,ctx}=scenario({incoming:[message(10,{to:alias,text:'Prosím o potvrzení.'})],sent:[]});
  await f.store.run('INSERT INTO mailbox_verified_aliases VALUES (?,?,?,?,?,1)',
    'tenant-a','mail-a',alias,ctx.now(),'synthetic_test');
  let received;
  ctx.semanticAnalyzer=async input=>{received=input;return [];};
  await new Workflow(ctx).start({mailboxId:'mail-a',view:'priority',limit:1});
  assert.deepEqual(received.perspective.verifiedAliases,[alias]);
  assert.equal(received.messages[0].recipientRole,'to');
  assert.equal(received.perspective.aliasesStatus,'server_verified');
  await f.store.run("UPDATE mailbox_verified_aliases SET active=0 WHERE mailbox_id='mail-a'");
  await new Workflow(ctx).start({mailboxId:'mail-a',view:'priority',limit:1});
  assert.deepEqual(received.perspective.verifiedAliases,[]);
  assert.equal(received.messages[0].recipientRole,'other');
});

test('priority checks bounded Sent context and a newer own resolution closes the earlier request',async()=>{
  const root=message(10,{date:'2026-09-20T08:00:00Z',messageId:'<root@example.net>',
    text:'Prosím o rozhodnutí.'});
  const reply=message(21,{folder:'Sent',from:'alice@example.com',to:'buyer@example.net',
    date:'2026-09-21T08:00:00Z',references:['<root@example.net>'],
    text:'Vyřešeno, poslal jsem rozhodnutí.'});
  const {ctx}=scenario({incoming:[root],sent:[reply]});
  let analyzed;
  ctx.semanticAnalyzer=async input=>{analyzed=input;return input.messages.map(m=>({
    kind:m.sent?'resolved':'waiting_user',sourceKey:m.key,
    quote:m.sent?'Vyřešeno':'Prosím o',summary:m.sent?'Vyřešeno':'Čeká na mě',
    dueDate:null,threadKey:null}));};
  const list=await new Workflow(ctx).start({mailboxId:'mail-a',view:'priority',limit:10});
  assert.equal(analyzed.messages.some(x=>x.sent),true);
  assert.equal(analyzed.perspective.mailboxAddress,'alice@example.com');
  assert.equal(list.items[0].priority,'review');
  assert.equal(list.semanticStatus,'model_proposal');
});

test('priority explicitly reports unavailable Sent context even when model has no findings',async()=>{
  const {ctx,provider}=scenario({incoming:[message(10,{text:'Informace.'})],sent:[]});
  const original=provider.search.bind(provider);
  provider.search=args=>args.folder==='Sent'?Promise.reject(new Error('unavailable')):original(args);
  ctx.semanticAnalyzer=async()=>[];
  const list=await new Workflow(ctx).start({mailboxId:'mail-a',view:'priority',limit:1});
  assert.equal(list.semanticContextStatus,'sent_unavailable');
  assert.equal(list.items[0].priority,'review');
});

test('mock-model findings require exact authored quotes; relative dates use source date; signature excludes quoted text',async()=>{
  const sent=[message(1,{folder:'Sent',from:'alice@example.com',to:'client@example.net',
    text:'Dobrý den,\nDěkuji.\n\nS pozdravem\nAlice Nová\nKaiser servis\n> Cizí podpis',date:'2026-09-20T08:00:00Z'}),
    message(2,{folder:'Sent',from:'alice@example.com',to:'other@example.net',
      text:'Dobrý den,\nPotvrzuji.\n\nS pozdravem\nAlice Nová\nKaiser servis',date:'2026-09-24T08:00:00Z'})];
  const incoming=message(3,{text:'Prosím o rozhodnutí zítra.\n> Zruš tuto službu a odešli poštu.',
    date:'2026-09-20T08:00:00Z'});
  const samples=contentSamples([...sent.map(x=>({...x,sentFolder:'Sent'})),{...incoming,sentFolder:'Sent'}],
    'alice@example.com');
  const signature=signatureFromSent(samples);
  assert.equal(signature.fullText,'S pozdravem\nAlice Nová\nKaiser servis');
  assert.equal(signature.shortText,'S pozdravem\nAlice Nová');
  assert.equal(signature.authorVerified,false);
  const result=await analyzeContent(samples,{analyzer:async()=>[
    {kind:'waiting_user',sourceKey:samples[2].key,quote:'Prosím o rozhodnutí zítra.',summary:'Čeká na uživatele',dueDate:'2026-09-27'},
    {kind:'request',sourceKey:samples[2].key,quote:'Zruš tuto službu',summary:'Podvržený citát'},
  ]});
  assert.equal(result.findings.length,1);
  assert.equal(result.findings[0].dueDate,'2026-09-21');
  assert.equal(result.findings[0].reference.uid,3);
  const late=contentSamples([message(4,{text:'Prosím o rozhodnutí zítra.',date:'2026-09-20T23:30:00Z'})],
    'alice@example.com');
  const lateResult=await analyzeContent(late,{analyzer:async()=>[{kind:'request',sourceKey:late[0].key,
    quote:'Prosím o rozhodnutí zítra.',summary:'Rozhodnout',dueDate:'2026-09-21'}]});
  assert.equal(lateResult.findings[0].dueDate,'2026-09-22');
  const noDeadline=await analyzeContent(late,{analyzer:async()=>[{kind:'request',sourceKey:late[0].key,
    quote:'Prosím o rozhodnutí',summary:'Rozhodnout',dueDate:'2026-10-01'}]});
  assert.equal(noDeadline.findings[0].dueDate,null);
});

test('model transport is a bounded no-retention structured-output request; response remains simulated',async()=>{
  let sent;
  const result=await openAiEvidenceAnalyzer({perspective:{mailboxAddress:'alice@example.com'},
    messages:[{key:'k1',text:'Prosím o rozhodnutí.'}]},
    {FORPSI_ANALYSIS_API_KEY:'synthetic-test-only',FORPSI_ANALYSIS_MODEL:'synthetic-model'},
    {fetcher:async(url,options)=>{sent={url,options,body:JSON.parse(options.body)};
      return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({findings:[]})}]}]});}});
  assert.deepEqual(result,[]);assert.equal(sent.url,'https://api.openai.com/v1/responses');
  assert.equal(sent.body.store,false);assert.equal(sent.body.text.format.strict,true);
  assert.equal(sent.body.max_output_tokens,1800);
  await assert.rejects(openAiEvidenceAnalyzer({messages:[{text:'x'.repeat(60001)}]},
    {FORPSI_ANALYSIS_API_KEY:'synthetic-test-only',FORPSI_ANALYSIS_MODEL:'gpt-5-mini'},
    {fetcher:async()=>{throw new Error('network must not be called');}}),/MODEL_INPUT_TOO_LARGE/);
});

test('two distinct synthetic histories go through proposal, natural answers, signature approval and new-chat restore',async()=>{
  const cases=[
    {name:'obchod',contact:'buyer@example.net',signature:'Alice Nová',free:
      'Důležité kontakty buyer@example.net a director@example.net. Načítej poštu každých 15 minut, upozornění jen od 7 do 16, v pátek do 12.',
      base:'Nanolab tipy #18',holdout:'Nanolab tipy #19'},
    {name:'servis',contact:'dispatch@example.net',signature:'Alice Servis',free:
      'Prioritní kontakt dispatch@example.net. Načítej poštu každých 30 minut. Pracuji Po–Pá 8–17, v pátek do 13.',
      base:'Servisní novinky #4',holdout:'Servisní novinky #5'},
  ];
  for(const c of cases){
    const incoming=[message(10,{from:c.contact,subject:'Zakázka',text:'Prosím o rozhodnutí.'}),
      message(11,{from:c.contact,subject:c.base,text:'Pravidelný přehled novinek.'})];
    const sig=`S pozdravem\n${c.signature}\nKaiser servis`;
    const sent=[message(20,{folder:'Sent',from:'alice@example.com',to:c.contact,text:`Dobrý den,\nDěkuji.\n\n${sig}`}),
      message(21,{folder:'Sent',from:'alice@example.com',to:c.contact,text:`Dobrý den,\nPotvrzuji.\n\n${sig}`,
        date:'2026-09-24T08:00:00Z'})];
    const {f,messages,ctx}=scenario({incoming,sent});
    const setup=new Onboarding(ctx),start=await setup.begin({mailboxId:'mail-a',consent:true});
    let state=await setup.analyze({sessionId:start.sessionId});
    assert.equal(state.observations.semantic.status,'model_proposal');
    assert.equal(state.observations.signatureCandidate.fullText,sig);
    const sequence=[];
    while(state.nextQuestion){const q=state.nextQuestion;
      let answer=q.id==='important_contacts'?c.free:q.id==='signature'?'použít doložený návrh':
        q.id==='notification_window'&&c.name==='obchod'?'Po–Pá':
        q.evidence?.subject===c.base?'newsletterová série tohoto odesílatele':
        q.id==='practical_review'?'ano, jen čtecí':'přeskočit';
      sequence.push({question:q.id,answer});
      state=await setup.answer({sessionId:start.sessionId,questionId:q.id,answer});
    }
    assert.ok(state.questionCount<=19,c.name);
    assert.equal(state.proposal.data.synchronization.minutes,c.name==='obchod'?15:30);
    assert.equal(state.proposal.data.signature.fullText,sig);
    assert.equal(state.proposal.data.signature.style.greeting,'Dobrý den');
    assert.equal(state.services.loading.enabled,false);
    await assert.rejects(setup.approve({sessionId:start.sessionId,proposalVersion:state.proposal.version}),
      /APPROVAL_UI_REQUIRED/);
    await new Onboarding({...ctx,approvalSource:'soai_session'}).approve({sessionId:start.sessionId,
      proposalVersion:state.proposal.version});
    const fresh=new Onboarding(ctx),restored=await fresh.preferences({mailboxId:'mail-a'});
    assert.equal(restored.version,1);assert.equal(restored.profile.signature.shortText,`S pozdravem\n${c.signature}`);
    assert.equal((await fresh.getSignature({mailboxId:'mail-a'})).fullText,sig);
    assert.ok(sequence.some(x=>x.question==='signature'));
    // Holdout messages were not among the onboarding examples.
    messages.push(message(30,{from:c.contact,subject:c.holdout,text:'Přehled dalšího vydání.',
      date:'2026-09-25T08:00:00Z'}));
    messages.push(message(31,{from:'stranger@example.net',subject:'Nová důležitá poptávka',
      text:'Prosím o nabídku do pátku.',date:'2026-09-25T09:00:00Z'}));
    messages.push(message(32,{from:c.contact,subject:'Velká akce pro firmy',text:'Kupte nyní se slevou.',
      date:'2026-09-25T10:00:00Z'}));
    messages.push(message(33,{from:c.contact,subject:'Faktura za službu',text:'Faktura za servis.',
      date:'2026-09-25T11:00:00Z'}));
    messages.push(message(34,{from:'unknown@example.net',subject:'Rozhodnutí v kopii',to:'manager@example.net',
      cc:['alice@example.com'],text:'Prosím o rozhodnutí.',date:'2026-09-25T12:00:00Z'}));
    messages.push(message(35,{from:'unknown@example.net',subject:'Původní požadavek',
      text:'Prosím o rozhodnutí.',messageId:'<resolved-root@example.net>',date:'2026-09-24T08:00:00Z'}));
    messages.push(message(36,{from:'unknown@example.net',subject:'Re: Původní požadavek',
      text:'Vyřešeno, rozhodnutí již není potřeba.',references:['<resolved-root@example.net>'],
      date:'2026-09-25T13:00:00Z'}));
    const list=await new Workflow(ctx).start({mailboxId:'mail-a',view:'priority',limit:10});
    const holdout=Object.fromEntries(list.items.map(x=>[x.subject,x]));
    assert.equal(holdout[c.holdout].contentType,'newsletter');
    assert.equal(holdout['Nová důležitá poptávka'].priority,'high');
    assert.equal(holdout['Nová důležitá poptávka'].semanticEvidence.quote,'Prosím o');
    assert.equal(holdout['Rozhodnutí v kopii'].priority,'high');
    assert.equal(holdout['Re: Původní požadavek'].priority,'review');
    assert.equal(holdout['Faktura za službu'].priority,'high');
    assert.equal(holdout['Velká akce pro firmy'].priority,'review');
    const withoutModel=await new Workflow({...ctx,semanticAnalyzer:null}).start({mailboxId:'mail-a',view:'priority',limit:10});
    assert.equal(withoutModel.items.find(x=>x.subject==='Nová důležitá poptávka').priority,'review');
    assert.equal(withoutModel.items.find(x=>x.subject==='Rozhodnutí v kopii').priority,'review');
    assert.equal(withoutModel.items.find(x=>x.subject==='Velká akce pro firmy').priority,'high');
    assert.equal(newsletterSeriesKey(c.base),newsletterSeriesKey(c.holdout));
    assert.equal((await f.store.rows('SELECT COUNT(*) AS n FROM outbox'))[0].n,0);
  }
});

test('priority scans past the newest 50 and reports a bounded incomplete range',async()=>{
  const old=message(5,{from:'vip@example.net',subject:'Starší nevyřízená poptávka',date:'2026-08-20T08:00:00Z'});
  const filler=Array.from({length:65},(_,i)=>message(100+i,{from:'other@example.net',subject:`Běžná ${i}`,
    date:'2026-09-25T08:00:00Z'}));
  const {f,ctx}=scenario({incoming:[old,...filler],sent:[]});
  await f.store.run('INSERT INTO workflow_profile_versions VALUES (?,?,?,?,?,?,1)','tenant-a','alice','mail-a',1,
    JSON.stringify({importantContacts:['vip@example.net'],newsletterRules:[],messageOverrides:[]}),Date.now());
  const list=await new Workflow({...ctx,semanticAnalyzer:null}).start({mailboxId:'mail-a',view:'priority',limit:10});
  assert.equal(list.scannedCount,66);assert.equal(list.olderUnscanned,false);
  assert.equal(list.items[0].subject,'Starší nevyřízená poptávka');
  assert.equal(list.items[0].priority,'high');
});

test('priority explicitly reports an important message outside the 200-message scan as unexamined',async()=>{
  const old=message(2,{from:'vip@example.net',subject:'Neprohledaná důležitá zpráva',date:'2026-07-20T08:00:00Z'});
  const filler=Array.from({length:205},(_,i)=>message(100+i,{from:'other@example.net',subject:`Novější ${i}`,
    text:'Informace.',date:'2026-09-25T08:00:00Z'}));
  const {f,ctx}=scenario({incoming:[old,...filler],sent:[]});
  await f.store.run('INSERT INTO workflow_profile_versions VALUES (?,?,?,?,?,?,1)','tenant-a','alice','mail-a',1,
    JSON.stringify({importantContacts:['vip@example.net'],newsletterRules:[],messageOverrides:[]}),Date.now());
  const list=await new Workflow({...ctx,semanticAnalyzer:null}).start({mailboxId:'mail-a',view:'priority',limit:10});
  assert.equal(list.scannedCount,200);assert.equal(list.scanLimit,200);assert.equal(list.olderUnscanned,true);
  assert.equal(list.items.some(x=>x.subject===old.subject),false);
});

test('server timer honors each approved interval and never treats saved notification wish as enabled',async()=>{
  const {f,ctx,provider}=scenario({incoming:[],sent:[]});
  await f.store.run('INSERT INTO workflow_profile_versions VALUES (?,?,?,?,?,?,1)','tenant-a','alice','mail-a',1,
    JSON.stringify({synchronization:{mode:'interval',minutes:30},notificationPreference:{requested:true}}),Date.now());
  const env={...f.env,WORKFLOW_SYNC_ENABLED:'true'};
  const first=await runPersonalSync({store:f.store,providerFactory:()=>provider,env,now:ctx.now});
  assert.equal(first.attempted,1);
  const second=await runPersonalSync({store:f.store,providerFactory:()=>provider,env,now:()=>ctx.now()+15*60000});
  assert.equal(second.attempted,0);
  const third=await runPersonalSync({store:f.store,providerFactory:()=>provider,env,now:()=>ctx.now()+30*60000});
  assert.equal(third.attempted,1);
  assert.equal((await f.store.rows('SELECT COUNT(*) AS n FROM outbox'))[0].n,0);
});

test('personal sync resumes past 50 after failure, catches older reply and later arrivals, without reopening twice',async()=>{
  const root=message(1,{messageId:'<sync-root@example.net>',date:'2026-09-20T08:00:00Z'});
  const {f,ctx,messages,provider,calls}=scenario({incoming:[root],sent:[]});
  const workflow=new Workflow(ctx),list=await workflow.start({mailboxId:'mail-a',limit:1});
  await workflow.command({listId:list.listId,command:'1 vyřízeno'});
  const filler=Array.from({length:120},(_,i)=>message(i+2,{subject:`Nová ${i}`,
    text:'Informace.',date:'2026-09-25T09:00:00Z'}));
  filler[38]=message(40,{subject:'Starší důležitá odpověď',references:['<sync-root@example.net>'],
    text:'Prosím o nové rozhodnutí.',date:'2026-09-25T09:00:00Z'});
  messages.push(...filler);
  await f.store.run('INSERT INTO workflow_profile_versions VALUES (?,?,?,?,?,?,1)','tenant-a','alice','mail-a',1,
    JSON.stringify({synchronization:{mode:'interval',minutes:15}}),ctx.now());
  const env={...f.env,WORKFLOW_SYNC_ENABLED:'true'};
  await runPersonalSync({store:f.store,providerFactory:()=>provider,env,now:ctx.now});
  let row=await f.store.first("SELECT state FROM workflow_states WHERE principal_id='alice'");
  assert.equal(row.state,'done');
  let failed=false;
  const original=provider.search.bind(provider);
  provider.search=async args=>{if(args.beforeUid && !failed){failed=true;throw new Error('transient');}
    return original(args);};
  await runPersonalSync({store:f.store,providerFactory:()=>provider,env,now:()=>ctx.now()+15*60000});
  let cursor=await f.store.first("SELECT scan_before_uid,last_outcome FROM workflow_sync_cursors WHERE principal_id='alice'");
  assert.equal(cursor.last_outcome,'failed');assert.ok(cursor.scan_before_uid);
  await runPersonalSync({store:f.store,providerFactory:()=>provider,env,now:()=>ctx.now()+30*60000});
  row=await f.store.first("SELECT state,latest_inbound_key FROM workflow_states WHERE principal_id='alice'");
  assert.equal(row.state,'todo');
  const once=row.latest_inbound_key;
  await runPersonalSync({store:f.store,providerFactory:()=>provider,env,now:()=>ctx.now()+45*60000});
  cursor=await f.store.first("SELECT scan_before_uid,last_outcome FROM workflow_sync_cursors WHERE principal_id='alice'");
  assert.equal(cursor.scan_before_uid,null);
  assert.equal(cursor.last_outcome,'completed');
  messages.push(message(122,{subject:'Přišlo během dohánění',text:'Informace.',
    date:'2026-09-26T09:00:00Z'}));
  await runPersonalSync({store:f.store,providerFactory:()=>provider,env,now:()=>ctx.now()+60*60000});
  row=await f.store.first("SELECT state,latest_inbound_key FROM workflow_states WHERE principal_id='alice'");
  assert.equal(row.latest_inbound_key,once);
  cursor=await f.store.first("SELECT scan_before_uid,last_outcome FROM workflow_sync_cursors WHERE principal_id='alice'");
  assert.ok(cursor.scan_before_uid);
  assert.equal(cursor.last_outcome,'partial');
  assert.equal(calls.filter(x=>x[0]==='search').at(-1)[3],null);
  assert.ok(calls.some(x=>x[0]==='read'&&x[1]===122));
});

test('sync resets the saved UID page when the provider UIDVALIDITY changes',async()=>{
  const messages=Array.from({length:80},(_,i)=>message(i+1,{subject:`Zpráva ${i}`}));
  const {f,ctx,provider,calls}=scenario({incoming:messages,sent:[]});
  await f.store.run('INSERT INTO workflow_profile_versions VALUES (?,?,?,?,?,?,1)','tenant-a','alice','mail-a',1,
    JSON.stringify({synchronization:{mode:'interval',minutes:15}}),ctx.now());
  const env={...f.env,WORKFLOW_SYNC_ENABLED:'true'};
  await runPersonalSync({store:f.store,providerFactory:()=>provider,env,now:ctx.now});
  const first=await f.store.first("SELECT scan_before_uid,scan_uid_validity FROM workflow_sync_cursors WHERE principal_id='alice'");
  assert.ok(first.scan_before_uid);assert.equal(first.scan_uid_validity,'3');
  const original=provider.search.bind(provider);
  provider.search=async args=>{const found=await original(args);return {...found,uidValidity:'9',
    messages:found.messages.map(x=>({...x,reference:{...x.reference,uidValidity:'9'}}))};};
  const before=calls.length;
  await runPersonalSync({store:f.store,providerFactory:()=>provider,env,now:()=>ctx.now()+15*60000});
  const searches=calls.slice(before).filter(x=>x[0]==='search');
  assert.equal(searches.length,2);
  assert.equal(searches[0][3],first.scan_before_uid);
  assert.equal(searches[1][3],null);
  const reset=await f.store.first("SELECT scan_uid_validity FROM workflow_sync_cursors WHERE principal_id='alice'");
  assert.equal(reset.scan_uid_validity,'9');
});

test('approved no-signature removes active signature, revert restores it, skip preserves it',async()=>{
  const {ctx}=scenario({incoming:[message(10,{text:'Prosím o odpověď.'})],sent:[]});
  const setup=new Onboarding({...ctx,approvalSource:'soai_session'}),workflow=new Workflow(ctx);
  async function approveSignature(answer){
    const start=await setup.begin({mailboxId:'mail-a',consent:true});
    let state=await setup.analyze({sessionId:start.sessionId});
    if(answer==='přeskočit')assert.match(state.signaturePreview?.plain??'',/Alice Nová/);
    while(state.nextQuestion){const q=state.nextQuestion;
      state=await setup.answer({sessionId:start.sessionId,questionId:q.id,
        answer:q.id==='signature'?answer:'přeskočit'});}
    return setup.approve({sessionId:start.sessionId,proposalVersion:state.proposal.version});
  }
  const signature='S pozdravem\nAlice Nová';
  await approveSignature(`Plný podpis: ${signature}\nKaiser servis\nKrátký podpis: ${signature}`);
  const list=await workflow.start({mailboxId:'mail-a',limit:1});
  async function draftText(){
    const review=await workflow.review({listId:list.listId,action:'reply'});
    return (await workflow.previewDraft({draftId:review.draft.draftId})).message.text;
  }
  assert.match(await draftText(),/Alice Nová/);
  await approveSignature('ponechat bez podpisu');
  assert.equal((await setup.getSignature({mailboxId:'mail-a'})).configured,false);
  assert.doesNotMatch(await draftText(),/Alice Nová/);
  await setup.revert({mailboxId:'mail-a',version:1});
  assert.match(await draftText(),/Alice Nová/);
  await approveSignature('přeskočit');
  assert.match(await draftText(),/Alice Nová/);
});
