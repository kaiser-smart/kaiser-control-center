function cleanString(value) {
  return String(value ?? "").trim();
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

function requestUrlForSignature(request, explicitUrl = "") {
  if (explicitUrl) {
    return explicitUrl;
  }

  const forwardedProto = cleanString(request.headers.get("X-Forwarded-Proto"));
  const forwardedHost = cleanString(request.headers.get("X-Forwarded-Host") || request.headers.get("Host"));
  const url = new URL(request.url);
  if (forwardedHost) {
    url.protocol = forwardedProto ? `${forwardedProto.replace(/:$/, "")}:` : url.protocol;
    url.host = forwardedHost;
  }
  return url.toString();
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

export async function validateTwilioRequestSignature({ request, authToken, params = {}, rawBody = "", explicitUrl = "" } = {}) {
  const token = cleanString(authToken);
  const signature = cleanString(request?.headers?.get("X-Twilio-Signature"));
  if (!token || !signature || !request) {
    return false;
  }

  const contentType = cleanString(request.headers.get("content-type")).toLowerCase();
  const url = requestUrlForSignature(request, explicitUrl);
  const base = contentType.includes("application/json")
    ? `${url}${rawBody}`
    : Object.keys(params || {})
      .sort()
      .reduce((acc, key) => `${acc}${key}${cleanString(params[key])}`, url);
  const expected = await hmacSha1Base64(token, base);
  return timingSafeEqual(expected, signature);
}

export async function requireTwilioWebhookAuth(env, request, payload = {}, rawBody = "") {
  const authToken = cleanString(env?.TWILIO_AUTH_TOKEN || env?.TWILIO_KAISER_AUTH_TOKEN || env?.KAISER_TWILIO_AUTH_TOKEN);
  const signatureConfigured = Boolean(authToken && cleanString(request.headers.get("X-Twilio-Signature")));

  if (signatureConfigured) {
    const valid = await validateTwilioRequestSignature({ request, authToken, params: payload, rawBody });
    if (valid) {
      return { ok: true, method: "twilio_signature" };
    }

    console.warn("twilio.webhook_signature_invalid", { path: new URL(request.url).pathname });
    return { ok: false, responseStatus: 401, error: "Neplatný Twilio podpis." };
  }

  const expected = cleanString(
    env?.TWILIO_INBOUND_WEBHOOK_SECRET ||
    env?.TWILIO_KAISER_INBOUND_WEBHOOK_TOKEN ||
    env?.KAISER_TWILIO_INBOUND_WEBHOOK_TOKEN ||
    env?.TWILIO_KAISER_STATUS_WEBHOOK_TOKEN ||
    env?.KAISER_TWILIO_STATUS_WEBHOOK_TOKEN
  );
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
  webhookSecretFromRequest,
  validateTwilioRequestSignature
};
