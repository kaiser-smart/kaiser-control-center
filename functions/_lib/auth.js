import { DEFAULT_USERS } from "./default-users.js";
import { CONTACT_USERS } from "./contact-users.js";
import { hasPermission, isUserActive } from "../../src/permissions.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const rateBuckets = globalThis.__SMART_ODPADY_AUTH_RATE_BUCKETS__ || new Map();
globalThis.__SMART_ODPADY_AUTH_RATE_BUCKETS__ = rateBuckets;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function normalizeIdentifier(identifier) {
  const value = String(identifier || "").trim();
  if (value.includes("@")) {
    return value.toLowerCase();
  }

  const compact = value.replace(/[\s().-]+/g, "");
  const digits = compact.replace(/\D/g, "");

  if (compact.startsWith("+") && digits) {
    return `+${digits}`;
  }

  if (compact.startsWith("00") && digits.length > 2) {
    return `+${digits.slice(2)}`;
  }

  if (digits.length === 9) {
    return `+420${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("420")) {
    return `+${digits}`;
  }

  return digits ? `+${digits}` : "";
}

export function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    active: user.active,
    department: user.department,
    position: user.position,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    modules: user.modules,
    allowedModules: user.allowedModules,
    deniedModules: user.deniedModules
  };
}

export function isProduction(env) {
  return env.APP_ENV === "production" || env.CF_PAGES_BRANCH === "main";
}

export function isMockEnabled(env) {
  return env.AUTH_MODE === "mock" && !isProduction(env);
}

export function cookieName(env) {
  return env.AUTH_COOKIE_NAME || "__Host-smart_odpady_session";
}

export function clearSessionCookie(env) {
  return `${cookieName(env)}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function userKey(user) {
  const email = normalizeIdentifier(user.email);
  return email || String(user.id || "").trim().toLowerCase();
}

function userIdKey(user) {
  return String(user?.id || "").trim().toLowerCase();
}

function mergeUser(baseUser, configuredUser) {
  const mergedUser = { ...baseUser };

  for (const [key, value] of Object.entries(configuredUser || {})) {
    if (value === undefined || value === null) {
      continue;
    }

    if (value === "" && mergedUser[key]) {
      continue;
    }

    mergedUser[key] = value;
  }

  return mergedUser;
}

function mergeConfiguredUsers(configuredUsers) {
  const mergedUsers = new Map();
  const idToKey = new Map();

  function upsertUser(user) {
    const key = userKey(user);
    const id = userIdKey(user);

    if (!key && !id) {
      return;
    }

    const existingKey = (key && mergedUsers.has(key) ? key : "") || (id ? idToKey.get(id) : "");

    if (existingKey) {
      const mergedUser = mergeUser(mergedUsers.get(existingKey), user);
      const nextKey = userKey(mergedUser) || existingKey;

      if (nextKey !== existingKey) {
        mergedUsers.delete(existingKey);
      }

      mergedUsers.set(nextKey, mergedUser);
      if (id) {
        idToKey.set(id, nextKey);
      }
      return;
    }

    const nextKey = key || id;
    mergedUsers.set(nextKey, user);
    if (id) {
      idToKey.set(id, nextKey);
    }
  }

  for (const user of DEFAULT_USERS) {
    upsertUser(user);
  }

  for (const user of CONTACT_USERS) {
    upsertUser(user);
  }

  for (const user of configuredUsers) {
    upsertUser(user);
  }

  return [...mergedUsers.values()];
}

export async function getUsers(env) {
  if (env.AUTH_USERS_JSON) {
    try {
      const users = JSON.parse(env.AUTH_USERS_JSON);
      if (Array.isArray(users)) {
        return mergeConfiguredUsers(users);
      }
    } catch (error) {
      console.error("auth.users_json_invalid", { message: error.message });
    }
  }

  return mergeConfiguredUsers([]);
}

export async function findAllowedUser(env, identifier) {
  const normalized = normalizeIdentifier(identifier);
  const users = await getUsers(env);
  const user = users.find((item) => {
    const email = normalizeIdentifier(item.email);
    const phone = normalizeIdentifier(item.phone);
    return email === normalized || (phone && phone === normalized);
  }) || null;

  return isUserActive(user) ? user : null;
}

export function checkRateLimit(key, limit = 8, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const bucket = rateBuckets.get(key) || [];
  const fresh = bucket.filter((timestamp) => now - timestamp < windowMs);

  if (fresh.length >= limit) {
    rateBuckets.set(key, fresh);
    return false;
  }

  fresh.push(now);
  rateBuckets.set(key, fresh);
  return true;
}

export function rateLimitKey(request, action, identifier) {
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown";
  return `${action}:${ip}:${normalizeIdentifier(identifier)}`;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlEncodeText(value) {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlDecodeText(value) {
  return decoder.decode(base64UrlToBytes(value));
}

async function hmac(env, value) {
  const secret = env.AUTH_SESSION_SECRET || (isMockEnabled(env) ? "dev-only-session-secret" : "");

  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is missing");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createSessionCookie(env, user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    role: user.role,
    iat: now,
    exp: now + Number(env.AUTH_SESSION_TTL_SECONDS || SESSION_TTL_SECONDS)
  };
  const encodedPayload = base64UrlEncodeText(JSON.stringify(payload));
  const signature = await hmac(env, encodedPayload);
  const maxAge = payload.exp - now;

  return `${cookieName(env)}=${encodedPayload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function verifySession(env, request) {
  const cookies = request.headers.get("Cookie") || "";
  const name = cookieName(env);
  const raw = cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

  if (!raw) {
    return null;
  }

  const [encodedPayload, signature] = raw.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = await hmac(env, encodedPayload);
  if (expected !== signature) {
    return null;
  }

  const payload = JSON.parse(base64UrlDecodeText(encodedPayload));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    return null;
  }

  return payload;
}

export async function currentUser(env, request) {
  const session = await verifySession(env, request);
  if (!session) {
    return null;
  }

  const users = await getUsers(env);
  const user = users.find((item) => item.id === session.sub);

  if (!isUserActive(user)) {
    return null;
  }

  return user;
}

export async function requireAdmin(env, request) {
  return requireUserPermission(env, request, "*", "*");
}

export async function requireUserPermission(env, request, moduleId, action = "view") {
  const user = await currentUser(env, request);

  if (!user) {
    return { user: null, response: json({ error: "Nepřihlášeno." }, 401) };
  }

  if (!hasPermission(user, moduleId, action)) {
    return { user, response: json({ error: "Nemáte oprávnění." }, 403) };
  }

  return { user, response: null };
}

function twilioConfig(env) {
  return {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    serviceSid: env.TWILIO_VERIFY_SERVICE_SID
  };
}

function twilioAuthHeader(env) {
  const { accountSid, authToken } = twilioConfig(env);
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

function otpChannel(identifier) {
  return normalizeIdentifier(identifier).includes("@") ? "email" : "sms";
}

export async function startTwilioVerification(env, identifier) {
  const { accountSid, authToken, serviceSid } = twilioConfig(env);

  if (!accountSid || !authToken || !serviceSid) {
    throw new Error("Twilio Verify is not configured");
  }

  const body = new URLSearchParams({
    To: normalizeIdentifier(identifier),
    Channel: otpChannel(identifier)
  });

  const response = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`, {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(env),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Twilio start failed: ${response.status}`);
  }
}

export async function verifyTwilioCode(env, identifier, code) {
  const { accountSid, authToken, serviceSid } = twilioConfig(env);

  if (!accountSid || !authToken || !serviceSid) {
    throw new Error("Twilio Verify is not configured");
  }

  const body = new URLSearchParams({
    To: normalizeIdentifier(identifier),
    Code: String(code || "").trim()
  });

  const response = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`, {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(env),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    return false;
  }

  const result = await response.json();
  return result.status === "approved";
}
