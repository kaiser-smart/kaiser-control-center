import { mountForpsiComposer, openForpsiDraft, forpsiComposerDirtyTarget } from './ForpsiComposer.js';
import { renderWorkPanel } from './ForpsiWorkPanel.js';
const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const emptyFilters=()=>({folder:'INBOX',from:'',subject:'',since:'',through:'',unread:false});
let state={owner:null,epoch:0,root:null,api:null,loaded:false,busy:false,mailboxes:[],mailboxId:'',folders:[],draftFolder:null,replaceCapability:null,canEditDrafts:false,canCopyDrafts:false,filters:emptyFilters(),applied:null,result:null,message:null,error:'',mode:null,brain:null,brainCase:null,brainSearch:null,brainRules:null,brainAttachment:null,brainDraft:null,brainApproval:null,brainReply:null,brainEnabled:false,brainSyncNotice:''};
const date=value=>value?new Date(value).toLocaleString('cs-CZ'):'Datum neuvedeno';
const button=(action,label,extra='')=>`<button type="button" class="secondary-link" data-mail-action="${action}" ${state.busy?'disabled':''} ${extra}>${label}</button>`;
const changed=()=>state.applied && JSON.stringify(state.applied)!==JSON.stringify(state.filters);
const brainLabels={decision:'Rozhodnout',todo:'Vyřídit',waiting:'Čekám',information:'Informace'};
function brainReply(box,inbound,replySubject,safeApprovalUrl){
  if(!box.canSend)return '';
  const draft=state.brainDraft;
  const saved=state.brainReplyEdit&&state.brainReplyEdit.caseId===state.brainCase?.case.id?
    state.brainReplyEdit.message:state.brainReply?.message;
  return `<h4>Odpověď k případu</h4>${draft?`<p>Návrh je uložený. Nic se neodeslalo.</p><p><strong>Komu:</strong> ${escape(draft.message.to.join(', '))}<br><strong>Předmět:</strong> ${escape(draft.message.subject)}</p><pre>${escape(draft.message.text)}</pre>${!state.brainApproval?button('brain-approve-prepare','Připravit schválení'):''}`:
    `<form data-brain-reply><label>Komu<input name="to" type="email" required value="${escape(saved?.to[0]??inbound?.sender??'')}"></label><label>Předmět<input name="subject" required maxlength="500" value="${escape(saved?.subject??`Re: ${replySubject}`)}"></label><label>Text odpovědi<textarea name="text" required maxlength="96000" rows="7">${escape(saved?.text??'')}</textarea></label><button type="submit" class="primary-action" ${state.busy?'disabled':''}>Uložit návrh odpovědi</button></form>`}
    ${safeApprovalUrl?`<p>Odeslání vyžaduje kontrolu celého návrhu v SO.ai. <a href="${escape(safeApprovalUrl)}" target="_blank" rel="noopener noreferrer">Otevřít schválení odeslání</a></p>`:''}`;
}
function brainPanel(){
  const view=state.brain,box=view?.mailboxes.find(item=>item.id===state.mailboxId);
  const inbound=state.brainCase?.messages.filter(m=>m.direction==='inbound').at(-1);
  const replySubject=state.brainCase?.case.title.replace(/^re:\s*/i,'')??'';
  const approvalUrl=state.brainApproval?.approvalUrl;
  const safeApprovalUrl=typeof approvalUrl==='string'&&approvalUrl.startsWith('https://smart-odpady.ai/forpsi-send/?proposalId=')?approvalUrl:null;
  if(view?.schemaVersion==='mail-brain-attention.v2.2')return renderWorkPanel({view,detail:state.brainCase,
    mailboxId:state.mailboxId,busy:state.busy,notice:state.brainSyncNotice,
    replyHtml:brainReply(box??{},inbound,replySubject,safeApprovalUrl)});
  return `<section class="forpsi-card" aria-label="Mail Brain"><div class="forpsi-card-heading"><div><h2>TEĎ</h2><p>Případy, závazky a další krok.</p></div>${button('brain-refresh','Obnovit přehled')}</div>
    ${!view?'<p>Přehled zatím nebyl načten.</p>':!box?.consented?`<p>Analýza historie této schránky vyžaduje samostatný souhlas. Zpracuje Doručené a Odeslané za posledních 90 dní; původní zprávy zůstávají ve Forpsi.</p><button type="button" class="primary-action" data-mail-action="brain-consent" ${state.busy?'disabled':''}>Souhlasím se zpracováním 90 dní</button>`:
      `<p><strong>Pokrytí: ${box.coverage==='complete'?'úplné pro uvedené období':'neúplné'}</strong>. ${escape(view.notice)}</p>
      ${state.brainSyncNotice?`<p role="status">${escape(state.brainSyncNotice)}</p>`:''}
      <div class="forpsi-actions">${button('brain-sync',box.coverage==='complete'?'Načíst novou poštu':'Pokračovat v synchronizaci')}${button('brain-revoke','Odvolat souhlas')}</div>
      <p>Rozhodnout: ${view.counts.decision} · Vyřídit: ${view.counts.todo} · Čekám: ${view.counts.waiting} · Termíny do 7 dní: ${view.counts.deadlines} · Po termínu: ${view.counts.overdue} · Faktury: ${view.counts.invoices}${view.counts.review?` · K ověření: ${view.counts.review}`:''}</p>
      <ol class="forpsi-mail-list">${view.cases.filter(c=>c.mailbox_id===state.mailboxId).map(c=>`<li><button type="button" data-mail-action="brain-open" data-case-id="${escape(c.id)}" ${state.busy?'disabled':''}><strong>${escape(c.title)}</strong><span>${c.analysis_status==='evidence_backed'?escape(brainLabels[c.state]??c.state):'K ověření'} · ${escape(c.reason??'Důvod zatím nebyl ověřen.')}</span><small>${date(c.latest_at)}</small></button></li>`).join('')||'<li>Žádný otevřený případ v načtené části.</li>'}</ol>
      <form data-brain-search><label>Hledat v načtené poště<input name="query" minlength="2" maxlength="200" required></label><button type="submit" class="secondary-link" ${state.busy?'disabled':''}>Hledat</button></form>
      ${state.brainSearch?`<p>Výsledků: ${state.brainSearch.results.length}. Vyhledává se pouze v načtené části.</p><ol class="forpsi-mail-list">${state.brainSearch.results.map(m=>`<li><button type="button" data-mail-action="brain-open" data-case-id="${escape(m.case_id)}"><strong>${escape(m.subject)}</strong><span>${escape(m.sender)} · ${date(m.received_at)}</span></button></li>`).join('')}</ol>`:''}
      <details><summary>Pravidla případů</summary><p>Pořadí: firma → uživatel → naučené preference → návrh AI. Osobní priorita mění jen váš pohled a začne platit až po schválení zde.</p><ul>${(state.brainRules?.rules??[]).map(r=>`<li>${escape(r.source)} · ${escape(r.category)}${r.sender_address?` · ${escape(r.sender_address)}`:''} → ${escape(r.action)}${r.destination?` · ${escape(r.destination)}`:''} · ${r.enabled?'zapnuto':'vypnuto'} ${box.canWrite&&r.source==='user'&&!r.enabled&&['prioritize','deprioritize'].includes(r.action)?button('brain-rule-activate','Zapnout',`data-rule-id="${escape(r.id)}" data-rule-version="${r.version}"`):''}${box.canWrite&&r.source!=='company'&&r.enabled?button('brain-rule-disable','Vypnout',`data-rule-id="${escape(r.id)}" data-rule-version="${r.version}"`):''}</li>`).join('')||'<li>Žádná pravidla.</li>'}</ul></details>
      ${state.brainCase?`<article class="forpsi-mail-message"><h3>${escape(state.brainCase.case.title)}</h3><p>${state.brainCase.case.analysis_status==='evidence_backed'?escape(brainLabels[state.brainCase.case.state]??state.brainCase.case.state):'K ověření'} · ${escape(state.brainCase.case.reason??'Bez ověřeného důvodu')}</p>
        ${box.canWrite?`<div class="forpsi-actions">${button('brain-action','Vyřídit',`data-next-state="todo"`)}${button('brain-action','Čekám',`data-next-state="waiting"`)}${button('brain-action','Hotovo',`data-next-state="done"`)}</div>`:''}
        ${state.brainCase.case.reason_quote?`<p>Zdroj: „${escape(state.brainCase.case.reason_quote)}“</p>`:''}
        <h4>Závazky</h4><ul>${state.brainCase.commitments.map(k=>`<li>${escape(k.actor==='us'?'My → oni':'Oni → my')}: ${escape(k.action_text)}${k.due_date?` · ${escape(k.due_date)}`:' · termín nevyjasněný'}<br><small>„${escape(k.evidence_quote)}“</small></li>`).join('')||'<li>Žádný doložený závazek.</li>'}</ul>
        <h4>Časová osa</h4>${state.brainCase.messages.map(m=>`<details><summary>${date(m.received_at)} · ${escape(m.subject)} · ${escape(m.sender)}</summary><pre>${escape(m.body_text)}</pre></details>`).join('')}
        <h4>Přílohy</h4><ul>${state.brainCase.attachments.map(a=>`<li>${escape(a.filename)} · ${escape(a.verified_type??a.declared_type)} · ${escape(a.scan_status)} ${a.sha256?button('brain-attachment','Ověřit soubor',`data-attachment-id="${escape(a.id)}"`):''}</li>`).join('')||'<li>Bez příloh.</li>'}</ul>${state.brainAttachment?`<p>Soubor ${state.brainAttachment.sourceUnchanged?'odpovídá uloženému otisku':'se změnil nebo je nebezpečný'}. ${state.brainAttachment.previewAvailable?'Náhled je povolen.':'Náhled čeká na bezpečnostní kontrolu.'}</p>`:''}
        ${brainReply(box,inbound,replySubject,safeApprovalUrl)}</article>`:''}`}</section>`;
}
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
    ${state.mailboxId?'<div data-forpsi-composer-root></div>':''}
    ${state.mailboxId&&state.brainEnabled&&state.mailboxes.find(m=>m.id===state.mailboxId)?.brainEnabled?brainPanel():''}
    ${state.mailboxId&&state.replaceCapability!==null?`<p class="forpsi-mail-status">Nahrazení původního konceptu: ${state.replaceCapability?'server podporuje bezpečné nahrazení':'server bezpečné nahrazení nehlásí'}. ${state.canEditDrafts?'Dostupná pro tuto schránku.':'V SO.ai pro tuto schránku zatím nedostupná.'}</p>`:''}
    ${state.canCopyDrafts?'<p class="forpsi-mail-status">Upravenou kopii textového konceptu lze uložit; původní koncept zůstane zachovaný.</p>':''}
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
  mountForpsiComposer(root.querySelector('[data-forpsi-composer-root]'),{owner:state.owner,mailboxId:state.mailboxId,apiJson:state.api,guard:state.guard,onSaved:()=>{state.message=null;void search();}});
}
function results(){
  const r=state.result;if(!r)return '';
  const m=state.message;
  return `<p data-mail-filter-state ${changed()?'':'hidden'}>Filtry jsou změněné. Pro nové výsledky stiskněte Hledat zprávy.</p>
    <p>Výsledky aktuální dávky: ${r.messages.length}. ${r.nextBeforeUid?'Ve složce zbývá starší část k prohledání.':'Prohledávání bylo dokončeno.'}</p>
    ${r.messages.length?`<ol class="forpsi-mail-list">${r.messages.map((item,i)=>`<li><button type="button" data-mail-action="read" data-index="${i}" ${state.busy?'disabled':''}><strong>${escape(item.subject || '(bez předmětu)')}</strong><span>${escape(item.from.map(a=>a.name?`${a.name} <${a.address}>`:a.address).join(', '))}</span><small>${date(item.date)}${item.flags.includes('\\Seen')?'':' · nepřečtené'}${item.flags.includes('\\Flagged')?' · označené hvězdičkou':''}</small></button></li>`).join('')}</ol>`:'<p>V této dávce nejsou odpovídající zprávy.</p>'}
    ${r.nextBeforeUid?button('next','Prohledat starší část',changed()?'disabled':''):''}
    ${m?`<article class="forpsi-card forpsi-mail-message" data-mail-message><div class="forpsi-actions">${button('close','Zavřít zprávu')}${state.canEditDrafts&&state.draftFolder===m.reference?.folder&&m.flags.includes('\\Draft')?button('edit-draft','Upravit koncept'):''}${state.canCopyDrafts&&state.draftFolder===m.reference?.folder&&m.flags.includes('\\Draft')?button('copy-draft','Vytvořit upravenou kopii'):''}</div><h2>${escape(m.subject || '(bez předmětu)')}</h2><p>${escape(m.from.map(a=>a.address).join(', '))} · ${date(m.date)}</p><pre>${escape(m.text)}</pre>${m.truncated?'<p>Zobrazený text je zkrácený.</p>':''}${m.attachments?.length?`<h3>Přílohy</h3><ul>${m.attachments.map(a=>`<li>${escape(a.filename || 'Bez názvu')} · ${escape(a.contentType)} · ${a.size} B</li>`).join('')}</ul><p>Stahování příloh zatím není zapojené.</p>`:''}</article>`:''}`;
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
async function refresh(){clearContent();state.loaded=false;state.mailboxes=[];state.folders=[];state.draftFolder=null;state.replaceCapability=null;state.canEditDrafts=false;state.canCopyDrafts=false;state.mailboxId='';state.brainEnabled=false;state.brainV2Enabled=false;state.workCommand=null;await request('list_mailboxes',{},data=>{state.mailboxes=data.mailboxes;state.brainEnabled=data.brainEnabled===true;state.brainV2Enabled=data.brainV2Enabled===true;state.loaded=true;});
  const linked=typeof location!=='undefined'?new URLSearchParams(location.search).get('forpsiMailboxId'):null;
  if(linked&&state.mailboxes.some(m=>m.id===linked))await chooseMailbox(linked);}
async function chooseMailbox(id){clearContent();state.mailboxId=id;state.brain=null;state.brainCase=null;state.brainSearch=null;state.brainRules=null;state.brainAttachment=null;state.brainDraft=null;state.brainApproval=null;state.brainReply=null;state.brainSyncNotice='';state.folders=[];state.draftFolder=null;state.replaceCapability=null;state.canEditDrafts=false;state.canCopyDrafts=false;state.filters=emptyFilters();if(!id){paint();return;}
  await request('list_folders',{mailboxId:id},data=>{state.folders=data.folders.filter(f=>f.selectable!==false);state.draftFolder=data.draftFolder;state.replaceCapability=typeof data.supportsReplace==='boolean'?data.supportsReplace:null;state.canEditDrafts=data.draftEditsEnabled===true&&data.supportsReplace===true&&data.draftWriteAllowed===true&&!!data.draftFolder;state.canCopyDrafts=data.draftCopiesEnabled===true&&data.draftWriteAllowed===true&&!!data.draftFolder;state.filters.folder=state.folders.some(f=>f.path==='INBOX')?'INBOX':state.folders[0]?.path || '';});
  if(state.brainEnabled&&state.mailboxes.find(m=>m.id===id)?.brainEnabled)await refreshBrain();
  const linkedCase=typeof location!=='undefined'?new URLSearchParams(location.search).get('forpsiCaseId'):null;
  if(linkedCase&&state.brainV2Enabled&&state.brain)await openBrainCase(linkedCase);}
async function brainRequest(operation,payload,onSuccess){
  if(state.busy)return false;const epoch=state.epoch;state.busy=true;state.error='';paint();
  try{const response=await state.api('/api/forpsi/brain',{method:'POST',body:JSON.stringify({operation,payload})});
    if(epoch!==state.epoch)return false;onSuccess(response.data);return true;
  }catch(e){if(epoch!==state.epoch)return;state.error=e.message;
    if([401,403].includes(e.status)){state.brain=null;state.brainCase=null;}
    if(['VIEW_EXPIRED','WORK_VERSION_CONFLICT'].includes(e.code??e.payload?.code)){
      state.brain=null;state.brainCase=null;state.workCommand=null;
      state.error='Případ nebo přístup se mezitím změnil. Obnovte přehled a zkontrolujte aktuální podklady.';}}
  finally{if(epoch===state.epoch){state.busy=false;paint();}}
  return false;
}
async function refreshBrain(){if(!state.mailboxId)return;
  await brainRequest('attention',{mailboxId:state.mailboxId,...(state.brainV2Enabled?{version:'2.2'}:{})},data=>{state.brain=data;});
  if(!state.brainV2Enabled&&state.brain?.mailboxes.find(x=>x.id===state.mailboxId)?.consented)
    await brainRequest('rules',{operation:'list',mailboxId:state.mailboxId},data=>{state.brainRules=data;});}
async function openBrainCase(caseId){return brainRequest('case_get',{caseId,...(state.brainV2Enabled?{version:'2.2'}:{})},data=>{
  if(state.brainCase?.case.id!==caseId){state.brainReplyEdit=null;state.brainDraft=null;state.brainApproval=null;state.brainReply=null;}
  state.brainCase=data;state.brainAttachment=null;});}
async function updateWork(operation,payload){const caseId=payload.caseId;
  if(await brainRequest(operation,payload,()=>{state.workCommand=null;})){
    await refreshBrain();if(state.brain)await openBrainCase(caseId);
  }}
function submitWorkAction(action,scope,targetId,payload={},until,extra={}){
  const work=state.brainCase?.work;if(!work)return;
  if(action==='snooze'&&state.workCommand?.input.action===action&&state.workCommand.input.targetId===targetId)
    until=state.workCommand.input.until;
  const input={caseId:work.caseId,revision:work.revision,scope,action,...(targetId?{targetId}:{}),payload,...(until?{until}:{}),...extra};
  // Repeating a request after a lost response keeps its idempotency key.
  const fingerprint=JSON.stringify(input);
  if(state.workCommand?.fingerprint!==fingerprint)state.workCommand={fingerprint,input:{...input,requestId:crypto.randomUUID()}};
  void updateWork('work_action',state.workCommand.input);
}
async function search(next=false){
  const f={...state.filters};
  if(!f.folder || (f.since&&f.through&&f.since>f.through)){state.error='Datum od musí být nejpozději v den data do.';paint();return;}
  if(next&&changed())return;
  const payload=mailSearchPayload(state.mailboxId,f,next?state.result?.nextBeforeUid:null);
  clearContent();await request('search_messages',payload,data=>{state.result=data;state.applied=f;});
}
export function mountForpsiMail(app,{apiJson,owner,guard}){
  const root=app.querySelector('[data-forpsi-mail-root]');
  if(state.owner!==owner || !root){state={owner,epoch:state.epoch+1,root:null,api:apiJson,loaded:false,busy:false,mailboxes:[],mailboxId:'',folders:[],draftFolder:null,replaceCapability:null,canEditDrafts:false,canCopyDrafts:false,filters:emptyFilters(),applied:null,result:null,message:null,error:'',mode:null,brain:null,brainCase:null,brainSearch:null,brainRules:null,brainAttachment:null,brainDraft:null,brainApproval:null,brainReply:null,brainEnabled:false,brainSyncNotice:''};}
  if(!root){mountForpsiComposer(null,{owner,mailboxId:'',apiJson,guard});return;}state.root=root;state.api=apiJson;state.guard=guard;
  root.addEventListener('input',event=>{if(event.target.form?.matches('[data-mail-search]')){
    state.filters[event.target.name]=event.target.type==='checkbox'?event.target.checked:event.target.value;
    const hint=root.querySelector('[data-mail-filter-state]');if(hint)hint.hidden=!changed();
    const next=root.querySelector('[data-mail-action="next"]');if(next)next.disabled=!!changed();
  }
  if(event.target.form?.matches('[data-brain-reply]')&&state.brainCase){
    const form=new FormData(event.target.form);state.brainReplyEdit={caseId:state.brainCase.case.id,
      message:{to:[String(form.get('to')??'')],subject:String(form.get('subject')??''),text:String(form.get('text')??'')}};
  }});
  root.addEventListener('change',event=>{if(event.target.matches('[data-mail-mailbox]')){const id=event.target.value;event.target.value=state.mailboxId;const action=()=>chooseMailbox(id);if(forpsiComposerDirtyTarget())guard(action);else void action();}});
  root.addEventListener('submit',event=>{if(event.target.matches('[data-mail-search]')){event.preventDefault();event.stopPropagation();void search();}
    if(event.target.matches('[data-work-review]')){event.preventDefault();event.stopPropagation();
      const work=state.brainCase?.work;if(!work||!event.target.reportValidity())return;
      const form=new FormData(event.target),replacement=work.acceptedInterpretations.find(e=>e.id===form.get('replacesEventId'));
      void updateWork('work_review',{caseId:work.caseId,revision:work.revision,eventId:event.target.dataset.eventId,
        outcome:'accepted',authorityConfirmed:form.get('authority')==='on',...(replacement?{
          replacesEventIds:[replacement.id],identityRelation:'same_work',canonicalWorkItemId:replacement.workItemId,
          ...(form.get('manualBinding')?{manualBinding:String(form.get('manualBinding'))}:{})}:
          form.get('replacesEventId')==='distinct'?{identityRelation:'distinct_work'}:{})});}
    if(event.target.matches('[data-work-command]')){event.preventDefault();event.stopPropagation();
      const work=state.brainCase?.work;if(!work||!event.target.reportValidity())return;
      const form=new FormData(event.target),value=name=>String(form.get(name)??'').trim();
      let action=event.target.dataset.workAction;const payload={},extra={note:value('note')};
      const owner=work.entities.find(e=>e.id===value('ownerId'));
      if(owner)payload.owner=owner;
      if(value('actionText'))payload.action=value('actionText');
      if(value('dueDate'))payload.dueDate={kind:'date',value:value('dueDate'),timeZone:'Europe/Prague'};
      if(value('result'))payload.result=value('result');
      if(action==='reopened'){payload.releaseProtection=true;payload.retainDue=form.get('retainDue')==='on';}
      if(action==='accepted')payload.acceptanceKind='offer';
      if(action==='override_owner'||action==='override_action'){
        payload.property=action==='override_owner'?'owner':'action';payload.operation='set';action='overridden';}
      if(action==='override_condition'){
        payload.property='condition';payload.operation='set';action='overridden';
        payload.condition={kind:value('conditionKind'),description:value('conditionDescription'),
          dependsOnWorkItemIds:form.getAll('dependencyIds').map(String),
          requiredResult:form.get('requirePositive')==='on'?'positive':'any',
          documentKey:value('documentKey')||null,counterpartyId:value('counterpartyId')||null,
          onDependencyCancelled:'block_and_review'};
      }
      if(action==='release_override'){payload.property=value('property');payload.operation='release';action='overridden';}
      if(action==='condition_evaluated')extra.conditionEvaluation={result:value('conditionResult'),
        contentConfirmed:form.get('contentConfirmed')==='on',...(value('attachmentId')?{attachmentId:value('attachmentId')}:{}),
        ...(value('messageId')?{messageId:value('messageId'),relevantResponse:form.get('contentConfirmed')==='on'}:{})};
      submitWorkAction(action,'shared',event.target.dataset.targetId||undefined,payload,undefined,extra);}
    if(event.target.matches('[data-brain-search]')){event.preventDefault();event.stopPropagation();
      const query=String(new FormData(event.target).get('query')??'').trim();
      if(query.length>=2)void brainRequest('search',{query,mailboxId:state.mailboxId},data=>{state.brainSearch=data;});}
    if(event.target.matches('[data-brain-reply]')){event.preventDefault();event.stopPropagation();
      if(!state.brainCase||!event.target.reportValidity())return;
      const form=new FormData(event.target),selected=state.brainCase.case;
      const message={to:[String(form.get('to')??'').trim()],cc:[],bcc:[],
        subject:String(form.get('subject')??'').trim(),text:String(form.get('text')??'').trim()};
      const requestId=state.brainReply&&JSON.stringify(state.brainReply.message)===JSON.stringify(message)?
        state.brainReply.requestId:crypto.randomUUID();state.brainReply={message,requestId};
      void brainRequest('draft_create',{caseId:selected.id,caseRevision:selected.revision,
        requestId,message},data=>{state.brainDraft=data;state.brainApproval=null;});}});
  root.addEventListener('click',event=>{const b=event.target.closest('[data-mail-action]');if(!b)return;event.preventDefault();event.stopPropagation();if(state.busy)return;
    if(b.dataset.mailAction==='brain-refresh'){void refreshBrain();return;}
    if(b.dataset.mailAction==='brain-consent'){void brainRequest('consent',{mailboxId:state.mailboxId,lookbackDays:90},()=>{}).then(ok=>{if(ok)void refreshBrain();});return;}
    if(b.dataset.mailAction==='brain-revoke'){void brainRequest('revoke',{mailboxId:state.mailboxId},()=>{state.brainCase=null;state.brainDraft=null;state.brainApproval=null;state.brainReply=null;}).then(ok=>{if(ok)void refreshBrain();});return;}
    if(b.dataset.mailAction==='brain-sync'){void brainRequest('sync',{mailboxId:state.mailboxId,limit:10},data=>{
      state.brainSyncNotice=data.analysisErrorCode?
        `Modelová analýza selhala (${data.analysisErrorCode}); zprávy zůstávají k ověření.`:'';
    }).then(ok=>{if(ok)void refreshBrain();});return;}
    if(b.dataset.mailAction==='brain-open'){void openBrainCase(b.dataset.caseId).then(()=>root.querySelector('.forpsi-mail-message')?.scrollIntoView({block:'start'}));return;}
    if(b.dataset.mailAction==='work-next'&&state.brain?.pagination.nextCursor){void brainRequest('attention',{
      version:'2.2',mailboxId:state.mailboxId,cursor:state.brain.pagination.nextCursor},data=>{state.brain=data;});return;}
    if(b.dataset.mailAction==='work-refresh'){void updateWork('work_refresh',{caseId:b.dataset.caseId});return;}
    if(b.dataset.mailAction==='work-reject'&&state.brainCase?.work){const work=state.brainCase.work;
      void updateWork('work_review',{caseId:work.caseId,revision:work.revision,eventId:b.dataset.eventId,
        outcome:'rejected',authorityConfirmed:false});return;}
    if(b.dataset.mailAction==='work-action'){const action=b.dataset.workAction;
      submitWorkAction(action,b.dataset.scope,b.dataset.targetId,
        action==='reopened'?{releaseProtection:true,retainDue:false}:action==='completed'?{result:'unspecified'}:{},
        action==='snooze'?Date.now()+86400000:undefined);return;}
    if(b.dataset.mailAction==='brain-attachment'){void brainRequest('attachment_get',{attachmentId:b.dataset.attachmentId},data=>{state.brainAttachment=data;});return;}
    if(b.dataset.mailAction==='brain-action'&&state.brainCase){const c=state.brainCase.case;
      void brainRequest('case_action',{caseId:c.id,revision:c.revision,action:b.dataset.nextState},()=>{state.brainCase=null;state.brainDraft=null;state.brainApproval=null;state.brainReply=null;}).then(()=>refreshBrain());return;}
    if(b.dataset.mailAction==='brain-approve-prepare'&&state.brainDraft){
      void brainRequest('message_send',{draftId:state.brainDraft.draftId},data=>{state.brainApproval=data;});return;}
    if(b.dataset.mailAction==='brain-rule-activate'){void brainRequest('rule_activate',{mailboxId:state.mailboxId,
      ruleId:b.dataset.ruleId,version:Number(b.dataset.ruleVersion)},()=>{}).then(()=>refreshBrain());return;}
    if(b.dataset.mailAction==='brain-rule-disable'){void brainRequest('rules',{operation:'disable',mailboxId:state.mailboxId,
      ruleId:b.dataset.ruleId,version:Number(b.dataset.ruleVersion)},()=>{}).then(()=>refreshBrain());return;}
    if(b.dataset.mailAction==='refresh'){if(forpsiComposerDirtyTarget())guard(()=>refresh());else void refresh();}
    if(b.dataset.mailAction==='next')void search(true);
    if(b.dataset.mailAction==='close'){state.message=null;paint();}
    if(b.dataset.mailAction==='edit-draft' && state.message?.reference){const ref=state.message.reference;const action=()=>{void openForpsiDraft(ref);};if(forpsiComposerDirtyTarget())guard(action);else action();}
    if(b.dataset.mailAction==='copy-draft' && state.message?.reference){const ref=state.message.reference;const action=()=>{void openForpsiDraft(ref,{copy:true});};if(forpsiComposerDirtyTarget())guard(action);else action();}
    if(b.dataset.mailAction==='read'){const ref=state.result?.messages[Number(b.dataset.index)]?.reference;if(ref){state.message=null;void request('read_message',{mailboxId:state.mailboxId,message:ref},data=>{state.message=data;}).then(()=>{root.querySelector('[data-mail-message]')?.scrollIntoView({block:'start'});});}}
  });
  paint();if(!state.loaded&&!state.busy)void refresh();
}
