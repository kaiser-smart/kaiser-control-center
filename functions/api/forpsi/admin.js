import { requireUserPermission, json } from '../../_lib/auth.js';

const messages = {
  ADMIN_NOT_CONFIGURED:'Propojení s konektorem ještě není nastavené.',
  ADMIN_AUTH_REQUIRED:'Serverové propojení konektoru vyžaduje opravu přístupu.',
  CREDENTIALS_NOT_CONFIGURED:'Úložiště hesel ještě není nastavené.',
  VERSION_CONFLICT:'Nastavení mezitím někdo změnil. Obnovte přehled a úpravu opakujte.',
  MAILBOX_EXISTS:'Schránka je již uložená. Obnovte přehled a otevřete její nastavení.',
  MAILBOX_NOT_FOUND:'Schránka nebyla nalezena.',
  INVALID_INPUT:'Zkontrolujte vyplněné údaje.',
  VERIFICATION_REQUIRED:'Před zapnutím ověřte přihlášení k příchozí a odchozí poště.',
  ADMIN_LIMIT_EXCEEDED:'Přehled překročil limit. Je potřeba doplnit stránkování.'
};

export async function forwardForpsiAdmin({request,env}) {
  // Reuse the existing session and permission checks; never trust an actor from the browser.
  const {user,response} = await requireUserPermission(env,request,'settings','manage');
  if(response) return response;
  const token=env.FORPSI_ADMIN_TOKEN;
  if(!env.FORPSI_CONNECTOR?.fetch || !token || token.length<32) return json({error:messages.ADMIN_NOT_CONFIGURED,code:'ADMIN_NOT_CONFIGURED'},503);
  let command={operation:'overview',payload:{}};
  if(request.method!=='GET') {
    if(request.method!=='POST') return json({error:'Nepodporovaná metoda.'},405);
    // Browser mutations require the application's own origin as well as its session.
    if(request.headers.get('origin')!==new URL(request.url).origin ||
      request.headers.get('sec-fetch-site')==='cross-site') return json({error:'Nepovolený původ požadavku.'},403);
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json') return json({error:'Očekává se JSON.'},415);
    try {
      const reader=request.body?.getReader(); if(!reader) throw new Error();
      const parts=[]; let size=0;
      for(;;) { const {value,done}=await reader.read(); if(done) break;
        size+=value.byteLength; if(size>16384) { await reader.cancel(); return json({error:'Příliš velký požadavek.'},413); } parts.push(value); }
      const bytes=new Uint8Array(size); let offset=0; for(const part of parts) { bytes.set(part,offset); offset+=part.byteLength; }
      command=JSON.parse(new TextDecoder().decode(bytes));
      if(!command || Object.keys(command).some(k=>!['operation','payload'].includes(k)) ||
        !['save','verify','set_active'].includes(command.operation) || !command.payload || typeof command.payload!=='object') throw new Error();
    } catch { return json({error:messages.INVALID_INPUT},400); }
  }
  try {
    const result=await env.FORPSI_CONNECTOR.fetch(new Request('https://forpsi.internal/internal/admin',{
      method:'POST',headers:{'authorization':`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify({...command,actorId:user.id}),signal:AbortSignal.timeout(55000)
    }));
    const body=await result.json();
    if(!result.ok) return json({error:messages[body.error] || 'Konektor není dostupný. Změnu nepovažujte za uloženou.',code:Object.hasOwn(messages,body.error)?body.error:'ADMIN_UNAVAILABLE'},result.status>=400?result.status:503);
    return json(body);
  } catch { return json({error:'Konektor neodpověděl. Obnovte stav před opakováním změny.',code:'ADMIN_UNAVAILABLE'},503); }
}
export const onRequestGet=forwardForpsiAdmin;
export const onRequestPost=forwardForpsiAdmin;
