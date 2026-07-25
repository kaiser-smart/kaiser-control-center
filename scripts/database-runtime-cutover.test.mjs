import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import {
  CrossDatabaseQueryError,
  databaseDomainForSql,
  getModuleDatabase
} from "../functions/_lib/databases.js";

class Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
    this.database.calls.push({ type: "prepare", sql });
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async run() {
    this.database.calls.push({ type: "run", sql: this.sql, values: this.values });
    return { success: true, meta: { changes: 1 } };
  }
}

class D1 {
  constructor(name) {
    this.name = name;
    this.calls = [];
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  async batch(statements) {
    this.calls.push({ type: "batch", count: statements.length });
    return statements.map(() => ({ success: true }));
  }
}

const core = new D1("core");
const messages = new D1("messages");
const audit = new D1("audit");
const archive = new D1("archive");
const env = { DB_CORE: core, DB_MESSAGES: messages, DB_AUDIT: audit, DB_ARCHIVE: archive };

assert.equal(databaseDomainForSql("SELECT * FROM users", {
  moduleName: "users",
  allowedDomains: ["core"]
}), "core");
assert.equal(databaseDomainForSql("INSERT INTO rcs_sms_messages (id) VALUES (?)", {
  moduleName: "rcs",
  allowedDomains: ["messages"]
}), "messages");
assert.throws(() => databaseDomainForSql("INSERT INTO rcs_sms_messages (id) VALUES (?)", {
  moduleName: "core-only",
  allowedDomains: ["core"]
}), /nemá povolený přístup/);
assert.throws(() => databaseDomainForSql(
  "SELECT * FROM users JOIN rcs_sms_messages ON 1=1",
  { moduleName: "forbidden-join", allowedDomains: ["core", "messages"] }
), CrossDatabaseQueryError);

const scoped = getModuleDatabase(env, {
  moduleName: "runtime-test",
  allowedDomains: ["core", "messages"],
  defaultDomain: "core"
});
await scoped.prepare("INSERT INTO users (id) VALUES (?)").bind("u-1").run();
await scoped.prepare("INSERT INTO rcs_sms_messages (id) VALUES (?)").bind("m-1").run();
assert.equal(core.calls.filter((call) => call.type === "run").length, 1);
assert.equal(messages.calls.filter((call) => call.type === "run").length, 1);

const coreStatement = scoped.prepare("UPDATE users SET updated_at=CURRENT_TIMESTAMP");
const messageStatement = scoped.prepare("UPDATE rcs_sms_messages SET updated_at=CURRENT_TIMESTAMP");
await assert.rejects(() => scoped.batch([coreStatement, messageStatement]), CrossDatabaseQueryError);
assert.equal(core.calls.filter((call) => call.type === "batch").length, 0);
assert.equal(messages.calls.filter((call) => call.type === "batch").length, 0);

const isolatedCore = getModuleDatabase({ DB_CORE: core }, {
  moduleName: "core-outage-isolation",
  allowedDomains: ["core"],
  defaultDomain: "core",
  required: false
});
assert.ok(isolatedCore, "Výpadek AUDIT nesmí vyřadit modul používající pouze CORE.");
assert.equal(getModuleDatabase({ DB_CORE: core }, {
  moduleName: "audit-required",
  allowedDomains: ["core", "audit"],
  defaultDomain: "core",
  required: false
}), null);

const rg = process.env.RG_COMMAND || "rg";
const output = execFileSync(rg, [
  "-l",
  "SMART_ODPADY_DB|getLegacyDatabase\\(",
  "functions",
  "workers",
  "--glob",
  "*.js"
], { encoding: "utf8" });
const legacyFiles = output.trim().split("\n").filter(Boolean).sort();
assert.deepEqual(legacyFiles, [
  "functions/_lib/collection-snapshot-archive.js",
  "functions/_lib/database-capacity-monitor.js",
  "functions/_lib/databases.js",
  "workers/database-capacity-runner.js"
].sort());

console.log("database runtime cutover tests: ok");
