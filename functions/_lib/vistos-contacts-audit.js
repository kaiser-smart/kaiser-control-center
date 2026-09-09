import {
  getVistosById,
  getAllVistosPages,
  getVistosPage,
  getVistosSchemaEntity,
  isVistosExecuteConfigured,
  loginVistosExecute
} from "./vistos-execute-client.js";

const CONTACT_ENTITY_CANDIDATES = [
  "Contact", "ContactList", "ContactListRow", "Directory", "DirectoryWithBranch",
  "ContactPerson", "DirectoryContact", "ContactWithCompany", "Person"
];

const CONTACT_FIELDS = [
  "Id", "FirstName", "LastName", "MiddleName", "Name",
  "Email1", "Email", "EmailInvoicing", "Phone", "PhoneNumber", "Mobile",
  "Directory_FK", "Company_FK", "Parent_FK", "MasterParent_FK", "MainProjection_FK",
  "IsCompany", "IsActive", "Active", "Status_FK", "Created", "Modified"
];

const DB_OBJECT_COLUMN_ATTEMPTS = [
  ["Id", "Name", "Caption", "EntityName", "TableName"],
  ["Id", "Name", "Caption"],
  ["Id", "Name"]
];

const FULL_AUDIT_PAGE_SIZE = 1000;
const FULL_AUDIT_MAX_PAGES = 1000;
const FULL_AUDIT_CONCURRENCY = 4;

const DOCUMENT_ENTITY_DEFINITIONS = [
  {
    key: "contract",
    entityName: "Contract",
    companyField: "Directory_FK",
    directContactFields: ["DirectoryManager_FK", "Koncovkakontakt_FK"],
    confirmedActiveStatusId: "74"
  },
  {
    key: "quote",
    entityName: "QuoteIssued",
    companyField: "Customer_FK",
    directContactFields: ["CustomerManager_FK"]
  },
  {
    key: "invoice",
    entityName: "InvoiceIssued",
    companyField: "Customer_FK",
    directContactFields: ["CustomerManager_FK"]
  },
  {
    key: "order",
    entityName: "OrderReceived",
    companyField: "Customer_FK",
    directContactFields: ["CustomerManager_FK"]
  },
  {
    key: "serviceList",
    entityName: "ServiceList",
    companyField: "CustomerCompany_FK",
    directContactFields: ["CustomerContact_FK", "TakenOverBy_FK", "Kontaktniosobapronakladku_FK"]
  }
];

function clean(value) {
  return String(value ?? "").trim();
}

function recordId(row, field) {
  return clean(row?.[`${field}_RecordId`] || row?.[`${field}.RecordId`] || row?.[`${field}_Id`] || row?.[field]);
}

function firstValue(row, fields) {
  for (const field of fields) {
    const value = clean(row?.[field]);
    if (value) return value;
  }
  return "";
}

function referenceCaption(row, field) {
  return clean(row?.[`${field}_Caption`] || row?.[`${field}.Caption`]);
}

export function normalizeContactEmail(value) {
  return clean(value).toLowerCase();
}

export function isSyntacticallyValidEmail(value) {
  const email = normalizeContactEmail(value);
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!domain || domain.length > 253 || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.at(-1).length < 2) return false;
  return labels.every((label) => label.length > 0 && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
}

function emailMetrics(rows, field) {
  const filled = rows.map((row) => normalizeContactEmail(row?.[field])).filter(Boolean);
  const valid = filled.filter(isSyntacticallyValidEmail);
  return {
    filled: filled.length,
    empty: rows.length - filled.length,
    valid: valid.length,
    uniqueValid: new Set(valid).size,
    duplicateOccurrences: valid.length - new Set(valid).size
  };
}

function addStatusRows(counts, rows) {
  for (const row of rows) {
    const id = recordId(row, "Status_FK");
    const caption = referenceCaption(row, "Status_FK");
    const key = id || (caption ? `caption:${caption}` : "missing");
    const current = counts.get(key) || { id: id || null, caption: caption || null, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
}

function sortedStatusDistribution(counts) {
  return [...counts.values()].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    if (left.id === null && right.id !== null) return 1;
    if (right.id === null && left.id !== null) return -1;
    return clean(left.id).localeCompare(clean(right.id));
  });
}

function statusDistribution(rows) {
  const counts = new Map();
  addStatusRows(counts, rows);
  return sortedStatusDistribution(counts);
}

export function summarizeFullContactRows(rows = []) {
  const parentIds = rows.map((row) => recordId(row, "Parent_FK")).filter(Boolean);
  return {
    total: rows.length,
    email1: emailMetrics(rows, "Email1"),
    emailInvoicing: emailMetrics(rows, "EmailInvoicing"),
    parentFkFilled: parentIds.length,
    parentFkMissing: rows.length - parentIds.length,
    uniqueCompanies: new Set(parentIds).size,
    statusFkDistribution: statusDistribution(rows)
  };
}

function contactIndexes(rows) {
  const byId = new Map();
  const byCompany = new Map();
  for (const row of rows) {
    const id = clean(row?.Id);
    if (id) byId.set(id, row);
    const companyId = recordId(row, "Parent_FK");
    if (!id || !companyId) continue;
    const contacts = byCompany.get(companyId) || [];
    contacts.push(row);
    byCompany.set(companyId, contacts);
  }
  return { byId, byCompany };
}

function contactGroupMetrics(contactIds, indexes) {
  const resolvedRows = [...contactIds].map((id) => indexes.byId.get(id)).filter(Boolean);
  const companyIds = resolvedRows.map((row) => recordId(row, "Parent_FK")).filter(Boolean);
  const email1 = emailMetrics(resolvedRows, "Email1");
  return {
    contacts: contactIds.size,
    resolvedContacts: resolvedRows.length,
    unresolvedContactReferences: contactIds.size - resolvedRows.length,
    contactsWithEmail1: email1.filled,
    uniqueValidEmails: email1.uniqueValid,
    companies: new Set(companyIds).size
  };
}

export function summarizeDocumentRows(rows = [], definition, contacts = []) {
  const indexes = contactIndexes(contacts);
  const directIds = new Set();
  const documentCompanyIds = new Set();
  for (const row of rows) {
    const companyId = recordId(row, definition.companyField);
    if (companyId) documentCompanyIds.add(companyId);
    for (const field of definition.directContactFields) {
      const contactId = recordId(row, field);
      if (contactId) directIds.add(contactId);
    }
  }
  const companyContactIds = new Set();
  for (const companyId of documentCompanyIds) {
    for (const row of indexes.byCompany.get(companyId) || []) {
      const contactId = clean(row?.Id);
      if (contactId) companyContactIds.add(contactId);
    }
  }
  const overlap = [...directIds].filter((id) => companyContactIds.has(id)).length;
  const distribution = statusDistribution(rows);
  return {
    documentsTotal: rows.length,
    statusFkDistribution: distribution,
    ...(definition.confirmedActiveStatusId
      ? { confirmedActive: rows.filter((row) => recordId(row, "Status_FK") === definition.confirmedActiveStatusId).length,
          confirmedActiveStatusId: definition.confirmedActiveStatusId }
      : {}),
    documentCompanies: documentCompanyIds.size,
    directContacts: contactGroupMetrics(directIds, indexes),
    companyContacts: contactGroupMetrics(companyContactIds, indexes),
    overlapDirectCompany: overlap
  };
}

async function loadAllEntityRows(env, session, entityName, columns, options = {}) {
  const pageSize = Math.max(1, Math.min(Number(options.pageSize) || FULL_AUDIT_PAGE_SIZE, FULL_AUDIT_PAGE_SIZE));
  const maxPages = Math.max(1, Math.min(Number(options.maxPages) || FULL_AUDIT_MAX_PAGES, FULL_AUDIT_MAX_PAGES));
  const concurrency = Math.max(1, Math.min(Number(options.concurrency) || FULL_AUDIT_CONCURRENCY, 8));
  const first = await getVistosPage(env, session, entityName, columns, null, 0, pageSize);
  const expectedRows = Number(first.filtered || first.total) || first.rows.length;
  const expectedPages = Math.max(1, Math.ceil(expectedRows / pageSize));
  const plannedPages = Math.min(expectedPages, maxPages);
  const pages = new Array(plannedPages);
  pages[0] = first.rows;
  let cursor = 1;
  const worker = async () => {
    while (cursor < plannedPages) {
      const page = cursor;
      cursor += 1;
      const result = await getVistosPage(env, session, entityName, columns, null, page * pageSize, pageSize);
      pages[page] = result.rows;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(0, plannedPages - 1)) }, worker));
  const rows = pages.flatMap((page) => page || []);
  return {
    rows,
    total: Number(first.total) || expectedRows,
    filtered: Number(first.filtered) || expectedRows,
    pageSize,
    pagesRead: plannedPages,
    capped: plannedPages < expectedPages || rows.length < expectedRows
  };
}

async function scanAllEntityRows(env, session, entityName, columns, onRows, options = {}) {
  const pageSize = Math.max(1, Math.min(Number(options.pageSize) || FULL_AUDIT_PAGE_SIZE, FULL_AUDIT_PAGE_SIZE));
  const maxPages = Math.max(1, Math.min(Number(options.maxPages) || FULL_AUDIT_MAX_PAGES, FULL_AUDIT_MAX_PAGES));
  const concurrency = Math.max(1, Math.min(Number(options.concurrency) || FULL_AUDIT_CONCURRENCY, 8));
  const first = await getVistosPage(env, session, entityName, columns, null, 0, pageSize);
  const expectedRows = Number(first.filtered || first.total) || first.rows.length;
  const expectedPages = Math.max(1, Math.ceil(expectedRows / pageSize));
  const plannedPages = Math.min(expectedPages, maxPages);
  const seenIds = new Set();
  let rowsRead = 0;
  let duplicateIds = 0;
  const consume = (rows) => {
    rowsRead += rows.length;
    for (const row of rows) {
      const id = clean(row?.Id);
      if (!id) continue;
      if (seenIds.has(id)) duplicateIds += 1;
      else seenIds.add(id);
    }
    onRows(rows);
  };
  consume(first.rows);
  let cursor = 1;
  const worker = async () => {
    while (cursor < plannedPages) {
      const page = cursor;
      cursor += 1;
      const result = await getVistosPage(env, session, entityName, columns, null, page * pageSize, pageSize);
      consume(result.rows);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(0, plannedPages - 1)) }, worker));
  return {
    total: Number(first.total) || expectedRows,
    filtered: Number(first.filtered) || expectedRows,
    pageSize,
    pagesRead: plannedPages,
    rowsRead,
    duplicateIds,
    capped: plannedPages < expectedPages || rowsRead < expectedRows
  };
}

async function schemaForEntity(env, session, entityName) {
  const fields = vistosSchemaColumnNames(await getVistosSchemaEntity(env, session, entityName));
  return { entityName, fields, columnCount: fields.length };
}

function availableColumns(schema, requested) {
  const available = new Set(schema.fields);
  return requested.filter((field) => available.has(field));
}

async function loadFullEntity(env, session, entityName, requestedColumns, options = {}) {
  const schema = await schemaForEntity(env, session, entityName);
  const columns = availableColumns(schema, requestedColumns);
  const missingFields = requestedColumns.filter((field) => !schema.fields.includes(field));
  if (!columns.includes("Id")) {
    const error = new Error(`${entityName} schema neobsahuje Id.`);
    error.code = "vistos_audit_id_field_missing";
    throw error;
  }
  const page = await loadAllEntityRows(env, session, entityName, columns, options);
  return { schema, columns, missingFields, ...page };
}

async function loadFullDocumentAudit(env, session, definition, contacts) {
  const schema = await schemaForEntity(env, session, definition.entityName);
  const requestedColumns = ["Id", "Status_FK", definition.companyField, ...definition.directContactFields];
  const columns = availableColumns(schema, requestedColumns);
  const missingFields = requestedColumns.filter((field) => !schema.fields.includes(field));
  if (!columns.includes("Id")) {
    const error = new Error(`${definition.entityName} schema neobsahuje Id.`);
    error.code = "vistos_audit_id_field_missing";
    throw error;
  }

  const indexes = contactIndexes(contacts);
  const directIds = new Set();
  const documentCompanyIds = new Set();
  const statusCounts = new Map();
  let confirmedActive = 0;
  const page = await scanAllEntityRows(env, session, definition.entityName, columns, (rows) => {
    addStatusRows(statusCounts, rows);
    for (const row of rows) {
      const companyId = recordId(row, definition.companyField);
      if (companyId) documentCompanyIds.add(companyId);
      for (const field of definition.directContactFields) {
        const contactId = recordId(row, field);
        if (contactId) directIds.add(contactId);
      }
      if (definition.confirmedActiveStatusId && recordId(row, "Status_FK") === definition.confirmedActiveStatusId) {
        confirmedActive += 1;
      }
    }
  }, { concurrency: 2 });
  const companyContactIds = new Set();
  for (const companyId of documentCompanyIds) {
    for (const row of indexes.byCompany.get(companyId) || []) {
      const contactId = clean(row?.Id);
      if (contactId) companyContactIds.add(contactId);
    }
  }
  return {
    schema,
    columns,
    missingFields,
    page,
    summary: {
      documentsTotal: page.rowsRead,
      statusFkDistribution: sortedStatusDistribution(statusCounts),
      ...(definition.confirmedActiveStatusId
        ? { confirmedActive, confirmedActiveStatusId: definition.confirmedActiveStatusId }
        : {}),
      documentCompanies: documentCompanyIds.size,
      directContacts: contactGroupMetrics(directIds, indexes),
      companyContacts: contactGroupMetrics(companyContactIds, indexes),
      overlapDirectCompany: [...directIds].filter((id) => companyContactIds.has(id)).length
    }
  };
}

function fullEntityError(entityName, error) {
  return { entityName, ok: false, ...safeError(error), message: clean(error?.message).slice(0, 180) };
}

function pageIntegrity(load) {
  const ids = load.rows.map((row) => clean(row?.Id)).filter(Boolean);
  const duplicateIds = ids.length - new Set(ids).size;
  return {
    complete: !load.capped && load.rows.length === load.filtered && duplicateIds === 0,
    duplicateIds
  };
}

async function discoverGdprEntities(env, session) {
  const metadata = await getAllVistosPages(env, session, "DbObject", ["Id", "Name", "Caption", "EntityName", "TableName"], null, {
    pageSize: 1000,
    maxPages: 5
  });
  const names = [...new Set(metadata.rows.flatMap((row) => [row.EntityName, row.Name, row.TableName])
    .map(clean)
    .filter((name) => /gdpr|consent|souhlas|legalreason|privacy/i.test(name)))];
  const entities = [];
  for (const entityName of names) {
    try {
      const schema = await schemaForEntity(env, session, entityName);
      entities.push({ entityName, schema: { ok: true, columnCount: schema.columnCount, fields: schema.fields } });
    } catch (error) {
      entities.push(fullEntityError(entityName, error));
    }
  }
  return { metadataRows: metadata.rows.length, entities };
}

export function vistosSchemaColumnNames(payload) {
  const names = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const name = clean(value.ColumnName || value.columnName || value.FieldName || value.fieldName || value.Name || value.name);
    if (name) names.add(name);
    for (const key of ["Columns", "columns", "Fields", "fields", "Items", "items", "Data", "data"]) visit(value[key]);
  };
  visit(payload);
  return [...names].sort((left, right) => left.localeCompare(right, "cs"));
}

export function contactColumnsForSchema(schemaColumns = []) {
  const available = new Set(schemaColumns);
  const selected = CONTACT_FIELDS.filter((field) => available.has(field));
  return selected.includes("Id") ? selected : ["Id", ...selected];
}

export function summarizeContactRows(rows = []) {
  const emails = rows.map((row) => firstValue(row, ["Email1", "Email", "EmailInvoicing"]).toLowerCase()).filter(Boolean);
  const emailCounts = new Map();
  for (const email of emails) emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
  const companyIds = rows.map((row) => recordId(row, "Directory_FK") || recordId(row, "Company_FK") || recordId(row, "Parent_FK") || recordId(row, "MasterParent_FK"));
  return {
    rows: rows.length,
    withStableId: rows.filter((row) => clean(row?.Id)).length,
    withFirstName: rows.filter((row) => clean(row?.FirstName)).length,
    withLastName: rows.filter((row) => clean(row?.LastName)).length,
    withName: rows.filter((row) => clean(row?.Name)).length,
    withEmail: emails.length,
    uniqueEmails: emailCounts.size,
    duplicateEmailRows: [...emailCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
    withPhone: rows.filter((row) => firstValue(row, ["Phone", "PhoneNumber", "Mobile"])).length,
    withCompanyLink: companyIds.filter(Boolean).length,
    withCreated: rows.filter((row) => clean(row?.Created)).length,
    withModified: rows.filter((row) => clean(row?.Modified)).length
  };
}

function safeError(error) {
  const upstreamApiStatus = clean(error?.upstreamApiStatus);
  return {
    ok: false,
    code: clean(error?.code) || "vistos_probe_failed",
    upstreamStatus: Number(error?.upstreamStatus) || 0,
    upstreamApiStatus,
    permissionDenied: [215, 401, 403].includes(Number(error?.upstreamStatus)) || /(?:^|\b)215(?:\b|$)|unauthorized/i.test(upstreamApiStatus)
  };
}

async function discoverContactEntities(env, session) {
  const attempts = [];
  for (const columns of DB_OBJECT_COLUMN_ATTEMPTS) {
    try {
      const page = await getAllVistosPages(env, session, "DbObject", columns, null, { pageSize: 1000, maxPages: 5 });
      const entityNames = [...new Set(page.rows.flatMap((row) => [row.EntityName, row.Name, row.TableName])
        .map(clean)
        .filter((name) => /contact|kontakt|person|directory|adres/i.test(name)))]
        .slice(0, 25);
      return {
        ok: true,
        rowsLoaded: page.rows.length,
        recordsTotal: Number(page.total) || 0,
        capped: Boolean(page.capped),
        entityNames,
        attempts: [...attempts, { ok: true, columns, returnedRows: page.rows.length }]
      };
    } catch (error) {
      attempts.push({ columns, ...safeError(error) });
    }
  }
  return { ok: false, rowsLoaded: 0, recordsTotal: 0, capped: false, entityNames: [], attempts };
}

async function probeEntity(env, session, entityName, options = {}) {
  let schemaColumns = [];
  let schema;
  try {
    schemaColumns = vistosSchemaColumnNames(await getVistosSchemaEntity(env, session, entityName));
    schema = { ok: true, columnCount: schemaColumns.length };
  } catch (error) {
    schema = safeError(error);
  }

  const columns = contactColumnsForSchema(schemaColumns);
  const pageAttempts = [];
  const filters = entityName === "Directory"
    ? [{ key: "unfiltered", filter: null }, { key: "is_company_false", filter: { IsCompany: false } }]
    : [{ key: "unfiltered", filter: null }];
  for (const attempt of filters) {
    try {
      const page = await getVistosPage(env, session, entityName, columns, attempt.filter, 0, Number(options.sampleSize) || 25);
      pageAttempts.push({
        key: attempt.key,
        ok: true,
        returnedRows: page.rows.length,
        recordsTotal: Number(page.total) || 0,
        recordsFiltered: Number(page.filtered) || 0,
        summary: summarizeContactRows(page.rows)
      });
    } catch (error) {
      pageAttempts.push({ key: attempt.key, ...safeError(error) });
    }
  }

  let byId = { attempted: false };
  if (["Contact", "Directory"].includes(entityName) && options.knownContactId) {
    try {
      const result = await getVistosById(env, session, entityName, options.knownContactId, columns);
      byId = {
        attempted: true,
        ok: true,
        hasRecord: Object.keys(result.row || {}).length > 0,
        matchedColumns: result.diagnostics?.requestedColumnMatches || []
      };
    } catch (error) {
      byId = { attempted: true, ...safeError(error) };
    }
  }

  return {
    entityName,
    schema,
    availableContactFields: CONTACT_FIELDS.filter((field) => schemaColumns.includes(field)),
    pageAttempts,
    byId
  };
}

export async function auditVistosContacts(env, options = {}) {
  if (!isVistosExecuteConfigured(env)) {
    return { status: "not_configured", source: "vistos", readOnly: true, writesVistos: false, writesD1: false, entities: [] };
  }
  const session = await loginVistosExecute(env);
  const metadataDiscovery = await discoverContactEntities(env, session);
  const candidateNames = [...new Set([...CONTACT_ENTITY_CANDIDATES, ...metadataDiscovery.entityNames])].slice(0, 30);
  const entities = [];
  for (const entityName of candidateNames) entities.push(await probeEntity(env, session, entityName, options));
  const accessible = entities.filter((entity) => entity.pageAttempts.some((attempt) => attempt.ok && attempt.returnedRows > 0));
  const blocked = entities.filter((entity) => entity.pageAttempts.some((attempt) => attempt.permissionDenied));
  return {
    status: accessible.length ? "ready" : blocked.length ? "blocked_by_vistos_permission" : "no_contact_rows",
    source: "vistos",
    readOnly: true,
    writesVistos: false,
    writesD1: false,
    sendsCommunication: false,
    candidateEntityCount: entities.length,
    metadataDiscovery,
    accessibleEntities: accessible.map((entity) => entity.entityName),
    permissionBlockedEntities: blocked.map((entity) => entity.entityName),
    entities,
    testedAt: new Date().toISOString()
  };
}

export async function auditVistosContactsFull(env) {
  if (!isVistosExecuteConfigured(env)) {
    return {
      status: "not_configured",
      version: 2,
      source: "vistos",
      readOnly: true,
      writesVistos: false,
      writesD1: false,
      writesLeadHub: false,
      sendsCommunication: false
    };
  }

  const session = await loginVistosExecute(env);
  const incompleteEntities = [];
  let contactLoad;
  try {
    contactLoad = await loadFullEntity(env, session, "Contact", [
      "Id", "Email1", "EmailInvoicing", "Parent_FK", "Status_FK"
    ]);
  } catch (error) {
    const failure = fullEntityError("Contact", error);
    return {
      status: failure.permissionDenied ? "blocked_by_vistos_permission" : "error",
      version: 2,
      source: "vistos",
      readOnly: true,
      writesVistos: false,
      writesD1: false,
      writesLeadHub: false,
      sendsCommunication: false,
      contact: failure,
      incompleteEntities: ["Contact"],
      testedAt: new Date().toISOString()
    };
  }

  const contactIntegrity = pageIntegrity(contactLoad);
  if (!contactIntegrity.complete || contactLoad.missingFields.length) incompleteEntities.push("Contact");
  const contact = {
    ok: true,
    schema: { columnCount: contactLoad.schema.columnCount, requestedFields: contactLoad.columns, missingFields: contactLoad.missingFields },
    ...summarizeFullContactRows(contactLoad.rows),
    sourceTotal: contactLoad.total,
    sourceFiltered: contactLoad.filtered,
    duplicatePageIds: contactIntegrity.duplicateIds
  };

  const documents = {};
  const performanceEntities = {
    Contact: {
      pageSize: contactLoad.pageSize,
      pagesRead: contactLoad.pagesRead,
      rowsRead: contactLoad.rows.length,
      sourceTotal: contactLoad.total,
      sourceFiltered: contactLoad.filtered,
      duplicatePageIds: contactIntegrity.duplicateIds,
      incomplete: !contactIntegrity.complete || Boolean(contactLoad.missingFields.length)
    }
  };
  const documentResults = await Promise.all(DOCUMENT_ENTITY_DEFINITIONS.map(async (definition) => {
    try {
      const load = await loadFullDocumentAudit(env, session, definition, contactLoad.rows);
      const incomplete = load.page.capped
        || load.page.rowsRead !== load.page.filtered
        || load.page.duplicateIds > 0
        || load.missingFields.length > 0;
      return {
        definition,
        incomplete,
        document: {
        ok: true,
        schema: {
          columnCount: load.schema.columnCount,
          requestedFields: load.columns,
          missingFields: load.missingFields
        },
        ...load.summary,
        sourceTotal: load.page.total,
        sourceFiltered: load.page.filtered,
        duplicatePageIds: load.page.duplicateIds
        },
        performance: {
        pageSize: load.page.pageSize,
        pagesRead: load.page.pagesRead,
        rowsRead: load.page.rowsRead,
        sourceTotal: load.page.total,
        sourceFiltered: load.page.filtered,
        duplicatePageIds: load.page.duplicateIds,
        incomplete
        }
      };
    } catch (error) {
      return {
        definition,
        incomplete: true,
        document: fullEntityError(definition.entityName, error),
        performance: null
      };
    }
  }));
  for (const result of documentResults) {
    documents[result.definition.key] = result.document;
    if (result.performance) performanceEntities[result.definition.entityName] = result.performance;
    if (result.incomplete) incompleteEntities.push(result.definition.entityName);
  }

  let gdpr;
  try {
    const discovery = await discoverGdprEntities(env, session);
    const gdprLoad = await loadFullEntity(env, session, "GdprLegalReasonsDirectoryRow", [
      "Id", "Name", "Directory_FK", "Created", "Modified"
    ], { concurrency: 1 });
    const gdprIntegrity = pageIntegrity(gdprLoad);
    if (!gdprIntegrity.complete || gdprLoad.missingFields.length) incompleteEntities.push("GdprLegalReasonsDirectoryRow");
    gdpr = {
      ok: true,
      total: gdprLoad.total,
      rowsRead: gdprLoad.rows.length,
      schema: {
        columnCount: gdprLoad.schema.columnCount,
        fields: gdprLoad.schema.fields,
        requestedFields: gdprLoad.columns,
        missingFields: gdprLoad.missingFields
      },
      otherRelevantEntities: discovery.entities.filter((entity) => entity.entityName !== "GdprLegalReasonsDirectoryRow"),
      newsletterConsentDeterminable: false,
      consentReason: gdprLoad.rows.length
        ? "GDPR řádky existují, ale bez jednoznačně potvrzené newsletterové sémantiky nejsou interpretovány jako souhlas."
        : "GdprLegalReasonsDirectoryRow neobsahuje žádné řádky."
    };
    performanceEntities.GdprLegalReasonsDirectoryRow = {
      pageSize: gdprLoad.pageSize,
      pagesRead: gdprLoad.pagesRead,
      rowsRead: gdprLoad.rows.length,
      sourceTotal: gdprLoad.total,
      sourceFiltered: gdprLoad.filtered,
      duplicatePageIds: gdprIntegrity.duplicateIds,
      incomplete: !gdprIntegrity.complete || Boolean(gdprLoad.missingFields.length)
    };
  } catch (error) {
    incompleteEntities.push("GdprLegalReasonsDirectoryRow");
    gdpr = {
      ...fullEntityError("GdprLegalReasonsDirectoryRow", error),
      newsletterConsentDeterminable: false
    };
  }

  const uniqueIncompleteEntities = [...new Set(incompleteEntities)];
  return {
    status: uniqueIncompleteEntities.length ? "partial" : "complete",
    version: 2,
    source: "vistos",
    readOnly: true,
    writesVistos: false,
    writesD1: false,
    writesLeadHub: false,
    imports: false,
    sendsCommunication: false,
    contact,
    documents,
    gdpr,
    performance: {
      pageSize: FULL_AUDIT_PAGE_SIZE,
      entities: performanceEntities,
      incompleteEntities: uniqueIncompleteEntities
    },
    testedAt: new Date().toISOString()
  };
}
