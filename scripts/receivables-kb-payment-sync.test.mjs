import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  downloadReceivablesKbPayments,
  normalizeReceivablesKbTransaction,
  receivablesKbApiReadiness
} from "../functions/_lib/receivables-kb-api-client.js";
import {
  receivablesKbPaymentSyncStatus,
  receivablesKbPaymentWindow,
  runReceivablesKbPaymentSyncAutomation,
  syncReceivablesKbPayments
} from "../functions/_lib/receivables-kb-payment-sync.js";
import {
  onRequestGet,
  onRequestPost
} from "../functions/api/receivables/kb/payment-sync.js";

class D1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) { return new D1Statement(this.database, this.sql, values); }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) }; }
  async first() { return this.database.prepare(this.sql).get(...this.values) || null; }
  async run() { return { success: true, meta: this.database.prepare(this.sql).run(...this.values) }; }
}

class D1Database {
  constructor(database) { this.database = database; }
  prepare(sql) { return new D1Statement(this.database, sql); }
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

const baseEnv = {
  KB_ADAA_ENVIRONMENT: "production",
  KB_ADAA_OAUTH_API_KEY: "oauth-key",
  KB_ADAA_ACCOUNT_API_KEY: "account-key",
  KB_ADAA_CLIENT_ID: "client-id",
  KB_ADAA_CLIENT_SECRET: "client-secret",
  KB_ADAA_REFRESH_TOKEN: "refresh-token",
  KB_ADAA_REDIRECT_URI: "https://smart-odpady.ai/api/receivables/kb/oauth/callback"
};

assert.equal(receivablesKbApiReadiness(baseEnv).ready, true);
assert.deepEqual(receivablesKbApiReadiness({}).missingEnv, [
  "KB_ADAA_ENVIRONMENT",
  "KB_ADAA_OAUTH_API_KEY",
  "KB_ADAA_ACCOUNT_API_KEY",
  "KB_ADAA_CLIENT_ID",
  "KB_ADAA_CLIENT_SECRET",
  "KB_ADAA_REFRESH_TOKEN"
]);
assert.equal(receivablesKbApiReadiness({ ...baseEnv, KB_ADAA_ENVIRONMENT: "sandbox" }).ready, false);
assert.deepEqual(receivablesKbApiReadiness({ ...baseEnv, KB_ADAA_ENVIRONMENT: "sandbox" }).missingEnv, ["KB_ADAA_ENVIRONMENT"]);

const normalized = normalizeReceivablesKbTransaction({
  status: "BOOK",
  creditDebitIndicator: "CREDIT",
  transactionType: "DOMESTIC",
  amount: { value: 1250.5, currency: "CZK" },
  bookingDate: "2026-07-21",
  valueDate: "2026-07-21",
  counterParty: { name: "Test s.r.o.", iban: "CZ12 0100 0000 0012 3456 7890" },
  references: { accountServicer: "kb-reference-1", variable: "26010001", receiver: "Faktura" }
}, { accountId: "account-1", iban: "CZ0001000000000000000001" });
assert.equal(normalized.bookedIncoming, true);
assert.equal(normalized.bankTransactionId, "kb-reference-1");
assert.equal(normalized.variableSymbol, "26010001");
assert.equal(normalized.counterpartyAccount, "CZ1201000000001234567890");

const firstWindow = receivablesKbPaymentWindow("2026-07-22T10:07:00.000Z", null, {});
assert.equal(firstWindow.mode, "initial_backfill");
assert.equal(firstWindow.lookbackDays, 90);
const incrementalWindow = receivablesKbPaymentWindow("2026-07-22T11:03:00.000Z", {
  period_to: "2026-07-22T10:07:00Z"
}, {});
assert.equal(incrementalWindow.mode, "incremental_overlap");
assert.equal(incrementalWindow.lookbackDays, 7);

function kbFetchFixture() {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/oauth2/v3/access_token")) {
      assert.equal(options.method, "POST");
      assert.equal(options.headers.apiKey, "oauth-key");
      assert.equal(options.body.get("grant_type"), "refresh_token");
      return Response.json({ access_token: "access-token", expires_in: 180, token_type: "Bearer" });
    }
    if (String(url).endsWith("/adaa/v2/accounts")) {
      assert.equal(options.headers.Authorization, "Bearer access-token");
      return Response.json({ content: [{ accountId: "account-1", iban: "CZ0001000000000000000001", currency: "CZK" }] });
    }
    const parsed = new URL(String(url));
    assert.equal(parsed.searchParams.get("size"), "100");
    assert.ok(parsed.searchParams.get("fromDateTime"));
    assert.ok(parsed.searchParams.get("toDateTime"));
    if (parsed.searchParams.get("page") === "0") {
      return Response.json({
        totalPages: 2,
        content: [
          {
            status: "BOOK",
            creditDebitIndicator: "CREDIT",
            transactionType: "DOMESTIC",
            amount: { value: 1250.5, currency: "CZK" },
            bookingDate: "2026-07-21",
            valueDate: "2026-07-21",
            counterParty: { name: "Test s.r.o.", iban: "CZ1201000000001234567890" },
            references: { accountServicer: "kb-reference-1", variable: "26010001", receiver: "Faktura" }
          },
          {
            status: "PDNG",
            creditDebitIndicator: "CREDIT",
            amount: { value: 500, currency: "CZK" },
            references: { accountServicer: "kb-pending-1" }
          }
        ]
      });
    }
    return Response.json({
      totalPages: 2,
      content: [
        {
          status: "BOOK",
          creditDebitIndicator: "DEBIT",
          amount: { value: 100, currency: "CZK" },
          references: { accountServicer: "kb-debit-1" }
        },
        {
          status: "BOOK",
          creditDebitIndicator: "CREDIT",
          transactionType: "DOMESTIC",
          amount: { value: 800, currency: "CZK" },
          bookingDate: "2026-07-22",
          valueDate: "2026-07-22",
          counterParty: { name: "Druhá firma", accountNo: "123456789", bankCode: "0800" },
          references: { accountServicer: "kb-reference-2", variable: "26010002" }
        },
        {
          status: "BOOK",
          creditDebitIndicator: "CREDIT",
          amount: { value: 42, currency: "CZK" },
          bookingDate: "2026-07-22",
          references: {}
        }
      ]
    });
  };
  return { calls, fetchImpl };
}

const downloadFixture = kbFetchFixture();
const download = await downloadReceivablesKbPayments(baseEnv, {
  fromDateTime: "2026-07-15T10:07:00Z",
  toDateTime: "2026-07-22T10:07:00Z",
  fetchImpl: downloadFixture.fetchImpl
});
assert.equal(download.payments.length, 2);
assert.equal(download.summary.pageCount, 2);
assert.equal(download.summary.transactionCount, 5);
assert.equal(download.summary.ignoredCount, 3);
assert.equal(download.summary.missingReferenceCount, 1);
assert.equal(downloadFixture.calls.length, 4);

const sqlite = new DatabaseSync(":memory:");
for (const migration of [
  "0015_create_module_rules.sql",
  "0027_create_receivables_core.sql",
  "0028_create_receivable_import_preview.sql",
  "0033_expand_receivables_payment_rating.sql"
]) {
  sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
}
const env = { ...baseEnv, SMART_ODPADY_DB: new D1Database(sqlite) };
const firstFixture = kbFetchFixture();
const firstSync = await syncReceivablesKbPayments(env, {
  now: "2026-07-22T10:07:00.000Z",
  triggeredBy: "manual-ui",
  user: { id: "tester" },
  fetchImpl: firstFixture.fetchImpl
});
assert.equal(firstSync.status, "completed");
assert.equal(firstSync.summary.insertedCount, 2);
assert.equal(firstSync.summary.updatedCount, 0);
assert.equal(firstSync.createsPaymentOrders, false);
assert.equal(firstSync.reconcilesInvoicesAutomatically, false);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_payment_transactions").get().count, 2);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_payment_matches").get().count, 0);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM module_rules WHERE id = 'receivables-kb-payment-sync' AND status = 'active'").get().count, 1);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM module_rule_audit_log WHERE rule_id = 'receivables-kb-payment-sync'").get().count, 1);

await assert.rejects(
  syncReceivablesKbPayments(env, {
    now: "2026-07-22T10:30:00.000Z",
    triggeredBy: "manual-ui",
    fetchImpl: kbFetchFixture().fetchImpl
  }),
  (error) => error.code === "receivables_kb_sync_rate_limited" && error.status === 429
);

await assert.rejects(
  syncReceivablesKbPayments(env, {
    now: "2026-07-22T11:07:00.000Z",
    triggeredBy: "cloudflare-cron",
    fetchImpl: kbFetchFixture().fetchImpl
  }),
  (error) => error.code === "receivables_kb_sync_rate_limited" && error.status === 429
);

const secondFixture = kbFetchFixture();
const secondSync = await syncReceivablesKbPayments(env, {
  now: "2026-07-22T11:08:00.000Z",
  triggeredBy: "cloudflare-cron",
  fetchImpl: secondFixture.fetchImpl
});
assert.equal(secondSync.summary.insertedCount, 0);
assert.equal(secondSync.summary.updatedCount, 2);
assert.equal(secondSync.window.mode, "incremental_overlap");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_payment_transactions").get().count, 2);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_import_batches WHERE status='imported'").get().count, 2);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_audit_log").get().count, 4);

const status = await receivablesKbPaymentSyncStatus(env);
assert.equal(status.configured, true);
assert.equal(status.cron, "7 */2 * * *");
assert.equal(status.lastRun.status, "completed");
assert.equal(status.lastBatch.summary.updatedCount, 2);
assert.equal(status.safety.createsPaymentOrders, false);
assert.equal(status.automationEnabled, true);
assert.equal(status.automationRule.status, "active");

sqlite.prepare("UPDATE module_rules SET status = 'inactive' WHERE id = 'receivables-kb-payment-sync'").run();
const disabledByRule = await runReceivablesKbPaymentSyncAutomation(env, {
  scheduledTime: new Date("2026-07-22T13:08:00.000Z").getTime(),
  fetchImpl: kbFetchFixture().fetchImpl
});
assert.equal(disabledByRule.status, "disabled");
assert.equal(disabledByRule.automationRuleStatus, "inactive");

const waiting = await runReceivablesKbPaymentSyncAutomation({});
assert.equal(waiting.status, "waiting_configuration");
assert.equal(waiting.importsKbPayments, false);

const unauthorizedGet = await onRequestGet({
  request: new Request("https://example.test/api/receivables/kb/payment-sync"),
  env: {}
});
assert.equal(unauthorizedGet.status, 401);
const unauthorizedPost = await onRequestPost({
  request: new Request("https://example.test/api/receivables/kb/payment-sync", { method: "POST" }),
  env: {}
});
assert.equal(unauthorizedPost.status, 401);

console.log("receivables KB payment sync tests passed");
