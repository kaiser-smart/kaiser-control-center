import {
  DataBoxIsdsError,
  dataBoxIsdsAccountFromCredentials,
  dataBoxIsdsAccountConfigs,
  dataBoxIsdsStatus,
  fetchDataBoxMessageAttachments,
  fetchDataBoxMessageMetadata,
  fetchDataBoxMessageMetadataPage,
  fetchDataBoxMessageSignedArchive,
  sendDataBoxIsdsMessage
} from "./data-box-isds-client.js";
import { communicationEmailIdentity } from "./communication-store.js";
import {
  customerMessagingStatus,
  normalizeCustomerPhone,
  sendCustomerMessage
} from "./customer-messaging-service.js";
import {
  DataBoxPlusOpenAiError,
  dataBoxPlusOpenAiStatus,
  dataBoxPlusSystemPrompt,
  interpretDataBoxPlusChat
} from "./data-box-plus-openai.js";
import { sendDataBoxForwardNotification } from "./notification-service.js";
import { buildDataBoxPlusChatContext } from "./data-box-plus-chat-context.js";
import { loadFleetVehiclesWithAssignments } from "./fleet-vehicles-store.js";
import {
  listDataBoxRcsNotifications,
  notifyNewDataBoxMessage
} from "./data-box-rcs-notifications.js";

const DATA_BOX_PLUS_SEND_TIMEOUT_MS = 25000;
const LEGACY_BOOTSTRAP_MAILBOX_COUNT = 7;
const MAX_MAILBOX_SLOT = 9999;
const ARCHIVE_RANGE_FROM = "2009-01-01T00:00:00.000Z";
const ARCHIVE_PAGE_LIMIT = 3;
const ARCHIVE_JOBS_PER_RUN = 3;
const DEFAULT_LIMIT = 100;
const MAILBOX_IDS = [
  "dbp-kaiser-servis",
  "dbp-kaiser-technology",
  "dbp-nanolab-plus",
  "dbp-nanolab-shop",
  "dbp-lefleur",
  "dbp-kaiserman-fond",
  "dbp-kaiser-holding"
];

const MAILBOX_NAMES = [
  "Kaiser servis",
  "Kaiser technology",
  "Nanolab plus",
  "Nanolab shop",
  "LeFleur",
  "Kaisermanuv nadacni fond",
  "Kaiser holding"
];

export class DataBoxPlusStoreError extends Error {
  constructor(message, status = 400, code = "data_box_plus_error") {
    super(message);
    this.name = "DataBoxPlusStoreError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizedPerson(value) {
  return cleanString(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function dataBoxPlusSelfReference(instruction) {
  const normalized = normalizedPerson(instruction).replace(/[^a-z0-9@]+/g, " ").trim();
  return ["muj email", "moje email", "muj mail", "moje mail", "na sebe", "sobe", "pro me"]
    .some((phrase) => normalized.includes(phrase));
}

function dataBoxPlusNoOperationInstruction(instruction) {
  const normalized = normalizedPerson(instruction).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return [
    "nic",
    "nic nedelej",
    "nic neprovadej",
    "ne",
    "nechci",
    "nech to",
    "nechci nic",
    "zrus to",
    "zrusit"
  ].includes(normalized);
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function limitValue(value, fallback = DEFAULT_LIMIT, max = 200) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
}

function idValue(prefix) {
  if (typeof crypto?.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function activeFlag(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["1", "true", "yes", "on", "active", "enabled", "aktivni", "aktivní"].includes(cleanString(value).toLowerCase());
}

function bytesToBase64(bytes) {
  const encoded = [];
  const chunkSize = 24_576;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength));
    let binary = "";
    for (const byte of chunk) binary += String.fromCharCode(byte);
    encoded.push(btoa(binary));
  }
  return encoded.join("");
}

export function dataBoxPlusBytesToBase64ForTest(bytes) {
  return bytesToBase64(bytes);
}

function base64ToBytes(value) {
  const binary = atob(cleanString(value));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function maskSecret(value) {
  const text = cleanString(value);
  if (!text) return "";
  if (text.length <= 4) return `${text[0] || ""}•••`;
  return `${text.slice(0, 2)}••••${text.slice(-2)}`;
}

function actorName(currentUser) {
  return cleanString(currentUser?.name || currentUser?.email || currentUser?.id || "system");
}

function normalizeEmail(value) {
  const email = cleanString(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

const DATA_BOX_PLUS_RECIPIENT_CHOICES = [
  { id: "faktury", label: "faktury@kaiserservis.cz", email: "faktury@kaiserservis.cz" },
  { id: "sarlota", label: "sarlota@kaiserservis.cz", email: "sarlota@kaiserservis.cz" },
  { id: "mzdova-ucetni", label: "mzdová účetní", email: "" },
  { id: "garazmistr", label: "garážmistr", email: "" },
  { id: "custom", label: "zadat jiný e-mail", email: "" }
];

function quoteInstruction(value) {
  return `„${cleanString(value)}“`;
}

function recipientChoicesPayload() {
  return DATA_BOX_PLUS_RECIPIENT_CHOICES.map((choice) => ({ ...choice }));
}

function sendReadiness(env = {}) {
  const emailProvider = cleanString(env.EMAIL_PROVIDER || (env.SENDGRID_API_KEY ? "sendgrid" : "")).toLowerCase();
  const emailIdentity = communicationEmailIdentity(env);
  const smsConfig = customerMessagingStatus(env);
  const openAi = dataBoxPlusOpenAiStatus(env);
  const emailReady = emailProvider === "sendgrid" && Boolean(emailIdentity.fromEmail && cleanString(env.SENDGRID_API_KEY || env.EMAIL_API_KEY));
  const gatewayReady = Boolean(
    cleanString(env.DATA_BOX_SEND_MESSAGE_ENDPOINT || env.DATA_BOX_REPLY_ENDPOINT || env.DATA_BOX_SEND_REPLY_ENDPOINT || env.KNF_DATA_BOX_REPLY_ENDPOINT)
    && cleanString(env.DATA_BOX_REPLY_API_KEY || env.KNF_DATA_BOX_REPLY_API_KEY)
  );
  const directIsdsReady = dataBoxIsdsStatus(env).configured;
  const dataBoxReady = directIsdsReady || gatewayReady;
  const smsReady = smsConfig.mode === "live" && smsConfig.twilioConfigured;

  return {
    gpt: {
      enabled: openAi.configured,
      label: openAi.configured ? "zapnuto" : "čeká na OpenAI",
      text: openAi.configured
        ? "Chat je napojený na serverové OpenAI Responses API. Akce vždy čeká na potvrzení člověka."
        : "Chybí serverový OPENAI_API_KEY. Bez něj GPT chat nic neprovede."
    },
    dataBox: {
      enabled: dataBoxReady,
      mode: directIsdsReady ? "direct-isds" : gatewayReady ? "gateway" : "unavailable",
      label: dataBoxReady ? "připojeno k ISDS" : "čeká na přístup ISDS",
      text: directIsdsReady
        ? "Odesílání je připravené přímo přes přihlášené produkční schránky ISDS."
        : gatewayReady
          ? "Odesílání je připravené přes kompatibilní serverovou DS bránu."
          : "Chybí aktivní přístup k odesílající datové schránce ISDS."
    },
    email: {
      enabled: emailReady,
      label: emailReady ? "zapnuto" : "čeká na mail provider",
      text: emailReady
        ? "E-mailové předání je napojené na serverový SendGrid a po jasném chatovém pokynu se odešle."
        : "Chybí produkční SendGrid nastavení. E-mail se bez něj neodešle."
    },
    sms: {
      enabled: smsReady,
      label: smsReady ? "zapnuto" : "čeká na SMS provider",
      text: smsReady
        ? "SMS odesílání má serverovou Kaiser Twilio Messaging Service v ostrém režimu."
        : smsConfig.twilioConfigured
          ? "Twilio je nastavené, ale ostré SMS odesílání není v režimu live."
          : "Chybí TWILIO_KAISER_MESSAGING_SERVICE_SID. Verify služba nestačí pro běžné ostré SMS odesílání."
    }
  };
}

function userId(currentUser) {
  return cleanString(currentUser?.id || currentUser?.email || currentUser?.name || "");
}

async function credentialCryptoKey(env) {
  const secret = cleanString(env.DATA_BOX_PLUS_CREDENTIALS_KEY);
  if (!secret) {
    throw new DataBoxPlusStoreError(
      "Chybí bezpečný klíč pro ukládání přístupů Datových schránek Plus.",
      503,
      "data_box_plus_credentials_key_missing"
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptCredential(env, value) {
  const text = cleanString(value);
  if (!text) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await credentialCryptoKey(env);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

async function decryptCredential(env, value) {
  const encrypted = cleanString(value);
  if (!encrypted) return "";
  const [version, ivValue, ciphertextValue] = encrypted.split(":");
  if (version !== "v1" || !ivValue || !ciphertextValue) {
    throw new DataBoxPlusStoreError("Přístup k datové schránce má neplatný bezpečnostní formát.", 500, "data_box_plus_credentials_invalid");
  }
  const key = await credentialCryptoKey(env);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivValue) },
    key,
    base64ToBytes(ciphertextValue)
  );
  return new TextDecoder().decode(plaintext);
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(cleanString(value));
  } catch {
    return fallback;
  }
}

function dataBoxPlusDatabase(env = {}, required = true) {
  const db = env.SMART_ODPADY_DB;
  if (!db && required) {
    throw new DataBoxPlusStoreError(
      "Datove schranky Plus cekaji na D1 binding SMART_ODPADY_DB.",
      503,
      "data_box_plus_database_missing"
    );
  }
  return db || null;
}

function dataBoxPlusDocumentsBucket(env = {}) {
  return env.SMART_ODPADY_DOCUMENTS || null;
}

function credentialTableMissing(error) {
  const message = cleanString(error?.message).toLowerCase();
  return message.includes("data_box_plus_credentials") && message.includes("no such table");
}

export function dataBoxPlusApiStatus(env = {}) {
  return dataBoxPlusDatabase(env, false) ? "ready" : "waiting";
}

function dbError(error) {
  const message = cleanString(error?.message);
  if (
    message.includes("no such table: data_box_plus_")
    || message.includes("D1_ERROR")
    || message.includes("SQLITE_ERROR")
  ) {
    return new DataBoxPlusStoreError(
      "Datove schranky Plus nemaji pripravene vlastni D1 tabulky. Spust migraci 0029_create_data_box_plus_tables.sql.",
      503,
      "data_box_plus_migration_missing"
    );
  }
  return new DataBoxPlusStoreError("Datove schranky Plus se ted nepodarilo nacist.", 500, "data_box_plus_store_failed");
}

function plusMailboxId(account = {}) {
  const slot = Math.max(1, numberValue(account.slot, 1));
  return MAILBOX_IDS[slot - 1] || `dbp-mailbox-${slot}`;
}

function plusMailboxName(account = {}) {
  const slot = Math.max(1, numberValue(account.slot, 1));
  return cleanString(account.label) || MAILBOX_NAMES[slot - 1] || `Datova schranka ${slot}`;
}

function sourceDataBoxIdForSlot(slot) {
  const normalizedSlot = numberValue(slot);
  if (normalizedSlot === 1) return "kaiser-primary";
  if (normalizedSlot > 1 && normalizedSlot <= 6) return `kaiser-data-box-${normalizedSlot}`;
  return "";
}

function isGenericMailboxLabel(value, slot) {
  const label = cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const normalizedSlot = numberValue(slot);
  return !label
    || label === `datova schranka ${normalizedSlot}`
    || label === "kaiser smart datova schranka";
}

function sourceLabelForRow(row, fallback = "", slot = 0) {
  const sourceLabel = cleanString(row?.source_data_box_label);
  if (sourceLabel && !isGenericMailboxLabel(sourceLabel, slot)) return sourceLabel;
  return cleanString(fallback);
}

function messageRecordId(mailboxId, direction, isdsMessageId) {
  const safeDirection = cleanString(direction || "received").toLowerCase() === "sent" ? "sent" : "received";
  return `${cleanString(mailboxId)}-${safeDirection}-${cleanString(isdsMessageId)}`;
}

function normalizeDirection(value) {
  return cleanString(value).toLowerCase() === "sent" ? "sent" : "received";
}

function searchText(parts) {
  return parts
    .filter((part) => part !== null && part !== undefined)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function safeFilename(value, fallback = "priloha") {
  const cleaned = cleanString(value)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function attachmentId(messageId, attachment, index) {
  const guid = cleanString(attachment.fileGuid);
  if (guid) return `${messageId}-${guid}`.slice(0, 180);
  return `${messageId}-att-${index + 1}`;
}

function bytesToText(bytes, contentType = "") {
  const type = cleanString(contentType).toLowerCase();
  if (!bytes || !bytes.byteLength || bytes.byteLength > 350000) return "";
  if (!type.includes("text") && !type.includes("xml") && !type.includes("json") && !type.includes("csv")) return "";
  try {
    return new TextDecoder("utf-8").decode(bytes).slice(0, 12000);
  } catch {
    return "";
  }
}

function classifyMessage(message = {}, attachmentState = {}) {
  const haystack = searchText([
    message.subject,
    message.senderName,
    attachmentState.extractedText
  ]);
  const facts = [];
  const addFact = (label, value) => {
    const cleaned = cleanString(value);
    if (cleaned) facts.push([label, cleaned]);
  };

  const amountMatch = haystack.match(/(\d[\d\s.,]{1,12})\s*(kc|czk|eur)/i);
  const variableSymbolMatch = haystack.match(/(?:variabilni symbol|vs|faktura)\s*[:#]?\s*(\d{4,12})/i);
  const caseMatch = cleanString(message.subject).match(/\b\d{1,4}\s*(?:ex|čj|cj)\s*[\w/-]+/i);

  if (amountMatch) addFact("Částka", `${amountMatch[1].replace(/\s+/g, " ").trim()} ${amountMatch[2].toUpperCase() === "KC" ? "Kč" : amountMatch[2].toUpperCase()}`);
  if (variableSymbolMatch) addFact("Variabilní symbol", variableSymbolMatch[1]);
  if (caseMatch) addFact("Číslo jednací / spis", caseMatch[0]);
  addFact("Odesílatel", message.senderName);

  const isCsszPayrollMessage =
    haystack.includes("jmhz") ||
    haystack.includes("jednotne mesicni hlaseni zamestnavatele") ||
    haystack.includes("cssz") ||
    haystack.includes("ceska sprava socialniho zabezpeceni") ||
    haystack.includes("e-podani") ||
    haystack.includes("podani bylo prijato") ||
    haystack.includes("odpoved na e-podani");
  if (isCsszPayrollMessage) {
    const hasHighRiskSignal =
      haystack.includes("sankc") ||
      haystack.includes("pokut") ||
      haystack.includes("lhut") ||
      haystack.includes("pravni") ||
      haystack.includes("financni narok");
    const hasMediumRiskSignal =
      hasHighRiskSignal ||
      haystack.includes("vyzv") ||
      haystack.includes("chyb") ||
      haystack.includes("odmit") ||
      haystack.includes("oprav") ||
      haystack.includes("povinnost") ||
      haystack.includes("doplnit");
    const riskLevel = hasHighRiskSignal ? "Vysoké" : hasMediumRiskSignal ? "Střední" : "Nízké";
    return {
      messageType: "Potvrzení o přijetí podání / mzdová agenda / ČSSZ",
      status: "Potřebuje pokyn",
      riskLevel,
      priority: hasHighRiskSignal ? "urgent" : hasMediumRiskSignal ? "high" : "low",
      priorityReason: hasMediumRiskSignal
        ? "Mzdová agenda ČSSZ obsahuje signál, který má ověřit člověk."
        : "Potvrzení o přijetí podání ČSSZ je běžná evidenční zpráva.",
      suggestedAction: hasMediumRiskSignal
        ? "Otevřít zprávu a předat mzdové účetní k ověření."
        : "Uložit k evidenci a případně předat mzdové účetní.",
      primaryAction: hasMediumRiskSignal ? "Předat mzdové účetní" : "Označit jako zpracované",
      facts,
      recommendationText: hasMediumRiskSignal
        ? "Zpráva se týká mzdové agendy ČSSZ a obsahuje signál k ověření. Doporučuji předat ji mzdové účetní."
        : "Zpráva potvrzuje přijetí podání ČSSZ. Doporučuji uložit ji k evidenci a případně předat mzdové účetní.",
      riskReason: hasMediumRiskSignal
        ? "Riziko je vyšší jen kvůli výzvě, chybě, odmítnutí, opravě, lhůtě, sankci nebo povinnosti něco doplnit."
        : "Nízké riziko: jde o potvrzení přijetí podání, ne o vozidlo ani lhůtu.",
      requiresConfirmation: false
    };
  }

  if (haystack.includes("exekutor") || haystack.includes("exekuc") || haystack.includes("soud") || haystack.includes("usneseni")) {
    return {
      messageType: "Exekuce / právní",
      status: "Potřebuje pokyn",
      riskLevel: "Vysoké",
      priority: "legal",
      priorityReason: "Právní dokument vyžaduje auditní stopu předání.",
      suggestedAction: "Exekuční dokument. Předat právníkovi / GT Brno.",
      primaryAction: "Předat",
      facts,
      recommendationText: "Zpráva vypadá jako právní dokument. Doporučuji předat ji právníkovi nebo GT Brno.",
      riskReason: "Právní zpráva potřebuje konkrétní pokyn.",
      requiresConfirmation: false
    };
  }

  if (haystack.includes("vyzva") || haystack.includes("pokut") || haystack.includes("uhrad") || haystack.includes("urcene castky")) {
    return {
      messageType: "Výzvy / pokuty",
      status: "Potřebuje pokyn",
      riskLevel: "Vysoké",
      priority: "urgent",
      priorityReason: "Finanční požadavek nebo lhůta může mít dopad na firmu.",
      suggestedAction: "Otevřít PDF a ověřit částku, lhůtu a důvod výzvy.",
      primaryAction: "Otevřít PDF",
      facts,
      recommendationText: "Zpráva obsahuje výzvu k úhradě. Doporučuji ověřit částku, lhůtu a důvod výzvy.",
      riskReason: "Finanční požadavek potřebuje konkrétní pokyn.",
      requiresConfirmation: false
    };
  }

  if (haystack.includes("upom") || haystack.includes("faktur") || haystack.includes("predzalob")) {
    return {
      messageType: haystack.includes("upom") ? "Upomínky" : "Faktury",
      status: "Potřebuje pokyn",
      riskLevel: "Střední",
      priority: "high",
      priorityReason: "Finanční požadavek čeká na předání účetnímu oddělení.",
      suggestedAction: "Zpráva vypadá jako faktura. Doporučuji předat na faktury.",
      primaryAction: "Odeslat pokyn",
      facts,
      recommendationText: "Zpráva vypadá jako faktura nebo upomínka. Doporučuji připravit e-mail na faktury.",
      riskReason: "Obsahuje finanční požadavek, proto potřebuje konkrétní pokyn.",
      requiresConfirmation: false
    };
  }

  if (haystack.includes("registr smluv") || haystack.includes("zverejneni smlouvy")) {
    return {
      messageType: "Registr smluv",
      status: "Potřebuje pokyn",
      riskLevel: "Nízké",
      priority: "low",
      priorityReason: "Známý informační typ podle schváleného playbooku.",
      suggestedAction: "Informace z Registru smluv. Pravděpodobně archivovat.",
      primaryAction: "Archivovat",
      facts,
      recommendationText: "Oznámení z Registru smluv vypadá jako informativní zpráva. Doporučuji archivovat.",
      riskReason: "Známý typ, ale čeká na chatový pokyn.",
      requiresConfirmation: false
    };
  }

  if (haystack.includes("vozid") || haystack.includes("technick") || haystack.includes("stk")) {
    return {
      messageType: "Vozidla",
      status: "Potřebuje pokyn",
      riskLevel: "Vysoké",
      priority: "high",
      priorityReason: "Provozní dopad na vozidlo nebo termín.",
      suggestedAction: "Zapsat lhůtu do kalendáře a předat garážmistrovi.",
      primaryAction: "Zadat lhůtu",
      facts,
      recommendationText: "Zpráva se týká vozidla nebo technické lhůty. Doporučuji předat garážmistrovi.",
      riskReason: "Provozní lhůta potřebuje konkrétní pokyn nebo vazbu.",
      requiresConfirmation: false
    };
  }

  if (attachmentState.problem) {
    return {
      messageType: "Oznámení ISDS",
      status: "Chybí příloha",
      riskLevel: "Vysoké",
      priority: "problem",
      priorityReason: "Přílohu se nepodařilo načíst.",
      suggestedAction: "Příloha není načtená. Zkusit znovu.",
      primaryAction: "Zkusit znovu načíst",
      facts,
      recommendationText: "Autopilot si není jistý, protože příloha zatím není přečtená. Doporučuji ruční kontrolu.",
      riskReason: "Bez přílohy nelze bezpečně rozhodnout.",
      requiresConfirmation: false
    };
  }

  return {
    messageType: "Oznámení ISDS",
    status: "Nové",
    riskLevel: "Střední",
    priority: "normal",
    priorityReason: "Nová datová zpráva čeká na první rozhodnutí.",
    suggestedAction: "Otevřít zprávu a ručně určit, zda jde o potvrzení, účetní/mzdovou agendu, nebo zprávu k archivaci.",
    primaryAction: "Otevřít zprávu",
    facts,
    recommendationText: "Autopilot zatím neví, jak tuto zprávu zařadit. Otevři ji a rozhodni ručně.",
    riskReason: "Nový typ zprávy se teprve učí.",
    requiresConfirmation: false
  };
}

function rowToMailbox(row, fallbackAccount = null) {
  if (!row) return null;
  const credentialId = cleanString(row.credential_id);
  const slot = numberValue(row.slot);
  const sourceLabel = sourceLabelForRow(row, MAILBOX_NAMES[slot - 1], slot);
  const name = isGenericMailboxLabel(row.name, slot)
    ? (sourceLabel || MAILBOX_NAMES[slot - 1] || cleanString(row.name))
    : cleanString(row.name);
  const company = isGenericMailboxLabel(row.company, slot)
    ? (sourceLabel || name)
    : cleanString(row.company || name);
  const credentialActive = row.credential_active === undefined || row.credential_active === null
    ? null
    : numberValue(row.credential_active) === 1;
  const fallbackConfigured = Boolean(fallbackAccount?.configured);
  const hasLogin = Boolean(row.username_ciphertext || fallbackAccount?.hasUsername || fallbackAccount?.username);
  const hasPassword = Boolean(row.password_ciphertext || fallbackAccount?.hasPassword || fallbackAccount?.password);
  const credentialSource = credentialId
    ? "DSP vault"
    : fallbackConfigured ? "Původní serverové secrets" : "";
  return {
    id: cleanString(row.id),
    name,
    company,
    isdsId: cleanString(row.isds_id || row.source_data_box_isds_id || fallbackAccount?.isdsId),
    slot,
    status: cleanString(row.connection_status || "waiting") === "ready" ? "aktivní" : "čeká na přístup",
    connectionStatus: cleanString(row.connection_status),
    lastSync: cleanString(row.last_sync_at),
    lastSyncStatus: cleanString(row.last_sync_status),
    lastSyncMessage: cleanString(row.last_sync_message),
    newCount: numberValue(row.new_count),
    dueCount: numberValue(row.due_count),
    problemCount: numberValue(row.problem_count),
    hasCredentials: credentialId ? Boolean(credentialActive && hasLogin && hasPassword) : fallbackConfigured,
    hasLogin,
    hasPassword,
    usernameMasked: cleanString(row.username_hint) || maskSecret(fallbackAccount?.username),
    passwordStatus: hasPassword ? "nastaveno" : "chybí",
    credentialSource,
    credentialUpdatedAt: cleanString(row.credential_updated_at),
    credentialRotatedAt: cleanString(row.last_rotated_at),
    credentialActive: credentialId ? credentialActive : fallbackConfigured,
    archive: {
      totalMessages: numberValue(row.archive_total_messages),
      verifiedMessages: numberValue(row.archive_verified_messages),
      errorMessages: numberValue(row.archive_error_messages),
      oldestMessageAt: cleanString(row.archive_oldest_message_at),
      jobsTotal: numberValue(row.archive_jobs_total),
      jobsCompleted: numberValue(row.archive_jobs_completed),
      jobsFailed: numberValue(row.archive_jobs_failed),
      discoveredMessages: numberValue(row.archive_discovered_messages),
      archivedMessages: numberValue(row.archive_job_archived_messages)
    }
  };
}

function fallbackAccountMap(env) {
  const map = new Map();
  for (const account of dataBoxIsdsAccountConfigs(env)) {
    map.set(numberValue(account.slot), account);
  }
  return map;
}

async function mailboxRowsWithCredentials(db) {
  try {
    const result = await db
      .prepare(`
        SELECT
          m.*,
          source_box.label AS source_data_box_label,
          source_box.isds_id AS source_data_box_isds_id,
          c.id AS credential_id,
          c.username_ciphertext,
          c.username_hint,
          c.password_ciphertext,
          c.active AS credential_active,
          c.updated_at AS credential_updated_at,
          c.last_rotated_at,
          c.source AS credential_source,
          (SELECT COUNT(*) FROM data_box_plus_messages am WHERE am.mailbox_id = m.id) AS archive_total_messages,
          (SELECT COUNT(*) FROM data_box_plus_archive_objects ao WHERE ao.mailbox_id = m.id AND ao.status = 'verified') AS archive_verified_messages,
          (SELECT COUNT(*) FROM data_box_plus_archive_objects ao WHERE ao.mailbox_id = m.id AND ao.status = 'error') AS archive_error_messages,
          (SELECT MIN(COALESCE(am.delivered_at, am.received_at, am.stored_at)) FROM data_box_plus_messages am WHERE am.mailbox_id = m.id) AS archive_oldest_message_at,
          (SELECT COUNT(*) FROM data_box_plus_archive_backfills ab WHERE ab.mailbox_id = m.id) AS archive_jobs_total,
          (SELECT COUNT(*) FROM data_box_plus_archive_backfills ab WHERE ab.mailbox_id = m.id AND ab.status = 'completed') AS archive_jobs_completed,
          (SELECT COUNT(*) FROM data_box_plus_archive_backfills ab WHERE ab.mailbox_id = m.id AND ab.status = 'failed') AS archive_jobs_failed,
          (SELECT COALESCE(SUM(ab.messages_discovered), 0) FROM data_box_plus_archive_backfills ab WHERE ab.mailbox_id = m.id) AS archive_discovered_messages,
          (SELECT COALESCE(SUM(ab.messages_archived), 0) FROM data_box_plus_archive_backfills ab WHERE ab.mailbox_id = m.id) AS archive_job_archived_messages
        FROM data_box_plus_mailboxes m
        LEFT JOIN data_box_plus_credentials c ON c.mailbox_id = m.id
        LEFT JOIN data_boxes source_box ON source_box.id = CASE
          WHEN m.slot = 1 THEN 'kaiser-primary'
          WHEN m.slot BETWEEN 2 AND 6 THEN 'kaiser-data-box-' || m.slot
          ELSE ''
        END
        ORDER BY m.slot ASC, m.name ASC
      `)
      .all();
    return result.results || [];
  } catch (error) {
    if (!credentialTableMissing(error)) throw error;
    const result = await db
      .prepare("SELECT * FROM data_box_plus_mailboxes ORDER BY slot ASC, name ASC")
      .all();
    return result.results || [];
  }
}

async function credentialRows(db) {
  try {
    const result = await db
      .prepare(`
        SELECT
          c.*,
          m.id AS mailbox_id,
          m.name,
          m.company,
          m.isds_id,
          m.slot AS mailbox_slot
        FROM data_box_plus_credentials c
        JOIN data_box_plus_mailboxes m ON m.id = c.mailbox_id
        WHERE c.active = 1
        ORDER BY c.slot ASC
      `)
      .all();
    return result.results || [];
  } catch (error) {
    if (credentialTableMissing(error)) return [];
    throw error;
  }
}

async function sourceDataBoxRows(db) {
  try {
    const result = await db
      .prepare(`
        SELECT
          box.id,
          box.label,
          COALESCE(
            NULLIF(box.isds_id, ''),
            (
              SELECT CASE
                WHEN message.direction = 'sent' THEN message.sender_box_id
                ELSE message.recipient_box_id
              END
              FROM data_box_messages message
              WHERE message.data_box_id = box.id
                AND CASE
                  WHEN message.direction = 'sent' THEN message.sender_box_id
                  ELSE message.recipient_box_id
                END <> ''
              ORDER BY COALESCE(message.delivered_at, message.accepted_at, message.stored_at) DESC
              LIMIT 1
            ),
            ''
          ) AS isds_id,
          box.last_sync_at,
          box.last_sync_status,
          box.last_sync_message
        FROM data_boxes box
      `)
      .all();
    return result.results || [];
  } catch (error) {
    const message = cleanString(error?.message).toLowerCase();
    if (message.includes("data_boxes") && message.includes("no such table")) return [];
    throw error;
  }
}

async function sourceDataBoxMap(db) {
  const map = new Map();
  for (const row of await sourceDataBoxRows(db)) {
    map.set(cleanString(row.id), row);
  }
  return map;
}

async function dataBoxPlusAccountConfigs(env) {
  const db = dataBoxPlusDatabase(env, true);
  const fallbackAccounts = dataBoxIsdsAccountConfigs(env);
  const rows = await credentialRows(db);
  const accounts = [];
  const usedSlots = new Set();

  for (const row of rows) {
    const slot = numberValue(row.slot || row.mailbox_slot);
    if (!slot || slot > MAX_MAILBOX_SLOT) continue;
    const username = await decryptCredential(env, row.username_ciphertext);
    const password = await decryptCredential(env, row.password_ciphertext);
    const account = dataBoxIsdsAccountFromCredentials(env, {
      slot,
      id: cleanString(row.mailbox_id),
      label: cleanString(row.name),
      isdsId: cleanString(row.isds_id),
      enabled: numberValue(row.active) === 1,
      username,
      password
    });
    if (account.configured) {
      accounts.push(account);
      usedSlots.add(slot);
    }
  }

  for (const account of fallbackAccounts) {
    const slot = numberValue(account.slot);
    if (!usedSlots.has(slot)) {
      accounts.push(account);
    }
  }

  return accounts
    .filter((account) => numberValue(account.slot) >= 1 && numberValue(account.slot) <= MAX_MAILBOX_SLOT)
    .sort((a, b) => numberValue(a.slot) - numberValue(b.slot));
}

async function dataBoxPlusSendingAccount(env, mailbox = {}) {
  const mailboxId = cleanString(mailbox.id || mailbox.mailboxId || mailbox.mailbox_id);
  const slot = numberValue(mailbox.slot);
  const accounts = await dataBoxPlusAccountConfigs(env);
  return accounts.find((account) => cleanString(account.id) === mailboxId)
    || accounts.find((account) => slot && numberValue(account.slot) === slot)
    || null;
}

function ensureReceivedDataBoxPlusMessage(message = {}) {
  if (normalizeDirection(message.direction) === "sent") {
    throw new DataBoxPlusStoreError(
      "Odeslané datové zprávy jsou pouze historie. AI ani pracovní akce se nad nimi nespouštějí.",
      409,
      "data_box_plus_sent_history_only"
    );
  }
}

function mailboxPayload(body = {}, fallback = {}) {
  const slot = numberValue(body.slot ?? fallback.slot);
  if (!slot || slot < 1 || slot > MAX_MAILBOX_SLOT) {
    throw new DataBoxPlusStoreError("Slot schránky musí být kladné celé číslo.", 400, "data_box_plus_mailbox_slot_invalid");
  }

  const name = cleanString(body.name ?? fallback.name);
  const company = cleanString(body.company ?? fallback.company ?? name);
  if (!name) {
    throw new DataBoxPlusStoreError("Doplň název schránky.", 400, "data_box_plus_mailbox_name_missing");
  }

  return {
    id: cleanString(body.id || fallback.id || MAILBOX_IDS[slot - 1] || `dbp-mailbox-${slot}`),
    slot,
    name,
    company: company || name,
    isdsId: cleanString(body.isdsId ?? body.isds_id ?? fallback.isds_id ?? fallback.isdsId),
    active: activeFlag(body.active, activeFlag(fallback.active, true))
  };
}

async function mailboxRowByIdOrSlot(db, id, slot = 0) {
  const mailboxId = cleanString(id);
  if (mailboxId) {
    const row = await db.prepare("SELECT * FROM data_box_plus_mailboxes WHERE id = ? LIMIT 1").bind(mailboxId).first();
    if (row) return row;
  }
  const slotNumber = numberValue(slot);
  if (slotNumber) {
    const row = await db.prepare("SELECT * FROM data_box_plus_mailboxes WHERE slot = ? LIMIT 1").bind(slotNumber).first();
    if (row) return row;
  }
  return null;
}

async function credentialRowByMailbox(db, mailboxId) {
  try {
    return await db
      .prepare("SELECT * FROM data_box_plus_credentials WHERE mailbox_id = ? LIMIT 1")
      .bind(cleanString(mailboxId))
      .first();
  } catch (error) {
    if (credentialTableMissing(error)) {
      throw new DataBoxPlusStoreError(
        "Chybí tabulka pro přístupy Datových schránek Plus. Spusť migraci 0030.",
        503,
        "data_box_plus_credentials_migration_missing"
      );
    }
    throw error;
  }
}

async function writeMailboxAudit(db, currentUser, actionType, payload = {}) {
  await db
    .prepare(`
      INSERT INTO data_box_plus_action_log (
        id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      idValue("dbp-action"),
      null,
      null,
      actorName(currentUser),
      actionType,
      JSON.stringify(payload),
      new Date().toISOString(),
      "saved",
      "Změna přístupů DSP byla zapsaná do historie. Heslo se do historie neukládá."
    )
    .run();
}

function rowToAttachment(row) {
  if (!row) return null;
  const sizeBytes = numberValue(row.size_bytes);
  return {
    id: cleanString(row.id),
    messageId: cleanString(row.message_id),
    fileName: cleanString(row.file_name),
    mimeType: cleanString(row.mime_type || "application/octet-stream"),
    size: sizeBytes ? `${Math.round(sizeBytes / 1024)} kB` : "neznámá",
    storageStatus: cleanString(row.storage_status || "Dostupná"),
    textExtractionStatus: cleanString(row.text_extraction_status || "Text zatím nenačten"),
    extractedText: cleanString(row.extracted_text),
    errorReason: cleanString(row.error_reason),
    openUrl: `/api/data-box-plus/messages/${encodeURIComponent(cleanString(row.message_id))}/attachments/${encodeURIComponent(cleanString(row.id))}`,
    downloadUrl: `/api/data-box-plus/messages/${encodeURIComponent(cleanString(row.message_id))}/attachments/${encodeURIComponent(cleanString(row.id))}?download=1`
  };
}

function rowToActionLog(row) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    messageId: cleanString(row.message_id),
    recommendationId: cleanString(row.recommendation_id),
    actor: cleanString(row.actor),
    actionType: cleanString(row.action_type),
    payload: safeJsonParse(row.action_payload, {}),
    createdAt: cleanString(row.created_at),
    result: cleanString(row.result),
    auditNote: cleanString(row.audit_note)
  };
}

function rowToDraftAttachment(row) {
  if (!row) return null;
  const sizeBytes = numberValue(row.size_bytes);
  return {
    id: cleanString(row.id),
    draftId: cleanString(row.draft_id),
    fileName: cleanString(row.file_name),
    mimeType: cleanString(row.mime_type || "application/octet-stream"),
    sizeBytes,
    size: sizeBytes ? `${Math.round(sizeBytes / 1024)} kB` : "0 kB",
    createdAt: cleanString(row.created_at)
  };
}

function rowToDraft(row, attachments = []) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    mailboxId: cleanString(row.mailbox_id),
    replyToMessageId: cleanString(row.reply_to_message_id),
    ownerUserId: cleanString(row.owner_user_id),
    recipientBoxId: cleanString(row.recipient_box_id),
    recipientName: cleanString(row.recipient_name),
    subject: cleanString(row.subject),
    body: cleanString(row.body),
    status: cleanString(row.status || "draft"),
    idempotencyKey: cleanString(row.idempotency_key),
    providerMessageId: cleanString(row.provider_message_id),
    errorMessage: cleanString(row.error_message),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
    sentAt: cleanString(row.sent_at),
    attachments: Array.isArray(attachments) ? attachments.filter(Boolean) : []
  };
}

function rowToMessage(row, attachments = [], actionLogs = [], notifications) {
  if (!row) return null;
  const facts = safeJsonParse(row.facts_json, []);
  return {
    id: cleanString(row.id),
    mailboxId: cleanString(row.mailbox_id),
    isdsMessageId: cleanString(row.isds_message_id),
    direction: cleanString(row.direction || "received"),
    senderName: cleanString(row.sender_name) || "Datová schránka",
    senderBoxId: cleanString(row.sender_box_id),
    recipientName: cleanString(row.recipient_name),
    recipientBoxId: cleanString(row.recipient_box_id),
    subject: cleanString(row.subject) || "Datová zpráva",
    deliveredAt: cleanString(row.delivered_at || row.received_at),
    receivedAt: cleanString(row.received_at || row.delivered_at),
    type: cleanString(row.message_type),
    messageType: cleanString(row.message_type),
    status: cleanString(row.status),
    riskLevel: cleanString(row.risk_level),
    priority: cleanString(row.priority),
    dueDate: cleanString(row.due_date),
    recommendedAction: cleanString(row.suggested_action),
    suggestedAction: cleanString(row.suggested_action),
    priorityReason: cleanString(row.priority_reason),
    primaryAction: cleanString(row.primary_action || "Otevřít zprávu"),
    assignedTo: cleanString(row.assigned_to),
    archiveStatus: cleanString(row.archive_status),
    attachmentStatus: cleanString(row.attachment_status || "Dostupná"),
    summaryLoaded: numberValue(row.summary_loaded) === 1,
    summary: cleanString(row.summary),
    summarySource: cleanString(row.summary_source),
    facts,
    attachmentCount: numberValue(row.attachment_count, Array.isArray(attachments) ? attachments.length : 0),
    attachments,
    history: Array.isArray(actionLogs) ? actionLogs.filter(Boolean) : [],
    ...(Array.isArray(notifications) ? { notifications: notifications.filter(Boolean) } : {})
  };
}

function rowToRecommendation(row) {
  if (!row) return null;
  const extractedData = safeJsonParse(row.extracted_facts, []);
  const instructionPlan = Array.isArray(extractedData)
    ? null
    : extractedData?.instructionPlan || null;
  return {
    id: cleanString(row.id),
    messageId: cleanString(row.message_id),
    text: cleanString(row.text),
    summary: cleanString(row.summary),
    extractedFacts: Array.isArray(extractedData) ? extractedData : Array.isArray(extractedData?.facts) ? extractedData.facts : [],
    instructionPlan,
    userInstruction: cleanString(instructionPlan?.userInstruction),
    recommendedAction: cleanString(row.recommended_action),
    risk: cleanString(row.risk_reason),
    riskReason: cleanString(row.risk_reason),
    confidence: numberValue(row.confidence),
    evidence: cleanString(row.evidence),
    similarCases: cleanString(row.similar_cases),
    afterConfirm: cleanString(row.after_confirm),
    humanReason: cleanString(row.human_reason),
    requiresConfirmation: numberValue(row.requires_confirmation) === 1,
    status: cleanString(row.status)
  };
}

function rowToRule(row) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    name: cleanString(row.name),
    description: cleanString(row.human_description),
    humanDescription: cleanString(row.human_description),
    looksFor: cleanString(row.conditions_text),
    conditions: cleanString(row.conditions_text),
    proposes: cleanString(row.proposed_action),
    proposedAction: cleanString(row.proposed_action),
    autonomous: cleanString(row.autonomy_level),
    autonomyLevel: cleanString(row.autonomy_level),
    confirmation: cleanString(row.confirmation_required),
    confirmationRequired: cleanString(row.confirmation_required),
    used: numberValue(row.success_count),
    successCount: numberValue(row.success_count),
    confirmed: numberValue(row.confirmed_count),
    confirmedCount: numberValue(row.confirmed_count),
    edited: numberValue(row.edit_count),
    editCount: numberValue(row.edit_count),
    rejected: numberValue(row.reject_count),
    rejectCount: numberValue(row.reject_count),
    lastUsed: cleanString(row.last_used_at),
    status: cleanString(row.status),
    trust: cleanString(row.status),
    type: cleanString(row.type || "Pravidlo")
  };
}

function rowToSyncRun(row) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    startedAt: cleanString(row.started_at),
    finishedAt: cleanString(row.finished_at),
    status: cleanString(row.status),
    triggerType: cleanString(row.trigger_type),
    mailboxCount: numberValue(row.mailbox_count),
    messagesFound: numberValue(row.messages_found),
    messagesDownloaded: numberValue(row.messages_downloaded),
    attachmentsDownloaded: numberValue(row.attachments_downloaded),
    errors: safeJsonParse(row.errors, [])
  };
}

async function ensureMailbox(db, account) {
  const id = plusMailboxId(account);
  const name = plusMailboxName(account);
  const isdsId = cleanString(account.isdsId);
  await db
    .prepare(`
      INSERT INTO data_box_plus_mailboxes (
        id, name, company, isds_id, slot, connection_status, last_sync_status, last_sync_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        company = excluded.company,
        isds_id = CASE WHEN excluded.isds_id <> '' THEN excluded.isds_id ELSE data_box_plus_mailboxes.isds_id END,
        slot = excluded.slot,
        connection_status = excluded.connection_status,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(
      id,
      name,
      name,
      isdsId,
      numberValue(account.slot),
      account.configured ? "ready" : "waiting",
      account.configured ? "waiting" : "configuration_missing",
      account.configured ? "Přístup je připravený pro automatické načítání." : "Chybí přístup k této datové schránce."
    )
    .run();
  const row = await db.prepare("SELECT * FROM data_box_plus_mailboxes WHERE id = ? LIMIT 1").bind(id).first();
  return rowToMailbox(row);
}

async function updateMailboxCounters(db, mailboxId) {
  const row = await db
    .prepare(`
      SELECT
        SUM(CASE WHEN status NOT IN ('Archivováno', 'Archivované', 'Vyřešeno', 'Odesláno e-mailem') THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN status IN ('Nové', 'Potřebuje pokyn', 'Potřebuje upřesnit', 'Potřebuje adresáta', 'Chybí vozidlo', 'Chybí příloha', 'Nelze provést') THEN 1 ELSE 0 END) AS due_count,
        SUM(CASE WHEN status IN ('Chybí vozidlo', 'Chybí příloha', 'Nelze provést') OR attachment_status LIKE 'Nepodařilo%' THEN 1 ELSE 0 END) AS problem_count
      FROM data_box_plus_messages
      WHERE mailbox_id = ?
        AND direction <> 'sent'
    `)
    .bind(mailboxId)
    .first();

  await db
    .prepare(`
      UPDATE data_box_plus_mailboxes
      SET new_count = ?, due_count = ?, problem_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(numberValue(row?.new_count), numberValue(row?.due_count), numberValue(row?.problem_count), mailboxId)
    .run();
}

async function upsertAttachment(db, bucket, messageId, mailboxId, attachment, index) {
  const id = attachmentId(messageId, attachment, index);
  const filename = safeFilename(attachment.filename, `priloha-${index + 1}`);
  const contentType = cleanString(attachment.contentType || "application/octet-stream");
  const bytes = attachment.bytes || null;
  const extractedText = bytesToText(bytes, contentType);
  let storageKey = "";
  let storageStatus = "Dostupná";
  let errorReason = "";

  if (bucket && bytes?.byteLength) {
    storageKey = `data-box-plus/${mailboxId}/${messageId}/${id}-${filename}`;
    try {
      await bucket.put(storageKey, bytes, {
        httpMetadata: { contentType }
      });
      storageStatus = "Stažená";
    } catch (error) {
      storageStatus = "Nepodařilo se stáhnout";
      errorReason = cleanString(error?.message || "Přílohu se nepodařilo uložit.");
    }
  } else if (!bucket) {
    storageStatus = "Vyžaduje ruční otevření";
    errorReason = "Úložiště příloh není dostupné.";
  }

  const textExtractionStatus = extractedText
    ? "Text načtený"
    : (contentType.includes("pdf") ? "Vyžaduje ruční otevření" : "Text zatím nenačten");

  await db
    .prepare(`
      INSERT INTO data_box_plus_attachments (
        id, message_id, file_name, mime_type, size_bytes, storage_key, storage_status,
        text_extraction_status, extracted_text, error_reason
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        file_name = excluded.file_name,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        storage_key = excluded.storage_key,
        storage_status = excluded.storage_status,
        text_extraction_status = excluded.text_extraction_status,
        extracted_text = excluded.extracted_text,
        error_reason = excluded.error_reason,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(
      id,
      messageId,
      filename,
      contentType,
      numberValue(attachment.sizeBytes),
      storageKey,
      storageStatus,
      textExtractionStatus,
      extractedText,
      errorReason
    )
    .run();

  return {
    downloaded: storageStatus === "Stažená" ? 1 : 0,
    problem: storageStatus === "Nepodařilo se stáhnout",
    extractedText
  };
}

async function syncAttachments(db, env, account, mailboxId, message, messageId) {
  const bucket = dataBoxPlusDocumentsBucket(env);
  if (!message?.hasAttachments) {
    return { status: "Dostupná", downloaded: 0, problem: false, extractedText: "" };
  }

  const storedRows = await db
    .prepare(`
      SELECT storage_key, storage_status, extracted_text
      FROM data_box_plus_attachments
      WHERE message_id = ?
      ORDER BY id
    `)
    .bind(messageId)
    .all();
  const storedAttachments = Array.isArray(storedRows?.results) ? storedRows.results : [];
  const fullyStored = storedAttachments.length > 0 && storedAttachments.every((attachment) => (
    cleanString(attachment.storage_key)
    && cleanString(attachment.storage_status) === "Stažená"
  ));
  if (fullyStored) {
    const extractedText = storedAttachments
      .map((attachment) => cleanString(attachment.extracted_text))
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 12000);
    return {
      status: extractedText ? "Text načtený" : "Stažená",
      downloaded: 0,
      problem: false,
      extractedText
    };
  }

  try {
    const detail = await fetchDataBoxMessageAttachments(env, account, message);
    let downloaded = 0;
    let problem = false;
    const textParts = [];
    for (const [index, attachment] of (detail.attachments || []).entries()) {
      const result = await upsertAttachment(db, bucket, messageId, mailboxId, attachment, index);
      downloaded += result.downloaded;
      problem = problem || result.problem;
      if (result.extractedText) textParts.push(result.extractedText);
    }
    if (!(detail.attachments || []).length) {
      return { status: "Dostupná", downloaded: 0, problem: false, extractedText: "" };
    }
    return {
      status: problem ? "Nepodařilo se stáhnout" : (textParts.length ? "Text načtený" : "Stažená"),
      downloaded,
      problem,
      extractedText: textParts.join("\n\n").slice(0, 12000)
    };
  } catch (error) {
    const errorReason = cleanString(error?.message || "Přílohu se nepodařilo načíst.");
    await db
      .prepare(`
        INSERT OR REPLACE INTO data_box_plus_attachments (
          id, message_id, file_name, mime_type, size_bytes, storage_status, text_extraction_status, error_reason
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(`${messageId}-attachment-problem`, messageId, "Příloha datové zprávy", "application/octet-stream", 0, "Nepodařilo se stáhnout", "Nepodařilo se přečíst", errorReason)
      .run();
    return { status: "Nepodařilo se stáhnout", downloaded: 0, problem: true, extractedText: "" };
  }
}

async function upsertRecommendation(db, messageId, classification, facts) {
  const id = `${messageId}-recommendation`;
  await db
    .prepare(`
      INSERT INTO data_box_plus_recommendations (
        id, message_id, text, summary, extracted_facts, recommended_action, risk_reason,
        confidence, evidence, similar_cases, after_confirm, human_reason, requires_confirmation, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        text = CASE WHEN data_box_plus_recommendations.status = 'waiting' THEN excluded.text ELSE data_box_plus_recommendations.text END,
        summary = excluded.summary,
        extracted_facts = excluded.extracted_facts,
        recommended_action = excluded.recommended_action,
        risk_reason = excluded.risk_reason,
        confidence = excluded.confidence,
        evidence = excluded.evidence,
        similar_cases = excluded.similar_cases,
        after_confirm = excluded.after_confirm,
        human_reason = excluded.human_reason,
        requires_confirmation = excluded.requires_confirmation,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(
      id,
      messageId,
      classification.recommendationText,
      classification.suggestedAction,
      JSON.stringify(facts),
      classification.suggestedAction,
      classification.riskReason,
      classification.riskLevel === "Nízké" ? 0.72 : 0.58,
      "Autopilot vychází z odesílatele, předmětu a dostupného textu příloh.",
      classification.riskLevel === "Nízké"
        ? "Podobné informační zprávy se obvykle archivují po kontrole."
        : "Podobné rizikové zprávy zatím vždy čekají na člověka.",
      "Chatový pokyn je příkaz k provedení. Když chybí údaj, systém řekne konkrétně který.",
      classification.riskReason,
      classification.requiresConfirmation ? 1 : 0,
      "waiting"
    )
    .run();
}

async function upsertMessage(db, env, account, mailbox, message) {
  const mailboxId = mailbox.id;
  const direction = normalizeDirection(message.direction);
  const isdsMessageId = cleanString(message.isdsMessageId);
  if (!isdsMessageId) return { state: "skipped", attachmentsDownloaded: 0 };

  const messageId = messageRecordId(mailboxId, direction, isdsMessageId);
  const existing = await db
    .prepare("SELECT id FROM data_box_plus_messages WHERE mailbox_id = ? AND isds_message_id = ? AND direction = ? LIMIT 1")
    .bind(mailboxId, isdsMessageId, direction)
    .first();
  const targetMessageId = existing?.id || messageId;

  const sentHistoryOnly = direction === "sent";
  let created = false;
  if (!existing?.id) {
    const insertResult = await db
      .prepare(`
        INSERT OR IGNORE INTO data_box_plus_messages (
          id, mailbox_id, isds_message_id, direction, sender_name, sender_box_id, recipient_name,
          recipient_box_id, subject, delivered_at, received_at, message_type, status, risk_level,
          priority, suggested_action, priority_reason, primary_action, attachment_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        messageId,
        mailboxId,
        isdsMessageId,
        direction,
        cleanString(message.senderName),
        cleanString(message.senderBoxId),
        cleanString(message.recipientName),
        cleanString(message.recipientBoxId),
        cleanString(message.subject),
        cleanString(message.deliveredAt),
        cleanString(message.acceptedAt || message.deliveredAt),
        sentHistoryOnly ? "Odeslaná zpráva" : "Oznámení ISDS",
        sentHistoryOnly ? "Odesláno" : "Nové",
        sentHistoryOnly ? "" : "Střední",
        "normal",
        sentHistoryOnly ? "" : "Otevřít zprávu a ručně určit, zda jde o potvrzení, účetní/mzdovou agendu, nebo zprávu k archivaci.",
        sentHistoryOnly ? "" : "Nová datová zpráva čeká na první rozhodnutí.",
        sentHistoryOnly ? "Otevřít" : "Otevřít zprávu",
        message?.hasAttachments ? "Text zatím nenačten" : "Dostupná"
      )
      .run();
    created = Number(insertResult?.meta?.changes ?? insertResult?.changes ?? 0) > 0;
  }

  if (created && direction === "received") {
    try {
      await notifyNewDataBoxMessage(env, {
        messageId,
        direction,
        mailboxName: cleanString(mailbox.name || mailbox.company),
        senderName: cleanString(message.senderName),
        subject: cleanString(message.subject),
        deliveredAt: cleanString(message.deliveredAt || message.acceptedAt)
      });
    } catch (error) {
      const reason = cleanString(error?.message || "RCS upozornění se nepodařilo připravit.").slice(0, 600);
      for (const recipientKey of ["radim-oplustil", "alena-trneckova"]) {
        await db.prepare(`
          INSERT INTO data_box_plus_action_log (
            id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
          ) VALUES (?, ?, NULL, 'system', 'RCS upozornění', ?, ?, 'failed', ?)
        `).bind(
          idValue("dbp-action"),
          messageId,
          JSON.stringify({ recipientKey }),
          new Date().toISOString(),
          reason
        ).run();
      }
    }
  }

  const waitsForDelivery = direction === "received"
    && cleanString(message.isdsState) === "1"
    && !cleanString(message.acceptedAt);
  const attachmentState = waitsForDelivery
    ? { status: "Čeká na doručení", downloaded: 0, problem: false, extractedText: "" }
    : await syncAttachments(db, env, account, mailboxId, message, messageId);
  await queueDataBoxPlusArchiveObject(db, mailboxId, targetMessageId, isdsMessageId, direction);
  if (waitsForDelivery) {
    await db.prepare(`
      UPDATE data_box_plus_archive_objects
      SET status = 'awaiting_delivery',
          error_code = 'data_box_plus_archive_waiting_for_delivery',
          error_message = 'Zpráva zatím není doručená. Archiv ji nesmí otevřením doručit za uživatele.',
          updated_at = CURRENT_TIMESTAMP
      WHERE mailbox_id = ? AND isds_message_id = ? AND direction = 'received'
    `).bind(mailboxId, isdsMessageId).run();
  }
  if (sentHistoryOnly) {
    await db
      .prepare(`
        UPDATE data_box_plus_messages
        SET
          mailbox_id = ?,
          isds_message_id = ?,
          direction = 'sent',
          sender_name = ?,
          sender_box_id = ?,
          recipient_name = ?,
          recipient_box_id = ?,
          subject = ?,
          delivered_at = ?,
          received_at = ?,
          message_type = 'Odeslaná zpráva',
          status = 'Odesláno',
          risk_level = '',
          priority = 'normal',
          due_date = '',
          suggested_action = '',
          priority_reason = '',
          primary_action = 'Otevřít',
          assigned_to = '',
          archive_status = 'active',
          attachment_status = ?,
          facts_json = '[]',
          summary = '',
          summary_source = '',
          summary_loaded = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        mailboxId,
        isdsMessageId,
        cleanString(message.senderName),
        cleanString(message.senderBoxId),
        cleanString(message.recipientName),
        cleanString(message.recipientBoxId),
        cleanString(message.subject),
        cleanString(message.deliveredAt),
        cleanString(message.acceptedAt || message.deliveredAt),
        attachmentState.status,
        targetMessageId
      )
      .run();
    await db.prepare(`
      UPDATE data_box_plus_recommendations
      SET status = 'closed_sent_history', updated_at = CURRENT_TIMESTAMP
      WHERE message_id = ?
    `).bind(targetMessageId).run();
    return { state: created ? "created" : "updated", attachmentsDownloaded: attachmentState.downloaded };
  }
  const classification = classifyMessage(message, attachmentState);
  const facts = classification.facts || [];
  const summaryLoaded = Boolean(attachmentState.extractedText);
  const summary = summaryLoaded
    ? `${classification.suggestedAction} Shrnutí vychází z textově čitelné přílohy.`
    : "";
  const summarySource = summaryLoaded ? "Shrnutí vychází z textu přílohy uložené v Datových schránkách Plus." : "";

  const values = [
    mailboxId,
    isdsMessageId,
    direction,
    cleanString(message.senderName),
    cleanString(message.senderBoxId),
    cleanString(message.recipientName),
    cleanString(message.recipientBoxId),
    cleanString(message.subject),
    cleanString(message.deliveredAt),
    cleanString(message.acceptedAt || message.deliveredAt),
    classification.messageType,
    classification.status,
    classification.riskLevel,
    classification.priority,
    "",
    classification.suggestedAction,
    classification.priorityReason,
    classification.primaryAction,
    "",
    classification.status === "Archivované" ? "archived" : "active",
    attachmentState.status,
    JSON.stringify(facts),
    summary,
    summarySource,
    summaryLoaded ? 1 : 0
  ];

  await db
    .prepare(`
      UPDATE data_box_plus_messages
      SET
        mailbox_id = ?,
        isds_message_id = ?,
        direction = ?,
        sender_name = ?,
        sender_box_id = ?,
        recipient_name = ?,
        recipient_box_id = ?,
        subject = ?,
        delivered_at = ?,
        received_at = ?,
        message_type = ?,
        status = CASE WHEN archive_status = 'archived' THEN status ELSE ? END,
        risk_level = ?,
        priority = ?,
        due_date = ?,
        suggested_action = ?,
        priority_reason = ?,
        primary_action = ?,
        assigned_to = CASE WHEN assigned_to <> '' THEN assigned_to ELSE ? END,
        archive_status = CASE WHEN archive_status = 'archived' THEN archive_status ELSE ? END,
        attachment_status = ?,
        facts_json = ?,
        summary = ?,
        summary_source = ?,
        summary_loaded = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(...values, targetMessageId)
    .run();
  await upsertRecommendation(db, targetMessageId, classification, facts);
  return { state: created ? "created" : "updated", attachmentsDownloaded: attachmentState.downloaded };
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function queueDataBoxPlusArchiveObject(db, mailboxId, messageId, isdsMessageId, direction) {
  const archiveId = `${cleanString(mailboxId)}-${normalizeDirection(direction)}-${cleanString(isdsMessageId)}`;
  await db
    .prepare(`
      INSERT INTO data_box_plus_archive_objects (
        id, mailbox_id, message_id, isds_message_id, direction, status
      )
      VALUES (?, ?, ?, ?, ?, 'pending')
      ON CONFLICT(mailbox_id, isds_message_id, direction) DO UPDATE SET
        message_id = excluded.message_id,
        status = CASE
          WHEN data_box_plus_archive_objects.status = 'awaiting_delivery' THEN 'pending'
          ELSE data_box_plus_archive_objects.status
        END,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(archiveId, mailboxId, messageId, isdsMessageId, normalizeDirection(direction))
    .run();
}

async function putImmutableArchiveObject(bucket, key, bytes, sha256, contentType) {
  if (!bucket) {
    throw new DataBoxPlusStoreError(
      "Archivní R2 úložiště SMART_ODPADY_DOCUMENTS není dostupné.",
      503,
      "data_box_plus_archive_bucket_missing"
    );
  }
  const existing = await bucket.head(key);
  const existingHash = cleanString(existing?.customMetadata?.sha256);
  if (existing && existingHash === sha256) {
    return { key, stored: false };
  }
  const targetKey = existing ? key.replace(/\.zfo$/i, `.${sha256}.zfo`) : key;
  const version = await bucket.head(targetKey);
  if (!version) {
    await bucket.put(targetKey, bytes, {
      httpMetadata: { contentType },
      customMetadata: { sha256 }
    });
  } else if (cleanString(version.customMetadata?.sha256) !== sha256) {
    throw new DataBoxPlusStoreError(
      "Archivní objekt na stejné adrese má jiný kontrolní otisk.",
      409,
      "data_box_plus_archive_hash_conflict"
    );
  }
  return { key: targetKey, stored: !version };
}

async function archiveDataBoxPlusMessage(db, env, account, mailbox, message) {
  const direction = normalizeDirection(message.direction);
  const isdsMessageId = cleanString(message.isdsMessageId);
  const messageId = messageRecordId(mailbox.id, direction, isdsMessageId);
  if (
    direction === "received"
    && cleanString(message.isdsState) === "1"
    && !cleanString(message.acceptedAt)
  ) {
    await queueDataBoxPlusArchiveObject(db, mailbox.id, messageId, isdsMessageId, direction);
    await db.prepare(`
      UPDATE data_box_plus_archive_objects
      SET status = 'awaiting_delivery',
          error_code = 'data_box_plus_archive_waiting_for_delivery',
          error_message = 'Zpráva zatím není doručená. Archiv ji nesmí otevřením doručit za uživatele.',
          updated_at = CURRENT_TIMESTAMP
      WHERE mailbox_id = ? AND isds_message_id = ? AND direction = ?
    `).bind(mailbox.id, isdsMessageId, direction).run();
    return { archived: false, verified: false, deferred: true };
  }
  const existing = await db
    .prepare(`
      SELECT status, verified_at
      FROM data_box_plus_archive_objects
      WHERE mailbox_id = ? AND isds_message_id = ? AND direction = ?
      LIMIT 1
    `)
    .bind(mailbox.id, isdsMessageId, direction)
    .first();
  if (cleanString(existing?.status) === "verified" && cleanString(existing?.verified_at)) {
    return { archived: false, verified: true };
  }

  await queueDataBoxPlusArchiveObject(db, mailbox.id, messageId, isdsMessageId, direction);
  try {
    const signed = await fetchDataBoxMessageSignedArchive(env, account, message);
    const messageHash = await sha256Hex(signed.messageZfo);
    const deliveryHash = await sha256Hex(signed.deliveryZfo);
    const prefix = `data-box-plus/archive/${mailbox.id}/${direction}/${isdsMessageId}`;
    const bucket = dataBoxPlusDocumentsBucket(env);
    const messageStored = await putImmutableArchiveObject(
      bucket,
      `${prefix}/message.zfo`,
      signed.messageZfo,
      messageHash,
      "application/vnd.software602.filler.form-xml-zip"
    );
    const deliveryStored = await putImmutableArchiveObject(
      bucket,
      `${prefix}/delivery.zfo`,
      signed.deliveryZfo,
      deliveryHash,
      "application/vnd.software602.filler.form-xml-zip"
    );
    const archivedAt = new Date().toISOString();
    await db
      .prepare(`
        UPDATE data_box_plus_archive_objects
        SET message_storage_key = ?, message_sha256 = ?, message_size_bytes = ?,
            delivery_storage_key = ?, delivery_sha256 = ?, delivery_size_bytes = ?,
            status = 'verified', error_code = NULL, error_message = NULL,
            archived_at = COALESCE(archived_at, ?), verified_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE mailbox_id = ? AND isds_message_id = ? AND direction = ?
      `)
      .bind(
        messageStored.key,
        messageHash,
        signed.messageZfo.byteLength,
        deliveryStored.key,
        deliveryHash,
        signed.deliveryZfo.byteLength,
        archivedAt,
        archivedAt,
        mailbox.id,
        isdsMessageId,
        direction
      )
      .run();
    return { archived: true, verified: true };
  } catch (error) {
    await db
      .prepare(`
        UPDATE data_box_plus_archive_objects
        SET status = 'error', error_code = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE mailbox_id = ? AND isds_message_id = ? AND direction = ?
      `)
      .bind(
        cleanString(error?.code || "data_box_plus_archive_failed"),
        cleanString(error?.message || "Podepsaný archiv zprávy se nepodařilo uložit.").slice(0, 500),
        mailbox.id,
        isdsMessageId,
        direction
      )
      .run();
    throw error;
  }
}

async function ensureDataBoxPlusArchiveBackfills(db, env, accounts, rangeTo = new Date().toISOString()) {
  let created = 0;
  for (const account of accounts) {
    const mailbox = await ensureMailbox(db, account);
    for (const direction of ["received", "sent"]) {
      const existing = await db
        .prepare(`
          SELECT id FROM data_box_plus_archive_backfills
          WHERE mailbox_id = ? AND direction = ?
          LIMIT 1
        `)
        .bind(mailbox.id, direction)
        .first();
      if (existing?.id) continue;
      await db
        .prepare(`
          INSERT INTO data_box_plus_archive_backfills (
            id, mailbox_id, direction, range_from, range_to, next_offset, page_limit, status
          )
          VALUES (?, ?, ?, ?, ?, 1, ?, 'pending')
        `)
        .bind(
          idValue("dbp-archive-backfill"),
          mailbox.id,
          direction,
          ARCHIVE_RANGE_FROM,
          rangeTo,
          ARCHIVE_PAGE_LIMIT
        )
        .run();
      created += 1;
    }
  }
  return created;
}

async function archivePendingObjects(db, env, accounts, limit = ARCHIVE_PAGE_LIMIT) {
  const result = await db
    .prepare(`
      SELECT a.*, m.slot
      FROM data_box_plus_archive_objects a
      JOIN data_box_plus_mailboxes m ON m.id = a.mailbox_id
      WHERE a.status IN ('pending', 'error')
      ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END, a.updated_at ASC
      LIMIT ?
    `)
    .bind(limit)
    .all();
  let archived = 0;
  const errors = [];
  for (const row of result.results || []) {
    const account = accounts.find((item) => cleanString(item.id) === cleanString(row.mailbox_id))
      || accounts.find((item) => numberValue(item.slot) === numberValue(row.slot));
    if (!account) continue;
    try {
      const outcome = await archiveDataBoxPlusMessage(db, env, account, { id: row.mailbox_id }, {
        isdsMessageId: row.isds_message_id,
        direction: row.direction
      });
      if (outcome.archived) archived += 1;
    } catch (error) {
      errors.push({
        mailboxId: row.mailbox_id,
        messageId: row.isds_message_id,
        code: cleanString(error?.code || "data_box_plus_archive_failed"),
        message: cleanString(error?.message || "Archivace zprávy selhala.")
      });
    }
  }
  return { archived, errors };
}

export async function runDataBoxPlusArchiveBatch(env, currentUser = null, options = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const accounts = await dataBoxPlusAccountConfigs(env);
  await ensureDataBoxPlusMailboxes(env);
  const jobsCreated = await ensureDataBoxPlusArchiveBackfills(db, env, accounts);
  const pending = await archivePendingObjects(db, env, accounts);
  const jobsResult = await db
    .prepare(`
      SELECT *
      FROM data_box_plus_archive_backfills
      WHERE status IN ('pending', 'running', 'failed')
        AND consecutive_errors < 5
      ORDER BY CASE WHEN status = 'running' THEN 0 WHEN status = 'pending' THEN 1 ELSE 2 END,
               updated_at ASC
      LIMIT ?
    `)
    .bind(limitValue(options.jobsPerRun, ARCHIVE_JOBS_PER_RUN, 10))
    .all();
  const errors = [...pending.errors];
  let messagesDiscovered = 0;
  let messagesArchived = pending.archived;
  let jobsCompleted = 0;

  for (const job of jobsResult.results || []) {
    const mailbox = await db
      .prepare("SELECT * FROM data_box_plus_mailboxes WHERE id = ? LIMIT 1")
      .bind(job.mailbox_id)
      .first();
    const account = accounts.find((item) => cleanString(item.id) === cleanString(job.mailbox_id))
      || accounts.find((item) => numberValue(item.slot) === numberValue(mailbox?.slot));
    if (!account) continue;
    const startedAt = cleanString(job.started_at) || new Date().toISOString();
    await db.prepare(`
      UPDATE data_box_plus_archive_backfills
      SET status = 'running', started_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(startedAt, job.id).run();
    try {
      const page = await fetchDataBoxMessageMetadataPage(env, account, {
        direction: job.direction,
        fromTime: job.range_from,
        toTime: job.range_to,
        offset: numberValue(job.next_offset, 1),
        limit: limitValue(job.page_limit, ARCHIVE_PAGE_LIMIT, 100)
      });
      let archivedOnPage = 0;
      for (const message of page.messages) {
        const upserted = await upsertMessage(db, env, account, rowToMailbox(mailbox), message);
        const outcome = await archiveDataBoxPlusMessage(db, env, account, rowToMailbox(mailbox), message);
        if (outcome.archived) archivedOnPage += 1;
        void upserted;
      }
      const completed = !page.hasMore;
      await db.prepare(`
        UPDATE data_box_plus_archive_backfills
        SET next_offset = ?, status = ?, messages_discovered = messages_discovered + ?,
            messages_archived = messages_archived + ?, consecutive_errors = 0,
            last_error_code = NULL, last_error_message = NULL,
            finished_at = CASE WHEN ? = 1 THEN ? ELSE NULL END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        page.nextOffset,
        completed ? "completed" : "running",
        page.messages.length,
        archivedOnPage,
        completed ? 1 : 0,
        completed ? new Date().toISOString() : null,
        job.id
      ).run();
      messagesDiscovered += page.messages.length;
      messagesArchived += archivedOnPage;
      if (completed) jobsCompleted += 1;
      await updateMailboxCounters(db, mailbox.id);
    } catch (error) {
      errors.push({
        jobId: job.id,
        mailboxId: job.mailbox_id,
        direction: job.direction,
        code: cleanString(error?.code || "data_box_plus_archive_backfill_failed"),
        message: cleanString(error?.message || "Historický archiv se nepodařilo doplnit.")
      });
      await db.prepare(`
        UPDATE data_box_plus_archive_backfills
        SET status = 'failed', error_count = error_count + 1,
            consecutive_errors = consecutive_errors + 1,
            last_error_code = ?, last_error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        cleanString(error?.code || "data_box_plus_archive_backfill_failed"),
        cleanString(error?.message || "Historický archiv se nepodařilo doplnit.").slice(0, 500),
        job.id
      ).run();
    }
  }

  return {
    apiStatus: "ready",
    mailboxScope: "all-current-and-future",
    jobsCreated,
    jobsProcessed: (jobsResult.results || []).length,
    jobsCompleted,
    messagesDiscovered,
    messagesArchived,
    errors,
    triggeredBy: actorName(currentUser),
    message: errors.length
      ? "Vlastní archiv pokračuje; část položek čeká na bezpečné opakování."
      : "Vlastní archiv zpracoval další obnovitelnou dávku."
  };
}

async function createSyncRun(db, startedAt, triggerType, currentUser) {
  const id = idValue("dbp-sync");
  await db
    .prepare(`
      INSERT INTO data_box_plus_sync_runs (id, started_at, status, trigger_type, created_by_user_id)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(id, startedAt, "running", triggerType, cleanString(currentUser?.id))
    .run();
  return id;
}

async function closeStaleSyncRuns(db, startedAt) {
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) return;
  const staleBefore = new Date(startedAtMs - 45 * 60 * 1000).toISOString();
  await db
    .prepare(`
      UPDATE data_box_plus_sync_runs
      SET finished_at = ?,
          status = 'failed',
          errors = ?
      WHERE status = 'running'
        AND started_at < ?
    `)
    .bind(
      startedAt,
      JSON.stringify([{
        code: "data_box_plus_sync_stale",
        message: "Předchozí synchronizace nedokončila audit v bezpečném časovém limitu."
      }]),
      staleBefore
    )
    .run();
}

async function finishSyncRun(db, id, patch) {
  await db
    .prepare(`
      UPDATE data_box_plus_sync_runs
      SET finished_at = ?, status = ?, mailbox_count = ?, messages_found = ?,
          messages_downloaded = ?, attachments_downloaded = ?, errors = ?
      WHERE id = ?
    `)
    .bind(
      patch.finishedAt,
      patch.status,
      numberValue(patch.mailboxCount),
      numberValue(patch.messagesFound),
      numberValue(patch.messagesDownloaded),
      numberValue(patch.attachmentsDownloaded),
      JSON.stringify(patch.errors || []),
      id
    )
    .run();
}

export async function ensureDataBoxPlusMailboxes(env) {
  const db = dataBoxPlusDatabase(env, true);
  const isds = dataBoxIsdsStatus(env);
  const configuredAccounts = dataBoxIsdsAccountConfigs(env);
  const fallbackMap = fallbackAccountMap(env);
  const sourceBoxes = await sourceDataBoxMap(db);
  const visibleAccounts = isds.accounts?.length ? isds.accounts : [];
  const accounts = visibleAccounts.length
    ? visibleAccounts.map((account) => ({
      ...account,
      configured: configuredAccounts.some((configured) => configured.slot === account.slot)
    }))
    : [];

  for (let slot = 1; slot <= LEGACY_BOOTSTRAP_MAILBOX_COUNT; slot += 1) {
    const sourceBox = sourceBoxes.get(sourceDataBoxIdForSlot(slot));
    const account = accounts.find((item) => item.slot === slot) || {
      slot,
      label: MAILBOX_NAMES[slot - 1],
      isdsId: "",
      configured: false
    };
    await ensureMailbox(db, {
      ...account,
      label: sourceLabelForRow({
        source_data_box_label: sourceBox?.label
      }, MAILBOX_NAMES[slot - 1] || account.label, slot),
      isdsId: cleanString(sourceBox?.isds_id || account.isdsId)
    });
  }

  const rows = await mailboxRowsWithCredentials(db);
  for (const row of rows) {
    const fallback = fallbackMap.get(numberValue(row.slot));
    const hasVault = Boolean(row.credential_id);
    const ready = hasVault
      ? numberValue(row.credential_active) === 1 && Boolean(row.username_ciphertext && row.password_ciphertext)
      : Boolean(fallback?.configured);
    await db
      .prepare(`
        UPDATE data_box_plus_mailboxes
        SET connection_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND connection_status IN ('waiting', 'configuration_missing')
      `)
      .bind(ready ? "ready" : "waiting", cleanString(row.id))
      .run();
  }
}

export async function getDataBoxPlusStatus(env) {
  const db = dataBoxPlusDatabase(env, true);
  try {
    await ensureDataBoxPlusMailboxes(env);
    const fallbackMap = fallbackAccountMap(env);
    const mailboxRows = await mailboxRowsWithCredentials(db);
    const syncRow = await db
      .prepare("SELECT * FROM data_box_plus_sync_runs ORDER BY started_at DESC LIMIT 1")
      .first();
    const waitingRow = await db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM data_box_plus_recommendations r
        JOIN data_box_plus_messages m ON m.id = r.message_id
        WHERE r.status = 'waiting' AND m.direction <> 'sent'
      `)
      .first();
    const confirmedRow = await db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM data_box_plus_recommendations r
        JOIN data_box_plus_messages m ON m.id = r.message_id
        WHERE r.status = 'confirmed' AND m.direction <> 'sent'
      `)
      .first();
    const learnedPatternsRow = await db
      .prepare("SELECT COUNT(*) AS count FROM data_box_plus_rules WHERE type = 'Učící vzor'")
      .first();
    const pendingPatternsRow = await db
      .prepare("SELECT COUNT(*) AS count FROM data_box_plus_rules WHERE type = 'Učící vzor' AND status IN ('Nové pravidlo', 'Učí se')")
      .first();
    const newRow = await db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM data_box_plus_messages
        WHERE archive_status <> 'archived'
          AND direction <> 'sent'
          AND status IN ('Nové', 'Potřebuje pokyn', 'Potřebuje upřesnit', 'Potřebuje adresáta', 'Chybí vozidlo', 'Chybí příloha', 'Nelze provést')
      `)
      .first();
    const unresolvedRow = await db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM data_box_plus_messages
        WHERE archive_status <> 'archived'
          AND direction <> 'sent'
          AND status NOT IN ('Archivováno', 'Archivované', 'Vyřešeno', 'Odesláno e-mailem')
      `)
      .first();
    return {
      apiStatus: "ready",
      expectedMailboxes: mailboxRows.length,
      mailboxScope: "all-current-and-future",
      mailboxes: mailboxRows.map((row) => rowToMailbox(row, fallbackMap.get(numberValue(row.slot)))),
      isds: dataBoxIsdsStatus(env),
      latestSyncRun: rowToSyncRun(syncRow),
      waitingRecommendations: numberValue(waitingRow?.count),
      summary: {
        newCount: numberValue(newRow?.count),
        unresolvedCount: numberValue(unresolvedRow?.count),
        waitingRecommendations: numberValue(waitingRow?.count)
      },
      learning: {
        confirmedDecisions: numberValue(confirmedRow?.count),
        learnedPatterns: numberValue(learnedPatternsRow?.count),
        pendingPatterns: numberValue(pendingPatternsRow?.count),
        strongAreas: ["Faktury", "Registr smluv", "ČSSZ"]
      },
      sendReadiness: (() => {
        const readiness = sendReadiness(env);
        const directMailboxReady = mailboxRows.some((row) => {
          const fallback = fallbackMap.get(numberValue(row.slot));
          return Boolean(rowToMailbox(row, fallback)?.hasCredentials);
        });
        return directMailboxReady
          ? {
              ...readiness,
              dataBox: {
                enabled: true,
                mode: "direct-isds",
                label: "připojeno k ISDS",
                text: "Odesílání je připravené přímo přes přihlášené produkční schránky ISDS."
              }
            }
          : readiness;
      })(),
      aiPrompt: {
        source: "server",
        editable: false,
        model: dataBoxPlusOpenAiStatus(env).model,
        text: dataBoxPlusSystemPrompt()
      },
      background: {
        intervalMinutes: 60,
        enabled: cleanString(env.DATA_BOX_PLUS_BACKGROUND_ENABLED || "true") !== "false",
        note: "Automatické načítání běží serverově každou celou hodinu."
      }
    };
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function runDataBoxPlusSync(env, currentUser = null, options = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const startedAt = new Date().toISOString();
  const triggerType = cleanString(options.triggerType || "background");
  await closeStaleSyncRuns(db, startedAt);
  const syncRunId = await createSyncRun(db, startedAt, triggerType, currentUser);
  const errors = [];
  let mailboxCount = 0;
  let messagesFound = 0;
  let messagesDownloaded = 0;
  let attachmentsDownloaded = 0;

  try {
    const accounts = await dataBoxPlusAccountConfigs(env);
    if (!accounts.length) {
      errors.push({ message: "Chybí přístup k datovým schránkám.", code: "data_box_plus_isds_missing" });
    }
    await ensureDataBoxPlusMailboxes(env);

    for (const account of accounts) {
      const mailbox = await ensureMailbox(db, account);
      mailboxCount += 1;
      try {
        const metadata = await fetchDataBoxMessageMetadata(env, account);
        messagesFound += numberValue(metadata.messages?.length);
        for (const message of metadata.messages || []) {
          const result = await upsertMessage(db, env, account, mailbox, message);
          if (result.state === "created" || result.state === "updated") messagesDownloaded += 1;
          attachmentsDownloaded += numberValue(result.attachmentsDownloaded);
        }
        const finished = new Date().toISOString();
        await db
          .prepare(`
            UPDATE data_box_plus_mailboxes
            SET connection_status = 'ready',
                last_sync_at = ?,
                last_sync_status = 'success',
                last_sync_message = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(finished, `Načteno ${metadata.messages?.length || 0} obálek zpráv.`, mailbox.id)
          .run();
        await updateMailboxCounters(db, mailbox.id);
      } catch (error) {
        errors.push({
          mailboxId: mailbox.id,
          message: cleanString(error?.message || "Datovou schránku se nepodařilo načíst."),
          code: cleanString(error?.code || "data_box_plus_sync_failed")
        });
        await db
          .prepare(`
            UPDATE data_box_plus_mailboxes
            SET connection_status = 'error',
                last_sync_at = ?,
                last_sync_status = 'failed',
                last_sync_message = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(new Date().toISOString(), cleanString(error?.message || "Načtení selhalo."), mailbox.id)
          .run();
      }
    }

    const status = errors.length && !messagesDownloaded ? "failed" : (errors.length ? "partial" : "success");
    await finishSyncRun(db, syncRunId, {
      finishedAt: new Date().toISOString(),
      status,
      mailboxCount,
      messagesFound,
      messagesDownloaded,
      attachmentsDownloaded,
      errors
    });

    return {
      apiStatus: "ready",
      syncRunId,
      status,
      mailboxCount,
      messagesFound,
      messagesDownloaded,
      attachmentsDownloaded,
      errors,
      message: `Datové schránky Plus načetly ${messagesDownloaded} zpráv z ${mailboxCount} schránek.`
    };
  } catch (error) {
    await finishSyncRun(db, syncRunId, {
      finishedAt: new Date().toISOString(),
      status: "failed",
      mailboxCount,
      messagesFound,
      messagesDownloaded,
      attachmentsDownloaded,
      errors: [{ message: cleanString(error?.message || "Synchronizace selhala."), code: cleanString(error?.code || "data_box_plus_sync_failed") }]
    });
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function listDataBoxPlusMailboxes(env) {
  const db = dataBoxPlusDatabase(env, true);
  try {
    await ensureDataBoxPlusMailboxes(env);
    const fallbackMap = fallbackAccountMap(env);
    const rows = await mailboxRowsWithCredentials(db);
    return rows.map((row) => rowToMailbox(row, fallbackMap.get(numberValue(row.slot))));
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function saveDataBoxPlusMailbox(env, currentUser = null, body = {}) {
  const db = dataBoxPlusDatabase(env, true);
  try {
    await ensureDataBoxPlusMailboxes(env);
    const existing = await mailboxRowByIdOrSlot(db, body.id, body.slot);
    const payload = mailboxPayload(body, existing || {});
    const providedUsername = cleanString(body.username);
    const providedPassword = cleanString(body.password);
    const existingCredential = existing?.id ? await credentialRowByMailbox(db, existing.id) : null;

    if (!existingCredential && (!providedUsername || !providedPassword)) {
      throw new DataBoxPlusStoreError("Pro novou schránku doplň login i heslo.", 400, "data_box_plus_mailbox_credentials_missing");
    }

    await db
      .prepare(`
        INSERT INTO data_box_plus_mailboxes (
          id, name, company, isds_id, slot, connection_status, last_sync_status, last_sync_message
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          company = excluded.company,
          isds_id = excluded.isds_id,
          slot = excluded.slot,
          connection_status = excluded.connection_status,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(
        payload.id,
        payload.name,
        payload.company,
        payload.isdsId,
        payload.slot,
        payload.active ? "ready" : "waiting",
        payload.active ? "waiting" : "configuration_missing",
        payload.active ? "Přístup je uložený v DSP vaultu." : "Schránka je vypnutá."
      )
      .run();

    const targetMailbox = await mailboxRowByIdOrSlot(db, payload.id, payload.slot);
    if (!targetMailbox?.id) {
      throw new DataBoxPlusStoreError("Schránku se nepodařilo uložit.", 500, "data_box_plus_mailbox_save_failed");
    }

    const credential = await credentialRowByMailbox(db, targetMailbox.id);
    const usernameCiphertext = providedUsername
      ? await encryptCredential(env, providedUsername)
      : cleanString(credential?.username_ciphertext);
    const passwordCiphertext = providedPassword
      ? await encryptCredential(env, providedPassword)
      : cleanString(credential?.password_ciphertext);

    await db
      .prepare(`
        INSERT INTO data_box_plus_credentials (
          id, mailbox_id, slot, username_ciphertext, username_hint, password_ciphertext,
          active, source, created_by_user_id, updated_by_user_id, last_rotated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mailbox_id) DO UPDATE SET
          slot = excluded.slot,
          username_ciphertext = excluded.username_ciphertext,
          username_hint = excluded.username_hint,
          password_ciphertext = excluded.password_ciphertext,
          active = excluded.active,
          source = excluded.source,
          updated_at = CURRENT_TIMESTAMP,
          updated_by_user_id = excluded.updated_by_user_id,
          last_rotated_at = CASE
            WHEN excluded.last_rotated_at <> '' THEN excluded.last_rotated_at
            ELSE data_box_plus_credentials.last_rotated_at
          END
      `)
      .bind(
        credential?.id || idValue("dbp-cred"),
        targetMailbox.id,
        payload.slot,
        usernameCiphertext,
        providedUsername ? maskSecret(providedUsername) : cleanString(credential?.username_hint),
        passwordCiphertext,
        payload.active ? 1 : 0,
        "vault",
        userId(currentUser),
        userId(currentUser),
        providedPassword ? new Date().toISOString() : cleanString(credential?.last_rotated_at)
      )
      .run();

    await db.prepare(`
      UPDATE data_box_plus_archive_backfills
      SET status = CASE WHEN status = 'completed' THEN status ELSE 'pending' END,
          consecutive_errors = 0,
          last_error_code = NULL,
          last_error_message = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE mailbox_id = ?
    `).bind(targetMailbox.id).run();

    await writeMailboxAudit(db, currentUser, credential ? "Upravit schránku DSP" : "Přidat schránku DSP", {
      mailboxId: targetMailbox.id,
      slot: payload.slot,
      name: payload.name,
      company: payload.company,
      isdsId: payload.isdsId,
      active: payload.active,
      usernameChanged: Boolean(providedUsername),
      passwordChanged: Boolean(providedPassword)
    });

    const fallbackMap = fallbackAccountMap(env);
    const rows = await mailboxRowsWithCredentials(db);
    const row = rows.find((item) => cleanString(item.id) === targetMailbox.id);
    return { apiStatus: "ready", mailbox: rowToMailbox(row, fallbackMap.get(numberValue(row?.slot))) };
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function importDataBoxPlusCredentialsFromDataBox(env, currentUser = null) {
  const db = dataBoxPlusDatabase(env, true);
  try {
    await ensureDataBoxPlusMailboxes(env);
    const sourceBoxes = await sourceDataBoxMap(db);
    const accounts = dataBoxIsdsAccountConfigs(env);
    const imported = [];
    const skipped = [];

    for (let slot = 1; slot <= LEGACY_BOOTSTRAP_MAILBOX_COUNT; slot += 1) {
      const sourceBox = sourceBoxes.get(sourceDataBoxIdForSlot(slot));
      const account = accounts.find((item) => numberValue(item.slot) === slot);
      if (!account?.configured || !cleanString(account.username) || !cleanString(account.password)) {
        skipped.push({
          slot,
          mailboxId: MAILBOX_IDS[slot - 1] || `dbp-mailbox-${slot}`,
          reason: "Původní DS nemá pro tenhle slot kompletní serverový přístup."
        });
        continue;
      }

      const name = sourceLabelForRow(
        { source_data_box_label: sourceBox?.label },
        MAILBOX_NAMES[slot - 1] || account.label,
        slot
      );
      const mailboxId = plusMailboxId({ slot });
      const isdsId = cleanString(sourceBox?.isds_id || account.isdsId);
      await saveDataBoxPlusMailbox(env, currentUser, {
        id: mailboxId,
        slot,
        name,
        company: name,
        isdsId,
        username: account.username,
        password: account.password,
        active: true
      });
      imported.push({
        slot,
        mailboxId,
        name,
        isdsId,
        usernameMasked: maskSecret(account.username)
      });
    }

    await writeMailboxAudit(db, currentUser, "Převzít přístupy z DS", {
      importedCount: imported.length,
      skippedCount: skipped.length,
      imported: imported.map((item) => ({
        slot: item.slot,
        mailboxId: item.mailboxId,
        name: item.name,
        isdsId: item.isdsId,
        usernameMasked: item.usernameMasked
      })),
      skipped
    });

    return {
      apiStatus: "ready",
      importedCount: imported.length,
      skippedCount: skipped.length,
      imported,
      skipped,
      mailboxes: await listDataBoxPlusMailboxes(env),
      message: imported.length
        ? `Do DSP vaultu je převzato ${imported.length} přístupů z původních DS. Hesla se nezobrazila.`
        : "Původní DS nemá žádný kompletní serverový přístup k převzetí."
    };
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function updateDataBoxPlusMailboxPassword(env, mailboxId, currentUser = null, body = {}) {
  const db = dataBoxPlusDatabase(env, true);
  try {
    await ensureDataBoxPlusMailboxes(env);
    const mailbox = await mailboxRowByIdOrSlot(db, mailboxId, body.slot);
    if (!mailbox?.id) {
      throw new DataBoxPlusStoreError("Schránka nebyla nalezena.", 404, "data_box_plus_mailbox_not_found");
    }
    const password = cleanString(body.password);
    if (!password) {
      throw new DataBoxPlusStoreError("Doplň nové heslo.", 400, "data_box_plus_mailbox_password_missing");
    }
    const credential = await credentialRowByMailbox(db, mailbox.id);
    const providedUsername = cleanString(body.username);
    const usernameCiphertext = providedUsername
      ? await encryptCredential(env, providedUsername)
      : cleanString(credential?.username_ciphertext);
    const usernameHint = providedUsername ? maskSecret(providedUsername) : cleanString(credential?.username_hint);
    if (!usernameCiphertext) {
      throw new DataBoxPlusStoreError("Pro první uložení hesla doplň i login.", 400, "data_box_plus_mailbox_username_missing");
    }

    await db
      .prepare(`
        INSERT INTO data_box_plus_credentials (
          id, mailbox_id, slot, username_ciphertext, username_hint, password_ciphertext,
          active, source, created_by_user_id, updated_by_user_id, last_rotated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mailbox_id) DO UPDATE SET
          username_ciphertext = excluded.username_ciphertext,
          username_hint = excluded.username_hint,
          password_ciphertext = excluded.password_ciphertext,
          active = excluded.active,
          source = excluded.source,
          updated_at = CURRENT_TIMESTAMP,
          updated_by_user_id = excluded.updated_by_user_id,
          last_rotated_at = excluded.last_rotated_at
      `)
      .bind(
        credential?.id || idValue("dbp-cred"),
        mailbox.id,
        numberValue(mailbox.slot),
        usernameCiphertext,
        usernameHint,
        await encryptCredential(env, password),
        1,
        "vault",
        userId(currentUser),
        userId(currentUser),
        new Date().toISOString()
      )
      .run();

    await db
      .prepare(`
        UPDATE data_box_plus_mailboxes
        SET connection_status = 'ready',
            last_sync_status = 'waiting',
            last_sync_message = 'Heslo bylo změněné v DSP vaultu.',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(mailbox.id)
      .run();

    await writeMailboxAudit(db, currentUser, "Změnit heslo DSP", {
      mailboxId: mailbox.id,
      slot: numberValue(mailbox.slot),
      usernameChanged: Boolean(providedUsername),
      passwordChanged: true
    });

    const fallbackMap = fallbackAccountMap(env);
    const rows = await mailboxRowsWithCredentials(db);
    const row = rows.find((item) => cleanString(item.id) === mailbox.id);
    return { apiStatus: "ready", mailbox: rowToMailbox(row, fallbackMap.get(numberValue(row?.slot))) };
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function testDataBoxPlusMailboxConnection(env, mailboxId, currentUser = null) {
  const db = dataBoxPlusDatabase(env, true);
  await ensureDataBoxPlusMailboxes(env);
  const mailbox = await mailboxRowByIdOrSlot(db, mailboxId);
  if (!mailbox?.id) {
    throw new DataBoxPlusStoreError("Schránka nebyla nalezena.", 404, "data_box_plus_mailbox_not_found");
  }

  const account = await dataBoxPlusSendingAccount(env, mailbox);
  if (!account?.configured) {
    throw new DataBoxPlusStoreError(
      "Schránka nemá kompletní aktivní login a heslo.",
      409,
      "data_box_plus_mailbox_credentials_missing"
    );
  }

  try {
    const result = await fetchDataBoxMessageMetadata(env, {
      ...account,
      limit: 1,
      lookbackDays: 7
    });
    const receivedCount = numberValue(result.receivedCount);
    const sentCount = numberValue(result.sentCount);
    const message = `Připojení k ISDS je ověřené. Test načetl ${receivedCount} přijatých a ${sentCount} odeslaných obálek.`;
    await db
      .prepare(`
        UPDATE data_box_plus_mailboxes
        SET connection_status = 'ready',
            last_sync_status = 'waiting',
            last_sync_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(message, mailbox.id)
      .run();
    await writeMailboxAudit(db, currentUser, "Otestovat připojení DSP", {
      mailboxId: mailbox.id,
      slot: numberValue(mailbox.slot),
      success: true,
      receivedCount,
      sentCount
    });
    return {
      apiStatus: "ready",
      status: "success",
      mailboxId: mailbox.id,
      receivedCount,
      sentCount,
      message
    };
  } catch (error) {
    const message = cleanString(error?.message || "Připojení k ISDS se nepodařilo ověřit.");
    await db
      .prepare(`
        UPDATE data_box_plus_mailboxes
        SET connection_status = 'error',
            last_sync_status = 'failed',
            last_sync_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(message, mailbox.id)
      .run();
    await writeMailboxAudit(db, currentUser, "Otestovat připojení DSP", {
      mailboxId: mailbox.id,
      slot: numberValue(mailbox.slot),
      success: false,
      errorCode: cleanString(error?.code || "data_box_plus_mailbox_connection_failed")
    });
    throw new DataBoxPlusStoreError(
      message,
      502,
      cleanString(error?.code || "data_box_plus_mailbox_connection_failed")
    );
  }
}

export async function listDataBoxPlusMessages(env, filters = {}) {
  const page = await listDataBoxPlusMessagesPage(env, filters);
  return page.messages;
}

export async function listDataBoxPlusMessagesPage(env, filters = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const limit = limitValue(filters.limit, 20, 200);
  const page = Math.max(1, numberValue(filters.page, 1));
  const offset = (page - 1) * limit;
  const where = [];
  const bindings = [];
  const add = (sql, value) => {
    where.push(sql);
    bindings.push(value);
  };
  const mailboxId = cleanString(filters.mailboxId);
  const direction = cleanString(filters.direction).toLowerCase();
  const status = cleanString(filters.status);
  const sender = cleanString(filters.sender);
  const query = cleanString(filters.query);
  const dateFrom = cleanString(filters.dateFrom);
  const dateTo = cleanString(filters.dateTo);
  const due = cleanString(filters.due).toLowerCase();
  const attachment = cleanString(filters.attachment).toLowerCase();
  const archive = cleanString(filters.archive).toLowerCase();
  const priority = cleanString(filters.priority);

  if (mailboxId) add("m.mailbox_id = ?", mailboxId);
  if (["received", "sent"].includes(direction)) add("m.direction = ?", direction);
  if (status && status !== "all") add("m.status = ?", status);
  if (priority && priority !== "all") add("m.priority = ?", priority);
  if (sender) add("LOWER(COALESCE(CASE WHEN m.direction = 'sent' THEN m.recipient_name ELSE m.sender_name END, '')) LIKE ?", `%${sender.toLowerCase()}%`);
  if (query) {
    where.push(`(
      LOWER(COALESCE(m.sender_name, '')) LIKE ?
      OR LOWER(COALESCE(m.recipient_name, '')) LIKE ?
      OR LOWER(COALESCE(m.subject, '')) LIKE ?
      OR LOWER(COALESCE(m.isds_message_id, '')) LIKE ?
      OR LOWER(COALESCE(m.assigned_to, '')) LIKE ?
    )`);
    const needle = `%${query.toLowerCase()}%`;
    bindings.push(needle, needle, needle, needle, needle);
  }
  if (dateFrom) add("DATE(COALESCE(m.delivered_at, m.received_at, m.stored_at)) >= DATE(?)", dateFrom);
  if (dateTo) add("DATE(COALESCE(m.delivered_at, m.received_at, m.stored_at)) <= DATE(?)", dateTo);
  if (due === "overdue") where.push("m.due_date <> '' AND DATE(m.due_date) < DATE('now')");
  if (due === "today") where.push("DATE(m.due_date) = DATE('now')");
  if (due === "set") where.push("m.due_date <> ''");
  if (due === "none") where.push("(m.due_date IS NULL OR m.due_date = '')");
  if (attachment === "yes") where.push("EXISTS (SELECT 1 FROM data_box_plus_attachments a WHERE a.message_id = m.id)");
  if (attachment === "no") where.push("NOT EXISTS (SELECT 1 FROM data_box_plus_attachments a WHERE a.message_id = m.id)");
  if (archive === "archived") where.push("m.archive_status = 'archived'");
  if (archive === "active") where.push("m.archive_status <> 'archived'");

  const sortMap = {
    date: "COALESCE(m.delivered_at, m.received_at, m.stored_at)",
    priority: "CASE LOWER(m.priority) WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'vysoká' THEN 1 WHEN 'vysoke' THEN 1 ELSE 2 END",
    due: "CASE WHEN m.due_date IS NULL OR m.due_date = '' THEN 1 ELSE 0 END, m.due_date",
    sender: "LOWER(COALESCE(m.sender_name, ''))"
  };
  const sortSql = sortMap[cleanString(filters.sort).toLowerCase()] || sortMap.date;
  const orderSql = cleanString(filters.order).toLowerCase() === "asc" ? "ASC" : "DESC";
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  try {
    const [result, totalRow] = await Promise.all([
      db
      .prepare(`
        SELECT m.*,
          (SELECT COUNT(*) FROM data_box_plus_attachments a WHERE a.message_id = m.id) AS attachment_count
        FROM data_box_plus_messages m
        ${whereSql}
        ORDER BY ${sortSql} ${orderSql}, m.stored_at DESC
        LIMIT ? OFFSET ?
      `)
      .bind(...bindings, limit, offset)
      .all(),
      db
        .prepare(`SELECT COUNT(*) AS count FROM data_box_plus_messages m ${whereSql}`)
        .bind(...bindings)
        .first()
    ]);
    const total = numberValue(totalRow?.count);
    return {
      messages: (result.results || []).map((row) => rowToMessage(row, [])),
      pagination: {
        page,
        pageSize: limit,
        total,
        pageCount: Math.max(1, Math.ceil(total / limit))
      }
    };
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function getDataBoxPlusMessage(env, id, options = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const messageId = cleanString(id);
  try {
    const row = await db.prepare("SELECT * FROM data_box_plus_messages WHERE id = ? LIMIT 1").bind(messageId).first();
    if (!row) throw new DataBoxPlusStoreError("Zpráva nebyla nalezena.", 404, "data_box_plus_message_not_found");
    const attachments = await db
      .prepare("SELECT * FROM data_box_plus_attachments WHERE message_id = ? ORDER BY file_name")
      .bind(messageId)
      .all();
    const actionLogs = await db
      .prepare("SELECT * FROM data_box_plus_action_log WHERE message_id = ? ORDER BY created_at DESC LIMIT 30")
      .bind(messageId)
      .all();
    const notifications = options.includeNotifications
      ? await listDataBoxRcsNotifications(db, messageId)
      : undefined;
    return rowToMessage(
      row,
      (attachments.results || []).map(rowToAttachment),
      (actionLogs.results || []).map(rowToActionLog),
      notifications
    );
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function getDataBoxPlusAttachmentFile(env, messageId, attachmentId) {
  const db = dataBoxPlusDatabase(env, true);
  const bucket = dataBoxPlusDocumentsBucket(env);
  if (!bucket) {
    throw new DataBoxPlusStoreError("Úložiště příloh není dostupné.", 503, "data_box_plus_storage_missing");
  }
  const row = await db
    .prepare("SELECT * FROM data_box_plus_attachments WHERE id = ? AND message_id = ? LIMIT 1")
    .bind(cleanString(attachmentId), cleanString(messageId))
    .first();
  const attachment = rowToAttachment(row);
  if (!attachment?.id) {
    throw new DataBoxPlusStoreError("Příloha nebyla nalezena.", 404, "data_box_plus_attachment_not_found");
  }
  const storageKey = cleanString(row.storage_key);
  if (!storageKey) {
    throw new DataBoxPlusStoreError("Příloha zatím není uložená.", 409, "data_box_plus_attachment_not_stored");
  }
  const object = await bucket.get(storageKey);
  if (!object) {
    throw new DataBoxPlusStoreError("Soubor přílohy nebyl v úložišti nalezen.", 404, "data_box_plus_attachment_object_missing");
  }
  return {
    attachment,
    body: object.body,
    headers: {
      "Content-Type": cleanString(row.mime_type) || object.httpMetadata?.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeFilename(row.file_name).replace(/"/g, "")}"`,
      "Cache-Control": "no-store"
    }
  };
}

export async function sendDataBoxPlusMessageEmail(env, messageId, payload = {}, currentUser = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const id = cleanString(messageId);
  const recipientEmail = normalizeEmail(payload.recipientEmail || payload.recipient || payload.to);
  const confirmed = payload.confirmed === true;

  if (!confirmed) {
    throw new DataBoxPlusStoreError("Odeslání e-mailu vyžaduje finální potvrzení.", 409, "data_box_plus_email_confirmation_required");
  }
  if (!recipientEmail) {
    throw new DataBoxPlusStoreError("Chybí platný e-mail příjemce.", 400, "data_box_plus_email_recipient_missing");
  }

  const message = await getDataBoxPlusMessage(env, id);
  ensureReceivedDataBoxPlusMessage(message);
  const mailbox = await db
    .prepare("SELECT * FROM data_box_plus_mailboxes WHERE id = ? LIMIT 1")
    .bind(cleanString(message.mailboxId))
    .first();
  const actor = actorName(currentUser);
  const subject = cleanString(payload.subject || message.subject || "Datová zpráva");
  const body = cleanString(payload.body || payload.note || `Předávám datovou zprávu: ${subject}`);
  const actionId = idValue("dbp-action");

  await db
    .prepare(`
      INSERT INTO data_box_plus_action_log (
        id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
      )
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      actionId,
      id,
      actor,
      "Odeslání e-mailu",
      JSON.stringify({ recipientEmail, subject, bodyPreview: body.slice(0, 500), confirmed: true }),
      new Date().toISOString(),
      "sending",
      `${actor} potvrdil e-mailové předání na ${recipientEmail}.`
    )
    .run();

  const result = await sendDataBoxForwardNotification(env, {
    ...message,
    dataBoxLabel: cleanString(mailbox?.name || mailbox?.company || message.mailboxId),
    attachments: Array.isArray(message.attachments) ? message.attachments.map((attachment) => ({
      filename: attachment.fileName,
      mimeType: attachment.mimeType
    })) : []
  }, {
    recipientEmail,
    subject,
    body,
    fromName: "Šarlota Kaiser"
  });

  const sent = result.status === "sent";
  const auditWarnings = [cleanString(result.auditWarning)].filter(Boolean);
  try {
    await db
      .prepare(`
        UPDATE data_box_plus_action_log
        SET result = ?,
            audit_note = ?
        WHERE id = ?
      `)
      .bind(
        sent ? "sent" : cleanString(result.status || "failed"),
        sent
          ? `E-mailové předání na ${recipientEmail} bylo odeslané přes serverový SendGrid.`
          : `E-mailové předání na ${recipientEmail} se nepodařilo odeslat: ${cleanString(result.errorMessage || "bez detailu")}.`,
        actionId
      )
      .run();
  } catch (error) {
    auditWarnings.push("Nepodařilo se aktualizovat historii e-mailového předání.");
    console.error("data_box_plus.email_action_audit_failed", { message: error.message, actionId });
  }

  if (!sent) {
    throw new DataBoxPlusStoreError(
      cleanString(result.errorMessage || "E-mail se nepodařilo odeslat."),
      result.status === "skipped" ? 503 : 502,
      "data_box_plus_email_send_failed"
    );
  }

  try {
    await db
      .prepare(`
        UPDATE data_box_plus_messages
        SET status = 'Odesláno e-mailem',
            assigned_to = ?,
            suggested_action = ?,
            primary_action = 'Detail historie',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(recipientEmail, `Odesláno na ${recipientEmail}.`, id)
      .run();
    await updateMailboxCounters(db, cleanString(message.mailboxId));
  } catch (error) {
    auditWarnings.push("E-mail byl odeslaný, ale nepodařilo se uložit nový stav datové zprávy.");
    console.error("data_box_plus.email_message_status_failed", { message: error.message, actionId });
  }

  let updatedMessage = message;
  try {
    updatedMessage = await getDataBoxPlusMessage(env, id);
  } catch (error) {
    auditWarnings.push("E-mail byl odeslaný, ale nepodařilo se znovu načíst detail datové zprávy.");
    console.error("data_box_plus.email_message_reload_failed", { message: error.message, actionId });
  }

  return {
    apiStatus: "ready",
    status: "sent",
    actionLogId: actionId,
    result,
    message: updatedMessage,
    auditWarning: auditWarnings.join(" "),
    notice: `Hotovo. Odesláno na ${recipientEmail}.`
  };
}

export async function sendDataBoxPlusReply(env, messageId, payload = {}, currentUser = {}) {
  if (payload.confirmed !== true) {
    throw new DataBoxPlusStoreError("Odeslání datové zprávy vyžaduje finální potvrzení.", 409, "data_box_plus_ds_confirmation_required");
  }

  const db = dataBoxPlusDatabase(env, true);
  const id = cleanString(messageId);
  const message = await getDataBoxPlusMessage(env, id);
  ensureReceivedDataBoxPlusMessage(message);
  const mailbox = await db.prepare("SELECT * FROM data_box_plus_mailboxes WHERE id = ? LIMIT 1").bind(message.mailboxId).first();
  const directAccount = mailbox ? await dataBoxPlusSendingAccount(env, mailbox) : null;
  const endpoint = cleanString(env.DATA_BOX_SEND_MESSAGE_ENDPOINT || env.DATA_BOX_REPLY_ENDPOINT || env.DATA_BOX_SEND_REPLY_ENDPOINT || env.KNF_DATA_BOX_REPLY_ENDPOINT);
  const apiKey = cleanString(env.DATA_BOX_REPLY_API_KEY || env.KNF_DATA_BOX_REPLY_API_KEY);
  if (!directAccount && !(endpoint && apiKey)) {
    throw new DataBoxPlusStoreError(
      "Odesílající schránka nemá aktivní přístup ISDS.",
      503,
      "data_box_plus_ds_sender_missing"
    );
  }
  const recipientDataBoxId = cleanString(payload.recipientDataBoxId || message.senderBoxId || message.recipientBoxId);
  const body = cleanString(payload.body || payload.text);
  const subject = cleanString(payload.subject || (message.subject.toLowerCase().startsWith("re:") ? message.subject : `Re: ${message.subject}`));
  if (!recipientDataBoxId) {
    throw new DataBoxPlusStoreError("Chybí ID datové schránky příjemce.", 400, "data_box_plus_ds_recipient_missing");
  }
  if (!body) {
    throw new DataBoxPlusStoreError("Chybí přesný text odpovědi přes datovou schránku.", 400, "data_box_plus_ds_body_missing");
  }

  const actor = actorName(currentUser);
  const actionId = idValue("dbp-action");
  await db.prepare(`
    INSERT INTO data_box_plus_action_log (
      id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
    ) VALUES (?, ?, NULL, ?, 'Odeslání datové zprávy', ?, ?, 'sending', ?)
  `).bind(
    actionId,
    id,
    actor,
    JSON.stringify({ recipientDataBoxId, subject, bodyPreview: body.slice(0, 500), confirmed: true }),
    new Date().toISOString(),
    `${actor} potvrdil odeslání odpovědi do datové schránky ${recipientDataBoxId}.`
  ).run();

  let response = null;
  let result = {};
  try {
    if (directAccount) {
      result = await sendDataBoxIsdsMessage(env, directAccount, {
        recipientDataBoxId,
        subject,
        body
      });
    } else {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceMailboxId: message.mailboxId,
          originalMessageId: message.id,
          originalIsdsMessageId: message.isdsMessageId,
          recipientDataBoxId,
          subject,
          body
        })
      });
      result = await response.json().catch(() => ({}));
    }
  } catch (error) {
    try {
      await db.prepare("UPDATE data_box_plus_action_log SET result = 'failed', audit_note = ? WHERE id = ?")
        .bind(`Odeslání odpovědi přes datovou schránku selhalo: ${cleanString(error?.message || "brána není dostupná")}.`, actionId)
        .run();
    } catch (auditError) {
      console.error("data_box_plus.ds_reply_audit_failed", { message: auditError.message, actionId });
    }
    throw new DataBoxPlusStoreError(
      error instanceof DataBoxIsdsError ? error.message : "ISDS odesílací služba není dostupná.",
      numberValue(error?.status, 502),
      cleanString(error?.code || "data_box_plus_ds_send_failed")
    );
  }

  const sent = directAccount ? result.success === true : Boolean(response?.ok && result.success !== false);
  const providerMessageId = cleanString(result.sentMessageId || result.messageId || result.dmID);
  try {
    await db.prepare("UPDATE data_box_plus_action_log SET result = ?, audit_note = ? WHERE id = ?")
      .bind(
        sent ? "sent" : "failed",
        sent
          ? `Odpověď byla odeslaná přes datovou schránku${providerMessageId ? ` jako ${providerMessageId}` : ""}.`
          : `Odeslání odpovědi přes datovou schránku selhalo: ${cleanString(result.error || result.message || `HTTP ${response?.status || 502}`)}.`,
        actionId
      )
      .run();
  } catch (error) {
    console.error("data_box_plus.ds_reply_audit_failed", { message: error.message, actionId });
  }
  if (!sent) {
    throw new DataBoxPlusStoreError(
      cleanString(result.error || result.message) || `Odeslání odpovědi přes datovou schránku selhalo (${response?.status || 502}).`,
      502,
      "data_box_plus_ds_send_failed"
    );
  }

  const auditWarnings = [];
  try {
    await db.prepare(`
      UPDATE data_box_plus_messages
      SET status = 'Odesláno datovou schránkou',
          assigned_to = ?,
          suggested_action = 'Odpověď byla odeslána přes datovou schránku.',
          primary_action = 'Detail historie',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(recipientDataBoxId, id).run();
    await updateMailboxCounters(db, cleanString(message.mailboxId));
  } catch (error) {
    auditWarnings.push("Odpověď byla odeslaná, ale nepodařilo se uložit nový stav zprávy.");
    console.error("data_box_plus.ds_reply_message_status_failed", { message: error.message, actionId });
  }

  let updatedMessage = message;
  try {
    updatedMessage = await getDataBoxPlusMessage(env, id);
  } catch (error) {
    auditWarnings.push("Odpověď byla odeslaná, ale nepodařilo se znovu načíst detail zprávy.");
    console.error("data_box_plus.ds_reply_message_reload_failed", { message: error.message, actionId });
  }
  return {
    apiStatus: "ready",
    status: "sent",
    actionLogId: actionId,
    providerMessageId,
    message: updatedMessage,
    auditWarning: auditWarnings.join(" "),
    notice: `Hotovo. Odpověď byla odeslána do datové schránky ${recipientDataBoxId}.`
  };
}

async function dataBoxPlusDraftAttachments(db, draftId) {
  const result = await db
    .prepare("SELECT * FROM data_box_plus_draft_attachments WHERE draft_id = ? ORDER BY created_at, file_name")
    .bind(cleanString(draftId))
    .all();
  return (result.results || []).map(rowToDraftAttachment);
}

async function dataBoxPlusDraftRow(db, draftId, currentUser) {
  const row = await db
    .prepare("SELECT * FROM data_box_plus_drafts WHERE id = ? AND owner_user_id = ? LIMIT 1")
    .bind(cleanString(draftId), userId(currentUser))
    .first();
  if (!row) {
    throw new DataBoxPlusStoreError("Koncept nebyl nalezen.", 404, "data_box_plus_draft_not_found");
  }
  return row;
}

async function dataBoxPlusDraft(db, draftId, currentUser) {
  const row = await dataBoxPlusDraftRow(db, draftId, currentUser);
  return rowToDraft(row, await dataBoxPlusDraftAttachments(db, row.id));
}

function dataBoxPlusDraftInput(payload = {}, fallback = {}) {
  const recipientBoxId = cleanString(payload.recipientBoxId ?? fallback.recipient_box_id).toLowerCase();
  const subject = cleanString(payload.subject ?? fallback.subject);
  const body = cleanString(payload.body ?? fallback.body);
  if (recipientBoxId && !/^[a-z0-9]{7}$/.test(recipientBoxId)) {
    throw new DataBoxPlusStoreError("ID datové schránky příjemce musí mít 7 znaků.", 400, "data_box_plus_recipient_invalid");
  }
  if (subject.length > 255) {
    throw new DataBoxPlusStoreError("Předmět může mít nejvýše 255 znaků.", 400, "data_box_plus_subject_too_long");
  }
  if (body.length > 100000) {
    throw new DataBoxPlusStoreError("Text zprávy je příliš dlouhý.", 400, "data_box_plus_body_too_long");
  }
  return {
    mailboxId: cleanString(payload.mailboxId ?? fallback.mailbox_id),
    replyToMessageId: cleanString(payload.replyToMessageId ?? fallback.reply_to_message_id),
    recipientBoxId,
    recipientName: cleanString(payload.recipientName ?? fallback.recipient_name).slice(0, 255),
    subject,
    body
  };
}

export function dataBoxPlusDraftInputForTest(payload = {}, fallback = {}) {
  return dataBoxPlusDraftInput(payload, fallback);
}

export async function listDataBoxPlusDrafts(env, currentUser, filters = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const owner = userId(currentUser);
  const mailboxId = cleanString(filters.mailboxId);
  const status = cleanString(filters.status || "draft");
  const where = ["owner_user_id = ?"];
  const bindings = [owner];
  if (mailboxId) {
    where.push("mailbox_id = ?");
    bindings.push(mailboxId);
  }
  if (status !== "all") {
    where.push(status === "open" ? "status IN ('draft', 'failed')" : "status = ?");
    if (status !== "open") bindings.push(status);
  }
  try {
    const result = await db
      .prepare(`SELECT * FROM data_box_plus_drafts WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT 100`)
      .bind(...bindings)
      .all();
    const drafts = [];
    for (const row of result.results || []) {
      drafts.push(rowToDraft(row, await dataBoxPlusDraftAttachments(db, row.id)));
    }
    return drafts;
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function saveDataBoxPlusDraft(env, currentUser, payload = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const owner = userId(currentUser);
  if (!owner) throw new DataBoxPlusStoreError("Chybí identita autora konceptu.", 401, "data_box_plus_draft_owner_missing");
  const draftId = cleanString(payload.id);
  try {
    if (draftId) {
      const existing = await dataBoxPlusDraftRow(db, draftId, currentUser);
      if (!["draft", "failed"].includes(cleanString(existing.status))) {
        throw new DataBoxPlusStoreError("Odeslaný nebo právě odesílaný koncept už nelze změnit.", 409, "data_box_plus_draft_locked");
      }
      const input = dataBoxPlusDraftInput(payload, existing);
      input.replyToMessageId = cleanString(existing.reply_to_message_id);
      if (!input.mailboxId) throw new DataBoxPlusStoreError("Vyber odesílající schránku.", 400, "data_box_plus_mailbox_missing");
      const mailbox = await db.prepare("SELECT id FROM data_box_plus_mailboxes WHERE id = ? LIMIT 1").bind(input.mailboxId).first();
      if (!mailbox) throw new DataBoxPlusStoreError("Odesílající schránka nebyla nalezena.", 404, "data_box_plus_mailbox_not_found");
      await db.prepare(`
        UPDATE data_box_plus_drafts
        SET mailbox_id = ?, recipient_box_id = ?, recipient_name = ?, subject = ?, body = ?,
            status = 'draft', error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND owner_user_id = ?
      `).bind(
        input.mailboxId,
        input.recipientBoxId,
        input.recipientName,
        input.subject,
        input.body,
        draftId,
        owner
      ).run();
      return dataBoxPlusDraft(db, draftId, currentUser);
    }

    const input = dataBoxPlusDraftInput(payload);
    if (!input.mailboxId) throw new DataBoxPlusStoreError("Vyber odesílající schránku.", 400, "data_box_plus_mailbox_missing");
    const mailbox = await db.prepare("SELECT id FROM data_box_plus_mailboxes WHERE id = ? LIMIT 1").bind(input.mailboxId).first();
    if (!mailbox) throw new DataBoxPlusStoreError("Odesílající schránka nebyla nalezena.", 404, "data_box_plus_mailbox_not_found");
    if (input.replyToMessageId) {
      const sourceMessage = await db
        .prepare("SELECT id, mailbox_id, direction FROM data_box_plus_messages WHERE id = ? LIMIT 1")
        .bind(input.replyToMessageId)
        .first();
      if (!sourceMessage) {
        throw new DataBoxPlusStoreError("Původní datová zpráva nebyla nalezena.", 404, "data_box_plus_reply_source_not_found");
      }
      if (cleanString(sourceMessage.direction) !== "received") {
        throw new DataBoxPlusStoreError("Odpověď lze připravit pouze k přijaté zprávě.", 409, "data_box_plus_reply_source_not_received");
      }
      if (cleanString(sourceMessage.mailbox_id) !== input.mailboxId) {
        throw new DataBoxPlusStoreError("Odpověď musí být odeslána ze schránky původní zprávy.", 409, "data_box_plus_reply_mailbox_mismatch");
      }
      const existingReply = await db.prepare(`
        SELECT *
        FROM data_box_plus_drafts
        WHERE owner_user_id = ?
          AND reply_to_message_id = ?
          AND status IN ('draft', 'failed', 'sending', 'unknown')
        ORDER BY updated_at DESC
        LIMIT 1
      `).bind(owner, input.replyToMessageId).first();
      if (existingReply) {
        if (["sending", "unknown"].includes(cleanString(existingReply.status))) {
          return dataBoxPlusDraft(db, existingReply.id, currentUser);
        }
        await db.prepare(`
          UPDATE data_box_plus_drafts
          SET recipient_box_id = ?, recipient_name = ?, subject = ?, body = ?,
              status = 'draft', error_message = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND owner_user_id = ?
        `).bind(
          input.recipientBoxId,
          input.recipientName,
          input.subject,
          input.body,
          existingReply.id,
          owner
        ).run();
        return dataBoxPlusDraft(db, existingReply.id, currentUser);
      }
    }
    const id = idValue("dbp-draft");
    await db.prepare(`
      INSERT INTO data_box_plus_drafts (
        id, mailbox_id, reply_to_message_id, owner_user_id, recipient_box_id, recipient_name, subject, body,
        status, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
    `).bind(
      id,
      input.mailboxId,
      input.replyToMessageId || null,
      owner,
      input.recipientBoxId,
      input.recipientName,
      input.subject,
      input.body,
      idValue("dbp-send"),
      new Date().toISOString(),
      new Date().toISOString()
    ).run();
    return dataBoxPlusDraft(db, id, currentUser);
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function deleteDataBoxPlusDraft(env, draftId, currentUser) {
  const db = dataBoxPlusDatabase(env, true);
  const bucket = dataBoxPlusDocumentsBucket(env);
  const row = await dataBoxPlusDraftRow(db, draftId, currentUser);
  if (!["draft", "failed"].includes(cleanString(row.status))) {
    throw new DataBoxPlusStoreError("Tento koncept už nelze smazat.", 409, "data_box_plus_draft_locked");
  }
  const attachments = await db
    .prepare("SELECT storage_key FROM data_box_plus_draft_attachments WHERE draft_id = ?")
    .bind(row.id)
    .all();
  if (bucket) {
    for (const attachment of attachments.results || []) {
      if (attachment.storage_key) await bucket.delete(attachment.storage_key).catch(() => {});
    }
  }
  await db.prepare("DELETE FROM data_box_plus_draft_attachments WHERE draft_id = ?").bind(row.id).run();
  await db.prepare("DELETE FROM data_box_plus_drafts WHERE id = ? AND owner_user_id = ?").bind(row.id, userId(currentUser)).run();
  return { status: "deleted", draftId: row.id };
}

export async function addDataBoxPlusDraftAttachment(env, draftId, currentUser, file = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const bucket = dataBoxPlusDocumentsBucket(env);
  if (!bucket) throw new DataBoxPlusStoreError("Úložiště příloh není dostupné.", 503, "data_box_plus_storage_missing");
  const row = await dataBoxPlusDraftRow(db, draftId, currentUser);
  if (!["draft", "failed"].includes(cleanString(row.status))) {
    throw new DataBoxPlusStoreError("K tomuto konceptu už nelze přidat přílohu.", 409, "data_box_plus_draft_locked");
  }
  const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes || []);
  if (!bytes.byteLength) throw new DataBoxPlusStoreError("Vyber neprázdnou přílohu.", 400, "data_box_plus_attachment_empty");
  if (bytes.byteLength > 20 * 1024 * 1024) {
    throw new DataBoxPlusStoreError("Jedna příloha může mít nejvýše 20 MB.", 400, "data_box_plus_attachment_too_large");
  }
  const sizeRow = await db
    .prepare("SELECT COALESCE(SUM(size_bytes), 0) AS size_bytes, COUNT(*) AS count FROM data_box_plus_draft_attachments WHERE draft_id = ?")
    .bind(row.id)
    .first();
  const bodyBytes = new TextEncoder().encode(cleanString(row.body)).byteLength;
  if (numberValue(sizeRow?.count) >= 20 || bodyBytes + numberValue(sizeRow?.size_bytes) + bytes.byteLength > 20 * 1024 * 1024) {
    throw new DataBoxPlusStoreError("Koncept může mít nejvýše 20 příloh a celkem 20 MB.", 400, "data_box_plus_attachments_limit");
  }
  const attachmentIdValue = idValue("dbp-draft-attachment");
  const fileName = safeFilename(file.fileName, "priloha");
  const storageKey = `data-box-plus/drafts/${encodeURIComponent(userId(currentUser))}/${encodeURIComponent(row.id)}/${encodeURIComponent(attachmentIdValue)}-${encodeURIComponent(fileName)}`;
  const mimeType = cleanString(file.mimeType || "application/octet-stream");
  await bucket.put(storageKey, bytes, { httpMetadata: { contentType: mimeType } });
  try {
    await db.prepare(`
      INSERT INTO data_box_plus_draft_attachments (
        id, draft_id, file_name, mime_type, size_bytes, storage_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(attachmentIdValue, row.id, fileName, mimeType, bytes.byteLength, storageKey, new Date().toISOString()).run();
  } catch (error) {
    await bucket.delete(storageKey).catch(() => {});
    throw error;
  }
  return dataBoxPlusDraft(db, row.id, currentUser);
}

export async function deleteDataBoxPlusDraftAttachment(env, draftId, attachmentIdValue, currentUser) {
  const db = dataBoxPlusDatabase(env, true);
  const bucket = dataBoxPlusDocumentsBucket(env);
  const draftRow = await dataBoxPlusDraftRow(db, draftId, currentUser);
  if (!["draft", "failed"].includes(cleanString(draftRow.status))) {
    throw new DataBoxPlusStoreError("Přílohu z tohoto konceptu už nelze odebrat.", 409, "data_box_plus_draft_locked");
  }
  const row = await db
    .prepare("SELECT * FROM data_box_plus_draft_attachments WHERE id = ? AND draft_id = ? LIMIT 1")
    .bind(cleanString(attachmentIdValue), draftRow.id)
    .first();
  if (!row) throw new DataBoxPlusStoreError("Příloha konceptu nebyla nalezena.", 404, "data_box_plus_attachment_not_found");
  if (bucket && row.storage_key) await bucket.delete(row.storage_key).catch(() => {});
  await db.prepare("DELETE FROM data_box_plus_draft_attachments WHERE id = ? AND draft_id = ?").bind(row.id, draftRow.id).run();
  return dataBoxPlusDraft(db, draftRow.id, currentUser);
}

export async function getDataBoxPlusDraftAttachmentFile(env, draftId, attachmentIdValue, currentUser) {
  const db = dataBoxPlusDatabase(env, true);
  const bucket = dataBoxPlusDocumentsBucket(env);
  if (!bucket) throw new DataBoxPlusStoreError("Úložiště příloh není dostupné.", 503, "data_box_plus_storage_missing");
  const draftRow = await dataBoxPlusDraftRow(db, draftId, currentUser);
  const row = await db
    .prepare("SELECT * FROM data_box_plus_draft_attachments WHERE id = ? AND draft_id = ? LIMIT 1")
    .bind(cleanString(attachmentIdValue), draftRow.id)
    .first();
  const attachment = rowToDraftAttachment(row);
  if (!attachment?.id) {
    throw new DataBoxPlusStoreError("Příloha konceptu nebyla nalezena.", 404, "data_box_plus_attachment_not_found");
  }
  const storageKey = cleanString(row.storage_key);
  const object = storageKey ? await bucket.get(storageKey) : null;
  if (!object) {
    throw new DataBoxPlusStoreError("Soubor přílohy nebyl v úložišti nalezen.", 404, "data_box_plus_attachment_object_missing");
  }
  return {
    attachment,
    body: object.body,
    headers: {
      "Content-Type": cleanString(row.mime_type) || object.httpMetadata?.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeFilename(row.file_name).replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store"
    }
  };
}

async function dataBoxPlusRequestHash(payload) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sendDataBoxPlusDraft(env, draftId, payload = {}, currentUser = {}) {
  if (payload.confirmed !== true) {
    throw new DataBoxPlusStoreError("Odeslání datové zprávy vyžaduje finální potvrzení.", 409, "data_box_plus_ds_confirmation_required");
  }
  const db = dataBoxPlusDatabase(env, true);
  const bucket = dataBoxPlusDocumentsBucket(env);
  const row = await dataBoxPlusDraftRow(db, draftId, currentUser);
  const draft = rowToDraft(row, await dataBoxPlusDraftAttachments(db, row.id));
  if (draft.status === "sent") {
    return { status: "sent", duplicate: true, draft, providerMessageId: draft.providerMessageId };
  }
  if (["sending", "unknown"].includes(draft.status)) {
    throw new DataBoxPlusStoreError(
      draft.status === "unknown"
        ? "Výsledek předchozího odeslání není potvrzený. Další odeslání je zablokované proti duplicitě."
        : "Tento koncept se právě odesílá.",
      409,
      draft.status === "unknown" ? "data_box_plus_send_result_unknown" : "data_box_plus_send_in_progress"
    );
  }
  if (!draft.recipientBoxId || !draft.subject || !draft.body) {
    throw new DataBoxPlusStoreError("Doplň příjemce, předmět a text zprávy.", 400, "data_box_plus_draft_incomplete");
  }
  const requestDescriptor = {
    hashVersion: 2,
    sourceMailboxId: draft.mailboxId,
    replyToMessageId: draft.replyToMessageId,
    recipientDataBoxId: draft.recipientBoxId,
    recipientName: draft.recipientName,
    subject: draft.subject,
    body: draft.body,
    attachments: draft.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes
    })),
    idempotencyKey: draft.idempotencyKey
  };
  const requestHash = await dataBoxPlusRequestHash(requestDescriptor);
  const existingJob = await db.prepare("SELECT * FROM data_box_plus_send_jobs WHERE draft_id = ? LIMIT 1").bind(draft.id).first();
  if (existingJob?.status === "sent") {
    return { status: "sent", duplicate: true, draft, providerMessageId: cleanString(existingJob.provider_message_id) };
  }
  if (["sending", "unknown"].includes(cleanString(existingJob?.status))) {
    throw new DataBoxPlusStoreError(
      cleanString(existingJob.status) === "unknown"
        ? "Výsledek předchozího odeslání není potvrzený. Další odeslání je zablokované proti duplicitě."
        : "Tento koncept už má rozpracované odeslání. Další pokus je zablokovaný.",
      409,
      cleanString(existingJob.status) === "unknown" ? "data_box_plus_send_result_unknown" : "data_box_plus_send_in_progress"
    );
  }
  if (existingJob && cleanString(existingJob.request_hash) !== requestHash) {
    throw new DataBoxPlusStoreError("Obsah konceptu se po přípravě odeslání změnil.", 409, "data_box_plus_send_payload_changed");
  }
  const jobId = cleanString(existingJob?.id) || idValue("dbp-send-job");
  const preparationStartedAt = new Date().toISOString();
  if (!existingJob) {
    await db.prepare(`
      INSERT INTO data_box_plus_send_jobs (
        id, draft_id, idempotency_key, request_hash, status, phase, attempt_count,
        created_at, last_event_at
      ) VALUES (?, ?, ?, ?, 'prepared', 'validating', 1, ?, ?)
    `).bind(jobId, draft.id, draft.idempotencyKey, requestHash, preparationStartedAt, preparationStartedAt).run();
  } else {
    await db.prepare(`
      UPDATE data_box_plus_send_jobs
      SET status = 'prepared',
          phase = 'validating',
          attempt_count = COALESCE(attempt_count, 0) + 1,
          response_json = NULL,
          error_message = NULL,
          started_at = NULL,
          finished_at = NULL,
          last_event_at = ?
      WHERE id = ?
    `).bind(preparationStartedAt, jobId).run();
  }

  let mailbox;
  let directAccount;
  let endpoint = "";
  let apiKey = "";
  const providerAttachments = [];
  try {
    mailbox = await db.prepare("SELECT * FROM data_box_plus_mailboxes WHERE id = ? LIMIT 1").bind(draft.mailboxId).first();
    if (!mailbox) throw new DataBoxPlusStoreError("Odesílající schránka nebyla nalezena.", 404, "data_box_plus_mailbox_not_found");
    directAccount = await dataBoxPlusSendingAccount(env, mailbox);
    endpoint = cleanString(env.DATA_BOX_SEND_MESSAGE_ENDPOINT || env.DATA_BOX_SEND_REPLY_ENDPOINT || env.DATA_BOX_REPLY_ENDPOINT || env.KNF_DATA_BOX_REPLY_ENDPOINT);
    apiKey = cleanString(env.DATA_BOX_REPLY_API_KEY || env.KNF_DATA_BOX_REPLY_API_KEY);
    if (!directAccount && !(endpoint && apiKey)) {
      throw new DataBoxPlusStoreError(
        "Odesílající schránka nemá aktivní přístup ISDS.",
        503,
        "data_box_plus_ds_sender_missing"
      );
    }
    const totalMessageBytes = new TextEncoder().encode(draft.body).byteLength
      + draft.attachments.reduce((total, attachment) => total + numberValue(attachment.sizeBytes), 0);
    if (totalMessageBytes > 20 * 1024 * 1024) {
      throw new DataBoxPlusStoreError(
        "Datová zpráva včetně textu a příloh může mít nejvýše 20 MB.",
        400,
        "data_box_plus_message_too_large"
      );
    }
    await db.prepare(`
      UPDATE data_box_plus_send_jobs
      SET phase = 'loading_attachments', last_event_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), jobId).run();
    for (const attachment of draft.attachments) {
      if (!bucket) throw new DataBoxPlusStoreError("Úložiště příloh není dostupné.", 503, "data_box_plus_storage_missing");
      const attachmentRow = await db
        .prepare("SELECT storage_key FROM data_box_plus_draft_attachments WHERE id = ? AND draft_id = ? LIMIT 1")
        .bind(attachment.id, draft.id)
        .first();
      const object = attachmentRow?.storage_key ? await bucket.get(attachmentRow.storage_key) : null;
      if (!object) throw new DataBoxPlusStoreError(`Příloha ${attachment.fileName} není dostupná.`, 409, "data_box_plus_attachment_object_missing");
      providerAttachments.push({
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        contentBase64: bytesToBase64(new Uint8Array(await object.arrayBuffer()))
      });
    }
  } catch (error) {
    const message = cleanString(error?.message || "Příprava datové zprávy selhala.");
    const finishedAt = new Date().toISOString();
    await db.prepare(`
      UPDATE data_box_plus_send_jobs
      SET status = 'failed',
          phase = 'preparation_failed',
          response_json = ?,
          error_message = ?,
          finished_at = ?,
          last_event_at = ?
      WHERE id = ?
    `).bind(
      JSON.stringify({ phase: "preparation_failed", code: cleanString(error?.code) }).slice(0, 8000),
      message,
      finishedAt,
      finishedAt,
      jobId
    ).run();
    await db.prepare("UPDATE data_box_plus_drafts SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(message, draft.id)
      .run();
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw new DataBoxPlusStoreError(message, numberValue(error?.status, 500), cleanString(error?.code || "data_box_plus_send_preparation_failed"));
  }

  const requestPayload = {
    sourceMailboxId: draft.mailboxId,
    sourceMailboxIsdsId: cleanString(mailbox.isds_id),
    originalMessageId: draft.replyToMessageId,
    recipientDataBoxId: draft.recipientBoxId,
    recipientName: draft.recipientName,
    subject: draft.subject,
    body: draft.body,
    attachments: providerAttachments,
    idempotencyKey: draft.idempotencyKey
  };
  const sendingStartedAt = new Date().toISOString();
  await db.prepare(`
    UPDATE data_box_plus_send_jobs
    SET status = 'sending',
        phase = 'calling_isds',
        started_at = ?,
        error_message = NULL,
        last_event_at = ?
    WHERE id = ?
  `).bind(sendingStartedAt, sendingStartedAt, jobId).run();
  await db.prepare("UPDATE data_box_plus_drafts SET status = 'sending', error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(draft.id)
    .run();

  let response = null;
  let result = {};
  try {
    if (directAccount) {
      result = await sendDataBoxIsdsMessage(env, directAccount, {
        recipientDataBoxId: draft.recipientBoxId,
        subject: draft.subject,
        body: draft.body,
        attachments: providerAttachments
      });
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DATA_BOX_PLUS_SEND_TIMEOUT_MS);
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": draft.idempotencyKey
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal
        });
        result = await response.json().catch(() => ({}));
      } finally {
        clearTimeout(timeout);
      }
    }
  } catch (error) {
    const message = cleanString(error?.message || "DS brána nevrátila výsledek.");
    const explicitIsdsFailure = error instanceof DataBoxIsdsError;
    const failureState = explicitIsdsFailure ? "failed" : "unknown";
    const finishedAt = new Date().toISOString();
    await db.prepare(`
      UPDATE data_box_plus_send_jobs
      SET status = ?,
          phase = ?,
          response_json = ?,
          error_message = ?,
          finished_at = ?,
          last_event_at = ?
      WHERE id = ?
    `)
      .bind(
        failureState,
        explicitIsdsFailure ? "isds_rejected" : "unknown",
        JSON.stringify({ phase: explicitIsdsFailure ? "isds_rejected" : "unknown", code: cleanString(error?.code) }).slice(0, 8000),
        message,
        finishedAt,
        finishedAt,
        jobId
      )
      .run();
    await db.prepare("UPDATE data_box_plus_drafts SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(failureState, message, draft.id)
      .run();
    if (explicitIsdsFailure) {
      throw new DataBoxPlusStoreError(
        message || "ISDS odeslání odmítlo.",
        numberValue(error.status, 502),
        cleanString(error.code || "data_box_plus_ds_send_failed")
      );
    }
    throw new DataBoxPlusStoreError(
      "ISDS nevrátilo potvrzení. Opakované odeslání je zablokované proti duplicitě.",
      502,
      "data_box_plus_send_result_unknown"
    );
  }

  const sent = directAccount ? result.success === true : Boolean(response?.ok && result.success !== false);
  const providerMessageId = cleanString(result.sentMessageId || result.messageId || result.dmID);
  const responseReceivedAt = new Date().toISOString();
  await db.prepare(`
    UPDATE data_box_plus_send_jobs
    SET phase = 'response_received',
        provider_message_id = ?,
        response_json = ?,
        last_event_at = ?
    WHERE id = ?
  `).bind(providerMessageId, JSON.stringify(result).slice(0, 8000), responseReceivedAt, jobId).run();
  if (!sent) {
    const message = cleanString(result.error || result.message || `HTTP ${response?.status || 502}`);
    await db.prepare(`
      UPDATE data_box_plus_send_jobs
      SET status = 'failed',
          phase = 'provider_rejected',
          response_json = ?,
          error_message = ?,
          finished_at = ?,
          last_event_at = ?
      WHERE id = ?
    `)
      .bind(JSON.stringify(result).slice(0, 8000), message, responseReceivedAt, responseReceivedAt, jobId)
      .run();
    await db.prepare("UPDATE data_box_plus_drafts SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(message, draft.id)
      .run();
    throw new DataBoxPlusStoreError(message || "Datovou zprávu se nepodařilo odeslat.", 502, "data_box_plus_ds_send_failed");
  }

  const sentAt = new Date().toISOString();
  await db.prepare(`
    UPDATE data_box_plus_send_jobs
    SET status = 'sent',
        phase = 'completed',
        provider_message_id = ?,
        response_json = ?,
        finished_at = ?,
        last_event_at = ?
    WHERE id = ?
  `)
    .bind(providerMessageId, JSON.stringify(result).slice(0, 8000), sentAt, sentAt, jobId)
    .run();
  await db.prepare(`
    UPDATE data_box_plus_drafts
    SET status = 'sent', provider_message_id = ?, sent_at = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(providerMessageId, sentAt, draft.id).run();

  const sentMessageId = messageRecordId(draft.mailboxId, "sent", providerMessageId || draft.idempotencyKey);
  const auditWarnings = [];
  try {
    await db.prepare(`
      INSERT OR IGNORE INTO data_box_plus_messages (
        id, mailbox_id, isds_message_id, direction, sender_name, sender_box_id, recipient_name,
        recipient_box_id, subject, delivered_at, received_at, message_type, status, risk_level,
        priority, due_date, suggested_action, priority_reason, primary_action, assigned_to,
        archive_status, attachment_status, facts_json, summary, summary_source, summary_loaded,
        source, stored_at, updated_at
      ) VALUES (?, ?, ?, 'sent', ?, ?, ?, ?, ?, ?, ?, 'Odeslaná zpráva', 'Odesláno datovou schránkou',
        '', 'normal', '', '', '', 'Otevřít', '', 'active',
        ?, '[]', '', '', 0, 'isds-send', ?, ?)
    `).bind(
      sentMessageId,
      draft.mailboxId,
      providerMessageId || draft.idempotencyKey,
      cleanString(mailbox.name || mailbox.company),
      cleanString(mailbox.isds_id),
      draft.recipientName || draft.recipientBoxId,
      draft.recipientBoxId,
      draft.subject,
      sentAt,
      sentAt,
      draft.attachments.length ? "Dostupná" : "Bez příloh",
      sentAt,
      sentAt
    ).run();
    for (const attachment of draft.attachments) {
      const attachmentRow = await db.prepare("SELECT storage_key FROM data_box_plus_draft_attachments WHERE id = ? LIMIT 1").bind(attachment.id).first();
      await db.prepare(`
        INSERT OR IGNORE INTO data_box_plus_attachments (
          id, message_id, file_name, mime_type, size_bytes, storage_key, storage_status,
          text_extraction_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'Stažená', 'Text se nezpracovává', ?, ?)
      `).bind(
        `${sentMessageId}-${attachment.id}`.slice(0, 180),
        sentMessageId,
        attachment.fileName,
        attachment.mimeType,
        attachment.sizeBytes,
        cleanString(attachmentRow?.storage_key),
        sentAt,
        sentAt
      ).run();
    }
    await db.prepare(`
      INSERT INTO data_box_plus_action_log (
        id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'sent', ?)
    `).bind(
      idValue("dbp-action"),
      draft.replyToMessageId || sentMessageId,
      actorName(currentUser),
      draft.replyToMessageId ? "Odeslání odpovědi datovou zprávou" : "Odeslání nové datové zprávy",
      JSON.stringify({
        draftId: draft.id,
        replyToMessageId: draft.replyToMessageId,
        recipientDataBoxId: draft.recipientBoxId,
        subject: draft.subject,
        attachmentCount: draft.attachments.length,
        idempotencyKey: draft.idempotencyKey
      }),
      sentAt,
      `${draft.replyToMessageId ? "Odpověď" : "Nová datová zpráva"} byla potvrzeně odeslána${providerMessageId ? ` jako ${providerMessageId}` : ""}.`
    ).run();
    if (draft.replyToMessageId) {
      await db.prepare(`
        UPDATE data_box_plus_messages
        SET status = 'Odpovězeno datovou schránkou',
            assigned_to = ?,
            suggested_action = 'Odpověď byla odeslána přes datovou schránku.',
            primary_action = 'Detail historie',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND direction = 'received'
      `).bind(draft.recipientBoxId, draft.replyToMessageId).run();
      await updateMailboxCounters(db, draft.mailboxId);
    }
  } catch (error) {
    auditWarnings.push("Zpráva byla odeslaná, ale lokální evidence není úplná.");
    console.error("data_box_plus.new_message_audit_failed", { message: error?.message, draftId: draft.id, providerMessageId });
  }
  return {
    apiStatus: "ready",
    status: "sent",
    providerMessageId,
    draft: await dataBoxPlusDraft(db, draft.id, currentUser),
    auditWarning: auditWarnings.join(" "),
    notice: `Datová zpráva byla odeslána do schránky ${draft.recipientBoxId}.`
  };
}

export async function applyDataBoxPlusBulkAction(env, currentUser, payload = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const messageIds = [...new Set((Array.isArray(payload.messageIds) ? payload.messageIds : []).map(cleanString).filter(Boolean))].slice(0, 100);
  const action = cleanString(payload.action).toLowerCase();
  if (!messageIds.length) throw new DataBoxPlusStoreError("Vyber alespoň jednu zprávu.", 400, "data_box_plus_bulk_empty");
  if (!["archive", "handoff", "complete", "due"].includes(action)) {
    throw new DataBoxPlusStoreError("Tato hromadná akce není podporovaná.", 400, "data_box_plus_bulk_action_invalid");
  }
  const assignedTo = cleanString(payload.assignedTo).slice(0, 255);
  const dueDate = cleanString(payload.dueDate);
  if (action === "handoff" && !assignedTo) throw new DataBoxPlusStoreError("Doplň, komu zprávy předat.", 400, "data_box_plus_bulk_assignee_missing");
  if (action === "due" && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new DataBoxPlusStoreError("Doplň platné datum lhůty.", 400, "data_box_plus_bulk_due_invalid");
  }
  const results = [];
  for (const messageId of messageIds) {
    try {
      const row = await db.prepare("SELECT id, mailbox_id, direction FROM data_box_plus_messages WHERE id = ? LIMIT 1").bind(messageId).first();
      if (!row) throw new DataBoxPlusStoreError("Zpráva nebyla nalezena.", 404, "data_box_plus_message_not_found");
      ensureReceivedDataBoxPlusMessage(row);
      if (action === "archive") {
        await db.prepare("UPDATE data_box_plus_messages SET status = 'Archivováno', archive_status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(messageId).run();
      } else if (action === "complete") {
        await db.prepare("UPDATE data_box_plus_messages SET status = 'Vyřešeno', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(messageId).run();
      } else if (action === "handoff") {
        await db.prepare("UPDATE data_box_plus_messages SET status = 'Předáno', assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(assignedTo, messageId).run();
      } else {
        await db.prepare("UPDATE data_box_plus_messages SET due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(dueDate, messageId).run();
      }
      await db.prepare(`
        INSERT INTO data_box_plus_action_log (
          id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
        ) VALUES (?, ?, NULL, ?, 'Hromadná akce', ?, ?, 'done', ?)
      `).bind(
        idValue("dbp-action"),
        messageId,
        actorName(currentUser),
        JSON.stringify({ action, assignedTo, dueDate }),
        new Date().toISOString(),
        `Hromadná akce ${action} byla provedena a zapsána do historie.`
      ).run();
      await updateMailboxCounters(db, cleanString(row.mailbox_id));
      results.push({ messageId, status: "done" });
    } catch (error) {
      results.push({ messageId, status: "failed", error: cleanString(error?.message || "Akce selhala.") });
    }
  }
  return {
    status: results.every((item) => item.status === "done") ? "done" : "partial",
    results,
    succeeded: results.filter((item) => item.status === "done").length,
    failed: results.filter((item) => item.status === "failed").length
  };
}

export async function getDataBoxPlusAttachmentArchiveFiles(env, messageIds = []) {
  const db = dataBoxPlusDatabase(env, true);
  const bucket = dataBoxPlusDocumentsBucket(env);
  if (!bucket) throw new DataBoxPlusStoreError("Úložiště příloh není dostupné.", 503, "data_box_plus_storage_missing");
  const ids = [...new Set((Array.isArray(messageIds) ? messageIds : []).map(cleanString).filter(Boolean))].slice(0, 50);
  if (!ids.length) throw new DataBoxPlusStoreError("Vyber zprávu s přílohami.", 400, "data_box_plus_archive_empty");
  const placeholders = ids.map(() => "?").join(", ");
  const result = await db.prepare(`
    SELECT a.*, m.subject
    FROM data_box_plus_attachments a
    JOIN data_box_plus_messages m ON m.id = a.message_id
    WHERE a.message_id IN (${placeholders}) AND a.storage_key IS NOT NULL AND a.storage_key <> ''
    ORDER BY m.delivered_at DESC, a.file_name
  `).bind(...ids).all();
  if (!(result.results || []).length) {
    throw new DataBoxPlusStoreError("Vybrané zprávy nemají uložené přílohy.", 404, "data_box_plus_archive_no_files");
  }
  if ((result.results || []).length > 100) {
    throw new DataBoxPlusStoreError("Najednou lze stáhnout nejvýše 100 příloh.", 400, "data_box_plus_archive_too_many");
  }
  const files = [];
  let totalBytes = 0;
  const usedNames = new Map();
  for (const row of result.results || []) {
    const object = await bucket.get(row.storage_key);
    if (!object) continue;
    const bytes = new Uint8Array(await object.arrayBuffer());
    totalBytes += bytes.byteLength;
    if (totalBytes > 100 * 1024 * 1024) {
      throw new DataBoxPlusStoreError("ZIP může mít nejvýše 100 MB.", 400, "data_box_plus_archive_too_large");
    }
    const baseName = safeFilename(`${cleanString(row.subject).slice(0, 60)} - ${row.file_name}`, "priloha");
    const duplicateIndex = numberValue(usedNames.get(baseName), 0);
    usedNames.set(baseName, duplicateIndex + 1);
    const fileName = duplicateIndex ? `${baseName}-${duplicateIndex + 1}` : baseName;
    files.push({ fileName, bytes });
  }
  if (!files.length) throw new DataBoxPlusStoreError("Soubory příloh nebyly v úložišti nalezeny.", 404, "data_box_plus_archive_objects_missing");
  return files;
}

export async function listDataBoxPlusRecommendations(env, filters = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const limit = limitValue(filters.limit, 100);
  const status = cleanString(filters.status || "waiting");
  const whereSql = status === "all" ? "WHERE m.direction <> 'sent'" : "WHERE r.status = ? AND m.direction <> 'sent'";
  const bindings = status === "all" ? [] : [status];
  try {
    const result = await db
      .prepare(`
        SELECT r.*
        FROM data_box_plus_recommendations r
        JOIN data_box_plus_messages m ON m.id = r.message_id
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .bind(...bindings, limit)
      .all();
    return (result.results || []).map(rowToRecommendation);
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function listDataBoxPlusRules(env) {
  const db = dataBoxPlusDatabase(env, true);
  try {
    const result = await db.prepare("SELECT * FROM data_box_plus_rules ORDER BY status, name").all();
    return (result.results || []).map(rowToRule);
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function listDataBoxPlusSyncRuns(env, filters = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const limit = limitValue(filters.limit, 30, 100);
  try {
    const result = await db
      .prepare("SELECT * FROM data_box_plus_sync_runs ORDER BY started_at DESC LIMIT ?")
      .bind(limit)
      .all();
    return (result.results || []).map(rowToSyncRun);
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

async function recommendationById(db, id) {
  const row = await db.prepare(`
    SELECT r.*
    FROM data_box_plus_recommendations r
    JOIN data_box_plus_messages m ON m.id = r.message_id
    WHERE r.id = ? AND m.direction <> 'sent'
    LIMIT 1
  `).bind(cleanString(id)).first();
  const recommendation = rowToRecommendation(row);
  if (!recommendation?.id) {
    throw new DataBoxPlusStoreError("Návrh Autopilota nebyl nalezen.", 404, "data_box_plus_recommendation_not_found");
  }
  return recommendation;
}

function instructionPlanFromText(instruction, message = {}, attachments = []) {
  const userInstruction = cleanString(instruction);
  if (!userInstruction) {
    throw new DataBoxPlusStoreError("Napiš pokyn pro Autopilota.", 400, "data_box_plus_instruction_missing");
  }
  const attachmentText = attachments.map((attachment) => cleanString(attachment.extracted_text)).join(" ");
  const normalized = searchText([userInstruction, message.subject, message.sender_name, attachmentText]);
  const base = {
    userInstruction,
    sendsOutsideSystem: false,
    deletesMessage: false,
    writesHistory: true,
    createsLearningPattern: true,
    risk: cleanString(message.risk_level || "Běžné"),
    evidence: `Pokyn uživatele: ${userInstruction}`
  };
  const plan = (overrides) => ({ ...base, ...overrides });

  if (normalized.includes("nechat") && (normalized.includes("nevyrizene") || normalized.includes("otevrene"))) {
    return plan({
      actionType: "leave_open",
      confirmLabel: "Nechat nevyřízené",
      recommendedAction: "Nechat zprávu nevyřízenou.",
      assistantText: "Rozumím. Nechám zprávu nevyřízenou pro pozdější rozhodnutí. Nic se neodešle mimo systém.",
      afterConfirm: "Zpráva zůstane otevřená. Akce se zapíše do historie a Autopilot si zapamatuje, že u podobných zpráv nemá spěchat.",
      messageStatus: "Čeká na pokyn",
      archiveStatus: "active",
      assignedTo: "",
      resultLabel: "Zpráva zůstává nevyřízená.",
      nextStep: "Vrátit se ke zprávě později.",
      performedAction: "Ponechání zprávy nevyřízené",
      auditNote: "Zpráva byla ponechána nevyřízená. Nic se neodeslalo mimo systém.",
      learningPattern: "U podobných zpráv nabídnout ponechání k pozdějšímu rozhodnutí."
    });
  }

  if (normalized.includes("archiv") || normalized.includes("registr smluv")) {
    return plan({
      actionType: "archive",
      confirmLabel: "Potvrdit archivaci",
      recommendedAction: "Archivovat zprávu jako vyřízenou nebo informativní.",
      assistantText: "Rozumím. Připravím archivaci. Nic se nesmaže a datová zpráva se nikam neodešle.",
      afterConfirm: "Zpráva se označí jako archivovaná. Nic se nesmaže. Akce se zapíše do historie a postup se uloží jako vzor.",
      messageStatus: "Archivováno",
      archiveStatus: "archived",
      assignedTo: "",
      resultLabel: normalized.includes("registr smluv") ? "Informační zpráva z Registru smluv byla uložena do archivu." : "Zpráva byla uložena do archivu.",
      nextStep: "Bez další akce.",
      performedAction: "Archivace zprávy",
      auditNote: "Zpráva byla interně archivována. Nic se nesmazalo ani neodeslalo mimo systém.",
      learningPattern: "U podobných informativních zpráv nabídnout archivaci."
    });
  }

  if (normalized.includes("cssz") || normalized.includes("mzd") || normalized.includes("podani prijato") || normalized.includes("evidenc")) {
    const resolveOnly = normalized.includes("vyres") || normalized.includes("evidenc") || normalized.includes("podani prijato") || normalized.includes("potvrzeni");
    return plan({
      actionType: resolveOnly ? "payroll_record" : "payroll_handoff",
      confirmLabel: resolveOnly ? "Potvrdit označení jako vyřešené" : "Potvrdit předání",
      recommendedAction: resolveOnly ? "Označit jako vyřešené a uložit k evidenci." : "Předat mzdové účetní.",
      assistantText: resolveOnly
        ? "Rozumím. Označím zprávu jako vyřešenou s výsledkem: Podání přijato ČSSZ. Nic se neodešle mimo systém."
        : "Rozumím. Připravím předání mzdové účetní. Datová zpráva se nikam neodešle.",
      afterConfirm: resolveOnly
        ? "Zpráva bude označená jako vyřešená. Akce se zapíše do historie a Autopilot si vzor uloží pro příště."
        : "Zpráva se interně předá mzdové účetní. Nic se neodešle mimo systém a akce bude dohledatelná.",
      messageStatus: resolveOnly ? "Vyřešeno" : "Předáno",
      archiveStatus: "active",
      assignedTo: resolveOnly ? "" : "Mzdová účetní",
      resultLabel: resolveOnly ? "Podání přijato ČSSZ." : "Předáno mzdové účetní.",
      nextStep: resolveOnly ? "Bez další akce." : "Čeká na mzdovou účetní.",
      performedAction: resolveOnly ? "Uložení potvrzení ČSSZ k evidenci" : "Předání mzdové účetní",
      auditNote: resolveOnly
        ? "Zpráva byla označena jako vyřešená a uložená k evidenci. Nic se neodeslalo mimo systém."
        : "Zpráva byla interně předána mzdové účetní. Nic se neodeslalo mimo systém.",
      learningPattern: resolveOnly
        ? "U podobných potvrzení ČSSZ nabídnout označení jako vyřešené."
        : "U podobných mzdových zpráv nabídnout předání mzdové účetní."
    });
  }

  if (normalized.includes("faktur") || normalized.includes("ucetn") || normalized.includes("účetn")) {
    return plan({
      actionType: "handoff",
      confirmLabel: "Potvrdit předání",
      recommendedAction: "Předat na faktury@kaiserservis.cz.",
      assistantText: "Rozumím. Připravím předání na faktury@kaiserservis.cz. Zpráva se nesmaže a datová zpráva se nikam neodešle.",
      afterConfirm: "Zpráva se označí jako předaná účetnímu oddělení. Nic se neodešle mimo systém a akce se zapíše do historie.",
      messageStatus: "Předáno",
      archiveStatus: "active",
      assignedTo: "faktury@kaiserservis.cz",
      resultLabel: "Předáno účetnímu oddělení.",
      nextStep: "Čeká na účetní.",
      performedAction: "Předání účetnímu oddělení",
      auditNote: "Zpráva byla interně předána účetnímu oddělení. Nic se neodeslalo mimo systém.",
      learningPattern: "U podobných faktur a upomínek nabídnout předání účetnímu oddělení."
    });
  }

  if (normalized.includes("stk") || normalized.includes("termin") || normalized.includes("termín") || normalized.includes("lhut") || normalized.includes("kalendar")) {
    const plateMatch = cleanString(userInstruction).match(/\b\d[A-Z0-9]{2}\s?\d{4}\b/i);
    return plan({
      actionType: "deadline",
      confirmLabel: "Potvrdit zapsání lhůty",
      recommendedAction: plateMatch ? `Zapsat termín k vozidlu ${plateMatch[0].toUpperCase()}.` : "Zapsat termín k ručnímu doplnění.",
      assistantText: "Chybí konkrétní termín nebo vozidlo. Doplň údaj pro zápis.",
      afterConfirm: "Zpráva se označí pro zadání lhůty. Nic se neodešle mimo systém a krok bude dohledatelný.",
      messageStatus: "Rozpracováno",
      archiveStatus: "active",
      assignedTo: "Garážmistr",
      resultLabel: plateMatch ? `Připraven termín k vozidlu ${plateMatch[0].toUpperCase()}.` : "Připraveno zapsání termínu.",
      nextStep: "Doplnit konkrétní termín a zodpovědnou osobu.",
      performedAction: "Zapsání lhůty k ručnímu doplnění",
      auditNote: "Zpráva byla označena pro zadání lhůty. Nic se neodeslalo mimo systém.",
      learningPattern: "U podobných provozních termínů nabídnout přípravu lhůty k potvrzení."
    });
  }

  if (normalized.includes("gt brno") || normalized.includes("pravnik") || normalized.includes("právn") || normalized.includes("exekuc") || normalized.includes("soud")) {
    return plan({
      actionType: "legal_handoff",
      confirmLabel: "Potvrdit předání",
      recommendedAction: "Předat GT Brno.",
      assistantText: "Rozumím. Připravím interní předání GT Brno. Nic se neodešle mimo systém.",
      afterConfirm: "Zpráva se označí jako předaná GT Brno. Právní nebo finanční dopad zůstává pod kontrolou člověka.",
      messageStatus: "Předáno",
      archiveStatus: "active",
      assignedTo: "GT Brno",
      resultLabel: "Předáno GT Brno.",
      nextStep: "Čeká na ruční zpracování GT Brno.",
      performedAction: "Předání GT Brno",
      auditNote: "Zpráva byla interně předána GT Brno. Nic se neodeslalo mimo systém.",
      learningPattern: "U podobných právních zpráv nabídnout předání GT Brno."
    });
  }

  if (normalized.includes("ukol") || normalized.includes("úkol") || normalized.includes("radim")) {
    return plan({
      actionType: "task",
      confirmLabel: "Potvrdit přiřazení",
      recommendedAction: "Vytvořit interní úkol pro Radima.",
      assistantText: "Rozumím. Připravím interní úkol pro Radima. Datová zpráva se nikam neodešle.",
      afterConfirm: "Zpráva se přiřadí Radimovi jako interní úkol. Akce se zapíše do historie.",
      messageStatus: "Rozpracováno",
      archiveStatus: "active",
      assignedTo: "Radim",
      resultLabel: "Vytvořen interní úkol pro Radima.",
      nextStep: "Čeká na Radima.",
      performedAction: "Vytvoření interního úkolu",
      auditNote: "Ke zprávě byl připraven interní úkol. Nic se neodeslalo mimo systém.",
      learningPattern: "U podobných zpráv nabídnout vytvoření interního úkolu."
    });
  }

  if (normalized.includes("vyres") || normalized.includes("vyřeš") || normalized.includes("zpracovan")) {
    return plan({
      actionType: "resolve",
      confirmLabel: "Potvrdit označení jako vyřešené",
      recommendedAction: "Označit zprávu jako vyřešenou.",
      assistantText: "Rozumím. Označím zprávu jako vyřešenou. Nic se neodešle mimo systém.",
      afterConfirm: "Zpráva bude označená jako vyřešená, akce se zapíše do historie a vzor se uloží pro příště.",
      messageStatus: "Vyřešeno",
      archiveStatus: "active",
      assignedTo: "",
      resultLabel: "Zpráva byla označena jako vyřešená.",
      nextStep: "Bez další akce.",
      performedAction: "Označení jako vyřešené",
      auditNote: "Zpráva byla označena jako vyřešená. Nic se neodeslalo mimo systém.",
      learningPattern: "U podobných zpráv nabídnout označení jako vyřešené."
    });
  }

  return plan({
    actionType: "assignment",
    confirmLabel: "Potvrdit přiřazení",
    recommendedAction: "Přiřadit zprávu odpovědné osobě.",
    assistantText: "Rozumím. Připravím interní přiřazení odpovědné osobě. Nic se neodešle mimo systém.",
    afterConfirm: "Zpráva se interně přiřadí k vyřízení a akce se zapíše do historie.",
    messageStatus: "Rozpracováno",
    archiveStatus: "active",
    assignedTo: "Odpovědná osoba",
    resultLabel: "Přiřazeno odpovědné osobě.",
    nextStep: "Čeká na ruční zpracování.",
    performedAction: "Přiřazení odpovědné osobě",
    auditNote: "Zpráva byla interně přiřazena k vyřízení. Nic se neodeslalo mimo systém.",
    learningPattern: "U podobných zpráv nabídnout přiřazení odpovědné osobě."
  });
}

function emailRecipientFromInstruction(userInstruction, normalized) {
  const directEmail = normalizeEmail(cleanString(userInstruction).match(/[^\s<>"]+@[^\s<>"]+\.[^\s<>",.]+/i)?.[0]);
  if (directEmail) return { email: directEmail, label: directEmail, ambiguous: false };
  if (normalized.includes("faktur")) {
    return { email: "faktury@kaiserservis.cz", label: "faktury@kaiserservis.cz", ambiguous: false };
  }
  if (normalized.includes("sarlot") || normalized.includes("sarlota")) {
    return { email: "sarlota@kaiserservis.cz", label: "sarlota@kaiserservis.cz", ambiguous: false };
  }
  if (normalized.includes("vyz email") || normalized.includes("vyz e-mail") || normalized.includes("vyz")) {
    return { email: "", label: "vyz email", ambiguous: true };
  }
  return { email: "", label: "", ambiguous: true };
}

const DATA_BOX_PLUS_CAPABILITY_REPLY = "Napište mi, co mám s touto datovou zprávou udělat. Můžu ji archivovat, označit jako vyřízenou, odeslat odpověď nebo předat kolegovi.";

function dataBoxPlusChatWords(value) {
  return searchText([value]).replace(/[^a-z0-9@._-]+/g, " ").replace(/\s+/g, " ").trim();
}

function dataBoxPlusSmalltalk(value) {
  const words = dataBoxPlusChatWords(value);
  if (!words || [
    "co", "ahoj", "cau", "dobry den", "test", "zkouska", "ano", "souhlasim",
    "souhlas", "proved", "provedte", "potvrzuji", "ne", "nesouhlasim", "zrus", "zrusit", "storno"
  ].includes(words)) return true;
  return words.includes("tvoje poslani") || words.includes("co umis") || words.includes("kdo jsi");
}

function dataBoxPlusKnownAction(value) {
  const normalized = searchText([value]);
  return [
    "archiv", "vyriz", "vyres", "doplnen", "kontrol", "poznamk", "ukol", "odpove",
    "predat", "predej", "prirad", "pripomen", "email", "e-mail", "odesli", "posli",
    "preposl", "presli", "prepsan", "sms", "datov", "vozid", "stk", "smaz", "potrebuje pokyn", "nelze provest"
  ].some((token) => normalized.includes(token));
}

function dataBoxPlusInternalRecipient(value) {
  const match = cleanString(value).match(/(?:předej|predej|předat|predat|přiřaď|prirad)(?:\s+(?:to|zprávu|zpravu))?\s+(.+)$/i);
  const recipient = cleanString(match?.[1]).replace(/^(?:kolegovi|kolegyni|kolegu)\s+/i, "");
  return /^(?:|kolegovi|kolegyni|kolegu)$/i.test(recipient) ? "" : recipient.slice(0, 120);
}

function dataBoxPlusReminderDate(value, now = new Date()) {
  const normalized = searchText([value]);
  const relativeDays = normalized.includes("pozitri") ? 2 : normalized.includes("zitra") ? 1 : 0;
  if (relativeDays) return new Date(now.getTime() + relativeDays * 86400000).toISOString().slice(0, 10);
  const days = Number(normalized.match(/za\s+(\d{1,3})\s+(?:den|dny|dni)/)?.[1] || 0);
  if (days > 0) return new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
  const explicit = normalized.match(/\b(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})\b/);
  if (!explicit) return "";
  const date = new Date(Date.UTC(Number(explicit[3]), Number(explicit[2]) - 1, Number(explicit[1])));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function intelligentInstructionPlanFromText(instruction, message = {}, attachments = [], context = {}) {
  const userInstruction = cleanString(instruction);
  if (!userInstruction) {
    throw new DataBoxPlusStoreError("Napište pokyn k této zprávě.", 400, "data_box_plus_instruction_missing");
  }
  const normalized = searchText([userInstruction]);
  const currentStatus = cleanString(message.status || message.messageStatus || "Nová");
  const sourceMessage = {
    messageId: cleanString(message.id),
    mailboxId: cleanString(message.mailbox_id || message.mailboxId),
    senderName: cleanString(message.sender_name || message.senderName),
    senderBoxId: cleanString(message.sender_box_id || message.senderBoxId),
    recipientBoxId: cleanString(message.recipient_box_id || message.recipientBoxId),
    subject: cleanString(message.subject)
  };
  const make = (overrides = {}) => {
    const outcome = cleanString(overrides.outcome || "done");
    const actionSummary = cleanString(overrides.actionSummary || overrides.performedAction || "Nebylo provedeno nic");
    const completionText = cleanString(overrides.completionText || `Hotovo. ${actionSummary}.`);
    return {
      userInstruction,
      intent: cleanString(overrides.intent || "unknown"),
      actionType: cleanString(overrides.intent || "unknown"),
      understoodAs: cleanString(overrides.understoodAs || actionSummary),
      outcome,
      statusLabel: cleanString(overrides.statusLabel || (outcome === "done" ? "Hotovo" : "Informativní")),
      messageStatus: cleanString(overrides.messageStatus || currentStatus),
      archiveStatus: cleanString(overrides.archiveStatus),
      assignedTo: cleanString(overrides.assignedTo),
      resultLabel: cleanString(overrides.resultLabel || actionSummary),
      nextStep: cleanString(overrides.nextStep || "Napsat konkrétní pokyn"),
      primaryAction: cleanString(overrides.primaryAction || "Detail historie"),
      performedAction: cleanString(overrides.performedAction || actionSummary),
      actionSummary,
      auditNote: cleanString(overrides.auditNote || (outcome === "done" ? `Provedeno: ${actionSummary}.` : "Nebylo provedeno nic.")),
      assistantText: cleanString(overrides.assistantText || (outcome === "done" ? completionText : DATA_BOX_PLUS_CAPABILITY_REPLY)),
      confirmationPrompt: "",
      completionText,
      recipientEmail: normalizeEmail(overrides.recipientEmail),
      recipientPhone: cleanString(overrides.recipientPhone),
      recipientDataBoxId: cleanString(overrides.recipientDataBoxId),
      recipientLabel: cleanString(overrides.recipientLabel || overrides.recipientEmail || overrides.assignedTo),
      emailSent: false,
      sendsEmail: Boolean(overrides.sendsEmail),
      externalAction: Boolean(overrides.externalAction),
      supported: overrides.supported !== false,
      changesMessage: Boolean(overrides.changesMessage),
      writesHistory: true,
      requiresConfirmation: Boolean(overrides.requiresConfirmation),
      requiresInput: outcome === "needs_input",
      pendingIntent: cleanString(overrides.pendingIntent),
      missingField: cleanString(overrides.missingField),
      recipientOptions: Array.isArray(overrides.recipientOptions) ? overrides.recipientOptions : [],
      dueDate: cleanString(overrides.dueDate),
      noteText: cleanString(overrides.noteText),
      draftText: cleanString(overrides.draftText),
      subject: cleanString(overrides.subject),
      body: cleanString(overrides.body),
      sourceMessage
    };
  };
  const noAction = (overrides = {}) => make({
    outcome: "not_done",
    statusLabel: "Informativní",
    performedAction: "Nebylo provedeno nic",
    resultLabel: "Bez změny zprávy.",
    assistantText: DATA_BOX_PLUS_CAPABILITY_REPLY,
    auditNote: "Nebylo provedeno nic. Vstup neobsahoval jasný provozní pokyn.",
    ...overrides
  });
  const needsInput = (pendingIntent, missingField, assistantText, understoodAs) => make({
    intent: "need_more_info",
    outcome: "needs_input",
    statusLabel: "Potřebuji doplnit",
    understoodAs,
    performedAction: "Nebylo provedeno nic",
    resultLabel: "Chybí údaj.",
    nextStep: "Doplnit údaj",
    primaryAction: "Doplnit údaj",
    assistantText,
    auditNote: `Nebylo provedeno nic. Chybí údaj: ${missingField}.`,
    pendingIntent,
    missingField
  });
  const replyDraft = ({ recipientEmail = "", recipientLabel = "" } = {}) => {
    const subject = cleanString(message.subject || "datové zprávě");
    return make({
      intent: "prepare_reply",
      outcome: "draft_ready",
      statusLabel: "Návrh připraven",
      actionSummary: "připravit návrh odpovědi bez odeslání",
      understoodAs: "příprava návrhu odpovědi",
      resultLabel: "Návrh odpovědi připraven.",
      nextStep: "Otevřít a zkontrolovat návrh",
      primaryAction: "Otevřít návrh",
      performedAction: "Návrh odpovědi připraven",
      assistantText: "Návrh odpovědi je připravený. Nic nebylo odesláno.",
      completionText: "Návrh odpovědi je připravený. Nic nebylo odesláno.",
      draftText: `Dobrý den,\n\nděkujeme za datovou zprávu „${subject}“. Návrh odpovědi před odesláním doplňte a zkontrolujte.\n\nS pozdravem`,
      recipientEmail,
      recipientLabel,
      sendsEmail: false,
      externalAction: true,
      changesMessage: false,
      auditNote: "Návrh odpovědi byl připraven. Nic nebylo odesláno."
    });
  };
  const sendEmailAction = ({ recipientEmail = "", recipientLabel = "" } = {}) => {
    const subject = cleanString(message.subject || "Datová zpráva");
    return make({
      intent: "send_email",
      outcome: "waiting_confirmation",
      statusLabel: "Čeká na potvrzení",
      actionSummary: `odeslat datovou zprávu e-mailem na ${recipientEmail}`,
      understoodAs: `odeslání datové zprávy e-mailem na ${recipientEmail}`,
      resultLabel: `Odesláno na ${recipientEmail}.`,
      nextStep: "Bez další akce.",
      performedAction: `E-mail odeslán na ${recipientEmail}`,
      assistantText: `Odešlu datovou zprávu e-mailem na ${recipientEmail}. Mám provést?`,
      completionText: `Hotovo. E-mail byl odeslán na ${recipientEmail}.`,
      recipientEmail,
      recipientLabel,
      subject,
      body: `Předávám datovou zprávu „${subject}“ k vyřízení.`,
      sendsEmail: true,
      externalAction: true,
      changesMessage: true,
      requiresConfirmation: true,
      auditNote: "E-mail čeká na finální potvrzení a zatím nebyl odeslán."
    });
  };

  if (dataBoxPlusSmalltalk(userInstruction)) {
    return noAction({ intent: dataBoxPlusChatWords(userInstruction) ? "smalltalk" : "unknown", understoodAs: "obecná nebo nejasná zpráva bez provozní akce" });
  }

  const pendingIntent = cleanString(context.pendingIntent);
  if (pendingIntent && !dataBoxPlusKnownAction(userInstruction)) {
    if (pendingIntent === "assign_to_user") {
      return make({
        intent: "assign_to_user",
        actionSummary: `interně předat zprávu osobě ${userInstruction}`,
        understoodAs: `interní předání osobě ${userInstruction}`,
        messageStatus: "Předáno kolegovi",
        assignedTo: userInstruction,
        resultLabel: `Předáno osobě ${userInstruction}.`,
        nextStep: `Čeká na ${userInstruction}`,
        performedAction: `Interní předání osobě ${userInstruction}`,
        completionText: `Hotovo. Zpráva byla interně předána osobě ${userInstruction}.`,
        changesMessage: true
      });
    }
    if (pendingIntent === "send_email") {
      const recipient = emailRecipientFromInstruction(userInstruction, normalized);
      if (recipient.email) return sendEmailAction({ recipientEmail: recipient.email, recipientLabel: recipient.label });
    }
    if (pendingIntent === "send_data_box_reply") {
      const subject = cleanString(message.subject || "Datová zpráva");
      return make({
        intent: "send_data_box_reply",
        outcome: "waiting_confirmation",
        statusLabel: "Čeká na potvrzení",
        actionSummary: "odeslat odpověď přes datovou schránku",
        understoodAs: "odeslání odpovědi přes datovou schránku",
        recipientDataBoxId: cleanString(message.sender_box_id || message.senderBoxId),
        subject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
        body: userInstruction,
        assistantText: "Odešlu odpověď přes datovou schránku. Mám provést?",
        completionText: "Hotovo. Odpověď byla odeslána přes datovou schránku.",
        externalAction: true,
        changesMessage: true,
        requiresConfirmation: true
      });
    }
    if (pendingIntent === "set_reminder") {
      const dueDate = dataBoxPlusReminderDate(userInstruction);
      if (dueDate) return make({
        intent: "set_reminder",
        actionSummary: `uložit termín připomínky ${dueDate}`,
        understoodAs: "nastavení termínu připomínky",
        dueDate,
        resultLabel: `Termín připomínky ${dueDate} uložen.`,
        performedAction: `Termín připomínky uložen na ${dueDate}`,
        completionText: `Hotovo. Termín připomínky byl uložen na ${dueDate}. Automatické upozornění zatím neběží.`,
        changesMessage: true
      });
    }
    if (pendingIntent === "internal_note") return make({
      intent: "internal_note",
      actionSummary: `přidat interní poznámku: ${userInstruction}`,
      understoodAs: "přidání interní poznámky",
      noteText: userInstruction,
      resultLabel: "Interní poznámka přidána.",
      performedAction: "Interní poznámka přidána",
      completionText: "Hotovo. Interní poznámka byla přidána k historii zprávy.",
      changesMessage: true
    });
  }

  if ((normalized.includes("datovou zpravu") || normalized.includes("uradu"))
    && (normalized.includes("odesli") || normalized.includes("posli") || normalized.includes("odpovez"))) {
    return needsInput("send_data_box_reply", "body", "Jaký přesný text mám přes datovou schránku odeslat?", "odeslání odpovědi přes datovou schránku");
  }
  if (normalized.includes("smaz") || normalized.includes("odstran zpravu")) {
    return noAction({
      intent: "cannot_execute",
      outcome: "cannot_execute",
      statusLabel: "Nelze provést",
      understoodAs: "smazání datové zprávy",
      resultLabel: "Datovou zprávu nelze z chatu smazat.",
      assistantText: "Datovou zprávu z chatu nesmažu. Nebylo provedeno nic.",
      auditNote: "Nebylo provedeno nic. Požadavek na smazání byl odmítnut.",
      supported: false
    });
  }

  const directRecipient = emailRecipientFromInstruction(userInstruction, normalized);
  if (normalized.includes("sms") && (normalized.includes("posli") || normalized.includes("odesli"))) {
    return needsInput("send_sms", "recipientPhone", "Chybí telefon a přesný text SMS. Komu a co mám odeslat?", "odeslání SMS");
  }
  const emailIntent = normalized.includes("email")
    || normalized.includes("e-mail")
    || (Boolean(directRecipient.email) && ["posli", "odesli", "preposl", "presli", "predan", "predej", "predat", "prepsan"].some((token) => normalized.includes(token)));
  if (emailIntent) {
    const recipient = directRecipient;
    if (!recipient.email) return needsInput("send_email", "recipientEmail", "Chybí adresát. Komu to mám předat nebo přeposlat?", "odeslání e-mailu");
    return sendEmailAction({ recipientEmail: recipient.email, recipientLabel: recipient.label });
  }
  if (normalized.includes("potrebuje pokyn") || (normalized.includes("nechat") && normalized.includes("nevyrizene"))) return make({
    intent: "need_instruction",
    actionSummary: "nastavit stav Potřebuje pokyn",
    understoodAs: "ponechání zprávy k dalšímu rozhodnutí",
    messageStatus: "Potřebuje pokyn",
    resultLabel: "Zpráva potřebuje další pokyn.",
    performedAction: "Stav nastaven na Potřebuje pokyn",
    completionText: "Hotovo. Zpráva nyní potřebuje další pokyn.",
    changesMessage: true
  });
  if (normalized.includes("archiv")) return make({
    intent: "archive_info",
    actionSummary: "archivovat zprávu jako informativní",
    understoodAs: "archivace informativní zprávy",
    messageStatus: "Archivováno",
    archiveStatus: "archived",
    resultLabel: "Archivováno jako informativní.",
    nextStep: "Bez další akce.",
    performedAction: "Archivováno jako informativní",
    completionText: "Hotovo. Zpráva byla archivována jako informativní.",
    changesMessage: true
  });
  if (normalized.includes("vyriz") || normalized.includes("vyres") || normalized.includes("zpracovan")) return make({
    intent: "mark_done",
    actionSummary: "označit zprávu jako vyřízenou",
    understoodAs: "označení jako vyřízené",
    messageStatus: "Vyřešeno",
    resultLabel: "Označeno jako vyřízené.",
    nextStep: "Bez další akce.",
    performedAction: "Označeno jako vyřízené",
    completionText: "Hotovo. Zpráva byla označena jako vyřízená.",
    changesMessage: true
  });
  if (normalized.includes("k doplneni") || normalized.includes("potrebuje kontrolu") || normalized.includes("vyzaduje kontrolu")) return make({
    intent: "need_more_info",
    actionSummary: "přesunout zprávu do K doplnění",
    understoodAs: "označení zprávy pro kontrolu",
    messageStatus: "Potřebuje upřesnit",
    resultLabel: "Zpráva vyžaduje kontrolu.",
    nextStep: "Doplnit nebo zkontrolovat údaje",
    primaryAction: "Otevřít zprávu",
    performedAction: "Přesunuto do K doplnění",
    completionText: "Hotovo. Zpráva byla přesunuta do K doplnění.",
    changesMessage: true
  });
  if (normalized.includes("nelze provest")) return make({
    intent: "mark_cannot_execute",
    actionSummary: "označit zprávu jako Nelze provést",
    understoodAs: "ruční označení neproveditelné akce",
    messageStatus: "Nelze provést",
    resultLabel: "Označeno jako Nelze provést.",
    nextStep: "Otevřít zprávu",
    primaryAction: "Otevřít zprávu",
    performedAction: "Označeno jako Nelze provést",
    completionText: "Hotovo. Zpráva byla označena jako Nelze provést.",
    changesMessage: true
  });
  if (normalized.includes("poznamk")) {
    const noteText = cleanString(userInstruction.replace(/^.*?pozn[aá]mk\w*\s*/i, ""));
    if (!noteText || noteText === userInstruction) return needsInput("internal_note", "noteText", "Jakou interní poznámku mám ke zprávě přidat?", "přidání interní poznámky");
    return make({
      intent: "internal_note",
      actionSummary: `přidat interní poznámku: ${noteText}`,
      understoodAs: "přidání interní poznámky",
      noteText,
      resultLabel: "Interní poznámka přidána.",
      performedAction: "Interní poznámka přidána",
      completionText: "Hotovo. Interní poznámka byla přidána k historii zprávy.",
      changesMessage: true
    });
  }
  if (normalized.includes("ukol")) {
    const assignee = cleanString(context.actor || "Odpovědná osoba");
    return make({
      intent: "create_task",
      actionSummary: `vytvořit interní úkol u zprávy pro ${assignee}`,
      understoodAs: "vytvoření interního úkolu u datové zprávy",
      messageStatus: "Rozpracováno",
      assignedTo: assignee,
      resultLabel: `Interní úkol pro ${assignee}.`,
      nextStep: `Čeká na ${assignee}`,
      performedAction: `Interní úkol vytvořen pro ${assignee}`,
      completionText: `Hotovo. U datové zprávy vznikl interní úkol pro ${assignee}.`,
      changesMessage: true
    });
  }
  if (dataBoxPlusExplicitDraftInstruction(userInstruction)) {
    return replyDraft();
  }
  if (normalized.includes("odpove")) {
    return needsInput("send_data_box_reply", "body", "Jaký přesný text mám přes datovou schránku odeslat?", "odeslání odpovědi přes datovou schránku");
  }
  if (normalized.includes("pripomen")) {
    const dueDate = dataBoxPlusReminderDate(userInstruction);
    if (!dueDate) return needsInput("set_reminder", "dueDate", "Kdy mám připomínku nastavit?", "nastavení termínu připomínky");
    return make({
      intent: "set_reminder",
      actionSummary: `uložit termín připomínky ${dueDate}`,
      understoodAs: "nastavení termínu připomínky",
      dueDate,
      resultLabel: `Termín připomínky ${dueDate} uložen.`,
      performedAction: `Termín připomínky uložen na ${dueDate}`,
      completionText: `Hotovo. Termín připomínky byl uložen na ${dueDate}. Automatické upozornění zatím neběží.`,
      changesMessage: true
    });
  }

  const specialRecipient = normalized.includes("mzd")
    ? "Mzdová účetní"
    : normalized.includes("faktur") || normalized.includes("ucetn")
      ? "faktury@kaiserservis.cz"
      : normalized.includes("garaz")
        ? "Garážmistr"
        : "";
  if (specialRecipient) return make({
    intent: "assign_to_user",
    actionSummary: `interně předat zprávu osobě ${specialRecipient}`,
    understoodAs: `interní předání osobě ${specialRecipient}`,
    messageStatus: specialRecipient === "Mzdová účetní" ? "Předáno mzdové účetní" : specialRecipient === "Garážmistr" ? "Předáno garážmistrovi" : "Předáno fakturám",
    assignedTo: specialRecipient,
    resultLabel: `Předáno osobě ${specialRecipient}.`,
    nextStep: `Čeká na ${specialRecipient}`,
    performedAction: `Interní předání osobě ${specialRecipient}`,
    completionText: `Hotovo. Zpráva byla interně předána osobě ${specialRecipient}.`,
    changesMessage: true
  });
  if (normalized.includes("vozid") || normalized.includes("stk")) {
    const attachmentText = attachments.map((attachment) => cleanString(attachment.extracted_text || attachment.extractedText)).join(" ");
    const plate = [userInstruction, cleanString(message.subject), attachmentText].join(" ").match(/\b\d[A-Z0-9]{2}\s?\d{4}\b/i)?.[0];
    if (!plate) return needsInput("assign_to_user", "vehicle", "Ke kterému vozidlu mám zprávu přiřadit?", "předání vozidlové agendy");
    return make({
      intent: "assign_to_user",
      actionSummary: `interně předat vozidlovou agendu k vozidlu ${plate.toUpperCase()}`,
      understoodAs: "předání vozidlové agendy",
      messageStatus: "Předáno garážmistrovi",
      assignedTo: "Garážmistr",
      resultLabel: `Předáno garážmistrovi k vozidlu ${plate.toUpperCase()}.`,
      performedAction: `Předáno garážmistrovi k vozidlu ${plate.toUpperCase()}`,
      completionText: "Hotovo. Předáno garážmistrovi.",
      changesMessage: true
    });
  }
  if (normalized.includes("predat") || normalized.includes("predej") || normalized.includes("prirad")) {
    const recipient = dataBoxPlusInternalRecipient(userInstruction);
    if (!recipient) return needsInput("assign_to_user", "assignedTo", "Chybí adresát. Komu mám zprávu interně předat?", "interní předání kolegovi");
    return make({
      intent: "assign_to_user",
      actionSummary: `interně předat zprávu osobě ${recipient}`,
      understoodAs: `interní předání osobě ${recipient}`,
      messageStatus: "Předáno kolegovi",
      assignedTo: recipient,
      resultLabel: `Předáno osobě ${recipient}.`,
      nextStep: `Čeká na ${recipient}`,
      performedAction: `Interní předání osobě ${recipient}`,
      completionText: `Hotovo. Zpráva byla interně předána osobě ${recipient}.`,
      changesMessage: true
    });
  }
  return noAction({ intent: "unknown", understoodAs: "nejasný pokyn" });
}

export function dataBoxPlusInstructionPlanForTest(instruction, message = {}, attachments = [], context = {}) {
  return intelligentInstructionPlanFromText(instruction, message, attachments, context);
}

const DATA_BOX_PLUS_CONFIRMATION_TTL_MS = 15 * 60 * 1000;
const DATA_BOX_PLUS_EXECUTABLE_ACTION_TYPES = new Set([
  "archive_info",
  "mark_done",
  "need_more_info",
  "mark_cannot_execute",
  "internal_note",
  "create_task",
  "send_data_box_reply",
  "send_email",
  "send_sms",
  "set_reminder",
  "assign_to_user"
]);

function dataBoxPlusExecutableAction(type) {
  return DATA_BOX_PLUS_EXECUTABLE_ACTION_TYPES.has(cleanString(type));
}

function dataBoxPlusConfirmationDecision(value) {
  const normalized = searchText([value]).replace(/[^a-z0-9]+/g, " ").trim();
  if (["ano", "proved", "provedte", "potvrzuji", "souhlasim", "souhlas", "ok"].includes(normalized)) return "confirm";
  if (["ne", "nic", "nic nedelej", "nic neprovadej", "nech to", "nechci nic", "zrus", "zrus to", "zrusit", "storno", "neprovadet", "nesouhlasim"].includes(normalized)) return "cancel";
  return "new_instruction";
}

function dataBoxPlusPragueDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dataBoxPlusActionDefaults(type, message = {}, currentUser = {}) {
  const actor = actorName(currentUser);
  const defaults = {
    archive_info: {
      messageStatus: "Archivováno",
      archiveStatus: "archived",
      completionText: "Hotovo. Zpráva byla archivována jako informativní.",
      changesMessage: true
    },
    mark_done: {
      messageStatus: "Vyřešeno",
      completionText: "Hotovo. Zpráva byla označena jako vyřízená.",
      changesMessage: true
    },
    need_more_info: {
      messageStatus: "Potřebuje upřesnit",
      completionText: "Hotovo. Zpráva byla označena jako potřebující doplnění.",
      changesMessage: true
    },
    mark_cannot_execute: {
      messageStatus: "Nelze provést",
      completionText: "Hotovo. Zpráva byla označena jako neproveditelná.",
      changesMessage: true
    },
    internal_note: {
      completionText: "Hotovo. Interní poznámka byla přidána do historie zprávy.",
      changesMessage: false
    },
    create_task: {
      messageStatus: "Rozpracováno",
      assignedTo: actor,
      completionText: `Hotovo. U zprávy vznikl interní úkol pro ${actor}.`,
      changesMessage: true
    },
    prepare_reply: {
      completionText: "Návrh odpovědi je připravený. Nic nebylo odesláno.",
      changesMessage: false
    },
    send_data_box_reply: {
      messageStatus: "Odesláno datovou schránkou",
      completionText: "Hotovo. Odpověď byla odeslána přes datovou schránku.",
      changesMessage: true,
      externalAction: true
    },
    send_email: {
      messageStatus: "Odesláno e-mailem",
      completionText: "Hotovo. E-mail byl odeslán.",
      changesMessage: true,
      externalAction: true
    },
    send_sms: {
      messageStatus: "Odesláno SMS",
      completionText: "Hotovo. SMS byla odeslána.",
      changesMessage: true,
      externalAction: true
    },
    set_reminder: {
      messageStatus: "Rozpracováno",
      completionText: "Hotovo. Termín připomínky byl uložený. Automatické upozornění zatím neběží.",
      changesMessage: true
    },
    assign_to_user: {
      messageStatus: "Předáno kolegovi",
      completionText: "Hotovo. Zpráva byla interně předána.",
      changesMessage: true
    }
  };
  return defaults[type] || {
    messageStatus: cleanString(message.status || "Nová"),
    completionText: "Hotovo.",
    changesMessage: false
  };
}

function dataBoxPlusServerPlanFromOpenAi(openAiPlan = {}, message = {}, currentUser = {}) {
  const action = openAiPlan.action && typeof openAiPlan.action === "object" ? openAiPlan.action : {};
  const type = cleanString(action.type || "none");
  const defaults = dataBoxPlusActionDefaults(type, message, currentUser);
  const outcome = cleanString(openAiPlan.outcome || "answer");
  const draftReady = type === "prepare_reply" && outcome !== "needs_input";
  const ready = outcome === "ready_for_confirmation" && dataBoxPlusExecutableAction(type);
  const recipientEmail = normalizeEmail(action.recipientEmail);
  const recipientPhone = normalizeCustomerPhone(action.recipientPhone);
  const recipientName = cleanString(action.recipientName);
  const assignedTo = cleanString(action.assignedTo || recipientName || defaults.assignedTo);
  const summary = cleanString(action.summary || "Navržená akce");
  const draftText = type === "prepare_reply" ? cleanString(action.body) : "";
  return {
    intent: cleanString(openAiPlan.intent || type || "conversation"),
    actionType: type,
    outcome: draftReady ? "draft_ready" : ready ? "waiting_confirmation" : outcome === "needs_input" ? "needs_input" : "answer",
    statusLabel: draftReady ? "Návrh připraven" : ready ? "Čeká na potvrzení" : outcome === "needs_input" ? "Potřebuji doplnit" : "Odpověď",
    understoodAs: summary,
    actionSummary: summary,
    performedAction: "Nebylo provedeno nic",
    assistantText: draftReady
      ? dataBoxPlusDraftAssistantText(draftText)
      : cleanString(openAiPlan.assistantText || "Jak vám mohu s touto zprávou pomoci?"),
    missingField: cleanString(openAiPlan.missingField),
    messageStatus: cleanString(defaults.messageStatus || message.status || "Nová"),
    archiveStatus: cleanString(defaults.archiveStatus),
    assignedTo,
    recipientName,
    recipientEmail,
    recipientPhone,
    recipientDataBoxId: cleanString(action.recipientDataBoxId || (type === "send_data_box_reply" ? message.sender_box_id || message.senderBoxId : "")),
    subject: cleanString(action.subject),
    body: cleanString(action.body),
    noteText: cleanString(action.noteText),
    dueDate: cleanString(action.dueDate),
    draftText,
    changesMessage: Boolean(defaults.changesMessage),
    externalAction: Boolean(defaults.externalAction),
    requiresConfirmation: ready,
    completionText: cleanString(defaults.completionText),
    sourceMessage: {
      messageId: cleanString(message.id),
      mailboxId: cleanString(message.mailbox_id || message.mailboxId),
      senderName: cleanString(message.sender_name || message.senderName),
      senderBoxId: cleanString(message.sender_box_id || message.senderBoxId),
      recipientBoxId: cleanString(message.recipient_box_id || message.recipientBoxId),
      subject: cleanString(message.subject)
    }
  };
}

export function dataBoxPlusDraftAssistantText(draftText = "") {
  const draft = cleanString(draftText);
  const notice = "Návrh odpovědi je připravený. Nic nebylo odesláno.";
  return draft ? `${notice}\n\n${draft}` : notice;
}

function dataBoxPlusExplicitDraftInstruction(instruction) {
  const normalized = searchText([instruction]);
  return normalized.includes("navrh") || normalized.includes("koncept") || normalized.includes("bez odeslani");
}

function dataBoxPlusExecutionVerb(instruction) {
  const normalized = searchText([instruction]);
  return ["odesli", "posli", "preposl", "presli", "predan", "predej", "predat", "prepsan", "odpovez"]
    .some((token) => normalized.includes(token));
}

function dataBoxPlusInstructionAuthorizesAction(instruction, actionType) {
  const normalized = searchText([instruction]);
  const type = cleanString(actionType);
  if (!type || type === "none") return true;
  if (type === "prepare_reply") {
    return /\b(priprav|sepis|vytvor|napis|navrh|koncept|odvolan|vyjadren|namitk|odpoved)\w*/.test(normalized);
  }
  if (type === "archive_info") return normalized.includes("archiv");
  if (type === "mark_done") return /\b(vyrid|vyres|hotov|oznac)\w*/.test(normalized);
  if (type === "need_more_info") return /\b(dopln|upres|chybi|potrebuje)\w*/.test(normalized);
  if (type === "mark_cannot_execute") return /\b(nelze|nemoz|neprovedit)\w*/.test(normalized);
  if (type === "internal_note") return normalized.includes("poznam");
  if (type === "create_task") return normalized.includes("ukol");
  if (type === "set_reminder") return /\b(pripomen|pripomink|termin)\w*/.test(normalized);
  if (type === "assign_to_user") return /\b(predat|predej|prirad|deleg)\w*/.test(normalized);
  if (type === "send_sms") return normalized.includes("sms") && dataBoxPlusExecutionVerb(instruction);
  if (type === "send_email") {
    return dataBoxPlusExecutionVerb(instruction)
      && (normalized.includes("email") || normalized.includes("e-mail") || normalized.includes("mail") || normalized.includes("preposl") || normalized.includes("presli") || normalized.includes("prepsan") || /[^\s<>\"]+@[^\s<>\"]+\.[^\s<>\",.]+/i.test(instruction));
  }
  if (type === "send_data_box_reply") {
    return dataBoxPlusExecutionVerb(instruction)
      && (normalized.includes("datov") || normalized.includes("odpovez") || normalized.includes("datovkou"));
  }
  return false;
}

function dataBoxPlusPendingInputAllowsAction(pendingRow, instruction, actionType) {
  if (!pendingRow?.id || dataBoxPlusNoOperationInstruction(instruction) || dataBoxPlusSmalltalk(instruction)) return false;
  const payload = safeJsonParse(pendingRow.action_payload, {});
  const pendingPlan = payload.plan && typeof payload.plan === "object" ? payload.plan : {};
  return Boolean(
    cleanString(payload.missingField || pendingPlan.missingField)
    && cleanString(pendingPlan.actionType) === cleanString(actionType)
  );
}

function groundDataBoxPlusPlan(instruction, plan, pendingInput = null) {
  const actionType = cleanString(plan?.actionType);
  if (!actionType || actionType === "none") return plan;
  if (dataBoxPlusInstructionAuthorizesAction(instruction, actionType)) return plan;
  if (dataBoxPlusPendingInputAllowsAction(pendingInput, instruction, actionType)) return plan;
  return {
    ...plan,
    intent: "conversation",
    actionType: "none",
    outcome: "answer",
    statusLabel: "Odpověď",
    understoodAs: "konverzace bez jednoznačného aktuálního příkazu",
    actionSummary: "Nebylo provedeno nic",
    performedAction: "Nebylo provedeno nic",
    assistantText: "Rozumím. K tomuto pokynu nemám jednoznačnou akci k provedení. Nic jsem nepřipravil ani neprovedl.",
    missingField: "",
    draftText: "",
    changesMessage: false,
    externalAction: false,
    requiresConfirmation: false
  };
}

function enforceDataBoxPlusExecutableIntent(instruction, plan, message = {}, currentUser = {}) {
  const normalized = searchText([instruction]);
  if (!dataBoxPlusExecutionVerb(instruction) || dataBoxPlusExplicitDraftInstruction(instruction)) return plan;

  const selfEmail = normalizeEmail(currentUser?.email);
  const selfTarget = selfEmail && (normalized.includes("muj email") || normalized.includes("moje email") || normalized.includes("muj mail") || normalized.includes("moje mail"));
  const recipient = selfTarget ? { email: selfEmail, label: cleanString(currentUser?.name) || selfEmail } : emailRecipientFromInstruction(instruction, normalized);
  const hasEmailTarget = Boolean(recipient.email || plan.recipientEmail);
  const emailContext = hasEmailTarget && (
    normalized.includes("email")
    || normalized.includes("e-mail")
    || normalized.includes("preposl")
    || normalized.includes("presli")
    || normalized.includes("predan")
    || normalized.includes("predej")
    || normalized.includes("predat")
    || normalized.includes("prepsan")
    || normalized.includes(" na ")
  );
  if (emailContext) {
    const recipientEmail = recipient.email || plan.recipientEmail;
    const subject = cleanString(plan.actionType === "send_email" ? plan.subject : "") || cleanString(message.subject || "Datová zpráva");
    const body = cleanString(plan.actionType === "send_email" ? plan.body : "") || `Předávám datovou zprávu „${cleanString(message.subject || "Datová zpráva")}“ k vyřízení.`;
    return {
      ...plan,
      intent: "send_email",
      actionType: "send_email",
      outcome: "waiting_confirmation",
      statusLabel: "Čeká na potvrzení",
      understoodAs: `odeslání datové zprávy e-mailem na ${recipientEmail}`,
      actionSummary: `Odeslat datovou zprávu e-mailem na ${recipientEmail}`,
      assistantText: `Odešlu datovou zprávu e-mailem na ${recipientEmail}. Mám provést?`,
      recipientEmail,
      recipientName: cleanString(plan.recipientName || recipient.label || recipientEmail),
      subject,
      body,
      draftText: "",
      messageStatus: "Odesláno e-mailem",
      changesMessage: true,
      externalAction: true,
      requiresConfirmation: true,
      completionText: `Hotovo. E-mail byl odeslán na ${recipientEmail}.`
    };
  }

  if (plan.outcome === "needs_input") return plan;

  const dataBoxContext = normalized.includes("datovou zpravu")
    || normalized.includes("datove schrank")
    || normalized.includes("datovkou")
    || normalized.startsWith("odpovez");
  if (dataBoxContext) {
    const recipientDataBoxId = cleanString(plan.recipientDataBoxId || message.sender_box_id || message.senderBoxId);
    const subject = cleanString(plan.subject) || (cleanString(message.subject).toLowerCase().startsWith("re:")
      ? cleanString(message.subject)
      : `Re: ${cleanString(message.subject || "Datová zpráva")}`);
    return {
      ...plan,
      intent: "send_data_box_reply",
      actionType: "send_data_box_reply",
      outcome: "waiting_confirmation",
      statusLabel: "Čeká na potvrzení",
      understoodAs: "odeslání odpovědi přes datovou schránku",
      actionSummary: "Odeslat odpověď přes datovou schránku",
      assistantText: "Odešlu odpověď přes datovou schránku. Mám provést?",
      recipientDataBoxId,
      subject,
      body: cleanString(plan.body || plan.draftText),
      draftText: "",
      messageStatus: "Odesláno datovou schránkou",
      changesMessage: true,
      externalAction: true,
      requiresConfirmation: true,
      completionText: "Hotovo. Odpověď byla odeslána přes datovou schránku."
    };
  }

  if (normalized.includes("sms")) {
    return {
      ...plan,
      intent: "send_sms",
      actionType: "send_sms",
      outcome: "waiting_confirmation",
      statusLabel: "Čeká na potvrzení",
      understoodAs: "odeslání SMS",
      actionSummary: cleanString(plan.actionSummary || "Odeslat SMS"),
      assistantText: cleanString(plan.assistantText || "Odešlu SMS. Mám provést?"),
      draftText: "",
      messageStatus: "Odesláno SMS",
      changesMessage: true,
      externalAction: true,
      requiresConfirmation: true,
      completionText: "Hotovo. SMS byla odeslána."
    };
  }
  return plan;
}

export function dataBoxPlusOpenAiPlanForTest(openAiPlan = {}, message = {}, currentUser = {}, instruction = "") {
  const plan = dataBoxPlusServerPlanFromOpenAi(openAiPlan, message, currentUser);
  return instruction
    ? groundDataBoxPlusPlan(instruction, enforceDataBoxPlusExecutableIntent(instruction, plan, message, currentUser))
    : plan;
}

const DATA_BOX_PLUS_SERVER_DIRECT_ACTIONS = new Set([
  "archive_info",
  "mark_done",
  "need_more_info",
  "mark_cannot_execute",
  "assign_to_user",
  "create_task",
  "set_reminder"
]);

function dataBoxPlusServerDirectActionPlan(instruction, message = {}, attachments = [], context = {}, currentUser = {}) {
  const directPlan = intelligentInstructionPlanFromText(instruction, message, attachments, context);
  const actionType = cleanString(directPlan.intent);
  if (
    directPlan.outcome === "done"
    && directPlan.changesMessage
    && DATA_BOX_PLUS_SERVER_DIRECT_ACTIONS.has(actionType)
  ) return directPlan;

  // Předání bez adresáta není akce. Server proto musí vrátit přesnou otázku
  // na chybějící údaj, ne obecnou odpověď od GPT.
  if (
    directPlan.outcome === "needs_input"
    && cleanString(directPlan.pendingIntent) === "assign_to_user"
  ) return directPlan;

  return null;
}

async function dataBoxPlusContactCandidates(db) {
  const candidates = new Map();
  const add = (item = {}) => {
    const email = normalizeEmail(item.email);
    const phone = normalizeCustomerPhone(item.phone);
    const name = cleanString(item.name);
    const id = cleanString(item.id || item.userId || email || phone || name);
    if (!id || (!name && !email && !phone)) return;
    const key = cleanString(item.userId || email || phone || id).toLowerCase();
    const previous = candidates.get(key) || {};
    candidates.set(key, {
      id: cleanString(previous.id || id),
      userId: cleanString(previous.userId || item.userId),
      name: cleanString(previous.name || name),
      email: cleanString(previous.email || email),
      phone: cleanString(previous.phone || phone)
    });
  };
  try {
    const users = await db.prepare("SELECT id, name, email, phone FROM users WHERE active = 1 ORDER BY name LIMIT 500").all();
    for (const row of users.results || []) add(row);
  } catch (error) {
    console.info("data_box_plus.contact_users_unavailable", { message: cleanString(error?.message) });
  }
  try {
    const employees = await db.prepare(`
      SELECT id, user_id, first_name, last_name, email, phone
      FROM employee_cards
      WHERE employment_status = 'active'
      ORDER BY first_name, last_name
      LIMIT 500
    `).all();
    for (const row of employees.results || []) {
      add({
        id: row.id,
        userId: row.user_id,
        name: [row.first_name, row.last_name].map(cleanString).filter(Boolean).join(" "),
        email: row.email,
        phone: row.phone
      });
    }
  } catch (error) {
    console.info("data_box_plus.employee_contacts_unavailable", { message: cleanString(error?.message) });
  }
  return [...candidates.values()];
}

function dataBoxPlusContactMatch(candidates, name) {
  const wanted = searchText([name]).replace(/[^a-z0-9]+/g, " ").trim();
  if (!wanted) return { match: null, ambiguous: false };
  const exact = candidates.filter((candidate) => searchText([candidate.name]).replace(/[^a-z0-9]+/g, " ").trim() === wanted);
  if (exact.length === 1) return { match: exact[0], ambiguous: false };
  if (exact.length > 1) return { match: null, ambiguous: true };
  const partial = candidates.filter((candidate) => {
    const candidateName = searchText([candidate.name]).replace(/[^a-z0-9]+/g, " ").trim();
    return candidateName && (candidateName.includes(wanted) || wanted.includes(candidateName));
  });
  return partial.length === 1
    ? { match: partial[0], ambiguous: false }
    : { match: null, ambiguous: partial.length > 1 };
}

function dataBoxPlusNeedsInput(plan, assistantText, missingField) {
  return {
    ...plan,
    outcome: "needs_input",
    statusLabel: "Potřebuji doplnit",
    assistantText,
    missingField,
    requiresConfirmation: false,
    performedAction: "Nebylo provedeno nic"
  };
}

async function completeDataBoxPlusActionDetails(db, plan) {
  if (plan.outcome !== "waiting_confirmation") return plan;
  if (!dataBoxPlusExecutableAction(plan.actionType)) {
    return {
      ...plan,
      outcome: "cannot_execute",
      statusLabel: "Nelze provést",
      assistantText: "Tento úkon nemá skutečný backendový vykonavatel. Nic nebylo provedeno.",
      performedAction: "Nebylo provedeno nic",
      requiresConfirmation: false
    };
  }
  let completed = { ...plan };
  const requiresContact = ["send_email", "send_sms"].includes(plan.actionType);
  if (requiresContact && plan.recipientName && !(plan.recipientEmail || plan.recipientPhone)) {
    const candidates = await dataBoxPlusContactCandidates(db);
    const resolved = dataBoxPlusContactMatch(candidates, plan.recipientName);
    if (resolved.ambiguous) {
      return dataBoxPlusNeedsInput(plan, `Našel jsem více kontaktů pro ${plan.recipientName}. Koho přesně myslíte?`, "recipient");
    }
    if (resolved.match) {
      completed = {
        ...completed,
        recipientName: resolved.match.name || plan.recipientName,
        recipientEmail: completed.recipientEmail || resolved.match.email,
        recipientPhone: completed.recipientPhone || resolved.match.phone
      };
    }
  }
  if (completed.actionType === "send_email") {
    if (!completed.recipientEmail) return dataBoxPlusNeedsInput(completed, "Chybí platný e-mail příjemce. Komu mám e-mail poslat?", "recipientEmail");
    if (!completed.subject) return dataBoxPlusNeedsInput(completed, "Jaký má mít e-mail předmět?", "subject");
    if (!completed.body) return dataBoxPlusNeedsInput(completed, "Jaký přesný text mám e-mailem odeslat?", "body");
  }
  if (completed.actionType === "send_sms") {
    if (!completed.recipientPhone) return dataBoxPlusNeedsInput(completed, "Chybí platný telefon příjemce. Komu mám SMS poslat?", "recipientPhone");
    if (!completed.body) return dataBoxPlusNeedsInput(completed, "Jaký přesný text mám v SMS odeslat?", "body");
  }
  if (completed.actionType === "send_data_box_reply") {
    if (!completed.recipientDataBoxId) return dataBoxPlusNeedsInput(completed, "Chybí ID datové schránky příjemce.", "recipientDataBoxId");
    if (!completed.subject) return dataBoxPlusNeedsInput(completed, "Jaký má mít datová zpráva předmět?", "subject");
    if (!completed.body) return dataBoxPlusNeedsInput(completed, "Jaký přesný text mám přes datovou schránku odeslat?", "body");
  }
  if (completed.actionType === "assign_to_user" && !completed.assignedTo) {
    return dataBoxPlusNeedsInput(completed, "Komu mám zprávu interně předat?", "assignedTo");
  }
  if (completed.actionType === "internal_note" && !completed.noteText) {
    return dataBoxPlusNeedsInput(completed, "Jakou interní poznámku mám přidat?", "noteText");
  }
  if (completed.actionType === "set_reminder" && !/^\d{4}-\d{2}-\d{2}$/.test(completed.dueDate)) {
    return dataBoxPlusNeedsInput(completed, "Na který den mám připomínku nastavit?", "dueDate");
  }
  return completed;
}

async function dataBoxPlusChatHistoryForOpenAi(db, messageId) {
  const result = await db.prepare(`
    SELECT action_payload, result, created_at
    FROM data_box_plus_action_log
    WHERE message_id = ? AND action_type = 'Chatový pokyn'
    ORDER BY created_at DESC
    LIMIT 20
  `).bind(cleanString(messageId)).all();
  return (result.results || []).reverse().flatMap((row) => {
    const payload = safeJsonParse(row.action_payload, {});
    const instruction = cleanString(payload.originalInstruction || payload.userInstruction);
    const assistantText = cleanString(payload.assistantText);
    const state = cleanString(row.result);
    return [
      ...(instruction ? [{ role: "user", text: instruction, state }] : []),
      ...(assistantText ? [{ role: "assistant", text: assistantText, state }] : [])
    ];
  });
}

function dataBoxPlusAvailableChatTools(chatContext = {}) {
  const names = ["get_current_user_profile", "get_application_modules"];
  if ((chatContext.application?.modules || []).some((module) => module.id === "fleet" && module.permittedActions?.includes("view"))) {
    names.push("search_fleet_vehicles_by_driver");
  }
  return names;
}

function dataBoxPlusDriverSearchTokens(value) {
  const stopWords = new Set(["ridic", "ridice", "ridici", "vozidlo", "vozidla", "auto", "auta", "pan", "pani"]);
  return normalizedPerson(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

function dataBoxPlusFleetVehicleForChat(vehicle = {}) {
  const licensePlate = cleanString(vehicle.licensePlate || vehicle.tcarsLicensePlate);
  const label = [vehicle.brand, vehicle.model, vehicle.internalNumber]
    .map(cleanString)
    .filter(Boolean)
    .filter((value, index, values) => values.findIndex((candidate) => normalizedPerson(candidate) === normalizedPerson(value)) === index)
    .slice(0, 3)
    .join(" ") || licensePlate || "Vozidlo";
  return {
    id: cleanString(vehicle.id || vehicle.vehicleId || vehicle.tcarsVehicleId),
    label,
    licensePlate,
    vehicleType: cleanString(vehicle.vehicleType || vehicle.bodyType),
    assignedDriverName: cleanString(vehicle.assignedDriverName),
    status: cleanString(vehicle.status)
  };
}

function dataBoxPlusDriverCandidateMatches(candidate = {}, tokens = []) {
  const candidateTokens = dataBoxPlusDriverSearchTokens(candidate.name);
  return candidateTokens.length && tokens.every((token) => candidateTokens.includes(token));
}

function dataBoxPlusDriverIdentityForChat(fleet = {}, requestedName = "") {
  const tokens = dataBoxPlusDriverSearchTokens(requestedName);
  const candidates = (Array.isArray(fleet.driverCandidates) ? fleet.driverCandidates : [])
    .filter((candidate) => dataBoxPlusDriverCandidateMatches(candidate, tokens));
  if (candidates.length > 1) {
    return {
      ambiguous: true,
      candidates: candidates.slice(0, 8).map((candidate) => ({
        id: cleanString(candidate.id),
        userId: cleanString(candidate.userId),
        name: cleanString(candidate.name),
        department: cleanString(candidate.department),
        position: cleanString(candidate.position)
      }))
    };
  }
  if (candidates.length === 1) {
    const candidate = candidates[0];
    return {
      ambiguous: false,
      verified: true,
      matchMode: "canonical_driver",
      id: cleanString(candidate.id),
      userId: cleanString(candidate.userId),
      name: cleanString(candidate.name),
      lookupIds: [candidate.id, candidate.userId].map(cleanString).filter(Boolean)
    };
  }

  const matchingNames = [...new Set((Array.isArray(fleet.vehicles) ? fleet.vehicles : [])
    .map((vehicle) => cleanString(vehicle.assignedDriverName))
    .filter(Boolean)
    .filter((name) => dataBoxPlusDriverCandidateMatches({ name }, tokens)))];
  if (matchingNames.length > 1) {
    return {
      ambiguous: true,
      candidates: matchingNames.slice(0, 8).map((name) => ({ id: "", userId: "", name, department: "", position: "" }))
    };
  }
  return {
    ambiguous: false,
    verified: false,
    matchMode: matchingNames.length === 1 ? "fleet_assigned_name" : "no_match",
    id: "",
    userId: "",
    name: matchingNames[0] || requestedName,
    lookupIds: []
  };
}

export async function executeDataBoxPlusChatReadTool(env, currentUser, chatContext, call = {}) {
  const name = cleanString(call.name);
  const args = call.arguments && typeof call.arguments === "object" ? call.arguments : {};
  if (name === "get_current_user_profile") {
    return { ok: true, verified: true, user: chatContext.currentUser };
  }
  if (name === "get_application_modules") {
    return {
      ok: true,
      verified: true,
      application: {
        name: cleanString(chatContext.application?.name),
        purpose: cleanString(chatContext.application?.purpose),
        modules: Array.isArray(chatContext.application?.modules) ? chatContext.application.modules : []
      }
    };
  }
  if (name !== "search_fleet_vehicles_by_driver") {
    return { ok: false, verified: false, errorCode: "unsupported_chat_tool" };
  }
  const fleetAllowed = (chatContext.application?.modules || [])
    .some((module) => module.id === "fleet" && module.permittedActions?.includes("view"));
  if (!fleetAllowed) {
    return { ok: false, verified: false, errorCode: "fleet_permission_denied" };
  }
  const requestedDriver = cleanString(args.driverName);
  const driverName = dataBoxPlusSelfReference(requestedDriver) || ["ja", "moje", "muj"].includes(normalizedPerson(requestedDriver))
    ? cleanString(chatContext.currentUser?.name)
    : requestedDriver;
  const driverTokens = dataBoxPlusDriverSearchTokens(driverName);
  if (!driverTokens.length) {
    return { ok: false, verified: false, errorCode: "driver_name_missing" };
  }
  try {
    const fleet = await loadFleetVehiclesWithAssignments(env, currentUser);
    if (cleanString(fleet.apiStatus) !== "ready") {
      return {
        ok: false,
        verified: false,
        errorCode: "fleet_data_unavailable",
        source: cleanString(fleet.source || fleet.provider)
      };
    }
    const identity = dataBoxPlusDriverIdentityForChat(fleet, driverName);
    if (identity.ambiguous) {
      return {
        ok: true,
        verified: true,
        readOnly: true,
        ambiguous: true,
        driverName,
        source: cleanString(fleet.source || fleet.provider),
        candidates: identity.candidates,
        count: 0,
        vehicles: []
      };
    }
    const identityIds = new Set(identity.lookupIds || []);
    const resolvedDriverName = normalizedPerson(identity.name);
    const vehicles = (Array.isArray(fleet.vehicles) ? fleet.vehicles : [])
      .filter((vehicle) => {
        const assignedDriverId = cleanString(vehicle.assignedDriverId);
        if (assignedDriverId && identityIds.has(assignedDriverId)) return true;
        if (resolvedDriverName && normalizedPerson(vehicle.assignedDriverName) === resolvedDriverName) return true;
        if (identity.matchMode !== "no_match") return false;
        const assignedTokens = dataBoxPlusDriverSearchTokens(vehicle.assignedDriverName);
        return assignedTokens.length && driverTokens.every((token) => assignedTokens.includes(token));
      })
      .map(dataBoxPlusFleetVehicleForChat);
    return {
      ok: true,
      verified: true,
      readOnly: true,
      driverName: identity.name || driverName,
      driverIdentityVerified: identity.verified,
      matchMode: identity.matchMode,
      source: cleanString(fleet.source || fleet.provider),
      count: vehicles.length,
      vehicles
    };
  } catch (error) {
    console.error("data_box_plus.chat_fleet_tool_failed", { message: cleanString(error?.message) });
    return { ok: false, verified: false, errorCode: "fleet_lookup_failed" };
  }
}

async function dataBoxPlusLearningRulesForOpenAi(db) {
  const result = await db.prepare(`
    SELECT human_description, conditions_text, proposed_action, confirmed_count, reject_count
    FROM data_box_plus_rules
    WHERE type = 'Učící vzor' AND status NOT IN ('Neaktivní', 'Zamítnuto')
    ORDER BY confirmed_count DESC, last_used_at DESC, updated_at DESC
    LIMIT 24
  `).all();
  return (result.results || []).map((row) => ({
    description: cleanString(row.human_description),
    conditions: cleanString(row.conditions_text),
    proposedAction: cleanString(row.proposed_action),
    confirmedCount: numberValue(row.confirmed_count),
    rejectedCount: numberValue(row.reject_count)
  }));
}

async function latestDataBoxPlusPendingConfirmation(db, messageId, actor) {
  return db.prepare(`
    SELECT *
    FROM data_box_plus_action_log
    WHERE message_id = ?
      AND actor = ?
      AND action_type = 'Chatový pokyn'
      AND result = 'waiting_confirmation'
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(cleanString(messageId), cleanString(actor)).first();
}

async function dataBoxPlusConfirmationById(db, confirmationId, messageId, actor) {
  return db.prepare(`
    SELECT *
    FROM data_box_plus_action_log
    WHERE id = ?
      AND message_id = ?
      AND actor = ?
      AND action_type = 'Chatový pokyn'
    LIMIT 1
  `).bind(cleanString(confirmationId), cleanString(messageId), cleanString(actor)).first();
}

function dataBoxPlusConfirmationExpired(row) {
  const createdAt = Date.parse(cleanString(row?.created_at));
  return !Number.isFinite(createdAt) || Date.now() - createdAt > DATA_BOX_PLUS_CONFIRMATION_TTL_MS;
}

async function logDataBoxPlusOpenAiChatTurn(db, messageId, actor, instruction, plan, meta = {}) {
  const actionId = idValue("dbp-action");
  const createdAt = new Date().toISOString();
  const payload = {
    originalInstruction: cleanString(instruction),
    intent: cleanString(plan.intent),
    understoodAs: cleanString(plan.understoodAs),
    performedAction: cleanString(plan.performedAction || "Nebylo provedeno nic"),
    outcome: cleanString(plan.outcome),
    statusLabel: cleanString(plan.statusLabel),
    assistantText: cleanString(plan.assistantText),
    missingField: cleanString(plan.missingField),
    draftText: cleanString(plan.draftText),
    proposedAction: plan.outcome === "waiting_confirmation" ? {
      confirmationId: actionId,
      type: cleanString(plan.actionType),
      summary: cleanString(plan.actionSummary),
      recipientName: cleanString(plan.recipientName),
      recipientEmail: cleanString(plan.recipientEmail),
      recipientPhone: cleanString(plan.recipientPhone),
      recipientDataBoxId: cleanString(plan.recipientDataBoxId),
      subject: cleanString(plan.subject),
      body: cleanString(plan.body),
      assignedTo: cleanString(plan.assignedTo),
      noteText: cleanString(plan.noteText),
      dueDate: cleanString(plan.dueDate),
      expiresAt: new Date(Date.now() + DATA_BOX_PLUS_CONFIRMATION_TTL_MS).toISOString()
    } : null,
    plan,
    provider: cleanString(meta.provider),
    model: cleanString(meta.model),
    responseId: cleanString(meta.responseId)
  };
  await db.prepare(`
    INSERT INTO data_box_plus_action_log (
      id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
    ) VALUES (?, ?, NULL, ?, 'Chatový pokyn', ?, ?, ?, ?)
  `).bind(
    actionId,
    cleanString(messageId),
    cleanString(actor),
    JSON.stringify(payload),
    createdAt,
    cleanString(plan.outcome),
    plan.outcome === "waiting_confirmation"
      ? `${actor} připravil akci k potvrzení. Nic zatím nebylo provedeno.`
      : `${actor} vedl chat s Autopilotem. Nic nebylo provedeno.`
  ).run();
  return actionId;
}

async function rememberConfirmedDataBoxPlusChatPattern(db, message, plan, currentUser = null) {
  const type = cleanString(plan.actionType);
  if (!type || type === "none") return null;
  const sender = cleanString(message.sender_name || message.senderName || "odesílatel");
  const senderKey = searchText([sender]).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "odesilatel";
  const ruleId = `dbp-chat-learn-${type}-${senderKey}`.slice(0, 180);
  const actor = actorName(currentUser);
  await db.prepare(`
    INSERT INTO data_box_plus_rules (
      id, name, human_description, conditions_text, proposed_action, autonomy_level,
      confirmation_required, success_count, confirmed_count, edit_count, reject_count,
      last_used_at, status, type, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'Jen navrhovat', ?, 1, 1, 0, 0, CURRENT_TIMESTAMP, 'Učí se', 'Učící vzor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      human_description = excluded.human_description,
      conditions_text = excluded.conditions_text,
      proposed_action = excluded.proposed_action,
      success_count = data_box_plus_rules.success_count + 1,
      confirmed_count = data_box_plus_rules.confirmed_count + 1,
      last_used_at = CURRENT_TIMESTAMP,
      status = 'Učí se',
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    ruleId,
    `Potvrzený chat: ${sender}`.slice(0, 120),
    `Uživatel ${actor} potvrdil a úspěšně provedl akci: ${cleanString(plan.actionSummary)}.`,
    `Odesílatel: ${sender}. Předmět: ${cleanString(message.subject)}.`,
    cleanString(plan.actionSummary),
    "Vždy se znovu zeptat Mám provést?"
  ).run();
  return ruleId;
}

async function logIntelligentDataBoxPlusInstruction(db, id, actor, instruction, plan, result, options = {}) {
  const actionId = idValue("dbp-action");
  const performed = result === "done";
  const draftPrepared = result === "draft_ready";
  const payload = {
    originalInstruction: instruction,
    intent: plan.intent,
    understoodAs: plan.understoodAs,
    performedAction: performed || draftPrepared ? plan.performedAction : "Nebylo provedeno nic",
    previousStatus: cleanString(options.previousStatus),
    newStatus: performed && plan.changesMessage ? plan.messageStatus : "",
    outcome: result,
    statusLabel: plan.statusLabel,
    nextStep: plan.nextStep,
    recipient: plan.recipientEmail || plan.recipientLabel || plan.assignedTo || "",
    emailSent: false,
    sourceMessage: plan.sourceMessage,
    recipientOptions: plan.recipientOptions,
    assistantText: plan.assistantText,
    pendingIntent: plan.pendingIntent,
    missingField: plan.missingField,
    draftText: plan.draftText,
    noteText: plan.noteText,
    dueDate: plan.dueDate
  };
  await db.prepare(`
    INSERT INTO data_box_plus_action_log (
      id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
    )
    VALUES (?, ?, NULL, ?, 'Chatový pokyn', ?, ?, ?, ?)
  `).bind(
    actionId,
    id,
    actor,
    JSON.stringify(payload),
    new Date().toISOString(),
    result,
    performed
      ? `${actor} zadal pokyn ${quoteInstruction(instruction)}. Systém provedl: ${plan.performedAction}. Nový stav: ${plan.messageStatus}.`
      : draftPrepared
        ? `${actor} zadal pokyn ${quoteInstruction(instruction)}. Návrh odpovědi byl připraven. Nic nebylo odesláno.`
        : cleanString(plan.auditNote || `Nebylo provedeno nic. Výsledek: ${result}.`)
  ).run();
  return actionId;
}

async function latestPendingDataBoxPlusChatAction(db, id, actor) {
  return db.prepare(`
    SELECT *
    FROM data_box_plus_action_log
    WHERE message_id = ?
      AND actor = ?
      AND action_type = 'Chatový pokyn'
      AND result = 'needs_input'
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(id, actor).first();
}

async function closePendingDataBoxPlusChatActions(db, id, actor, result, note) {
  await db.prepare(`
    UPDATE data_box_plus_action_log
    SET result = ?, audit_note = ?
    WHERE message_id = ?
      AND actor = ?
      AND action_type = 'Chatový pokyn'
      AND result = 'needs_input'
  `).bind(result, note, id, actor).run();
}

async function applyIntelligentDataBoxPlusInstruction(db, message, plan) {
  await db.prepare(`
    UPDATE data_box_plus_messages
    SET status = CASE WHEN ? <> '' THEN ? ELSE status END,
        archive_status = CASE WHEN ? <> '' THEN ? ELSE archive_status END,
        assigned_to = CASE WHEN ? <> '' THEN ? ELSE assigned_to END,
        due_date = CASE WHEN ? <> '' THEN ? ELSE due_date END,
        suggested_action = CASE WHEN ? <> '' THEN ? ELSE suggested_action END,
        primary_action = CASE WHEN ? <> '' THEN ? ELSE primary_action END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    cleanString(plan.messageStatus), cleanString(plan.messageStatus),
    cleanString(plan.archiveStatus), cleanString(plan.archiveStatus),
    cleanString(plan.assignedTo), cleanString(plan.assignedTo),
    cleanString(plan.dueDate), cleanString(plan.dueDate),
    cleanString(plan.resultLabel), cleanString(plan.resultLabel),
    cleanString(plan.primaryAction), cleanString(plan.primaryAction),
    cleanString(message.id)
  ).run();
  try {
    await updateMailboxCounters(db, cleanString(message.mailbox_id));
  } catch (error) {
    console.error("data_box_plus.internal_action_counter_failed", { message: error.message, messageId: message.id });
  }
}

function dataBoxPlusConfirmationPayload(plan, confirmationId) {
  return {
    confirmationId: cleanString(confirmationId),
    type: cleanString(plan.actionType),
    summary: cleanString(plan.actionSummary),
    recipientName: cleanString(plan.recipientName),
    recipientEmail: cleanString(plan.recipientEmail),
    recipientPhone: cleanString(plan.recipientPhone),
    recipientDataBoxId: cleanString(plan.recipientDataBoxId),
    subject: cleanString(plan.subject),
    body: cleanString(plan.body),
    assignedTo: cleanString(plan.assignedTo),
    noteText: cleanString(plan.noteText),
    dueDate: cleanString(plan.dueDate),
    expiresAt: new Date(Date.now() + DATA_BOX_PLUS_CONFIRMATION_TTL_MS).toISOString()
  };
}

async function logDataBoxPlusConfirmationReply(db, messageId, actor, instruction, plan, result, note, learnedRuleId = "") {
  const actionId = idValue("dbp-action");
  const payload = {
    originalInstruction: cleanString(instruction),
    intent: cleanString(plan.intent || plan.actionType),
    understoodAs: cleanString(plan.actionSummary),
    actionType: cleanString(plan.actionType),
    performedAction: result === "done" ? cleanString(plan.actionSummary) : "Nebylo provedeno nic",
    outcome: result,
    statusLabel: result === "done" ? "Hotovo" : result === "cancelled" ? "Zrušeno" : "Nelze provést",
    assistantText: cleanString(plan.assistantText),
    recipientEmail: cleanString(plan.recipientEmail),
    recipientPhone: cleanString(plan.recipientPhone),
    recipientDataBoxId: cleanString(plan.recipientDataBoxId),
    assignedTo: cleanString(plan.assignedTo),
    subject: cleanString(plan.subject),
    noteText: cleanString(plan.noteText),
    dueDate: cleanString(plan.dueDate),
    proposedAction: null,
    confirmationId: cleanString(plan.confirmationId),
    learnedRuleId: cleanString(learnedRuleId)
  };
  await db.prepare(`
    INSERT INTO data_box_plus_action_log (
      id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
    ) VALUES (?, ?, NULL, ?, 'Chatový pokyn', ?, ?, ?, ?)
  `).bind(
    actionId,
    cleanString(messageId),
    cleanString(actor),
    JSON.stringify(payload),
    new Date().toISOString(),
    result,
    cleanString(note)
  ).run();
  return actionId;
}

async function executeDataBoxPlusConfirmedPlan(env, db, message, pendingRow, currentUser, instruction) {
  const actor = actorName(currentUser);
  const pendingPayload = safeJsonParse(pendingRow.action_payload, {});
  const plan = pendingPayload.plan && typeof pendingPayload.plan === "object" ? pendingPayload.plan : null;
  if (!plan?.actionType || !dataBoxPlusExecutableAction(plan.actionType)) {
    throw new DataBoxPlusStoreError("Připravený úkon nemá skutečný backendový vykonavatel. Nic nebylo provedeno.", 409, "data_box_plus_confirmation_invalid");
  }
  if (dataBoxPlusConfirmationExpired(pendingRow)) {
    await db.prepare("UPDATE data_box_plus_action_log SET result = 'expired', audit_note = ? WHERE id = ? AND result = 'waiting_confirmation'")
      .bind(`${actor} se pokusil potvrdit návrh po vypršení platnosti. Nic nebylo provedeno.`, pendingRow.id)
      .run();
    const expiredPlan = {
      ...plan,
      confirmationId: pendingRow.id,
      assistantText: "Tento návrh už vypršel. Napište prosím pokyn znovu."
    };
    const auditId = await logDataBoxPlusConfirmationReply(
      db,
      message.id,
      actor,
      instruction,
      expiredPlan,
      "expired",
      `${actor} potvrdil vypršelý návrh. Nic nebylo provedeno.`
    );
    return {
      apiStatus: "ready",
      status: "expired",
      action: expiredPlan,
      message: await getDataBoxPlusMessage(env, message.id),
      auditId,
      notice: expiredPlan.assistantText
    };
  }

  const claimed = await db.prepare(`
    UPDATE data_box_plus_action_log
    SET result = 'executing', audit_note = ?
    WHERE id = ? AND message_id = ? AND actor = ? AND result = 'waiting_confirmation'
  `).bind(
    `${actor} potvrdil připravenou akci. Server zahájil jednorázové provedení.`,
    pendingRow.id,
    message.id,
    actor
  ).run();
  if (numberValue(claimed?.meta?.changes) !== 1) {
    throw new DataBoxPlusStoreError("Tato akce už byla potvrzená nebo zrušená.", 409, "data_box_plus_confirmation_already_used");
  }

  let updatedMessage = message;
  let completionText = cleanString(plan.completionText || "Hotovo.");
  const auditWarnings = [];

  try {
    if (plan.actionType === "send_email") {
      const sent = await sendDataBoxPlusMessageEmail(env, message.id, {
        confirmed: true,
        recipientEmail: plan.recipientEmail,
        subject: plan.subject,
        body: plan.body
      }, currentUser);
      updatedMessage = sent.message || message;
      if (cleanString(sent.auditWarning)) auditWarnings.push(cleanString(sent.auditWarning));
      completionText = `Hotovo. E-mail byl odeslán na ${plan.recipientEmail}.`;
    } else if (plan.actionType === "send_data_box_reply") {
      const sent = await sendDataBoxPlusReply(env, message.id, {
        confirmed: true,
        recipientDataBoxId: plan.recipientDataBoxId,
        subject: plan.subject,
        body: plan.body
      }, currentUser);
      updatedMessage = sent.message || message;
      if (cleanString(sent.auditWarning)) auditWarnings.push(cleanString(sent.auditWarning));
      completionText = sent.notice || "Hotovo. Odpověď byla odeslána přes datovou schránku.";
    } else if (plan.actionType === "send_sms") {
      const sent = await sendCustomerMessage(env, {
        phone: plan.recipientPhone,
        channelPreference: "sms",
        template: "data_box_forward",
        variables: { message: plan.body },
        reason: "provozní předání datové zprávy",
        legalBasis: "oprávněný provozní zájem",
        relatedEntityType: "data_box_plus_message",
        relatedEntityId: message.id,
        recipientName: plan.recipientName
      });
      if (!sent.sent) {
        throw new DataBoxPlusStoreError(
          cleanString(sent.errorMessage || "SMS se nepodařilo odeslat."),
          502,
          "data_box_plus_sms_send_failed"
        );
      }
      if (cleanString(sent.auditWarning)) auditWarnings.push(cleanString(sent.auditWarning));
      try {
        await db.prepare(`
          UPDATE data_box_plus_messages
          SET status = 'Odesláno SMS', assigned_to = ?, suggested_action = ?, primary_action = 'Detail historie', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          cleanString(plan.recipientName || plan.recipientPhone),
          `SMS odeslána na ${cleanString(plan.recipientName || plan.recipientPhone)}.`,
          message.id
        ).run();
        await updateMailboxCounters(db, cleanString(message.mailbox_id));
      } catch (error) {
        auditWarnings.push("SMS byla odeslaná, ale nepodařilo se uložit nový stav datové zprávy.");
        console.error("data_box_plus.sms_message_status_failed", { message: error.message, messageId: message.id });
      }
      completionText = `Hotovo. SMS byla odeslána příjemci ${cleanString(plan.recipientName || plan.recipientPhone)}.`;
    } else if (plan.actionType === "internal_note") {
      await db.prepare(`
        INSERT INTO data_box_plus_action_log (
          id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
        ) VALUES (?, ?, NULL, ?, 'Interní poznámka', ?, ?, 'saved', ?)
      `).bind(
        idValue("dbp-action"),
        message.id,
        actor,
        JSON.stringify({ noteText: cleanString(plan.noteText), source: "data_box_plus_chat" }),
        new Date().toISOString(),
        `${actor} přidal ke zprávě interní poznámku.`
      ).run();
      completionText = "Hotovo. Interní poznámka byla přidána do historie zprávy.";
    } else if (plan.changesMessage) {
      await applyIntelligentDataBoxPlusInstruction(db, message, {
        ...plan,
        resultLabel: plan.actionSummary,
        primaryAction: "Detail historie"
      });
    } else {
      throw new DataBoxPlusStoreError("Potvrzený úkon nemá ověřitelný výsledek. Nic nebylo provedeno.", 409, "data_box_plus_action_executor_missing");
    }
  } catch (error) {
    const errorMessage = error instanceof DataBoxPlusStoreError
      ? error.message
      : "Akci se nepodařilo dokončit.";
    try {
      await db.prepare("UPDATE data_box_plus_action_log SET result = 'failed', audit_note = ? WHERE id = ? AND result = 'executing'")
        .bind(`${actor} akci potvrdil, ale provedení selhalo: ${errorMessage}`, pendingRow.id)
        .run();
    } catch (auditError) {
      console.error("data_box_plus.confirmation_failure_audit_failed", { message: auditError.message, confirmationId: pendingRow.id });
    }
    const failedPlan = {
      ...plan,
      confirmationId: pendingRow.id,
      outcome: "failed",
      statusLabel: "Chyba",
      assistantText: errorMessage,
      performedAction: "Provedení nebylo potvrzeno jako úspěšné"
    };
    try {
      await logDataBoxPlusConfirmationReply(
        db,
        message.id,
        actor,
        instruction,
        failedPlan,
        "failed",
        `${actor} potvrdil akci, ale provedení selhalo. Žádný úspěch nebyl uložený jako učící vzor.`
      );
    } catch (auditError) {
      console.error("data_box_plus.confirmation_failure_reply_log_failed", { message: auditError.message, confirmationId: pendingRow.id });
    }
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw new DataBoxPlusStoreError(errorMessage, 502, "data_box_plus_confirmation_failed");
  }

  if (!["send_email", "send_data_box_reply"].includes(plan.actionType)) {
    try {
      updatedMessage = await getDataBoxPlusMessage(env, message.id);
    } catch (error) {
      auditWarnings.push("Akce proběhla, ale nepodařilo se znovu načíst detail datové zprávy.");
      console.error("data_box_plus.confirmed_message_reload_failed", { message: error.message, messageId: message.id });
    }
  }

  let learnedRuleId = "";
  try {
    learnedRuleId = await rememberConfirmedDataBoxPlusChatPattern(db, message, plan, currentUser) || "";
  } catch (error) {
    auditWarnings.push("Akce proběhla, ale nepodařilo se uložit nový učící vzor.");
    console.error("data_box_plus.confirmed_learning_failed", { message: error.message, confirmationId: pendingRow.id });
  }

  try {
    await db.prepare(`
      UPDATE data_box_plus_action_log
      SET result = 'confirmed', audit_note = ?
      WHERE id = ? AND result = 'executing'
    `).bind(
      `${actor} potvrdil a systém úspěšně provedl: ${cleanString(plan.actionSummary)}.`,
      pendingRow.id
    ).run();
  } catch (error) {
    auditWarnings.push("Akce proběhla, ale nepodařilo se uzavřít její potvrzovací záznam.");
    console.error("data_box_plus.confirmation_success_audit_failed", { message: error.message, confirmationId: pendingRow.id });
  }

  if (auditWarnings.length) {
    completionText = `${completionText} Upozornění: ${auditWarnings.join(" ")}`;
  }
  const completedPlan = {
    ...plan,
    confirmationId: pendingRow.id,
    outcome: "done",
    statusLabel: "Hotovo",
    performedAction: cleanString(plan.actionSummary),
    assistantText: completionText
  };
  let auditId = pendingRow.id;
  try {
    auditId = await logDataBoxPlusConfirmationReply(
      db,
      message.id,
      actor,
      instruction,
      completedPlan,
      "done",
      `${actor} potvrdil akci ${quoteInstruction(plan.actionSummary)}. Akce byla úspěšně provedena.`,
      learnedRuleId
    );
  } catch (error) {
    console.error("data_box_plus.confirmation_success_reply_log_failed", { message: error.message, confirmationId: pendingRow.id });
  }
  return {
    apiStatus: "ready",
    status: "done",
    action: completedPlan,
    message: updatedMessage,
    auditId,
    learnedRuleId,
    auditWarning: auditWarnings.join(" "),
    notice: completionText
  };
}

export async function executeDataBoxPlusMessageInstruction(env, messageId, currentUser = null, body = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const id = cleanString(messageId);
  const instruction = cleanString(body.instruction);
  try {
    if (!instruction) throw new DataBoxPlusStoreError("Napište zprávu pro Autopilota.", 400, "data_box_plus_instruction_missing");
    const message = await db.prepare("SELECT * FROM data_box_plus_messages WHERE id = ? LIMIT 1").bind(id).first();
    if (!message?.id) throw new DataBoxPlusStoreError("Zpráva nebyla nalezena.", 404, "data_box_plus_message_not_found");
    ensureReceivedDataBoxPlusMessage(message);
    const attachments = await db.prepare("SELECT * FROM data_box_plus_attachments WHERE message_id = ? ORDER BY file_name").bind(id).all();
    const actor = actorName(currentUser);
    const pendingConfirmation = await latestDataBoxPlusPendingConfirmation(db, id, actor);
    const pendingInput = await latestPendingDataBoxPlusChatAction(db, id, actor);
    const requestedConfirmationId = cleanString(body.confirmationId);
    const decision = dataBoxPlusConfirmationDecision(instruction);
    if (pendingConfirmation?.id && requestedConfirmationId && requestedConfirmationId !== cleanString(pendingConfirmation.id)) {
      throw new DataBoxPlusStoreError("Potvrzení nepatří k aktuálnímu návrhu.", 409, "data_box_plus_confirmation_mismatch");
    }
    if (!pendingConfirmation?.id && requestedConfirmationId) {
      const previousConfirmation = await dataBoxPlusConfirmationById(db, requestedConfirmationId, id, actor);
      throw new DataBoxPlusStoreError(
        previousConfirmation?.id
          ? "Tato akce už byla potvrzená, zrušená nebo vypršela. Znovu se neprovede."
          : "Potvrzení nepatří k této datové zprávě.",
        409,
        previousConfirmation?.id ? "data_box_plus_confirmation_already_used" : "data_box_plus_confirmation_mismatch"
      );
    }
    if (pendingConfirmation?.id && decision === "confirm") {
      return executeDataBoxPlusConfirmedPlan(env, db, message, pendingConfirmation, currentUser, instruction);
    }
    if (pendingConfirmation?.id && decision === "cancel") {
      await db.prepare("UPDATE data_box_plus_action_log SET result = 'cancelled', audit_note = ? WHERE id = ? AND result = 'waiting_confirmation'")
        .bind(`${actor} připravenou akci zrušil. Nic nebylo provedeno.`, pendingConfirmation.id)
        .run();
      const cancelledPlan = {
        ...(safeJsonParse(pendingConfirmation.action_payload, {}).plan || {}),
        confirmationId: pendingConfirmation.id,
        outcome: "cancelled",
        statusLabel: "Zrušeno",
        assistantText: "Rozumím. Připravenou akci jsem zrušil. Nic nebylo provedeno.",
        performedAction: "Nebylo provedeno nic"
      };
      const auditId = await logDataBoxPlusConfirmationReply(
        db,
        id,
        actor,
        instruction,
        cancelledPlan,
        "cancelled",
        `${actor} zrušil připravenou akci. Nic nebylo provedeno.`
      );
      return {
        apiStatus: "ready",
        status: "cancelled",
        action: cancelledPlan,
        message: await getDataBoxPlusMessage(env, id),
        auditId,
        notice: cancelledPlan.assistantText
      };
    }
    if (pendingConfirmation?.id) {
      await db.prepare("UPDATE data_box_plus_action_log SET result = 'superseded', audit_note = ? WHERE id = ? AND result = 'waiting_confirmation'")
        .bind(`${actor} zadal nový pokyn. Předchozí návrh byl uzavřen bez provedení.`, pendingConfirmation.id)
        .run();
    }
    if (dataBoxPlusNoOperationInstruction(instruction)) {
      await closePendingDataBoxPlusChatActions(
        db,
        id,
        actor,
        "cancelled",
        `${actor} odmítl nebo ukončil rozpracovaný záměr. Nic nebylo provedeno.`
      );
      const noActionPlan = {
        intent: "no_action",
        actionType: "none",
        outcome: "answer",
        statusLabel: "Bez akce",
        understoodAs: "ukončení rozpracovaného záměru bez provedení",
        actionSummary: "Nebylo provedeno nic",
        performedAction: "Nebylo provedeno nic",
        assistantText: "Rozumím. Nic neprovedu.",
        missingField: "",
        draftText: "",
        changesMessage: false,
        externalAction: false,
        requiresConfirmation: false
      };
      const auditId = await logDataBoxPlusOpenAiChatTurn(db, id, actor, instruction, noActionPlan, { provider: "server" });
      return {
        apiStatus: "ready",
        status: "answer",
        action: noActionPlan,
        message: await getDataBoxPlusMessage(env, id),
        auditId,
        provider: "server",
        notice: noActionPlan.assistantText
      };
    }
    await closePendingDataBoxPlusChatActions(
      db,
      id,
      actor,
      "supplied",
      `${actor} odpověděl na předchozí otázku. Autopilot pokračuje v rozhovoru.`
    );

    const history = await dataBoxPlusChatHistoryForOpenAi(db, id);
    const learningRules = await dataBoxPlusLearningRulesForOpenAi(db);
    const chatContext = await buildDataBoxPlusChatContext(env, currentUser);
    const knownUsers = chatContext.knownUsers;
    const normalizedInstruction = normalizedPerson(instruction);
    const matchingUsers = knownUsers.filter((user) => normalizedInstruction.includes(normalizedPerson(user.name)));
    const targetUser = dataBoxPlusSelfReference(instruction)
      ? chatContext.currentUser
      : matchingUsers.length === 1 ? matchingUsers[0] : null;
    const resolvedInstruction = targetUser ? `${instruction}\nServerově vyřešený příjemce e-mailu: ${targetUser.name} <${targetUser.email}>.` : instruction;
    const pendingInputPayload = safeJsonParse(pendingInput?.action_payload, {});
    const serverDirectPlan = dataBoxPlusServerDirectActionPlan(
      instruction,
      message,
      attachments.results || [],
      {
        actor,
        pendingIntent: cleanString(pendingInputPayload.pendingIntent || pendingInputPayload.plan?.pendingIntent)
      },
      currentUser
    );
    if (serverDirectPlan) {
      if (serverDirectPlan.outcome === "done") {
        await applyIntelligentDataBoxPlusInstruction(db, message, serverDirectPlan);
      }
      const auditId = await logIntelligentDataBoxPlusInstruction(
        db,
        id,
        actor,
        instruction,
        serverDirectPlan,
        serverDirectPlan.outcome,
        { previousStatus: message.status }
      );
      return {
        apiStatus: "ready",
        status: serverDirectPlan.outcome,
        action: serverDirectPlan,
        message: await getDataBoxPlusMessage(env, id),
        auditId,
        provider: "server",
        notice: serverDirectPlan.assistantText
      };
    }
    let openAi;
    try {
      openAi = await interpretDataBoxPlusChat(env, {
          instruction: resolvedInstruction,
          knownUsers,
          history,
          learningRules,
          appContext: chatContext.application,
          currentUser: chatContext.currentUser,
          availableTools: dataBoxPlusAvailableChatTools(chatContext),
          today: dataBoxPlusPragueDate(),
          message: {
            senderName: message.sender_name,
            senderBoxId: message.sender_box_id,
            recipientBoxId: message.recipient_box_id,
            subject: message.subject,
            status: message.status,
            summary: message.summary,
            attachmentText: (attachments.results || []).map((attachment) => cleanString(attachment.extracted_text)).filter(Boolean).join("\n\n")
          }
        }, {
          executeTool: (call) => executeDataBoxPlusChatReadTool(env, currentUser, chatContext, call)
      });
    } catch (error) {
      const messageText = error instanceof DataBoxPlusOpenAiError
        ? error.message
        : "GPT je teď nedostupný. Nic nebylo provedeno.";
      const failedPlan = {
        intent: "provider_error",
        actionType: "none",
        outcome: "failed",
        statusLabel: "Chyba",
        understoodAs: "GPT požadavek selhal",
        actionSummary: "Nebylo provedeno nic",
        performedAction: "Nebylo provedeno nic",
        assistantText: messageText,
        changesMessage: false,
        requiresConfirmation: false
      };
      await logDataBoxPlusOpenAiChatTurn(db, id, actor, instruction, failedPlan);
      if (error instanceof DataBoxPlusOpenAiError) {
        throw new DataBoxPlusStoreError(error.message, error.status, error.code);
      }
      throw error;
    }

    let plan = dataBoxPlusServerPlanFromOpenAi(openAi.plan, message, currentUser);
    plan = enforceDataBoxPlusExecutableIntent(instruction, plan, message, currentUser);
    plan = groundDataBoxPlusPlan(instruction, plan, pendingInput);
    plan = await completeDataBoxPlusActionDetails(db, plan);
    if (plan.outcome === "waiting_confirmation" && !/Mám provést\?\s*$/i.test(plan.assistantText)) {
      plan.assistantText = `${cleanString(plan.assistantText).replace(/\s+$/, "")} Mám provést?`.trim();
    }
    const auditId = await logDataBoxPlusOpenAiChatTurn(db, id, actor, instruction, plan, openAi);
    const proposedAction = plan.outcome === "waiting_confirmation"
      ? dataBoxPlusConfirmationPayload(plan, auditId)
      : null;
    const action = proposedAction ? { ...plan, proposedAction, confirmationId: auditId } : plan;
    return {
      apiStatus: "ready",
      status: plan.outcome,
      action,
      message: await getDataBoxPlusMessage(env, id),
      auditId,
      provider: openAi.provider,
      notice: plan.assistantText
    };
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}
function recommendationConfirmAction(recommendation = {}, body = {}) {
  const instructionPlan = recommendation.instructionPlan || null;
  if (instructionPlan?.actionType) {
    return {
      actionType: cleanString(instructionPlan.confirmLabel || "Potvrdit provedení"),
      performedAction: cleanString(instructionPlan.performedAction || instructionPlan.recommendedAction),
      messageStatus: cleanString(instructionPlan.messageStatus),
      archiveStatus: cleanString(instructionPlan.archiveStatus || "active"),
      assignedTo: cleanString(instructionPlan.assignedTo),
      suggestedAction: cleanString(instructionPlan.resultLabel || instructionPlan.recommendedAction),
      primaryAction: cleanString(instructionPlan.nextStep === "Bez další akce." ? "Detail historie" : "Otevřít zprávu"),
      auditNote: cleanString(instructionPlan.auditNote || "Pokyn Autopilota byl potvrzen. Nic se neodeslalo mimo systém."),
      instructionPlan
    };
  }
  const requestedAction = searchText([body.actionType]);
  const normalized = searchText([
    body.actionType,
    recommendation.recommendedAction,
    recommendation.text,
    recommendation.summary
  ]);
  if (requestedAction.includes("payroll_record")) {
    return {
      actionType: "Označit jako zpracované",
      performedAction: "Uložení k evidenci",
      messageStatus: "Archivované",
      archiveStatus: "archived",
      assignedTo: "",
      suggestedAction: "Uloženo k evidenci jako zpracované potvrzení.",
      auditNote: "Zpráva byla označena jako zpracovaná a uložená k evidenci. Nic se nesmazalo ani neodeslalo mimo systém."
    };
  }
  if (requestedAction.includes("payroll_handoff")) {
    return {
      actionType: "Předat mzdové účetní",
      performedAction: "Předání mzdové účetní",
      messageStatus: "Předáno mzdové účetní",
      archiveStatus: "active",
      assignedTo: "Mzdová účetní",
      suggestedAction: "Předáno mzdové účetní k evidenci nebo ověření.",
      auditNote: "Zpráva byla interně označena jako předaná mzdové účetní. Nic se neodeslalo mimo systém."
    };
  }
  if (normalized.includes("archiv")) {
    return {
      actionType: "Potvrdit archivaci",
      performedAction: "Archivace zprávy",
      messageStatus: "Archivované",
      archiveStatus: "archived",
      assignedTo: "",
      suggestedAction: "Archivováno jako vyřízená nebo informativní zpráva.",
      auditNote: "Zpráva byla interně přesunuta do archivu. Nic se nesmazalo ani neodeslalo mimo systém."
    };
  }
  if (normalized.includes("lhuta") || normalized.includes("lhutu") || normalized.includes("kalendar") || normalized.includes("deadline")) {
    return {
      actionType: "Potvrdit zapsání lhůty",
      performedAction: "Zapsání lhůty k ručnímu doplnění",
      messageStatus: "Předáno garážmistrovi",
      archiveStatus: "active",
      assignedTo: "Garážmistr",
      suggestedAction: "Lhůta připravena k zapsání a předána garážmistrovi.",
      auditNote: "Zpráva byla interně označena pro zadání lhůty. Nic se neodeslalo mimo systém."
    };
  }
  if (normalized.includes("faktury") || normalized.includes("faktura") || normalized.includes("upom")) {
    return {
      actionType: "Potvrdit předání",
      performedAction: "Předání účetnímu oddělení",
      messageStatus: "Předáno fakturám",
      archiveStatus: "active",
      assignedTo: "faktury@kaiserservis.cz",
      suggestedAction: "Předáno účetnímu oddělení k vyřízení.",
      auditNote: "Zpráva byla interně označena jako předaná účetnímu oddělení. Nic se neodeslalo mimo systém."
    };
  }
  if (normalized.includes("email") || normalized.includes("e-mail")) {
    return {
      actionType: "Potvrdit vytvoření e-mailu",
      performedAction: "Potřebuje adresáta",
      messageStatus: "Potřebuje adresáta",
      archiveStatus: "active",
      assignedTo: "faktury@kaiserservis.cz",
      suggestedAction: "Vybrat adresáta pro e-mail.",
      auditNote: "Adresát e-mailu není jasný. E-mail se neodeslal."
    };
  }
  if (normalized.includes("pravnik") || normalized.includes("gt brno") || normalized.includes("exekuc") || normalized.includes("soud")) {
    return {
      actionType: "Potvrdit předání",
      performedAction: "Předání právníkovi / GT Brno",
      messageStatus: "Dnes k vyřízení",
      archiveStatus: "active",
      assignedTo: "GT Brno",
      suggestedAction: "Předáno právníkovi / GT Brno k ruční kontrole.",
      auditNote: "Zpráva byla interně označena jako předaná právníkovi nebo GT Brno. Nic se neodeslalo mimo systém."
    };
  }
  if (normalized.includes("predat") || normalized.includes("priradit") || normalized.includes("assignment") || normalized.includes("handoff")) {
    return {
      actionType: normalized.includes("priradit") || normalized.includes("assignment") ? "Potvrdit přiřazení" : "Potvrdit předání",
      performedAction: "Přiřazení odpovědné osobě",
      messageStatus: "Potřebuje upřesnit",
      archiveStatus: "active",
      assignedTo: "Odpovědná osoba",
      suggestedAction: "Přiřazeno odpovědné osobě k vyřízení.",
      auditNote: "Zpráva byla interně přiřazena k vyřízení. Nic se neodeslalo mimo systém."
    };
  }
  return {
    actionType: "Potvrdit doporučení",
    performedAction: cleanString(recommendation.recommendedAction || "Potvrzení doporučení"),
    messageStatus: "",
    archiveStatus: "",
    assignedTo: "",
    suggestedAction: cleanString(recommendation.recommendedAction),
    auditNote: "Doporučení Autopilota bylo potvrzeno. Nic se neodeslalo mimo systém."
  };
}

async function applyRecommendationActionToMessage(db, recommendation, actionInfo) {
  const message = await db
    .prepare("SELECT id, mailbox_id FROM data_box_plus_messages WHERE id = ? LIMIT 1")
    .bind(cleanString(recommendation.messageId))
    .first();
  if (!message?.id || !cleanString(actionInfo.messageStatus)) return false;
  await db
    .prepare(`
      UPDATE data_box_plus_messages
      SET status = ?,
          archive_status = ?,
          assigned_to = CASE WHEN ? <> '' THEN ? ELSE assigned_to END,
          suggested_action = CASE WHEN ? <> '' THEN ? ELSE suggested_action END,
          primary_action = CASE WHEN ? <> '' THEN ? ELSE primary_action END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(
      actionInfo.messageStatus,
      cleanString(actionInfo.archiveStatus || "active"),
      cleanString(actionInfo.assignedTo),
      cleanString(actionInfo.assignedTo),
      cleanString(actionInfo.suggestedAction),
      cleanString(actionInfo.suggestedAction),
      cleanString(actionInfo.primaryAction),
      cleanString(actionInfo.primaryAction),
      message.id
    )
    .run();
  await updateMailboxCounters(db, cleanString(message.mailbox_id));
  return true;
}

async function rememberDataBoxPlusLearningPattern(db, recommendation, actionInfo, currentUser = null) {
  const plan = actionInfo.instructionPlan || recommendation.instructionPlan || null;
  if (!plan?.learningPattern) return null;
  const message = await db
    .prepare(`
      SELECT m.*, b.name AS mailbox_name
      FROM data_box_plus_messages m
      LEFT JOIN data_box_plus_mailboxes b ON b.id = m.mailbox_id
      WHERE m.id = ?
      LIMIT 1
    `)
    .bind(cleanString(recommendation.messageId))
    .first();
  const ruleId = `dbp-learn-${cleanString(recommendation.id)}`.slice(0, 180);
  const mailboxName = cleanString(message?.mailbox_name || message?.mailbox_id || "schránka");
  const actor = actorName(currentUser);
  await db
    .prepare(`
      INSERT INTO data_box_plus_rules (
        id, name, human_description, conditions_text, proposed_action, autonomy_level,
        confirmation_required, success_count, confirmed_count, edit_count, reject_count,
        last_used_at, status, type, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        human_description = excluded.human_description,
        conditions_text = excluded.conditions_text,
        proposed_action = excluded.proposed_action,
        success_count = data_box_plus_rules.success_count + 1,
        confirmed_count = data_box_plus_rules.confirmed_count + 1,
        last_used_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(
      ruleId,
      `Vzor z pokynu: ${cleanString(message?.sender_name || "odesílatel")}`.slice(0, 120),
      `${plan.learningPattern} Vzor vznikl z potvrzeného pokynu uživatele ${actor}.`,
      `Odesílatel: ${cleanString(message?.sender_name)}. Předmět: ${cleanString(message?.subject)}. Schránka: ${mailboxName}.`,
      cleanString(plan.recommendedAction || actionInfo.performedAction),
      "Jen navrhovat",
      "Bez dalšího schválení z toho nevznikne automatické pravidlo.",
      1,
      1,
      0,
      0,
      "Nové pravidlo",
      "Učící vzor"
    )
    .run();
  return ruleId;
}

export async function prepareDataBoxPlusMessageInstruction(env, messageId, currentUser = null, body = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const id = cleanString(messageId);
  const instruction = cleanString(body.instruction);
  try {
    const message = await db.prepare("SELECT * FROM data_box_plus_messages WHERE id = ? LIMIT 1").bind(id).first();
    if (!message?.id) throw new DataBoxPlusStoreError("Zpráva nebyla nalezena.", 404, "data_box_plus_message_not_found");
    ensureReceivedDataBoxPlusMessage(message);
    const attachments = await db
      .prepare("SELECT * FROM data_box_plus_attachments WHERE message_id = ? ORDER BY file_name")
      .bind(id)
      .all();
    const plan = instructionPlanFromText(instruction, message, attachments.results || []);
    const recommendationId = idValue("dbp-instruction");
    const actor = actorName(currentUser);
    const actionId = idValue("dbp-action");
    const extractedFacts = {
      instructionPlan: {
        ...plan,
        messageId: id,
        mailboxId: cleanString(message.mailbox_id),
        senderName: cleanString(message.sender_name),
        subject: cleanString(message.subject),
        confirmedBy: "",
        createdBy: actor,
        createdAt: new Date().toISOString()
      },
      facts: safeJsonParse(message.facts_json, [])
    };
    await db
      .prepare(`
        INSERT INTO data_box_plus_recommendations (
          id, message_id, text, summary, extracted_facts, recommended_action, risk_reason,
          confidence, evidence, similar_cases, after_confirm, human_reason, requires_confirmation,
          status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'waiting', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `)
      .bind(
        recommendationId,
        id,
        plan.assistantText,
        `Chystám se provést: ${plan.recommendedAction}`,
        JSON.stringify(extractedFacts),
        plan.recommendedAction,
        plan.risk,
        0.86,
        plan.evidence,
        "Autopilot se učí z potvrzených pokynů u konkrétních zpráv.",
        plan.afterConfirm,
        "Chatový pokyn byl přijat. Systém vrátí konkrétní provedení nebo konkrétní chybějící údaj.",
      )
      .run();
    await db
      .prepare(`
        INSERT INTO data_box_plus_action_log (
          id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        actionId,
        id,
        recommendationId,
        actor,
        "Pokyn Autopilotu",
        JSON.stringify({ instruction, plan }),
        new Date().toISOString(),
        "prepared",
        `${actor} zadal pokyn: ${instruction}`
      )
      .run();
    await db
      .prepare(`
        UPDATE data_box_plus_messages
        SET status = 'Potřebuje pokyn',
            archive_status = 'active',
            suggested_action = ?,
            primary_action = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(plan.nextStep, plan.confirmLabel, id)
      .run();
    const updatedMessage = await getDataBoxPlusMessage(env, id);
    return {
      apiStatus: "ready",
      recommendation: {
        id: recommendationId,
        messageId: id,
        text: plan.assistantText,
        summary: `Chystám se provést: ${plan.recommendedAction}`,
        instructionPlan: extractedFacts.instructionPlan,
        userInstruction: instruction,
        recommendedAction: plan.recommendedAction,
        risk: plan.risk,
        riskReason: plan.risk,
        confidence: 0.86,
        evidence: plan.evidence,
        similarCases: "Autopilot se učí z potvrzených pokynů u konkrétních zpráv.",
        afterConfirm: plan.afterConfirm,
        humanReason: "Chatový pokyn se má provést přímo. Pokud chybí údaj, systém se zeptá konkrétně.",
        requiresConfirmation: false,
        status: "waiting"
      },
      message: updatedMessage,
      auditId: actionId
    };
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function confirmDataBoxPlusRecommendation(env, recommendationId, currentUser = null, body = {}) {
  const db = dataBoxPlusDatabase(env, true);
  try {
    const recommendation = await recommendationById(db, recommendationId);
    const actor = cleanString(currentUser?.name || currentUser?.email || currentUser?.id || "system");
    const actionId = idValue("dbp-action");
    const actionInfo = recommendationConfirmAction(recommendation, body);
    const messageUpdated = await applyRecommendationActionToMessage(db, recommendation, actionInfo);
    const rememberPattern = body.rememberPattern !== false;
    const learnedRuleId = rememberPattern
      ? await rememberDataBoxPlusLearningPattern(db, recommendation, actionInfo, currentUser)
      : null;
    const payload = {
      confirmedBy: actor,
      requireRadimMartin: body.requireRadimMartin !== false,
      note: cleanString(body.note),
      performedAction: actionInfo.performedAction,
      messageUpdated,
      userInstruction: cleanString(recommendation.userInstruction || actionInfo.instructionPlan?.userInstruction),
      rememberPattern,
      learnedRuleId
    };
    await db
      .prepare("UPDATE data_box_plus_recommendations SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(recommendation.id)
      .run();
    await db
      .prepare(`
        INSERT INTO data_box_plus_action_log (
          id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        actionId,
        recommendation.messageId,
        recommendation.id,
        actor,
        actionInfo.actionType,
        JSON.stringify(payload),
        new Date().toISOString(),
        "confirmed",
        actionInfo.auditNote
      )
      .run();
    return { apiStatus: "ready", recommendation: { ...recommendation, status: "confirmed" }, action: actionInfo, auditId: actionId };
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function rejectDataBoxPlusRecommendation(env, recommendationId, currentUser = null, body = {}) {
  const db = dataBoxPlusDatabase(env, true);
  try {
    const recommendation = await recommendationById(db, recommendationId);
    const actor = cleanString(currentUser?.name || currentUser?.email || currentUser?.id || "system");
    const actionId = idValue("dbp-action");
    await db
      .prepare("UPDATE data_box_plus_recommendations SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(recommendation.id)
      .run();
    await db
      .prepare(`
        INSERT INTO data_box_plus_action_log (
          id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        actionId,
        recommendation.messageId,
        recommendation.id,
        actor,
        "Zrušit akci",
        JSON.stringify({ decidedBy: actor, reason: cleanString(body.reason), note: cleanString(body.note) }),
        new Date().toISOString(),
        "rejected",
        "Připravená akce se zrušila. Zpráva zůstává k ručnímu vyřízení."
      )
      .run();
    return { apiStatus: "ready", recommendation: { ...recommendation, status: "rejected" }, auditId: actionId };
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export function dataBoxPlusStoreErrorResponse(error) {
  if (error instanceof DataBoxPlusStoreError) {
    return {
      payload: { error: error.message, code: error.code, apiStatus: "waiting" },
      status: error.status
    };
  }
  console.error("data_box_plus.api_failed", { message: error?.message });
  return {
    payload: { error: "Datové schránky Plus se teď nepodařilo načíst.", apiStatus: "waiting" },
    status: 500
  };
}
