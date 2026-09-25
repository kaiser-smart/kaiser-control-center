const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={epoch:0,owner:null,data:null,resources:{},error:'',notice:'',tab:'mailboxes',draft:null,dirty:false,busy:false,loading:false,root:null,api:null,guard:null};
const date = value => value ? new Date(value).toLocaleString('cs-CZ') : 'Dosud neověřeno';
const tabs=[['mailboxes','Schránky'],['access','Přístupy kolegů'],['rules','Seznam pravidel a automatizace'],['settings','Nastavení a log událostí']];
const moduleNames={mail:'Pošta',calendar:'Kalendář',contacts:'Adresář',files:'Soubory',tasks:'Úkoly',notes:'Poznámky',signatures:'Podpisy',labels:'Štítky',rules:'Pravidla'};
const actionNames={read:'Čtení',write:'Úpravy',send:'Odesílání',delete:'Mazání',schedule:'Plánování'};
const outcomeNames={queued:'Čeká',sending:'Předává se',sent:'Přijato serverem',partial:'Částečně přijato',uncertain:'Výsledek je nejistý',cancelled:'Zrušeno',blocked:'Zablokováno'};
const findMailbox=id=>state.data?.mailboxes.find(m=>m.id===id);
const mailboxName=id=>findMailbox(id)?.display_name || findMailbox(id)?.address || 'Neznámá schránka';
const button=(action,label,extra='')=>`<button type="button" class="secondary-link" data-forpsi-action="${action}" ${extra} ${state.busy?'disabled':''}>${label}</button>`;
const resourcesFor = id => { const r=state.resources[id]; return r?.revision===findMailbox(id)?.revision?r:null; };
function diagnosticHint(d) {
  if(d?.code==='ADMIN_RESOURCE_LIMIT') return 'Seznam přesáhl 500 položek. Úplný výběr vyžaduje doplnění stránkování.';
  if(['EAUTH','CALDAV_ACCESS_DENIED'].includes(d?.code)) return 'Služba odmítla přihlášení nebo přístup. Zkontrolujte uložené přihlašovací údaje a dostupnost služby.';
  if(['CREDENTIALS_NOT_CONFIGURED','MAILBOX_NOT_CONFIGURED'].includes(d?.code)) return 'Nejprve bezpečně uložte heslo schránky.';
  return 'Službu se nepodařilo načíst. Zkuste připojení znovu ověřit; ostatní dostupné služby lze prohlížet.';
}
function serviceStatus(m) {
  return `<dl class="forpsi-service-status">${['imap','smtp','calendar','contacts'].map((key,i)=>{
    const v=m.verification?.[key]; const status=v==='verified'?(m.verification.mode==='simulated'?'TEST prošel':'Ověřeno'):v==='empty'?'Bez dostupných kolekcí':v==='failed'?'Ověření selhalo':'Dosud neověřeno';
    return `<div><dt>${['Příjem pošty','Připojení k odesílání','Kalendář','Adresář'][i]}</dt><dd>${status}</dd>${v==='failed'?`<p>${diagnosticHint(m.verification?.diagnostics?.[key])}</p>`:''}</div>`;
  }).join('')}</dl>`;
}
function resourceSummary(m) {
  const r=resourcesFor(m.id); if(!r) return '';
  return `<details open class="forpsi-resources"><summary>Dostupné zdroje ve Forpsi</summary><small>Načteno ${date(r.checkedAt)}</small>
    <div class="forpsi-grid">${[['folders','Složky'],['calendars','Kalendáře'],['addressBooks','Adresáře']].map(([key,label])=>{
      const s=r[key]; return `<section><h4>${label}</h4>${s.status==='failed'?`<p>${diagnosticHint(s.diagnostic)}</p>`:s.status==='empty'?`<p>${key==='calendars'?'Žádný dostupný kalendář. Synchronizaci vybraného kalendáře lze povolit ve webmailu Forpsi.':'Žádné dostupné položky.'}</p>`:`<ul class="forpsi-resource-list">${s.items.map(item=>`<li>${escape(item.path || item.name || 'Bez názvu')}${item.selectable===false?' · nelze ukládat zprávy':''}${key==='calendars'&&!item.eventsSupported?' · podpora událostí nepotvrzená':''}</li>`).join('')}</ul>`}</section>`;
    }).join('')}</div><p>Jde o přehled dostupnosti, nikoli udělení přístupu kolegům. Obsah zpráv, událostí ani kontaktů se nenačítá.</p></details>`;
}
function folderFields(d) {
  if(!d.id) return '<p>Výběr složek se zpřístupní po uložení schránky a načtení zdrojů z Forpsi.</p>';
  const r=resourcesFor(d.id), folders=r?.folders;
  const ready=folders?.status==='available';
  return `<details open><summary>Složky pro zprávy</summary><p>Platí pro tuto schránku v SO.ai a konektoru. Složky ve Forpsi se nepřejmenovávají ani nemažou.</p>
    ${button('resources','Načíst složky a další zdroje',`data-id="${escape(d.id)}"`)}
    ${folders?.status==='failed'?`<p>${diagnosticHint(folders.diagnostic)}</p>`:''}
    <div class="forpsi-grid">${[['draftsFolder','Koncepty','\\Drafts'],['sentFolder','Odeslané','\\Sent'],['trashFolder','Koš','\\Trash']].map(([key,label,flag])=>{
      const current=d[key] || ''; const items=(folders?.items || []).filter(f=>f.selectable!==false);
      const automatic=items.filter(f=>f.specialUse===flag);
      return `<label><span>${label}</span><select name="${key}" ${ready&&!state.busy?'':'disabled'}>
        <option value="">${automatic.length===1?`Podle Forpsi: ${escape(automatic[0].path)}`:'Podle označení Forpsi'}</option>
        ${current&&!items.some(f=>f.path===current)?`<option value="${escape(current)}" selected>${escape(current)} · dostupnost neověřena</option>`:''}
        ${items.map(f=>`<option value="${escape(f.path)}" ${f.path===current?'selected':''}>${escape(f.path)}</option>`).join('')}</select>
        ${ready&&automatic.length!==1&&!current?'<small>Jednoznačný cíl nebyl nalezen. Vyberte existující složku před použitím této funkce.</small>':''}</label>`;
    }).join('')}</div><p>Při změně hesla nejprve uložte připojení a pak načtěte složky znovu.</p></details>`;
}
function editForm() {
  const d=state.draft;
  const field=(key,label,type='text',extra='')=>`<label><span>${label}</span><input name="${key}" type="${type}" value="${escape(d[key] || '')}" ${extra} ${state.busy?'disabled':''}></label>`;
  return `<form data-forpsi-form class="forpsi-form">
    <h3>${d.id?'Upravit schránku':'Přidat schránku'}</h3>
    <div class="forpsi-grid">${field('displayName','Název schránky','text','required maxlength="100"')}${field('address','E-mail','email',`required maxlength="254" ${d.id?'readonly':''}`)}
    ${field('password',d.id?'Nové heslo (prázdné = beze změny)':'Heslo schránky (lze doplnit později)','password',`autocomplete="new-password" maxlength="1024" ${state.data.credentialStorageReady?'':'disabled'}`)}</div>
    <p>Uložené heslo používá konektor; heslo přímo u Forpsi se tím nemění. Uložení schránku pozastaví a vyžádá nové ověření. Probíhající odeslání již nelze odvolat.</p>
    ${folderFields(d)}
    <div class="forpsi-actions"><button type="submit" class="primary-action" ${state.busy?'disabled':''}>${state.busy?'Ukládám…':'Uložit a pozastavit'}</button>${button('cancel','Zavřít formulář')}</div>
  </form>`;
}
function mailboxes() {
  return `<div class="forpsi-actions">${button('new','Přidat schránku')}${button('refresh','Obnovit stav')}</div>
    ${state.draft?editForm():''}
    <div class="forpsi-list">${state.data.mailboxes.length?state.data.mailboxes.map(m=>`<article class="forpsi-card">
      <div><h3>${escape(m.display_name || m.address)}</h3><p>${escape(m.address)}</p></div>
      <span>${m.active?'Povolená v konektoru':'Pozastavená'}</span>${serviceStatus(m)}<small>Ověření: ${date(m.verified_at)}</small>
      <div class="forpsi-actions">${button('edit','Upravit nastavení',`data-id="${escape(m.id)}"`)}${button('verify','Ověřit připojení',`data-id="${escape(m.id)}"`)}${button('resources','Dostupné složky, kalendáře a adresáře',`data-id="${escape(m.id)}"`)}${button('toggle',m.active?'Pozastavit':'Zapnout schránku',`data-id="${escape(m.id)}"`)}</div>
      ${resourceSummary(m)}
    </article>`).join(''):'<p>Zatím není uložená žádná schránka.</p>'}</div>
    <p>Test připojení ověřuje přihlášení ke službám. Neodesílá zprávu a nepotvrzuje její doručení.</p>`;
}
function access() {
  return `<h3>Přístupy kolegů</h3><p>Práva platí pro konkrétní schránku a přihlášenou identitu. Ruční správa firemních přístupů bude fungovat nezávisle na ChatGPT; její editor zatím není zapojený. Správa připojení sama neuděluje právo číst obsah schránky.</p>
    ${state.data.grants.length?`<ul class="forpsi-list">${state.data.grants.map(g=>`<li>${escape(mailboxName(g.mailboxId))} · ${escape(actionNames[g.action])} · ${g.revoked || !g.active?'Odebráno':'Přiděleno'}<details><summary>Identifikace účtu</summary><code>${escape(g.principalId)}</code></details></li>`).join('')}</ul>`:'<p>Konektor neeviduje žádná přidělená oprávnění.</p>'}
    ${state.data.truncated.grants?'<p>Přehled je omezen na prvních 500 oprávnění.</p>':''}`;
}
function rules() {
  return `<h3>Seznam pravidel a automatizace</h3><p>Štítky a pravidla patří konektoru. Synchronizace s nastavením webmailu a editace pravidel v SO.ai zatím nejsou zapojené.</p>
    <div class="forpsi-grid"><label>Hledat<input data-forpsi-search placeholder="Název pravidla nebo štítku"></label><label>Typ<select data-forpsi-kind><option value="">Vše</option><option value="rule">Pravidla</option><option value="label">Štítky</option></select></label><label>Stav<select data-forpsi-status><option value="">Vše</option><option value="active">Aktivní</option><option value="inactive">Neaktivní</option></select></label></div>
    <ul class="forpsi-list">${[...state.data.rules.map(r=>({...r,kind:'rule',label:r.enabled?'Aktivní · ruční spuštění':'Neaktivní'})),...state.data.labels.map(l=>({...l,kind:'label',label:'Štítek',enabled:true}))].map(r=>`<li data-forpsi-entry data-kind="${r.kind}" data-status="${r.enabled?'active':'inactive'}" data-search="${escape(`${r.name} ${mailboxName(r.mailbox_id)}`.toLowerCase())}">${escape(r.name)} · ${escape(mailboxName(r.mailbox_id))} · ${r.label}</li>`).join('')}</ul>
    <p data-forpsi-empty>Žádná položka neodpovídá výběru.</p>
    ${state.data.truncated.rules || state.data.truncated.labels?'<p>Přehled je omezen na 200 pravidel a 200 štítků.</p>':''}
    <h3>Plánované odesílání</h3><p>Běží na serveru pouze po aktivaci konektoru. Posledních nejvýše 50 položek; těla zpráv se zde nezobrazují.</p>
    ${state.data.queue.length?`<ul>${state.data.queue.map(j=>`<li>${escape(mailboxName(j.mailbox_id))} · ${date(j.send_at)} · ${escape(outcomeNames[j.state] || j.state)}</li>`).join('')}</ul>`:'<p>Žádné zaznamenané odesílání.</p>'}`;
}
function settings() {
  const d=state.data;
  return `<h3>Log událostí</h3><p>${d.connectorEnabled?'Konektor je povolený. Dostupnost jednotlivých služeb ověřte u schránek.':'Konektor je vypnutý. Automatické odesílání neběží.'}</p>
    <p>ChatGPT přihlášení: ${d.oauthConfigured?'konfigurace přítomna, přihlášení zatím neověřeno':'čeká na nastavení'}. Šifrované ukládání hesel: ${d.credentialStorageReady?'nakonfigurováno':'čeká na nastavení'}.</p>
    <div class="forpsi-list">${d.capabilities.modules.map(m=>`<article class="forpsi-card"><h4>${moduleNames[m.id] || escape(m.id)}</h4><p>${m.implementation==='NOT_IMPLEMENTED'?'Napojení zatím není implementováno.':m.implementation==='CONNECTOR_STORAGE'?'Vlastní evidence konektoru; nesynchronizuje nastavení webmailu.':'Adaptér implementován; stav připojení se ověřuje pro každou schránku.'}</p></article>`).join('')}</div>
    ${d.audit.length?`<ul>${d.audit.map(e=>`<li>${date(e.at)} · ${escape(mailboxName(e.mailbox_id))} · ${escape({'admin.save':'Uložení nastavení','admin.verify':'Test připojení','admin.set_active':'Změna dostupnosti'}[e.action] || e.action)} · ${escape(e.outcome)}</li>`).join('')}</ul>`:'<p>Zatím žádné zaznamenané události.</p>'}
    <details><summary>Zobrazit diagnostiku</summary><p>Načteno ${date(d.checkedAt)}. Posledních nejvýše 50 událostí. Stav přihlášení v prohlížeči nepotvrzuje serverové připojení. Test IMAP/SMTP nepotvrzuje odeslání, doručení ani uložení kopie do Odeslané.</p></details>`;
}
function filterRules() {
  const r=state.root; if(!r) return;
  const q=r.querySelector('[data-forpsi-search]')?.value.toLowerCase() || '';
  const kind=r.querySelector('[data-forpsi-kind]')?.value || '';
  const status=r.querySelector('[data-forpsi-status]')?.value || '';
  let count=0;
  for(const el of r.querySelectorAll('[data-forpsi-entry]')) { el.hidden=!(el.dataset.search.includes(q) && (!kind || el.dataset.kind===kind) && (!status || el.dataset.status===status)); if(!el.hidden) count++; }
  const empty=r.querySelector('[data-forpsi-empty]'); if(empty) empty.hidden=count>0;
}
function paint() {
  if(!state.root?.isConnected) return;
  state.root.innerHTML=`<div class="users-panel__head"><div><h2>Forpsi / ChatGPT</h2><p>Firemní schránky a připojení služeb.</p></div><span>Vývojový pilot</span></div>
    <div class="forpsi-tabs" role="group" aria-label="Nastavení Forpsi">${tabs.map(([id,label])=>button('tab',label,`data-tab="${id}" aria-pressed="${state.tab===id}"`)).join('')}</div>
    ${state.data?`<p>${state.data.verificationMode==='simulated'?'Izolovaný TEST: Forpsi je nahrazený simulovanými poskytovateli. ':''}${state.data.connectorEnabled?'Konektor je povolený.':'Konektor je vypnutý; automatické odesílání neběží.'}</p>`:''}
    <div role="status">${escape(state.notice)}</div>${state.error?`<p role="alert" class="module-feedback__error">${escape(state.error)}</p>`:''}
    ${state.loading?'<p>Načítám stav konektoru…</p>':state.data?({mailboxes,access,rules,settings}[state.tab])():`<p>Stav konektoru není dostupný. Schránky nejsou z této obrazovky připojené.</p>${button('refresh','Obnovit stav')}`}`;
  filterRules();
}
async function load() {
  if(state.loading) return;
  const epoch=state.epoch; state.loading=true; state.error=''; paint();
  try { const data=await state.api('/api/forpsi/admin'); if(epoch===state.epoch) state.data=data; } catch(e) { if(epoch===state.epoch) state.error=e.message; }
  finally { if(epoch===state.epoch) { state.loading=false; paint(); } }
}
function draftFor(m) { return { ...(m?{id:m.id,revision:m.revision}:{}),requestId:crypto.randomUUID(),
  address:m?.address || '',displayName:m?.display_name || '',draftsFolder:m?.drafts_folder || '',sentFolder:m?.sent_folder || '',trashFolder:m?.trash_folder || '',password:'' }; }
async function command(operation,payload) { return state.api('/api/forpsi/admin',{method:'POST',body:JSON.stringify({operation,payload})}); }
export function forpsiDirtyTarget() { return state.root?.isConnected && (state.dirty || state.busy)?{isDirty:true,type:'forpsi'}:null; }
export function discardForpsiDraft() { state.draft=null; state.dirty=false; paint(); }
export async function saveForpsiDraft() {
  if(state.busy) return false;
  const form=state.root?.querySelector('[data-forpsi-form]');
  if(!form || !form.reportValidity()) return false;
  const epoch=state.epoch; state.busy=true; state.error=''; const payload={...state.draft};
  if(!payload.password) delete payload.password;
  for(const key of ['draftsFolder','sentFolder','trashFolder']) payload[key]=payload[key] || null;
  paint();
  try { const result=await command('save',payload); if(epoch!==state.epoch) return false; state.dirty=false; state.draft=null;
    state.data.mailboxes=[...state.data.mailboxes.filter(m=>m.id!==result.mailbox.id),result.mailbox];
    delete state.resources[result.mailbox.id];
    state.notice='Nastavení je uložené. Schránka je pozastavená; ověřte připojení.'; return true;
  } catch(e) { if(epoch===state.epoch) state.error=e.message; return false; }
  finally { if(epoch===state.epoch) { state.busy=false; paint(); } }
}
export function forpsiAdminSection(owner) { return `<section id="forpsi-admin" class="users-panel forpsi-admin" data-forpsi-root data-owner="${escape(owner)}"></section>`; }
export function mountForpsiAdmin(app,{apiJson,guard,owner}) {
  if(state.owner!==owner) { Object.assign(state,{epoch:state.epoch+1,owner,data:null,resources:{},draft:null,dirty:false,error:'',notice:'',tab:'mailboxes',loading:false,busy:false}); }
  const root=app.querySelector('[data-forpsi-root]'); if(!root) { state.root=null; return; }
  state.root=root; state.api=apiJson;
  // Panel actions only repaint this panel; other settings forms stay mounted.
  // The application's navigation guard still protects all forms when leaving the page.
  state.guard=action=>state.dirty?guard(action):action();
  root.addEventListener('input',event=>{ if(event.target.form?.matches('[data-forpsi-form]')) { state.draft[event.target.name]=event.target.value; state.dirty=true; } else filterRules(); });
  root.addEventListener('change',event=>{ if(event.target.form?.matches('[data-forpsi-form]')) { state.draft[event.target.name]=event.target.value; state.dirty=true; } else filterRules(); });
  root.addEventListener('submit',event=>{ if(event.target.matches('[data-forpsi-form]')) { event.preventDefault(); event.stopPropagation(); void saveForpsiDraft(); } });
  root.addEventListener('click',event=>{
    const b=event.target.closest('[data-forpsi-action]'); if(!b) return; event.preventDefault(); event.stopPropagation(); if(state.busy) return;
    const action=b.dataset.forpsiAction;
    if(action==='resources') {
      const m=findMailbox(b.dataset.id); if(!m) return;
      const epoch=state.epoch; state.busy=true; state.error=''; state.notice='Načítám dostupné zdroje…'; paint();
      void command('resources',{id:m.id,revision:m.revision}).then(result=>{
        if(epoch!==state.epoch) return;
        state.resources[m.id]=result.resources; state.notice='Dotaz na zdroje skončil. Výsledky jsou u jednotlivých služeb.';
      }).catch(e=>{if(epoch===state.epoch) { delete state.resources[m.id]; state.error=e.message; state.notice=''; }})
        .finally(()=>{if(epoch===state.epoch) {state.busy=false; paint();}});
      return;
    }
    state.guard(async()=>{
      state.error=''; state.notice='';
      if(action==='tab') { state.tab=b.dataset.tab; paint(); return; }
      if(action==='new' || action==='edit') { state.draft=draftFor(findMailbox(b.dataset.id)); state.dirty=false; paint(); return; }
      if(action==='cancel') { discardForpsiDraft(); return; }
      if(action==='refresh') { await load(); return; }
      const m=findMailbox(b.dataset.id); if(!m) return;
      const epoch=state.epoch; state.busy=true; paint();
      try { const result=await command(action==='verify'?'verify':'set_active',{id:m.id,revision:m.revision,...(action==='toggle'?{active:!m.active}:{})});
        if(epoch!==state.epoch) return;
        state.data.mailboxes=state.data.mailboxes.map(item=>item.id===m.id?result.mailbox:item);
        delete state.resources[m.id];
        state.notice=action==='verify'?'Test připojení skončil. Výsledek je uvedený u schránky.':'Dostupnost schránky je uložená.';
      } catch(e) { if(epoch===state.epoch) state.error=e.message; } finally { if(epoch===state.epoch) { state.busy=false; paint(); } }
    });
  });
  paint(); if(!state.data && !state.loading) void load();
}
