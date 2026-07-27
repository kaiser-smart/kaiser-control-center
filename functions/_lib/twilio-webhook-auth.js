function cleanString(value) {
  return String(value ?? "").trim();
}

function exactString(value) {
  return String(value ?? "");
}

function timingSafeEqual(a, b) {
  const left = new TextEncoder().encode(cleanString(a));
  const right = new TextEncoder().encode(cleanString(b));
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

async function hmacSha1Base64(key, value) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function urlWithoutPort(value) {
  const url = new URL(value);
  url.port = "";
  return url.toString();
}

function urlWithStandardPort(value) {
  const url = new URL(value);
  if (url.port) {
    return url.toString();
  }

  const credentials = url.username || url.password
    ? `${url.username}${url.password ? `:${url.password}` : ""}@`
    : "";
  const port = url.protocol === "https:" ? "443" : "80";
  return `${url.protocol}//${credentials}${url.host}:${port}${url.pathname}${url.search}${url.hash}`;
}

function legacyQueryUrl(value) {
  const url = new URL(value);
  if (!url.search) {
    return value;
  }

  const grouped = new Map();
  for (const [key, item] of url.searchParams.entries()) {
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  }
  url.search = "";
  const query = Array.from(grouped.entries())
    .flatMap(([key, values]) => values.map((item) => `${encodeURIComponent(key)}=${encodeURIComponent(item)}`))
    .join("&");
  return `${url.toString()}?${query}`;
}

function twilioUrlVariants(value) {
  const withoutPort = urlWithoutPort(value);
  const withPort = urlWithStandardPort(value);
  return Array.from(new Set([
    withoutPort,
    withPort,
    legacyQueryUrl(withoutPort),
    legacyQueryUrl(withPort)
  ]));
}

function requestUrlsForSignature(request, explicitUrl = "") {
  if (explicitUrl) {
    return twilioUrlVariants(explicitUrl);
  }

  const urls = [new URL(request.url).toString()];
  const forwardedProto = cleanString(request.headers.get("X-Forwarded-Proto"));
  const forwardedHost = cleanString(request.headers.get("X-Forwarded-Host") || request.headers.get("Host"));
  const url = new URL(request.url);
  if (forwardedHost) {
    url.protocol = forwardedProto ? `${forwardedProto.replace(/:$/, "")}:` : url.protocol;
    url.host = forwardedHost;
    urls.unshift(url.toString());
  }

  return Array.from(new Set(urls.flatMap((value) => twilioUrlVariants(value))));
}

function signatureValues(value) {
  if (!Array.isArray(value)) {
    return [exactString(value)];
  }
  return Array.from(new Set(value.map((item) => exactString(item)))).sort();
}

function signatureBase(url, params = {}) {
  return Object.keys(params || {})
    .sort()
    .reduce(
      (base, key) => signatureValues(params[key]).reduce(
        (value, item) => `${value}${key}${item}`,
        base
      ),
      url
    );
}

export function parseTwilioFormBody(rawBody = "") {
  const payload = {};
  const signatureParams = {};
  for (const [key, value] of new URLSearchParams(exactString(rawBody)).entries()) {
    payload[key] = value;
    if (!Object.prototype.hasOwnProperty.call(signatureParams, key)) {
      signatureParams[key] = value;
    } else if (Array.isArray(signatureParams[key])) {
      signatureParams[key].push(value);
    } else {
      signatureParams[key] = [signatureParams[key], value];
    }
  }
  return { payload, signatureParams };
}

export function webhookSecretFromRequest(request) {
  const url = new URL(request.url);
  const auth = cleanString(request.headers.get("Authorization"));
  return cleanString(
    request.headers.get("X-KSO-Webhook-Secret") ||
    request.headers.get("X-Twilio-Webhook-Secret") ||
    url.searchParams.get("secret") ||
    (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "")
  );
}

export async function validateTwilioRequestSignatureDetails({
  request,
  authToken,
  params = {},
  rawBody = "",
  explicitUrl = ""
} = {}) {
  const token = cleanString(authToken);
  const signature = cleanString(request?.headers?.get("X-Twilio-Signature"));
  if (!token || !signature || !request) {
    return {
      valid: false,
      reason: !request ? "request_missing" : !token ? "auth_token_missing" : "signature_missing",
      candidateCount: 0
    };
  }

  const contentType = cleanString(request.headers.get("content-type")).toLowerCase();
  const urls = requestUrlsForSignature(request, explicitUrl);
  if (contentType.includes("application/json")) {
    const bodyHash = cleanString(new URL(urls[0]).searchParams.get("bodySHA256"));
    if (!bodyHash) {
      return { valid: false, reason: "json_body_hash_missing", candidateCount: urls.length };
    }
    const expectedHash = await sha256Hex(exactString(rawBody));
    if (!timingSafeEqual(expectedHash, bodyHash)) {
      return { valid: false, reason: "json_body_hash_mismatch", candidateCount: urls.length };
    }
  }

  for (const url of urls) {
    const base = contentType.includes("application/json")
      ? signatureBase(url)
      : signatureBase(url, params);
    const expected = await hmacSha1Base64(token, base);
    if (timingSafeEqual(expected, signature)) {
      return { valid: true, reason: "valid", candidateCount: urls.length };
    }
  }

  return { valid: false, reason: "signature_mismatch", candidateCount: urls.length };
}

export async function validateTwilioRequestSignature(options = {}) {
  const result = await validateTwilioRequestSignatureDetails(options);
  return result.valid;
}

export async function requireTwilioWebhookAuth(env, request, payload = {}, rawBody = "", signatureParams = payload) {
  const authTokens = Array.from(new Set([
    env?.TWILIO_KAISER_AUTH_TOKEN,
    env?.KAISER_TWILIO_AUTH_TOKEN,
    env?.TWILIO_AUTH_TOKEN
  ].map(cleanString).filter(Boolean)));
  const signaturePresent = Boolean(cleanString(request.headers.get("X-Twilio-Signature")));
  const signatureConfigured = Boolean(authTokens.length && signaturePresent);
  const expected = cleanString(
    env?.TWILIO_INBOUND_WEBHOOK_SECRET ||
    env?.TWILIO_KAISER_INBOUND_WEBHOOK_TOKEN ||
    env?.KAISER_TWILIO_INBOUND_WEBHOOK_TOKEN ||
    env?.TWILIO_KAISER_STATUS_WEBHOOK_TOKEN ||
    env?.KAISER_TWILIO_STATUS_WEBHOOK_TOKEN
  );

  if (signatureConfigured) {
    let validation = { valid: false, reason: "signature_mismatch", candidateCount: 0 };
    for (const authToken of authTokens) {
      validation = await validateTwilioRequestSignatureDetails({
        request,
        authToken,
        params: signatureParams,
        rawBody
      });
      if (validation.valid) {
        return { ok: true, method: "twilio_signature" };
      }
    }

    console.warn("twilio.webhook_signature_invalid", {
      path: new URL(request.url).pathname,
      contentType: cleanString(request.headers.get("content-type")).split(";")[0].toLowerCase(),
      reason: validation.reason,
      candidateCount: validation.candidateCount
    });
    if (!expected) {
      return { ok: false, responseStatus: 401, error: "Neplatný Twilio podpis." };
    }
  } else if (authTokens.length && !signaturePresent) {
    console.warn("twilio.webhook_signature_missing", {
      path: new URL(request.url).pathname,
      contentType: cleanString(request.headers.get("content-type")).split(";")[0].toLowerCase()
    });
  }

  if (!expected) {
    return { ok: false, responseStatus: 503, error: "Webhook secret není nastavený v serverových secrets." };
  }

  const provided = webhookSecretFromRequest(request);
  if (!provided || !timingSafeEqual(provided, expected)) {
    console.warn("twilio.webhook_secret_invalid", { path: new URL(request.url).pathname });
    return { ok: false, responseStatus: 401, error: "Neplatný webhook secret." };
  }

  return { ok: true, method: "shared_secret" };
}

export const __test = {
  parseTwilioFormBody,
  validateTwilioRequestSignatureDetails,
  webhookSecretFromRequest,
  validateTwilioRequestSignature
};
