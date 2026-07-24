const DB_BINDING = "SMART_ODPADY_DB";

function cleanString(value) {
  return String(value ?? "").trim();
}

function database(env) {
  const db = env?.[DB_BINDING];
  if (!db) throw new Error("Chybí D1 binding SMART_ODPADY_DB.");
  return db;
}

function nowIso() {
  return new Date().toISOString();
}

function idValue(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function syncRow(row = {}) {
  return {
    templateKey: cleanString(row.template_key),
    friendlyName: cleanString(row.friendly_name),
    contentSid: cleanString(row.content_sid),
    contentFingerprint: cleanString(row.content_fingerprint),
    syncStatus: cleanString(row.sync_status),
    errorMessage: cleanString(row.error_message),
    lastSyncedAt: cleanString(row.last_synced_at),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function dispatchRow(row = {}) {
  return {
    id: cleanString(row.id),
    idempotencyKey: cleanString(row.idempotency_key),
    eventId: cleanString(row.event_id),
    templateKey: cleanString(row.template_key),
    recipientMasked: cleanString(row.recipient_masked),
    recipientHash: cleanString(row.recipient_hash),
    contentSid: cleanString(row.content_sid),
    twilioMessageSid: cleanString(row.twilio_message_sid),
    requestedChannel: cleanString(row.requested_channel),
    usedChannel: cleanString(row.used_channel),
    status: cleanString(row.status),
    errorMessage: cleanString(row.error_message),
    actorUserId: cleanString(row.actor_user_id),
    actorName: cleanString(row.actor_name),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

export async function listRcsTemplateSyncRows(env) {
  const result = await database(env).prepare(`
    SELECT * FROM rcs_template_sync ORDER BY template_key
  `).all();
  return (result.results || []).map(syncRow);
}

export async function getRcsTemplateSyncRow(env, templateKey) {
  const row = await database(env).prepare(`
    SELECT * FROM rcs_template_sync WHERE template_key = ? LIMIT 1
  `).bind(cleanString(templateKey)).first();
  return row ? syncRow(row) : null;
}

export async function saveRcsTemplateSyncRow(env, input = {}) {
  const now = nowIso();
  await database(env).prepare(`
    INSERT INTO rcs_template_sync (
      template_key, friendly_name, content_sid, content_fingerprint,
      sync_status, error_message, last_synced_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(template_key) DO UPDATE SET
      friendly_name = excluded.friendly_name,
      content_sid = excluded.content_sid,
      content_fingerprint = excluded.content_fingerprint,
      sync_status = excluded.sync_status,
      error_message = excluded.error_message,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `).bind(
    cleanString(input.templateKey),
    cleanString(input.friendlyName),
    cleanString(input.contentSid) || null,
    cleanString(input.contentFingerprint) || null,
    cleanString(input.syncStatus || "error"),
    cleanString(input.errorMessage) || null,
    cleanString(input.lastSyncedAt) || now,
    now,
    now
  ).run();
  return getRcsTemplateSyncRow(env, input.templateKey);
}

export async function acquireRcsTemplateSyncLock(env) {
  const db = database(env);
  const staleBefore = new Date(Date.now() - (10 * 60 * 1000)).toISOString();
  await db.prepare(`
    DELETE FROM rcs_template_sync_locks
    WHERE lock_name = 'twilio-content-sync' AND acquired_at < ?
  `).bind(staleBefore).run();
  const result = await db.prepare(`
    INSERT OR IGNORE INTO rcs_template_sync_locks (lock_name, acquired_at)
    VALUES ('twilio-content-sync', ?)
  `).bind(nowIso()).run();
  return Number(result?.meta?.changes ?? result?.changes ?? 0) > 0;
}

export async function releaseRcsTemplateSyncLock(env) {
  await database(env).prepare(`
    DELETE FROM rcs_template_sync_locks WHERE lock_name = 'twilio-content-sync'
  `).run();
}

export async function reserveRcsDispatch(env, input = {}) {
  const db = database(env);
  const id = idValue("rcs-dispatch");
  const now = nowIso();
  const result = await db.prepare(`
    INSERT OR IGNORE INTO rcs_message_dispatches (
      id, idempotency_key, event_id, template_key, recipient_masked,
      recipient_hash, content_sid, requested_channel, used_channel,
      status, error_message, actor_user_id, actor_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'rcs', 'rcs_sms_auto_fallback', 'reserved', NULL, ?, ?, ?, ?)
  `).bind(
    id,
    cleanString(input.idempotencyKey),
    cleanString(input.eventId),
    cleanString(input.templateKey),
    cleanString(input.recipientMasked),
    cleanString(input.recipientHash),
    cleanString(input.contentSid),
    cleanString(input.actorUserId) || null,
    cleanString(input.actorName) || null,
    now,
    now
  ).run();
  const created = Number(result?.meta?.changes ?? result?.changes ?? 0) > 0;
  const row = created
    ? await db.prepare("SELECT * FROM rcs_message_dispatches WHERE id = ?").bind(id).first()
    : await db.prepare("SELECT * FROM rcs_message_dispatches WHERE idempotency_key = ?").bind(cleanString(input.idempotencyKey)).first();
  return { created, dispatch: dispatchRow(row) };
}

export async function updateRcsDispatch(env, id, patch = {}) {
  const now = nowIso();
  await database(env).prepare(`
    UPDATE rcs_message_dispatches
    SET content_sid = COALESCE(?, content_sid),
        twilio_message_sid = COALESCE(?, twilio_message_sid),
        used_channel = COALESCE(?, used_channel),
        status = COALESCE(?, status),
        error_message = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    cleanString(patch.contentSid) || null,
    cleanString(patch.twilioMessageSid) || null,
    cleanString(patch.usedChannel) || null,
    cleanString(patch.status) || null,
    cleanString(patch.errorMessage) || null,
    now,
    cleanString(id)
  ).run();
}

export async function updateRcsDispatchByTwilioSid(env, twilioMessageSid, patch = {}) {
  const sid = cleanString(twilioMessageSid);
  if (!sid) return { matched: false };
  const db = database(env);
  const row = await db.prepare(`
    SELECT * FROM rcs_message_dispatches WHERE twilio_message_sid = ? LIMIT 1
  `).bind(sid).first();
  if (!row?.id) return { matched: false };
  await updateRcsDispatch(env, row.id, patch);
  return { matched: true, dispatch: dispatchRow(row) };
}

export async function listRcsDispatches(env, limit = 50) {
  const result = await database(env).prepare(`
    SELECT * FROM rcs_message_dispatches ORDER BY created_at DESC LIMIT ?
  `).bind(Math.max(1, Math.min(Number(limit || 50), 100))).all();
  return (result.results || []).map(dispatchRow);
}
