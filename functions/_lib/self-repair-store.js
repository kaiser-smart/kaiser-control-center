import { targetForSelfRepairReport } from "./self-repair-targets.js";
import { hasPermission } from "../../src/permissions.js";
import {
  SELF_REPAIR_MONITOR_PROMPT_VERSION,
  SELF_REPAIR_MONITOR_TARGET_URL
} from "./self-repair-monitor-config.js";

const DB_BINDING = "SMART_ODPADY_DB";
const ATTACHMENTS_BUCKET_BINDING = "SMART_ODPADY_DOCUMENTS";
export const SELF_REPAIR_ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const SELF_REPAIR_ATTACHMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.txt,.log,.csv,.doc,.docx,.xls,.xlsx";
const SELF_REPAIR_ATTACHMENT_TYPES = new Map([
  ["pdf", "application/pdf"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["heic", "image/heic"],
  ["heif", "image/heif"],
  ["txt", "text/plain"],
  ["log", "text/plain"],
  ["csv", "text/csv"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
]);
const CASE_TYPES = new Set(["bug", "improvement"]);
const CASE_STATUSES = new Set([
  "new",
  "needs_details",
  "confirmed",
  "planned",
  "rejected",
  "duplicate",
  "closed"
]);
const PRIORITIES = new Set(["Nízká", "Běžná", "Důležitá", "Kritická"]);
const RISK_LEVELS = new Set(["unclassified", "green", "orange", "red"]);
const TERMINAL_STATUSES = new Set(["rejected", "duplicate", "closed"]);

const FEEDBACK_STATUS_FOR_CASE = Object.freeze({
  new: "Nová",
  needs_details: "Převzato",
  confirmed: "V řešení",
  planned: "V řešení",
  rejected: "Zamítnuto",
  duplicate: "Archiv",
  closed: "Hotovo"
});

export const SELF_REPAIR_CASE_TYPE_LABELS = Object.freeze({
  bug: "Chyba",
  improvement: "Drobná úprava"
});

export const SELF_REPAIR_CASE_STATUS_LABELS = Object.freeze({
  new: "Nové",
  needs_details: "Čeká na doplnění",
  confirmed: "Potvrzeno",
  planned: "Připraveno k opravě",
  rejected: "Zamítnuto",
  duplicate: "Duplicitní",
  closed: "Uzavřeno"
});

export const SELF_REPAIR_RISK_LABELS = Object.freeze({
  unclassified: "Nezatříděno",
  green: "Nízké riziko",
  orange: "Vyžaduje kontrolu",
  red: "Vysoké riziko"
});

export class SelfRepairStoreError extends Error {
  constructor(message, status = 400, code = "self_repair_store_error") {
    super(message);
    this.name = "SelfRepairStoreError";
    this.status = status;
    this.code = code;
  }
}

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new SelfRepairStoreError(
      "Databáze Samooprav není nastavená. Chybí D1 binding SMART_ODPADY_DB.",
      503,
      "self_repair_database_missing"
    );
  }
  return db;
}

function attachmentsBucket(env, required = false) {
  const bucket = env?.[ATTACHMENTS_BUCKET_BINDING] || null;
  if (!bucket && required) {
    throw new SelfRepairStoreError(
      "Úložiště příloh není nastavené. Chybí R2 binding SMART_ODPADY_DOCUMENTS.",
      503,
      "self_repair_attachment_storage_missing"
    );
  }
  return bucket;
}

export function selfRepairApiStatus(env) {
  return database(env) ? "ready" : "waiting";
}

function cleanText(value, maxLength = 4000) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function nullableText(value, maxLength) {
  const cleaned = cleanText(value, maxLength);
  return cleaned || null;
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function feedbackCaseNumber(caseId, createdAt) {
  const date = cleanText(createdAt, 40).slice(0, 10).replaceAll("-", "");
  const suffix = cleanText(caseId, 200)
    .replace(/^self-repair-case-/, "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 6)
    .toUpperCase();
  return `KSO-${date || "CASE"}-${suffix || stableHash(caseId).slice(0, 6).toUpperCase()}`;
}

function safeAttachmentFilename(value) {
  return cleanText(value, 240)
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
}

function attachmentExtension(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return String(match?.[1] || "").toLowerCase();
}

async function attachmentChecksum(bytes) {
  if (!globalThis.crypto?.subtle) {
    throw new SelfRepairStoreError(
      "Přílohu nelze bezpečně ověřit.",
      503,
      "self_repair_attachment_checksum_unavailable"
    );
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function normalizeSelfRepairAttachment(file) {
  if (!file) return null;
  if (typeof file.arrayBuffer !== "function") {
    throw new SelfRepairStoreError("Vyberte platnou přílohu.", 400, "self_repair_attachment_invalid");
  }

  const filename = safeAttachmentFilename(file.name);
  const sizeBytes = Number(file.size || 0);
  if (!filename && sizeBytes === 0) return null;
  if (!filename || sizeBytes <= 0) {
    throw new SelfRepairStoreError("Příloha je prázdná.", 400, "self_repair_attachment_empty");
  }
  if (sizeBytes > SELF_REPAIR_ATTACHMENT_MAX_SIZE_BYTES) {
    throw new SelfRepairStoreError("Příloha může mít nejvýše 10 MB.", 413, "self_repair_attachment_too_large");
  }

  const extension = attachmentExtension(filename);
  const canonicalType = SELF_REPAIR_ATTACHMENT_TYPES.get(extension);
  if (!canonicalType) {
    throw new SelfRepairStoreError(
      "Nepovolený typ přílohy. Použijte PDF, obrázek, text, Word nebo Excel.",
      415,
      "self_repair_attachment_type_invalid"
    );
  }

  const declaredType = cleanText(file.type, 160).toLowerCase();
  if (declaredType && declaredType !== "application/octet-stream" && declaredType !== canonicalType) {
    const jpegAlias = extension === "jpg" || extension === "jpeg";
    const textAlias = ["txt", "log", "csv"].includes(extension) && declaredType === "text/plain";
    if (!jpegAlias || declaredType !== "image/jpeg") {
      if (!textAlias) {
        throw new SelfRepairStoreError(
          "Typ přílohy neodpovídá názvu souboru.",
          415,
          "self_repair_attachment_content_type_mismatch"
        );
      }
    }
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== sizeBytes) {
    throw new SelfRepairStoreError("Přílohu se nepodařilo načíst celou.", 400, "self_repair_attachment_size_mismatch");
  }

  return {
    filename,
    contentType: canonicalType,
    sizeBytes,
    bytes,
    checksumSha256: await attachmentChecksum(bytes)
  };
}

function attachmentStorageKey(caseId, attachmentId, filename) {
  const safeName = safeAttachmentFilename(filename).replace(/[^a-zA-Z0-9._-]+/g, "-") || "priloha";
  return `self-repair/${caseId}/${attachmentId}-${safeName}`;
}

function rowToAttachment(row) {
  if (!row) return null;
  const caseId = cleanText(row.case_id, 200);
  const id = cleanText(row.id, 200);
  return {
    id,
    caseId,
    feedbackId: cleanText(row.feedback_id, 200),
    filename: cleanText(row.file_name, 240),
    contentType: cleanText(row.content_type, 160),
    sizeBytes: Math.max(0, Number(row.size_bytes || 0)),
    checksumSha256: cleanText(row.checksum_sha256, 128),
    uploadedByUserId: cleanText(row.uploaded_by_user_id, 200),
    createdAt: cleanText(row.created_at, 80),
    openUrl: `/api/self-repair/cases/${encodeURIComponent(caseId)}/attachments/${encodeURIComponent(id)}`
  };
}

function normalizeEnum(value, allowed, fallback) {
  const cleaned = cleanText(value, 80).toLowerCase();
  return allowed.has(cleaned) ? cleaned : fallback;
}

export function normalizeSelfRepairCaseType(value) {
  return normalizeEnum(value, CASE_TYPES, "bug");
}

export function normalizeSelfRepairCaseStatus(value, fallback = "new") {
  const normalized = normalizeEnum(value, CASE_STATUSES, "");
  if (!normalized) {
    throw new SelfRepairStoreError("Vyberte platný stav případu.", 400, "self_repair_status_invalid");
  }
  return normalized || fallback;
}

export function normalizeSelfRepairRisk(value, fallback = "unclassified") {
  const normalized = normalizeEnum(value, RISK_LEVELS, "");
  if (!normalized) {
    throw new SelfRepairStoreError("Vyberte platnou úroveň rizika.", 400, "self_repair_risk_invalid");
  }
  return normalized || fallback;
}

export function normalizeSelfRepairPriority(value) {
  const cleaned = cleanText(value, 40);
  return PRIORITIES.has(cleaned) ? cleaned : "Běžná";
}

export function sanitizeSelfRepairSourceRoute(value) {
  const cleaned = cleanText(value, 600);
  if (!cleaned || !cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.includes("\\")) {
    return "";
  }

  try {
    const parsed = new URL(cleaned, "https://smart-odpady.invalid");
    if (parsed.origin !== "https://smart-odpady.invalid") return "";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, 600);
  } catch {
    return "";
  }
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fingerprintText(value) {
  return cleanText(value, 3000)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function selfRepairFingerprint(input = {}) {
  const source = [
    cleanText(input.moduleKey, 100),
    normalizeSelfRepairCaseType(input.caseType),
    fingerprintText(input.title),
    fingerprintText(input.actualBehavior || input.description)
  ].join("|");

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `sha256:${hex}`;
  }

  return `fnv1a32:${stableHash(source)}`;
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function safeJson(value, fallback = null) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function dbError(error) {
  const message = cleanText(error?.message, 1000);
  if (message.includes("no such table")) {
    return new SelfRepairStoreError(
      "Tabulky Samooprav nejsou v D1 připravené. Je nutné nejprve spustit poslední schválené migrace Samooprav.",
      503,
      "self_repair_migration_missing"
    );
  }

  console.error("self_repair.store_failed", { message });
  return new SelfRepairStoreError(
    "Případy Samooprav se teď nepodařilo načíst nebo uložit.",
    500,
    "self_repair_store_failed"
  );
}

function rowToCase(row) {
  if (!row) return null;
  const status = CASE_STATUSES.has(cleanText(row.status, 80)) ? cleanText(row.status, 80) : "new";
  const riskLevel = RISK_LEVELS.has(cleanText(row.risk_level, 80)) ? cleanText(row.risk_level, 80) : "unclassified";
  const caseType = CASE_TYPES.has(cleanText(row.case_type, 80)) ? cleanText(row.case_type, 80) : "bug";

  return {
    id: cleanText(row.id, 200),
    caseNumber: cleanText(row.case_number, 80) || feedbackCaseNumber(row.id, row.created_at),
    feedbackId: cleanText(row.feedback_id, 200),
    source: cleanText(row.source, 80),
    caseType,
    caseTypeLabel: SELF_REPAIR_CASE_TYPE_LABELS[caseType],
    status,
    statusLabel: SELF_REPAIR_CASE_STATUS_LABELS[status],
    priority: normalizeSelfRepairPriority(row.priority),
    riskLevel,
    riskLabel: SELF_REPAIR_RISK_LABELS[riskLevel],
    moduleKey: cleanText(row.module_key, 100),
    moduleName: cleanText(row.module_name, 200),
    targetRepoKey: cleanText(row.target_repo_key, 200),
    targetProductionUrl: cleanText(row.target_production_url, 500),
    title: cleanText(row.title, 240),
    description: cleanText(row.description, 8000),
    expectedBehavior: cleanText(row.expected_behavior, 5000),
    actualBehavior: cleanText(row.actual_behavior, 5000),
    reproductionSteps: cleanText(row.reproduction_steps, 8000),
    sourceRoute: cleanText(row.source_route, 600),
    buildVersion: cleanText(row.build_version, 100),
    buildCommit: cleanText(row.build_commit, 160),
    browserInfo: cleanText(row.browser_info, 600),
    screenInfo: cleanText(row.screen_info, 300),
    technicalContext: parseJson(row.technical_context_json, {}),
    workflowStatus: cleanText(row.workflow_status, 80) || "new",
    assigneeUserId: cleanText(row.assignee_user_id, 200),
    assigneeUserName: cleanText(row.assignee_user_name, 240),
    publicMessage: cleanText(row.public_message, 8000),
    detailsQuestion: cleanText(row.details_question, 8000),
    resumeWorkflowStatus: cleanText(row.resume_workflow_status, 80) || "accepted",
    automationStatus: cleanText(row.automation_status, 80) || "not_evaluated",
    lastPublicUpdateAt: cleanText(row.last_public_update_at, 80),
    readyForVerificationAt: cleanText(row.ready_for_verification_at, 80),
    verifiedAt: cleanText(row.verified_at, 80),
    reporterUserId: cleanText(row.reporter_user_id, 200),
    reporterUserName: cleanText(row.reporter_user_name, 240),
    fingerprint: cleanText(row.fingerprint, 200),
    occurrenceCount: Math.max(1, Number(row.occurrence_count || 1)),
    firstSeenAt: cleanText(row.first_seen_at, 80),
    lastSeenAt: cleanText(row.last_seen_at, 80),
    triageSummary: cleanText(row.triage_summary, 5000),
    internalNote: cleanText(row.internal_note, 8000),
    createdAt: cleanText(row.created_at, 80),
    updatedAt: cleanText(row.updated_at, 80),
    updatedByUserId: cleanText(row.updated_by_user_id, 200)
  };
}

function rowToEvidence(row) {
  return {
    id: cleanText(row?.id, 200),
    caseId: cleanText(row?.case_id, 200),
    evidenceType: cleanText(row?.evidence_type, 80),
    label: cleanText(row?.label, 240),
    contentText: cleanText(row?.content_text, 10000),
    metadata: parseJson(row?.metadata_json, {}),
    createdByUserId: cleanText(row?.created_by_user_id, 200),
    createdAt: cleanText(row?.created_at, 80)
  };
}

function rowToAudit(row) {
  return {
    id: cleanText(row?.id, 200),
    caseId: cleanText(row?.case_id, 200),
    action: cleanText(row?.action, 100),
    changedByUserId: cleanText(row?.changed_by_user_id, 200),
    changedByUserName: cleanText(row?.changed_by_user_name, 240),
    changedAt: cleanText(row?.changed_at, 80),
    before: parseJson(row?.before_json, null),
    after: parseJson(row?.after_json, null),
    note: cleanText(row?.note, 2000)
  };
}

function reportFeedbackMessage(report) {
  const lines = [
    `[Samoopravy · ${SELF_REPAIR_CASE_TYPE_LABELS[report.caseType]}] ${report.title}`,
    "",
    report.description
  ];
  if (report.actualBehavior) lines.push("", `Skutečný stav: ${report.actualBehavior}`);
  if (report.expectedBehavior) lines.push("", `Očekávaný stav: ${report.expectedBehavior}`);
  if (report.reproductionSteps) lines.push("", `Postup: ${report.reproductionSteps}`);
  return lines.join("\n").slice(0, 12000);
}

function requireReportField(value, message, code, maxLength) {
  const cleaned = cleanText(value, maxLength);
  if (!cleaned) {
    throw new SelfRepairStoreError(message, 400, code);
  }
  return cleaned;
}

function normalizeUserReport(input, currentUser, target) {
  const reporterUserId = cleanText(currentUser?.id || currentUser?.email, 200);
  if (!reporterUserId) {
    throw new SelfRepairStoreError("Přihlášený uživatel nemá platnou identitu.", 401, "self_repair_user_missing");
  }

  return {
    source: "user_feedback",
    caseType: normalizeSelfRepairCaseType(input.caseType || input.type),
    status: "new",
    priority: normalizeSelfRepairPriority(input.priority),
    riskLevel: "unclassified",
    moduleKey: target.moduleKey,
    moduleName: target.moduleName,
    targetRepoKey: target.repoKey,
    targetProductionUrl: target.productionUrl,
    title: requireReportField(input.title, "Vyplňte stručný název problému.", "self_repair_title_required", 240),
    description: requireReportField(input.description, "Popište, co potřebujete opravit nebo upravit.", "self_repair_description_required", 8000),
    expectedBehavior: cleanText(input.expectedBehavior, 5000),
    actualBehavior: cleanText(input.actualBehavior, 5000),
    reproductionSteps: cleanText(input.reproductionSteps, 8000),
    sourceRoute: sanitizeSelfRepairSourceRoute(input.sourceRoute),
    buildVersion: cleanText(input.buildVersion, 100),
    buildCommit: cleanText(input.buildCommit, 160),
    browserInfo: cleanText(input.browserInfo, 600),
    screenInfo: cleanText(input.screenInfo, 300),
    technicalContext: typeof input.technicalContext === "string"
      ? parseJson(input.technicalContext, {})
      : input.technicalContext && typeof input.technicalContext === "object"
        ? input.technicalContext
        : {},
    clientRequestId: cleanText(input.clientRequestId, 200),
    reporterUserId,
    reporterUserName: cleanText(currentUser?.name || currentUser?.email || "Uživatel", 240)
  };
}

export async function createUserReportedSelfRepairCase(env, currentUser, input = {}, options = {}) {
  const db = database(env, true);
  const target = targetForSelfRepairReport(input.moduleKey || input.moduleId);
  if (!target) {
    throw new SelfRepairStoreError("Vyberte platný modul aplikace.", 400, "self_repair_module_invalid");
  }

  const preparedAttachment = await normalizeSelfRepairAttachment(options.attachment);
  const report = normalizeUserReport(input, currentUser, target);
  if (report.clientRequestId) {
    try {
      const existingRow = await db.prepare(`
        SELECT *
        FROM self_repair_cases
        WHERE client_request_id = ? AND reporter_user_id = ? AND source = 'user_feedback'
        LIMIT 1
      `).bind(report.clientRequestId, report.reporterUserId).first();
      if (existingRow) {
        return {
          case: rowToCase(existingRow),
          feedback: null,
          attachment: null,
          deduplicated: true
        };
      }
    } catch (error) {
      if (!cleanText(error?.message, 1000).includes("no such column")) throw error;
    }
  }
  const now = new Date().toISOString();
  const caseId = randomId("self-repair-case");
  const caseNumber = feedbackCaseNumber(caseId, now);
  const feedbackId = randomId("module-feedback");
  const evidenceId = randomId("self-repair-evidence");
  const auditId = randomId("self-repair-audit");
  const attachmentId = preparedAttachment ? randomId("self-repair-attachment") : "";
  const attachmentKey = preparedAttachment
    ? attachmentStorageKey(caseId, attachmentId, preparedAttachment.filename)
    : "";
  const fingerprint = await selfRepairFingerprint(report);
  const feedbackMessage = reportFeedbackMessage(report);
  const evidenceMetadata = {
    userSupplied: true,
    sourceRoute: report.sourceRoute,
    buildVersion: report.buildVersion,
    buildCommit: report.buildCommit,
    browserInfo: report.browserInfo,
    screenInfo: report.screenInfo,
    technicalContext: report.technicalContext,
    expectedBehavior: report.expectedBehavior,
    actualBehavior: report.actualBehavior,
    reproductionSteps: report.reproductionSteps
  };
  const attachment = preparedAttachment ? rowToAttachment({
    id: attachmentId,
    case_id: caseId,
    feedback_id: feedbackId,
    file_name: preparedAttachment.filename,
    content_type: preparedAttachment.contentType,
    size_bytes: preparedAttachment.sizeBytes,
    checksum_sha256: preparedAttachment.checksumSha256,
    uploaded_by_user_id: report.reporterUserId,
    created_at: now
  }) : null;
  const createdCase = {
    id: caseId,
    caseNumber,
    feedbackId,
    ...report,
    caseTypeLabel: SELF_REPAIR_CASE_TYPE_LABELS[report.caseType],
    statusLabel: SELF_REPAIR_CASE_STATUS_LABELS.new,
    riskLabel: SELF_REPAIR_RISK_LABELS.unclassified,
    fingerprint,
    occurrenceCount: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    triageSummary: "",
    internalNote: "",
    workflowStatus: "new",
    assigneeUserId: "",
    assigneeUserName: "",
    publicMessage: "",
    detailsQuestion: "",
    resumeWorkflowStatus: "accepted",
    automationStatus: "not_evaluated",
    screenInfo: report.screenInfo,
    technicalContext: report.technicalContext,
    lastPublicUpdateAt: "",
    readyForVerificationAt: "",
    verifiedAt: "",
    attachments: attachment ? [attachment] : [],
    createdAt: now,
    updatedAt: now,
    updatedByUserId: report.reporterUserId
  };
  const feedback = {
    id: feedbackId,
    moduleId: report.moduleKey,
    moduleName: report.moduleName,
    userId: report.reporterUserId,
    userName: report.reporterUserName,
    userRole: cleanText(currentUser?.role || "readonly", 80),
    message: feedbackMessage,
    priority: report.priority,
    status: "Nová",
    createdAt: now,
    resolvedAt: null,
    resolvedByUserId: null,
    internalNote: "",
    attachments: attachment ? [attachment] : []
  };

  let attachmentStored = false;
  try {
    if (typeof db.batch !== "function") {
      throw new SelfRepairStoreError(
        "Databáze nepodporuje atomický zápis případu.",
        503,
        "self_repair_batch_unavailable"
      );
    }

    if (preparedAttachment) {
      const bucket = attachmentsBucket(env, true);
      try {
        await bucket.put(attachmentKey, preparedAttachment.bytes, {
          httpMetadata: { contentType: preparedAttachment.contentType },
          customMetadata: {
            caseId,
            feedbackId,
            attachmentId,
            uploadedByUserId: report.reporterUserId,
            checksumSha256: preparedAttachment.checksumSha256
          }
        });
        attachmentStored = true;
      } catch (error) {
        console.error("self_repair.attachment_put_failed", { message: cleanText(error?.message, 500) });
        throw new SelfRepairStoreError(
          "Přílohu se nepodařilo uložit do cloudového úložiště.",
          503,
          "self_repair_attachment_store_failed"
        );
      }
    }

    const statements = [
      db.prepare(`
        INSERT INTO module_feedback (
          id, module_id, module_name, user_id, user_name, user_role, message,
          priority, status, created_at, resolved_at, resolved_by_user_id, internal_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        feedback.id,
        feedback.moduleId,
        feedback.moduleName,
        feedback.userId,
        feedback.userName,
        feedback.userRole,
        feedback.message,
        feedback.priority,
        feedback.status,
        feedback.createdAt,
        null,
        null,
        ""
      ),
      db.prepare(`
        INSERT INTO self_repair_cases (
          id, feedback_id, source, case_type, status, priority, risk_level,
          module_key, module_name, target_repo_key, target_production_url,
          title, description, expected_behavior, actual_behavior, reproduction_steps,
          source_route, build_version, build_commit, browser_info,
          reporter_user_id, reporter_user_name, fingerprint, occurrence_count,
          first_seen_at, last_seen_at, triage_summary, internal_note,
          created_at, updated_at, updated_by_user_id, case_number, workflow_status,
          assignee_user_id, assignee_user_name, public_message, details_question,
          resume_workflow_status, automation_status, screen_info, technical_context_json,
          last_public_update_at, ready_for_verification_at, verified_at, client_request_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', NULL, NULL, NULL, NULL, 'accepted', 'not_evaluated', ?, ?, NULL, NULL, NULL, ?)
      `).bind(
        caseId,
        feedbackId,
        report.source,
        report.caseType,
        report.status,
        report.priority,
        report.riskLevel,
        report.moduleKey,
        report.moduleName,
        report.targetRepoKey,
        report.targetProductionUrl,
        report.title,
        report.description,
        nullableText(report.expectedBehavior, 5000),
        nullableText(report.actualBehavior, 5000),
        nullableText(report.reproductionSteps, 8000),
        nullableText(report.sourceRoute, 600),
        nullableText(report.buildVersion, 100),
        nullableText(report.buildCommit, 160),
        nullableText(report.browserInfo, 600),
        report.reporterUserId,
        report.reporterUserName,
        fingerprint,
        1,
        now,
        now,
        null,
        null,
        now,
        now,
        report.reporterUserId,
        caseNumber,
        nullableText(report.screenInfo, 300),
        safeJson(report.technicalContext, {}),
        nullableText(report.clientRequestId, 200)
      ),
      db.prepare(`
        INSERT INTO self_repair_case_evidence (
          id, case_id, evidence_type, label, content_text, metadata_json,
          created_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        evidenceId,
        caseId,
        "user_report_context",
        "Kontext uživatelského hlášení",
        report.description,
        safeJson(evidenceMetadata, {}),
        report.reporterUserId,
        now
      ),
      db.prepare(`
        INSERT INTO self_repair_case_audit_log (
          id, case_id, action, changed_by_user_id, changed_by_user_name,
          changed_at, before_json, after_json, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        auditId,
        caseId,
        "created_from_user_feedback",
        report.reporterUserId,
        report.reporterUserName,
        now,
        null,
        safeJson({
          status: "new",
          riskLevel: "unclassified",
          moduleKey: report.moduleKey,
          workflowStatus: "new",
          caseNumber,
          targetRepoKey: report.targetRepoKey,
          feedbackId,
          attachmentId: attachment?.id || "",
          attachmentFilename: attachment?.filename || ""
        }),
        attachment
          ? "Případ vytvořen z formuláře Připomínky včetně přílohy. Automatická oprava, e-mail ani nasazení nebyly spuštěny."
          : "Případ vytvořen z formuláře Připomínky. Automatická oprava, e-mail ani nasazení nebyly spuštěny."
      )
    ];

    if (attachment) {
      statements.push(db.prepare(`
        INSERT INTO self_repair_case_attachments (
          id, case_id, feedback_id, file_name, content_type, size_bytes,
          storage_key, checksum_sha256, uploaded_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        attachment.id,
        caseId,
        feedbackId,
        attachment.filename,
        attachment.contentType,
        attachment.sizeBytes,
        attachmentKey,
        attachment.checksumSha256,
        report.reporterUserId,
        now
      ));
    }

    await db.batch(statements);

    return { case: createdCase, feedback, attachment };
  } catch (error) {
    if (attachmentStored && attachmentKey) {
      try {
        await attachmentsBucket(env, false)?.delete(attachmentKey);
      } catch (cleanupError) {
        console.error("self_repair.attachment_cleanup_failed", {
          storageKey: attachmentKey,
          message: cleanText(cleanupError?.message, 500)
        });
      }
    }
    const errorMessage = cleanText(error?.message, 1000).toLowerCase();
    if (report.clientRequestId && (errorMessage.includes("unique") || errorMessage.includes("constraint"))) {
      const existingRow = await db.prepare(`
        SELECT *
        FROM self_repair_cases
        WHERE client_request_id = ? AND reporter_user_id = ? AND source = 'user_feedback'
        LIMIT 1
      `).bind(report.clientRequestId, report.reporterUserId).first();
      if (existingRow) {
        return {
          case: rowToCase(existingRow),
          feedback: null,
          attachment: null,
          deduplicated: true
        };
      }
    }
    if (error instanceof SelfRepairStoreError) throw error;
    throw dbError(error);
  }
}

function cloudMonitorTarget(finding = {}) {
  const routeKey = cleanText(finding.route, 600).split("/").filter(Boolean)[0] || "dashboard";
  const moduleTarget = targetForSelfRepairReport(finding.moduleKey) ||
    targetForSelfRepairReport(routeKey) ||
    targetForSelfRepairReport("dashboard");
  return {
    ...moduleTarget,
    repoKey: "kaiser-control-center",
    productionUrl: SELF_REPAIR_MONITOR_TARGET_URL
  };
}

function normalizeCloudMonitorFinding(finding = {}, context = {}) {
  const target = cloudMonitorTarget(finding);
  const route = sanitizeSelfRepairSourceRoute(finding.route) || "/";
  const checkKey = cleanText(finding.key || `${finding.type || "route_check"}:${route}`, 300);
  const title = cleanText(finding.title || `Produkční kontrola: ${route}`, 240);
  const expected = cleanText(finding.expected || "Produkční stránka vrací HTTP 200, HTML a assety stejné verze buildu.", 5000);
  const actual = cleanText(finding.actual || finding.message || "Kontrola vrátila neočekávaný stav.", 5000);
  const description = cleanText(
    finding.description || `Hodinová read-only kontrola našla problém na produkční cestě ${route}.`,
    8000
  );
  const reproductionSteps = cleanText(
    finding.reproductionSteps || `Otevřít ${route} na produkční adrese a ověřit HTTP stav, typ odpovědi a verzi app.js/styles.css.`,
    8000
  );

  return {
    target,
    route,
    checkKey,
    title,
    expected,
    actual,
    description,
    reproductionSteps,
    checkType: cleanText(finding.type || "route_check", 100),
    httpStatus: Number.isFinite(Number(finding.httpStatus)) ? Number(finding.httpStatus) : null,
    durationMs: Number.isFinite(Number(finding.durationMs)) ? Number(finding.durationMs) : 0,
    observedAt: cleanText(context.observedAt, 80) || nowIso(),
    buildVersion: cleanText(context.buildVersion, 100),
    buildCommit: cleanText(context.buildCommit, 160),
    monitorRunId: cleanText(context.monitorRunId, 200)
  };
}

export function buildCloudMonitorPromptDraft(finding = {}, context = {}) {
  const normalized = normalizeCloudMonitorFinding(finding, context);
  return [
    "NÁVRH PROMPTU PRO CODEX – NESPOUŠTĚT AUTOMATICKY",
    "",
    `Repozitář: ${normalized.target.repoKey}`,
    `Produkce: ${normalized.target.productionUrl}`,
    `Kontrolovaná cesta: ${normalized.route}`,
    `Build: ${normalized.buildVersion || "neuvedeno"} / ${normalized.buildCommit || "neuvedeno"}`,
    "",
    `Nález: ${normalized.title}`,
    `Skutečný stav: ${normalized.actual}`,
    `Očekávaný stav: ${normalized.expected}`,
    `Postup ověření: ${normalized.reproductionSteps}`,
    "",
    "Požadovaný bezpečný postup:",
    "1. Nejdřív přečti aktuální PŘÍRUČKA.md a ověř zdroj pravdy, větev a produkční buildMeta.",
    "2. Nález reprodukuj read-only kontrolou. Pokud se nepotvrdí, nic neupravuj a vysvětli proč.",
    "3. Pokud se potvrdí, připrav minimální návrh opravy, dotčené soubory, rizika a testy.",
    "4. Bez nového lidského schválení neměň kód, DB, Cloudflare, secrets ani produkční data.",
    "5. Nespouštěj automatický commit, pull request, merge, deploy, e-mail ani jinou notifikaci.",
    "",
    "Akceptace budoucí opravy:",
    `- cesta ${normalized.route} vrací očekávaný stav a správný obsah,`,
    "- syntax, cílené testy, build a git diff --check projdou,",
    "- produkce se ověří až po samostatně schváleném nasazení.",
    "",
    `Monitor run: ${normalized.monitorRunId || "neuvedeno"}`,
    "Codex spuštěn: NE. Repozitář změněn: NE. Nasazení: NE. E-mail: NE."
  ].join("\n");
}

async function activeCloudMonitorCaseRow(db, fingerprint) {
  return db.prepare(`
    SELECT *
    FROM self_repair_cases
    WHERE source = 'cloud_monitor'
      AND fingerprint = ?
      AND status NOT IN ('rejected', 'duplicate', 'closed')
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(fingerprint).first();
}

async function incrementCloudMonitorCase(db, existingRow, normalized, promptDraft, evidenceMetadata, promptMetadata) {
  const caseId = cleanText(existingRow?.id, 200);
  await db.prepare(`
    UPDATE self_repair_cases
    SET
      occurrence_count = occurrence_count + 1,
      last_seen_at = ?,
      actual_behavior = ?,
      build_version = ?,
      build_commit = ?,
      updated_at = ?,
      updated_by_user_id = 'cloud:self-repair-monitor'
    WHERE id = ?
  `).bind(
    normalized.observedAt,
    nullableText(normalized.actual, 5000),
    nullableText(normalized.buildVersion, 100),
    nullableText(normalized.buildCommit, 160),
    normalized.observedAt,
    caseId
  ).run();

  await db.prepare(`
    UPDATE self_repair_case_evidence
    SET content_text = ?, metadata_json = ?, created_at = ?
    WHERE case_id = ? AND evidence_type = 'cloud_monitor_finding'
  `).bind(
    normalized.actual,
    safeJson(evidenceMetadata, {}),
    normalized.observedAt,
    caseId
  ).run();
  await db.prepare(`
    UPDATE self_repair_case_evidence
    SET content_text = ?, metadata_json = ?, created_at = ?
    WHERE case_id = ? AND evidence_type = 'codex_prompt_draft'
  `).bind(
    promptDraft,
    safeJson(promptMetadata, {}),
    normalized.observedAt,
    caseId
  ).run();

  const updatedRow = await caseRow(db, caseId);
  return {
    case: rowToCase(updatedRow),
    created: false,
    deduplicated: true,
    promptDraftPrepared: true,
    promptDraftRefreshed: true
  };
}

export async function upsertCloudMonitorSelfRepairCase(env, finding = {}, context = {}) {
  const db = database(env, true);
  const normalized = normalizeCloudMonitorFinding(finding, context);
  const fingerprint = await selfRepairFingerprint({
    moduleKey: normalized.target.moduleKey,
    caseType: "bug",
    title: normalized.checkKey,
    actualBehavior: normalized.checkKey
  });
  const promptDraft = buildCloudMonitorPromptDraft(finding, context);
  const evidenceMetadata = {
    source: "cloud_monitor",
    checkKey: normalized.checkKey,
    checkType: normalized.checkType,
    route: normalized.route,
    httpStatus: normalized.httpStatus,
    durationMs: normalized.durationMs,
    expected: normalized.expected,
    actual: normalized.actual,
    monitorRunId: normalized.monitorRunId,
    buildVersion: normalized.buildVersion,
    buildCommit: normalized.buildCommit,
    readOnly: true
  };
  const promptMetadata = {
    template: SELF_REPAIR_MONITOR_PROMPT_VERSION,
    generatedDeterministically: true,
    codexExecuted: false,
    repoWrite: false,
    pullRequest: false,
    deployment: false,
    notificationSent: false
  };

  try {
    const existingRow = await activeCloudMonitorCaseRow(db, fingerprint);
    if (existingRow) {
      return incrementCloudMonitorCase(db, existingRow, normalized, promptDraft, evidenceMetadata, promptMetadata);
    }

    if (typeof db.batch !== "function") {
      throw new SelfRepairStoreError(
        "Databáze nepodporuje atomický zápis monitorovacího případu.",
        503,
        "self_repair_monitor_batch_unavailable"
      );
    }

    const caseId = randomId("self-repair-case");
    const findingEvidenceId = randomId("self-repair-evidence");
    const promptEvidenceId = randomId("self-repair-evidence");
    const auditId = randomId("self-repair-audit");
    const reporterUserId = cleanText(context.reporterUserId, 200) || "cloud:self-repair-monitor";
    const reporterUserName = cleanText(context.reporterUserName, 240) || "Cloudový read-only monitor";
    const evidenceLabel = reporterUserId === "cloud:self-repair-ui-scan"
      ? "Důkaz denního syntetického UI auditu"
      : "Důkaz hodinové read-only kontroly";
    const auditNote = reporterUserId === "cloud:self-repair-ui-scan"
      ? "Případ vytvořen denním syntetickým UI auditem. Produkční tlačítka se neklikala; Prompt je pouze návrh a Codex, repozitář, deploy ani e-mail nebyly spuštěny."
      : "Případ vytvořen hodinovým read-only monitorem. Prompt je pouze návrh; Codex, repozitář, deploy ani e-mail nebyly spuštěny.";

    try {
      await db.batch([
        db.prepare(`
          INSERT INTO self_repair_cases (
            id, feedback_id, source, case_type, status, priority, risk_level,
            module_key, module_name, target_repo_key, target_production_url,
            title, description, expected_behavior, actual_behavior, reproduction_steps,
            source_route, build_version, build_commit, browser_info,
            reporter_user_id, reporter_user_name, fingerprint, occurrence_count,
            first_seen_at, last_seen_at, triage_summary, internal_note,
            created_at, updated_at, updated_by_user_id
          ) VALUES (?, NULL, 'cloud_monitor', 'bug', 'new', 'Důležitá', 'orange', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 1, ?, ?, ?, NULL, ?, ?, ?)
        `).bind(
          caseId,
          normalized.target.moduleKey,
          normalized.target.moduleName,
          normalized.target.repoKey,
          normalized.target.productionUrl,
          normalized.title,
          normalized.description,
          nullableText(normalized.expected, 5000),
          nullableText(normalized.actual, 5000),
          nullableText(normalized.reproductionSteps, 8000),
          normalized.route,
          nullableText(normalized.buildVersion, 100),
          nullableText(normalized.buildCommit, 160),
          reporterUserId,
          reporterUserName,
          fingerprint,
          normalized.observedAt,
          normalized.observedAt,
          "Automatický read-only nález. Před opravou vyžaduje ruční ověření a samostatné schválení.",
          normalized.observedAt,
          normalized.observedAt,
          reporterUserId
        ),
        db.prepare(`
          INSERT INTO self_repair_case_evidence (
            id, case_id, evidence_type, label, content_text, metadata_json,
            created_by_user_id, created_at
          ) VALUES (?, ?, 'cloud_monitor_finding', ?, ?, ?, ?, ?)
        `).bind(
          findingEvidenceId,
          caseId,
          evidenceLabel,
          normalized.actual,
          safeJson(evidenceMetadata, {}),
          reporterUserId,
          normalized.observedAt
        ),
        db.prepare(`
          INSERT INTO self_repair_case_evidence (
            id, case_id, evidence_type, label, content_text, metadata_json,
            created_by_user_id, created_at
          ) VALUES (?, ?, 'codex_prompt_draft', 'Návrh promptu pro Codex – nespouštět automaticky', ?, ?, ?, ?)
        `).bind(
          promptEvidenceId,
          caseId,
          promptDraft,
          safeJson(promptMetadata, {}),
          reporterUserId,
          normalized.observedAt
        ),
        db.prepare(`
          INSERT INTO self_repair_case_audit_log (
            id, case_id, action, changed_by_user_id, changed_by_user_name,
            changed_at, before_json, after_json, note
          ) VALUES (?, ?, 'created_from_cloud_monitor', ?, ?, ?, NULL, ?, ?)
        `).bind(
          auditId,
          caseId,
          reporterUserId,
          reporterUserName,
          normalized.observedAt,
          safeJson({
            status: "new",
            riskLevel: "orange",
            moduleKey: normalized.target.moduleKey,
            targetRepoKey: normalized.target.repoKey,
            monitorRunId: normalized.monitorRunId,
            promptDraftPrepared: true,
            codexExecuted: false
          }),
          auditNote
        )
      ]);
    } catch (error) {
      const message = cleanText(error?.message, 1000).toLowerCase();
      if (!message.includes("unique") && !message.includes("constraint")) {
        throw error;
      }

      const racedRow = await activeCloudMonitorCaseRow(db, fingerprint);
      if (!racedRow) throw error;
      return incrementCloudMonitorCase(db, racedRow, normalized, promptDraft, evidenceMetadata, promptMetadata);
    }

    return {
      case: rowToCase(await caseRow(db, caseId)),
      created: true,
      deduplicated: false,
      promptDraftPrepared: true,
      promptDraft
    };
  } catch (error) {
    if (error instanceof SelfRepairStoreError) throw error;
    throw dbError(error);
  }
}

function filteredCases(items, filters = {}) {
  const status = cleanText(filters.status, 80).toLowerCase();
  const riskLevel = cleanText(filters.riskLevel || filters.risk, 80).toLowerCase();
  const moduleKey = cleanText(filters.moduleKey || filters.module, 100).toLowerCase();
  const search = cleanText(filters.search, 300).toLowerCase();
  const limit = Math.min(500, Math.max(1, Number(filters.limit || 200) || 200));

  return items.filter((item) => {
    if (status && item.status !== status) return false;
    if (riskLevel && item.riskLevel !== riskLevel) return false;
    if (moduleKey && item.moduleKey !== moduleKey) return false;
    if (search) {
      const haystack = [item.title, item.description, item.reporterUserName, item.moduleName, item.triageSummary]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  }).slice(0, limit);
}

export function selfRepairCaseSummary(items = []) {
  const summary = {
    total: items.length,
    newCount: 0,
    needsDetailsCount: 0,
    plannedCount: 0,
    closedCount: 0,
    redRiskCount: 0,
    unclassifiedCount: 0
  };

  items.forEach((item) => {
    if (item.status === "new") summary.newCount += 1;
    if (item.status === "needs_details") summary.needsDetailsCount += 1;
    if (["confirmed", "planned"].includes(item.status)) summary.plannedCount += 1;
    if (TERMINAL_STATUSES.has(item.status)) summary.closedCount += 1;
    if (item.riskLevel === "red") summary.redRiskCount += 1;
    if (item.riskLevel === "unclassified") summary.unclassifiedCount += 1;
  });

  return summary;
}

export async function listSelfRepairCases(env, filters = {}) {
  const db = database(env, true);
  try {
    const result = await db.prepare(`
      SELECT *
      FROM self_repair_cases
      ORDER BY
        CASE status
          WHEN 'new' THEN 1
          WHEN 'needs_details' THEN 2
          WHEN 'confirmed' THEN 3
          WHEN 'planned' THEN 4
          ELSE 5
        END,
        updated_at DESC
      LIMIT 500
    `).all();
    const allItems = (result.results || []).map(rowToCase).filter(Boolean);
    return {
      cases: filteredCases(allItems, filters),
      summary: selfRepairCaseSummary(allItems)
    };
  } catch (error) {
    throw dbError(error);
  }
}

async function caseRow(db, caseId) {
  return db.prepare("SELECT * FROM self_repair_cases WHERE id = ? LIMIT 1").bind(caseId).first();
}

export async function getSelfRepairCase(env, id) {
  const db = database(env, true);
  const caseId = cleanText(id, 200);
  if (!caseId) {
    throw new SelfRepairStoreError("Případ nebyl nalezen.", 404, "self_repair_case_missing");
  }

  try {
    const [row, evidenceResult, auditResult, attachmentResult] = await Promise.all([
      caseRow(db, caseId),
      db.prepare("SELECT * FROM self_repair_case_evidence WHERE case_id = ? ORDER BY created_at ASC").bind(caseId).all(),
      db.prepare("SELECT * FROM self_repair_case_audit_log WHERE case_id = ? ORDER BY changed_at DESC LIMIT 200").bind(caseId).all(),
      db.prepare("SELECT * FROM self_repair_case_attachments WHERE case_id = ? ORDER BY created_at ASC").bind(caseId).all()
    ]);
    if (!row) {
      throw new SelfRepairStoreError("Případ nebyl nalezen.", 404, "self_repair_case_not_found");
    }
    return {
      case: rowToCase(row),
      evidence: (evidenceResult.results || []).map(rowToEvidence),
      audit: (auditResult.results || []).map(rowToAudit),
      attachments: (attachmentResult.results || []).map(rowToAttachment).filter(Boolean)
    };
  } catch (error) {
    if (error instanceof SelfRepairStoreError) throw error;
    throw dbError(error);
  }
}

export async function getSelfRepairAttachmentFile(env, currentUser, caseIdValue, attachmentIdValue) {
  const db = database(env, true);
  const caseId = cleanText(caseIdValue, 200);
  const attachmentId = cleanText(attachmentIdValue, 200);
  if (!caseId || !attachmentId) {
    throw new SelfRepairStoreError("Příloha nebyla nalezena.", 404, "self_repair_attachment_missing");
  }

  try {
    const row = await db.prepare(`
      SELECT a.*, c.reporter_user_id
      FROM self_repair_case_attachments a
      JOIN self_repair_cases c ON c.id = a.case_id
      WHERE a.id = ? AND a.case_id = ?
      LIMIT 1
    `).bind(attachmentId, caseId).first();
    if (!row) {
      throw new SelfRepairStoreError("Příloha nebyla nalezena.", 404, "self_repair_attachment_not_found");
    }

    const sameReporter = cleanText(row.reporter_user_id, 200).toLowerCase()
      === cleanText(currentUser?.id || currentUser?.email, 200).toLowerCase();
    const publicAttachment = cleanText(row.visibility, 40) !== "internal";
    const canRead = hasPermission(currentUser, "self-repair", "view")
      || (publicAttachment && hasPermission(currentUser, "feedback", "view"))
      || (sameReporter && hasPermission(currentUser, "feedback", "view"));
    if (!canRead) {
      throw new SelfRepairStoreError("Nemáte oprávnění zobrazit tuto přílohu.", 403, "self_repair_attachment_forbidden");
    }

    const bucket = attachmentsBucket(env, true);
    const object = await bucket.get(cleanText(row.storage_key, 700));
    if (!object) {
      throw new SelfRepairStoreError(
        "Příloha je evidovaná, ale soubor nebyl v cloudovém úložišti nalezen.",
        404,
        "self_repair_attachment_object_missing"
      );
    }

    const attachment = rowToAttachment(row);
    return {
      attachment,
      body: object.body,
      headers: {
        "Content-Type": attachment.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename || "priloha")}`,
        "Content-Length": String(attachment.sizeBytes || ""),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    };
  } catch (error) {
    if (error instanceof SelfRepairStoreError) throw error;
    throw dbError(error);
  }
}

export async function listSelfRepairCaseAudit(env, id) {
  const detail = await getSelfRepairCase(env, id);
  return detail.audit;
}

export async function selfRepairCaseIdForFeedback(env, feedbackId) {
  const db = database(env, false);
  const id = cleanText(feedbackId, 200);
  if (!db || !id) return "";

  try {
    const row = await db.prepare("SELECT id FROM self_repair_cases WHERE feedback_id = ? LIMIT 1").bind(id).first();
    return cleanText(row?.id, 200);
  } catch (error) {
    if (cleanText(error?.message, 1000).includes("no such table")) return "";
    throw dbError(error);
  }
}

function auditSnapshot(item) {
  return {
    status: item.status,
    priority: item.priority,
    riskLevel: item.riskLevel,
    triageSummary: item.triageSummary,
    internalNote: item.internalNote
  };
}

export async function updateSelfRepairCase(env, currentUser, id, input = {}) {
  const db = database(env, true);
  const caseId = cleanText(id, 200);
  if (!caseId) {
    throw new SelfRepairStoreError("Případ nebyl nalezen.", 404, "self_repair_case_missing");
  }

  try {
    const existingRow = await caseRow(db, caseId);
    const existing = rowToCase(existingRow);
    if (!existing) {
      throw new SelfRepairStoreError("Případ nebyl nalezen.", 404, "self_repair_case_not_found");
    }

    const status = Object.prototype.hasOwnProperty.call(input, "status")
      ? normalizeSelfRepairCaseStatus(input.status)
      : existing.status;
    const riskLevel = Object.prototype.hasOwnProperty.call(input, "riskLevel")
      ? normalizeSelfRepairRisk(input.riskLevel)
      : existing.riskLevel;
    const priority = Object.prototype.hasOwnProperty.call(input, "priority")
      ? normalizeSelfRepairPriority(input.priority)
      : existing.priority;
    const triageSummary = Object.prototype.hasOwnProperty.call(input, "triageSummary")
      ? cleanText(input.triageSummary, 5000)
      : existing.triageSummary;
    const internalNote = Object.prototype.hasOwnProperty.call(input, "internalNote")
      ? cleanText(input.internalNote, 8000)
      : existing.internalNote;
    const updatedByUserId = cleanText(currentUser?.id || currentUser?.email, 200);
    const updatedByUserName = cleanText(currentUser?.name || currentUser?.email || "Uživatel", 240);
    const now = new Date().toISOString();
    const updated = {
      ...existing,
      status,
      statusLabel: SELF_REPAIR_CASE_STATUS_LABELS[status],
      riskLevel,
      riskLabel: SELF_REPAIR_RISK_LABELS[riskLevel],
      priority,
      triageSummary,
      internalNote,
      updatedAt: now,
      updatedByUserId
    };
    const before = auditSnapshot(existing);
    const after = auditSnapshot(updated);
    const feedbackStatus = FEEDBACK_STATUS_FOR_CASE[status] || "Nová";
    const resolvedAt = TERMINAL_STATUSES.has(status) ? now : null;
    const statements = [
      db.prepare(`
        UPDATE self_repair_cases
        SET status = ?, priority = ?, risk_level = ?, triage_summary = ?, internal_note = ?,
            updated_at = ?, updated_by_user_id = ?
        WHERE id = ?
      `).bind(
        status,
        priority,
        riskLevel,
        nullableText(triageSummary, 5000),
        nullableText(internalNote, 8000),
        now,
        nullableText(updatedByUserId, 200),
        caseId
      ),
      db.prepare(`
        INSERT INTO self_repair_case_audit_log (
          id, case_id, action, changed_by_user_id, changed_by_user_name,
          changed_at, before_json, after_json, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        randomId("self-repair-audit"),
        caseId,
        "triage_updated",
        nullableText(updatedByUserId, 200),
        nullableText(updatedByUserName, 240),
        now,
        safeJson(before),
        safeJson(after),
        nullableText(input.auditNote || "Aktualizováno ve správě Samooprav.", 2000)
      )
    ];

    if (existing.feedbackId) {
      statements.push(db.prepare(`
        UPDATE module_feedback
        SET status = ?, priority = ?, internal_note = ?, resolved_at = ?, resolved_by_user_id = ?
        WHERE id = ?
      `).bind(
        feedbackStatus,
        priority,
        nullableText(internalNote, 8000),
        resolvedAt,
        resolvedAt ? nullableText(updatedByUserId, 200) : null,
        existing.feedbackId
      ));
    }

    await db.batch(statements);
    return updated;
  } catch (error) {
    if (error instanceof SelfRepairStoreError) throw error;
    throw dbError(error);
  }
}

export async function getSelfRepairStatus(env) {
  const db = database(env, true);
  try {
    const [row, monitorRule, latestRunnerRun, uiScanRule, latestUiScanRun, monitorCaseRow, promptRow] = await Promise.all([
      db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
          SUM(CASE WHEN status IN ('confirmed', 'planned') THEN 1 ELSE 0 END) AS planned_count,
          SUM(CASE WHEN risk_level = 'red' THEN 1 ELSE 0 END) AS red_risk_count,
          MAX(created_at) AS last_case_at,
          MAX(updated_at) AS last_updated_at
        FROM self_repair_cases
      `).first(),
      db.prepare(`
        SELECT status, schedule_cron, cloud_runner, last_run_at, next_run_at,
               last_run_status, last_run_message
        FROM module_rules
        WHERE module_key = 'self-repair'
          AND id = 'self-repair-hourly-monitor-proposal'
        LIMIT 1
      `).first(),
      db.prepare(`
        SELECT id, started_at, scheduled_at, finished_at, triggered_by, status,
               rules_total, dry_run_count, skipped_count, failed_count,
               message, error_code, cron, time_zone
        FROM module_automation_runner_runs
        WHERE module_key = 'self-repair'
          AND runner_name = 'self-repair-phase2a-hourly-monitor'
        ORDER BY started_at DESC
        LIMIT 1
      `).first(),
      db.prepare(`
        SELECT status, schedule_cron, cloud_runner, last_run_at, next_run_at,
               last_run_status, last_run_message
        FROM module_rules
        WHERE module_key = 'self-repair'
          AND id = 'self-repair-daily-ui-interaction-scan'
        LIMIT 1
      `).first(),
      db.prepare(`
        SELECT id, started_at, scheduled_at, finished_at, triggered_by, status,
               rules_total, dry_run_count, skipped_count, failed_count,
               message, error_code, cron, time_zone
        FROM module_automation_runner_runs
        WHERE module_key = 'self-repair'
          AND runner_name = 'self-repair-phase2b-daily-ui-interaction-scan'
        ORDER BY started_at DESC
        LIMIT 1
      `).first(),
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM self_repair_cases
        WHERE source = 'cloud_monitor'
      `).first(),
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM self_repair_case_evidence
        WHERE evidence_type = 'codex_prompt_draft'
      `).first()
    ]);
    const monitorActive = cleanText(monitorRule?.status, 80) === "active";
    const latestRunAt = cleanText(latestRunnerRun?.finished_at || latestRunnerRun?.started_at, 80);
    const latestRunMs = Date.parse(latestRunAt);
    const latestRunAgeMs = Date.now() - latestRunMs;
    const latestRunRecent = Number.isFinite(latestRunMs) &&
      latestRunAgeMs >= -5 * 60 * 1000 &&
      latestRunAgeMs <= 90 * 60 * 1000;
    const latestRunStatus = cleanText(latestRunnerRun?.status, 80);
    const monitorCapability = !monitorActive
      ? "off"
      : !latestRunnerRun
        ? "waiting"
        : ["error", "partial_error"].includes(latestRunStatus)
          ? "warning"
          : latestRunRecent
            ? "ready"
            : "warning";
    const uiScanActive = cleanText(uiScanRule?.status, 80) === "active";
    const latestUiScanAt = cleanText(latestUiScanRun?.finished_at || latestUiScanRun?.started_at, 80);
    const latestUiScanMs = Date.parse(latestUiScanAt);
    const latestUiScanAgeMs = Date.now() - latestUiScanMs;
    const latestUiScanRecent = Number.isFinite(latestUiScanMs) &&
      latestUiScanAgeMs >= -5 * 60 * 1000 &&
      latestUiScanAgeMs <= 26 * 60 * 60 * 1000;
    const latestUiScanStatus = cleanText(latestUiScanRun?.status, 80);
    const uiScanCapability = !uiScanActive
      ? "off"
      : !latestUiScanRun
        ? "waiting"
        : ["error", "partial_error"].includes(latestUiScanStatus)
          ? "warning"
          : latestUiScanRecent
            ? "ready"
            : "warning";

    return {
      apiStatus: "ready",
      phase: uiScanActive
        ? "phase2b_read_only_and_synthetic_ui_scan"
        : "phase2a_hourly_read_only_monitor",
      generatedAt: nowIso(),
      summary: {
        total: Number(row?.total || 0),
        newCount: Number(row?.new_count || 0),
        plannedCount: Number(row?.planned_count || 0),
        redRiskCount: Number(row?.red_risk_count || 0),
        lastCaseAt: cleanText(row?.last_case_at, 80),
        lastUpdatedAt: cleanText(row?.last_updated_at, 80)
      },
      capabilities: {
        userReports: "ready",
        triage: "ready",
        hourlyMonitor: monitorCapability,
        dailyUiInteractionScan: uiScanCapability,
        promptPreparation: monitorActive ? "ready" : "off",
        codexExecution: "off",
        pullRequests: "off",
        deployment: "off",
        userEmail: "off"
      },
      monitor: {
        active: monitorActive,
        ruleStatus: cleanText(monitorRule?.status, 80) || "missing",
        scheduleCron: cleanText(monitorRule?.schedule_cron, 100),
        cloudRunner: cleanText(monitorRule?.cloud_runner, 200),
        lastRunAt: cleanText(monitorRule?.last_run_at || latestRunAt, 80),
        nextRunAt: cleanText(monitorRule?.next_run_at, 80),
        lastRunStatus: cleanText(monitorRule?.last_run_status || latestRunStatus, 80),
        lastRunMessage: cleanText(monitorRule?.last_run_message || latestRunnerRun?.message, 4000),
        latestRunRecent,
        routesChecked: Number(latestRunnerRun?.rules_total || 0),
        findings: Number(latestRunnerRun?.dry_run_count || 0),
        deduplicatedCases: Number(latestRunnerRun?.skipped_count || 0),
        failedCount: Number(latestRunnerRun?.failed_count || 0),
        triggeredBy: cleanText(latestRunnerRun?.triggered_by, 200),
        monitorCases: Number(monitorCaseRow?.count || 0),
        promptDrafts: Number(promptRow?.count || 0)
      },
      uiInteractionScan: {
        active: uiScanActive,
        ruleStatus: cleanText(uiScanRule?.status, 80) || "missing",
        scheduleCron: cleanText(uiScanRule?.schedule_cron, 100),
        cloudRunner: cleanText(uiScanRule?.cloud_runner, 200),
        lastRunAt: cleanText(uiScanRule?.last_run_at || latestUiScanAt, 80),
        nextRunAt: cleanText(uiScanRule?.next_run_at, 80),
        lastRunStatus: cleanText(uiScanRule?.last_run_status || latestUiScanStatus, 80),
        lastRunMessage: cleanText(uiScanRule?.last_run_message || latestUiScanRun?.message, 4000),
        latestRunRecent: latestUiScanRecent,
        actionsChecked: Number(latestUiScanRun?.rules_total || 0),
        findings: Number(latestUiScanRun?.dry_run_count || 0),
        deduplicatedCases: Number(latestUiScanRun?.skipped_count || 0),
        failedCount: Number(latestUiScanRun?.failed_count || 0),
        triggeredBy: cleanText(latestUiScanRun?.triggered_by, 200),
        realProductionClicks: false,
        authenticatedSession: false,
        browserNetwork: "blocked"
      },
      note: uiScanActive
        ? "Hodinový monitor pouze čte produkční stránky. Denní UI audit stahuje produkční kód a CSS přes GET a kliká výhradně v izolované syntetické stránce bez přihlášení a s blokovanou sítí. Codex, zápis do repozitáře, pull request, deploy a e-mail zůstávají vypnuté."
        : "Fáze 2A každou hodinu pouze čte produkční stránky, zapisuje a deduplikuje nálezy a připravuje návrhy promptů. Codex, zápis do repozitáře, pull request, deploy a e-mail zůstávají vypnuté."
    };
  } catch (error) {
    throw dbError(error);
  }
}

export const SELF_REPAIR_INTERNALS = Object.freeze({
  CASE_TYPES,
  CASE_STATUSES,
  PRIORITIES,
  RISK_LEVELS,
  FEEDBACK_STATUS_FOR_CASE
});
