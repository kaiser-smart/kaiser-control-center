import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  SelfRepairStoreError,
  createUserReportedSelfRepairCase,
  getSelfRepairAttachmentFile,
  getSelfRepairCase,
  getSelfRepairStatus,
  listSelfRepairCases,
  normalizeSelfRepairCaseStatus,
  sanitizeSelfRepairSourceRoute,
  selfRepairCaseIdForFeedback,
  selfRepairFingerprint,
  updateSelfRepairCase
} from "../functions/_lib/self-repair-store.js";
import {
  resolveSelfRepairTarget,
  targetForSelfRepairReport
} from "../functions/_lib/self-repair-targets.js";
import {
  canCreateCentralModuleFeedback,
  listModuleFeedback
} from "../functions/_lib/module-feedback-store.js";
import { hasPermission } from "../src/permissions.js";

class D1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.database, this.sql, values);
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.values) };
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) || null;
  }

  async run() {
    return { success: true, meta: this.database.prepare(this.sql).run(...this.values) };
  }
}

class D1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class R2Bucket {
  constructor() {
    this.objects = new Map();
  }

  async put(key, body, options = {}) {
    const buffer = Buffer.from(body);
    this.objects.set(key, { body: buffer, options });
  }

  async get(key) {
    return this.objects.get(key) || null;
  }

  async delete(key) {
    this.objects.delete(key);
  }
}

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../migrations/0007_create_module_feedback.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0015_create_module_rules.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0016_create_module_automation_runner_runs.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0034_create_self_repair_cases.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0035_activate_self_repair_hourly_monitor.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0051_create_self_repair_case_attachments.sql", import.meta.url), "utf8"));

const attachmentBucket = new R2Bucket();
const env = {
  SMART_ODPADY_DB: new D1Database(sqlite),
  SMART_ODPADY_DOCUMENTS: attachmentBucket
};
const reporter = {
  id: "user-driver-1",
  name: "Testovací řidič",
  email: "driver@example.test",
  role: "ridic"
};
const manager = {
  id: "user-management-1",
  name: "Testovací management",
  role: "management"
};

assert.equal(hasPermission({ ...reporter, active: true }, "feedback", "create"), true);
assert.equal(hasPermission({ ...reporter, active: true }, "self-repair", "view"), false);
assert.equal(hasPermission({ ...manager, active: true }, "self-repair", "view"), true);
assert.equal(hasPermission({ ...manager, active: true }, "self-repair", "manage"), true);
assert.equal(canCreateCentralModuleFeedback({ ...manager, active: true }), true);
assert.equal(canCreateCentralModuleFeedback({ role: "admin", active: true }), true);
assert.equal(canCreateCentralModuleFeedback({ ...reporter, active: true }), false);

assert.equal(resolveSelfRepairTarget("pneumatiky").repoKey, "kaiser-control-center");
assert.equal(resolveSelfRepairTarget("tyres").productionUrl, "https://smart-odpady.ai/pneumatiky");
assert.equal(resolveSelfRepairTarget("dashboard").productionUrl, "https://smart-odpady.ai/");
assert.equal(targetForSelfRepairReport("unknown-module"), null);
assert.equal(sanitizeSelfRepairSourceRoute("/pneumatiky?vehicle=1#detail"), "/pneumatiky?vehicle=1#detail");
assert.equal(sanitizeSelfRepairSourceRoute("https://attacker.example/steal"), "");
assert.equal(sanitizeSelfRepairSourceRoute("//attacker.example/steal"), "");
assert.throws(
  () => normalizeSelfRepairCaseStatus("executing_codex"),
  (error) => error instanceof SelfRepairStoreError && error.code === "self_repair_status_invalid"
);

const firstFingerprint = await selfRepairFingerprint({
  moduleKey: "tyres",
  caseType: "bug",
  title: "Nejde zadat rozměr pneumatiky",
  actualBehavior: "Pole hodnotu odmítne."
});
const repeatedFingerprint = await selfRepairFingerprint({
  moduleKey: "tyres",
  caseType: "bug",
  title: "  NEJDE ZADAT ROZMER PNEUMATIKY ",
  actualBehavior: "Pole   hodnotu odmítne."
});
assert.equal(firstFingerprint, repeatedFingerprint);

const attachmentBytes = new TextEncoder().encode("Testovací příloha k managerské připomínce.");
const attachmentFile = {
  name: "doklad-testu.txt",
  type: "text/plain",
  size: attachmentBytes.byteLength,
  async arrayBuffer() {
    return attachmentBytes.buffer.slice(
      attachmentBytes.byteOffset,
      attachmentBytes.byteOffset + attachmentBytes.byteLength
    );
  }
};

const created = await createUserReportedSelfRepairCase(env, manager, {
  moduleId: "pneumatiky",
  caseType: "bug",
  title: "Nejde zadat rozměr pneumatiky",
  description: "Formulář nepřijme rozměr 315/80 R22,5.",
  actualBehavior: "Po uložení se hodnota smaže.",
  expectedBehavior: "Rozměr zůstane uložený.",
  reproductionSteps: "Otevřít Pneumatiky, vybrat vozidlo a uložit rozměr.",
  priority: "Důležitá",
  sourceRoute: "/pneumatiky?vehicle=100",
  buildVersion: "v0.1.493",
  buildCommit: "test-commit",
  browserInfo: "Test Browser",
  targetRepoKey: "attacker-controlled-repository"
}, { attachment: attachmentFile });

assert.equal(created.case.moduleKey, "tyres");
assert.equal(created.case.targetRepoKey, "kaiser-control-center");
assert.equal(created.case.status, "new");
assert.equal(created.case.riskLevel, "unclassified");
assert.equal(created.feedback.status, "Nová");
assert.equal(created.case.attachments.length, 1);
assert.equal(created.feedback.attachments[0].filename, "doklad-testu.txt");
assert.equal(created.attachment.sizeBytes, attachmentBytes.byteLength);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM self_repair_cases").get().count, 1);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM module_feedback").get().count, 1);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM self_repair_case_evidence").get().count, 1);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM self_repair_case_audit_log").get().count, 1);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM self_repair_case_attachments").get().count, 1);
assert.equal(attachmentBucket.objects.size, 1);
assert.equal(await selfRepairCaseIdForFeedback(env, created.feedback.id), created.case.id);

const storedTarget = sqlite.prepare(`
  SELECT target_repo_key, target_production_url
  FROM self_repair_cases
  WHERE id = ?
`).get(created.case.id);
assert.deepEqual({ ...storedTarget }, {
  target_repo_key: "kaiser-control-center",
  target_production_url: "https://smart-odpady.ai/pneumatiky"
});

const listed = await listSelfRepairCases(env, { moduleKey: "tyres" });
assert.equal(listed.cases.length, 1);
assert.equal(listed.summary.total, 1);
assert.equal(listed.summary.newCount, 1);
assert.equal(listed.summary.unclassifiedCount, 1);

const detail = await getSelfRepairCase(env, created.case.id);
assert.equal(detail.case.title, "Nejde zadat rozměr pneumatiky");
assert.equal(detail.evidence[0].metadata.userSupplied, true);
assert.equal(detail.audit[0].action, "created_from_user_feedback");
assert.equal(detail.attachments[0].filename, "doklad-testu.txt");

const visibleFeedback = await listModuleFeedback(env, manager);
assert.equal(visibleFeedback.length, 1);
assert.equal(visibleFeedback[0].attachments[0].openUrl, created.attachment.openUrl);

const downloaded = await getSelfRepairAttachmentFile(env, manager, created.case.id, created.attachment.id);
assert.equal(downloaded.attachment.filename, "doklad-testu.txt");
assert.equal(Buffer.from(downloaded.body).toString("utf8"), "Testovací příloha k managerské připomínce.");
assert.equal(downloaded.headers["Cache-Control"], "private, no-store");

await assert.rejects(
  getSelfRepairAttachmentFile(env, { ...reporter, id: "user-driver-2", active: true }, created.case.id, created.attachment.id),
  (error) => error instanceof SelfRepairStoreError && error.code === "self_repair_attachment_forbidden"
);

const updated = await updateSelfRepairCase(env, manager, created.case.id, {
  status: "closed",
  riskLevel: "red",
  priority: "Kritická",
  triageSummary: "Potvrzená chyba formuláře; oprava bude řešena odděleně.",
  internalNote: "Fáze 1 pouze evidence.",
  auditNote: "Ruční třídění v testu."
});
assert.equal(updated.status, "closed");
assert.equal(updated.riskLevel, "red");
assert.equal(sqlite.prepare("SELECT status FROM module_feedback WHERE id = ?").get(created.feedback.id).status, "Hotovo");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM self_repair_case_audit_log WHERE case_id = ?").get(created.case.id).count, 2);

const status = await getSelfRepairStatus(env);
assert.equal(status.summary.total, 1);
assert.equal(status.summary.redRiskCount, 1);
assert.equal(status.phase, "phase2a_hourly_read_only_monitor");
assert.equal(status.capabilities.hourlyMonitor, "waiting");
assert.equal(status.capabilities.promptPreparation, "ready");
assert.equal(status.capabilities.codexExecution, "off");
assert.equal(status.capabilities.deployment, "off");
assert.equal(status.capabilities.userEmail, "off");

const proposedAutomation = sqlite.prepare(`
  SELECT status, schedule_cron, cloud_runner
  FROM module_rules
  WHERE id = 'self-repair-hourly-monitor-proposal'
`).get();
assert.equal(proposedAutomation.status, "active");
assert.equal(proposedAutomation.schedule_cron, "7 * * * *");
assert.equal(proposedAutomation.cloud_runner, "self-repair-phase2a-hourly-monitor");

await assert.rejects(
  createUserReportedSelfRepairCase(env, reporter, {
    moduleId: "not-allowed",
    title: "Neplatný modul",
    description: "Tento zápis se nesmí uložit."
  }),
  (error) => error instanceof SelfRepairStoreError && error.code === "self_repair_module_invalid"
);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM self_repair_cases").get().count, 1);

await assert.rejects(
  createUserReportedSelfRepairCase(env, manager, {
    moduleId: "pneumatiky",
    title: "Nepovolená příloha",
    description: "Příloha se nesmí uložit."
  }, {
    attachment: {
      name: "skript.exe",
      type: "application/octet-stream",
      size: 4,
      async arrayBuffer() { return new Uint8Array([1, 2, 3, 4]).buffer; }
    }
  }),
  (error) => error instanceof SelfRepairStoreError && error.code === "self_repair_attachment_type_invalid"
);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM self_repair_cases").get().count, 1);
assert.equal(attachmentBucket.objects.size, 1);

console.log("Self-repair manager attachment, evidence and triage tests passed.");
