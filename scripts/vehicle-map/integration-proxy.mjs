// Isolated preview transport: existing backend authorization remains authoritative.
export const UPSTREAM='https://smart-odpady.ai';
export const READ_PATHS=new Set(['/api/me','/api/theme-settings','/api/vehicle-tracking/status','/api/vehicle-tracking/maps-config','/api/vehicle-tracking/preferences','/api/vehicle-tracking/history']);
export const AUTH_PATHS=new Set(['/api/auth/start','/api/auth/verify','/api/auth/logout']);
export function permitted(request,origin){
 const u=new URL(request.url);
 if(request.headers.get('sec-fetch-site')==='cross-site')return false;
 if(!READ_PATHS.has(u.pathname)&&!AUTH_PATHS.has(u.pathname))return false;
 if(request.method==='GET')return READ_PATHS.has(u.pathname);
 return request.method==='POST'&&AUTH_PATHS.has(u.pathname)&&request.headers.get('origin')===origin&&(u.pathname==='/api/auth/logout'||request.headers.get('content-type')?.startsWith('application/json'));
}
export async function relay(request,upstreamFetch=fetch){
 const u=new URL(request.url);const headers=new Headers({Accept:'application/json'});
 // Forward only this browser's application session, never Access/admin/browser cookies.
 const cookie=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-smart_odpady_session='));
 if(cookie)headers.set('Cookie',cookie);
 let body;
 if(request.method==='POST'){
  body=await request.text();if(new TextEncoder().encode(body).byteLength>4096)return Response.json({error:'Request too large'},{status:413});
  headers.set('Content-Type','application/json');
 }
 try{
  const r=await upstreamFetch(UPSTREAM+u.pathname+u.search,{method:request.method,headers,body,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(25000)});
  if(r.status>=300&&r.status<400||!r.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Backend neposkytl ověřenou JSON odpověď.'},{status:502});
  const h=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  for(const value of r.headers.getSetCookie?.()||[]){
   if(value.startsWith('__Host-smart_odpady_session=')&&/;\s*Secure/i.test(value)&&/;\s*HttpOnly/i.test(value)&&!/(?:^|;)\s*Domain=/i.test(value))h.append('Set-Cookie',value);
  }
  return new Response(r.body,{status:r.status,headers:h});
 }catch{return Response.json({error:'Spojení se současným backendem se nezdařilo.'},{status:503});}
}
