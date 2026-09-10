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
  "IsCompany", "IsActive", "Active", "Status_FK", "Created", "Modified",
  "Kontaktovatsms", "SendMailEnabled", "CallEnabled", "DoNotWorkCompany",
  "Gender_FK", "Salutation_FK", "SalutationText", "Osloveni5pad"
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
  if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i.test(local)) return false;
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
  const payload = await getVistosSchemaEntity(env, session, entityName);
  const fields = vistosSchemaColumnNames(payload);
  return { entityName, fields, metadata: vistosSchemaColumnMetadata(payload), columnCount: fields.length };
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
  }, { concurrency: definition.entityName === "ServiceList" ? 8 : 2 });
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

function firstMetadataValue(value, keys) {
  for (const key of keys) {
    if (value?.[key] !== undefined && value?.[key] !== null && clean(value[key])) return clean(value[key]);
  }
  return "";
}

export function vistosSchemaColumnMetadata(payload) {
  const columns = new Map();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const explicitName = firstMetadataValue(value, ["ColumnName", "columnName", "FieldName", "fieldName"]);
    if (explicitName) {
      const current = columns.get(explicitName) || { field: explicitName, caption: null, datatype: null };
      const caption = firstMetadataValue(value, ["Caption", "caption", "ColumnCaption", "columnCaption", "DisplayName", "displayName", "Label", "label", "Title", "title"]);
      const datatype = firstMetadataValue(value, ["DataType", "dataType", "Datatype", "datatype", "Type", "type", "ColumnType", "columnType"]);
      if (caption) current.caption = caption;
      if (datatype) current.datatype = datatype;
      columns.set(explicitName, current);
    }
    for (const nested of Object.values(value)) visit(nested);
  };
  visit(payload);
  return [...columns.values()].sort((left, right) => left.field.localeCompare(right.field, "cs"));
}

function foldText(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const CONTACT_QUALITY_FIELD_PATTERN = /sms|e-?mail|send.?mail|marketing|consent|agreement|personal.?data|opt.?out|unsubscribe|gdpr|komunik|kontaktov|call.?enabled|do.?not|nezas[ií]lat|nepos[ií]lat|zakaz.*oslov/i;
const KNOWN_EMAIL_DOMAINS = [
  "gmail.com", "seznam.cz", "centrum.cz", "email.cz", "volny.cz",
  "outlook.com", "hotmail.com", "icloud.com", "yahoo.com"
];
const ROLE_LOCAL_PARTS = new Set([
  "info", "obchod", "fakturace", "office", "recepce", "sekretariat", "sekretariát",
  "servis", "objednavky", "objednávky", "kontakt", "accounting", "billing", "sales"
]);

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}

export function suspiciousEmailDomain(domainValue) {
  const domain = foldText(domainValue);
  if (!domain || KNOWN_EMAIL_DOMAINS.includes(domain)) return null;
  let best = null;
  for (const intended of KNOWN_EMAIL_DOMAINS) {
    const distance = levenshtein(domain, intended);
    const maxDistance = Math.max(domain.length, intended.length) <= 7 ? 1 : 2;
    if (distance <= maxDistance && (!best || distance < best.distance)) best = { intended, distance };
  }
  if (!best) return null;
  return {
    domain,
    probableIntendedDomain: best.intended,
    reason: `Levenshtein distance ${best.distance} from known domain ${best.intended}`,
    confidence: best.distance === 1 ? "high" : "medium"
  };
}

function normalizedBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const normalized = foldText(value);
  if (["true", "ano", "yes", "1"].includes(normalized)) return true;
  if (["false", "ne", "no", "0"].includes(normalized)) return false;
  return null;
}

const DNC_FIELD_DEFINITIONS = [
  {
    field: "Kontaktovatsms",
    owner: "contact",
    acceptedCaptions: ["kontaktovat sms"],
    trueMeaning: "SMS kontakt povolen",
    falseMeaning: "SMS kontakt zakázán",
    trueDnc: false,
    falseDnc: true
  },
  {
    field: "SendMailEnabled",
    owner: "contact",
    acceptedCaptions: ["povolit e mail", "povolit email", "odesilat e mail", "odesilat email"],
    trueMeaning: "e-mailové kontaktování povoleno",
    falseMeaning: "e-mailové kontaktování zakázáno",
    trueDnc: false,
    falseDnc: true
  },
  {
    field: "CallEnabled",
    owner: "contact",
    acceptedCaptions: ["povolit volani", "volat", "kontaktovat telefonicky"],
    trueMeaning: "telefonické kontaktování povoleno",
    falseMeaning: "telefonické kontaktování zakázáno",
    trueDnc: false,
    falseDnc: true
  }
];

const LEFT_COMPANY_FIELD = {
  field: "DoNotWorkCompany",
  entity: "Contact",
  uiCaption: "Už nepracuje ve firmě",
  uiTooltip: "Pokud kontakt ve firmě nepracuje nastav ANO.",
  trueMeaning: "LEFT_COMPANY",
  falseMeaning: "kontakt není označen jako bývalý pracovník",
  emptyMeaning: "UNKNOWN",
  evidence: "Vistos UI #/Contact/edit/<id>: data-validation-name=ValidationMessage.Contact.DoNotWorkCompany; read-only DOM inspection 2026-09-10"
};

function normalizeCaption(value) {
  return foldText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function resolvedDncMappings(schemaMetadata) {
  const byField = new Map(schemaMetadata.map((column) => [column.field, column]));
  return DNC_FIELD_DEFINITIONS.map((definition) => {
    const metadata = byField.get(definition.field) || null;
    const normalizedCaption = normalizeCaption(metadata?.caption);
    const confirmed = Boolean(metadata && normalizedCaption && definition.acceptedCaptions.includes(normalizedCaption));
    return {
      ...definition,
      caption: metadata?.caption || null,
      datatype: metadata?.datatype || null,
      confirmed,
      evidence: confirmed ? "exact schema/UI caption mapping" : "field exists, but schema did not provide a confirmed UI caption"
    };
  });
}

function dncStateForRow(row, mappings) {
  let hasUnknown = false;
  let hasFalse = false;
  for (const mapping of mappings) {
    if (!mapping.confirmed) {
      hasUnknown = true;
      continue;
    }
    const value = normalizedBoolean(row?.[mapping.field]);
    if (value === null) {
      hasUnknown = true;
      continue;
    }
    const dnc = value ? mapping.trueDnc : mapping.falseDnc;
    if (dnc) return "TRUE";
    hasFalse = true;
  }
  return hasUnknown ? "UNKNOWN" : hasFalse ? "FALSE" : "UNKNOWN";
}

function leftCompanyStateForRow(row) {
  const value = normalizedBoolean(row?.[LEFT_COMPANY_FIELD.field]);
  return value === true ? "TRUE" : value === false ? "FALSE" : "UNKNOWN";
}

function isRoleAddress(email) {
  const local = normalizeContactEmail(email).split("@")[0] || "";
  return ROLE_LOCAL_PARTS.has(foldText(local));
}

function contactQualitySchema(schemaMetadata) {
  return schemaMetadata.filter((column) => CONTACT_QUALITY_FIELD_PATTERN.test(`${column.field} ${column.caption || ""}`));
}

function confirmedDoNotContactField(schemaMetadata) {
  const matches = schemaMetadata.filter((column) => foldText(column.caption).replace(/[^a-z0-9]+/g, " ").trim() === "neposilat sms");
  return matches.length === 1 ? matches[0] : null;
}

function valueDistribution(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const raw = row?.[field];
    const key = raw === null || raw === undefined || raw === "" ? "(empty)" : clean(raw);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "cs"));
}

const FIRST_NAME_VOCATIVES = new Map([
  ["radim", "Radime"], ["jan", "Jane"], ["petr", "Petře"], ["pavel", "Pavle"],
  ["martin", "Martine"], ["tomáš", "Tomáši"], ["jiří", "Jiří"], ["josef", "Josefe"],
  ["eva", "Evo"], ["jana", "Jano"], ["petra", "Petro"], ["alena", "Aleno"],
  ["lucie", "Lucie"], ["martina", "Martino"], ["lenka", "Lenko"], ["kateřina", "Kateřino"]
]);
const NON_PERSON_NAME_PATTERN = /\b(?:s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|spol|firma|obchod|servis|faktur|ucet|účet|sklad|recep|sekret|info|kontakt|objednav|objednáv|office|sales)\b/i;

function humanNameValue(value) {
  const text = clean(value);
  return Boolean(text && text.length <= 50 && /^[\p{L}][\p{L}' -]*$/u.test(text)
    && !/\d/.test(text) && !NON_PERSON_NAME_PATTERN.test(text));
}

function salutationForRow(row, roleAddress) {
  const firstName = clean(row?.FirstName);
  const lastName = clean(row?.LastName);
  if (roleAddress) return { status: "SALUTATION_REVIEW", candidate: null, source: null, reason: "Sdílená/rolová e-mailová schránka." };
  if (!humanNameValue(firstName) && !humanNameValue(lastName)) return { status: "SALUTATION_MISSING", candidate: null, source: null, reason: "Chybí ověřitelná osobní hodnota jména." };
  const storedVocative = clean(row?.Osloveni5pad);
  if (storedVocative && humanNameValue(storedVocative)) {
    return { status: "SALUTATION_CANDIDATE", candidate: `Dobrý den, ${storedVocative},`, source: "Contact.Osloveni5pad", reason: "Vokativ je uložený ve Vistosu; stále vyžaduje lidské schválení." };
  }
  const firstVocative = FIRST_NAME_VOCATIVES.get(firstName.toLocaleLowerCase("cs-CZ"));
  if (firstVocative && humanNameValue(firstName)) {
    return { status: "SALUTATION_CANDIDATE", candidate: `Dobrý den, ${firstVocative},`, source: "curated Czech first-name dictionary", reason: "Přesná shoda v omezeném kontrolovaném slovníku; kandidát není schválené oslovení." };
  }
  const gender = foldText(referenceCaption(row, "Gender_FK") || row?.SalutationText);
  if (!firstName && humanNameValue(lastName) && /muz|male|pan$/.test(gender) && /(?:il|ák)$/i.test(lastName)) {
    const vocative = /ák$/i.test(lastName) ? `${lastName.slice(0, -1)}ku` : `${lastName}e`;
    return { status: "SALUTATION_CANDIDATE", candidate: `Dobrý den, pane ${vocative},`, source: "confirmed male salutation + narrow Czech surname rule", reason: "Úzké pravidlo pouze pro potvrzený mužský rod; kandidát vyžaduje lidské schválení." };
  }
  return { status: "SALUTATION_REVIEW", candidate: null, source: null, reason: "Vokativ nebo rod nelze spolehlivě určit z dostupných dat." };
}

export function buildSalutationCandidate(row, roleAddress = false) {
  return salutationForRow(row, roleAddress);
}

function contactQualityRecord(row, dncMappings) {
  const originalEmail = clean(row?.Email1);
  const normalizedEmail = normalizeContactEmail(originalEmail);
  const syntaxValid = isSyntacticallyValidEmail(normalizedEmail);
  const domain = syntaxValid ? normalizedEmail.split("@")[1] : "";
  const typo = domain ? suspiciousEmailDomain(domain) : null;
  const dncState = dncStateForRow(row, dncMappings);
  const leftCompanyState = leftCompanyStateForRow(row);
  const firstName = clean(row?.FirstName);
  const lastName = clean(row?.LastName);
  const nameOk = humanNameValue(firstName) || humanNameValue(lastName);
  const roleAddress = syntaxValid && isRoleAddress(normalizedEmail);
  const salutation = salutationForRow(row, roleAddress);
  return {
    id: clean(row?.Id), originalEmail, normalizedEmail, syntaxValid, domain, typo,
    doNotContactState: dncState, doNotContact: dncState === "TRUE", doNotContactUnknown: dncState === "UNKNOWN",
    leftCompanyState, leftCompany: leftCompanyState === "TRUE", leftCompanyUnknown: leftCompanyState === "UNKNOWN",
    firstName, lastName, nameOk, roleAddress, salutation,
    parentId: recordId(row, "Parent_FK")
  };
}

function duplicateGroups(rows, qualityRows) {
  const byEmail = new Map();
  qualityRows.forEach((quality, index) => {
    if (!quality.syntaxValid) return;
    const members = byEmail.get(quality.normalizedEmail) || [];
    members.push({ row: rows[index], quality });
    byEmail.set(quality.normalizedEmail, members);
  });
  return [...byEmail.entries()].filter(([, members]) => members.length > 1).map(([email, members]) => {
    const parentIds = new Set(members.map(({ quality }) => quality.parentId).filter(Boolean));
    const names = new Set(members.map(({ quality }) => `${foldText(quality.firstName)}|${foldText(quality.lastName)}`));
    const dncStates = new Set(members.map(({ quality }) => quality.doNotContactState));
    const employmentStates = new Set(members.map(({ quality }) => quality.leftCompanyState));
    return {
      normalizedEmail: email,
      count: members.length,
      contactIds: members.map(({ quality }) => quality.id),
      records: members.map(({ row, quality }) => ({
        contactId: quality.id,
        firstName: quality.firstName,
        lastName: quality.lastName,
        parentFk: quality.parentId || null,
        company: referenceCaption(row, "Parent_FK") || null,
        doNotContact: quality.doNotContactState,
        leftCompany: quality.leftCompanyState,
        phone: firstValue(row, ["Phone", "PhoneNumber", "Mobile"]) || null,
        created: clean(row?.Created) || null,
        modified: clean(row?.Modified) || null
      })),
      sameLikelyPerson: names.size === 1 && ![...names][0].startsWith("|"),
      multiplePeople: names.size > 1,
      multipleCompanies: parentIds.size > 1,
      roleAddress: members.some(({ quality }) => quality.roleAddress),
      doNotContactConflict: dncStates.has("TRUE") || dncStates.has("UNKNOWN"),
      employmentConflictReview: employmentStates.has("TRUE") && employmentStates.has("FALSE"),
      employmentUnknownConflictReview: employmentStates.has("TRUE") && employmentStates.has("UNKNOWN")
    };
  }).sort((a, b) => b.count - a.count || a.normalizedEmail.localeCompare(b.normalizedEmail));
}

function summarizeCleanupContacts(rows, schemaMetadata) {
  const dncMappings = resolvedDncMappings(schemaMetadata);
  const qualityRows = rows.map((row) => contactQualityRecord(row, dncMappings));
  const duplicates = duplicateGroups(rows, qualityRows);
  const duplicateEmails = new Set(duplicates.map((group) => group.normalizedEmail));
  const dncConflictEmails = new Set(duplicates.filter((group) => group.doNotContactConflict).map((group) => group.normalizedEmail));
  const employmentConflictEmails = new Set(duplicates.filter((group) => group.employmentConflictReview).map((group) => group.normalizedEmail));
  const employmentUnknownConflictEmails = new Set(duplicates.filter((group) => group.employmentUnknownConflictReview).map((group) => group.normalizedEmail));
  const validRows = qualityRows.filter((row) => row.syntaxValid);
  const uniqueDomains = [...new Set(validRows.map((row) => row.domain))].sort();
  const candidateBeforeDns = qualityRows.filter((row) => row.syntaxValid && !row.typo && !row.doNotContact
    && !row.doNotContactUnknown && row.leftCompanyState === "FALSE"
    && !duplicateEmails.has(row.normalizedEmail) && !employmentConflictEmails.has(row.normalizedEmail)
    && !employmentUnknownConflictEmails.has(row.normalizedEmail) && row.nameOk);
  const leftCompanyRows = qualityRows.filter((row) => row.leftCompany);
  const leftCompanyUniqueEmails = new Set(leftCompanyRows.filter((row) => row.normalizedEmail).map((row) => row.normalizedEmail));
  const leftCompanyUniqueValidEmails = new Set(leftCompanyRows.filter((row) => row.syntaxValid).map((row) => row.normalizedEmail));
  const suspiciousRows = qualityRows.filter((row) => row.typo).map((quality) => ({
    contactId: quality.id,
    originalEmail: quality.originalEmail,
    normalizedEmail: quality.normalizedEmail,
    suspiciousDomain: quality.domain,
    probableIntendedDomain: quality.typo.probableIntendedDomain,
    reason: quality.typo.reason,
    confidence: quality.typo.confidence
  }));
  return {
    qualityRows,
    duplicates,
    uniqueDomains,
    summary: {
      total: rows.length,
      email1Filled: qualityRows.filter((row) => row.normalizedEmail).length,
      email1Empty: qualityRows.filter((row) => !row.normalizedEmail).length,
      syntaxValid: validRows.length,
      uniqueSyntaxValid: new Set(validRows.map((row) => row.normalizedEmail)).size,
      invalidSyntax: qualityRows.filter((row) => row.normalizedEmail && !row.syntaxValid).length,
      duplicateEmailOccurrences: validRows.length - new Set(validRows.map((row) => row.normalizedEmail)).size,
      duplicateEmailGroups: duplicates.length,
      doNotContact: qualityRows.filter((row) => row.doNotContact).length,
      doNotContactWithEmail1: qualityRows.filter((row) => row.doNotContact && row.normalizedEmail).length,
      doNotContactWithValidEmail1: qualityRows.filter((row) => row.doNotContact && row.syntaxValid).length,
      doNotContactUnknownValues: qualityRows.filter((row) => row.doNotContactUnknown).length,
      doNotContactConflictEmails: dncConflictEmails.size,
      leftCompanyTrue: leftCompanyRows.length,
      leftCompanyFalse: qualityRows.filter((row) => row.leftCompanyState === "FALSE").length,
      leftCompanyUnknown: qualityRows.filter((row) => row.leftCompanyState === "UNKNOWN").length,
      leftCompanyWithEmail1: leftCompanyRows.filter((row) => row.normalizedEmail).length,
      leftCompanyUniqueEmails: leftCompanyUniqueEmails.size,
      leftCompanyUniqueValidEmails: leftCompanyUniqueValidEmails.size,
      employmentConflictReviewEmails: employmentConflictEmails.size,
      employmentConflictReviewContacts: qualityRows.filter((row) => employmentConflictEmails.has(row.normalizedEmail)).length,
      employmentUnknownConflictReviewEmails: employmentUnknownConflictEmails.size,
      employmentUnknownConflictReviewContacts: qualityRows.filter((row) => employmentUnknownConflictEmails.has(row.normalizedEmail)).length,
      newlyExcludedByLeftCompany: leftCompanyRows.filter((row) => row.syntaxValid && !row.typo
        && row.doNotContactState === "FALSE" && !duplicateEmails.has(row.normalizedEmail) && row.nameOk).length,
      alreadyBlockedByOtherFilter: leftCompanyRows.filter((row) => !(row.syntaxValid && !row.typo
        && row.doNotContactState === "FALSE" && !duplicateEmails.has(row.normalizedEmail) && row.nameOk)).length,
      contactsWithFirstName: qualityRows.filter((row) => row.firstName).length,
      contactsWithLastName: qualityRows.filter((row) => row.lastName).length,
      contactsWithBothNames: qualityRows.filter((row) => row.firstName && row.lastName).length,
      nameOk: qualityRows.filter((row) => row.nameOk).length,
      nameMissing: qualityRows.filter((row) => !row.nameOk).length,
      roleAddress: qualityRows.filter((row) => row.roleAddress).length,
      salutationCandidates: qualityRows.filter((row) => row.salutation.status === "SALUTATION_CANDIDATE").length,
      salutationApproved: 0,
      salutationReview: qualityRows.filter((row) => row.salutation.status === "SALUTATION_REVIEW").length,
      salutationMissing: qualityRows.filter((row) => row.salutation.status === "SALUTATION_MISSING").length,
      candidateBeforeDns: candidateBeforeDns.length,
      uniqueDomains: uniqueDomains.length
    },
    suspiciousRows,
    dncMappings,
    leftCompanyField: LEFT_COMPANY_FIELD
  };
}

export function summarizeCleanupContactRows(rows = [], schemaMetadata = []) {
  const result = summarizeCleanupContacts(rows, schemaMetadata);
  return {
    summary: result.summary,
    doNotContactField: confirmedDoNotContactField(schemaMetadata),
    doNotContactMappings: result.dncMappings,
    leftCompanyField: result.leftCompanyField,
    duplicateGroups: result.duplicates,
    suspiciousRows: result.suspiciousRows,
    uniqueDomains: result.uniqueDomains
  };
}

const ACCEPTED_MAIL_ROUTE_STATUS = "VALID_DOMAIN";

function normalizedDomainStatuses(value) {
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value && typeof value === "object" ? value : {});
  return new Map(entries.map(([domain, evidence]) => [
    clean(domain).toLowerCase(),
    clean(evidence && typeof evidence === "object" ? evidence.status : evidence).toUpperCase() || "UNKNOWN"
  ]).filter(([domain]) => domain));
}

function mailRouteExclusionReason(status) {
  if (status === "NULL_MX") return "NULL_MX";
  if (["NXDOMAIN", "NO_MAIL_ROUTE"].includes(status)) return "INVALID_DOMAIN_OR_ROUTE";
  if (status === "INVALID_MX_TARGET") return "INVALID_MAIL_ROUTE";
  if (status === "A_AAAA_FALLBACK_REVIEW") return "DNS_FALLBACK_REVIEW";
  return "DNS_UNKNOWN";
}

export function buildLeadHubDataOnlySelection(rows = [], schemaMetadata = [], options = {}) {
  const cleanup = summarizeCleanupContacts(rows, schemaMetadata);
  const domainStatuses = normalizedDomainStatuses(options.domainStatuses);
  const requiredDomains = cleanup.uniqueDomains;
  const checkedRequiredDomains = requiredDomains.filter((domain) => domainStatuses.has(domain));
  const missingDomains = requiredDomains.filter((domain) => !domainStatuses.has(domain));
  const duplicateEmails = new Set(cleanup.duplicates.map((group) => group.normalizedEmail));
  const employmentConflictEmails = new Set(cleanup.duplicates
    .filter((group) => group.employmentConflictReview || group.employmentUnknownConflictReview)
    .map((group) => group.normalizedEmail));
  const reasons = new Map();
  const excludedRecordIds = new Set();
  const excludedEmails = new Set();
  const addReason = (quality, reason) => {
    const bucket = reasons.get(reason) || { contactRecordIds: new Set(), normalizedEmails: new Set() };
    if (quality.id) bucket.contactRecordIds.add(quality.id);
    if (quality.normalizedEmail) bucket.normalizedEmails.add(quality.normalizedEmail);
    reasons.set(reason, bucket);
  };
  const technicalClean = [];
  for (const quality of cleanup.qualityRows) {
    const technicalReasons = [];
    if (!quality.normalizedEmail) technicalReasons.push("NO_EMAIL1");
    else if (!quality.syntaxValid) technicalReasons.push("INVALID_SYNTAX");
    if (quality.syntaxValid) {
      if (quality.typo) technicalReasons.push("SUSPICIOUS_TYPO");
      if (duplicateEmails.has(quality.normalizedEmail)) technicalReasons.push("DUPLICATE_OR_CONFLICT_EMAIL");
      if (employmentConflictEmails.has(quality.normalizedEmail)) technicalReasons.push("EMPLOYMENT_CONFLICT_EMAIL");
      if (quality.domain === "kaiserservis.cz") technicalReasons.push("KAISERSERVIS_DOMAIN");
      const routeStatus = domainStatuses.get(quality.domain) || "UNKNOWN";
      if (routeStatus !== ACCEPTED_MAIL_ROUTE_STATUS) technicalReasons.push(mailRouteExclusionReason(routeStatus));
    }
    if (quality.leftCompanyState === "TRUE") technicalReasons.push("LEFT_COMPANY_TRUE");
    if (quality.leftCompanyState === "UNKNOWN") technicalReasons.push("LEFT_COMPANY_UNKNOWN");
    if (!quality.nameOk) technicalReasons.push("NAME_MISSING_OR_UNUSABLE");
    if (quality.roleAddress) technicalReasons.push("ROLE_ADDRESS");
    if (quality.salutation.status !== "SALUTATION_CANDIDATE") technicalReasons.push("SALUTATION_UNRELIABLE");
    for (const reason of new Set(technicalReasons)) addReason(quality, reason);
    if (!technicalReasons.length) technicalClean.push(quality);
  }
  const dataOnly = [];
  const communication = { confirmedForbidden: new Set(), unknown: new Set(), documentedPermission: new Set() };
  const communicationStatesByEmail = new Map();
  for (const quality of cleanup.qualityRows) {
    if (!quality.syntaxValid) continue;
    const states = communicationStatesByEmail.get(quality.normalizedEmail) || new Set();
    states.add(quality.doNotContactState);
    communicationStatesByEmail.set(quality.normalizedEmail, states);
  }
  const allCommunication = { confirmedForbidden: 0, unknown: 0, documentedPermission: 0 };
  for (const states of communicationStatesByEmail.values()) {
    if (states.has("TRUE")) allCommunication.confirmedForbidden += 1;
    else if (states.has("UNKNOWN")) allCommunication.unknown += 1;
    else allCommunication.documentedPermission += 1;
  }
  for (const quality of technicalClean) {
    const target = quality.doNotContactState === "TRUE"
      ? communication.confirmedForbidden
      : quality.doNotContactState === "FALSE"
        ? communication.documentedPermission
        : communication.unknown;
    target.add(quality.normalizedEmail);
    if (quality.doNotContactState === "TRUE") {
      addReason(quality, "CONFIRMED_DO_NOT_CONTACT");
      continue;
    }
    dataOnly.push({
      contactId: quality.id,
      normalizedEmail: quality.normalizedEmail,
      firstName: quality.firstName || null,
      lastName: quality.lastName || null,
      salutationCandidate: quality.salutation.candidate,
      communicationStatus: quality.doNotContactState === "FALSE" ? "DNC_ALLOWED_ONLY" : "UNKNOWN",
      newsletterPermission: "UNKNOWN"
    });
  }
  for (const bucket of reasons.values()) {
    for (const id of bucket.contactRecordIds) excludedRecordIds.add(id);
    for (const email of bucket.normalizedEmails) excludedEmails.add(email);
  }
  const technicalCleanEmails = new Set(technicalClean.map((quality) => quality.normalizedEmail));
  const dataOnlyEmails = new Set(dataOnly.map((row) => row.normalizedEmail));
  return {
    status: missingDomains.length ? "PARTIAL" : "COMPLETE",
    cleaningPolicy: "fail-closed; missing or inconclusive evidence is excluded instead of queued for manual review",
    grain: { source: "CONTACT_RECORDS", selection: "UNIQUE_EMAILS" },
    sourceContactRecords: cleanup.summary.total,
    contactRecordsWithEmail1: cleanup.summary.email1Filled,
    uniqueSyntaxValidEmails: cleanup.summary.uniqueSyntaxValid,
    domainEvidence: {
      suppliedDomains: domainStatuses.size,
      requiredDomains: requiredDomains.length,
      checkedRequiredDomains: checkedRequiredDomains.length,
      missingDomains: missingDomains.length,
      requiredStatus: ACCEPTED_MAIL_ROUTE_STATUS,
      missingEvidenceExcluded: missingDomains.length > 0
    },
    exclusionReasons: Object.fromEntries([...reasons.entries()].map(([reason, bucket]) => [reason, {
      contactRecords: bucket.contactRecordIds.size,
      uniqueEmails: bucket.normalizedEmails.size
    }])),
    excludedContactRecordsWithoutDoubleCount: excludedRecordIds.size,
    excludedUniqueEmailsWithoutDoubleCount: excludedEmails.size,
    technicallyCleanContactRecords: technicalClean.length,
    technicallyCleanUniqueEmails: technicalCleanEmails.size,
    communicationStatus: {
      confirmedForbiddenUniqueEmails: communication.confirmedForbidden.size,
      unknownUniqueEmails: communication.unknown.size,
      documentedDncPermissionUniqueEmails: communication.documentedPermission.size,
      newsletterPermissionConfirmedUniqueEmails: 0
    },
    communicationStatusAllUniqueSyntaxValidEmails: {
      confirmedForbiddenUniqueEmails: allCommunication.confirmedForbidden,
      unknownUniqueEmails: allCommunication.unknown,
      documentedDncPermissionUniqueEmails: allCommunication.documentedPermission,
      newsletterPermissionConfirmedUniqueEmails: 0
    },
    dataOnlyContactRecords: dataOnly.length,
    dataOnlyUniqueEmails: dataOnlyEmails.size,
    readyForImport: false,
    sendAllowed: false,
    dataOnly
  };
}

async function dnsQuery(name, type, attempts = 2) {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`, {
        headers: { Accept: "application/dns-json" }
      });
      if (!response.ok) last = { ok: false, dnsStatus: response.status, transient: response.status >= 500 };
      else {
        const body = await response.json();
        const status = Number(body.Status);
        if (status === 0 || status === 3) return { ok: true, dnsStatus: status, answers: Array.isArray(body.Answer) ? body.Answer : [] };
        last = { ok: false, dnsStatus: status, transient: [2, 4, 5].includes(status) };
      }
    } catch {
      last = { ok: false, dnsStatus: null, transient: true };
    }
    if (!last?.transient) break;
  }
  return last || { ok: false, dnsStatus: null, transient: true };
}

function addressAnswers(query, types) {
  return query?.ok && query.dnsStatus === 0
    ? query.answers.filter((answer) => types.includes(Number(answer.type))).map((answer) => clean(answer.data)).filter(Boolean)
    : [];
}

export async function dnsMailRouteStatus(domain) {
  const mxQuery = await dnsQuery(domain, "MX");
  if (!mxQuery.ok) return { status: "UNKNOWN", dnsStatus: mxQuery.dnsStatus, mx: [], reason: "DNS query failed after bounded retry" };
  if (mxQuery.dnsStatus === 3) return { status: "NXDOMAIN", dnsStatus: 3, mx: [], reason: "Domain does not exist" };
  const mx = mxQuery.answers.filter((answer) => Number(answer.type) === 15).map((answer) => clean(answer.data));
  if (mx.some((value) => /^0\s+\.$/.test(value))) return { status: "NULL_MX", dnsStatus: 0, mx, reason: "RFC 7505 null MX explicitly rejects mail" };
  if (mx.length) {
    const targets = [...new Set(mx.map((value) => value.replace(/^\d+\s+/, "").replace(/\.$/, "")).filter(Boolean))];
    const targetResults = await mapConcurrent(targets, 4, async (target) => {
      const [a, aaaa] = await Promise.all([dnsQuery(target, "A"), dnsQuery(target, "AAAA")]);
      return { target, addresses: [...addressAnswers(a, [1]), ...addressAnswers(aaaa, [28])], uncertain: !a.ok || !aaaa.ok };
    });
    if (targetResults.some((row) => row.addresses.length)) return { status: "VALID_DOMAIN", dnsStatus: 0, mx, mxTargets: targetResults, reason: "MX target has A/AAAA address" };
    if (targetResults.some((row) => row.uncertain)) return { status: "UNKNOWN", dnsStatus: null, mx, mxTargets: targetResults, reason: "MX target address lookup remained inconclusive" };
    return { status: "INVALID_MX_TARGET", dnsStatus: 0, mx, mxTargets: targetResults, reason: "MX targets have no A/AAAA address" };
  }
  const [a, aaaa] = await Promise.all([dnsQuery(domain, "A"), dnsQuery(domain, "AAAA")]);
  if ((!a.ok && a.dnsStatus !== 3) || (!aaaa.ok && aaaa.dnsStatus !== 3)) return { status: "UNKNOWN", dnsStatus: null, mx: [], reason: "A/AAAA fallback lookup remained inconclusive" };
  const addresses = [...addressAnswers(a, [1]), ...addressAnswers(aaaa, [28])];
  if (addresses.length) return { status: "A_AAAA_FALLBACK_REVIEW", dnsStatus: 0, mx: [], addresses, reason: "No MX; RFC 5321 implicit A/AAAA fallback exists and requires review" };
  return { status: "NO_MAIL_ROUTE", dnsStatus: a.dnsStatus === 3 && aaaa.dnsStatus === 3 ? 3 : 0, mx: [], reason: "No MX and no A/AAAA fallback" };
}

async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

const LEADHUB_DATA_ONLY_PREFIX = "protected-audits/vistos-contact-cleanup-v4";
const LEADHUB_DATA_ONLY_LATEST_KEY = `${LEADHUB_DATA_ONLY_PREFIX}/latest.json`;
const LEADHUB_DNS_BATCH_LIMIT = 150;

function leadHubAuditBucket(env) {
  const bucket = env?.R2_ARCHIVE;
  if (!bucket) {
    const error = new Error("Chybí chráněné R2 úložiště R2_ARCHIVE pro Vistos DATA_ONLY audit.");
    error.status = 503;
    error.code = "vistos_data_only_storage_missing";
    throw error;
  }
  return bucket;
}

function leadHubAuditKey(runId, name) {
  const safeRunId = clean(runId);
  if (!/^[a-z0-9-]{8,80}$/i.test(safeRunId)) {
    const error = new Error("Neplatné runId Vistos DATA_ONLY auditu.");
    error.status = 400;
    error.code = "vistos_data_only_run_id_invalid";
    throw error;
  }
  return `${LEADHUB_DATA_ONLY_PREFIX}/${safeRunId}/${name}.json`;
}

async function putProtectedAuditJson(bucket, key, value) {
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { protected: "true", audit: "vistos-contact-cleanup-v4" }
  });
}

async function getProtectedAuditJson(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  if (typeof object.json === "function") return object.json();
  return JSON.parse(await object.text());
}

function contactSnapshotFingerprint(rows) {
  return String(hashString(rows.map((row) => [
    clean(row?.Id), clean(row?.Email1), clean(row?.Modified), clean(row?.DoNotWorkCompany)
  ].join("\u001f")).join("\u001e")));
}

export function finalizeLeadHubDataOnlySnapshot(snapshot, dnsState) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const schemaMetadata = Array.isArray(snapshot?.schemaMetadata) ? snapshot.schemaMetadata : [];
  const requiredDomains = Array.isArray(dnsState?.domains) ? dnsState.domains : [];
  const results = dnsState?.results && typeof dnsState.results === "object" ? dnsState.results : {};
  const domainStatuses = Object.fromEntries(requiredDomains
    .filter((domain) => results[domain]?.status)
    .map((domain) => [domain, results[domain]]));
  const cleanup = buildLeadHubDataOnlySelection(rows, schemaMetadata, { domainStatuses });
  const checkedAtValues = Object.values(results).map((row) => clean(row?.checkedAt)).filter(Boolean).sort();
  return {
    status: cleanup.status,
    runId: clean(snapshot?.runId || dnsState?.runId),
    snapshotFingerprint: clean(snapshot?.snapshotFingerprint),
    snapshotCreatedAt: clean(snapshot?.createdAt) || null,
    dnsCheckedAt: checkedAtValues.at(-1) || null,
    dnsResults: Object.fromEntries(requiredDomains.filter((domain) => results[domain]).map((domain) => [domain, {
      status: clean(results[domain]?.status).toUpperCase() || "UNKNOWN",
      checkedAt: clean(results[domain]?.checkedAt) || null
    }])),
    cleanup,
    communicationPermission: {
      importAllowed: false,
      sendAllowed: false,
      newsletterPermission: "UNKNOWN"
    },
    noWriteSafety: {
      vistosWrites: 0,
      leadHubWrites: 0,
      imports: 0,
      subscriptionChanges: 0,
      emailsSent: 0,
      smsSent: 0,
      automationsActivated: 0
    }
  };
}

async function initializeLeadHubDataOnlyAudit(env) {
  if (!isVistosExecuteConfigured(env)) {
    const error = new Error("Vistos Execute API není nakonfigurované.");
    error.status = 503;
    error.code = "vistos_not_configured";
    throw error;
  }
  const session = await loginVistosExecute(env);
  const contactLoad = await loadCleanupContacts(env, session);
  const bucket = leadHubAuditBucket(env);
  const runId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const snapshot = {
    version: 1,
    runId,
    createdAt,
    snapshotFingerprint: contactSnapshotFingerprint(contactLoad.load.rows),
    rows: contactLoad.load.rows,
    schemaMetadata: contactLoad.schema.metadata,
    source: {
      entity: "Contact",
      rowsRead: contactLoad.load.rows.length,
      sourceTotal: contactLoad.load.total,
      pageSize: contactLoad.load.pageSize,
      pagesRead: contactLoad.load.pagesRead
    }
  };
  const state = {
    version: 1,
    runId,
    createdAt,
    snapshotFingerprint: snapshot.snapshotFingerprint,
    domains: contactLoad.cleanup.uniqueDomains,
    results: {},
    nextDomainStart: 0
  };
  await Promise.all([
    putProtectedAuditJson(bucket, leadHubAuditKey(runId, "contact-snapshot"), snapshot),
    putProtectedAuditJson(bucket, leadHubAuditKey(runId, "dns-state"), state)
  ]);
  return {
    status: "RUNNING",
    runId,
    sourceContactRecords: snapshot.source.rowsRead,
    uniqueSyntaxValidEmails: contactLoad.cleanup.summary.uniqueSyntaxValid,
    requiredDomains: state.domains.length,
    checkedDomains: 0,
    nextDomainStart: 0,
    batchLimit: LEADHUB_DNS_BATCH_LIMIT,
    contactSnapshotLoads: 1,
    protectedSnapshotKey: leadHubAuditKey(runId, "contact-snapshot")
  };
}

async function runLeadHubDataOnlyDnsBatch(env, payload) {
  const bucket = leadHubAuditBucket(env);
  const runId = clean(payload?.runId);
  const stateKey = leadHubAuditKey(runId, "dns-state");
  const state = await getProtectedAuditJson(bucket, stateKey);
  if (!state) {
    const error = new Error("DNS auditní běh nebyl nalezen.");
    error.status = 404;
    error.code = "vistos_data_only_run_not_found";
    throw error;
  }
  const start = Math.max(0, Number(payload?.domainStart) || 0);
  if (start !== Number(state.nextDomainStart || 0)) {
    const error = new Error(`DNS blok musí navázat od domény ${state.nextDomainStart || 0}.`);
    error.status = 409;
    error.code = "vistos_data_only_dns_sequence_mismatch";
    throw error;
  }
  const requestedLimit = Math.max(1, Number(payload?.domainLimit) || LEADHUB_DNS_BATCH_LIMIT);
  const limit = Math.min(requestedLimit, LEADHUB_DNS_BATCH_LIMIT);
  const domains = state.domains.slice(start, start + limit);
  const checkedAt = new Date().toISOString();
  const results = await mapConcurrent(domains, 10, async (domain) => ({ domain, ...(await dnsMailRouteStatus(domain)), checkedAt }));
  for (const result of results) state.results[result.domain] = { status: result.status, checkedAt: result.checkedAt };
  state.nextDomainStart = start + domains.length;
  state.updatedAt = checkedAt;
  await putProtectedAuditJson(bucket, stateKey, state);
  return {
    status: state.nextDomainStart >= state.domains.length ? "READY_TO_FINALIZE" : "RUNNING",
    runId,
    requiredDomains: state.domains.length,
    checkedDomains: Object.keys(state.results).length,
    nextDomainStart: state.nextDomainStart,
    done: state.nextDomainStart >= state.domains.length,
    results
  };
}

async function finalizeLeadHubDataOnlyAudit(env, payload) {
  const bucket = leadHubAuditBucket(env);
  const runId = clean(payload?.runId);
  const [snapshot, state] = await Promise.all([
    getProtectedAuditJson(bucket, leadHubAuditKey(runId, "contact-snapshot")),
    getProtectedAuditJson(bucket, leadHubAuditKey(runId, "dns-state"))
  ]);
  if (!snapshot || !state || snapshot.snapshotFingerprint !== state.snapshotFingerprint) {
    const error = new Error("Kontaktní snapshot a DNS stav nejsou dostupné nebo si neodpovídají.");
    error.status = 409;
    error.code = "vistos_data_only_snapshot_mismatch";
    throw error;
  }
  const artifact = {
    ...finalizeLeadHubDataOnlySnapshot(snapshot, state),
    finalizedAt: new Date().toISOString(),
    protectedOutputKey: leadHubAuditKey(runId, "data-only")
  };
  await putProtectedAuditJson(bucket, artifact.protectedOutputKey, artifact);
  if (artifact.status === "COMPLETE") {
    await putProtectedAuditJson(bucket, LEADHUB_DATA_ONLY_LATEST_KEY, {
      runId,
      protectedOutputKey: artifact.protectedOutputKey,
      finalizedAt: artifact.finalizedAt,
      snapshotFingerprint: artifact.snapshotFingerprint
    });
  }
  return artifact;
}

async function readLatestLeadHubDataOnlyAudit(env) {
  const bucket = leadHubAuditBucket(env);
  const latest = await getProtectedAuditJson(bucket, LEADHUB_DATA_ONLY_LATEST_KEY);
  if (!latest?.protectedOutputKey) {
    return {
      status: "PARTIAL",
      error: "DNS kontrola nebyla provedena nebo její výsledky nebyly předány.",
      code: "vistos_data_only_dns_evidence_missing",
      cleanup: null,
      protectedOutputKey: null
    };
  }
  const artifact = await getProtectedAuditJson(bucket, latest.protectedOutputKey);
  if (!artifact) {
    return {
      status: "PARTIAL",
      error: "Ukazatel posledního auditu odkazuje na chybějící chráněný artefakt.",
      code: "vistos_data_only_artifact_missing",
      cleanup: null,
      protectedOutputKey: latest.protectedOutputKey
    };
  }
  return artifact;
}

export async function runLeadHubDataOnlyAuditAction(env, action, payload = {}) {
  if (action === "initialize") return initializeLeadHubDataOnlyAudit(env);
  if (action === "dnsBatch") return runLeadHubDataOnlyDnsBatch(env, payload);
  if (action === "finalize") return finalizeLeadHubDataOnlyAudit(env, payload);
  const error = new Error("Neznámá akce Vistos DATA_ONLY auditu.");
  error.status = 400;
  error.code = "vistos_data_only_action_invalid";
  throw error;
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

export async function auditVistosContactsFull(env, options = {}) {
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

  const requestedScope = clean(options.scope) || "all";
  const validScopes = new Set(["all", "contact", "contract", "quote", "invoice", "order", "serviceList", "gdpr"]);
  const scope = validScopes.has(requestedScope) ? requestedScope : "all";
  const session = await loginVistosExecute(env);
  const incompleteEntities = [];

  if (scope === "gdpr") {
    const performanceEntities = {};
    let gdpr;
    try {
      const discovery = await discoverGdprEntities(env, session);
      const gdprLoad = await loadFullEntity(env, session, "GdprLegalReasonsDirectoryRow", [
        "Id", "Name", "Directory_FK", "Created", "Modified"
      ], { concurrency: 1 });
      const gdprIntegrity = pageIntegrity(gdprLoad);
      const incomplete = !gdprIntegrity.complete || Boolean(gdprLoad.missingFields.length);
      if (incomplete) incompleteEntities.push("GdprLegalReasonsDirectoryRow");
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
        incomplete
      };
    } catch (error) {
      incompleteEntities.push("GdprLegalReasonsDirectoryRow");
      gdpr = { ...fullEntityError("GdprLegalReasonsDirectoryRow", error), newsletterConsentDeterminable: false };
    }
    return {
      status: incompleteEntities.length ? "partial" : "complete",
      version: 2,
      scope,
      source: "vistos",
      readOnly: true,
      writesVistos: false,
      writesD1: false,
      writesLeadHub: false,
      imports: false,
      sendsCommunication: false,
      contact: null,
      documents: {},
      gdpr,
      performance: { pageSize: FULL_AUDIT_PAGE_SIZE, entities: performanceEntities, incompleteEntities },
      testedAt: new Date().toISOString()
    };
  }
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
  const selectedDocumentDefinitions = scope === "all"
    ? DOCUMENT_ENTITY_DEFINITIONS
    : DOCUMENT_ENTITY_DEFINITIONS.filter((definition) => definition.key === scope);
  const documentResults = await Promise.all(selectedDocumentDefinitions.map(async (definition) => {
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

  let gdpr = null;
  if (scope === "all") try {
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
    scope,
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

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

async function loadCleanupContacts(env, session) {
  const schema = await schemaForEntity(env, session, "Contact");
  const qualityFields = contactQualitySchema(schema.metadata);
  const requested = unique([
    "Id", "FirstName", "LastName", "MiddleName", "Email1", "EmailInvoicing",
    "Phone", "PhoneNumber", "Mobile", "Parent_FK", "Status_FK", "Created", "Modified",
    "Kontaktovatsms", "SendMailEnabled", "CallEnabled", "DoNotWorkCompany",
    "Gender_FK", "Salutation_FK", "SalutationText", "Osloveni5pad",
    ...qualityFields.map((column) => column.field)
  ]);
  const load = await loadAllEntityRows(env, session, "Contact", availableColumns(schema, requested), { concurrency: 4 });
  const cleanup = summarizeCleanupContacts(load.rows, schema.metadata);
  const dncField = confirmedDoNotContactField(schema.metadata);
  return { schema, qualityFields, requestedFields: availableColumns(schema, requested), load, cleanup, dncField };
}

function publicSchema(schema, relevantMetadata = schema.metadata) {
  return {
    columnCount: schema.columnCount,
    fields: schema.fields,
    relevantFields: relevantMetadata
  };
}

function dncFieldReport(contactLoad) {
  return {
    confirmed: contactLoad.cleanup.dncMappings.every((mapping) => mapping.confirmed),
    aggregateRule: "TRUE if any confirmed field blocks; UNKNOWN if any mapping/value is unconfirmed; FALSE only if every confirmed field explicitly allows contact",
    mappings: contactLoad.cleanup.dncMappings.map((mapping) => ({
      field: mapping.field,
      owner: mapping.owner,
      caption: mapping.caption,
      datatype: mapping.datatype,
      confirmed: mapping.confirmed,
      evidence: mapping.evidence,
      trueMeaning: mapping.confirmed ? mapping.trueMeaning : null,
      falseMeaning: mapping.confirmed ? mapping.falseMeaning : null,
      emptyMeaning: "UNKNOWN",
      values: valueDistribution(contactLoad.load.rows, mapping.field)
    })),
    newsletterConsent: "NOT_DETERMINABLE"
  };
}

function leftCompanyFieldReport(contactLoad) {
  return {
    confirmed: true,
    field: LEFT_COMPANY_FIELD.field,
    entity: LEFT_COMPANY_FIELD.entity,
    uiCaption: LEFT_COMPANY_FIELD.uiCaption,
    uiTooltip: LEFT_COMPANY_FIELD.uiTooltip,
    datatype: contactLoad.schema.metadata.find((column) => column.field === LEFT_COMPANY_FIELD.field)?.datatype || null,
    trueMeaning: LEFT_COMPANY_FIELD.trueMeaning,
    falseMeaning: LEFT_COMPANY_FIELD.falseMeaning,
    emptyMeaning: LEFT_COMPANY_FIELD.emptyMeaning,
    values: valueDistribution(contactLoad.load.rows, LEFT_COMPANY_FIELD.field),
    evidence: LEFT_COMPANY_FIELD.evidence,
    scope: "contact-only; the flag does not apply to other contacts of the same company"
  };
}

function salutationQaSample(qualityRows, limit = 100) {
  const selected = [];
  for (const status of ["SALUTATION_CANDIDATE", "SALUTATION_REVIEW", "SALUTATION_MISSING"]) {
    for (const quality of qualityRows.filter((row) => row.salutation.status === status)) {
      if (selected.length >= limit) break;
      selected.push(quality);
      if (selected.filter((row) => row.salutation.status === status).length >= Math.ceil(limit / 3)) break;
    }
  }
  for (const quality of qualityRows) {
    if (selected.length >= limit) break;
    if (!selected.some((row) => row.id === quality.id)) selected.push(quality);
  }
  return selected.slice(0, limit).map((quality) => ({
    contactId: quality.id,
    firstName: quality.firstName || null,
    lastName: quality.lastName || null,
    roleAddress: quality.roleAddress,
    status: quality.salutation.status,
    candidate: quality.salutation.candidate,
    source: quality.salutation.source,
    approved: false,
    reason: quality.salutation.reason
  }));
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function invoiceRequestedFields(schema) {
  const core = ["Id", "Customer_FK", "CustomerManager_FK", "Status_FK", "Created", "Modified"];
  const pattern = /invoice|cislo|č[ií]slo|number|symbol|customer|status|date|datum|due|splat|paid|uhrad|amount|price|castk|částk|celkem|dph|currency|mena|měna|created|modified/i;
  const discovered = schema.metadata.filter((column) => pattern.test(`${column.field} ${column.caption || ""}`)).map((column) => column.field);
  return availableColumns(schema, unique([...core, ...discovered])).slice(0, 40);
}

function contactMetricsForIds(ids, indexes, cleanupById) {
  const rows = [...ids].map((id) => indexes.byId.get(id)).filter(Boolean);
  const qualities = rows.map((row) => cleanupById.get(clean(row?.Id))).filter(Boolean);
  const emailCounts = new Map();
  for (const quality of cleanupById.values()) {
    if (quality.syntaxValid) emailCounts.set(quality.normalizedEmail, (emailCounts.get(quality.normalizedEmail) || 0) + 1);
  }
  const candidateRows = qualities.filter((quality) => quality.syntaxValid && !quality.typo && !quality.doNotContact
    && !quality.doNotContactUnknown && quality.leftCompanyState === "FALSE"
    && quality.nameOk && emailCounts.get(quality.normalizedEmail) === 1);
  const candidateByDomain = new Map();
  for (const quality of candidateRows) candidateByDomain.set(quality.domain, (candidateByDomain.get(quality.domain) || 0) + 1);
  return {
    contacts: ids.size,
    resolvedContacts: rows.length,
    contactsWithValidEmail1: qualities.filter((quality) => quality.syntaxValid).length,
    uniqueValidEmails: new Set(qualities.filter((quality) => quality.syntaxValid).map((quality) => quality.normalizedEmail)).size,
    doNotContact: qualities.filter((quality) => quality.doNotContact).length,
    leftCompany: qualities.filter((quality) => quality.leftCompany).length,
    leftCompanyUnknown: qualities.filter((quality) => quality.leftCompanyUnknown).length,
    nameOk: qualities.filter((quality) => quality.nameOk).length,
    candidateBeforeDns: candidateRows.length,
    candidateByDomain: [...candidateByDomain.entries()].map(([domain, contacts]) => ({ domain, contacts })).sort((a, b) => a.domain.localeCompare(b.domain))
  };
}

async function auditDocumentV4(env, session, contactLoad, key) {
  const definition = DOCUMENT_ENTITY_DEFINITIONS.find((item) => item.key === key);
  if (!definition) throw new Error(`Neznámý Vistos document scope ${key}.`);
  const schema = await schemaForEntity(env, session, definition.entityName);
  const columns = availableColumns(schema, ["Id", "Status_FK", definition.companyField, ...definition.directContactFields]);
  const indexes = contactIndexes(contactLoad.load.rows);
  const cleanupById = new Map(contactLoad.cleanup.qualityRows.map((quality) => [quality.id, quality]));
  const directIds = new Set();
  const companyIds = new Set();
  const statusCounts = new Map();
  let includedDocuments = 0;
  const page = await scanAllEntityRows(env, session, definition.entityName, columns, (rows) => {
    addStatusRows(statusCounts, rows);
    for (const row of rows) {
      if (definition.confirmedActiveStatusId && recordId(row, "Status_FK") !== definition.confirmedActiveStatusId) continue;
      includedDocuments += 1;
      const companyId = recordId(row, definition.companyField);
      if (companyId) companyIds.add(companyId);
      for (const field of definition.directContactFields) {
        const id = recordId(row, field);
        if (id) directIds.add(id);
      }
    }
  }, { concurrency: 2 });
  const companyContactIds = new Set();
  for (const companyId of companyIds) for (const contact of indexes.byCompany.get(companyId) || []) companyContactIds.add(clean(contact.Id));
  return {
    ok: true,
    entityName: definition.entityName,
    allDocuments: page.rowsRead,
    includedDocuments,
    inclusionRule: definition.confirmedActiveStatusId ? `Status_FK=${definition.confirmedActiveStatusId}` : "all rows; no active status inferred",
    statusFkDistribution: sortedStatusDistribution(statusCounts),
    uniqueCompanies: companyIds.size,
    directContacts: contactMetricsForIds(directIds, indexes, cleanupById),
    companyContacts: contactMetricsForIds(companyContactIds, indexes, cleanupById),
    overlapDirectCompany: [...directIds].filter((id) => companyContactIds.has(id)).length,
    performance: page
  };
}

async function auditInvoiceV4(env, session, contactLoad) {
  const schema = await schemaForEntity(env, session, "InvoiceIssued");
  const columns = invoiceRequestedFields(schema);
  const indexes = contactIndexes(contactLoad.load.rows);
  const cleanupById = new Map(contactLoad.cleanup.qualityRows.map((quality) => [quality.id, quality]));
  const directIds = new Set();
  const companyIds = new Set();
  const statusCounts = new Map();
  const firstHashById = new Map();
  const repeatedIds = new Set();
  let repeatedOccurrences = 0;
  let exactRepeatedOccurrences = 0;
  let differingRepeatedOccurrences = 0;
  const page = await scanAllEntityRows(env, session, "InvoiceIssued", columns, (rows) => {
    addStatusRows(statusCounts, rows);
    for (const row of rows) {
      const id = clean(row?.Id);
      const signature = hashString(columns.map((field) => `${field}=${clean(row?.[field])}|${recordId(row, field)}|${referenceCaption(row, field)}`).join("\u001f"));
      if (id && firstHashById.has(id)) {
        repeatedOccurrences += 1;
        repeatedIds.add(id);
        if (firstHashById.get(id) === signature) exactRepeatedOccurrences += 1;
        else differingRepeatedOccurrences += 1;
      } else if (id) firstHashById.set(id, signature);
      const companyId = recordId(row, "Customer_FK");
      if (companyId) companyIds.add(companyId);
      const directId = recordId(row, "CustomerManager_FK");
      if (directId) directIds.add(directId);
    }
  }, { concurrency: 2 });
  const companyContactIds = new Set();
  for (const companyId of companyIds) for (const contact of indexes.byCompany.get(companyId) || []) companyContactIds.add(clean(contact.Id));
  const duplicationReason = differingRepeatedOccurrences
    ? "Stejné InvoiceIssued Id se vrací s rozdílnými hodnotami alespoň v jednom načteném poli; to dokládá projekční/JOIN násobení, nikoli prosté identické kopie. Přesná child vazba nebyla bez dalšího metadata důkazu určena."
    : repeatedOccurrences
      ? "Opakované řádky jsou ve všech načtených polích shodné; zdroj opakování nelze z této projekce určit."
      : "Žádná opakovaná Id.";
  return {
    ok: true,
    schema: publicSchema(schema, schema.metadata.filter((column) => columns.includes(column.field))),
    requestedFields: columns,
    rawRows: page.rowsRead,
    uniqueInvoiceIds: firstHashById.size,
    repeatedIdCount: repeatedIds.size,
    repeatedIdOccurrences: repeatedOccurrences,
    exactRepeatedOccurrences,
    differingRepeatedOccurrences,
    duplicationReason,
    uniqueCompanies: companyIds.size,
    statusFkDistribution: sortedStatusDistribution(statusCounts),
    directContacts: contactMetricsForIds(directIds, indexes, cleanupById),
    companyContacts: contactMetricsForIds(companyContactIds, indexes, cleanupById),
    performance: page
  };
}

async function readEntityPageRange(env, session, entityName, columns, startPage, pageCount, requestedPageSize = FULL_AUDIT_PAGE_SIZE) {
  const pageSize = Math.max(1, Math.min(Number(requestedPageSize) || FULL_AUDIT_PAGE_SIZE, FULL_AUDIT_PAGE_SIZE));
  const first = await getVistosPage(env, session, entityName, columns, null, startPage * pageSize, pageSize);
  const total = Number(first.filtered || first.total) || first.rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const count = Math.max(1, Math.min(Number(pageCount) || 5, 10, Math.max(1, totalPages - startPage)));
  const pages = [first.rows];
  for (let offset = 1; offset < count && startPage + offset < totalPages; offset += 1) {
    const result = await getVistosPage(env, session, entityName, columns, null, (startPage + offset) * pageSize, pageSize);
    pages.push(result.rows);
  }
  return { rows: pages.flat(), total, totalPages, pageSize, startPage, pagesRead: pages.length, nextPage: startPage + pages.length, done: startPage + pages.length >= totalPages };
}

async function auditServiceListBlock(env, session, contactLoad, options) {
  const definition = DOCUMENT_ENTITY_DEFINITIONS.find((item) => item.key === "serviceList");
  const schema = await schemaForEntity(env, session, definition.entityName);
  const columns = availableColumns(schema, ["Id", "Status_FK", definition.companyField, ...definition.directContactFields]);
  const range = await readEntityPageRange(env, session, definition.entityName, columns, Math.max(0, Number(options.startPage) || 0), Math.max(1, Number(options.pageCount) || 5));
  const indexes = contactIndexes(contactLoad.load.rows);
  const cleanupById = new Map(contactLoad.cleanup.qualityRows.map((quality) => [quality.id, quality]));
  const directIds = new Set();
  const companyIds = new Set();
  for (const row of range.rows) {
    const companyId = recordId(row, definition.companyField);
    if (companyId) companyIds.add(companyId);
    for (const field of definition.directContactFields) {
      const id = recordId(row, field);
      if (id) directIds.add(id);
    }
  }
  const companyContactIds = new Set();
  for (const companyId of companyIds) for (const contact of indexes.byCompany.get(companyId) || []) companyContactIds.add(clean(contact.Id));
  const duplicateEmails = new Set(contactLoad.cleanup.duplicates.map((group) => group.normalizedEmail));
  const compactQuality = (ids) => [...ids].map((id) => cleanupById.get(id)).filter(Boolean).map((quality) => ({
    id: quality.id,
    syntaxValid: quality.syntaxValid,
    doNotContact: quality.doNotContact,
    doNotContactUnknown: quality.doNotContactUnknown,
    leftCompanyState: quality.leftCompanyState,
    leftCompany: quality.leftCompany,
    leftCompanyUnknown: quality.leftCompanyUnknown,
    nameOk: quality.nameOk,
    typo: Boolean(quality.typo),
    roleAddress: quality.roleAddress,
    duplicate: duplicateEmails.has(quality.normalizedEmail),
    domain: quality.domain
  }));
  return {
    ok: true,
    block: { totalRows: range.total, totalPages: range.totalPages, pageSize: range.pageSize, startPage: range.startPage, pagesRead: range.pagesRead, rowsRead: range.rows.length, nextPage: range.nextPage, done: range.done },
    directContactIds: [...directIds],
    companyContactIds: [...companyContactIds],
    directContactQuality: compactQuality(directIds),
    companyContactQuality: compactQuality(companyContactIds),
    directContacts: contactMetricsForIds(directIds, indexes, cleanupById),
    companyContacts: contactMetricsForIds(companyContactIds, indexes, cleanupById)
  };
}

async function auditDomainBatch(contactLoad, options) {
  const start = Math.max(0, Number(options.domainStart) || 0);
  const limit = Math.max(1, Math.min(Number(options.domainLimit) || 50, 500));
  const domains = contactLoad.cleanup.uniqueDomains.slice(start, start + limit);
  const results = await mapConcurrent(domains, 10, async (domain) => ({ domain, ...(await dnsMailRouteStatus(domain)) }));
  const duplicateEmails = new Set(contactLoad.cleanup.duplicates.map((group) => group.normalizedEmail));
  const byDomain = new Map();
  for (const quality of contactLoad.cleanup.qualityRows) {
    if (!domains.includes(quality.domain)) continue;
    const rows = byDomain.get(quality.domain) || [];
    rows.push(quality);
    byDomain.set(quality.domain, rows);
  }
  for (const result of results) {
    const rows = byDomain.get(result.domain) || [];
    result.contactOccurrences = rows.length;
    result.uniqueEmails = new Set(rows.map((row) => row.normalizedEmail)).size;
    result.readyForReview = result.status === "VALID_DOMAIN"
      ? rows.filter((row) => row.syntaxValid && !row.typo && !row.doNotContact && !row.doNotContactUnknown
        && row.leftCompanyState === "FALSE" && !duplicateEmails.has(row.normalizedEmail) && row.nameOk).length
      : 0;
  }
  return { domainStart: start, domainLimit: limit, totalDomains: contactLoad.cleanup.uniqueDomains.length, nextDomainStart: start + domains.length, done: start + domains.length >= contactLoad.cleanup.uniqueDomains.length, results };
}

async function auditGdprV4(env, session) {
  const entities = [];
  for (const entityName of ["GdprLegalReasons", "GdprLegalReasonsDirectoryRow"]) {
    const schema = await schemaForEntity(env, session, entityName);
    const requested = availableColumns(schema, unique(["Id", "Name", "Directory_FK", "StartDate", "EndDate", "Created", "Modified", ...schema.metadata.map((column) => column.field)]));
    const load = await loadAllEntityRows(env, session, entityName, requested, { concurrency: 1 });
    const usedValues = {};
    for (const field of requested) usedValues[field] = valueDistribution(load.rows, field);
    entities.push({ entityName, rows: load.rows.length, sourceTotal: load.total, schema: publicSchema(schema), usedValues });
  }
  return {
    entities,
    newsletterConsentDeterminable: false,
    consentReason: "Žádné pole ani hodnota nebyly bez jednoznačného právního významu interpretovány jako newsletterový souhlas."
  };
}

async function auditDocumentRawBlock(env, session, key, options) {
  const definition = key === "invoice"
    ? { entityName: "InvoiceIssued", companyField: "Customer_FK", directContactFields: ["CustomerManager_FK"] }
    : DOCUMENT_ENTITY_DEFINITIONS.find((item) => item.key === key);
  if (!definition) throw new Error(`Neznámý Vistos raw document scope ${key}.`);
  const schema = await schemaForEntity(env, session, definition.entityName);
  const columns = key === "invoice"
    ? availableColumns(schema, ["Id", "Customer_FK", "CustomerManager_FK", "Status_FK"])
    : availableColumns(schema, ["Id", "Status_FK", definition.companyField, ...definition.directContactFields]);
  const range = await readEntityPageRange(env, session, definition.entityName, columns, Math.max(0, Number(options.startPage) || 0), Math.max(1, Number(options.pageCount) || 5));
  return {
    entityName: definition.entityName,
    schema: publicSchema(schema, schema.metadata.filter((column) => columns.includes(column.field))),
    requestedFields: columns,
    block: { totalRows: range.total, totalPages: range.totalPages, pageSize: range.pageSize, startPage: range.startPage, pagesRead: range.pagesRead, rowsRead: range.rows.length, nextPage: range.nextPage, done: range.done },
    rows: range.rows.map((row) => ({
      id: clean(row?.Id),
      signature: hashString(columns.map((field) => `${field}=${clean(row?.[field])}|${recordId(row, field)}|${referenceCaption(row, field)}`).join("\u001f")),
      companyId: recordId(row, definition.companyField) || null,
      directContactIds: definition.directContactFields.map((field) => recordId(row, field)).filter(Boolean),
      statusId: recordId(row, "Status_FK") || null,
      statusCaption: referenceCaption(row, "Status_FK") || null
    }))
  };
}

export async function auditVistosContactCleanupV4(env, options = {}) {
  const scope = clean(options.scope) || "contact";
  const base = {
    version: 4, scope, source: "vistos", readOnly: true,
    writesVistos: false, writesLeadHub: false, imports: false, sendsEmail: false, sendsSms: false,
    mailboxVerificationAvailable: false,
    mailboxVerificationReason: "V repozitáři nebyla nalezena specializovaná mailbox-verification služba; SendGrid je odesílací provider a pro tento audit nebyl použit."
  };
  if (scope === "leadHubDataOnly") {
    const artifact = await readLatestLeadHubDataOnlyAudit(env);
    return {
      ...base,
      ...artifact,
      status: clean(artifact.status).toLowerCase() || "partial",
      documentTargeting: "UNVERIFIED_NOT_USED",
      contactSnapshotLoads: 0,
      testedAt: new Date().toISOString()
    };
  }
  if (!isVistosExecuteConfigured(env)) return { ...base, status: "not_configured" };
  const session = await loginVistosExecute(env);
  if (scope === "invoiceBlock") return { ...base, status: "complete", rawDocument: await auditDocumentRawBlock(env, session, "invoice", options), testedAt: new Date().toISOString() };
  if (scope === "serviceListRawBlock") return { ...base, status: "complete", rawDocument: await auditDocumentRawBlock(env, session, "serviceList", options), testedAt: new Date().toISOString() };
  const contactLoad = await loadCleanupContacts(env, session);
  if (scope === "domains") return { ...base, status: "complete", domains: await auditDomainBatch(contactLoad, options), testedAt: new Date().toISOString() };
  if (scope === "duplicates") {
    const start = Math.max(0, Number(options.detailStart) || 0);
    const limit = Math.max(1, Math.min(Number(options.detailLimit) || 100, 250));
    return { ...base, status: "complete", totalDuplicateGroups: contactLoad.cleanup.duplicates.length, detailStart: start, nextDetailStart: start + Math.min(limit, Math.max(0, contactLoad.cleanup.duplicates.length - start)), details: contactLoad.cleanup.duplicates.slice(start, start + limit), testedAt: new Date().toISOString() };
  }
  if (scope === "invoice") return { ...base, status: "complete", invoice: await auditInvoiceV4(env, session, contactLoad), testedAt: new Date().toISOString() };
  if (["contract", "quote", "order"].includes(scope)) return { ...base, status: "complete", document: await auditDocumentV4(env, session, contactLoad, scope), testedAt: new Date().toISOString() };
  if (scope === "gdpr") return { ...base, status: "complete", gdpr: await auditGdprV4(env, session), testedAt: new Date().toISOString() };
  if (scope === "serviceListBlock") return { ...base, status: "complete", serviceList: await auditServiceListBlock(env, session, contactLoad, options), testedAt: new Date().toISOString() };
  const integrity = pageIntegrity(contactLoad.load);
  return {
    ...base,
    status: integrity.complete ? "complete" : "partial",
    contact: {
      schema: publicSchema(contactLoad.schema),
      relevantCommunicationFields: contactLoad.qualityFields.map((column) => ({ ...column, values: valueDistribution(contactLoad.load.rows, column.field) })),
      doNotContactField: dncFieldReport(contactLoad),
      leftCompanyField: leftCompanyFieldReport(contactLoad),
      ...contactLoad.cleanup.summary,
      suspiciousTypoCount: contactLoad.cleanup.suspiciousRows.length,
      suspiciousTypoSample: contactLoad.cleanup.suspiciousRows.slice(0, 250),
      salutationQaSample: salutationQaSample(contactLoad.cleanup.qualityRows, 100),
      compactQuality: (() => {
        const duplicateEmails = new Set(contactLoad.cleanup.duplicates.map((group) => group.normalizedEmail));
        return contactLoad.cleanup.qualityRows.map((quality) => ({
          id: quality.id,
          parentId: quality.parentId || null,
          normalizedEmail: quality.normalizedEmail,
          domain: quality.domain,
          syntaxValid: quality.syntaxValid,
          typo: Boolean(quality.typo),
          doNotContact: quality.doNotContact,
          doNotContactUnknown: quality.doNotContactUnknown,
          doNotContactState: quality.doNotContactState,
          leftCompanyState: quality.leftCompanyState,
          leftCompany: quality.leftCompany,
          leftCompanyUnknown: quality.leftCompanyUnknown,
          duplicate: duplicateEmails.has(quality.normalizedEmail),
          nameOk: quality.nameOk,
          roleAddress: quality.roleAddress,
          salutationStatus: quality.salutation.status
        }));
      })(),
      performance: { pageSize: contactLoad.load.pageSize, pagesRead: contactLoad.load.pagesRead, rowsRead: contactLoad.load.rows.length, sourceTotal: contactLoad.load.total, duplicatePageIds: integrity.duplicateIds }
    },
    testedAt: new Date().toISOString()
  };
}
