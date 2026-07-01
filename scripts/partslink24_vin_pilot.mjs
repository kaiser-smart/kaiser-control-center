#!/usr/bin/env node

const PARTSLINK24_START_URL = "https://www.partslink24.com/partslink24/startup.do";
const SECRET_NAMES = [
  "PARTSLINK24_COMPANY_ID",
  "PARTSLINK24_USERNAME",
  "PARTSLINK24_PASSWORD"
];
const LOGIN_READY_TIMEOUT_MS = 30000;
const FIELD_READY_TIMEOUT_MS = 15000;
const ATTENTION_RELOAD_TIMEOUT_MS = 10000;
const ATTENTION_RELOAD_MAX_ATTEMPTS = 2;
const DIAGNOSTIC_TEXT_LIMIT = 900;
const DIAGNOSTIC_CONTROL_LIMIT = 35;

const COMPANY_SELECTORS = [
  "input[name='company']",
  "input[name='companyId']",
  "input[name='companyID']",
  "input[name*='company' i]",
  "input[name='customerNumber']",
  "input[name*='customer' i]",
  "input[name*='client' i]",
  "input[name*='mandant' i]",
  "input[name*='tenant' i]",
  "input[id*='company' i]",
  "input[id*='customer' i]",
  "input[id*='client' i]",
  "input[id*='mandant' i]",
  "input[id*='tenant' i]",
  "input[placeholder*='Company' i]",
  "input[placeholder*='Customer' i]",
  "input[placeholder*='Client' i]",
  "input[placeholder*='partslink24' i]"
];

const USERNAME_SELECTORS = [
  "input[name='username']",
  "input[name='userName']",
  "input[name='user']",
  "input[name='login']",
  "input[name*='username' i]",
  "input[name*='user' i]",
  "input[name*='login' i]",
  "input[id*='user' i]",
  "input[id*='login' i]",
  "input[placeholder*='User' i]",
  "input[placeholder*='Login' i]",
  "input[autocomplete='username']"
];

const PASSWORD_SELECTORS = [
  "input[type='password']",
  "input[name='password']",
  "input[id*='password' i]"
];

const SUBMIT_SELECTORS = [
  "button[type='submit']",
  "input[type='submit']",
  "button:has-text('Login')",
  "button:has-text('Log in')",
  "button:has-text('Anmelden')",
  "button:has-text('Přihlásit')",
  "button:has-text('Sign in')",
  "a:has-text('Login')"
];

const ATTENTION_RELOAD_SELECTORS = [
  "a:has-text('Reload')",
  "button:has-text('Reload')",
  "input[type='submit'][value*='Reload' i]"
];

const VIN_SEARCH_SELECTORS = [
  "input[name*='vin' i]",
  "input[id*='vin' i]",
  "input[placeholder*='VIN' i]",
  "input[type='search']"
];

const PASSENGER_VEHICLE_KINDS = new Set([
  "osobni",
  "oa",
  "passenger",
  "passenger_car",
  "car"
]);

const TWO_FACTOR_PATTERNS = [
  "2fa",
  "mfa",
  "2 faktor",
  "two factor",
  "two-factor",
  "multi factor",
  "multi-factor",
  "verification code",
  "security code",
  "authentication code",
  "one time code",
  "one-time code",
  "email code",
  "e-mail code",
  "sent to your email",
  "verify your identity",
  "identity verification",
  "authenticator",
  "overovaci kod",
  "bezpecnostni kod",
  "kod z emailu",
  "potvrdte prihlaseni",
  "bestaetigungscode",
  "bestatigungscode",
  "sicherheitscode",
  "authentifizierungscode",
  "verifizierungscode",
  "einmalcode",
  "zweifaktor",
  "per e mail",
  "per email"
];

class Partslink24PilotError extends Error {
  constructor(message, errorCode, diagnostic = null) {
    super(message);
    this.name = "Partslink24PilotError";
    this.errorCode = errorCode;
    this.diagnostic = diagnostic;
  }
}

export function cleanString(value) {
  return String(value ?? "").trim();
}

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes", "ano", "on"].includes(cleanString(value).toLowerCase());
}

export function maskVin(value) {
  const vin = cleanString(value).replace(/\s+/g, "").toUpperCase();
  if (!vin) {
    return "";
  }
  if (vin.length <= 7) {
    return "*".repeat(vin.length);
  }
  return `${vin.slice(0, 3)}${"*".repeat(Math.max(4, vin.length - 7))}${vin.slice(-4)}`;
}

export function redactSensitive(text, values = []) {
  let output = cleanString(text);
  for (const value of values) {
    const secret = cleanString(value);
    if (!secret) {
      continue;
    }
    output = output.split(secret).join("[REDACTED]");
  }
  return output;
}

function sensitiveValues(config) {
  return [
    config.companyId,
    config.username,
    config.password,
    config.vin
  ];
}

export function safePreview(text, config, limit = DIAGNOSTIC_TEXT_LIMIT) {
  return redactSensitive(text, sensitiveValues(config))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

export function normalizeVehicleKind(value) {
  return cleanString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeDetectionText(value) {
  return cleanString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPassengerVehicleKind(value) {
  return PASSENGER_VEHICLE_KINDS.has(normalizeVehicleKind(value));
}

export function detectTwoFactorChallengeText(value) {
  const text = normalizeDetectionText(value);
  return TWO_FACTOR_PATTERNS.some((pattern) => text.includes(normalizeDetectionText(pattern)));
}

export function detectPartslink24AttentionReloadText(value) {
  const text = normalizeDetectionText(value);
  return text.includes("attention please read carefully")
    && (
      text.includes("reload")
      || text.includes("bookmark")
      || text.includes("main domain")
      || text.includes("forwarded")
    );
}

function parseArgs(argv = []) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const [rawKey, inlineValue] = item.slice(2).split("=");
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    if (inlineValue !== undefined) {
      result[key] = inlineValue;
    } else if (next && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = "true";
    }
  }
  return result;
}

function addGithubMask(value, env = process.env) {
  const text = cleanString(value);
  if (env.GITHUB_ACTIONS === "true" && text) {
    console.log(`::add-mask::${text}`);
  }
}

function auditBase(config) {
  return {
    ok: false,
    status: "blocked",
    provider: "partslink24",
    mode: "read_only_pilot",
    startUrl: PARTSLINK24_START_URL,
    requestId: config.requestId,
    vehicleId: config.vehicleId,
    vehicleKind: config.vehicleKind,
    vinMasked: maskVin(config.vin),
    dryRun: config.dryRun,
    liveLoginAllowed: config.allowLiveLogin,
    startedAt: new Date(config.startedAt).toISOString()
  };
}

function safeErrorMessage(error, config) {
  return redactSensitive(error?.message || error || "Neznámá chyba.", sensitiveValues(config));
}

function pageSearchTargets(page) {
  return [
    { label: "main", target: page, url: page.url() },
    ...page.frames()
      .filter((frame) => frame !== page.mainFrame())
      .map((frame, index) => ({
        label: `frame-${index + 1}`,
        target: frame,
        url: frame.url()
      }))
  ];
}

async function readControlCandidates(target, config) {
  const controls = await target.evaluate((limit) => Array.from(document.querySelectorAll("input, textarea, select, button, a"))
    .slice(0, limit)
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      type: element.getAttribute("type") || "",
      name: element.getAttribute("name") || "",
      id: element.getAttribute("id") || "",
      placeholder: element.getAttribute("placeholder") || "",
      ariaLabel: element.getAttribute("aria-label") || "",
      autocomplete: element.getAttribute("autocomplete") || "",
      role: element.getAttribute("role") || "",
      text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90)
    })), DIAGNOSTIC_CONTROL_LIMIT).catch(() => []);

  return controls.map((control) => Object.fromEntries(
    Object.entries(control)
      .map(([key, value]) => [key, safePreview(value, config, 140)])
      .filter(([, value]) => value)
  ));
}

async function collectSafePageDiagnostics(page, config) {
  const targets = pageSearchTargets(page);
  const pages = [];
  for (const target of targets) {
    const title = target.label === "main" ? await page.title().catch(() => "") : "";
    const bodyText = await target.target.locator("body").innerText({ timeout: 2000 }).catch(() => "");
    const controlCandidates = await readControlCandidates(target.target, config);
    pages.push({
      target: target.label,
      url: safePreview(target.url, config, 500),
      title: safePreview(title, config, 180),
      textPreview: safePreview(bodyText, config),
      controlCandidates
    });
  }
  return {
    frameCount: Math.max(0, targets.length - 1),
    pages
  };
}

async function findFirstVisibleLocator(page, selectors) {
  const targets = pageSearchTargets(page);
  for (const selector of selectors) {
    for (const target of targets) {
      const locator = target.target.locator(selector).filter({ visible: true });
      if (await locator.count().catch(() => 0)) {
        return {
          locator: locator.first(),
          selector,
          target: target.label,
          frameUrl: target.url
        };
      }
    }
  }
  return null;
}

async function waitForFirstVisibleLocator(page, selectors, timeoutMs = FIELD_READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let found = await findFirstVisibleLocator(page, selectors);
  while (!found && Date.now() < deadline) {
    await page.waitForTimeout(500);
    found = await findFirstVisibleLocator(page, selectors);
  }
  return found;
}

async function readCombinedPageText(page) {
  const title = await page.title().catch(() => "");
  const url = page.url();
  const bodyText = (await Promise.all(pageSearchTargets(page)
    .map((target) => target.target.locator("body").innerText({ timeout: 2000 }).catch(() => ""))))
    .join("\n");
  return `${title}\n${url}\n${bodyText}`;
}

async function isPartslink24AttentionReloadPage(page) {
  return detectPartslink24AttentionReloadText(await readCombinedPageText(page));
}

async function resolvePartslink24AttentionReloadGate(page, config) {
  const attempts = [];
  for (let attempt = 1; attempt <= ATTENTION_RELOAD_MAX_ATTEMPTS; attempt += 1) {
    if (!await isPartslink24AttentionReloadPage(page)) {
      return {
        resolved: attempts.length > 0,
        attempts
      };
    }

    const found = await waitForFirstVisibleLocator(page, ATTENTION_RELOAD_SELECTORS, ATTENTION_RELOAD_TIMEOUT_MS);
    if (!found) {
      throw new Partslink24PilotError(
        "partslink24 zobrazil mezistránku Reload, ale odkaz Reload se nepodařilo najít.",
        "PARTSLINK24_RELOAD_GATE_NOT_RESOLVED",
        await collectSafePageDiagnostics(page, config)
      );
    }

    const beforeUrl = page.url();
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: ATTENTION_RELOAD_TIMEOUT_MS }).catch(() => null),
      found.locator.click({ timeout: 5000 })
    ]);
    await page.waitForLoadState("networkidle", { timeout: ATTENTION_RELOAD_TIMEOUT_MS }).catch(() => null);

    attempts.push({
      attempt,
      selector: found.selector,
      target: found.target,
      beforeUrl: safePreview(beforeUrl, config, 500),
      afterUrl: safePreview(page.url(), config, 500)
    });
  }

  if (await isPartslink24AttentionReloadPage(page)) {
    throw new Partslink24PilotError(
      "partslink24 mezistránka Reload se nepodařila bezpečně překročit.",
      "PARTSLINK24_RELOAD_GATE_NOT_RESOLVED",
      await collectSafePageDiagnostics(page, config)
    );
  }

  return {
    resolved: attempts.length > 0,
    attempts
  };
}

function fieldErrorCode(label) {
  if (["Company ID", "User name", "Password"].includes(label)) {
    return "PARTSLINK24_LOGIN_FORM_NOT_FOUND";
  }
  if (label === "Login") {
    return "PARTSLINK24_LOGIN_BUTTON_NOT_FOUND";
  }
  if (label === "VIN search") {
    return "PARTSLINK24_VIN_SEARCH_FIELD_NOT_FOUND";
  }
  return "PARTSLINK24_FIELD_NOT_FOUND";
}

async function fillFirst(page, selectors, value, label, config, timeoutMs = FIELD_READY_TIMEOUT_MS) {
  const found = await waitForFirstVisibleLocator(page, selectors, timeoutMs);
  if (found) {
    await found.locator.fill(value, { timeout: 5000 });
    return {
      selector: found.selector,
      target: found.target,
      frameUrl: found.frameUrl
    };
  }
  throw new Partslink24PilotError(
    `Nenalezeno pole ${label}.`,
    fieldErrorCode(label),
    await collectSafePageDiagnostics(page, config)
  );
}

async function clickFirst(page, selectors, label, config, timeoutMs = FIELD_READY_TIMEOUT_MS) {
  const found = await waitForFirstVisibleLocator(page, selectors, timeoutMs);
  if (found) {
    await found.locator.click({ timeout: 5000 });
    return {
      selector: found.selector,
      target: found.target,
      frameUrl: found.frameUrl
    };
  }
  throw new Partslink24PilotError(
    `Nenalezeno tlačítko ${label}.`,
    fieldErrorCode(label),
    await collectSafePageDiagnostics(page, config)
  );
}

async function waitForLoginForm(page, config) {
  const deadline = Date.now() + LOGIN_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const company = await findFirstVisibleLocator(page, COMPANY_SELECTORS);
    const username = await findFirstVisibleLocator(page, USERNAME_SELECTORS);
    const password = await findFirstVisibleLocator(page, PASSWORD_SELECTORS);
    if (company || username || password) {
      return {
        companyFound: Boolean(company),
        usernameFound: Boolean(username),
        passwordFound: Boolean(password)
      };
    }
    await page.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => null);
    await page.waitForTimeout(750);
  }
  throw new Partslink24PilotError(
    "partslink24 login formulář se nepodařilo najít.",
    "PARTSLINK24_LOGIN_FORM_NOT_FOUND",
    await collectSafePageDiagnostics(page, config)
  );
}

async function readSafeResult(page, config) {
  const title = await page.title().catch(() => "");
  const url = page.url();
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  return {
    title: safePreview(title, config, 180),
    url: safePreview(url, config, 500),
    textPreview: safePreview(bodyText, config, 700)
  };
}

async function readTwoFactorChallenge(page, config) {
  const title = await page.title().catch(() => "");
  const url = page.url();
  const bodyText = (await Promise.all(pageSearchTargets(page)
    .map((target) => target.target.locator("body").innerText({ timeout: 2000 }).catch(() => ""))))
    .join("\n");
  if (!detectTwoFactorChallengeText(`${title}\n${url}\n${bodyText}`)) {
    return null;
  }
  return {
    title: safePreview(title, config, 180),
    url: safePreview(url, config, 500),
    note: "2FA obsah stránky není ukládaný do výsledku kvůli možným citlivým údajům."
  };
}

function configFrom(options = {}, env = process.env) {
  const args = options.args || parseArgs(options.argv || process.argv.slice(2));
  return {
    companyId: cleanString(options.companyId || args.companyId || env.PARTSLINK24_COMPANY_ID),
    username: cleanString(options.username || args.username || env.PARTSLINK24_USERNAME),
    password: cleanString(options.password || args.password || env.PARTSLINK24_PASSWORD),
    vin: cleanString(options.vin || args.vin || env.PARTSLINK24_TEST_VIN),
    vehicleId: cleanString(options.vehicleId || args.vehicleId || env.PARTSLINK24_TEST_VEHICLE_ID),
    vehicleKind: cleanString(options.vehicleKind || args.vehicleKind || env.PARTSLINK24_TEST_VEHICLE_KIND),
    requestId: cleanString(options.requestId || args.requestId || env.PARTSLINK24_TEST_REQUEST_ID),
    dryRun: parseBoolean(options.dryRun ?? args.dryRun ?? env.PARTSLINK24_PILOT_DRY_RUN, true),
    allowLiveLogin: parseBoolean(options.allowLiveLogin ?? args.allowLiveLogin ?? env.PARTSLINK24_ALLOW_LIVE_LOGIN, false),
    startedAt: Date.now()
  };
}

export async function runPartslink24VinPilot(options = {}, env = process.env) {
  const config = configFrom(options, env);
  [config.companyId, config.username, config.password, config.vin].forEach((value) => addGithubMask(value, env));

  const missingSecrets = [
    ["PARTSLINK24_COMPANY_ID", config.companyId],
    ["PARTSLINK24_USERNAME", config.username],
    ["PARTSLINK24_PASSWORD", config.password]
  ]
    .filter(([, value]) => !cleanString(value))
    .map(([name]) => name);
  const base = auditBase(config);
  const finished = (payload) => ({
    ...base,
    ...payload,
    durationMs: Date.now() - config.startedAt,
    finishedAt: new Date().toISOString()
  });

  if (!config.vin) {
    return finished({
      ok: false,
      status: "configuration_missing",
      errorCode: "VIN_MISSING",
      message: "Chybí VIN pro pilotní vyhledání."
    });
  }

  if (!config.vehicleKind) {
    return finished({
      ok: false,
      status: "blocked",
      errorCode: "VEHICLE_KIND_REQUIRED",
      message: "partslink24 pilot vyžaduje typ vozidla. Povolená jsou jen osobní vozidla."
    });
  }

  if (!isPassengerVehicleKind(config.vehicleKind)) {
    return finished({
      ok: false,
      status: "blocked",
      errorCode: "VEHICLE_KIND_NOT_SUPPORTED",
      message: "partslink24 pilot je povolený jen pro osobní vozidla. Nákladní vozidla jsou mimo tento pilot."
    });
  }

  if (missingSecrets.length) {
    return finished({
      ok: false,
      status: "configuration_missing",
      errorCode: "PARTSLINK24_SECRETS_MISSING",
      missingSecrets,
      message: "partslink24 pilot nemá nastavené všechny potřebné secrets."
    });
  }

  if (config.dryRun) {
    return finished({
      ok: true,
      status: "dry_run_ready",
      errorCode: "",
      message: "Dry-run prošel. Přihlášení do partslink24 nebylo spuštěné."
    });
  }

  if (!config.allowLiveLogin) {
    return finished({
      ok: false,
      status: "blocked",
      errorCode: "LIVE_LOGIN_NOT_CONFIRMED",
      message: "Live login je zablokovaný. Nastav PARTSLINK24_ALLOW_LIVE_LOGIN=1 až po potvrzení pilotního testu."
    });
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    return finished({
      ok: false,
      status: "blocked",
      errorCode: "PLAYWRIGHT_NOT_AVAILABLE",
      message: "Playwright není v běhovém prostředí dostupný. Nainstaluj ho jen v izolovaném pilotním runneru.",
      error: safeErrorMessage(error, config)
    });
  }

  let browser;
  let page;
  let reloadGate = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      ignoreHTTPSErrors: false
    });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(PARTSLINK24_START_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => null);
    reloadGate = await resolvePartslink24AttentionReloadGate(page, config);
    const loginReadiness = await waitForLoginForm(page, config);
    const companyField = await fillFirst(page, COMPANY_SELECTORS, config.companyId, "Company ID", config, LOGIN_READY_TIMEOUT_MS);
    const usernameField = await fillFirst(page, USERNAME_SELECTORS, config.username, "User name", config);
    const passwordField = await fillFirst(page, PASSWORD_SELECTORS, config.password, "Password", config);
    await Promise.all([
      page.waitForLoadState("domcontentloaded").catch(() => null),
      clickFirst(page, SUBMIT_SELECTORS, "Login", config)
    ]);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null);

    const twoFactorChallenge = await readTwoFactorChallenge(page, config);
    if (twoFactorChallenge) {
      return finished({
        ok: false,
        status: "manual_action_required",
        errorCode: "PARTSLINK24_2FA_REQUIRED",
        reloadGate,
        result: twoFactorChallenge,
        message: "partslink24 vyžaduje 2FA ověření e-mailem. Runner kód nečte ani nezadává automaticky."
      });
    }

    const vinField = await fillFirst(page, VIN_SEARCH_SELECTORS, config.vin, "VIN search", config);
    await page.keyboard.press("Enter");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null);
    const result = await readSafeResult(page, config);

    return finished({
      ok: true,
      status: "manual_review_required",
      errorCode: "",
      reloadGate,
      loginReadiness,
      loginTargets: {
        company: companyField.target,
        username: usernameField.target,
        password: passwordField.target
      },
      vinSearchSelector: vinField.selector,
      vinSearchTarget: vinField.target,
      result,
      message: "VIN byl zadán do partslink24. Výsledek je potřeba ručně ověřit."
    });
  } catch (error) {
    return finished({
      ok: false,
      status: "failed",
      errorCode: error?.errorCode || "PARTSLINK24_BROWSER_PILOT_FAILED",
      message: "Pilotní vyhledání ve partslink24 selhalo.",
      error: safeErrorMessage(error, config),
      reloadGate,
      diagnostic: error?.diagnostic || (page ? await collectSafePageDiagnostics(page, config).catch(() => null) : null)
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
    }
  }
}

function isMainModule() {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isMainModule()) {
  const result = await runPartslink24VinPilot();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
