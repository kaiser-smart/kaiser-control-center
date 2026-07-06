import {
  VistosExecuteError,
  cleanVistosValue,
  getAllVistosPages,
  isVistosExecuteConfigured,
  loginVistosExecute
} from "./vistos-execute-client.js";
import { mapReceivablesVistosInvoice } from "./receivables-vistos-preview.js";

const VISTOS_NOT_CONFIGURED_MESSAGE = "Vistos API není nakonfigurováno";
const DEFAULT_PAGE_SIZE = 250;
const DEFAULT_MAX_PAGES = 1;
const MAX_PAGE_SIZE = 1000;
const MAX_PAGES = 5;

const DIRECTORY_WITH_BRANCH_CORE_COLUMNS = [
  "Id",
  "Name",
  "c_ShortName",
  "Parent_FK",
  "RegNumber",
  "VATNumber",
  "BillingAddressStreet",
  "BillingAddressCity",
  "BillingAddressPostalCode",
  "InvoiceDueDays",
  "Type_FK",
  "Status_FK"
];

const DIRECTORY_WITH_BRANCH_EXTENDED_COLUMNS = [
  ...DIRECTORY_WITH_BRANCH_CORE_COLUMNS,
  "Email",
  "InvoiceEmail",
  "BillingEmail",
  "Phone",
  "Mobile"
];

const DIRECTORY_WITH_BRANCH_CZECH_COLUMNS = [
  "Systémové ID",
  "Název",
  "Rodič",
  "IČO",
  "DIČ",
  "Fakturační e-mail",
  "E-mail",
  "Splatnost",
  "Město",
  "PSČ",
  "Ulice",
  "Stav",
  "Typ",
  "Zákazník",
  "Dodavatel"
];

const CONTRACT_CUSTOMER_COLUMNS = [
  "Id",
  "ContractNumber",
  "Name",
  "Directory_FK",
  "DirectoryBranch_FK",
  "Sidlo_FK",
  "Status_FK"
];

const RECEIVABLES_COMPANY_ATTEMPTS = [
  {
    key: "contract_customer_fallback",
    entityName: "Contract",
    columns: CONTRACT_CUSTOMER_COLUMNS
  },
  {
    key: "directory_with_branch_czech_export",
    entityName: "DirectoryWithBranch",
    columns: DIRECTORY_WITH_BRANCH_CZECH_COLUMNS
  },
  {
    key: "directory_with_branch_extended",
    entityName: "DirectoryWithBranch",
    columns: DIRECTORY_WITH_BRANCH_EXTENDED_COLUMNS
  },
  {
    key: "directory_with_branch_core",
    entityName: "DirectoryWithBranch",
    columns: DIRECTORY_WITH_BRANCH_CORE_COLUMNS
  },
  {
    key: "company_legacy",
    entityName: "Company",
    columns: ["Id", "Name", "Caption", "ICO", "DIC", "Email", "Phone", "Mobile", "Street", "City", "Zip"]
  },
  {
    key: "directory_legacy",
    entityName: "Directory",
    columns: ["Id", "Name", "Caption", "ICO", "DIC", "Email", "Phone", "Mobile", "Street", "City", "Zip"]
  },
  {
    key: "customer_probe",
    entityName: "Customer",
    columns: ["Id", "Name", "RegNumber", "VATNumber", "Email", "InvoiceDueDays"]
  },
  {
    key: "customer_branch_probe",
    entityName: "CustomerBranch",
    columns: ["Id", "Name", "Parent_FK", "RegNumber", "VATNumber", "Email", "InvoiceDueDays"]
  },
  {
    key: "company_branch_probe",
    entityName: "CompanyBranch",
    columns: ["Id", "Name", "Parent_FK", "RegNumber", "VATNumber", "Email", "InvoiceDueDays"]
  },
  {
    key: "partner_probe",
    entityName: "Partner",
    columns: ["Id", "Name", "RegNumber", "VATNumber", "Email"]
  },
  {
    key: "address_book_probe",
    entityName: "AddressBook",
    columns: ["Id", "Name", "RegNumber", "VATNumber", "Email"]
  }
];

const RECEIVABLES_COMPANY_ENRICHMENT_ATTEMPTS = [
  {
    key: "directory_with_branch_czech_enrichment",
    entityName: "DirectoryWithBranch",
    columns: DIRECTORY_WITH_BRANCH_CZECH_COLUMNS
  },
  {
    key: "directory_with_branch_extended_enrichment",
    entityName: "DirectoryWithBranch",
    columns: DIRECTORY_WITH_BRANCH_EXTENDED_COLUMNS
  },
  {
    key: "directory_with_branch_core_enrichment",
    entityName: "DirectoryWithBranch",
    columns: DIRECTORY_WITH_BRANCH_CORE_COLUMNS
  }
];

const INVOICE_COLUMNS = [
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
  "PriceWithoutTax",
  "PriceWithTax",
  "AmountPaid",
  "RemainToPay",
  "Status_FK",
  "IsPaid"
];

const RECEIVABLES_INVOICE_ATTEMPTS = [
  { key: "kaiser_invoice_columns", entityName: "InvoiceIssued", columns: INVOICE_COLUMNS },
  { key: "kaiser_invoice_columns", entityName: "Document", columns: INVOICE_COLUMNS },
  { key: "kaiser_invoice_columns", entityName: "Invoice", columns: INVOICE_COLUMNS },
  { key: "kaiser_invoice_columns", entityName: "IssuedInvoice", columns: INVOICE_COLUMNS }
];

export const RECEIVABLES_LEDGER_FLAGS = {
  MISSING_COMPANY_ENTITY: "MISSING_COMPANY_ENTITY",
  MISSING_CUSTOMER_FK: "MISSING_CUSTOMER_FK",
  MISSING_BRANCH_FK: "MISSING_BRANCH_FK",
  CUSTOMER_NOT_FOUND: "CUSTOMER_NOT_FOUND",
  BRANCH_NOT_FOUND: "BRANCH_NOT_FOUND",
  MISSING_ICO: "MISSING_ICO",
  MISSING_DIC: "MISSING_DIC",
  MISSING_BILLING_EMAIL: "MISSING_BILLING_EMAIL",
  MISSING_STANDARD_DUE_DAYS: "MISSING_STANDARD_DUE_DAYS",
  MISSING_DUE_DATE: "MISSING_DUE_DATE",
  MISSING_VARIABLE_SYMBOL: "MISSING_VARIABLE_SYMBOL",
  MISSING_INVOICE_AMOUNT: "MISSING_INVOICE_AMOUNT",
  MISSING_PAID_AMOUNT: "MISSING_PAID_AMOUNT",
  MISSING_REMAINING_AMOUNT: "MISSING_REMAINING_AMOUNT",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  CUSTOMER_MATCH_BY_NAME_ONLY: "CUSTOMER_MATCH_BY_NAME_ONLY",
  MULTIPLE_CUSTOMER_CANDIDATES: "MULTIPLE_CUSTOMER_CANDIDATES",
  INVOICE_WITHOUT_CUSTOMER: "INVOICE_WITHOUT_CUSTOMER"
};

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

function normalizeKey(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrNull(value) {
  const text = clean(value);
  if (!text) return null;
  const number = Number(text.replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function hasAnyValue(row, keys) {
  return keys.some((key) => clean(row?.[key]));
}

function sampleKeys(rows) {
  return [...new Set(rows.flatMap((row) => Object.keys(row || {})))].slice(0, 80);
}

function addFlag(flags, code) {
  if (code && !flags.includes(code)) {
    flags.push(code);
  }
}

function companyDataQualityFlags(company = {}) {
  const flags = [];
  if (!company.vistoBranchId) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_COMPANY_ENTITY);
  if (!company.ico) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_ICO);
  if (!company.dic) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_DIC);
  if (!company.billingEmail && !company.email) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_BILLING_EMAIL);
  if (company.standardDueDays === null || company.standardDueDays === undefined) {
    addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_STANDARD_DUE_DAYS);
  }
  return flags;
}

async function loadFirstWorkingEntity(env, session, attempts, options = {}) {
  const diagnostics = [];
  let firstEmptyResult = null;

  for (const attempt of attempts) {
    const entityName = attempt.entityName;
    const columns = attempt.columns;
    try {
      const page = await getAllVistosPages(env, session, entityName, columns, null, {
        pageSize: Math.min(Number(options.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
        maxPages: Math.min(Number(options.maxPages) || DEFAULT_MAX_PAGES, MAX_PAGES)
      });
      diagnostics.push({
        key: attempt.key,
        entityName,
        columns,
        ok: true,
        returnedRows: page.rows.length,
        recordsTotal: page.total || 0,
        recordsFiltered: page.filtered || 0,
        capped: Boolean(page.capped)
      });
      if (page.rows.length > 0) {
        return { key: attempt.key, entityName, columns, page, diagnostics };
      }
      if (!firstEmptyResult) {
        firstEmptyResult = { key: attempt.key, entityName, columns, page };
      }
    } catch (error) {
      diagnostics.push({
        key: attempt.key,
        entityName,
        columns,
        ok: false,
        code: clean(error?.code),
        message: clean(error?.message).slice(0, 180)
      });
    }
  }

  return {
    ...(firstEmptyResult || { key: "", entityName: "", columns: [], page: { rows: [], total: 0, filtered: 0, capped: false } }),
    diagnostics
  };
}

export function mapReceivablesLedgerCompany(row = {}, entityName = "DirectoryWithBranch") {
  const isContract = entityName === "Contract";
  const contractCompanyId = recordId(row, "Directory_FK") || recordId(row, "Sidlo_FK");
  const contractBranchId = recordId(row, "DirectoryBranch_FK") || contractCompanyId || firstValue(row, ["Id"]);
  const rawBranchName = isContract
    ? caption(row, "DirectoryBranch_FK") || caption(row, "Directory_FK") || caption(row, "Sidlo_FK") || firstValue(row, ["Name", "Název", "Caption"])
    : firstValue(row, ["Name", "Název", "Caption", "CompanyName", "CustomerName"]);
  const rawParentName = isContract
    ? caption(row, "Directory_FK") || caption(row, "Sidlo_FK")
    : caption(row, "Parent_FK") || firstValue(row, ["Rodič"]);
  const branchId = isContract
    ? contractBranchId
    : firstValue(row, ["Id", "Systémové ID", "DirectoryWithBranchId", "CompanyBranchId", "CustomerBranchId"]);
  const parentId = isContract ? contractCompanyId : recordId(row, "Parent_FK");
  const branchName = displayName(rawBranchName);
  const parentName = displayName(rawParentName);
  const ico = compactDigits(firstValue(row, ["RegNumber", "IČO", "ICO", "Ico", "IC", "Ic", "CustomerRegNumber"]))
    || registrationFromCaption(rawBranchName)
    || registrationFromCaption(rawParentName);
  const dic = firstValue(row, ["VATNumber", "DIČ", "DIC", "Dic", "CustomerVatNumber", "VAT", "VatId"]);
  const billingEmail = firstValue(row, [
    "BillingEmail",
    "InvoiceEmail",
    "FakturacniEmail",
    "Fakturacni_e_mail",
    "Fakturační e-mail",
    "E-mail fakturace"
  ]);
  const email = firstValue(row, ["Email", "E-mail", "ContactEmail"]);
  const standardDueDays = numberOrNull(firstValue(row, ["InvoiceDueDays", "Splatnost", "DueDays", "StandardDueDays"]));
  const billingAddress = [
    firstValue(row, ["BillingAddressStreet", "Street", "Ulice"]),
    firstValue(row, ["BillingAddressCity", "City", "Město", "Mesto"]),
    firstValue(row, ["BillingAddressPostalCode", "Zip", "PSČ", "PSC"])
  ].filter(Boolean).join(", ");
  const company = {
    entityName,
    vistoCompanyId: parentId || branchId,
    vistoBranchId: branchId,
    companyName: parentName || branchName,
    branchName,
    parentCompanyId: parentId,
    parentCompanyName: parentName,
    ico,
    dic,
    billingEmail,
    email,
    phone: firstValue(row, ["Phone", "Telefon", "Mobile"]),
    standardDueDays,
    billingAddress,
    deliveryAddress: billingAddress,
    activeStatus: caption(row, "Status_FK") || firstValue(row, ["Status", "Stav"]),
    isBranch: Boolean(parentId && parentId !== branchId),
    flags: [],
    raw: row
  };

  return {
    ...company,
    flags: companyDataQualityFlags(company)
  };
}

function buildCompanyIndexes(companies = []) {
  const byCompanyId = new Map();
  const byBranchId = new Map();
  const byName = new Map();
  const byIco = new Map();

  for (const company of companies) {
    if (company.vistoCompanyId && !byCompanyId.has(company.vistoCompanyId)) byCompanyId.set(company.vistoCompanyId, company);
    if (company.vistoBranchId && !byBranchId.has(company.vistoBranchId)) byBranchId.set(company.vistoBranchId, company);
    const names = [company.companyName, company.branchName, company.parentCompanyName].map(normalizeKey).filter(Boolean);
    for (const name of names) {
      const list = byName.get(name) || [];
      list.push(company);
      byName.set(name, list);
    }
    if (company.ico) {
      const list = byIco.get(company.ico) || [];
      list.push(company);
      byIco.set(company.ico, list);
    }
  }

  return { byCompanyId, byBranchId, byName, byIco };
}

function firstIndexMatch(map, key) {
  if (!key) return null;
  const value = map.get(key);
  return Array.isArray(value) ? value[0] || null : value || null;
}

function mergeCompanyValue(primary, enrichment, keys) {
  for (const key of keys) {
    if (primary[key] !== null && primary[key] !== undefined && primary[key] !== "") {
      return primary[key];
    }
  }
  for (const key of keys) {
    if (enrichment?.[key] !== null && enrichment?.[key] !== undefined && enrichment?.[key] !== "") {
      return enrichment[key];
    }
  }
  return primary[keys[0]];
}

function mergeCompanyEnrichment(baseCompanies = [], enrichmentCompanies = []) {
  const enrichmentIndexes = buildCompanyIndexes(enrichmentCompanies);
  let matchedCompanies = 0;

  const companies = baseCompanies.map((company) => {
    const nameKey = normalizeKey(company.companyName || company.branchName || company.parentCompanyName);
    const enrichment = firstIndexMatch(enrichmentIndexes.byBranchId, company.vistoBranchId)
      || firstIndexMatch(enrichmentIndexes.byCompanyId, company.vistoCompanyId)
      || firstIndexMatch(enrichmentIndexes.byIco, company.ico)
      || firstIndexMatch(enrichmentIndexes.byName, nameKey);

    if (!enrichment) {
      return {
        ...company,
        enrichmentMatched: false
      };
    }

    matchedCompanies += 1;
    const merged = {
      ...company,
      companyName: mergeCompanyValue(company, enrichment, ["companyName"]),
      branchName: mergeCompanyValue(company, enrichment, ["branchName"]),
      parentCompanyName: mergeCompanyValue(company, enrichment, ["parentCompanyName"]),
      ico: mergeCompanyValue(company, enrichment, ["ico"]),
      dic: mergeCompanyValue(company, enrichment, ["dic"]),
      billingEmail: mergeCompanyValue(company, enrichment, ["billingEmail"]),
      email: mergeCompanyValue(company, enrichment, ["email"]),
      phone: mergeCompanyValue(company, enrichment, ["phone"]),
      standardDueDays: mergeCompanyValue(company, enrichment, ["standardDueDays"]),
      billingAddress: mergeCompanyValue(company, enrichment, ["billingAddress"]),
      deliveryAddress: mergeCompanyValue(company, enrichment, ["deliveryAddress"]),
      activeStatus: mergeCompanyValue(company, enrichment, ["activeStatus"]),
      enrichmentMatched: true,
      enrichmentEntityName: enrichment.entityName,
      enrichmentBranchId: enrichment.vistoBranchId,
      enrichmentCompanyId: enrichment.vistoCompanyId
    };
    return {
      ...merged,
      flags: companyDataQualityFlags(merged)
    };
  });

  return {
    companies,
    matchedCompanies
  };
}

function scoreNameMatch(invoiceName, company) {
  const invoiceKey = normalizeKey(invoiceName);
  if (!invoiceKey) return 0;
  const candidates = [company.companyName, company.branchName, company.parentCompanyName].map(normalizeKey).filter(Boolean);
  if (candidates.includes(invoiceKey)) return 1;
  return candidates.some((candidate) => candidate.includes(invoiceKey) || invoiceKey.includes(candidate)) ? 0.72 : 0;
}

function customerCandidatesByName(invoice, indexes) {
  const key = normalizeKey(invoice.customerName || invoice.customerCompanyName || invoice.customerBranchName);
  if (!key) return [];
  const direct = indexes.byName.get(key) || [];
  if (direct.length) return direct;
  return [...indexes.byBranchId.values()]
    .filter((company) => scoreNameMatch(key, company) >= 0.72)
    .slice(0, 5);
}

export function resolveInvoiceCustomer(invoice = {}, companies = [], prebuiltIndexes = null) {
  const indexes = prebuiltIndexes || buildCompanyIndexes(companies);
  const flags = [];
  const warnings = [];
  const raw = invoice.raw || {};
  const customerFk = invoice.customerCompanyId || recordId(raw, "Customer_FK") || (!invoice.customerBranchId ? invoice.customerId : "");
  const branchFk = invoice.customerBranchId || recordId(raw, "CustomerBranch_FK");
  const totalPresent = hasAnyValue(raw, ["PriceWithTax", "TotalAmount", "TotalPrice", "AmountTotal", "PriceTotal", "Celkem s DPH"]);
  const paidPresent = hasAnyValue(raw, ["AmountPaid", "PaidAmount", "Uhrazeno", "Uhrazeno (1)"]);
  const remainingPresent = hasAnyValue(raw, ["RemainToPay", "OpenAmount", "RemainingAmount", "AmountOpen", "Zbývá uhradit"]);

  if (!customerFk) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_CUSTOMER_FK);
  if (!branchFk) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_BRANCH_FK);
  if (!invoice.dueDate) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_DUE_DATE);
  if (!invoice.variableSymbol) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_VARIABLE_SYMBOL);
  if (!totalPresent) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_INVOICE_AMOUNT);
  if (!paidPresent) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_PAID_AMOUNT);
  if (!remainingPresent) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_REMAINING_AMOUNT);
  if (totalPresent && Number(invoice.totalAmount) <= 0) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.INVALID_AMOUNT);
  if (!customerFk && !branchFk && !invoice.customerName) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.INVOICE_WITHOUT_CUSTOMER);

  const branch = branchFk ? indexes.byBranchId.get(branchFk) : null;
  const company = customerFk ? (indexes.byCompanyId.get(customerFk) || indexes.byBranchId.get(customerFk)) : null;
  if (customerFk && !company) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.CUSTOMER_NOT_FOUND);
  if (branchFk && !branch) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.BRANCH_NOT_FOUND);

  let resolved = branch || company || null;
  let matchedBy = resolved ? (branch ? "branch_fk" : "customer_fk") : "";
  const nameCandidates = !resolved ? customerCandidatesByName(invoice, indexes) : [];
  if (!resolved && nameCandidates.length === 1) {
    resolved = nameCandidates[0];
    matchedBy = "name_only";
    addFlag(flags, RECEIVABLES_LEDGER_FLAGS.CUSTOMER_MATCH_BY_NAME_ONLY);
  } else if (!resolved && nameCandidates.length > 1) {
    addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MULTIPLE_CUSTOMER_CANDIDATES);
  }

  const resolvedIco = resolved?.ico || invoice.ico || "";
  const resolvedDic = resolved?.dic || invoice.dic || "";
  const resolvedBillingEmail = resolved?.billingEmail || resolved?.email || "";
  if (!resolvedIco) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_ICO);
  if (!resolvedDic) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_DIC);
  if (!resolvedBillingEmail) addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_BILLING_EMAIL);
  if (resolved?.standardDueDays === null || resolved?.standardDueDays === undefined) {
    addFlag(flags, RECEIVABLES_LEDGER_FLAGS.MISSING_STANDARD_DUE_DAYS);
  }

  let confidence = "NONE";
  if (resolved && matchedBy === "name_only") {
    confidence = "LOW";
  } else if (resolved && resolvedIco && invoice.dueDate && Number(invoice.totalAmount) > 0) {
    confidence = "HIGH";
  } else if (resolved) {
    confidence = "MEDIUM";
  }
  if (flags.includes(RECEIVABLES_LEDGER_FLAGS.MULTIPLE_CUSTOMER_CANDIDATES)) {
    confidence = "LOW";
  }

  if (!resolved) warnings.push("Firmu se nepodařilo spolehlivě propojit.");
  if (matchedBy === "name_only") warnings.push("Vazba je pouze přes název, ne přes stabilní Vistos FK.");
  if (flags.includes(RECEIVABLES_LEDGER_FLAGS.INVALID_AMOUNT)) warnings.push("Faktura má nulovou nebo zápornou částku.");

  return {
    invoiceId: invoice.vistoInvoiceId,
    invoiceNumber: invoice.invoiceNumber,
    customerFk,
    customerBranchFk: branchFk,
    resolvedCompanyId: resolved?.vistoCompanyId || "",
    resolvedBranchId: resolved?.vistoBranchId || "",
    resolvedCustomerName: resolved?.companyName || resolved?.branchName || invoice.customerName || "",
    resolvedIco,
    resolvedDic,
    resolvedBillingEmail,
    resolvedStandardDueDays: resolved?.standardDueDays ?? null,
    confidence,
    matchedBy,
    warnings,
    flags,
    invoice,
    company: resolved || null
  };
}

function countBy(items, predicate) {
  return items.reduce((sum, item) => sum + (predicate(item) ? 1 : 0), 0);
}

function topFlagCounts(items, limit = 12) {
  const counts = new Map();
  for (const item of items) {
    for (const flag of item.flags || []) {
      counts.set(flag, (counts.get(flag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))
    .slice(0, limit);
}

function percentage(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function buildLedgerReadiness({ companies, invoices, resolvedInvoices, companyResult, invoiceResult }) {
  const companyCount = companies.length;
  const invoiceCount = invoices.length;
  const reliableInvoices = countBy(resolvedInvoices, (item) => ["HIGH", "MEDIUM"].includes(item.confidence));
  const withCustomerFkOrReliable = countBy(resolvedInvoices, (item) => item.customerFk || ["HIGH", "MEDIUM"].includes(item.confidence));
  const withDueDate = countBy(invoices, (invoice) => Boolean(invoice.dueDate));
  const withAmount = countBy(invoices, (invoice) => Number(invoice.totalAmount) > 0);
  const withVariableSymbol = countBy(invoices, (invoice) => Boolean(invoice.variableSymbol));
  const stableCustomers = countBy(companies, (company) => Boolean(company.ico || company.vistoCompanyId || company.vistoBranchId));
  const confidenceCounts = {
    HIGH: countBy(resolvedInvoices, (item) => item.confidence === "HIGH"),
    MEDIUM: countBy(resolvedInvoices, (item) => item.confidence === "MEDIUM"),
    LOW: countBy(resolvedInvoices, (item) => item.confidence === "LOW"),
    NONE: countBy(resolvedInvoices, (item) => item.confidence === "NONE")
  };
  const blockingReasons = [];

  if (!companyCount) blockingReasons.push("NO_COMPANIES_LOADED");
  if (!invoiceCount) blockingReasons.push("NO_INVOICES_LOADED");
  if (companyResult.page.capped || invoiceResult.page.capped) blockingReasons.push("PREVIEW_SAMPLE_CAPPED_NEEDS_FULL_DRY_RUN");
  if (percentage(withCustomerFkOrReliable, invoiceCount) < 95) blockingReasons.push("INVOICE_CUSTOMER_LINK_RATE_UNDER_95");
  if (percentage(withDueDate, invoiceCount) < 90) blockingReasons.push("INVOICE_DUE_DATE_RATE_UNDER_90");
  if (percentage(withAmount, invoiceCount) < 95) blockingReasons.push("INVOICE_AMOUNT_RATE_UNDER_95");
  if (percentage(withVariableSymbol, invoiceCount) < 90) blockingReasons.push("INVOICE_VARIABLE_SYMBOL_RATE_UNDER_90");
  if (percentage(stableCustomers, companyCount) < 85) blockingReasons.push("CUSTOMER_STABLE_ID_RATE_UNDER_85");

  return {
    scope: "read_only_preview_sample",
    ledgerImportReady: blockingReasons.length === 0,
    blockingReasons,
    recommendedNextStep: blockingReasons.length
      ? "Nejdřív vyřešit blokující datové mezery a spustit úplný dry-run bez zápisu do ostrého ledgeru."
      : "Připravit samostatně potvrzený ostrý import do receivable_customers a receivable_invoices.",
    counts: {
      companiesLoaded: companyCount,
      companiesTotal: companyResult.page.total || companyCount,
      companiesCapped: Boolean(companyResult.page.capped),
      companiesWithIco: countBy(companies, (company) => Boolean(company.ico)),
      companiesWithDic: countBy(companies, (company) => Boolean(company.dic)),
      companiesWithBillingEmail: countBy(companies, (company) => Boolean(company.billingEmail || company.email)),
      companiesWithStandardDueDays: countBy(companies, (company) => company.standardDueDays !== null && company.standardDueDays !== undefined),
      companiesWithStableId: stableCustomers,
      invoicesLoaded: invoiceCount,
      invoicesTotal: invoiceResult.page.total || invoiceCount,
      invoicesCapped: Boolean(invoiceResult.page.capped),
      invoicesWithCustomerFk: countBy(resolvedInvoices, (item) => Boolean(item.customerFk)),
      invoicesWithCustomerBranchFk: countBy(resolvedInvoices, (item) => Boolean(item.customerBranchFk)),
      invoicesWithDueDate: withDueDate,
      invoicesWithVariableSymbol: withVariableSymbol,
      invoicesWithAmount: withAmount,
      invoicesWithPaidAmount: countBy(resolvedInvoices, (item) => !item.flags.includes(RECEIVABLES_LEDGER_FLAGS.MISSING_PAID_AMOUNT)),
      invoicesWithRemainingAmount: countBy(resolvedInvoices, (item) => !item.flags.includes(RECEIVABLES_LEDGER_FLAGS.MISSING_REMAINING_AMOUNT)),
      invoicesLinkedHigh: confidenceCounts.HIGH,
      invoicesLinkedMedium: confidenceCounts.MEDIUM,
      invoicesLinkedLow: confidenceCounts.LOW,
      invoicesWithoutReliableCompany: confidenceCounts.NONE
    },
    rates: {
      invoiceCustomerLinkRate: percentage(withCustomerFkOrReliable, invoiceCount),
      invoiceDueDateRate: percentage(withDueDate, invoiceCount),
      invoiceAmountRate: percentage(withAmount, invoiceCount),
      invoiceVariableSymbolRate: percentage(withVariableSymbol, invoiceCount),
      customerStableIdRate: percentage(stableCustomers, companyCount)
    },
    confidenceCounts,
    topDataQualityFlags: topFlagCounts([...companies, ...resolvedInvoices])
  };
}

function proposedLedgerRows(resolvedInvoices = []) {
  const customerRowsById = new Map();
  const invoiceRows = [];

  for (const item of resolvedInvoices) {
    if (item.company && item.resolvedCompanyId && !customerRowsById.has(item.resolvedCompanyId)) {
      customerRowsById.set(item.resolvedCompanyId, {
        visto_company_id: item.resolvedCompanyId,
        company_name: item.resolvedCustomerName,
        ico: item.resolvedIco,
        dic: item.resolvedDic,
        contact_email: item.resolvedBillingEmail,
        preferred_channel: "email",
        automation_status: "dry_run"
      });
    }
    invoiceRows.push({
      visto_invoice_id: item.invoiceId,
      invoice_number: item.invoiceNumber,
      variable_symbol: item.invoice.variableSymbol,
      customer_external_id: item.resolvedCompanyId,
      issue_date: item.invoice.issueDate,
      due_date: item.invoice.dueDate,
      total_amount: item.invoice.totalAmount,
      paid_amount: item.invoice.paidAmount,
      open_amount: item.invoice.openAmount,
      currency: item.invoice.currency,
      status: item.invoice.status
    });
  }

  return {
    writesD1: false,
    receivableCustomers: [...customerRowsById.values()].slice(0, 30),
    receivableInvoices: invoiceRows.slice(0, 50)
  };
}

export async function createReceivablesLedgerReadinessPreview(env, options = {}) {
  if (!isVistosExecuteConfigured(env)) {
    return {
      apiStatus: "not_configured",
      message: VISTOS_NOT_CONFIGURED_MESSAGE,
      readOnly: true,
      writesD1: false,
      createsReceivableRecords: false,
      sendsCustomerCommunication: false,
      startsAutomation: false,
      calculatesRealRating: false,
      importsKbPayments: false,
      companies: [],
      invoices: [],
      resolvedInvoices: [],
      problematicCompanies: [],
      problematicInvoices: [],
      ledgerReadiness: {
        ledgerImportReady: false,
        blockingReasons: ["VISTOS_NOT_CONFIGURED"],
        recommendedNextStep: "Nastavit Vistos API secrets a znovu spustit read-only preview."
      },
      companyEnrichment: {
        enabled: false,
        matchedCompanies: 0,
        loadedRows: 0
      },
      diagnostics: { configured: false, companyAttempts: [], invoiceAttempts: [] }
    };
  }

  const session = await loginVistosExecute(env);
  const [companyResult, invoiceResult] = await Promise.all([
    loadFirstWorkingEntity(env, session, RECEIVABLES_COMPANY_ATTEMPTS, options),
    loadFirstWorkingEntity(env, session, RECEIVABLES_INVOICE_ATTEMPTS, options)
  ]);
  const enrichmentResult = await loadFirstWorkingEntity(
    env,
    session,
    RECEIVABLES_COMPANY_ENRICHMENT_ATTEMPTS,
    options
  );
  const baseCompanies = companyResult.page.rows.map((row) => mapReceivablesLedgerCompany(row, companyResult.entityName));
  const enrichmentCompanies = enrichmentResult.page.rows.map((row) => mapReceivablesLedgerCompany(row, enrichmentResult.entityName));
  const enrichment = mergeCompanyEnrichment(baseCompanies, enrichmentCompanies);
  const companies = enrichment.companies;
  const invoices = invoiceResult.page.rows.map(mapReceivablesVistosInvoice);
  const companyIndexes = buildCompanyIndexes(companies);
  const resolvedInvoices = invoices.map((invoice) => resolveInvoiceCustomer(invoice, companies, companyIndexes));
  const ledgerReadiness = buildLedgerReadiness({ companies, invoices, resolvedInvoices, companyResult, invoiceResult });

  return {
    apiStatus: "ready",
    message: "Firmy → Ledger read-only preview načteno. Ostrý ledger, rating, KB platby a komunikace zůstaly beze změny.",
    readOnly: true,
    writesD1: false,
    createsReceivableRecords: false,
    sendsCustomerCommunication: false,
    startsAutomation: false,
    calculatesRealRating: false,
    importsKbPayments: false,
    companies,
    invoices,
    resolvedInvoices,
    problematicCompanies: companies.filter((company) => company.flags.length).slice(0, 80),
    problematicInvoices: resolvedInvoices.filter((item) => item.flags.length || item.confidence !== "HIGH").slice(0, 120),
    proposedLedgerRows: proposedLedgerRows(resolvedInvoices),
    ledgerReadiness,
    companyEnrichment: {
      enabled: true,
      entityName: enrichmentResult.entityName,
      attemptKey: enrichmentResult.key,
      loadedRows: enrichmentCompanies.length,
      totalRows: enrichmentResult.page.total || enrichmentCompanies.length,
      capped: Boolean(enrichmentResult.page.capped),
      matchedCompanies: enrichment.matchedCompanies,
      companiesWithDicAfterEnrichment: countBy(companies, (company) => Boolean(company.dic)),
      companiesWithBillingEmailAfterEnrichment: countBy(companies, (company) => Boolean(company.billingEmail || company.email)),
      companiesWithStandardDueDaysAfterEnrichment: countBy(companies, (company) => company.standardDueDays !== null && company.standardDueDays !== undefined)
    },
    diagnostics: {
      configured: true,
      companyEntity: companyResult.entityName,
      companyAttemptKey: companyResult.key,
      companyColumns: companyResult.columns,
      companyKeys: sampleKeys(companyResult.page.rows),
      companyAttempts: companyResult.diagnostics,
      companyEnrichmentEntity: enrichmentResult.entityName,
      companyEnrichmentAttemptKey: enrichmentResult.key,
      companyEnrichmentColumns: enrichmentResult.columns,
      companyEnrichmentKeys: sampleKeys(enrichmentResult.page.rows),
      companyEnrichmentAttempts: enrichmentResult.diagnostics,
      invoiceEntity: invoiceResult.entityName,
      invoiceAttemptKey: invoiceResult.key,
      invoiceColumns: invoiceResult.columns,
      invoiceKeys: sampleKeys(invoiceResult.page.rows),
      invoiceAttempts: invoiceResult.diagnostics
    },
    previewLimits: {
      defaultPageSize: DEFAULT_PAGE_SIZE,
      defaultMaxPages: DEFAULT_MAX_PAGES,
      maxPageSize: MAX_PAGE_SIZE,
      maxPages: MAX_PAGES
    },
    loadedAt: new Date().toISOString()
  };
}

export function receivablesLedgerReadinessError(error) {
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

  return {
    status: 500,
    payload: {
      error: "Firmy → Ledger read-only preview se teď nepodařilo spustit.",
      detail: clean(error?.message).slice(0, 240) || "Neznámá chyba backendu.",
      apiStatus: "waiting"
    }
  };
}
