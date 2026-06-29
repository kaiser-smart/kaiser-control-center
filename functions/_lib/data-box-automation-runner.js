import { listDataBoxMessages } from "./data-box-store.js";
import { archiveDataBoxMessage, prepareDataBoxAction } from "./data-box-actions-store.js";
import { listModuleRules } from "./module-rules-store.js";

const DB_BINDING = "SMART_ODPADY_DB";
const MODULE_KEY = "data-box";
const RUNNER_NAME = "data-box-cloud-runner";
const DEFAULT_CRON = "*/30 * * * *";
const DEFAULT_TIME_ZONE = "Europe/Prague";

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

function database(env) {
  const db = env?.[DB_BINDING];
  if (!db) {
    throw new Error(`Cloudflare D1 binding ${DB_BINDING} není dostupný pro DS runner.`);
  }
  return db;
}

function parseJson(value, fallback = {}) {
  if (typeof value === "object" && value !== null) return value;
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function searchText(parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function containsAny(haystack, needles = []) {
  const normalized = searchText([haystack]);
  const values = Array.isArray(needles) ? needles : [needles];
  const active = values.map((item) => searchText([item])).filter(Boolean);
  return !active.length || active.some((needle) => normalized.includes(needle));
}

function messageMatchesRule(message, rule) {
  const conditions = parseJson(rule.conditions, {});
  const sender = searchText([message.senderName, message.senderBoxId]);
  const text = searchText([
    message.subject,
    message.senderName,
    message.senderBoxId,
    message.recipientName,
    message.recipientBoxId,
    message.isdsMessageId,
    message.id
  ]);
  const mailboxCondition = conditions.mailboxId || conditions.dataBoxId || conditions.mailboxIds || conditions.dataBoxIds || "";
  const mailboxIds = Array.isArray(mailboxCondition)
    ? mailboxCondition.map(cleanString).filter(Boolean)
    : cleanString(mailboxCondition)
      ? [cleanString(mailboxCondition)]
      : [];

  return (!mailboxIds.length || mailboxIds.includes(cleanString(message.dataBoxId)))
    && containsAny(sender, conditions.anySender || conditions.senderContains)
    && containsAny(text, conditions.anyText || conditions.textContains || conditions.subjectContains);
}

function normalizeAction(rule) {
  const actions = parseJson(rule.actions, {});
  const type = cleanString(actions.type || actions.action || "ARCHIVE").toUpperCase();
  const recipients = Array.isArray(actions.recipients)
    ? actions.recipients.map(cleanString).filter(Boolean)
    : cleanString(actions.recipient)
      ? [cleanString(actions.recipient)]
      : [];

  return { type, recipients };
}

async function insertAutomationRun(db, run) {
  await db
    .prepare(`
      INSERT INTO module_automation_runs (
        id,
        rule_id,
        module_key,
        started_at,
        finished_at,
        status,
        message,
        error_code,
        triggered_by,
        dedupe_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      run.id,
      run.ruleId,
      MODULE_KEY,
      run.startedAt,
      run.finishedAt,
      run.status,
      nullableString(run.message),
      nullableString(run.errorCode),
      nullableString(run.triggeredBy),
      nullableString(run.dedupeKey)
    )
    .run();
}

async function insertRunnerRun(db, run) {
  await db
    .prepare(`
      INSERT INTO module_automation_runner_runs (
        id,
        module_key,
        runner_name,
        started_at,
        scheduled_at,
        finished_at,
        triggered_by,
        status,
        rules_total,
        dry_run_count,
        skipped_count,
        failed_count,
        message,
        error_code,
        d1_binding,
        database_name,
        cron,
        time_zone,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      run.id,
      MODULE_KEY,
      RUNNER_NAME,
      run.startedAt,
      nullableString(run.scheduledAt),
      nullableString(run.finishedAt),
      nullableString(run.triggeredBy),
      run.status,
      Number(run.rulesTotal || 0),
      Number(run.dryRunCount || 0),
      Number(run.skippedCount || 0),
      Number(run.failedCount || 0),
      nullableString(run.message),
      nullableString(run.errorCode),
      DB_BINDING,
      cleanString(run.databaseName || "smart-odpady"),
      cleanString(run.cron || DEFAULT_CRON),
      cleanString(run.timeZone || DEFAULT_TIME_ZONE),
      run.createdAt
    )
    .run();
}

async function updateRunnerRun(db, id, patch) {
  await db
    .prepare(`
      UPDATE module_automation_runner_runs
      SET
        finished_at = ?,
        status = ?,
        rules_total = ?,
        dry_run_count = ?,
        skipped_count = ?,
        failed_count = ?,
        message = ?,
        error_code = ?
      WHERE id = ?
    `)
    .bind(
      patch.finishedAt,
      patch.status,
      Number(patch.rulesTotal || 0),
      Number(patch.dryRunCount || 0),
      Number(patch.skippedCount || 0),
      Number(patch.failedCount || 0),
      nullableString(patch.message),
      nullableString(patch.errorCode),
      id
    )
    .run();
}

async function updateRuleRunState(db, rule, state) {
  await db
    .prepare(`
      UPDATE module_rules
      SET
        last_run_at = ?,
        last_run_status = ?,
        last_run_message = ?,
        updated_at = ?
      WHERE module_key = ? AND id = ?
    `)
    .bind(state.finishedAt, state.status, state.message, state.finishedAt, MODULE_KEY, rule.id)
    .run();
}

async function runMatchedAction(env, rule, action, message, options) {
  if (action.type === "ARCHIVE") {
    if (options.mode === "live" && options.confirmed === true) {
      await archiveDataBoxMessage(env, message.id, { confirmed: true }, options.currentUser);
      return { status: "archived", message: "Archivováno." };
    }
    return { status: "dry_run", message: "Shoda pro archivaci. Ostrá archivace neprovedena." };
  }

  if (action.type === "SEND_EMAIL") {
    const recipients = action.recipients.length ? action.recipients : [""];
    let prepared = 0;
    for (const recipient of recipients) {
      const dedupeKey = `data-box:rule:${rule.id}:${message.id}:email:${recipient}`;
      if (options.mode === "live" && options.confirmed === true && recipient) {
        await prepareDataBoxAction(env, message, "email", {
          recipient,
          subject: message.subject,
          bodyPreview: `Pravidlo ${rule.title}: připraveno k ručnímu potvrzení e-mailu.`,
          dedupeKey,
          result: { ruleId: rule.id, requiresConfirmation: true }
        }, options.currentUser);
        prepared += 1;
      }
    }
    return options.mode === "live" && options.confirmed === true
      ? { status: "requires_confirmation", message: `Připraveno ${prepared} e-mailových akcí k ručnímu potvrzení.` }
      : { status: "dry_run", message: "Shoda pro e-mail. E-mail neodeslán." };
  }

  return { status: "skipped", message: `Nepodporovaný typ akce ${action.type}.` };
}

async function runSingleRule(env, db, rule, messages, options) {
  const startedAt = new Date().toISOString();
  const action = normalizeAction(rule);
  const matches = messages.filter((message) => messageMatchesRule(message, rule));
  const results = [];

  for (const message of matches) {
    results.push(await runMatchedAction(env, rule, action, message, options));
  }

  const finishedAt = new Date().toISOString();
  const failedCount = results.filter((item) => item.status === "failed").length;
  const status = failedCount
    ? "partial_error"
    : options.mode === "live" && options.confirmed === true
      ? "processed"
      : "dry_run";
  const message = matches.length
    ? `${matches.length} shod. ${results.map((item) => item.message).filter(Boolean).join(" ")}`
    : "Bez shod.";
  const run = {
    id: randomId("data-box-rule-run"),
    ruleId: rule.id,
    startedAt,
    finishedAt,
    status,
    message,
    errorCode: failedCount ? "data_box_rule_partial_error" : "",
    triggeredBy: options.triggeredBy,
    dedupeKey: `data-box:${options.mode}:${rule.id}:${startedAt}`
  };

  await insertAutomationRun(db, run);
  await updateRuleRunState(db, rule, { finishedAt, status, message });
  return {
    ruleId: rule.id,
    title: rule.title,
    status,
    matches: matches.length,
    message
  };
}

export async function runDataBoxAutomation(env, options = {}) {
  const db = database(env);
  const mode = cleanString(options.mode || "dry-run") === "live" ? "live" : "dry-run";
  const confirmed = options.confirmed === true;
  const startedAt = new Date().toISOString();
  const runnerRunId = randomId("data-box-runner-run");
  const triggeredBy = cleanString(options.triggeredBy || (mode === "live" ? "manual-confirmed" : "manual-dry-run"));

  await insertRunnerRun(db, {
    id: runnerRunId,
    startedAt,
    scheduledAt: cleanString(options.scheduledAt || startedAt),
    finishedAt: "",
    triggeredBy,
    status: "running",
    rulesTotal: 0,
    dryRunCount: 0,
    skippedCount: 0,
    failedCount: 0,
    message: mode === "live"
      ? "DS runner spuštěn v potvrzeném režimu."
      : "DS runner spuštěn v dry-run režimu. E-maily ani DS zprávy se neodesílají.",
    createdAt: startedAt
  });

  let rules = [];
  let results = [];
  let status = "dry_run";
  let message = "";
  let errorCode = "";

  try {
    rules = (await listModuleRules(env, MODULE_KEY))
      .filter((rule) => rule.status === "active" && rule.isAutomation);
    const messages = await listDataBoxMessages(env, { limit: 100 });
    results = [];

    for (const rule of rules) {
      results.push(await runSingleRule(env, db, rule, messages, {
        mode,
        confirmed,
        triggeredBy,
        currentUser: options.currentUser || {}
      }));
    }

    const matches = results.reduce((sum, item) => sum + Number(item.matches || 0), 0);
    if (!rules.length) {
      status = "skipped";
      message = "V cloud DB nejsou aktivní DS automatizace.";
    } else if (mode === "live" && confirmed) {
      status = "processed";
      message = `DS runner zpracoval ${rules.length} pravidel, ${matches} shod. E-maily jsou připravené k ručnímu potvrzení.`;
    } else {
      status = "dry_run";
      message = `DS runner ověřil ${rules.length} pravidel, ${matches} shod. Ostré akce neprovedeny.`;
    }
  } catch (error) {
    status = "error";
    message = cleanString(error?.message || "DS runner selhal.");
    errorCode = cleanString(error?.code || "data_box_runner_failed");
  }

  const finishedAt = new Date().toISOString();
  const failedCount = status === "error" ? 1 : results.filter((item) => item.status === "partial_error" || item.status === "error").length;
  const dryRunCount = results.filter((item) => item.status === "dry_run").length;
  const skippedCount = results.filter((item) => item.status === "skipped").length;

  await updateRunnerRun(db, runnerRunId, {
    finishedAt,
    status,
    rulesTotal: rules.length,
    dryRunCount,
    skippedCount,
    failedCount,
    message,
    errorCode
  });

  return {
    apiStatus: "ready",
    mode,
    confirmed,
    runner: RUNNER_NAME,
    runnerRunId,
    status,
    message,
    startedAt,
    finishedAt,
    rulesTotal: rules.length,
    dryRunCount,
    skippedCount,
    failedCount,
    results
  };
}
