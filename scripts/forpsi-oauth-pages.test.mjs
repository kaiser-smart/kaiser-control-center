import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCookie } from '../functions/_lib/auth.js';
import { onRequest as authorize } from '../functions/authorize.js';
import { onRequest as mcp } from '../functions/mcp.js';
import { onRequest as access } from '../functions/api/forpsi/oauth/access.js';

const origin='https://smart-odpady.ai';
const user={id:'pilot-owner',name:'Pilot Owner',email:'owner@example.test',role:'readonly',
  active:true,status:'active'};
const serviceSecret='synthetic-admin-token-for-local-tests-only';
async function setup(){
  const calls=[];
  const env={AUTH_MODE:'mock',AUTH_USERS_JSON:JSON.stringify([user]),
    FORPSI_ADMIN_TOKEN:serviceSecret,
    FORPSI_CONNECTOR:{async fetch(request){
      calls.push({url:request.url,method:request.method,headers:new Headers(request.headers),
        body:request.method==='POST'?await request.text():''});
      return new Response('upstream',{status:200,headers:{'Content-Type':'text/plain'}});
    }}};
  const cookie=(await createSessionCookie(env,user)).split(';')[0];
  return {calls,env,cookie};
}

test('SO.ai authorization page denies unauthenticated POST and never forwards it',async()=>{
  const {calls,env}=await setup();
  const response=await authorize({env,request:new Request(`${origin}/authorize`,{
    method:'POST',headers:{origin},body:'handle=abc&decision=approve'})});
  assert.equal(response.status,401);
  assert.equal(calls.length,0);
});

test('SO.ai authorization binds consent to verified session ID, omits login cookie and browser identity headers',async()=>{
  const {calls,env,cookie}=await setup();
  const response=await authorize({env,request:new Request(`${origin}/authorize`,{
    method:'POST',headers:{origin,cookie:`${cookie}; __Host-oauth-consent-xyz=bound; thirdparty=bad`,
      'x-soai-user-id':'impersonator','authorization':'Bearer attacker',
      'content-type':'application/x-www-form-urlencoded'},body:'handle=abc&decision=approve'})});
  assert.equal(response.status,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].headers.get('x-soai-user-id'),user.id);
  assert.equal(calls[0].headers.get('authorization'),`Bearer ${serviceSecret}`);
  assert.equal(calls[0].headers.get('cookie'),'__Host-oauth-consent-xyz=bound');
  assert.equal(calls[0].body,'handle=abc&decision=approve');
});

test('SO.ai authorization rejects cross-origin approval before service binding',async()=>{
  const {calls,env,cookie}=await setup();
  const response=await authorize({env,request:new Request(`${origin}/authorize`,{
    method:'POST',headers:{origin:'https://attacker.test',cookie},body:'handle=abc&decision=approve'})});
  assert.equal(response.status,403);
  assert.equal(calls.length,0);
});

test('public MCP proxy forwards only OAuth bearer and protocol headers, never SO.ai cookie or asserted user ID',async()=>{
  const {calls,env,cookie}=await setup();
  const response=await mcp({env,request:new Request(`${origin}/mcp`,{
    method:'POST',headers:{authorization:'Bearer synthetic-oauth-token',cookie,
      'x-soai-user-id':'impersonator','content-type':'application/json',
      'mcp-protocol-version':'2025-06-18'},body:'{"jsonrpc":"2.0"}'})});
  assert.equal(response.status,200);
  assert.equal(calls[0].headers.get('authorization'),'Bearer synthetic-oauth-token');
  assert.equal(calls[0].headers.get('cookie'),null);
  assert.equal(calls[0].headers.get('x-soai-user-id'),null);
  assert.equal(calls[0].headers.get('mcp-protocol-version'),'2025-06-18');
});

test('grant revocation route uses the current SO.ai actor and rejects cross-origin or missing session',async()=>{
  const {calls,env,cookie}=await setup();
  const post=(headers)=>access({env,request:new Request(`${origin}/api/forpsi/oauth/access`,{
    method:'POST',headers:{'content-type':'application/json',...headers},body:'{"grantId":"grant-1"}'})});
  assert.equal((await post({origin,cookie:''})).status,401);
  assert.equal((await post({origin:'https://attacker.test',cookie})).status,403);
  assert.equal(calls.length,0);
  assert.equal((await post({origin,cookie,'x-soai-user-id':'impersonator'})).status,200);
  assert.equal(calls[0].url,`${origin}/internal/oauth/access`);
  assert.equal(calls[0].headers.get('x-soai-user-id'),user.id);
  assert.equal(calls[0].headers.get('cookie'),null);
});
