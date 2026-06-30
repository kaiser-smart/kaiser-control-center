import { recordAiAction } from "./ai-action-log-store.js";
import { createAbsenceRequestRecord } from "./absence-requests-store.js";
import { getUsers } from "./auth.js";
import { sarlotaHumanTouchContext } from "./sarlota-human-touch.js";
import { hasPermission } from "../../src/permissions.js";
import { sarlotaSystemPrompt } from "../../src/sarlota/sarlotaSystemPrompt.js";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const ASSISTANT_ID = "sarlota";
const ASSISTANT_NAME = "Šarlota";
const MAX_TEXT_LENGTH = 1800;
const INTENTS = new Set([
  "order_status",
  "tracking",
  "sms_link",
  "handoff_jarka",
  "product_advice",
  "complaint_return",
  "absence_request",
  "absence_vacation_request",
  "call_log",
  "business_hours",
  "general",
  "unsupported"
]);

const ABSENCE_TYPE_LABELS = {
  vacation: "dovolenou",
  sick: "nemoc",
  doctor: "lékaře",
  care: "OČR",
  compensatory_leave: "náhradní volno",
  unpaid_leave: "neplacené volno",
  other: "jinou nepřítomnost"
};

const ABSENCE_TYPE_OPTIONS_TEXT = "Dovolená, nemoc, OČR, lékař, náhradní volno, neplacené volno, nebo jiná nepřítomnost.";

const ABSENCE_TYPE_ALIASES = {
  dovolena: "vacation",
  dovolenou: "vacation",
  vacation: "vacation",
  leave: "vacation",
  holiday: "vacation",
  nemoc: "sick",
  nemocny: "sick",
  nemocna: "sick",
  sick: "sick",
  lekar: "doctor",
  lekari: "doctor",
  doktora: "doctor",
  doktor: "doctor",
  doctor: "doctor",
  ocr: "care",
  osetrovani: "care",
  care: "care",
  nahradni_volno: "compensatory_leave",
  nahradni: "compensatory_leave",
  compensatory_leave: "compensatory_leave",
  neplacene_volno: "unpaid_leave",
  neplacene: "unpaid_leave",
  unpaid_leave: "unpaid_leave",
  jina_nepritomnost: "other",
  jina_absence: "other",
  ostatni: "other",
  other: "other"
};

const CZECH_MONTHS = {
  leden: 1,
  ledna: 1,
  unor: 2,
  unora: 2,
  brezen: 3,
  brezna: 3,
  duben: 4,
  dubna: 4,
  kveten: 5,
  kvetna: 5,
  cerven: 6,
  cervna: 6,
  cervenec: 7,
  cervence: 7,
  srpen: 8,
  srpna: 8,
  zari: 9,
  rijen: 10,
  rijna: 10,
  listopad: 11,
  listopadu: 11,
  prosinec: 12,
  prosince: 12
};

const CZECH_HOUR_WORDS = {
  pulnoc: "00:00",
  nula: "00:00",
  jednu: "01:00",
  jedne: "01:00",
  jedny: "01:00",
  dva: "02:00",
  dvou: "02:00",
  dve: "02:00",
  tri: "03:00",
  ctyri: "04:00",
  pet: "05:00",
  sest: "06:00",
  sedm: "07:00",
  osm: "08:00",
  devet: "09:00",
  deset: "10:00",
  deseti: "10:00",
  desiti: "10:00",
  jedenact: "11:00",
  jedenacti: "11:00",
  dvanact: "12:00",
  dvanacti: "12:00",
  trinact: "13:00",
  trinacti: "13:00",
  ctrnact: "14:00",
  ctrnacti: "14:00",
  patnact: "15:00",
  patnacti: "15:00",
  sestnact: "16:00",
  sestnacti: "16:00",
  sedmnact: "17:00",
  sedmnacti: "17:00",
  osmnact: "18:00",
  osmnacti: "18:00"
};

export class VoiceSarlotaError extends Error {
  constructor(message, status = 400, code = "voice_sarlota_error") {
    super(message);
    this.name = "VoiceSarlotaError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function truncate(value, max = MAX_TEXT_LENGTH) {
  const text = cleanString(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trim()}…` : text;
}

function normalizeKey(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseJson(value, fallback = {}) {
  if (value && typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(cleanString(value));
  } catch {
    return fallback;
  }
}

function boolValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeKey(value);
  return ["true", "1", "yes", "ano", "souhlas", "souhlasim", "confirmed"].includes(normalized);
}

function booleanValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeKey(value);
  if (["true", "1", "yes", "ano", "souhlas", "souhlasim", "confirmed"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "ne", "nesouhlas", "nesouhlasim", "cancelled", "canceled"].includes(normalized)) {
    return false;
  }

  return null;
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstNonEmpty(...values) {
  return values.map(cleanString).find(Boolean) || "";
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && cleanString(value) !== "");
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entryValue]) => {
      if (Array.isArray(entryValue)) {
        return entryValue.length > 0;
      }

      return entryValue !== undefined && entryValue !== null && entryValue !== "";
    })
  );
}

function openAiConfig(env) {
  const apiKey = cleanString(env.OPENAI_API_KEY);
  const model = cleanString(env.VOICE_ASSISTANT_OPENAI_MODEL || env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL);

  if (!apiKey) {
    throw new VoiceSarlotaError(
      "Šarlota není napojená na OpenAI: chybí server-side OPENAI_API_KEY.",
      503,
      "voice_sarlota_missing_openai_key"
    );
  }

  return { apiKey, model };
}

function extractNestedValue(payload, keys) {
  const queue = [payload];
  const normalizedKeys = new Set(keys.map(normalizeKey));
  const seen = new Set();

  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== "object" || seen.has(item)) {
      continue;
    }
    seen.add(item);

    for (const [key, value] of Object.entries(item)) {
      if (normalizedKeys.has(normalizeKey(key)) && cleanString(value)) {
        return cleanString(value);
      }

      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return "";
}

function nestedDefinedValue(payload, keys) {
  const queue = [payload];
  const normalizedKeys = new Set(keys.map(normalizeKey));
  const seen = new Set();

  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== "object" || seen.has(item)) {
      continue;
    }
    seen.add(item);

    for (const [key, value] of Object.entries(item)) {
      if (normalizedKeys.has(normalizeKey(key)) && value !== undefined && value !== null && cleanString(value) !== "") {
        return value;
      }

      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return undefined;
}

function pragueIsoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addIsoDays(isoDate, amount) {
  const match = cleanString(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return "";
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + amount, 12));
  return date.toISOString().slice(0, 10);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(cleanString(value));
}

function czechDateFromMatch(day, month, year, baseIso) {
  const baseYear = Number(baseIso.slice(0, 4));
  let parsedYear = year ? Number(year) : baseYear;
  if (parsedYear < 100) {
    parsedYear += 2000;
  }

  const date = new Date(Date.UTC(parsedYear, Number(month) - 1, Number(day), 12));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== parsedYear ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return "";
  }

  let iso = date.toISOString().slice(0, 10);
  if (!year && iso < baseIso) {
    iso = new Date(Date.UTC(parsedYear + 1, Number(month) - 1, Number(day), 12)).toISOString().slice(0, 10);
  }

  return iso;
}

function aliasKey(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function czechMonthNumber(value) {
  return CZECH_MONTHS[aliasKey(value)] || 0;
}

function czechMonthDate(day, monthName, year, baseIso) {
  const month = czechMonthNumber(monthName);
  if (!month) {
    return "";
  }

  return czechDateFromMatch(day, month, year, baseIso);
}

function explicitCzechDateFromText(raw, baseIso) {
  const normalized = normalizeKey(raw);
  const monthNames = Object.keys(CZECH_MONTHS).join("|");
  const wordMonth = normalized.match(new RegExp(`\\b(\\d{1,2})\\.?\\s+(${monthNames})(?:\\s+(\\d{2,4}))?\\b`));
  if (wordMonth) {
    return czechMonthDate(wordMonth[1], wordMonth[2], wordMonth[3], baseIso);
  }

  return "";
}

function dateRangeFromNaturalText(value, baseIso = pragueIsoDate()) {
  const raw = cleanString(value);
  const normalized = normalizeKey(raw);
  const range = { dateFrom: "", dateTo: "" };

  if (!raw) {
    return range;
  }

  const monthNames = Object.keys(CZECH_MONTHS).join("|");
  const sameMonthRange = normalized.match(new RegExp(`\\b(?:od\\s*)?(\\d{1,2})\\.?\\s*(?:az|do|-)\\s*(\\d{1,2})\\.?\\s+(${monthNames})(?:\\s+(\\d{2,4}))?\\b`));
  if (sameMonthRange) {
    const dateFrom = czechMonthDate(sameMonthRange[1], sameMonthRange[3], sameMonthRange[4], baseIso);
    const dateTo = czechMonthDate(sameMonthRange[2], sameMonthRange[3], sameMonthRange[4], baseIso);
    if (dateFrom || dateTo) {
      return { dateFrom, dateTo: dateTo || dateFrom };
    }
  }

  const fromToMatch = normalized.match(/\bod\s+(.+?)\s+(?:do|az)\s+(.+?)(?:\s|$)/);
  if (fromToMatch) {
    const dateFrom = dateFromNaturalText(fromToMatch[1], baseIso);
    let dateTo = dateFromNaturalText(fromToMatch[2], baseIso);
    while (dateFrom && dateTo && dateTo < dateFrom) {
      dateTo = addIsoDays(dateTo, 7);
    }
    if (dateFrom || dateTo) {
      return { dateFrom, dateTo: dateTo || dateFrom };
    }
  }

  const explicitDate = explicitCzechDateFromText(raw, baseIso);
  const singleDate = explicitDate || dateFromNaturalText(raw, baseIso);
  return { dateFrom: singleDate, dateTo: singleDate };
}

function weekdayIsoFromText(normalizedText, baseIso) {
  const weekdays = [
    [["pondeli"], 1],
    [["utery"], 2],
    [["streda", "stredu", "stredy"], 3],
    [["ctvrtek", "ctvrtka"], 4],
    [["patek", "patku"], 5],
    [["sobota", "sobotu"], 6],
    [["nedele", "nedeli"], 7]
  ];
  const currentDate = new Date(`${baseIso}T12:00:00Z`);
  const currentWeekday = currentDate.getUTCDay() || 7;

  for (const [words, weekday] of weekdays) {
    if (!words.some((word) => new RegExp(`\\b${word}\\b`).test(normalizedText))) {
      continue;
    }

    let offset = weekday - currentWeekday;
    if (offset <= 0) {
      offset += 7;
    }
    return addIsoDays(baseIso, offset);
  }

  return "";
}

function dateFromNaturalText(value, baseIso = pragueIsoDate()) {
  const raw = cleanString(value);
  const normalized = normalizeKey(raw);

  if (!raw) {
    return "";
  }

  if (isIsoDate(raw)) {
    return raw;
  }

  if (/\bpozitri\b/.test(normalized)) {
    return addIsoDays(baseIso, 2);
  }

  if (/\bzitra\b/.test(normalized)) {
    return addIsoDays(baseIso, 1);
  }

  if (/\bdnes\b/.test(normalized)) {
    return baseIso;
  }

  const isoMatch = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const czechDateMatch = raw.match(/\b(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{2,4}))?/);
  if (czechDateMatch) {
    return czechDateFromMatch(czechDateMatch[1], czechDateMatch[2], czechDateMatch[3], baseIso);
  }

  const explicitDate = explicitCzechDateFromText(raw, baseIso);
  if (explicitDate) {
    return explicitDate;
  }

  return weekdayIsoFromText(normalized, baseIso);
}

function formatCzechDate(isoDate) {
  const match = cleanString(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return cleanString(isoDate) || "neuvedeno";
  }

  return `${Number(match[3])}. ${Number(match[2])}. ${match[1]}`;
}

function absenceParameters(payload = {}) {
  return payload.parameters && typeof payload.parameters === "object" ? payload.parameters : {};
}

function absenceContext(payload = {}) {
  return payload.context && typeof payload.context === "object" ? payload.context : {};
}

function requestedAbsenceType(payload = {}) {
  const parameters = absenceParameters(payload);
  const context = absenceContext(payload);
  const raw = firstNonEmpty(
    parameters.absenceType,
    parameters.absence_type,
    parameters.type,
    context.absenceType,
    context.absence_type,
    context.type,
    payload.absenceType,
    payload.absence_type,
    payload.type,
    extractNestedValue(payload, ["absenceType", "absence_type", "type"])
  );
  const normalized = aliasKey(raw);
  const type = ABSENCE_TYPE_ALIASES[normalized] || normalized;
  return ABSENCE_TYPE_LABELS[type] ? type : "";
}

function inferAbsenceTypeFromText(speechText) {
  const normalized = normalizeKey(speechText);

  if (/\b(neplacene\s+volno|neplacenou|neplacene)\b/.test(normalized)) {
    return "unpaid_leave";
  }

  if (/\b(nahradni\s+volno|nahradni)\b/.test(normalized)) {
    return "compensatory_leave";
  }

  if (/\b(ocr|osetrovani)\b/.test(normalized)) {
    return "care";
  }

  if (/\b(lekar|lekare|lekari|doktora|doktor)\b/.test(normalized)) {
    return "doctor";
  }

  if (/\b(nemoc|nemocny|nemocna|marod)\b/.test(normalized)) {
    return "sick";
  }

  if (/\b(dovolen)\w*/.test(normalized)) {
    return "vacation";
  }

  if (/\b(jina\s+nepritomnost|jinou\s+nepritomnost|jina\s+absence|jinou\s+absenci|ostatni)\b/.test(normalized)) {
    return "other";
  }

  return "";
}

function absenceDateValue(payload, keys) {
  const parameters = absenceParameters(payload);
  const context = absenceContext(payload);

  return firstNonEmpty(
    ...keys.flatMap((key) => [parameters[key], context[key], payload[key]]),
    extractNestedValue(payload, keys)
  );
}

function absenceDateFromPayload(payload, speechText, baseIso = pragueIsoDate()) {
  const explicitValue = dateFromNaturalText(
    firstNonEmpty(
      absenceDateValue(payload, ["dateFrom", "date_from", "absenceDate", "absence_date", "date", "startDate", "start_date"]),
      ""
    ),
    baseIso
  );

  return explicitValue || dateRangeFromNaturalText(speechText, baseIso).dateFrom;
}

function absenceDateToFromPayload(payload, speechText, dateFrom, baseIso = pragueIsoDate()) {
  const explicitValue = dateFromNaturalText(
    firstNonEmpty(
      absenceDateValue(payload, ["dateTo", "date_to", "endDate", "end_date"]),
      ""
    ),
    baseIso
  );
  const range = dateRangeFromNaturalText(speechText, baseIso);
  return explicitValue || range.dateTo || dateFrom || range.dateFrom;
}

function timeFromValue(value) {
  const raw = cleanString(value);
  const normalized = normalizeKey(raw);

  if (!raw) {
    return "";
  }

  const colonMatch = raw.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (colonMatch) {
    const hours = Number(colonMatch[1]);
    const minutes = Number(colonMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  const hourMatch = raw.match(/\b(\d{1,2})\b/);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    if (hours >= 0 && hours <= 23) {
      return `${String(hours).padStart(2, "0")}:00`;
    }
  }

  return CZECH_HOUR_WORDS[aliasKey(normalized)] || "";
}

function absenceTimeValue(payload, keys) {
  const parameters = absenceParameters(payload);
  const context = absenceContext(payload);

  return firstNonEmpty(
    ...keys.flatMap((key) => [parameters[key], context[key], payload[key]]),
    extractNestedValue(payload, keys)
  );
}

function absenceTimeRangeFromPayload(payload, speechText) {
  const startExplicit = timeFromValue(absenceTimeValue(payload, ["startTime", "start_time", "timeFrom", "time_from"]));
  const endExplicit = timeFromValue(absenceTimeValue(payload, ["endTime", "end_time", "timeTo", "time_to"]));

  if (startExplicit || endExplicit) {
    return { startTime: startExplicit, endTime: endExplicit };
  }

  const normalized = normalizeKey(speechText);
  const rangeMatch = normalized.match(/\bod\s+(.+?)\s+do\s+(.+?)(?:\s|$)/);
  if (!rangeMatch) {
    return { startTime: "", endTime: "" };
  }

  return {
    startTime: timeFromValue(rangeMatch[1]),
    endTime: timeFromValue(rangeMatch[2])
  };
}

function absenceDayPart(payload, speechText) {
  const parameters = absenceParameters(payload);
  const context = absenceContext(payload);
  const halfDayRaw = firstDefined(
    parameters.halfDay,
    parameters.half_day,
    parameters.halfDayFrom,
    parameters.half_day_from,
    context.halfDay,
    context.half_day,
    payload.halfDay,
    payload.half_day,
    nestedDefinedValue(payload, ["halfDay", "half_day"])
  );
  const halfDay = booleanValue(halfDayRaw);

  if (halfDay !== null) {
    return halfDay ? "half_day" : "full_day";
  }

  const raw = firstNonEmpty(
    parameters.dayPart,
    parameters.day_part,
    parameters.duration,
    parameters.range,
    context.dayPart,
    context.day_part,
    context.duration,
    payload.dayPart,
    payload.day_part,
    payload.duration
  );
  const normalized = normalizeKey(`${raw} ${speechText}`);

  if (/\b(pulden|pul dne|puldne|polo den|dopoledne|odpoledne|half|half_day)\b/.test(normalized)) {
    return "half_day";
  }

  if (/\b(cely den|celou smenu|cela smena|celodenni|full|full_day|all_day)\b/.test(normalized)) {
    return "full_day";
  }

  return "";
}

function absenceConfirmation(payload, speechText) {
  const parameters = absenceParameters(payload);
  const context = absenceContext(payload);
  const raw = firstDefined(
    payload.confirmed,
    payload.confirm,
    payload.confirmation?.confirmed,
    payload.confirmation?.value,
    parameters.confirmed,
    parameters.confirm,
    parameters.writeConfirmed,
    parameters.write_confirmed,
    context.confirmed,
    context.confirm,
    nestedDefinedValue(payload, ["confirmed", "writeConfirmed", "write_confirmed"])
  );
  const explicit = booleanValue(raw);

  if (explicit === true) {
    return "confirmed";
  }

  if (explicit === false) {
    return "";
  }

  const normalized = normalizeKey(speechText);
  if (/\b(ne|nezapisuj|neukladej|zrus|storno)\b/.test(normalized)) {
    return "rejected";
  }

  if (
    /^\s*(ano|jo|potvrzuji|souhlasim|uloz|zapis)\s*(to)?[\s.!?]*$/.test(normalized) ||
    /\b(ano|jo|souhlasim|potvrzuji)\b.*\b(zapis|uloz|vytvor|odešli|odesli|posli)\b/.test(normalized) ||
    /\b(zapis|uloz|vytvor)\s+to\b/.test(normalized)
  ) {
    return "confirmed";
  }

  return "";
}

function absenceNote(payload) {
  const parameters = absenceParameters(payload);
  const context = absenceContext(payload);

  return truncate(firstNonEmpty(
    parameters.note,
    parameters.reason,
    parameters.comment,
    context.note,
    context.reason,
    payload.note,
    payload.reason,
    payload.comment,
    extractNestedValue(payload, ["absenceNote", "absence_note", "note", "reason", "comment"])
  ), 360);
}

function requestedAbsenceEmployeeId(payload = {}) {
  const parameters = absenceParameters(payload);
  const context = absenceContext(payload);

  return firstNonEmpty(
    parameters.employeeId,
    parameters.employee_id,
    parameters.userId,
    parameters.user_id,
    context.employeeId,
    context.employee_id,
    payload.employeeId,
    payload.employee_id,
    extractNestedValue(payload, ["employeeId", "employee_id"])
  );
}

function trimEmployeeQuery(value) {
  return cleanString(value)
    .replace(/[,.!?]+$/g, "")
    .replace(/\b(od|do|na|dnes|zitra|pozitri|pondeli|utery|streda|ctvrtek|patek|sobota|nedele|dovolenou|nemoc|ocr|lekare|volno|nepritomnost)\b.*$/i, "")
    .trim();
}

function employeeQueryFromSpeech(speechText) {
  const raw = cleanString(speechText);

  const explicit = raw.match(/\b(?:pro|zaměstnanci|zamestnanci)\s+([A-Za-zÀ-ž]+(?:\s+[A-Za-zÀ-ž]+)?)/i);
  if (explicit) {
    return trimEmployeeQuery(explicit[1]);
  }

  const dative = raw.match(/\b(?:dej|zadej|zapiš|zapis|nahlaš|nahlas)\s+([A-Za-zÀ-ž]+ovi|[A-Za-zÀ-ž]+ové|[A-Za-zÀ-ž]+oví)\b/i);
  if (dative) {
    return trimEmployeeQuery(dative[1]);
  }

  return "";
}

function requestedAbsenceEmployeeQuery(payload = {}, speechText = "") {
  const parameters = absenceParameters(payload);
  const context = absenceContext(payload);

  return firstNonEmpty(
    parameters.employeeName,
    parameters.employee_name,
    parameters.employee,
    parameters.name,
    parameters.query,
    context.employeeName,
    context.employee_name,
    context.employee,
    payload.employeeName,
    payload.employee_name,
    payload.employee,
    extractNestedValue(payload, ["employeeName", "employee_name", "employee", "employeeQuery", "employee_query"]),
    employeeQueryFromSpeech(speechText)
  );
}

function stripCzechNameEnding(value) {
  const normalized = aliasKey(value);
  return normalized
    .replace(/ovi$/u, "")
    .replace(/ove$/u, "")
    .replace(/ovou$/u, "")
    .replace(/emu$/u, "")
    .replace(/ho$/u, "")
    .replace(/a$/u, "");
}

function userSearchText(user) {
  return [
    user?.id,
    user?.name,
    user?.fullName,
    user?.email
  ].map(aliasKey).filter(Boolean).join(" ");
}

function employeeMatchesQuery(user, query) {
  const normalizedQuery = aliasKey(query);
  const strippedQuery = stripCzechNameEnding(query);
  const searchText = userSearchText(user);

  if (!normalizedQuery && !strippedQuery) {
    return false;
  }

  return Boolean(
    (normalizedQuery && searchText.includes(normalizedQuery)) ||
    (strippedQuery && searchText.split(/\s+/).some((token) => token.startsWith(strippedQuery)))
  );
}

function resolveAbsenceEmployee(users, currentUser, draft, speechText) {
  const employeeId = cleanString(draft.employeeId);
  const employeeQuery = cleanString(draft.employeeQuery);

  if (employeeId) {
    const employee = users.find((item) => cleanString(item.id).toLowerCase() === employeeId.toLowerCase());
    return employee
      ? { status: "resolved", employee }
      : { status: "not_found", message: "Zaměstnance jsem nenašla. Řekni prosím celé jméno." };
  }

  if (employeeQuery) {
    const matches = users.filter((item) => employeeMatchesQuery(item, employeeQuery));

    if (matches.length === 1) {
      return { status: "resolved", employee: matches[0] };
    }

    if (matches.length > 1) {
      return {
        status: "ambiguous",
        message: `Našla jsem víc podobných lidí: ${matches.slice(0, 4).map((item) => cleanString(item.name || item.email || item.id)).join(", ")}. Koho přesně mám použít?`
      };
    }

    return { status: "not_found", message: "Zaměstnance jsem nenašla. Řekni prosím celé jméno." };
  }

  const normalizedSpeech = normalizeKey(speechText);
  if (/\b(pro|novakovi|horakovi|zamestnanci|ridici)\b/.test(normalizedSpeech)) {
    return { status: "needs_input", message: "Pro koho to mám zapsat?" };
  }

  return { status: "resolved", employee: currentUser };
}

function isAbsenceRequestText(speechText) {
  const normalized = normalizeKey(speechText);

  if (!/\b(dovolen|nemoc|ocr|lekar|lekari|doktor|nahradni\s+volno|neplacene\s+volno|nepritomnost|absence|volno)\w*/.test(normalized)) {
    return false;
  }

  if (/\b(kolik|zustatek|zbyva|prehled|stav|cerpani|kalendar)\b/.test(normalized)) {
    return false;
  }

  return /\b(chci|potrebuju|potreboval|vezmu|beru|naplanovat|zadat|zapis|vytvor|nahlas|cerpat|zadost)\b/.test(normalized);
}

function isAbsenceRequest(payload, speechText, context) {
  return (
    context.requestedIntent === "absence_request" ||
    context.requestedIntent === "absence_vacation_request" ||
    Boolean(requestedAbsenceType(payload)) ||
    Boolean(inferAbsenceTypeFromText(speechText)) ||
    isAbsenceRequestText(speechText)
  );
}

function absenceDraftFromPayload(payload, speechText) {
  const baseIso = pragueIsoDate();
  const type = requestedAbsenceType(payload) || inferAbsenceTypeFromText(speechText);
  const dateFrom = absenceDateFromPayload(payload, speechText, baseIso);
  const dateTo = absenceDateToFromPayload(payload, speechText, dateFrom, baseIso);
  const dayPart = absenceDayPart(payload, speechText) || (type === "doctor" ? "" : "full_day");
  const timeRange = absenceTimeRangeFromPayload(payload, speechText);

  return compactObject({
    type,
    dateFrom,
    dateTo: dateTo || dateFrom,
    dayPart,
    startTime: timeRange.startTime,
    endTime: timeRange.endTime,
    halfDay: dayPart === "half_day",
    employeeId: requestedAbsenceEmployeeId(payload),
    employeeQuery: requestedAbsenceEmployeeQuery(payload, speechText),
    note: absenceNote(payload),
    confirmation: absenceConfirmation(payload, speechText)
  });
}

function absenceContextFromPayload(payload) {
  const speechText = speechTextFromPayload(payload);
  const draft = absenceDraftFromPayload(payload, speechText);

  return compactObject({
    absenceType: draft.type || requestedAbsenceType(payload),
    absenceDateFrom: draft.dateFrom,
    absenceDateTo: draft.dateTo,
    absenceDayPart: draft.dayPart,
    absenceStartTime: draft.startTime,
    absenceEndTime: draft.endTime,
    absenceEmployeeId: draft.employeeId,
    absenceEmployeeQuery: draft.employeeQuery,
    absenceConfirmed: draft.confirmation === "confirmed",
    absenceRejected: draft.confirmation === "rejected"
  });
}

function speechTextFromPayload(payload) {
  return truncate(firstNonEmpty(
    payload.text,
    payload.message,
    payload.transcript,
    payload.query,
    payload.input,
    payload.userMessage,
    payload.user_message,
    payload.parameters?.text,
    payload.parameters?.message,
    payload.parameters?.query,
    payload.request?.text,
    payload.request?.message
  ));
}

function intentHintFromPayload(payload) {
  const raw = firstNonEmpty(
    payload.intent,
    payload.action,
    payload.tool,
    payload.toolName,
    payload.tool_name,
    payload.parameters?.intent,
    payload.parameters?.action,
    payload.parameters?.tool,
    payload.parameters?.toolName
  );
  const normalized = normalizeIntent(raw);
  return normalized === "general" && !raw ? "" : normalized;
}

function normalizeIntent(value) {
  const normalized = normalizeKey(value).replaceAll("-", "_").replace(/\s+/g, "_");
  const aliases = {
    order: "order_status",
    objednavka: "order_status",
    stav_objednavky: "order_status",
    order_status: "order_status",
    shipment: "tracking",
    zasilka: "tracking",
    zasilky: "tracking",
    tracking: "tracking",
    sms: "sms_link",
    send_sms: "sms_link",
    sms_link: "sms_link",
    jarka: "handoff_jarka",
    handoff: "handoff_jarka",
    predani: "handoff_jarka",
    product: "product_advice",
    produkt: "product_advice",
    produktove_poradenstvi: "product_advice",
    product_advice: "product_advice",
    complaint: "complaint_return",
    reklamace: "complaint_return",
    return: "complaint_return",
    vraceni: "complaint_return",
    complaint_return: "complaint_return",
    absence: "absence_request",
    absence_request: "absence_request",
    absence_write: "absence_request",
    absence_vacation: "absence_vacation_request",
    absence_vacation_request: "absence_vacation_request",
    dovolena: "absence_request",
    dovolena_nemoc: "absence_request",
    vacation: "absence_request",
    leave_request: "absence_request",
    nemoc: "absence_request",
    ocr: "absence_request",
    lekar: "absence_request",
    nepritomnost: "absence_request",
    log: "call_log",
    call_log: "call_log",
    hovor: "call_log",
    pracovni_doba: "business_hours",
    business_hours: "business_hours"
  };
  const intent = aliases[normalized] || normalized;
  return INTENTS.has(intent) ? intent : "general";
}

function publicUserContext(user) {
  return compactObject({
    id: cleanString(user?.id),
    name: truncate(user?.name, 120),
    role: cleanString(user?.role),
    department: truncate(user?.department, 120),
    position: truncate(user?.position, 120)
  });
}

function contextFromPayload(payload) {
  const parameters = payload.parameters && typeof payload.parameters === "object" ? payload.parameters : {};
  const context = payload.context && typeof payload.context === "object" ? payload.context : {};
  const dynamicVariables = payload.dynamic_variables
    || payload.dynamicVariables
    || payload.conversation_initiation_client_data?.dynamic_variables
    || {};
  const absenceContext = absenceContextFromPayload(payload);

  return compactObject({
    conversationId: firstNonEmpty(
      payload.conversationId,
      payload.conversation_id,
      payload.conversation?.id,
      payload.metadata?.conversation_id
    ),
    requestedIntent: intentHintFromPayload(payload),
    orderNumber: truncate(firstNonEmpty(
      parameters.orderNumber,
      parameters.order_number,
      context.orderNumber,
      payload.orderNumber,
      extractNestedValue(payload, ["orderNumber", "order_number", "orderId", "order_id"])
    ), 120),
    trackingNumber: truncate(firstNonEmpty(
      parameters.trackingNumber,
      parameters.tracking_number,
      context.trackingNumber,
      payload.trackingNumber,
      extractNestedValue(payload, ["trackingNumber", "tracking_number", "shipmentNumber", "shipment_number"])
    ), 120),
    phone: truncate(firstNonEmpty(parameters.phone, context.phone, payload.phone), 80),
    link: truncate(firstNonEmpty(parameters.link, context.link, payload.link, payload.url), 400),
    customerName: truncate(firstNonEmpty(parameters.customerName, context.customerName, payload.customerName), 160),
    product: truncate(firstNonEmpty(parameters.product, context.product, payload.product), 220),
    issue: truncate(firstNonEmpty(parameters.issue, context.issue, payload.issue), 420),
    smsConsent: boolValue(firstNonEmpty(
      parameters.smsConsent,
      parameters.sms_consent,
      context.smsConsent,
      payload.smsConsent,
      payload.sms_consent,
      payload.confirmed,
      payload.consent?.sms
    )),
    dynamicUserName: truncate(dynamicVariables.user_name, 120),
    dynamicUserRole: truncate(dynamicVariables.user_role, 120),
    ...absenceContext
  });
}

function pragueDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

  return {
    weekday: weekdayMap[part("weekday")] || 0,
    hour: numberValue(part("hour"), 0) % 24,
    minute: numberValue(part("minute"), 0)
  };
}

function minutesFromTime(value) {
  const match = cleanString(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = numberValue(match[1], 0);
  const minutes = numberValue(match[2], 0);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return (hours * 60) + minutes;
}

function defaultBusinessHours() {
  return {
    timezone: "Europe/Prague",
    source: "default",
    days: [
      { day: 1, from: "08:00", to: "16:00" },
      { day: 2, from: "08:00", to: "16:00" },
      { day: 3, from: "08:00", to: "16:00" },
      { day: 4, from: "08:00", to: "16:00" },
      { day: 5, from: "08:00", to: "16:00" }
    ]
  };
}

function businessHoursConfig(env) {
  const configured = parseJson(env.SARLOTA_BUSINESS_HOURS_JSON, null);
  if (!configured || !Array.isArray(configured.days)) {
    return defaultBusinessHours();
  }

  return {
    timezone: "Europe/Prague",
    source: "configured",
    days: configured.days
      .map((day) => ({
        day: numberValue(day.day, 0),
        from: cleanString(day.from),
        to: cleanString(day.to)
      }))
      .filter((day) => day.day >= 1 && day.day <= 7 && minutesFromTime(day.from) !== null && minutesFromTime(day.to) !== null)
  };
}

function businessHoursStatus(env, date = new Date()) {
  const config = businessHoursConfig(env);
  const parts = pragueDateParts(date);
  const nowMinutes = (parts.hour * 60) + parts.minute;
  const todayRanges = config.days.filter((day) => day.day === parts.weekday);
  const activeRange = todayRanges.find((range) => {
    const from = minutesFromTime(range.from);
    const to = minutesFromTime(range.to);
    return from !== null && to !== null && nowMinutes >= from && nowMinutes < to;
  });

  return {
    isBusinessHours: Boolean(activeRange),
    timezone: config.timezone,
    source: config.source,
    currentDay: parts.weekday,
    currentTime: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
    todayRanges: todayRanges.map((range) => `${range.from}-${range.to}`),
    message: activeRange
      ? "Jsme v pracovní době."
      : config.source === "configured"
        ? "Teď jsme mimo nastavenou pracovní dobu."
        : "Teď jsme mimo výchozí pracovní dobu."
  };
}

function extractJsonObject(text) {
  const raw = cleanString(text);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new VoiceSarlotaError("OpenAI vrátilo neplatný JSON.", 502, "voice_sarlota_invalid_openai_json");
  }
}

function systemPrompt() {
  return [
    sarlotaSystemPrompt(),
    "Tento endpoint vrací strojové rozhodnutí pro KSO backend. Odpověď pro uživatele dej do pole reply.",
    "Pro zápis dovolené, nemoci, OČR, lékaře, náhradního volna, neplaceného volna nebo jiné nepřítomnosti použij intent absence_request. Nezapisuj bez jasného potvrzení uživatele; když něco chybí, polož jen jednu otázku.",
    "Blok Firemní lidskost: pokud request.humanTouch.enabled obsahuje návrhy, můžeš nenásilně použít maximálně jednu krátkou poznámku. Použij jen dodaný ověřený návrh, nikdy si nevymýšlej počasí, svátky, narozeniny ani dovolené.",
    "Firemní lidskost nepoužívej při reklamaci, stížnosti, spěchu, stresu, chybě, nemoci, OČR, lékaři ani u citlivé absence. Nikdy nezmiňuj důvod absence, věk ani soukromé údaje. Nepoužívej texty známých písní.",
    "Vrať výhradně JSON."
  ].join(" ");
}

async function requestOpenAiDecision(env, input) {
  const { apiKey, model } = openAiConfig(env);
  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: systemPrompt()
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Rozpoznej záměr volajícího a napiš krátkou odpověď Šarloty.",
            allowedIntents: Array.from(INTENTS),
            outputShape: {
              intent: "order_status|tracking|sms_link|handoff_jarka|product_advice|complaint_return|absence_request|call_log|business_hours|general|unsupported",
              reply: "1 až 2 krátké věty česky, tykání",
              needsHuman: true,
              humanTouchUsed: false,
              confidence: 0.0
            },
            request: input
          })
        }
      ]
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new VoiceSarlotaError(
      cleanString(payload.error?.message || payload.error || `OpenAI API vrátilo chybu ${response.status}.`),
      502,
      "voice_sarlota_openai_failed"
    );
  }

  const parsed = extractJsonObject(payload.choices?.[0]?.message?.content);
  return {
    intent: normalizeIntent(parsed.intent || parsed.tool || input.context.requestedIntent),
    reply: sanitizeSarlotaReply(parsed.reply || parsed.response || ""),
    needsHuman: boolValue(parsed.needsHuman),
    humanTouchUsed: boolValue(parsed.humanTouchUsed || parsed.human_touch_used),
    confidence: Math.max(0, Math.min(numberValue(parsed.confidence, 0), 1)),
    model
  };
}

function sanitizeSarlotaReply(value) {
  const text = truncate(value, 420)
    .replace(/\bSupportBox\b/gi, "interní systém")
    .replace(/\btickets?\b/gi, "požadavky")
    .replace(/\btikety?\b/gi, "požadavky")
    .replace(/\bMůžete\b/g, "Můžeš")
    .replace(/\bmůžete\b/g, "můžeš")
    .replace(/\bChcete\b/g, "Chceš")
    .replace(/\bchcete\b/g, "chceš")
    .replace(/\bPotřebujete\b/g, "Potřebuješ")
    .replace(/\bpotřebujete\b/g, "potřebuješ")
    .replace(/\bNemáte\b/g, "Nemáš")
    .replace(/\bnemáte\b/g, "nemáš")
    .replace(/\bZadejte\b/g, "Zadej")
    .replace(/\bzadejte\b/g, "zadej")
    .replace(/\bPošlete\b/g, "Pošli")
    .replace(/\bpošlete\b/g, "pošli");

  return text || "Tomu zatím nerozumím jistě. Předám to kolegyni Jarce.";
}

function orderStatusTool(context) {
  if (!context.orderNumber) {
    return {
      status: "needs_input",
      verified: false,
      message: "Pošli mi číslo objednávky a ověřím, co pro ni máme napojené.",
      preparedActions: []
    };
  }

  return {
    status: "prepared",
    verified: false,
    missingInternalApi: "order_status",
    message: "Stav objednávky zatím nemám z ověřeného zdroje. Předám to kolegyni Jarce.",
    preparedActions: [
      {
        type: "handoff_jarka",
        reason: "order_status_unverified",
        orderNumber: context.orderNumber
      }
    ]
  };
}

function trackingTool(context) {
  if (!context.trackingNumber && !context.orderNumber) {
    return {
      status: "needs_input",
      verified: false,
      message: "Pošli mi číslo zásilky nebo objednávky a zkontroluju ověřený zdroj.",
      preparedActions: []
    };
  }

  return {
    status: "prepared",
    verified: false,
    missingInternalApi: "shipment_tracking",
    message: "Tracking zatím nemám z ověřeného zdroje. Předám to kolegyni Jarce.",
    preparedActions: [
      {
        type: "handoff_jarka",
        reason: "tracking_unverified",
        orderNumber: context.orderNumber,
        trackingNumber: context.trackingNumber
      }
    ]
  };
}

function smsLinkTool(context) {
  if (!context.smsConsent) {
    return {
      status: "needs_consent",
      verified: true,
      message: "SMS s odkazem můžu řešit jen po tvém souhlasu. Mám ji připravit?",
      preparedActions: []
    };
  }

  return {
    status: "prepared_not_sent",
    verified: false,
    missingInternalApi: "voice_sms_sender",
    message: "Souhlas mám, ale ostré odeslání SMS pro Šarlotu ještě není napojené. Předám to kolegyni Jarce.",
    preparedActions: [
      {
        type: "sms_link",
        status: "not_sent",
        requiresApprovedSender: true,
        phonePresent: Boolean(context.phone),
        linkPresent: Boolean(context.link)
      }
    ]
  };
}

function handoffTool(context, reason = "handoff_requested") {
  return {
    status: "prepared",
    verified: true,
    message: "Předám to kolegyni Jarce.",
    preparedActions: [
      {
        type: "handoff_jarka",
        reason,
        orderNumber: context.orderNumber,
        trackingNumber: context.trackingNumber,
        product: context.product
      }
    ]
  };
}

function productAdviceTool(decision, context) {
  return {
    status: context.product ? "answered_general" : "needs_input",
    verified: false,
    message: context.product
      ? sanitizeSarlotaReply(decision.reply)
      : "Napiš mi, o jaký produkt jde. Když si nebudu jistá, předám to kolegyni Jarce.",
    preparedActions: context.product
      ? []
      : [{ type: "handoff_jarka", reason: "product_advice_missing_product" }]
  };
}

function complaintReturnTool(context) {
  return {
    status: "prepared",
    verified: false,
    message: "Reklamaci nebo vrácení bez ověřených dat neuzavřu. Předám to kolegyni Jarce.",
    preparedActions: [
      {
        type: "handoff_jarka",
        reason: "complaint_return",
        orderNumber: context.orderNumber,
        issue: context.issue
      }
    ]
  };
}

function absenceDayPartLabel(dayPart) {
  return dayPart === "half_day" ? "půlden" : "celý den";
}

function absenceTypeLabel(type) {
  return ABSENCE_TYPE_LABELS[type] || "nepřítomnost";
}

function absenceDateRangeLabel(draft) {
  if (draft.type === "doctor" && draft.startTime && draft.endTime) {
    return `${formatCzechDate(draft.dateFrom)} od ${draft.startTime} do ${draft.endTime}`;
  }

  if (!draft.dateTo || draft.dateTo === draft.dateFrom) {
    return `${formatCzechDate(draft.dateFrom)} jako ${absenceDayPartLabel(draft.dayPart)}`;
  }

  return `od ${formatCzechDate(draft.dateFrom)} do ${formatCzechDate(draft.dateTo)}`;
}

function absenceSummaryMessage(draft, employee) {
  const employeeName = cleanString(employee?.name || employee?.email || "tebe");
  return `Rozumím. Chceš zapsat ${absenceTypeLabel(draft.type)} pro ${employeeName} ${absenceDateRangeLabel(draft)}. Mám to uložit?`;
}

function publicAbsenceRequest(request) {
  return compactObject({
    id: cleanString(request?.id),
    type: cleanString(request?.type),
    typeLabel: cleanString(request?.typeLabel),
    dateFrom: cleanString(request?.dateFrom),
    dateTo: cleanString(request?.dateTo),
    halfDay: Boolean(request?.halfDay),
    daysCount: request?.daysCount,
    status: cleanString(request?.status),
    statusLabel: cleanString(request?.statusLabel)
  });
}

function absencePreparedAction(draft, employee) {
  return {
    type: "absence_request",
    action: "create",
    requiresConfirmation: true,
    confirmationPhrase: "ano, zapiš to",
    notificationsSent: false,
    parameters: compactObject({
      type: draft.type,
      employeeId: cleanString(employee?.id),
      employeeName: cleanString(employee?.name),
      dateFrom: draft.dateFrom,
      dateTo: draft.dateTo || draft.dateFrom,
      halfDay: draft.dayPart === "half_day",
      dayPart: draft.dayPart,
      startTime: draft.startTime,
      endTime: draft.endTime,
      note: draft.note
    })
  };
}

async function absenceRequestTool(env, user, payload, context, speechText) {
  if (!hasPermission(user, "absence", "create")) {
    return {
      status: "forbidden",
      verified: true,
      message: "K tomu nemáš oprávnění.",
      preparedActions: []
    };
  }

  const draft = absenceDraftFromPayload(payload, speechText);

  if (draft.confirmation === "rejected") {
    return {
      status: "cancelled",
      verified: true,
      message: "Dobře, nezapsala jsem nic.",
      preparedActions: []
    };
  }

  if (!draft.type) {
    return {
      status: "needs_input",
      verified: true,
      message: `Jaký typ nepřítomnosti mám zapsat? ${ABSENCE_TYPE_OPTIONS_TEXT}`,
      preparedActions: []
    };
  }

  if (!ABSENCE_TYPE_LABELS[draft.type]) {
    return {
      status: "needs_input",
      verified: true,
      message: `Typ nepřítomnosti nemám jistý. Vyber prosím: ${ABSENCE_TYPE_OPTIONS_TEXT}`,
      preparedActions: []
    };
  }

  if (!draft.dateFrom) {
    return {
      status: "needs_input",
      verified: true,
      message: `Od kdy má ${absenceTypeLabel(draft.type)} platit?`,
      preparedActions: []
    };
  }

  if (draft.type === "doctor" && !draft.startTime) {
    return {
      status: "needs_input",
      verified: true,
      message: "Od kolika hodin má lékař platit?",
      preparedActions: []
    };
  }

  if (draft.type === "doctor" && !draft.endTime) {
    return {
      status: "needs_input",
      verified: true,
      message: "Do kolika hodin má lékař trvat?",
      preparedActions: []
    };
  }

  const users = await getUsers(env);
  const employeeResult = resolveAbsenceEmployee(users, user, draft, speechText);

  if (employeeResult.status !== "resolved") {
    return {
      status: employeeResult.status,
      verified: true,
      message: employeeResult.message,
      preparedActions: []
    };
  }

  const employee = employeeResult.employee || user;

  if (draft.type !== "doctor" && !draft.dayPart) {
    return {
      status: "needs_input",
      verified: true,
      message: "Je to na celý den, nebo jen část dne?",
      preparedActions: []
    };
  }

  if (draft.confirmation !== "confirmed") {
    return {
      status: "needs_confirmation",
      verified: true,
      message: absenceSummaryMessage(draft, employee),
      preparedActions: [absencePreparedAction(draft, employee)]
    };
  }

  try {
    const request = await createAbsenceRequestRecord(env, users, user, {
      employeeId: cleanString(employee?.id || user?.id),
      type: draft.type,
      dateFrom: draft.dateFrom,
      dateTo: draft.dateTo || draft.dateFrom,
      halfDay: draft.dayPart === "half_day",
      unit: draft.type === "doctor" ? "hours" : "days",
      startTime: draft.type === "doctor" ? draft.startTime : "",
      endTime: draft.type === "doctor" ? draft.endTime : "",
      note: draft.note || "Zadáno hlasově přes Šarlotu."
    });
    const statusLabel = cleanString(request.statusLabel || request.status);

    return {
      status: "created",
      verified: true,
      message: `Hotovo. Záznam je zapsaný; stav je ${statusLabel}.`,
      preparedActions: [],
      absenceRequest: publicAbsenceRequest(request),
      notificationsSent: false
    };
  } catch (error) {
    return {
      status: "failed",
      verified: false,
      message: `${cleanString(error?.message) || "Žádost se nepodařilo zapsat."} Nic jsem nezapsala.`,
      preparedActions: [],
      code: cleanString(error?.code || "absence_request_create_failed"),
      apiStatus: error?.status === 503 ? "waiting" : "ready"
    };
  }
}

function businessHoursTool(businessHours) {
  return {
    status: "ready",
    verified: businessHours.source === "configured",
    message: businessHours.message,
    preparedActions: [],
    businessHours
  };
}

async function executeTool(decision, context, businessHours, runtime = {}) {
  switch (decision.intent) {
    case "order_status":
      return orderStatusTool(context);
    case "tracking":
      return trackingTool(context);
    case "sms_link":
      return smsLinkTool(context);
    case "handoff_jarka":
      return handoffTool(context);
    case "product_advice":
      return productAdviceTool(decision, context);
    case "complaint_return":
      return complaintReturnTool(context);
    case "absence_request":
      return absenceRequestTool(runtime.env, runtime.user, runtime.payload, context, runtime.speechText);
    case "absence_vacation_request":
      return absenceRequestTool(runtime.env, runtime.user, runtime.payload, context, runtime.speechText);
    case "business_hours":
      return businessHoursTool(businessHours);
    case "call_log":
      return {
        status: "ready",
        verified: true,
        message: "Hovor zapíšu do logu.",
        preparedActions: []
      };
    case "unsupported":
      return handoffTool(context, "unsupported_request");
    default:
      return {
        status: "answered",
        verified: false,
        message: sanitizeSarlotaReply(decision.reply),
        preparedActions: []
      };
  }
}

function finalReplyFor(decision, toolResult) {
  if (toolResult.message) {
    return sanitizeSarlotaReply(toolResult.message);
  }

  return sanitizeSarlotaReply(decision.reply);
}

async function recordVoiceActionSafely(env, user, { input, context, businessHours, humanTouch, decision, toolResult, reply }) {
  try {
    return await recordAiAction(env, user, {
      assistantId: ASSISTANT_ID,
      assistantName: ASSISTANT_NAME,
      actionType: "voice",
      toolName: `voice_sarlota_${decision.intent}`,
      input: {
        authSource: input.authSource,
        conversationId: context.conversationId,
        transcriptExcerpt: truncate(input.text, 500),
        requestedIntent: context.requestedIntent,
        smsConsent: context.smsConsent,
        absenceDateFrom: context.absenceDateFrom,
        absenceDayPart: context.absenceDayPart,
        absenceType: context.absenceType,
        absenceEmployeeQuery: context.absenceEmployeeQuery,
        absenceConfirmed: context.absenceConfirmed,
        humanTouchAvailable: Boolean(humanTouch.enabled),
        humanTouchTypes: humanTouch.suggestions?.map((item) => item.type) || []
      },
      result: {
        intent: decision.intent,
        confidence: decision.confidence,
        status: toolResult.status,
        verified: Boolean(toolResult.verified),
        replyExcerpt: truncate(reply, 360),
        preparedActions: toolResult.preparedActions?.length || 0,
        businessHours: businessHours.isBusinessHours,
        absenceRequestId: cleanString(toolResult.absenceRequest?.id),
        notificationsSent: toolResult.notificationsSent === true,
        humanTouchUsed: decision.humanTouchUsed === true
      },
      status: "ok"
    });
  } catch (error) {
    console.error("voice_sarlota.action_log_failed", { message: error.message });
    return { logged: false, id: "", reason: "action_log_failed" };
  }
}

async function buildVoiceResponse(env, user, payload, { input, context, businessHours, humanTouch, decision, toolResult }) {
  const reply = finalReplyFor(decision, toolResult);
  const logResult = await recordVoiceActionSafely(env, user, {
    input,
    context,
    businessHours,
    humanTouch,
    decision,
    toolResult,
    reply
  });

  return {
    ok: true,
    assistantId: ASSISTANT_ID,
    assistantName: ASSISTANT_NAME,
    text: reply,
    reply,
    intent: decision.intent,
    confidence: decision.confidence,
    status: toolResult.status,
    verified: Boolean(toolResult.verified),
    needsHuman: Boolean(decision.needsHuman || toolResult.preparedActions?.some((action) => action.type === "handoff_jarka")),
    preparedActions: toolResult.preparedActions || [],
    absenceRequest: toolResult.absenceRequest || null,
    notificationsSent: toolResult.notificationsSent === true,
    missingInternalApi: toolResult.missingInternalApi || "",
    businessHours: toolResult.businessHours || businessHours,
    humanTouch: {
      available: Boolean(humanTouch.enabled),
      used: decision.humanTouchUsed === true,
      types: humanTouch.suggestions?.map((item) => item.type) || []
    },
    callLog: {
      logged: Boolean(logResult.logged),
      id: cleanString(logResult.id),
      reason: cleanString(logResult.reason)
    },
    model: decision.model,
    apiStatus: toolResult.apiStatus || "ready"
  };
}

export async function handleSarlotaVoiceRequest(env, user, payload = {}, options = {}) {
  const speechText = speechTextFromPayload(payload);
  const context = contextFromPayload(payload);
  const businessHours = businessHoursStatus(env);
  const input = {
    text: speechText,
    context,
    businessHours,
    humanTouch: { enabled: false, suggestions: [] },
    user: publicUserContext(user),
    authSource: cleanString(options.authSource || "unknown")
  };

  if (isAbsenceRequest(payload, speechText, context)) {
    const decision = {
      intent: "absence_request",
      reply: "",
      needsHuman: false,
      humanTouchUsed: false,
      confidence: 0.98,
      model: "kso-deterministic"
    };
    const toolResult = await absenceRequestTool(env, user, payload, context, speechText);

    return buildVoiceResponse(env, user, payload, {
      input,
      context,
      businessHours,
      humanTouch: input.humanTouch,
      decision,
      toolResult
    });
  }

  const humanTouch = await sarlotaHumanTouchContext(env, user, payload);
  input.humanTouch = humanTouch;

  const openAiDecision = await requestOpenAiDecision(env, input);
  const decision = openAiDecision;
  const toolResult = await executeTool(decision, context, businessHours, { env, user, payload, speechText });

  return buildVoiceResponse(env, user, payload, {
    input,
    context,
    businessHours,
    humanTouch,
    decision,
    toolResult
  });
}

export function voiceSarlotaErrorResponse(error) {
  if (error instanceof VoiceSarlotaError) {
    return {
      payload: {
        ok: false,
        error: error.message,
        code: error.code,
        apiStatus: "waiting"
      },
      status: error.status
    };
  }

  return {
    payload: {
      ok: false,
      error: cleanString(error?.message) || "Šarlota teď požadavek nezpracovala.",
      code: cleanString(error?.code || "voice_sarlota_failed"),
      apiStatus: "waiting"
    },
    status: error?.status || 500
  };
}
