import { currentUser, json } from '../../_lib/auth.js';

const allowed=new Set(['consent','revoke','sync','attention','case_get','search','case_action',
  'rules','rule_activate','draft_create','message_send','attachment_get','work_refresh','work_review','work_action']);
const workMessages={
  WORK_V2_PAUSED:'Zobrazení ověřené práce je správcem pozastavené. Starší výklad se nepoužije.',
  WORK_LEGACY_ACTION_DISABLED:'Použijte ovládání konkrétní práce v aktuálním přehledu TEĎ.',
  WORK_AUTHORITY_REQUIRED:'K této změně nemáte přidělenou pravomoc. Nastavení přístupů spravuje správce.',
  WORK_EVIDENCE_REQUIRED:'Výklad nemá doložené povinné údaje. Opravte ho nebo založte vlastní úkol.',
  WORK_INTERPRETATION_REVIEW_REQUIRED:'Vyberte původní výklad, který má oprava nahradit.',
  WORK_IDENTITY_REVIEW_REQUIRED:'Potvrďte, zda jde o stejnou, nebo samostatnou práci.',
  WORK_MANUAL_BINDING_REQUIRED:'Rozhodněte, zda mají původní ruční zásahy platit i po opravě.',
  WORK_INVALID_TRANSITION:'Tato změna neodpovídá aktuálnímu stavu práce. Obnovte případ.',
  WORK_DAILY_ANALYSIS_LIMIT:'Dnešní limit analýz byl dosažen. Uložená práce zůstává dostupná.',
  WORK_ANALYSIS_BUSY:'Tento případ se právě vyhodnocuje. Za chvíli obnovte přehled.',
  WORK_ANALYSIS_UNAVAILABLE:'Vyhodnocení teď není dostupné. Dosavadní platné výsledky zůstávají zachované.',
  WORK_CHATGPT_ANALYSIS_REQUIRED:'Tento případ vyhodnocuje připojený ChatGPT. Otevřete jej v chatu s konektorem FORPSI.',
  WORK_CONTEXT_LIMIT:'Případ přesahuje rozsah jednoho vyhodnocení. Jeho obsah vyžaduje samostatné zpracování.',
  WORK_DOCUMENT_UNAVAILABLE:'Dostupnost a shodu vybraného dokumentu se nepodařilo ověřit.',
  WORK_COUNTERPARTY_MISMATCH:'Podklad nepochází od protistrany určené podmínkou.',
  WORK_SOURCE_CHANGED:'Zdrojové podklady se změnily. Před změnou práce je znovu ověřte.',
  BRAIN_PILOT_READ_ONLY:'Tato schránka je zatím povolená pouze pro čtení.',
};
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
  try{const reader=request.body?.getReader();if(!reader)throw new Error();const parts=[];let length=0;
    for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;
      if(length>32768){await reader.cancel();throw new Error();}parts.push(part.value);}
    const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    const raw=new TextDecoder().decode(bytes);
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
    if(!response.ok)return json({error:workMessages[result.error]??result.error??'MAIL_BRAIN_UNAVAILABLE',code:result.error??'MAIL_BRAIN_UNAVAILABLE'},response.status);
    return json(result,200,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  }catch{return json({error:'Mail Brain teď není dostupný.',code:'MAIL_BRAIN_UNAVAILABLE'},503);}
}
export const onRequestGet=()=>json({error:'Nepodporovaná metoda.'},405,{Allow:'POST'});
