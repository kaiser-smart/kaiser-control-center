import { escape } from './presentation.js';
const labels = { inactive: 'Bodování není aktivní. Chybí doložené směny a kontroly kvality.', source: 'Podklady pro hodnocený den nejsou úplné nebo ověřené.', roster: 'Není ověřen úplný seznam směn.', time: 'Časové úseky nejsou úplné nebo ověřené.', assignment: 'Přiřazení neověřeno.', duplicate: 'Konfliktní přiřazení nebo duplicitní práce.', norm: 'Chybí schválená norma práce.', work: 'Část práce nemá ověřenou dokončenou etapu.', quality: 'Chybí kontrola dokončení, dokumentace nebo kvality.', short: 'Méně než 4 hodiny ověřeného uznatelného času.', empty: 'Nejsou dostupné ověřené směny.', review: 'Čeká se na uzavření a kontrolu dne.', shadow: 'Probíhá interní ověřování. Žebříček ještě není zveřejněn.' };
const states = { waiting: 'Čeká na data', unrated: 'Nehodnoceno', unavailable: 'Nedostupné', provisional: 'Průběžné pořadí', final: 'Řidič dne' };
labels.company = 'Pro hodnocení je nutné jednoznačně určit provozní firmu. Výsledky různých firem se neslučují.';
const fmt = value => Number.isFinite(value) ? new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(value) : '—';
const time = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Prague' }).format(new Date(value)) : 'dosud neověřeno';
const dayLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('. ') : 'dosud neurčen';
const localToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const hours = value => `${fmt(value / 3600)} h`;
function bars(driver) {
  return [['Výkon', 'performance', 50], ['Efektivita', 'efficiency', 30], ['Kvalita', 'quality', 20]].map(([label, key, maximum]) => `<div class="dr-metric"><span>${label}</span><span>${driver[key] === null ? 'Nehodnoceno' : `${fmt(driver[key])}/${maximum}`}</span><progress max="${maximum}" value="${Number.isFinite(driver[key]) ? Math.min(maximum, Math.max(0, driver[key])) : 0}" aria-label="${label}: ${driver[key] === null ? 'nehodnoceno' : fmt(driver[key])}"></progress></div>`).join('');
}
function reasons(list = []) { return list.map(reason => `<li>${escape(labels[reason] || reason)}</li>`).join(''); }
function evidence(value) { return value ? `${escape(value.source)} · ${escape(value.recordId)} · ověřil ${escape(value.verifiedBy)} · ${escape(time(value.verifiedAt))}` : 'Neověřeno'; }
function vehicles(driver) { return (driver.vehicles || []).map(v => escape([v.name, v.plate].filter(Boolean).join(' · ') || 'Vozidlo bez popisku')).join(', '); }

export function createDriverRatings({ root, readRatings, selectVehicle, openOperations }) {
  const card = root.querySelector('[data-vm-driver]');
  const dialog = document.createElement('dialog');
  dialog.className = 'dr-drawer rating-drawer'; dialog.setAttribute('aria-labelledby', 'dr-title');
  root.append(dialog);
  let today = null, data = null, error = '', period = 'today', category = 'all', selected = null, destroyed = false, requestId = 0, loading = false;
  let cardRequest = 0, returnFocus = null;
  const status = () => error ? 'unavailable' : data?.status || 'waiting';
  function renderCard() {
    const own = today?.scope === 'own';
    const winner = own ? today.drivers?.find(d => d.total !== null) : today?.ranking?.[0];
    const multiple = today?.tiedFirst && !own;
    const title = own ? 'Moje hodnocení' : !winner && openOperations ? 'Provoz a hodnocení' : 'Řidič dne';
    card.innerHTML = `<header><h2>${title}</h2><small>${winner ? 'Dnes · průběžně' : 'Dnes · bez úplných podkladů'}</small></header>${winner ? `<div class="dr-winner"><strong>${multiple ? 'Sdílené první místo' : escape(winner.name)}</strong><small>${multiple ? 'Shodné celkové i rozhodující dílčí skóre' : vehicles(winner)}</small></div><strong class="dr-score">${fmt(winner.total)} / 100 bodů</strong>${bars(winner)}` : `<strong class="dr-empty">${states[today?.status] || 'Čeká na data'}</strong><p>${escape(today?.error || (today?.reasons?.length ? labels[today.reasons[0]] : 'Přiřazení neověřeno. Čekáme na doložené směny a kontroly práce.'))}</p>`}${!own && openOperations && !winner ? '<button type="button" data-op-open>Provoz podle T-Cars</button>' : ''}<button type="button" data-dr-open>Zobrazit hodnocení${own ? '' : ' a žebříček'} <span aria-hidden="true">›</span></button>`;
  }
  function driverDetail(driver) {
    return `<button type="button" data-dr-back>‹ Zpět na přehled</button><h3>${escape(driver.name)}</h3><p>${vehicles(driver)}</p><strong class="dr-score">${driver.total === null ? 'Nehodnoceno' : `${fmt(driver.total)} / 100 bodů`}</strong>${bars(driver)}<ul>${reasons(driver.reasons)}</ul>
      ${(driver.vehicles || []).map((v, i) => `<button type="button" data-dr-vehicle="${i}">Zvýraznit ${escape(v.plate || v.name || 'vozidlo')} na mapě</button>`).join('')}
      ${data.scope === 'operational' ? '<p>Detail výpočtu je dostupný vedení a hodnocenému řidiči.</p>' : `<dl class="dr-times"><dt>Normovaná práce</dt><dd>${hours(driver.normalizedSeconds)}</dd><dt>Uznatelný čas</dt><dd>${hours(driver.acceptedSeconds)}</dd><dt>Potvrzené zbytečné ztráty</dt><dd>${hours(driver.wasteSeconds)}</dd></dl><h4>Rozpis bodů</h4><p>Výkon: 50 × min(1, normovaná práce / uznatelný čas). Efektivita: 30 × max(0, 1 − potvrzené ztráty / uznatelný čas). Kvalita: vážené kontroly 10 + 5 + 5.</p><p>Potvrzená ztráta času ovlivňuje výkon i efektivitu podle těchto vzorců; další paušální srážka se nepřidává.</p>
      <h4>Zakázky a ověřené etapy</h4>${(driver.activities || []).map(a => `<details><summary>${escape(a.jobId)}${a.stageId ? ` · etapa ${escape(a.stageId)}` : ''} · ${escape(data.categories[a.category] || a.category)}</summary><p>Norma: ${a.norm ? hours(a.norm.seconds) : 'Nedostupná'} · ${a.norm?.method === 'median90' ? `medián ${a.norm.sampleIds.length} realizací` : 'schválená ruční norma'}</p><p>${evidence(a.norm?.evidence)}</p><p>Dokončení: ${evidence(a.evidence)}</p>${['completion', 'documentation', 'quality'].map((key, i) => `<p>${['Správné dokončení', 'Dokumentace', 'Kontrola kvality'][i]}: ${escape({ pass: 'ověřeno', fail: 'potvrzený nedostatek', not_required: 'ověřeně nevyžadováno' }[a.checks?.[key]?.status] || 'neověřeno')} ${escape(a.checks?.[key]?.reason || '')}<br><small>${evidence(a.checks?.[key]?.evidence)}</small></p>`).join('')}</details>`).join('')}
      <h4>Započítané a vyloučené úseky</h4>${(driver.segments || []).map(s => `<details><summary>${escape({ work: 'Práce včetně nutných přejezdů', waste: 'Potvrzená zbytečná ztráta', break: 'Vyloučená přestávka', external: 'Vyloučená nezaviněná překážka' }[s.kind] || 'Neověřeno')} · ${hours((Date.parse(s.to) - Date.parse(s.from)) / 1000)}</summary><p>${time(s.from)} – ${time(s.to)}</p><p>${escape(s.reason || '')}</p><p>${evidence(s.evidence)}</p><p>Přiřazení: ${evidence(s.assignmentEvidence)}</p></details>`).join('')}<p>Revize podkladů: ${escape(driver.revision)}</p>`}`;
  }
  function renderDialog() {
    if (!dialog.open) return;
    const driver = data?.drivers?.find(d => `${d.companyId}:${d.driverId}` === selected);
    dialog.innerHTML = `<header class="dr-heading"><h2 id="dr-title">Hodnocení řidičů</h2><button type="button" data-dr-close aria-label="Zavřít hodnocení">×</button></header><div class="dr-toolbar"><div role="group" aria-label="Hodnocený den"><button type="button" data-dr-period="today" aria-pressed="${period === 'today'}">Dnes</button><button type="button" data-dr-period="yesterday" aria-pressed="${period === 'yesterday'}">Včera</button></div><label>Jiný den<input type="date" data-dr-day aria-label="Hodnocený den" max="${localToday()}" value="${escape(/^\d{4}-\d{2}-\d{2}$/.test(period) ? period : data?.day || '')}"></label><label>Kategorie činnosti<select data-dr-category><option value="all">Všechny činnosti</option>${Object.entries(data?.categories || {}).map(([id, label]) => `<option value="${escape(id)}" ${id === category ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select></label></div><div class="dr-content" aria-live="polite"><p class="dr-sync">Hodnocený den: ${escape(dayLabel(data?.day))}<br>Synchronizace: ${escape(time(data?.lastSynchronizedAt))}<br>Výpočet: ${escape(time(data?.lastCalculatedAt))} · Europe/Prague</p>${loading ? '<p>Načítám hodnocení…</p>' : error ? `<p role="alert">${escape(error)}</p>` : driver ? driverDetail(driver) : `<p>Zakázky se doplňují se zpožděním. Hodnotíme den provedení až podle úplných podkladů. Jízda ani stání v T-Cars samy nepotvrzují směnu nebo kvalitu práce.</p><p>${data?.scope === 'own' ? 'Vlastní hodnocení' : states[status()] || 'Nehodnoceno'}</p><ul>${reasons(data?.reasons)}</ul>${data?.mode === 'shadow' ? '<p>Interní kontrolní režim. Výsledky nejsou zveřejněné.</p>' : ''}${data?.ranking?.length ? '<h3>TOP 5 hodnocených řidičů</h3>' : ''}${(data?.ranking || []).map(d => `<button type="button" class="dr-row" data-dr-driver="${escape(`${d.companyId}:${d.driverId}`)}"><span><strong>${d.rank}. ${escape(d.name)}</strong><small>${vehicles(d)}</small></span><strong>${fmt(d.total)}/100</strong><small>Výkon ${fmt(d.performance)}/50 · Efektivita ${fmt(d.efficiency)}/30 · Kvalita ${fmt(d.quality)}/20</small><progress max="100" value="${d.total}" aria-label="Celkem ${fmt(d.total)} bodů"></progress></button>`).join('')}${(data?.drivers || []).filter(d => data.scope === 'own' || d.total === null).map(d => `<button type="button" class="dr-row" data-dr-driver="${escape(`${d.companyId}:${d.driverId}`)}"><strong>${escape(d.name)}</strong><span>${d.total === null ? 'Nehodnoceno' : `${fmt(d.total)}/100`}</span><small>${(d.reasons || []).map(r => escape(labels[r] || r)).join(' ')}</small></button>`).join('')}${!data?.drivers?.length ? '<p>Pro toto období nejsou k dispozici ověřené výsledky.</p>' : ''}`}</div>`;
  }
  async function refreshCard() {
    if (!readRatings || destroyed) return;
    const id = ++cardRequest;
    try { const value = await readRatings('today', 'all'); if (!destroyed && id === cardRequest) today = value; }
    catch (e) { if (!destroyed && id === cardRequest) { today = { status: 'unavailable', error: e.status === 403 ? 'Nemáte oprávnění k tomuto hodnocení.' : 'Hodnocení se nepodařilo načíst.' }; if (dialog.open) { requestId++; data = null; selected = null; loading = false; error = today.error; renderDialog(); } } }
    if (!destroyed && id === cardRequest) renderCard();
  }
  async function load() {
    const id = ++requestId; loading = true; error = ''; data = null; renderDialog();
    try { const value = readRatings ? await readRatings(period, category) : null; if (!destroyed && id === requestId) data = value; }
    catch (e) { if (!destroyed && id === requestId) error = e.status === 403 ? 'Nemáte oprávnění k hodnocení.' : 'Zdroj hodnocení není dostupný. Zkuste obnovit později.'; }
    if (!destroyed && id === requestId) { loading = false; renderDialog(); dialog.querySelector('[data-dr-close]')?.focus(); }
  }
  function open() { if (dialog.open) return; returnFocus = card.querySelector('[data-dr-open]'); period = 'today'; category = 'all'; selected = null; dialog.showModal(); void load(); }
  const onCardClick = e => { if (e.target.closest('[data-op-open]')) openOperations?.(); else if (e.target.closest('[data-dr-open]')) open(); };
  card.addEventListener('click', onCardClick);
  dialog.addEventListener('click', e => {
    const button = e.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-dr-close')) dialog.close();
    if (button.hasAttribute('data-dr-period')) { period = button.dataset.drPeriod; selected = null; void load(); }
    if (button.hasAttribute('data-dr-driver')) { selected = button.dataset.drDriver; renderDialog(); dialog.querySelector('[data-dr-back]')?.focus(); }
    if (button.hasAttribute('data-dr-back')) { selected = null; renderDialog(); }
    if (button.hasAttribute('data-dr-vehicle')) {
      const driver = data.drivers.find(d => `${d.companyId}:${d.driverId}` === selected);
      if (selectVehicle(driver.vehicles[Number(button.dataset.drVehicle)].id)) dialog.close();
      else { const message = document.createElement('p'); message.setAttribute('role', 'status'); message.textContent = 'Vozidlo není v aktuálním oprávněném seznamu mapy.'; dialog.querySelector('.dr-content').append(message); }
    }
  });
  dialog.addEventListener('change', e => { if (e.target.hasAttribute('data-dr-day')) { if (e.target.value && e.target.validity.valid) { period = e.target.value; selected = null; void load(); } return; } if (e.target.hasAttribute('data-dr-category')) { category = e.target.value; selected = null; void load(); } });
  dialog.addEventListener('keydown', e => e.stopPropagation());
  dialog.addEventListener('close', () => { requestId++; returnFocus?.isConnected && returnFocus.focus(); });
  const timer = setInterval(() => { if (!document.hidden) { void refreshCard(); if (dialog.open && !selected) void load(); } }, 60000);
  renderCard(); void refreshCard();
  return { refresh: refreshCard, restore() { if (dialog.open && dialog.isConnected && !dialog.matches(':modal')) { dialog.removeAttribute('open'); dialog.showModal(); } }, destroy() { destroyed = true; requestId++; cardRequest++; clearInterval(timer); card.removeEventListener('click', onCardClick); dialog.close(); dialog.remove(); } };
}
