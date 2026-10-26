import { hasPermission } from "../permissions.js";
const draft={description:"",attachment:null,userId:""};
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const states=new Set(['deployed','rolled_back']);
async function api(options) {
  const response=await fetch('/api/repair/reports',{credentials:'same-origin',...options});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Hlášení nelze načíst.');return data;
}
async function load(root) {
  try {
    const data=await api();
    root.querySelector('[data-repair-status]').textContent=data.automationEnabled?'Běžné opravy může systém po úspěšných kontrolách nasadit automaticky.':'Hlášení ukládáme. Automatické opravy zatím nejsou aktivované.';
    root.querySelector('[data-repair-list]').innerHTML=data.reports.length?data.reports.map(r=>`<article class="feedback-workflow-content-card"><h3>${escape(r.title)}</h3><p><strong>${escape(r.stateLabel)}</strong> · ${escape(r.reporter_user_name)} · ${escape(new Date(r.created_at).toLocaleString('cs-CZ'))}</p><p>${escape(r.detail)}</p><a href="/pripominky/${encodeURIComponent(r.case_id)}" data-link>Detail a příloha · ${escape(r.case_number)}</a>${r.result_sha&&states.has(r.state)?`<p><a href="https://github.com/kaiser-smart/kaiser-control-center/commit/${encodeURIComponent(r.result_sha)}" target="_blank" rel="noopener">${r.state==='rolled_back'?'Vrácená oprava':'Nasazená oprava'} ${escape(r.result_sha.slice(0,7))}</a></p>`:''}</article>`).join(''):'<p>Zatím jste nic nenahlásili.</p>';
  }catch(e){root.querySelector('[data-repair-status]').textContent=e.message;}
}
const mounted=new WeakSet();
function mount(){
  const root=document.querySelector('[data-repair-root]');if(!root||mounted.has(root))return;mounted.add(root);
  load(root);
  root.querySelector("textarea").value=draft.description;
  root.querySelector("textarea").addEventListener("input",e=>{draft.description=e.target.value;});
  root.querySelector("input[type=file]").addEventListener("change",e=>{draft.attachment=e.target.files?.[0]||null;root.querySelector('[data-repair-attachment-name]').textContent=draft.attachment?.name||'';});
  root.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),notice=root.querySelector('[data-repair-notice]');if(button.disabled)return;
    button.disabled=true;notice.textContent='Ukládám…';
    try {const body=new FormData(form); if(draft.attachment)body.set("attachment",draft.attachment); const result=await api({method:'POST',body});notice.textContent=result.deduplicated?'Toto hlášení už máte uložené.':'Hlášení je uložené. Stav najdete níže.';form.elements.description.value='';form.elements.attachment.value='';draft.description='';draft.attachment=null;root.querySelector('[data-repair-attachment-name]').textContent='';await load(root);}catch(e){notice.textContent=e.message;}finally{button.disabled=false;}
  });
}
export function RepairModule(user,version) {
  if(draft.userId!==String(user.id||user.email)){draft.description="";draft.attachment=null;draft.userId=String(user.id||user.email);}
  let source='/';try{const url=new URL(new URL(location.href).searchParams.get('page')||'/',location.origin);if(url.origin===location.origin)source=url.pathname;}catch{}
  queueMicrotask(mount);
  return `<main class="app-shell module-page feedback-workflow-page repair-module" data-repair-root><nav class="topbar"><a href="/" data-link>Zpět na přehled</a></nav><section class="feedback-workflow-hero"><h1>Opravit</h1><p>Co nefunguje nebo co chcete změnit? Stačí popis vlastními slovy.</p></section><p data-repair-status role="status">Načítám stav…</p><section class="feedback-workflow-new"><form ${hasPermission(user,"feedback","create")?"":"hidden"}><label class="feedback-workflow-field--wide">Stránka<input name="sourceRoute" value="${escape(source)}" maxlength="600" required></label><label class="feedback-workflow-field--wide">Co máme opravit?<textarea name="description" rows="5" minlength="5" maxlength="8000" required placeholder="Například: Na telefonu nevidím celé tlačítko Uložit."></textarea></label><label class="feedback-workflow-field--wide">Screenshot nebo fotografie (volitelné, PNG/JPEG do 5 MB)<input type="file" name="attachment" accept="image/png,image/jpeg"><small data-repair-attachment-name>${escape(draft.attachment?.name||"")}</small></label><input type="hidden" name="buildVersion" value="${escape(version)}"><p>Autor: ${escape(user.name||user.email)}. Datum doplníme automaticky.</p><button class="primary-action" type="submit">Odeslat hlášení</button><p data-repair-notice role="status" aria-live="polite"></p></form></section><h2>Hlášení a stav oprav</h2><section data-repair-list></section></main>`;
}
