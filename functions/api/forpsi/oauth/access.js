import { currentUser, json } from '../../../_lib/auth.js';
import { proxyForpsiOAuth } from '../../../_lib/forpsi-oauth-proxy.js';

export async function onRequest({request,env}){
  if(!['GET','POST'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
  if(request.method==='POST'&&
    (request.headers.get('origin')!==new URL(request.url).origin||
      request.headers.get('sec-fetch-site')==='cross-site'))return json({error:'ORIGIN_DENIED'},403);
  let user;
  try{user=await currentUser(env,request,{strict:true});}
  catch{return json({error:'DIRECTORY_UNAVAILABLE'},503);}
  if(!user)return json({error:'AUTH_REQUIRED'},401);
  const target=new URL('https://smart-odpady.ai/internal/oauth/access');
  const headers=new Headers(request.headers);
  headers.delete('cookie');
  const forwarding=new Request(target,{method:request.method,headers,
    ...(request.method==='POST'?{body:request.body,duplex:'half'}:{})});
  return proxyForpsiOAuth(forwarding,env,{userId:user.id});
}
