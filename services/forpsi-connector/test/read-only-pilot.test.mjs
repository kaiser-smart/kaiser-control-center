import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { createWorker } from '../src/worker.mjs';
import { SOAI_ISSUER } from '../src/admin-access.mjs';
import { openAiEvidenceAnalyzer } from '../src/content-evidence.mjs';
import { verifyToken } from '../src/auth.mjs';
import { generateKeyPair, SignJWT } from 'jose';

let pilotTokens=new Map();

const mail = (uid, mailbox, { folder='INBOX', from='client@example.net', to=mailbox,
  subject='Zakázka', text='Prosím o rozhodnutí.', date='2026-09-24T08:00:00Z' }={}) => ({
  reference:{folder,uid,uidValidity:folder==='Sent'?'7':'3'},
  messageId:`<${mailbox}-${uid}@example.test>`,references:[],from:[{address:from}],to:[{address:to}],
  cc:[],subject,text,date,
});

function providerFor(messages,calls){
  return {
    async listFolders(){return {folders:[{path:'INBOX',selectable:true},{path:'Sent',selectable:true}]};},
    async search({folder,limit,beforeUid,since,before}){
      calls.push('search');
      const available=messages.filter(m=>m.reference.folder===folder && (!beforeUid||m.reference.uid<beforeUid)
        && (!since||m.date.slice(0,10)>=since) && (!before||m.date.slice(0,10)<before))
        .sort((a,b)=>b.reference.uid-a.reference.uid);
      const page=available.slice(0,limit);
      return {messages:page,nextBeforeUid:available.length>limit?page.at(-1).reference.uid:null};
    },
    async read(ref){
      calls.push('read');
      const found=messages.find(m=>m.reference.folder===ref.folder && m.reference.uid===ref.uid
        && m.reference.uidValidity===ref.uidValidity);
      if(!found)throw new Error('MESSAGE_NOT_FOUND');
      return found;
    },
    async send(){calls.push('send');throw new Error('TEST_SEND_FORBIDDEN');},
    async move(){calls.push('move');throw new Error('TEST_MOVE_FORBIDDEN');},
    async flags(){calls.push('flags');throw new Error('TEST_FLAGS_FORBIDDEN');},
  };
}

async function mcp(worker,env,actor,name,args={}){
  const response=await worker.fetch(new Request('https://mail.example/mcp',{
    method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',
      authorization:`Bearer ${pilotTokens.get(actor)}`},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
        params:{name,arguments:args}})}),env);
  assert.equal(response.status,200);
  const result=(await response.json()).result;
  return result.isError?{error:result.content[0].text}:result.structuredContent.data;
}

async function runPilot(semanticAnalyzer){
  const f=fixture(),callsA=[],callsB=[],secret='synthetic-admin-token-longer-than-32-characters';
  await f.store.run('INSERT INTO principals VALUES (?,?,?,?,1)','pilot-a','tenant-a',SOAI_ISSUER,'synthetic-a');
  await f.store.run('INSERT INTO principals VALUES (?,?,?,?,1)','pilot-b','tenant-b',SOAI_ISSUER,'synthetic-b');
  await f.store.run("INSERT INTO grants VALUES ('pilot-a','mail-a','read',0)");
  await f.store.run("INSERT INTO grants VALUES ('pilot-b','mail-b','read',0)");
  await f.store.run('INSERT INTO principal_identity_links VALUES (?,?,?,?,1)',
    'https://id.example','synthetic-oidc-a','pilot-a','tenant-a');
  await f.store.run('INSERT INTO principal_identity_links VALUES (?,?,?,?,1)',
    'https://id.example','synthetic-oidc-b','pilot-b','tenant-b');
  const keys=await generateKeyPair('ES256');
  const token=subject=>new SignJWT({scope:'forpsi:read'}).setProtectedHeader({alg:'ES256'})
    .setIssuer('https://id.example').setAudience('https://mail.example/mcp')
    .setSubject(subject).setExpirationTime('1h').sign(keys.privateKey);
  pilotTokens=new Map([['pilot-a',await token('synthetic-oidc-a')],
    ['pilot-b',await token('synthetic-oidc-b')]]);
  const aAddress='alice@example.com',bAddress='eve@example.com';
  const aMail=[mail(10,aAddress,{from:'buyer@example.net'}),
    mail(11,aAddress,{from:'buyer@example.net',subject:'Obchodní novinky #4',text:'Přehled novinek.'}),
    mail(20,aAddress,{folder:'Sent',from:aAddress,to:'buyer@example.net',
      text:'Dobrý den,\nDěkuji.\n\nS pozdravem\nAlice Nová\nKaiser servis'}),
    mail(21,aAddress,{folder:'Sent',from:aAddress,to:'buyer@example.net',
      text:'Dobrý den,\nPotvrzuji.\n\nS pozdravem\nAlice Nová\nKaiser servis'})];
  const bMail=[mail(30,bAddress,{from:'dispatch@example.net',subject:'Servisní požadavek'}),
    mail(31,bAddress,{from:'dispatch@example.net',subject:'Servisní novinky #7',text:'Přehled oprav.'}),
    mail(40,bAddress,{folder:'Sent',from:bAddress,to:'dispatch@example.net',
      text:'Dobrý den,\nDěkuji.\n\nS pozdravem\nEva Servis\nKaiser servis'}),
    mail(41,bAddress,{folder:'Sent',from:bAddress,to:'dispatch@example.net',
      text:'Dobrý den,\nPotvrzuji.\n\nS pozdravem\nEva Servis\nKaiser servis'})];
  const providers={'mail-a':providerFor(aMail,callsA),'mail-b':providerFor(bMail,callsB)};
  const env={...f.env,CONNECTOR_ADMIN_TOKEN:secret,FORPSI_TENANT_ID:'tenant-a',
    SOAI_MAIL_ENABLED:'true',SOAI_PUBLIC_URL:'https://test.example',SEND_ENABLED:'false',
    WORKFLOW_SYNC_ENABLED:'false'};
  const worker=()=>createWorker({providerFactory:(_env,box)=>providers[box.id],
    semanticAnalyzer,
    authenticate:async (request,_env,store)=>verifyToken(request.headers.get('authorization')?.slice(7),
      {issuer:'https://id.example',resource:'https://mail.example/mcp'},keys.publicKey,store)});
  for(const c of [{actor:'pilot-a',box:'mail-a',address:aAddress,contact:'buyer@example.net',
    newsletter:'Obchodní novinky #4',nextNewsletter:'Obchodní novinky #5',signature:'Alice Nová',messages:aMail},
  {actor:'pilot-b',box:'mail-b',address:bAddress,contact:'dispatch@example.net',
    newsletter:'Servisní novinky #7',nextNewsletter:'Servisní novinky #8',signature:'Eva Servis',messages:bMail}]){
    const connected=await mcp(worker(),env,c.actor,'list_mailboxes');
    assert.deepEqual(connected.mailboxes.map(x=>x.id),[c.box]);
    const started=await mcp(worker(),env,c.actor,'begin_mail_setup',{
      mailboxId:c.box,consent:true,folders:['INBOX','Sent']});
    assert.equal(started.status,'consented');
    let setup=await mcp(worker(),env,c.actor,'analyze_mail_history',{sessionId:started.sessionId});
    assert.equal(setup.observations.semantic.status,'model_proposal');
    assert.equal(setup.observations.signatureCandidate.fullText,
      `S pozdravem\n${c.signature}\nKaiser servis`);
    while(setup.nextQuestion){
      const q=setup.nextQuestion;
      const answer=q.id==='important_contacts'?
        `Prioritní kontakt ${c.contact}. Načítej poštu každých ${c.actor==='pilot-a'?15:30} minut. Pracuji Po–Pá 8–16.`:
        q.id==='signature'?'použít doložený návrh':
        q.evidence?.subject===c.newsletter?'newsletterová série tohoto odesílatele':
        q.id==='practical_review'?'ano, jen čtecí':q.options.at(-1);
      setup=await mcp(worker(),env,c.actor,'answer_mail_setup',{
        sessionId:started.sessionId,questionId:q.id,answer});
      assert.equal(setup.error,undefined,`${c.actor}: ${q.id}`);
    }
    assert.equal(setup.readyToApprove,true);
    assert.equal(setup.proposal.data.synchronization.minutes,c.actor==='pilot-a'?15:30);
    assert.match(setup.signaturePreview.plain,new RegExp(c.signature));
    const modelApproval=await mcp(worker(),env,c.actor,'approve_mail_setup',{
      sessionId:started.sessionId,proposalVersion:setup.proposal.version,confirmed:true});
    assert.equal(modelApproval.error,'APPROVAL_UI_REQUIRED');
    const approved=await worker().fetch(new Request('https://mail.example/internal/setup',{
      method:'POST',headers:{authorization:`Bearer ${secret}`},body:JSON.stringify({
        operation:'approve',actorId:c.actor==='pilot-a'?'synthetic-a':'synthetic-b',
        sessionId:started.sessionId,proposalVersion:setup.proposal.version})}),
    {...env,FORPSI_TENANT_ID:c.actor==='pilot-a'?'tenant-a':'tenant-b'});
    assert.equal(approved.status,200);
    // A new worker is a new synthetic chat. The D1 fixture remains the shared server-side state.
    const restored=await mcp(worker(),env,c.actor,'get_mail_preferences',{mailboxId:c.box});
    assert.equal(restored.version,1);
    assert.equal(restored.profile.signature.shortText,`S pozdravem\n${c.signature}`);
    c.messages.push(mail(c.actor==='pilot-a'?50:60,c.address,{from:c.contact,
      subject:c.nextNewsletter,text:'Další vydání.',date:'2026-09-25T08:00:00Z'}));
    c.messages.push(mail(c.actor==='pilot-a'?51:61,c.address,{from:'new@example.net',
      subject:'Nová poptávka',text:'Prosím o nabídku.',date:'2026-09-25T09:00:00Z'}));
    const list=await mcp(worker(),env,c.actor,'start_worklist',{
      mailboxId:c.box,view:'priority',limit:10});
    assert.equal(list.items.find(x=>x.subject===c.nextNewsletter).contentType,'newsletter');
    assert.equal(list.items.find(x=>x.subject==='Nová poptávka').priority,'high');
    const graphic=await mcp(worker(),env,c.actor,'render_worklist',{listId:list.listId});
    assert.equal(graphic.listId,list.listId);
    const first=graphic.items[0];
    const detail=await mcp(worker(),env,c.actor,'read_message',{
      mailboxId:c.box,message:first.reference});
    assert.equal(detail.subject,first.subject);
    const other=c.actor==='pilot-a'?'pilot-b':'pilot-a';
    assert.equal((await mcp(worker(),env,other,'get_worklist',{listId:list.listId})).error,
      'WORKLIST_NOT_FOUND');
    assert.equal((await mcp(worker(),env,other,'get_mail_preferences',{mailboxId:c.box})).error,
      'ACCESS_DENIED');
    assert.equal((await mcp(worker(),env,other,'read_message',{
      mailboxId:c.box,message:first.reference})).error,'ACCESS_DENIED');
  }
  assert.deepEqual([...callsA,...callsB].filter(x=>!['read','search'].includes(x)),[]);
  assert.equal((await f.store.rows('SELECT COUNT(*) AS n FROM outbox'))[0].n,0);
}

test('isolated read-only MCP pilot: two identities, consent, mocked analysis, profile approval, new chat and list-detail',
  ()=>runPilot(async input=>input.messages.filter(s=>s.text.includes('Prosím o')).map(s=>({
    sourceKey:s.key,kind:'waiting_user',summary:'Požadavek na rozhodnutí.',quote:'Prosím o',
    dueDate:null,threadKey:null}))));

test('separate opt-in pilot calls the real model on two synthetic mailboxes only',
  {skip:process.env.FORPSI_PAID_SYNTHETIC_PILOT!=='APPROVED_4_CALLS'},async()=>{
    assert.equal(process.env.FORPSI_ANALYSIS_MODEL,'gpt-5-mini');
    assert.ok(process.env.FORPSI_ANALYSIS_API_KEY);
    let calls=0;
    await runPilot(async input=>{
      if(++calls>4)throw new Error('PAID_CALL_LIMIT_REACHED');
      return openAiEvidenceAnalyzer(input,process.env);
    });
    assert.equal(calls,4);
  });
