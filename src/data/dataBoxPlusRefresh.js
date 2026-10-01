// This watchdog refreshes the read-only view, never starts an ISDS sync.
export const DATA_BOX_VIEW_REFRESH_MS = 60_000;
export const DATA_BOX_SYNC_STALE_MS = 45 * 60_000;

export function dataBoxPlusSyncHealth({ mailboxes = [], lastLoadedAt = 0, error = '', background = null, now = Date.now() } = {}) {
  if (error) return { warning: true, text: 'Aktuální data se nepodařilo ověřit. Obnovu zkusíme automaticky znovu.' };
  if (!lastLoadedAt) return { warning: true, text: 'Ověřuji stav automatického načítání.' };
  if (now - lastLoadedAt > 90_000) return { warning: true, text: 'Zobrazení není aktuální. Automaticky obnovujeme data; při otevřeném formuláři počkáme na jeho zavření.' };
  if (background?.enabled === false) return { warning: true, text: 'Serverové automatické načítání je vypnuté.' };
  if (!mailboxes.length) return { warning: true, text: 'Nejsou doložené žádné schránky.' };
  const failed = mailboxes.filter(box => box.lastSyncStatus === 'failed');
  const stale = mailboxes.filter(box => !Number.isFinite(Date.parse(box.lastSync)) || now - Date.parse(box.lastSync) > DATA_BOX_SYNC_STALE_MS);
  if (stale.length) return { warning: true, text: `U ${stale.length} schránek není doložené načtení za posledních 45 minut. Je potřeba prověřit serverové načítání.` };
  if (failed.length) return { warning: true, text: `${mailboxes.length - failed.length} z ${mailboxes.length} schránek načteno. ${failed.length} schránky vyžadují opravu připojení.` };
  if (mailboxes.some(box => box.lastSyncStatus !== 'success')) return { warning: true, text: 'Úspěšné dokončení načítání všech schránek zatím není doložené.' };
  return { warning: false, text: 'Poslední načítání všech schránek je ověřené. Server kontroluje ISDS každých 30 minut.' };
}

export function installDataBoxPlusViewRecovery({ window, document, active, blocked, refresh, updateStatus, now = Date.now }) {
  let busy = false;
  let lastAttempt = -Infinity;
  const tick = async () => {
    if (!active() || document.visibilityState === 'hidden') return;
    updateStatus();
    if (busy || blocked() || now() - lastAttempt < DATA_BOX_VIEW_REFRESH_MS) return;
    busy = true;
    lastAttempt = now();
    try { await refresh(); } catch { /* loader owns the visible error; next tick retries */ }
    finally { busy = false; updateStatus(); }
  };
  const timer = window.setInterval(() => { void tick(); }, 15_000);
  for (const event of ['focus', 'online', 'pageshow']) window.addEventListener(event, tick);
  document.addEventListener('visibilitychange', tick);
  return {
    tick,
    stop() {
      window.clearInterval(timer);
      for (const event of ['focus', 'online', 'pageshow']) window.removeEventListener(event, tick);
      document.removeEventListener('visibilitychange', tick);
    }
  };
}
