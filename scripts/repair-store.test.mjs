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
sqlite.exec(readFileSync(new URL("../migrations/modular/core/0001_core_foundation.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/modular/audit/0001_audit_foundation.sql", import.meta.url), "utf8"));
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

sqlite.exec(readFileSync("migrations/modular/core/0008_repair_queue.sql","utf8"));
const d1 = new D1Database(sqlite);
const env = {
  SMART_ODPADY_DB: d1,
  DB_CORE: d1,
  DB_MESSAGES: d1,
  DB_AUDIT: d1,
  DB_ARCHIVE: d1,
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


const input={moduleKey:'feedback',title:'Soukromé hlášení',description:'Na telefonu je tlačítko malé',sourceRoute:'/pneumatiky',technicalContext:{repairModule:true},clientRequestId:'private-repair'};
const result=await createUserReportedSelfRepairCase(env,reporter,input,{repair:{dedupeKey:'private-key'}});
assert.equal(sqlite.prepare('SELECT state FROM repair_queue WHERE case_id=?').get(result.case.id).state,'queued');
assert.equal((await listFeedbackCases(env,anotherUser)).cases.length,0);
await assert.rejects(()=>getFeedbackCase(env,anotherUser,result.case.id),e=>e.status===404);
assert.equal((await getFeedbackCase(env,reporter,result.case.id)).repair.state,'queued');
assert.equal((await getFeedbackCase(env,manager,result.case.id)).repair.state,'queued');
const retry=await createUserReportedSelfRepairCase(env,reporter,input,{repair:{dedupeKey:'private-key'}});
assert.equal(retry.case.id,result.case.id);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM repair_queue').get().n,1);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM self_repair_cases').get().n,1);
await updateFeedbackCase(env,manager,result.case.id,{workflowStatus:'done',internalNote:'Finished test'});
assert.equal((await getFeedbackCase(env,reporter,result.case.id)).repair.state,'needs_decision');
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM repair_queue_events WHERE case_id=?').get(result.case.id).n,2);
for(const state of ['claimed','validated','deploying']) {
  const item=await createUserReportedSelfRepairCase(env,reporter,{...input,clientRequestId:`cancel-${state}`},{repair:{dedupeKey:`cancel-${state}`}});
  sqlite.prepare('UPDATE repair_queue SET state=? WHERE case_id=?').run(state,item.case.id);
  await updateFeedbackCase(env,manager,item.case.id,{automationStatus:'unsuitable',internalNote:'Excluded by manager'});
  assert.equal(sqlite.prepare('SELECT state FROM repair_queue WHERE case_id=?').get(item.case.id).state,state==='deploying'?'deploying':'needs_decision','Pending work stops; an active deployment retains recovery ownership');
}
console.log('Repair store: atomic queue creation, retry dedupe, private list/detail, manager access and integration with existing evidence passed.');
