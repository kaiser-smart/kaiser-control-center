import { requireUserPermission, getUsers, json } from '../../_lib/auth.js';
import { hasPermission, isUserActive } from '../../../src/permissions.js';

const messages = {
  ADMIN_NOT_CONFIGURED:'Propojení s konektorem ještě není nastavené.',
  ADMIN_AUTH_REQUIRED:'Serverové propojení konektoru vyžaduje opravu přístupu.',
  CREDENTIALS_NOT_CONFIGURED:'Úložiště hesel ještě není nastavené.',
  VERSION_CONFLICT:'Nastavení mezitím někdo změnil. Obnovte přehled a úpravu opakujte.',
  MAILBOX_EXISTS:'Schránka je již uložená. Obnovte přehled a otevřete její nastavení.',
  MAILBOX_NOT_FOUND:'Schránka nebyla nalezena.',
  ACCESS_DENIED:'K této schránce nebo identitě nelze přidělit přístup.',
  PRINCIPAL_DISABLED:'Identita konektoru je vypnutá. Lze jí pouze odebrat oprávnění.',
  PRINCIPAL_NOT_FOUND:'Tento účet nemá uložená oprávnění. Obnovte přehled.',
  FOLDER_RELOAD_REQUIRED:'Nejprve uložte přihlašovací údaje. Potom načtěte skutečné složky a vyberte jejich použití.',
  FOLDER_NOT_AVAILABLE:'Vybraná složka již není dostupná pro zprávy. Načtěte složky znovu a upravte výběr.',
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
        !['save','verify','resources','set_active','access_list','access_save'].includes(command.operation) || !command.payload || typeof command.payload!=='object') throw new Error();
    } catch { return json({error:messages.INVALID_INPUT},400); }
  }
  let directory;
  if (['access_list','access_save'].includes(command.operation)) {
    // Stable SO.ai IDs only. Re-read the canonical directory, including disabled users.
    // Fail closed if the configured user database is unavailable instead of using fallback defaults.
    try { directory=await getUsers(env,{strict:true}); }
    catch { return json({error:'Adresář kolegů není dostupný. Žádná oprávnění se nezměnila.',code:'DIRECTORY_UNAVAILABLE'},503); }
    const actor=directory.find(item=>item.id===user.id);
    const action=command.operation==='access_save'?'edit':'view';
    if(!hasPermission(actor,'settings','manage') || !hasPermission(actor,'users',action)) return json({error:'Ke správě přístupů potřebujete také oprávnění správy uživatelů.'},403);
    if(directory.length>1000) return json({error:'Adresář přesáhl limit pro výběr kolegů.',code:'ADMIN_LIMIT_EXCEEDED'},503);
    if(command.operation==='access_save') {
      const p=command.payload;
      if(!Array.isArray(p.actions) || typeof p.userId!=='string') return json({error:messages.INVALID_INPUT},400);
      const target=directory.find(item=>item.id===p.userId);
      // Revocation remains possible for a disabled or removed user; it cannot create new access.
      if(p.actions.length && !isUserActive(target)) return json({error:'Vybraný kolega není aktivní uživatel SO.ai.',code:'USER_NOT_ACTIVE'},409);
    }
  }
  try {
    const result=await env.FORPSI_CONNECTOR.fetch(new Request('https://forpsi.internal/internal/admin',{
      method:'POST',headers:{'authorization':`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify({...command,actorId:user.id}),signal:AbortSignal.timeout(55000)
    }));
    const body=await result.json();
    if(!result.ok) return json({error:messages[body.error] || 'Konektor není dostupný. Změnu nepovažujte za uloženou.',code:Object.hasOwn(messages,body.error)?body.error:'ADMIN_UNAVAILABLE'},result.status>=400?result.status:503);
    if(directory) {
      body.users=directory.map(item=>({id:item.id,name:item.name || '',email:item.email || '',active:isUserActive(item)}));
      body.canManageAccess=hasPermission(directory.find(item=>item.id===user.id),'users','edit');
    }
    return json(body);
  } catch { return json({error:'Konektor neodpověděl. Obnovte stav před opakováním změny.',code:'ADMIN_UNAVAILABLE'},503); }
}
export const onRequestGet=forwardForpsiAdmin;
export const onRequestPost=forwardForpsiAdmin;
