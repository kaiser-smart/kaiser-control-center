import {
  VistosExecuteError,
  cleanVistosValue,
  getAllVistosPages,
  getVistosById,
  isVistosExecuteConfigured,
  loginVistosExecute
} from "./vistos-execute-client.js";
import {
  mapReceivablesVistosInvoice,
  receivablesVistosInvoiceLookbackWindow
} from "./receivables-vistos-preview.js";
import { createReceivablesVistosSchemaProbeFromSession } from "./receivables-vistos-schema-probe.js";

const VISTOS_NOT_CONFIGURED_MESSAGE = "Vistos API není nakonfigurováno";
const DEFAULT_PAGE_SIZE = 250;
const DEFAULT_MAX_PAGES = 1;
const FULL_DRY_RUN_PAGE_SIZE = 1000;
const FULL_DRY_RUN_MAX_PAGES = 5;
const MAX_PAGE_SIZE = 1000;
const MAX_PAGES = 5;
const DEFAULT_DETAIL_ID_LIMIT = 4;
const MAX_DETAIL_ID_LIMIT = 12;
const LEDGER_READINESS_RUN_MODE_QUICK = "quick";
const LEDGER_READINESS_RUN_MODE_FULL = "full_dry_run";

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
  },
  {
    key: "customer_enrichment",
    entityName: "Customer",
    columns: ["Id", "Name", "RegNumber", "VATNumber", "Email", "InvoiceEmail", "BillingEmail", "Phone", "InvoiceDueDays", "Status_FK"]
  },
  {
    key: "customer_branch_enrichment",
    entityName: "CustomerBranch",
    columns: ["Id", "Name", "Parent_FK", "RegNumber", "VATNumber", "Email", "InvoiceEmail", "BillingEmail", "Phone", "InvoiceDueDays", "Status_FK"]
  },
  {
    key: "company_enrichment",
    entityName: "Company",
    columns: ["Id", "Name", "Caption", "ICO", "DIC", "RegNumber", "VATNumber", "Email", "InvoiceEmail", "BillingEmail", "Phone", "InvoiceDueDays"]
  },
  {
    key: "directory_enrichment",
    entityName: "Directory",
    columns: ["Id", "Name", "Caption", "ICO", "DIC", "RegNumber", "VATNumber", "Email", "InvoiceEmail", "BillingEmail", "Phone", "InvoiceDueDays"]
  },
  {
    key: "partner_enrichment",
    entityName: "Partner",
    columns: ["Id", "Name", "RegNumber", "VATNumber", "Email", "InvoiceEmail", "BillingEmail", "Phone", "InvoiceDueDays"]
  },
  {
    key: "address_book_enrichment",
    entityName: "AddressBook",
    columns: ["Id", "Name", "RegNumber", "VATNumber", "Email", "InvoiceEmail", "BillingEmail", "Phone", "InvoiceDueDays"]
  }
];

const DIRECTORY_DETAIL_COLUMNS = [
  "Id",
  "Name",
  "Caption",
  "FirstName",
  "LastName",
  "MiddleName",
  "RegNumber",
  "VATNumber",
  "ICO",
  "DIC",
  "Email",
  "Email1",
  "EmailInvoicing",
  "InvoiceEmail",
  "BillingEmail",
  "Phone",
  "PhoneNumber",
  "Mobile",
  "Parent_FK",
  "MasterParent_FK",
  "MainProjection_FK",
  "IsCompany",
  "InvoiceDueDays",
  "StandardDueDays",
  "BillingAddressStreet",
  "BillingAddressCity",
  "BillingAddressPostalCode",
  "Street",
  "City",
  "Zip",
  "Status_FK"
];

const RECEIVABLES_COMPANY_DETAIL_ATTEMPTS = [
  {
    key: "directory_with_branch_detail_czech",
    entityName: "DirectoryWithBranch",
    columns: [...new Set([...DIRECTORY_WITH_BRANCH_CZECH_COLUMNS, ...DIRECTORY_WITH_BRANCH_CORE_COLUMNS, "EmailInvoicing"])]
  },
  {
    key: "directory_with_branch_detail_extended",
    entityName: "DirectoryWithBranch",
    columns: [...new Set([...DIRECTORY_WITH_BRANCH_EXTENDED_COLUMNS, ...DIRECTORY_WITH_BRANCH_CZECH_COLUMNS, "EmailInvoicing"])]
  },
  {
    key: "directory_detail",
    entityName: "Directory",
    columns: DIRECTORY_DETAIL_COLUMNS
  },
  {
    key: "customer_detail",
    entityName: "Customer",
    columns: ["Id", "Name", "Caption", "RegNumber", "VATNumber", "ICO", "DIC", "Email", "Email1", "EmailInvoicing", "InvoiceEmail", "BillingEmail", "Phone", "PhoneNumber", "InvoiceDueDays", "StandardDueDays", "Status_FK"]
  },
  {
    key: "customer_branch_detail",
    entityName: "CustomerBranch",
    columns: ["Id", "Name", "Caption", "Parent_FK", "RegNumber", "VATNumber", "ICO", "DIC", "Email", "Email1", "EmailInvoicing", "InvoiceEmail", "BillingEmail", "Phone", "InvoiceDueDays", "StandardDueDays", "Status_FK"]
  },
  {
    key: "company_detail",
    entityName: "Company",
    columns: ["Id", "Name", "Caption", "RegNumber", "VATNumber", "ICO", "DIC", "Email", "Email1", "EmailInvoicing", "InvoiceEmail", "BillingEmail", "Phone", "InvoiceDueDays", "StandardDueDays", "Status_FK"]
  },
  {
    key: "address_book_detail",
    entityName: "AddressBook",
    columns: ["Id", "Name", "Caption", "RegNumber", "VATNumber", "ICO", "DIC", "Email", "Email1", "EmailInvoicing", "InvoiceEmail", "BillingEmail", "Phone", "InvoiceDueDays", "StandardDueDays", "Status_FK"]
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

const RECEIVABLES_INVOICE_ATTEMPTS = [
  { key: "kaiser_invoice_columns", entityName: "InvoiceIssued", columns: INVOICE_COLUMNS },
  { key: "kaiser_invoice_columns", entityName: "Document", columns: INVOICE_COLUMNS },
  { key: "kaiser_invoice_columns", entityName: "Invoice", columns: INVOICE_COLUMNS },
  { key: "kaiser_invoice_columns", entityName: "IssuedInvoice", columns: INVOICE_COLUMNS }
];

const METADATA_COMPANY_ENTITY_ATTEMPTS = [
  {
    key: "metadata_directory_with_branch",
    entityName: "DirectoryWithBranch",
    columns: [
      "Id",
      "Name",
      "Caption",
      "Parent_FK",
      "RegNumber",
      "VATNumber",
      "EmailInvoicing",
      "InvoiceEmail",
      "BillingEmail",
      "Email",
      "Phone",
      "PhoneNumber",
      "Mobile",
      "InvoiceDueDays",
      "StandardDueDays",
      "Status_FK"
    ]
  },
  {
    key: "metadata_directory",
    entityName: "Directory",
    columns: [
      "Id",
      "Name",
      "Caption",
      "Parent_FK",
      "RegNumber",
      "VATNumber",
      "ICO",
      "DIC",
      "EmailInvoicing",
      "InvoiceEmail",
      "BillingEmail",
      "Email",
      "Phone",
      "PhoneNumber",
      "Mobile",
      "InvoiceDueDays",
      "StandardDueDays",
      "Status_FK"
    ]
  },
  {
    key: "metadata_company",
    entityName: "Company",
    columns: [
      "Id",
      "Name",
      "Caption",
      "RegNumber",
      "VATNumber",
      "ICO",
      "DIC",
      "EmailInvoicing",
      "InvoiceEmail",
      "BillingEmail",
      "Email",
      "Phone",
      "PhoneNumber",
      "Mobile",
      "InvoiceDueDays",
      "StandardDueDays",
      "Status_FK"
    ]
  }
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

function uniqueValues(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const cleaned = clean(value);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function schemaSummaryForEntity(schemaProbe, entityName) {
  return (schemaProbe?.entitySummaries || []).find((item) => item.entityName === entityName) || null;
}

function schemaCandidateColumns(summary) {
  const candidates = summary?.candidates || {};
  return uniqueValues([
    ...(candidates.stableId || []),
    ...(candidates.companyName || []),
    ...(candidates.branchName || []),
    ...(candidates.parent || []),
    ...(candidates.ico || []),
    ...(candidates.dic || []),
    ...(candidates.billingEmail || []),
    ...(candidates.email || []),
    ...(candidates.phone || []),
    ...(candidates.standardDueDays || [])
  ]);
}

function knownSchemaFieldNames(summary) {
  return new Set((summary?.fields || [])
    .map((field) => clean(field?.name || field?.caption))
    .filter(Boolean)
    .map((field) => field.toLowerCase()));
}

function metadataAttemptColumns(summary, fallbackColumns = []) {
  if (!summary?.schemaOk && !summary?.dbColumnOk) return [];
  const knownNames = knownSchemaFieldNames(summary);
  const candidateColumns = schemaCandidateColumns(summary);
  const knownFallbackColumns = fallbackColumns.filter((column) => {
    if (!knownNames.size) return false;
    return knownNames.has(clean(column).toLowerCase());
  });
  const metadataColumns = uniqueValues([
    ...candidateColumns,
    ...knownFallbackColumns
  ]);
  if (!metadataColumns.length) return [];
  return uniqueValues([
    ...metadataColumns,
    "Id",
    "Name",
    "Caption"
  ]).slice(0, 36);
}

function buildMetadataCompanyAttempts(schemaProbe) {
  if (schemaProbe?.apiStatus !== "ready") return [];
  return METADATA_COMPANY_ENTITY_ATTEMPTS
    .map((attempt) => {
      const summary = schemaSummaryForEntity(schemaProbe, attempt.entityName);
      const columns = metadataAttemptColumns(summary, attempt.columns);
      if (!columns.length) return null;
      return {
        key: attempt.key,
        entityName: attempt.entityName,
        columns
      };
    })
    .filter(Boolean);
}

function emptyWorkingResult() {
  return {
    key: "",
    entityName: "",
    columns: [],
    page: { rows: [], total: 0, filtered: 0, capped: false },
    diagnostics: []
  };
}

function metadataProbeFailure(error) {
  return {
    apiStatus: "waiting",
    message: "Vistos metadata probe se nepodařilo načíst v rámci ledger preview. Ledger preview pokračuje jen se statickými read-only pokusy.",
    error: clean(error?.message).slice(0, 240) || "Neznámá chyba metadata probe.",
    readOnly: true,
    writesD1: false,
    createsReceivableRecords: false,
    sendsCustomerCommunication: false,
    startsAutomation: false,
    calculatesRealRating: false,
    importsKbPayments: false,
    createsLegalPackages: false,
    entitySummaries: [],
    summary: {},
    readiness: {
      metadataProbeUsable: false,
      blockingReasons: ["METADATA_PROBE_FAILED"],
      recommendedNextStep: "Nejdřív ověřit schema/metadata probe samostatně, potom znovu spustit ledger preview."
    }
  };
}

async function loadLedgerMetadataProbe(env, session, options = {}) {
  try {
    return await createReceivablesVistosSchemaProbeFromSession(env, session, {
      pageSize: Math.min(Number(options.metadataPageSize) || 200, 500),
      maxPages: 1,
      maxColumnsPerEntity: Math.min(Number(options.maxColumnsPerEntity) || 120, 180)
    });
  } catch (error) {
    return metadataProbeFailure(error);
  }
}

function metadataEntityCandidateSummary(schemaProbe, entityName) {
  const summary = schemaSummaryForEntity(schemaProbe, entityName);
  const candidates = summary?.candidates || {};
  return {
    entityName,
    schemaOk: Boolean(summary?.schemaOk),
    dbColumnOk: Boolean(summary?.dbColumnOk),
    dbObjectId: summary?.dbObjectId || "",
    ico: candidates.ico || [],
    dic: candidates.dic || [],
    billingEmail: candidates.billingEmail || [],
    email: candidates.email || [],
    phone: candidates.phone || [],
    standardDueDays: candidates.standardDueDays || [],
    parent: candidates.parent || [],
    blocking: summary?.blocking || []
  };
}

function buildMetadataResolverSummary(schemaProbe, metadataAttempts, metadataResult, metadataEnrichment) {
  return {
    enabled: schemaProbe?.apiStatus === "ready",
    metadataProbeUsable: Boolean(schemaProbe?.readiness?.metadataProbeUsable),
    schemaEntitiesOk: schemaProbe?.summary?.entitiesWithSchema || 0,
    dbObjectsLoaded: schemaProbe?.summary?.dbObjectsLoaded || 0,
    matchedDbObjects: schemaProbe?.summary?.matchedObjects || 0,
    generatedCompanyAttempts: metadataAttempts.length,
    entityName: metadataResult?.entityName || "",
    attemptKey: metadataResult?.key || "",
    loadedRows: metadataResult?.page?.rows?.length || 0,
    totalRows: metadataResult?.page?.total || metadataResult?.page?.rows?.length || 0,
    capped: Boolean(metadataResult?.page?.capped),
    matchedCompanies: metadataEnrichment?.matchedCompanies || 0,
    candidateEntities: ["DirectoryWithBranch", "Directory", "Company"].map((entityName) => (
      metadataEntityCandidateSummary(schemaProbe, entityName)
    )),
    blockingReasons: schemaProbe?.readiness?.blockingReasons || [],
    recommendedNextStep: schemaProbe?.readiness?.recommendedNextStep || ""
  };
}

function dbObjectMatch(schemaProbe, entityName) {
  return (schemaProbe?.dbObjectProbe?.matchedObjects || []).find((item) => item.entityName === entityName) || null;
}

function buildContactMetadataSummary(schemaProbe) {
  const contactList = schemaSummaryForEntity(schemaProbe, "ContactList");
  const contactListRow = schemaSummaryForEntity(schemaProbe, "ContactListRow");
  const contact = schemaSummaryForEntity(schemaProbe, "Contact");
  const contactListObject = dbObjectMatch(schemaProbe, "ContactList");
  const contactListRowObject = dbObjectMatch(schemaProbe, "ContactListRow");
  const rowCandidates = contactListRow?.candidates || {};
  return {
    enabled: schemaProbe?.apiStatus === "ready",
    contactSchemaOk: Boolean(contact?.schemaOk),
    contactListSchemaOk: Boolean(contactList?.schemaOk),
    contactListRowSchemaOk: Boolean(contactListRow?.schemaOk),
    contactListDbObjectId: contactListObject?.dbObjectId || contactList?.dbObjectId || "",
    contactListRowDbObjectId: contactListRowObject?.dbObjectId || contactListRow?.dbObjectId || "",
    emailCandidates: rowCandidates.email || [],
    companyLinkCandidates: rowCandidates.parent || [],
    canUseForCustomerCommunication: false,
    reason: "Pouze metadata. Není potvrzená ostrá vazba kontakt → zákazník/pobočka ani souhlas pro zákaznickou komunikaci."
  };
}

function addFlag(flags, code) {
  if (code && !flags.includes(code)) {
    flags.push(code);
  }
}

function boundedPositiveInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(number), max));
}

function normalizeLedgerReadinessOptions(options = {}) {
  const runMode = String(options.runMode || "").trim() === LEDGER_READINESS_RUN_MODE_FULL
    ? LEDGER_READINESS_RUN_MODE_FULL
    : LEDGER_READINESS_RUN_MODE_QUICK;
  const fallbackPageSize = runMode === LEDGER_READINESS_RUN_MODE_FULL
    ? FULL_DRY_RUN_PAGE_SIZE
    : DEFAULT_PAGE_SIZE;
  const fallbackMaxPages = runMode === LEDGER_READINESS_RUN_MODE_FULL
    ? FULL_DRY_RUN_MAX_PAGES
    : DEFAULT_MAX_PAGES;

  return {
    ...options,
    runMode,
    pageSize: boundedPositiveInteger(options.pageSize, fallbackPageSize, MAX_PAGE_SIZE),
    maxPages: boundedPositiveInteger(options.maxPages, fallbackMaxPages, MAX_PAGES)
  };
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
  const filter = options.filter && typeof options.filter === "object" ? options.filter : null;

  for (const attempt of attempts) {
    const entityName = attempt.entityName;
    const columns = attempt.columns;
    try {
      const page = await getAllVistosPages(env, session, entityName, columns, filter, {
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
        capped: Boolean(page.capped),
        filter
      });
      if (page.rows.length > 0) {
        return { key: attempt.key, entityName, columns, filter, page, diagnostics };
      }
      if (!firstEmptyResult) {
        firstEmptyResult = { key: attempt.key, entityName, columns, filter, page };
      }
    } catch (error) {
      diagnostics.push({
        key: attempt.key,
        entityName,
        columns,
        filter,
        ok: false,
        code: clean(error?.code),
        message: clean(error?.message).slice(0, 180)
      });
    }
  }

  return {
    ...(firstEmptyResult || { key: "", entityName: "", columns: [], filter, page: { rows: [], total: 0, filtered: 0, capped: false } }),
    diagnostics
  };
}

function companyHasUsefulMasterData(company = {}) {
  return Boolean(
    company.ico ||
    company.dic ||
    company.billingEmail ||
    company.email ||
    company.standardDueDays !== null && company.standardDueDays !== undefined
  );
}

function addDetailIdentifier(items, seen, id, source) {
  const value = clean(id);
  if (!value || seen.has(value)) return;
  seen.add(value);
  items.push({ id: value, source });
}

function collectCompanyDetailIdentifiers(baseCompanies = [], invoices = [], options = {}) {
  const limit = Math.max(1, Math.min(Number(options.maxDetailIds) || DEFAULT_DETAIL_ID_LIMIT, MAX_DETAIL_ID_LIMIT));
  const identifiers = [];
  const seen = new Set();
  const companySample = baseCompanies.slice(0, Math.max(limit * 3, 12));
  const invoiceSample = invoices.slice(0, Math.max(limit * 3, 12));

  for (const company of companySample) {
    addDetailIdentifier(identifiers, seen, company.vistoBranchId, "company_visto_branch_id");
    addDetailIdentifier(identifiers, seen, company.vistoCompanyId, "company_visto_company_id");
    addDetailIdentifier(identifiers, seen, recordId(company.raw || {}, "DirectoryBranch_FK"), "contract_directory_branch_fk");
    addDetailIdentifier(identifiers, seen, recordId(company.raw || {}, "Directory_FK"), "contract_directory_fk");
    addDetailIdentifier(identifiers, seen, recordId(company.raw || {}, "Sidlo_FK"), "contract_sidlo_fk");
    if (identifiers.length >= limit) break;
  }

  for (const invoice of invoiceSample) {
    if (identifiers.length >= limit) break;
    addDetailIdentifier(identifiers, seen, invoice.customerBranchId, "invoice_customer_branch_id");
    addDetailIdentifier(identifiers, seen, invoice.customerCompanyId, "invoice_customer_company_id");
    addDetailIdentifier(identifiers, seen, invoice.customerId, "invoice_customer_id");
    addDetailIdentifier(identifiers, seen, recordId(invoice.raw || {}, "CustomerBranch_FK"), "invoice_customer_branch_fk");
    addDetailIdentifier(identifiers, seen, recordId(invoice.raw || {}, "Customer_FK"), "invoice_customer_fk");
  }

  return identifiers.slice(0, limit);
}

async function loadCompanyDetailProbe(env, session, identifiers = [], options = {}) {
  const sampledIdentifiers = identifiers.slice(0, Math.max(1, Math.min(Number(options.maxDetailIds) || DEFAULT_DETAIL_ID_LIMIT, MAX_DETAIL_ID_LIMIT)));
  const diagnostics = [];
  const companies = [];
  const rawRows = [];

  if (!sampledIdentifiers.length) {
    return {
      enabled: true,
      sampledIdentifiers: [],
      companies,
      rawRows,
      diagnostics,
      bestEntity: "",
      successfulRows: 0,
      usefulRows: 0
    };
  }

  for (const attempt of RECEIVABLES_COMPANY_DETAIL_ATTEMPTS) {
    let returnedRows = 0;
    let usefulRows = 0;
    const matchedIds = [];
    const errorCounts = new Map();

    for (const identifier of sampledIdentifiers) {
      try {
        const detail = await getVistosById(env, session, attempt.entityName, identifier.id, attempt.columns);
        const row = detail.row && typeof detail.row === "object" && !Array.isArray(detail.row)
          ? detail.row
          : {};
        const keys = Object.keys(row);
        if (!keys.length) {
          continue;
        }

        const rowWithId = {
          ...row,
          Id: firstValue(row, ["Id", "Systémové ID"]) || identifier.id
        };
        const company = mapReceivablesLedgerCompany(rowWithId, attempt.entityName);
        returnedRows += 1;
        rawRows.push(rowWithId);
        matchedIds.push({
          id: identifier.id,
          source: identifier.source,
          keyCount: keys.length,
          hasUsefulMasterData: companyHasUsefulMasterData(company)
        });

        if (companyHasUsefulMasterData(company)) {
          usefulRows += 1;
        }

        companies.push({
          ...company,
          detailProbeAttemptKey: attempt.key,
          detailProbeSourceId: identifier.id,
          detailProbeSource: identifier.source
        });
      } catch (error) {
        const code = clean(error?.code) || "detail_probe_failed";
        errorCounts.set(code, (errorCounts.get(code) || 0) + 1);
      }
    }

    diagnostics.push({
      key: attempt.key,
      entityName: attempt.entityName,
      columns: attempt.columns,
      attemptedIds: sampledIdentifiers.length,
      returnedRows,
      usefulRows,
      ok: returnedRows > 0 || errorCounts.size === 0,
      matchedIds: matchedIds.slice(0, 8),
      errors: [...errorCounts.entries()].map(([code, count]) => ({ code, count }))
    });
  }

  const best = diagnostics
    .slice()
    .sort((left, right) => (right.usefulRows - left.usefulRows) || (right.returnedRows - left.returnedRows))[0] || null;

  return {
    enabled: true,
    sampledIdentifiers,
    companies,
    rawRows,
    diagnostics,
    bestEntity: best?.usefulRows || best?.returnedRows ? best.entityName : "",
    bestAttemptKey: best?.usefulRows || best?.returnedRows ? best.key : "",
    successfulRows: diagnostics.reduce((sum, item) => sum + item.returnedRows, 0),
    usefulRows: diagnostics.reduce((sum, item) => sum + item.usefulRows, 0)
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
    "EmailInvoicing",
    "FakturacniEmail",
    "Fakturacni_e_mail",
    "Fakturační e-mail",
    "E-mail fakturace"
  ]);
  const email = firstValue(row, ["Email", "Email1", "E-mail", "ContactEmail"]);
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
    phone: firstValue(row, ["Phone", "PhoneNumber", "Telefon", "Mobile"]),
    standardDueDays,
    billingAddress,
    deliveryAddress: billingAddress,
    activeStatus: caption(row, "Status_FK") || firstValue(row, ["Status", "Stav"]),
    createdAtVistos: firstValue(row, ["Created", "CreatedAt", "CreatedDate", "Vytvořeno"]),
    updatedAtVistos: firstValue(row, ["Modified", "UpdatedAt", "ModifiedDate", "Změněno"]),
    isBranch: Boolean(parentId && parentId !== branchId),
    flags: [],
    rawPayload: row,
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
        enrichmentMatched: Boolean(company.enrichmentMatched)
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
      createdAtVistos: mergeCompanyValue(company, enrichment, ["createdAtVistos"]),
      updatedAtVistos: mergeCompanyValue(company, enrichment, ["updatedAtVistos"]),
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
      status: item.invoice.status,
      payment_status: item.invoice.paymentStatus,
      pdf_url: item.invoice.pdfUrl,
      print_url: item.invoice.printUrl,
      attachment_url: item.invoice.attachmentUrl
    });
  }

  return {
    writesD1: false,
    receivableCustomers: [...customerRowsById.values()].slice(0, 30),
    receivableInvoices: invoiceRows.slice(0, 50)
  };
}

function annotateCompaniesWithInvoiceCounts(companies = [], resolvedInvoices = []) {
  const countsByCompany = new Map();
  const countsByBranch = new Map();

  for (const item of resolvedInvoices) {
    const companyId = clean(item.resolvedCompanyId);
    const branchId = clean(item.resolvedBranchId);
    if (companyId) countsByCompany.set(companyId, (countsByCompany.get(companyId) || 0) + 1);
    if (branchId) countsByBranch.set(branchId, (countsByBranch.get(branchId) || 0) + 1);
  }

  return companies.map((company) => {
    const invoiceCount = (company.vistoBranchId && countsByBranch.get(company.vistoBranchId))
      || (company.vistoCompanyId && countsByCompany.get(company.vistoCompanyId))
      || 0;
    return {
      ...company,
      invoiceCount
    };
  });
}

export async function createReceivablesLedgerReadinessPreview(env, options = {}) {
  const normalizedOptions = normalizeLedgerReadinessOptions(options);

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
      companyDetailProbe: {
        enabled: false,
        sampledIdentifiers: [],
        successfulRows: 0,
        usefulRows: 0
      },
      metadataResolver: {
        enabled: false,
        metadataProbeUsable: false,
        generatedCompanyAttempts: 0,
        loadedRows: 0,
        matchedCompanies: 0,
        blockingReasons: ["VISTOS_NOT_CONFIGURED"]
      },
      contactMetadata: {
        enabled: false,
        canUseForCustomerCommunication: false,
        reason: "Vistos API není nakonfigurováno."
      },
      diagnostics: {
        configured: false,
        runMode: normalizedOptions.runMode,
        companyAttempts: [],
        invoiceAttempts: [],
        invoiceLookback: receivablesVistosInvoiceLookbackWindow(normalizedOptions)
      },
      previewLimits: {
        runMode: normalizedOptions.runMode,
        effectivePageSize: normalizedOptions.pageSize,
        effectiveMaxPages: normalizedOptions.maxPages,
        defaultPageSize: DEFAULT_PAGE_SIZE,
        defaultMaxPages: DEFAULT_MAX_PAGES,
        fullDryRunPageSize: FULL_DRY_RUN_PAGE_SIZE,
        fullDryRunMaxPages: FULL_DRY_RUN_MAX_PAGES,
        maxPageSize: MAX_PAGE_SIZE,
        maxPages: MAX_PAGES
      }
    };
  }

  const session = await loginVistosExecute(env);
  const invoiceLookback = receivablesVistosInvoiceLookbackWindow({
    months: normalizedOptions.invoiceLookbackMonths ?? env?.VISTOS_RECEIVABLES_INVOICE_LOOKBACK_MONTHS,
    now: normalizedOptions.now
  });
  const metadataProbePromise = loadLedgerMetadataProbe(env, session, normalizedOptions);
  const [companyResult, invoiceResult] = await Promise.all([
    loadFirstWorkingEntity(env, session, RECEIVABLES_COMPANY_ATTEMPTS, normalizedOptions),
    loadFirstWorkingEntity(env, session, RECEIVABLES_INVOICE_ATTEMPTS, {
      ...normalizedOptions,
      filter: invoiceLookback.filter
    })
  ]);
  const schemaProbe = await metadataProbePromise;
  const metadataCompanyAttempts = buildMetadataCompanyAttempts(schemaProbe);
  const enrichmentResult = await loadFirstWorkingEntity(
    env,
    session,
    RECEIVABLES_COMPANY_ENRICHMENT_ATTEMPTS,
    normalizedOptions
  );
  const metadataResult = metadataCompanyAttempts.length
    ? await loadFirstWorkingEntity(env, session, metadataCompanyAttempts, normalizedOptions)
    : emptyWorkingResult();
  const baseCompanies = companyResult.page.rows.map((row) => mapReceivablesLedgerCompany(row, companyResult.entityName));
  const invoices = invoiceResult.page.rows.map(mapReceivablesVistosInvoice);
  const enrichmentCompanies = enrichmentResult.page.rows.map((row) => mapReceivablesLedgerCompany(row, enrichmentResult.entityName));
  const metadataCompanies = metadataResult.page.rows.map((row) => mapReceivablesLedgerCompany(row, metadataResult.entityName));
  const pageEnrichment = mergeCompanyEnrichment(baseCompanies, enrichmentCompanies);
  const metadataEnrichment = mergeCompanyEnrichment(pageEnrichment.companies, metadataCompanies);
  const detailProbe = await loadCompanyDetailProbe(
    env,
    session,
    collectCompanyDetailIdentifiers(metadataEnrichment.companies, invoices, normalizedOptions),
    normalizedOptions
  );
  const detailEnrichment = mergeCompanyEnrichment(metadataEnrichment.companies, detailProbe.companies);
  const companies = detailEnrichment.companies;
  const companyIndexes = buildCompanyIndexes(companies);
  const resolvedInvoices = invoices.map((invoice) => resolveInvoiceCustomer(invoice, companies, companyIndexes));
  const companiesWithInvoiceCounts = annotateCompaniesWithInvoiceCounts(companies, resolvedInvoices);
  const ledgerReadiness = buildLedgerReadiness({ companies: companiesWithInvoiceCounts, invoices, resolvedInvoices, companyResult, invoiceResult });
  const metadataResolver = buildMetadataResolverSummary(
    schemaProbe,
    metadataCompanyAttempts,
    metadataResult,
    metadataEnrichment
  );
  const contactMetadata = buildContactMetadataSummary(schemaProbe);

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
    companies: companiesWithInvoiceCounts,
    invoices,
    resolvedInvoices,
    problematicCompanies: companiesWithInvoiceCounts.filter((company) => company.flags.length).slice(0, 80),
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
      matchedCompanies: countBy(companies, (company) => Boolean(company.enrichmentMatched)),
      pageMatchedCompanies: pageEnrichment.matchedCompanies,
      metadataMatchedCompanies: metadataEnrichment.matchedCompanies,
      metadataLoadedRows: metadataCompanies.length,
      detailMatchedCompanies: detailEnrichment.matchedCompanies,
      companiesWithDicAfterEnrichment: countBy(companiesWithInvoiceCounts, (company) => Boolean(company.dic)),
      companiesWithBillingEmailAfterEnrichment: countBy(companiesWithInvoiceCounts, (company) => Boolean(company.billingEmail || company.email)),
      companiesWithStandardDueDaysAfterEnrichment: countBy(companiesWithInvoiceCounts, (company) => company.standardDueDays !== null && company.standardDueDays !== undefined)
    },
    metadataResolver,
    contactMetadata,
    companyDetailProbe: {
      enabled: true,
      sampledIdentifiers: detailProbe.sampledIdentifiers,
      bestEntity: detailProbe.bestEntity,
      bestAttemptKey: detailProbe.bestAttemptKey,
      successfulRows: detailProbe.successfulRows,
      usefulRows: detailProbe.usefulRows,
      loadedRows: detailProbe.companies.length,
      matchedCompanies: detailEnrichment.matchedCompanies
    },
    diagnostics: {
      configured: true,
      runMode: normalizedOptions.runMode,
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
      metadataSchemaStatus: schemaProbe.apiStatus,
      metadataSchemaEntitiesOk: schemaProbe.summary?.entitiesWithSchema || 0,
      metadataCompanyEntity: metadataResult.entityName,
      metadataCompanyAttemptKey: metadataResult.key,
      metadataCompanyColumns: metadataResult.columns,
      metadataCompanyKeys: sampleKeys(metadataResult.page.rows),
      metadataCompanyAttempts: metadataResult.diagnostics,
      metadataCompanyGeneratedAttempts: metadataCompanyAttempts,
      metadataBlockingReasons: schemaProbe.readiness?.blockingReasons || [],
      companyDetailIdentifiers: detailProbe.sampledIdentifiers,
      companyDetailBestEntity: detailProbe.bestEntity,
      companyDetailBestAttemptKey: detailProbe.bestAttemptKey,
      companyDetailKeys: sampleKeys(detailProbe.rawRows),
      companyDetailAttempts: detailProbe.diagnostics,
      invoiceEntity: invoiceResult.entityName,
      invoiceAttemptKey: invoiceResult.key,
      invoiceColumns: invoiceResult.columns,
      invoiceFilter: invoiceResult.filter || invoiceLookback.filter,
      invoiceLookback,
      invoiceKeys: sampleKeys(invoiceResult.page.rows),
      invoiceAttempts: invoiceResult.diagnostics
    },
    previewLimits: {
      runMode: normalizedOptions.runMode,
      effectivePageSize: normalizedOptions.pageSize,
      effectiveMaxPages: normalizedOptions.maxPages,
      defaultPageSize: DEFAULT_PAGE_SIZE,
      defaultMaxPages: DEFAULT_MAX_PAGES,
      fullDryRunPageSize: FULL_DRY_RUN_PAGE_SIZE,
      fullDryRunMaxPages: FULL_DRY_RUN_MAX_PAGES,
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
