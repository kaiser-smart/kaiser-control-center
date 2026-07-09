function cleanString(value) {
  return String(value ?? "").trim();
}

function hasEnvValue(env, key) {
  return Boolean(cleanString(env?.[key]));
}

function item(id, label, description, requiredEnv = []) {
  return {
    id,
    label,
    description,
    requiredEnv,
    configured: false,
    missingEnv: requiredEnv
  };
}

const KB_ADAA_ONBOARDING_ITEMS = [
  item(
    "developer_application",
    "Aplikace v KB Developer Portálu",
    "Aplikace má být založená zvlášť pro sandbox a produkci podle prostředí.",
    ["KB_ADAA_ENVIRONMENT"]
  ),
  item(
    "client_registration_key",
    "API key Client Registration",
    "Používá se pro získání Software Statementu.",
    ["KB_ADAA_CLIENT_REGISTRATION_API_KEY"]
  ),
  item(
    "oauth_key",
    "API key OAuth 2",
    "Používá se pro refresh token a access token.",
    ["KB_ADAA_OAUTH_API_KEY"]
  ),
  item(
    "account_access_key",
    "API key Account Direct Access API",
    "Používá se pro read-only volání účtů, zůstatků a transakcí.",
    ["KB_ADAA_ACCOUNT_API_KEY"]
  ),
  item(
    "qualified_certificate",
    "Kvalifikovaný certifikát",
    "Certifikát pro elektronický podpis nebo pečeť je potřeba pro Software Statement.",
    ["KB_ADAA_QUALIFIED_CERTIFICATE_READY"]
  ),
  item(
    "software_statement",
    "Software Statement",
    "Token od KB má provozní platnost a musí mít evidovaný kontakt pro obnovu.",
    ["KB_ADAA_SOFTWARE_STATEMENT", "KB_ADAA_SOFTWARE_STATEMENT_CONTACT_EMAIL"]
  ),
  item(
    "oauth_application_registration",
    "OAuth registrace aplikace",
    "Po autorizaci klienta vznikne Client ID a Client Secret.",
    ["KB_ADAA_CLIENT_ID", "KB_ADAA_CLIENT_SECRET"]
  ),
  item(
    "user_consent",
    "Souhlas uživatele s dispozičním právem",
    "Uživatel v KB potvrdí přístup aplikace k účtům.",
    ["KB_ADAA_REFRESH_TOKEN"]
  )
];

export function receivablesKbApiOnboardingStatus(env = {}) {
  const items = KB_ADAA_ONBOARDING_ITEMS.map((entry) => {
    const missingEnv = entry.requiredEnv.filter((key) => !hasEnvValue(env, key));
    return {
      ...entry,
      configured: missingEnv.length === 0,
      missingEnv
    };
  });
  const configuredCount = items.filter((entry) => entry.configured).length;
  const missingCount = items.length - configuredCount;
  const readyForSandboxProbe = ["client_registration_key", "oauth_key", "account_access_key"]
    .every((id) => items.find((entry) => entry.id === id)?.configured);
  const readyForProductionRead = missingCount === 0;

  return {
    apiStatus: readyForProductionRead ? "ready" : configuredCount > 0 ? "partial" : "waiting",
    mode: "read_only_onboarding",
    provider: "Komerční banka",
    service: "Account Direct Access API v2",
    environment: cleanString(env.KB_ADAA_ENVIRONMENT) || "nenastaveno",
    readOnly: true,
    writesLedger: false,
    sendsPayments: false,
    startsAutomation: false,
    configuredCount,
    missingCount,
    readyForSandboxProbe,
    readyForProductionRead,
    items,
    requiredScopes: [
      "Accounts",
      "Balances",
      "Transactions"
    ],
    expectedSecrets: Array.from(new Set(items.flatMap((entry) => entry.requiredEnv))),
    recommendedNextStep: readyForProductionRead
      ? "Spustit samostatnou read-only sandbox/produkční probe fázi pro Accounts, Balances a Transactions bez zápisu do ledgeru."
      : "Doplnit KB onboarding údaje do Cloudflare secrets a potom teprve povolit read-only API probe.",
    safety: {
      storesSecretsInRepository: false,
      exposesSecretValues: false,
      callsKbApi: false,
      persistsBankTransactions: false,
      createsPayments: false
    }
  };
}
