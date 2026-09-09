import assert from "node:assert/strict";
import { fetchVistosExecute } from "../functions/_lib/vistos-execute-client.js";
import {
  contactColumnsForSchema,
  isSyntacticallyValidEmail,
  normalizeContactEmail,
  summarizeCleanupContactRows,
  summarizeContactRows,
  summarizeDocumentRows,
  summarizeFullContactRows,
  suspiciousEmailDomain,
  vistosSchemaColumnMetadata,
  vistosSchemaColumnNames
} from "../functions/_lib/vistos-contacts-audit.js";

const columns = vistosSchemaColumnNames({ data: { Columns: [
  { ColumnName: "Id" }, { ColumnName: "Email1" }, { ColumnName: "Parent_FK" }, { ColumnName: "Modified" }
] } });
assert.deepEqual(columns, ["Email1", "Id", "Modified", "Parent_FK"]);
assert.deepEqual(contactColumnsForSchema(columns), ["Id", "Email1", "Parent_FK", "Modified"]);
assert.deepEqual(vistosSchemaColumnMetadata({ data: { Columns: [
  { ColumnName: "NoSms", Caption: "Neposílat SMS", DataType: "Boolean" },
  { FieldName: "Email1", DisplayName: "E-mail", Type: "String" }
] } }), [
  { field: "Email1", caption: "E-mail", datatype: "String" },
  { field: "NoSms", caption: "Neposílat SMS", datatype: "Boolean" }
]);
assert.deepEqual(suspiciousEmailDomain("gmial.com"), {
  domain: "gmial.com",
  probableIntendedDomain: "gmail.com",
  reason: "Levenshtein distance 2 from known domain gmail.com",
  confidence: "medium"
});
assert.equal(suspiciousEmailDomain("gmail.com"), null);

const cleanup = summarizeCleanupContactRows([
  { Id: 1, FirstName: "Jan", Email1: " A@GMAIL.COM ", Parent_FK_RecordId: 10, NoSms: false },
  { Id: 2, LastName: "Novák", Email1: "a@gmail.com", Parent_FK_RecordId: 20, NoSms: true },
  { Id: 3, Email1: "info@gmial.com", NoSms: false },
  { Id: 4, FirstName: "Eva" }
], [{ field: "NoSms", caption: "Neposílat SMS", datatype: "Boolean" }]);
assert.equal(cleanup.summary.total, 4);
assert.equal(cleanup.summary.email1Filled, 3);
assert.equal(cleanup.summary.duplicateEmailOccurrences, 1);
assert.equal(cleanup.summary.doNotContact, 1);
assert.equal(cleanup.summary.doNotContactConflictEmails, 1);
assert.equal(cleanup.suspiciousRows.length, 1);
assert.equal(cleanup.duplicateGroups[0].doNotContactConflict, true);

assert.deepEqual(summarizeContactRows([
  { Id: 1, FirstName: "A", LastName: "B", Email1: "same@example.test", Phone: "1", Parent_FK_RecordId: 10, Created: "2026-01-01", Modified: "2026-02-01" },
  { Id: 2, Name: "C", Email1: "SAME@example.test", Parent_FK: 10 },
  { Id: 3, Name: "D" }
]), {
  rows: 3, withStableId: 3, withFirstName: 1, withLastName: 1, withName: 2,
  withEmail: 2, uniqueEmails: 1, duplicateEmailRows: 1, withPhone: 1,
  withCompanyLink: 2, withCreated: 1, withModified: 1
});

assert.equal(normalizeContactEmail("  USER@Example.CZ "), "user@example.cz");
assert.equal(isSyntacticallyValidEmail("valid@example.cz"), true);
assert.equal(isSyntacticallyValidEmail("invalid@example"), false);
assert.equal(isSyntacticallyValidEmail("a..b@example.cz"), false);

const fullContacts = [
  { Id: 1, Email1: " A@example.cz ", EmailInvoicing: "invoice@example.cz", Parent_FK_RecordId: 10, Status_FK_RecordId: 1, Status_FK_Caption: "One" },
  { Id: 2, Email1: "a@EXAMPLE.cz", Parent_FK_RecordId: 10, Status_FK_RecordId: 1, Status_FK_Caption: "One" },
  { Id: 3, Email1: "broken", EmailInvoicing: "billing@example.cz", Parent_FK_RecordId: 20, Status_FK_RecordId: 2 },
  { Id: 4 }
];
assert.deepEqual(summarizeFullContactRows(fullContacts), {
  total: 4,
  email1: { filled: 3, empty: 1, valid: 2, uniqueValid: 1, duplicateOccurrences: 1 },
  emailInvoicing: { filled: 2, empty: 2, valid: 2, uniqueValid: 2, duplicateOccurrences: 0 },
  parentFkFilled: 3,
  parentFkMissing: 1,
  uniqueCompanies: 2,
  statusFkDistribution: [
    { id: "1", caption: "One", count: 2 },
    { id: "2", caption: null, count: 1 },
    { id: null, caption: null, count: 1 }
  ]
});

assert.deepEqual(summarizeDocumentRows([
  { Id: 100, Directory_FK_RecordId: 10, DirectoryManager_FK_RecordId: 1, Status_FK_RecordId: 74 },
  { Id: 101, Directory_FK_RecordId: 20, Koncovkakontakt_FK_RecordId: 3, Status_FK_RecordId: 73 },
  { Id: 102, Directory_FK_RecordId: 30, DirectoryManager_FK_RecordId: 999, Status_FK_RecordId: 74 }
], {
  companyField: "Directory_FK",
  directContactFields: ["DirectoryManager_FK", "Koncovkakontakt_FK"],
  confirmedActiveStatusId: "74"
}, fullContacts), {
  documentsTotal: 3,
  statusFkDistribution: [
    { id: "74", caption: null, count: 2 },
    { id: "73", caption: null, count: 1 }
  ],
  confirmedActive: 2,
  confirmedActiveStatusId: "74",
  documentCompanies: 3,
  directContacts: {
    contacts: 3,
    resolvedContacts: 2,
    unresolvedContactReferences: 1,
    contactsWithEmail1: 2,
    uniqueValidEmails: 1,
    companies: 2
  },
  companyContacts: {
    contacts: 3,
    resolvedContacts: 3,
    unresolvedContactReferences: 0,
    contactsWithEmail1: 3,
    uniqueValidEmails: 1,
    companies: 2
  },
  overlapDirectCompany: 2
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
