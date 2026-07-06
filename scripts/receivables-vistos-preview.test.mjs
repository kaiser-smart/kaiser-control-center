import assert from "node:assert/strict";
import {
  createReceivablesVistosInvoiceDiscovery,
  createReceivablesVistosPreview,
  mapReceivablesVistosCompany,
  mapReceivablesVistosInvoice
} from "../functions/_lib/receivables-vistos-preview.js";

function mockVistosFetch(rowsByEntity = {}) {
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || "{}");
    calls.push({ url: String(url), body });

    if (body.LoginParam) {
      return new Response(JSON.stringify({ status: "OK" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "VistosAccessToken=test-access; Path=/; HttpOnly, VistosRefreshToken=test-refresh; Path=/; HttpOnly"
        }
      });
    }

    const pageRequest = body.GetPageParam || {};
    const entityName = pageRequest.EntityName;

    if (!Object.prototype.hasOwnProperty.call(rowsByEntity, entityName)) {
      return new Response(JSON.stringify({ status: "ERROR", message: "Entity not found" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    const rows = rowsByEntity[entityName] || [];
    return new Response(JSON.stringify({
      status: "OK",
      data: {
        data: rows,
        recordsTotal: rows.length,
        recordsFiltered: rows.length
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  return calls;
}

const env = {
  VISTOS_API_BASE_URL: "https://example.test/API/VistosAPI",
  VISTOS_API_USERNAME: "tester",
  VISTOS_API_PASSWORD: "test-password"
};

{
  const company = mapReceivablesVistosCompany({
    Directory_FK_RecordId: "D1",
    Directory_FK_Caption: "Smluvní Alfa s.r.o. - 12345678"
  });
  assert.equal(company.vistoCompanyId, "D1");
  assert.equal(company.companyName, "Smluvní Alfa s.r.o.");
  assert.equal(company.ico, "12345678");
}

{
  const invoice = mapReceivablesVistosInvoice({
    Id: "I123",
    Number: "2601101477",
    Directory_FK_RecordId: "D1",
    Directory_FK_Caption: "Smluvní Alfa s.r.o.",
    IssueDate: "2026-06-01",
    DueDate: "2026-06-14",
    TotalAmount: "1 210,00",
    OpenAmount: "210,00",
    Currency_FK_Caption: "CZK"
  });
  assert.equal(invoice.vistoInvoiceId, "I123");
  assert.equal(invoice.variableSymbol, "2601101477");
  assert.equal(invoice.customerId, "D1");
  assert.equal(invoice.customerName, "Smluvní Alfa s.r.o.");
  assert.equal(invoice.totalAmount, 1210);
  assert.equal(invoice.openAmount, 210);
}

{
  const calls = mockVistosFetch({
    Company: [],
    Directory: [],
    Contract: [{ Id: "K1", ContractNumber: "S001", Directory_FK_RecordId: "D1", Directory_FK_Caption: "Smluvní Alfa s.r.o. - 12345678" }],
    InvoiceIssued: [],
    Invoice: [{ Id: "I1", Number: "2601101477", Directory_FK_RecordId: "D1", Directory_FK_Caption: "Smluvní Alfa s.r.o.", DueDate: "2026-06-14", TotalAmount: "1210" }]
  });

  const preview = await createReceivablesVistosPreview(env);
  assert.equal(preview.readOnly, true);
  assert.equal(preview.writesD1, false);
  assert.equal(preview.diagnostics.companyEntity, "Contract");
  assert.equal(preview.diagnostics.invoiceEntity, "Invoice");
  assert.equal(preview.companies[0].companyName, "Smluvní Alfa s.r.o.");
  assert.equal(preview.companies[0].ico, "12345678");
  assert.equal(preview.invoices[0].invoiceNumber, "2601101477");
  assert.ok(calls.some((call) => call.body.GetPageParam?.EntityName === "Contract"));
}

{
  mockVistosFetch({
    Vehicle: [{ Id: "V1", Name: "Vozidlo 1", RegistrationPlate: "1A1 1111" }],
    Contract: [{ Id: "K1", ContractNumber: "S001", Directory_FK_RecordId: "D1" }],
    InvoiceIssued: [],
    Invoice: [{ Id: "I1", Number: "2601101477", Directory_FK_RecordId: "D1", Directory_FK_Caption: "Smluvní Alfa s.r.o.", DueDate: "2026-06-14", TotalAmount: "1210" }]
  });

  const discovery = await createReceivablesVistosInvoiceDiscovery(env);
  assert.equal(discovery.readOnly, true);
  assert.equal(discovery.writesD1, false);
  assert.equal(discovery.summary.workingControlCount, 2);
  assert.equal(discovery.bestEntity.entityName, "Invoice");
  assert.equal(discovery.bestEntity.status, "usable_candidate");
  assert.equal(discovery.invoices[0].invoiceNumber, "2601101477");
  assert.ok(discovery.controls.some((control) => control.entityName === "Vehicle" && control.status === "readable_with_rows"));
  assert.ok(discovery.controls.some((control) => control.entityName === "Contract" && control.status === "readable_with_rows"));
}

console.log("receivables Vistos preview tests passed");
