const text = (value) => String(value ?? "").trim();

// Reuse only complete, unchanged envelopes. Incomplete attachments and a newly
// accepted delivery must pass through the normal import again.
export function canReuseSyncedMessage(existing, message) {
  if (!existing?.id) return false;
  if (!["Dostupná", "Stažená", "Text načtený"].includes(text(existing.attachment_status))) return false;
  if (message.hasAttachments && text(existing.attachment_status) === "Dostupná") return false;
  const envelope = {
    isds_message_id: message.isdsMessageId,
    direction: message.direction,
    sender_name: message.senderName,
    sender_box_id: message.senderBoxId,
    recipient_name: message.recipientName,
    recipient_box_id: message.recipientBoxId,
    subject: message.subject,
    delivered_at: message.deliveredAt,
    received_at: message.acceptedAt || message.deliveredAt
  };
  return Object.entries(envelope).every(([key, value]) => text(existing[key]) === text(value));
}

export const syncMessageKey = (id, direction) => `${text(direction)}:${text(id)}`;

export async function loadSyncMessageRows(db, mailboxId, messages) {
  const ids = [...new Set(messages.map((message) => text(message.isdsMessageId)).filter(Boolean))];
  const rows = new Map();
  // Keep below D1's per-statement bind limit, including the mailbox binding.
  for (let offset = 0; offset < ids.length; offset += 80) {
    const batch = ids.slice(offset, offset + 80);
    const result = await db.prepare(`
      SELECT * FROM data_box_plus_messages
      WHERE mailbox_id = ? AND isds_message_id IN (${batch.map(() => "?").join(",")})
    `).bind(mailboxId, ...batch).all();
    for (const row of result.results || []) rows.set(syncMessageKey(row.isds_message_id, row.direction), row);
  }
  return rows;
}
