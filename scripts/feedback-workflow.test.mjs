import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { createUserReportedSelfRepairCase, SelfRepairStoreError } from "../functions/_lib/self-repair-store.js";
import {
  getFeedbackCase,
  listFeedbackCases,
  listFeedbackNotifications,
  prepareFeedbackCodexJob,
  replyToFeedbackCase,
  submitFeedbackCodexJob,
  updateFeedbackCase,
  verifyFeedbackCase
} from "../functions/_lib/feedback-case-store.js";

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
    this.objects.set(key, { body: Buffer.from(body), options });
  }
  async get(key) {
    return this.objects.get(key) || null;
  }
  async delete(key) {
    this.objects.delete(key);
  }
}

const sqlite = new DatabaseSync(":memory:");
for (const migration of [
  "0007_create_module_feedback.sql",
  "0015_create_module_rules.sql",
  "0016_create_module_automation_runner_runs.sql",
  "0034_create_self_repair_cases.sql",
  "0051_create_self_repair_case_attachments.sql",
  "0060_create_feedback_case_workflow.sql"
]) {
  sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
}

const env = {
  SMART_ODPADY_DB: new D1Database(sqlite),
  SMART_ODPADY_DOCUMENTS: new R2Bucket()
};
const reporter = {
  id: "reporter-1",
  name: "Běžný uživatel",
  email: "reporter@example.test",
  role: "ridic",
  active: true
};
const anotherUser = {
  id: "reporter-2",
  name: "Jiný uživatel",
  email: "other@example.test",
  role: "readonly",
  active: true
};
const manager = {
  id: "manager-1",
  name: "Správce hlášení",
  email: "manager@example.test",
  role: "management",
  active: true
};

const created = await createUserReportedSelfRepairCase(env, reporter, {
  clientRequestId: "feedback-request-test-1",
  moduleKey: "tyres",
  caseType: "bug",
  title: "Nelze uložit rozměr pneumatiky",
  description: "Po uložení se rozměr ztratí.",
  expectedBehavior: "Rozměr zůstane uložený.",
  sourceRoute: "/pneumatiky?vehicle=100",
  buildVersion: "0.1.test",
  buildCommit: "test-commit",
  browserInfo: "Test browser",
  screenInfo: "390 × 844 @2x",
  technicalContext: JSON.stringify({ online: true, language: "cs-CZ" })
});

assert.match(created.case.caseNumber, /^KSO-\d{8}-[A-Z0-9]{6}$/);
assert.equal(created.case.workflowStatus, "new");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM self_repair_cases").get().count, 1);

const retried = await createUserReportedSelfRepairCase(env, reporter, {
  clientRequestId: "feedback-request-test-1",
  moduleKey: "tyres",
  caseType: "bug",
  title: "Nelze uložit rozměr pneumatiky",
  description: "Po uložení se rozměr ztratí."
});
assert.equal(retried.case.id, created.case.id);
assert.equal(retried.deduplicated, true);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM self_repair_cases").get().count, 1);

sqlite.prepare(`
  UPDATE self_repair_cases
  SET module_key = 'self-repair',
      module_name = 'Samoopravy',
      title = '[PRODUKČNÍ TEST] Samoopravy Fáze 1'
  WHERE id = ?
`).run(created.case.id);

const sharedList = await listFeedbackCases(env, anotherUser);
assert.equal(sharedList.cases.length, 1);
assert.equal(sharedList.cases[0].isOwn, false);
assert.equal(sharedList.cases[0].moduleName, "Připomínky a chyby");
assert.equal(sharedList.cases[0].title, "Technické ověření systému");
assert.equal("internalNote" in sharedList.cases[0], false);
assert.equal("automationStatus" in sharedList.cases[0], false);

const managerList = await listFeedbackCases(env, manager);
assert.equal(managerList.cases[0].moduleName, "Samoopravy");
assert.equal(managerList.cases[0].title, "[PRODUKČNÍ TEST] Samoopravy Fáze 1");

const otherOwn = await listFeedbackCases(env, anotherUser, { own: true });
assert.equal(otherOwn.cases.length, 0);
const reporterOwn = await listFeedbackCases(env, reporter, { own: true });
assert.equal(reporterOwn.cases.length, 1);

let detail = await getFeedbackCase(env, reporter, created.case.id);
assert.equal(detail.case.workflowStatus, "new");
assert.equal(detail.audit.length, 0);
assert.equal(detail.case.screenInfo, undefined);

let update = await updateFeedbackCase(env, manager, created.case.id, {
  workflowStatus: "needs_details",
  priority: "Důležitá",
  assigneeUserId: manager.id,
  assigneeUserName: manager.name,
  detailsQuestion: "Na kterém vozidle se problém projevil?",
  resumeWorkflowStatus: "accepted",
  internalNote: "Interní poznámka, která se nesmí zobrazit uživateli.",
  publicMessage: "Prosíme o doplnění vozidla."
});
assert.equal(update.case.workflowStatus, "needs_details");
assert.equal(update.case.internalNote, "Interní poznámka, která se nesmí zobrazit uživateli.");

detail = await getFeedbackCase(env, reporter, created.case.id);
assert.equal(detail.case.workflowStatus, "needs_details");
assert.equal(detail.case.detailsQuestion, "Na kterém vozidle se problém projevil?");
assert.equal(detail.messages.at(-1).body, "Prosíme o doplnění vozidla.");
assert.equal("internalNote" in detail.case, false);

const notifications = await listFeedbackNotifications(env, reporter);
assert.equal(notifications.unreadCount, 1);
assert.equal(notifications.notifications[0].caseId, created.case.id);

const replyBytes = new TextEncoder().encode("Vozidlo 100");
detail = await replyToFeedbackCase(env, reporter, created.case.id, {
  body: "Problém je na vozidle 100."
}, {
  attachment: {
    name: "vozidlo.txt",
    type: "text/plain",
    size: replyBytes.byteLength,
    async arrayBuffer() {
      return replyBytes.buffer.slice(replyBytes.byteOffset, replyBytes.byteOffset + replyBytes.byteLength);
    }
  }
});
assert.equal(detail.case.workflowStatus, "accepted");
assert.equal(detail.attachments.length, 1);
assert.equal(detail.messages.at(-1).messageType, "reporter_reply");

await updateFeedbackCase(env, manager, created.case.id, {
  workflowStatus: "in_progress",
  publicMessage: "Opravu připravujeme."
});
update = await updateFeedbackCase(env, manager, created.case.id, {
  workflowStatus: "ready_for_verification",
  publicMessage: "Rozměr se nyní ukládá. Prosíme o test."
});
assert.equal(update.previousWorkflowStatus, "in_progress");
assert.equal(update.case.workflowStatus, "ready_for_verification");

detail = await verifyFeedbackCase(env, reporter, created.case.id, "persists", "Po obnovení se rozměr znovu ztratil.");
assert.equal(detail.case.workflowStatus, "in_progress");

await updateFeedbackCase(env, manager, created.case.id, {
  workflowStatus: "ready_for_verification",
  publicMessage: "Druhá oprava je připravená."
});
detail = await verifyFeedbackCase(env, reporter, created.case.id, "fixed", "Oprava funguje.");
assert.equal(detail.case.workflowStatus, "done");
assert.ok(detail.case.verifiedAt);

const managerDetail = await getFeedbackCase(env, manager, created.case.id);
assert.equal(managerDetail.case.internalNote, "Interní poznámka, která se nesmí zobrazit uživateli.");
assert.ok(managerDetail.audit.some((entry) => entry.action === "reporter_replied"));
assert.ok(managerDetail.audit.some((entry) => entry.action === "repair_still_failing"));
assert.ok(managerDetail.audit.some((entry) => entry.action === "repair_verified"));

const prepared = await prepareFeedbackCodexJob(env, manager, created.case.id);
assert.equal(prepared.job.status, "draft");
assert.equal(prepared.capability.configured, false);
assert.match(prepared.job.promptText, new RegExp(created.case.caseNumber));
await assert.rejects(
  submitFeedbackCodexJob(env, manager, created.case.id, prepared.job.id, "PŘEDAT CODEXU"),
  (error) => error instanceof SelfRepairStoreError && error.code === "feedback_codex_runner_not_configured"
);
assert.equal(
  sqlite.prepare("SELECT status FROM self_repair_codex_jobs WHERE id = ?").get(prepared.job.id).status,
  "draft"
);

const githubPrepared = await prepareFeedbackCodexJob(env, manager, created.case.id);
let githubDispatch = null;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  githubDispatch = { url: String(url), options };
  return new Response(null, { status: 204 });
};
try {
  const submitted = await submitFeedbackCodexJob(
    {
      ...env,
      GITHUB_CODEX_TOKEN: "test-github-token",
      CODEX_REPAIR_GITHUB_REPOSITORY: "kaiser-smart/kaiser-control-center"
    },
    manager,
    created.case.id,
    githubPrepared.job.id,
    "PŘEDAT CODEXU"
  );
  assert.equal(submitted.job.status, "submitted");
  assert.equal(submitted.capability.mode, "github_actions");
  assert.match(githubDispatch.url, /feedback-codex-repair\.yml\/dispatches$/);
  const dispatchBody = JSON.parse(githubDispatch.options.body);
  assert.equal(dispatchBody.inputs.case_number, created.case.caseNumber);
  assert.match(dispatchBody.inputs.prompt, new RegExp(created.case.caseNumber));
} finally {
  globalThis.fetch = originalFetch;
}

console.log("feedback workflow: creation, shared list, reply, verification, audit and Codex guard ok");
