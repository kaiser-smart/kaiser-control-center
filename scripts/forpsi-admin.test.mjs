import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCookie, getUsers } from '../functions/_lib/auth.js';
import { forwardForpsiAdmin } from '../functions/api/forpsi/admin.js';
import { createWorker } from '../services/forpsi-connector/src/worker.mjs';
import { fixture } from '../services/forpsi-connector/test/fixtures.mjs';
import { mountForpsiAdmin, forpsiDirtyTarget, discardForpsiDraft, saveForpsiDraft } from '../src/components/ForpsiAdminPanel.js';

test('panel navigation ignores unrelated forms but still protects its own unsaved draft',async()=>{
  const listeners={};
  const root={isConnected:true,innerHTML:'',addEventListener:(name,fn)=>{listeners[name]=fn;},querySelector:()=>null,querySelectorAll:()=>[]};
  let guarded=0; let pending;
  const data={mailboxes:[],grants:[],audit:[],queue:[],rules:[],labels:[],truncated:{},capabilities:{modules:[]},connectorEnabled:false,credentialStorageReady:true};
  mountForpsiAdmin({querySelector:()=>root},{owner:'panel-test-admin',apiJson:async()=>data,guard:action=>{guarded++;pending=action;}});
  await new Promise(resolve=>setImmediate(resolve));
  const click=(action,tab)=>listeners.click({target:{closest:()=>({dataset:{forpsiAction:action,tab}})},preventDefault(){},stopPropagation(){}});
  click('new');
  assert.equal(guarded,0,'a clean panel must not ask to discard another settings form');
  assert.match(root.innerHTML,/data-forpsi-form/);
  listeners.input({target:{name:'displayName',value:'Unsaved draft',form:{matches:selector=>selector==='[data-forpsi-form]'}}});
  assert.equal(forpsiDirtyTarget()?.type,'forpsi');
  click('tab','access');
  assert.equal(guarded,1);
  assert.match(root.innerHTML,/data-forpsi-form/,'draft stays visible until the user decides');
  discardForpsiDraft(); await pending();
  assert.equal(forpsiDirtyTarget(),null);
  assert.match(root.innerHTML,/<h3>Přístupy kolegů<\/h3>/);
  root.isConnected=false;
});
const admin={id:'test-admin',email:'admin@example.test',name:'TEST správce',role:'admin',active:true,status:'active'};
const user={...admin,id:'test-reader',email:'reader@example.test',role:'kancelar'};
function setup(){
  const f=fixture(); f.env.CONNECTOR_ADMIN_TOKEN='synthetic-test-admin-token-longer-than-32';f.env.FORPSI_TENANT_ID='tenant-a';f.env.CREDENTIALS_KEY=Buffer.alloc(32,12).toString('base64');
  const worker=createWorker({providerFactory:f.providerFactory});
  const env={AUTH_MODE:'mock',AUTH_USERS_JSON:JSON.stringify([admin,user]),FORPSI_ADMIN_TOKEN:f.env.CONNECTOR_ADMIN_TOKEN,
    FORPSI_CONNECTOR:{fetch:request=>worker.fetch(request,f.env)}};
  return {f,env};
}
async function req(env,person,body,origin='https://so.example.test'){
  const cookie=person?(await createSessionCookie(env,person)).split(';')[0]:'';
  return new Request('https://so.example.test/api/forpsi/admin',{method:body?'POST':'GET',headers:{cookie,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
}
test('SO.ai session and settings:manage are required before contacting connector',async()=>{
  const {env}=setup();let calls=0;env.FORPSI_CONNECTOR.fetch=()=>{calls++;throw new Error();};
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,null)})).status,401);
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,user)})).status,403);
  assert.equal(calls,0);
});

test('V2 business authority is explicit and its verified identity comes only from the current SO.ai directory',async()=>{
  const {env,f}=setup();f.env.MAIL_BRAIN_V2_ENABLED='true';
  const payload={id:'mail-a',revision:1,userId:user.id,actions:['read','write'],
    workCapabilities:['facts.review','work.manage'],verifyWorkIdentity:true};
  const injected=await forwardForpsiAdmin({env,request:await req(env,admin,{operation:'access_save',
    payload:{...payload,workIdentity:{address:'forged@example.test',label:'Forged'}}})});
  assert.equal(injected.status,400);
  assert.equal((await f.store.first('SELECT COUNT(*) n FROM brain_entities_v2')).n,0);
  const response=await forwardForpsiAdmin({env,request:await req(env,admin,{operation:'access_save',payload})});
  assert.equal(response.status,200);
  const saved=await f.store.first('SELECT * FROM brain_entities_v2');
  assert.equal(saved.address,user.email);assert.equal(saved.label,user.name);assert.equal(saved.verified_by,admin.id);
  assert.equal((await response.json()).access.entries.find(e=>e.userId===user.id).workCapabilities.length,2);
});
test('SO.ai → Worker → SQLite saves and reads actual settings through authenticated endpoints',async()=>{
  const {env,f}=setup();const request=await req(env,admin,{operation:'save',payload:{requestId:crypto.randomUUID(),address:'ui@example.test',displayName:'UI TEST',password:'test-only-password'}});
  const result=await forwardForpsiAdmin({env,request});assert.equal(result.status,200);
  const data=await result.json();assert.equal(data.mailbox.active,0);
  const audit=await f.store.first('SELECT principal_id FROM audit');assert.equal(audit.principal_id,admin.id);
  const overview=await forwardForpsiAdmin({env,request:await req(env,admin)});
  assert.equal(overview.status,200);const text=await overview.text();assert.match(text,/ui@example.test/);assert.ok(!text.includes('test-only-password'));
});
test('CSRF, browser actor forgery, disabled user and missing binding fail closed',async()=>{
  const {env}=setup();const body={operation:'verify',payload:{id:'mail-a',revision:1}};
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,admin,body,'https://evil.example')})).status,403);
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,admin,{...body,actorId:'forged'})})).status,400);
  const signed=await req(env,admin);env.AUTH_USERS_JSON=JSON.stringify([{...admin,active:false,status:'disabled'}]);
  assert.equal((await forwardForpsiAdmin({env,request:signed})).status,401);
  env.AUTH_USERS_JSON=JSON.stringify([admin]);delete env.FORPSI_CONNECTOR;
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,admin)})).status,503);
});
test('oversized payload is rejected before Worker and upstream errors do not leak secrets',async()=>{
  const {env}=setup();let calls=0;env.FORPSI_CONNECTOR.fetch=()=>{calls++;return Response.json({error:'secret-value-from-provider'},{status:500});};
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,admin,{operation:'save',payload:{password:'x'.repeat(20000)}})})).status,413);
  assert.equal(calls,0);
  const r=await forwardForpsiAdmin({env,request:await req(env,admin)});assert.ok(!(await r.text()).includes('secret-value-from-provider'));
});

test('company Mail Brain rule requires SO.ai administrator and is saved inactive or active exactly',async()=>{
  const {env,f}=setup();f.env.MAIL_BRAIN_ENABLED='true';
  const body={operation:'brain_rule_save',payload:{mailboxId:'mail-a',category:'invoice',
    action:'prioritize',enabled:true}};
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,user,body)})).status,403);
  const response=await forwardForpsiAdmin({env,request:await req(env,admin,body)});
  assert.equal(response.status,200);
  const saved=await f.store.first(`SELECT source,enabled,category FROM brain_rules WHERE tenant_id=?`,
    'tenant-a');
  assert.equal(saved.source,'company');assert.equal(saved.enabled,1);
  assert.equal(saved.category,'invoice');
});

test('SO.ai exposes resource discovery through existing session, origin and tenant boundaries',async()=>{
  const {env,f}=setup();f.env.CONNECTOR_ENABLED='false';
  const body={operation:'resources',payload:{id:'mail-a',revision:1}};
  // Prevent real DAV factories from making any network call in this isolated HTTP test.
  f.env.MAILBOX_CREDENTIALS='{}';
  const result=await forwardForpsiAdmin({env,request:await req(env,admin,body)});
  assert.equal(result.status,200);const data=await result.json();
  assert.equal(data.resources.folders.items[0].path,'INBOX');
  assert.equal(data.resources.calendars.status,'failed');
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,user,body)})).status,403);
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,admin,body,'https://evil.example')})).status,403);
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,admin,{operation:'resources',payload:{id:'mail-b',revision:1}})})).status,404);
  assert.equal(f.calls.length,0);
});

test('SO.ai fixed diagnostic command is admin-only and browser coordinates cannot reach Worker',async()=>{
  const {env,f}=setup(),calls=[];
  env.FORPSI_CONNECTOR.fetch=async request=>{
    calls.push(await request.json());
    return Response.json({success:true,downloadedBinaryAttachments:0});
  };
  const before=f.sqlite.prepare('SELECT total_changes() AS n').get().n;
  const fixed={operation:'diagnostic_uid_74324',payload:{}};
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,user,fixed)})).status,403);
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,admin,
    {operation:'resources',payload:{mailboxId:'mail-a',folder:'Sent',uid:1,uidValidity:'3'}})})).status,400);
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,admin,
    {operation:'diagnostic_uid_74324',payload:{uid:1}})})).status,400);
  assert.equal(calls.length,0);
  const result=await forwardForpsiAdmin({env,request:await req(env,admin,fixed)});
  assert.equal(result.status,200);
  assert.equal((await result.json()).downloadedBinaryAttachments,0);
  assert.deepEqual(calls,[{operation:'resources',actorId:admin.id,payload:{
    mailboxId:'mail_d4cfaf87-2357-4586-97a3-b9ec1782af8f',
    folder:'INBOX.Sent Items',uid:74324,uidValidity:'1381849700'}}]);
  assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get().n,before);
});

test('admin-only diagnostic button appears only with Worker flag and renders safe metadata',async()=>{
  const listeners={};
  const root={isConnected:true,innerHTML:'',addEventListener:(name,fn)=>{listeners[name]=fn;},querySelector:()=>null,querySelectorAll:()=>[]};
  const data={mailboxes:[],grants:[],audit:[],queue:[],rules:[],labels:[],truncated:{},
    capabilities:{modules:[]},connectorEnabled:false,credentialStorageReady:true,
    canRunBrainDiagnostic:true,brainDiagnosticEnabled:true};
  const calls=[];
  const apiJson=async(_url,options)=>{
    if(!options)return data;
    calls.push(JSON.parse(options.body));
    return {success:true,errorCode:null,subject:'<subject>',messageId:'<id>',
      rawMessageSize:3145728,textPartsFound:2,downloadedTextParts:1,downloadedBytes:40,
      textSource:'plain',attachments:[{filename:'<invoice.pdf>',contentType:'application/pdf',size:2500000}],
      downloadedBinaryAttachments:0,body:'private-body',token:'private-token'};
  };
  mountForpsiAdmin({querySelector:()=>root},{owner:'diagnostic-ui-owner',apiJson,guard:action=>action()});
  await new Promise(resolve=>setImmediate(resolve));
  const click=action=>listeners.click({target:{closest:()=>({dataset:{forpsiAction:action,tab:'settings'}})},preventDefault(){},stopPropagation(){}});
  click('tab');await new Promise(resolve=>setImmediate(resolve));
  assert.match(root.innerHTML,/Ověřit selective MIME – UID 74324/);
  click('brain-diagnostic');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,[{operation:'diagnostic_uid_74324',payload:{}}]);
  assert.match(root.innerHTML,/3145728/);
  assert.match(root.innerHTML,/&lt;invoice.pdf&gt;/);
  assert.ok(!root.innerHTML.includes('private-body')&&!root.innerHTML.includes('private-token'));
  data.canRunBrainDiagnostic=false;click('tab');await new Promise(resolve=>setImmediate(resolve));
  assert.ok(!root.innerHTML.includes('Ověřit selective MIME – UID 74324'));
  data.canRunBrainDiagnostic=true;data.brainDiagnosticEnabled=false;click('tab');await new Promise(resolve=>setImmediate(resolve));
  assert.ok(!root.innerHTML.includes('Ověřit selective MIME – UID 74324'));
  root.isConnected=false;
});

test('loading resources preserves the dirty form, excludes parent folders and isolates owner changes',async()=>{
  const listeners={};
  const root={isConnected:true,innerHTML:'',addEventListener:(name,fn)=>{listeners[name]=fn;},querySelector:()=>null,querySelectorAll:()=>[]};
  const data={mailboxes:[{id:'ui-mail',revision:1,address:'test@example.test',display_name:'Test'}],grants:[],audit:[],queue:[],rules:[],labels:[],truncated:{},capabilities:{modules:[]},connectorEnabled:false,credentialStorageReady:true};
  let guarded=0; let pending;
  const apiJson=async(_url,options)=>options?new Promise(resolve=>pending=resolve):data;
  mountForpsiAdmin({querySelector:()=>root},{owner:'resources-ui-owner',apiJson,guard:()=>guarded++});
  await new Promise(resolve=>setImmediate(resolve));
  const click=action=>listeners.click({target:{closest:()=>({dataset:{forpsiAction:action,id:'ui-mail'}})},preventDefault(){},stopPropagation(){}});
  click('edit');listeners.input({target:{name:'displayName',value:'Unsaved <name>',form:{matches:selector=>selector==='[data-forpsi-form]'}}});click('resources');
  assert.equal(guarded,0);
  pending({resources:{mailboxId:'ui-mail',revision:1,folders:{status:'available',items:[{path:'Parent',selectable:false},{path:'<Safe>',selectable:true}]},calendars:{status:'empty',items:[]},addressBooks:{status:'empty',items:[]}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(root.innerHTML,/value="Unsaved &lt;name&gt;"/);assert.equal(forpsiDirtyTarget()?.type,'forpsi');
  assert.ok(!root.innerHTML.includes('<option value="Parent"'));assert.ok(root.innerHTML.includes('<option value="&lt;Safe&gt;"'));
  click('resources');const oldPending=pending;
  mountForpsiAdmin({querySelector:()=>root},{owner:'different-owner',apiJson:async()=>({...data,mailboxes:[]}),guard:()=>guarded++});
  oldPending({resources:{mailboxId:'ui-mail',revision:1,folders:{items:[{path:'private-leak'}]}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(!root.innerHTML.includes('private-leak'));assert.ok(!root.innerHTML.includes('Unsaved'));assert.equal(forpsiDirtyTarget(),null);
  root.isConnected=false;
});

test('access administration validates canonical active users and never trusts email or target permissions from browser',async()=>{
  const {env,f}=setup();
  const send=async body=>forwardForpsiAdmin({env,request:await req(env,admin,body)});
  const body={operation:'access_save',payload:{id:'mail-a',revision:1,userId:user.id,actions:['read','write']}};
  let r=await send(body);assert.equal(r.status,200);let result=await r.json();
  assert.equal(result.access.revision,2);assert.equal(result.canManageAccess,true);
  assert.ok(result.users.some(u=>u.id===user.id));assert.ok(result.users.every(u=>!Object.hasOwn(u,'phone')&&!Object.hasOwn(u,'permissions')));
  const actor=await f.store.identity('urn:smart-odpady:session',user.id);assert.ok(actor);
  assert.equal((await send({...body,payload:{...body.payload,revision:2,userId:'nonexistent'}})).status,409);
  assert.equal((await send({...body,payload:{...body.payload,revision:2,email:admin.email}})).status,400);
  env.AUTH_USERS_JSON=JSON.stringify([admin,{...user,active:false,status:'disabled'}]);
  assert.equal((await send({...body,payload:{...body.payload,revision:2}})).status,409);
  r=await send({...body,payload:{...body.payload,revision:2,actions:[]}});assert.equal(r.status,200);
  await assert.rejects(f.store.access({id:actor.id,scopes:['forpsi:read']},'mail-a','read'),/ACCESS_DENIED/);
  assert.equal(f.calls.length,0);
});
test('access administration requires user permissions as well as settings and fails closed on directory outage',async()=>{
  const {env}=setup();const restricted={...user,permissions:['settings:manage'],role:'readonly'};
  env.AUTH_USERS_JSON=JSON.stringify([admin,restricted]);
  const body={operation:'access_list',payload:{id:'mail-a'}};
  assert.equal((await forwardForpsiAdmin({env,request:await req(env,restricted,body)})).status,403);
  const signed=await req(env,admin,body);let calls=0;
  env.FORPSI_CONNECTOR.fetch=()=>{calls++;throw new Error();};
  env.DB_CORE={prepare:()=>({all:async()=>{throw new Error('synthetic outage');}})};
  const result=await forwardForpsiAdmin({env,request:signed});assert.equal(result.status,503);
  assert.equal((await result.json()).code,'DIRECTORY_UNAVAILABLE');assert.equal(calls,0);
  await assert.rejects(getUsers({APP_ENV:'production'},{strict:true}),/Databáze uživatelů/);
  await assert.rejects(getUsers({AUTH_USERS_JSON:'not json'},{strict:true}));
});
test('access form uses isolated API and SQL; guards changes, preserves failed save, clears rights and reads back',async()=>{
  const {env}=setup();
  const listeners={};let pendingGuard;
  const root={isConnected:true,innerHTML:'',addEventListener:(name,fn)=>{listeners[name]=fn;},querySelector:()=>null,querySelectorAll:()=>[]};
  let failSave=false;
  const apiJson=async(_url,options)=>{
    const body=options?JSON.parse(options.body):undefined;
    if(failSave && body?.operation==='access_save') throw new Error('TEST unavailable');
    const r=await forwardForpsiAdmin({env,request:await req(env,admin,body)});const data=await r.json();
    if(!r.ok)throw new Error(data.error);return data;
  };
  const waitForText=async text=>{const end=Date.now()+3000;while(!root.innerHTML.includes(text) && Date.now()<end) await new Promise(resolve=>setTimeout(resolve,10));assert.ok(root.innerHTML.includes(text));};
  mountForpsiAdmin({querySelector:()=>root},{owner:'access-ui-owner',apiJson,guard:action=>{pendingGuard=action;}});
  await waitForText('Přidat schránku');
  const click=(action,more={})=>listeners.click({target:{closest:()=>({dataset:{forpsiAction:action,...more}})},preventDefault(){},stopPropagation(){}});
  click('tab',{tab:'access'});click('access-load',{id:'mail-a'});await waitForText('Vyberte kolegu');
  assert.match(root.innerHTML,/Vyberte kolegu/);
  listeners.change({target:{matches:()=>true,value:user.id}});
  const change=action=>listeners.change({target:{matches:()=>false,dataset:{forpsiPermission:action},checked:true}});
  change('read');assert.equal(forpsiDirtyTarget()?.type,'forpsi');
  click('tab',{tab:'mailboxes'});assert.ok(pendingGuard);assert.match(root.innerHTML,/Práva pro vybranou schránku/);
  failSave=true;assert.equal(await saveForpsiDraft(),false);assert.match(root.innerHTML,/TEST unavailable/);assert.equal(forpsiDirtyTarget()?.type,'forpsi');
  failSave=false;assert.equal(await saveForpsiDraft(),true);assert.equal(forpsiDirtyTarget(),null);assert.match(root.innerHTML,/uložená a znovu načtená/);
  click('access-edit',{userId:user.id});click('access-clear');assert.equal(await saveForpsiDraft(),true);
  assert.match(root.innerHTML,/Všechna oprávnění odebrána/);
  root.isConnected=false;
});
