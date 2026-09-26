import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,mail} from './fixtures.mjs';
import {executeAdmin} from '../src/admin.mjs';
import {createWorker} from '../src/worker.mjs';
import {forwardForpsiMail} from '../../../functions/api/forpsi/mail.js';
import {forwardForpsiAdmin} from '../../../functions/api/forpsi/admin.js';
import {createSessionCookie} from '../../../functions/_lib/auth.js';
import {Forpsi} from '../src/forpsi.mjs';
import {simpleParser} from 'mailparser';
import {composerPayload,composedText,mountForpsiComposer,saveForpsiComposer,forpsiComposerDirtyTarget} from '../../../src/components/ForpsiComposer.js';

const user={id:'composition-user',role:'admin',name:'TEST admin',email:'admin@example.test',active:true,status:'active'};
async function setup(actions=['read','write']) {
  const f=fixture();Object.assign(f.env,{SOAI_MAIL_ENABLED:'true',SOAI_DRAFTS_ENABLED:'true',CONNECTOR_ENABLED:'false',FORPSI_TENANT_ID:'tenant-a',CONNECTOR_ADMIN_TOKEN:'synthetic-composition-test-token-over32'});
  const ctx={...f,tenant:'tenant-a',actorId:user.id};
  await executeAdmin('access_save',{id:'mail-a',revision:1,userId:user.id,actions},ctx);
  f.provider.saveDraft=async(message,options)=>{f.calls.push(['draft',message,options]);return {saved:true,folder:'Drafts',reference:{folder:'Drafts',uid:32,uidValidity:'5'}};};
  const worker=createWorker({providerFactory:f.providerFactory,verificationMode:'simulated'});
  const env={AUTH_MODE:'mock',AUTH_USERS_JSON:JSON.stringify([user]),FORPSI_ADMIN_TOKEN:f.env.CONNECTOR_ADMIN_TOKEN,FORPSI_CONNECTOR:{fetch:r=>worker.fetch(r,f.env)}};
  const cookie=(await createSessionCookie(env,user)).split(';')[0];
  async function request(handler,operation,payload,headers={}) {
    const r=await handler({env,request:new Request('https://so.test/api/forpsi/mail',{method:'POST',headers:{cookie,origin:'https://so.test','content-type':'application/json',...headers},body:JSON.stringify({operation,payload})})});
    return {status:r.status,body:await r.json()};
  }
  return {...f,ctx,pagesEnv:env,call:(op,p={},h)=>request(forwardForpsiMail,op,p,h),admin:(op,p={},h)=>request(forwardForpsiAdmin,op,p,h)};
}
const profile={id:'mail-a',revision:0,senderName:'Alice TEST',signatureText:'Alice\nTEST firma'};
const draft=()=>({mailboxId:'mail-a',requestId:crypto.randomUUID(),profileRevision:0,useSignature:true,message:{...mail}});

test('profile save is mailbox scoped, audited, versioned, and never pauses or changes mailbox credentials',async()=>{
  const f=await setup();const before=await f.store.first('SELECT * FROM mailboxes WHERE id=?','mail-a');
  assert.equal((await f.admin('composition_save',profile)).status,200);
  const read=await f.admin('composition_get',{id:'mail-a'});assert.equal(read.body.profile.signatureText,profile.signatureText);assert.equal(read.body.profile.revision,1);
  assert.equal((await f.admin('composition_save',{...profile,senderName:'stale'})).status,409);
  assert.equal((await f.admin('composition_save',{...profile,revision:1,senderName:''})).status,200);
  assert.equal((await f.admin('composition_get',{id:'mail-b'})).status,404);
  assert.deepEqual(await f.store.first('SELECT * FROM mailboxes WHERE id=?','mail-a'),before);
  assert.equal((await f.store.rows("SELECT * FROM audit WHERE action='admin.composition.save'")).length,2);
  assert.equal(f.calls.length,0);
});
test('signature input rejects forged sender/HTML modes/header injection and requires a current administrator',async()=>{
  const f=await setup();
  for(const p of [{...profile,senderName:'Alice\r\nBcc: other@example.test'},{...profile,from:'other@example.test'},{...profile,html:'<img src=x>'},{...profile,signatureText:'x\u0000y'}])assert.equal((await f.admin('composition_save',p)).status,400);
  assert.equal((await f.admin('composition_save',profile,{origin:'https://evil.test'})).status,403);
  f.pagesEnv.AUTH_USERS_JSON=JSON.stringify([{...user,role:'readonly'}]);assert.equal((await f.admin('composition_save',profile)).status,403);
  assert.equal((await f.store.rows('SELECT * FROM composition_profiles')).length,0);
});
test('concurrent profile writes preserve one winner and exactly one audit',async()=>{
  const f=await setup();const results=await Promise.all([f.admin('composition_save',profile),f.admin('composition_save',{...profile,senderName:'Other'})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await f.store.rows("SELECT * FROM audit WHERE action='admin.composition.save'")).length,1);
});
test('Pages -> Worker -> SQL -> draft provider applies selected signature once and uses server sender identity',async()=>{
  const f=await setup();await f.admin('composition_save',profile);
  const context=await f.call('composition_context',{mailboxId:'mail-a'});assert.equal(context.body.data.canWrite,true);assert.equal(context.body.data.address,'alice@example.com');
  const p={...draft(),profileRevision:1};const first=await f.call('create_draft',p),again=await f.call('create_draft',p);
  assert.equal(first.status,200);assert.equal(again.status,200);assert.equal(again.body.data.replayed,true);
  const call=f.calls.find(c=>c[0]==='draft');assert.equal(call[1].text,`${mail.text}\n\n-- \n${profile.signatureText}`);assert.equal(call[2].senderName,profile.senderName);
  assert.equal(f.calls.filter(c=>c[0]==='draft').length,1);assert.equal(f.calls.some(c=>c[0]==='send'),false);
  assert.equal((await f.store.rows('SELECT * FROM outbox')).length,0);
  const raw=JSON.stringify(await f.store.rows('SELECT * FROM draft_attempts'));assert.ok(!raw.includes(mail.text));assert.ok(!raw.includes(mail.to[0]));
  assert.equal((await f.call('create_draft',{...p,message:{...mail,text:'changed'}})).status,409);
  await f.admin('composition_save',{...profile,revision:1,signatureText:'changed after save'});
  assert.equal((await f.call('create_draft',p)).status,200,'successful retry does not depend on a later profile change');
});
test('concurrent identical requests invoke the provider once; pending and uncertain results never auto-retry',async()=>{
  const f=await setup();let started,finish;const ready=new Promise(r=>started=r),hold=new Promise(r=>finish=r);let calls=0;
  f.provider.saveDraft=async()=>{calls++;started();await hold;throw new Error('socket failed after APPEND; secret password');};
  const p=draft(),pending=f.call('create_draft',p);await ready;
  assert.equal((await f.call('create_draft',p)).body.code,'DRAFT_UNCERTAIN');finish();
  const result=await pending;assert.equal(result.body.code,'DRAFT_UNCERTAIN');assert.ok(!JSON.stringify(result).includes('password'));
  assert.equal((await f.call('create_draft',p)).body.code,'DRAFT_UNCERTAIN');assert.equal(calls,1);
  assert.equal((await f.store.first('SELECT state FROM draft_attempts')).state,'uncertain');
});
test('read-only grant, disabled drafts, revoked grant, foreign mailbox, forged From and stale profile cannot write',async()=>{
  const f=await setup(['read']);const p=draft();
  assert.equal((await f.call('composition_context',{mailboxId:'mail-a'})).body.data.canWrite,false);
  assert.equal((await f.call('create_draft',p)).status,403);
  f.sqlite.exec("UPDATE grants SET revoked=CASE WHEN action='write' THEN 0 ELSE 1 END WHERE principal_id LIKE 'soai_%'");
  assert.equal((await f.call('create_draft',p)).status,403,'write without read is insufficient');
  const g=await setup();g.env.SOAI_DRAFTS_ENABLED='false';assert.equal((await g.call('create_draft',p)).body.code,'SOAI_DRAFTS_DISABLED');g.env.SOAI_DRAFTS_ENABLED='true';
  assert.equal((await g.call('create_draft',{...p,mailboxId:'mail-b'})).status,403);
  assert.equal((await g.call('create_draft',{...p,message:{...mail,from:'forged@example.test'}})).status,400);
  await g.admin('composition_save',profile);assert.equal((await g.call('create_draft',p)).body.code,'PROFILE_CHANGED');
  g.sqlite.exec("UPDATE grants SET revoked=1 WHERE principal_id LIKE 'soai_%' AND action='write'");assert.equal((await g.call('create_draft',{...p,profileRevision:1})).status,403);
  assert.equal(g.calls.length,0);assert.equal((await g.store.rows('SELECT * FROM draft_attempts')).length,0);
});
test('text body size, optional signature and JSON size are enforced without leaking or sending',async()=>{
  const f=await setup();await f.admin('composition_save',profile);
  assert.equal((await f.call('create_draft',{...draft(),profileRevision:1,useSignature:false,message:{...mail,text:'č'.repeat(50000)}})).status,200);
  assert.equal(f.calls[0][1].text.length,50000);
  assert.equal((await f.call('create_draft',{...draft(),profileRevision:1,message:{...mail,text:'x'.repeat(100000)}})).status,400);
  assert.equal((await f.call('create_draft',{...draft(),message:{...mail,text:'č'.repeat(300000)}})).status,413);
  assert.equal(f.calls.length,1);
});
test('revocation or user disablement while APPEND runs suppresses success and never retries the write',async()=>{
  for(const revoke of ['grant','user']) {
    const f=await setup();let calls=0;
    f.provider.saveDraft=async()=>{calls++;
      if(revoke==='grant')f.sqlite.exec("UPDATE grants SET revoked=1 WHERE principal_id LIKE 'soai_%' AND action='write'");
      else f.pagesEnv.AUTH_USERS_JSON=JSON.stringify([{...user,active:false}]);
      return {saved:true,folder:'Drafts',reference:null};
    };
    const p=draft(),r=await f.call('create_draft',p);assert.equal(r.status,revoke==='grant'?403:401);assert.equal(r.body.data,undefined);
    const again=await f.call('create_draft',p);assert.ok([401,403].includes(again.status));assert.equal(calls,1);
    assert.equal((await f.store.first('SELECT state FROM draft_attempts')).state,'saved');
  }
});
test('draft MIME has the verified mailbox, Czech sender name, Bcc and plain text; never invokes SMTP',async()=>{
  let raw,appends=0;
  const provider=new Forpsi({MAILBOX_CREDENTIALS:JSON.stringify({key:'synthetic'})},{id:'mail-a',address:'alice@example.test',credential_key:'key'},
    {clientFactory:()=>({on(){},connect:async()=>{},close(){},list:async()=>[{path:'Drafts',specialUse:'\\Drafts'}],append:async(_folder,bytes,flags)=>{appends++;raw=bytes;assert.deepEqual(flags,['\\Draft']);return {uid:2,uidValidity:9n};}}),transportFactory:()=>{throw new Error('SMTP forbidden in draft flow');}});
  await provider.saveDraft({...mail,bcc:['hidden@example.test'],text:'Text\n\n-- \nŽluťoučký <img src=x>'},{senderName:'Žluťoučký TEST',requestId:'96f7c303-827b-47bb-93e0-e12c1f534187'});
  const parsed=await simpleParser(raw);assert.equal(parsed.from.value[0].name,'Žluťoučký TEST');assert.equal(parsed.from.value[0].address,'alice@example.test');assert.equal(parsed.bcc.value[0].address,'hidden@example.test');assert.equal(parsed.html,false);assert.equal(appends,1);assert.match(parsed.text,/<img src=x>/);
});
test('UI payload matches server signature preview and recipient separators',()=>{
  const d={requestId:crypto.randomUUID(),to:'first@example.test; second@example.test',cc:'copy@example.test',bcc:'',subject:'Subject',text:'Body',useSignature:true};
  const p=composerPayload('mail-a',d,2);assert.equal(p.message.to.length,2);assert.deepEqual(p.message.bcc,[]);assert.equal(composedText(d,{signatureText:'Signature'}),'Body\n\n-- \nSignature');
});

test('composer preserves frozen payload on unknown result, protects navigation and clears data across owners',async()=>{
  const listeners={},requests=[];
  const root={isConnected:true,innerHTML:'',addEventListener:(name,fn)=>listeners[name]=fn,querySelector:selector=>selector==='[data-composer-form]'?{reportValidity:()=>true}:null};
  const api=async(_url,{body})=>{const c=JSON.parse(body);requests.push(c);
    if(c.operation==='composition_context')return {data:{address:'safe@example.test',profile:{senderName:'<img src=x>',signatureText:'Signature',revision:1},canWrite:true,draftsEnabled:true}};
    if(requests.filter(r=>r.operation==='create_draft').length===1)throw Object.assign(new Error('Unknown outcome'),{status:503});
    return {data:{saved:true,folder:'Drafts'}};
  };
  let guarded=false;mountForpsiComposer(root,{owner:'test-owner',mailboxId:'mail-a',apiJson:api,guard:()=>{guarded=true;}});
  const click=action=>listeners.click({target:{closest:()=>({dataset:{composerAction:action}})},preventDefault(){},stopPropagation(){}});
  click('open');await new Promise(r=>setImmediate(r));assert.ok(!root.innerHTML.includes('<img src=x>'));assert.match(root.innerHTML,/&lt;img/);
  for(const [name,value] of Object.entries({to:'recipient@example.test',subject:'TEST',text:'Body'}))listeners.input({target:{name,value,type:'text',form:{matches:()=>true}}});
  click('close');assert.equal(guarded,true);assert.ok(forpsiComposerDirtyTarget());
  assert.equal(await saveForpsiComposer(),false);assert.match(root.innerHTML,/fieldset disabled/);assert.match(root.innerHTML,/Unknown outcome/);
  assert.equal(await saveForpsiComposer(),true);assert.equal(forpsiComposerDirtyTarget(),null);
  const writes=requests.filter(r=>r.operation==='create_draft');assert.deepEqual(writes[0].payload,writes[1].payload);
  mountForpsiComposer(root,{owner:'other-owner',mailboxId:'mail-a',apiJson:api,guard:()=>{}});assert.ok(!root.innerHTML.includes('safe@example.test'));assert.ok(!root.innerHTML.includes('Body'));
});
