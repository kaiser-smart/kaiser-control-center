import { currentUser, json } from '../../_lib/auth.js';

const mailboxId=value=>typeof value==='string'&&value.length>0&&value.length<=128;
const integer=value=>Number.isInteger(value)&&value>=0;
const operations=new Set(['status','save_signature','remove_signature','save_style',
  'approve_shortcut','remove_shortcut']);

export async function onRequestPost({request,env}){
  if(request.headers.get('origin')!==new URL(request.url).origin||
    request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Nepovolený původ požadavku.'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')
    return json({error:'Očekává se JSON.'},415);
  let user;
  try{user=await currentUser(env,request,{strict:true});}
  catch{return json({error:'Aktuální přístup nelze ověřit.',code:'DIRECTORY_UNAVAILABLE'},503);}
  if(!user)return json({error:'Přihlášení vypršelo.',code:'AUTH_REQUIRED'},401);
  if(!env.FORPSI_CONNECTOR?.fetch||!env.FORPSI_ADMIN_TOKEN||env.FORPSI_ADMIN_TOKEN.length<32)
    return json({error:'Osobní nastavení není dostupné.',code:'SETTINGS_UNAVAILABLE'},503);
  let command;
  try{
    const raw=await request.text();if(raw.length>8192)throw new Error();
    command=JSON.parse(raw);if(!operations.has(command?.operation)||
      Object.keys(command).some(key=>!['operation','mailboxId','expectedRevision','expectedProfileVersion',
        'fullText','shortText','replyStyle','shortcutId','version'].includes(key)))throw new Error();
    if(command.operation==='status'&&Object.keys(command).length!==1)throw new Error();
    if(command.operation!=='status'&&!mailboxId(command.mailboxId))throw new Error();
    if(command.operation==='save_signature'&&(!integer(command.expectedRevision)||
      typeof command.fullText!=='string'||typeof command.shortText!=='string'))throw new Error();
    if(command.operation==='remove_signature'&&!integer(command.expectedRevision))throw new Error();
    if(command.operation==='save_style'&&(!integer(command.expectedProfileVersion)||
      !['concise','friendly','formal'].includes(command.replyStyle)))throw new Error();
    if(['approve_shortcut','remove_shortcut'].includes(command.operation)&&
      (typeof command.shortcutId!=='string'||command.shortcutId.length>60||
      !integer(command.version)||command.version<1))throw new Error();
  }catch{return json({error:'Neplatný požadavek.',code:'INVALID_ARGUMENTS'},400);}
  try{
    const response=await env.FORPSI_CONNECTOR.fetch(new Request('https://forpsi.internal/internal/personal-settings',{
      method:'POST',headers:{authorization:`Bearer ${env.FORPSI_ADMIN_TOKEN}`,'content-type':'application/json'},
      body:JSON.stringify({...command,actorId:user.id}),signal:AbortSignal.timeout(55000)}));
    const stillActive=await currentUser(env,request,{strict:true});
    if(stillActive?.id!==user.id)return json({error:'Přístup již není aktivní.',code:'AUTH_REQUIRED'},401);
    const result=await response.json();
    if(!response.ok)return json({error:result.error??'SETTINGS_UNAVAILABLE',
      code:result.error??'SETTINGS_UNAVAILABLE'},response.status);
    return json(result,200,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  }catch{return json({error:'Nastavení se nepodařilo uložit.',code:'SETTINGS_UNAVAILABLE'},503);}
}
export const onRequestGet=()=>json({error:'Nepodporovaná metoda.'},405,{Allow:'POST'});
