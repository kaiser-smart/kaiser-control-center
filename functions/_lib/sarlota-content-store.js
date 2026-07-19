function clean(value) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

function resultRows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export function contentDocumentId(assistantKey, kind) {
  return `sarlota-content-${clean(assistantKey).toLowerCase()}-${clean(kind).toLowerCase().replaceAll("_", "-")}`;
}

export async function getSarlotaContentDocument(db, assistantKey, kind) {
  return db.prepare(`
    SELECT id, assistant_key, content_kind, title, draft_content, draft_fingerprint,
           draft_base_live_fingerprint, draft_status, created_by, updated_by, created_at, updated_at
    FROM sarlota_content_documents
    WHERE assistant_key = ? AND content_kind = ?
    LIMIT 1
  `).bind(clean(assistantKey), clean(kind)).first();
}

export async function saveSarlotaContentDraft(db, {
  assistantKey,
  kind,
  title,
  content,
  fingerprint,
  baseLiveFingerprint,
  actorId,
  status = "draft"
}) {
  const id = contentDocumentId(assistantKey, kind);
  const timestamp = nowIso();
  await db.prepare(`
    INSERT INTO sarlota_content_documents (
      id, assistant_key, content_kind, title, draft_content, draft_fingerprint,
      draft_base_live_fingerprint, draft_status, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(assistant_key, content_kind) DO UPDATE SET
      title = excluded.title,
      draft_content = excluded.draft_content,
      draft_fingerprint = excluded.draft_fingerprint,
      draft_base_live_fingerprint = excluded.draft_base_live_fingerprint,
      draft_status = excluded.draft_status,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).bind(
    id,
    clean(assistantKey),
    clean(kind),
    clean(title),
    String(content ?? ""),
    clean(fingerprint),
    clean(baseLiveFingerprint),
    clean(status) || "draft",
    clean(actorId),
    clean(actorId),
    timestamp,
    timestamp
  ).run();
  return getSarlotaContentDocument(db, assistantKey, kind);
}

export async function listSarlotaContentVersions(db, documentId, limit = 12) {
  const result = await db.prepare(`
    SELECT id, document_id, assistant_key, content_kind, version_number,
           content_fingerprint, source, note, created_by, created_at,
           length(content) AS content_length
    FROM sarlota_content_versions
    WHERE document_id = ?
    ORDER BY version_number DESC
    LIMIT ?
  `).bind(clean(documentId), Math.max(1, Math.min(Number(limit) || 12, 30))).all();
  return resultRows(result);
}

export async function getSarlotaContentVersion(db, documentId, versionId) {
  return db.prepare(`
    SELECT id, document_id, assistant_key, content_kind, version_number, content,
           content_fingerprint, source, note, created_by, created_at
    FROM sarlota_content_versions
    WHERE document_id = ? AND id = ?
    LIMIT 1
  `).bind(clean(documentId), clean(versionId)).first();
}

export async function createSarlotaContentVersion(db, {
  documentId,
  assistantKey,
  kind,
  content,
  fingerprint,
  source,
  note,
  actorId
}) {
  const current = await db.prepare(`
    SELECT COALESCE(MAX(version_number), 0) AS max_version
    FROM sarlota_content_versions
    WHERE document_id = ?
  `).bind(clean(documentId)).first();
  const versionNumber = Number(current?.max_version || 0) + 1;
  const id = randomId("sarlota-version");
  await db.prepare(`
    INSERT INTO sarlota_content_versions (
      id, document_id, assistant_key, content_kind, version_number, content,
      content_fingerprint, source, note, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    clean(documentId),
    clean(assistantKey),
    clean(kind),
    versionNumber,
    String(content ?? ""),
    clean(fingerprint),
    clean(source),
    clean(note),
    clean(actorId),
    nowIso()
  ).run();
  return { id, versionNumber };
}

export async function recordSarlotaContentAudit(db, {
  documentId,
  assistantKey,
  kind,
  action,
  actorId,
  actorEmail,
  beforeFingerprint = "",
  afterFingerprint = "",
  metadata = {}
}) {
  await db.prepare(`
    INSERT INTO sarlota_content_audit_log (
      id, document_id, assistant_key, content_kind, action, actor_id, actor_email,
      before_fingerprint, after_fingerprint, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    randomId("sarlota-audit"),
    clean(documentId),
    clean(assistantKey),
    clean(kind),
    clean(action),
    clean(actorId),
    clean(actorEmail).toLowerCase(),
    clean(beforeFingerprint),
    clean(afterFingerprint),
    JSON.stringify(metadata || {}),
    nowIso()
  ).run();
}
