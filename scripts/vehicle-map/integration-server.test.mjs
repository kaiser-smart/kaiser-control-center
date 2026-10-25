import assert from 'node:assert/strict';
import{permitted,relay,UPSTREAM}from'./integration-server.mjs';
const origin='http://127.0.0.1:5173';
assert(permitted(new Request(origin+'/api/me'),origin));
assert(!permitted(new Request(origin+'/api/fleet/vehicles'),origin));
assert(!permitted(new Request(origin+'/api/vehicle-tracking/preferences',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}),origin));
assert(!permitted(new Request(origin+'/api/auth/start',{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{}'}),origin));
assert(!permitted(new Request(origin+'/api/me',{headers:{'sec-fetch-site':'cross-site'}}),origin));
assert(permitted(new Request(origin+'/api/auth/logout',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}),origin));
assert(permitted(new Request(origin+'/api/auth/logout',{method:'POST',headers:{origin}}),origin));
let seen;const fake=async(url,options)=>{seen={url,options};return Response.json({error:'unauthorized'},{status:401,headers:{'Set-Cookie':'__Host-smart_odpady_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0'}});};
const result=await relay(new Request(origin+'/api/me',{headers:{cookie:'CF_Authorization=private; unrelated=hidden; __Host-smart_odpady_session=test-session'}}),fake);
assert.equal(seen.url,UPSTREAM+'/api/me');assert.equal(seen.options.headers.get('cookie'),'__Host-smart_odpady_session=test-session');assert.equal(result.status,401);assert.match(result.headers.get('set-cookie'),/Secure; HttpOnly/);assert.equal(result.headers.get('cache-control'),'no-store');
const failure=await relay(new Request(origin+'/api/vehicle-tracking/status'),async()=>{throw Error('network');});assert.equal(failure.status,503);assert(!JSON.stringify(await failure.json()).includes('vehicles'));
const redirect=await relay(new Request(origin+'/api/me'),async()=>new Response(null,{status:302,headers:{location:'https://another.example'}}));assert.equal(redirect.status,502);
const forgedCookie=await relay(new Request(origin+'/api/me'),async()=>Response.json({ok:true},{headers:{'Set-Cookie':'__Host-smart_odpady_session=bad; Domain=example.com; Secure; HttpOnly'}}));assert.equal(forgedCookie.headers.get('set-cookie'),null);
console.log('PASS: exact endpoint/method/origin allowlist; backend 401 and secure cookies preserved; unrelated cookies withheld; failure stays 503 without model data; redirects rejected.');
const worker=(await import('./integration-worker.mjs')).default;
const preview='https://vehicle-map-v13.kaiser-control-center.pages.dev';
assert.equal((await worker.fetch(new Request('https://smart-odpady.ai/'),{})).status,403);
assert.equal((await worker.fetch(new Request(preview+'/api/fleet/vehicles',{method:'POST'}),{})).status,403);
assert.equal((await worker.fetch(new Request(preview+'/scripts/vehicle-map/fixtures.mjs'),{})).status,404);
const pagesAssets={fetch:async r=>{
  const path=new URL(r.url).pathname;
  if(path==='/index.html') return Response.redirect(preview+'/',308);
  if(path==='/') return new Response('protected app');
  if(path==='/logo-kaiser.png') return new Response('logo');
  return new Response('missing',{status:404});
}};
for(const path of ['/', '/sledovani-vozidel']) {
  const asset=await worker.fetch(new Request(preview+path),{ASSETS:pagesAssets});
  assert.equal(asset.status,200,'Pages canonicalization must not create a redirect loop');
  assert.equal(asset.headers.get('location'),null);
  assert.equal(await asset.text(),'protected app');
  assert.equal(asset.headers.get('cache-control'),'no-store');
}
assert.equal((await worker.fetch(new Request(preview+'/logo-kaiser.png'),{ASSETS:pagesAssets})).status,200);
console.log('PASS: remote worker restricted to exact preview alias; production host, business writes and test fixtures denied; static app no-store.');
