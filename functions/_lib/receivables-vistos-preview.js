import {
  VistosExecuteError,
  cleanVistosValue,
  getAllVistosPages,
  isVistosExecuteConfigured,
  loginVistosExecute
} from "./vistos-execute-client.js";

const VISTOS_NOT_CONFIGURED_MESSAGE = "Vistos API není nakonfigurováno";
const RECEIVABLES_VISTOS_PREVIEW_LIMIT = 80;
const RECEIVABLES_VISTOS_INVOICE_PREVIEW_LIMIT = 120;

const COMPANY_ATTEMPTS = [
  {
    entityName: "Company",
    columns: ["Id", "Name", "Caption", "ICO", "DIC", "Email", "Phone", "Mobile", "Street", "City", "Zip"]
  },
  {
    entityName: "Directory",
    columns: ["Id", "Name", "Caption", "ICO", "DIC", "Email", "Phone", "Mobile", "Street", "City", "Zip"]
  },
  {
    entityName: "Company",
    columns: ["Id", "Name"]
  },
  {
    entityName: "Directory",
    columns: ["Id", "Name"]
  }
];

const INVOICE_ATTEMPTS = [
  {
    entityName: "InvoiceIssued",
    columns: [
      "Id",
      "Number",
      "InvoiceNumber",
      "VariableSymbol",
      "Directory_FK",
      "Company_FK",
      "IssueDate",
      "InvoiceDate",
      "DueDate",
      "TotalAmount",
      "PaidAmount",
      "OpenAmount",
      "Currency_FK",
      "Status_FK"
    ]
  },
  {
    entityName: "InvoiceIssued",
    columns: ["Id", "Number", "VariableSymbol", "Directory_FK", "IssueDate", "DueDate", "TotalAmount"]
  },
  {
    entityName: "Invoice",
    columns: ["Id", "Number", "VariableSymbol", "Directory_FK", "IssueDate", "DueDate", "TotalAmount"]
  },
  {
    entityName: "InvoiceIssued",
    columns: ["Id", "Number"]
  }
];

function clean(value) {
  return cleanVistosValue(value);
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = clean(row?.[key]);
    if (value) return value;
  }
  return "";
}

function numberValue(value, fallback = 0) {
  const normalized = clean(value)
    .replace(/\s+/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function recordId(row, baseKey) {
  return firstValue(row, [
    `${baseKey}_RecordId`,
    `${baseKey}.RecordId`,
    `${baseKey}_Id`,
    `${baseKey}.Id`,
    baseKey
  ]);
}

function caption(row, baseKey) {
  return firstValue(row, [
    `${baseKey}_Caption`,
    `${baseKey}.Caption`,
    `${baseKey}_Name`,
    `${baseKey}.Name`,
    baseKey
  ]);
}

function compactDigits(value) {
  return clean(value).replace(/\D/g, "");
}

function sampleKeys(rows) {
  return [...new Set(rows.flatMap((row) => Object.keys(row || {})))].slice(0, 80);
}

async function loadFirstWorkingEntity(env, session, attempts, options = {}) {
  const diagnostics = [];
  let firstEmptyResult = null;

  for (const attempt of attempts) {
    const entityName = clean(options.entityName) || attempt.entityName;
    const columns = Array.isArray(options.columns) && options.columns.length
      ? options.columns
      : attempt.columns;
    try {
      const page = await getAllVistosPages(env, session, entityName, columns, null, {
        pageSize: Math.min(Number(options.pageSize) || 500, 1000),
        maxPages: Math.min(Number(options.maxPages) || 2, 5)
      });
      diagnostics.push({
        entityName,
        columns,
        ok: true,
        returnedRows: page.rows.length,
        recordsTotal: page.total || 0,
        recordsFiltered: page.filtered || 0,
        capped: Boolean(page.capped)
      });
      if (page.rows.length > 0) {
        return { entityName, columns, page, diagnostics };
      }
      if (!firstEmptyResult) {
        firstEmptyResult = { entityName, columns, page };
      }
    } catch (error) {
      diagnostics.push({
        entityName,
        columns,
        ok: false,
        code: clean(error?.code),
        message: clean(error?.message).slice(0, 180)
      });
    }
  }

  if (firstEmptyResult) {
    return {
      ...firstEmptyResult,
      diagnostics
    };
  }

  return {
    entityName: "",
    columns: [],
    page: { rows: [], total: 0, filtered: 0, capped: false },
    diagnostics
  };
}

export function mapReceivablesVistosCompany(row = {}) {
  return {
    vistoCompanyId: firstValue(row, ["Id", "CompanyId", "DirectoryId"]),
    companyName: firstValue(row, ["Name", "Caption", "CompanyName", "ObchodniNazev"]),
    ico: compactDigits(firstValue(row, ["ICO", "Ico", "IC", "Ic", "CompanyIdentificationNumber"])),
    dic: firstValue(row, ["DIC", "Dic", "VAT", "VatId"]),
    contactEmail: firstValue(row, ["Email", "E-mail", "ContactEmail", "InvoiceEmail"]),
    contactPhone: firstValue(row, ["Phone", "Telefon", "Mobile", "ContactPhone"]),
    city: firstValue(row, ["City", "Mesto"]),
    street: firstValue(row, ["Street", "Ulice"]),
    zip: firstValue(row, ["Zip", "PSC"]),
    raw: row
  };
}

export function mapReceivablesVistosInvoice(row = {}) {
  const customerId = recordId(row, "Directory_FK") || recordId(row, "Company_FK");
  const customerName = caption(row, "Directory_FK") || caption(row, "Company_FK");
  const invoiceNumber = firstValue(row, ["InvoiceNumber", "Number", "DocumentNumber", "Cislo"]);
  return {
    vistoInvoiceId: firstValue(row, ["Id", "InvoiceId"]),
    invoiceNumber,
    variableSymbol: compactDigits(firstValue(row, ["VariableSymbol", "VS", "VarSymbol"])) || compactDigits(invoiceNumber),
    customerId,
    customerName,
    issueDate: firstValue(row, ["IssueDate", "InvoiceDate", "DateIssue", "CreatedDate"]),
    dueDate: firstValue(row, ["DueDate", "MaturityDate", "DatumSplatnosti"]),
    totalAmount: numberValue(firstValue(row, ["TotalAmount", "TotalPrice", "AmountTotal", "PriceTotal"])),
    paidAmount: numberValue(firstValue(row, ["PaidAmount", "AmountPaid"])),
    openAmount: numberValue(firstValue(row, ["OpenAmount", "RemainingAmount", "AmountOpen"])),
    currency: caption(row, "Currency_FK") || firstValue(row, ["Currency", "CurrencyCode"]) || "CZK",
    status: caption(row, "Status_FK") || firstValue(row, ["Status", "InvoiceStatus"]),
    raw: row
  };
}

function companyIssues(company) {
  const issues = [];
  if (!company.vistoCompanyId) issues.push("missing_vistos_company_id");
  if (!company.companyName) issues.push("missing_company_name");
  if (!company.ico) issues.push("missing_ico");
  return issues;
}

function invoiceIssues(invoice) {
  const issues = [];
  if (!invoice.vistoInvoiceId) issues.push("missing_vistos_invoice_id");
  if (!invoice.invoiceNumber) issues.push("missing_invoice_number");
  if (!invoice.customerId && !invoice.customerName) issues.push("missing_customer_reference");
  if (!invoice.dueDate) issues.push("missing_due_date");
  if (!invoice.totalAmount) issues.push("missing_total_amount");
  return issues;
}

function issueCounts(items, issueGetter) {
  const counts = new Map();
  for (const item of items) {
    for (const issue of issueGetter(item)) {
      counts.set(issue, (counts.get(issue) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([code, count]) => ({ code, count }));
}

export async function createReceivablesVistosPreview(env, options = {}) {
  if (!isVistosExecuteConfigured(env)) {
    return {
      apiStatus: "not_configured",
      message: VISTOS_NOT_CONFIGURED_MESSAGE,
      readOnly: true,
      writesD1: false,
      createsReceivableRecords: false,
      sendsEmailOrSms: false,
      startsAutomation: false,
      companies: [],
      invoices: [],
      issues: [],
      summary: {
        companiesTotal: 0,
        companiesPreviewRows: 0,
        invoicesTotal: 0,
        invoicesPreviewRows: 0,
        invoicesWithDueDate: 0,
        invoicesWithCustomerReference: 0
      },
      diagnostics: {
        configured: false,
        companyAttempts: [],
        invoiceAttempts: []
      }
    };
  }

  const session = await loginVistosExecute(env);
  const [companyResult, invoiceResult] = await Promise.all([
    loadFirstWorkingEntity(env, session, COMPANY_ATTEMPTS, {
      entityName: env?.VISTOS_RECEIVABLES_COMPANY_ENTITY,
      pageSize: options.pageSize,
      maxPages: options.maxPages
    }),
    loadFirstWorkingEntity(env, session, INVOICE_ATTEMPTS, {
      entityName: env?.VISTOS_RECEIVABLES_INVOICE_ENTITY,
      pageSize: options.pageSize,
      maxPages: options.maxPages
    })
  ]);

  const companies = companyResult.page.rows.slice(0, RECEIVABLES_VISTOS_PREVIEW_LIMIT).map(mapReceivablesVistosCompany);
  const invoices = invoiceResult.page.rows.slice(0, RECEIVABLES_VISTOS_INVOICE_PREVIEW_LIMIT).map(mapReceivablesVistosInvoice);
  const issues = [
    ...issueCounts(companies, companyIssues).map((issue) => ({ ...issue, scope: "companies" })),
    ...issueCounts(invoices, invoiceIssues).map((issue) => ({ ...issue, scope: "invoices" }))
  ];
  const ready = companyResult.page.rows.length > 0 || invoiceResult.page.rows.length > 0;

  return {
    apiStatus: ready ? "ready" : "empty",
    message: ready
      ? "Vistos Company / InvoiceIssued preview načteno read-only. Data nejsou uložená do D1."
      : "Vistos preview nevrátilo žádné firmy ani faktury pro zkoušené entity.",
    readOnly: true,
    writesD1: false,
    createsReceivableRecords: false,
    sendsEmailOrSms: false,
    startsAutomation: false,
    companies,
    invoices,
    issues,
    summary: {
      companiesTotal: companyResult.page.total || companyResult.page.rows.length,
      companiesPreviewRows: companies.length,
      invoicesTotal: invoiceResult.page.total || invoiceResult.page.rows.length,
      invoicesPreviewRows: invoices.length,
      invoicesWithDueDate: invoices.filter((invoice) => invoice.dueDate).length,
      invoicesWithCustomerReference: invoices.filter((invoice) => invoice.customerId || invoice.customerName).length,
      invoicesWithAmount: invoices.filter((invoice) => invoice.totalAmount).length
    },
    diagnostics: {
      configured: true,
      companyEntity: companyResult.entityName,
      companyColumns: companyResult.columns,
      companyKeys: sampleKeys(companyResult.page.rows),
      companyAttempts: companyResult.diagnostics,
      invoiceEntity: invoiceResult.entityName,
      invoiceColumns: invoiceResult.columns,
      invoiceKeys: sampleKeys(invoiceResult.page.rows),
      invoiceAttempts: invoiceResult.diagnostics
    },
    loadedAt: new Date().toISOString()
  };
}

export function receivablesVistosPreviewError(error) {
  if (error instanceof VistosExecuteError) {
    return {
      status: error.status,
      payload: {
        error: error.message,
        code: error.code,
        apiStatus: error.code === "vistos_api_not_configured" ? "not_configured" : "waiting"
      }
    };
  }

  const detail = clean(error?.message).slice(0, 240);
  return {
    status: 500,
    payload: {
      error: "Vistos preview pro Pohledávky se teď nepodařilo spustit.",
      detail: detail || "Neznámá chyba backendu.",
      apiStatus: "waiting"
    }
  };
}
