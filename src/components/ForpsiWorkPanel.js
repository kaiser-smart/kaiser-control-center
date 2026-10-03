const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={todo:'Vyřídit',decision:'Rozhodnout',waiting:'Čekám',information:'Informace',review:'K ověření'};
const categoryLabels={audit:'Audit',receipt:'Doklad o platbě',invoice:'Faktura',contract:'Smluvní dokumentace',
  newsletter:'Newsletter',marketing:'Nabídka',summary:'Souhrn',other:'Ostatní',unknown:'Neurčeno'};
const statusLabels={open:'Otevřené',completed:'Dokončené',cancelled:'Zrušené',informational:'Informace',unresolved:'Nevyjasněné'};
const propLabels={existence:'Existence práce',actor:'Autor',owner:'Vlastník',counterparty:'Protistrana',
  action:'Činnost',category:'Kategorie',dueDate:'Termín',condition:'Podmínka',result:'Výsledek'};
const kindLabels={requested:'Požadavek',promised:'Příslib',delegated:'Předání práce',accepted:'Převzetí',
  completed:'Dokončení',cancelled:'Zrušení',due_changed:'Změna termínu',due_removed:'Odvolání termínu',
  offered:'Volitelná nabídka',delivered:'Dokončené předání',informed:'Informace'};
const day=value=>value?.value?new Date(`${value.value}T12:00:00Z`).toLocaleDateString('cs-CZ'):'';
const date=value=>new Date(value).toLocaleString('cs-CZ');
const counted=(n,one,few,many)=>`${n} ${n===1?one:n>=2&&n<=4?few:many}`;
const valueLabel=value=>value===true?'Ano':value===false?'Ne':value===null?'Neuvedeno':
  typeof value==='object'?value.label??value.value??value.description??'Neuvedeno':String(value);
const button=(action,label,busy,attrs='')=>`<button type="button" class="secondary-link" data-mail-action="${action}" ${busy?'disabled':''} ${attrs}>${label}</button>`;

export function renderWorkPanel({view,detail,mailboxId,busy,notice='',replyHtml=''}){
  const box=view.mailboxes.find(b=>b.id===mailboxId),work=detail?.work;
  const entityOptions=selected=>(work?.entities??[]).map(e=>`<option value="${esc(e.id)}" ${e.id===selected?'selected':''}>${esc(e.label)}</option>`).join('');
  const ownerInput=selected=>`<label>Vlastník<select name="ownerId" required><option value="">Vyberte ověřeného vlastníka</option>${entityOptions(selected)}</select></label>`;
  const reasonInput='<label>Důvod nebo ověřený výsledek<input name="note" required maxlength="500"></label>';
  const conditionInput=i=>`<label>Podmínka aktivace<select name="conditionKind">
    ${[['none','Bez podmínky'],['after_completion','Dokončení předchozí práce'],['after_response','Relevantní odpověď'],
      ['document_received','Doručení konkrétního dokumentu'],['explicit_condition','Jiná osobně ověřitelná podmínka'],['unknown','Zatím neurčená podmínka']]
      .map(([value,label])=>`<option value="${value}" ${i.condition.kind===value?'selected':''}>${label}</option>`).join('')}</select></label>
    <label>Co přesně se má splnit<input name="conditionDescription" maxlength="500" value="${esc(i.condition.description)}"></label>
    <label>Navazující práce (lze vybrat více)<select name="dependencyIds" multiple>${work.projection.workItems.filter(v=>v.item.id!==i.id)
      .map(v=>`<option value="${esc(v.item.id)}" ${i.condition.dependsOnWorkItemIds.includes(v.item.id)?'selected':''}>${esc(v.item.action)}</option>`).join('')}</select></label>
    <label class="forpsi-mail-check"><input type="checkbox" name="requirePositive" ${i.condition.requiredResult==='positive'?'checked':''}>Předchozí práce musí mít kladný výsledek.</label>
    <label>Požadovaný dokument<input name="documentKey" maxlength="160" value="${esc(i.condition.documentKey)}"></label>
    <label>Požadovaný odesílatel<select name="counterpartyId"><option value="">Vyberte odesílatele</option>
      ${i.condition.counterpartyId&&!work.entities.some(e=>e.id===i.condition.counterpartyId)?`<option selected value="${esc(i.condition.counterpartyId)}">${esc(i.counterparty.label)}</option>`:''}
      ${entityOptions(i.condition.counterpartyId)}</select></label>`;
  const resultInput='<label>Výsledek<select name="result"><option value="unspecified">Dokončeno, výsledek neurčen</option><option value="positive">Kladný výsledek</option><option value="negative">Záporný výsledek</option></select></label>';
  const submit=label=>`<button type="submit" class="secondary-link" ${busy?'disabled':''}>${label}</button>`;
  const commandForm=(action,targetId,fields,label)=>`<form data-work-command data-work-action="${action}" data-target-id="${esc(targetId??'')}">${fields}${submit(label)}</form>`;
  const correctionFields=p=>{
    const prior=(work.acceptedInterpretations??[]).filter(e=>e.sourceMessageId===p.event.sourceMessageId&&e.id!==p.event.id);
    if(!prior.length)return '';
    const same=prior.some(e=>e.logicalEventId===p.event.logicalEventId);
    return `<label>Vztah k již přijatému výkladu<select name="replacesEventId" required>
      <option value="">Vyberte vztah k původnímu výkladu</option>${same?'':'<option value="distinct">Jde o další samostatnou práci</option>'}
      ${prior.map(e=>`<option value="${esc(e.id)}">Opravit: ${esc(e.payload.action??kindLabels[e.kind])}</option>`).join('')}</select></label>
      <label>Ruční zásahy při opravě<select name="manualBinding"><option value="">Vyberte, pokud úkol obsahuje ruční zásah</option>
      <option value="retain">Potvrzuji platnost dosavadních ručních zásahů i pro opravený význam</option>
      <option value="release">Odvolat dosavadní ruční zásahy včetně dokončení</option></select></label>`;
  };
  const open=caseId=>button('brain-open','Otevřít případ',busy,`data-case-id="${esc(caseId)}"`);
  const card=v=>`<li class="forpsi-work-card"><strong>${esc(v.item.action)}</strong>
    <p>${esc(v.item.owner.label)} · ${esc(categoryLabels[v.item.category])}${v.item.dueDate?` · do ${esc(day(v.item.dueDate))}`:''}</p>
    <p>${esc(v.explanation)}</p>${v.personalState.snoozedUntil?`<small>Odloženo do ${esc(date(v.personalState.snoozedUntil))}</small>`:''}
    ${v.item.dueResolution==='conflicted'?'<p role="status">Termín je sporný; povinnost zůstává otevřená.</p>':''}${open(v.item.caseId)}</li>`;
  const sectionHtml=Object.entries(labels).map(([section,label])=>{
    const rows=view.workItems.filter(v=>v.primarySection===section),active=rows.filter(v=>!v.personalState.snoozedUntil),
      snoozed=rows.filter(v=>v.personalState.snoozedUntil),groups=section==='review'?view.signalGroups:[];
    const count=view.counts.sections[section];
    if(!count.items&&!count.signals)return '';
    return `<section class="forpsi-work-section" aria-label="${label}"><h3>${label} <small>${counted(count.items,'položka','položky','položek')}${count.signals?` · ${count.signals} upozornění`:''}</small></h3>
      <ul class="forpsi-mail-list">${active.map(card).join('')}${groups.map(g=>{
        const signals=view.signals.filter(s=>g.memberSignalIds.includes(s.signal.id));
        return `<li class="forpsi-work-card"><strong>${g.visibleSignalCount>1?`${g.visibleSignalCount} související hlášení`:'Upozornění'}</strong>
          ${signals.map(s=>`<p>${esc(s.explanation)}</p>${open(s.signal.caseId)}`).join('')}
          ${g.visibleSignalCount>1?'<small>Počet hlášení není počet skutečných událostí.</small>':''}</li>`;
      }).join('')}</ul>${snoozed.length?`<details><summary>Odložené (${snoozed.length})</summary><ul class="forpsi-mail-list">${snoozed.map(card).join('')}</ul></details>`:''}</section>`;
  }).join('');
  const itemActions=v=>{const i=v.item;
    const attrs=`data-case-id="${esc(work.caseId)}" data-target-id="${esc(i.id)}"`;
    const action=(name,label,scope='shared')=>button('work-action',label,busy,`${attrs} data-work-action="${name}" data-scope="${scope}"`);
    return `<li class="forpsi-work-card"><strong>${esc(i.action)}</strong><p>${esc(statusLabels[i.status])} · ${esc(i.owner.label)}${i.dueDate?` · do ${esc(day(i.dueDate))}`:''}</p>
      <p>${esc(v.explanation)}</p><div class="forpsi-actions">
      ${work.canPersonal&&i.status==='open'?(v.personalState.snoozedUntil?action('unsnooze','Zrušit osobní odložení','personal'):action('snooze','Odložit o den','personal')):''}
      ${work.canManage&&i.status==='open'?action('cancelled','Zrušit úkol'):''}
      ${work.canManage&&i.status==='open'&&i.dueDate?action('due_removed','Odvolat termín'):''}</div>
      ${work.canManage?`<details><summary>Změnit společnou práci</summary>
        ${i.status==='open'?commandForm('completed',i.id,resultInput,'Potvrdit dokončení')+
          commandForm('delegated',i.id,ownerInput(i.owner.id),'Předat vlastníkovi')+
          commandForm('due_changed',i.id,'<label>Nový termín<input type="date" name="dueDate" required></label>','Změnit termín'):''}
        ${['completed','cancelled'].includes(i.status)?commandForm('reopened',i.id,reasonInput+
          '<label class="forpsi-mail-check"><input type="checkbox" name="retainDue">Zachovat původní termín</label>','Znovu otevřít a uvolnit ochranu stavu'):''}
        ${i.optional?commandForm('accepted',i.id,reasonInput,'Přijmout nabídku jako vlastní povinnost'):''}
        ${commandForm('override_owner',i.id,ownerInput(i.owner.id)+reasonInput,'Opravit vlastníka ručně')}
        ${commandForm('override_action',i.id,`<label>Činnost<input name="actionText" required maxlength="500" value="${esc(i.action)}"></label>`+reasonInput,'Opravit činnost ručně')}
        ${commandForm('override_condition',i.id,conditionInput(i)+reasonInput,'Upravit podmínku')}
        ${commandForm('release_override',i.id,'<label>Uvolnit ruční ochranu<select name="property"><option value="owner">Vlastník</option><option value="action">Činnost</option><option value="dueDate">Termín</option><option value="condition">Podmínka</option></select></label>'+reasonInput,'Použít aktuální odvozený údaj')}
        ${i.status==='open'?commandForm('replaced',i.id,'<label>Nová náhradní činnost<input name="actionText" required maxlength="500"></label>'+ownerInput()+reasonInput,'Nahradit novým úkolem'):''}
      </details>`:''}
      ${work.canManage&&i.status==='open'&&['document_received','after_response','explicit_condition'].includes(i.condition.kind)?
        `<details><summary>Ověřit podmínku: ${esc(i.condition.description)}</summary>${commandForm('condition_evaluated',i.id,
          '<label>Výsledek kontroly<select name="conditionResult"><option value="unknown">Zatím nelze určit</option><option value="satisfied">Podmínka je splněná</option><option value="failed">Podmínka není splněná</option></select></label>'+
          (i.condition.kind==='document_received'?`<label>Skutečně zkontrolovaný dokument<select name="attachmentId"><option value="">Vyberte přílohu</option>${detail.attachments.map(a=>`<option value="${esc(a.id)}">${esc(a.filename)}</option>`).join('')}</select></label>`:'')+
          (i.condition.kind==='after_response'?`<label>Relevantní odpověď<select name="messageId"><option value="">Vyberte zprávu</option>${detail.messages.map(m=>`<option value="${esc(m.id)}">${esc(m.sender)} · ${esc(m.subject)}</option>`).join('')}</select></label>`:'')+
          '<label class="forpsi-mail-check"><input type="checkbox" name="contentConfirmed">Obsah a splnění této konkrétní podmínky jsem osobně ověřil/a.</label>'+reasonInput,'Uložit výsledek kontroly')}</details>`:''}
      <details><summary>Podklady jednotlivých údajů</summary>${Object.entries(i.propertyEvidence).map(([p,refs])=>
        `<p><strong>${esc(propLabels[p]??p)}</strong> ${refs.map(r=>`<q>${esc(r.quote)}</q>`).join(' · ')||'Ruční potvrzení oprávněného uživatele.'}</p>`).join('')}</details></li>`;
  };
  return `<section class="forpsi-card" aria-label="Mail Brain"><div class="forpsi-card-heading"><div><h2>TEĎ</h2><p>Vaše úkoly, čekání a důležité zprávy.</p></div>${button('brain-refresh','Obnovit přehled',busy)}</div>
    ${!box?.consented?`<p>Analýza Doručených a Odeslaných za posledních 90 dní vyžaduje váš souhlas.</p>${button('brain-consent','Souhlasím se zpracováním 90 dní',busy)}`:`
    <p role="status">${view.coverage.complete?'Pošta je načtená pro uvedené období.':'Část pošty nebo jejího vyhodnocení zatím chybí.'}</p>
    ${notice?`<p role="status">${esc(notice)}</p>`:''}
    <div class="forpsi-actions">${button('brain-sync','Načíst novou poštu',busy)}${button('brain-revoke','Odvolat souhlas',busy)}</div>
    ${view.analysisSource==='chatgpt'?'<p>Komunikaci vyhodnocuje připojený ChatGPT. Načtení pošty zde připraví podklady; vyhodnocení spustíte v chatu s konektorem FORPSI.</p>':''}
    <p><strong>${counted(view.counts.activeObligations.items,'aktivní povinnost','aktivní povinnosti','aktivních povinností')}</strong> v ${view.counts.activeObligations.cases} ${view.counts.activeObligations.cases===1?'případu':'případech'} ·
      ${view.counts.pendingConditionItems.items} čeká na podmínku · ${view.counts.attentionSignals.signals} upozornění ·
      ${counted(view.deadlineFacet.items,'termín','termíny','termínů')}</p>
    ${sectionHtml||'<p>V této části přehledu nejsou přijaté úkoly ani upozornění.</p>'}
    ${view.pagination.nextCursor?button('work-next','Další část přehledu',busy):''}
    ${view.projectionSelections.some(s=>s.mode==='v2_stale'||s.mode==='v2_unavailable')?
      '<p role="alert">Některé případy čekají na nové vyhodnocení. Zobrazené počty neznamenají, že je vše vyřízené.</p>':''}
    ${view.legacyFallback.length?`<details><summary>Případy čekající na nové vyhodnocení (${view.legacyFallback.length})</summary>
      <ul class="forpsi-mail-list">${view.legacyFallback.map(c=>`<li><strong>${esc(c.title)}</strong>${open(c.caseId)}</li>`).join('')}</ul></details>`:''}
    ${detail?`<article class="forpsi-mail-message"><h3>${esc(detail.case.title)}</h3>
      ${work?.analysisSource==='chatgpt'?`<p>O nové vyhodnocení tohoto případu můžete požádat v připojeném chatu.</p>
        <div class="forpsi-actions">${button('work-chatgpt','Zkopírovat zadání pro ChatGPT',busy,`data-case-id="${esc(detail.case.id)}"`)}
        <a class="secondary-link" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Otevřít ChatGPT</a></div>`:
        `<div class="forpsi-actions">${button('work-refresh','Vyhodnotit komunikaci v případu',busy,`data-case-id="${esc(detail.case.id)}"`)}</div>`}
      ${work?.mode==='v2_unavailable'?'<p role="alert">Předchozí výklad už nelze bezpečně použít. Ověřte podklady.</p>':''}
      <ul class="forpsi-mail-list">${(work?.projection.workItems??[]).map(itemActions).join('')}</ul>
      ${work?.canManage?`<details><summary>Přidat vlastní úkol</summary>${commandForm('created_manually',null,
        '<label>Činnost<input name="actionText" required maxlength="500"></label>'+ownerInput()+
        '<label>Termín (nepovinný)<input type="date" name="dueDate"></label>'+reasonInput,'Vytvořit společný úkol')}</details>`:''}
      ${(work?.projection.signals??[]).map(v=>`<section class="forpsi-work-card"><p>${esc(v.explanation)}</p>
        <p>${v.signal.status==='resolved'?'Společně vyřešeno':v.disposition==='dismissed'?'Skryto v osobním přehledu':v.disposition==='acknowledged'?'Osobně přečteno':'Aktivní upozornění'}</p>
        <div class="forpsi-actions">${work.canPersonal?['acknowledge',v.disposition==='dismissed'?'restore_signal':'dismiss'].map(a=>
          button('work-action',a==='acknowledge'?'Označit přečtené':a==='dismiss'?'Skrýt pro mě':'Zobrazit pro mě',busy,
            `data-target-id="${esc(v.signal.id)}" data-scope="personal" data-work-action="${a}"`)).join(''):''}
        ${work.canManageSignals?button('work-action',v.signal.status==='resolved'?'Znovu otevřít upozornění':'Potvrdit společné vyřešení',busy,
          `data-target-id="${esc(v.signal.id)}" data-scope="shared" data-work-action="${v.signal.status==='resolved'?'reopen_signal':'resolve_signal'}"`):''}</div></section>`).join('')}
      ${(work?.proposals??[]).map(p=>`<section class="forpsi-work-card"><h4>${esc(kindLabels[p.event.kind]??'Výklad zprávy')}: ${esc(p.event.payload.action)}</h4>
        <p>Vlastník: ${esc(p.event.payload.owner?.label??'Neurčen')} · ${p.event.payload.dueDate?`Termín: ${esc(day(p.event.payload.dueDate))}`:'Bez doloženého termínu'}</p>
        <details open><summary>Ověření proti zprávě</summary>${p.facts.filter(f=>['action','owner','dueDate','condition'].includes(f.property)).map(f=>
          `<p><strong>${esc(propLabels[f.property])}:</strong> ${esc(valueLabel(f.value))}<br>${f.validation==='valid'?f.evidence.map(r=>`<q>${esc(r.quote)}</q>`).join(' · '):'Údaj nemá použitelný podklad.'}</p>`).join('')}</details>
        ${work.canReview&&work.canManage?`<form data-work-review data-event-id="${esc(p.event.id)}">
          ${correctionFields(p)}
          <label class="forpsi-mail-check"><input type="checkbox" name="authority" required>Ověřil/a jsem význam uvedených podkladů a oprávnění autora zadat či změnit tuto práci.</label>
          <button type="submit" class="primary-action" ${busy?'disabled':''}>Potvrdit tento výklad</button></form>`:
          '<p>Výklad čeká na uživatele s oprávněním k ověření práce.</p>'}
        ${work.canReview?button('work-reject','Odmítnout chybný výklad',busy,`data-event-id="${esc(p.event.id)}"`):''}</section>`).join('')}
      <h4>Zdrojové zprávy</h4>${detail.messages.map(m=>`<details><summary>${esc(date(m.received_at))} · ${esc(m.subject)} · ${esc(m.sender)}</summary><pre>${esc(m.body_text)}</pre></details>`).join('')}
      ${detail.messagesTruncated?'<p role="status">Zobrazena je jen část zpráv tohoto případu. Při ověření podkladu berte v úvahu neúplný kontext.</p>':''}
      ${work?.canManage&&work.projection.workItems.some(v=>v.item.status==='open')?`<details><summary>Dokončit všechny otevřené úkoly v případu</summary>
        ${commandForm('close_case',null,resultInput+reasonInput+'<label class="forpsi-mail-check"><input type="checkbox" required>Potvrzuji dokončení všech uvedených otevřených úkolů. Upozornění tím nepotvrzuji.</label>','Dokončit úkoly případu')}</details>`:''}
      ${replyHtml}</article>`:''}`}</section>`;
}
