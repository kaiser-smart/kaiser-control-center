import assert from "node:assert/strict";
import { fetchVistosExecute } from "../functions/_lib/vistos-execute-client.js";
import { contactColumnsForSchema, summarizeContactRows, vistosSchemaColumnNames } from "../functions/_lib/vistos-contacts-audit.js";

const columns = vistosSchemaColumnNames({ data: { Columns: [
  { ColumnName: "Id" }, { ColumnName: "Email1" }, { ColumnName: "Parent_FK" }, { ColumnName: "Modified" }
] } });
assert.deepEqual(columns, ["Email1", "Id", "Modified", "Parent_FK"]);
assert.deepEqual(contactColumnsForSchema(columns), ["Id", "Email1", "Parent_FK", "Modified"]);

assert.deepEqual(summarizeContactRows([
  { Id: 1, FirstName: "A", LastName: "B", Email1: "same@example.test", Phone: "1", Parent_FK_RecordId: 10, Created: "2026-01-01", Modified: "2026-02-01" },
  { Id: 2, Name: "C", Email1: "SAME@example.test", Parent_FK: 10 },
  { Id: 3, Name: "D" }
]), {
  rows: 3, withStableId: 3, withFirstName: 1, withLastName: 1, withName: 2,
  withEmail: 2, uniqueEmails: 1, duplicateEmailRows: 1, withPhone: 1,
  withCompanyLink: 2, withCreated: 1, withModified: 1
});

console.log("Vistos contacts audit tests passed.");

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ status: "Unauthorized" }), {
  status: 215,
  headers: { "content-type": "application/json" }
});
await assert.rejects(
  fetchVistosExecute({ VISTOS_API_BASE_URL: "https://vistos.invalid" }, "GetPageParam", {}),
  (error) => error.code === "vistos_api_execute_failed" && error.upstreamStatus === 215 && error.upstreamApiStatus === "Unauthorized"
);
globalThis.fetch = originalFetch;
