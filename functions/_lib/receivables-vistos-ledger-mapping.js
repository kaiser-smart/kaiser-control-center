import {
  getVistosPage,
  getVistosSchemaEntity,
  isVistosExecuteConfigured,
  loginVistosExecute
} from "./vistos-execute-client.js";

const DB_BINDING = "SMART_ODPADY_DB";
const SNAPSHOT_IMPORT_KIND = "vistos_invoice_snapshot";
const SNAPSHOT_SOURCE = "vistos";
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 250;
const DEFAULT_CUSTOMER_LIMIT = 25;
const MAX_CUSTOMER_LIMIT = 80;
const DEFAULT_LINK_PROBE_LIMIT = 5;
const MAX_LINK_PROBE_LIMIT = 12;
const ROW_PAGE_SIZE = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CUSTOMER_COLUMNS = [
  "Id",
  "Name",
  "RegNumber",
  "VATNumber",
  "EmailInvoicing",
  "Email",
  "PhoneNumber",
  "InvoiceDueDays",
  "Parent_FK"
];

const INVOICE_MANAGER_ATTEMPTS = [
  {
    key: "invoice_issued_customer_manager_by_id",
    entityName: "InvoiceIssued",
    columns: ["Id", "InvoiceNumber", "CustomerManager_FK"],
    idFields: ["Id"]
  }
];

const CUSTOMER_LINK_SCHEMA_ENTITIES = [
  "InvoiceIssued",
  "DirectoryWithBranch",
  "Directory",
  "Company",
  "Customer",
  "CustomerBranch"
];

const CUSTOMER_LINK_PROBE_COLUMNS = [
  "Id",
  "Name",
  "RegNumber",
  "VATNumber",
  "EmailInvoicing",
  "Email",
  "PhoneNumber",
  "InvoiceDueDays",
  "Parent_FK",
  "Directory_FK",
  "Customer_FK",
  "CustomerBranch_FK"
];

export class ReceivablesVistosLedgerMappingError extends Error {
  constructor(message, status = 400, code = "receivables_vistos_ledger_mapping_error") {
    super(message);
    this.name = "ReceivablesVistosLedgerMappingError";
    this.status = status;
    this.code = code;
  }
}

function clean(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseJson(value, fallback = null) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(clean(value));
  } catch {
    return fallback;
  }
}

function boundedInteger(value, fallback, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(number, max);
}

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new ReceivablesVistosLedgerMappingError(
      "Databáze Pohledávek není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "receivables_database_missing"
    );
  }
  return db;
}

function isoDate(value) {
  const text = clean(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function daysBetween(leftIso, rightIso) {
  const left = Date.parse(`${leftIso}T00:00:00Z`);
  const right = Date.parse(`${rightIso}T00:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  return Math.floor((right - left) / MS_PER_DAY);
}

function compactDigits(value) {
  return clean(value).replace(/\D/g, "");
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

function mapCustomerMetadata(row = {}, attempt = {}) {
  const parentCompanyId = recordId(row, "Parent_FK") || recordId(row, "Directory_FK");
  const parentCompanyName = caption(row, "Parent_FK") || caption(row, "Directory_FK");
  return {
    sourceEntity: clean(attempt.entityName),
    sourceAttemptKey: clean(attempt.key),
    vistoCustomerId: firstValue(row, ["Id", "CompanyId", "DirectoryId", "CustomerId"]),
    companyName: firstValue(row, ["Name", "Caption", "CompanyName", "ObchodniNazev"]),
    ico: compactDigits(firstValue(row, ["RegNumber", "ICO", "Ico", "IC", "Ic", "CompanyIdentificationNumber"])),
    dic: firstValue(row, ["VATNumber", "DIC", "Dic", "VAT", "VatId"]),
    billingEmail: firstValue(row, ["EmailInvoicing", "BillingEmail", "InvoiceEmail", "Email"]),
    email: firstValue(row, ["Email", "Email1", "ContactEmail"]),
    phone: firstValue(row, ["PhoneNumber", "Phone", "Telefon", "Mobile"]),
    standardDueDays: numberValue(firstValue(row, ["InvoiceDueDays", "DueDays", "StandardDueDays"]), 0),
    parentCompanyId,
    parentCompanyName,
    street: firstValue(row, ["Street", "Ulice"]),
    city: firstValue(row, ["City", "Mesto"]),
    zip: firstValue(row, ["Zip", "PSC"]),
    rawKeys: Object.keys(row || {}).slice(0, 60)
  };
}

function mapInvoiceManager(row = {}, attempt = {}) {
  return {
    sourceEntity: clean(attempt.entityName),
    sourceAttemptKey: clean(attempt.key),
    invoiceId: firstValue(row, ["Id", "InvoiceId"]),
    invoiceNumber: firstValue(row, ["InvoiceNumber", "Number"]),
    managerId: recordId(row, "CustomerManager_FK") || recordId(row, "CustomerManager"),
    managerName: caption(row, "CustomerManager_FK") || caption(row, "CustomerManager"),
    rawKeys: Object.keys(row || {}).slice(0, 40)
  };
}

function customerKey(invoice = {}) {
  const branch = clean(invoice.customerBranchId || invoice.customerBranchFk);
  if (branch) return { key: `branch:${branch}`, type: "CustomerBranch_FK", value: branch };
  const company = clean(invoice.customerCompanyId || invoice.customerFk || invoice.customerId);
  if (company) return { key: `customer:${company}`, type: "Customer_FK", value: company };
  const ico = compactDigits(invoice.ico);
  if (ico) return { key: `ico:${ico}`, type: "IČO", value: ico };
  const name = clean(invoice.customerName).toLowerCase();
  if (name) return { key: `name:${name}`, type: "Název", value: clean(invoice.customerName) };
  return { key: "unresolved", type: "nevyřešeno", value: "" };
}

function customerLabel(invoice = {}) {
  return clean(invoice.customerBranchName)
    || clean(invoice.customerName)
    || clean(invoice.customerCompanyName)
    || clean(invoice.customerId)
    || "Neurčený zákazník";
}

function openAmount(invoice = {}) {
  const explicit = numberValue(invoice.openAmount ?? invoice.remainingAmount, NaN);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (invoice.isPaid === true) return 0;
  const total = numberValue(invoice.totalAmount ?? invoice.priceWithTax);
  const paid = numberValue(invoice.paidAmount);
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

function invoiceIssueCodes(row = {}, invoice = {}) {
  const codes = [];
  const direct = clean(row.issueCode);
  if (direct) codes.push(direct);
  if (!clean(invoice.invoiceNumber || invoice.vistoInvoiceId)) codes.push("missing_invoice_number");
  if (!clean(invoice.customerId || invoice.customerName || invoice.ico)) codes.push("missing_customer_reference");
  if (!isoDate(invoice.dueDate)) codes.push("missing_due_date");
  if (!numberValue(invoice.totalAmount ?? invoice.priceWithTax)) codes.push("missing_total_amount");
  return [...new Set(codes)];
}

export function customerLookupAttemptsForCandidate(candidate = {}) {
  const attempts = [];
  const seen = new Set();
  const addAttempt = (key, entityName, filter) => {
    const normalizedFilter = Object.fromEntries(
      Object.entries(filter || {})
        .map(([filterKey, value]) => [filterKey, clean(value)])
        .filter(([, value]) => value)
    );
    if (!Object.keys(normalizedFilter).length) return;
    const dedupeKey = `${entityName}:${JSON.stringify(normalizedFilter)}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    attempts.push({ key, entityName, filter: normalizedFilter });
  };

  const companyId = clean(candidate.customerCompanyId)
    || (candidate.customerKeyType === "Customer_FK" ? clean(candidate.customerKeyValue) : "");
  const branchId = clean(candidate.customerBranchId)
    || (candidate.customerKeyType === "CustomerBranch_FK" ? clean(candidate.customerKeyValue) : "");
  const ico = compactDigits(candidate.ico)
    || (candidate.customerKeyType === "IČO" ? compactDigits(candidate.customerKeyValue) : "");

  addAttempt("directory_with_branch_by_customer_fk", "DirectoryWithBranch", { Id: companyId });
  addAttempt("directory_by_customer_fk", "Directory", { Id: companyId });
  addAttempt("company_by_customer_fk", "Company", { Id: companyId });
  addAttempt("directory_with_branch_by_reg_number", "DirectoryWithBranch", { RegNumber: ico });
  addAttempt("directory_by_reg_number", "Directory", { RegNumber: ico });
  addAttempt("directory_with_branch_by_branch_fk", "DirectoryWithBranch", { Id: branchId });
  addAttempt("customer_branch_by_branch_fk", "CustomerBranch", { Id: branchId });
  addAttempt("directory_by_branch_fk", "Directory", { Id: branchId });
  addAttempt("customer_by_branch_fk", "Customer", { Id: branchId });
  addAttempt("company_by_branch_fk", "Company", { Id: branchId });

  return attempts;
}

function schemaColumnsFromPayload(payload) {
  const columns = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const name = clean(value.ColumnName || value.columnName || value.Name || value.name || value.FieldName || value.fieldName);
    if (name) columns.add(name);
    for (const key of ["Columns", "columns", "Fields", "fields", "Items", "items", "Data", "data"]) {
      visit(value[key]);
    }
  };
  visit(payload);
  return [...columns].sort((left, right) => left.localeCompare(right));
}

async function loadCustomerLinkSchemas(env, session) {
  const byEntity = new Map();
  const diagnostics = [];
  for (const entityName of CUSTOMER_LINK_SCHEMA_ENTITIES) {
    try {
      const payload = await getVistosSchemaEntity(env, session, entityName);
      const columns = schemaColumnsFromPayload(payload);
      byEntity.set(entityName, columns);
      diagnostics.push({
        entityName,
        method: "GetSchemaEntity",
        ok: true,
        columnCount: columns.length,
        relevantColumns: columns.filter((column) => /customer|directory|branch|regnumber|vat|email|invoice/i.test(column)).slice(0, 40)
      });
    } catch (error) {
      byEntity.set(entityName, []);
      diagnostics.push({
        entityName,
        method: "GetSchemaEntity",
        ok: false,
        code: clean(error?.code),
        message: clean(error?.message).slice(0, 160)
      });
    }
  }
  return { byEntity, diagnostics };
}

function hasSchemaColumn(schemaByEntity, entityName, columnName) {
  const columns = schemaByEntity.get(entityName) || [];
  if (!columns.length) return true;
  return columns.includes(columnName);
}

function customerLinkProbeColumns(schemaByEntity, entityName) {
  const columns = schemaByEntity.get(entityName) || [];
  if (!columns.length) return CUSTOMER_LINK_PROBE_COLUMNS;
  const selected = CUSTOMER_LINK_PROBE_COLUMNS.filter((columnName) => columns.includes(columnName));
  return selected.length ? selected : ["Id"];
}

function addCustomerLinkProbeAttempt(attempts, schemaByEntity, attempt) {
  const filterEntries = Object.entries(attempt.filter || {})
    .map(([key, value]) => [key, clean(value)])
    .filter(([, value]) => value);
  if (!filterEntries.length) return;
  const filter = Object.fromEntries(filterEntries);
  const missingFilterColumns = Object.keys(filter)
    .filter((columnName) => !hasSchemaColumn(schemaByEntity, attempt.entityName, columnName));
  attempts.push({
    ...attempt,
    filter,
    skipped: Boolean(missingFilterColumns.length),
    reason: missingFilterColumns.length ? `schema_missing_filter_column:${missingFilterColumns.join(",")}` : ""
  });
}

export function customerLinkProbeAttemptsForCandidate(candidate = {}, schemaByEntity = new Map()) {
  const attempts = [];
  const companyId = clean(candidate.customerCompanyId)
    || (candidate.customerKeyType === "Customer_FK" ? clean(candidate.customerKeyValue) : "");
  const branchId = clean(candidate.customerBranchId)
    || (candidate.customerKeyType === "CustomerBranch_FK" ? clean(candidate.customerKeyValue) : "");
  const ico = compactDigits(candidate.ico)
    || (candidate.customerKeyType === "IČO" ? compactDigits(candidate.customerKeyValue) : "");

  addCustomerLinkProbeAttempt(attempts, schemaByEntity, {
    key: "directory_with_branch_customer_fk",
    entityName: "DirectoryWithBranch",
    filter: { Customer_FK: companyId }
  });
  addCustomerLinkProbeAttempt(attempts, schemaByEntity, {
    key: "directory_with_branch_directory_fk",
    entityName: "DirectoryWithBranch",
    filter: { Directory_FK: companyId }
  });
  addCustomerLinkProbeAttempt(attempts, schemaByEntity, {
    key: "directory_with_branch_parent_fk",
    entityName: "DirectoryWithBranch",
    filter: { Parent_FK: companyId }
  });
  addCustomerLinkProbeAttempt(attempts, schemaByEntity, {
    key: "directory_with_branch_id_by_customer_fk",
    entityName: "DirectoryWithBranch",
    filter: { Id: companyId }
  });
  addCustomerLinkProbeAttempt(attempts, schemaByEntity, {
    key: "directory_id_by_customer_fk",
    entityName: "Directory",
    filter: { Id: companyId }
  });
  addCustomerLinkProbeAttempt(attempts, schemaByEntity, {
    key: "directory_reg_number",
    entityName: "Directory",
    filter: { RegNumber: ico }
  });
  addCustomerLinkProbeAttempt(attempts, schemaByEntity, {
    key: "directory_with_branch_reg_number",
    entityName: "DirectoryWithBranch",
    filter: { RegNumber: ico }
  });
  addCustomerLinkProbeAttempt(attempts, schemaByEntity, {
    key: "customer_branch_customer_fk",
    entityName: "CustomerBranch",
    filter: { Customer_FK: companyId }
  });
  addCustomerLinkProbeAttempt(attempts, schemaByEntity, {
    key: "customer_branch_directory_fk",
    entityName: "CustomerBranch",
    filter: { Directory_FK: companyId }
  });
  addCustomerLinkProbeAttempt(attempts, schemaByEntity, {
    key: "customer_branch_id",
    entityName: "CustomerBranch",
    filter: { Id: branchId }
  });
  addCustomerLinkProbeAttempt(attempts, schemaByEntity, {
    key: "customer_id_by_customer_fk",
    entityName: "Customer",
    filter: { Id: companyId }
  });
  addCustomerLinkProbeAttempt(attempts, schemaByEntity, {
    key: "company_id_by_customer_fk",
    entityName: "Company",
    filter: { Id: companyId }
  });

  const seen = new Set();
  return attempts.filter((attempt) => {
    const key = `${attempt.entityName}:${JSON.stringify(attempt.filter)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function probeCustomerLinkForCandidate(env, session, candidate, schemaByEntity) {
  const attempts = customerLinkProbeAttemptsForCandidate(candidate, schemaByEntity);
  const diagnostics = [];
  for (const attempt of attempts) {
    if (attempt.skipped) {
      diagnostics.push({
        ...attempt,
        ok: false,
        returnedRows: 0,
        recordsTotal: 0,
        recordsFiltered: 0
      });
      continue;
    }
    try {
      const columns = customerLinkProbeColumns(schemaByEntity, attempt.entityName);
      const page = await getVistosPage(env, session, attempt.entityName, columns, attempt.filter, 0, 2);
      diagnostics.push({
        ...attempt,
        columns,
        ok: true,
        returnedRows: page.rows.length,
        recordsTotal: page.total || 0,
        recordsFiltered: page.filtered || 0,
        rowKeys: Object.keys(page.rows[0] || {}).slice(0, 40)
      });
    } catch (error) {
      diagnostics.push({
        ...attempt,
        columns: customerLinkProbeColumns(schemaByEntity, attempt.entityName),
        ok: false,
        code: clean(error?.code),
        message: clean(error?.message).slice(0, 160),
        returnedRows: 0,
        recordsTotal: 0,
        recordsFiltered: 0
      });
    }
  }
  return diagnostics;
}

function customerMetadataStatus(candidate = {}, metadata = null) {
  if (!metadata) return "missing_metadata";
  const issues = customerMetadataIssues(candidate, metadata);
  if (issues.some((issue) => issue.endsWith("_conflict"))) return "metadata_conflict";
  if (issues.length) return "partial_metadata";
  return "enriched";
}

function customerMetadataIssues(candidate = {}, metadata = null) {
  if (!metadata) return ["missing_metadata"];
  const conflicts = [];
  const candidateIco = compactDigits(candidate.ico);
  if (candidateIco && metadata.ico && candidateIco !== metadata.ico) conflicts.push("ico_conflict");
  if (candidate.dic && metadata.dic && clean(candidate.dic).toLowerCase() !== clean(metadata.dic).toLowerCase()) {
    conflicts.push("dic_conflict");
  }
  const missing = [];
  if (!metadata.ico) missing.push("missing_ico");
  if (!metadata.dic) missing.push("missing_dic");
  if (!metadata.billingEmail) missing.push("missing_billing_email");
  if (!metadata.standardDueDays) missing.push("missing_standard_due_days");
  return [...conflicts, ...missing];
}

async function loadCustomerMetadataForCandidate(env, session, candidate = {}) {
  const customerAttempts = customerLookupAttemptsForCandidate(candidate);
  const attempts = [];
  if (!customerAttempts.length) {
    return { metadata: null, status: "missing_lookup_key", attempts };
  }

  for (const attempt of customerAttempts) {
    try {
      const page = await getVistosPage(env, session, attempt.entityName, CUSTOMER_COLUMNS, attempt.filter, 0, 2);
      attempts.push({
        key: attempt.key,
        entityName: attempt.entityName,
        filter: attempt.filter,
        ok: true,
        returnedRows: page.rows.length,
        recordsTotal: page.total || 0,
        recordsFiltered: page.filtered || 0
      });
      if (page.rows.length > 0) {
        const metadata = mapCustomerMetadata(page.rows[0], attempt);
        return {
          metadata,
          status: customerMetadataStatus(candidate, metadata),
          attempts
        };
      }
    } catch (error) {
      attempts.push({
        key: attempt.key,
        entityName: attempt.entityName,
        filter: attempt.filter,
        ok: false,
        code: clean(error?.code),
        message: clean(error?.message).slice(0, 160)
      });
    }
  }

  return { metadata: null, status: "missing_metadata", attempts };
}

async function enrichCustomerMetadata(env, candidates = [], options = {}) {
  const limit = boundedInteger(options.customerLimit, DEFAULT_CUSTOMER_LIMIT, MAX_CUSTOMER_LIMIT);
  const targetCandidates = candidates
    .filter((candidate) => candidate.customerKey !== "unresolved")
    .slice(0, limit);

  if (!targetCandidates.length) {
    return {
      enabled: true,
      apiStatus: "empty",
      readOnly: true,
      writesD1: false,
      processedCandidates: 0,
      results: [],
      summary: {
        enriched: 0,
        partialMetadata: 0,
        missingMetadata: 0,
        metadataConflict: 0
      },
      diagnostics: []
    };
  }

  if (!isVistosExecuteConfigured(env)) {
    return {
      enabled: true,
      apiStatus: "not_configured",
      readOnly: true,
      writesD1: false,
      processedCandidates: 0,
      targetCandidates: targetCandidates.length,
      results: [],
      summary: {
        enriched: 0,
        partialMetadata: 0,
        missingMetadata: targetCandidates.length,
        metadataConflict: 0
      },
      diagnostics: [],
      message: "Vistos API není nakonfigurováno pro zákaznické metadata."
    };
  }

  let session = null;
  try {
    session = await loginVistosExecute(env);
  } catch (error) {
    return {
      enabled: true,
      apiStatus: "error",
      readOnly: true,
      writesD1: false,
      processedCandidates: 0,
      targetCandidates: targetCandidates.length,
      results: [],
      summary: {
        enriched: 0,
        partialMetadata: 0,
        missingMetadata: targetCandidates.length,
        metadataConflict: 0
      },
      diagnostics: [{
        ok: false,
        stage: "login",
        code: clean(error?.code),
        message: clean(error?.message).slice(0, 160)
      }],
      message: "Zákaznická metadata se nepodařilo read-only načíst z Vistosu."
    };
  }
  const results = [];
  const diagnostics = [];

  for (const candidate of targetCandidates) {
    const enrichment = await loadCustomerMetadataForCandidate(env, session, candidate);
    diagnostics.push(...enrichment.attempts.map((attempt) => ({
      ...attempt,
      customerKey: candidate.customerKey,
      customerName: candidate.customerName
    })));
    results.push({
      customerKey: candidate.customerKey,
      customerName: candidate.customerName,
      customerKeyType: candidate.customerKeyType,
      customerKeyValue: candidate.customerKeyValue,
      status: enrichment.status,
      metadata: enrichment.metadata,
      issues: customerMetadataIssues(candidate, enrichment.metadata)
    });
  }

  const countStatus = (status) => results.filter((item) => item.status === status).length;
  return {
    enabled: true,
    apiStatus: "ready",
    readOnly: true,
    writesD1: false,
    processedCandidates: results.length,
    targetCandidates: targetCandidates.length,
    source: "vistos_execute_targeted_customer_lookup",
    results,
    summary: {
      enriched: countStatus("enriched"),
      partialMetadata: countStatus("partial_metadata"),
      missingMetadata: countStatus("missing_metadata") + countStatus("missing_lookup_key"),
      metadataConflict: countStatus("metadata_conflict")
    },
    diagnostics: diagnostics.slice(-200)
  };
}

async function enrichInvoiceManagers(env, candidates = [], options = {}) {
  const limit = boundedInteger(options.managerLimit, DEFAULT_CUSTOMER_LIMIT, MAX_CUSTOMER_LIMIT);
  const invoiceTargets = [];
  for (const candidate of candidates) {
    for (const invoice of candidate.sampleInvoices || []) {
      const invoiceId = clean(invoice.invoiceId);
      if (invoiceId && invoiceTargets.length < limit) {
        invoiceTargets.push({ candidate, invoice });
      }
    }
    if (invoiceTargets.length >= limit) break;
  }

  if (!invoiceTargets.length || !isVistosExecuteConfigured(env)) {
    return {
      enabled: true,
      apiStatus: invoiceTargets.length ? "not_configured" : "empty",
      readOnly: true,
      writesD1: false,
      processedInvoices: 0,
      targetInvoices: invoiceTargets.length,
      results: [],
      summary: { managerFound: 0, managerMissing: invoiceTargets.length },
      diagnostics: []
    };
  }

  let session = null;
  try {
    session = await loginVistosExecute(env);
  } catch (error) {
    return {
      enabled: true,
      apiStatus: "error",
      readOnly: true,
      writesD1: false,
      processedInvoices: 0,
      targetInvoices: invoiceTargets.length,
      results: [],
      summary: { managerFound: 0, managerMissing: invoiceTargets.length },
      diagnostics: [{
        ok: false,
        stage: "login",
        code: clean(error?.code),
        message: clean(error?.message).slice(0, 160)
      }]
    };
  }

  const results = [];
  const diagnostics = [];
  for (const target of invoiceTargets) {
    let manager = null;
    for (const attempt of INVOICE_MANAGER_ATTEMPTS) {
      for (const idField of attempt.idFields) {
        const filter = { [idField]: target.invoice.invoiceId };
        try {
          const page = await getVistosPage(env, session, attempt.entityName, attempt.columns, filter, 0, 2);
          diagnostics.push({
            key: attempt.key,
            entityName: attempt.entityName,
            filter,
            ok: true,
            returnedRows: page.rows.length,
            recordsTotal: page.total || 0,
            recordsFiltered: page.filtered || 0,
            invoiceNumber: target.invoice.invoiceNumber,
            customerName: target.candidate.customerName
          });
          if (page.rows.length > 0) {
            manager = mapInvoiceManager(page.rows[0], attempt);
          }
        } catch (error) {
          diagnostics.push({
            key: attempt.key,
            entityName: attempt.entityName,
            filter,
            ok: false,
            code: clean(error?.code),
            message: clean(error?.message).slice(0, 160),
            invoiceNumber: target.invoice.invoiceNumber,
            customerName: target.candidate.customerName
          });
        }
        if (manager) break;
      }
      if (manager) break;
    }
    results.push({
      customerKey: target.candidate.customerKey,
      customerName: target.candidate.customerName,
      invoiceId: target.invoice.invoiceId,
      invoiceNumber: target.invoice.invoiceNumber,
      manager,
      status: manager?.managerId || manager?.managerName ? "manager_found" : "manager_missing"
    });
  }

  return {
    enabled: true,
    apiStatus: "ready",
    readOnly: true,
    writesD1: false,
    processedInvoices: results.length,
    targetInvoices: invoiceTargets.length,
    source: "vistos_execute_invoice_customer_manager_lookup",
    results,
    summary: {
      managerFound: results.filter((item) => item.status === "manager_found").length,
      managerMissing: results.filter((item) => item.status !== "manager_found").length
    },
    diagnostics: diagnostics.slice(-200)
  };
}

async function probeCustomerInvoiceLink(env, candidates = [], options = {}) {
  const limit = boundedInteger(options.linkProbeLimit, DEFAULT_LINK_PROBE_LIMIT, MAX_LINK_PROBE_LIMIT);
  const targetCandidates = candidates
    .filter((candidate) => clean(candidate.customerCompanyId || candidate.customerBranchId || candidate.ico))
    .slice(0, limit);

  if (!targetCandidates.length) {
    return {
      enabled: true,
      apiStatus: "empty",
      readOnly: true,
      writesD1: false,
      targetCandidates: 0,
      processedCandidates: 0,
      schemaDiagnostics: [],
      diagnostics: [],
      summary: {
        matchingAttempts: 0,
        successfulAttempts: 0,
        skippedAttempts: 0,
        bestAttemptKey: "",
        bestEntity: "",
        bestFilter: null
      },
      recommendedNextStep: "Nejdřív je potřeba ve snapshotu najít faktury s Customer_FK, CustomerBranch_FK nebo IČO."
    };
  }

  if (!isVistosExecuteConfigured(env)) {
    return {
      enabled: true,
      apiStatus: "not_configured",
      readOnly: true,
      writesD1: false,
      targetCandidates: targetCandidates.length,
      processedCandidates: 0,
      schemaDiagnostics: [],
      diagnostics: [],
      summary: {
        matchingAttempts: 0,
        successfulAttempts: 0,
        skippedAttempts: 0,
        bestAttemptKey: "",
        bestEntity: "",
        bestFilter: null
      },
      message: "Vistos API není nakonfigurováno pro schema probe."
    };
  }

  let session = null;
  try {
    session = await loginVistosExecute(env);
  } catch (error) {
    return {
      enabled: true,
      apiStatus: "error",
      readOnly: true,
      writesD1: false,
      targetCandidates: targetCandidates.length,
      processedCandidates: 0,
      schemaDiagnostics: [{
        ok: false,
        stage: "login",
        code: clean(error?.code),
        message: clean(error?.message).slice(0, 160)
      }],
      diagnostics: [],
      summary: {
        matchingAttempts: 0,
        successfulAttempts: 0,
        skippedAttempts: 0,
        bestAttemptKey: "",
        bestEntity: "",
        bestFilter: null
      },
      message: "Schema probe se nepodařilo přihlásit do Vistos API."
    };
  }

  const schemas = await loadCustomerLinkSchemas(env, session);
  const diagnostics = [];
  for (const candidate of targetCandidates) {
    const candidateDiagnostics = await probeCustomerLinkForCandidate(env, session, candidate, schemas.byEntity);
    diagnostics.push(...candidateDiagnostics.map((attempt) => ({
      ...attempt,
      customerKey: candidate.customerKey,
      customerName: candidate.customerName,
      customerKeyType: candidate.customerKeyType,
      customerKeyValue: candidate.customerKeyValue,
      customerCompanyId: candidate.customerCompanyId,
      customerBranchId: candidate.customerBranchId,
      ico: candidate.ico
    })));
  }

  const successful = diagnostics.filter((item) => item.ok && Number(item.returnedRows || 0) > 0);
  const best = successful
    .sort((left, right) => Number(right.returnedRows || 0) - Number(left.returnedRows || 0))[0] || null;

  return {
    enabled: true,
    apiStatus: "ready",
    readOnly: true,
    writesD1: false,
    source: "vistos_execute_customer_fk_schema_probe",
    targetCandidates: targetCandidates.length,
    processedCandidates: targetCandidates.length,
    schemaDiagnostics: schemas.diagnostics,
    diagnostics: diagnostics.slice(0, 200),
    summary: {
      matchingAttempts: diagnostics.length,
      successfulAttempts: successful.length,
      skippedAttempts: diagnostics.filter((item) => item.skipped).length,
      bestAttemptKey: best?.key || "",
      bestEntity: best?.entityName || "",
      bestFilter: best?.filter || null
    },
    recommendedNextStep: best
      ? "Použít nejlepší potvrzený filtr pro zákaznické obohacení a teprve potom spustit read-only rating preview."
      : "Customer_FK z faktur se zatím nepodařilo propojit přes testované entity. Další bezpečný krok je doplnit probe přes DbObject/DbColumn pro přesný název cílové projekce."
  };
}

export function buildReceivablesVistosLedgerMapping(rows = [], options = {}) {
  const today = isoDate(options.today || options.now) || new Date().toISOString().slice(0, 10);
  const groups = new Map();
  const issueCounts = new Map();
  let invoiceCount = 0;
  let readyInvoiceCount = 0;
  let reviewInvoiceCount = 0;
  let openInvoiceCount = 0;
  let overdueInvoiceCount = 0;
  let totalOpenAmount = 0;
  let unresolvedInvoiceCount = 0;

  for (const row of rows) {
    const invoice = row.invoice || parseJson(row.normalized_json, {}) || {};
    invoiceCount += 1;
    const issues = invoiceIssueCodes(row, invoice);
    const rowStatus = clean(row.previewStatus || row.preview_status);
    const needsReview = rowStatus === "review" || rowStatus === "needs_review" || issues.length > 0;
    if (needsReview) reviewInvoiceCount += 1;
    else readyInvoiceCount += 1;
    for (const code of issues) {
      issueCounts.set(code, (issueCounts.get(code) || 0) + 1);
    }

    const keyInfo = customerKey(invoice);
    if (keyInfo.key === "unresolved") unresolvedInvoiceCount += 1;
    if (!groups.has(keyInfo.key)) {
      groups.set(keyInfo.key, {
        customerKey: keyInfo.key,
        customerKeyType: keyInfo.type,
        customerKeyValue: keyInfo.value,
        customerName: customerLabel(invoice),
        customerId: clean(invoice.customerId),
        customerCompanyId: clean(invoice.customerCompanyId || invoice.customerFk),
        customerBranchId: clean(invoice.customerBranchId || invoice.customerBranchFk),
        ico: compactDigits(invoice.ico),
        dic: clean(invoice.dic),
        invoiceCount: 0,
        readyInvoiceCount: 0,
        reviewInvoiceCount: 0,
        openInvoiceCount: 0,
        overdueInvoiceCount: 0,
        totalAmount: 0,
        paidAmount: 0,
        openAmount: 0,
        maxDaysOverdue: 0,
        oldestDueDate: "",
        newestIssueDate: "",
        customerManagers: new Map(),
        issueCodes: new Map(),
        sampleInvoices: []
      });
    }

    const group = groups.get(keyInfo.key);
    const amountOpen = openAmount(invoice);
    const dueDate = isoDate(invoice.dueDate);
    const issueDate = isoDate(invoice.issueDate);
    const daysOverdue = amountOpen > 0 && dueDate ? Math.max(0, daysBetween(dueDate, today)) : 0;

    group.invoiceCount += 1;
    group.readyInvoiceCount += needsReview ? 0 : 1;
    group.reviewInvoiceCount += needsReview ? 1 : 0;
    group.openInvoiceCount += amountOpen > 0 ? 1 : 0;
    group.overdueInvoiceCount += daysOverdue > 0 ? 1 : 0;
    group.totalAmount += numberValue(invoice.totalAmount ?? invoice.priceWithTax);
    group.paidAmount += numberValue(invoice.paidAmount);
    group.openAmount += amountOpen;
    group.maxDaysOverdue = Math.max(group.maxDaysOverdue, daysOverdue);
    group.oldestDueDate = dueDate && (!group.oldestDueDate || dueDate < group.oldestDueDate) ? dueDate : group.oldestDueDate;
    group.newestIssueDate = issueDate && (!group.newestIssueDate || issueDate > group.newestIssueDate) ? issueDate : group.newestIssueDate;
    const managerKey = clean(invoice.customerManagerId || invoice.customerManagerName);
    if (managerKey) {
      const current = group.customerManagers.get(managerKey) || {
        managerId: clean(invoice.customerManagerId),
        managerName: clean(invoice.customerManagerName || invoice.customerManagerId),
        invoiceCount: 0
      };
      current.invoiceCount += 1;
      group.customerManagers.set(managerKey, current);
    }
    if (amountOpen > 0) {
      openInvoiceCount += 1;
      totalOpenAmount += amountOpen;
    }
    if (daysOverdue > 0) overdueInvoiceCount += 1;
    for (const code of issues) {
      group.issueCodes.set(code, (group.issueCodes.get(code) || 0) + 1);
    }
    if (group.sampleInvoices.length < 5) {
      group.sampleInvoices.push({
        invoiceNumber: clean(invoice.invoiceNumber || invoice.vistoInvoiceId),
        variableSymbol: clean(invoice.variableSymbol),
        dueDate,
        issueDate,
        totalAmount: numberValue(invoice.totalAmount ?? invoice.priceWithTax),
        paidAmount: numberValue(invoice.paidAmount),
        openAmount: amountOpen,
        daysOverdue,
        status: clean(invoice.status || invoice.paymentStatus),
        invoiceId: clean(invoice.vistoInvoiceId || invoice.invoiceId),
        customerManagerId: clean(invoice.customerManagerId),
        customerManagerName: clean(invoice.customerManagerName),
        issueCodes: issues
      });
    }
  }

  const candidates = [...groups.values()]
    .map((group) => ({
      ...group,
      totalAmount: Math.round(group.totalAmount * 100) / 100,
      paidAmount: Math.round(group.paidAmount * 100) / 100,
      openAmount: Math.round(group.openAmount * 100) / 100,
      issueCodes: [...group.issueCodes.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code)),
      customerManagers: [...group.customerManagers.values()]
        .sort((left, right) => right.invoiceCount - left.invoiceCount || left.managerName.localeCompare(right.managerName, "cs"))
        .slice(0, 5),
      mappingStatus: group.customerKey === "unresolved"
        ? "needs_customer_resolution"
        : group.reviewInvoiceCount > 0 ? "needs_invoice_review" : "ready",
      recommendedAction: group.openAmount <= 0
        ? "ledger_ignore_paid"
        : group.customerKey === "unresolved"
          ? "resolve_customer_before_ledger"
          : group.reviewInvoiceCount > 0 ? "review_invoices_before_ledger" : "ready_for_ledger_preview"
    }))
    .sort((left, right) => (
      right.openAmount - left.openAmount
      || right.maxDaysOverdue - left.maxDaysOverdue
      || right.invoiceCount - left.invoiceCount
      || left.customerName.localeCompare(right.customerName, "cs")
    ));

  const limit = boundedInteger(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
  return {
    apiStatus: "ready",
    readOnly: true,
    writesD1: false,
    writesLedger: false,
    createsReceivableRecords: false,
    sendsCustomerCommunication: false,
    startsAutomation: false,
    importsKbPayments: false,
    mapping: {
      generatedAt: new Date().toISOString(),
      today,
      summary: {
        invoiceCount,
        customerCandidateCount: candidates.length,
        readyCandidateCount: candidates.filter((item) => item.mappingStatus === "ready").length,
        reviewCandidateCount: candidates.filter((item) => item.mappingStatus !== "ready").length,
        readyInvoiceCount,
        reviewInvoiceCount,
        openInvoiceCount,
        overdueInvoiceCount,
        unresolvedInvoiceCount,
        totalOpenAmount: Math.round(totalOpenAmount * 100) / 100,
        issueCounts: [...issueCounts.entries()]
          .map(([code, count]) => ({ code, count }))
          .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code)),
        recommendedNextStep: "Zkontrolovat kandidáty s datovou kontrolou, potom připravit oddělený zápis do ledgeru až po dalším potvrzení."
      },
      candidates: candidates.slice(0, limit),
      pagination: {
        limit,
        returned: Math.min(candidates.length, limit),
        totalCandidates: candidates.length
      }
    }
  };
}

async function latestSnapshotBatch(db) {
  return db.prepare(`
    SELECT *
    FROM receivable_import_batches
    WHERE source = ? AND import_kind = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(SNAPSHOT_SOURCE, SNAPSHOT_IMPORT_KIND).first();
}

async function loadSnapshotRows(db, batchId) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const result = await db.prepare(`
      SELECT row_number, preview_status, issue_code, issue_message, normalized_json
      FROM receivable_import_rows
      WHERE batch_id = ?
      ORDER BY row_number ASC
      LIMIT ? OFFSET ?
    `).bind(batchId, ROW_PAGE_SIZE, offset).all();
    const page = result.results || [];
    rows.push(...page);
    if (page.length < ROW_PAGE_SIZE) break;
    offset += ROW_PAGE_SIZE;
  }
  return rows;
}

export async function getReceivablesVistosLedgerMapping(env, options = {}) {
  const db = database(env);
  if (!db) {
    return {
      apiStatus: "waiting",
      readOnly: true,
      mapping: null,
      message: "Databáze Pohledávek zatím není dostupná."
    };
  }

  try {
    const batch = await latestSnapshotBatch(db);
    if (!batch) {
      return {
        apiStatus: "empty",
        readOnly: true,
        mapping: null,
        message: "Nejdřív je potřeba načíst read-only snapshot Vistos faktur."
      };
    }
    const rows = await loadSnapshotRows(db, batch.id);
    const result = buildReceivablesVistosLedgerMapping(rows, options);
    const shouldEnrichCustomers = options.enrichCustomers !== false && options.enrichCustomers !== "0";
    if (shouldEnrichCustomers && result.mapping?.candidates?.length) {
      const enrichment = await enrichCustomerMetadata(env, result.mapping.candidates, options);
      const enrichmentByKey = new Map((enrichment.results || []).map((item) => [item.customerKey, item]));
      result.mapping.customerEnrichment = enrichment;
      result.mapping.candidates = result.mapping.candidates.map((candidate) => {
        const customer = enrichmentByKey.get(candidate.customerKey) || null;
        return {
          ...candidate,
          customerMetadataStatus: customer?.status || "not_checked",
          customerMetadata: customer?.metadata || null,
          customerMetadataIssues: customer?.issues || []
        };
      });
    }
    if (shouldEnrichCustomers && result.mapping?.candidates?.length) {
      const managerEnrichment = await enrichInvoiceManagers(env, result.mapping.candidates, options);
      result.mapping.invoiceManagerEnrichment = managerEnrichment;
      const managersByCustomer = new Map();
      for (const item of managerEnrichment.results || []) {
        const manager = item.manager || {};
        const managerKey = clean(manager.managerId || manager.managerName);
        if (!managerKey) continue;
        const current = managersByCustomer.get(item.customerKey) || new Map();
        const aggregate = current.get(managerKey) || {
          managerId: clean(manager.managerId),
          managerName: clean(manager.managerName || manager.managerId),
          invoiceCount: 0
        };
        aggregate.invoiceCount += 1;
        current.set(managerKey, aggregate);
        managersByCustomer.set(item.customerKey, current);
      }
      result.mapping.candidates = result.mapping.candidates.map((candidate) => {
        const liveManagers = [...(managersByCustomer.get(candidate.customerKey)?.values() || [])];
        return liveManagers.length
          ? { ...candidate, customerManagers: liveManagers }
          : candidate;
      });
    }
    if (options.probeCustomerLink !== false && options.probeCustomerLink !== "0" && result.mapping?.candidates?.length) {
      result.mapping.customerLinkProbe = await probeCustomerInvoiceLink(env, result.mapping.candidates, options);
    }
    return {
      ...result,
      snapshot: {
        batchId: clean(batch.id),
        status: clean(batch.status),
        rowCount: numberValue(batch.row_count, rows.length),
        createdAt: clean(batch.created_at),
        updatedAt: clean(batch.updated_at)
      }
    };
  } catch (error) {
    throw ledgerMappingError(error);
  }
}

export function ledgerMappingError(error) {
  if (error instanceof ReceivablesVistosLedgerMappingError) return error;
  const message = clean(error?.message);
  if (/no such table: receivable_import_/i.test(message)) {
    return new ReceivablesVistosLedgerMappingError(
      "Tabulky import preview nejsou v D1 připravené. Spusťte migraci 0028_create_receivable_import_preview.sql.",
      503,
      "receivables_import_preview_migration_missing"
    );
  }
  return new ReceivablesVistosLedgerMappingError(
    message || "Ledger mapping preview se teď nepodařilo načíst.",
    error?.status || 500,
    error?.code || "receivables_vistos_ledger_mapping_failed"
  );
}
