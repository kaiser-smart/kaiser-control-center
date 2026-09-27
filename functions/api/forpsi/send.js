import { currentUser, json } from '../../_lib/auth.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function onRequestPost({request,env}){
  if(request.headers.get('origin')!==new URL(request.url).origin ||
    request.headers.get('sec-fetch-site')==='cross-site')
    return json({error:'Nepovolený původ požadavku.',code:'ORIGIN_DENIED'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')
    return json({error:'Očekává se JSON.',code:'INVALID_ARGUMENTS'},415);
  let user;
  try{user=await currentUser(env,request,{strict:true});}
  catch{return json({error:'Aktuální přístup nelze ověřit.',code:'DIRECTORY_UNAVAILABLE'},503);}
  if(!user)return json({error:'Přihlášení vypršelo.',code:'AUTH_REQUIRED'},401);
  if(!env.FORPSI_CONNECTOR?.fetch||!env.FORPSI_ADMIN_TOKEN||env.FORPSI_ADMIN_TOKEN.length<32)
    return json({error:'Potvrzení zprávy není dostupné.',code:'SEND_UNAVAILABLE'},503);
  let command;
  try{
    const raw=await request.text();if(raw.length>4096)throw new Error();
    command=JSON.parse(raw);
    const keys=Object.keys(command??{});
    if(!uuid.test(command?.proposalId)||!['status','approve','cancel'].includes(command?.operation)||
      keys.some(key=>!['proposalId','operation','version'].includes(key))||
      (command.operation==='status'&&keys.includes('version'))||
      (command.operation!=='status'&&(!Number.isInteger(command.version)||command.version<1)))
      throw new Error();
  }catch{return json({error:'Neplatný požadavek.',code:'INVALID_ARGUMENTS'},400);}
  try{
    const response=await env.FORPSI_CONNECTOR.fetch(new Request('https://forpsi.internal/internal/send',{
      method:'POST',headers:{authorization:`Bearer ${env.FORPSI_ADMIN_TOKEN}`,
        'content-type':'application/json'},
      body:JSON.stringify({...command,actorId:user.id}),signal:AbortSignal.timeout(55000)}));
    const stillActive=await currentUser(env,request,{strict:true});
    if(stillActive?.id!==user.id)return json({error:'Přihlášení již není aktivní. Ověřte stav návrhu.',
      code:'AUTH_REQUIRED'},401);
    const result=await response.json();
    if(!response.ok)return json({error:result.error??'SEND_UNAVAILABLE',
      code:result.error??'SEND_UNAVAILABLE'},response.status);
    return json(result,200,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  }catch{return json({error:'Stav zprávy se nepodařilo ověřit.',code:'SEND_UNAVAILABLE'},503);}
}
export const onRequestGet=()=>json({error:'Nepodporovaná metoda.'},405,{Allow:'POST'});
