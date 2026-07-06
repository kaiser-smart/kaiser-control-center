import assert from "node:assert/strict";

import {
  customerTextContainsBannedWord,
  decideReceivablesNextAction,
  isReceivablesWorkingDay,
  nextReceivablesWorkingSendAt
} from "../functions/_lib/receivables-ai-decision-engine.js";
import {
  bankTransactionToPreviewRow,
  buildInvoiceImportPreview,
  normalizeInvoicePreviewRow
} from "../functions/_lib/receivables-import-preview.js";
import {
  createReceivablesVistosPreview,
  mapReceivablesVistosCompany,
  mapReceivablesVistosInvoice
} from "../functions/_lib/receivables-vistos-preview.js";
import { parseKbBankStatementText } from "../functions/_lib/receivables-kb-bank-parser.js";
import {
  calculateInvoicePaymentState,
  matchReceivablePayments,
  receivableToleranceAmount
} from "../functions/_lib/receivables-payment-matching.js";
import { calculateCustomerPaymentRating } from "../functions/_lib/receivables-rating-engine.js";

const customer = {
  id: "customer-1",
  companyName: "Firma Alfa s.r.o.",
  bankAccounts: ["123456789/0100"]
};
const invoice = {
  id: "invoice-1",
  customerId: "customer-1",
  invoiceNumber: "2601101477",
  variableSymbol: "2601101477",
  dueDate: "2026-06-01",
  totalAmount: 1210,
  openAmount: 1210,
  status: "unpaid"
};

assert.equal(receivableToleranceAmount(1000), 1);
assert.equal(receivableToleranceAmount(250000), 250);

{
  const result = matchReceivablePayments([invoice], [{
    id: "payment-1",
    amount: 1210,
    variableSymbol: "2601101477",
    bookingDate: "2026-06-03",
    counterpartyName: "Firma Alfa s.r.o."
  }], [customer]);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].status, "auto_matched");
  assert.equal(result.matches[0].confidence >= 0.85, true);
}

{
  const state = calculateInvoicePaymentState(invoice, [
    { amount: 500, bookingDate: "2026-06-03", status: "auto_matched" },
    { amount: 710, bookingDate: "2026-06-05", status: "auto_matched" }
  ]);
  assert.equal(state.status, "paid");
  assert.equal(state.paidAmount, 1210);
  assert.equal(state.openAmount, 0);
  assert.equal(state.paidDate, "2026-06-05");
}

{
  const state = calculateInvoicePaymentState(invoice, [
    { amount: 1300, bookingDate: "2026-06-03", status: "auto_matched" }
  ]);
  assert.equal(state.status, "overpaid");
  assert.equal(state.openAmount, 0);
}

{
  const result = matchReceivablePayments([invoice], [{
    id: "payment-no-vs",
    amount: 1210,
    variableSymbol: "",
    bookingDate: "2026-06-03",
    counterpartyName: "Neznámá firma"
  }], [customer]);
  assert.equal(result.matches.length, 0);
  assert.equal(result.reviewQueue.length, 1);
  assert.equal(result.reviewQueue[0].confidence < 0.85, true);
}

{
  const result = matchReceivablePayments([invoice, { ...invoice, id: "invoice-2", invoiceNumber: "2601101478", variableSymbol: "2601101478" }], [{
    id: "payment-1",
    amount: 1210,
    variableSymbol: "2601101477",
    bookingDate: "2026-06-03"
  }], [customer]);
  assert.equal(result.matches.length, 1);
  assert.equal(new Set(result.matches.map((match) => match.paymentTransactionId)).size, 1);
}

{
  const rating = calculateCustomerPaymentRating({
    today: "2026-07-05",
    invoices: [
      { totalAmount: 1000, paidAmount: 1000, openAmount: 0, dueDate: "2026-01-10", paidDate: "2026-01-10", issueDate: "2026-01-01", status: "paid" },
      { totalAmount: 2000, paidAmount: 1000, openAmount: 1000, dueDate: "2026-06-01", issueDate: "2026-05-20", status: "partially_paid" }
    ],
    promises: [{ status: "broken" }, { status: "resolved" }]
  });
  assert.equal(["C", "D", "E"].includes(rating.rating), true);
  assert.equal(rating.metrics.partialPaymentRisk > 0, true);
  assert.equal(rating.metrics.brokenPromiseRate, 0.5);
}

{
  const insolvencyRating = calculateCustomerPaymentRating({ insolvency: true });
  assert.equal(insolvencyRating.rating, "INSOLVENCE");
  assert.equal(insolvencyRating.automationStatus, "STOP");
}

{
  assert.equal(customerTextContainsBannedWord("Toto je poslední výzva."), true);
  assert.equal(customerTextContainsBannedWord("Posíláme přátelský přehled otevřených faktur."), false);
}

{
  const saturday = new Date("2026-07-04T10:00:00+02:00");
  assert.equal(isReceivablesWorkingDay(saturday, "Europe/Prague"), false);
  const scheduled = nextReceivablesWorkingSendAt(saturday, { timeZone: "Europe/Prague" });
  assert.equal(scheduled.startsWith("2026-07-06T07:00:00.000Z"), true);
}

{
  const decision = decideReceivablesNextAction({
    customer: { id: "customer-1", rating: "C", automationStatus: "dry_run" },
    receivablePackage: {
      totalOpenAmount: 1210,
      maxDaysOverdue: 34,
      invoices: [invoice]
    },
    history: {},
    constraints: { timezone: "Europe/Prague", sendFrom: "09:00", sendTo: "15:30", hardStop: "16:00" }
  }, { now: "2026-07-06T17:10:00+02:00" });
  assert.equal(decision.action, "send_email");
  assert.equal(decision.dryRun, true);
  assert.equal(decision.scheduledAt.startsWith("2026-07-07T07:00:00.000Z"), true);
}

{
  const decision = decideReceivablesNextAction({
    customer: { id: "customer-1", rating: "INSOLVENCE", automationStatus: "STOP" },
    receivablePackage: { totalOpenAmount: 1210, maxDaysOverdue: 10 },
    history: {}
  }, { now: "2026-07-06T10:00:00+02:00" });
  assert.equal(decision.action, "wait");
  assert.equal(decision.marketaAlert, true);
}

{
  const decision = decideReceivablesNextAction({
    customer: { id: "customer-1", rating: "D", automationStatus: "dry_run" },
    receivablePackage: { totalOpenAmount: 1210, maxDaysOverdue: 60 },
    history: {}
  }, { now: "2026-07-06T10:00:00+02:00" });
  assert.equal(decision.action, "prepare_legal_package");
  assert.equal(decision.marketaAlert, true);
}

{
  const parsed = parseKbBankStatementText(`
01.06.2026 Příchozí úhrada 2601101477 1 210,00
Firma Alfa s.r.o.
Protiúčet 123456789/0100
KS 0308
SS 123
02.06.2026 Poplatek za vedení účtu 120,00
Banka
03.06.2026 Odchozí úhrada 555 300,00
Dodavatel
  `, { filename: "kb-test.txt" });
  assert.equal(parsed.transactionCount, 3);
  assert.equal(parsed.incomingPaymentCount, 1);
  assert.equal(parsed.incomingPayments[0].variableSymbol, "2601101477");
  assert.equal(parsed.incomingPayments[0].amountIn, 1210);
}

{
  const row = normalizeInvoicePreviewRow({
    "Číslo faktury": "2601101477",
    "VS": "2601101477",
    "Firma": "Firma Alfa s.r.o.",
    "IČO": "12345678",
    "Splatnost": "01.06.2026",
    "Celkem": "1 210,00 Kč"
  });
  assert.equal(row.previewStatus, "ready");
  assert.equal(row.normalized.dueDate, "2026-06-01");
  assert.equal(row.normalized.totalAmount, 1210);
}

{
  const preview = buildInvoiceImportPreview({
    text: `invoice_number;company_name;due_date;total_amount
2601101477;Firma Alfa s.r.o.;2026-06-01;1210
;Bez čísla s.r.o.;2026-06-02;500`
  });
  assert.equal(preview.summary.rowCount, 2);
  assert.equal(preview.summary.acceptedCount, 1);
  assert.equal(preview.summary.reviewCount, 1);
}

{
  const parsed = parseKbBankStatementText(`
01.06.2026 Příchozí úhrada 2601101477 1 210,00
Firma Alfa s.r.o.
02.06.2026 Odchozí úhrada 555 300,00
Dodavatel
  `);
  const ready = bankTransactionToPreviewRow(parsed.transactions[0], 0);
  const ignored = bankTransactionToPreviewRow(parsed.transactions[1], 1);
  assert.equal(ready.previewStatus, "ready");
  assert.equal(ignored.previewStatus, "ignored");
}

{
  const company = mapReceivablesVistosCompany({
    Id: "C123",
    Name: "Firma Alfa s.r.o.",
    ICO: "12345678",
    DIC: "CZ12345678",
    Email: "fakturace@firma.cz"
  });
  assert.equal(company.vistoCompanyId, "C123");
  assert.equal(company.companyName, "Firma Alfa s.r.o.");
  assert.equal(company.ico, "12345678");
  assert.equal(company.contactEmail, "fakturace@firma.cz");
}

{
  const companyFromContract = mapReceivablesVistosCompany({
    Directory_FK_RecordId: "D1",
    Directory_FK_Caption: "Smluvní Alfa s.r.o. - 12345678"
  });
  assert.equal(companyFromContract.vistoCompanyId, "D1");
  assert.equal(companyFromContract.companyName, "Smluvní Alfa s.r.o.");
  assert.equal(companyFromContract.ico, "12345678");
}

{
  const invoiceFromVistos = mapReceivablesVistosInvoice({
    Id: "I123",
    Number: "2601101477",
    Directory_FK_RecordId: "C123",
    Directory_FK_Caption: "Firma Alfa s.r.o.",
    IssueDate: "2026-06-01",
    DueDate: "2026-06-14",
    TotalAmount: "1 210,00",
    OpenAmount: "210,00",
    Currency_FK_Caption: "CZK"
  });
  assert.equal(invoiceFromVistos.vistoInvoiceId, "I123");
  assert.equal(invoiceFromVistos.variableSymbol, "2601101477");
  assert.equal(invoiceFromVistos.customerId, "C123");
  assert.equal(invoiceFromVistos.customerName, "Firma Alfa s.r.o.");
  assert.equal(invoiceFromVistos.totalAmount, 1210);
  assert.equal(invoiceFromVistos.openAmount, 210);
}

{
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const payload = JSON.parse(options.body || "{}");
    const methodName = String(url).split("?").pop();
    calls.push({ methodName, payload });

    if (methodName === "LoginParam") {
      return new Response(JSON.stringify({ status: "OK" }), {
        status: 200,
        headers: {
          "set-cookie": "VistosAccessToken=test-access; VistosRefreshToken=test-refresh"
        }
      });
    }

    const request = payload.GetPageParam || {};
    const rowsByEntity = {
      Company: [],
      Directory: [],
      Contract: [{ Id: "K1", ContractNumber: "S001", Directory_FK_RecordId: "D1", Directory_FK_Caption: "Smluvní Alfa s.r.o. - 12345678" }],
      InvoiceIssued: [],
      Invoice: [{ Id: "I1", Number: "2601101477", Directory_FK_RecordId: "D1", DueDate: "2026-06-14", TotalAmount: "1210" }]
    };
    const rows = rowsByEntity[request.EntityName] || [];

    return new Response(JSON.stringify({
      status: "OK",
      data: {
        data: rows,
        recordsTotal: rows.length,
        recordsFiltered: rows.length
      }
    }), { status: 200 });
  };

  try {
    const preview = await createReceivablesVistosPreview({
      VISTOS_API_BASE_URL: "https://vistos.example",
      VISTOS_API_USERNAME: "readonly",
      VISTOS_API_PASSWORD: "secret"
    }, { pageSize: 5, maxPages: 1 });
    assert.equal(preview.apiStatus, "ready");
    assert.equal(preview.diagnostics.companyEntity, "Contract");
    assert.equal(preview.diagnostics.invoiceEntity, "Invoice");
    assert.equal(preview.companies[0].companyName, "Smluvní Alfa s.r.o.");
    assert.equal(preview.companies[0].ico, "12345678");
    assert.equal(preview.invoices[0].invoiceNumber, "2601101477");
    assert.ok(calls.some((call) => call.payload.GetPageParam?.EntityName === "Company"));
    assert.ok(calls.some((call) => call.payload.GetPageParam?.EntityName === "Directory"));
    assert.ok(calls.some((call) => call.payload.GetPageParam?.EntityName === "Contract"));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log("receivables engine tests passed");
