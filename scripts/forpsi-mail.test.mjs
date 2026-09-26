import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,ref } from '../services/forpsi-connector/test/fixtures.mjs';
import { executeAdmin } from '../services/forpsi-connector/src/admin.mjs';
import { createWorker } from '../services/forpsi-connector/src/worker.mjs';
import { forwardForpsiMail } from '../functions/api/forpsi/mail.js';
import { createSessionCookie } from '../functions/_lib/auth.js';
import { mailSearchPayload,mountForpsiMail } from '../src/components/ForpsiMailPanel.js';

const user={id:'mail-reader',name:'TEST reader',email:'reader@example.test',role:'readonly',active:true,status:'active'};
async function setup(){
  const f=fixture();Object.assign(f.env,{SOAI_MAIL_ENABLED:'true',CONNECTOR_ENABLED:'false',FORPSI_TENANT_ID:'tenant-a',CONNECTOR_ADMIN_TOKEN:'synthetic-mail-service-token-longer-than32'});
  await executeAdmin('access_save',{id:'mail-a',revision:1,userId:user.id,actions:['read']},{...f,tenant:'tenant-a',actorId:'admin'});
  const worker=createWorker({providerFactory:f.providerFactory,verificationMode:'simulated'});
  const env={AUTH_MODE:'mock',AUTH_USERS_JSON:JSON.stringify([user]),FORPSI_ADMIN_TOKEN:f.env.CONNECTOR_ADMIN_TOKEN,FORPSI_CONNECTOR:{fetch:r=>worker.fetch(r,f.env)}};
  const cookie=(await createSessionCookie(env,user)).split(';')[0];
  const request=(body,headers={})=>new Request('https://so.test/api/forpsi/mail',{method:'POST',headers:{cookie,origin:'https://so.test','content-type':'application/json',...headers},body:JSON.stringify(body)});
  const call=(operation,payload={},headers)=>forwardForpsiMail({env,request:request({operation,payload},headers)});
  return {...f,env,worker,workerEnv:f.env,call,request};
}
test('active SO.ai reader without admin rights reads only a granted mailbox through Pages, Worker and SQL',async()=>{
  const f=await setup();const r=await f.call('list_mailboxes');assert.equal(r.status,200);
  assert.deepEqual((await r.json()).data.mailboxes,[{id:'mail-a',address:'alice@example.com'}]);
  assert.equal((await f.call('list_folders',{mailboxId:'mail-a'})).status,200);
  assert.equal((await f.call('read_message',{mailboxId:'mail-a',message:ref})).status,200);
  assert.equal((await f.call('read_message',{mailboxId:'mail-b',message:ref})).status,403);
  assert.equal(f.calls.filter(c=>c[0]==='read').length,1);
  assert.equal((await f.worker.fetch(new Request('https://worker.test/mcp'),f.workerEnv)).status,503);
});
test('session, same-origin, service authentication and strict input reject bypasses before provider',async()=>{
  const f=await setup();
  assert.equal((await f.call('list_mailboxes',{}, {cookie:''})).status,401);
  assert.equal((await f.call('list_mailboxes',{}, {origin:'https://evil.test'})).status,403);
  assert.equal((await f.call('send_message',{mailboxId:'mail-a'})).status,400);
  assert.equal((await forwardForpsiMail({env:f.env,request:f.request({operation:'list_mailboxes',payload:{},actorId:'alice'})})).status,400);
  assert.equal((await f.call('list_mailboxes',{subject:'alice'})).status,400);
  assert.equal((await f.call('search_messages',{mailboxId:'mail-a',text:'x'.repeat(17000)})).status,413);
  f.env.FORPSI_ADMIN_TOKEN='different-service-token-more-than-32-characters';
  assert.equal((await f.call('list_mailboxes')).status,401);assert.equal(f.calls.length,0);
});
test('missing grants, pause, disabled identity, kill switch and tenant collision fail closed',async()=>{
  const f=await setup();
  f.sqlite.exec("UPDATE grants SET revoked=1 WHERE principal_id LIKE 'soai_%'");
  assert.deepEqual((await (await f.call('list_mailboxes')).json()).data.mailboxes,[]);
  assert.equal((await f.call('read_message',{mailboxId:'mail-a',message:ref})).status,403);
  f.sqlite.exec("UPDATE grants SET revoked=0 WHERE principal_id LIKE 'soai_%';UPDATE mailboxes SET active=0 WHERE id='mail-a'");
  assert.equal((await f.call('read_message',{mailboxId:'mail-a',message:ref})).status,403);
  f.sqlite.exec("UPDATE mailboxes SET active=1 WHERE id='mail-a';UPDATE principals SET active=0 WHERE id LIKE 'soai_%'");
  assert.deepEqual((await (await f.call('list_mailboxes')).json()).data.mailboxes,[]);
  assert.equal((await f.call('read_message',{mailboxId:'mail-a',message:ref})).status,403);
  f.sqlite.exec("UPDATE principals SET active=1 WHERE id LIKE 'soai_%'");
  f.sqlite.exec("UPDATE principals SET tenant_id='tenant-b' WHERE id LIKE 'soai_%'");
  assert.equal((await f.call('list_mailboxes')).status,403);
  f.workerEnv.SOAI_MAIL_ENABLED='false';assert.equal((await f.call('list_mailboxes')).status,503);
  assert.equal(f.calls.length,0);
});
test('disablement or revocation while provider is reading suppresses returned content',async()=>{
  const f=await setup();f.provider.read=async()=>{f.env.AUTH_USERS_JSON=JSON.stringify([{...user,active:false}]);return {text:'private-content'};};
  let r=await f.call('read_message',{mailboxId:'mail-a',message:ref});assert.equal(r.status,401);assert.ok(!(await r.text()).includes('private-content'));
  f.env.AUTH_USERS_JSON=JSON.stringify([user]);f.provider.read=async()=>{f.sqlite.exec("UPDATE grants SET revoked=1 WHERE principal_id LIKE 'soai_%'");return {text:'private-content'};};
  r=await f.call('read_message',{mailboxId:'mail-a',message:ref});assert.equal(r.status,403);assert.ok(!(await r.text()).includes('private-content'));
});
test('directory outage, provider secrets and mismatched date ranges never release content',async()=>{
  const f=await setup();f.env.DB_CORE={prepare:()=>({all:async()=>{throw new Error('directory failed');}})};
  assert.equal((await f.call('list_mailboxes')).status,503);delete f.env.DB_CORE;
  f.provider.read=async()=>{throw new Error('secret-password IMAP response');};
  const r=await f.call('read_message',{mailboxId:'mail-a',message:ref});assert.equal(r.status,503);assert.ok(!(await r.text()).includes('secret-password'));
  assert.equal((await f.call('search_messages',{mailboxId:'mail-a',since:'2026-09-03',before:'2026-09-02'})).status,400);
});
test('date filter includes the selected final day across DST, month and year boundaries',()=>{
  for(const [through,before] of [['2026-09-02','2026-09-03'],['2026-10-25','2026-10-26'],['2026-12-31','2027-01-01']])assert.equal(mailSearchPayload('mail-a',{folder:'INBOX',through}).before,before);
});
test('mail panel escapes content and drops pending results after leaving or switching user',async()=>{
  const listeners={};const root={isConnected:true,innerHTML:'',addEventListener:(n,fn)=>{listeners[n]=fn;},querySelector:()=>null};
  let pending;const api=async()=>new Promise(resolve=>pending=resolve);
  mountForpsiMail({querySelector:()=>root},{apiJson:api,owner:'first'});
  mountForpsiMail({querySelector:()=>null},{apiJson:api,owner:'first'});
  pending({mode:'provider',data:{mailboxes:[{id:'secret',address:'private@example.test'}]}});await new Promise(r=>setImmediate(r));
  mountForpsiMail({querySelector:()=>root},{apiJson:async()=>({mode:'simulated',data:{mailboxes:[{id:'safe',address:'<img src=x onerror=alert(1)>'}]}}),owner:'second'});
  await new Promise(r=>setImmediate(r));assert.ok(!root.innerHTML.includes('private@example.test'));assert.ok(!root.innerHTML.includes('<img src=x'));assert.ok(root.innerHTML.includes('&lt;img'));
  mountForpsiMail({querySelector:()=>null},{apiJson:api,owner:null});
});
test('mail panel offers a preserved-original copy when REPLACE is unavailable',async()=>{
  const listeners={};const root={isConnected:true,innerHTML:'',addEventListener:(n,fn)=>listeners[n]=fn,querySelector:()=>null};
  const reference={folder:'Drafts',uid:32,uidValidity:'5'};
  const api=async(_url,{body})=>{const {operation}=JSON.parse(body);
    if(operation==='list_mailboxes')return {mode:'simulated',data:{mailboxes:[{id:'mail-a',address:'alice@example.test'}]}};
    if(operation==='list_folders')return {mode:'simulated',data:{folders:[{path:'Drafts',selectable:true}],draftFolder:'Drafts',supportsReplace:false,draftEditsEnabled:false,draftCopiesEnabled:true,draftWriteAllowed:true}};
    if(operation==='search_messages')return {mode:'simulated',data:{messages:[{reference,subject:'TEST',from:[{address:'alice@example.test'}],date:null,flags:['\\Draft']}],nextBeforeUid:null}};
    if(operation==='read_message')return {mode:'simulated',data:{reference,subject:'TEST',from:[{address:'alice@example.test'}],date:null,flags:['\\Draft'],text:'Body',attachments:[]}};
    throw Error('unexpected operation');
  };
  const tick=()=>new Promise(r=>setImmediate(r));
  mountForpsiMail({querySelector:()=>root},{apiJson:api,owner:'copy-ui',guard:action=>action()});await tick();
  listeners.change({target:{matches:selector=>selector==='[data-mail-mailbox]',value:'mail-a'}});await tick();
  assert.match(root.innerHTML,/Upravenou kopii textového konceptu lze uložit/);
  listeners.submit({target:{matches:selector=>selector==='[data-mail-search]'},preventDefault(){},stopPropagation(){}});await tick();
  listeners.click({target:{closest:()=>({dataset:{mailAction:'read',index:'0'}})},preventDefault(){},stopPropagation(){}});await tick();
  assert.match(root.innerHTML,/Vytvořit upravenou kopii/);
  assert.ok(!root.innerHTML.includes('data-mail-action="edit-draft"'));
  mountForpsiMail({querySelector:()=>null},{apiJson:api,owner:null});
});
