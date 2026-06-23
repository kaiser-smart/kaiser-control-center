import { normalizeIdentifier } from "./auth.js";
import { markAbsenceReminderSent } from "./absence-requests-store.js";

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
  compensatory_leave: "Náhradní volno"
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
                  <p style="margin:0 0 10px 0;"><strong>Termín:</strong> ${htmlEscape(formatDate(request.dateFrom))} - ${htmlEscape(formatDate(request.dateTo))}</p>
                  <p style="margin:0 0 10px 0;"><strong>Počet dnů:</strong> ${htmlEscape(request.daysCount)}</p>
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

async function sendEmail(env, { type, to, subject, html, relatedEntityId, recipientName = "" }) {
  const replyTo = cleanString(env.EMAIL_REPLY_TO);
  const apiKey = cleanString(env.SENDGRID_API_KEY || env.EMAIL_API_KEY);
  const provider = cleanString(env.EMAIL_PROVIDER || (apiKey ? "sendgrid" : "")).toLowerCase();
  const from = cleanString(env.EMAIL_FROM || env.ABSENCE_REPORT_EMAIL);
  const cleanRecipientName = cleanString(recipientName);

  if (!to || provider !== "sendgrid" || !from || !apiKey) {
    const missing = !to
      ? cleanRecipientName
        ? `Chybí e-mail příjemce: ${cleanRecipientName}.`
        : "Chybí příjemce e-mailu."
      : missingEmailSettingsMessage({ provider, from, apiKey, recipientName: cleanRecipientName });
    await logNotification(env, {
      type,
      channel: "email",
      recipient: to,
      relatedEntityId,
      status: "skipped",
      subject,
      provider: "SendGrid",
      errorMessage: missing
    });
    return { status: "skipped", errorMessage: missing, recipientName: cleanRecipientName };
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: "Smart odpady" },
        reply_to: replyTo ? { email: replyTo } : undefined,
        subject,
        content: [{ type: "text/html", value: html }]
      })
    });

    if (!response.ok) {
      throw new Error(`SendGrid ${response.status}`);
    }

    await logNotification(env, {
      type,
      channel: "email",
      recipient: to,
      relatedEntityId,
      status: "sent",
      subject,
      provider: "SendGrid",
      providerMessageId: response.headers.get("x-message-id") || ""
    });
    return { status: "sent", recipientName: cleanRecipientName };
  } catch (error) {
    await logNotification(env, {
      type,
      channel: "email",
      recipient: to,
      relatedEntityId,
      status: "failed",
      subject,
      provider: "SendGrid",
      errorMessage: error.message
    });
    return { status: "failed", errorMessage: error.message, recipientName: cleanRecipientName };
  }
}

async function sendSms(env, { type, to, body, relatedEntityId, recipientName = "" }) {
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
      type,
      channel: "sms",
      recipient: normalizedTo || to,
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
      type,
      channel: "sms",
      recipient: normalizedTo,
      relatedEntityId,
      status: "sent",
      provider: "Twilio",
      providerMessageId: cleanString(responsePayload.sid),
      messagePreview: body
    });
    return { status: "sent", recipientName: cleanRecipientName };
  } catch (error) {
    await logNotification(env, {
      type,
      channel: "sms",
      recipient: normalizedTo,
      relatedEntityId,
      status: "failed",
      provider: "Twilio",
      messagePreview: body,
      errorMessage: error.message
    });
    return { status: "failed", errorMessage: error.message, recipientName: cleanRecipientName };
  }
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
    ? `Smart odpady: Vaše žádost ${typeLabel(request)} od ${formatDate(request.dateFrom)} do ${formatDate(request.dateTo)} byla schválena.`
    : `Smart odpady: Vaše žádost ${typeLabel(request)} od ${formatDate(request.dateFrom)} do ${formatDate(request.dateTo)} byla zamítnuta.${reason}`;

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
