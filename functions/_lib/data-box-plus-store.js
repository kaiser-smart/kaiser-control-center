import {
  dataBoxIsdsAccountFromCredentials,
  dataBoxIsdsAccountConfigs,
  dataBoxIsdsStatus,
  fetchDataBoxMessageAttachments,
  fetchDataBoxMessageMetadata
} from "./data-box-isds-client.js";

const EXPECTED_MAILBOX_COUNT = 7;
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
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
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

  if (haystack.includes("exekutor") || haystack.includes("exekuc") || haystack.includes("soud") || haystack.includes("usneseni")) {
    return {
      messageType: "Exekuce / právní",
      status: "Dnes k vyřízení",
      riskLevel: "Vysoké",
      priority: "legal",
      priorityReason: "Právní dokument vyžaduje auditní stopu předání.",
      suggestedAction: "Exekuční dokument. Předat právníkovi / GT Brno.",
      primaryAction: "Předat",
      facts,
      recommendationText: "Zpráva vypadá jako právní dokument. Doporučuji předat ji právníkovi nebo GT Brno.",
      riskReason: "Právní zprávu Autopilot nikdy neuzavírá bez člověka.",
      requiresConfirmation: true
    };
  }

  if (haystack.includes("vyzva") || haystack.includes("pokut") || haystack.includes("uhrad") || haystack.includes("urcene castky")) {
    return {
      messageType: "Výzvy / pokuty",
      status: "Dnes k vyřízení",
      riskLevel: "Vysoké",
      priority: "urgent",
      priorityReason: "Finanční požadavek nebo lhůta může mít dopad na firmu.",
      suggestedAction: "Otevřít PDF a ověřit částku, lhůtu a důvod výzvy.",
      primaryAction: "Otevřít PDF",
      facts,
      recommendationText: "Zpráva obsahuje výzvu k úhradě. Doporučuji ověřit částku, lhůtu a důvod výzvy.",
      riskReason: "Finanční požadavek čeká na potvrzení Radima nebo Martina.",
      requiresConfirmation: true
    };
  }

  if (haystack.includes("upom") || haystack.includes("faktur") || haystack.includes("predzalob")) {
    return {
      messageType: haystack.includes("upom") ? "Upomínky" : "Faktury",
      status: "Čeká na potvrzení",
      riskLevel: "Střední",
      priority: "high",
      priorityReason: "Finanční požadavek čeká na předání účetnímu oddělení.",
      suggestedAction: "Zpráva vypadá jako faktura. Doporučuji předat na faktury.",
      primaryAction: "Připravit e-mail",
      facts,
      recommendationText: "Zpráva vypadá jako faktura nebo upomínka. Doporučuji připravit e-mail na faktury.",
      riskReason: "Obsahuje finanční požadavek, proto čeká na člověka.",
      requiresConfirmation: true
    };
  }

  if (haystack.includes("registr smluv") || haystack.includes("zverejneni smlouvy")) {
    return {
      messageType: "Registr smluv",
      status: "Bezpečně stranou",
      riskLevel: "Nízké",
      priority: "low",
      priorityReason: "Známý informační typ podle schváleného playbooku.",
      suggestedAction: "Informace z Registru smluv. Pravděpodobně archivovat.",
      primaryAction: "Archivovat",
      facts,
      recommendationText: "Oznámení z Registru smluv vypadá jako informativní zpráva. Doporučuji archivovat.",
      riskReason: "Nízké riziko, ale nové pravidlo se první měsíc učí.",
      requiresConfirmation: true
    };
  }

  if (haystack.includes("vozid") || haystack.includes("technick") || haystack.includes("stk")) {
    return {
      messageType: "Vozidla",
      status: "Dnes k vyřízení",
      riskLevel: "Vysoké",
      priority: "high",
      priorityReason: "Provozní dopad na vozidlo nebo termín.",
      suggestedAction: "Zapsat lhůtu do kalendáře a předat garážmistrovi.",
      primaryAction: "Zadat lhůtu",
      facts,
      recommendationText: "Zpráva se týká vozidla nebo technické lhůty. Doporučuji předat garážmistrovi.",
      riskReason: "Provozní lhůtu musí potvrdit člověk.",
      requiresConfirmation: true
    };
  }

  if (attachmentState.problem) {
    return {
      messageType: "Oznámení ISDS",
      status: "Problém",
      riskLevel: "Vysoké",
      priority: "problem",
      priorityReason: "Přílohu se nepodařilo načíst.",
      suggestedAction: "Příloha není načtená. Zkusit znovu.",
      primaryAction: "Zkusit znovu načíst",
      facts,
      recommendationText: "Autopilot si není jistý, protože příloha zatím není přečtená. Doporučuji ruční kontrolu.",
      riskReason: "Bez přílohy nelze bezpečně rozhodnout.",
      requiresConfirmation: true
    };
  }

  return {
    messageType: "Oznámení ISDS",
    status: "Nové",
    riskLevel: "Střední",
    priority: "normal",
    priorityReason: "Nová datová zpráva čeká na první rozhodnutí.",
    suggestedAction: "Oznámení ISDS. Ruční kontrola.",
    primaryAction: "Předat",
    facts,
    recommendationText: "Nová zpráva čeká na ruční kontrolu, protože Autopilot pro ni zatím nemá ověřený vzor.",
    riskReason: "Nový typ zprávy se teprve učí.",
    requiresConfirmation: true
  };
}

function rowToMailbox(row, fallbackAccount = null) {
  if (!row) return null;
  const credentialId = cleanString(row.credential_id);
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
    name: cleanString(row.name),
    company: cleanString(row.company || row.name),
    isdsId: cleanString(row.isds_id || fallbackAccount?.isdsId),
    slot: numberValue(row.slot),
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
    credentialActive: credentialId ? credentialActive : fallbackConfigured
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
          c.id AS credential_id,
          c.username_ciphertext,
          c.username_hint,
          c.password_ciphertext,
          c.active AS credential_active,
          c.updated_at AS credential_updated_at,
          c.last_rotated_at,
          c.source AS credential_source
        FROM data_box_plus_mailboxes m
        LEFT JOIN data_box_plus_credentials c ON c.mailbox_id = m.id
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

async function dataBoxPlusAccountConfigs(env) {
  const db = dataBoxPlusDatabase(env, true);
  const fallbackAccounts = dataBoxIsdsAccountConfigs(env).slice(0, EXPECTED_MAILBOX_COUNT);
  const rows = await credentialRows(db);
  const accounts = [];
  const usedSlots = new Set();

  for (const row of rows) {
    const slot = numberValue(row.slot || row.mailbox_slot);
    if (!slot || slot > EXPECTED_MAILBOX_COUNT) continue;
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
    .filter((account) => numberValue(account.slot) >= 1 && numberValue(account.slot) <= EXPECTED_MAILBOX_COUNT)
    .sort((a, b) => numberValue(a.slot) - numberValue(b.slot));
}

function mailboxPayload(body = {}, fallback = {}) {
  const slot = numberValue(body.slot ?? fallback.slot);
  if (!slot || slot < 1 || slot > EXPECTED_MAILBOX_COUNT) {
    throw new DataBoxPlusStoreError("Vyber slot schránky 1 až 7.", 400, "data_box_plus_mailbox_slot_invalid");
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
    textExtractionStatus: cleanString(row.text_extraction_status || "Čeká na zpracování"),
    extractedText: cleanString(row.extracted_text),
    errorReason: cleanString(row.error_reason),
    openUrl: `/api/data-box-plus/messages/${encodeURIComponent(cleanString(row.message_id))}/attachments/${encodeURIComponent(cleanString(row.id))}`,
    downloadUrl: `/api/data-box-plus/messages/${encodeURIComponent(cleanString(row.message_id))}/attachments/${encodeURIComponent(cleanString(row.id))}?download=1`
  };
}

function rowToMessage(row, attachments = []) {
  if (!row) return null;
  const facts = safeJsonParse(row.facts_json, []);
  return {
    id: cleanString(row.id),
    mailboxId: cleanString(row.mailbox_id),
    isdsMessageId: cleanString(row.isds_message_id),
    senderName: cleanString(row.sender_name) || "Datová schránka",
    senderBoxId: cleanString(row.sender_box_id),
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
    attachments
  };
}

function rowToRecommendation(row) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    messageId: cleanString(row.message_id),
    text: cleanString(row.text),
    summary: cleanString(row.summary),
    extractedFacts: safeJsonParse(row.extracted_facts, []),
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
        SUM(CASE WHEN status <> 'Archivované' THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN status IN ('Dnes k vyřízení', 'Čeká na potvrzení', 'Problém') THEN 1 ELSE 0 END) AS due_count,
        SUM(CASE WHEN status = 'Problém' OR attachment_status LIKE 'Nepodařilo%' THEN 1 ELSE 0 END) AS problem_count
      FROM data_box_plus_messages
      WHERE mailbox_id = ?
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
    : (contentType.includes("pdf") ? "Vyžaduje ruční otevření" : "Čeká na zpracování");

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
      "Před provedením uvidíš konkrétní krok. Nic se neodešle mimo systém bez potvrzení.",
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

  if (!existing?.id) {
    await db
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
        "Oznámení ISDS",
        "Nové",
        "Střední",
        "normal",
        "Oznámení ISDS. Ruční kontrola.",
        "Nová datová zpráva čeká na první rozhodnutí.",
        "Předat",
        message?.hasAttachments ? "Čeká na zpracování" : "Dostupná"
      )
      .run();
  }

  const attachmentState = await syncAttachments(db, env, account, mailboxId, message, messageId);
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
  return { state: existing?.id ? "updated" : "created", attachmentsDownloaded: attachmentState.downloaded };
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
  const visibleAccounts = isds.accounts?.length ? isds.accounts : [];
  const accounts = visibleAccounts.length
    ? visibleAccounts.map((account) => ({
      ...account,
      configured: configuredAccounts.some((configured) => configured.slot === account.slot)
    }))
    : [];

  for (let slot = 1; slot <= EXPECTED_MAILBOX_COUNT; slot += 1) {
    const account = accounts.find((item) => item.slot === slot) || {
      slot,
      label: MAILBOX_NAMES[slot - 1],
      isdsId: "",
      configured: false
    };
    await ensureMailbox(db, account);
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
      .prepare("SELECT COUNT(*) AS count FROM data_box_plus_recommendations WHERE status = 'waiting'")
      .first();
    const newRow = await db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM data_box_plus_messages
        WHERE archive_status <> 'archived'
          AND status IN ('Nové', 'Dnes k vyřízení', 'Čeká na potvrzení', 'Problém')
      `)
      .first();
    const unresolvedRow = await db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM data_box_plus_messages
        WHERE archive_status <> 'archived'
          AND status NOT IN ('Bezpečně stranou', 'Archivované')
      `)
      .first();
    return {
      apiStatus: "ready",
      expectedMailboxes: EXPECTED_MAILBOX_COUNT,
      mailboxes: mailboxRows.map((row) => rowToMailbox(row, fallbackMap.get(numberValue(row.slot)))),
      isds: dataBoxIsdsStatus(env),
      latestSyncRun: rowToSyncRun(syncRow),
      waitingRecommendations: numberValue(waitingRow?.count),
      summary: {
        newCount: numberValue(newRow?.count),
        unresolvedCount: numberValue(unresolvedRow?.count),
        waitingRecommendations: numberValue(waitingRow?.count)
      },
      background: {
        intervalMinutes: 30,
        enabled: cleanString(env.DATA_BOX_PLUS_BACKGROUND_ENABLED || "true") !== "false",
        note: "Automatické načítání běží serverově každých 30 minut."
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

export async function listDataBoxPlusMessages(env, filters = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const limit = limitValue(filters.limit);
  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM data_box_plus_messages
        ORDER BY COALESCE(delivered_at, received_at, stored_at) DESC, stored_at DESC
        LIMIT ?
      `)
      .bind(limit)
      .all();
    return (result.results || []).map((row) => rowToMessage(row, []));
  } catch (error) {
    if (error instanceof DataBoxPlusStoreError) throw error;
    throw dbError(error);
  }
}

export async function getDataBoxPlusMessage(env, id) {
  const db = dataBoxPlusDatabase(env, true);
  const messageId = cleanString(id);
  try {
    const row = await db.prepare("SELECT * FROM data_box_plus_messages WHERE id = ? LIMIT 1").bind(messageId).first();
    if (!row) throw new DataBoxPlusStoreError("Zpráva nebyla nalezena.", 404, "data_box_plus_message_not_found");
    const attachments = await db
      .prepare("SELECT * FROM data_box_plus_attachments WHERE message_id = ? ORDER BY file_name")
      .bind(messageId)
      .all();
    return rowToMessage(row, (attachments.results || []).map(rowToAttachment));
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

export async function listDataBoxPlusRecommendations(env, filters = {}) {
  const db = dataBoxPlusDatabase(env, true);
  const limit = limitValue(filters.limit, 100);
  const status = cleanString(filters.status || "waiting");
  const whereSql = status === "all" ? "" : "WHERE status = ?";
  const bindings = status === "all" ? [] : [status];
  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM data_box_plus_recommendations
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
  const row = await db.prepare("SELECT * FROM data_box_plus_recommendations WHERE id = ? LIMIT 1").bind(cleanString(id)).first();
  const recommendation = rowToRecommendation(row);
  if (!recommendation?.id) {
    throw new DataBoxPlusStoreError("Návrh Autopilota nebyl nalezen.", 404, "data_box_plus_recommendation_not_found");
  }
  return recommendation;
}

export async function confirmDataBoxPlusRecommendation(env, recommendationId, currentUser = null, body = {}) {
  const db = dataBoxPlusDatabase(env, true);
  try {
    const recommendation = await recommendationById(db, recommendationId);
    const actor = cleanString(currentUser?.name || currentUser?.email || currentUser?.id || "system");
    const actionId = idValue("dbp-action");
    const payload = {
      confirmedBy: actor,
      requireRadimMartin: body.requireRadimMartin !== false,
      note: cleanString(body.note),
      performedAction: recommendation.recommendedAction
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
        "Potvrdit návrh",
        JSON.stringify(payload),
        new Date().toISOString(),
        "confirmed",
        "Návrh Autopilota byl potvrzen. Nic se neodeslalo mimo systém bez samostatného schválení."
      )
      .run();
    return { apiStatus: "ready", recommendation: { ...recommendation, status: "confirmed" }, auditId: actionId };
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
        "Zamítnout návrh",
        JSON.stringify({ rejectedBy: actor, reason: cleanString(body.reason), note: cleanString(body.note) }),
        new Date().toISOString(),
        "rejected",
        "Návrh Autopilota byl odmítnut. Zpráva zůstává k ručnímu vyřízení."
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
