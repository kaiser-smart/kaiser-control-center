import { requireUserPermission } from "../../_lib/auth.js";
import { DataBoxIsdsError, fetchDataBoxMessageMetadata } from "../../_lib/data-box-isds-client.js";

const TEST_ISDS_BASE_URL = "https://ws1.datovka-test.gov.cz";
const DEFAULT_ISDS_BASE_URL = "https://ws1.datovka.gov.cz";
const ISDS_INFO_PATH = "/DS/dx";
const ISDS_MESSAGE_PATH = "/DS/dz";
const PASSWORD_TARGETS = [
  {
    slot: 2,
    id: "kaiser-data-box-2",
    label: "Kaiser technology",
    shortLabel: "K TECH",
    usernameSecret: "DATA_BOX_ISDS_USERNAME_2",
    passwordSecret: "DATA_BOX_ISDS_PASSWORD_2",
    isdsIdSecret: "DATA_BOX_ISDS_ID_2",
    requestedIsdsId: "3rw2ez"
  },
  {
    slot: 3,
    id: "kaiser-data-box-3",
    label: "Nanolab plus",
    shortLabel: "NANO+",
    usernameSecret: "DATA_BOX_ISDS_USERNAME_3",
    passwordSecret: "DATA_BOX_ISDS_PASSWORD_3",
    isdsIdSecret: "DATA_BOX_ISDS_ID_3",
    requestedIsdsId: "322p6i"
  }
];

function cleanString(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return cleanString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function baseUrlFromEnv(env = {}) {
  const explicit = cleanString(env.DATA_BOX_ISDS_BASE_URL).replace(/\/+$/, "");
  if (explicit) return explicit;
  return cleanString(env.DATA_BOX_ISDS_ENVIRONMENT).toLowerCase() === "test"
    ? TEST_ISDS_BASE_URL
    : DEFAULT_ISDS_BASE_URL;
}

function modeFromEnv(env = {}) {
  return cleanString(env.DATA_BOX_ISDS_ENVIRONMENT).toLowerCase() === "test" ? "test" : "production";
}

function secretStatus(env, target) {
  const username = cleanString(env[target.usernameSecret]);
  const password = cleanString(env[target.passwordSecret]);
  const isdsId = cleanString(env[target.isdsIdSecret]);

  return {
    ...target,
    hasUsername: Boolean(username),
    hasPassword: Boolean(password),
    hasIsdsId: Boolean(isdsId),
    usernameLabel: username ? username.replace(/^(.{2}).+(@.*)?$/, "$1***$2") : "není nastaveno",
    passwordLabel: password ? "Heslo je uloženo" : "Heslo chybí",
    isdsIdLabel: isdsId ? "ID DS je uloženo" : "ID DS není v secrets"
  };
}

function accountConfigForTest(env, target, passwordOverride = "") {
  const baseUrl = baseUrlFromEnv(env);
  const username = cleanString(env[target.usernameSecret]);
  const password = cleanString(passwordOverride || env[target.passwordSecret]);

  return {
    slot: target.slot,
    id: target.id,
    label: target.label,
    isdsId: cleanString(env[target.isdsIdSecret]),
    enabled: true,
    configured: Boolean(username && password),
    mode: modeFromEnv(env),
    baseUrl,
    infoEndpointUrl: `${baseUrl}${ISDS_INFO_PATH}`,
    messageEndpointUrl: `${baseUrl}${ISDS_MESSAGE_PATH}`,
    hasUsername: Boolean(username),
    hasPassword: Boolean(password),
    missing: [
      username ? "" : target.usernameSecret,
      password ? "" : target.passwordSecret
    ].filter(Boolean),
    username,
    password,
    limit: 1,
    lookbackDays: 7,
    documentationStatus: "official-isds-wsdl-3.11-2026-06-26"
  };
}

async function testTarget(env, target, passwordOverride) {
  const config = accountConfigForTest(env, target, passwordOverride);
  if (!config.hasUsername) {
    return {
      target,
      status: "error",
      message: `Chybí login ${target.usernameSecret}.`
    };
  }
  if (!config.hasPassword) {
    return {
      target,
      status: "error",
      message: "Chybí heslo pro test."
    };
  }

  try {
    const result = await fetchDataBoxMessageMetadata(env, config);
    return {
      target,
      status: "ok",
      message: `Přihlášení OK. Test přečetl metadata: ${Number(result.receivedCount || 0)} přijatých, ${Number(result.sentCount || 0)} odeslaných.`
    };
  } catch (error) {
    return {
      target,
      status: "error",
      message: error instanceof DataBoxIsdsError
        ? error.message
        : "Připojení se nepodařilo ověřit."
    };
  }
}

function statusCards(env, results = []) {
  const bySlot = new Map(results.map((item) => [item.target.slot, item]));
  return PASSWORD_TARGETS.map((target) => {
    const status = secretStatus(env, target);
    const result = bySlot.get(target.slot);
    return `
      <section class="card">
        <div>
          <span class="eyebrow">${escapeHtml(status.shortLabel)}</span>
          <h2>${escapeHtml(status.label)}</h2>
        </div>
        <dl>
          <div><dt>Login</dt><dd>${escapeHtml(status.hasUsername ? status.usernameLabel : `Chybí ${status.usernameSecret}`)}</dd></div>
          <div><dt>Heslo</dt><dd>${escapeHtml(status.passwordLabel)}</dd></div>
          <div><dt>ID DS</dt><dd>${escapeHtml(status.isdsIdLabel)} · požadované: <code>${escapeHtml(status.requestedIsdsId)}</code></dd></div>
          <div><dt>Cloudflare secret</dt><dd><code>${escapeHtml(status.passwordSecret)}</code></dd></div>
        </dl>
        ${result ? `<p class="result result--${escapeHtml(result.status)}">${escapeHtml(result.message)}</p>` : ""}
      </section>
    `;
  }).join("");
}

function page(env, options = {}) {
  const message = cleanString(options.message);
  const error = cleanString(options.error);
  const results = Array.isArray(options.results) ? options.results : [];
  const appUrl = "https://kaiser-control-center.pages.dev/datova-schranka/";

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DS hesla - Kaiser Smart</title>
    <style>
      :root { color-scheme: light; font-family: Quicksand, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2921; background: #f5f7f2; }
      body { margin: 0; padding: 24px; }
      main { max-width: 980px; margin: 0 auto; display: grid; gap: 18px; }
      a { color: #4f941a; font-weight: 800; }
      .hero, .card, form { background: rgba(255,255,255,.92); border: 1px solid #d9e5d1; border-radius: 16px; padding: 20px; box-shadow: 0 18px 60px rgba(31,41,33,.08); }
      h1, h2 { margin: 0; line-height: 1.1; }
      h1 { font-size: clamp(2rem, 5vw, 3.2rem); }
      h2 { font-size: 1.35rem; }
      p { margin: 8px 0 0; color: #647064; font-weight: 650; }
      .eyebrow { color: #5f6d60; font-size: .78rem; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      dl { display: grid; gap: 10px; margin: 16px 0 0; }
      dl div { display: grid; gap: 3px; }
      dt { color: #647064; font-size: .78rem; font-weight: 900; text-transform: uppercase; }
      dd { margin: 0; font-weight: 800; overflow-wrap: anywhere; }
      code { padding: 2px 6px; border-radius: 8px; background: #eef6e8; color: #2c6d0e; }
      form { display: grid; gap: 16px; }
      label { display: grid; gap: 7px; font-weight: 900; }
      input { box-sizing: border-box; width: 100%; min-height: 46px; padding: 10px 12px; border: 1px solid #cad8c0; border-radius: 10px; font: inherit; font-weight: 750; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
      button { min-height: 44px; padding: 10px 16px; border: 1px solid #75bd25; border-radius: 999px; background: #75bd25; color: white; font: inherit; font-weight: 900; cursor: pointer; }
      button.secondary { background: white; color: #2c6d0e; }
      .notice, .error, .result { border-radius: 12px; padding: 12px 14px; font-weight: 800; }
      .notice, .result--ok { background: #eef8e9; color: #2d6f11; border: 1px solid #b9dda8; }
      .error, .result--error { background: #fff1ed; color: #9a2f1f; border: 1px solid #efc0b5; }
      .hint { font-size: .94rem; }
      .command { display: grid; gap: 8px; margin-top: 12px; }
      .command code { display: block; padding: 10px 12px; overflow-wrap: anywhere; }
      @media (max-width: 720px) {
        body { padding: 12px; }
        .grid { grid-template-columns: 1fr; }
        .hero, .card, form { border-radius: 12px; padding: 14px; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="eyebrow">Datová schránka</span>
        <h1>Hesla KT a Nanolab plus</h1>
        <p>Bezpečný admin formulář pro ověření hesel. Hesla se neukládají do kódu, localStorage ani odpovědi stránky.</p>
        <p><a href="${appUrl}">Zpět do Datové schránky</a></p>
      </section>
      ${message ? `<div class="notice" role="status">${escapeHtml(message)}</div>` : ""}
      ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}
      <div class="grid">${statusCards(env, results)}</div>
      <form method="post" autocomplete="off">
        <div class="grid">
          <label>
            Heslo Kaiser technology
            <input name="password_2" type="password" autocomplete="new-password" placeholder="DATA_BOX_ISDS_PASSWORD_2" />
          </label>
          <label>
            Heslo Nanolab plus
            <input name="password_3" type="password" autocomplete="new-password" placeholder="DATA_BOX_ISDS_PASSWORD_3" />
          </label>
        </div>
        <div class="actions">
          <button type="submit" name="action" value="test">Otestovat zadaná hesla</button>
          <button class="secondary" type="submit" name="action" value="prepare">Připravit uložení do Cloudflare</button>
        </div>
        <p class="hint">Uložení do Cloudflare secrets musí proběhnout přes bezpečný Cloudflare mechanismus. Tato stránka hesla nevypisuje a po odeslání je nevrací zpět.</p>
        <div class="command">
          <code>wrangler pages secret put DATA_BOX_ISDS_ID_2 --project-name kaiser-control-center # 3rw2ez</code>
          <code>wrangler pages secret put DATA_BOX_ISDS_ID_3 --project-name kaiser-control-center # 322p6i</code>
          <code>wrangler pages secret put DATA_BOX_ISDS_PASSWORD_2 --project-name kaiser-control-center</code>
          <code>wrangler pages secret put DATA_BOX_ISDS_PASSWORD_3 --project-name kaiser-control-center</code>
        </div>
      </form>
    </main>
  </body>
</html>`;
}

async function guard(env, request) {
  const { response } = await requireUserPermission(env, request, "data-box", "manage");
  return response;
}

export async function onRequestGet({ request, env }) {
  const response = await guard(env, request);
  if (response) return response;
  return html(page(env));
}

export async function onRequestPost({ request, env }) {
  const response = await guard(env, request);
  if (response) return response;

  const form = await request.formData();
  const action = cleanString(form.get("action"));
  const password2 = cleanString(form.get("password_2"));
  const password3 = cleanString(form.get("password_3"));

  if (action === "test") {
    const tests = [];
    if (password2) {
      tests.push(await testTarget(env, PASSWORD_TARGETS[0], password2));
    }
    if (password3) {
      tests.push(await testTarget(env, PASSWORD_TARGETS[1], password3));
    }
    if (!tests.length) {
      return html(page(env, { error: "Vyplňte aspoň jedno heslo pro test." }), 400);
    }
    return html(page(env, {
      message: "Test dokončen. Hesla nebyla uložena ani vrácena zpět do stránky.",
      results: tests
    }));
  }

  if (action === "prepare") {
    return html(page(env, {
      message: "Připraveno pro Cloudflare. Hesla vložte přes Cloudflare Pages secrets nebo uvedené wrangler příkazy; stránka je z bezpečnostních důvodů sama nezapisuje do projektu."
    }));
  }

  return html(page(env, { error: "Neznámá akce formuláře." }), 400);
}
