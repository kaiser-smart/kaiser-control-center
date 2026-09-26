import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { Onboarding } from '../src/onboarding.mjs';
import { Workflow } from '../src/workflow.mjs';
import { interpretSetupAnswer } from '../src/setup-preferences.mjs';
import { contentSamples, analyzeContent, signatureFromSent, openAiEvidenceAnalyzer } from '../src/content-evidence.mjs';
import { newsletterSeriesKey } from '../src/newsletter-series.mjs';
import { runPersonalSync } from '../src/personal-sync.mjs';

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
      return {messages:selected,nextBeforeUid:all.length>limit?selected.at(-1).reference.uid:null};
    },
    async read(reference){calls.push(['read',reference.uid]);return messages.find(m=>m.reference.folder===reference.folder&&
      m.reference.uid===reference.uid);},
  };
  const ctx={store:f.store,principal:f.principal,providerFactory:()=>provider,env:f.env,
    now:()=>Date.parse('2026-09-26T12:00:00Z'),
    semanticAnalyzer:async input=>input.flatMap(m=>m.text.includes('Kupte nyní')?[{kind:'marketing',
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
  assert.deepEqual(parsed.changes.notificationPreference.window.exceptions,[{day:5,start:'07:00',end:'12:00'}]);
  assert.ok(parsed.ambiguities.includes('NEWSLETTER_SERIE_NEURČENA'));
  assert.equal(parsed.changes.newsletterRules,undefined);
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
  const result=await openAiEvidenceAnalyzer([{key:'k1',text:'Prosím o rozhodnutí.'}],
    {FORPSI_ANALYSIS_API_KEY:'synthetic-test-only',FORPSI_ANALYSIS_MODEL:'synthetic-model'},
    {fetcher:async(url,options)=>{sent={url,options,body:JSON.parse(options.body)};
      return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({findings:[]})}]}]});}});
  assert.deepEqual(result,[]);assert.equal(sent.url,'https://api.openai.com/v1/responses');
  assert.equal(sent.body.store,false);assert.equal(sent.body.text.format.strict,true);
  assert.equal(sent.body.max_output_tokens,1800);
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
