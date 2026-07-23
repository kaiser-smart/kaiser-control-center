export const DATA_BOX_PLUS_TRIAGE_QUEUES = [
  { id: "todo", label: "K vyřízení" },
  { id: "handed", label: "Předané" },
  { id: "done", label: "Hotové" }
];

export const DATA_BOX_PLUS_TRIAGE_MAILBOXES = [
  { id: "dbp-kaiser-servis", name: "Kaiser servis", company: "Kaiser servis", slot: 1 },
  { id: "dbp-kaiser-technology", name: "Kaiser technology", company: "Kaiser technology", slot: 2 },
  { id: "dbp-nanolab-plus", name: "Nanolab plus", company: "Nanolab plus", slot: 3 },
  { id: "dbp-nanolab-shop", name: "Nanolab shop", company: "Nanolab shop", slot: 4 },
  { id: "dbp-lefleur", name: "LeFleur", company: "LeFleur", slot: 5 },
  { id: "dbp-kaiserman-fond", name: "Kaisermanův nadační fond", company: "Kaisermanův nadační fond", slot: 6 },
  { id: "dbp-kaiser-holding", name: "Kaiser holding", company: "Kaiser holding", slot: 7 }
];

export const DATA_BOX_PLUS_TRIAGE_DERIVATION_VERSION = "local-triage-v1";

const DATA_BOX_PLUS_TRIAGE_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const DATA_BOX_PLUS_TRIAGE_PRODUCTION_HOSTS = new Set(["smart-odpady.ai", "www.smart-odpady.ai"]);
const DATA_BOX_PLUS_TRIAGE_PREVIEW_USER_IDS = new Set(["radim-oplustil"]);

export function dataBoxPlusTriagePreviewEnabled(runtimeValue, hostname, userId = "") {
  if (runtimeValue !== true) return false;

  const normalizedHostname = String(hostname || "").trim().toLocaleLowerCase("en-US");
  if (DATA_BOX_PLUS_TRIAGE_LOCAL_HOSTS.has(normalizedHostname)) return true;
  if (!DATA_BOX_PLUS_TRIAGE_PRODUCTION_HOSTS.has(normalizedHostname)) return false;

  const normalizedUserId = String(userId || "").trim().toLocaleLowerCase("en-US");
  return DATA_BOX_PLUS_TRIAGE_PREVIEW_USER_IDS.has(normalizedUserId);
}

export async function readDataBoxPlusTriageSnapshot(requestJson) {
  if (typeof requestJson !== "function") throw new TypeError("requestJson must be a function");
  const [statusPayload, messagesResult] = await Promise.all([
    requestJson("/api/data-box-plus/status", { method: "GET" }),
    requestJson("/api/data-box-plus/messages?limit=150", { method: "GET" })
  ]);
  const mailboxes = Array.isArray(statusPayload?.mailboxes) && statusPayload.mailboxes.length
    ? statusPayload.mailboxes
    : DATA_BOX_PLUS_TRIAGE_MAILBOXES.map((mailbox) => ({ ...mailbox }));
  const statusResult = {
    ...statusPayload,
    apiStatus: statusPayload?.apiStatus || messagesResult?.apiStatus || "ready",
    mailboxes
  };
  return [
    statusResult,
    messagesResult,
    { recommendations: [] },
    { rules: [] },
    { syncRuns: [] }
  ];
}

export async function readDataBoxPlusTriageDetail(requestJson, messageId) {
  if (typeof requestJson !== "function") throw new TypeError("requestJson must be a function");
  const id = String(messageId || "").trim();
  if (!id) throw new TypeError("messageId is required");
  return requestJson(`/api/data-box-plus/messages/${encodeURIComponent(id)}`, { method: "GET" });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/\s+/g, " ")
    .trim();
}

function joinedMessageState(message = {}) {
  return normalizeText([
    message.status,
    message.archiveStatus,
    message.attachmentStatus,
    message.riskLevel,
    message.priority,
    message.type,
    message.messageType
  ].filter(Boolean).join(" "));
}

function includesAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function isoDay(value) {
  const match = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

function pragueDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function deliveredTime(message = {}) {
  const value = Date.parse(message.deliveredAt || message.receivedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function blockerForMessage(message = {}) {
  const status = normalizeText(message.status);
  const attachment = normalizeText(message.attachmentStatus);

  if (includesAny(attachment, ["nepodarilo", "chyba", "problem", "nedostupna", "nedostupne"]) || status.includes("chybi priloha")) {
    return {
      code: "attachment_problem",
      label: "Příloha se nenačetla",
      actionLabel: "Otevřít chybu přílohy",
      tone: "problem"
    };
  }
  if (status.includes("potrebuje adresata")) {
    return {
      code: "needs_recipient",
      label: "Je potřeba vybrat adresáta",
      actionLabel: "Vybrat adresáta",
      tone: "waiting"
    };
  }
  if (status.includes("chybi vozidlo")) {
    return {
      code: "needs_vehicle",
      label: "Je potřeba vybrat vozidlo",
      actionLabel: "Vybrat vozidlo",
      tone: "waiting"
    };
  }
  if (includesAny(status, ["potrebuje upresnit", "nejasne", "neurceno"])) {
    return {
      code: "needs_classification",
      label: "Rozřazení není jisté",
      actionLabel: "Zařadit ručně",
      tone: "waiting"
    };
  }
  if (includesAny(status, ["nelze provest", "nepodarilo", "problem", "chyba"])) {
    return {
      code: "action_problem",
      label: "Akci se nepodařilo provést",
      actionLabel: "Otevřít chybu akce",
      tone: "problem"
    };
  }
  return null;
}

function isDoneMessage(message = {}) {
  const archiveStatus = normalizeText(message.archiveStatus);
  const status = normalizeText(message.status);
  if (archiveStatus === "archived" || archiveStatus.startsWith("archivovan")) return true;
  if ([
    "archivovano",
    "archivovane",
    "vyreseno",
    "completed",
    "closed"
  ].includes(status)) return true;
  return [
    "odeslano e-mailem",
    "odeslano datovou schrankou",
    "odeslano sms"
  ].some((prefix) => status === prefix || status.startsWith(`${prefix} `));
}

function isHandedMessage(message = {}) {
  if (String(message.assignedTo || "").trim()) return true;
  const status = normalizeText(message.status);
  return ["predano", "handoff", "assigned"].some((prefix) => status === prefix || status.startsWith(`${prefix} `));
}

function isUrgentMessage(message = {}, today = pragueDay()) {
  const state = joinedMessageState(message);
  if (includesAny(state, ["vysoke", "kriticke", "urgent", "pravni", "legal"])) return true;
  const dueDay = isoDay(message.dueDate);
  return Boolean(dueDay && today && dueDay <= today);
}

function donePresentation(message = {}) {
  const status = normalizeText(message.status);
  if (status.includes("odeslano")) {
    return { code: "sent", label: "Hotovo: zpráva byla odeslána", actionLabel: "Detail historie", tone: "resolved" };
  }
  if (normalizeText(message.archiveStatus).startsWith("archiv") || status.includes("archiv")) {
    return { code: "archived", label: "Hotovo: zpráva je archivovaná", actionLabel: "Detail historie", tone: "archive" };
  }
  return { code: "resolved", label: "Hotovo: zpráva je vyřízená", actionLabel: "Detail historie", tone: "resolved" };
}

function handedPresentation(message = {}) {
  const assignee = String(message.assignedTo || "").trim();
  return {
    code: "waiting_owner",
    label: assignee ? `Předáno: ${assignee}` : "Předáno odpovědné osobě",
    actionLabel: "Detail předání",
    tone: "handoff"
  };
}

function todoPresentation(message = {}, today = pragueDay()) {
  const blocker = blockerForMessage(message);
  if (blocker) return blocker;

  if (isUrgentMessage(message, today)) {
    const dueDay = isoDay(message.dueDate);
    const pastDue = Boolean(dueDay && dueDay < today);
    const dueToday = Boolean(dueDay && dueDay === today);
    return {
      code: pastDue ? "past_due" : dueToday ? "due_today" : "urgent",
      label: pastDue ? "Po termínu – zkontrolovat nutný krok" : dueToday ? "Termín je dnes" : "Nutná kontrola před předáním",
      actionLabel: "Zkontrolovat nutný krok",
      tone: "problem"
    };
  }

  const target = dataBoxPlusTriageTarget(message);
  if (target) {
    return {
      code: "suggested_route",
      label: `Doporučeno: ${target}`,
      actionLabel: "Zkontrolovat předání",
      tone: "prepared"
    };
  }

  const status = normalizeText(message.status);
  return {
    code: status.includes("nov") ? "new" : "open",
    label: status.includes("nov") ? "Nová zpráva" : "Čeká na zařazení",
    actionLabel: "Otevřít a zařadit",
    tone: "new"
  };
}

export function dataBoxPlusTriageQueueId(message = {}) {
  if (isDoneMessage(message)) return "done";
  if (blockerForMessage(message)) return "todo";
  if (isHandedMessage(message)) return "handed";
  return "todo";
}

export function dataBoxPlusTriageTarget(message = {}) {
  const assignedTo = String(message.assignedTo || "").trim();
  if (assignedTo) return assignedTo;
  const suggestion = String(message.recommendedAction || message.suggestedAction || "").trim();
  const normalized = normalizeText(suggestion);
  if (!suggestion || includesAny(normalized, ["chat s autopilotem", "vyresit v chatu", "otevrit zpravu"])) return "";
  return suggestion.replace(/[.!]+$/, "");
}

export function dataBoxPlusTriagePresentation(message = {}, options = {}) {
  const queueId = dataBoxPlusTriageQueueId(message);
  const today = options.today || pragueDay(options.now);
  if (queueId === "done") return donePresentation(message);
  if (queueId === "handed") return handedPresentation(message);
  return todoPresentation(message, today);
}

export function dataBoxPlusTriageItem(message = {}, options = {}) {
  const mailbox = options.mailbox || null;
  const queueId = dataBoxPlusTriageQueueId(message);
  const presentation = dataBoxPlusTriagePresentation(message, options);
  return {
    id: String(message.id || ""),
    mailboxId: String(message.mailboxId || ""),
    mailboxLabel: String(mailbox?.name || mailbox?.company || "Schránka"),
    senderName: String(message.senderName || "Datová schránka"),
    subject: String(message.subject || "Datová zpráva"),
    deliveredAt: String(message.deliveredAt || message.receivedAt || ""),
    dueDate: String(message.dueDate || ""),
    riskLevel: String(message.riskLevel || ""),
    priority: String(message.priority || ""),
    sourceStatus: String(message.status || ""),
    assignedTo: String(message.assignedTo || ""),
    attachmentStatus: String(message.attachmentStatus || ""),
    attachmentCount: Array.isArray(message.attachments) ? message.attachments.length : 0,
    isUnread: includesAny(normalizeText([message.readStatus, message.status].filter(Boolean).join(" ")), ["neprect", "nova", "new", "unread"]),
    target: dataBoxPlusTriageTarget(message),
    queueId,
    laneLabel: DATA_BOX_PLUS_TRIAGE_QUEUES.find((queue) => queue.id === queueId)?.label || "K vyřízení",
    microstate: presentation.code,
    microstateLabel: presentation.label,
    actionLabel: presentation.actionLabel,
    tone: presentation.tone,
    readOnly: true,
    persisted: false,
    derivationVersion: DATA_BOX_PLUS_TRIAGE_DERIVATION_VERSION,
    message
  };
}

export function dataBoxPlusTriageSort(items = [], queueId = "todo") {
  return [...items].sort((left, right) => {
    if (queueId === "done" || queueId === "handed") {
      return deliveredTime(right.message) - deliveredTime(left.message) || left.id.localeCompare(right.id, "cs");
    }

    const blockerRank = (item) => ({
      attachment_problem: 0,
      action_problem: 0,
      needs_recipient: 1,
      needs_vehicle: 1,
      needs_classification: 1,
      past_due: 2,
      due_today: 3,
      urgent: 4,
      new: 5,
      suggested_route: 6,
      open: 7
    }[item.microstate] ?? 8);
    const rankDifference = blockerRank(left) - blockerRank(right);
    if (rankDifference) return rankDifference;

    const leftDue = isoDay(left.dueDate) || "9999-12-31";
    const rightDue = isoDay(right.dueDate) || "9999-12-31";
    if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);

    const leftRisk = includesAny(normalizeText([left.riskLevel, left.priority].join(" ")), ["vysoke", "kriticke", "urgent", "pravni", "legal"]) ? 0 : 1;
    const rightRisk = includesAny(normalizeText([right.riskLevel, right.priority].join(" ")), ["vysoke", "kriticke", "urgent", "pravni", "legal"]) ? 0 : 1;
    if (leftRisk !== rightRisk) return leftRisk - rightRisk;

    return deliveredTime(left.message) - deliveredTime(right.message) || left.id.localeCompare(right.id, "cs");
  });
}

export function dataBoxPlusTriageItems(messages = [], mailboxes = [], options = {}) {
  const mailboxMap = new Map(mailboxes.map((mailbox) => [String(mailbox.id || ""), mailbox]));
  const mailboxId = String(options.mailboxId || "");
  const queueId = String(options.queueId || "");
  const query = normalizeText(options.query);
  const folder = String(options.folder || "received");
  const today = options.today || pragueDay(options.now);

  const items = messages
    .filter((message) => {
      const direction = normalizeText(message?.direction);
      if (folder === "sent" && direction !== "sent") return false;
      if (folder === "archive" && dataBoxPlusTriageQueueId(message) !== "done") return false;
      if (folder === "received" && direction && direction !== "received") return false;
      if (mailboxId && String(message?.mailboxId || "") !== mailboxId) return false;
      return true;
    })
    .map((message) => dataBoxPlusTriageItem(message, { mailbox: mailboxMap.get(String(message.mailboxId || "")), today }))
    .filter((item) => !queueId || item.queueId === queueId)
    .filter((item) => {
      if (!query) return true;
      return normalizeText([
        item.senderName,
        item.subject,
        item.mailboxLabel,
        item.microstateLabel,
        item.target,
        item.sourceStatus,
        item.riskLevel,
        item.priority
      ].join(" ")).includes(query);
    });

  return dataBoxPlusTriageSort(items, queueId || "todo");
}

export function dataBoxPlusTriageCounts(messages = [], mailboxes = [], options = {}) {
  const counts = { todo: 0, handed: 0, done: 0 };
  for (const item of dataBoxPlusTriageItems(messages, mailboxes, {
    mailboxId: options.mailboxId,
    folder: options.folder || "received",
    today: options.today,
    now: options.now
  })) {
    counts[item.queueId] += 1;
  }
  return counts;
}
