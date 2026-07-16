import { json } from "../../../_lib/auth.js";
import {
  CustomerMessageConsentStoreError,
  recordCustomerRcsConsent
} from "../../../_lib/customer-message-consent-store.js";
import { normalizeCustomerPhone } from "../../../_lib/customer-messaging-service.js";

const ALLOWED_ORIGINS = new Set([
  "https://www.kaiserservis.cz",
  "https://kaiserservis.cz"
]);

export const KAISER_RCS_CONSENT = Object.freeze({
  version: "kaiser-operational-rcs-v1-2026-07-16",
  text: "Souhlasím se zasíláním provozních a transakčních RCS zpráv od Kaiser servis k mému požadavku, objednávce nebo poskytované službě. Souhlas mohu kdykoli odvolat odpovědí STOP.",
  termsUrl: "https://www.kaiserservis.cz/rcs-podminky-komunikace/",
  privacyUrl: "https://www.kaiserservis.cz/rcs-zasady-ochrany-soukromi/",
  sourceUrl: "https://www.kaiserservis.cz/rcs-souhlas/"
});

const rateBuckets = globalThis.__KAISER_RCS_OPT_IN_RATE_BUCKETS__ || new Map();
globalThis.__KAISER_RCS_OPT_IN_RATE_BUCKETS__ = rateBuckets;

function originOf(request) {
  return String(request.headers.get("Origin") || "").trim();
}

function corsHeaders(origin) {
  if (!ALLOWED_ORIGINS.has(origin)) return { "Vary": "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function response(data, status, origin) {
  return json(data, status, corsHeaders(origin));
}

function clientKey(request) {
  return String(request.headers.get("CF-Connecting-IP") || "unknown").trim();
}

function allowRequest(request, limit = 12, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const key = clientKey(request);
  const current = rateBuckets.get(key) || [];
  const fresh = current.filter((timestamp) => now - timestamp < windowMs);
  if (fresh.length >= limit) {
    rateBuckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  rateBuckets.set(key, fresh);
  return true;
}

function errorResponse(error, origin) {
  if (error instanceof CustomerMessageConsentStoreError) {
    return response({ error: error.message, code: error.code }, error.status, origin);
  }

  console.error("customer_message_consent.api_failed", { message: String(error?.message || "") });
  return response({ error: "Souhlas se teď nepodařilo bezpečně uložit." }, 500, origin);
}

export async function onRequestOptions({ request }) {
  const origin = originOf(request);
  if (!ALLOWED_ORIGINS.has(origin)) {
    return response({ error: "Nepovolený původ požadavku." }, 403, origin);
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestPost({ request, env }) {
  const origin = originOf(request);
  if (!ALLOWED_ORIGINS.has(origin)) {
    return response({ error: "Nepovolený původ požadavku." }, 403, origin);
  }

  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > 4096) {
    return response({ error: "Požadavek je příliš velký." }, 413, origin);
  }

  if (!allowRequest(request)) {
    return response({ error: "Příliš mnoho pokusů. Zkuste to prosím za několik minut." }, 429, origin);
  }

  try {
    const body = await request.json().catch(() => ({}));

    // Skryté pole pro roboty: odpověď zůstane neutrální, nic se neuloží.
    if (String(body.website || "").trim()) {
      return response({ message: "Souhlas byl přijat." }, 200, origin);
    }

    if (body.operationalRcsConsent !== true) {
      return response({ error: "Pro uložení je nutný samostatný souhlas s provozní RCS komunikací." }, 400, origin);
    }

    const phone = normalizeCustomerPhone(body.phone);
    if (!phone || !/^\+420\d{9}$/.test(phone)) {
      return response({ error: "Zadejte platné české telefonní číslo." }, 400, origin);
    }

    const consent = await recordCustomerRcsConsent(env, {
      phone,
      consentVersion: KAISER_RCS_CONSENT.version,
      consentText: KAISER_RCS_CONSENT.text,
      termsUrl: KAISER_RCS_CONSENT.termsUrl,
      privacyUrl: KAISER_RCS_CONSENT.privacyUrl,
      sourceUrl: KAISER_RCS_CONSENT.sourceUrl,
      sourceOrigin: origin,
      metadata: {
        channel: "rcs",
        purpose: "operational_transactional",
        noMessageSent: true
      }
    });

    return response({
      message: consent.duplicate
        ? "Tento souhlas už je bezpečně uložený."
        : "Souhlas s provozní RCS komunikací byl bezpečně uložen.",
      consentId: consent.id,
      duplicate: consent.duplicate,
      messageSent: false
    }, consent.duplicate ? 200 : 201, origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
}

export const __test = { ALLOWED_ORIGINS, allowRequest, corsHeaders };
