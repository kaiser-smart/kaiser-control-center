import { escape } from './presentation.js';
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const displayDay = day => day.split('-').reverse().join('. ');
const timestamp = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(value)) : 'nedoloženo';
const number = value => Number.isFinite(value) && value >= 0 ? new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 }).format(value) : '—';

// Observed vehicle movement only. No driver assignment, shift length, waste or score is inferred.
export function createOperations({ root, readOperations, readJobsSummary }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'dr-drawer op-drawer'; dialog.setAttribute('aria-labelledby', 'op-title'); root.append(dialog);
  let day = today(), data = null, jobs = null, error = '', jobsError = '', loading = false, requestId = 0, destroyed = false, returnFocus;
  function render() {
    if (!dialog.open) return;
    const rows = [...(data?.vehicles || [])].sort((a, b) => (a.licensePlate || a.vehicleKey).localeCompare(b.licensePlate || b.vehicleKey, 'cs', { numeric: true }));
    dialog.innerHTML = `<header class="dr-heading"><h2 id="op-title">Provoz podle T-Cars</h2><button type="button" data-op-close aria-label="Zavřít provozní přehled">×</button></header>
      <div class="dr-toolbar"><label>Den provozu<input type="date" data-op-day value="${escape(day)}" max="${today()}" aria-label="Den provozu"></label><button type="button" data-op-refresh>Obnovit podklady</button></div>
      <div class="dr-content" aria-live="polite">${loading ? '<p>Načítám podklady…</p>' : `<p><strong>${escape(displayDay(day))} · vozidla podle označení</strong></p>
        <p>Vzdálenost i čas pohybu jsou přibližné, odvozené z uložených GPS bodů. Nevyjadřují délku směny ani výkon řidiče. Chybějící data nejsou nulový výkon.</p>
        ${error ? `<p role="alert">${escape(error)}</p>` : `<p class="dr-sync">Poslední výpočet těchto podkladů: ${escape(timestamp(data?.summary?.lastCalculatedAt))} · Europe/Prague${data?.apiStatus === 'stale' ? '<br>Starší výpočet; aktuálnost dne není potvrzena.' : ''}</p>
          ${rows.length ? rows.map(v => {
            const usable = Number.isFinite(v.validSegmentCount) && v.validSegmentCount > 0;
            return `<section class="op-vehicle"><h3>${escape(v.licensePlate || 'Bez označení ve zdroji')}</h3><small>ID ve zdroji: ${escape(v.vehicleKey)}</small>
              <dl class="dr-times"><dt>Pozorovaná vzdálenost</dt><dd>${usable ? number(v.totalKm) : '—'} km</dd><dt>Pozorovaný čas pohybu</dt><dd>${usable ? number(v.movingMinutes) : '—'} min</dd></dl>
              <p>${usable ? 'Použitelné GPS intervaly: ' + number(v.validSegmentCount) + '. Vynechané intervaly: ' + number(v.rejectedSegmentCount) + '.' : 'Nedostatek GPS bodů pro výpočet.'} Úplnost celého dne není doložena.</p>
              <p class="dr-sync">První / poslední GPS bod: ${escape(timestamp(v.firstRecordedAt))} / ${escape(timestamp(v.lastRecordedAt))}<br>Výpočet vozidla: ${escape(timestamp(v.calculatedAt))}</p></section>`;
          }).join('') : '<p>Pro tento den nejsou dostupné uložené GPS souhrny. To neznamená, že vozidla nepracovala.</p>'}`}
        <section class="op-jobs"><h3>Zakázky · opožděné podklady</h3><p>Zakázky se doplňují zpětně. Datum plánu nemusí být datem provedení; k těmto jízdám nejsou automaticky přiřazené.</p>
          ${readJobsSummary ? `${jobsError ? `<p>${escape(jobsError)}</p>` : `<p class="dr-sync">Poslední příjem zakázek pro oprávněné firmy: ${escape(timestamp(jobs?.importProgress?.lastReceivedAt))}. Tento čas nepotvrzuje úplnost vybraného dne.</p>`}<a href="/zakazky">Otevřít Zakázky</a>` : '<p>Přístup k Zakázkám není pro tento účet dostupný.</p>'}</section>`}</div>`;
  }
  async function load() {
    const id = ++requestId, requestedDay = day;
    loading = true; data = null; jobs = null; error = ''; jobsError = ''; render();
    const [operation, job] = await Promise.allSettled([readOperations(requestedDay), readJobsSummary ? readJobsSummary() : Promise.resolve(null)]);
    if (destroyed || id !== requestId || !dialog.open) return;
    loading = false;
    if (operation.status === 'fulfilled' && operation.value?.day === requestedDay) data = operation.value;
    else error = operation.reason?.status === 403 ? 'Nemáte oprávnění k provoznímu přehledu.' : 'Podklady provozu se nepodařilo načíst. Obnovte je později.';
    if (job.status === 'fulfilled') jobs = job.value; else jobsError = 'Stav příjmu zakázek není dostupný.';
    render();
  }
  dialog.addEventListener('click', e => {
    if (e.target.closest('[data-op-close]')) dialog.close();
    if (e.target.closest('[data-op-refresh]')) void load();
  });
  dialog.addEventListener('change', e => { if (e.target.matches('[data-op-day]') && e.target.value && e.target.validity.valid) { day = e.target.value; void load(); } });
  dialog.addEventListener('keydown', e => e.stopPropagation());
  dialog.addEventListener('close', () => { requestId++; returnFocus?.isConnected && returnFocus.focus(); });
  return {
    restore() { if (dialog.open && dialog.isConnected && !dialog.matches(':modal')) { dialog.removeAttribute('open'); dialog.showModal(); } },
    open() { if (destroyed || dialog.open) return; returnFocus = document.activeElement; day = today(); dialog.showModal(); void load(); },
    destroy() { destroyed = true; requestId++; dialog.close(); dialog.remove(); }
  };
}
