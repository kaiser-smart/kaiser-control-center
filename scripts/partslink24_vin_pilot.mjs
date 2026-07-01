#!/usr/bin/env node

const PARTSLINK24_START_URL = "https://www.partslink24.com/partslink24/startup.do";
const SECRET_NAMES = [
  "PARTSLINK24_COMPANY_ID",
  "PARTSLINK24_USERNAME",
  "PARTSLINK24_PASSWORD"
];

const COMPANY_SELECTORS = [
  "input[name='company']",
  "input[name='companyId']",
  "input[name='companyID']",
  "input[name='customerNumber']",
  "input[id*='company' i]",
  "input[id*='customer' i]",
  "input[id*='client' i]"
];

const USERNAME_SELECTORS = [
  "input[name='username']",
  "input[name='userName']",
  "input[name='user']",
  "input[name='login']",
  "input[id*='user' i]",
  "input[id*='login' i]"
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
  "a:has-text('Login')"
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
  return redactSensitive(error?.message || error || "Neznámá chyba.", [
    config.companyId,
    config.username,
    config.password,
    config.vin
  ]);
}

async function fillFirst(page, selectors, value, label) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      await locator.fill(value, { timeout: 5000 });
      return selector;
    }
  }
  throw new Error(`Nenalezeno pole ${label}.`);
}

async function clickFirst(page, selectors, label) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      await locator.click({ timeout: 5000 });
      return selector;
    }
  }
  throw new Error(`Nenalezeno tlačítko ${label}.`);
}

async function readSafeResult(page, config) {
  const title = await page.title().catch(() => "");
  const url = page.url();
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const redactedText = redactSensitive(bodyText, [
    config.companyId,
    config.username,
    config.password,
    config.vin
  ]);
  return {
    title: redactSensitive(title, [config.vin]),
    url: redactSensitive(url, [config.vin]),
    textPreview: redactedText.replace(/\s+/g, " ").slice(0, 700)
  };
}

async function readTwoFactorChallenge(page, config) {
  const title = await page.title().catch(() => "");
  const url = page.url();
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  if (!detectTwoFactorChallengeText(`${title}\n${url}\n${bodyText}`)) {
    return null;
  }
  return {
    title: redactSensitive(title, [config.companyId, config.username, config.password, config.vin]),
    url: redactSensitive(url, [config.companyId, config.username, config.password, config.vin]),
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
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      ignoreHTTPSErrors: false
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(PARTSLINK24_START_URL, { waitUntil: "domcontentloaded" });
    await fillFirst(page, COMPANY_SELECTORS, config.companyId, "Company ID");
    await fillFirst(page, USERNAME_SELECTORS, config.username, "User name");
    await fillFirst(page, PASSWORD_SELECTORS, config.password, "Password");
    await Promise.all([
      page.waitForLoadState("domcontentloaded").catch(() => null),
      clickFirst(page, SUBMIT_SELECTORS, "Login")
    ]);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null);

    const twoFactorChallenge = await readTwoFactorChallenge(page, config);
    if (twoFactorChallenge) {
      return finished({
        ok: false,
        status: "manual_action_required",
        errorCode: "PARTSLINK24_2FA_REQUIRED",
        result: twoFactorChallenge,
        message: "partslink24 vyžaduje 2FA ověření e-mailem. Runner kód nečte ani nezadává automaticky."
      });
    }

    const vinSelector = await fillFirst(page, VIN_SEARCH_SELECTORS, config.vin, "VIN search");
    await page.keyboard.press("Enter");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null);
    const result = await readSafeResult(page, config);

    return finished({
      ok: true,
      status: "manual_review_required",
      errorCode: "",
      vinSearchSelector: vinSelector,
      result,
      message: "VIN byl zadán do partslink24. Výsledek je potřeba ručně ověřit."
    });
  } catch (error) {
    return finished({
      ok: false,
      status: "failed",
      errorCode: "PARTSLINK24_BROWSER_PILOT_FAILED",
      message: "Pilotní vyhledání ve partslink24 selhalo.",
      error: safeErrorMessage(error, config)
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
