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
import {
  buildReceivablesVistosLedgerMapping,
  classifyReceivablesDirectoryIcoValues,
  customerLinkProbeAttemptsForCandidate,
  customerLookupAttemptsForCandidate
} from "../functions/_lib/receivables-vistos-ledger-mapping.js";

assert.deepEqual(classifyReceivablesDirectoryIcoValues([]), { status: "missing_ico", ico: "" });
assert.deepEqual(classifyReceivablesDirectoryIcoValues(["26274906", "26274906"]), {
  status: "found_valid_ico",
  ico: "26274906"
});
assert.deepEqual(classifyReceivablesDirectoryIcoValues(["1234"]), {
  status: "found_invalid_ico",
  ico: "1234"
});
assert.deepEqual(classifyReceivablesDirectoryIcoValues(["26274906", "12345678"]), {
  status: "multiple_ico_candidates",
  ico: ""
});
import {
  receivablesKbApiOnboardingStatus,
  receivablesKbApiSandboxProbe
} from "../functions/_lib/receivables-kb-api-onboarding.js";
import { parseKbBankStatementText } from "../functions/_lib/receivables-kb-bank-parser.js";
import { parseKbBankCsvText } from "../functions/_lib/receivables-kb-csv-parser.js";
import {
  buildIsirCuzkIcoRequest,
  checkIsirCuzkByIco,
  normalizeReceivableIco,
  parseIsirCuzkResponse
} from "../functions/_lib/receivables-insolvency-isir.js";
import {
  calculateInvoicePaymentState,
  matchReceivablePayments,
  receivableToleranceAmount
} from "../functions/_lib/receivables-payment-matching.js";
import {
  calculateCustomerPaymentRating,
  deriveInvoicePaidDate,
  isFinalPaymentRating
} from "../functions/_lib/receivables-rating-engine.js";
import { previewReceivablePaymentRating } from "../functions/_lib/receivables-rating-store.js";

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

function testKbJwt(serviceName, context = "/sandbox/test") {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    encode({ alg: "RS256", typ: "JWT" }),
    encode({
      sub: "test-subject",
      application: { uuid: "test-application" },
      iss: "https://apim.example.test/oauth2/token",
      keytype: "SANDBOX",
      subscribedAPIs: [{ name: serviceName, context, version: "v1", subscriptionTier: "Copper" }],
      token_type: "apiKey",
      iat: 1783645707
    }),
    "signature"
  ].join(".");
}

assert.equal(receivableToleranceAmount(1000), 1);
assert.equal(receivableToleranceAmount(250000), 250);

assert.equal(normalizeReceivableIco("26274906"), "26274906");
assert.equal(normalizeReceivableIco("1234567"), "01234567");
assert.equal(normalizeReceivableIco("bez ico"), "");
assert.match(buildIsirCuzkIcoRequest("26274906"), /<ic>26274906<\/ic>/);
assert.match(buildIsirCuzkIcoRequest("26274906"), /<filtrAktualniRizeni>T<\/filtrAktualniRizeni>/);
assert.match(buildIsirCuzkIcoRequest("26274906"), /<maxRelevanceVysledku>2<\/maxRelevanceVysledku>/);

{
  const clear = parseIsirCuzkResponse(`
    <soap:Envelope><soap:Body><getIsirWsCuzkDataResponse><stav>
      <kodChyby>WS2</kodChyby><textChyby>Prazdny vysledek</textChyby>
    </stav></getIsirWsCuzkDataResponse></soap:Body></soap:Envelope>
  `, "26274906");
  assert.equal(clear.status, "clear");
  assert.equal(clear.found, false);
}

{
  const found = parseIsirCuzkResponse(`
    <soap:Envelope><soap:Body><ns2:getIsirWsCuzkDataResponse>
      <data><ic>26274906</ic><cisloSenatu>40</cisloSenatu><druhVec>INS</druhVec><bcVec>123</bcVec><rocnik>2026</rocnik><druhStavKonkursu>UPADEK</druhStavKonkursu><urlDetailRizeni>https://isir.justice.cz/detail</urlDetailRizeni><dalsiDluznikVRizeni>F</dalsiDluznikVRizeni></data>
      <data><ic>11111111</ic><cisloSenatu>40</cisloSenatu><druhVec>INS</druhVec><bcVec>124</bcVec><rocnik>2026</rocnik><dalsiDluznikVRizeni>T</dalsiDluznikVRizeni></data>
      <stav><pocetVysledku>2</pocetVysledku><relevanceVysledku>2</relevanceVysledku><casSynchronizace>2026-07-10T08:00:00</casSynchronizace></stav>
    </ns2:getIsirWsCuzkDataResponse></soap:Body></soap:Envelope>
  `, "26274906");
  assert.equal(found.status, "found");
  assert.equal(found.found, true);
  assert.equal(found.proceedings.length, 1);
  assert.equal(found.proceedings[0].reference, "40 INS 123/2026");
  assert.equal(found.sourceSynchronizedAt, "2026-07-10T08:00:00");
}

{
  const unavailable = await checkIsirCuzkByIco("26274906", {
    fetchImpl: async () => new Response("temporary failure", { status: 503 })
  });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.found, null);
}

{
  const status = receivablesKbApiOnboardingStatus({
    KB_ADAA_ENVIRONMENT: "sandbox",
    KB_ADAA_CLIENT_REGISTRATION_API_KEY: "secret-client-registration",
    KB_ADAA_OAUTH_API_KEY: "secret-oauth",
    KB_ADAA_ACCOUNT_API_KEY: "secret-account"
  });
  assert.equal(status.apiStatus, "partial");
  assert.equal(status.readyForSandboxProbe, true);
  assert.equal(status.readyForProductionRead, false);
  assert.equal(JSON.stringify(status).includes("secret-client-registration"), false);
  assert.equal(status.items.some((entry) => entry.id === "software_statement" && !entry.configured), true);
  assert.equal(status.safety.callsKbApi, false);
  assert.equal(status.onboardingPackage.nextAction.id, "qualified_certificate");
  assert.equal(status.onboardingPackage.callbackUrl, "https://smart-odpady.ai/api/receivables/kb/oauth/callback");
  assert.equal(status.onboardingPackage.secretPlan.some((entry) => entry.key === "KB_ADAA_REFRESH_TOKEN" && !entry.configured), true);
  assert.equal(JSON.stringify(status.onboardingPackage).includes("secret-oauth"), false);
  assert.equal(status.onboardingPackage.safety.callsKbApi, false);
}

{
  const probe = receivablesKbApiSandboxProbe({
    KB_ADAA_ENVIRONMENT: "sandbox",
    KB_ADAA_CLIENT_REGISTRATION_API_KEY: testKbJwt("ClientRegistrationSandbox", "/sandbox/client-registration/v3"),
    KB_ADAA_OAUTH_API_KEY: testKbJwt("OAuth2", "/sandbox/oauth2/v3"),
    KB_ADAA_ACCOUNT_API_KEY: testKbJwt("AccountDirectAccessAPI", "/sandbox/account-direct-access/v2")
  });
  assert.equal(probe.status, "blocked_oauth_onboarding");
  assert.equal(probe.validKeyCount, 3);
  assert.equal(probe.callsKbApi, false);
  assert.equal(probe.apiCallAttempted, false);
  assert.equal(probe.persistsBankTransactions, false);
  assert.equal(probe.missingOauthOnboarding.includes("KB_ADAA_REFRESH_TOKEN"), true);
  assert.equal(JSON.stringify(probe).includes("test-subject"), false);
  assert.equal(probe.keyChecks.every((entry) => entry.keytype === "SANDBOX"), true);
}

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
  const attempts = customerLookupAttemptsForCandidate({
    customerKeyType: "CustomerBranch_FK",
    customerKeyValue: "BR-1",
    customerBranchId: "BR-1",
    customerCompanyId: "C-123",
    ico: "12345678"
  });
  assert.deepEqual(attempts.slice(0, 3).map((attempt) => attempt.key), [
    "directory_with_branch_by_customer_fk",
    "directory_by_customer_fk",
    "company_by_customer_fk"
  ]);
  assert.equal(attempts.some((attempt) => attempt.key === "directory_with_branch_by_reg_number"), true);
  assert.equal(attempts.some((attempt) => attempt.key === "customer_branch_by_branch_fk"), true);
}

{
  const schemaByEntity = new Map([
    ["DirectoryWithBranch", ["Id", "Parent_FK", "RegNumber"]],
    ["CustomerBranch", ["Id", "Customer_FK"]],
    ["Directory", ["Id", "RegNumber"]],
    ["Customer", ["Id"]],
    ["Company", ["Id"]]
  ]);
  const attempts = customerLinkProbeAttemptsForCandidate({
    customerKeyType: "CustomerBranch_FK",
    customerKeyValue: "BR-1",
    customerBranchId: "BR-1",
    customerCompanyId: "C-123",
    ico: "12345678"
  }, schemaByEntity);
  assert.equal(attempts.some((attempt) => attempt.key === "customer_branch_customer_fk" && !attempt.skipped), true);
  assert.equal(attempts.some((attempt) => attempt.key === "directory_with_branch_parent_fk" && !attempt.skipped), true);
  assert.equal(attempts.some((attempt) => attempt.key === "directory_with_branch_customer_fk" && attempt.skipped), true);
}

{
  const mapping = buildReceivablesVistosLedgerMapping([
    {
      previewStatus: "ready",
      invoice: {
        invoiceNumber: "2601101477",
        variableSymbol: "2601101477",
        customerBranchId: "BR-1",
        customerName: "Firma Alfa s.r.o.",
        ico: "12345678",
        issueDate: "2026-06-01",
        dueDate: "2026-06-14",
        totalAmount: 1210,
        paidAmount: 0,
        openAmount: 1210
      }
    },
    {
      previewStatus: "review",
      issueCode: "missing_due_date",
      invoice: {
        invoiceNumber: "2601101478",
        customerBranchId: "BR-1",
        customerName: "Firma Alfa s.r.o.",
        totalAmount: 500,
        paidAmount: 0,
        openAmount: 500
      }
    },
    {
      previewStatus: "ready",
      invoice: {
        invoiceNumber: "2601101479",
        customerCompanyId: "C-2",
        customerName: "Beta a.s.",
        dueDate: "2026-07-01",
        totalAmount: 200,
        paidAmount: 200,
        openAmount: 0,
        isPaid: true
      }
    }
  ], { today: "2026-07-07" });
  assert.equal(mapping.readOnly, true);
  assert.equal(mapping.writesLedger, false);
  assert.equal(mapping.mapping.summary.invoiceCount, 3);
  assert.equal(mapping.mapping.summary.customerCandidateCount, 2);
  assert.equal(mapping.mapping.summary.totalOpenAmount, 1710);
  assert.equal(mapping.mapping.summary.reviewInvoiceCount, 1);
  assert.equal(mapping.mapping.candidates[0].customerName, "Firma Alfa s.r.o.");
  assert.equal(mapping.mapping.candidates[0].invoiceCount, 2);
  assert.equal(mapping.mapping.candidates[0].openAmount, 1710);
  assert.equal(mapping.mapping.candidates[0].mappingStatus, "needs_invoice_review");
  assert.equal(mapping.mapping.candidates[0].maxDaysOverdue, 23);
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
    customerId: "customer-1",
    customerLinkConfidence: "MEDIUM",
    invoices: [
      { totalAmount: 1000, paidAmount: 1000, openAmount: 0, dueDate: "2026-01-10", paidDate: "2026-01-10", issueDate: "2026-01-01", status: "paid" },
      { totalAmount: 2000, paidAmount: 1000, openAmount: 1000, dueDate: "2026-06-01", issueDate: "2026-05-20", status: "partially_paid" }
    ],
    promises: [{ status: "broken" }, { status: "resolved" }]
  });
  assert.equal(rating.rating, "B");
  assert.equal(rating.score, 76);
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
  const kaiserInvoiceFromVistos = mapReceivablesVistosInvoice({
    Id: "D2601",
    InvoiceNumber: "2601101477",
    BankReference2: "2601101477",
    BankReference1: "0308",
    BankReference3: "987",
    CustomerBranch_FK_RecordId: "BR1",
    CustomerBranch_FK_Caption: "Firma Alfa Brno",
    Customer_FK_RecordId: "C123",
    Customer_FK_Caption: "Firma Alfa s.r.o.",
    CustomerManager_FK_RecordId: "M001",
    CustomerManager_FK_Caption: "Lucie Nováková",
    CustomerRegNumber: "12345678",
    CustomerVatNumber: "CZ12345678",
    IssuedDate: "2026-06-01",
    DueDate: "2026-06-14",
    PriceWithoutTax: "1 000,00",
    PriceWithTax: "1 210,00",
    AmountPaid: "210,00",
    RemainToPay: "1 000,00",
    Status_FK_Caption: "Vystaveno",
    IsPaid: false
  });
  assert.equal(kaiserInvoiceFromVistos.vistoInvoiceId, "D2601");
  assert.equal(kaiserInvoiceFromVistos.invoiceNumber, "2601101477");
  assert.equal(kaiserInvoiceFromVistos.variableSymbol, "2601101477");
  assert.equal(kaiserInvoiceFromVistos.constantSymbol, "0308");
  assert.equal(kaiserInvoiceFromVistos.specificSymbol, "987");
  assert.equal(kaiserInvoiceFromVistos.customerId, "BR1");
  assert.equal(kaiserInvoiceFromVistos.customerName, "Firma Alfa Brno");
  assert.equal(kaiserInvoiceFromVistos.customerCompanyId, "C123");
  assert.equal(kaiserInvoiceFromVistos.customerManagerId, "M001");
  assert.equal(kaiserInvoiceFromVistos.customerManagerName, "Lucie Nováková");
  assert.equal(kaiserInvoiceFromVistos.ico, "12345678");
  assert.equal(kaiserInvoiceFromVistos.dic, "CZ12345678");
  assert.equal(kaiserInvoiceFromVistos.issueDate, "2026-06-01");
  assert.equal(kaiserInvoiceFromVistos.priceWithoutTax, 1000);
  assert.equal(kaiserInvoiceFromVistos.priceWithTax, 1210);
  assert.equal(kaiserInvoiceFromVistos.totalAmount, 1210);
  assert.equal(kaiserInvoiceFromVistos.paidAmount, 210);
  assert.equal(kaiserInvoiceFromVistos.openAmount, 1000);
  assert.equal(kaiserInvoiceFromVistos.status, "Vystaveno");
  assert.equal(kaiserInvoiceFromVistos.isPaid, false);
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
      Contract: [{ Id: "K1", ContractNumber: "S001", Directory_FK_RecordId: "D1", Directory_FK_Caption: "Smluvní Alfa s.r.o." }],
      InvoiceIssued: [],
      Document: [{
        Id: "D1",
        InvoiceNumber: "2601101477",
        BankReference2: "2601101477",
        CustomerBranch_FK_RecordId: "D1",
        CustomerBranch_FK_Caption: "Smluvní Alfa s.r.o.",
        CustomerRegNumber: "12345678",
        IssuedDate: "2026-06-01",
        DueDate: "2026-06-14",
        PriceWithTax: "1210",
        AmountPaid: "0",
        RemainToPay: "1210",
        IsPaid: false
      }],
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
      VISTOS_API_PASSWORD: "test-password"
    }, { pageSize: 5, maxPages: 1 });
    assert.equal(preview.apiStatus, "ready");
    assert.equal(preview.diagnostics.companyEntity, "Contract");
    assert.equal(preview.diagnostics.invoiceEntity, "Document");
    assert.equal(preview.companies[0].companyName, "Smluvní Alfa s.r.o.");
    assert.equal(preview.invoices[0].invoiceNumber, "2601101477");
    assert.equal(preview.invoices[0].variableSymbol, "2601101477");
    assert.equal(preview.invoices[0].ico, "12345678");
    assert.equal(preview.invoices[0].totalAmount, 1210);
    assert.equal(preview.invoices[0].openAmount, 1210);
    assert.equal(preview.diagnostics.invoiceAttempts.find((attempt) => attempt.entityName === "Document")?.key, "kaiser_invoice_columns");
    assert.ok(calls.some((call) => call.payload.GetPageParam?.EntityName === "Company"));
    assert.ok(calls.some((call) => call.payload.GetPageParam?.EntityName === "Directory"));
    assert.ok(calls.some((call) => call.payload.GetPageParam?.EntityName === "Contract"));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function ratingInvoiceFixture(index, delayDays = 0, overrides = {}) {
  const due = new Date(Date.UTC(2026, 0, 10 + index));
  const paid = new Date(due);
  paid.setUTCDate(paid.getUTCDate() + delayDays);
  return {
    id: `rating-invoice-${index}`,
    invoiceNumber: `R-${index}`,
    variableSymbol: `9900${index}`,
    customerId: "rating-customer",
    issueDate: `2026-01-${String(index).padStart(2, "0")}`,
    dueDate: due.toISOString().slice(0, 10),
    totalAmount: 10000,
    paidAmount: 10000,
    openAmount: 0,
    paidDate: paid.toISOString().slice(0, 10),
    status: "paid",
    ...overrides
  };
}

function finalRatingInput(invoices, extra = {}) {
  return {
    today: "2026-07-10",
    calculatedAt: "2026-07-10T08:00:00.000Z",
    customerId: "rating-customer",
    customerLinkConfidence: "MEDIUM",
    invoices,
    ...extra
  };
}

{
  const rating = calculateCustomerPaymentRating(finalRatingInput(
    Array.from({ length: 6 }, (_, index) => ratingInvoiceFixture(index + 1, 0))
  ));
  assert.equal(rating.ratingMode, "FINAL_RATING");
  assert.equal(rating.rating, "A");
  assert.equal(rating.score, 100);
  assert.equal(rating.confidence, "HIGH");
  assert.equal(rating.automationStatus, "DRY_RUN_ONLY");
  assert.equal(rating.recommendedAutomationStatus, "READY_FOR_AUTOMATION");
  assert.equal(isFinalPaymentRating(rating), true);
}

{
  const rating = calculateCustomerPaymentRating(finalRatingInput(
    Array.from({ length: 6 }, (_, index) => ratingInvoiceFixture(index + 1, 5))
  ));
  assert.equal(rating.rating, "B");
  assert.equal(rating.weightedAvgDelay, 5);
}

{
  const delays = [15, 18, 20, 22, 25, 25];
  const rating = calculateCustomerPaymentRating(finalRatingInput(
    delays.map((delay, index) => ratingInvoiceFixture(index + 1, delay))
  ));
  assert.equal(rating.rating, "C");
  assert.equal(rating.p90Delay, 25);
}

{
  const open = Array.from({ length: 5 }, (_, index) => ratingInvoiceFixture(index + 1, index % 2 ? 45 : 30));
  open.push(ratingInvoiceFixture(7, 0, {
    issueDate: "2026-02-01",
    dueDate: "2026-03-01",
    paidDate: "",
    paidAmount: 0,
    openAmount: 100000,
    status: "unpaid"
  }));
  const rating = calculateCustomerPaymentRating(finalRatingInput(open));
  assert.equal(["D", "E"].includes(rating.rating), true);
  assert.equal(rating.currentMaxDaysOverdue > 60, true);
}

{
  const rating = calculateCustomerPaymentRating(finalRatingInput([ratingInvoiceFixture(1, 0)]));
  assert.equal(rating.ratingMode, "PRE_RATING");
  assert.equal(rating.rating, "N");
  assert.equal(rating.score, null);
}

{
  const invoices = [ratingInvoiceFixture(1, 0, { dueDate: "" }), ratingInvoiceFixture(2, 0, { dueDate: "" })];
  const rating = calculateCustomerPaymentRating(finalRatingInput(invoices));
  assert.equal(rating.rating, "N");
  assert.equal(rating.dataQualityFlags.includes("MISSING_DUE_DATE"), true);
  assert.equal(rating.blockingReasons.length > 0, true);
}

{
  const state = calculateInvoicePaymentState(invoice, [{ amount: 500, bookingDate: "2026-06-03", status: "auto_matched" }]);
  assert.equal(state.status, "partially_paid");
  assert.equal(state.openAmount, 710);
  assert.equal(state.paidDate, "");
}

{
  const state = deriveInvoicePaidDate({
    ...invoice,
    totalAmount: 1000,
    openAmount: 0,
    matchedPayments: [
      { id: "part-1", amount: 400, bookingDate: "2026-06-03", status: "auto_matched" },
      { id: "part-2", amount: 600, bookingDate: "2026-06-05", status: "auto_matched" }
    ]
  });
  assert.equal(state.status, "paid");
  assert.equal(state.paidDate, "2026-06-05");
}

{
  const state = deriveInvoicePaidDate({
    ...invoice,
    totalAmount: 1000,
    paidAmount: 1000,
    openAmount: 0,
    status: "paid",
    paidDate: "",
    matchedPayments: [
      { id: "partial-authoritative", amount: 400, bookingDate: "2026-06-03", status: "auto_matched" }
    ]
  });
  assert.equal(state.status, "partially_paid");
  assert.equal(state.openAmount, 600);
  assert.equal(state.paidDate, "");
}

{
  const payments = [{
    id: "no-vs-but-matched",
    bookingDate: "2026-01-10",
    amount: 10000,
    variableSymbol: "",
    matchedInvoiceId: "rating-invoice-1",
    matched: true,
    status: "matched"
  }];
  const rating = calculateCustomerPaymentRating(finalRatingInput(
    Array.from({ length: 6 }, (_, index) => ratingInvoiceFixture(index + 1, 0)),
    { payments }
  ));
  assert.equal(rating.rating, "A");
  assert.equal(rating.dataQualityFlags.includes("PAYMENT_WITHOUT_VS"), true);
  assert.equal(rating.penalties.unmatchedPaymentPenalty, 0);
}

{
  const rating = calculateCustomerPaymentRating(finalRatingInput(
    Array.from({ length: 6 }, (_, index) => ratingInvoiceFixture(index + 1, 0, {
      dataQualityFlags: index === 0 ? ["CREDIT_NOTE_PRESENT"] : []
    }))
  ));
  assert.equal(rating.dataQualityFlags.includes("CREDIT_NOTE_PRESENT"), true);
  assert.equal(rating.rating, "A");
}

{
  const invoices = Array.from({ length: 6 }, (_, index) => ratingInvoiceFixture(index + 1, 0));
  const clean = calculateCustomerPaymentRating(finalRatingInput(invoices));
  const broken = calculateCustomerPaymentRating(finalRatingInput(invoices, {
    promises: [{ status: "broken" }, { status: "resolved" }]
  }));
  assert.equal(broken.brokenPromiseRate, 0.5);
  assert.equal(broken.score < clean.score, true);
}

{
  const invoices = Array.from({ length: 6 }, (_, index) => ratingInvoiceFixture(index + 1, 0));
  invoices[0] = { ...invoices[0], status: "disputed", disputeActive: true };
  const rating = calculateCustomerPaymentRating(finalRatingInput(invoices));
  assert.equal(rating.automationStatus, "HUMAN_REVIEW");
  assert.equal(rating.dataQualityFlags.includes("DISPUTE_ACTIVE"), true);
  assert.equal(["A", "B"].includes(rating.rating), true);
}

{
  const rating = calculateCustomerPaymentRating(finalRatingInput([], { insolvency: true }));
  assert.equal(rating.rating, "INSOLVENCE");
  assert.equal(rating.score, 0);
  assert.equal(rating.automationStatus, "STOP");
  assert.equal(rating.confidence, "HIGH");
}

{
  const payments = Array.from({ length: 10 }, (_, index) => ({
    id: `match-quality-${index}`,
    bookingDate: "2026-03-01",
    amount: 1000,
    variableSymbol: `7${index}`,
    matchedInvoiceId: index < 4 ? `rating-invoice-${index + 1}` : "",
    matched: index < 4,
    status: index < 4 ? "matched" : "unmatched"
  }));
  const rating = calculateCustomerPaymentRating(finalRatingInput(
    Array.from({ length: 6 }, (_, index) => ratingInvoiceFixture(index + 1, 0)),
    { payments }
  ));
  assert.equal(rating.confidence, "LOW");
  assert.equal(rating.unmatchedPaymentRate, 0.6);
}

{
  const bankPayments = ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05", "2026-05-05", "2026-06-05"]
    .map((bookingDate, index) => ({ id: `bank-${index}`, bookingDate, amount: 1000 }));
  const rating = calculateCustomerPaymentRating(finalRatingInput([], { bankPayments }));
  assert.equal(rating.ratingMode, "PRE_RATING");
  assert.equal(rating.rating, "A0");
  assert.equal(rating.score, null);
  assert.equal(isFinalPaymentRating(rating), false);
}

{
  const preview = await previewReceivablePaymentRating({}, {
    input: finalRatingInput(Array.from({ length: 6 }, (_, index) => ratingInvoiceFixture(index + 1, 0)))
  });
  assert.equal(preview.persisted, false);
  assert.equal(preview.sendsCustomerCommunication, false);
  assert.equal(preview.startsAutomation, false);
  assert.equal("action" in preview.rating, false);
  assert.equal("channel" in preview.rating, false);
}

{
  const missingPaidDate = calculateCustomerPaymentRating(finalRatingInput([
    ratingInvoiceFixture(1, 0, { paidDate: "" }),
    ratingInvoiceFixture(2, 0, { paidDate: "" })
  ]));
  assert.equal(missingPaidDate.ratingMode, "PRE_RATING");
  assert.equal(missingPaidDate.dataQualityFlags.includes("MISSING_PAID_DATE"), true);
}

{
  const sameVsInvoices = [
    { ...invoice, id: "ambiguous-1", variableSymbol: "12345" },
    { ...invoice, id: "ambiguous-2", variableSymbol: "12345" }
  ];
  const matching = matchReceivablePayments(sameVsInvoices, [{
    id: "ambiguous-payment",
    amount: 1210,
    variableSymbol: "12345",
    bookingDate: "2026-06-03"
  }], [customer], { ambiguousVariableSymbols: ["12345"] });
  assert.equal(matching.matches.length, 0);
  assert.equal(matching.reviewQueue.length, 2);
}

{
  const csv = `Preambule;;;;
Datum splatnosti;Datum zuctovani;Protiucet/Kod banky;Nazev protiuctu;Castka;VS;KS;SS;Identifikace transakce;Systemovy popis;Popis prikazce;Popis pro prijemce
01.06.2026;02.06.2026;123/0100;Firma Alfa;1 210,00;2601101477;0308;;TX-UNIQUE-1;Prichozi uhrada;;Faktura
03.06.2026;03.06.2026;456/0100;Dodavatel;-120,00;;;;TX-UNIQUE-2;Odchozi uhrada;;;`;
  const parsed = parseKbBankCsvText(csv, { filename: "kb.csv" });
  assert.equal(parsed.apiStatus, "ready");
  assert.equal(parsed.transactionCount, 2);
  assert.equal(parsed.incomingPaymentCount, 1);
  assert.equal(parsed.outgoingPaymentCount, 1);
  assert.equal(parsed.incomingPayments[0].bankTransactionId, "TX-UNIQUE-1");
  assert.equal(parsed.incomingPayments[0].variableSymbol, "2601101477");
}

console.log("receivables engine tests passed");
