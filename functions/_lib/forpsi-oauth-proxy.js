import { json } from './auth.js';

const FORWARDED_HEADERS=['authorization','accept','content-type','mcp-protocol-version','mcp-session-id','origin'];
const unavailable=(stage,userId)=>json({error:'Připojení Forpsi není dostupné.',
  ...(userId?{diagnostic_stage:stage}:{})},503);

export async function proxyForpsiOAuth(request,env,{userId=null,consentCookie=false}={}){
  if(!env.FORPSI_CONNECTOR?.fetch)return unavailable('missing_service_binding',userId);
  const headers=new Headers();
  for(const name of FORWARDED_HEADERS){
    const value=request.headers.get(name);
    if(value)headers.set(name,value);
  }
  if(userId){
    if(!env.FORPSI_ADMIN_TOKEN||env.FORPSI_ADMIN_TOKEN.length<32)
      return unavailable('missing_service_token',userId);
    headers.set('authorization',`Bearer ${env.FORPSI_ADMIN_TOKEN}`);
    headers.set('x-soai-user-id',userId);
  }
  if(consentCookie){
    const cookies=(request.headers.get('cookie')??'').split(';').map(x=>x.trim())
      .filter(x=>x.startsWith('__Host-oauth-consent-'));
    if(cookies.length)headers.set('cookie',cookies.join('; '));
  }
  const url=new URL(request.url);
  if(url.origin!=='https://smart-odpady.ai')return json({error:'Nepovolený původ.'},403);
  let stage='forward_request';
  try{
    const forwarded=new Request(url.href,{method:request.method,headers,
      ...(request.method==='GET'||request.method==='HEAD'?{}:{body:request.body,duplex:'half'})});
    stage='service_binding';
    const response=await env.FORPSI_CONNECTOR.fetch(forwarded);
    stage='upstream_response';
    const responseHeaders=new Headers(response.headers);
    responseHeaders.set('Cache-Control','no-store');
    responseHeaders.set('X-Content-Type-Options','nosniff');
    return new Response(response.body,{status:response.status,headers:responseHeaders});
  }catch{
    // A fixed stage is sufficient for diagnosis; OAuth URLs, tokens and mailbox
    // contents must never be written to regular application logs.
    console.error('forpsi.oauth_proxy_failure',{stage});
    return unavailable(stage,userId);
  }
}
