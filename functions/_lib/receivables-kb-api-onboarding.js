function cleanString(value) {
  return String(value ?? "").trim();
}

function base64UrlToJson(value) {
  const input = cleanString(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = input.padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  const decoded = typeof atob === "function"
    ? atob(padded)
    : Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(decoded);
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

const KB_ADAA_SANDBOX_KEY_PROBES = [
  {
    id: "client_registration",
    label: "Client Registration Sandbox",
    envKey: "KB_ADAA_CLIENT_REGISTRATION_API_KEY",
    servicePattern: /ClientRegistrationSandbox/i
  },
  {
    id: "oauth",
    label: "OAuth2 Sandbox",
    envKey: "KB_ADAA_OAUTH_API_KEY",
    servicePattern: /OAuth2/i
  },
  {
    id: "account_access",
    label: "Account Direct Access API Sandbox",
    envKey: "KB_ADAA_ACCOUNT_API_KEY",
    servicePattern: /AccountDirectAccessAPI|Account Direct Access API/i
  }
];

const KB_ADAA_ONBOARDING_PORTAL_LINKS = [
  {
    label: "KB Developer Portal",
    url: "https://developers.kb.cz/"
  },
  {
    label: "Software Statement",
    url: "https://developers.kb.cz/service/AccountDirectAccessAPI-v2/software-statements"
  },
  {
    label: "OAuth registrace aplikace",
    url: "https://developers.kb.cz/service/AccountDirectAccessAPI-v2/application-registration-oauth2"
  },
  {
    label: "Tokeny",
    url: "https://developers.kb.cz/service/AccountDirectAccessAPI-v2/tokens"
  },
  {
    label: "Accounts",
    url: "https://developers.kb.cz/service/AccountDirectAccessAPI-v2/accounts"
  }
];

const KB_ADAA_ONBOARDING_SECRET_PLAN = [
  {
    key: "KB_ADAA_QUALIFIED_CERTIFICATE_READY",
    label: "Kvalifikovaný certifikát připraven",
    phase: "certifikat",
    note: "Pouze příznak připravenosti; certifikát neukládat do repozitáře."
  },
  {
    key: "KB_ADAA_SOFTWARE_STATEMENT",
    label: "Software Statement",
    phase: "software_statement",
    note: "Token od KB uložit jen jako Cloudflare secret."
  },
  {
    key: "KB_ADAA_SOFTWARE_STATEMENT_CONTACT_EMAIL",
    label: "Kontakt pro obnovu Software Statementu",
    phase: "software_statement",
    note: "Doporučený sdílený provozní e-mail, ne osobní schránka jednoho člověka."
  },
  {
    key: "KB_ADAA_CLIENT_ID",
    label: "OAuth Client ID",
    phase: "oauth",
    note: "Vznikne po registraci aplikace v KB."
  },
  {
    key: "KB_ADAA_CLIENT_SECRET",
    label: "OAuth Client Secret",
    phase: "oauth",
    note: "Uložit jen jako Cloudflare secret."
  },
  {
    key: "KB_ADAA_REFRESH_TOKEN",
    label: "Refresh token po souhlasu uživatele",
    phase: "souhlas",
    note: "Až po přihlášení oprávněného uživatele KB a potvrzení přístupu."
  },
  {
    key: "KB_ADAA_REDIRECT_URI",
    label: "OAuth redirect URI",
    phase: "oauth",
    note: "Volitelné přepsání výchozí produkční callback URL."
  }
];

function onboardingStep(id, label, description, requiredEnv, env) {
  const missingEnv = requiredEnv.filter((key) => !hasEnvValue(env, key));
  return {
    id,
    label,
    description,
    requiredEnv,
    missingEnv,
    status: missingEnv.length ? "waiting" : "done"
  };
}

function buildReceivablesKbOnboardingPackage(env, onboarding) {
  const callbackUrl = cleanString(env.KB_ADAA_REDIRECT_URI)
    || "https://smart-odpady.ai/api/receivables/kb/oauth/callback";
  const steps = [
    onboardingStep(
      "qualified_certificate",
      "Získat kvalifikovaný certifikát",
      "Pořídit kvalifikovaný certifikát pro elektronický podpis nebo pečeť u akceptované certifikační autority.",
      ["KB_ADAA_QUALIFIED_CERTIFICATE_READY"],
      env
    ),
    onboardingStep(
      "software_statement",
      "Vyžádat Software Statement",
      "V KB Developer Portálu použít Client Registration API key a certifikát; výsledek uložit jako secret.",
      ["KB_ADAA_SOFTWARE_STATEMENT", "KB_ADAA_SOFTWARE_STATEMENT_CONTACT_EMAIL"],
      env
    ),
    onboardingStep(
      "oauth_registration",
      "Registrovat OAuth aplikaci",
      "Propojit aplikaci s klientem KB a získat Client ID a Client Secret.",
      ["KB_ADAA_CLIENT_ID", "KB_ADAA_CLIENT_SECRET"],
      env
    ),
    onboardingStep(
      "user_consent",
      "Potvrdit souhlas uživatele",
      "Uživatel s dispozičním právem se přihlásí do KB a potvrdí přístup k účtům.",
      ["KB_ADAA_REFRESH_TOKEN"],
      env
    ),
    {
      id: "read_only_api_probe",
      label: "Povolit read-only API probe",
      description: "Teprve po kompletním OAuth onboardingu volat sandbox Accounts, Balances a Transactions bez zápisu do ledgeru.",
      requiredEnv: [],
      missingEnv: [],
      status: onboarding.readyForProductionRead ? "ready" : "blocked"
    }
  ];
  const firstWaiting = steps.find((step) => step.status === "waiting" || step.status === "blocked");

  return {
    mode: "manual_onboarding_package",
    callbackUrl,
    redirectUriConfigured: hasEnvValue(env, "KB_ADAA_REDIRECT_URI"),
    applicationName: cleanString(env.KB_ADAA_APPLICATION_NAME) || "Kaiser Control Center - Pohledávky",
    nextAction: firstWaiting || steps[steps.length - 1],
    steps,
    secretPlan: KB_ADAA_ONBOARDING_SECRET_PLAN.map((secret) => ({
      ...secret,
      configured: hasEnvValue(env, secret.key),
      valueVisible: false
    })),
    portalLinks: KB_ADAA_ONBOARDING_PORTAL_LINKS,
    handoffChecklist: [
      "Neposílat API klíče, certifikát, Software Statement ani tokeny do chatu.",
      "Všechny hodnoty ukládat přes Cloudflare Dashboard nebo wrangler pages secret put.",
      "Po doplnění secretů znovu ověřit panel KB ADAA v produkčním UI.",
      "KB Accounts/Balances/Transactions volat až v samostatné read-only fázi."
    ],
    safety: {
      callsKbApi: false,
      writesLedger: false,
      storesSecretsInRepository: false,
      exposesSecretValues: false,
      createsPayments: false,
      startsAutomation: false
    }
  };
}

function decodeKbApiKeyMetadata(token) {
  const parts = cleanString(token).split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      errorCode: "invalid_jwt_shape"
    };
  }

  try {
    const header = base64UrlToJson(parts[0]);
    const payload = base64UrlToJson(parts[1]);
    const subscribedApis = Array.isArray(payload.subscribedAPIs) ? payload.subscribedAPIs : [];
    return {
      ok: true,
      algorithm: cleanString(header.alg) || "unknown",
      type: cleanString(header.typ) || "unknown",
      keytype: cleanString(payload.keytype),
      issuer: cleanString(payload.iss),
      subjectPresent: Boolean(cleanString(payload.sub)),
      issuedAt: Number.isFinite(Number(payload.iat)) ? new Date(Number(payload.iat) * 1000).toISOString() : "",
      applicationPresent: Boolean(payload.application?.uuid || payload.application?.id || payload.application?.name),
      subscribedApis: subscribedApis.map((api) => ({
        name: cleanString(api?.name),
        context: cleanString(api?.context),
        version: cleanString(api?.version),
        tier: cleanString(api?.subscriptionTier)
      })).filter((api) => api.name || api.context || api.version || api.tier)
    };
  } catch {
    return {
      ok: false,
      errorCode: "jwt_metadata_decode_failed"
    };
  }
}

function probeKbSandboxKey(env, definition) {
  const token = cleanString(env?.[definition.envKey]);
  if (!token) {
    return {
      id: definition.id,
      label: definition.label,
      configured: false,
      ok: false,
      status: "missing",
      envKey: definition.envKey,
      message: "Secret není nastavený."
    };
  }

  const metadata = decodeKbApiKeyMetadata(token);
  if (!metadata.ok) {
    return {
      id: definition.id,
      label: definition.label,
      configured: true,
      ok: false,
      status: "invalid",
      envKey: definition.envKey,
      errorCode: metadata.errorCode,
      message: "Secret existuje, ale nejde bezpečně přečíst jako KB JWT metadata."
    };
  }

  const apiNames = metadata.subscribedApis.map((api) => api.name).filter(Boolean);
  const matchesExpectedService = metadata.subscribedApis.some((api) => (
    definition.servicePattern.test(api.name) || definition.servicePattern.test(api.context)
  ));
  const sandbox = metadata.keytype.toUpperCase() === "SANDBOX";
  const ok = matchesExpectedService && sandbox;

  return {
    id: definition.id,
    label: definition.label,
    configured: true,
    ok,
    status: ok ? "ok" : "review",
    envKey: definition.envKey,
    keytype: metadata.keytype || "missing",
    matchesExpectedService,
    subscribedApis: apiNames,
    contexts: metadata.subscribedApis.map((api) => api.context).filter(Boolean),
    issuedAt: metadata.issuedAt,
    applicationPresent: metadata.applicationPresent,
    subjectPresent: metadata.subjectPresent,
    message: ok
      ? "Sandbox JWT metadata sedí pro očekávanou službu."
      : "Secret existuje, ale metadata neodpovídají očekávané sandbox službě."
  };
}

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

  const status = {
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
  return {
    ...status,
    onboardingPackage: buildReceivablesKbOnboardingPackage(env, status)
  };
}

export function receivablesKbApiSandboxProbe(env = {}) {
  const onboarding = receivablesKbApiOnboardingStatus(env);
  const keyChecks = KB_ADAA_SANDBOX_KEY_PROBES.map((definition) => probeKbSandboxKey(env, definition));
  const validKeyCount = keyChecks.filter((check) => check.ok).length;
  const missingKeys = keyChecks.filter((check) => !check.configured).map((check) => check.envKey);
  const invalidKeys = keyChecks.filter((check) => check.configured && !check.ok).map((check) => check.envKey);
  const missingOauthOnboarding = [
    "KB_ADAA_SOFTWARE_STATEMENT",
    "KB_ADAA_CLIENT_ID",
    "KB_ADAA_CLIENT_SECRET",
    "KB_ADAA_REFRESH_TOKEN"
  ].filter((key) => !hasEnvValue(env, key));
  const canCallSandboxApi = validKeyCount === keyChecks.length && missingOauthOnboarding.length === 0;
  const status = validKeyCount === keyChecks.length
    ? canCallSandboxApi ? "ready_to_call" : "blocked_oauth_onboarding"
    : validKeyCount > 0 ? "review" : "waiting";

  return {
    provider: "Komerční banka",
    service: "Account Direct Access API v2",
    environment: onboarding.environment,
    mode: "read_only_sandbox_probe",
    status,
    readOnly: true,
    callsKbApi: false,
    apiCallAttempted: false,
    apiCallBlockedReason: canCallSandboxApi ? "" : "missing_oauth_onboarding",
    writesLedger: false,
    persistsBankTransactions: false,
    createsPayments: false,
    startsAutomation: false,
    validKeyCount,
    expectedKeyCount: keyChecks.length,
    missingKeys,
    invalidKeys,
    missingOauthOnboarding,
    keyChecks,
    endpointsPlanned: [
      "Accounts",
      "Balances",
      "Transactions"
    ],
    recommendedNextStep: canCallSandboxApi
      ? "Další fáze může spustit samostatné read-only volání KB sandbox API bez zápisu transakcí."
      : "Nejdřív dokončit Software Statement, OAuth registraci a souhlas uživatele; KB API volání je zatím záměrně blokované.",
    safety: {
      storesSecretsInRepository: false,
      exposesSecretValues: false,
      exposesJwtPayload: false,
      callsKbApi: false,
      persistsBankTransactions: false,
      createsPayments: false,
      startsAutomation: false
    }
  };
}
