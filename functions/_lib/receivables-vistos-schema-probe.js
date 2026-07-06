import {
  VistosExecuteError,
  cleanVistosValue,
  extractVistosRows,
  fetchVistosExecute,
  getAllVistosPages,
  isVistosExecuteConfigured,
  loginVistosExecute
} from "./vistos-execute-client.js";

const VISTOS_NOT_CONFIGURED_MESSAGE = "Vistos API není nakonfigurováno";
const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 2;
const MAX_PAGE_SIZE = 1000;
const MAX_PAGES = 4;
const DEFAULT_MAX_COLUMNS_PER_ENTITY = 80;
const MAX_COLUMNS_PER_ENTITY = 180;

export const VISTOS_RECEIVABLES_SCHEMA_TARGET_ENTITIES = [
  "DirectoryWithBranch",
  "Directory",
  "ContactList",
  "ContactListRow",
  "Contact",
  "Customer",
  "CustomerBranch",
  "Company",
  "CompanyBranch",
  "Partner",
  "AddressBook"
];

const DB_OBJECT_COLUMN_ATTEMPTS = [
  {
    key: "db_object_extended",
    columns: [
      "Id",
      "Name",
      "Caption",
      "EntityName",
      "TableName",
      "DbName",
      "Description",
      "Status_FK"
    ]
  },
  {
    key: "db_object_core",
    columns: ["Id", "Name", "Caption"]
  }
];

const DB_COLUMN_COLUMN_ATTEMPTS = [
  {
    key: "db_column_extended_by_object_fk",
    filterField: "DbObject_FK",
    columns: [
      "Id",
      "Name",
      "Caption",
      "ColumnName",
      "DbColumnName",
      "DbObject_FK",
      "Type_FK",
      "DataType",
      "Nullable",
      "IsNullable",
      "IsReadOnly",
      "IsVisible",
      "VisibleOnGrid",
      "IsVisibleOnFilter",
      "LocalizationString",
      "ReferenceDbObject_FK"
    ]
  },
  {
    key: "db_column_core_by_object_fk",
    filterField: "DbObject_FK",
    columns: ["Id", "Name", "Caption", "ColumnName", "DbObject_FK", "Type_FK"]
  },
  {
    key: "db_column_core_by_record_id",
    filterField: "DbObject_FK_RecordId",
    columns: ["Id", "Name", "Caption", "ColumnName", "DbObject_FK", "Type_FK"]
  }
];

const FIELD_CANDIDATE_GROUPS = [
  {
    key: "stableId",
    label: "stabilní ID",
    tokens: ["id", "recordid", "systemoveid", "systemid", "directoryfk", "customerfk"]
  },
  {
    key: "companyName",
    label: "název firmy",
    tokens: ["name", "nazev", "caption", "companyname", "customername"]
  },
  {
    key: "branchName",
    label: "název pobočky",
    tokens: ["branch", "pobocka", "directorybranch", "customerbranch"]
  },
  {
    key: "ico",
    label: "IČO",
    tokens: ["ico", "ic", "regnumber", "registrationnumber", "customerregnumber"]
  },
  {
    key: "dic",
    label: "DIČ",
    tokens: ["dic", "vat", "vatnumber", "customervatnumber"]
  },
  {
    key: "billingEmail",
    label: "fakturační e-mail",
    tokens: ["billingemail", "invoiceemail", "emailinvoicing", "fakturacniemail", "fakturacnie-mail", "fakturace"]
  },
  {
    key: "email",
    label: "e-mail",
    tokens: ["email", "email1", "e-mail", "senderemail"]
  },
  {
    key: "phone",
    label: "telefon",
    tokens: ["phone", "phonenumber", "mobile", "telefon", "mobil"]
  },
  {
    key: "standardDueDays",
    label: "splatnost",
    tokens: ["invoiceduedays", "standardduedays", "duedays", "splatnost"]
  },
  {
    key: "parent",
    label: "nadřazená firma",
    tokens: ["parentfk", "masterparent", "mainprojection", "rodic", "sidlo"]
  }
];

function clean(value) {
  return cleanVistosValue(value);
}

function positiveInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(number), max));
}

function previewOptions(options = {}) {
  return {
    pageSize: positiveInteger(options.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    maxPages: positiveInteger(options.maxPages, DEFAULT_MAX_PAGES, MAX_PAGES),
    maxColumnsPerEntity: positiveInteger(
      options.maxColumnsPerEntity,
      DEFAULT_MAX_COLUMNS_PER_ENTITY,
      MAX_COLUMNS_PER_ENTITY
    )
  };
}

function normalizeKey(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function firstValue(row = {}, keys = []) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && clean(value) !== "") {
      return clean(value);
    }
  }
  return "";
}

function rowObjectId(row = {}) {
  return firstValue(row, ["Id", "Systémové ID", "DbObjectId", "DbObject_FK_RecordId"]);
}

function rowObjectName(row = {}) {
  return firstValue(row, ["Name", "EntityName", "Caption", "DbName", "TableName"]);
}

function serializeProbeError(error) {
  if (error instanceof VistosExecuteError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      status: error.status
    };
  }

  return {
    ok: false,
    code: "probe_failed",
    message: clean(error?.message).slice(0, 240) || "Neznámá chyba probe.",
    status: 500
  };
}

function columnName(column = {}) {
  return firstValue(column, ["ColumnName", "Name", "DbColumnName", "Caption", "LocalizationString", "name", "caption"]);
}

function columnCaption(column = {}) {
  return firstValue(column, ["LocalizationString", "Caption", "Name", "ColumnName", "DbColumnName", "caption", "name"]);
}

function compactColumn(column = {}) {
  const name = columnName(column);
  return {
    name,
    caption: columnCaption(column),
    type: firstValue(column, ["Type_FK", "DataType", "Type", "EnumType"]),
    nullable: column.Nullable ?? column.IsNullable ?? null,
    readOnly: column.IsReadOnly ?? null,
    visible: column.VisibleOnGrid ?? column.IsVisible ?? column.IsVisibleOnFilter ?? null,
    reference: firstValue(column, ["ReferenceDbObject_FK", "ReferenceDbObject_FK_Caption"]),
    rawKeys: Object.keys(column || {}).slice(0, 16)
  };
}

function columnsFromSchemaBody(body = {}) {
  const data = body?.data && typeof body.data === "object" ? body.data : {};
  if (Array.isArray(data.Columns)) return data.Columns.filter((item) => item && typeof item === "object");
  if (Array.isArray(data.columns)) return data.columns.filter((item) => item && typeof item === "object");
  return extractVistosRows(body);
}

async function probeSchemaEntity(env, session, entityName, options) {
  try {
    const result = await fetchVistosExecute(env, "GetSchemaEntity", {
      EntityName: entityName,
      Force: false
    }, session.cookieHeader);
    const data = result.body?.data && typeof result.body.data === "object" ? result.body.data : {};
    const columns = columnsFromSchemaBody(result.body).map(compactColumn);
    return {
      entityName,
      method: "GetSchemaEntity",
      ok: true,
      status: result.status,
      entityListTitle: clean(data.EntityListTitle),
      accessRight: data.AccessRight || null,
      readAllowed: data.AccessRight?.Read ?? null,
      columnCount: columns.length,
      columns: columns.slice(0, options.maxColumnsPerEntity),
      returnedKeys: Object.keys(data || {}).slice(0, 20)
    };
  } catch (error) {
    return {
      entityName,
      method: "GetSchemaEntity",
      ...serializeProbeError(error),
      columnCount: 0,
      columns: []
    };
  }
}

async function loadMetadataPage(env, session, entityName, attempts, options) {
  const diagnostics = [];
  for (const attempt of attempts) {
    try {
      const page = await getAllVistosPages(
        env,
        session,
        entityName,
        attempt.columns,
        attempt.filter || null,
        { pageSize: options.pageSize, maxPages: options.maxPages }
      );
      return {
        ok: true,
        entityName,
        key: attempt.key,
        columns: attempt.columns,
        rows: page.rows,
        total: page.total || page.rows.length,
        filtered: page.filtered || page.rows.length,
        capped: Boolean(page.capped),
        diagnostics: [...diagnostics, {
          key: attempt.key,
          ok: true,
          rows: page.rows.length,
          total: page.total || page.rows.length,
          capped: Boolean(page.capped)
        }]
      };
    } catch (error) {
      diagnostics.push({
        key: attempt.key,
        columns: attempt.columns,
        ...serializeProbeError(error)
      });
    }
  }

  return {
    ok: false,
    entityName,
    key: "",
    columns: [],
    rows: [],
    total: 0,
    filtered: 0,
    capped: false,
    diagnostics
  };
}

function matchDbObjectRows(rows = [], targetEntities = []) {
  const matches = [];

  for (const targetEntity of targetEntities) {
    const targetKey = normalizeKey(targetEntity);
    const row = rows.find((item) => {
      const values = [
        firstValue(item, ["Name"]),
        firstValue(item, ["EntityName"]),
        firstValue(item, ["Caption"]),
        firstValue(item, ["DbName"]),
        firstValue(item, ["TableName"])
      ].map(normalizeKey).filter(Boolean);
      return values.includes(targetKey) || values.some((value) => value.endsWith(targetKey));
    });

    if (!row) {
      matches.push({
        entityName: targetEntity,
        found: false,
        dbObjectId: "",
        name: "",
        caption: "",
        rawKeys: []
      });
      continue;
    }

    matches.push({
      entityName: targetEntity,
      found: true,
      dbObjectId: rowObjectId(row),
      name: rowObjectName(row),
      caption: firstValue(row, ["Caption", "Description"]),
      tableName: firstValue(row, ["TableName", "DbName"]),
      rawKeys: Object.keys(row || {}).slice(0, 16)
    });
  }

  return matches;
}

function dbObjectFilter(objectId, filterField) {
  return filterField ? { [filterField]: objectId } : null;
}

async function loadDbColumnsForObject(env, session, dbObject, options) {
  if (!dbObject?.found || !dbObject.dbObjectId) {
    return {
      entityName: dbObject?.entityName || "",
      dbObjectId: dbObject?.dbObjectId || "",
      ok: false,
      skipped: true,
      reason: "DB_OBJECT_NOT_FOUND",
      rows: [],
      columns: [],
      diagnostics: []
    };
  }

  const diagnostics = [];
  for (const attempt of DB_COLUMN_COLUMN_ATTEMPTS) {
    try {
      const page = await getAllVistosPages(
        env,
        session,
        "DbColumn",
        attempt.columns,
        dbObjectFilter(dbObject.dbObjectId, attempt.filterField),
        { pageSize: options.pageSize, maxPages: options.maxPages }
      );
      const columns = page.rows.map(compactColumn);
      return {
        entityName: dbObject.entityName,
        dbObjectId: dbObject.dbObjectId,
        ok: true,
        key: attempt.key,
        filterField: attempt.filterField,
        returnedRows: page.rows.length,
        totalRows: page.total || page.rows.length,
        capped: Boolean(page.capped),
        rows: page.rows,
        columns: columns.slice(0, options.maxColumnsPerEntity),
        diagnostics: [...diagnostics, {
          key: attempt.key,
          ok: true,
          returnedRows: page.rows.length,
          totalRows: page.total || page.rows.length,
          capped: Boolean(page.capped)
        }]
      };
    } catch (error) {
      diagnostics.push({
        key: attempt.key,
        filterField: attempt.filterField,
        ...serializeProbeError(error)
      });
    }
  }

  return {
    entityName: dbObject.entityName,
    dbObjectId: dbObject.dbObjectId,
    ok: false,
    skipped: false,
    reason: "DB_COLUMN_READ_FAILED",
    returnedRows: 0,
    totalRows: 0,
    rows: [],
    columns: [],
    diagnostics
  };
}

function mergeColumns(schemaColumns = [], dbColumns = []) {
  const byName = new Map();
  for (const column of [...schemaColumns, ...dbColumns]) {
    const name = columnName(column) || column.name;
    const key = normalizeKey(name);
    if (!key || byName.has(key)) continue;
    byName.set(key, compactColumn(column));
  }
  return [...byName.values()];
}

function candidateFields(columns = []) {
  const result = {};
  for (const group of FIELD_CANDIDATE_GROUPS) {
    result[group.key] = columns
      .filter((column) => {
        const haystack = normalizeKey(`${column.name || ""} ${column.caption || ""}`);
        return group.tokens.some((token) => haystack.includes(normalizeKey(token)));
      })
      .map((column) => column.name || column.caption)
      .filter(Boolean)
      .slice(0, 10);
  }
  return result;
}

function buildEntitySummaries(schemaAttempts = [], dbColumnResults = []) {
  return schemaAttempts.map((schema) => {
    const dbColumns = dbColumnResults.find((item) => item.entityName === schema.entityName);
    const merged = mergeColumns(schema.columns || [], dbColumns?.columns || []);
    return {
      entityName: schema.entityName,
      schemaOk: Boolean(schema.ok),
      dbColumnOk: Boolean(dbColumns?.ok),
      dbObjectId: dbColumns?.dbObjectId || "",
      readAllowed: schema.readAllowed ?? null,
      schemaColumnCount: schema.columnCount || 0,
      dbColumnCount: dbColumns?.returnedRows || 0,
      mergedColumnCount: merged.length,
      fields: merged.slice(0, 40),
      candidates: candidateFields(merged),
      blocking: [
        !schema.ok ? "GET_SCHEMA_ENTITY_FAILED" : "",
        dbColumns?.reason && !dbColumns?.ok ? dbColumns.reason : "",
        schema.readAllowed === false ? "SCHEMA_READ_RIGHT_FALSE" : ""
      ].filter(Boolean)
    };
  });
}

function countEntitiesWithCandidate(entitySummaries = [], key) {
  return entitySummaries.reduce((sum, item) => sum + (item.candidates?.[key]?.length ? 1 : 0), 0);
}

function buildRecommendedNextStep(entitySummaries = [], dbObjectMatches = []) {
  const directoryWithBranch = entitySummaries.find((item) => item.entityName === "DirectoryWithBranch");
  const directory = entitySummaries.find((item) => item.entityName === "Directory");
  const hasBillingEmail = entitySummaries.some((item) => item.candidates?.billingEmail?.length);
  const hasDueDays = entitySummaries.some((item) => item.candidates?.standardDueDays?.length);
  const hasIco = entitySummaries.some((item) => item.candidates?.ico?.length);
  const missingObjects = dbObjectMatches.filter((item) => !item.found).map((item) => item.entityName);
  const blockers = [];

  if (!directoryWithBranch?.schemaOk && !directory?.schemaOk) blockers.push("DIRECTORY_SCHEMA_NOT_READABLE");
  if (!hasIco) blockers.push("ICO_FIELD_NOT_FOUND_IN_METADATA");
  if (!hasBillingEmail) blockers.push("BILLING_EMAIL_FIELD_NOT_FOUND_IN_METADATA");
  if (!hasDueDays) blockers.push("DUE_DAYS_FIELD_NOT_FOUND_IN_METADATA");
  if (missingObjects.includes("ContactList") || missingObjects.includes("ContactListRow")) {
    blockers.push("CONTACT_METADATA_OBJECT_NOT_CONFIRMED");
  }

  return {
    metadataProbeUsable: blockers.length === 0,
    blockingReasons: blockers,
    recommendedNextStep: blockers.length
      ? "Nejdřív vyřešit chybějící metadata/oprávnění pro firemní master data a kontakty, potom teprve pokračovat v ledger mappingu."
      : "Použít potvrzená metadata pro další read-only resolver firem a až samostatně potvrdit ostrý ledger import."
  };
}

function notConfiguredSchemaProbe(normalizedOptions) {
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
    createsLegalPackages: false,
    targetEntities: VISTOS_RECEIVABLES_SCHEMA_TARGET_ENTITIES,
    schemaEntityAttempts: [],
    dbObjectProbe: {
      ok: false,
      rowsLoaded: 0,
      matchedObjects: [],
      diagnostics: []
    },
    dbColumnProbe: {
      columnsByEntity: []
    },
    entitySummaries: [],
    summary: {
      dbObjectsLoaded: 0,
      matchedObjects: 0,
      entitiesWithSchema: 0,
      entitiesWithDbColumns: 0,
      entitiesWithBillingEmailCandidate: 0,
      entitiesWithPhoneCandidate: 0,
      entitiesWithDueDaysCandidate: 0
    },
    readiness: {
      metadataProbeUsable: false,
      blockingReasons: ["VISTOS_NOT_CONFIGURED"],
      recommendedNextStep: "Nastavit Vistos API secrets a znovu spustit read-only schema probe."
    },
    previewLimits: normalizedOptions,
    loadedAt: new Date().toISOString()
  };
}

export async function createReceivablesVistosSchemaProbeFromSession(env, session, options = {}) {
  const normalizedOptions = previewOptions(options);
  const schemaEntityAttempts = [];
  for (const entityName of VISTOS_RECEIVABLES_SCHEMA_TARGET_ENTITIES) {
    schemaEntityAttempts.push(await probeSchemaEntity(env, session, entityName, normalizedOptions));
  }

  const dbObjectPage = await loadMetadataPage(
    env,
    session,
    "DbObject",
    DB_OBJECT_COLUMN_ATTEMPTS,
    normalizedOptions
  );
  const matchedObjects = matchDbObjectRows(dbObjectPage.rows, VISTOS_RECEIVABLES_SCHEMA_TARGET_ENTITIES);
  const columnsByEntity = [];
  for (const match of matchedObjects) {
    columnsByEntity.push(await loadDbColumnsForObject(env, session, match, normalizedOptions));
  }

  const entitySummaries = buildEntitySummaries(schemaEntityAttempts, columnsByEntity);
  const readiness = buildRecommendedNextStep(entitySummaries, matchedObjects);

  return {
    apiStatus: "ready",
    message: "Vistos schema/metadata probe načtený. Jde jen o read-only diagnostiku bez D1 zápisu, ratingu, KB plateb a komunikace.",
    readOnly: true,
    writesD1: false,
    createsReceivableRecords: false,
    sendsCustomerCommunication: false,
    startsAutomation: false,
    calculatesRealRating: false,
    importsKbPayments: false,
    createsLegalPackages: false,
    targetEntities: VISTOS_RECEIVABLES_SCHEMA_TARGET_ENTITIES,
    schemaEntityAttempts,
    dbObjectProbe: {
      ok: dbObjectPage.ok,
      key: dbObjectPage.key,
      rowsLoaded: dbObjectPage.rows.length,
      totalRows: dbObjectPage.total || dbObjectPage.rows.length,
      capped: Boolean(dbObjectPage.capped),
      matchedObjects,
      diagnostics: dbObjectPage.diagnostics
    },
    dbColumnProbe: {
      columnsByEntity: columnsByEntity.map((item) => ({
        entityName: item.entityName,
        dbObjectId: item.dbObjectId,
        ok: item.ok,
        skipped: Boolean(item.skipped),
        reason: item.reason || "",
        key: item.key || "",
        filterField: item.filterField || "",
        returnedRows: item.returnedRows || 0,
        totalRows: item.totalRows || 0,
        capped: Boolean(item.capped),
        columns: (item.columns || []).slice(0, normalizedOptions.maxColumnsPerEntity),
        diagnostics: item.diagnostics || []
      }))
    },
    entitySummaries,
    summary: {
      dbObjectsLoaded: dbObjectPage.rows.length,
      matchedObjects: matchedObjects.filter((item) => item.found).length,
      entitiesWithSchema: schemaEntityAttempts.filter((item) => item.ok).length,
      entitiesWithDbColumns: columnsByEntity.filter((item) => item.ok).length,
      entitiesWithBillingEmailCandidate: countEntitiesWithCandidate(entitySummaries, "billingEmail"),
      entitiesWithPhoneCandidate: countEntitiesWithCandidate(entitySummaries, "phone"),
      entitiesWithDueDaysCandidate: countEntitiesWithCandidate(entitySummaries, "standardDueDays"),
      entitiesWithIcoCandidate: countEntitiesWithCandidate(entitySummaries, "ico"),
      entitiesWithDicCandidate: countEntitiesWithCandidate(entitySummaries, "dic")
    },
    readiness,
    previewLimits: normalizedOptions,
    loadedAt: new Date().toISOString()
  };
}

export async function createReceivablesVistosSchemaProbe(env, options = {}) {
  const normalizedOptions = previewOptions(options);
  if (!isVistosExecuteConfigured(env)) {
    return notConfiguredSchemaProbe(normalizedOptions);
  }

  const session = await loginVistosExecute(env);
  return createReceivablesVistosSchemaProbeFromSession(env, session, normalizedOptions);
}

export function receivablesVistosSchemaProbeError(error) {
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
      error: "Vistos schema/metadata probe se teď nepodařilo spustit.",
      detail: clean(error?.message).slice(0, 240) || "Neznámá chyba backendu.",
      apiStatus: "waiting"
    }
  };
}
