import { PERMISSION_MODULES } from "../../src/permissions.js";

const MODULE_RULES_DB_BINDING = "SMART_ODPADY_DB";
const RULE_TYPES = new Set(["rule", "automation"]);
const RULE_STATUSES = new Set(["active", "inactive", "draft", "error"]);
const TRIGGER_TYPES = new Set(["manual", "time", "event", "webhook"]);
const MODULE_ALIASES = {
  "dovolena-nemoc": "absence",
  "pravidla-automatizace": "absence"
};

export class ModuleRulesStoreError extends Error {
  constructor(message, status = 400, code = "module_rules_error") {
    super(message);
    this.name = "ModuleRulesStoreError";
    this.status = status;
    this.code = code;
  }
}

function moduleRulesDatabase(env, required = false) {
  const db = env?.[MODULE_RULES_DB_BINDING] || null;

  if (!db && required) {
    throw new ModuleRulesStoreError(
      "Databáze pravidel a automatizací není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "module_rules_database_missing"
    );
  }

  return db;
}

export function moduleRulesApiStatus(env) {
  return moduleRulesDatabase(env) ? "ready" : "waiting";
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function nullableString(value) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function booleanValue(value, fallback = false) {
  if (value === true || value === 1 || value === "1" || value === "true" || value === "on") {
    return true;
  }

  if (value === false || value === 0 || value === "0" || value === "false" || value === "off") {
    return false;
  }

  return fallback;
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${suffix}`;
}

export function normalizeModuleRuleModuleKey(value) {
  const cleaned = cleanString(value).toLowerCase();
  const moduleKey = MODULE_ALIASES[cleaned] || cleaned;

  if (!PERMISSION_MODULES.includes(moduleKey)) {
    throw new ModuleRulesStoreError("Neznámý modul pravidel.", 404, "module_rules_module_unknown");
  }

  return moduleKey;
}

function normalizeRuleType(value, fallback = "rule") {
  const type = cleanString(value || fallback).toLowerCase();
  return RULE_TYPES.has(type) ? type : fallback;
}

function normalizeRuleStatus(value, fallback = "draft") {
  const status = cleanString(value || fallback).toLowerCase();
  return RULE_STATUSES.has(status) ? status : fallback;
}

function normalizeTriggerType(value, fallback = "manual") {
  const triggerType = cleanString(value || fallback).toLowerCase();
  return TRIGGER_TYPES.has(triggerType) ? triggerType : fallback;
}

function jsonString(value, fallback = {}) {
  if (typeof value === "string") {
    const cleaned = value.trim();
    if (!cleaned) {
      return JSON.stringify(fallback);
    }

    try {
      JSON.parse(cleaned);
      return cleaned;
    } catch {
      throw new ModuleRulesStoreError("JSON podmínky nebo akce nejsou platné.", 400, "module_rules_json_invalid");
    }
  }

  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    throw new ModuleRulesStoreError("JSON podmínky nebo akce nejsou platné.", 400, "module_rules_json_invalid");
  }
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ error: "unserializable" });
  }
}

function dbError(error) {
  const message = cleanString(error?.message);
  if (message.includes("no such table")) {
    return new ModuleRulesStoreError(
      "Tabulky pravidel a automatizací nejsou v D1 připravené. Spusťte migraci 0015_create_module_rules.sql.",
      503,
      "module_rules_migration_missing"
    );
  }

  console.error("module_rules.store_failed", { message });
  return new ModuleRulesStoreError("Pravidla a automatizace se teď nepodařilo načíst nebo uložit.", 500, "module_rules_store_failed");
}

function rowToRule(row) {
  return {
    id: cleanString(row?.id),
    moduleKey: cleanString(row?.module_key),
    title: cleanString(row?.title),
    description: cleanString(row?.description),
    type: normalizeRuleType(row?.type),
    status: normalizeRuleStatus(row?.status),
    conditions: parseJson(row?.conditions_json),
    actions: parseJson(row?.actions_json),
    conditionsJson: cleanString(row?.conditions_json || "{}"),
    actionsJson: cleanString(row?.actions_json || "{}"),
    isAutomation: Boolean(Number(row?.is_automation || 0)),
    triggerType: normalizeTriggerType(row?.trigger_type),
    scheduleCron: cleanString(row?.schedule_cron),
    eventName: cleanString(row?.event_name),
    cloudRunner: cleanString(row?.cloud_runner),
    lastRunAt: cleanString(row?.last_run_at),
    nextRunAt: cleanString(row?.next_run_at),
    lastRunStatus: cleanString(row?.last_run_status),
    lastRunMessage: cleanString(row?.last_run_message),
    createdByUserId: cleanString(row?.created_by_user_id),
    createdAt: cleanString(row?.created_at),
    updatedByUserId: cleanString(row?.updated_by_user_id),
    updatedAt: cleanString(row?.updated_at)
  };
}

function rowToAuditLog(row) {
  return {
    id: cleanString(row?.id),
    ruleId: cleanString(row?.rule_id),
    moduleKey: cleanString(row?.module_key),
    action: cleanString(row?.action),
    changedByUserId: cleanString(row?.changed_by_user_id),
    changedAt: cleanString(row?.changed_at),
    before: parseJson(row?.before_json, null),
    after: parseJson(row?.after_json, null),
    note: cleanString(row?.note)
  };
}

function rowToAutomationRun(row) {
  return {
    id: cleanString(row?.id),
    ruleId: cleanString(row?.rule_id),
    moduleKey: cleanString(row?.module_key),
    startedAt: cleanString(row?.started_at),
    finishedAt: cleanString(row?.finished_at),
    status: cleanString(row?.status),
    message: cleanString(row?.message),
    errorCode: cleanString(row?.error_code),
    triggeredBy: cleanString(row?.triggered_by),
    dedupeKey: cleanString(row?.dedupe_key)
  };
}

function normalizeRulePayload(moduleKey, input = {}, existing = null) {
  const title = cleanString(input.title ?? existing?.title);
  if (!title) {
    throw new ModuleRulesStoreError("Vyplňte název pravidla nebo automatizace.", 400, "module_rules_title_required");
  }

  const type = normalizeRuleType(input.type ?? existing?.type, existing?.type || "rule");
  const isAutomation = booleanValue(input.isAutomation ?? input.is_automation, type === "automation");
  const triggerType = normalizeTriggerType(input.triggerType ?? input.trigger_type ?? existing?.triggerType, existing?.triggerType || (isAutomation ? "time" : "manual"));
  const status = normalizeRuleStatus(input.status ?? existing?.status, existing?.status || "draft");

  return {
    moduleKey,
    title,
    description: cleanString(input.description ?? existing?.description),
    type: isAutomation ? "automation" : type,
    status,
    conditionsJson: jsonString(input.conditionsJson ?? input.conditions_json ?? input.conditions ?? existing?.conditionsJson, {}),
    actionsJson: jsonString(input.actionsJson ?? input.actions_json ?? input.actions ?? existing?.actionsJson, {}),
    isAutomation,
    triggerType,
    scheduleCron: cleanString(input.scheduleCron ?? input.schedule_cron ?? existing?.scheduleCron),
    eventName: cleanString(input.eventName ?? input.event_name ?? existing?.eventName),
    cloudRunner: cleanString(input.cloudRunner ?? input.cloud_runner ?? existing?.cloudRunner),
    lastRunAt: cleanString(existing?.lastRunAt),
    nextRunAt: cleanString(input.nextRunAt ?? input.next_run_at ?? existing?.nextRunAt),
    lastRunStatus: cleanString(existing?.lastRunStatus),
    lastRunMessage: cleanString(existing?.lastRunMessage)
  };
}

function auditStatement(db, { ruleId, moduleKey, action, userId, before, after, note }) {
  return db
    .prepare(`
      INSERT INTO module_rule_audit_log (
        id,
        rule_id,
        module_key,
        action,
        changed_by_user_id,
        changed_at,
        before_json,
        after_json,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      randomId("module-rule-audit"),
      ruleId,
      moduleKey,
      action,
      cleanString(userId) || null,
      new Date().toISOString(),
      before ? safeJson(before) : null,
      after ? safeJson(after) : null,
      nullableString(note)
    );
}

async function getRuleRow(db, moduleKey, id) {
  return db
    .prepare("SELECT * FROM module_rules WHERE module_key = ? AND id = ? LIMIT 1")
    .bind(moduleKey, id)
    .first();
}

export async function listModuleRules(env, rawModuleKey) {
  const moduleKey = normalizeModuleRuleModuleKey(rawModuleKey);
  const db = moduleRulesDatabase(env, true);

  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM module_rules
        WHERE module_key = ?
        ORDER BY
          CASE status
            WHEN 'active' THEN 1
            WHEN 'draft' THEN 2
            WHEN 'error' THEN 3
            ELSE 4
          END,
          lower(title)
      `)
      .bind(moduleKey)
      .all();

    return (result.results || []).map(rowToRule);
  } catch (error) {
    throw dbError(error);
  }
}

export async function getModuleRule(env, rawModuleKey, id) {
  const moduleKey = normalizeModuleRuleModuleKey(rawModuleKey);
  const db = moduleRulesDatabase(env, true);
  const ruleId = cleanString(id);

  try {
    const row = await getRuleRow(db, moduleKey, ruleId);
    if (!row) {
      throw new ModuleRulesStoreError("Pravidlo nebo automatizace nebyla nalezena.", 404, "module_rules_not_found");
    }

    return rowToRule(row);
  } catch (error) {
    if (error instanceof ModuleRulesStoreError) {
      throw error;
    }
    throw dbError(error);
  }
}

export async function createModuleRule(env, rawModuleKey, input, currentUser) {
  const moduleKey = normalizeModuleRuleModuleKey(rawModuleKey);
  const db = moduleRulesDatabase(env, true);
  const now = new Date().toISOString();
  const id = randomId("module-rule");
  const item = normalizeRulePayload(moduleKey, input);
  const userId = cleanString(currentUser?.id);

  try {
    const insertStatement = db
      .prepare(`
        INSERT INTO module_rules (
          id,
          module_key,
          title,
          description,
          type,
          status,
          conditions_json,
          actions_json,
          is_automation,
          trigger_type,
          schedule_cron,
          event_name,
          cloud_runner,
          last_run_at,
          next_run_at,
          last_run_status,
          last_run_message,
          created_by_user_id,
          created_at,
          updated_by_user_id,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        moduleKey,
        item.title,
        nullableString(item.description),
        item.type,
        item.status,
        item.conditionsJson,
        item.actionsJson,
        item.isAutomation ? 1 : 0,
        item.triggerType,
        nullableString(item.scheduleCron),
        nullableString(item.eventName),
        nullableString(item.cloudRunner),
        null,
        nullableString(item.nextRunAt),
        null,
        null,
        nullableString(userId),
        now,
        nullableString(userId),
        now
      );

    const after = {
      id,
      ...item,
      createdByUserId: userId,
      createdAt: now,
      updatedByUserId: userId,
      updatedAt: now
    };

    await db.batch([
      insertStatement,
      auditStatement(db, {
        ruleId: id,
        moduleKey,
        action: "create",
        userId,
        before: null,
        after,
        note: cleanString(input?.auditNote || "Vytvořeno přes admin UI.")
      })
    ]);

    return getModuleRule(env, moduleKey, id);
  } catch (error) {
    if (error instanceof ModuleRulesStoreError) {
      throw error;
    }
    throw dbError(error);
  }
}

export async function updateModuleRule(env, rawModuleKey, id, input, currentUser) {
  const moduleKey = normalizeModuleRuleModuleKey(rawModuleKey);
  const db = moduleRulesDatabase(env, true);
  const ruleId = cleanString(id);
  const userId = cleanString(currentUser?.id);

  try {
    const existingRow = await getRuleRow(db, moduleKey, ruleId);
    if (!existingRow) {
      throw new ModuleRulesStoreError("Pravidlo nebo automatizace nebyla nalezena.", 404, "module_rules_not_found");
    }

    const existing = rowToRule(existingRow);
    const item = normalizeRulePayload(moduleKey, input, existing);
    const now = new Date().toISOString();
    const updateStatement = db
      .prepare(`
        UPDATE module_rules
        SET
          title = ?,
          description = ?,
          type = ?,
          status = ?,
          conditions_json = ?,
          actions_json = ?,
          is_automation = ?,
          trigger_type = ?,
          schedule_cron = ?,
          event_name = ?,
          cloud_runner = ?,
          next_run_at = ?,
          updated_by_user_id = ?,
          updated_at = ?
        WHERE module_key = ? AND id = ?
      `)
      .bind(
        item.title,
        nullableString(item.description),
        item.type,
        item.status,
        item.conditionsJson,
        item.actionsJson,
        item.isAutomation ? 1 : 0,
        item.triggerType,
        nullableString(item.scheduleCron),
        nullableString(item.eventName),
        nullableString(item.cloudRunner),
        nullableString(item.nextRunAt),
        nullableString(userId),
        now,
        moduleKey,
        ruleId
      );

    const after = {
      ...existing,
      ...item,
      updatedByUserId: userId,
      updatedAt: now
    };

    await db.batch([
      updateStatement,
      auditStatement(db, {
        ruleId,
        moduleKey,
        action: "update",
        userId,
        before: existing,
        after,
        note: cleanString(input?.auditNote || "Upraveno přes admin UI.")
      })
    ]);

    return getModuleRule(env, moduleKey, ruleId);
  } catch (error) {
    if (error instanceof ModuleRulesStoreError) {
      throw error;
    }
    throw dbError(error);
  }
}

export async function setModuleRuleStatus(env, rawModuleKey, id, status, currentUser) {
  const moduleKey = normalizeModuleRuleModuleKey(rawModuleKey);
  const normalizedStatus = normalizeRuleStatus(status);
  const db = moduleRulesDatabase(env, true);
  const ruleId = cleanString(id);
  const userId = cleanString(currentUser?.id);

  try {
    const existingRow = await getRuleRow(db, moduleKey, ruleId);
    if (!existingRow) {
      throw new ModuleRulesStoreError("Pravidlo nebo automatizace nebyla nalezena.", 404, "module_rules_not_found");
    }

    const existing = rowToRule(existingRow);
    const now = new Date().toISOString();
    const updateStatement = db
      .prepare(`
        UPDATE module_rules
        SET status = ?, updated_by_user_id = ?, updated_at = ?
        WHERE module_key = ? AND id = ?
      `)
      .bind(normalizedStatus, nullableString(userId), now, moduleKey, ruleId);
    const after = {
      ...existing,
      status: normalizedStatus,
      updatedByUserId: userId,
      updatedAt: now
    };

    await db.batch([
      updateStatement,
      auditStatement(db, {
        ruleId,
        moduleKey,
        action: normalizedStatus === "active" ? "activate" : "deactivate",
        userId,
        before: existing,
        after,
        note: normalizedStatus === "active" ? "Aktivováno přes admin UI." : "Deaktivováno přes admin UI."
      })
    ]);

    return getModuleRule(env, moduleKey, ruleId);
  } catch (error) {
    if (error instanceof ModuleRulesStoreError) {
      throw error;
    }
    throw dbError(error);
  }
}

export async function listModuleRuleAuditLog(env, rawModuleKey, id) {
  const moduleKey = normalizeModuleRuleModuleKey(rawModuleKey);
  const db = moduleRulesDatabase(env, true);
  const ruleId = cleanString(id);

  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM module_rule_audit_log
        WHERE module_key = ? AND rule_id = ?
        ORDER BY changed_at DESC
        LIMIT 100
      `)
      .bind(moduleKey, ruleId)
      .all();

    return (result.results || []).map(rowToAuditLog);
  } catch (error) {
    throw dbError(error);
  }
}

export async function listModuleAutomationRuns(env, rawModuleKey) {
  const moduleKey = normalizeModuleRuleModuleKey(rawModuleKey);
  const db = moduleRulesDatabase(env, true);

  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM module_automation_runs
        WHERE module_key = ?
        ORDER BY started_at DESC
        LIMIT 100
      `)
      .bind(moduleKey)
      .all();

    return (result.results || []).map(rowToAutomationRun);
  } catch (error) {
    throw dbError(error);
  }
}
