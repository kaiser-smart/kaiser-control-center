const encoder = new TextEncoder();
const decoder = new TextDecoder();
const STATE_TTL_SECONDS = 15 * 60;
const STATE_CLOCK_SKEW_SECONDS = 60;

export class ReceivablesKbOAuthHandoffError extends Error {
  constructor(message, status = 400, code = "receivables_kb_oauth_handoff_invalid") {
    super(message);
    this.name = "ReceivablesKbOAuthHandoffError";
    this.status = status;
    this.code = code;
  }
}

function clean(value) {
  return String(value ?? "").trim();
}

function stateSigningSecret(env = {}) {
  const secret = clean(env.KB_ADAA_OAUTH_STATE_SECRET || env.AUTH_SESSION_SECRET);
  if (!secret) {
    throw new ReceivablesKbOAuthHandoffError(
      "Podpis OAuth state není nakonfigurovaný.",
      503,
      "receivables_kb_oauth_state_secret_missing"
    );
  }
  return secret;
}

async function stateSigningKey(env) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(stateSigningSecret(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bytesToBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const input = clean(value);
  if (!input || !/^[A-Za-z0-9_-]+$/.test(input)) {
    throw new ReceivablesKbOAuthHandoffError("OAuth state není platný.");
  }
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new ReceivablesKbOAuthHandoffError("OAuth state není platný.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseStatePayload(encodedPayload) {
  let state;
  try {
    state = JSON.parse(decoder.decode(base64UrlToBytes(encodedPayload)));
  } catch (error) {
    if (error instanceof ReceivablesKbOAuthHandoffError) throw error;
    throw new ReceivablesKbOAuthHandoffError("OAuth state není platný JSON.");
  }
  return state;
}

function validateStatePayload(state, options = {}) {
  const nowSeconds = Math.floor(Number(options.now || Date.now()) / 1000);
  const expectedSubject = clean(options.subject);
  const issuedAt = Number(state?.iat);
  const nonce = clean(state?.nonce);
  const subject = clean(state?.sub);
  const publicKey = state?.publicKey;
  if (
    state?.v !== 1
    || !/^[A-Za-z0-9_-]{16,160}$/.test(nonce)
    || !subject
    || subject.length > 200
    || !Number.isInteger(issuedAt)
    || issuedAt < nowSeconds - STATE_TTL_SECONDS
    || issuedAt > nowSeconds + STATE_CLOCK_SKEW_SECONDS
    || publicKey?.kty !== "RSA"
    || publicKey?.alg !== "RSA-OAEP-256"
    || clean(publicKey?.e) !== "AQAB"
    || !/^[A-Za-z0-9_-]{300,1000}$/.test(clean(publicKey?.n))
    || (expectedSubject && subject !== expectedSubject)
  ) {
    throw new ReceivablesKbOAuthHandoffError("OAuth state nemá povolený formát nebo platnost.");
  }
  return { nonce, publicKey, subject, issuedAt };
}

function stateParts(value) {
  const input = clean(value);
  if (!input || input.length > 12_000) {
    throw new ReceivablesKbOAuthHandoffError("OAuth state chybí nebo je příliš dlouhý.");
  }
  const parts = input.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new ReceivablesKbOAuthHandoffError("OAuth state nemá platný podpis.");
  }
  return { encodedPayload: parts[0], encodedSignature: parts[1] };
}

export async function encodeReceivablesKbOAuthState({ nonce, publicKey, subject, issuedAt }, env = {}) {
  const state = {
    v: 1,
    nonce: clean(nonce),
    publicKey,
    sub: clean(subject),
    iat: Math.floor(Number(issuedAt || Date.now()) / 1000)
  };
  validateStatePayload(state, { subject: state.sub, now: issuedAt || Date.now() });
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(state)));
  const signature = await crypto.subtle.sign("HMAC", await stateSigningKey(env), encoder.encode(encodedPayload));
  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

export async function validateReceivablesKbOAuthState(stateValue, env = {}, options = {}) {
  const { encodedPayload, encodedSignature } = stateParts(stateValue);
  const verified = await crypto.subtle.verify(
    "HMAC",
    await stateSigningKey(env),
    base64UrlToBytes(encodedSignature),
    encoder.encode(encodedPayload)
  ).catch(() => false);
  if (!verified) {
    throw new ReceivablesKbOAuthHandoffError("OAuth state nemá platný podpis.");
  }
  const validated = validateStatePayload(parseStatePayload(encodedPayload), options);
  return { ...validated, valid: true };
}

export async function encryptReceivablesKbOAuthHandoff(payload, stateValue, env = {}, options = {}) {
  const { nonce, publicKey } = await validateReceivablesKbOAuthState(stateValue, env, options);
  const refreshToken = clean(payload?.refreshToken);
  if (!refreshToken) {
    throw new ReceivablesKbOAuthHandoffError(
      "KB OAuth odpověď neobsahuje refresh token.",
      502,
      "receivables_kb_refresh_token_missing"
    );
  }
  let rsaKey;
  try {
    rsaKey = await crypto.subtle.importKey(
      "jwk",
      publicKey,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
    );
  } catch {
    throw new ReceivablesKbOAuthHandoffError("Veřejný klíč OAuth handoffu není platný.");
  }
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = encoder.encode(`kb-oauth:${nonce}`);
  const plaintext = encoder.encode(JSON.stringify({
    refreshToken,
    scope: clean(payload?.scope),
    tokenType: clean(payload?.tokenType) || "Bearer",
    issuedAt: new Date().toISOString()
  }));
  const [wrappedKey, ciphertext] = await Promise.all([
    crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsaKey, rawAesKey),
    crypto.subtle.encrypt({
      name: "AES-GCM",
      iv,
      additionalData,
      tagLength: 128
    }, aesKey, plaintext)
  ]);
  return {
    v: 1,
    nonce,
    keyAlgorithm: "RSA-OAEP-256",
    contentAlgorithm: "A256GCM",
    wrappedKey: bytesToBase64Url(wrappedKey),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(ciphertext),
    refreshTokenVisible: false
  };
}
