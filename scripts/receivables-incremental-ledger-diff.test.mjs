import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  buildReceivablesIncrementalDiffRow,
  getReceivablesIncrementalLedgerDiff
} from "../functions/_lib/receivables-incremental-ledger-diff.js";
import { onRequestGet } from "../functions/api/receivables/vistos/incremental-ledger-diff.js";

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
}

class D1Database {
  constructor(database) {
    this.database = database;
  }
  prepare(sql) {
    return new D1Statement(this.database, sql);
  }
}

function stagingRow(overrides = {}) {
  return {
    row_number: 1,
    preview_status: "ready",
    issue_code: null,
    normalized_json: JSON.stringify({
      vistoInvoiceId: "invoice-1",
      invoiceNumber: "26010001",
      variableSymbol: "26010001",
      customerCompanyId: "customer-1",
      customerName: "Test s.r.o.",
      issueDate: "2026-07-01",
      dueDate: "2026-07-15",
      totalAmount: 1000,
      paidAmount: 0,
      openAmount: 1000,
      currency: "CZK",
      isPaid: false,
      ...overrides
    })
  };
}

function ledgerRow(overrides = {}) {
  return {
    visto_invoice_id: "invoice-1",
    invoice_number: "26010001",
    variable_symbol: "26010001",
    customer_id: "receivable-customer:customer-1",
    issue_date: "2026-07-01",
    due_date: "2026-07-15",
    total_amount: 1000,
    paid_amount: 0,
    open_amount: 1000,
    currency: "CZK",
    status: "unpaid",
    visto_branch_id: null,
    customer_manager_id: null,
    customer_manager_name: null,
    data_quality_flags_json: "[]",
    ...overrides
  };
}

const unchanged = buildReceivablesIncrementalDiffRow(stagingRow(), ledgerRow());
assert.equal(unchanged.classification, "unchanged");
assert.equal(unchanged.ratingImpact.relevant, false);

const paymentChanged = buildReceivablesIncrementalDiffRow(
  stagingRow({ paidAmount: 1000, openAmount: 0, isPaid: true }),
  ledgerRow()
);
assert.equal(paymentChanged.classification, "changed");
assert.deepEqual(paymentChanged.changes.map((change) => change.key), ["paidAmount", "openAmount", "status"]);
assert.equal(paymentChanged.ratingImpact.relevant, true);

const newInvoice = buildReceivablesIncrementalDiffRow(stagingRow({ vistoInvoiceId: "invoice-2" }), null);
assert.equal(newInvoice.classification, "new");
assert.deepEqual(newInvoice.ratingImpact.affectedCustomerIds, ["receivable-customer:customer-1"]);

const conflict = buildReceivablesIncrementalDiffRow(stagingRow({ customerCompanyId: "" }), null);
assert.equal(conflict.classification, "conflict");
assert.ok(conflict.conflictReasons.includes("CUSTOMER_LINK_NOT_RELIABLE"));

const customerChanged = buildReceivablesIncrementalDiffRow(
  stagingRow({ customerCompanyId: "customer-2" }),
  ledgerRow()
);
assert.equal(customerChanged.classification, "changed");
assert.deepEqual(customerChanged.ratingImpact.affectedCustomerIds, [
  "receivable-customer:customer-1",
  "receivable-customer:customer-2"
]);

const managerChanged = buildReceivablesIncrementalDiffRow(
  stagingRow({ customerManagerId: "manager-2", customerManagerName: "Nový manažer" }),
  ledgerRow()
);
assert.equal(managerChanged.classification, "changed");
assert.equal(managerChanged.ratingImpact.relevant, false);

const qualityChanged = buildReceivablesIncrementalDiffRow(
  stagingRow({ openAmount: 0 }),
  ledgerRow({ data_quality_flags_json: "[]" })
);
assert.equal(qualityChanged.classification, "changed");
assert.ok(qualityChanged.changes.some((change) => change.key === "dataQualityFlags"));

const unauthorized = await onRequestGet({
  request: new Request("https://example.test/api/receivables/vistos/incremental-ledger-diff"),
  env: {}
});
assert.equal(unauthorized.status, 401);

const sqlite = new DatabaseSync(":memory:");
for (const migration of [
  "0027_create_receivables_core.sql",
  "0028_create_receivable_import_preview.sql",
  "0033_expand_receivables_payment_rating.sql"
]) {
  sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
}
sqlite.prepare(`
  INSERT INTO receivable_customers (id, visto_company_id, company_name)
  VALUES ('receivable-customer:customer-1', 'customer-1', 'Test s.r.o.')
`).run();
sqlite.prepare(`
  INSERT INTO receivable_invoices (
    id, visto_invoice_id, invoice_number, variable_symbol, customer_id, issue_date, due_date,
    total_amount, paid_amount, open_amount, currency, status, data_quality_flags_json
  ) VALUES (
    'receivable-invoice:invoice-1', 'invoice-1', '26010001', '26010001',
    'receivable-customer:customer-1', '2026-07-01', '2026-07-15',
    1000, 0, 1000, 'CZK', 'unpaid', '[]'
  )
`).run();
sqlite.prepare(`
  INSERT INTO receivable_import_batches (
    id, source, import_kind, status, row_count, accepted_count, parser_summary_json
  ) VALUES (
    'incremental-batch-1', 'vistos', 'vistos_invoice_incremental', 'incremental', 1, 1,
    '{"periodFrom":"2026-07-12T04:30:00Z","periodTo":"2026-07-12T08:30:00Z","modifiedFilterProbe":{"verified":true}}'
  )
`).run();
sqlite.prepare(`
  INSERT INTO receivable_import_rows (
    id, batch_id, row_number, entity_kind, preview_status, normalized_json
  ) VALUES (?, 'incremental-batch-1', 1, 'vistos_invoice', 'ready', ?)
`).run("incremental-row-1", stagingRow({ paidAmount: 1000, openAmount: 0, isPaid: true }).normalized_json);

const sqliteEnv = { SMART_ODPADY_DB: new D1Database(sqlite) };
const integration = await getReceivablesIncrementalLedgerDiff(sqliteEnv, { page: 1, pageSize: 10 });
assert.equal(integration.apiStatus, "ready");
assert.equal(integration.summary.changedCount, 1);
assert.equal(integration.summary.affectedCustomerCount, 1);
assert.equal(integration.rows[0].classification, "changed");
assert.equal(integration.writesLedger, false);
assert.equal(integration.calculatesRealRating, false);
assert.equal(sqlite.prepare("SELECT paid_amount FROM receivable_invoices WHERE visto_invoice_id = 'invoice-1'").get().paid_amount, 0);

console.log("receivables incremental ledger diff tests passed");
