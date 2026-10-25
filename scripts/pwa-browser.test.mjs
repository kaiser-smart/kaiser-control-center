// Optional integration test. Uses external Playwright tooling, not an app dependency.
// Only local HTTPS, synthetic accounts and mock OTP; no D1, Twilio or production traffic.
import assert from "node:assert/strict";
import { createServer } from "node:https";
import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onRequestPost as start } from "../functions/api/auth/start.js";
import { onRequestPost as verify } from "../functions/api/auth/verify.js";
import { onRequestPost as logout } from "../functions/api/auth/logout.js";
import { onRequestGet as me } from "../functions/api/me.js";
import { json, requireUserPermission, createSessionCookie } from "../functions/_lib/auth.js";

const require = createRequire(import.meta.url);
const { webkit, devices } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.PWA_DIST || path.join(root, "dist"));
const output = path.resolve(process.env.PWA_TEST_OUTPUT || path.join(root, "output/pwa"));
const temp = await mkdtemp(path.join(tmpdir(), "smart-pwa-test-"));
await mkdir(output, { recursive: true });
const user = { id: "pwa-test", name: "Test PWA", email: "pwa@example.test", role: "admin", active: true, status: "active" };
const reader = { id: "pwa-reader", name: "Test čtení", email: "reader@example.test", role: "readonly", active: true, status: "active" };
const env = { AUTH_MODE: "mock", APP_ENV: "test", AUTH_USERS_JSON: JSON.stringify([user, reader]) };
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const previousDist = process.env.PWA_PREVIOUS_DIST ? path.resolve(process.env.PWA_PREVIOUS_DIST) : null;
let activeDist = previousDist || dist;
const nextMeta = JSON.parse((await readFile(path.join(dist, "src/data/buildMeta.js"), "utf8")).match(/= (\{[\s\S]*\});/)[1]);
const previousMeta = previousDist ? JSON.parse((await readFile(path.join(previousDist, "src/data/buildMeta.js"), "utf8")).match(/= (\{[\s\S]*\});/)[1]) : null;
if (previousMeta) assert.notEqual(previousMeta.version, nextMeta.version, "Update test needs two actual build versions");
let revision = "before-update";
let failLogout = false;
let failMe = false;
let holdNextMe = false;
let releaseHeldMe = null;
let origin;
let browser;
let server;
const results = [];
const served = new Map();

try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(temp, "key.pem"), "-out", path.join(temp, "cert.pem"), "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
  server = createServer({ key: await readFile(path.join(temp, "key.pem")), cert: await readFile(path.join(temp, "cert.pem")) }, async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith("/api/")) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const request = new Request(url, { method: req.method, headers: req.headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
        const handler = { "/api/auth/start": start, "/api/auth/verify": verify, "/api/auth/logout": logout, "/api/me": me }[url.pathname];
        let response;
        if (url.pathname === "/api/auth/logout" && failLogout) response = json({ error: "Simulated unavailable service" }, 503);
        else if (url.pathname === "/api/me" && failMe) response = json({ error: "Simulated unavailable service" }, 503);
        else if (handler) response = await handler({ request, env });
        else if (url.pathname === "/api/users") {
          const access = await requireUserPermission(env, request, "users", "view");
          response = access.response || json({ users: [user] });
        } else {
          // Business modules are fixtures. This test does not claim to validate their backends.
          response = json({ settings: {}, items: [], messages: [], users: [], show: false, apiStatus: "ready" });
        }
        if (url.pathname === "/api/me" && holdNextMe) {
          holdNextMe = false;
          await new Promise(resolve => { releaseHeldMe = resolve; });
        }
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      served.set(url.pathname + url.search, (served.get(url.pathname + url.search) || 0) + 1);
      let filename = path.resolve(activeDist, `.${url.pathname}`);
      if (!filename.startsWith(`${activeDist}${path.sep}`) && filename !== activeDist) throw new Error("Invalid path");
      if (!path.extname(filename)) filename = path.join(filename, "index.html");
      let content;
      try { content = await readFile(filename); }
      catch { filename = path.join(activeDist, "404.html"); content = await readFile(filename); }
      if (filename.endsWith(".html")) content = Buffer.from(content.toString().replace("</head>", `<meta name="pwa-test-revision" content="${revision}"></head>`));
      res.writeHead(200, { "Content-Type": mime[path.extname(filename)] || "application/octet-stream", "Content-Length": content.length, "Cache-Control": filename.endsWith(".html") || filename.endsWith(".webmanifest") ? "no-cache" : "public, max-age=14400", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; media-src 'self'" });
      res.end(content);
    } catch (error) {
      res.writeHead(500);
      res.end("Local test server error");
      console.error(error.message);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `https://127.0.0.1:${server.address().port}`;
  browser = await webkit.launch({ headless: true });
  console.log(`WebKit ${browser.version()}; local HTTPS; real auth handlers with mock OTP.`);

  for (const profile of [
    { name: "iphone", options: devices["iPhone 13"] },
    { name: "iphone-standalone-simulated", options: devices["iPhone 13"], standalone: true },
    { name: "desktop", options: { viewport: { width: 1440, height: 1000 } } }
  ]) {
    activeDist = previousDist || dist;
    const loadedModules = [];
    const context = await browser.newContext({ ...profile.options, ignoreHTTPSErrors: true });
    if (profile.standalone) await context.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { value: true });
      const original = window.matchMedia.bind(window);
      window.matchMedia = query => query === "(display-mode: standalone)" ? { ...original(query), matches: true } : original(query);
    });
    // Server CSP confines resources to localhost. Do not use route interception here:
    // Playwright routing disables the browser HTTP cache and invalidates update testing.
    let page = await context.newPage();
    context.on("request", req => { if (new URL(req.url()).pathname.endsWith(".js")) loadedModules.push(req.url()); });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/pripominky`);
    await page.locator("[data-auth-form]").waitFor();
    const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(width.content <= width.viewport + 1, "Login must not overflow");
    await page.screenshot({ path: path.join(output, `${profile.name}-login.png`), fullPage: true });
    assert.equal(await page.locator('link[rel="manifest"]').evaluate(el => new URL(el.href).pathname), "/manifest.webmanifest");
    const manifestResponse = await context.request.get(`${origin}/manifest.webmanifest`);
    assert.match(manifestResponse.headers()["content-type"], /application\/manifest\+json/);
    assert.equal((await manifestResponse.json()).display, "standalone");
    await page.locator('[name="identifier"]').fill(user.email);
    await page.locator('[data-auth-form] button[type="submit"]').click();
    await page.locator('[name="code"]').fill("123456");
    await page.locator('[data-auth-form] button[type="submit"]').click();
    await page.locator("[data-logout]").first().waitFor({state:"attached"});
    const cookie = (await context.cookies()).find(item => item.name === "__Host-smart_odpady_session");
    assert.ok(cookie?.httpOnly && cookie?.secure && cookie?.sameSite === "Lax");
    assert.ok(!(await page.evaluate(() => document.cookie)).includes("smart_odpady_session"));
    assert.equal((await context.request.get(`${origin}/api/me`)).status(), 200);
    await page.reload();
    await page.locator("[data-logout]").first().waitFor({state:"attached"});
    await page.screenshot({ path: path.join(output, `${profile.name}-authenticated.png`), fullPage: true });
    const authenticatedWidth = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(authenticatedWidth.content <= authenticatedWidth.viewport + 1, "Authenticated page must not overflow");
    if (profile.name === "iphone") {
      await page.setViewportSize({ width: 844, height: 390 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Landscape must not overflow");
      await page.screenshot({ path: path.join(output, "iphone-landscape.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    // Fresh login opens modules; authenticated deep links and browser history still work.
    await page.goto(`${origin}/pripominky`);
    await page.locator("[data-logout]").first().waitFor({state:"attached"});
    // Real internal links and browser history; no URL/router stubs.
    const home = page.locator('a[data-link][href="/"]:visible').first();
    await home.click();
    await page.waitForURL(`${origin}/`);
    await page.goBack();
    await page.waitForURL(`${origin}/pripominky`);
    assert.equal(await page.locator("[data-auth-form]").count(), 0);
    await page.close();
    page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/pripominky`);
    await page.locator("[data-logout]").first().waitFor({state:"attached"});
    const offlineState = await page.evaluate(async () => ({ registrations: (await navigator.serviceWorker.getRegistrations()).length, caches: await caches.keys() }));
    assert.equal(offlineState.registrations, 0);
    assert.deepEqual(offlineState.caches, []);
    if (previousMeta) assert.ok(loadedModules.some(url => url.includes(`/src/app.js?v=${previousMeta.version}`)), "Previous real application was loaded");
    const cachedEntry = `/src/app.js?v=${previousMeta?.version || nextMeta.version}`;
    const entryRequests = served.get(cachedEntry);
    assert.ok(entryRequests > 0, "Previous entrypoint fetched from server");
    await page.goto(`${origin}/pripominky?cache-probe=${profile.name}`);
    await page.locator("[data-logout]").first().waitFor({state:"attached"});
    assert.equal(served.get(cachedEntry), entryRequests, "Existing application script really reused HTTP cache across navigation");
    activeDist = dist;
    loadedModules.length = 0;
    revision = `${profile.name}-after-update`;
    await page.reload();
    await page.locator("[data-logout]").first().waitFor({state:"attached"});
    assert.equal(await page.locator('meta[name="pwa-test-revision"]').getAttribute("content"), revision);
    assert.ok(loadedModules.some(url => url.includes(`/src/app.js?v=${nextMeta.version}`)), "Updated entrypoint loaded");
    assert.ok(loadedModules.some(url => url.includes(`/src/data/versionInfo.js?v=${nextMeta.version}`)), "Updated nested import loaded");
    const browserMeta = await page.evaluate(async version => (await import(`/src/data/buildMeta.js?v=${version}`)).buildMeta, nextMeta.version);
    assert.equal(browserMeta.commit, nextMeta.commit);
    assert.equal(browserMeta.version, nextMeta.version);
    if (await page.locator(".mobile-header").isVisible()) await page.locator(".mobile-header button").click();
    await page.locator("[data-logout]:visible").first().click();
    await page.locator("[data-auth-form]").waitFor();
    assert.equal((await context.request.get(`${origin}/api/me`)).status(), 401);
    await page.reload();
    await page.locator("[data-auth-form]").waitFor();
    assert.ok(!(await context.cookies()).some(item => item.name === "__Host-smart_odpady_session"));

    // Signed but already expired cookie reaches the actual production verifier.
    const expired = await createSessionCookie({ ...env, AUTH_SESSION_TTL_SECONDS: "-60" }, user);
    await context.addCookies([{ name: "__Host-smart_odpady_session", value: expired.split(";")[0].split("=")[1], domain: "127.0.0.1", path: "/", httpOnly: true, secure: true, sameSite: "Lax" }]);
    assert.equal((await context.request.get(`${origin}/api/me`)).status(), 401);
    await page.reload();
    await page.locator("[data-auth-form]").waitFor();
    const limited = await createSessionCookie(env, reader);
    await context.addCookies([{ name: "__Host-smart_odpady_session", value: limited.split(";")[0].split("=")[1], domain: "127.0.0.1", path: "/", httpOnly: true, secure: true, sameSite: "Lax" }]);
    assert.equal((await context.request.get(`${origin}/api/me`)).status(), 200);
    assert.equal((await context.request.get(`${origin}/api/users`)).status(), 403);
    assert.deepEqual(errors, [], "No uncaught page errors");
    results.push({ browserHttpCacheVerified: true, actualBuildUpdate: previousMeta ? `${previousMeta.version} -> ${nextMeta.version}` : "single build only", profile: profile.name, status: "passed", loginWidth: width, authenticatedWidth, offlineState });
    await context.close();
  }
  activeDist = dist;
  // Session/offline regression cases use signed synthetic sessions and real /api/me.
  const context = await browser.newContext({ ...devices["iPhone 13"], ignoreHTTPSErrors: true });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  let page = await context.newPage();
  async function seedSession(ttl = "43200") {
    await context.clearCookies();
    const cookie = await createSessionCookie({ ...env, AUTH_SESSION_TTL_SECONDS: ttl }, user);
    await context.addCookies([{ name: "__Host-smart_odpady_session", value: cookie.split(";")[0].split("=")[1], domain: "127.0.0.1", path: "/", httpOnly: true, secure: true, sameSite: "Lax" }]);
    await page.goto(`${origin}/pripominky`);
    await page.locator("[data-logout]").first().waitFor({state:"attached"});
  }
  await seedSession();
  await context.setOffline(true);
  await page.locator("#session-guard").waitFor({ state: "visible" });
  assert.equal(await page.locator("#app").isVisible(), false);
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
  await page.screenshot({ path: path.join(output, "iphone-offline-locked.png"), fullPage: true });
  await context.setOffline(false);
  await page.locator("#session-guard").waitFor({ state: "hidden" });
  assert.equal(await page.locator("[data-auth-form]").count(), 0, "Reconnect preserves a valid session");

  // A failed logout is retained over reload and completes only after server ACK.
  failLogout = true;
  if (await page.locator(".mobile-header").isVisible()) await page.locator(".mobile-header button").click();
    await page.locator("[data-logout]:visible").first().click();
  await page.locator("#session-guard").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("[data-session-message]").textContent.includes("ještě není dokončené"));
  assert.equal(await page.evaluate(() => localStorage.getItem("smart-odpady.logout-pending")), "1");
  await page.reload();
  await page.waitForFunction(() => document.querySelector("[data-session-message]").textContent.includes("ještě není dokončené"));
  assert.equal(await page.locator("#app").isVisible(), false);
  assert.equal((await context.request.get(`${origin}/api/me`)).status(), 200, "Session cookie is still on server; UI must not claim logout success");
  // Cookie fallback retains logout intent even when localStorage is unavailable/cleared.
  await page.evaluate(() => localStorage.removeItem("smart-odpady.logout-pending"));
  await page.reload();
  await page.waitForFunction(() => document.querySelector("[data-session-message]").textContent.includes("ještě není dokončené"));
  assert.equal(await page.locator("#app").isVisible(), false);
  failLogout = false;
  await page.locator("[data-session-retry]").click();
  await page.locator("[data-auth-form]").waitFor();
  assert.equal((await context.request.get(`${origin}/api/me`)).status(), 401);
  assert.equal(await page.evaluate(() => localStorage.getItem("smart-odpady.logout-pending")), null);

  await seedSession("3");
  await page.locator("[data-auth-form]").waitFor({ timeout: 8000 });
  assert.equal((await context.request.get(`${origin}/api/me`)).status(), 401, "Idle expiry needs no user request");

  await seedSession();
  env.AUTH_USERS_JSON = JSON.stringify([{ ...user, active: false, status: "disabled" }, reader]);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.locator("[data-auth-form]").waitFor();
  env.AUTH_USERS_JSON = JSON.stringify([user, reader]);

  await seedSession();
  env.AUTH_USERS_JSON = JSON.stringify([{ ...user, role: "readonly" }, reader]);
  await Promise.all([page.waitForEvent("load"), page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")))]);
  await page.locator("[data-logout]").first().waitFor({state:"attached"});
  assert.equal((await context.request.get(`${origin}/api/users`)).status(), 403, "Changed permissions are enforced after resume");
  env.AUTH_USERS_JSON = JSON.stringify([user, reader]);

  await seedSession();
  holdNextMe = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  for (let attempt = 0; !releaseHeldMe && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(releaseHeldMe, "Session check held for logout race");
  await page.locator("[data-session-logout]").click();
  await page.locator("[data-auth-form]").waitFor();
  releaseHeldMe(); releaseHeldMe = null;
  assert.equal((await context.request.get(`${origin}/api/me`)).status(), 401);
  assert.equal(await page.locator("[data-logout]").count(), 0, "Late session response cannot undo logout");

  await seedSession();
  failMe = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForFunction(() => document.querySelector("[data-session-message]").textContent.includes("není dostupné"));
  assert.equal(await page.locator("#app").isVisible(), false);
  failMe = false;
  await page.locator("[data-session-retry]").click();
  await page.locator("#session-guard").waitFor({ state: "hidden" });

  // Losing connectivity while a logout is requested never restores protected UI.
  await context.setOffline(true);
  await page.locator("[data-session-logout]").click();
  await page.waitForFunction(() => document.querySelector("[data-session-message]").textContent.includes("ještě není dokončené"));
  await context.setOffline(false);
  await page.locator("[data-auth-form]").waitFor();
  assert.equal((await context.request.get(`${origin}/api/me`)).status(), 401);
  await seedSession();
  const sibling = await context.newPage();
  await sibling.goto(`${origin}/pripominky`);
  await sibling.locator("[data-logout]").first().waitFor({state:"attached"});
  if (await page.locator(".mobile-header").isVisible()) await page.locator(".mobile-header button").click();
    await page.locator("[data-logout]:visible").first().click();
  await page.locator("[data-auth-form]").waitFor();
  await sibling.locator("[data-auth-form]").waitFor();
  await context.close();
  results.push({ profile: "session-offline-regressions", status: "passed", cases: ["offline hides data", "reconnect", "503 logout persists across reload", "offline logout ACK", "idle expiry", "disabled user on resume", "permission change on resume", "logout wins over delayed session response", "503 session check fail-closed", "logout cookie fallback", "logout across tabs"] });
  await writeFile(path.join(output, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), status: "passed", webkit: browser.version(), build: nextMeta, previousBuild: previousMeta, physicalIPhone: "not tested", profiles: results }, null, 2) + "\n");
  console.log(JSON.stringify(results, null, 2));
  console.log("Passed: login, Secure/HttpOnly cookie, reload, links/history, logout, expired session, permission denial, fresh HTML, no SW/cache. iOS Home Screen installation is NOT simulated.");
} finally {
  releaseHeldMe?.();
  await browser?.close();
  if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await rm(temp, { recursive: true, force: true });
}
