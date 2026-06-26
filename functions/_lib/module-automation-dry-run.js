const DB_BINDING = "SMART_ODPADY_DB";
const DEFAULT_MODULE_KEY = "absence";
const DEFAULT_TIME_ZONE = "Europe/Prague";
const DEFAULT_CRON = "15 3 * * *";
const RUNNER_NAME = "phase2a-cloud-dry-run";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

function cleanString(value) {
  return String(value ?? "").trim();
}

function nullableString(value) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function parseJson(value, fallback = {}) {
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

function database(env) {
  const db = env?.[DB_BINDING];
  if (!db) {
    throw new Error(`Cloudflare D1 binding ${DB_BINDING} není dostupný pro dry-run runner.`);
  }

  return db;
}

function rowToRule(row) {
  return {
    id: cleanString(row?.id),
    moduleKey: cleanString(row?.module_key),
    title: cleanString(row?.title),
    description: cleanString(row?.description),
    type: cleanString(row?.type),
    status: cleanString(row?.status),
    conditions: parseJson(row?.conditions_json),
    actions: parseJson(row?.actions_json),
    isAutomation: Boolean(Number(row?.is_automation || 0)),
    triggerType: cleanString(row?.trigger_type),
    scheduleCron: cleanString(row?.schedule_cron),
    eventName: cleanString(row?.event_name),
    cloudRunner: cleanString(row?.cloud_runner)
  };
}

function datePartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = datePartsInTimeZone(date, timeZone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return zonedAsUtc - date.getTime();
}

function zonedLocalTimeToUtcMs({ year, month, day, hour, minute, second = 0 }, timeZone) {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let index = 0; index < 3; index += 1) {
    const offset = timeZoneOffsetMs(new Date(utcMs), timeZone);
    utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offset;
  }

  return utcMs;
}

function addCalendarDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + days * MS_PER_DAY);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function nextDailyLocalIso(now, timeZone, hour, minute) {
  const parts = datePartsInTimeZone(now, timeZone);
  let candidateMs = zonedLocalTimeToUtcMs({ ...parts, hour, minute, second: 0 }, timeZone);

  if (candidateMs <= now.getTime()) {
    const nextDay = addCalendarDays(parts, 1);
    candidateMs = zonedLocalTimeToUtcMs({ ...nextDay, hour, minute, second: 0 }, timeZone);
  }

  return new Date(candidateMs).toISOString();
}

function nextHourlyIso(now, minute) {
  const candidate = new Date(now);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(minute);

  if (candidate.getTime() <= now.getTime()) {
    candidate.setTime(candidate.getTime() + MS_PER_HOUR);
  }

  return candidate.toISOString();
}

function nextRunAt(rule, now, timeZone) {
  const cron = cleanString(rule.scheduleCron);
  const dailyMatch = cron.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/);
  if (dailyMatch) {
    return nextDailyLocalIso(now, timeZone, Number(dailyMatch[2]), Number(dailyMatch[1]));
  }

  const hourlyMatch = cron.match(/^(\d{1,2})\s+\*\s+\*\s+\*\s+\*$/);
  if (hourlyMatch) {
    return nextHourlyIso(now, Number(hourlyMatch[1]));
  }

  if (rule.triggerType === "time") {
    return nextDailyLocalIso(now, timeZone, 6, 0);
  }

  return "";
}

function dayKey(date, timeZone) {
  const parts = datePartsInTimeZone(date, timeZone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

function dedupeKey(rule, now, timeZone) {
  return [
    "dry-run",
    RUNNER_NAME,
    rule.moduleKey,
    rule.id,
    dayKey(now, timeZone)
  ].join(":");
}

async function listActiveAutomations(db, moduleKey) {
  const result = await db
    .prepare(`
      SELECT *
      FROM module_rules
      WHERE module_key = ?
        AND status = 'active'
        AND type = 'automation'
        AND is_automation = 1
      ORDER BY trigger_type, title
    `)
    .bind(moduleKey)
    .all();

  return (result.results || []).map(rowToRule);
}

async function automationRunByDedupe(db, moduleKey, key) {
  if (!key) {
    return null;
  }

  return db
    .prepare(`
      SELECT id, started_at, status
      FROM module_automation_runs
      WHERE module_key = ? AND dedupe_key = ?
      LIMIT 1
    `)
    .bind(moduleKey, key)
    .first();
}

async function countMedicalExams(db, status) {
  const row = await db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM employee_medical_exams
      WHERE notification_enabled = 1
        AND status = ?
    `)
    .bind(status)
    .first();

  return Number(row?.count || 0);
}

async function countApprovalReminderCandidates(db, now) {
  const cutoff = new Date(now.getTime() - 24 * MS_PER_HOUR).toISOString();
  const row = await db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM absence_requests
      WHERE status IN ('pending', 'pending_approval')
        AND COALESCE(submitted_at, created_at) <= ?
        AND (reminder_sent_at IS NULL OR reminder_sent_at <= ?)
    `)
    .bind(cutoff, cutoff)
    .first();

  return Number(row?.count || 0);
}

async function evaluateRule(db, rule, now) {
  if (rule.id === "absence-medical-exam-due-soon") {
    const count = await countMedicalExams(db, "due_soon");
    return `Dry-run: ${count} kandidátu na upozornění do 60 dnů. E-mail/SMS neodesláno.`;
  }

  if (rule.id === "absence-medical-exam-overdue") {
    const count = await countMedicalExams(db, "overdue");
    return `Dry-run: ${count} kandidátu po termínu lékařské prohlídky. E-mail/SMS neodesláno.`;
  }

  if (rule.id === "absence-approval-reminder-24h") {
    const count = await countApprovalReminderCandidates(db, now);
    return `Dry-run: ${count} žádostí čeká déle než 24 hodin. E-mail/SMS neodesláno.`;
  }

  if (rule.triggerType === "event") {
    return "Dry-run: eventová automatizace evidována, cron ji nespouští. E-mail/SMS neodesláno.";
  }

  return "Dry-run: automatizace vyhodnocena bez reálné akce. E-mail/SMS neodesláno.";
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
      run.moduleKey,
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

async function updateRuleRunState(db, rule, state) {
  await db
    .prepare(`
      UPDATE module_rules
      SET
        last_run_at = ?,
        next_run_at = ?,
        last_run_status = ?,
        last_run_message = ?,
        updated_at = ?
      WHERE module_key = ? AND id = ?
    `)
    .bind(
      nullableString(state.lastRunAt),
      nullableString(state.nextRunAt),
      nullableString(state.lastRunStatus),
      nullableString(state.lastRunMessage),
      state.updatedAt,
      rule.moduleKey,
      rule.id
    )
    .run();
}

async function runRuleDryRun(db, rule, context) {
  const startedAt = new Date().toISOString();
  const key = dedupeKey(rule, context.now, context.timeZone);
  const existing = await automationRunByDedupe(db, rule.moduleKey, key);
  const next = nextRunAt(rule, context.now, context.timeZone);

  if (existing) {
    return {
      ruleId: rule.id,
      moduleKey: rule.moduleKey,
      status: "skipped",
      dedupeKey: key,
      message: `Dry-run přeskočen: dedupe_key už existuje (${existing.status}).`,
      existingRunId: existing.id
    };
  }

  try {
    const message = await evaluateRule(db, rule, context.now);
    const finishedAt = new Date().toISOString();
    const run = {
      id: randomId("module-automation-run"),
      ruleId: rule.id,
      moduleKey: rule.moduleKey,
      startedAt,
      finishedAt,
      status: "dry_run",
      message,
      errorCode: "",
      triggeredBy: context.triggeredBy,
      dedupeKey: key
    };

    await insertAutomationRun(db, run);
    await updateRuleRunState(db, rule, {
      lastRunAt: finishedAt,
      nextRunAt: next,
      lastRunStatus: "dry_run",
      lastRunMessage: message,
      updatedAt: finishedAt
    });

    return {
      ruleId: rule.id,
      moduleKey: rule.moduleKey,
      status: "dry_run",
      dedupeKey: key,
      message
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = "Dry-run selhal při bezpečném vyhodnocení bez reálné akce.";
    const run = {
      id: randomId("module-automation-run"),
      ruleId: rule.id,
      moduleKey: rule.moduleKey,
      startedAt,
      finishedAt,
      status: "error",
      message,
      errorCode: "dry_run_failed",
      triggeredBy: context.triggeredBy,
      dedupeKey: `${key}:error:${Date.now()}`
    };

    await insertAutomationRun(db, run);
    await updateRuleRunState(db, rule, {
      lastRunAt: finishedAt,
      nextRunAt: next,
      lastRunStatus: "error",
      lastRunMessage: message,
      updatedAt: finishedAt
    });

    return {
      ruleId: rule.id,
      moduleKey: rule.moduleKey,
      status: "error",
      dedupeKey: run.dedupeKey,
      message,
      errorCode: "dry_run_failed"
    };
  }
}

export async function runModuleAutomationDryRun(env, options = {}) {
  const db = database(env);
  const moduleKey = cleanString(options.moduleKey || env?.MODULE_AUTOMATION_MODULE_KEY || DEFAULT_MODULE_KEY);
  const timeZone = cleanString(options.timeZone || env?.MODULE_AUTOMATION_TIME_ZONE || DEFAULT_TIME_ZONE);
  const now = new Date(Number(options.scheduledTime || Date.now()));
  const triggeredBy = cleanString(options.triggeredBy || "cloudflare-cron");
  const cron = cleanString(options.cron || DEFAULT_CRON);
  const rules = await listActiveAutomations(db, moduleKey);
  const results = [];

  for (const rule of rules) {
    results.push(await runRuleDryRun(db, rule, {
      now,
      timeZone,
      triggeredBy,
      cron
    }));
  }

  return {
    mode: "dry-run",
    runner: RUNNER_NAME,
    moduleKey,
    timeZone,
    cron,
    startedAt: now.toISOString(),
    ruleCount: rules.length,
    dryRunCount: results.filter((item) => item.status === "dry_run").length,
    skippedCount: results.filter((item) => item.status === "skipped").length,
    errorCount: results.filter((item) => item.status === "error").length,
    results
  };
}

