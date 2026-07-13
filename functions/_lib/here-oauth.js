const DEFAULT_TOKEN_URL = "https://account.api.here.com/oauth2/token";

export class HereOAuthError extends Error {
  constructor(message, status = 502, code = "here_oauth_error") {
    super(message);
    this.name = "HereOAuthError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function percentEncode(value) {
  return encodeURIComponent(String(value ?? ""))
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function randomNonce() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll("-", "");
  return `${Date.now()}${Math.random().toString(36).slice(2)}`;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(binary, "binary").toString("base64");
}

async function hmacSha256Base64(secret, value) {
  if (!globalThis.crypto?.subtle) {
    throw new HereOAuthError("Server nepodporuje bezpečný podpis HERE OAuth.", 503, "here_oauth_crypto_missing");
  }
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return bytesToBase64(await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export function hereOAuthConfiguration(env = {}) {
  const accessKeyId = cleanString(env.HERE_ACCESS_KEY_ID);
  const accessKeySecret = cleanString(env.HERE_ACCESS_KEY_SECRET);
  const tokenUrl = cleanString(env.HERE_TOKEN_ENDPOINT_URL) || DEFAULT_TOKEN_URL;
  let tokenUrlValid = false;
  try {
    const parsed = new URL(tokenUrl);
    tokenUrlValid = parsed.protocol === "https:" &&
      parsed.hostname === "account.api.here.com" &&
      parsed.pathname === "/oauth2/token" &&
      !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch {
    tokenUrlValid = false;
  }
  return {
    configured: Boolean(accessKeyId && accessKeySecret && tokenUrlValid),
    accessKeyId,
    accessKeySecret,
    tokenUrl,
    tokenUrlValid,
    missing: [
      !accessKeyId ? "HERE_ACCESS_KEY_ID" : "",
      !accessKeySecret ? "HERE_ACCESS_KEY_SECRET" : "",
      !tokenUrlValid ? "platná oficiální HERE_TOKEN_ENDPOINT_URL" : ""
    ].filter(Boolean)
  };
}

export async function buildHereOAuthTokenRequest(env = {}, options = {}) {
  const config = hereOAuthConfiguration(env);
  if (!config.configured) {
    throw new HereOAuthError(
      `Chybí serverové HERE OAuth přístupy: ${config.missing.join(", ")}.`,
      503,
      "here_oauth_not_configured"
    );
  }
  const timestamp = String(Math.floor(Number(options.nowMs ?? Date.now()) / 1000));
  const nonce = cleanString(options.nonce) || randomNonce();
  const oauthParameters = {
    oauth_consumer_key: config.accessKeyId,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: timestamp,
    oauth_version: "1.0"
  };
  const signatureParameters = { ...oauthParameters, grant_type: "client_credentials" };
  const parameterString = Object.entries(signatureParameters)
    .map(([key, value]) => [percentEncode(key), percentEncode(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
    ))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const signatureBase = `POST&${percentEncode(config.tokenUrl)}&${percentEncode(parameterString)}`;
  const signature = await hmacSha256Base64(`${percentEncode(config.accessKeySecret)}&`, signatureBase);
  const authorization = `OAuth ${Object.entries({ ...oauthParameters, oauth_signature: signature })
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ")}`;
  return {
    url: config.tokenUrl,
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  };
}

async function responsePayload(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function requestHereOAuthToken(env = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new HereOAuthError("Server nemá dostupné HTTPS volání pro HERE.", 503, "here_oauth_fetch_missing");
  }
  const request = await buildHereOAuthTokenRequest(env, options);
  const response = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body
  });
  const payload = await responsePayload(response);
  if (!response.ok) {
    throw new HereOAuthError(
      "HERE OAuth odmítl serverové přihlášení.",
      response.status === 401 || response.status === 403 ? 503 : 502,
      "here_oauth_request_failed"
    );
  }
  const accessToken = cleanString(payload.accessToken || payload.access_token);
  if (!accessToken) {
    throw new HereOAuthError("HERE OAuth nevrátil přístupový token.", 502, "here_oauth_token_missing");
  }
  return {
    accessToken,
    expiresIn: Number(payload.expiresIn || payload.expires_in || 0) || 0
  };
}

export const __test = {
  DEFAULT_TOKEN_URL,
  percentEncode
};
