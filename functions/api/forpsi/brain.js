import { currentUser, json } from '../../_lib/auth.js';

const allowed=new Set(['consent','revoke','sync','attention','case_get','search','case_action',
  'rules','rule_activate','draft_create','message_send','attachment_get']);
export async function onRequestPost({request,env}) {
  if(request.headers.get('origin')!==new URL(request.url).origin ||
    request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Nepovolený původ požadavku.'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'Očekává se JSON.'},415);
  let user;
  try{user=await currentUser(env,request,{strict:true});}
  catch{return json({error:'Aktuální přístup nelze ověřit.',code:'DIRECTORY_UNAVAILABLE'},503);}
  if(!user)return json({error:'Přihlášení vypršelo.',code:'AUTH_REQUIRED'},401);
  if(!env.FORPSI_CONNECTOR?.fetch||!env.FORPSI_ADMIN_TOKEN||env.FORPSI_ADMIN_TOKEN.length<32)
    return json({error:'Mail Brain není dostupný.',code:'MAIL_BRAIN_DISABLED'},503);
  let command;
  try{const raw=await request.text();if(raw.length>32768)throw new Error();
    command=JSON.parse(raw);
    if(!command||!allowed.has(command.operation)||!command.payload||
      typeof command.payload!=='object'||Array.isArray(command.payload)||
      Object.keys(command).some(key=>!['operation','payload'].includes(key)))throw new Error();
  }catch{return json({error:'Neplatný požadavek.',code:'INVALID_ARGUMENTS'},400);}
  try{
    const response=await env.FORPSI_CONNECTOR.fetch(new Request('https://forpsi.internal/internal/brain',{
      method:'POST',headers:{authorization:`Bearer ${env.FORPSI_ADMIN_TOKEN}`,'content-type':'application/json'},
      body:JSON.stringify({...command,actorId:user.id}),signal:AbortSignal.timeout(55000)}));
    const stillActive=await currentUser(env,request,{strict:true});
    if(stillActive?.id!==user.id)return json({error:'Přístup už není aktivní.',code:'AUTH_REQUIRED'},401);
    const result=await response.json();
    if(!response.ok)return json({error:result.error??'MAIL_BRAIN_UNAVAILABLE',code:result.error??'MAIL_BRAIN_UNAVAILABLE'},response.status);
    return json(result,200,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  }catch{return json({error:'Mail Brain teď není dostupný.',code:'MAIL_BRAIN_UNAVAILABLE'},503);}
}
export const onRequestGet=()=>json({error:'Nepodporovaná metoda.'},405,{Allow:'POST'});
