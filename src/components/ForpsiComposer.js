const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={owner:null,mailboxId:'',epoch:0,root:null,api:null,guard:null,context:null,form:null,dirty:false,busy:false,error:'',notice:'',submitted:null,preview:false};
const addresses=value=>value.split(/[;,\n]/).map(s=>s.trim()).filter(Boolean);
export function composerPayload(mailboxId,form,profileRevision) {
  return {mailboxId,requestId:form.requestId,profileRevision,useSignature:form.useSignature,
    message:{to:addresses(form.to),cc:addresses(form.cc),bcc:addresses(form.bcc),subject:form.subject,text:form.text}};
}
export function composedText(form,profile) {return form.text+(form.useSignature&&profile.signatureText?`\n\n-- \n${profile.signatureText}`:'');}
export const forpsiComposerDirtyTarget=()=>state.root?.isConnected && (state.dirty || state.busy)?{isDirty:true,type:'forpsi-composer'}:null;
export function discardForpsiComposer(){state.form=null;state.dirty=false;state.submitted=null;state.preview=false;state.error='';paint();}
const button=(action,label)=>`<button type="button" class="secondary-link" data-composer-action="${action}" ${state.busy?'disabled':''}>${label}</button>`;
function paint(){
  if(!state.root?.isConnected)return;
  const c=state.context,d=state.form;
  state.root.innerHTML=`<div class="forpsi-actions">${!d?button('open','Nový koncept'):''}</div>
    <p role="status">${escape(state.notice || (state.busy?'Načítám…':''))}</p>${state.error?`<p role="alert">${escape(state.error)}</p>`:''}
    ${d&&c?`<section class="forpsi-card forpsi-composer"><h2>Nový koncept</h2><p>Od: <strong>${escape(c.profile.senderName?`${c.profile.senderName} <${c.address}>`:c.address)}</strong></p>
      <p>Uloží se do složky Koncepty ve Forpsi. Příjemcům se nic neodešle.</p>
      <form data-composer-form><fieldset ${state.busy||state.submitted?'disabled':''}><div class="forpsi-grid">
        <label>Komu<input name="to" value="${escape(d.to)}" required maxlength="13000" placeholder="jmeno@firma.cz"></label>
        <label>Předmět<input name="subject" value="${escape(d.subject)}" maxlength="500"></label>
      </div><details ${d.cc||d.bcc?'open':''}><summary>Kopie a skrytá kopie</summary><div class="forpsi-grid">
        <label>Kopie<input name="cc" value="${escape(d.cc)}" maxlength="13000"></label><label>Skrytá kopie<input name="bcc" value="${escape(d.bcc)}" maxlength="13000"></label>
      </div></details><small>Více adres oddělte čárkou nebo středníkem. Celkem nejvýše 50 příjemců.</small>
      <label>Zpráva<textarea name="text" aria-label="Zpráva" rows="9" required maxlength="96000">${escape(d.text)}</textarea></label>
      ${c.profile.signatureText?`<label class="forpsi-mail-check"><input type="checkbox" name="useSignature" ${d.useSignature?'checked':''}>Připojit podpis schránky</label>`:'<p>Schránka nemá uložený podpis SO.ai. Správce jej může přidat v nastavení Forpsi.</p>'}
      </fieldset><div class="forpsi-actions">${button('preview',state.preview?'Skrýt náhled':'Náhled zprávy')}
        <button class="primary-action" type="submit" ${state.busy?'disabled':''}>${state.submitted?'Ověřit / dokončit uložení':'Uložit koncept do Forpsi'}</button>${button('close','Zavřít koncept')}
        ${!state.submitted?button('profile','Obnovit podpis'):''}</div>
      <small>Nový textový koncept bez příloh. Existující koncepty upravíte ve webmailu. Rozpracovaný text se uloží až tlačítkem Uložit koncept.</small></form>
      ${state.submitted?'<p>Pokus už byl zahájen. Ověření použije stejný obsah a stejné označení pokusu. Při nejistém výsledku zkontrolujte Koncepty ve Forpsi před založením nové zprávy.</p>':''}
      ${state.preview?`<article class="forpsi-compose-preview"><h3>Náhled zprávy</h3><p>Komu: ${escape(d.to)}${d.cc?`<br>Kopie: ${escape(d.cc)}`:''}${d.bcc?`<br>Skrytá kopie: ${escape(d.bcc)}`:''}</p><h4>${escape(d.subject || '(bez předmětu)')}</h4><pre>${escape(composedText(d,c.profile))}</pre></article>`:''}</section>`:''}`;
}
async function context(open=false){
  if(state.busy)return;const epoch=state.epoch;state.busy=true;state.error='';paint();
  try {
    const r=await state.api('/api/forpsi/mail',{method:'POST',body:JSON.stringify({operation:'composition_context',payload:{mailboxId:state.mailboxId}})});
    if(epoch!==state.epoch)return;state.context=r.data;
    if(!r.data.draftsEnabled)state.error='Ukládání konceptů zatím není zapnuté.';
    else if(!r.data.canWrite)state.error='Máte právo čtení. Ukládání konceptů vyžaduje právo Úpravy pro tuto schránku.';
    else if(open){state.form={requestId:crypto.randomUUID(),to:'',cc:'',bcc:'',subject:'',text:'',useSignature:true};state.dirty=false;state.submitted=null;state.preview=false;state.notice='';}
    if(state.form && (!r.data.draftsEnabled || !r.data.canWrite)){state.form=null;state.dirty=false;state.submitted=null;}
  }catch(e){if(epoch===state.epoch){state.error=e.message;if([401,403].includes(e.status)){state.form=null;state.dirty=false;state.submitted=null;}}}
  finally{if(epoch===state.epoch){state.busy=false;paint();if(open&&state.form){state.root?.querySelector('[name="to"]')?.focus?.();state.root?.querySelector('.forpsi-composer')?.scrollIntoView?.({block:'start'});}}}
}
export async function saveForpsiComposer(){
  if(state.busy || !state.form)return false;
  const form=state.root?.querySelector('[data-composer-form]');if(!form?.reportValidity())return false;
  const epoch=state.epoch;
  const payload=state.submitted || composerPayload(state.mailboxId,state.form,state.context.profile.revision);
  if(!payload.message.to.length || [...payload.message.to,...payload.message.cc,...payload.message.bcc].some(a=>!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(a)) || payload.message.to.length+payload.message.cc.length+payload.message.bcc.length>50){state.error='Zadejte platné e-mailové adresy, celkem nejvýše 50.';paint();return false;}
  state.submitted=payload;state.busy=true;state.error='';state.notice='Ukládám koncept…';paint();
  try {
    const r=await state.api('/api/forpsi/mail',{method:'POST',body:JSON.stringify({operation:'create_draft',payload})});
    if(epoch!==state.epoch)return false;
    if(r.data?.saved!==true)throw new Error('Uložení nebylo potvrzené. Ověřte stav stejného pokusu.');
    state.notice=`Koncept je uložený ve složce ${r.data.folder}. Nic nebylo odesláno.`;state.form=null;state.dirty=false;state.submitted=null;state.preview=false;return true;
  }catch(e){if(epoch===state.epoch){state.error=e.message;state.notice='';
    const code=e.code || e.payload?.code;
    if([400,413].includes(e.status) || ['PROFILE_CHANGED','SOAI_DRAFTS_DISABLED'].includes(code))state.submitted=null;
    if([401,403].includes(e.status)){state.form=null;state.dirty=false;state.submitted=null;state.context=null;}
  }return false;}
  finally{if(epoch===state.epoch){state.busy=false;paint();}}
}
export function mountForpsiComposer(root,{owner,mailboxId,apiJson,guard}){
  if(owner!==state.owner || mailboxId!==state.mailboxId){state={owner,mailboxId,epoch:state.epoch+1,root:null,api:null,guard:null,context:null,form:null,dirty:false,busy:false,error:'',notice:'',submitted:null,preview:false};}
  state.root=root;state.api=apiJson;state.guard=action=>state.dirty?guard(action):action();
  if(!root)return;
  root.addEventListener('input',event=>{if(event.target.form?.matches('[data-composer-form]')){state.form[event.target.name]=event.target.type==='checkbox'?event.target.checked:event.target.value;state.dirty=true;state.preview=false;root.querySelector('.forpsi-compose-preview')?.remove();const previewButton=root.querySelector('[data-composer-action="preview"]');if(previewButton)previewButton.textContent='Náhled zprávy';}});
  root.addEventListener('submit',event=>{if(event.target.matches('[data-composer-form]')){event.preventDefault();event.stopPropagation();void saveForpsiComposer();}});
  root.addEventListener('click',event=>{const b=event.target.closest('[data-composer-action]');if(!b)return;event.preventDefault();event.stopPropagation();if(state.busy)return;
    if(b.dataset.composerAction==='open')void context(true);
    if(b.dataset.composerAction==='profile')void context();
    if(b.dataset.composerAction==='close')state.guard(()=>discardForpsiComposer());
    if(b.dataset.composerAction==='preview'){state.preview=!state.preview;paint();}
  });paint();
}
