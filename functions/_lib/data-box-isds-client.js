const DEFAULT_ISDS_BASE_URL = "https://ws1.datovka.gov.cz";
const TEST_ISDS_BASE_URL = "https://ws1.datovka-test.gov.cz";
const ISDS_INFO_PATH = "/DS/dx";
const ISDS_MESSAGE_PATH = "/DS/dz";
const ISDS_NAMESPACE = "http://isds.czechpoint.cz/v20";
const ISDS_TIMEOUT_MS = 25000;
const DEFAULT_LIMIT = 50;
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_ISDS_ACCOUNTS = 6;
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
  for (let slot = 1; slot <= MAX_ISDS_ACCOUNTS; slot += 1) {
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
    maxAccounts: MAX_ISDS_ACCOUNTS,
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
      "ISDS read-only synchronizace ceka na Cloudflare secrets DATA_BOX_ISDS_ENABLED a alespon jednu dvojici DATA_BOX_ISDS_USERNAME/PASSWORD nebo DATA_BOX_ISDS_USERNAME_1..6/PASSWORD_1..6.",
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

function messageListRequestXml(direction, config) {
  const unitTag = direction === "sent" ? "dmSenderOrgUnitNum" : "dmRecipientOrgUnitNum";
  const now = new Date();
  const from = new Date(now.getTime() - config.lookbackDays * 24 * 60 * 60 * 1000);

  return `
    <v20:dmFromTime>${xmlEscape(from.toISOString())}</v20:dmFromTime>
    <v20:dmToTime>${xmlEscape(now.toISOString())}</v20:dmToTime>
    ${nilTag(unitTag)}
    <v20:dmStatusFilter></v20:dmStatusFilter>
    <v20:dmOffset>1</v20:dmOffset>
    <v20:dmLimit>${config.limit}</v20:dmLimit>
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

async function soapRequest(config, operation, innerXml, endpointUrl = config.infoEndpointUrl) {
  const body = soapEnvelope(operation, innerXml);
  const response = await withTimeout((signal) => fetch(endpointUrl, {
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

async function fetchMessageList(config, direction) {
  const operation = direction === "sent" ? "GetListOfSentMessages" : "GetListOfReceivedMessages";
  const xml = await soapRequest(config, operation, messageListRequestXml(direction, config));
  return tagBlocks(xml, "dmRecord")
    .map((block) => parseMessageRecord(block, direction))
    .filter((message) => message.isdsMessageId);
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
