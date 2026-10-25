import { SmartIcon } from "./components/icons/SmartIcon.js";
import { isMobileViewport, mobileViewportQuery } from './mobileViewport.js';
// Presentation only. Existing links, permissions and action handlers remain authoritative.
const states = new Map();
let owner = null;
let renderAfterResize = null;
let resizeMap = null;
let lastMobilePath = null;
let paginationObservers = [];
const mobile = isMobileViewport;
const stateFor = key => {
  if (!states.has(key)) states.set(key, { folds: {}, pages: {}, view: 'today', map: 'map' });
  return states.get(key);
};
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function button(text, callback, className = 'mobile-control') {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', callback);
  return node;
}
function fold(node, label, key, state) {
  if (!node || node.closest('.mobile-fold')) return;
  const wrapper = el('div', 'mobile-fold');
  const toggle = button(label, () => {
    state.folds[key] = !state.folds[key];
    sync();
  }, 'mobile-fold__toggle');
  toggle.setAttribute('aria-label', label);
  const content = el('div', 'mobile-fold__content');
  content.id = `mobile-fold-${key}`;
  toggle.setAttribute('aria-controls', content.id);
  const sync = () => {
    toggle.setAttribute('aria-expanded', String(Boolean(state.folds[key])));
    wrapper.classList.toggle('mobile-fold--open', Boolean(state.folds[key]));
  };
  node.before(wrapper);
  wrapper.append(toggle, content);
  content.append(node);
  sync();
}
function compactTabs(shell) {
  shell.querySelectorAll('.fleet-tabs, .collection-routes-tabs, .absence-tabs, .receivables-tabs, .tyres-tabs, .driver-report-tabs').forEach((tabs, i) => {
    const entries = [...tabs.querySelectorAll('a, button')];
    if (entries.length < 3) return;
    const label = el('label', 'mobile-section-select');
    label.append(el('span', '', 'Sekce'));
    const select = el('select', '');
    select.setAttribute('aria-label', tabs.getAttribute('aria-label') || 'Sekce modulu');
    entries.forEach((entry, index) => {
      const option = el('option', '', entry.textContent.trim());
      option.value = String(index);
      option.selected = entry.matches('[aria-selected="true"], [aria-current], .is-active') || /--active\b/.test(entry.className);
      select.append(option);
    });
    // Some task routes (for example Quick entry) are intentionally outside the tabs.
    // Do not pretend the first tab is active: it must remain a selectable destination.
    if (!entries.some(entry => entry.matches('[aria-selected="true"], [aria-current], .is-active') || /--active\b/.test(entry.className))) {
      const placeholder = el('option', '', 'Přejít do jiné sekce…');
      placeholder.value = '';
      placeholder.disabled = true;
      placeholder.selected = true;
      select.prepend(placeholder);
    }
    select.addEventListener('change', () => entries[Number(select.value)]?.click());
    label.append(select);
    tabs.before(label);
    tabs.classList.add('mobile-desktop-tabs');
    tabs.dataset.mobileTabs = String(i);
  });
}
function paginate(container, rows, key, state, size = 8) {
  if (rows.length <= size) return;
  const signature = rows.map(row => row.textContent.trim().slice(0, 100)).join('|');
  if (state.pages[key]?.signature !== signature) state.pages[key] = { signature, page: 0 };
  const paging = state.pages[key];
  let count = Math.ceil(rows.length / size);
  const pager = el('nav', 'mobile-pager');
  pager.setAttribute('aria-label', 'Stránky seznamu');
  const text = el('span', '');
  text.setAttribute('aria-live', 'polite');
  const sync = () => {
    const active = rows.filter(row=>!row.hidden);
    count = Math.max(1, Math.ceil(active.length / size));
    paging.page = Math.min(count - 1, Math.max(0, paging.page));
    rows.forEach(row => row.classList.toggle('mobile-page-hidden', row.hidden || Math.floor(active.indexOf(row) / size) !== paging.page));
    pager.hidden = active.length <= size;
    text.textContent = `${active.length ? paging.page * size + 1 : 0}–${Math.min(active.length, (paging.page + 1) * size)} / ${active.length}`;
    prev.disabled = paging.page === 0;
    next.disabled = paging.page === count - 1;
  };
  const turn = delta => { paging.page += delta; sync(); container.scrollIntoView({ block: 'start' }); };
  const prev = button('Předchozí', () => turn(-1));
  const next = button('Další', () => turn(1));
  pager.append(prev, text, next);
  container.after(pager);
  const observer = new MutationObserver(() => { paging.page = 0; sync(); });
  rows.forEach(row=>observer.observe(row,{attributes:true,attributeFilter:['hidden']}));
  paginationObservers.push(observer);
  sync();
}
function compactTables(shell, state) {
  shell.querySelectorAll('table, .fleet-table, .fleet-work-table').forEach((table, tableIndex) => {
    // Multi-span calendars keep their existing structure; permission inputs stay in their original form.
    if (table.querySelector('th[colspan], th[rowspan]') || /calendar/.test(table.className)) return;
    const headers = [...table.querySelectorAll('thead th, [role="columnheader"]')].map(node => node.textContent.trim());
    const rows = [...table.querySelectorAll('tbody > tr, .fleet-table__row, .fleet-work-table__row')].filter(row => !row.querySelector('td[colspan]'));
    table.classList.add('mobile-records');
    rows.forEach((row, rowIndex) => {
      const cells = [...row.children].filter(cell => cell.matches('td, [role="cell"]'));
      if (cells.length < 3 || cells.some(cell => cell.colSpan > 1)) return;
      row.classList.add('mobile-record');
      cells.forEach((cell, i) => {
        const label = cell.dataset.label || headers[i] || '';
        cell.dataset.mobileLabel = label;
        const key = table.matches('.access-permissions-table') ? i === 0 : table.matches('.fleet-table') ? /^(SPZ|Stav)$/.test(label) : i < 2;
        cell.classList.toggle('mobile-record-key', key);
      });
      const host = el(cells[0].tagName.toLowerCase(), 'mobile-record-toggle');
      if (host.tagName !== 'TD') host.setAttribute('role', 'cell');
      const key = `row-${tableIndex}-${rowIndex}-${cells[1].textContent.trim()}`;
      const toggle = button('Detail', () => { state.folds[key] = !state.folds[key]; sync(); });
      const sync = () => {
        row.classList.toggle('mobile-record--open', Boolean(state.folds[key]));
        toggle.setAttribute('aria-expanded', String(Boolean(state.folds[key])));
        toggle.textContent = state.folds[key] ? 'Zavřít' : 'Detail';
      };
      host.append(toggle); row.append(host); sync();
    });
    paginate(table, rows, `table-${tableIndex}`, state);
  });
  for (const selector of ['.tracking-operational-list__items', '.driver-report-mobile-reports__list', '.ds-plus-triage-mailboxes']) {
    const list = shell.querySelector(selector);
    if (list) paginate(list, [...list.children], selector, state, selector.includes('mailboxes') ? 4 : 8);
  }
}
function mobileHome(shell, links, state) {
  if (!shell.classList.contains('ui-system-pilot--home')) return;
  const workspace = el('section', 'mobile-today');
  workspace.setAttribute('aria-label', 'Dnešní práce');
  workspace.append(el('h1', '', 'Dnes v provozu'));
  const source = shell.querySelector('.main-dashboard-live-state strong');
  workspace.append(el('p', 'mobile-source', source?.textContent || 'Provozní data nejsou dostupná'));
  const kpis = el('div', 'mobile-today-kpis');
  const sourceKpis = shell.querySelectorAll('.main-dashboard-kpi');
  [0, 1, 3].forEach(index => { if (sourceKpis[index]) kpis.append(sourceKpis[index].cloneNode(true)); });
  workspace.append(kpis);
  workspace.append(el('h2', '', 'Rychlé akce'));
  const quick = el('div', 'mobile-quick-actions');
  [['/sledovani-vozidel', 'Poloha vozidel'], ['/hlaseni-ridicu', 'Nové hlášení'], ['/dovolena-nemoc/rychle-zadani', 'Nepřítomnost'], ['/datove-schranky-plus', 'Datové schránky']].forEach(([path, title]) => {
    const sourceLink = links.find(link => new URL(link.href).pathname === path);
    if (!sourceLink) return;
    const link = sourceLink.cloneNode(true);
    link.className = 'mobile-quick-action';
    link.removeAttribute('aria-current');
    link.querySelector('span:last-child').textContent = title;
    quick.append(link);
  });
  workspace.append(quick);
  const attention = el('div', 'mobile-attention');
  attention.append(el('h2', '', 'Vyžaduje pozornost'));
  const items = [...shell.querySelectorAll('.main-dashboard-attention')];
  items.forEach(item => attention.append(item.cloneNode(true)));
  if (!items.length) attention.append(el('p', '', 'Další agendy najdete v nabídce Více.'));
  workspace.append(attention);
  paginate(attention, [...attention.querySelectorAll('a')], 'attention', state, 2);
  const tabs = el('div', 'mobile-view-switch');
  const sync = () => {
    shell.dataset.mobileHome = state.view;
    today.setAttribute('aria-pressed', String(state.view === 'today'));
    reports.setAttribute('aria-pressed', String(state.view === 'reports'));
  };
  const today = button('Dnes', () => { state.view = 'today'; sync(); });
  const reports = button('Přehledy', () => { state.view = 'reports'; sync(); });
  tabs.append(today, reports);
  shell.querySelector('.mobile-header').after(tabs, workspace);
  sync();
  fold(shell.querySelector('.main-dashboard-economics'), 'Ekonomika a výkony', 'economics', state);
  fold(shell.querySelector('.main-dashboard-operations'), 'Úplný přehled provozu', 'operations', state);
}
function mapWorkspace(shell, state) {
  const map = shell.querySelector('.tracking-operational');
  if (!map) return;
  const switcher = el('div', 'mobile-view-switch mobile-map-switch');
  const sync = () => {
    map.dataset.mobileMap = state.map;
    mapButton.setAttribute('aria-pressed', String(state.map === 'map'));
    listButton.setAttribute('aria-pressed', String(state.map === 'list'));
    window.dispatchEvent(new Event('resize'));
  };
  const mapButton = button('Mapa', () => { state.map = 'map'; sync(); });
  const listButton = button('Vozidla', () => { state.map = 'list'; sync(); });
  const detailButton = button('Detail', () => revealDetail());
  const revealDetail = () => {
    state.map = 'list'; sync();
    const toggle = map.querySelector('[aria-controls="mobile-fold-map-detail"]');
    if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
    toggle?.scrollIntoView({block:'start'});
  };
  map.addEventListener('mobile-vehicle-selected', revealDetail);
  switcher.append(mapButton, listButton, detailButton);
  map.prepend(switcher);
  fold(map.querySelector('.tracking-operational-map-stage__bar'), 'Ovládání mapy', 'map-controls', state);
  fold(map.querySelector('.tracking-operational-detail'), 'Detail vybraného vozidla', 'map-detail', state);
  fold(map.querySelector('.tracking-operational-metrics'), 'Souhrn poloh', 'map-metrics', state);
  const stage = map.querySelector('.tracking-operational-map-stage');
  const size = () => {
    if (mobile() && stage?.isConnected && state.map === 'map') {
      stage.style.setProperty('--mobile-map-space', `${Math.max(220, (window.visualViewport?.height || innerHeight) - stage.getBoundingClientRect().top - shell.scrollTop)}px`);
    }
  };
  sync();
  requestAnimationFrame(size);
  resizeMap = size;
}
function otherWorkspaces(shell, state) {
  const panels = [
    ['.module-settings-panel', 'Stav a nastavení modulu'],
    ['.notification-center:not(.customer-messaging)', 'Notifikace e-mailů a SMS'],
    ['.customer-messaging', 'Provozní zprávy zákazníkům'],
    ['.access-editor', 'Detail a úprava uživatele'], ['.access-roles', 'Role a oprávnění'],
    ['.self-repair-overview', 'Stav automatické kontroly'], ['.self-repair-filters', 'Hledat a filtrovat případy'],
    ['.fuel-filters', 'Hledat a filtrovat tankování'], ['.fuel-trend', 'Vývoj tankování'],
    ['.fuel-source-note', 'Zdroj a omezení údajů'], ['.absence-panels', 'Schvalování a tento týden']
  ];
  panels.forEach(([selector,label],i)=>shell.querySelectorAll(selector).forEach((node,j)=>fold(node,label,`other-${i}-${j}`,state)));
  shell.querySelectorAll('.system-check-card').forEach((node,i)=>{
    const title=node.querySelector('h2')?.textContent || 'Stav služby';
    const statuses=[...new Set([...node.querySelectorAll('.system-check-status')].map(x=>x.textContent.trim()))];
    fold(node,`${title}${statuses.length?' · '+statuses.join(' / '):''}`,`system-${i}`,state);
  });
  const absence=shell.querySelector('.absence-dashboard');
  if(absence) {
    const quick=absence.querySelector('.absence-panel--quick');
    const kpis=absence.querySelector('.absence-kpis');
    if(quick && kpis) kpis.after(quick);
    const detail=absence.querySelector('.absence-detail-panel');
    if(detail && !detail.querySelector('button,input,select')) fold(detail,'Detail vybrané absence','absence-detail',state);
  }
  for(const selector of ['.ds-plus-message-list','.self-repair-list__items','.absence-worklist']) {
    const list=shell.querySelector(selector);if(list) paginate(list,[...list.children],selector,state);
  }
  const feedback = shell.querySelector('.self-repair-workspace');
  const overview = shell.querySelector('.self-repair-overview')?.closest('.mobile-fold');
  if(feedback && overview) feedback.after(overview);
}
export function revealMobileTarget(node) {
  if (!mobile() || !node) return;
  let parent = node.closest('.mobile-fold');
  while (parent) {
    const toggle = parent.querySelector(':scope > .mobile-fold__toggle');
    if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
    parent = parent.parentElement?.closest('.mobile-fold');
  }
}
export function applyMobileWorkspace(app, { userId, activeModuleId, render }) {
  renderAfterResize = render;
  paginationObservers.forEach(observer=>observer.disconnect()); paginationObservers = [];
  if (!mobile()) return;
  if (owner !== userId) { states.clear(); owner = userId; }
  document.body.classList.remove('mobile-menu-open');
  const shell = app.querySelector('main.ui-system-v2');
  if (!shell || shell.querySelector('.mobile-header')) return;
  if (lastMobilePath !== location.pathname) {
    lastMobilePath = location.pathname;
    requestAnimationFrame(() => shell.scrollTo({top:0, behavior:'instant'}));
  }
  const state = stateFor(location.pathname + location.search);
  const sidebar = shell.querySelector('.ui-pilot-sidebar');
  if (!sidebar) return;
  const links = [...sidebar.querySelectorAll('a[data-link]')].filter(link => link.closest('nav'));
  const title = shell.querySelector('h1')?.textContent.trim() || document.title.split('|')[0].trim();
  const header = el('header', 'mobile-header');
  const home = el('a', 'mobile-home-link');
  home.innerHTML = SmartIcon('home');
  home.href = sidebar.querySelector('.ui-pilot-brand').href;
  home.dataset.link = '';
  home.setAttribute('aria-label', 'Zpět na přehled');
  header.append(home, el('strong', '', activeModuleId === 'dashboard' ? 'SMART ODPADY' : title));
  const dialog = el('dialog', 'mobile-menu');
  dialog.setAttribute('aria-label', 'Všechny agendy a účet');
  let opener;
  const close = () => { state.menuOpen = false; dialog.close(); document.body.classList.remove('mobile-menu-open'); opener?.focus(); };
  const menuTop = el('div', 'mobile-menu__head');
  menuTop.append(el('h2', '', 'Více'), button('Zavřít', close));
  const search = el('input', 'mobile-menu-search');
  search.type = 'search'; search.placeholder = 'Najít agendu'; search.setAttribute('aria-label', 'Najít agendu');
  const nav = sidebar.querySelector('nav').cloneNode(true);
  nav.className = 'mobile-menu-nav';
  search.addEventListener('input', () => {
    const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    state.menuQuery = search.value;
    const query = normalize(search.value);
    nav.querySelectorAll('a').forEach(link => { link.hidden = !normalize(link.textContent).includes(query); });
    nav.querySelectorAll('section').forEach(group => { group.hidden = !group.querySelector('a:not([hidden])'); });
  });
  dialog.append(menuTop, search, nav);
  const userbar = shell.querySelector('.user-bar');
  if (userbar) dialog.append(userbar.cloneNode(true));
  dialog.addEventListener('click', event => { if (event.target.closest('a, [data-logout]')) close(); });
  dialog.addEventListener('close', () => document.body.classList.remove('mobile-menu-open'));
  dialog.addEventListener('cancel', () => { state.menuOpen = false; });
  const open = event => { state.menuOpen = true; opener = event.currentTarget; dialog.showModal(); document.body.classList.add('mobile-menu-open'); menuTop.querySelector('button').focus(); };
  header.append(button('Více', open));
  const bottom = el('nav', 'mobile-bottom-nav'); bottom.setAttribute('aria-label', 'Hlavní mobilní navigace');
  (shell.classList.contains('ui-system-pilot--modules') ? [['/', 'Moduly']] : [['/', 'Moduly'], ['/vozovy-park', 'Vozidla'], ['/trasy-svozu', 'Trasy'], ['/hlaseni-ridicu', 'Hlášení']]).forEach(([path, label]) => {
    const sourceLink = links.find(link => new URL(link.href).pathname === path);
    if (!sourceLink) return;
    const link = sourceLink.cloneNode(true);
    link.className = 'mobile-bottom-link';
    link.querySelector('span:last-child').textContent = label;
    if (path === '/vozovy-park') link.hash = 'fleet-vehicles';
    bottom.append(link);
  });
  const more = button('', open, 'mobile-bottom-link');
  more.innerHTML = `${SmartIcon('more')}<span>Více</span>`;
  bottom.append(more);
  shell.prepend(header); shell.append(bottom, dialog);
  if (state.menuOpen) { open({currentTarget:header.querySelector('button')}); search.value = state.menuQuery || ''; search.dispatchEvent(new Event('input')); search.focus(); }
  compactTabs(shell);
  [
    ['.fleet-filters', 'Hledat a filtrovat vozidla'], ['.fleet-tracking-bridge', 'Napojení GPS'],
    ['.collection-routes-print-filter', 'Filtry a akce trasy'], ['.collection-daily-routes__prepare', 'Připravit denní trasu'],
    ['.collection-routes-stats', 'Souhrn trasy'], ['.tracking-operational-toolbar', 'Hledat a filtrovat polohy'],
    ['.driver-report-filters', 'Filtry hlášení'], ['.receivables-guardrails', 'Pravidla práce s fakturami'],
    ['.receivables-source-grid', 'Datové zdroje'], ['.module-event-log', 'Provozní záznamy'],
    ['.module-rules', 'Pravidla modulu'], ['.fleet-detail-header', 'Identifikace vozidla'],
    ['.collection-routes-panel__head', 'Stav zdroje a obnova'], ['.driver-report-plate-override', 'Výjimka: neověřená SPZ'], ['.driver-report-check--external', 'Volitelné ověření dílu a cen'], ['.quick-absence-recent', 'Poslední žádosti'],
    ['.ds-plus-status-note', 'Stav synchronizace · podrobnosti'], ['.receivables-panel[aria-labelledby=receivables-source-title]', 'Napojení a datové zdroje'],
    ['.receivables-panel[aria-labelledby=receivables-unmatched-title]', 'Nespárované platby'], ['#receivables-dry-run', 'Doporučení a pravidla']
  ].forEach(([selector, label], index) => shell.querySelectorAll(selector).forEach((node, i) => fold(node, label, `section-${index}-${i}`, state)));
  // Preserve explanations and secondary actions behind one consistent control.
  shell.querySelectorAll(':scope > .module-detail').forEach((hero, index) => { fold(hero, 'Informace a další akce', `hero-${index}`, state); dialog.append(hero.closest('.mobile-fold')); });
  mobileHome(shell, links, state);
  mapWorkspace(shell, state);
  compactTables(shell, state);
  otherWorkspaces(shell, state);
  // Keep dispatcher functions available on phones; older CSS hid this entire workspace.
  const queue = shell.querySelector('.driver-report-desktop-workspace');
  if (queue) fold(queue, 'Pracovní fronta a správa hlášení', 'report-workspace', state);
  const kpis = shell.querySelector('.receivables-kpi-grid');
  if (kpis && kpis.children.length > 4) {
    const extra = el('div', 'receivables-kpi-grid');
    [...kpis.children].slice(4).forEach(node => extra.append(node));
    kpis.after(extra);
    fold(extra, 'Další ukazatele', 'invoice-kpis', state);
  }
  const ownReports = shell.querySelector('.driver-report-mobile-reports');
  if (ownReports) fold(ownReports, 'Moje hlášení', 'my-reports', state);
  if (activeModuleId === 'settings') {
    [...shell.children].filter(node=>node.matches('section')).forEach((node,i)=>fold(node,node.querySelector('h2,h3')?.textContent || 'Nastavení',`settings-${i}`,state));
  }
  shell.querySelectorAll('.absence-hero, .tyres-header').forEach((node,i)=>{fold(node,'Informace a akce',`module-info-${i}`,state); dialog.append(node.closest('.mobile-fold'));});
  const overview = shell.querySelector('.fleet-overview');
  if (overview) overview.querySelectorAll('.fleet-work-block').forEach((node,i)=>fold(node,node.querySelector('h3')?.textContent || 'Podrobnosti',`fleet-overview-${i}`,state));
  const vehicles = shell.querySelector('#fleet-vehicles');
  if (vehicles) {
    const grid = vehicles.querySelector('.fleet-vehicle-summary-grid');
    if (grid) {
      const summary = el('div', 'mobile-fleet-summary');
      [...grid.children].slice(0,2).forEach(item=>summary.append(item.cloneNode(true)));
      vehicles.querySelector('.fleet-section__head')?.after(summary);
      vehicles.append(grid);
      fold(grid, 'Úplný souhrn vozidel', 'fleet-summary', state);
    }
    const gps = vehicles.querySelector('.fleet-tracking-bridge')?.closest('.mobile-fold');
    if (gps) vehicles.append(gps);
    const note = vehicles.querySelector('.fleet-operational-note');
    if (note && /Vozidla byla načtena/.test(note.textContent)) {
      vehicles.append(note);
      fold(note, 'Informace o načtení', 'fleet-source-note', state);
    }
  }
  const vehicleDetail = shell.querySelector('#fleet-detail .fleet-detail-shell');
  if (vehicleDetail) {
    const identity = vehicleDetail.querySelector('.fleet-detail-header');
    const summary = el('p', 'mobile-vehicle-identity', [identity?.children[0]?.querySelector('strong')?.textContent, identity?.children[6]?.querySelector('strong')?.textContent].filter(Boolean).join(' · '));
    const back = el('a', 'mobile-control mobile-vehicle-back', '‹ Všechna vozidla');
    back.href = '/vozovy-park#fleet-vehicles'; back.dataset.link = '';
    vehicleDetail.before(back, summary);
    const actions = vehicleDetail.querySelector('.fleet-detail-card--actions');
    if (actions) vehicleDetail.prepend(actions);
    vehicleDetail.querySelectorAll('.fleet-detail-card').forEach((node, i) => {
      if (node === actions) {
        fold(node.querySelector('.fleet-detail-secondary-actions'), 'Další akce vozidla', 'vehicle-more-actions', state);
      } else fold(node, node.querySelector('h3')?.textContent || 'Podrobnosti vozidla', `vehicle-detail-${i}`, state);
    });
  }
  // Route selection stays first; source diagnostics follow the daily task.
  const daily = shell.querySelector('.collection-daily-routes');
  const sourcePanel = shell.querySelector('#collection-routes-source-routes');
  if (daily && sourcePanel?.contains(daily)) {
    sourcePanel.prepend(daily);
    const reference = el('div', 'mobile-route-reference');
    [...sourcePanel.children].filter(node=>node!==daily).forEach(node=>reference.append(node));
    sourcePanel.append(reference);
    fold(reference, 'Zdrojové podklady a náhled trasy', 'route-reference', state);
  }

}

// VisualViewport reports keyboard occlusion without guessing device-specific keyboard heights.
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => resizeMap?.());
  matchMedia(mobileViewportQuery).addEventListener('change', () => {
    document.querySelector('dialog.mobile-menu[open]')?.close();
    document.body.classList.remove('mobile-menu-open');
    renderAfterResize?.();
  });
}
