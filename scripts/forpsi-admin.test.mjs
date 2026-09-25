import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCookie } from '../functions/_lib/auth.js';
import { forwardForpsiAdmin } from '../functions/api/forpsi/admin.js';
import { createWorker } from '../services/forpsi-connector/src/worker.mjs';
import { fixture } from '../services/forpsi-connector/test/fixtures.mjs';
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
