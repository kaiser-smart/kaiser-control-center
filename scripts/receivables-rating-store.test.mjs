import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  previewReceivablePaymentRating,
  recomputeReceivablePaymentRating,
  recomputeReceivablePaymentRatingsBatch
} from "../functions/_lib/receivables-rating-store.js";
import {
  getReceivableCustomerDetail,
  getReceivablesDashboard,
  listReceivableCustomers
} from "../functions/_lib/receivables-store.js";
import { decodeReceivableCustomerId } from "../functions/api/receivables/customers/[customerId].js";
import {
  syncReceivablesBankLedger,
  syncReceivablesVistosLedger
} from "../functions/_lib/receivables-ledger-sync.js";

assert.equal(decodeReceivableCustomerId("receivable-customer%3A80492"), "receivable-customer:80492");
assert.equal(decodeReceivableCustomerId("receivable-customer:80492"), "receivable-customer:80492");
assert.equal(decodeReceivableCustomerId("malformed%id"), "malformed%id");

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

const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON");
for (const migration of [
  "0027_create_receivables_core.sql",
  "0028_create_receivable_import_preview.sql",
  "0033_expand_receivables_payment_rating.sql"
]) {
  sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
}

const db = new D1Database(sqlite);
const env = { SMART_ODPADY_DB: db };
const user = { id: "test-user" };

sqlite.prepare(`
  INSERT INTO receivable_customers (
    id, visto_company_id, company_name, automation_status, customer_link_confidence
  ) VALUES (?, ?, ?, 'dry_run', 'MEDIUM')
`).run("customer-rating", "vistos-company-rating", "Rating Test s.r.o.");

const insertInvoice = sqlite.prepare(`
  INSERT INTO receivable_invoices (
    id, visto_invoice_id, invoice_number, variable_symbol, customer_id,
    issue_date, due_date, total_amount, paid_amount, open_amount, status, paid_date,
    customer_link_confidence
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 10000, 10000, 0, 'paid', ?, 'MEDIUM')
`);
for (let index = 1; index <= 6; index += 1) {
  const month = String(index).padStart(2, "0");
  insertInvoice.run(
    `invoice-rating-${index}`,
    `vistos-invoice-rating-${index}`,
    `2026${month}01`,
    `2026${month}01`,
    "customer-rating",
    `2026-${month}-01`,
    `2026-${month}-15`,
    `2026-${month}-15`
  );
}

{
  const preview = await previewReceivablePaymentRating(env, {
    customerId: "customer-rating",
    periodTo: "2026-07-01",
    calculatedAt: "2026-07-01T12:00:00.000Z"
  });
  assert.equal(preview.persisted, false);
  assert.equal(preview.rating.rating, "A");
  assert.equal(preview.rating.confidence, "HIGH");
  assert.equal(preview.rating.automationStatus, "DRY_RUN_ONLY");
  assert.equal(preview.rating.recommendedAutomationStatus, "READY_FOR_AUTOMATION");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_customer_payment_ratings").get().count, 0);
}

{
  const first = await recomputeReceivablePaymentRating(env, {
    customerId: "customer-rating",
    periodTo: "2026-07-01",
    calculatedAt: "2026-07-01T12:00:00.000Z",
    persist: true
  }, user);
  const second = await recomputeReceivablePaymentRating(env, {
    customerId: "customer-rating",
    periodTo: "2026-07-01",
    calculatedAt: "2026-07-01T12:00:00.000Z",
    persist: true
  }, user);
  assert.equal(first.persisted, true);
  assert.equal(second.rating.id, first.rating.id);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_customer_payment_ratings").get().count, 1);
}

{
  sqlite.prepare(`
    INSERT INTO receivable_inbox_messages (
      id, customer_id, from_address, subject, body_text, classification, received_at
    ) VALUES (?, ?, 'customer@example.test', 'Reklamace', 'Reklamace', 'dispute', ?)
  `).run("inbox-dispute", "customer-rating", "2026-07-01T13:00:00.000Z");
  const result = await recomputeReceivablePaymentRating(env, {
    customerId: "customer-rating",
    periodTo: "2026-07-01",
    persist: true
  }, user);
  assert.equal(result.rating.automationStatus, "HUMAN_REVIEW");
  assert.equal(result.rating.dataQualityFlags.includes("DISPUTE_ACTIVE"), true);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_customer_payment_ratings").get().count, 2);
}

{
  sqlite.prepare(`
    INSERT INTO receivable_customers (id, company_name, automation_status)
    VALUES ('customer-legacy', 'Legacy Test s.r.o.', 'dry_run')
  `).run();
  sqlite.prepare(`
    INSERT INTO receivable_customer_payment_ratings (
      id, customer_id, payment_morality_score, rating, automation_status
    ) VALUES ('rating-legacy', 'customer-legacy', 100, 'C', 'dry_run')
  `).run();
  const detail = await getReceivableCustomerDetail(env, "customer-legacy");
  assert.equal(detail.ratings[0].rating, "N");
  assert.equal(detail.ratings[0].score, null);
  assert.equal(detail.ratings[0].confidence, "NONE");
  assert.equal(detail.ratings[0].calculationVersion, "legacy");
}

sqlite.prepare(`
  INSERT INTO receivable_import_batches (
    id, import_kind, source, filename, status, row_count, accepted_count, review_count, ignored_count
  ) VALUES (?, ?, ?, ?, 'snapshot', 1, 1, 0, 0)
`).run("batch-vistos", "vistos_invoice_snapshot", "vistos", "vistos.json");
sqlite.prepare(`
  INSERT INTO receivable_import_rows (
    id, batch_id, row_number, entity_kind, preview_status, normalized_json
  ) VALUES (?, ?, 1, 'vistos_invoice', 'ready', ?)
`).run("row-vistos", "batch-vistos", JSON.stringify({
  vistoInvoiceId: "vistos-ledger-invoice",
  invoiceNumber: "2601000999",
  variableSymbol: "2601000999",
  customerCompanyId: "vistos-ledger-customer",
  customerCompanyName: "Ledger Test s.r.o.",
  customerBranchId: "vistos-ledger-branch",
  ico: "12345678",
  dic: "CZ12345678",
  billingEmail: "fakturace@example.test",
  standardDueDays: 14,
  issueDate: "2026-06-01",
  dueDate: "2026-06-15",
  totalAmount: 1210,
  paidAmount: 0,
  openAmount: 0,
  isPaid: false,
  currency: "CZK",
  customerManagerName: "Test Manager"
}));

{
  const preview = await syncReceivablesVistosLedger(env, { batchId: "batch-vistos" }, user);
  assert.equal(preview.persisted, false);
  assert.equal(preview.summary.ready, 0);
  assert.equal(preview.summary.review, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_customers WHERE company_name = 'Ledger Test s.r.o.'").get().count, 0);
  const persisted = await syncReceivablesVistosLedger(env, { batchId: "batch-vistos", persist: true }, user);
  assert.equal(persisted.persisted, true);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_invoices WHERE invoice_number = '2601000999'").get().count, 1);
  const storedInvoice = sqlite.prepare("SELECT open_amount, status, data_quality_flags_json FROM receivable_invoices WHERE invoice_number = '2601000999'").get();
  assert.equal(storedInvoice.open_amount, 1210);
  assert.equal(storedInvoice.status, "unpaid");
  assert.deepEqual(JSON.parse(storedInvoice.data_quality_flags_json), ["INVOICE_AMOUNT_MISMATCH", "MISSING_REMAINING_AMOUNT"]);
  sqlite.prepare(`
    UPDATE receivable_import_batches
    SET row_count = 2, accepted_count = 2
    WHERE id = 'batch-vistos'
  `).run();
  sqlite.prepare(`
    INSERT INTO receivable_import_rows (
      id, batch_id, row_number, entity_kind, preview_status, normalized_json
    ) VALUES (?, ?, 2, 'vistos_invoice', 'ready', ?)
  `).run("row-vistos-without-metadata", "batch-vistos", JSON.stringify({
    vistoInvoiceId: "vistos-ledger-invoice-without-metadata",
    invoiceNumber: "2601001000",
    variableSymbol: "2601001000",
    customerCompanyId: "vistos-ledger-customer",
    issueDate: "2026-06-02",
    dueDate: "2026-06-16",
    totalAmount: 100,
    paidAmount: 100,
    openAmount: 0,
    isPaid: true,
    currency: "CZK"
  }));
  await syncReceivablesVistosLedger(env, { batchId: "batch-vistos", offset: 1, persist: true }, user);
  const storedCustomer = sqlite.prepare(`
    SELECT company_name, ico, dic, visto_branch_id, billing_email, standard_due_days
    FROM receivable_customers
    WHERE visto_company_id = 'vistos-ledger-customer'
  `).get();
  assert.deepEqual({ ...storedCustomer }, {
    company_name: "Ledger Test s.r.o.",
    ico: "12345678",
    dic: "CZ12345678",
    visto_branch_id: "vistos-ledger-branch",
    billing_email: "fakturace@example.test",
    standard_due_days: 14
  });
  sqlite.prepare(`
    INSERT INTO receivable_import_batches (
      id, import_kind, source, filename, status, row_count, accepted_count, review_count, ignored_count, created_at
    ) VALUES (?, ?, ?, ?, 'snapshot_running', 1, 1, 0, 0, '2026-07-11 00:00:00')
  `).run("batch-vistos-running", "vistos_invoice_snapshot", "vistos", "vistos-running.json");
  const latestCompleted = await syncReceivablesVistosLedger(env, {}, user);
  assert.equal(latestCompleted.batchId, "batch-vistos");
  await assert.rejects(
    syncReceivablesVistosLedger(env, { batchId: "batch-vistos-running" }, user),
    (error) => error.code === "receivables_vistos_snapshot_not_complete" && error.status === 409
  );
  const customerList = await listReceivableCustomers(env);
  assert.equal(customerList.customers[0].package.totalOpenAmount, 1210);
  assert.equal(customerList.customers[0].package.totalOverdueAmount, 1210);
  const dashboard = await getReceivablesDashboard(env, { today: "2026-07-10" });
  assert.equal(dashboard.kpis.automaticCustomers, 0);
}

{
  const batch = await recomputeReceivablePaymentRatingsBatch(env, {
    offset: 0,
    limit: 1,
    persist: false,
    today: "2026-07-10"
  }, user);
  assert.equal(batch.summary.processed, 1);
  assert.equal(batch.summary.persisted, 0);
  assert.equal(batch.sendsCustomerCommunication, false);
  assert.equal(batch.startsAutomation, false);
}

sqlite.prepare(`
  INSERT INTO receivable_import_batches (
    id, import_kind, source, filename, status, row_count, accepted_count, review_count, ignored_count,
    content_sha256
  ) VALUES (?, ?, ?, ?, 'preview', 1, 1, 0, 0, ?)
`).run("batch-bank", "bank_transactions", "kb_csv", "kb.csv", "sha256-test");
sqlite.prepare(`
  INSERT INTO receivable_import_rows (
    id, batch_id, row_number, entity_kind, preview_status, normalized_json
  ) VALUES (?, ?, 1, 'bank_payment', 'ready', ?)
`).run("row-bank", "batch-bank", JSON.stringify({
  source: "kb_csv",
  bankTransactionId: "KB-TEST-1",
  bookingDate: "2026-06-15",
  valueDate: "2026-06-15",
  amount: 1210,
  currency: "CZK",
  variableSymbol: "2601000999",
  counterpartyName: "Ledger Test s.r.o.",
  counterpartyAccount: "123/0100",
  message: "Uhrada faktury",
  dataQualityFlags: []
}));

{
  const preview = await syncReceivablesBankLedger(env, { batchId: "batch-bank" }, user);
  assert.equal(preview.persisted, false);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_payment_transactions").get().count, 0);
  const persisted = await syncReceivablesBankLedger(env, { batchId: "batch-bank", persist: true }, user);
  assert.equal(persisted.persisted, true);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_payment_transactions").get().count, 1);
  assert.equal(sqlite.prepare("SELECT content_hash FROM receivable_payment_transactions").get().content_hash, "sha256-test");
}

sqlite.prepare(`
  INSERT INTO receivable_invoices (
    id, invoice_number, variable_symbol, customer_id, issue_date, due_date,
    total_amount, paid_amount, open_amount, status, customer_link_confidence
  ) VALUES (?, ?, ?, 'customer-rating', ?, ?, 100, 0, 100, 'unpaid', 'HIGH')
`).run("invoice-review-over", "9910000001", "9910000001", "2026-06-01", "2026-06-15");
sqlite.prepare(`
  INSERT INTO receivable_invoices (
    id, invoice_number, variable_symbol, customer_id, issue_date, due_date,
    total_amount, paid_amount, open_amount, status, customer_link_confidence
  ) VALUES (?, ?, ?, 'customer-rating', ?, ?, 100, 0, 100, 'unpaid', 'HIGH')
`).run("invoice-review-before", "9910000002", "9910000002", "2026-06-01", "2026-06-15");

const insertReviewPayment = sqlite.prepare(`
  INSERT INTO receivable_payment_transactions (
    id, source, booking_date, amount, variable_symbol, transaction_type, data_quality_flags_json
  ) VALUES (?, 'kb_csv', ?, ?, ?, ?, ?)
`);
insertReviewPayment.run(
  "payment-review-no-vs",
  "2026-06-20",
  50,
  "",
  "Prichozi uhrada",
  JSON.stringify(["PAYMENT_WITHOUT_VS", "UNMATCHED_PAYMENT", "DUPLICATE_PAYMENT_CANDIDATE"])
);
insertReviewPayment.run(
  "payment-review-unknown-vs",
  "2026-06-20",
  60,
  "9999999999",
  "Prichozi uhrada",
  JSON.stringify(["UNMATCHED_PAYMENT"])
);
insertReviewPayment.run(
  "payment-review-over",
  "2026-06-20",
  150,
  "9910000001",
  "Prichozi uhrada",
  JSON.stringify(["UNMATCHED_PAYMENT", "PAYMENT_MATCH_LOW_CONFIDENCE"])
);
insertReviewPayment.run(
  "payment-review-before",
  "2026-05-20",
  100,
  "9910000002",
  "Prichozi uhrada",
  JSON.stringify(["UNMATCHED_PAYMENT", "PAYMENT_MATCH_LOW_CONFIDENCE"])
);
insertReviewPayment.run(
  "payment-review-refund",
  "2026-06-20",
  40,
  "",
  "Vraceni nakupu",
  JSON.stringify(["PAYMENT_WITHOUT_VS", "UNMATCHED_PAYMENT"])
);

{
  const dashboard = await getReceivablesDashboard(env, { today: "2026-07-10" });
  const buckets = new Map(dashboard.unmatchedPaymentReview.buckets.map((bucket) => [bucket.code, bucket]));
  assert.equal(dashboard.sourceStatus.insolvency, "isir_read_only_preview");
  assert.equal(dashboard.unmatchedPaymentReview.totalCount, 5);
  assert.equal(dashboard.unmatchedPaymentReview.totalAmount, 400);
  assert.equal(dashboard.unmatchedPaymentReview.receivableReviewCount, 4);
  assert.equal(dashboard.unmatchedPaymentReview.receivableReviewAmount, 360);
  assert.equal(dashboard.unmatchedPaymentReview.technicalMovementCount, 1);
  assert.equal(dashboard.unmatchedPaymentReview.technicalMovementAmount, 40);
  assert.equal(dashboard.unmatchedPaymentReview.duplicateCandidateCount, 1);
  assert.equal(dashboard.unmatchedPaymentReview.safeAutoMatchCount, 0);
  assert.equal(dashboard.unmatchedPaymentReview.blocksAutomation, true);
  assert.equal(buckets.get("missing_variable_symbol").paymentCount, 1);
  assert.equal(buckets.get("variable_symbol_without_invoice").paymentCount, 1);
  assert.equal(buckets.get("exact_variable_symbol_over_invoice_total").paymentCount, 1);
  assert.equal(buckets.get("payment_before_invoice").paymentCount, 1);
  assert.equal(buckets.get("technical_purchase_refund").paymentCount, 1);
  assert.equal(buckets.get("technical_purchase_refund").reviewKind, "technical");
}

assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receivable_communication_events").get().count, 0);
console.log("receivables rating store tests passed");
