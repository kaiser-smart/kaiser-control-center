const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const emptyFilters=()=>({folder:'INBOX',from:'',subject:'',since:'',through:'',unread:false});
let state={owner:null,epoch:0,root:null,api:null,loaded:false,busy:false,mailboxes:[],mailboxId:'',folders:[],filters:emptyFilters(),applied:null,result:null,message:null,error:'',mode:null};
const date=value=>value?new Date(value).toLocaleString('cs-CZ'):'Datum neuvedeno';
const button=(action,label,extra='')=>`<button type="button" class="secondary-link" data-mail-action="${action}" ${state.busy?'disabled':''} ${extra}>${label}</button>`;
const changed=()=>state.applied && JSON.stringify(state.applied)!==JSON.stringify(state.filters);
export const forpsiMailSection=()=>'<section class="forpsi-mail forpsi-admin users-panel" data-forpsi-mail-root aria-label="Pracovní pošta"></section>';

export function mailSearchPayload(mailboxId,filters,beforeUid) {
  const p={mailboxId,folder:filters.folder,limit:20};
  for(const key of ['from','subject','since'])if(filters[key])p[key]=filters[key];
  if(filters.unread)p.unread=true;
  if(filters.through){const end=new Date(`${filters.through}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+1);p.before=end.toISOString().slice(0,10);}
  if(beforeUid)p.beforeUid=beforeUid;
  return p;
}
function clearContent(){state.result=null;state.message=null;state.applied=null;}
function paint(){
  const root=state.root;if(!root?.isConnected)return;
  const f=state.filters;
  root.innerHTML=`<div class="users-panel__head"><div><h1>Pošta</h1><p>Vaše přístupné schránky Forpsi.</p></div>${button('refresh','Obnovit přístup')}</div>
    <p class="forpsi-mail-status" role="status">${state.busy?'Načítám…':state.mode==='simulated'?'Izolovaný TEST · simulovaný poskytovatel':state.loaded?'Přístup ověřen přes SO.ai':''}</p>
    ${state.error?`<p role="alert">${escape(state.error)}</p>`:''}
    ${!state.loaded?'':!state.mailboxes.length?'<p>Nemáte žádnou povolenou schránku s právem čtení. Správce ji může přiřadit v nastavení Forpsi.</p>':`
    <div class="forpsi-grid"><label>Schránka<select aria-label="Schránka" data-mail-mailbox ${state.busy?'disabled':''}><option value="">Vyberte schránku</option>${state.mailboxes.map(m=>`<option value="${escape(m.id)}" ${m.id===state.mailboxId?'selected':''}>${escape(m.address)}</option>`).join('')}</select></label></div>
    ${state.mailboxId&&!state.folders.length&&!state.busy?'<p>Schránka nevrátila žádnou dostupnou složku.</p>':''}
    ${state.mailboxId&&state.folders.length?`<form data-mail-search class="forpsi-form"><div class="forpsi-grid">
      <label>Složka<select aria-label="Složka" name="folder" ${state.busy?'disabled':''}>${state.folders.map(item=>`<option value="${escape(item.path)}" ${f.folder===item.path?'selected':''}>${escape(item.path)}</option>`).join('')}</select></label>
      <label>Odesílatel<input name="from" value="${escape(f.from)}" maxlength="500" ${state.busy?'disabled':''}></label>
      <label>Předmět obsahuje<input name="subject" value="${escape(f.subject)}" maxlength="500" ${state.busy?'disabled':''}></label>
      <label>Od data<input type="date" name="since" value="${escape(f.since)}" ${state.busy?'disabled':''}></label>
      <label>Do data včetně<input type="date" name="through" value="${escape(f.through)}" ${state.busy?'disabled':''}></label>
    </div><label class="forpsi-mail-check"><input type="checkbox" name="unread" ${f.unread?'checked':''} ${state.busy?'disabled':''}>Jen nepřečtené</label>
    <div class="forpsi-actions"><button class="primary-action" type="submit" ${state.busy?'disabled':''}>Hledat zprávy</button></div>
    <small>Datum filtruje přijetí zprávy na serveru. Otevření zprávy nemění označení přečteno. Čtení zatím podporuje zprávy do 2 MiB.</small></form>`:''}`}
    <div class="forpsi-mail-results" aria-live="polite">${results()}</div>`;
}
function results(){
  const r=state.result;if(!r)return '';
  const m=state.message;
  return `<p data-mail-filter-state ${changed()?'':'hidden'}>Filtry jsou změněné. Pro nové výsledky stiskněte Hledat zprávy.</p>
    <p>Výsledky aktuální dávky: ${r.messages.length}. ${r.nextBeforeUid?'Ve složce zbývá starší část k prohledání.':'Prohledávání bylo dokončeno.'}</p>
    ${r.messages.length?`<ol class="forpsi-mail-list">${r.messages.map((item,i)=>`<li><button type="button" data-mail-action="read" data-index="${i}" ${state.busy?'disabled':''}><strong>${escape(item.subject || '(bez předmětu)')}</strong><span>${escape(item.from.map(a=>a.name?`${a.name} <${a.address}>`:a.address).join(', '))}</span><small>${date(item.date)}${item.flags.includes('\\Seen')?'':' · nepřečtené'}${item.flags.includes('\\Flagged')?' · označené hvězdičkou':''}</small></button></li>`).join('')}</ol>`:'<p>V této dávce nejsou odpovídající zprávy.</p>'}
    ${r.nextBeforeUid?button('next','Prohledat starší část',changed()?'disabled':''):''}
    ${m?`<article class="forpsi-card forpsi-mail-message" data-mail-message><div class="forpsi-actions">${button('close','Zavřít zprávu')}</div><h2>${escape(m.subject || '(bez předmětu)')}</h2><p>${escape(m.from.map(a=>a.address).join(', '))} · ${date(m.date)}</p><pre>${escape(m.text)}</pre>${m.truncated?'<p>Zobrazený text je zkrácený.</p>':''}${m.attachments?.length?`<h3>Přílohy</h3><ul>${m.attachments.map(a=>`<li>${escape(a.filename || 'Bez názvu')} · ${escape(a.contentType)} · ${a.size} B</li>`).join('')}</ul><p>Stahování příloh zatím není zapojené.</p>`:''}</article>`:''}`;
}
async function request(operation,payload,onSuccess){
  if(state.busy)return;const epoch=state.epoch;state.busy=true;state.error='';paint();
  try{const response=await state.api('/api/forpsi/mail',{method:'POST',body:JSON.stringify({operation,payload})});
    if(epoch!==state.epoch)return;state.mode=response.mode;onSuccess(response.data);
  }catch(e){if(epoch!==state.epoch)return;clearContent();state.error=e.message;
    // Never keep message bodies on screen after a failed authorization or provider request.
    if([401,403].includes(e.status) || ['AUTH_REQUIRED','ACCESS_DENIED'].includes(e.code || e.payload?.code)){state.mailboxes=[];state.folders=[];state.mailboxId='';}
  }finally{if(epoch===state.epoch){state.busy=false;paint();}}
}
async function refresh(){clearContent();state.loaded=false;state.mailboxes=[];state.folders=[];state.mailboxId='';await request('list_mailboxes',{},data=>{state.mailboxes=data.mailboxes;state.loaded=true;});}
async function chooseMailbox(id){clearContent();state.mailboxId=id;state.folders=[];state.filters=emptyFilters();if(!id){paint();return;}
  await request('list_folders',{mailboxId:id},data=>{state.folders=data.folders.filter(f=>f.selectable!==false);state.filters.folder=state.folders.some(f=>f.path==='INBOX')?'INBOX':state.folders[0]?.path || '';});}
async function search(next=false){
  const f={...state.filters};
  if(!f.folder || (f.since&&f.through&&f.since>f.through)){state.error='Datum od musí být nejpozději v den data do.';paint();return;}
  if(next&&changed())return;
  const payload=mailSearchPayload(state.mailboxId,f,next?state.result?.nextBeforeUid:null);
  clearContent();await request('search_messages',payload,data=>{state.result=data;state.applied=f;});
}
export function mountForpsiMail(app,{apiJson,owner}){
  const root=app.querySelector('[data-forpsi-mail-root]');
  if(state.owner!==owner || !root){state={owner,epoch:state.epoch+1,root:null,api:apiJson,loaded:false,busy:false,mailboxes:[],mailboxId:'',folders:[],filters:emptyFilters(),applied:null,result:null,message:null,error:'',mode:null};}
  if(!root)return;state.root=root;state.api=apiJson;
  root.addEventListener('input',event=>{if(event.target.form?.matches('[data-mail-search]')){
    state.filters[event.target.name]=event.target.type==='checkbox'?event.target.checked:event.target.value;
    const hint=root.querySelector('[data-mail-filter-state]');if(hint)hint.hidden=!changed();
    const next=root.querySelector('[data-mail-action="next"]');if(next)next.disabled=!!changed();
  }});
  root.addEventListener('change',event=>{if(event.target.matches('[data-mail-mailbox]'))void chooseMailbox(event.target.value);});
  root.addEventListener('submit',event=>{if(event.target.matches('[data-mail-search]')){event.preventDefault();event.stopPropagation();void search();}});
  root.addEventListener('click',event=>{const b=event.target.closest('[data-mail-action]');if(!b)return;event.preventDefault();event.stopPropagation();if(state.busy)return;
    if(b.dataset.mailAction==='refresh')void refresh();
    if(b.dataset.mailAction==='next')void search(true);
    if(b.dataset.mailAction==='close'){state.message=null;paint();}
    if(b.dataset.mailAction==='read'){const ref=state.result?.messages[Number(b.dataset.index)]?.reference;if(ref){state.message=null;void request('read_message',{mailboxId:state.mailboxId,message:ref},data=>{state.message=data;}).then(()=>{root.querySelector('[data-mail-message]')?.scrollIntoView({block:'start'});});}}
  });
  paint();if(!state.loaded&&!state.busy)void refresh();
}
