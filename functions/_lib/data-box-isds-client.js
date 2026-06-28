const DEFAULT_ISDS_BASE_URL = "https://ws1.datovka.gov.cz";
const TEST_ISDS_BASE_URL = "https://ws1.datovka-test.gov.cz";
const ISDS_INFO_PATH = "/DS/dx";
const ISDS_NAMESPACE = "http://isds.czechpoint.cz/v20";
const ISDS_TIMEOUT_MS = 25000;
const DEFAULT_LIMIT = 50;
const DEFAULT_LOOKBACK_DAYS = 30;

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

export function dataBoxIsdsStatus(env = {}) {
  const enabled = enabledFlag(env.DATA_BOX_ISDS_ENABLED);
  const username = cleanString(env.DATA_BOX_ISDS_USERNAME || env.DATA_BOX_ISDS_LOGIN);
  const password = cleanString(env.DATA_BOX_ISDS_PASSWORD);
  const baseUrl = baseUrlFromEnv(env);
  const configured = enabled && Boolean(username && password);
  const missing = [];

  if (!enabled) missing.push("DATA_BOX_ISDS_ENABLED");
  if (!username) missing.push("DATA_BOX_ISDS_USERNAME");
  if (!password) missing.push("DATA_BOX_ISDS_PASSWORD");

  return {
    enabled,
    configured,
    mode: cleanString(env.DATA_BOX_ISDS_ENVIRONMENT).toLowerCase() === "test" ? "test" : "production",
    baseUrl,
    infoEndpointUrl: `${baseUrl}${ISDS_INFO_PATH}`,
    hasUsername: Boolean(username),
    hasPassword: Boolean(password),
    missing,
    documentationStatus: "official-isds-wsdl-3.11-2026-06-26"
  };
}

function isdsConfig(env = {}) {
  const status = dataBoxIsdsStatus(env);
  return {
    ...status,
    username: cleanString(env.DATA_BOX_ISDS_USERNAME || env.DATA_BOX_ISDS_LOGIN),
    password: cleanString(env.DATA_BOX_ISDS_PASSWORD),
    limit: positiveInteger(env.DATA_BOX_ISDS_MESSAGE_LIMIT, DEFAULT_LIMIT, 100),
    lookbackDays: positiveInteger(env.DATA_BOX_ISDS_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS, 365)
  };
}

function ensureIsdsConfig(config) {
  if (!config.configured) {
    throw new DataBoxIsdsError(
      "ISDS read-only synchronizace ceka na Cloudflare secrets DATA_BOX_ISDS_ENABLED, DATA_BOX_ISDS_USERNAME a DATA_BOX_ISDS_PASSWORD.",
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

async function soapRequest(config, operation, innerXml) {
  const body = soapEnvelope(operation, innerXml);
  const response = await withTimeout((signal) => fetch(config.infoEndpointUrl, {
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

export async function fetchDataBoxMessageMetadata(env = {}) {
  const config = isdsConfig(env);
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
    config: dataBoxIsdsStatus(env)
  };
}
