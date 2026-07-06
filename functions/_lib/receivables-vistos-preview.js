import {
  VistosExecuteError,
  cleanVistosValue,
  getAllVistosPages,
  getVistosById,
  isVistosExecuteConfigured,
  loginVistosExecute
} from "./vistos-execute-client.js";

const VISTOS_NOT_CONFIGURED_MESSAGE = "Vistos API není nakonfigurováno";
const RECEIVABLES_VISTOS_PREVIEW_LIMIT = 80;
const RECEIVABLES_VISTOS_INVOICE_PREVIEW_LIMIT = 120;
const DEFAULT_DETAIL_ID_LIMIT = 4;
const MAX_DETAIL_ID_LIMIT = 12;

const KAISER_INVOICE_COLUMNS = [
  "Id",
  "InvoiceNumber",
  "BankReference2",
  "BankReference1",
  "BankReference3",
  "CustomerBranch_FK",
  "Customer_FK",
  "CustomerRegNumber",
  "CustomerVatNumber",
  "IssuedDate",
  "DueDate",
  "TaxableSupplyDate",
  "DateOfTaxableSupply",
  "PriceWithoutTax",
  "PriceWithTax",
  "AmountPaid",
  "RemainToPay",
  "Currency_FK",
  "Status_FK",
  "PaymentStatus_FK",
  "IsPaid",
  "PdfUrl",
  "PrintUrl",
  "AttachmentUrl",
  "Created",
  "Modified"
];

const DIRECTORY_WITH_BRANCH_CZECH_COLUMNS = [
  "Systémové ID",
  "Název",
  "Rodič",
  "IČO",
  "DIČ",
  "Fakturační e-mail",
  "E-mail",
  "Telefon",
  "Splatnost",
  "Město",
  "PSČ",
  "Ulice",
  "Stav",
  "Vytvořeno",
  "Změněno"
];

const COMPANY_ATTEMPTS = [
  {
    entityName: "Contract",
    columns: ["Id", "ContractNumber", "Name", "Directory_FK", "DirectoryBranch_FK", "Sidlo_FK"]
  },
  {
    entityName: "DirectoryWithBranch",
    columns: DIRECTORY_WITH_BRANCH_CZECH_COLUMNS
  },
  {
    entityName: "DirectoryWithBranch",
    columns: ["Id", "Name", "c_ShortName", "Parent_FK", "RegNumber", "VATNumber", "InvoiceDueDays", "Email", "Email1", "EmailInvoicing", "InvoiceEmail", "BillingEmail", "Phone", "PhoneNumber", "Mobile", "Status_FK", "Created", "Modified"]
  },
  {
    entityName: "Company",
    columns: ["Id", "Name", "Caption", "ICO", "DIC", "RegNumber", "VATNumber", "Email", "Email1", "EmailInvoicing", "InvoiceEmail", "BillingEmail", "Phone", "PhoneNumber", "Mobile", "Street", "City", "Zip", "InvoiceDueDays", "Status_FK", "Created", "Modified"]
  },
  {
    entityName: "Directory",
    columns: ["Id", "Name", "Caption", "ICO", "DIC", "RegNumber", "VATNumber", "Email", "Email1", "EmailInvoicing", "InvoiceEmail", "BillingEmail", "Phone", "PhoneNumber", "Mobile", "Street", "City", "Zip", "InvoiceDueDays", "Status_FK", "Created", "Modified"]
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
    key: "kaiser_invoice_columns",
    entityName: "InvoiceIssued",
    columns: KAISER_INVOICE_COLUMNS
  },
  {
    key: "kaiser_invoice_columns",
    entityName: "Document",
    columns: KAISER_INVOICE_COLUMNS
  },
  {
    key: "kaiser_invoice_columns",
    entityName: "Invoice",
    columns: KAISER_INVOICE_COLUMNS
  },
  {
    key: "kaiser_invoice_columns",
    entityName: "IssuedInvoice",
    columns: KAISER_INVOICE_COLUMNS
  },
  {
    key: "legacy_invoice_issued_standard",
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
      "TaxableSupplyDate",
      "DateOfTaxableSupply",
      "TotalAmount",
      "PaidAmount",
      "OpenAmount",
      "Currency_FK",
      "Status_FK",
      "PaymentStatus_FK",
      "PdfUrl",
      "PrintUrl",
      "AttachmentUrl",
      "Created",
      "Modified"
    ]
  },
  {
    key: "legacy_invoice_issued_basic",
    entityName: "InvoiceIssued",
    columns: ["Id", "Number", "VariableSymbol", "Directory_FK", "IssueDate", "DueDate", "TotalAmount"]
  },
  {
    key: "legacy_invoice_basic",
    entityName: "Invoice",
    columns: ["Id", "Number", "VariableSymbol", "Directory_FK", "IssueDate", "DueDate", "TotalAmount"]
  },
  {
    key: "legacy_invoice_issued_id_number",
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

function splitTrailingRegistration(value) {
  const text = clean(value);
  const match = /^(.*?)(?:\s+-\s+)(\d{8})$/.exec(text);
  if (!match) {
    return { name: text, regNumber: "" };
  }
  return {
    name: clean(match[1]),
    regNumber: match[2]
  };
}

function displayName(value) {
  return splitTrailingRegistration(value).name || clean(value);
}

function registrationFromCaption(value) {
  return splitTrailingRegistration(value).regNumber;
}

function booleanValue(value) {
  const normalized = clean(value).toLowerCase();
  if (["true", "1", "ano", "yes", "paid", "uhrazeno"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "ne", "no", "unpaid", "neuhrazeno"].includes(normalized)) {
    return false;
  }
  return null;
}

function sampleKeys(rows) {
  return [...new Set(rows.flatMap((row) => Object.keys(row || {})))].slice(0, 80);
}

function collectInvoiceDetailIdentifiers(rows = [], options = {}) {
  const limit = Math.max(1, Math.min(Number(options.maxDetailIds) || DEFAULT_DETAIL_ID_LIMIT, MAX_DETAIL_ID_LIMIT));
  return rows
    .map((row) => firstValue(row, ["Id", "InvoiceId"]))
    .filter(Boolean)
    .slice(0, limit);
}

async function loadInvoiceDetailProbe(env, session, entityName, columns, rows = [], options = {}) {
  const identifiers = collectInvoiceDetailIdentifiers(rows, options);
  const diagnostics = {
    enabled: true,
    entityName,
    attemptedIds: identifiers,
    returnedRows: 0,
    usefulRows: 0,
    keys: [],
    errors: []
  };
  const detailsById = new Map();
  const keySet = new Set();
  const errors = new Map();

  for (const id of identifiers) {
    try {
      const detail = await getVistosById(env, session, entityName, id, columns);
      const row = detail.row && typeof detail.row === "object" && !Array.isArray(detail.row)
        ? detail.row
        : {};
      const keys = Object.keys(row);
      if (!keys.length) continue;
      const rowWithId = {
        ...row,
        Id: firstValue(row, ["Id"]) || id
      };
      detailsById.set(String(id), rowWithId);
      diagnostics.returnedRows += 1;
      diagnostics.usefulRows += invoiceIssues(mapReceivablesVistosInvoice(rowWithId)).length < 3 ? 1 : 0;
      for (const key of Object.keys(rowWithId)) {
        keySet.add(key);
      }
    } catch (error) {
      const code = clean(error?.code) || "invoice_detail_probe_failed";
      errors.set(code, (errors.get(code) || 0) + 1);
    }
  }

  diagnostics.keys = [...keySet].slice(0, 80);
  diagnostics.errors = [...errors.entries()].map(([code, count]) => ({ code, count }));

  return {
    ...diagnostics,
    detailsById
  };
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
        key: clean(attempt.key),
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
        key: clean(attempt.key),
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
  const rawCompanyName = caption(row, "Directory_FK")
    || caption(row, "Sidlo_FK")
    || firstValue(row, ["Rodič"])
    || firstValue(row, ["Name", "Název", "Caption", "CompanyName", "ObchodniNazev"]);
  const rawBranchName = caption(row, "DirectoryBranch_FK") || firstValue(row, ["Name", "Název", "Caption"]);
  const companyId = recordId(row, "Directory_FK") || recordId(row, "Sidlo_FK") || recordId(row, "Parent_FK") || firstValue(row, ["Id", "Systémové ID", "CompanyId", "DirectoryId"]);
  const branchId = recordId(row, "DirectoryBranch_FK") || firstValue(row, ["Id", "Systémové ID", "CompanyBranchId", "CustomerBranchId"]);
  const billingEmail = firstValue(row, ["BillingEmail", "InvoiceEmail", "EmailInvoicing", "Fakturační e-mail", "E-mail fakturace"]);
  const email = firstValue(row, ["Email", "Email1", "E-mail", "ContactEmail"]);
  const phone = firstValue(row, ["Phone", "PhoneNumber", "Telefon", "Mobile", "ContactPhone"]);
  const billingAddress = [
    firstValue(row, ["BillingAddressStreet", "Street", "Ulice"]),
    firstValue(row, ["BillingAddressCity", "City", "Město", "Mesto"]),
    firstValue(row, ["BillingAddressPostalCode", "Zip", "PSČ", "PSC"])
  ].filter(Boolean).join(", ");
  return {
    vistoCompanyId: companyId,
    vistoBranchId: branchId,
    companyName: displayName(rawCompanyName),
    branchName: displayName(rawBranchName),
    ico: compactDigits(firstValue(row, ["RegNumber", "ICO", "IČO", "Ico", "IC", "Ic", "CompanyIdentificationNumber"]))
      || registrationFromCaption(rawCompanyName)
      || registrationFromCaption(rawBranchName),
    dic: firstValue(row, ["VATNumber", "DIC", "DIČ", "Dic", "VAT", "VatId"]),
    billingEmail,
    email,
    phone,
    standardDueDays: numberValue(firstValue(row, ["InvoiceDueDays", "Splatnost", "DueDays", "StandardDueDays"]), null),
    billingAddress,
    deliveryAddress: billingAddress,
    activeStatus: caption(row, "Status_FK") || firstValue(row, ["Status", "Stav"]),
    createdAtVistos: firstValue(row, ["Created", "CreatedAt", "CreatedDate", "Vytvořeno"]),
    updatedAtVistos: firstValue(row, ["Modified", "UpdatedAt", "ModifiedDate", "Změněno"]),
    contactEmail: billingEmail || email,
    contactPhone: phone,
    city: firstValue(row, ["BillingAddressCity", "City", "Město", "Mesto"]),
    street: firstValue(row, ["BillingAddressStreet", "Street", "Ulice"]),
    zip: firstValue(row, ["BillingAddressPostalCode", "Zip", "PSČ", "PSC"]),
    rawPayload: row,
    raw: row
  };
}

export function mapReceivablesVistosInvoice(row = {}) {
  const customerBranchId = recordId(row, "CustomerBranch_FK");
  const customerCompanyId = recordId(row, "Customer_FK");
  const customerId = customerBranchId || customerCompanyId || recordId(row, "Directory_FK") || recordId(row, "Company_FK");
  const customerBranchName = caption(row, "CustomerBranch_FK");
  const customerCompanyName = caption(row, "Customer_FK");
  const customerName = customerBranchName || customerCompanyName || caption(row, "Directory_FK") || caption(row, "Company_FK") || firstValue(row, ["Firma nebo pobočka", "Název", "Sídlo"]);
  const invoiceNumber = firstValue(row, ["InvoiceNumber", "Number", "DocumentNumber", "Cislo", "Číslo faktury"]);
  const priceWithTax = numberValue(firstValue(row, ["PriceWithTax", "TotalAmount", "TotalPrice", "AmountTotal", "PriceTotal", "Celkem s DPH"]));
  const priceWithoutTax = numberValue(firstValue(row, ["PriceWithoutTax", "AmountWithoutTax", "Celkem bez DPH"]));
  return {
    vistoInvoiceId: firstValue(row, ["Id", "InvoiceId"]),
    invoiceNumber,
    variableSymbol: compactDigits(firstValue(row, ["BankReference2", "VariableSymbol", "VS", "VarSymbol", "Variabilní symbol"])) || compactDigits(invoiceNumber),
    constantSymbol: compactDigits(firstValue(row, ["BankReference1", "ConstantSymbol", "KS"])),
    specificSymbol: compactDigits(firstValue(row, ["BankReference3", "SpecificSymbol", "SS"])),
    customerId,
    customerFk: customerCompanyId,
    customerBranchFk: customerBranchId,
    customerName,
    customerBranchId,
    customerBranchName,
    customerCompanyId,
    customerCompanyName,
    ico: compactDigits(firstValue(row, ["CustomerRegNumber", "IČO zákazníka", "ICO", "IČO", "Ico", "IC", "Ic", "CompanyIdentificationNumber"])),
    dic: firstValue(row, ["CustomerVatNumber", "DIČ zákazníka", "DIC", "DIČ", "Dic", "VAT", "VatId"]),
    issueDate: firstValue(row, ["IssuedDate", "IssueDate", "InvoiceDate", "DateIssue", "CreatedDate", "Datum vystavení"]),
    dueDate: firstValue(row, ["DueDate", "MaturityDate", "DatumSplatnosti", "Datum splatnosti"]),
    taxableSupplyDate: firstValue(row, ["TaxableSupplyDate", "DateOfTaxableSupply", "VatDate", "DUZP", "Datum zdanitelného plnění"]),
    priceWithoutTax,
    priceWithTax,
    totalAmount: priceWithTax,
    paidAmount: numberValue(firstValue(row, ["PaidAmount", "AmountPaid", "Uhrazeno", "Uhrazeno (1)"])),
    openAmount: numberValue(firstValue(row, ["RemainToPay", "OpenAmount", "RemainingAmount", "AmountOpen", "Zbývá uhradit"])),
    remainingAmount: numberValue(firstValue(row, ["RemainToPay", "OpenAmount", "RemainingAmount", "AmountOpen", "Zbývá uhradit"])),
    currency: caption(row, "Currency_FK") || firstValue(row, ["Currency", "CurrencyCode", "Měna"]) || "CZK",
    status: caption(row, "Status_FK") || firstValue(row, ["Status", "InvoiceStatus", "Stav"]),
    paymentStatus: caption(row, "PaymentStatus_FK") || firstValue(row, ["PaymentStatus", "PaymentState", "Stav úhrady"]) || (booleanValue(firstValue(row, ["IsPaid", "Uhrazeno"])) === true ? "paid" : ""),
    isPaid: booleanValue(firstValue(row, ["IsPaid", "Uhrazeno"])),
    pdfUrl: firstValue(row, ["PdfUrl", "InvoicePdfUrl", "PDF", "PDFUrl"]),
    printUrl: firstValue(row, ["PrintUrl", "PrintUri", "TiskUrl"]),
    attachmentUrl: firstValue(row, ["AttachmentUrl", "Attachment", "FileUrl"]),
    createdAtVistos: firstValue(row, ["Created", "CreatedAt", "CreatedDate", "Vytvořeno"]),
    updatedAtVistos: firstValue(row, ["Modified", "UpdatedAt", "ModifiedDate", "Změněno"]),
    rawPayload: row,
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

function uniqueCompanies(companies) {
  const seen = new Set();
  const unique = [];
  for (const company of companies) {
    const key = company.vistoCompanyId || company.companyName.toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(company);
  }
  return unique;
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

  const companies = uniqueCompanies(companyResult.page.rows.map(mapReceivablesVistosCompany))
    .slice(0, RECEIVABLES_VISTOS_PREVIEW_LIMIT);
  const invoiceDetailProbe = await loadInvoiceDetailProbe(
    env,
    session,
    invoiceResult.entityName,
    [...new Set([...invoiceResult.columns, ...KAISER_INVOICE_COLUMNS])],
    invoiceResult.page.rows,
    options
  );
  const invoices = invoiceResult.page.rows
    .slice(0, RECEIVABLES_VISTOS_INVOICE_PREVIEW_LIMIT)
    .map((row) => {
      const id = firstValue(row, ["Id", "InvoiceId"]);
      return mapReceivablesVistosInvoice({
        ...row,
        ...(invoiceDetailProbe.detailsById.get(String(id)) || {})
      });
    });
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
      invoiceDetailProbe: {
        enabled: true,
        entityName: invoiceDetailProbe.entityName,
        attemptedIds: invoiceDetailProbe.attemptedIds,
        returnedRows: invoiceDetailProbe.returnedRows,
        usefulRows: invoiceDetailProbe.usefulRows,
        keys: invoiceDetailProbe.keys,
        errors: invoiceDetailProbe.errors
      },
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
