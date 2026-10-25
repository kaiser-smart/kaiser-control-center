// Online-only session lifecycle. Persistent storage contains one logout-intent bit,
// never a token, identity, draft or business data. The server remains authoritative.
export function createSessionGuard({ root, getUser, onEnd, onUserChanged, onSignOut = () => {}, retainReadOnlyView = () => false, win = window, doc = document, request = fetch }) {
  const key = "smart-odpady.logout-pending";
  const cookieKey = "__Host-smart_odpady_logout_pending";
  let pending = false;
  let expiresAt = 0;
  let timer;
  let checking;
  let signingOut;
  let epoch = 0;
  let ended = false;
  let identity = "";
  const originalDisplay = root.style.display;
  const gate = doc.createElement("main");
  gate.className = "login-shell";
  gate.id = "session-guard";
  gate.style.display = "none";
  gate.innerHTML = '<section class="login-panel" aria-labelledby="session-guard-title"><h1 id="session-guard-title">SMART ODPADY</h1><p class="login-subtitle" role="status" data-session-message></p><div class="login-form"><button class="primary-action" type="button" data-session-retry>Zkusit znovu</button><button class="text-action" type="button" data-session-logout>Odhlásit</button></div></section>';
  root.after(gate);
  const message = gate.querySelector("[data-session-message]");
  const retry = gate.querySelector("[data-session-retry]");
  const logoutButton = gate.querySelector("[data-session-logout]");
  const fingerprint = user => JSON.stringify(user ? [user.id, user.role, user.active, user.status, user.permissions, user.modules, user.allowedModules, user.deniedModules] : null);

  function hasPendingLogout() {
    try { pending ||= win.localStorage.getItem(key) === "1"; } catch { /* Storage can be disabled. */ }
    pending ||= doc.cookie.split(";").some(item => item.trim() === `${cookieKey}=1`);
    return pending;
  }
  function rememberLogout(value) {
    pending = value;
    try { value ? win.localStorage.setItem(key, "1") : win.localStorage.removeItem(key); } catch { /* Cookie fallback. */ }
    doc.cookie = `${cookieKey}=${value ? "1" : ""}; Path=/; Secure; SameSite=Lax; Max-Age=${value ? 2592000 : 0}`;
  }
  function lock(text, busy = false) {
    root.style.display = "none";
    root.inert = true;
    gate.style.display = "grid";
    message.textContent = text;
    retry.disabled = busy;
    logoutButton.hidden = !getUser() || hasPendingLogout();
  }
  function unlock() {
    if (ended || hasPendingLogout() || doc.visibilityState === "hidden") return;
    root.style.display = originalDisplay;
    root.inert = false;
    gate.style.display = "none";
  }
  function end(reason) {
    if (ended) return;
    ended = true;
    epoch += 1;
    win.clearTimeout(timer);
    lock(reason === "logout" ? "Odhlášení dokončeno." : "Relace skončila. Přihlaste se znovu.", true);
    onEnd(reason);
  }
  async function fetchSession(path, options = {}) {
    const controller = new AbortController();
    const timeout = win.setTimeout(() => controller.abort(), 10000);
    try {
      return await request(path, { credentials: "include", cache: "no-store", ...options, signal: controller.signal });
    } finally { win.clearTimeout(timeout); }
  }
  function schedule() {
    win.clearTimeout(timer);
    if (!getUser() || !expiresAt || ended) return;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) { end("expired"); return; }
    timer = win.setTimeout(schedule, Math.min(remaining, 24 * 60 * 60 * 1000));
  }
  function authenticated(payload) {
    if (ended || hasPendingLogout()) return false;
    expiresAt = Number(payload.sessionExpiresAt) || 0;
    identity = fingerprint(payload.user);
    schedule();
    if (!win.navigator.onLine) lock("Jste offline. Pro pokračování se připojte k internetu.");
    else unlock();
    return !ended;
  }
  function signOut() {
    if (signingOut) return signingOut;
    onSignOut();
    rememberLogout(true);
    epoch += 1;
    win.clearTimeout(timer);
    lock("Dokončuji odhlášení…", true);
    signingOut = (async () => {
      try {
        const response = await fetchSession("/api/auth/logout", { method: "POST" });
        if (!response.ok) throw new Error("logout_failed");
        rememberLogout(false);
        end("logout");
        return true;
      } catch {
        lock("Odhlášení ještě není dokončené. Data jsou skrytá. Po připojení k internetu odhlášení dokončíme.");
        return false;
      } finally { signingOut = null; }
    })();
    return signingOut;
  }
  function check() {
    if (ended) return Promise.resolve(false);
    if (hasPendingLogout()) return signOut();
    if (checking) return checking;
    if (!getUser()) { win.location.reload(); return Promise.resolve(false); }
    if (!win.navigator.onLine) {
      lock("Jste offline. Pro pokračování se připojte k internetu.");
      return Promise.resolve(false);
    }
    lock("Ověřuji přihlášení…", true);
    const ticket = epoch;
    checking = (async () => {
      try {
        const response = await fetchSession("/api/me");
        if (ticket !== epoch || ended || hasPendingLogout()) return false;
        if (response.status === 401) { end("expired"); return false; }
        if (!response.ok) throw new Error("session_unavailable");
        const payload = await response.json();
        if (ticket !== epoch || ended || hasPendingLogout()) return false;
        if (!payload.user || fingerprint(payload.user) !== identity) {
          lock("Oprávnění se změnila. Obnovuji aplikaci…", true);
          onUserChanged();
          return false;
        }
        return authenticated(payload);
      } catch {
        if (ticket === epoch && !ended) lock("Připojení k aplikaci není dostupné. Data jsou skrytá. Zkuste to znovu.");
        return false;
      } finally { checking = null; }
    })();
    return checking;
  }
  async function beforeBootstrap() {
    if (hasPendingLogout()) { await signOut(); return false; }
    if (!win.navigator.onLine) { lock("Jste offline. Pro přihlášení se připojte k internetu."); return false; }
    return true;
  }
  // Only an already visible, authenticated read-only screen may retain its
  // in-memory snapshot on a temporary outage. Never unlock a hidden/resumed
  // session, pending logout, unknown expiry, or an expired session.
  function canRetainVisibleSnapshot() {
    return getUser() && !ended && !hasPendingLogout() && expiresAt > Date.now()
      && !doc.hidden && !root.inert && retainReadOnlyView();
  }
  function failedConnection() {
    if (canRetainVisibleSnapshot()) return;
    if (getUser()) lock("Připojení k aplikaci není dostupné. Data jsou skrytá. Zkuste to znovu.");
  }
  function unauthorized() { if (getUser()) end("expired"); }
  function visibility() {
    if (!getUser() && !hasPendingLogout()) return;
    if (doc.visibilityState === "hidden") lock("Ověřuji přihlášení…", true);
    else void check();
  }
  retry.addEventListener("click", () => void check());
  logoutButton.addEventListener("click", () => void signOut());
  win.addEventListener("offline", () => {
    if (!canRetainVisibleSnapshot()) lock("Jste offline. Pro pokračování se připojte k internetu.");
  });
  win.addEventListener("online", () => void check());
  doc.addEventListener("visibilitychange", visibility);
  win.addEventListener("pagehide", () => { if (getUser()) lock("Ověřuji přihlášení…", true); });
  win.addEventListener("pageshow", event => { if (event.persisted) void check(); });
  win.addEventListener("storage", event => {
    if (event.key === key) {
      if (event.newValue === "1") { pending = true; void signOut(); }
      else if (getUser()) void check();
    }
  });
  return { authenticated, beforeBootstrap, signOut, check, unauthorized, failedConnection, lock, isEnded: () => ended };
}
