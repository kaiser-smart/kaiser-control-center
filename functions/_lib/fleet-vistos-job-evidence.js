import { getVistosById, getVistosPage, getVistosSchemaEntity, loginVistosExecute } from "./vistos-execute-client.js";
import { vistosSchemaColumnNames, vistosSchemaColumnMetadata } from "./vistos-contacts-audit.js";
const CANDIDATES = Object.freeze({
  ServiceList: ["Id", "Number", "IsDone", "Status_FK", "DateOfRealization", "DateStart", "DateEnd", "StartOfResolution", "EndOfResolution", "Auto_FK", "AllocatedVehicle", "RidicContact_FK", "Currency_FK", "PriceWithoutTax", "PriceTax", "PriceWithTax", "TransferredTaxLiability", "MasterParent_FK", "Created", "Modified"],
  ServiceListItem: ["Id", "ServiceList_FK", "MasterParent_FK", "ContractRow_FK", "Product_FK", "Quantity", "c_OrderedQuantity", "UnitPrice", "ListPrice", "UnitPriceDiscount", "UnitPriceDiscountPercentage", "TaxIncluded", "TaxRate_FK", "PriceWithoutTax", "PriceTax", "PriceWithTax", "Currency_FK", "Status_FK", "IsDone", "DateOfRealization", "Created", "Modified"]
});
function scalar(value) { return value === null || ["string", "number", "boolean"].includes(typeof value) ? value : null; }
function evidenceValue(row, field) {
  if (field.endsWith("_FK") || field === "AllocatedVehicle") {
    const direct = row[field];
    const recordIds = Array.isArray(direct) ? direct.map(value => scalar(value?.Id ?? value?.id ?? (Number.isSafeInteger(value) && value > 0 ? value : null))) : null;
    return { ...(recordIds ? { arrayLength: direct.length, recordIds: [...new Set(recordIds.filter(value => value !== null))], unresolvedArrayItems: recordIds.filter(value => value === null).length } : {}), recordId: scalar(row[field + "_RecordId"] ?? direct?.Id ?? direct?.id ?? (Number.isSafeInteger(direct) && direct > 0 ? direct : null)), valueShape: Array.isArray(direct) ? "array" : direct === null ? "null" : typeof direct };
  }
  return scalar(row[field] ?? null);
}
export async function auditFleetVistosJobEvidence(env, options = {}) {
  const base = { source: "vistos", readOnly: true, writesVistos: false, writesD1: false, sendsCommunication: false, mappingStatus: "requires_semantic_verification", testedAt: new Date().toISOString() };
  const sample = options.sample === true;
  const start = Math.max(0, Math.min(10000000, Math.floor(Number(options.start) || 0)));
  const detailIds = { ServiceList: options.jobId, ServiceListItem: options.itemId };
  for (const value of Object.values(detailIds)) {
    if (value !== undefined && value !== null && value !== "" && (!Number.isSafeInteger(Number(value)) || Number(value) <= 0)) throw new RangeError("Invalid source record ID.");
  }
  let session;
  try { session = await loginVistosExecute(env); } catch (error) { return { ...base, status: "blocked", errorCode: String(error?.code || "vistos_login_unavailable"), entities: [] }; }
  const entities = [];
  for (const [entityName, candidates] of Object.entries(CANDIDATES)) {
    try {
      const rawSchema = await getVistosSchemaEntity(env, session, entityName);
      const fields = vistosSchemaColumnNames(rawSchema);
      const columns = candidates.filter(field => fields.includes(field));
      const result = { entityName, status: fields.includes("Id") ? "schema_available" : "blocked", fields, metadata: vistosSchemaColumnMetadata(rawSchema), requestedFields: columns, missingCandidateFields: candidates.filter(field => !fields.includes(field)), sampleIsNotMappingProof: true };
      if (sample && fields.includes("Id")) {
        const page = await getVistosPage(env, session, entityName, columns, null, start, 5);
        result.page = { start, limit: 5, total: page.countEvidence.totalReported ? page.total : null, filtered: page.countEvidence.filteredReported ? page.filtered : null, rowsRead: page.rows.length, completeImport: false };
        result.rows = page.rows.map(row => Object.fromEntries(columns.map(field => [field, evidenceValue(row, field)])));
      }
      const detailId = detailIds[entityName];
      if (detailId && fields.includes("Id")) {
        const detail = await getVistosById(env, session, entityName, Number(detailId), columns);
        const row = detail.row;
        if (row && Number(row.Id) !== Number(detailId)) throw Object.assign(new Error("Source returned another record ID."), { code: "vistos_record_identity_mismatch" });
        result.detail = { requestedId: Number(detailId), found: Boolean(row), readOperation: "GetByIdParam", row: row ? Object.fromEntries(columns.map(field => [field, evidenceValue(row, field)])) : null };
      }
      entities.push(result);
    } catch (error) {
      entities.push({ entityName, status: "blocked", errorCode: String(error?.code || "vistos_evidence_unavailable"), upstreamStatus: Number(error?.upstreamStatus) || null, requiredReadOperations: ["GetSchemaEntity", ...(sample ? ["GetPageParam"] : []), ...(detailIds[entityName] ? ["GetByIdParam"] : [])] });
    }
  }
  return { ...base, status: entities.every(entity => entity.status === "schema_available") ? "available" : "partial", sample, entities };
}
