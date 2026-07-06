export const RECEIVABLES_BANNED_CUSTOMER_WORDS = [
  "dluh",
  "dlužník",
  "vymáhání",
  "sankce",
  "penále",
  "exekuce",
  "právní kroky",
  "poslední výzva",
  "okamžitě uhraďte"
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_TIME_ZONE = "Europe/Prague";
const DEFAULT_SEND_FROM = "09:00";
const DEFAULT_SEND_TO = "15:30";
const HARD_STOP = "16:00";

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeKey(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function datePartsInTimeZone(date, timeZone = DEFAULT_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: cleanString(parts.weekday).toLowerCase()
  };
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = datePartsInTimeZone(date, timeZone);
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedAsUtc - date.getTime();
}

function zonedLocalTimeToUtcMs({ year, month, day, hour, minute, second = 0 }, timeZone) {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let index = 0; index < 3; index += 1) {
    utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - timeZoneOffsetMs(new Date(utcMs), timeZone);
  }
  return utcMs;
}

function parseHourMinute(value, fallback) {
  const match = cleanString(value || fallback).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return parseHourMinute(fallback, "09:00");
  }
  return {
    hour: Math.max(0, Math.min(23, Number(match[1]))),
    minute: Math.max(0, Math.min(59, Number(match[2])))
  };
}

function addCalendarDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + days * MS_PER_DAY);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

export function isReceivablesWorkingDay(date, timeZone = DEFAULT_TIME_ZONE) {
  const weekday = datePartsInTimeZone(date, timeZone).weekday;
  return !["sat", "sun"].includes(weekday);
}

export function nextReceivablesWorkingSendAt(now = new Date(), options = {}) {
  const timeZone = options.timeZone || options.timezone || DEFAULT_TIME_ZONE;
  const sendFrom = parseHourMinute(options.sendFrom || options.send_from, DEFAULT_SEND_FROM);
  const sendTo = parseHourMinute(options.sendTo || options.send_to, DEFAULT_SEND_TO);
  const hardStop = parseHourMinute(options.hardStop || options.hard_stop, HARD_STOP);
  const parts = datePartsInTimeZone(now, timeZone);
  const minutesNow = parts.hour * 60 + parts.minute;
  const minutesFrom = sendFrom.hour * 60 + sendFrom.minute;
  const minutesTo = Math.min(sendTo.hour * 60 + sendTo.minute, hardStop.hour * 60 + hardStop.minute);

  let target = { ...parts, hour: sendFrom.hour, minute: sendFrom.minute, second: 0 };
  if (isReceivablesWorkingDay(now, timeZone) && minutesNow >= minutesFrom && minutesNow <= minutesTo) {
    target = { ...parts, hour: parts.hour, minute: parts.minute, second: 0 };
  } else if (isReceivablesWorkingDay(now, timeZone) && minutesNow < minutesFrom) {
    target = { ...parts, hour: sendFrom.hour, minute: sendFrom.minute, second: 0 };
  } else {
    let nextDay = addCalendarDays(parts, 1);
    let guard = 0;
    while (guard < 8) {
      const candidate = new Date(zonedLocalTimeToUtcMs({ ...nextDay, hour: sendFrom.hour, minute: sendFrom.minute }, timeZone));
      if (isReceivablesWorkingDay(candidate, timeZone)) {
        target = { ...nextDay, hour: sendFrom.hour, minute: sendFrom.minute, second: 0 };
        break;
      }
      nextDay = addCalendarDays(nextDay, 1);
      guard += 1;
    }
  }

  return new Date(zonedLocalTimeToUtcMs(target, timeZone)).toISOString();
}

export function customerTextContainsBannedWord(text, bannedWords = RECEIVABLES_BANNED_CUSTOMER_WORDS) {
  const normalized = normalizeKey(text);
  return bannedWords.some((word) => normalized.includes(normalizeKey(word)));
}

export function renderReceivablesCustomerMessage(templateKey, context = {}) {
  const invoiceRows = Array.isArray(context.invoices) && context.invoices.length
    ? context.invoices.map((invoice) => (
      `- ${cleanString(invoice.invoiceNumber || invoice.invoice_number)} | VS ${cleanString(invoice.variableSymbol || invoice.variable_symbol)} | ${cleanString(invoice.dueDate || invoice.due_date)} | ${numberValue(invoice.openAmount ?? invoice.open_amount).toLocaleString("cs-CZ")} Kč`
    )).join("\n")
    : "- přehled položek je připravený v příloze nebo odkazu";

  if (templateKey === "payment_proof_request") {
    return [
      "Dobrý den,",
      "děkujeme za informaci. Platbu zatím nevidíme spárovanou v přehledu, proto prosíme jen o krátké potvrzení nebo doklad platby.",
      "Jakmile se platba spáruje, přehled si uzavřeme.",
      "Děkujeme a přejeme hezký den",
      "Kaiser servis - fakturace"
    ].join("\n");
  }

  if (templateKey === "thank_you_after_payment") {
    return [
      "Dobrý den,",
      "platba se nám spárovala, děkujeme za vyřízení.",
      "Přejeme hezký den",
      "Kaiser servis - fakturace"
    ].join("\n");
  }

  return [
    "Dobrý den,",
    "posíláme přátelský přehled otevřených faktur, které u nás zatím neevidujeme jako uhrazené.",
    invoiceRows,
    `Celkem k úhradě: ${numberValue(context.totalOpenAmount ?? context.total_open_amount).toLocaleString("cs-CZ")} Kč`,
    "Pokud už platba odešla, děkujeme a prosíme jen o ignorování této zprávy.",
    "Kdyby bylo potřeba cokoliv doplnit, pošleme obratem kopii faktury nebo další informace.",
    "Děkujeme a přejeme hezký den",
    "Kaiser servis - fakturace"
  ].join("\n");
}

function promiseWaitUntil(promiseDate, now, options) {
  if (!promiseDate) {
    return "";
  }
  const timeZone = options.timeZone || options.timezone || DEFAULT_TIME_ZONE;
  const promised = new Date(`${cleanString(promiseDate).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(promised.getTime())) {
    return "";
  }
  let next = promised;
  let addedWorkingDays = 0;
  while (addedWorkingDays < 1) {
    next = new Date(next.getTime() + MS_PER_DAY);
    if (isReceivablesWorkingDay(next, timeZone)) {
      addedWorkingDays += 1;
    }
  }
  return now.getTime() < next.getTime() ? nextReceivablesWorkingSendAt(next, options) : "";
}

function blockedDecision(reason, blockedRule, extra = {}) {
  return {
    action: "wait",
    scheduledAt: cleanString(extra.scheduledAt),
    channel: "",
    template: "",
    tone: "friendly",
    reason,
    confidence: 1,
    requiresHumanApproval: Boolean(extra.requiresHumanApproval),
    marketaAlert: Boolean(extra.marketaAlert),
    dryRun: true,
    blockedRules: [blockedRule],
    messagePreview: ""
  };
}

export function decideReceivablesNextAction(input = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const customer = input.customer || {};
  const receivablePackage = input.receivablePackage || input.receivable_package || {};
  const history = input.history || {};
  const constraints = input.constraints || {};
  const timeOptions = {
    timeZone: constraints.timezone || constraints.timeZone || options.timeZone || DEFAULT_TIME_ZONE,
    sendFrom: constraints.send_from || constraints.sendFrom || DEFAULT_SEND_FROM,
    sendTo: constraints.send_to || constraints.sendTo || DEFAULT_SEND_TO,
    hardStop: constraints.hard_stop || constraints.hardStop || HARD_STOP
  };
  const maxDaysOverdue = numberValue(receivablePackage.maxDaysOverdue ?? receivablePackage.max_days_overdue);
  const totalOpenAmount = numberValue(receivablePackage.totalOpenAmount ?? receivablePackage.total_open_amount);

  if (customer.rating === "INSOLVENCE" || customer.automationStatus === "STOP" || customer.automation_status === "STOP") {
    return blockedDecision("Zákazník je ve stop režimu nebo v insolvenci. Automatická komunikace je zastavená.", "insolvency_or_stop", {
      requiresHumanApproval: true,
      marketaAlert: true
    });
  }

  if (history.disputeActive || history.dispute_active || ["angry_response", "legal_threat", "dispute"].includes(cleanString(history.lastReplyClassification || history.last_reply_classification))) {
    return blockedDecision("Zákazník reagoval sporně nebo podrážděně. Případ má převzít člověk.", "negative_or_dispute_reply", {
      requiresHumanApproval: true,
      marketaAlert: true
    });
  }

  if (maxDaysOverdue >= 60 && totalOpenAmount > 0) {
    return {
      action: "prepare_legal_package",
      scheduledAt: nextReceivablesWorkingSendAt(now, timeOptions),
      channel: "internal",
      template: "legal_handoff_package",
      tone: "friendly",
      reason: "Balíček dosáhl 60 dní po splatnosti. Zákazníkovi se neposílá výhružná zpráva, připravují se interní podklady.",
      confidence: 0.96,
      requiresHumanApproval: true,
      marketaAlert: true,
      dryRun: true,
      blockedRules: [],
      messagePreview: ""
    };
  }

  const promiseDate = cleanString(history.promiseDate || history.promise_date);
  const promiseStatus = cleanString(history.promiseStatus || history.promise_status);
  if (promiseDate && ["active", "pending", "promised"].includes(promiseStatus || "active")) {
    const waitUntil = promiseWaitUntil(promiseDate, now, timeOptions);
    if (waitUntil) {
      return blockedDecision("Je aktivní slib úhrady. Systém čeká do slíbeného data plus jeden pracovní den.", "active_promise_to_pay", {
        scheduledAt: waitUntil
      });
    }
  }

  if (totalOpenAmount <= 0) {
    return blockedDecision("Balíček nemá otevřenou částku k řešení.", "nothing_open");
  }

  const template = history.promiseStatus === "expired_unpaid"
    ? "promise_payment_check"
    : "friendly_bundle_reminder";
  const messagePreview = renderReceivablesCustomerMessage(template, {
    ...receivablePackage,
    invoices: receivablePackage.invoices || [],
    totalOpenAmount
  });
  const blockedRules = customerTextContainsBannedWord(messagePreview) ? ["banned_customer_words"] : [];

  return {
    action: blockedRules.length ? "wait" : "send_email",
    scheduledAt: nextReceivablesWorkingSendAt(now, timeOptions),
    channel: blockedRules.length ? "" : "email",
    template,
    tone: "friendly",
    reason: history.promiseStatus === "expired_unpaid"
      ? "Zákazník slíbil úhradu, ale platba zatím není spárovaná. Dry-run navrhuje jemné ověření."
      : "Dry-run navrhuje přátelský souhrn otevřených faktur jako jeden zákaznický balíček.",
    confidence: blockedRules.length ? 0 : 0.91,
    requiresHumanApproval: blockedRules.length,
    marketaAlert: false,
    dryRun: true,
    blockedRules,
    messagePreview: blockedRules.length ? "" : messagePreview
  };
}
