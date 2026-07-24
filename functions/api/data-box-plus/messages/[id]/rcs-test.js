import { json, requireUserPermission } from "../../../../_lib/auth.js";
import { notifyNewDataBoxMessage } from "../../../../_lib/data-box-rcs-notifications.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

export async function onRequestPost({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  if (cleanString(body.confirm) !== "send-radim-rcs-test") {
    return json({ error: "Chybí výslovné potvrzení testovacího RCS." }, 400);
  }

  const db = env?.SMART_ODPADY_DB;
  if (!db) return json({ error: "Chybí produkční D1 binding." }, 503);

  const messageId = cleanString(params.id);
  const message = await db.prepare(`
    SELECT
      m.id,
      m.direction,
      m.sender_name,
      m.subject,
      COALESCE(m.delivered_at, m.received_at) AS delivered_at,
      COALESCE(b.name, b.company, 'Datová schránka') AS mailbox_name
    FROM data_box_plus_messages m
    LEFT JOIN data_box_plus_mailboxes b ON b.id = m.mailbox_id
    WHERE m.id = ? AND m.direction = 'received'
    LIMIT 1
  `).bind(messageId).first();
  if (!message?.id) return json({ error: "Příchozí datová zpráva nebyla nalezena." }, 404);

  const [result] = await notifyNewDataBoxMessage(env, {
    messageId: message.id,
    direction: message.direction,
    mailboxName: message.mailbox_name,
    senderName: message.sender_name,
    subject: message.subject,
    deliveredAt: message.delivered_at
  }, {
    recipientKeys: ["radim-oplustil"]
  });

  if (!result) return json({ error: "Radim Opluštil není povolený testovací příjemce." }, 409);
  return json({
    apiStatus: "ready",
    sent: result.sent === true,
    duplicate: result.duplicate === true,
    status: result.status,
    providerMessageId: result.providerMessageId || "",
    errorCode: result.errorCode || "",
    errorMessage: result.errorMessage || ""
  }, result.sent ? 202 : 200);
}
