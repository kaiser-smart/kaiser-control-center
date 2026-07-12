import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  applyReceivablesPaymentReconciliation,
  buildReceivablesPaymentReconciliationRow,
  calculateReconciledInvoiceState,
  previewReceivablesPaymentReconciliation
} from "../functions/_lib/receivables-payment-reconciliation.js";
import { onRequestGet, onRequestPost } from "../functions/api/receivables/payments/reconciliation.js";

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

const baseInvoice = {
  id: "invoice-1",
  invoice_number: "26010001",
  customer_id: "customer-1",
  company_name: "Test s.r.o.",
  total_amount: 10000,
  paid_amount: 0,
  open_amount: 10000,
  status: "unpaid",
  paid_date: ""
};
const confirmed = (amount, bookingDate, id = bookingDate) => ({
  id,
  matchedAmount: amount,
  bookingDate,
  confidence: 1,
  status: "auto_matched"
});

const onePartial = calculateReconciledInvoiceState(baseInvoice, [confirmed(5000, "2026-07-01")]);
assert.equal(onePartial.status, "partially_paid");
assert.equal(onePartial.paidAmount, 5000);
assert.equal(onePartial.openAmount, 5000);
assert.equal(onePartial.paidDate, "");

const fullyPaid = calculateReconciledInvoiceState(baseInvoice, [
  confirmed(5000, "2026-07-01", "payment-1"),
  confirmed(5000, "2026-07-03", "payment-2")
]);
assert.equal(fullyPaid.status, "paid");
assert.equal(fullyPaid.openAmount, 0);
assert.equal(fullyPaid.paidDate, "2026-07-03");

const withinTolerance = calculateReconciledInvoiceState(baseInvoice, [confirmed(9990, "2026-07-04")]);
assert.equal(withinTolerance.status, "paid");
assert.equal(withinTolerance.openAmount, 0);

const rejectedIgnored = calculateReconciledInvoiceState(baseInvoice, [{
  ...confirmed(10000, "2026-07-05"),
  status: "needs_review"
}]);
assert.equal(rejectedIgnored.status, "unpaid");

const protectedInvoice = buildReceivablesPaymentReconciliationRow(
  { ...baseInvoice, status: "insolvency_hold" },
  [confirmed(10000, "2026-07-05")]
);
assert.equal(protectedInvoice.after.status, "insolvency_hold");
assert.equal(protectedInvoice.requiresUpdate, false);

const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON");
for (const migration of [
  "0027_create_receivables_core.sql",
  "0028_create_receivable_import_preview.sql",
  "0033_expand_receivables_payment_rating.sql"
]) {
  sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
}
sqlite.prepare("INSERT INTO receivable_customers (id, company_name) VALUES ('customer-1', 'Test s.r.o.')").run();
sqlite.prepare(`
  INSERT INTO receivable_invoices (
    id, invoice_number, variable_symbol, customer_id, total_amount, paid_amount, open_amount,
    currency, status, data_quality_flags_json
  ) VALUES ('invoice-1', '26010001', '26010001', 'customer-1', 10000, 0, 10000,
    'CZK', 'unpaid', '["INVOICE_AMOUNT_MISMATCH","MISSING_REMAINING_AMOUNT"]')
`).run();
sqlite.prepare(`
  INSERT INTO receivable_payment_transactions (id, source, booking_date, amount, currency)
  VALUES ('payment-1', 'kb_pdf', '2026-07-01', 5000, 'CZK'),
         ('payment-2', 'kb_pdf', '2026-07-03', 5000, 'CZK')
`).run();
sqlite.prepare(`
  INSERT INTO receivable_payment_matches (
    id, invoice_id, payment_transaction_id, customer_id, matched_amount, confidence, match_method, status
  ) VALUES ('match-1', 'invoice-1', 'payment-1', 'customer-1', 5000, 1, 'variable_symbol_exact', 'auto_matched'),
           ('match-2', 'invoice-1', 'payment-2', 'customer-1', 5000, 1, 'variable_symbol_exact', 'matched')
`).run();

const env = { SMART_ODPADY_DB: new D1Database(sqlite) };
const preview = await previewReceivablesPaymentReconciliation(env);
assert.equal(preview.readOnly, true);
assert.equal(preview.summary.pendingCount, 1);
assert.equal(preview.summary.fullyCoveredCount, 1);
assert.equal(preview.summary.affectedCustomerCount, 1);
assert.equal(sqlite.prepare("SELECT status FROM receivable_invoices WHERE id='invoice-1'").get().status, "unpaid");

await assert.rejects(
  applyReceivablesPaymentReconciliation(env, {
    previewFingerprint: "fnv1a32:stale",
    expectedCandidateCount: 1
  }, { id: "tester" }),
  (error) => error.code === "receivables_payment_reconciliation_preview_stale"
);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_audit_log").get().count, 0);

const applied = await applyReceivablesPaymentReconciliation(env, {
  previewFingerprint: preview.previewFingerprint,
  expectedCandidateCount: 1
}, { id: "tester" });
assert.equal(applied.appliedCount, 1);
assert.equal(applied.auditCount, 1);
assert.equal(applied.recalculatesRatings, false);
assert.equal(applied.sendsCustomerCommunication, false);
assert.equal(applied.startsAutomation, false);
assert.deepEqual(
  { ...sqlite.prepare("SELECT status, paid_amount, open_amount, paid_date FROM receivable_invoices WHERE id='invoice-1'").get() },
  { status: "paid", paid_amount: 10000, open_amount: 0, paid_date: "2026-07-03" }
);
const audit = sqlite.prepare("SELECT action, actor_user_id, before_json, after_json FROM receivable_audit_log").get();
assert.equal(audit.action, "payment_state_reconciled");
assert.equal(audit.actor_user_id, "tester");
assert.equal(JSON.parse(audit.before_json).status, "unpaid");
assert.equal(JSON.parse(audit.after_json).status, "paid");

const secondPreview = await previewReceivablesPaymentReconciliation(env);
assert.equal(secondPreview.summary.pendingCount, 0);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_audit_log").get().count, 1);
await assert.rejects(
  applyReceivablesPaymentReconciliation(env, {
    previewFingerprint: preview.previewFingerprint,
    expectedCandidateCount: 1
  }, { id: "tester" }),
  (error) => error.code === "receivables_payment_reconciliation_preview_stale"
);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_audit_log").get().count, 1);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_communication_events").get().count, 0);

const unauthorizedGet = await onRequestGet({
  request: new Request("https://example.test/api/receivables/payments/reconciliation"),
  env: {}
});
assert.equal(unauthorizedGet.status, 401);
const unauthorizedPost = await onRequestPost({
  request: new Request("https://example.test/api/receivables/payments/reconciliation", { method: "POST" }),
  env: {}
});
assert.equal(unauthorizedPost.status, 401);

console.log("receivables payment reconciliation tests passed");
