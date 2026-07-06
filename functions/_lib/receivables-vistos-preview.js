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
const RECEIVABLES_INVOICE_DISCOVERY_PREVIEW_LIMIT = 80;

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
  },
  {
    entityName: "Contract",
    columns: ["Id", "ContractNumber", "Name", "Directory_FK", "DirectoryBranch_FK", "Sidlo_FK"]
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

const INVOICE_DISCOVERY_ENTITY_NAMES = [
  "InvoiceIssued",
  "Invoice",
  "IssuedInvoice",
  "IssuedInvoices",
  "InvoiceOut",
  "OutgoingInvoice",
  "SalesInvoice",
  "TaxDocumentIssued",
  "IssuedTaxDocument",
  "TaxDocument",
  "AccountingDocument",
  "AccountDocument",
  "DocumentIssued",
  "Document",
  "Receivable",
  "ReceivableInvoice",
  "BillingDocument",
  "Billing",
  "InvoiceBook",
  "InvoiceRow",
  "InvoiceItem"
];

const INVOICE_DISCOVERY_COLUMN_SETS = [
  {
    key: "id_only",
    columns: ["Id"]
  },
  {
    key: "number_basic",
    columns: ["Id", "Number"]
  },
  {
    key: "invoice_number_basic",
    columns: ["Id", "InvoiceNumber"]
  },
  {
    key: "issued_invoice_standard",
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
    key: "date_amount_variants",
    columns: [
      "Id",
      "Number",
      "VariableSymbol",
      "Directory_FK",
      "DateIssue",
      "DateAccounting",
      "MaturityDate",
      "AmountTotal",
      "AmountPaid",
      "AmountOpen"
    ]
  },
  {
    key: "document_variants",
    columns: [
      "Id",
      "DocumentNumber",
      "VariableSymbol",
      "Directory_FK",
      "CreatedDate",
      "DueDate",
      "PriceTotal",
      "RemainingAmount",
      "Currency_FK"
    ]
  }
];

const VISTOS_CONTROL_ENTITIES = [
  {
    key: "vehicles",
    entityName: "Vehicle",
    purpose: "Kontrola stejného Vistos Execute API, které používá Vozový park.",
    columns: ["Id", "Name", "RegistrationPlate"]
  },
  {
    key: "contracts",
    entityName: "Contract",
    purpose: "Kontrola stejného Vistos Execute API, které používají Trasy svozu.",
    columns: ["Id", "ContractNumber", "Directory_FK"]
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

function splitCompanyNameAndIco(value) {
  const text = clean(value);
  const match = text.match(/^(.*?)\s+-\s+(\d{8})$/);
  if (!match) {
    return { companyName: text, ico: "" };
  }
  return {
    companyName: clean(match[1]) || text,
    ico: match[2]
  };
}

function sampleKeys(rows) {
  return [...new Set(rows.flatMap((row) => Object.keys(row || {})))].slice(0, 80);
}

function invoiceMappingScore(invoices) {
  let score = 0;
  for (const invoice of invoices) {
    if (invoice.vistoInvoiceId) score += 1;
    if (invoice.invoiceNumber) score += 2;
    if (invoice.variableSymbol) score += 1;
    if (invoice.customerId || invoice.customerName) score += 2;
    if (invoice.dueDate) score += 2;
    if (invoice.totalAmount) score += 2;
    if (invoice.openAmount || invoice.paidAmount) score += 1;
  }
  return score;
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
  const rawCompanyName = caption(row, "Directory_FK") || caption(row, "Sidlo_FK") || firstValue(row, ["Name", "Caption", "CompanyName", "ObchodniNazev"]);
  const parsedCompany = splitCompanyNameAndIco(rawCompanyName);
  return {
    vistoCompanyId: recordId(row, "Directory_FK") || recordId(row, "Sidlo_FK") || firstValue(row, ["Id", "CompanyId", "DirectoryId"]),
    companyName: parsedCompany.companyName,
    ico: compactDigits(firstValue(row, ["ICO", "Ico", "IC", "Ic", "CompanyIdentificationNumber"])) || parsedCompany.ico,
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

async function discoverInvoiceEntity(env, session, entityName, options = {}) {
  const attempts = [];
  let best = {
    columnSet: "",
    columns: [],
    page: { rows: [], total: 0, filtered: 0, capped: false },
    invoices: [],
    mappingScore: -1
  };

  for (const columnSet of INVOICE_DISCOVERY_COLUMN_SETS) {
    try {
      const page = await getAllVistosPages(env, session, entityName, columnSet.columns, null, {
        pageSize: Math.min(Number(options.pageSize) || 25, 100),
        maxPages: 1
      });
      const invoices = page.rows
        .slice(0, RECEIVABLES_INVOICE_DISCOVERY_PREVIEW_LIMIT)
        .map(mapReceivablesVistosInvoice);
      const mappingScore = invoiceMappingScore(invoices);
      attempts.push({
        columnSet: columnSet.key,
        columns: columnSet.columns,
        ok: true,
        returnedRows: page.rows.length,
        recordsTotal: page.total || 0,
        recordsFiltered: page.filtered || 0,
        mappingScore,
        sampleKeys: sampleKeys(page.rows).slice(0, 20)
      });

      if (page.rows.length > 0 && mappingScore > best.mappingScore) {
        best = {
          columnSet: columnSet.key,
          columns: columnSet.columns,
          page,
          invoices,
          mappingScore
        };
      }

      if (columnSet.key === "id_only" && !page.rows.length) {
        break;
      }
    } catch (error) {
      attempts.push({
        columnSet: columnSet.key,
        columns: columnSet.columns,
        ok: false,
        code: clean(error?.code),
        message: clean(error?.message).slice(0, 180)
      });

      if (columnSet.key === "id_only") {
        break;
      }
    }
  }

  const hasRows = best.page.rows.length > 0;
  const usableForRating = best.invoices.some((invoice) =>
    (invoice.customerId || invoice.customerName) &&
    invoice.dueDate &&
    invoice.totalAmount
  );
  const accessible = attempts.some((attempt) => attempt.ok);

  return {
    entityName,
    status: hasRows ? (usableForRating ? "usable_candidate" : "rows_without_rating_fields") : accessible ? "empty" : "blocked_or_missing",
    accessible,
    hasRows,
    usableForRating,
    recordsTotal: best.page.total || best.page.rows.length || 0,
    returnedRows: best.page.rows.length,
    bestColumnSet: best.columnSet,
    bestColumns: best.columns,
    mappingScore: Math.max(0, best.mappingScore),
    sampleKeys: sampleKeys(best.page.rows),
    invoices: best.invoices,
    attempts
  };
}

async function readVistosControlEntity(env, session, control, options = {}) {
  try {
    const page = await getAllVistosPages(env, session, control.entityName, control.columns, null, {
      pageSize: Math.min(Number(options.controlPageSize) || 10, 50),
      maxPages: 1
    });
    return {
      key: control.key,
      entityName: control.entityName,
      purpose: control.purpose,
      status: page.rows.length > 0 ? "readable_with_rows" : "readable_empty",
      accessible: true,
      returnedRows: page.rows.length,
      recordsTotal: page.total || page.rows.length || 0,
      sampleKeys: sampleKeys(page.rows).slice(0, 20)
    };
  } catch (error) {
    return {
      key: control.key,
      entityName: control.entityName,
      purpose: control.purpose,
      status: "blocked_or_missing",
      accessible: false,
      returnedRows: 0,
      recordsTotal: 0,
      code: clean(error?.code),
      message: clean(error?.message).slice(0, 180),
      sampleKeys: []
    };
  }
}

async function runLimited(items, limit, worker) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
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
  const invoices = invoiceResult.page.rows.slice(0, RECEIVABLES_VISTOS_INVOICE_PREVIEW_LIMIT).map(mapReceivablesVistosInvoice);
  const issues = [
    ...issueCounts(companies, companyIssues).map((issue) => ({ ...issue, scope: "companies" })),
    ...issueCounts(invoices, invoiceIssues).map((issue) => ({ ...issue, scope: "invoices" }))
  ];
  const ready = companyResult.page.rows.length > 0 || invoiceResult.page.rows.length > 0;

  return {
    apiStatus: ready ? "ready" : "empty",
    message: ready
      ? "Vistos firmy / faktury preview načteno read-only. Data nejsou uložená do D1."
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
      executeClient: "functions/_lib/vistos-execute-client.js",
      executeMethods: ["LoginParam", "GetPageParam"],
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

export async function createReceivablesVistosInvoiceDiscovery(env, options = {}) {
  if (!isVistosExecuteConfigured(env)) {
    return {
      apiStatus: "not_configured",
      message: VISTOS_NOT_CONFIGURED_MESSAGE,
      readOnly: true,
      writesD1: false,
      createsReceivableRecords: false,
      sendsEmailOrSms: false,
      startsAutomation: false,
      sourceParity: {
        executeClient: "functions/_lib/vistos-execute-client.js",
        executeMethods: ["LoginParam", "GetPageParam"],
        note: "Diagnostika používá stejný Vistos Execute klient jako vozidla a trasy."
      },
      controls: [],
      summary: {
        candidateCount: INVOICE_DISCOVERY_ENTITY_NAMES.length,
        readableEntityCount: 0,
        entitiesWithRows: 0,
        usableEntityCount: 0,
        previewInvoiceRows: 0,
        workingControlCount: 0
      },
      bestEntity: null,
      candidates: [],
      invoices: []
    };
  }

  const session = await loginVistosExecute(env);
  const [controls, candidates] = await Promise.all([
    Promise.all(VISTOS_CONTROL_ENTITIES.map((control) => readVistosControlEntity(env, session, control, options))),
    runLimited(
      INVOICE_DISCOVERY_ENTITY_NAMES,
      4,
      (entityName) => discoverInvoiceEntity(env, session, entityName, options)
    )
  ]);
  const withRows = candidates.filter((candidate) => candidate.hasRows);
  const usable = candidates.filter((candidate) => candidate.usableForRating);
  const bestEntity = [...candidates].sort((a, b) => {
    if (Number(b.usableForRating) !== Number(a.usableForRating)) {
      return Number(b.usableForRating) - Number(a.usableForRating);
    }
    if (b.mappingScore !== a.mappingScore) {
      return b.mappingScore - a.mappingScore;
    }
    return b.recordsTotal - a.recordsTotal;
  })[0] || null;
  const invoices = (bestEntity?.invoices || []).slice(0, RECEIVABLES_INVOICE_DISCOVERY_PREVIEW_LIMIT);
  const workingControlCount = controls.filter((control) => control.accessible && control.returnedRows > 0).length;

  return {
    apiStatus: usable.length ? "ready" : withRows.length ? "needs_mapping" : "empty",
    message: usable.length
      ? `Vistos invoice discovery našlo použitelnou kandidátní entitu ${usable[0].entityName}.`
      : withRows.length
        ? "Vistos invoice discovery našlo entity s řádky, ale bez dostatečných polí pro rating."
        : workingControlCount
          ? "Vistos API funguje pro jiné entity, ale diagnostika nenašla dostupnou entitu vydaných faktur."
          : "Vistos invoice discovery nenašlo dostupnou entitu vydaných faktur ani kontrolní entity.",
    readOnly: true,
    writesD1: false,
    createsReceivableRecords: false,
    sendsEmailOrSms: false,
    startsAutomation: false,
    sourceParity: {
      executeClient: "functions/_lib/vistos-execute-client.js",
      executeMethods: ["LoginParam", "GetPageParam"],
      note: "Diagnostika používá stejný Vistos Execute klient a stejnou session jako existující Vistos čtení vozidel/trasy."
    },
    controls,
    summary: {
      candidateCount: candidates.length,
      readableEntityCount: candidates.filter((candidate) => candidate.accessible).length,
      entitiesWithRows: withRows.length,
      usableEntityCount: usable.length,
      previewInvoiceRows: invoices.length,
      workingControlCount
    },
    bestEntity: bestEntity ? {
      entityName: bestEntity.entityName,
      status: bestEntity.status,
      recordsTotal: bestEntity.recordsTotal,
      returnedRows: bestEntity.returnedRows,
      bestColumnSet: bestEntity.bestColumnSet,
      mappingScore: bestEntity.mappingScore,
      sampleKeys: bestEntity.sampleKeys
    } : null,
    candidates: candidates.map((candidate) => ({
      entityName: candidate.entityName,
      status: candidate.status,
      accessible: candidate.accessible,
      hasRows: candidate.hasRows,
      usableForRating: candidate.usableForRating,
      recordsTotal: candidate.recordsTotal,
      returnedRows: candidate.returnedRows,
      bestColumnSet: candidate.bestColumnSet,
      mappingScore: candidate.mappingScore,
      sampleKeys: candidate.sampleKeys,
      attempts: candidate.attempts
    })),
    invoices,
    loadedAt: new Date().toISOString()
  };
}
