import { TYPES, searchKey } from './model.js';
import { artwork, escape } from './presentation.js';
import { SmartIcon } from '../components/icons/SmartIcon.js';

// A review document for the user to hand to the implementer, not fleet storage.
// Only explicit choices are exported. GPS, drivers and authentication are omitted.
export const ICON_CHOICES = Object.freeze([
  ['collection_truck', 'Popelářský vůz'], ['tanker', 'Cisterna'],
  ['tanker_compact', 'Cisterna – 2 nápravy'],
  ['skip_loader', 'RAM / ramenový nakladač'], ['container_truck', 'Hákový nosič'],
  ['box_body', 'Vůz s kontejnerem'], ['box_body_compact', 'Vůz s kontejnerem – 2 nápravy'], ['truck', 'Nákladní vůz'],
  ['van', 'Dodávka'], ['van_passenger', 'Dodávka / minibus'], ['car', 'Osobní vůz'], ['excavator', 'Bagr'],
  ['forklift', 'Vysokozdvižný vozík'], ['trailer', 'Přívěs – bez dodané ikony'],
  ['special', 'Speciální – bez dodané ikony'], ['unknown', 'Nevím / doplnit podklad']
].map(([key, label]) => Object.freeze({ key, label, monogram: TYPES[key]?.monogram })));
const validIcon = key => ICON_CHOICES.some(icon => icon.key === key);
const identity = v => searchKey(v.plate).toUpperCase();
export function assignmentDocument(vehicles, choices, date = new Date()) {
  return {
    format: 'smart-odpady-vehicle-icon-review', version: 1, purpose: 'proposal',
    createdAt: date.toISOString(),
    assignments: vehicles.filter(v => v.stable && validIcon(choices.get(v.id))).map(v => ({
      vehicleId: v.id, licensePlate: v.plate, name: v.name, icon: choices.get(v.id)
    }))
  };
}
export function readAssignments(input, vehicles) {
  if (!input || input.format !== 'smart-odpady-vehicle-icon-review' || input.version !== 1 || input.purpose !== 'proposal' || !Array.isArray(input.assignments) || input.assignments.length > 1000) {
    throw new Error('Soubor není platný návrh přiřazení ikon.');
  }
  const available = new Map(vehicles.filter(v => v.stable).map(v => [v.id, v]));
  const choices = new Map(), seen = new Set(); let skipped = 0;
  for (const row of input.assignments) {
    if (!row || typeof row.vehicleId !== 'string' || typeof row.licensePlate !== 'string' || !validIcon(row.icon) || seen.has(row.vehicleId)) {
      throw new Error('Soubor obsahuje neplatné nebo duplicitní přiřazení.');
    }
    seen.add(row.vehicleId);
    const v = available.get(row.vehicleId);
    if (!v || identity(v) !== identity({ plate: row.licensePlate })) { skipped++; continue; }
    choices.set(v.id, row.icon);
  }
  return { choices, skipped };
}
export function createIconAssignment({ root, getVehicles }) {
  const dialog = document.createElement('dialog'); dialog.className = 'vm-icon-assignment';
  dialog.setAttribute('aria-labelledby', 'vm-assignment-title');
  dialog.innerHTML = `<header><div><p class="vm-assignment-eyebrow">Návrh přiřazení</p><h2 id="vm-assignment-title">Správná ikona pro každé auto</h2></div><button type="button" data-ia-close aria-label="Zavřít přiřazování ikon">${SmartIcon('close')}</button></header>
    <p class="vm-assignment-help">Vyberte auto a klepněte na jeho ikonu. Hotový nebo rozpracovaný návrh stáhněte a přiložte do tohoto chatu. Teprve podle něj upravím mapu.</p>
    <div class="vm-assignment-layout"><aside><label for="vm-assignment-search">Najít vozidlo</label><input type="search" id="vm-assignment-search" placeholder="Název nebo SPZ" autocomplete="off"><label class="vm-assignment-only"><input type="checkbox" data-ia-only> Jen bez vašeho výběru</label><label for="vm-assignment-vehicle" class="vm-sr">Vozidlo</label><select id="vm-assignment-vehicle" size="12"></select><p data-ia-matches></p></aside>
    <section class="vm-assignment-editor"><div data-ia-vehicle></div><div class="vm-assignment-choices" role="group" aria-label="Vyberte ikonu">${ICON_CHOICES.map(icon => `<button type="button" data-ia-icon="${icon.key}" aria-pressed="false">${artwork(icon)}<span>${escape(icon.label)}</span></button>`).join('')}</div><div class="vm-assignment-navigation"><button type="button" data-ia-clear>Zrušit výběr</button><button type="button" data-ia-next>Další bez výběru ${SmartIcon('chevron-right')}</button></div></section></div>
    <footer><div><strong data-ia-progress></strong><p data-ia-status role="status">Návrh je pouze v této kartě. Před odchodem jej stáhněte.</p></div><div class="vm-assignment-files"><button type="button" data-ia-import>Načíst návrh</button><input type="file" data-ia-file accept=".json,application/json" hidden><button type="button" data-ia-download>Stáhnout návrh</button></div></footer>`;
  root.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  let choices = new Map(), selected = '', dirty = false, destroyed = false, importRequest = 0;
  const fleet = () => getVehicles().filter(v => v.stable);
  function currentRows() {
    const q = searchKey($('#vm-assignment-search').value);
    return fleet().filter(v => searchKey(`${v.name} ${v.plate} ${v.internal}`).includes(q) && (!$('[data-ia-only]').checked || !choices.has(v.id) || v.id === selected));
  }
  function render() {
    const all = fleet(), ids = new Set(all.map(v => v.id));
    for (const id of choices.keys()) if (!ids.has(id)) choices.delete(id);
    const rows = currentRows();
    if (!rows.some(v => v.id === selected)) selected = rows[0]?.id || '';
    const select = $('#vm-assignment-vehicle');
    select.size = matchMedia('(max-width:720px)').matches ? 1 : 12;
    select.innerHTML = rows.length ? rows.map(v => `<option value="${escape(v.id)}" ${v.id === selected ? 'selected' : ''}>${choices.has(v.id) ? '✓ ' : ''}${escape(v.plate || v.label)} · ${escape(v.name || 'Bez názvu')}</option>`).join('') : '<option value="">Žádné vozidlo</option>';
    select.disabled = !rows.length;
    $('[data-ia-matches]').textContent = `${rows.length} z ${all.length} vozidel`;
    const v = all.find(v => v.id === selected), chosen = ICON_CHOICES.find(i => i.key === choices.get(selected));
    $('[data-ia-vehicle]').innerHTML = v ? `<div class="vm-assignment-current">${artwork(chosen || v.type)}<div><h3>${escape(v.name || v.label)}</h3><p>${escape(v.plate || v.label)}</p><small>${chosen ? `Váš výběr: ${escape(chosen.label)}` : `Nyní na mapě: ${escape(v.type.label)}`}</small></div></div>` : '<p>Vyhledávání neodpovídá žádné vozidlo se stabilní identitou.</p>';
    dialog.querySelectorAll('[data-ia-icon]').forEach(button => { button.disabled = !v; button.setAttribute('aria-pressed', String(button.dataset.iaIcon === chosen?.key)); });
    $('[data-ia-clear]').disabled = !chosen;
    $('[data-ia-next]').disabled = !all.some(v => v.id !== selected && !choices.has(v.id));
    $('[data-ia-download]').disabled = !choices.size;
    $('[data-ia-progress]').textContent = `${choices.size} / ${all.length} přiřazeno`;
  }
  const status = text => { $('[data-ia-status]').textContent = text; };
  function open(id = '') {
    if (id) selected = id;
    render(); if (!dialog.open) dialog.showModal();
    $('[data-ia-close]').focus({ preventScroll: true });
    dialog.scrollTop = 0;
  }
  function download() {
    const content = JSON.stringify(assignmentDocument(fleet(), choices), null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'smart-odpady-prirazeni-ikon.json';
    dialog.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    dirty = false;
    status('Stahování návrhu bylo zahájeno. Soubor přiložte do chatu; přiřazení ještě není nasazené na mapě.');
  }
  dialog.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-ia-close')) dialog.close();
    if (button.hasAttribute('data-ia-icon') && selected) {
      choices.set(selected, button.dataset.iaIcon); dirty = true; render();
      status('Výběr přidán do návrhu. Pokračujte dalším autem nebo návrh stáhněte.');
    }
    if (button.hasAttribute('data-ia-clear')) { choices.delete(selected); dirty = true; render(); status('Výběr pro toto auto byl zrušen.'); }
    if (button.hasAttribute('data-ia-next')) {
      const all = fleet(), index = all.findIndex(v => v.id === selected);
      const next = [...all.slice(index + 1), ...all.slice(0, index)].find(v => !choices.has(v.id));
      if (next) { selected = next.id; $('#vm-assignment-search').value = ''; render(); }
    }
    if (button.hasAttribute('data-ia-download')) download();
    if (button.hasAttribute('data-ia-import')) $('[data-ia-file]').click();
  });
  $('#vm-assignment-search').addEventListener('input', render);
  $('[data-ia-only]').addEventListener('change', render);
  $('#vm-assignment-vehicle').addEventListener('change', event => { selected = event.target.value; render(); });
  $('[data-ia-file]').addEventListener('change', async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    const request = ++importRequest;
    try {
      if (file.size > 1024 * 1024) throw new Error('Návrh je příliš velký (nejvýše 1 MB).');
      const input = JSON.parse(await file.text());
      if (destroyed || request !== importRequest) return;
      const result = readAssignments(input, fleet()); let added = 0, conflicts = 0;
      for (const [id, icon] of result.choices) {
        if (choices.has(id) && choices.get(id) !== icon) { conflicts++; continue; }
        choices.set(id, icon); added++;
      }
      dirty = true; render();
      status(`Načteno ${added} přiřazení. ${result.skipped ? `${result.skipped} vozidel není v aktuální flotile nebo se změnila SPZ. ` : ''}${conflicts ? `${conflicts} rozpracovaných voleb se liší; váš současný výběr zůstal zachován. ` : ''}Návrh se do mapy zatím nepromítá.`);
    } catch (error) { if (!destroyed && request === importRequest) status(error instanceof SyntaxError ? 'Soubor není platný JSON. Dosavadní výběr zůstal zachován.' : error.message); }
  });
  // Escape only closes this dialog, never the vehicle detail underneath it.
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dialog.close(); } });
  const beforeUnload = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  const onResize = () => { if (dialog.open) render(); };
  window.addEventListener('resize', onResize);
  return { open, update() { if (dialog.open) {
    // The existing shell reparents the workspace at the mobile breakpoint.
    // Re-enter the modal top layer after that move; keep the in-memory draft.
    if (dialog.isConnected && !dialog.matches(':modal')) { const scroll = dialog.scrollTop; dialog.close(); dialog.showModal(); dialog.scrollTop = scroll; }
    render();
  } }, destroy() { destroyed = true; importRequest++; choices.clear(); dirty = false; window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('resize', onResize); dialog.remove(); } };
}
