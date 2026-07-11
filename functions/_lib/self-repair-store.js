import { targetForSelfRepairReport } from "./self-repair-targets.js";

const DB_BINDING = "SMART_ODPADY_DB";
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

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
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
      "Tabulky Samooprav nejsou v D1 připravené. Je nutné nejprve samostatně schválit a spustit migraci 0034.",
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
    reporterUserId,
    reporterUserName: cleanText(currentUser?.name || currentUser?.email || "Uživatel", 240)
  };
}

export async function createUserReportedSelfRepairCase(env, currentUser, input = {}) {
  const db = database(env, true);
  const target = targetForSelfRepairReport(input.moduleKey || input.moduleId);
  if (!target) {
    throw new SelfRepairStoreError("Vyberte platný modul aplikace.", 400, "self_repair_module_invalid");
  }

  const report = normalizeUserReport(input, currentUser, target);
  const now = new Date().toISOString();
  const caseId = randomId("self-repair-case");
  const feedbackId = randomId("module-feedback");
  const evidenceId = randomId("self-repair-evidence");
  const auditId = randomId("self-repair-audit");
  const fingerprint = await selfRepairFingerprint(report);
  const feedbackMessage = reportFeedbackMessage(report);
  const evidenceMetadata = {
    userSupplied: true,
    sourceRoute: report.sourceRoute,
    buildVersion: report.buildVersion,
    buildCommit: report.buildCommit,
    browserInfo: report.browserInfo,
    expectedBehavior: report.expectedBehavior,
    actualBehavior: report.actualBehavior,
    reproductionSteps: report.reproductionSteps
  };
  const createdCase = {
    id: caseId,
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
    internalNote: ""
  };

  try {
    if (typeof db.batch !== "function") {
      throw new SelfRepairStoreError(
        "Databáze nepodporuje atomický zápis případu.",
        503,
        "self_repair_batch_unavailable"
      );
    }

    await db.batch([
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
          created_at, updated_at, updated_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        report.reporterUserId
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
          targetRepoKey: report.targetRepoKey,
          feedbackId
        }),
        "Případ vytvořen z formuláře Připomínky. Automatická oprava, e-mail ani nasazení nebyly spuštěny."
      )
    ]);

    return { case: createdCase, feedback };
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
    const [row, evidenceResult, auditResult] = await Promise.all([
      caseRow(db, caseId),
      db.prepare("SELECT * FROM self_repair_case_evidence WHERE case_id = ? ORDER BY created_at ASC").bind(caseId).all(),
      db.prepare("SELECT * FROM self_repair_case_audit_log WHERE case_id = ? ORDER BY changed_at DESC LIMIT 200").bind(caseId).all()
    ]);
    if (!row) {
      throw new SelfRepairStoreError("Případ nebyl nalezen.", 404, "self_repair_case_not_found");
    }
    return {
      case: rowToCase(row),
      evidence: (evidenceResult.results || []).map(rowToEvidence),
      audit: (auditResult.results || []).map(rowToAudit)
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
    const row = await db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN status IN ('confirmed', 'planned') THEN 1 ELSE 0 END) AS planned_count,
        SUM(CASE WHEN risk_level = 'red' THEN 1 ELSE 0 END) AS red_risk_count,
        MAX(created_at) AS last_case_at,
        MAX(updated_at) AS last_updated_at
      FROM self_repair_cases
    `).first();

    return {
      apiStatus: "ready",
      phase: "phase1_evidence_and_triage",
      generatedAt: new Date().toISOString(),
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
        hourlyMonitor: "off",
        promptPreparation: "off",
        codexExecution: "off",
        pullRequests: "off",
        deployment: "off",
        userEmail: "off"
      },
      note: "Fáze 1 pouze ukládá, třídí a audituje případy. Nic samo neopravuje, neposílá ani nenasazuje."
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
