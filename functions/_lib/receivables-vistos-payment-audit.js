import { loginVistosExecute, getVistosPage, getVistosSchemaEntity } from "./vistos-execute-client.js";
import { vistosSchemaColumnNames, vistosSchemaColumnMetadata } from "./vistos-contacts-audit.js";

const PAYMENT_ENTITY = /payment|paid|bank|cash|settle|uhrad|platb|saldo|money|creditnote/i;
const PAYMENT_FIELD = /paid|pay|remain|balance|settle|uhrad|platb|saldo|money|external|credit|debit|invoice|amount|price|currency|date|created|modified|status|reference|^id$/i;
const INVOICE_FIELDS = ["Id", "InvoiceNumber", "IssuedDate", "DueDate", "PriceWithTax", "AmountPaid", "RemainToPay", "IsPaid", "PaymentStatus_FK", "Status_FK", "Modified"];

function safeError(error) {
  const status = Number(error?.upstreamStatus) || 0;
  const apiStatus = String(error?.upstreamApiStatus || "").slice(0, 100);
  return { status: [215, 401, 403].includes(status) || /unauthorized/i.test(apiStatus) ? "PERMISSION_DENIED" : "UNAVAILABLE",
    code: String(error?.code || "vistos_payment_audit_failed"), upstreamStatus: status, upstreamApiStatus: apiStatus };
}

export function paymentFieldCoverage(rows, fields) {
  return fields.map(field => ({ field, sampledRows: rows.length,
    present: rows.filter(row => Object.hasOwn(row, field)).length,
    nullValues: rows.filter(row => Object.hasOwn(row, field) && row[field] === null).length,
    emptyValues: rows.filter(row => row[field] === "").length,
    nonEmpty: rows.filter(row => Object.hasOwn(row, field) && row[field] !== null && row[field] !== "").length,
    nonZeroNumbers: rows.filter(row => typeof row[field] === "number" && row[field] !== 0).length
  }));
}

export async function auditVistosPaymentData(env, options = {}) {
  const section = options.section || "invoice";
  const entity = section === "invoice" ? "InvoiceIssued" : String(options.entity || "");
  if (!["invoice", "catalog", "entity"].includes(section)
      || (section === "entity" && (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(entity) || !PAYMENT_ENTITY.test(entity)))) {
    return { status: "INVALID_REQUEST", readOnly: true };
  }
  const audit = { checkedAt: new Date().toISOString(), readOnly: true, writesVistos: false, writesD1: false,
    writesLedger: false, startsAutomation: false, section, entity: entity || undefined };
  let session;
  try { session = await loginVistosExecute(env); } catch (error) { return { ...audit, ...safeError(error) }; }
  if (section === "catalog") {
    try {
      const page = await getVistosPage(env, session, "DbObject", ["Id", "Name", "Caption", "EntityName", "TableName"], null, 0, 1000);
      const entities = page.rows.filter(row => PAYMENT_ENTITY.test([row.Name,row.Caption,row.EntityName,row.TableName].join(" ")))
        .map(row => ({ id: row.Id, name: row.Name, caption: row.Caption, entityName: row.EntityName, tableName: row.TableName }));
      return { ...audit, status: "FOUND", rowsRead: page.rows.length, counts: page.countEvidence,
        filteredTotal: page.filtered, complete: page.countEvidence?.filteredReported === true && page.rows.length === page.filtered, entities };
    } catch (error) { return { ...audit, ...safeError(error) }; }
  }
  let fields = [];
  try {
    const payload = await getVistosSchemaEntity(env, session, entity);
    fields = vistosSchemaColumnNames(payload);
    audit.schema = { status: fields.length ? "FOUND" : "UNAVAILABLE", columnCount: fields.length, fields,
      relevantMetadata: vistosSchemaColumnMetadata(payload).filter(c => PAYMENT_FIELD.test(c.field)),
      responseKeys: Object.keys(payload || {}) };
  } catch (error) { audit.schema = safeError(error); }
  const columns = section === "invoice"
    ? [...new Set([...INVOICE_FIELDS, ...fields.filter(f => PAYMENT_FIELD.test(f))])].slice(0,80)
    : ["Id", ...fields.filter(f => f !== "Id" && PAYMENT_FIELD.test(f))].slice(0,40);
  try {
    const page = await getVistosPage(env, session, entity, columns, null, 0, section === "invoice" ? 100 : 5);
    const returnedKeys = [...new Set(page.rows.flatMap(row => Object.keys(row)))];
    audit.data = { status: page.rows.length ? "FOUND" : "EMPTY", recordsTotal: page.total, recordsFiltered: page.filtered,
      countEvidence: page.countEvidence, sampleSize: page.rows.length, requestedFields: columns, returnedKeys,
      coverage: paymentFieldCoverage(page.rows, columns),
      sample: page.rows.slice(0,5).map(row => Object.fromEntries(columns.filter(field => Object.hasOwn(row,field)).map(field => [field,row[field]]))) };
  } catch (error) { audit.data = safeError(error); }
  return { ...audit, status: audit.data.status };
}
