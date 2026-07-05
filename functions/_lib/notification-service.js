import { normalizeIdentifier } from "./auth.js";
import { markAbsenceReminderSent } from "./absence-requests-store.js";
import { markMedicalExamReminderSent } from "./medical-exams-store.js";

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
        note: cleanString(offer.note || offer.relevanceNote)
      }))
      .filter((offer) => offer.title || offer.price || offer.seller || offer.url)
      .slice(0, 3);
  } catch {
    return [];
  }
}

function driverPartOrderEmailOffers(request = {}) {
  return parseDriverPartOffers(request.priceBoostResultJson)
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
  return cleanString(env.APP_BASE_URL) || "https://kaiser-control-center.pages.dev";
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
    missing.push("TWILIO_ACCOUNT_SID");
  }

  if (!authToken) {
    missing.push("TWILIO_AUTH_TOKEN");
  }

  if (!messagingServiceSid) {
    missing.push("TWILIO_MESSAGING_SERVICE_SID");
  }

  return `Telefon pro ${recipientLabel(recipientName)} je vyplněný, ale chybí produkční nastavení SMS: ${missing.join(", ")}.`;
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
  const probablePart = cleanString(request.probablePart || request.verifiedPart) || "čeká na identifikaci";
  const brand = cleanString(request.vehicleBrandLabel || request.vehicleBrand) || "jiné";
  const oePartNumber = cleanString(request.oePartNumber || request.partOrderNumber) || "čeká na ověření";
  const partName = cleanString(request.partName || request.verifiedPart) || "čeká na ověření";
  const verificationSource = cleanString(request.partVerificationSource) || "čeká na ověření";
  const verificationStatus = cleanString(request.partVerificationStatus || request.partIdentificationStatus) || "čeká na ověření";
  const providerMessage = cleanString(request.partsProviderMessage)
    || "Pilotní návrh AI Boost. Nic nebylo objednáno. Prosím ručně ověřit OE číslo a dostupnost před nákupem.";
  const offers = driverPartOrderEmailOffers(request);
  const priceBoostFallback = cleanString(request.priceBoostNote)
    || "AI Boost zatím nedodal 3 bezpečně relevantní nabídky s odkazy. Nic nebylo objednáno.";
  const offersHtml = offers.length
    ? `
              <h2 style="margin:26px 0 12px 0;font-size:22px;line-height:28px;font-weight:800;color:#1f2921;">Cenový průzkum</h2>
              <ol style="margin:0 0 24px 22px;padding:0;font-size:15px;line-height:23px;color:#1f2921;">
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
              <p style="margin:0 0 24px 0;font-size:15px;line-height:23px;color:#647064;">${htmlEscape(priceBoostFallback)}</p>`;
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
              <p style="margin:0 0 26px 0;font-size:18px;line-height:28px;font-weight:600;color:#647064;">Patriku, prosím ručně ověř náhradní díl před případným nákupem. Pilot AI Boost nic neobjednal.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fbf4;border:1px solid #dfe8d9;border-radius:14px;margin:0 0 24px 0;">
                <tr><td style="padding:20px 22px;font-size:16px;line-height:24px;">
                  <p style="margin:0 0 10px 0;"><strong>Řidič:</strong> ${htmlEscape(request.driverName)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Telefon:</strong> ${htmlEscape(request.driverPhone || "neuvedeno")}</p>
                  <p style="margin:0 0 10px 0;"><strong>Vozidlo:</strong> ${htmlEscape(request.vehicleName || request.licensePlate)}</p>
                  <p style="margin:0 0 10px 0;"><strong>SPZ:</strong> ${htmlEscape(request.licensePlate)}</p>
                  <p style="margin:0 0 10px 0;"><strong>VIN:</strong> ${htmlEscape(vin)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Značka:</strong> ${htmlEscape(brand)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Závada:</strong> ${htmlEscape(request.defectDescription)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Fotka poškození:</strong> ${htmlEscape(damagePhoto)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Pravděpodobný díl:</strong> ${htmlEscape(probablePart)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Strana dílu:</strong> ${htmlEscape(side)}</p>
                  <p style="margin:0 0 10px 0;"><strong>OE číslo:</strong> ${htmlEscape(oePartNumber)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Název dílu:</strong> ${htmlEscape(partName)}</p>
                  <p style="margin:0 0 10px 0;"><strong>Zdroj ověření:</strong> ${htmlEscape(verificationSource)}</p>
                  <p style="margin:0;"><strong>Stav ověření:</strong> ${htmlEscape(verificationStatus)}</p>
                </td></tr>
              </table>
              ${offersHtml}
              <a href="${htmlEscape(ctaUrl)}" style="display:block;text-align:center;background:#75bd25;border-radius:14px;padding:18px 24px;color:#ffffff;font-size:18px;line-height:24px;font-weight:800;text-decoration:none;">Otevřít detail hlášení</a>
              <p style="margin:18px 0 0 0;font-size:15px;line-height:23px;color:#647064;">${htmlEscape(providerMessage)}</p>
              <p style="margin:12px 0 0 0;font-size:15px;line-height:23px;font-weight:700;color:#1f2921;">Pilotní návrh AI Boost. Nic nebylo objednáno. Prosím ručně ověřit před nákupem.</p>
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
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          now
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
  messagePreview = ""
}) {
  const replyTo = cleanString(env.EMAIL_REPLY_TO);
  const apiKey = cleanString(env.SENDGRID_API_KEY || env.EMAIL_API_KEY);
  const provider = cleanString(env.EMAIL_PROVIDER || (apiKey ? "sendgrid" : "")).toLowerCase();
  const from = cleanString(env.EMAIL_FROM || env.ABSENCE_REPORT_EMAIL);
  const cleanRecipientName = cleanString(recipientName);
  const ccRecipients = emailRecipients(cc).filter((email) => email.toLowerCase() !== cleanString(to).toLowerCase());
  const recipientForLog = [to, ccRecipients.length ? `cc: ${ccRecipients.join(", ")}` : ""].filter(Boolean).join(" | ");

  if (!to || provider !== "sendgrid" || !from || !apiKey) {
    const missing = !to
      ? cleanRecipientName
        ? `Chybí e-mail příjemce: ${cleanRecipientName}.`
        : "Chybí příjemce e-mailu."
      : missingEmailSettingsMessage({ provider, from, apiKey, recipientName: cleanRecipientName });
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
      errorMessage: missing
    });
    return { status: "skipped", errorMessage: missing, recipientName: cleanRecipientName, cc: ccRecipients };
  }

  try {
    const personalization = { to: [{ email: to }] };
    if (ccRecipients.length) {
      personalization.cc = ccRecipients.map((email) => ({ email }));
    }

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [personalization],
        from: { email: from, name: cleanString(fromName) || "Smart odpady" },
        reply_to: replyTo ? { email: replyTo } : undefined,
        subject,
        content: [{ type: "text/html", value: html }]
      })
    });

    if (!response.ok) {
      throw new Error(`SendGrid ${response.status}`);
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
      providerMessageId: response.headers.get("x-message-id") || "",
      messagePreview
    });
    return { status: "sent", recipientName: cleanRecipientName, cc: ccRecipients };
  } catch (error) {
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
      messagePreview,
      errorMessage: error.message
    });
    return { status: "failed", errorMessage: error.message, recipientName: cleanRecipientName, cc: ccRecipients };
  }
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
  const accountSid = cleanString(env.TWILIO_ACCOUNT_SID);
  const authToken = cleanString(env.TWILIO_AUTH_TOKEN);
  const messagingServiceSid = cleanString(env.TWILIO_MESSAGING_SERVICE_SID);
  const normalizedTo = normalizeIdentifier(to);
  const cleanRecipientName = cleanString(recipientName);

  if (!normalizedTo || !accountSid || !authToken || !messagingServiceSid) {
    const missing = !normalizedTo
      ? cleanRecipientName
        ? `Chybí telefon příjemce: ${cleanRecipientName}.`
        : "Chybí telefon příjemce."
      : missingSmsSettingsMessage({ accountSid, authToken, messagingServiceSid, recipientName: cleanRecipientName });
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
        Body: body
      })
    });

    const responsePayload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(`Twilio ${response.status}`);
    }

    await logNotification(env, {
      moduleId,
      type,
      channel: "sms",
      recipient: normalizedTo,
      relatedEntityType,
      relatedEntityId,
      status: "sent",
      provider: "Twilio",
      providerMessageId: cleanString(responsePayload.sid),
      messagePreview: body
    });
    return { status: "sent", recipientName: cleanRecipientName };
  } catch (error) {
    await logNotification(env, {
      moduleId,
      type,
      channel: "sms",
      recipient: normalizedTo,
      relatedEntityType,
      relatedEntityId,
      status: "failed",
      provider: "Twilio",
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
  const ctaUrl = `${appBaseUrl(env).replace(/\/+$/, "")}/datova-schranka?message=${encodeURIComponent(cleanString(message?.id))}`;

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
    moduleId: "data-box",
    relatedEntityType: "data_box_message",
    messagePreview: title
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
  const probablePart = cleanString(request.probablePart || request.verifiedPart) || "náhradní díl";
  const subject = `Náhradní díl k ověření: ${cleanString(request.licensePlate) || "SPZ"} – ${probablePart}`;
  const readiness = driverPartOrderEmailReadiness(request);

  if (!readiness.allowed) {
    return {
      status: "skipped",
      errorMessage: readiness.message,
      offerCount: readiness.offerCount,
      requiredOfferCount: readiness.requiredOfferCount,
      missingOfferCount: readiness.missingOfferCount
    };
  }

  return sendEmail(env, {
    type: "driver_part_order_email",
    to: cleanString(options.recipientEmail || env.PARTS_PATRIK_EMAIL || env.PARTS_PATRICK_EMAIL || env.PATRICK_PARTS_EMAIL || env.PARTS_ORDER_EMAIL),
    cc: cleanString(options.ccEmail || env.PARTS_PILOT_CC_EMAIL || "oplustil@kaiserservis.cz"),
    subject,
    html: renderDriverPartOrderEmail({
      request,
      ctaUrl: driverPartRequestUrl(env, request.id),
      patrikUrl: patrikProfileUrl(env)
    }),
    relatedEntityId: request.id,
    recipientName: cleanString(options.recipientName || "Patrik Ištvánek"),
    fromName: "Smart odpady",
    moduleId: "driver-reports",
    relatedEntityType: "driver_part_request",
    messagePreview: `${cleanString(request.licensePlate)} – ${probablePart}`
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

export const __test = {
  emailRecipients,
  driverPartOrderEmailOffers,
  driverPartOrderEmailReadiness,
  parseDriverPartOffers
};
