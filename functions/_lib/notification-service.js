import { normalizeIdentifier } from "./auth.js";
import { markAbsenceReminderSent } from "./absence-requests-store.js";
import { markMedicalExamReminderSent } from "./medical-exams-store.js";
import { selectDriverPartOffers } from "./driver-part-price-search.js";
import {
  CommunicationStoreError,
  communicationEmailIdentity,
  communicationHeaders,
  communicationSmsConfig,
  createOutgoingCommunicationAudit,
  updateOutgoingCommunicationAudit
} from "./communication-store.js";

const NOTIFICATION_DB_BINDING = "SMART_ODPADY_DB";
const DETAILED_NOTIFICATION_COLUMNS = [
  "module_id",
  "subject",
  "message_preview",
  "provider",
  "provider_message_id",
  "attempts",
  "updated_at"
];
const EXTENDED_NOTIFICATION_COLUMNS = [
  ["message_id", (entry) => entry.messageId],
  ["thread_id", (entry) => entry.threadId],
  ["audit_id", (entry) => entry.auditId],
  ["from_name", (entry) => entry.fromName],
  ["from_address", (entry) => entry.fromAddress],
  ["reply_to", (entry) => entry.replyTo],
  ["subject_token", (entry) => entry.subjectToken],
  ["provider_status", (entry) => entry.providerStatus]
];

const TYPE_LABELS = {
  vacation: "Dovolená",
  sick: "Nemoc",
  doctor: "Lékař",
  care: "OČR",
  compensatory_leave: "Náhradní volno",
  unpaid_leave: "Neplacené volno",
  other: "Jiná nepřítomnost"
};

function notificationDatabase(env) {
  return env?.[NOTIFICATION_DB_BINDING] || null;
}

async function notificationLogColumns(db) {
  try {
    const result = await db.prepare("PRAGMA table_info(notification_logs)").all();
    return new Set((result.results || []).map((row) => cleanString(row.name)));
  } catch (error) {
    console.error("notification.schema_read_failed", { message: error.message });
    return new Set();
  }
}

function canWriteDetailedNotification(columns) {
  return DETAILED_NOTIFICATION_COLUMNS.every((columnName) => columns.has(columnName));
}

function notificationExtendedColumns(columns, entry) {
  return EXTENDED_NOTIFICATION_COLUMNS
    .filter(([columnName]) => columns.has(columnName))
    .map(([columnName, valueForEntry]) => [columnName, nullableString(valueForEntry(entry))]);
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function nullableString(value) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function emailRecipients(value) {
  return cleanString(value)
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter((email, index, all) => email && email.includes("@") && all.indexOf(email) === index);
}

function parseDriverPartOffers(value) {
  try {
    const parsed = JSON.parse(cleanString(value) || "{}");
    const offers = Array.isArray(parsed?.offers)
      ? parsed.offers
      : Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    return offers
      .map((offer) => ({
        title: cleanString(offer.title || offer.name),
        price: cleanString(offer.price || offer.priceText),
        seller: cleanString(offer.seller || offer.vendor),
        url: cleanString(offer.url),
        availability: cleanString(offer.availability),
        note: cleanString(offer.note || offer.relevanceNote),
        compatibilityEvidence: cleanString(offer.compatibilityEvidence || offer.compatibility_evidence),
        compatible: offer.compatible === true,
        compatibleWithVin: offer.compatibleWithVin === true || offer.compatible_with_vin === true,
        fitsVehicle: offer.fitsVehicle === true || offer.fits_vehicle === true,
        oeNumber: cleanString(offer.oeNumber || offer.oe_number || offer.oemNumber || offer.oem_number || offer.partNumber || offer.part_number)
      }))
      .filter((offer) => offer.title || offer.price || offer.seller || offer.url)
      .slice(0, 3);
  } catch {
    return [];
  }
}

function driverPartOrderEmailOffers(request = {}) {
  return selectDriverPartOffers(parseDriverPartOffers(request.priceBoostResultJson), request, { allowUsed: false })
    .filter((offer) => offer.url && (offer.title || offer.seller))
    .slice(0, 3);
}

function driverPartOrderEmailReadiness(request = {}, requiredOfferCount = 3) {
  const offers = driverPartOrderEmailOffers(request);
  const missingOfferCount = Math.max(0, Number(requiredOfferCount || 3) - offers.length);

  return {
    allowed: missingOfferCount === 0,
    offers,
    offerCount: offers.length,
    requiredOfferCount: Number(requiredOfferCount || 3),
    missingOfferCount,
    message: missingOfferCount === 0
      ? "E-mail Patrikovi obsahuje 3 cenové nabídky s odkazy."
      : "E-mail Patrikovi neodeslán: chybí 3 cenové nabídky s odkazy."
  };
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${suffix}`;
}

function appBaseUrl(env) {
  return cleanString(env.APP_BASE_URL) || "https://smart-odpady.ai";
}

function approvalUrl(env) {
  return `${appBaseUrl(env).replace(/\/+$/, "")}/dovolena-nemoc/ke-schvaleni`;
}

function feedbackUrl(env) {
  return `${appBaseUrl(env).replace(/\/+$/, "")}/pripominky`;
}

function dashboardUrl(env) {
  return `${appBaseUrl(env).replace(/\/+$/, "")}/`;
}

function employeeCardUrl(env, employeeId) {
  return `${appBaseUrl(env).replace(/\/+$/, "")}/dovolena-nemoc/zamestnanci/${encodeURIComponent(cleanString(employeeId))}`;
}

function driverPartRequestUrl(env, requestId) {
  return `${appBaseUrl(env).replace(/\/+$/, "")}/hlaseni-ridicu?request=${encodeURIComponent(cleanString(requestId))}`;
}

function patrikProfileUrl(env) {
  return `${appBaseUrl(env).replace(/\/+$/, "")}/dovolena-nemoc/zamestnanci/patrik-istvanek`;
}

function typeLabel(request) {
  return request?.typeLabel || TYPE_LABELS[request?.type] || cleanString(request?.type) || "Žádost";
}

function formatDate(value) {
  const cleaned = cleanString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned || "neuvedeno";
  }

  const [year, month, day] = cleaned.split("-");
  return `${day}. ${month}. ${year}`;
}

function formatDateTime(value) {
  const cleaned = cleanString(value);
  const date = cleaned ? new Date(cleaned) : new Date();

  if (Number.isNaN(date.getTime())) {
    return cleaned || "neuvedeno";
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function requestIsHourlyDoctor(request) {
  return (
    cleanString(request?.type) === "doctor" &&
    cleanString(request?.unit) === "hours" &&
    cleanString(request?.startTime) &&
    cleanString(request?.endTime)
  );
}

function formatHours(value) {
  const hours = Number(value || 0);
  return `${hours.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} h`;
}

function requestHours(request) {
  const storedHours = Number(request?.hours || 0);
  if (storedHours > 0) {
    return storedHours;
  }

  const [startHours, startMinutes] = cleanString(request?.startTime).split(":").map(Number);
  const [endHours, endMinutes] = cleanString(request?.endTime).split(":").map(Number);
  const start = (startHours * 60) + startMinutes;
  const end = (endHours * 60) + endMinutes;
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60 : 0;
}

function formatRequestTerm(request) {
  if (requestIsHourlyDoctor(request)) {
    return `${formatDate(request.dateFrom)}, ${request.startTime}-${request.endTime}`;
  }

  return `${formatDate(request.dateFrom)} - ${formatDate(request.dateTo)}`;
}

function formatRequestAmount(request) {
  return requestIsHourlyDoctor(request)
    ? formatHours(requestHours(request))
    : cleanString(request?.daysCount);
}

function htmlEscape(value) {
  return cleanString(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function recipientLabel(name, fallback = "příjemce") {
  const cleaned = cleanString(name);
  return cleaned ? `${fallback} ${cleaned}` : fallback;
}

function missingEmailSettingsMessage({ provider, from, apiKey, recipientName }) {
  const missing = [];

  if (provider !== "sendgrid") {
    missing.push("EMAIL_PROVIDER=sendgrid");
  }

  if (!from) {
    missing.push("EMAIL_FROM");
  }

  if (!apiKey) {
    missing.push("SENDGRID_API_KEY");
  }

  return `E-mail pro ${recipientLabel(recipientName)} je vyplněný, ale chybí produkční nastavení odesílání: ${missing.join(", ")}.`;
}

function missingSmsSettingsMessage({ accountSid, authToken, messagingServiceSid, recipientName }) {
  const missing = [];

  if (!accountSid) {
    missing.push("TWILIO_KAISER_ACCOUNT_SID");
  }

  if (!authToken) {
    missing.push("TWILIO_KAISER_AUTH_TOKEN");
  }

  if (!messagingServiceSid) {
    missing.push("TWILIO_KAISER_MESSAGING_SERVICE_SID");
  }

  return `Telefon pro ${recipientLabel(recipientName)} je vyplněný, ale chybí produkční nastavení SMS: ${missing.join(", ")}.`;
}

async function sendGridFailureMessage(response, fromEmail) {
  let providerMessage = "";
  try {
    const payload = await response.json();
    providerMessage = cleanString(payload?.errors?.[0]?.message);
  } catch {
    providerMessage = "";
  }

  if (response.status === 403 && /verified sender|sender identity|from address/i.test(providerMessage)) {
    return `SendGrid odmítl odesílatele ${fromEmail}. Ověřte tuto adresu nebo doménu kaiserservis.cz v SendGrid Sender Authentication.`;
  }
  if (response.status === 401) {
    return "SendGrid odmítl produkční API klíč. Zkontrolujte oprávnění SENDGRID_API_KEY pro Mail Send.";
  }
  return providerMessage
    ? `SendGrid odeslání selhalo (${response.status}): ${providerMessage}`
    : `SendGrid odeslání selhalo (${response.status}).`;
}

function renderApprovalEmail({ title, headline, intro, request, ctaUrl }) {
  const note = request.note || "bez poznámky";
  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${htmlEscape(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f7f9f4;font-family:'Quicksand',Arial,Helvetica,sans-serif;color:#1f2921;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7f9f4;">
    <tr>
      <td align="center" style="padding:42px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #e1e6de;border-radius:16px;box-shadow:0 24px 64px rgba(31,41,33,0.14);overflow:hidden;">
          <tr>
            <td style="padding:40px 42px;">
              <div style="display:inline-block;background:#75bd25;border-radius:14px;padding:12px 24px;color:#ffffff;font-size:28px;line-height:32px;font-weight:700;margin:0 0 34px 0;">kaiser.</div>
              <h1 style="margin:0 0 12px 0;font-size:38px;line-height:44px;font-weight:800;color:#1f2921;">${htmlEscape(headline)}</h1>
              <p style="margin:0 0 28px 0;font-size:19px;line-height:28px;font-weight:600;color:#647064;">${htmlEscape(intro)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fbf4;border:1px solid #dfe8d9;border-radius:14px;margin:0 0 26px 0;">
                <tr><td style="padding:20px 22px;font-size:16px;line-height:24px;">
                  <p style="margin:0 0 10px 0;"><strong>Zaměstnanec:</strong> ${htmlEscape(request.employeeName)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Typ:</strong> ${htmlEscape(typeLabel(request))}</p>
                  <p style="margin:0 0 10px 0;"><strong>Termín:</strong> ${htmlEscape(formatRequestTerm(request))}</p>
                  <p style="margin:0 0 10px 0;"><strong>${requestIsHourlyDoctor(request) ? "Počet hodin" : "Počet dnů"}:</strong> ${htmlEscape(formatRequestAmount(request))}</p>
                  <p style="margin:0;"><strong>Poznámka:</strong> ${htmlEscape(note)}</p>
                </td></tr>
              </table>
              <a href="${htmlEscape(ctaUrl)}" style="display:block;text-align:center;background:#75bd25;border-radius:14px;padding:18px 24px;color:#ffffff;font-size:18px;line-height:24px;font-weight:800;text-decoration:none;">Otevřít žádost</a>
              <p style="margin:28px 0 0 0;font-size:13px;line-height:20px;color:#8a9388;">Automatická zpráva ze systému Smart odpady.<br>Kaiser servis, spol. s r.o.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderFeedbackResolvedEmail({ feedback, recipientName, resolutionMessage, ctaUrl }) {
  const introName = cleanString(recipientName || feedback.userName) || "uživateli";
  const cleanResolution = cleanString(resolutionMessage)
    || "Připomínka byla zapracována a její stav je nyní Hotovo. Detail najdete v modulu Připomínky.";

  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart odpady – připomínka vyřešena</title>
</head>
<body style="margin:0;padding:0;background:#f7f9f4;font-family:'Quicksand',Arial,Helvetica,sans-serif;color:#1f2921;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7f9f4;">
    <tr>
      <td align="center" style="padding:42px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #e1e6de;border-radius:16px;box-shadow:0 24px 64px rgba(31,41,33,0.14);overflow:hidden;">
          <tr>
            <td style="padding:40px 42px;">
              <div style="display:inline-block;background:#75bd25;border-radius:14px;padding:12px 24px;color:#ffffff;font-size:28px;line-height:32px;font-weight:700;margin:0 0 34px 0;">kaiser.</div>
              <h1 style="margin:0 0 12px 0;font-size:36px;line-height:42px;font-weight:800;color:#1f2921;">Připomínka je vyřešená</h1>
              <p style="margin:0 0 26px 0;font-size:18px;line-height:28px;font-weight:600;color:#647064;">Dobrý den, ${htmlEscape(introName)}, připomínka ve Smart odpadech byla označena jako Hotovo.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fbf4;border:1px solid #dfe8d9;border-radius:14px;margin:0 0 24px 0;">
                <tr><td style="padding:20px 22px;font-size:16px;line-height:24px;">
                  <p style="margin:0 0 10px 0;"><strong>Modul:</strong> ${htmlEscape(feedback.moduleName || "Připomínky")}</p>
                  <p style="margin:0 0 10px 0;"><strong>Připomínka:</strong> ${htmlEscape(feedback.message)}</p>
                  <p style="margin:0;"><strong>Jak bylo vyřešeno:</strong> ${htmlEscape(cleanResolution)}</p>
                </td></tr>
              </table>
              <a href="${htmlEscape(ctaUrl)}" style="display:block;text-align:center;background:#75bd25;border-radius:14px;padding:18px 24px;color:#ffffff;font-size:18px;line-height:24px;font-weight:800;text-decoration:none;">Otevřít Připomínky</a>
              <p style="margin:28px 0 0 0;font-size:13px;line-height:20px;color:#8a9388;">Automatická zpráva ze systému Smart odpady.<br>Kaiser servis, spol. s r.o.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderVersionNewsEmail({ title, text, authorName, createdAt, ctaUrl }) {
  const cleanAuthorName = cleanString(authorName) || "Uživatel";
  const cleanCreatedAt = formatDateTime(createdAt);

  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kaiser Smart – Co je nového</title>
</head>
<body style="margin:0;padding:0;background:#f7f9f4;font-family:'Quicksand',Arial,Helvetica,sans-serif;color:#1f2921;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7f9f4;">
    <tr>
      <td align="center" style="padding:42px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #e1e6de;border-radius:16px;box-shadow:0 24px 64px rgba(31,41,33,0.14);overflow:hidden;">
          <tr>
            <td style="padding:40px 42px;">
              <div style="display:inline-block;background:#75bd25;border-radius:14px;padding:12px 24px;color:#ffffff;font-size:28px;line-height:32px;font-weight:700;margin:0 0 34px 0;">kaiser.</div>
              <h1 style="margin:0 0 12px 0;font-size:36px;line-height:42px;font-weight:800;color:#1f2921;">Co je nového</h1>
              <p style="margin:0 0 26px 0;font-size:18px;line-height:28px;font-weight:600;color:#647064;">${htmlEscape(cleanAuthorName)} přidal novinku do Kaiser Smart.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fbf4;border:1px solid #dfe8d9;border-radius:14px;margin:0 0 24px 0;">
                <tr><td style="padding:20px 22px;font-size:16px;line-height:24px;">
                  <p style="margin:0 0 10px 0;"><strong>Datum:</strong> ${htmlEscape(cleanCreatedAt)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Název:</strong> ${htmlEscape(title)}</p>
                  <p style="margin:0;"><strong>Text:</strong> ${htmlEscape(text)}</p>
                </td></tr>
              </table>
              <a href="${htmlEscape(ctaUrl)}" style="display:block;text-align:center;background:#75bd25;border-radius:14px;padding:18px 24px;color:#ffffff;font-size:18px;line-height:24px;font-weight:800;text-decoration:none;">Otevřít aplikaci</a>
              <p style="margin:28px 0 0 0;font-size:13px;line-height:20px;color:#8a9388;">Automatická zpráva ze systému Smart odpady.<br>Kaiser servis, spol. s r.o.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderDataBoxForwardEmail({ message, body, ctaUrl }) {
  const subject = cleanString(message?.subject) || "Datová zpráva";
  const mailbox = cleanString(message?.dataBoxLabel || message?.data_box_label);
  const sender = cleanString(message?.senderName || message?.sender_name);
  const deliveredAt = formatDateTime(message?.deliveredAt || message?.delivered_at || message?.acceptedAt || message?.accepted_at || message?.storedAt || message?.stored_at);
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const attachmentText = attachments.length
    ? attachments.map((attachment) => cleanString(attachment.filename || "Příloha")).filter(Boolean).join(", ")
    : "Bez příloh nebo přílohy nejsou v metadatech.";
  const cleanBody = cleanString(body);

  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kaiser Smart – datová zpráva</title>
</head>
<body style="margin:0;padding:0;background:#f7f9f4;font-family:'Quicksand',Arial,Helvetica,sans-serif;color:#1f2921;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7f9f4;">
    <tr>
      <td align="center" style="padding:42px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #e1e6de;border-radius:16px;box-shadow:0 24px 64px rgba(31,41,33,0.14);overflow:hidden;">
          <tr>
            <td style="padding:40px 42px;">
              <div style="display:inline-block;background:#75bd25;border-radius:14px;padding:12px 24px;color:#ffffff;font-size:28px;line-height:32px;font-weight:700;margin:0 0 34px 0;">kaiser.</div>
              <h1 style="margin:0 0 12px 0;font-size:34px;line-height:40px;font-weight:800;color:#1f2921;">${htmlEscape(subject)}</h1>
              <p style="margin:0 0 26px 0;font-size:18px;line-height:28px;font-weight:600;color:#647064;">Datová zpráva byla po potvrzení uživatele předána e-mailem ze serverové části Kaiser Smart.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fbf4;border:1px solid #dfe8d9;border-radius:14px;margin:0 0 24px 0;">
                <tr><td style="padding:20px 22px;font-size:16px;line-height:24px;">
                  <p style="margin:0 0 10px 0;"><strong>Schránka:</strong> ${htmlEscape(mailbox || "neuvedeno")}</p>
                  <p style="margin:0 0 10px 0;"><strong>Odesílatel:</strong> ${htmlEscape(sender || "neuvedeno")}</p>
                  <p style="margin:0 0 10px 0;"><strong>Doručeno:</strong> ${htmlEscape(deliveredAt || "neuvedeno")}</p>
                  <p style="margin:0;"><strong>Přílohy:</strong> ${htmlEscape(attachmentText)}</p>
                </td></tr>
              </table>
              ${cleanBody ? `<p style="margin:0 0 24px 0;font-size:17px;line-height:27px;color:#405044;">${htmlEscape(cleanBody).replace(/\n/g, "<br>")}</p>` : ""}
              <a href="${htmlEscape(ctaUrl)}" style="display:block;text-align:center;background:#75bd25;border-radius:14px;padding:18px 24px;color:#ffffff;font-size:18px;line-height:24px;font-weight:800;text-decoration:none;">Otevřít datovou zprávu</a>
              <p style="margin:28px 0 0 0;font-size:13px;line-height:20px;color:#8a9388;">Automatická zpráva ze systému Smart odpady.<br>Kaiser servis, spol. s r.o.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderMedicalExamReminderEmail({ exam, ctaUrl }) {
  const statusLabel = cleanString(exam.statusLabel) || "Chybí údaje";
  const intro = exam.status === "overdue"
    ? `${exam.employeeName} má lékařskou prohlídku po termínu.`
    : exam.status === "due_soon"
      ? `${exam.employeeName} má lékařskou prohlídku do 60 dnů.`
      : `${exam.employeeName} má neúplné údaje k lékařské prohlídce.`;

  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kaiser Smart – lékařské prohlídky</title>
</head>
<body style="margin:0;padding:0;background:#f7f9f4;font-family:'Quicksand',Arial,Helvetica,sans-serif;color:#1f2921;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7f9f4;">
    <tr>
      <td align="center" style="padding:42px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #e1e6de;border-radius:16px;box-shadow:0 24px 64px rgba(31,41,33,0.14);overflow:hidden;">
          <tr>
            <td style="padding:40px 42px;">
              <div style="display:inline-block;background:#75bd25;border-radius:14px;padding:12px 24px;color:#ffffff;font-size:28px;line-height:32px;font-weight:700;margin:0 0 34px 0;">kaiser.</div>
              <h1 style="margin:0 0 12px 0;font-size:36px;line-height:42px;font-weight:800;color:#1f2921;">Lékařské prohlídky</h1>
              <p style="margin:0 0 26px 0;font-size:18px;line-height:28px;font-weight:600;color:#647064;">${htmlEscape(intro)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fbf4;border:1px solid #dfe8d9;border-radius:14px;margin:0 0 24px 0;">
                <tr><td style="padding:20px 22px;font-size:16px;line-height:24px;">
                  <p style="margin:0 0 10px 0;"><strong>Zaměstnanec:</strong> ${htmlEscape(exam.employeeName)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Kategorie:</strong> ${htmlEscape(exam.categoryLabel || exam.fullCategoryLabel || "neuvedeno")}</p>
                  <p style="margin:0 0 10px 0;"><strong>Poslední prohlídka:</strong> ${htmlEscape(formatDate(exam.lastExamDate))}</p>
                  <p style="margin:0 0 10px 0;"><strong>Příští prohlídka:</strong> ${htmlEscape(formatDate(exam.nextExamDate))}</p>
                  <p style="margin:0;"><strong>Stav:</strong> ${htmlEscape(statusLabel)}</p>
                </td></tr>
              </table>
              <a href="${htmlEscape(ctaUrl)}" style="display:block;text-align:center;background:#75bd25;border-radius:14px;padding:18px 24px;color:#ffffff;font-size:18px;line-height:24px;font-weight:800;text-decoration:none;">Otevřít kartu zaměstnance</a>
              <p style="margin:28px 0 0 0;font-size:13px;line-height:20px;color:#8a9388;">Automatická zpráva ze systému Smart odpady.<br>Kaiser servis, spol. s r.o.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderDriverPartOrderEmail({ request, ctaUrl, patrikUrl }) {
  const vin = cleanString(request.vin) || "není dostupné";
  const side = cleanString(request.probablePartSideLabel) || cleanString(request.probablePartSide) || "neznámá strana";
  const probablePart = cleanString(request.partName || request.verifiedPart || request.probablePart) || "čeká na identifikaci";
  const oePartNumber = cleanString(request.oePartNumber || request.partOrderNumber) || "čeká na ověření";
  const requestType = cleanString(request.category || request.requestCategory || request.defectCategory) || "neuvedeno";
  const serviceType = cleanString(request.serviceType || request.defectType) || "neuvedeno";
  const statusLabel = cleanString(request.statusLabel || request.status) || "neuvedeno";
  const priority = cleanString(request.priority) || "běžné";
  const driverNote = cleanString(request.driverNote || request.driver_note || request.note) || "bez poznámky";
  const providerMessage = cleanString(request.partsProviderMessage)
    || "Pilotní návrh Autopilota. Nic nebylo objednáno. Prosím ručně ověřit OE číslo a dostupnost před nákupem.";
  const offers = driverPartOrderEmailOffers(request);
  const offersHtml = offers.length
    ? `
              <h2 style="margin:26px 0 12px 0;font-size:24px;line-height:30px;font-weight:800;color:#1f2921;">3 nejlevnější nabídky</h2>
              <ol style="margin:0 0 24px 22px;padding:0;font-size:16px;line-height:24px;color:#1f2921;">
                ${offers.map((offer) => `
                  <li style="margin:0 0 12px 0;">
                    <strong>${htmlEscape(offer.title || "nabídka")}</strong><br>
                    ${offer.price ? `<span>Cena: ${htmlEscape(offer.price)}</span><br>` : ""}
                    ${offer.seller ? `<span>Prodejce: ${htmlEscape(offer.seller)}</span><br>` : ""}
                    ${offer.availability ? `<span>Dostupnost: ${htmlEscape(offer.availability)}</span><br>` : ""}
                    ${offer.url ? `<a href="${htmlEscape(offer.url)}" style="color:#4f8f18;text-decoration:underline;">${htmlEscape(offer.url)}</a><br>` : ""}
                    ${offer.note ? `<small style="color:#647064;">${htmlEscape(offer.note)}</small>` : ""}
                  </li>
                `).join("")}
              </ol>`
    : `
              <h2 style="margin:26px 0 12px 0;font-size:22px;line-height:28px;font-weight:800;color:#1f2921;">Cenový průzkum</h2>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:23px;color:#647064;">E-mail nebyl připravený k odeslání, protože chybí 3 cenové nabídky s odkazy.</p>`;
  const damagePhoto = cleanString(request.damagePhotoStatus) === "attached"
    ? "přiložena"
    : cleanString(request.damagePhotoStatus) === "not_needed"
      ? "nevyžadována"
      : "vyžádána od řidiče, zatím bez přílohy";

  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kaiser Smart – náhradní díl k ověření</title>
</head>
<body style="margin:0;padding:0;background:#f7f9f4;font-family:'Quicksand',Arial,Helvetica,sans-serif;color:#1f2921;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7f9f4;">
    <tr>
      <td align="center" style="padding:42px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:660px;background:#ffffff;border:1px solid #e1e6de;border-radius:16px;box-shadow:0 24px 64px rgba(31,41,33,0.14);overflow:hidden;">
          <tr>
            <td style="padding:40px 42px;">
              <div style="display:inline-block;background:#75bd25;border-radius:14px;padding:12px 24px;color:#ffffff;font-size:28px;line-height:32px;font-weight:700;margin:0 0 34px 0;">kaiser.</div>
              <h1 style="margin:0 0 12px 0;font-size:34px;line-height:40px;font-weight:800;color:#1f2921;">Náhradní díl k ověření</h1>
              <p style="margin:0 0 26px 0;font-size:18px;line-height:28px;font-weight:600;color:#647064;">Patriku, Autopilot našel návrh dílu a cenové nabídky. Prosím ručně ověř kompatibilitu před nákupem. Nic nebylo objednáno.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef7e6;border:1px solid #cfe7c2;border-radius:14px;margin:0 0 24px 0;">
                <tr><td style="padding:20px 22px;font-size:17px;line-height:25px;">
                  <p style="margin:0 0 10px 0;"><strong>Vozidlo:</strong> ${htmlEscape(request.vehicleName || request.licensePlate || "neuvedeno")}</p>
                  <p style="margin:0 0 10px 0;"><strong>SPZ / VIN:</strong> ${htmlEscape(request.licensePlate || "neuvedeno")} / ${htmlEscape(vin)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Závada:</strong> ${htmlEscape(request.defectDescription || "neuvedeno")}</p>
                  <p style="margin:0 0 10px 0;"><strong>Typ požadavku:</strong> ${htmlEscape(requestType)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Servisní typ:</strong> ${htmlEscape(serviceType)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Stav:</strong> ${htmlEscape(statusLabel)}</p>
                  <p style="margin:0;"><strong>Navržený díl:</strong> ${htmlEscape(probablePart)}${oePartNumber !== "čeká na ověření" ? `, OE ${htmlEscape(oePartNumber)}` : ""}</p>
                </td></tr>
              </table>
              ${offersHtml}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fbf4;border:1px solid #dfe8d9;border-radius:14px;margin:0 0 24px 0;">
                <tr><td style="padding:20px 22px;font-size:16px;line-height:24px;">
                  <p style="margin:0 0 10px 0;"><strong>Řidič:</strong> ${htmlEscape(request.driverName)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Telefon:</strong> ${htmlEscape(request.driverPhone || "neuvedeno")}</p>
                  <p style="margin:0 0 10px 0;"><strong>Vozidlo:</strong> ${htmlEscape(request.vehicleName || request.licensePlate)}</p>
                  <p style="margin:0 0 10px 0;"><strong>SPZ:</strong> ${htmlEscape(request.licensePlate)}</p>
                  <p style="margin:0 0 10px 0;"><strong>VIN:</strong> ${htmlEscape(vin)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Závada:</strong> ${htmlEscape(request.defectDescription)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Poznámka řidiče:</strong> ${htmlEscape(driverNote)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Vyhodnocení:</strong> ${htmlEscape(requestType)} / ${htmlEscape(serviceType)} / ${htmlEscape(priority)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Stav hlášení:</strong> ${htmlEscape(statusLabel)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Fotka poškození:</strong> ${htmlEscape(damagePhoto)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Pravděpodobný díl:</strong> ${htmlEscape(probablePart)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Strana dílu:</strong> ${htmlEscape(side)}</p>
                  <p style="margin:0;"><strong>OE číslo:</strong> ${htmlEscape(oePartNumber)}</p>
                </td></tr>
              </table>
              <a href="${htmlEscape(ctaUrl)}" style="display:block;text-align:center;background:#75bd25;border-radius:14px;padding:18px 24px;color:#ffffff;font-size:18px;line-height:24px;font-weight:800;text-decoration:none;">Otevřít detail hlášení</a>
              <p style="margin:18px 0 0 0;font-size:15px;line-height:23px;color:#647064;">${htmlEscape(providerMessage)}</p>
              <p style="margin:12px 0 0 0;font-size:15px;line-height:23px;font-weight:700;color:#1f2921;">Pilotní návrh Autopilota. Nic nebylo objednáno. Prosím ručně ověřit před nákupem.</p>
              <p style="margin:12px 0 0 0;font-size:14px;line-height:21px;color:#647064;">Profil Patrika: <a href="${htmlEscape(patrikUrl)}" style="color:#4f8f18;text-decoration:underline;">${htmlEscape(patrikUrl)}</a></p>
              <p style="margin:28px 0 0 0;font-size:13px;line-height:20px;color:#8a9388;">Automatická zpráva ze systému Smart odpady.<br>Kaiser servis, spol. s r.o.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function driverPartEmailPartName(request = {}) {
  return cleanString(request.partName || request.verifiedPart || request.probablePart) || "náhradní díl";
}

function driverPartOrderEmailSubject(request = {}) {
  return `Náhradní díl k ověření: ${cleanString(request.licensePlate) || "SPZ"} – ${driverPartEmailPartName(request)}`;
}

export function buildDriverPartOrderEmailPreview(env = {}, request, options = {}) {
  const readiness = driverPartOrderEmailReadiness(request);
  const recipientEmail = cleanString(options.recipientEmail || env.PARTS_PATRIK_EMAIL || env.PARTS_PATRICK_EMAIL || env.PATRICK_PARTS_EMAIL || env.PARTS_ORDER_EMAIL);
  const ccEmail = cleanString(options.ccEmail || env.PARTS_PILOT_CC_EMAIL || "oplustil@kaiserservis.cz");
  const recipientName = cleanString(options.recipientName || "Patrik Ištvánek");
  const subject = driverPartOrderEmailSubject(request);

  return {
    allowed: readiness.allowed,
    subject,
    to: recipientEmail,
    cc: ccEmail,
    recipientName,
    offerCount: readiness.offerCount,
    requiredOfferCount: readiness.requiredOfferCount,
    missingOfferCount: readiness.missingOfferCount,
    message: readiness.message,
    html: readiness.allowed
      ? renderDriverPartOrderEmail({
        request,
        ctaUrl: driverPartRequestUrl(env, request.id),
        patrikUrl: patrikProfileUrl(env)
      })
      : ""
  };
}

function renderDriverPartUrgentEmail({ request, ctaUrl }) {
  const vin = cleanString(request.vin) || "není dostupné";
  const note = cleanString(request.note) || "Bez doplňující poznámky.";

  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart odpady – urgentní servisní hlášení</title>
</head>
<body style="margin:0;padding:0;background:#f7f9f4;font-family:'Quicksand',Arial,Helvetica,sans-serif;color:#1f2921;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7f9f4;">
    <tr>
      <td align="center" style="padding:42px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:660px;background:#ffffff;border:1px solid #e1e6de;border-radius:16px;box-shadow:0 24px 64px rgba(31,41,33,0.14);overflow:hidden;">
          <tr>
            <td style="padding:40px 42px;">
              <div style="display:inline-block;background:#c2410c;border-radius:14px;padding:12px 24px;color:#ffffff;font-size:28px;line-height:32px;font-weight:700;margin:0 0 34px 0;">URGENTNÍ</div>
              <h1 style="margin:0 0 12px 0;font-size:34px;line-height:40px;font-weight:800;color:#1f2921;">Urgentní servisní hlášení</h1>
              <p style="margin:0 0 26px 0;font-size:18px;line-height:28px;font-weight:600;color:#647064;">Patriku, řidič nahlásil bezpečnostní problém. Neposílám to do hledání dílů, čeká to na tvoje rozhodnutí.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;margin:0 0 24px 0;">
                <tr><td style="padding:20px 22px;font-size:17px;line-height:25px;">
                  <p style="margin:0 0 10px 0;"><strong>Řidič:</strong> ${htmlEscape(request.driverName || "neuvedeno")}</p>
                  <p style="margin:0 0 10px 0;"><strong>Auto:</strong> ${htmlEscape(request.vehicleName || request.licensePlate || "neuvedeno")}</p>
                  <p style="margin:0 0 10px 0;"><strong>SPZ / VIN:</strong> ${htmlEscape(request.licensePlate || "neuvedeno")} / ${htmlEscape(vin)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Problém:</strong> ${htmlEscape(request.defectDescription || "neuvedeno")}</p>
                  <p style="margin:0;"><strong>Poznámka:</strong> ${htmlEscape(note)}</p>
                </td></tr>
              </table>
              <p style="margin:0 0 24px 0;font-size:16px;line-height:24px;font-weight:700;color:#9a3412;">Doporučení: nepokračovat v jízdě, dokud nepotvrdíš další postup.</p>
              <a href="${htmlEscape(ctaUrl)}" style="display:block;text-align:center;background:#75bd25;border-radius:14px;padding:18px 24px;color:#ffffff;font-size:18px;line-height:24px;font-weight:800;text-decoration:none;">Otevřít detail hlášení</a>
              <p style="margin:28px 0 0 0;font-size:13px;line-height:20px;color:#8a9388;">Automatická zpráva ze systému Smart odpady.<br>Kaiser servis, spol. s r.o.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function logNotification(env, entry) {
  const db = notificationDatabase(env);
  if (!db) {
    console.info("notification.log_skipped", { type: entry.type, channel: entry.channel, recipient: entry.recipient });
    return null;
  }

  const now = new Date().toISOString();

  try {
    const columns = await notificationLogColumns(db);

    if (canWriteDetailedNotification(columns)) {
      const extraColumns = notificationExtendedColumns(columns, entry);
      const extraColumnSql = extraColumns.length
        ? `,\n            ${extraColumns.map(([columnName]) => columnName).join(",\n            ")}`
        : "";
      const extraPlaceholderSql = extraColumns.length
        ? `, ${extraColumns.map(() => "?").join(", ")}`
        : "";

      await db
        .prepare(`
          INSERT INTO notification_logs (
            id,
            module_id,
            type,
            channel,
            recipient,
            related_entity_type,
            related_entity_id,
            status,
            error_message,
            subject,
            message_preview,
            provider,
            provider_message_id,
            attempts,
            sent_at,
            created_at,
            updated_at${extraColumnSql}
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${extraPlaceholderSql})
        `)
        .bind(
          randomId("notification-log"),
          cleanString(entry.moduleId || "dovolena-nemoc"),
          cleanString(entry.type),
          cleanString(entry.channel),
          nullableString(entry.recipient),
          cleanString(entry.relatedEntityType || "absence_request"),
          nullableString(entry.relatedEntityId),
          cleanString(entry.status || "skipped"),
          nullableString(entry.errorMessage),
          nullableString(entry.subject),
          nullableString(entry.messagePreview || entry.errorMessage || entry.subject),
          nullableString(entry.provider),
          nullableString(entry.providerMessageId),
          Number(entry.attempts || 1),
          entry.status === "sent" ? now : null,
          now,
          now,
          ...extraColumns.map(([, value]) => value)
        )
        .run();
      return null;
    }

    await db
      .prepare(`
        INSERT INTO notification_logs (
          id,
          type,
          channel,
          recipient,
          related_entity_type,
          related_entity_id,
          status,
          error_message,
          sent_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        randomId("notification-log"),
        cleanString(entry.type),
        cleanString(entry.channel),
        nullableString(entry.recipient),
        cleanString(entry.relatedEntityType || "absence_request"),
        nullableString(entry.relatedEntityId),
        cleanString(entry.status || "skipped"),
        nullableString(entry.errorMessage || entry.messagePreview || entry.subject),
        entry.status === "sent" ? now : null,
        now
      )
      .run();
  } catch (error) {
    console.error("notification.log_failed", { message: error.message, type: entry.type });
  }

  return null;
}

async function sendEmail(env, {
  type,
  to,
  cc = "",
  subject,
  html,
  relatedEntityId,
  recipientName = "",
  fromName = "Smart odpady",
  moduleId = "dovolena-nemoc",
  relatedEntityType = "absence_request",
  messagePreview = "",
  attachments = []
}) {
  const apiKey = cleanString(env.SENDGRID_API_KEY || env.EMAIL_API_KEY);
  const provider = cleanString(env.EMAIL_PROVIDER || (apiKey ? "sendgrid" : "")).toLowerCase();
  const identity = communicationEmailIdentity(env, { fromName });
  const cleanRecipientName = cleanString(recipientName);
  const ccRecipients = emailRecipients(cc).filter((email) => email.toLowerCase() !== cleanString(to).toLowerCase());
  const recipientForLog = [to, ccRecipients.length ? `cc: ${ccRecipients.join(", ")}` : ""].filter(Boolean).join(" | ");
  let audit = null;

  try {
    audit = await createOutgoingCommunicationAudit(env, {
      channel: "email",
      type,
      provider: "SendGrid",
      toAddress: to,
      ccAddress: ccRecipients.join(", "),
      subject,
      messagePreview,
      moduleKey: moduleId,
      entityType: relatedEntityType,
      entityId: relatedEntityId,
      fromName: identity.fromName,
      fromAddress: identity.fromEmail,
      replyTo: identity.replyTo,
      rawPayload: {
        recipientName: cleanRecipientName,
        requestedFromName: identity.requestedFromName,
        replacedFrom: identity.replacedFrom,
        replacedReplyTo: identity.replacedReplyTo
      }
    });
  } catch (error) {
    const message = error instanceof CommunicationStoreError
      ? error.message
      : "Audit odchozího e-mailu se nepodařilo založit.";
    await logNotification(env, {
      moduleId,
      type,
      channel: "email",
      recipient: recipientForLog || to,
      relatedEntityType,
      relatedEntityId,
      status: "skipped",
      subject,
      provider: "SendGrid",
      messagePreview,
      errorMessage: message,
      fromName: identity.fromName,
      fromAddress: identity.fromEmail,
      replyTo: identity.replyTo
    });
    return { status: "skipped", errorMessage: message, recipientName: cleanRecipientName, cc: ccRecipients };
  }

  if (!to || provider !== "sendgrid" || !identity.fromEmail || !apiKey) {
    const missing = !to
      ? cleanRecipientName
        ? `Chybí e-mail příjemce: ${cleanRecipientName}.`
        : "Chybí příjemce e-mailu."
      : missingEmailSettingsMessage({ provider, from: identity.fromEmail, apiKey, recipientName: cleanRecipientName });
    await updateOutgoingCommunicationAudit(env, audit, {
      status: "skipped",
      provider: "SendGrid",
      errorMessage: missing
    });
    await logNotification(env, {
      moduleId,
      type,
      channel: "email",
      recipient: recipientForLog || to,
      relatedEntityType,
      relatedEntityId,
      status: "skipped",
      subject,
      provider: "SendGrid",
      messageId: audit.messageId,
      threadId: audit.threadId,
      auditId: audit.auditId,
      fromName: identity.fromName,
      fromAddress: identity.fromEmail,
      replyTo: identity.replyTo,
      subjectToken: audit.subjectToken,
      providerStatus: "skipped",
      messagePreview,
      errorMessage: missing
    });
    return { status: "skipped", errorMessage: missing, recipientName: cleanRecipientName, cc: ccRecipients };
  }

  const personalization = { to: [{ email: to }] };
  if (ccRecipients.length) {
    personalization.cc = ccRecipients.map((email) => ({ email }));
  }

  let response;
  try {
    response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [personalization],
        from: { email: identity.fromEmail, name: identity.fromName },
        reply_to: { email: identity.replyTo, name: identity.fromName },
        subject,
        headers: communicationHeaders(audit),
        custom_args: {
          kso_audit_id: audit.auditId,
          kso_thread_id: audit.threadId,
          kso_module_key: audit.moduleKey,
          kso_entity_type: audit.entityType,
          kso_entity_id: audit.entityId || ""
        },
        content: [{ type: "text/html", value: html }],
        ...(Array.isArray(attachments) && attachments.length ? { attachments } : {})
      })
    });

    if (!response.ok) {
      throw new Error(await sendGridFailureMessage(response, identity.fromEmail));
    }
  } catch (error) {
    const errorMessage = cleanString(error?.message) || "SendGrid odeslání selhalo.";
    try {
      await updateOutgoingCommunicationAudit(env, audit, {
        status: "failed",
        provider: "SendGrid",
        errorMessage
      });
    } catch (auditError) {
      console.error("notification.email_failure_audit_failed", { message: auditError.message, type });
    }
    await logNotification(env, {
      moduleId,
      type,
      channel: "email",
      recipient: recipientForLog || to,
      relatedEntityType,
      relatedEntityId,
      status: "failed",
      subject,
      provider: "SendGrid",
      messageId: audit.messageId,
      threadId: audit.threadId,
      auditId: audit.auditId,
      fromName: identity.fromName,
      fromAddress: identity.fromEmail,
      replyTo: identity.replyTo,
      subjectToken: audit.subjectToken,
      providerStatus: "failed",
      messagePreview,
      errorMessage
    });
    return { status: "failed", errorMessage, recipientName: cleanRecipientName, cc: ccRecipients };
  }

  const providerMessageId = response.headers?.get?.("x-message-id") || "";
  let auditWarning = "";
  try {
    await updateOutgoingCommunicationAudit(env, audit, {
      status: "sent",
      provider: "SendGrid",
      providerMessageId,
      providerStatus: "sent"
    });
  } catch (error) {
    auditWarning = "E-mail byl přijatý poskytovatelem, ale nepodařilo se aktualizovat jeho auditní záznam.";
    console.error("notification.email_success_audit_failed", { message: error.message, type });
  }
  await logNotification(env, {
    moduleId,
    type,
    channel: "email",
    recipient: recipientForLog || to,
    relatedEntityType,
    relatedEntityId,
    status: "sent",
    subject,
    provider: "SendGrid",
    providerMessageId,
    messageId: audit.messageId,
    threadId: audit.threadId,
    auditId: audit.auditId,
    fromName: identity.fromName,
    fromAddress: identity.fromEmail,
    replyTo: identity.replyTo,
    subjectToken: audit.subjectToken,
    providerStatus: "sent",
    messagePreview
  });
  return {
    status: "sent",
    recipientName: cleanRecipientName,
    cc: ccRecipients,
    providerMessageId,
    auditWarning
  };
}

async function sendSms(env, {
  type,
  to,
  body,
  relatedEntityId,
  recipientName = "",
  moduleId = "dovolena-nemoc",
  relatedEntityType = "absence_request"
}) {
  const smsConfig = communicationSmsConfig(env);
  const { accountSid, authToken, messagingServiceSid } = smsConfig;
  const normalizedTo = normalizeIdentifier(to);
  const cleanRecipientName = cleanString(recipientName);
  let audit = null;

  try {
    audit = await createOutgoingCommunicationAudit(env, {
      channel: "sms",
      type,
      provider: "Twilio",
      toAddress: normalizedTo || to,
      messagePreview: body,
      moduleKey: moduleId,
      entityType: relatedEntityType,
      entityId: relatedEntityId,
      rawPayload: {
        recipientName: cleanRecipientName,
        twilioProject: smsConfig.projectName,
        configSource: smsConfig.configSource,
        mode: smsConfig.mode
      }
    });
  } catch (error) {
    const message = error instanceof CommunicationStoreError
      ? error.message
      : "Audit odchozí SMS se nepodařilo založit.";
    await logNotification(env, {
      moduleId,
      type,
      channel: "sms",
      recipient: normalizedTo || to,
      relatedEntityType,
      relatedEntityId,
      status: "skipped",
      provider: "Twilio",
      messagePreview: body,
      errorMessage: message
    });
    return { status: "skipped", errorMessage: message, recipientName: cleanRecipientName };
  }

  if (!normalizedTo || !accountSid || !authToken || !messagingServiceSid || smsConfig.mode === "off" || smsConfig.mode === "test") {
    const missing = smsConfig.mode === "off"
      ? "SMS odesílání je vypnuté přes KSO_SMS_MODE=off."
      : smsConfig.mode === "test"
        ? "SMS je v test režimu. Záměr je auditovaný, ostrá SMS nebyla odeslána."
        : !normalizedTo
      ? cleanRecipientName
        ? `Chybí telefon příjemce: ${cleanRecipientName}.`
        : "Chybí telefon příjemce."
      : missingSmsSettingsMessage({ accountSid, authToken, messagingServiceSid, recipientName: cleanRecipientName });
    await updateOutgoingCommunicationAudit(env, audit, {
      status: "skipped",
      provider: "Twilio",
      providerStatus: smsConfig.mode,
      errorMessage: missing
    });
    await logNotification(env, {
      moduleId,
      type,
      channel: "sms",
      recipient: normalizedTo || to,
      relatedEntityType,
      relatedEntityId,
      status: "skipped",
      provider: "Twilio",
      providerStatus: smsConfig.mode,
      messageId: audit.messageId,
      threadId: audit.threadId,
      auditId: audit.auditId,
      subjectToken: audit.subjectToken,
      messagePreview: body,
      errorMessage: missing
    });
    return { status: "skipped", errorMessage: missing, recipientName: cleanRecipientName };
  }

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        To: normalizedTo,
        MessagingServiceSid: messagingServiceSid,
        Body: body,
        ...(smsConfig.statusCallbackUrl ? { StatusCallback: smsConfig.statusCallbackUrl } : {})
      })
    });

    const responsePayload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(`Twilio ${response.status}`);
    }

    const providerMessageId = cleanString(responsePayload.sid);
    await updateOutgoingCommunicationAudit(env, audit, {
      status: "sent",
      provider: "Twilio",
      providerMessageId,
      providerStatus: cleanString(responsePayload.status || "sent")
    });
    await logNotification(env, {
      moduleId,
      type,
      channel: "sms",
      recipient: normalizedTo,
      relatedEntityType,
      relatedEntityId,
      status: "sent",
      provider: "Twilio",
      providerMessageId,
      providerStatus: cleanString(responsePayload.status || "sent"),
      messageId: audit.messageId,
      threadId: audit.threadId,
      auditId: audit.auditId,
      subjectToken: audit.subjectToken,
      messagePreview: body
    });
    return { status: "sent", recipientName: cleanRecipientName };
  } catch (error) {
    await updateOutgoingCommunicationAudit(env, audit, {
      status: "failed",
      provider: "Twilio",
      providerStatus: "failed",
      errorMessage: error.message
    });
    await logNotification(env, {
      moduleId,
      type,
      channel: "sms",
      recipient: normalizedTo,
      relatedEntityType,
      relatedEntityId,
      status: "failed",
      provider: "Twilio",
      providerStatus: "failed",
      messageId: audit.messageId,
      threadId: audit.threadId,
      auditId: audit.auditId,
      subjectToken: audit.subjectToken,
      messagePreview: body,
      errorMessage: error.message
    });
    return { status: "failed", errorMessage: error.message, recipientName: cleanRecipientName };
  }
}

export async function sendModuleFeedbackResolvedNotification(env, feedback, options = {}) {
  const recipientName = cleanString(options.recipientName || feedback.userName);
  const resolutionMessage = cleanString(options.resolutionMessage);

  return sendEmail(env, {
    type: "module_feedback_resolved_email",
    to: cleanString(options.recipientEmail),
    subject: "Smart odpady – připomínka vyřešena",
    html: renderFeedbackResolvedEmail({
      feedback,
      recipientName,
      resolutionMessage,
      ctaUrl: feedbackUrl(env)
    }),
    relatedEntityId: feedback.id,
    recipientName,
    moduleId: cleanString(feedback.moduleId || "feedback"),
    relatedEntityType: "module_feedback",
    messagePreview: resolutionMessage || "Připomínka byla označena jako Hotovo."
  });
}

export async function sendVersionNewsNotification(env, news, options = {}) {
  const title = cleanString(news?.title);
  const text = cleanString(news?.text);
  const authorName = cleanString(news?.authorName || options.authorName);
  const messagePreview = `${title}${text ? ` – ${text}` : ""}`;

  return sendEmail(env, {
    type: "version_news_email",
    to: cleanString(options.recipientEmail),
    subject: "Kaiser Smart – Co je nového",
    html: renderVersionNewsEmail({
      title,
      text,
      authorName,
      createdAt: cleanString(news?.createdAt),
      ctaUrl: dashboardUrl(env)
    }),
    relatedEntityId: cleanString(news?.id || title || "version-news"),
    recipientName: cleanString(options.recipientName),
    fromName: cleanString(options.fromName || "Radim Opluštil"),
    moduleId: "dashboard",
    relatedEntityType: "version_news",
    messagePreview
  });
}

export async function sendDataBoxForwardNotification(env, message, options = {}) {
  const title = cleanString(options.subject || message?.subject || "Datová zpráva");
  const recipientEmail = cleanString(options.recipientEmail);
  const ctaUrl = `${appBaseUrl(env).replace(/\/+$/, "")}/datove-schranky-plus?message=${encodeURIComponent(cleanString(message?.id))}`;

  return sendEmail(env, {
    type: "data_box_forward_email",
    to: recipientEmail,
    subject: `Kaiser Smart – ${title}`,
    html: renderDataBoxForwardEmail({
      message,
      body: cleanString(options.body),
      ctaUrl
    }),
    relatedEntityId: cleanString(message?.id),
    recipientName: cleanString(options.recipientName || recipientEmail),
    fromName: cleanString(options.fromName || "Kaiser Smart"),
    moduleId: "data-box-plus",
    relatedEntityType: "data_box_message",
    messagePreview: title,
    attachments: Array.isArray(options.attachments) ? options.attachments : []
  });
}

export async function sendMedicalExamReminderNotification(env, exam, options = {}) {
  const recipientEmail = cleanString(options.recipientEmail || env.MEDICAL_EXAM_REMINDER_EMAIL || "olsanikova@kaiserservis.cz");
  const recipientName = cleanString(options.recipientName || "Olšaníková");
  const statusLabel = cleanString(exam?.statusLabel) || "Chybí údaje";
  const messagePreview = `${cleanString(exam?.employeeName) || "Zaměstnanec"} – ${statusLabel}`;

  return sendEmail(env, {
    type: "employee_medical_exam_reminder",
    to: recipientEmail,
    subject: "Kaiser Smart – lékařské prohlídky",
    html: renderMedicalExamReminderEmail({
      exam,
      ctaUrl: employeeCardUrl(env, exam?.employeeId)
    }),
    relatedEntityId: cleanString(exam?.id || exam?.employeeId),
    recipientName,
    moduleId: "absence",
    relatedEntityType: "employee_medical_exam",
    messagePreview
  });
}

export async function sendDriverPartOrderNotification(env, request, options = {}) {
  const probablePart = driverPartEmailPartName(request);
  const emailPreview = buildDriverPartOrderEmailPreview(env, request, options);

  if (!emailPreview.allowed) {
    return {
      status: "skipped",
      errorMessage: emailPreview.message,
      offerCount: emailPreview.offerCount,
      requiredOfferCount: emailPreview.requiredOfferCount,
      missingOfferCount: emailPreview.missingOfferCount
    };
  }

  return sendEmail(env, {
    type: "driver_part_order_email",
    to: emailPreview.to,
    cc: emailPreview.cc,
    subject: emailPreview.subject,
    html: emailPreview.html,
    relatedEntityId: request.id,
    recipientName: emailPreview.recipientName,
    fromName: "Smart odpady",
    moduleId: "driver-reports",
    relatedEntityType: "driver_part_request",
    messagePreview: `${cleanString(request.licensePlate)} – ${probablePart}`
  });
}

export async function sendDriverPartUrgentNotification(env, request, options = {}) {
  const recipientEmail = cleanString(options.recipientEmail || env.PARTS_PATRIK_EMAIL || env.PARTS_PATRICK_EMAIL || env.PATRICK_PARTS_EMAIL || env.PARTS_ORDER_EMAIL);
  const recipientName = cleanString(options.recipientName || "Patrik Ištvánek");
  const subject = `URGENTNÍ servisní hlášení: ${cleanString(request.licensePlate) || "SPZ"} – ${cleanString(request.defectDescription) || "bezpečnostní problém"}`;

  return sendEmail(env, {
    type: "driver_part_urgent_email",
    to: recipientEmail,
    subject,
    html: renderDriverPartUrgentEmail({
      request,
      ctaUrl: driverPartRequestUrl(env, request.id)
    }),
    relatedEntityId: request.id,
    recipientName,
    fromName: "Smart odpady",
    moduleId: "driver-reports",
    relatedEntityType: "driver_part_request",
    messagePreview: `${cleanString(request.licensePlate)} – urgentní servisní hlášení`
  });
}

export async function sendDriverPartServiceTechSms(env, request, options = {}) {
  const shortUrl = driverPartRequestUrl(env, request.id);
  const probablePart = cleanString(request.probablePart || request.verifiedPart) || "díl";
  const body = `Nové hlášení ND: ${cleanString(request.licensePlate)} – ${probablePart}. Patrik má díl ručně ověřit, nic nebylo objednáno. Detail: ${shortUrl}`;

  return sendSms(env, {
    type: "driver_part_service_tech_sms",
    to: cleanString(options.recipientPhone || env.SERVICE_TECH_PHONE || env.KAMIL_SERVICE_PHONE),
    body,
    relatedEntityId: request.id,
    recipientName: cleanString(options.recipientName || "Kamil"),
    moduleId: "driver-reports",
    relatedEntityType: "driver_part_request"
  });
}

export async function sendDriverPartReadySms(env, request) {
  const technician = cleanString(request.serviceTechnician);
  const technicianText = !technician || technician.toLowerCase() === "kamil" ? "Kamilovi" : technician;
  const body = `Díl pro vozidlo ${cleanString(request.licensePlate)} je připraven. Přistavte prosím vozidlo do dílny ke ${technicianText}: ${formatDate(request.serviceDate)} ${cleanString(request.serviceTime)}.`;

  return sendSms(env, {
    type: "driver_part_ready_driver_sms",
    to: request.driverPhone,
    body,
    relatedEntityId: request.id,
    recipientName: request.driverName,
    moduleId: "driver-reports",
    relatedEntityType: "driver_part_request"
  });
}

export async function sendAbsenceApprovalRequestNotification(env, request) {
  if (request.status !== "pending_approval") {
    return { status: "skipped", errorMessage: "Žádost není ve schvalovacím stavu." };
  }

  return sendEmail(env, {
    type: "absence_approval_request",
    to: request.managerEmail,
    subject: "Smart odpady – nová žádost ke schválení",
    html: renderApprovalEmail({
      title: "Smart odpady – nová žádost ke schválení",
      headline: "Nová žádost ke schválení",
      intro: "V systému Smart odpady čeká nová žádost na vaše rozhodnutí.",
      request,
      ctaUrl: approvalUrl(env)
    }),
    relatedEntityId: request.id,
    recipientName: request.managerName
  });
}

export async function sendAbsenceApprovalReminderNotification(env, request) {
  return sendEmail(env, {
    type: "absence_approval_reminder",
    to: request.managerEmail,
    subject: "Smart odpady – žádost čeká na schválení déle než 24 hodin",
    html: renderApprovalEmail({
      title: "Smart odpady – žádost čeká na schválení",
      headline: "Žádost čeká déle než 24 hodin",
      intro: `Dobrý den, ${request.managerName || "čeká na vás žádost"}, prosíme o kontrolu čekající žádosti.`,
      request,
      ctaUrl: approvalUrl(env)
    }),
    relatedEntityId: request.id,
    recipientName: request.managerName
  });
}

export async function sendAbsenceDecisionSms(env, request, decision) {
  const approved = decision === "approved";
  const reason = request.rejectionReason
    ? ` Důvod: ${request.rejectionReason}`
    : "";
  const body = approved
    ? `Smart odpady: Vaše žádost ${typeLabel(request)} ${formatRequestTerm(request)} byla schválena.`
    : `Smart odpady: Vaše žádost ${typeLabel(request)} ${formatRequestTerm(request)} byla zamítnuta.${reason}`;

  return sendSms(env, {
    type: approved ? "absence_approved_sms" : "absence_rejected_sms",
    to: request.employeePhone,
    body,
    relatedEntityId: request.id,
    recipientName: request.employeeName
  });
}

export async function sendAbsenceApprovalReminders(env, requests) {
  const results = [];

  for (const request of requests) {
    const result = await sendAbsenceApprovalReminderNotification(env, request);
    results.push({ requestId: request.id, ...result });

    if (result.status === "sent") {
      await markAbsenceReminderSent(env, request.id);
    }
  }

  return results;
}

export async function sendMedicalExamReminders(env, exams) {
  const results = [];

  for (const exam of exams) {
    const result = await sendMedicalExamReminderNotification(env, exam);
    results.push({ employeeId: exam.employeeId, examId: exam.id, ...result });

    if (result.status === "sent") {
      await markMedicalExamReminderSent(env, exam.id, exam.notificationKey);
    }
  }

  return results;
}

export async function sendCollectionRouteTestEmail(env, {
  to,
  run = {},
  stop = {},
  dispatchItemId = ""
} = {}) {
  const customerName = cleanString(stop.customerName || "Testovací zákazník");
  const stationName = cleanString(stop.stationName || "Testovací stanoviště");
  const address = cleanString(stop.addressText || "Brno");
  const routeDate = cleanString(run.routeDate || "neuvedeno");
  const vehicle = cleanString(run.vehicleLabel || run.vehicleRegistration || run.vehicleCode || "neuvedeno");
  const waste = cleanString(stop.wasteType || "neuvedeno");
  const container = stop.containerVolume
    ? `${Number(stop.containerCount || 1)}× ${Number(stop.containerVolume)} l`
    : "neuvedeno";
  const subject = `[TEST SVOZ] ${customerName} · ${routeDate}`;
  const messagePreview = `[TEST SVOZ] ${customerName}, ${stationName}, ${address}, ${waste}, ${container}.`;
  const html = `
    <!doctype html>
    <html lang="cs">
      <head><meta charset="utf-8"><title>${htmlEscape(subject)}</title></head>
      <body style="font-family:Arial,sans-serif;color:#1f2921;line-height:1.5;">
        <main style="max-width:640px;margin:0 auto;padding:24px;">
          <p style="display:inline-block;margin:0 0 20px;padding:6px 10px;border-radius:999px;background:#a92020;color:#fff;font-weight:700;">TESTOVACÍ ZPRÁVA</p>
          <h1 style="font-size:24px;margin:0 0 16px;">Test svozové trasy</h1>
          <p>Tato zpráva vznikla v oddělené sadě TEST Brno 501. Nejde o skutečného zákazníka ani skutečný svoz.</p>
          <dl>
            <dt style="font-weight:700;">Firma</dt><dd>${htmlEscape(customerName)}</dd>
            <dt style="font-weight:700;">Stanoviště</dt><dd>${htmlEscape(stationName)}</dd>
            <dt style="font-weight:700;">Adresa</dt><dd>${htmlEscape(address)}</dd>
            <dt style="font-weight:700;">Datum a vůz</dt><dd>${htmlEscape(routeDate)} · ${htmlEscape(vehicle)}</dd>
            <dt style="font-weight:700;">Odpad a nádoba</dt><dd>${htmlEscape(waste)} · ${htmlEscape(container)}</dd>
          </dl>
        </main>
      </body>
    </html>
  `;
  return sendEmail(env, {
    type: "collection_route_test_email",
    to: cleanString(to),
    subject,
    html,
    relatedEntityId: cleanString(dispatchItemId || stop.id),
    recipientName: "Radim · TEST Brno 501",
    fromName: "Kaiser servis · TEST SVOZ",
    moduleId: "collection-routes",
    relatedEntityType: "collection_route_test_notification",
    messagePreview
  });
}

export const __test = {
  emailRecipients,
  buildDriverPartOrderEmailPreview,
  driverPartOrderEmailOffers,
  driverPartOrderEmailReadiness,
  parseDriverPartOffers,
  renderDriverPartOrderEmail,
  sendGridFailureMessage
};
