import { recordAiAction } from "./ai-action-log-store.js";
import { introAnnouncementFallbackForAi } from "./ai-people-summary.js";

const AI_ACTION_LOG_DB_BINDING = "SMART_ODPADY_DB";
const ZAORALOVA_ANNOUNCEMENT_KEY = "sarlota_zaoralova_ctp_2026_06";
const ZAORALOVA_ANNOUNCEMENT_END_DATE = "2026-06-30";
const ZAORALOVA_ANNOUNCEMENT_MAX_SESSIONS = 3;
const ZAORALOVA_ANNOUNCEMENT_TEXT = "Důležité provozní upozornění: v termínu od 22. 6. do 6. 7. bude částečně omezen provoz v ulici Zaoralova z důvodu výkopových prací. Některý den zřejmě nebude možné projet. Bude probíhat přepojení horkovodů. Informace je od CTP.";

function cleanString(value) {
  return String(value ?? "").trim();
}

function pragueDateString(date = new Date()) {
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
    // Announcement gating must not block voice session creation.
  }

  return date.toISOString().slice(0, 10);
}

function emptyAnnouncementVariables(currentUser) {
  return {
    intro_announcement: introAnnouncementFallbackForAi(currentUser),
    intro_announcement_enabled: "ne",
    intro_announcement_key: ZAORALOVA_ANNOUNCEMENT_KEY,
    intro_announcement_until: ZAORALOVA_ANNOUNCEMENT_END_DATE,
    intro_announcement_limit: String(ZAORALOVA_ANNOUNCEMENT_MAX_SESSIONS),
    intro_announcement_remaining_after_this: "0"
  };
}

async function announcementSessionCount(env, userId) {
  const db = env?.[AI_ACTION_LOG_DB_BINDING] || null;

  if (!db) {
    return null;
  }

  const row = await db
    .prepare(`
      SELECT COUNT(*) AS total
      FROM ai_action_logs
      WHERE user_id = ?
        AND assistant_id = 'sarlota'
        AND action_type = 'intro_announcement'
        AND tool_name = ?
        AND status = 'ok'
    `)
    .bind(userId, ZAORALOVA_ANNOUNCEMENT_KEY)
    .first();

  const total = Number(row?.total || 0);
  return Number.isFinite(total) ? total : 0;
}

export async function sarlotaIntroAnnouncementForAi(env, currentUser, assistant) {
  const variables = emptyAnnouncementVariables(currentUser);
  const assistantId = cleanString(assistant?.id).toLowerCase();
  const userId = cleanString(currentUser?.id);
  const today = pragueDateString();

  if (assistantId !== "sarlota" || !userId || today > ZAORALOVA_ANNOUNCEMENT_END_DATE) {
    return { enabled: false, variables };
  }

  try {
    const sessionCount = await announcementSessionCount(env, userId);

    if (sessionCount === null || sessionCount >= ZAORALOVA_ANNOUNCEMENT_MAX_SESSIONS) {
      return { enabled: false, variables };
    }

    const remainingAfterThis = Math.max(0, ZAORALOVA_ANNOUNCEMENT_MAX_SESSIONS - sessionCount - 1);

    return {
      enabled: true,
      key: ZAORALOVA_ANNOUNCEMENT_KEY,
      remainingAfterThis,
      variables: {
        ...variables,
        intro_announcement: ZAORALOVA_ANNOUNCEMENT_TEXT,
        intro_announcement_enabled: "ano",
        intro_announcement_remaining_after_this: String(remainingAfterThis)
      }
    };
  } catch (error) {
    console.error("ai_intro_announcement.count_failed", { message: error.message });
    return { enabled: false, variables };
  }
}

export async function recordSarlotaIntroAnnouncement(env, currentUser, assistant, announcement) {
  if (!announcement?.enabled) {
    return { logged: false, reason: "announcement_disabled" };
  }

  return recordAiAction(env, currentUser, {
    assistantId: "sarlota",
    assistantName: cleanString(assistant?.name || "Šarlota"),
    actionType: "intro_announcement",
    toolName: announcement.key || ZAORALOVA_ANNOUNCEMENT_KEY,
    input: {
      maxSessionsPerUser: ZAORALOVA_ANNOUNCEMENT_MAX_SESSIONS,
      validUntil: ZAORALOVA_ANNOUNCEMENT_END_DATE
    },
    result: {
      spoken: true,
      remainingAfterThis: announcement.remainingAfterThis ?? 0
    },
    status: "ok"
  });
}
