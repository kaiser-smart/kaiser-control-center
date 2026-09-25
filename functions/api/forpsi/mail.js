import { currentUser, json } from '../../_lib/auth.js';

const messages={
  ACCESS_DENIED:'Přístup ke schránce byl odebrán nebo je schránka pozastavená. Obnovte seznam schránek.',
  SOAI_MAIL_DISABLED:'Pracovní pošta SO.ai ještě není zapnutá.',
  MAIL_NOT_CONFIGURED:'Serverové propojení pošty není dostupné.',
  INVALID_ARGUMENTS:'Zkontrolujte výběr schránky a vyhledávací údaje.',
  TOOL_NOT_ALLOWED:'Tato operace není v pracovní poště dostupná.',
  STALE_MESSAGE_REFERENCE:'Obsah složky se změnil. Vyhledejte zprávu znovu.',
  MESSAGE_NOT_FOUND:'Zpráva již není ve vybrané složce. Vyhledejte ji znovu.',
  MESSAGE_TOO_LARGE:'Zpráva je větší než 2 MiB. Otevřete ji ve webmailu Forpsi.',
  MAIL_LIMIT_EXCEEDED:'Seznam přesáhl podporovaný limit.',
  PROVIDER_UNAVAILABLE:'Forpsi teď neodpovědělo. Zkuste požadavek znovu.',
};
export async function forwardForpsiMail({request,env}) {
  if(request.method!=='POST') return json({error:'Nepodporovaná metoda.'},405,{Allow:'POST'});
  if(request.headers.get('origin')!==new URL(request.url).origin || request.headers.get('sec-fetch-site')==='cross-site') return json({error:'Nepovolený původ požadavku.'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json') return json({error:'Očekává se JSON.'},415);
  let user;
  try {user=await currentUser(env,request,{strict:true});}
  catch {return json({error:'Aktuální přístup uživatele nelze ověřit. Zprávy nebyly načtené.',code:'DIRECTORY_UNAVAILABLE'},503);}
  if(!user) return json({error:'Přihlášení vypršelo nebo účet není aktivní.',code:'AUTH_REQUIRED'},401);
  if(!env.FORPSI_CONNECTOR?.fetch || !env.FORPSI_ADMIN_TOKEN || env.FORPSI_ADMIN_TOKEN.length<32) return json({error:messages.MAIL_NOT_CONFIGURED,code:'MAIL_NOT_CONFIGURED'},503);
  let command;
  try {
    const reader=request.body?.getReader();if(!reader)throw new Error();const parts=[];let size=0;
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return json({error:'Příliš velký požadavek.'},413);}parts.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    command=JSON.parse(new TextDecoder().decode(bytes));
    if(!command || Object.keys(command).some(k=>!['operation','payload'].includes(k)) ||
      !['list_mailboxes','list_folders','search_messages','read_message'].includes(command.operation) || !command.payload || Array.isArray(command.payload) || typeof command.payload!=='object')throw new Error();
  } catch{return json({error:messages.INVALID_ARGUMENTS,code:'INVALID_ARGUMENTS'},400);}
  try {
    const result=await env.FORPSI_CONNECTOR.fetch(new Request('https://forpsi.internal/internal/mail',{
      method:'POST',headers:{authorization:`Bearer ${env.FORPSI_ADMIN_TOKEN}`,'content-type':'application/json'},
      body:JSON.stringify({...command,actorId:user.id}),signal:AbortSignal.timeout(55000)
    }));
    // Recheck the authoritative directory after the provider returns, including mid-request disablement.
    const stillActive=await currentUser(env,request,{strict:true});
    if(stillActive?.id!==user.id) return json({error:'Účet již není aktivní nebo přihlášení vypršelo.',code:'AUTH_REQUIRED'},401);
    const body=await result.json();
    if(!result.ok){const code=Object.hasOwn(messages,body.error)?body.error:'PROVIDER_UNAVAILABLE';return json({error:messages[code],code},result.status>=400?result.status:503);}
    return json(body,200,{'X-Content-Type-Options':'nosniff'});
  } catch {return json({error:'Poštu se nepodařilo bezpečně načíst. Zkuste obnovit přístup.',code:'MAIL_UNAVAILABLE'},503);}
}
export const onRequestPost=forwardForpsiMail;
export const onRequestGet=forwardForpsiMail;
