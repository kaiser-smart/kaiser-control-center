import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fetchVistosExecute } from "../functions/_lib/vistos-execute-client.js";
import {
  buildLeadHubDataOnlySelection,
  buildSalutationCandidate,
  contactColumnsForSchema,
  dnsMailRouteStatus,
  finalizeLeadHubDataOnlySnapshot,
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
  { Id: 1, FirstName: "Jan", Email1: " A@GMAIL.COM ", Parent_FK_RecordId: 10, Kontaktovatsms: true, SendMailEnabled: true, CallEnabled: true, DoNotWorkCompany: false },
  { Id: 2, LastName: "Novák", Email1: "a@gmail.com", Parent_FK_RecordId: 20, Kontaktovatsms: false, SendMailEnabled: true, CallEnabled: true, DoNotWorkCompany: true },
  { Id: 3, Email1: "info@gmial.com", Kontaktovatsms: true, SendMailEnabled: true, CallEnabled: true, DoNotWorkCompany: false },
  { Id: 4, FirstName: "Eva" },
  { Id: 5, FirstName: "Petr", Email1: "petr@example.cz", Kontaktovatsms: true, SendMailEnabled: true, CallEnabled: true, DoNotWorkCompany: true },
  { Id: 6, FirstName: "Pavel", Email1: "pavel@example.cz", Kontaktovatsms: true, SendMailEnabled: true, CallEnabled: true, DoNotWorkCompany: null }
], [
  { field: "Kontaktovatsms", caption: "Kontaktovat SMS", datatype: "Boolean" },
  { field: "SendMailEnabled", caption: "Povolit e-mail", datatype: "Boolean" },
  { field: "CallEnabled", caption: "Povolit volání", datatype: "Boolean" },
  { field: "DoNotWorkCompany", caption: "Už nepracuje ve firmě", datatype: "Boolean" }
]);
assert.equal(cleanup.summary.total, 6);
assert.equal(cleanup.summary.email1Filled, 5);
assert.equal(cleanup.summary.duplicateEmailOccurrences, 1);
assert.equal(cleanup.summary.doNotContact, 1);
assert.equal(cleanup.summary.doNotContactConflictEmails, 1);
assert.equal(cleanup.suspiciousRows.length, 1);
assert.equal(cleanup.duplicateGroups[0].doNotContactConflict, true);
assert.equal(cleanup.summary.doNotContactUnknownValues, 1);
assert.equal(cleanup.doNotContactMappings.some((mapping) => mapping.field === "DoNotWorkCompany"), false);
assert.equal(cleanup.leftCompanyField.field, "DoNotWorkCompany");
assert.equal(cleanup.leftCompanyField.uiCaption, "Už nepracuje ve firmě");
assert.equal(cleanup.summary.leftCompanyTrue, 2);
assert.equal(cleanup.summary.leftCompanyFalse, 2);
assert.equal(cleanup.summary.leftCompanyUnknown, 2);
assert.equal(cleanup.summary.leftCompanyUniqueEmails, 2);
assert.equal(cleanup.summary.employmentConflictReviewEmails, 1);
assert.equal(cleanup.summary.employmentConflictReviewContacts, 2);
assert.equal(cleanup.duplicateGroups[0].employmentConflictReview, true);
assert.equal(cleanup.summary.newlyExcludedByLeftCompany, 1);
assert.equal(cleanup.summary.alreadyBlockedByOtherFilter, 1);

const unknownDnc = summarizeCleanupContactRows([
  { Id: 1, FirstName: "Jan", Email1: "jan@example.cz", Kontaktovatsms: true }
], [{ field: "Kontaktovatsms", caption: null, datatype: null }]);
assert.equal(unknownDnc.summary.doNotContact, 0);
assert.equal(unknownDnc.summary.doNotContactUnknownValues, 1);
assert.equal(unknownDnc.summary.candidateBeforeDns, 0);

const confirmedCommunicationSchema = [
  { field: "Kontaktovatsms", caption: "Kontaktovat SMS", datatype: "Boolean" },
  { field: "SendMailEnabled", caption: "Povolit e-mail", datatype: "Boolean" },
  { field: "CallEnabled", caption: "Povolit volání", datatype: "Boolean" },
  { field: "DoNotWorkCompany", caption: "Už nepracuje ve firmě", datatype: "Boolean" }
];
const allowed = { FirstName: "Radim", Kontaktovatsms: true, SendMailEnabled: true, CallEnabled: true, DoNotWorkCompany: false };
const dataOnlySelection = buildLeadHubDataOnlySelection([
  { Id: 1, ...allowed, Email1: "unknown-dnc@example.cz", CallEnabled: null },
  { Id: 2, ...allowed, Email1: "forbidden@example.cz", Kontaktovatsms: false },
  { Id: 3, ...allowed, Email1: "allowed@example.cz" },
  { Id: 4, ...allowed, Email1: "duplicate@example.cz" },
  { Id: 5, ...allowed, Email1: " DUPLICATE@example.cz " },
  { Id: 6, ...allowed, Email1: "left@example.cz", DoNotWorkCompany: true },
  { Id: 7, ...allowed, Email1: "left-unknown@example.cz", DoNotWorkCompany: null },
  { Id: 8, ...allowed, Email1: "employee@kaiserservis.cz" },
  { Id: 9, Email1: "nameless@example.cz", Kontaktovatsms: true, SendMailEnabled: true, CallEnabled: true, DoNotWorkCompany: false },
  { Id: 10, FirstName: "Xavier", Email1: "salutation@example.cz", Kontaktovatsms: true, SendMailEnabled: true, CallEnabled: true, DoNotWorkCompany: false },
  { Id: 11, ...allowed, Email1: "info@example.cz" },
  { Id: 12, ...allowed, Email1: "bad()<local@example.cz" },
  { Id: 13, ...allowed, Email1: "radim@gmial.com" },
  { Id: 14, ...allowed, Email1: "radim@null.example" },
  { Id: 15, ...allowed, Email1: "radim@fallback.example" },
  { Id: 16, ...allowed, Email1: "radim@unknown.example" },
  { Id: 17, ...allowed, Email1: "" }
], confirmedCommunicationSchema, { domainStatuses: {
  "example.cz": "VALID_DOMAIN",
  "kaiserservis.cz": "VALID_DOMAIN",
  "gmial.com": "VALID_DOMAIN",
  "null.example": "NULL_MX",
  "fallback.example": "A_AAAA_FALLBACK_REVIEW",
  "unknown.example": "UNKNOWN"
} });
assert.equal(dataOnlySelection.status, "COMPLETE");
assert.equal(dataOnlySelection.technicallyCleanContactRecords, 3);
assert.equal(dataOnlySelection.technicallyCleanUniqueEmails, 3);
assert.equal(dataOnlySelection.dataOnlyContactRecords, 2);
assert.equal(dataOnlySelection.dataOnlyUniqueEmails, 2);
assert.equal(dataOnlySelection.communicationStatus.confirmedForbiddenUniqueEmails, 1);
assert.equal(dataOnlySelection.communicationStatus.unknownUniqueEmails, 1);
assert.equal(dataOnlySelection.communicationStatus.documentedDncPermissionUniqueEmails, 1);
assert.equal(dataOnlySelection.communicationStatusAllUniqueSyntaxValidEmails.confirmedForbiddenUniqueEmails, 1);
assert.equal(dataOnlySelection.communicationStatusAllUniqueSyntaxValidEmails.unknownUniqueEmails, 1);
assert.ok(dataOnlySelection.communicationStatusAllUniqueSyntaxValidEmails.documentedDncPermissionUniqueEmails > 1);
for (const reason of [
  "NO_EMAIL1", "INVALID_SYNTAX", "SUSPICIOUS_TYPO", "DUPLICATE_OR_CONFLICT_EMAIL",
  "LEFT_COMPANY_TRUE", "LEFT_COMPANY_UNKNOWN", "KAISERSERVIS_DOMAIN",
  "NAME_MISSING_OR_UNUSABLE", "ROLE_ADDRESS", "SALUTATION_UNRELIABLE",
  "NULL_MX", "DNS_FALLBACK_REVIEW", "DNS_UNKNOWN", "CONFIRMED_DO_NOT_CONTACT"
]) assert.ok(dataOnlySelection.exclusionReasons[reason]?.contactRecords > 0, `${reason} must exclude an otherwise eligible fixture`);
assert.equal(dataOnlySelection.readyForImport, false);
assert.equal(dataOnlySelection.sendAllowed, false);

const noDnsEvidence = buildLeadHubDataOnlySelection([
  { Id: 1, ...allowed, Email1: "radim@example.cz" }
], confirmedCommunicationSchema);
assert.equal(noDnsEvidence.status, "PARTIAL");
assert.equal(noDnsEvidence.technicallyCleanUniqueEmails, 0);
assert.equal(noDnsEvidence.exclusionReasons.DNS_UNKNOWN.uniqueEmails, 1);
assert.deepEqual(noDnsEvidence.domainEvidence, {
  suppliedDomains: 0,
  requiredDomains: 1,
  checkedRequiredDomains: 0,
  missingDomains: 1,
  requiredStatus: "VALID_DOMAIN",
  missingEvidenceExcluded: true
});

const completeSnapshot = {
  runId: "test-run-1234",
  snapshotFingerprint: "fixture-fingerprint",
  createdAt: "2026-09-10T00:00:00.000Z",
  rows: [{ Id: 1, ...allowed, Email1: "radim@example.cz" }],
  schemaMetadata: confirmedCommunicationSchema
};
const finalizedWithDns = finalizeLeadHubDataOnlySnapshot(completeSnapshot, {
  runId: completeSnapshot.runId,
  domains: ["example.cz"],
  results: { "example.cz": { status: "VALID_DOMAIN", checkedAt: "2026-09-10T00:01:00.000Z" } }
});
assert.equal(finalizedWithDns.status, "COMPLETE");
assert.equal(finalizedWithDns.cleanup.technicallyCleanUniqueEmails, 1);
assert.equal(finalizedWithDns.cleanup.dataOnlyUniqueEmails, 1);
assert.equal(finalizedWithDns.cleanup.domainEvidence.checkedRequiredDomains, 1);
assert.equal(finalizedWithDns.dnsResults["example.cz"].checkedAt, "2026-09-10T00:01:00.000Z");

const finalizedWithoutDns = finalizeLeadHubDataOnlySnapshot(completeSnapshot, {
  runId: completeSnapshot.runId,
  domains: ["example.cz"],
  results: {}
});
assert.equal(finalizedWithoutDns.status, "PARTIAL");
assert.equal(finalizedWithoutDns.cleanup.technicallyCleanUniqueEmails, 0);

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
assert.equal(isSyntacticallyValidEmail("bad()<local@example.cz"), false);
assert.equal(isSyntacticallyValidEmail("bad,name@example.cz"), false);
assert.deepEqual(buildSalutationCandidate({ FirstName: "Radim" }), {
  status: "SALUTATION_CANDIDATE", candidate: "Dobrý den, Radime,", source: "curated Czech first-name dictionary",
  reason: "Přesná shoda v omezeném kontrolovaném slovníku; kandidát není schválené oslovení."
});
assert.equal(buildSalutationCandidate({ LastName: "Opluštil", Gender_FK_Caption: "Muž" }).candidate, "Dobrý den, pane Opluštile,");

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

const dnsAnswers = new Map([
  ["null.example|MX", { Status: 0, Answer: [{ type: 15, data: "0 ." }] }],
  ["valid.example|MX", { Status: 0, Answer: [{ type: 15, data: "10 mx.valid.example." }] }],
  ["mx.valid.example|A", { Status: 0, Answer: [{ type: 1, data: "192.0.2.1" }] }],
  ["mx.valid.example|AAAA", { Status: 0, Answer: [] }],
  ["fallback.example|MX", { Status: 0, Answer: [] }],
  ["fallback.example|A", { Status: 0, Answer: [{ type: 1, data: "192.0.2.2" }] }],
  ["fallback.example|AAAA", { Status: 0, Answer: [] }]
]);
globalThis.fetch = async (url) => {
  const parsed = new URL(url);
  const answer = dnsAnswers.get(`${parsed.searchParams.get("name")}|${parsed.searchParams.get("type")}`) || { Status: 3 };
  return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
};
assert.equal((await dnsMailRouteStatus("null.example")).status, "NULL_MX");
assert.equal((await dnsMailRouteStatus("valid.example")).status, "VALID_DOMAIN");
assert.equal((await dnsMailRouteStatus("fallback.example")).status, "A_AAAA_FALLBACK_REVIEW");
assert.equal((await dnsMailRouteStatus("missing.example")).status, "NXDOMAIN");
globalThis.fetch = originalFetch;

const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
assert.match(appSource, /Spustit celý Contact audit V4/);
assert.match(appSource, /data-vistos-audit-v4/);
assert.match(appSource, /runVistosAuditV4/);
assert.match(appSource, /invoiceBlock/);
assert.match(appSource, /serviceListRawBlock/);
assert.match(appSource, /row\.leftCompanyState === "FALSE"/);

const auditEndpointSource = await readFile(new URL("../functions/api/receivables/vistos/contacts-audit.js", import.meta.url), "utf8");
assert.match(auditEndpointSource, /onRequestPost/);
assert.match(auditEndpointSource, /runLeadHubDataOnlyAuditAction/);
assert.match(auditEndpointSource, /protectedAuditWrite: true/);
