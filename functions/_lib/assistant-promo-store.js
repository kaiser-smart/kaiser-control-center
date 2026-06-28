import { recordAiAction } from "./ai-action-log-store.js";

const ASSISTANT_PROMO_DB_BINDING = "SMART_ODPADY_DB";
const SARLOTA_PROMO_KEY = "sarlota_intro_2026_06";
const SARLOTA_PROMO_END_DATE = "2026-06-30";
const SARLOTA_PROMO_VIDEO_URL = "/avatars/sarlota-intro.mp4";
const SARLOTA_PROMO_FALLBACK_IMAGE_URL = "/avatars/sarlota-microphone.png";
const SARLOTA_PROMO_ACTIONS = new Set(["shown", "accepted", "declined"]);

export class AssistantPromoStoreError extends Error {
  constructor(message, status = 400, code = "assistant_promo_store_error") {
    super(message);
    this.name = "AssistantPromoStoreError";
    this.status = status;
    this.code = code;
  }
}

function promoDatabase(env, required = false) {
  const db = env?.[ASSISTANT_PROMO_DB_BINDING] || null;

  if (!db && required) {
    throw new AssistantPromoStoreError(
      "Databáze promo videa není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "assistant_promo_database_missing"
    );
  }

  return db;
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function pragueDateString(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("cs-CZ", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const valueFor = (type) => parts.find((part) => part.type === type)?.value || "";
    const year = valueFor("year");
    const month = valueFor("month").padStart(2, "0");
    const day = valueFor("day").padStart(2, "0");

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch (error) {
    // Promo gating falls back to UTC date if Intl timezone support is unavailable.
  }

  return date.toISOString().slice(0, 10);
}

function isSarlotaPromoActive(dateString = pragueDateString()) {
  return dateString <= SARLOTA_PROMO_END_DATE;
}

function promoPayload({ promoDate, existing = null } = {}) {
  const active = isSarlotaPromoActive(promoDate);

  return {
    promoKey: SARLOTA_PROMO_KEY,
    promoDate,
    validUntil: SARLOTA_PROMO_END_DATE,
    show: active,
    action: cleanString(existing?.status),
    videoUrl: SARLOTA_PROMO_VIDEO_URL,
    fallbackImageUrl: SARLOTA_PROMO_FALLBACK_IMAGE_URL,
    apiStatus: "ready"
  };
}

async function todayPromoRecord(env, userId, promoDate) {
  const db = promoDatabase(env, true);
  const toolName = `${SARLOTA_PROMO_KEY}:${promoDate}`;

  try {
    return await db
      .prepare(`
        SELECT
          id,
          user_id,
          user_name,
          assistant_id,
          assistant_name,
          action_type,
          tool_name,
          status,
          created_at
        FROM ai_action_logs
        WHERE user_id = ?
          AND assistant_id = 'sarlota'
          AND action_type = 'assistant_promo'
          AND tool_name = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .bind(userId, toolName)
      .first();
  } catch {
    throw new AssistantPromoStoreError(
      "Úložiště promo videa není připravené.",
      503,
      "assistant_promo_table_missing"
    );
  }
}

export async function getSarlotaPromoState(env, currentUser) {
  const userId = cleanString(currentUser?.id);

  if (!userId) {
    throw new AssistantPromoStoreError("Nepřihlášeno.", 401, "assistant_promo_unauthorized");
  }

  const promoDate = pragueDateString();
  if (!isSarlotaPromoActive(promoDate)) {
    return promoPayload({ promoDate });
  }

  const existing = await todayPromoRecord(env, userId, promoDate);
  return promoPayload({ promoDate, existing });
}

export async function recordSarlotaPromoAction(env, currentUser, input = {}) {
  promoDatabase(env, true);
  const userId = cleanString(currentUser?.id);
  const action = cleanString(input.action).toLowerCase();

  if (!userId) {
    throw new AssistantPromoStoreError("Nepřihlášeno.", 401, "assistant_promo_unauthorized");
  }

  if (!SARLOTA_PROMO_ACTIONS.has(action)) {
    throw new AssistantPromoStoreError("Neplatná akce promo videa.", 400, "assistant_promo_action_invalid");
  }

  const promoDate = pragueDateString();
  if (!isSarlotaPromoActive(promoDate)) {
    return promoPayload({ promoDate });
  }

  const logResult = await recordAiAction(env, currentUser, {
    assistantId: "sarlota",
    assistantName: "Šarlota",
    actionType: "assistant_promo",
    toolName: `${SARLOTA_PROMO_KEY}:${promoDate}`,
    input: {
      id: randomId(),
      promoKey: SARLOTA_PROMO_KEY,
      promoDate,
      action
    },
    result: {
      videoUrl: SARLOTA_PROMO_VIDEO_URL,
      validUntil: SARLOTA_PROMO_END_DATE
    },
    status: action
  });

  if (!logResult.logged) {
    throw new AssistantPromoStoreError(
      "Volbu promo videa se nepodařilo uložit.",
      503,
      "assistant_promo_write_failed"
    );
  }

  const existing = await todayPromoRecord(env, userId, promoDate);
  return promoPayload({ promoDate, existing });
}
