// Presentation only: consumes the server-authorized fields without changing source data.
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const availability = {known:'Dostupné',null:'Nevyplněno ve Vistosu',empty:'Nevyplněno ve Vistosu',not_exposed:'Vistos neposkytuje',forbidden:'Nedostupné pro tento přístup',unverified:'Význam čeká na ověření',error:'Načtení se nezdařilo'};
const present = f => f && Object.hasOwn(f,'value') && f.value !== null && f.value !== '';
export const rawValue = f => !present(f) ? availability[f?.availability || 'not_exposed'] || 'Neověřeno' : typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value);
// Group decimal strings without converting to Number or discarding source precision.
export function decimalText(value) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) return String(value);
  const fraction = (match[3] || '').replace(/0+$/,'');
  return match[1] + match[2].replace(/\B(?=(\d{3})+(?!\d))/g,'\u00a0') + (fraction ? ',' + fraction : '');
}
export function dateText(value) {
  if (!value) return 'Není doloženo';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().map(Number).join('. ') + '.';
  if (/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))) return new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',dateStyle:'short',timeStyle:'short'}).format(new Date(value));
  return String(value); // No invented source timezone.
}
const pick = (fields, keys) => keys.map(k => fields?.[k]).find(present) || keys.map(k => fields?.[k]).find(Boolean);
const ref = (fields, key) => pick(fields,[key+'_Caption',key]);
const note = f => `${f?.availability && f.availability !== 'known' && present(f) ? `<small class="vj-value-note">${esc(availability[f.availability] || 'Neověřeno')}</small>` : ''}${f?.stale ? `<small class="vj-value-note">Poslední známá hodnota · ${esc(dateText(f.valueObservedAt))}</small>` : ''}`;
const value = (f, numeric=false) => `<span>${esc(present(f) && numeric ? decimalText(f.value) : rawValue(f))}</span>${note(f)}`;
const pair = (label, html) => `<div><dt>${esc(label)}</dt><dd>${html}</dd></div>`;
const block = (title, rows, extra='') => `<section class="vj-detail-block ${extra}"><h3>${esc(title)}</h3><dl class="vj-detail-dl">${rows.join('')}</dl></section>`;
export const planText = job => job.plannedDay ? dateText(job.plannedDay) : job.plannedStart ? dateText(job.plannedStart) + (job.plannedEnd ? ' – ' + dateText(job.plannedEnd) : '') : 'Bez ověřeného termínu';

export function fieldsTable(fields, search='') {
  const entries = Object.entries(fields || {}).filter(([k,f]) => `${k} ${f.label || ''} ${rawValue(f)} ${availability[f.availability] || ''}`.toLocaleLowerCase('cs').includes(search.toLocaleLowerCase('cs')));
  return `<p class="vj-meta">${entries.length} údajů v tomto záznamu</p>${entries.length ? `<div class="vj-table-scroll" tabindex="0" role="region" aria-label="Zdrojová data"><table class="vj-table vj-source-table"><thead><tr><th scope="col">Údaj</th><th scope="col">Hodnota</th><th scope="col">Zdrojové pole</th><th scope="col">Dostupnost</th></tr></thead><tbody>${entries.map(([k,f]) => `<tr><th scope="row">${esc(f.label || k)}</th><td>${esc(rawValue(f))}${f.stale ? `<small>Poslední známá hodnota · ${esc(dateText(f.valueObservedAt))}</small>` : ''}</td><td><code>${esc(k)}</code></td><td>${esc(availability[f.availability] || 'Neověřeno')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vj-empty">Žádný údaj neodpovídá hledání.</p>'}`;
}
export function overview(job, rights={}) {
  const f=job.fields || {};
  const contact=[];
  if (rights.personal) {
    contact.push(pair('Kontaktní osoba',value(ref(f,'CustomerContact_FK'))));
    const phone=f.Phone, email=pick(f,['Email','CustomerEmail']);
    contact.push(pair('Telefon',present(phone) && phone.availability==='known' && /^\+?[\d\s()-]{6,25}$/.test(phone.value) ? `<a href="tel:${esc(String(phone.value).replace(/[\s()-]/g,''))}">${esc(phone.value)}</a>` : value(phone)));
    if (email) contact.push(pair('E-mail',present(email) && email.availability==='known' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.value) ? `<a href="mailto:${esc(encodeURIComponent(email.value))}">${esc(email.value)}</a>` : value(email)));
  }
  return `<h3 class="vj-section-title">Přehled zakázky</h3><div class="vj-detail-grid">${block('Zákazník a kontakt',[
    pair('Zákazník',esc(job.customer || rawValue(ref(f,'CustomerCompany_FK')))),
    pair('Provozovna',value(ref(f,'CustomerBranch_FK'))),...contact,
    ...(!rights.personal ? [pair('Kontaktní údaje','Nedostupné pro tento přístup')] : [])
  ])}${block('Místo a služba',[
    pair('Místo',job.place ? esc(job.place) : value(ref(f,'Nakladkovaadresa_FK'))),
    pair('Stanoviště',value(f.Stanoviste)),pair('Služba',esc(job.service || 'Popis služby není ověřen; dostupné produkty najdete v Položkách.'))
  ])}${block('Termín a stav',[
    pair('Plánovaný termín',esc(planText(job))),pair('Původní stav ve Vistosu',value(ref(f,'Status_FK')))
  ])}${block('Lidé a technika',[
    pair('Řidič',rights.personal ? value(ref(f,'RidicContact_FK')) : 'Nedostupné pro tento přístup'),
    pair('Vozidla',present(f.Vozidlo_FK_Caption) ? value(f.Vozidlo_FK_Caption) + (job.vehicleIds?.length>1 ? `<small>Všechny zdrojové reference: ${esc(job.vehicleIds.join(', '))}</small>` : '') : esc(job.vehicleIds?.length ? 'Zdrojové reference: '+job.vehicleIds.join(', ') : 'Nepřiřazené vozidlo')),
    pair('Přiřazení',esc(job.unassigned ? 'Vazba na evidenci osob nebo vozidel není ověřena.' : 'Přiřazení doloženo'))
  ])}</div>`;
}
export function itemName(item) {
  return rawValue(pick(item.fields,['Product_FK_Caption','Name','Description'])) || 'Popis není dostupný';
}
function currency(fields) {
  const f=fields?.Currency_FK_Caption;
  return present(f) && f.availability==='known' && /^(CZK|EUR|USD|GBP|Kč)$/.test(String(f.value)) ? String(f.value) : null;
}
function moneyField(f, fields) {
  return value(f,true) + (present(f) ? `<small>${esc(currency(fields) || 'Měna není doložena')}</small>` : '');
}
export function itemRows(items, rights={}) {
  return `<div class="vj-items-table-wrap"><table class="vj-table vj-items-table"><caption class="vj-sr-only">Položky zakázky, jeden řádek pro každou službu</caption><thead><tr><th scope="col">Služba / produkt</th><th scope="col">Množství</th><th scope="col">Jednotka</th>${rights.finance ? '<th scope="col">Cena s DPH</th>' : ''}</tr></thead><tbody>${items.map(item=>{
    const f=item.fields || {}, unit=pick(f,['UOM_FK_Caption','Unit_Caption','Unit']);
    const name=pick(f,['Product_FK_Caption','Name','Description']);
    return `<tr class="vj-item-row"><td data-label="Služba / produkt"><strong class="vj-item-name">${esc(present(name) ? name.value : 'Popis není dostupný')}</strong><details class="vj-item-details"><summary>Podrobnosti položky</summary><div class="vj-item-expanded">${rights.finance ? block('Ceny této položky',[
      pair('Jednotková cena',moneyField(f.UnitPrice,f)),pair('Sleva na jednotku',moneyField(f.UnitPriceDiscount,f)),pair('Sleva (%)',value(f.UnitPriceDiscountPercentage,true)),pair('Bez DPH',moneyField(f.PriceWithoutTax,f)),pair('DPH',moneyField(f.PriceTax,f)),pair('S DPH',moneyField(f.PriceWithTax,f)),pair('Daň zahrnuta v ceně',value(f.TaxIncluded))
    ]) : ''}${f.c_OrderedQuantity?.availability==='known' && present(f.c_OrderedQuantity) ? block('Objednáno dle Vistosu',[pair('Objednané množství',value(f.c_OrderedQuantity,true))]) : ''}${fieldsTable(f)}</div></details></td><td data-label="Množství"><strong class="vj-quantity">${esc(present(f.Quantity)?decimalText(f.Quantity.value):rawValue(f.Quantity))}</strong>${f.Quantity?.stale ? '<small>Poslední známá hodnota</small>' : ''}</td><td data-label="Jednotka">${present(unit) && unit.availability==='known' ? esc(unit.value) : '<span class="vj-meta">Nedoložena</span>'}</td>${rights.finance ? `<td data-label="Cena s DPH">${moneyField(f.PriceWithTax,f)}</td>` : ''}</tr>`;
  }).join('')}</tbody></table></div><p class="vj-help">Množství je převzato ze zdroje; bez potvrzeného významu je neoznačujeme jako provedeno. Jednotky nedoplňujeme odhadem. Původní hodnoty a jejich dostupnost jsou v podrobnostech.</p>`;
}
export function headerPrices(job, rights) {
  if (!rights?.finance) return '';
  const f=job.fields || {};
  return `<details class="vj-disclosure"><summary>Ceny hlavičky zakázky</summary><p class="vj-meta">Samostatné zdrojové částky; nepřičítají se k cenám položek.</p>${block('Hlavička zakázky',[pair('Bez DPH',moneyField(f.PriceWithoutTax,f)),pair('DPH',moneyField(f.PriceTax,f)),pair('S DPH',moneyField(f.PriceWithTax,f)),pair('Přenesená daňová povinnost',value(f.TransferredTaxLiability))])}</details>`;
}
export function documents(job, result={}) {
  const f=job.fields || {}, financial=result.rights?.finance;
  return `<h3 class="vj-section-title">Související doklady</h3><div class="vj-document-list">${[
    ['Smlouva','Contract_FK'],['Objednávka','Order_FK'],...(financial?[['Faktura','InvoiceIssued_FK']]:[])
  ].map(([label,key])=>`<article class="vj-document"><h4>${label}</h4><p>${value(ref(f,key))}</p><small>${present(ref(f,key)) ? 'Zdrojová reference · otevření dokladu není dostupné.' : 'Vazba na doklad není doložena.'}</small></article>`).join('')}</div><section class="vj-detail-block"><h3>Přílohy</h3><p>${result.attachmentsAvailable===true ? 'Zakázka nemá přílohy.' : 'Přílohy zatím nejsou dostupné z Vistosu.'}</p></section><p class="vj-help">Číslo reference samo nepotvrzuje identitu faktury ani její úhradu.</p>`;
}
const reasonLabels={history_not_imported:'Časová historie zatím nebyla načtena.',history_unavailable:'Historie pro tento časový rozsah není dostupná.',planned_window_unverified:'Časové okno zakázky není ověřené.',historical_vehicle_identity_unverified:'Historická identita vozidla není ověřená.',location_unverified_or_overlapping:'Místo není ověřené nebo se překrývá s jiným místem.',competing_jobs:'Stejnému místu a času odpovídá více zakázek.',private_trip_overlap:'Časový úsek nelze použít k přiřazení.',visit_not_proven:'Pobyt v místě není doložen dostatečnými podklady.'};
export function execution(job, x, badge) {
  const visits=x.visits || [], conditions=x.conditions || {};
  const interval=v=>Array.isArray(v)&&v.length ? v.map(dateText).join(' – ') : 'Není doloženo';
  return `<section class="vj-detail-block vj-plan"><div><h3>Plán · Vistos</h3><p class="vj-plan-time">${esc(planText(job))}</p></div><span class="vj-meta">Plánovaný termín zakázky</span></section><section class="vj-detail-block vj-actual"><h3>Skutečnost · Sledování vozidel / T-Cars</h3><div class="vj-execution-status"><span>Přiřazení: ${badge(x.confirmation?.decision || x.assignmentStatus)}</span><span>Pokrytí: ${badge(x.coverageStatus)}</span></div><ul class="vj-conditions">${[['vehicle','Identita vozidla'],['location','Místo'],['unique','Jednoznačná zakázka']].map(([key,label])=>`<li>${esc(label)}: <strong>${conditions[key]===true?'ověřeno':conditions[key]===false?'neověřeno':'není doloženo'}</strong></li>`).join('')}</ul>${(x.reasons || []).length?`<p class="vj-help">${x.reasons.map(r=>esc(reasonLabels[r] || 'Podklady vyžadují kontrolu.')).join(' ')}</p>`:''}${(visits.length?visits:[null]).map((v,i)=>`<section class="vj-visit"><h4>${visits.length>1?'Návštěva '+(i+1):'Časové údaje'}</h4><dl class="vj-execution-metrics">${pair('Příjezd',esc(interval(v?.arrival)))}${pair('Odjezd',esc(interval(v?.departure)))}${pair('Doba na místě',esc(v?.durationSeconds ? `≈ ${Math.floor(v.durationSeconds.minimum/60)}–${Math.ceil(v.durationSeconds.maximum/60)} min` : 'Není doloženo'))}${pair('Související jízda',esc(x.trips?.length ? `${x.trips.length} doložených jízd` : 'Není doložena'))}</dl>${v?`<ol class="vj-visit-timeline ${v.gaps?.length?'has-gaps':''}" aria-label="Průběh návštěvy"><li>Jízda</li><li>Příjezd</li><li>Pobyt${v.gaps?.length?' · mezery v datech':''}</li><li>Odjezd</li></ol><details class="vj-disclosure"><summary>Časová rozmezí a podklady návštěvy</summary><p>Příjezd: ${esc(interval(v.arrival))}</p><p>Odjezd: ${esc(interval(v.departure))}</p><p>Pozorováno: ${esc(dateText(v.observedFrom))} – ${esc(dateText(v.observedTo))}</p>${(v.gaps||[]).map(g=>`<p>Mezera: ${esc(interval(g))}</p>`).join('')}<p>Zdroj: ${esc(v.provenance || 'Není doložen')}</p></details>`:''}</section>`).join('')}${x.trips?.length?`<details class="vj-disclosure"><summary>Zobrazit podklad jízdy</summary>${x.trips.map(t=>`<article><h4>Jízda ${esc(t.id)}</h4><p>${esc(dateText(t.from))} – ${esc(dateText(t.to))}</p><p>Zdroj: T-Cars</p></article>`).join('')}</details>`:''}</section><p class="vj-help">Doba na místě zahrnuje i čekání. Odpracované hodiny ani chod technologie z GPS samotné neurčujeme.</p><p>Chod technologie: Zdroj není ověřen</p><p>Řidič v daném čase neověřen</p><details class="vj-disclosure"><summary>Původní časová pole Vistosu</summary>${fieldsTable(Object.fromEntries(Object.entries(job.fields||{}).filter(([k])=>/Date|Resolution/.test(k))))}</details>`;
}
export function historyEvents(events) {
  const names={source_changed:'Načtení nebo změna zdrojových dat',source_detail_refreshed:'Obnovení detailu z Vistosu',execution_evidence_changed:'Aktualizace časových podkladů',execution_confirmation:'Potvrzení přiřazení'};
  return events.length ? `<ol class="vj-history">${events.map(e=>`<li><time>${esc(dateText(e.created_at))}</time><h4>${esc(names[e.kind] || 'Událost zakázky')}</h4><p>Zdroj: ${e.kind?.startsWith('source_')?'Vistos':'Smart'}${e.actor?` · Autor: ${esc(e.actor)}`:''}</p>${e.changedFields?.length?`<details><summary>Změněné údaje (${e.changedFields.length})</summary><ul>${e.changedFields.map(f=>`<li>${esc(f.label)} <code>${esc(f.field)}</code></li>`).join('')}</ul></details>`:'<small>Podrobnosti změny nejsou pro tento přístup dostupné.</small>'}</li>`).join('')}</ol>` : '<div class="vj-empty"><h4>Žádné zaznamenané události</h4><p>Historie zdroje před prvním importem nemusí být dostupná.</p></div>';
}
