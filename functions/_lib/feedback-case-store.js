import { hasPermission } from "../../src/permissions.js";
import {
  SELF_REPAIR_ATTACHMENT_ACCEPT,
  SELF_REPAIR_ATTACHMENT_MAX_SIZE_BYTES,
  SelfRepairStoreError
} from "./self-repair-store.js";

const DB_BINDING = "SMART_ODPADY_DB";
const BUCKET_BINDING = "SMART_ODPADY_DOCUMENTS";

export const FEEDBACK_WORKFLOW_STATUSES = Object.freeze({
  new: "Nové",
  accepted: "Přijato",
  needs_details: "Potřebujeme doplnit",
  in_progress: "V řešení",
  ready_for_verification: "Připraveno k ověření",
  done: "Hotovo",
  rejected: "Zamítnuto",
  duplicate: "Duplicitní"
});

export const FEEDBACK_AUTOMATION_STATUSES = Object.freeze({
  not_evaluated: "Nevyhodnoceno",
  waiting_for_review: "Čeká na kontrolu",
  suitable: "Vhodné pro automatickou opravu",
  unsuitable: "Nevhodné pro automatickou opravu",
  proposal_ready: "Návrh připraven",
  waiting_for_approval: "Čeká na schválení",
  deployed: "Nasazeno",
  verified: "Ověřeno",
  failed: "Selhalo"
});

const WORKFLOW_STATUS_SET = new Set(Object.keys(FEEDBACK_WORKFLOW_STATUSES));
const AUTOMATION_STATUS_SET = new Set(Object.keys(FEEDBACK_AUTOMATION_STATUSES));
const PRIORITY_SET = new Set(["Nízká", "Běžná", "Důležitá", "Kritická"]);
const REPLY_RESUME_STATUS_SET = new Set(["accepted", "in_progress"]);
const PUBLIC_NOTIFICATION_STATUSES = new Set([
  "accepted",
  "needs_details",
  "in_progress",
  "ready_for_verification",
  "done",
  "rejected",
  "duplicate"
]);
const MODULE_FEEDBACK_STATUS = Object.freeze({
  new: "Nová",
  accepted: "Převzato",
  needs_details: "Převzato",
  in_progress: "V řešení",
  ready_for_verification: "V řešení",
  done: "Hotovo",
  rejected: "Zamítnuto",
  duplicate: "Archiv"
});
const ATTACHMENT_TYPES = new Map([
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

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new SelfRepairStoreError(
      "Databáze hlášení není nastavená.",
      503,
      "feedback_case_database_missing"
    );
  }
  return db;
}

function bucket(env, required = false) {
  const value = env?.[BUCKET_BINDING] || null;
  if (!value && required) {
    throw new SelfRepairStoreError(
      "Úložiště příloh není nastavené.",
      503,
      "feedback_case_attachment_storage_missing"
    );
  }
  return value;
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

function safeJson(value, fallback = null) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function nowIso() {
  return new Date().toISOString();
}

function userIdentity(user) {
  return cleanText(user?.id || user?.email, 200);
}

function sameReporter(user, item) {
  const candidates = [user?.id, user?.email]
    .map((value) => cleanText(value, 200).toLowerCase())
    .filter(Boolean);
  return candidates.includes(cleanText(item?.reporterUserId, 200).toLowerCase());
}

function canManage(user) {
  return hasPermission(user, "self-repair", "manage");
}

function normalizeWorkflowStatus(value, fallback = "new") {
  const normalized = cleanText(value, 80).toLowerCase();
  if (!normalized) return fallback;
  if (!WORKFLOW_STATUS_SET.has(normalized)) {
    throw new SelfRepairStoreError("Vyberte platný stav hlášení.", 400, "feedback_case_status_invalid");
  }
  return normalized;
}

function normalizeAutomationStatus(value, fallback = "not_evaluated") {
  const normalized = cleanText(value, 80).toLowerCase();
  if (!normalized) return fallback;
  if (!AUTOMATION_STATUS_SET.has(normalized)) {
    throw new SelfRepairStoreError(
      "Vyberte platný stav automatické opravy.",
      400,
      "feedback_case_automation_status_invalid"
    );
  }
  return normalized;
}

function normalizePriority(value, fallback = "Běžná") {
  const normalized = cleanText(value, 40);
  return PRIORITY_SET.has(normalized) ? normalized : fallback;
}

function fallbackCaseNumber(row) {
  return `KSO-${cleanText(row?.id, 200)
    .replace(/^self-repair-case-/, "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 8)
    .toUpperCase()}`;
}

function publicModuleName(item) {
  return ["feedback", "self-repair"].includes(item.moduleKey)
    ? "Připomínky a chyby"
    : item.moduleName;
}

function publicTitle(item) {
  if (
    /^\[PRODUKČNÍ TEST\]/i.test(item.title) &&
    /(samoopravy|fáze|codex|deploy)/i.test(item.title)
  ) {
    return "Technické ověření systému";
  }
  return item.title;
}

function rowToCase(row) {
  if (!row) return null;
  const workflowStatus = normalizeWorkflowStatus(row.workflow_status, "new");
  const automationStatus = normalizeAutomationStatus(row.automation_status, "not_evaluated");
  return {
    id: cleanText(row.id, 200),
    feedbackId: cleanText(row.feedback_id, 200),
    caseNumber: cleanText(row.case_number, 80) || fallbackCaseNumber(row),
    caseType: cleanText(row.case_type, 80) === "improvement" ? "improvement" : "bug",
    caseTypeLabel: cleanText(row.case_type, 80) === "improvement" ? "Připomínka" : "Chyba",
    workflowStatus,
    workflowStatusLabel: FEEDBACK_WORKFLOW_STATUSES[workflowStatus],
    priority: normalizePriority(row.priority),
    moduleKey: cleanText(row.module_key, 100),
    moduleName: cleanText(row.module_key, 100) === "feedback"
      ? "Připomínky a chyby"
      : cleanText(row.module_name, 200),
    title: cleanText(row.title, 240),
    description: cleanText(row.description, 8000),
    expectedBehavior: cleanText(row.expected_behavior, 5000),
    sourceRoute: cleanText(row.source_route, 600),
    buildVersion: cleanText(row.build_version, 100),
    buildCommit: cleanText(row.build_commit, 160),
    browserInfo: cleanText(row.browser_info, 600),
    screenInfo: cleanText(row.screen_info, 300),
    technicalContext: parseJson(row.technical_context_json, {}),
    reporterUserId: cleanText(row.reporter_user_id, 200),
    reporterUserName: cleanText(row.reporter_user_name, 240),
    assigneeUserId: cleanText(row.assignee_user_id, 200),
    assigneeUserName: cleanText(row.assignee_user_name, 240),
    publicMessage: cleanText(row.public_message, 8000),
    detailsQuestion: cleanText(row.details_question, 8000),
    resumeWorkflowStatus: REPLY_RESUME_STATUS_SET.has(cleanText(row.resume_workflow_status, 80))
      ? cleanText(row.resume_workflow_status, 80)
      : "accepted",
    automationStatus,
    automationStatusLabel: FEEDBACK_AUTOMATION_STATUSES[automationStatus],
    internalNote: cleanText(row.internal_note, 8000),
    triageSummary: cleanText(row.triage_summary, 5000),
    targetRepoKey: cleanText(row.target_repo_key, 200),
    targetProductionUrl: cleanText(row.target_production_url, 500),
    createdAt: cleanText(row.created_at, 80),
    updatedAt: cleanText(row.updated_at, 80),
    lastPublicUpdateAt: cleanText(row.last_public_update_at, 80),
    readyForVerificationAt: cleanText(row.ready_for_verification_at, 80),
    verifiedAt: cleanText(row.verified_at, 80)
  };
}

function rowToMessage(row) {
  return {
    id: cleanText(row?.id, 200),
    caseId: cleanText(row?.case_id, 200),
    visibility: cleanText(row?.visibility, 40) === "internal" ? "internal" : "public",
    messageType: cleanText(row?.message_type, 80),
    body: cleanText(row?.body, 8000),
    authorUserId: cleanText(row?.author_user_id, 200),
    authorUserName: cleanText(row?.author_user_name, 240),
    authorRole: cleanText(row?.author_role, 80),
    createdAt: cleanText(row?.created_at, 80)
  };
}

function rowToAudit(row) {
  return {
    id: cleanText(row?.id, 200),
    action: cleanText(row?.action, 100),
    changedByUserName: cleanText(row?.changed_by_user_name, 240),
    changedAt: cleanText(row?.changed_at, 80),
    before: parseJson(row?.before_json, null),
    after: parseJson(row?.after_json, null),
    note: cleanText(row?.note, 2000)
  };
}

function rowToAttachment(row) {
  const caseId = cleanText(row?.case_id, 200);
  const id = cleanText(row?.id, 200);
  return {
    id,
    caseId,
    messageId: cleanText(row?.message_id, 200),
    visibility: cleanText(row?.visibility, 40) === "internal" ? "internal" : "public",
    filename: cleanText(row?.file_name, 240),
    contentType: cleanText(row?.content_type, 160),
    sizeBytes: Math.max(0, Number(row?.size_bytes || 0)),
    createdAt: cleanText(row?.created_at, 80),
    openUrl: `/api/self-repair/cases/${encodeURIComponent(caseId)}/attachments/${encodeURIComponent(id)}`
  };
}

function publicCase(item, user) {
  const own = sameReporter(user, item);
  return {
    id: item.id,
    caseNumber: item.caseNumber,
    caseType: item.caseType,
    caseTypeLabel: item.caseTypeLabel,
    workflowStatus: item.workflowStatus,
    workflowStatusLabel: item.workflowStatusLabel,
    priority: item.priority,
    moduleKey: item.moduleKey,
    moduleName: publicModuleName(item),
    title: publicTitle(item),
    description: item.description,
    expectedBehavior: item.expectedBehavior,
    sourceRoute: item.sourceRoute,
    reporterUserName: item.reporterUserName,
    assigneeUserName: item.assigneeUserName,
    publicMessage: item.publicMessage,
    detailsQuestion: item.detailsQuestion,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastPublicUpdateAt: item.lastPublicUpdateAt,
    readyForVerificationAt: item.readyForVerificationAt,
    verifiedAt: item.verifiedAt,
    isOwn: own,
    canReply: own && item.workflowStatus === "needs_details",
    canVerify: own && item.workflowStatus === "ready_for_verification"
  };
}

function caseForUser(item, user) {
  if (!canManage(user)) return publicCase(item, user);
  return {
    ...item,
    isOwn: sameReporter(user, item),
    canReply: sameReporter(user, item) && item.workflowStatus === "needs_details",
    canVerify: sameReporter(user, item) && item.workflowStatus === "ready_for_verification"
  };
}

async function findCaseRow(db, caseId) {
  return db.prepare(`
    SELECT *
    FROM self_repair_cases
    WHERE id = ? AND source = 'user_feedback'
    LIMIT 1
  `).bind(cleanText(caseId, 200)).first();
}

function listFilters(items, filters = {}, user) {
  const status = cleanText(filters.status, 80).toLowerCase();
  const priority = cleanText(filters.priority, 40);
  const moduleKey = cleanText(filters.moduleKey || filters.module, 100).toLowerCase();
  const author = cleanText(filters.author, 240).toLowerCase();
  const assignee = cleanText(filters.assignee, 240).toLowerCase();
  const search = cleanText(filters.search, 300).toLowerCase();
  const own = filters.own === true || cleanText(filters.own, 20) === "true";
  const limit = Math.min(500, Math.max(1, Number(filters.limit || 300) || 300));

  return items.filter((item) => {
    if (own && !sameReporter(user, item)) return false;
    if (status && item.workflowStatus !== status) return false;
    if (priority && item.priority !== priority) return false;
    if (moduleKey && item.moduleKey.toLowerCase() !== moduleKey) return false;
    if (author && !item.reporterUserName.toLowerCase().includes(author)) return false;
    if (assignee && !item.assigneeUserName.toLowerCase().includes(assignee)) return false;
    if (search) {
      const text = [
        item.caseNumber,
        item.title,
        item.description,
        item.moduleName,
        item.reporterUserName,
        item.assigneeUserName,
        item.publicMessage
      ].join(" ").toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  }).slice(0, limit);
}

export async function listFeedbackCases(env, user, filters = {}) {
  const db = database(env, true);
  try {
    const result = await db.prepare(`
      SELECT *
      FROM self_repair_cases
      WHERE source = 'user_feedback'
      ORDER BY
        CASE workflow_status
          WHEN 'needs_details' THEN 1
          WHEN 'new' THEN 2
          WHEN 'accepted' THEN 3
          WHEN 'in_progress' THEN 4
          WHEN 'ready_for_verification' THEN 5
          ELSE 6
        END,
        updated_at DESC
      LIMIT 500
    `).all();
    const all = (result.results || []).map(rowToCase).filter(Boolean);
    const filtered = listFilters(all, filters, user);
    return {
      cases: filtered.map((item) => caseForUser(item, user)),
      total: all.length,
      ownTotal: all.filter((item) => sameReporter(user, item)).length,
      permissions: {
        canCreate: hasPermission(user, "feedback", "create"),
        canManage: canManage(user)
      }
    };
  } catch (error) {
    throw feedbackDbError(error);
  }
}

export async function getFeedbackCase(env, user, caseId) {
  const db = database(env, true);
  try {
    const row = await findCaseRow(db, caseId);
    if (!row) {
      throw new SelfRepairStoreError(
        "Hlášení neexistuje nebo k němu nemáte přístup.",
        404,
        "feedback_case_not_found"
      );
    }
    const item = rowToCase(row);
    const manager = canManage(user);
    const [messagesResult, attachmentResult, auditResult, jobsResult] = await Promise.all([
      db.prepare(`
        SELECT * FROM self_repair_case_messages
        WHERE case_id = ? ${manager ? "" : "AND visibility = 'public'"}
        ORDER BY created_at ASC
      `).bind(item.id).all(),
      db.prepare(`
        SELECT * FROM self_repair_case_attachments
        WHERE case_id = ? ${manager ? "" : "AND visibility = 'public'"}
        ORDER BY created_at ASC
      `).bind(item.id).all(),
      manager
        ? db.prepare(`
            SELECT * FROM self_repair_case_audit_log
            WHERE case_id = ?
            ORDER BY changed_at DESC
            LIMIT 300
          `).bind(item.id).all()
        : Promise.resolve({ results: [] }),
      manager
        ? db.prepare(`
            SELECT * FROM self_repair_codex_jobs
            WHERE case_id = ?
            ORDER BY created_at DESC
            LIMIT 20
          `).bind(item.id).all()
        : Promise.resolve({ results: [] })
    ]);
    return {
      case: caseForUser(item, user),
      messages: (messagesResult.results || []).map(rowToMessage),
      attachments: (attachmentResult.results || []).map(rowToAttachment),
      audit: (auditResult.results || []).map(rowToAudit),
      codexJobs: (jobsResult.results || []).map(rowToCodexJob),
      permissions: {
        canManage: manager,
        canReply: sameReporter(user, item) && item.workflowStatus === "needs_details",
        canVerify: sameReporter(user, item) && item.workflowStatus === "ready_for_verification"
      },
      codex: codexCapability(env)
    };
  } catch (error) {
    if (error instanceof SelfRepairStoreError) throw error;
    throw feedbackDbError(error);
  }
}

function notificationStatement(db, item, type, title, message, changedAt) {
  const dedupeKey = `${item.id}:${type}:${changedAt}`;
  return db.prepare(`
    INSERT OR IGNORE INTO feedback_case_notifications (
      id, case_id, user_id, type, title, message, dedupe_key, read_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
  `).bind(
    randomId("feedback-notification"),
    item.id,
    item.reporterUserId,
    type,
    cleanText(title, 240),
    cleanText(message, 1000),
    dedupeKey,
    changedAt
  );
}

function workflowSnapshot(item) {
  return {
    workflowStatus: item.workflowStatus,
    priority: item.priority,
    assigneeUserId: item.assigneeUserId,
    assigneeUserName: item.assigneeUserName,
    detailsQuestion: item.detailsQuestion,
    automationStatus: item.automationStatus,
    publicMessage: item.publicMessage,
    internalNote: item.internalNote
  };
}

export async function updateFeedbackCase(env, user, caseId, input = {}) {
  if (!canManage(user)) {
    throw new SelfRepairStoreError("Nemáte oprávnění spravovat hlášení.", 403, "feedback_case_manage_forbidden");
  }
  const db = database(env, true);
  try {
    const existing = rowToCase(await findCaseRow(db, caseId));
    if (!existing) {
      throw new SelfRepairStoreError("Hlášení nebylo nalezeno.", 404, "feedback_case_not_found");
    }

    const workflowStatus = Object.prototype.hasOwnProperty.call(input, "workflowStatus")
      ? normalizeWorkflowStatus(input.workflowStatus)
      : existing.workflowStatus;
    const priority = Object.prototype.hasOwnProperty.call(input, "priority")
      ? normalizePriority(input.priority, existing.priority)
      : existing.priority;
    const automationStatus = Object.prototype.hasOwnProperty.call(input, "automationStatus")
      ? normalizeAutomationStatus(input.automationStatus, existing.automationStatus)
      : existing.automationStatus;
    const assigneeUserId = Object.prototype.hasOwnProperty.call(input, "assigneeUserId")
      ? cleanText(input.assigneeUserId, 200)
      : existing.assigneeUserId;
    const assigneeUserName = Object.prototype.hasOwnProperty.call(input, "assigneeUserName")
      ? cleanText(input.assigneeUserName, 240)
      : existing.assigneeUserName;
    const internalNote = Object.prototype.hasOwnProperty.call(input, "internalNote")
      ? cleanText(input.internalNote, 8000)
      : existing.internalNote;
    const publicMessage = cleanText(input.publicMessage, 8000);
    if (
      workflowStatus === "ready_for_verification" &&
      existing.workflowStatus !== "ready_for_verification" &&
      !publicMessage
    ) {
      throw new SelfRepairStoreError(
        "Napište uživateli, co bylo opraveno a co má otestovat.",
        400,
        "feedback_case_verification_message_required"
      );
    }
    const detailsQuestion = workflowStatus === "needs_details"
      ? cleanText(input.detailsQuestion || existing.detailsQuestion, 8000)
      : "";
    if (workflowStatus === "needs_details" && !detailsQuestion) {
      throw new SelfRepairStoreError(
        "Napište uživateli konkrétní otázku k doplnění.",
        400,
        "feedback_case_details_question_required"
      );
    }
    const resumeWorkflowStatus = REPLY_RESUME_STATUS_SET.has(cleanText(input.resumeWorkflowStatus, 80))
      ? cleanText(input.resumeWorkflowStatus, 80)
      : existing.resumeWorkflowStatus;
    const now = nowIso();
    const actorId = userIdentity(user);
    const actorName = cleanText(user?.name || user?.email || "Řešitel", 240);
    const next = {
      ...existing,
      workflowStatus,
      workflowStatusLabel: FEEDBACK_WORKFLOW_STATUSES[workflowStatus],
      priority,
      automationStatus,
      automationStatusLabel: FEEDBACK_AUTOMATION_STATUSES[automationStatus],
      assigneeUserId,
      assigneeUserName,
      internalNote,
      publicMessage: publicMessage || existing.publicMessage,
      detailsQuestion,
      resumeWorkflowStatus,
      updatedAt: now,
      lastPublicUpdateAt: publicMessage || workflowStatus !== existing.workflowStatus
        ? now
        : existing.lastPublicUpdateAt,
      readyForVerificationAt: workflowStatus === "ready_for_verification" && existing.workflowStatus !== workflowStatus
        ? now
        : existing.readyForVerificationAt,
      verifiedAt: workflowStatus === "done" && existing.workflowStatus !== workflowStatus
        ? now
        : existing.verifiedAt
    };

    const statements = [
      db.prepare(`
        UPDATE self_repair_cases
        SET workflow_status = ?, priority = ?, assignee_user_id = ?, assignee_user_name = ?,
            internal_note = ?, public_message = ?, details_question = ?,
            resume_workflow_status = ?, automation_status = ?, last_public_update_at = ?,
            ready_for_verification_at = ?, verified_at = ?, updated_at = ?, updated_by_user_id = ?
        WHERE id = ?
      `).bind(
        next.workflowStatus,
        next.priority,
        nullableText(next.assigneeUserId, 200),
        nullableText(next.assigneeUserName, 240),
        nullableText(next.internalNote, 8000),
        nullableText(next.publicMessage, 8000),
        nullableText(next.detailsQuestion, 8000),
        next.resumeWorkflowStatus,
        next.automationStatus,
        nullableText(next.lastPublicUpdateAt, 80),
        nullableText(next.readyForVerificationAt, 80),
        nullableText(next.verifiedAt, 80),
        now,
        actorId,
        next.id
      ),
      db.prepare(`
        INSERT INTO self_repair_case_audit_log (
          id, case_id, action, changed_by_user_id, changed_by_user_name,
          changed_at, before_json, after_json, note
        ) VALUES (?, ?, 'workflow_updated', ?, ?, ?, ?, ?, ?)
      `).bind(
        randomId("self-repair-audit"),
        next.id,
        actorId,
        actorName,
        now,
        safeJson(workflowSnapshot(existing), {}),
        safeJson(workflowSnapshot(next), {}),
        nullableText(input.auditNote || "Aktualizován průběh hlášení.", 2000)
      )
    ];

    if (publicMessage) {
      statements.push(db.prepare(`
        INSERT INTO self_repair_case_messages (
          id, case_id, visibility, message_type, body,
          author_user_id, author_user_name, author_role, created_at
        ) VALUES (?, ?, 'public', 'resolver_message', ?, ?, ?, ?, ?)
      `).bind(
        randomId("feedback-message"),
        next.id,
        publicMessage,
        actorId,
        actorName,
        cleanText(user?.role, 80),
        now
      ));
    }

    if (workflowStatus !== existing.workflowStatus && PUBLIC_NOTIFICATION_STATUSES.has(workflowStatus)) {
      statements.push(notificationStatement(
        db,
        next,
        `status_${workflowStatus}`,
        `${next.caseNumber}: ${next.workflowStatusLabel}`,
        publicMessage || detailsQuestion || `Stav hlášení se změnil na ${next.workflowStatusLabel}.`,
        now
      ));
    } else if (publicMessage) {
      statements.push(notificationStatement(
        db,
        next,
        "resolver_message",
        `${next.caseNumber}: nová zpráva`,
        publicMessage,
        now
      ));
    }

    if (next.feedbackId) {
      statements.push(db.prepare(`
        UPDATE module_feedback
        SET status = ?, priority = ?, internal_note = ?, resolved_at = ?,
            resolved_by_user_id = ?
        WHERE id = ?
      `).bind(
        MODULE_FEEDBACK_STATUS[next.workflowStatus] || "Nová",
        next.priority,
        nullableText(next.internalNote, 8000),
        ["done", "rejected", "duplicate"].includes(next.workflowStatus) ? now : null,
        ["done", "rejected", "duplicate"].includes(next.workflowStatus) ? actorId : null,
        next.feedbackId
      ));
    }

    await db.batch(statements);
    return {
      case: caseForUser(next, user),
      previousWorkflowStatus: existing.workflowStatus,
      workflowStatusChanged: existing.workflowStatus !== workflowStatus
    };
  } catch (error) {
    if (error instanceof SelfRepairStoreError) throw error;
    throw feedbackDbError(error);
  }
}

function safeFilename(value) {
  return cleanText(value, 240)
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
}

async function prepareAttachment(file) {
  if (!file) return null;
  if (typeof file.arrayBuffer !== "function") {
    throw new SelfRepairStoreError("Vyberte platnou přílohu.", 400, "feedback_case_attachment_invalid");
  }
  const filename = safeFilename(file.name);
  const sizeBytes = Number(file.size || 0);
  if (!filename || sizeBytes <= 0) {
    throw new SelfRepairStoreError("Příloha je prázdná.", 400, "feedback_case_attachment_empty");
  }
  if (sizeBytes > SELF_REPAIR_ATTACHMENT_MAX_SIZE_BYTES) {
    throw new SelfRepairStoreError("Příloha může mít nejvýše 10 MB.", 413, "feedback_case_attachment_too_large");
  }
  const extension = filename.split(".").at(-1)?.toLowerCase() || "";
  const contentType = ATTACHMENT_TYPES.get(extension);
  if (!contentType) {
    throw new SelfRepairStoreError(
      `Nepovolený typ přílohy. Povolené typy: ${SELF_REPAIR_ATTACHMENT_ACCEPT}.`,
      415,
      "feedback_case_attachment_type_invalid"
    );
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== sizeBytes) {
    throw new SelfRepairStoreError("Přílohu se nepodařilo načíst celou.", 400, "feedback_case_attachment_size_mismatch");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const checksumSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { filename, sizeBytes, contentType, bytes, checksumSha256 };
}

export async function replyToFeedbackCase(env, user, caseId, input = {}, options = {}) {
  const db = database(env, true);
  const item = rowToCase(await findCaseRow(db, caseId));
  if (!item) {
    throw new SelfRepairStoreError("Hlášení nebylo nalezeno.", 404, "feedback_case_not_found");
  }
  if (!sameReporter(user, item)) {
    throw new SelfRepairStoreError(
      "Doplnění může odeslat pouze autor hlášení.",
      403,
      "feedback_case_reply_forbidden"
    );
  }
  if (item.workflowStatus !== "needs_details") {
    throw new SelfRepairStoreError(
      "Toto hlášení nyní nečeká na doplnění.",
      409,
      "feedback_case_reply_not_expected"
    );
  }
  const body = cleanText(input.body, 8000);
  if (!body) {
    throw new SelfRepairStoreError("Napište odpověď řešiteli.", 400, "feedback_case_reply_required");
  }

  const attachment = await prepareAttachment(options.attachment);
  const messageId = randomId("feedback-message");
  const attachmentId = attachment ? randomId("self-repair-attachment") : "";
  const storageKey = attachment
    ? `self-repair/${item.id}/${attachmentId}-${safeFilename(attachment.filename).replace(/[^a-zA-Z0-9._-]+/g, "-")}`
    : "";
  const now = nowIso();
  const actorId = userIdentity(user);
  const actorName = cleanText(user?.name || user?.email || "Uživatel", 240);
  let stored = false;
  try {
    if (attachment) {
      await bucket(env, true).put(storageKey, attachment.bytes, {
        httpMetadata: { contentType: attachment.contentType },
        customMetadata: {
          caseId: item.id,
          messageId,
          attachmentId,
          uploadedByUserId: actorId,
          checksumSha256: attachment.checksumSha256
        }
      });
      stored = true;
    }
    const statements = [
      db.prepare(`
        INSERT INTO self_repair_case_messages (
          id, case_id, visibility, message_type, body,
          author_user_id, author_user_name, author_role, created_at
        ) VALUES (?, ?, 'public', 'reporter_reply', ?, ?, ?, ?, ?)
      `).bind(messageId, item.id, body, actorId, actorName, cleanText(user?.role, 80), now),
      db.prepare(`
        UPDATE self_repair_cases
        SET workflow_status = ?, details_question = NULL, public_message = ?,
            last_public_update_at = ?, updated_at = ?, updated_by_user_id = ?
        WHERE id = ?
      `).bind(item.resumeWorkflowStatus, body, now, now, actorId, item.id),
      db.prepare(`
        INSERT INTO self_repair_case_audit_log (
          id, case_id, action, changed_by_user_id, changed_by_user_name,
          changed_at, before_json, after_json, note
        ) VALUES (?, ?, 'reporter_replied', ?, ?, ?, ?, ?, ?)
      `).bind(
        randomId("self-repair-audit"),
        item.id,
        actorId,
        actorName,
        now,
        safeJson({ workflowStatus: item.workflowStatus }, {}),
        safeJson({ workflowStatus: item.resumeWorkflowStatus, attachmentId }, {}),
        attachment ? "Autor doplnil informace a přílohu." : "Autor doplnil informace."
      )
    ];
    if (attachment) {
      statements.push(db.prepare(`
        INSERT INTO self_repair_case_attachments (
          id, case_id, feedback_id, file_name, content_type, size_bytes,
          storage_key, checksum_sha256, uploaded_by_user_id, created_at,
          message_id, visibility
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public')
      `).bind(
        attachmentId,
        item.id,
        item.feedbackId || "",
        attachment.filename,
        attachment.contentType,
        attachment.sizeBytes,
        storageKey,
        attachment.checksumSha256,
        actorId,
        now,
        messageId
      ));
    }
    if (item.feedbackId) {
      statements.push(db.prepare(`
        UPDATE module_feedback
        SET status = ?, resolved_at = NULL, resolved_by_user_id = NULL
        WHERE id = ?
      `).bind(
        MODULE_FEEDBACK_STATUS[item.resumeWorkflowStatus] || "Převzato",
        item.feedbackId
      ));
    }
    await db.batch(statements);
    return getFeedbackCase(env, user, item.id);
  } catch (error) {
    if (stored) {
      try {
        await bucket(env)?.delete(storageKey);
      } catch {
        // Best-effort rollback of an R2 object after a failed atomic D1 write.
      }
    }
    if (error instanceof SelfRepairStoreError) throw error;
    throw feedbackDbError(error);
  }
}

export async function verifyFeedbackCase(env, user, caseId, result, note = "") {
  const db = database(env, true);
  const item = rowToCase(await findCaseRow(db, caseId));
  if (!item) {
    throw new SelfRepairStoreError("Hlášení nebylo nalezeno.", 404, "feedback_case_not_found");
  }
  if (!sameReporter(user, item)) {
    throw new SelfRepairStoreError(
      "Opravu může ověřit pouze autor hlášení.",
      403,
      "feedback_case_verify_forbidden"
    );
  }
  if (item.workflowStatus !== "ready_for_verification") {
    throw new SelfRepairStoreError(
      "Hlášení nyní není připravené k ověření.",
      409,
      "feedback_case_verify_not_ready"
    );
  }
  const normalizedResult = cleanText(result, 40);
  if (!["fixed", "persists"].includes(normalizedResult)) {
    throw new SelfRepairStoreError("Vyberte výsledek ověření.", 400, "feedback_case_verify_result_invalid");
  }
  const workflowStatus = normalizedResult === "fixed" ? "done" : "in_progress";
  const message = cleanText(note, 8000) || (
    normalizedResult === "fixed"
      ? "Autor potvrdil, že oprava funguje."
      : "Autor oznámil, že problém stále trvá."
  );
  const now = nowIso();
  const actorId = userIdentity(user);
  const actorName = cleanText(user?.name || user?.email || "Uživatel", 240);
  await db.batch([
    db.prepare(`
      UPDATE self_repair_cases
      SET workflow_status = ?, public_message = ?, last_public_update_at = ?,
          verified_at = ?, updated_at = ?, updated_by_user_id = ?
      WHERE id = ?
    `).bind(
      workflowStatus,
      message,
      now,
      normalizedResult === "fixed" ? now : null,
      now,
      actorId,
      item.id
    ),
    db.prepare(`
      INSERT INTO self_repair_case_messages (
        id, case_id, visibility, message_type, body,
        author_user_id, author_user_name, author_role, created_at
      ) VALUES (?, ?, 'public', ?, ?, ?, ?, ?, ?)
    `).bind(
      randomId("feedback-message"),
      item.id,
      normalizedResult === "fixed" ? "verification_fixed" : "verification_failed",
      message,
      actorId,
      actorName,
      cleanText(user?.role, 80),
      now
    ),
    db.prepare(`
      INSERT INTO self_repair_case_audit_log (
        id, case_id, action, changed_by_user_id, changed_by_user_name,
        changed_at, before_json, after_json, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      randomId("self-repair-audit"),
      item.id,
      normalizedResult === "fixed" ? "repair_verified" : "repair_still_failing",
      actorId,
      actorName,
      now,
      safeJson({ workflowStatus: item.workflowStatus }, {}),
      safeJson({ workflowStatus }, {}),
      message
    ),
    ...(item.feedbackId ? [
      db.prepare(`
        UPDATE module_feedback
        SET status = ?, resolved_at = ?, resolved_by_user_id = ?
        WHERE id = ?
      `).bind(
        MODULE_FEEDBACK_STATUS[workflowStatus] || "V řešení",
        workflowStatus === "done" ? now : null,
        workflowStatus === "done" ? actorId : null,
        item.feedbackId
      )
    ] : [])
  ]);
  return getFeedbackCase(env, user, item.id);
}

export async function listFeedbackNotifications(env, user) {
  const db = database(env, true);
  const identity = userIdentity(user);
  const identifiers = [...new Set([identity, cleanText(user?.email, 200)].filter(Boolean))];
  if (!identifiers.length) return { notifications: [], unreadCount: 0 };
  const placeholders = identifiers.map(() => "?").join(", ");
  try {
    const result = await db.prepare(`
      SELECT *
      FROM feedback_case_notifications
      WHERE user_id IN (${placeholders})
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(...identifiers).all();
    const notifications = (result.results || []).map((row) => ({
      id: cleanText(row.id, 200),
      caseId: cleanText(row.case_id, 200),
      type: cleanText(row.type, 100),
      title: cleanText(row.title, 240),
      message: cleanText(row.message, 1000),
      readAt: cleanText(row.read_at, 80),
      createdAt: cleanText(row.created_at, 80)
    }));
    return {
      notifications,
      unreadCount: notifications.filter((item) => !item.readAt).length
    };
  } catch (error) {
    throw feedbackDbError(error);
  }
}

export async function markFeedbackNotificationRead(env, user, notificationId) {
  const db = database(env, true);
  const identity = userIdentity(user);
  const email = cleanText(user?.email, 200);
  const result = await db.prepare(`
    UPDATE feedback_case_notifications
    SET read_at = COALESCE(read_at, ?)
    WHERE id = ? AND user_id IN (?, ?)
  `).bind(nowIso(), cleanText(notificationId, 200), identity, email).run();
  if (!Number(result.meta?.changes || 0)) {
    throw new SelfRepairStoreError("Notifikace nebyla nalezena.", 404, "feedback_notification_not_found");
  }
  return { ok: true };
}

function rowToCodexJob(row) {
  return {
    id: cleanText(row?.id, 200),
    caseId: cleanText(row?.case_id, 200),
    status: cleanText(row?.status, 80),
    promptText: cleanText(row?.prompt_text, 20000),
    requestedByUserName: cleanText(row?.requested_by_user_name, 240),
    runnerName: cleanText(row?.runner_name, 200),
    externalTaskId: cleanText(row?.external_task_id, 300),
    externalTaskUrl: cleanText(row?.external_task_url, 700),
    errorMessage: cleanText(row?.error_message, 2000),
    createdAt: cleanText(row?.created_at, 80),
    submittedAt: cleanText(row?.submitted_at, 80),
    completedAt: cleanText(row?.completed_at, 80),
    updatedAt: cleanText(row?.updated_at, 80)
  };
}

export function codexCapability(env) {
  const genericConfigured = Boolean(
    cleanText(env?.CODEX_REPAIR_RUNNER_URL, 700) &&
    cleanText(env?.CODEX_REPAIR_RUNNER_TOKEN, 2000)
  );
  const githubConfigured = Boolean(cleanText(env?.GITHUB_CODEX_TOKEN, 2000));
  const configured = genericConfigured || githubConfigured;
  const repository = cleanText(env?.CODEX_REPAIR_GITHUB_REPOSITORY, 300) || "kaiser-smart/kaiser-control-center";
  return {
    configured,
    status: configured ? "ready" : "not_configured",
    mode: githubConfigured ? "github_actions" : genericConfigured ? "custom" : "none",
    repository: githubConfigured ? repository : "",
    runnerName: configured
      ? cleanText(env?.CODEX_REPAIR_RUNNER_NAME, 200) || (githubConfigured ? "Codex GitHub Action" : "Codex repair runner")
      : ""
  };
}

function codexPrompt(item) {
  return [
    `OPRAVA PŘÍPADU ${item.caseNumber}`,
    "",
    `Název: ${item.title}`,
    `Typ: ${item.caseTypeLabel}`,
    `Modul: ${item.moduleName} (${item.moduleKey})`,
    `Zdrojová cesta: ${item.sourceRoute || "neuvedena"}`,
    `Produkce: ${item.targetProductionUrl || "neuvedena"}`,
    "",
    "Popis:",
    item.description,
    "",
    "Očekávaný stav:",
    item.expectedBehavior || "Uživatel neuvedl.",
    "",
    "Poslední veřejná zpráva:",
    item.publicMessage || "Žádná.",
    "",
    "Povinný postup:",
    "1. Nejdřív si přečti aktuální PŘÍRUČKA.md a příslušnou Mantru i strojový kontrakt.",
    "2. Reprodukuj problém a ověř skutečnou příčinu.",
    "3. Oprav pouze potvrzený problém v repozitáři kaiser-control-center.",
    "4. Proveď cílené testy, build a responzivní kontrolu.",
    "5. Bez samostatného schválení nenasazuj produkci a neposílej externí komunikaci.",
    `6. Ve výsledku vždy uveď číslo případu ${item.caseNumber}.`
  ].join("\n");
}

export async function prepareFeedbackCodexJob(env, user, caseId) {
  if (!canManage(user)) {
    throw new SelfRepairStoreError("Nemáte oprávnění předat opravu Codexu.", 403, "feedback_codex_forbidden");
  }
  const db = database(env, true);
  const item = rowToCase(await findCaseRow(db, caseId));
  if (!item) {
    throw new SelfRepairStoreError("Hlášení nebylo nalezeno.", 404, "feedback_case_not_found");
  }
  const now = nowIso();
  const job = {
    id: randomId("feedback-codex-job"),
    caseId: item.id,
    status: "draft",
    promptText: codexPrompt(item),
    requestedByUserId: userIdentity(user),
    requestedByUserName: cleanText(user?.name || user?.email || "Správce", 240),
    createdAt: now,
    updatedAt: now
  };
  await db.batch([
    db.prepare(`
      INSERT INTO self_repair_codex_jobs (
        id, case_id, status, prompt_text, requested_by_user_id,
        requested_by_user_name, runner_name, external_task_id, external_task_url,
        error_message, created_at, submitted_at, completed_at, updated_at
      ) VALUES (?, ?, 'draft', ?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, NULL, ?)
    `).bind(
      job.id,
      job.caseId,
      job.promptText,
      job.requestedByUserId,
      job.requestedByUserName,
      now,
      now
    ),
    db.prepare(`
      INSERT INTO self_repair_case_audit_log (
        id, case_id, action, changed_by_user_id, changed_by_user_name,
        changed_at, before_json, after_json, note
      ) VALUES (?, ?, 'codex_prompt_prepared', ?, ?, ?, NULL, ?, ?)
    `).bind(
      randomId("self-repair-audit"),
      item.id,
      job.requestedByUserId,
      job.requestedByUserName,
      now,
      safeJson({ codexJobId: job.id, status: "draft" }, {}),
      "Zadání pro Codex bylo připraveno. Codex zatím nebyl spuštěn."
    )
  ]);
  return { job, capability: codexCapability(env) };
}

export async function submitFeedbackCodexJob(env, user, caseId, jobId, confirmation) {
  if (!canManage(user)) {
    throw new SelfRepairStoreError("Nemáte oprávnění předat opravu Codexu.", 403, "feedback_codex_forbidden");
  }
  if (cleanText(confirmation, 100) !== "PŘEDAT CODEXU") {
    throw new SelfRepairStoreError(
      "Předání Codexu vyžaduje přesné potvrzení PŘEDAT CODEXU.",
      400,
      "feedback_codex_confirmation_required"
    );
  }
  const capability = codexCapability(env);
  if (!capability.configured) {
    throw new SelfRepairStoreError(
      "Codex runner není nakonfigurovaný. Zadání zůstalo připravené, ale nebylo odesláno.",
      503,
      "feedback_codex_runner_not_configured"
    );
  }
  const db = database(env, true);
  const item = rowToCase(await findCaseRow(db, caseId));
  const jobRow = await db.prepare(`
    SELECT * FROM self_repair_codex_jobs
    WHERE id = ? AND case_id = ? AND status = 'draft'
    LIMIT 1
  `).bind(cleanText(jobId, 200), cleanText(caseId, 200)).first();
  if (!item || !jobRow) {
    throw new SelfRepairStoreError("Připravené zadání nebylo nalezeno.", 404, "feedback_codex_job_not_found");
  }
  const job = rowToCodexJob(jobRow);
  const now = nowIso();
  let result;
  try {
    if (capability.mode === "github_actions") {
      const repository = capability.repository;
      const workflow = cleanText(env?.CODEX_REPAIR_GITHUB_WORKFLOW, 200) || "feedback-codex-repair.yml";
      const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${cleanText(env.GITHUB_CODEX_TOKEN, 2000)}`,
          "content-type": "application/json",
          "user-agent": "kaiser-smart-feedback-workflow",
          "x-github-api-version": "2022-11-28"
        },
        body: JSON.stringify({
          ref: cleanText(env?.CODEX_REPAIR_GITHUB_REF, 100) || "main",
          inputs: {
            job_id: job.id,
            case_id: item.id,
            case_number: item.caseNumber,
            prompt: job.promptText
          }
        })
      });
      if (response.status !== 204) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(cleanText(payload.message, 1000) || `GitHub HTTP ${response.status}`);
      }
      result = {
        status: "submitted",
        runnerName: capability.runnerName,
        externalTaskId: job.id,
        externalTaskUrl: `https://github.com/${repository}/actions/workflows/${workflow}`
      };
    } else {
      const response = await fetch(cleanText(env.CODEX_REPAIR_RUNNER_URL, 700), {
        method: "POST",
        headers: {
          authorization: `Bearer ${cleanText(env.CODEX_REPAIR_RUNNER_TOKEN, 2000)}`,
          "content-type": "application/json",
          "idempotency-key": job.id
        },
        body: JSON.stringify({
          jobId: job.id,
          caseId: item.id,
          caseNumber: item.caseNumber,
          repository: item.targetRepoKey,
          prompt: job.promptText,
          requestedBy: userIdentity(user)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !cleanText(payload.taskId || payload.id, 300)) {
        throw new Error(cleanText(payload.error || payload.message, 1000) || `HTTP ${response.status}`);
      }
      result = {
        status: "submitted",
        runnerName: capability.runnerName,
        externalTaskId: cleanText(payload.taskId || payload.id, 300),
        externalTaskUrl: cleanText(payload.url, 700)
      };
    }
  } catch (error) {
    const message = cleanText(error?.message, 1000) || "Codex runner nevrátil potvrzení.";
    await db.batch([
      db.prepare(`
        UPDATE self_repair_codex_jobs
        SET status = 'failed', error_message = ?, updated_at = ?
        WHERE id = ?
      `).bind(message, now, job.id),
      db.prepare(`
        INSERT INTO self_repair_case_audit_log (
          id, case_id, action, changed_by_user_id, changed_by_user_name,
          changed_at, before_json, after_json, note
        ) VALUES (?, ?, 'codex_submit_failed', ?, ?, ?, ?, ?, ?)
      `).bind(
        randomId("self-repair-audit"),
        item.id,
        userIdentity(user),
        cleanText(user?.name || user?.email, 240),
        now,
        safeJson({ codexJobId: job.id, status: "draft" }, {}),
        safeJson({ codexJobId: job.id, status: "failed" }, {}),
        message
      )
    ]);
    throw new SelfRepairStoreError(
      "Předání Codexu selhalo. Zadání nebylo potvrzeně převzato.",
      502,
      "feedback_codex_submit_failed"
    );
  }

  await db.batch([
    db.prepare(`
      UPDATE self_repair_codex_jobs
      SET status = 'submitted', runner_name = ?, external_task_id = ?,
          external_task_url = ?, error_message = NULL, submitted_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      result.runnerName,
      result.externalTaskId,
      nullableText(result.externalTaskUrl, 700),
      now,
      now,
      job.id
    ),
    db.prepare(`
      UPDATE self_repair_cases
      SET automation_status = 'waiting_for_approval', updated_at = ?, updated_by_user_id = ?
      WHERE id = ?
    `).bind(now, userIdentity(user), item.id),
    db.prepare(`
      INSERT INTO self_repair_case_audit_log (
        id, case_id, action, changed_by_user_id, changed_by_user_name,
        changed_at, before_json, after_json, note
      ) VALUES (?, ?, 'codex_submitted', ?, ?, ?, ?, ?, ?)
    `).bind(
      randomId("self-repair-audit"),
      item.id,
      userIdentity(user),
      cleanText(user?.name || user?.email, 240),
      now,
      safeJson({ codexJobId: job.id, status: "draft" }, {}),
      safeJson({ codexJobId: job.id, status: "submitted", externalTaskId: result.externalTaskId }, {}),
      "Codex runner potvrdil převzetí zadání. Nasazení nebylo spuštěno."
    )
  ]);
  return { job: { ...job, ...result, submittedAt: now, updatedAt: now }, capability };
}

export async function recordFeedbackEmailResult(env, user, caseId, result = {}) {
  const db = database(env, true);
  const now = nowIso();
  await db.prepare(`
    INSERT INTO self_repair_case_audit_log (
      id, case_id, action, changed_by_user_id, changed_by_user_name,
      changed_at, before_json, after_json, note
    ) VALUES (?, ?, 'verification_email_result', ?, ?, ?, NULL, ?, ?)
  `).bind(
    randomId("self-repair-audit"),
    cleanText(caseId, 200),
    userIdentity(user),
    cleanText(user?.name || user?.email, 240),
    now,
    safeJson({
      status: cleanText(result.status, 80),
      provider: cleanText(result.provider, 120),
      providerMessageId: cleanText(result.providerMessageId, 300)
    }, {}),
    cleanText(result.status, 80) === "sent"
      ? "E-mail autorovi byl potvrzeně odeslán."
      : `E-mail autorovi nebyl odeslán: ${cleanText(result.errorMessage || result.reason || result.status, 800) || "neznámý důvod"}.`
  ).run();
}

function feedbackDbError(error) {
  const message = cleanText(error?.message, 1000);
  if (message.includes("no such table") || message.includes("no such column")) {
    return new SelfRepairStoreError(
      "Workflow hlášení čeká na databázovou migraci 0060.",
      503,
      "feedback_case_migration_missing"
    );
  }
  console.error("feedback_case.store_failed", { message });
  return new SelfRepairStoreError(
    "Hlášení se teď nepodařilo načíst nebo uložit.",
    500,
    "feedback_case_store_failed"
  );
}

export const FEEDBACK_CASE_INTERNALS = Object.freeze({
  WORKFLOW_STATUS_SET,
  AUTOMATION_STATUS_SET,
  PRIORITY_SET,
  PUBLIC_NOTIFICATION_STATUSES
});
