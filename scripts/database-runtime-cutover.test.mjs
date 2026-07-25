import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import {
  CrossDatabaseQueryError,
  LegacyDatabaseWriteError,
  databaseDomainForSql,
  getLegacyDatabase,
  legacySqlAccess,
  getModuleDatabase
} from "../functions/_lib/databases.js";
import { readFileSync } from "node:fs";

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

  async first() {
    this.database.calls.push({ type: "first", sql: this.sql, values: this.values });
    return { count: 1 };
  }

  async all() {
    this.database.calls.push({ type: "all", sql: this.sql, values: this.values });
    return { results: [{ count: 1 }] };
  }

  async raw() {
    this.database.calls.push({ type: "raw", sql: this.sql, values: this.values });
    return [[1]];
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

assert.equal(legacySqlAccess("SELECT * FROM users").allowed, true);
assert.equal(legacySqlAccess("WITH rows AS (SELECT 1) SELECT * FROM rows").allowed, true);
assert.equal(legacySqlAccess("PRAGMA page_count").allowed, true);
assert.equal(legacySqlAccess("WITH rows AS (SELECT 1) UPDATE users SET active = 0").allowed, false);
assert.equal(legacySqlAccess("VACUUM").allowed, false);

const legacy = new D1("legacy");
const legacyAudit = new D1("legacy-audit");
const legacyReadOnly = getLegacyDatabase({
  SMART_ODPADY_DB: legacy,
  DB_AUDIT: legacyAudit
}, {
  moduleName: "legacy-test",
  purpose: "read-only proof"
});
assert.deepEqual(await legacyReadOnly.prepare("SELECT COUNT(*) AS count FROM users").first(), { count: 1 });
assert.equal(legacy.calls.filter((call) => call.type === "first").length, 1);
assert.equal(legacyAudit.calls.filter((call) => call.type === "run").length, 1);

await assert.rejects(
  () => legacyReadOnly.prepare("INSERT INTO users (id) VALUES (?)").bind("forbidden").run(),
  LegacyDatabaseWriteError
);
assert.equal(legacy.calls.filter((call) => call.type === "run").length, 0);
assert.equal(legacyAudit.calls.filter((call) => call.type === "run").length, 2);
await assert.rejects(
  () => legacyReadOnly.exec("SELECT * FROM users"),
  LegacyDatabaseWriteError
);
assert.equal(legacyAudit.calls.filter((call) => call.type === "run").length, 3);

const failingAudit = new D1("failing-audit");
failingAudit.prepare = (sql) => {
  const statement = new Statement(failingAudit, sql);
  statement.run = async () => {
    throw new Error("audit unavailable");
  };
  return statement;
};
const auditFailClosed = getLegacyDatabase({
  SMART_ODPADY_DB: legacy,
  DB_AUDIT: failingAudit
}, {
  moduleName: "legacy-audit-outage-test",
  purpose: "fail closed proof"
});
await assert.rejects(
  () => auditFailClosed.prepare("SELECT COUNT(*) AS count FROM users").first(),
  /audit unavailable/
);
assert.equal(legacy.calls.filter((call) => call.type === "first").length, 1);

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

const legacyBindingConfigs = [
  "wrangler.toml",
  "wrangler.module-automation-runner.toml",
  "wrangler.data-box-plus-sync-runner.toml",
  "wrangler.data-box-automation-runner.toml",
  "wrangler.orwii-fuel-sync-runner.toml",
  "wrangler.self-repair-ui-interaction-runner.toml"
].filter((file) => readFileSync(file, "utf8").includes('binding = "SMART_ODPADY_DB"'));
assert.deepEqual(legacyBindingConfigs, []);
assert.match(readFileSync("wrangler.database-capacity-runner.toml", "utf8"), /binding = "SMART_ODPADY_DB"/);
assert.match(readFileSync("wrangler.database-archive-runner.toml", "utf8"), /binding = "SMART_ODPADY_DB"/);

console.log("database runtime cutover tests: ok");
