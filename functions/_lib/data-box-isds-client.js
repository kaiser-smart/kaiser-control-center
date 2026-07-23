const DEFAULT_ISDS_BASE_URL = "https://ws1.datovka.gov.cz";
const TEST_ISDS_BASE_URL = "https://ws1.datovka-test.gov.cz";
const ISDS_INFO_PATH = "/DS/dx";
const ISDS_MESSAGE_PATH = "/DS/dz";
const ISDS_NAMESPACE = "http://isds.czechpoint.cz/v20";
const ISDS_TIMEOUT_MS = 25000;
const DEFAULT_LIMIT = 50;
const DEFAULT_LOOKBACK_DAYS = 30;
const LEGACY_SECRET_ACCOUNT_SLOTS = 7;
const PRIMARY_DATA_BOX_ID = "kaiser-primary";

export class DataBoxIsdsError extends Error {
  constructor(message, status = 502, code = "data_box_isds_error") {
    super(message);
    this.name = "DataBoxIsdsError";
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

function positiveInteger(value, fallback, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(number), max);
}

function enabledFlag(value) {
  return ["1", "true", "yes", "on", "enabled"].includes(cleanString(value).toLowerCase());
}

function baseUrlFromEnv(env = {}) {
  const explicit = cleanString(env.DATA_BOX_ISDS_BASE_URL).replace(/\/+$/, "");
  if (explicit) {
    return explicit;
  }

  return cleanString(env.DATA_BOX_ISDS_ENVIRONMENT).toLowerCase() === "test"
    ? TEST_ISDS_BASE_URL
    : DEFAULT_ISDS_BASE_URL;
}

function modeFromEnv(env = {}) {
  return cleanString(env.DATA_BOX_ISDS_ENVIRONMENT).toLowerCase() === "test" ? "test" : "production";
}

function dataBoxAccountId(slot) {
  return slot === 1 ? PRIMARY_DATA_BOX_ID : `kaiser-data-box-${slot}`;
}

function slotEnvValue(env = {}, baseName, slot, allowPrimaryFallback = true) {
  const slotted = cleanString(env[`${baseName}_${slot}`]);
  if (slotted) {
    return slotted;
  }

  if (slot === 1 && allowPrimaryFallback) {
    return cleanString(env[baseName]);
  }

  return "";
}

function accountUsername(env = {}, slot) {
  return slotEnvValue(env, "DATA_BOX_ISDS_USERNAME", slot)
    || slotEnvValue(env, "DATA_BOX_ISDS_LOGIN", slot);
}

function accountPassword(env = {}, slot) {
  return slotEnvValue(env, "DATA_BOX_ISDS_PASSWORD", slot);
}

function accountMissingName(baseName, slot) {
  return slot === 1 ? `${baseName} nebo ${baseName}_1` : `${baseName}_${slot}`;
}

function accountLabel(env = {}, slot) {
  return slotEnvValue(env, "DATA_BOX_ISDS_LABEL", slot)
    || (slot === 1 ? "Kaiser Smart Datova schranka" : `Datova schranka ${slot}`);
}

function shouldExposeAccount(env = {}, slot, account) {
  if (slot === 1) {
    return true;
  }

  return Boolean(
    account.username
    || account.password
    || account.isdsId
    || slotEnvValue(env, "DATA_BOX_ISDS_LABEL", slot, false)
    || cleanString(env[`DATA_BOX_ISDS_ENABLED_${slot}`])
  );
}

function accountConfig(env = {}, slot) {
  const globalEnabled = enabledFlag(env.DATA_BOX_ISDS_ENABLED);
  const baseUrl = baseUrlFromEnv(env);
  const username = accountUsername(env, slot);
  const password = accountPassword(env, slot);
  const slotEnabledValue = cleanString(env[`DATA_BOX_ISDS_ENABLED_${slot}`]);
  const slotEnabled = slotEnabledValue ? enabledFlag(slotEnabledValue) : true;
  const enabled = globalEnabled && slotEnabled;
  const configured = enabled && Boolean(username && password);
  const missing = [];

  if (!globalEnabled) missing.push("DATA_BOX_ISDS_ENABLED");
  if (slotEnabledValue && !slotEnabled) missing.push(`DATA_BOX_ISDS_ENABLED_${slot}`);
  if (!username) missing.push(accountMissingName("DATA_BOX_ISDS_USERNAME", slot));
  if (!password) missing.push(accountMissingName("DATA_BOX_ISDS_PASSWORD", slot));

  return {
    slot,
    id: dataBoxAccountId(slot),
    label: accountLabel(env, slot),
    isdsId: slotEnvValue(env, "DATA_BOX_ISDS_ID", slot),
    enabled,
    configured,
    mode: modeFromEnv(env),
    baseUrl,
    infoEndpointUrl: `${baseUrl}${ISDS_INFO_PATH}`,
    messageEndpointUrl: `${baseUrl}${ISDS_MESSAGE_PATH}`,
    hasUsername: Boolean(username),
    hasPassword: Boolean(password),
    missing,
    username,
    password,
    limit: positiveInteger(env.DATA_BOX_ISDS_MESSAGE_LIMIT, DEFAULT_LIMIT, 100),
    lookbackDays: positiveInteger(env.DATA_BOX_ISDS_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS, 365),
    documentationStatus: "official-isds-wsdl-3.11-2026-06-26"
  };
}

export function dataBoxIsdsAccountFromCredentials(env = {}, details = {}) {
  const slot = numberValue(details.slot, 1);
  const baseUrl = baseUrlFromEnv(env);
  const username = cleanString(details.username);
  const password = cleanString(details.password);
  const enabled = details.enabled === undefined ? true : Boolean(details.enabled);
  const configured = enabled && Boolean(username && password);
  const missing = [];

  if (!enabled) missing.push(`DATA_BOX_PLUS_MAILBOX_${slot}_DISABLED`);
  if (!username) missing.push(`DATA_BOX_PLUS_MAILBOX_${slot}_USERNAME`);
  if (!password) missing.push(`DATA_BOX_PLUS_MAILBOX_${slot}_PASSWORD`);

  return {
    slot,
    id: cleanString(details.id) || dataBoxAccountId(slot),
    label: cleanString(details.label) || accountLabel(env, slot),
    isdsId: cleanString(details.isdsId),
    enabled,
    configured,
    mode: modeFromEnv(env),
    baseUrl,
    infoEndpointUrl: `${baseUrl}${ISDS_INFO_PATH}`,
    messageEndpointUrl: `${baseUrl}${ISDS_MESSAGE_PATH}`,
    hasUsername: Boolean(username),
    hasPassword: Boolean(password),
    missing,
    username,
    password,
    limit: positiveInteger(env.DATA_BOX_ISDS_MESSAGE_LIMIT, DEFAULT_LIMIT, 100),
    lookbackDays: positiveInteger(env.DATA_BOX_ISDS_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS, 365),
    documentationStatus: "official-isds-wsdl-3.11-2026-06-26"
  };
}

function publicAccountStatus(config) {
  const {
    username,
    password,
    ...safeConfig
  } = config;
  return safeConfig;
}

function allAccountConfigs(env = {}) {
  const accounts = [];
  for (let slot = 1; slot <= LEGACY_SECRET_ACCOUNT_SLOTS; slot += 1) {
    const config = accountConfig(env, slot);
    if (shouldExposeAccount(env, slot, config)) {
      accounts.push(config);
    }
  }
  return accounts;
}

export function dataBoxIsdsAccountConfigs(env = {}) {
  return allAccountConfigs(env).filter((account) => account.configured);
}

export function dataBoxIsdsStatus(env = {}) {
  const accounts = allAccountConfigs(env);
  const configuredAccounts = accounts.filter((account) => account.configured);
  const baseUrl = baseUrlFromEnv(env);
  const enabled = enabledFlag(env.DATA_BOX_ISDS_ENABLED);

  return {
    enabled,
    configured: configuredAccounts.length > 0,
    configuredAccounts: configuredAccounts.length,
    accountCount: accounts.length,
    maxAccounts: null,
    legacySecretAccountSlots: LEGACY_SECRET_ACCOUNT_SLOTS,
    mode: modeFromEnv(env),
    baseUrl,
    infoEndpointUrl: `${baseUrl}${ISDS_INFO_PATH}`,
    hasUsername: accounts.some((account) => account.hasUsername),
    hasPassword: accounts.some((account) => account.hasPassword),
    missing: configuredAccounts.length ? [] : (accounts[0]?.missing || [
      "DATA_BOX_ISDS_ENABLED",
      "DATA_BOX_ISDS_USERNAME",
      "DATA_BOX_ISDS_PASSWORD"
    ]),
    accounts: accounts.map(publicAccountStatus),
    documentationStatus: "official-isds-wsdl-3.11-2026-06-26"
  };
}

function isdsConfig(env = {}) {
  return dataBoxIsdsAccountConfigs(env)[0] || accountConfig(env, 1);
}

function ensureIsdsConfig(config) {
  if (!config.configured) {
    throw new DataBoxIsdsError(
      "ISDS read-only synchronizace ceka na Cloudflare secrets DATA_BOX_ISDS_ENABLED a alespon jednu dvojici DATA_BOX_ISDS_USERNAME/PASSWORD nebo DATA_BOX_ISDS_USERNAME_1..7/PASSWORD_1..7.",
      409,
      "data_box_isds_not_configured"
    );
  }
}

function xmlEscape(value) {
  return cleanString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlDecode(value) {
  return cleanString(value)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function base64Utf8(value) {
  const text = String(value ?? "");
  if (typeof btoa === "function") {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  return Buffer.from(text, "utf8").toString("base64");
}

function authHeader(config) {
  return `Basic ${base64Utf8(`${config.username}:${config.password}`)}`;
}

function nilTag(name) {
  return `<v20:${name} xsi:nil="true"/>`;
}

function tagValue(xml, localName) {
  const tag = cleanString(localName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`, "i");
  const match = pattern.exec(String(xml || ""));
  if (!match) {
    return "";
  }
  return xmlDecode(match[1].replace(/<[^>]+>/g, " "));
}

function tagBlocks(xml, localName) {
  const tag = cleanString(localName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>[\\s\\S]*?</(?:[\\w.-]+:)?${tag}>`, "gi");
  return String(xml || "").match(pattern) || [];
}

function tagAttribute(xml, localName, attributeName) {
  const tag = cleanString(localName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attr = cleanString(attributeName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b([^>]*)>`, "i");
  const tagMatch = pattern.exec(String(xml || ""));
  if (!tagMatch) return "";
  const attrMatch = new RegExp(`${attr}="([^"]*)"`, "i").exec(tagMatch[1]);
  return attrMatch ? xmlDecode(attrMatch[1]) : "";
}

function soapEnvelope(operation, innerXml) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v20="${ISDS_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    <v20:${operation}>
      ${innerXml}
    </v20:${operation}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function messageListRequestXml(direction, config, options = {}) {
  const unitTag = direction === "sent" ? "dmSenderOrgUnitNum" : "dmRecipientOrgUnitNum";
  const now = new Date();
  const from = new Date(now.getTime() - config.lookbackDays * 24 * 60 * 60 * 1000);
  const fromTime = normalizedDate(options.fromTime) || from.toISOString();
  const toTime = normalizedDate(options.toTime) || now.toISOString();
  const offset = positiveInteger(options.offset, 1, 1_000_000_000);
  const limit = positiveInteger(options.limit, config.limit, 100);

  return `
    <v20:dmFromTime>${xmlEscape(fromTime)}</v20:dmFromTime>
    <v20:dmToTime>${xmlEscape(toTime)}</v20:dmToTime>
    ${nilTag(unitTag)}
    <v20:dmStatusFilter></v20:dmStatusFilter>
    <v20:dmOffset>${offset}</v20:dmOffset>
    <v20:dmLimit>${limit}</v20:dmLimit>
  `;
}

function messageDownloadRequestXml(messageId) {
  return `<v20:dmID>${xmlEscape(messageId)}</v20:dmID>`;
}

function soapFaultMessage(xml) {
  return tagValue(xml, "faultstring") || tagValue(xml, "faultcode") || tagValue(xml, "dmStatusMessage");
}

function assertIsdsStatus(xml, httpStatus) {
  const code = tagValue(xml, "dmStatusCode");
  const message = tagValue(xml, "dmStatusMessage");

  if (code && !code.startsWith("00")) {
    throw new DataBoxIsdsError(
      `ISDS vratilo chybu ${code}${message ? `: ${message}` : ""}`,
      502,
      "data_box_isds_status_failed"
    );
  }

  const fault = soapFaultMessage(xml);
  if (fault && (!code || !code.startsWith("00"))) {
    throw new DataBoxIsdsError(`ISDS SOAP chyba: ${fault}`, 502, "data_box_isds_soap_fault");
  }

  if (httpStatus >= 400) {
    throw new DataBoxIsdsError("ISDS SOAP endpoint nevratil uspesnou odpoved.", httpStatus, "data_box_isds_http_failed");
  }
}

async function withTimeout(task, timeoutMs = ISDS_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function soapRequest(config, operation, innerXml, endpointUrl = config.infoEndpointUrl, fetchImpl = fetch) {
  const body = soapEnvelope(operation, innerXml);
  const response = await withTimeout((signal) => fetchImpl(endpointUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "\"\""
    },
    body,
    signal
  }));
  const text = await response.text();
  assertIsdsStatus(text, response.status);
  return text;
}

function createMessageFileXml(file, index) {
  const fileName = cleanString(file.fileName || file.filename || `priloha-${index + 1}`);
  const mimeType = cleanString(file.mimeType || file.contentType || "application/octet-stream");
  const contentBase64 = cleanString(file.contentBase64).replace(/\s+/g, "");
  if (!contentBase64) {
    throw new DataBoxIsdsError(`Příloha ${fileName} nemá obsah.`, 400, "data_box_isds_attachment_empty");
  }
  return `
        <v20:dmFile dmMimeType="${xmlEscape(mimeType)}" dmFileMetaType="${index === 0 ? "main" : "enclosure"}" dmFileDescr="${xmlEscape(fileName)}">
          <v20:dmEncodedContent>${contentBase64}</v20:dmEncodedContent>
        </v20:dmFile>`;
}

function createMessageRequestXml(message = {}) {
  const recipientDataBoxId = cleanString(message.recipientDataBoxId).toLowerCase();
  const subject = cleanString(message.subject);
  const body = cleanString(message.body);
  if (!/^[a-z0-9]{7}$/.test(recipientDataBoxId)) {
    throw new DataBoxIsdsError("ID datové schránky příjemce musí mít 7 znaků.", 400, "data_box_isds_recipient_invalid");
  }
  if (!subject || subject.length > 255) {
    throw new DataBoxIsdsError("Předmět zprávy musí mít 1 až 255 znaků.", 400, "data_box_isds_subject_invalid");
  }
  if (!body) {
    throw new DataBoxIsdsError("Text datové zprávy nesmí být prázdný.", 400, "data_box_isds_body_missing");
  }
  const files = [{
    fileName: "zprava.txt",
    mimeType: "text/plain",
    contentBase64: base64Utf8(body)
  }, ...(Array.isArray(message.attachments) ? message.attachments : [])];
  return `
      <v20:dmEnvelope>
        ${nilTag("dmSenderOrgUnit")}
        ${nilTag("dmSenderOrgUnitNum")}
        <v20:dbIDRecipient>${xmlEscape(recipientDataBoxId)}</v20:dbIDRecipient>
        ${nilTag("dmRecipientOrgUnit")}
        ${nilTag("dmRecipientOrgUnitNum")}
        ${nilTag("dmToHands")}
        <v20:dmAnnotation>${xmlEscape(subject)}</v20:dmAnnotation>
        ${nilTag("dmRecipientRefNumber")}
        ${nilTag("dmSenderRefNumber")}
        ${nilTag("dmRecipientIdent")}
        ${nilTag("dmSenderIdent")}
        ${nilTag("dmLegalTitleLaw")}
        ${nilTag("dmLegalTitleYear")}
        ${nilTag("dmLegalTitleSect")}
        ${nilTag("dmLegalTitlePar")}
        ${nilTag("dmLegalTitlePoint")}
        ${nilTag("dmPersonalDelivery")}
        ${nilTag("dmAllowSubstDelivery")}
      </v20:dmEnvelope>
      <v20:dmFiles>${files.map(createMessageFileXml).join("")}
      </v20:dmFiles>`;
}

export function dataBoxIsdsCreateMessageXmlForTest(message = {}) {
  return soapEnvelope("CreateMessage", createMessageRequestXml(message));
}

export async function sendDataBoxIsdsMessage(env = {}, account = null, message = {}, options = {}) {
  const config = account || isdsConfig(env);
  ensureIsdsConfig(config);
  const xml = await soapRequest(
    config,
    "CreateMessage",
    createMessageRequestXml(message),
    config.messageEndpointUrl,
    options.fetchImpl || fetch
  );
  const messageId = tagValue(xml, "dmID");
  if (!messageId) {
    throw new DataBoxIsdsError("ISDS potvrdilo požadavek bez ID odeslané zprávy.", 502, "data_box_isds_send_id_missing");
  }
  return {
    success: true,
    messageId,
    sentMessageId: messageId,
    statusCode: tagValue(xml, "dmStatusCode"),
    statusMessage: tagValue(xml, "dmStatusMessage"),
    endpointUrl: config.messageEndpointUrl,
    config: publicAccountStatus(config)
  };
}

function normalizedDate(value) {
  const text = cleanString(value);
  return text || "";
}

function parseMessageRecord(block, direction) {
  const attachmentSizeKb = numberValue(tagValue(block, "dmAttachmentSize"));
  const isdsMessageId = tagValue(block, "dmID");
  const isdsState = tagValue(block, "dmMessageStatus");

  return {
    isdsMessageId,
    direction,
    subject: tagValue(block, "dmAnnotation"),
    senderName: tagValue(block, "dmSender"),
    senderBoxId: tagValue(block, "dbIDSender"),
    recipientName: tagValue(block, "dmRecipient"),
    recipientBoxId: tagValue(block, "dbIDRecipient"),
    deliveredAt: normalizedDate(tagValue(block, "dmDeliveryTime")),
    acceptedAt: normalizedDate(tagValue(block, "dmAcceptanceTime")),
    status: isdsState ? `ISDS ${isdsState}` : "metadata",
    priority: "normal",
    hasAttachments: attachmentSizeKb > 0,
    attachmentsCount: 0,
    attachmentSizeKb,
    source: "isds_metadata",
    isdsState,
    isdsType: tagAttribute(block, "dmRecord", "dmType"),
    suspiciousFlag: tagAttribute(block, "dmRecord", "specMessFlag")
  };
}

async function fetchMessageList(config, direction, options = {}) {
  const operation = direction === "sent" ? "GetListOfSentMessages" : "GetListOfReceivedMessages";
  const xml = await soapRequest(
    config,
    operation,
    messageListRequestXml(direction, config, options),
    config.infoEndpointUrl,
    options.fetchImpl || fetch
  );
  return tagBlocks(xml, "dmRecord")
    .map((block) => parseMessageRecord(block, direction))
    .filter((message) => message.isdsMessageId);
}

export async function fetchDataBoxMessageMetadataPage(env = {}, account = null, options = {}) {
  const config = account || isdsConfig(env);
  ensureIsdsConfig(config);
  const direction = cleanString(options.direction).toLowerCase() === "sent" ? "sent" : "received";
  const offset = positiveInteger(options.offset, 1, 1_000_000_000);
  const limit = positiveInteger(options.limit, config.limit, 100);
  const messages = await fetchMessageList(config, direction, {
    ...options,
    offset,
    limit
  });
  return {
    fetchedAt: new Date().toISOString(),
    direction,
    offset,
    limit,
    nextOffset: offset + messages.length,
    hasMore: messages.length === limit,
    messages,
    config: publicAccountStatus(config)
  };
}

function base64ToBytes(value) {
  const normalized = cleanString(value).replace(/\s+/g, "");
  if (!normalized) {
    return new Uint8Array();
  }

  if (typeof atob === "function") {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  return new Uint8Array(Buffer.from(normalized, "base64"));
}

function parseAttachmentRecord(block, index) {
  const encodedContent = tagValue(block, "dmEncodedContent");
  let bytes = new Uint8Array();
  try {
    bytes = base64ToBytes(encodedContent);
  } catch {
    bytes = new Uint8Array();
  }
  const filename = tagValue(block, "dmFileDescr") || `priloha-${index + 1}`;
  const contentType = tagAttribute(block, "dmFile", "dmMimeType") || "application/octet-stream";
  const fileMetaType = tagAttribute(block, "dmFile", "dmFileMetaType");
  const fileGuid = tagAttribute(block, "dmFile", "dmFileGuid")
    || tagAttribute(block, "dmFile", "dmFileId")
    || tagValue(block, "dmFileGuid");

  return {
    index,
    fileGuid,
    filename,
    contentType,
    fileMetaType,
    sizeBytes: bytes.byteLength,
    bytes
  };
}

function parseMessageAttachments(xml) {
  return tagBlocks(xml, "dmFile")
    .map((block, index) => parseAttachmentRecord(block, index))
    .filter((attachment) => attachment.filename || attachment.sizeBytes > 0);
}

export async function fetchDataBoxMessageAttachments(env = {}, account = null, message = {}) {
  const config = account || isdsConfig(env);
  ensureIsdsConfig(config);

  const messageId = cleanString(message.isdsMessageId || message.dmID || message.id);
  if (!messageId) {
    throw new DataBoxIsdsError("Chybi ISDS ID zpravy pro stazeni priloh.", 400, "data_box_isds_message_id_missing");
  }

  const operations = cleanString(message.direction).toLowerCase() === "sent"
    ? ["SignedSentMessageDownload", "MessageDownload", "SignedMessageDownload", "GetMessage"]
    : ["MessageDownload", "SignedMessageDownload", "GetMessage"];
  const endpointUrls = [
    cleanString(config.messageEndpointUrl),
    cleanString(config.infoEndpointUrl)
  ].filter(Boolean);
  let lastError = null;
  const operationErrors = [];

  for (const endpointUrl of endpointUrls) {
    for (const operation of operations) {
      try {
        const xml = await soapRequest(config, operation, messageDownloadRequestXml(messageId), endpointUrl);
        const attachments = parseMessageAttachments(xml);
        return {
          fetchedAt: new Date().toISOString(),
          operation,
          endpointUrl,
          messageId,
          attachmentsCount: attachments.length,
          attachments,
          config: publicAccountStatus(config)
        };
      } catch (error) {
        lastError = error;
        operationErrors.push({
          endpoint: endpointUrl.replace(config.baseUrl, ""),
          operation,
          code: cleanString(error?.code || error?.name || "data_box_isds_operation_failed"),
          message: cleanString(error?.message || "ISDS operace selhala.").slice(0, 240)
        });
      }
    }
  }

  const finalError = lastError || new DataBoxIsdsError("ISDS detail zpravy se nepodarilo nacist.", 502, "data_box_isds_message_download_failed");
  finalError.operationErrors = operationErrors;
  throw finalError;
}

async function fetchSignedObject(config, operation, messageId, endpointUrl, fetchImpl = fetch) {
  const xml = await soapRequest(
    config,
    operation,
    messageDownloadRequestXml(messageId),
    endpointUrl,
    fetchImpl
  );
  const signatureBase64 = tagValue(xml, "dmSignature").replace(/\s+/g, "");
  const bytes = base64ToBytes(signatureBase64);
  if (!bytes.byteLength) {
    throw new DataBoxIsdsError(
      `ISDS operace ${operation} nevrátila podepsaný objekt.`,
      502,
      "data_box_isds_signed_object_missing"
    );
  }
  return { operation, bytes };
}

export async function fetchDataBoxMessageSignedArchive(env = {}, account = null, message = {}, options = {}) {
  const config = account || isdsConfig(env);
  ensureIsdsConfig(config);
  const messageId = cleanString(message.isdsMessageId || message.dmID || message.id);
  if (!messageId) {
    throw new DataBoxIsdsError("Chybí ISDS ID zprávy pro archivaci.", 400, "data_box_isds_message_id_missing");
  }
  const direction = cleanString(message.direction).toLowerCase() === "sent" ? "sent" : "received";
  const fetchImpl = options.fetchImpl || fetch;
  const messageObject = await fetchSignedObject(
    config,
    direction === "sent" ? "SignedSentMessageDownload" : "SignedMessageDownload",
    messageId,
    config.messageEndpointUrl,
    fetchImpl
  );
  const deliveryObject = await fetchSignedObject(
    config,
    "GetSignedDeliveryInfo",
    messageId,
    config.infoEndpointUrl,
    fetchImpl
  );
  return {
    fetchedAt: new Date().toISOString(),
    messageId,
    direction,
    messageOperation: messageObject.operation,
    deliveryOperation: deliveryObject.operation,
    messageZfo: messageObject.bytes,
    deliveryZfo: deliveryObject.bytes,
    config: publicAccountStatus(config)
  };
}

export async function fetchDataBoxMessageMetadata(env = {}, account = null) {
  const config = account || isdsConfig(env);
  ensureIsdsConfig(config);

  const [received, sent] = await Promise.all([
    fetchMessageList(config, "received"),
    fetchMessageList(config, "sent")
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    messages: [...received, ...sent],
    receivedCount: received.length,
    sentCount: sent.length,
    config: publicAccountStatus(config)
  };
}
