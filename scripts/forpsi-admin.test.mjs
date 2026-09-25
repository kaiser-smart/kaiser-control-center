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
  listeners.input({target:{name:'displayName',value:'Unsaved draft',form:{matches:()=>true}}});
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

test('loading resources preserves the dirty form, excludes parent folders and isolates owner changes',async()=>{
  const listeners={};
  const root={isConnected:true,innerHTML:'',addEventListener:(name,fn)=>{listeners[name]=fn;},querySelector:()=>null,querySelectorAll:()=>[]};
  const data={mailboxes:[{id:'ui-mail',revision:1,address:'test@example.test',display_name:'Test'}],grants:[],audit:[],queue:[],rules:[],labels:[],truncated:{},capabilities:{modules:[]},connectorEnabled:false,credentialStorageReady:true};
  let guarded=0; let pending;
  const apiJson=async(_url,options)=>options?new Promise(resolve=>pending=resolve):data;
  mountForpsiAdmin({querySelector:()=>root},{owner:'resources-ui-owner',apiJson,guard:()=>guarded++});
  await new Promise(resolve=>setImmediate(resolve));
  const click=action=>listeners.click({target:{closest:()=>({dataset:{forpsiAction:action,id:'ui-mail'}})},preventDefault(){},stopPropagation(){}});
  click('edit');listeners.input({target:{name:'displayName',value:'Unsaved <name>',form:{matches:()=>true}}});click('resources');
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
