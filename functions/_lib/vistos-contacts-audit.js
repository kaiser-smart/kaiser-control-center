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
