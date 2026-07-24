import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  absenceApprovalRcsMessageInput
} from "../functions/_lib/notification-service.js";
import {
  renderCustomerMessageTemplate,
  templateAlwaysIncludesStop
} from "../functions/_lib/customer-message-templates.js";

const request = {
  id: "absence-test-approval-1",
  employeeId: "employee-test-1",
  employeeName: "Testovací zaměstnanec",
  employeePhone: "777 123 456",
  type: "vacation",
  dateFrom: "2026-08-03",
  dateTo: "2026-08-07"
};

const input = absenceApprovalRcsMessageInput(request);
assert.equal(input.phone, request.employeePhone);
assert.equal(input.channelPreference, "rcs");
assert.equal(input.template, "absence_approved");
assert.equal(input.customerId, request.employeeId);
assert.equal(input.relatedEntityType, "absence_request");
assert.equal(input.relatedEntityId, request.id);
assert.match(input.reason, /provozní transakční/);
assert.equal(Boolean(input.legalBasis), true);

const rendered = renderCustomerMessageTemplate(input.template, input.variables);
assert.match(rendered.body, /Dovolená/);
assert.match(rendered.body, /03\. 08\. 2026 - 07\. 08\. 2026/);
assert.match(rendered.body, /byla schválena/);
assert.equal(templateAlwaysIncludesStop(rendered.body), true);

const manualApproveSource = await readFile(
  new URL("../functions/api/absence-requests/[id]/approve.js", import.meta.url),
  "utf8"
);
const aiApproveSource = await readFile(
  new URL("../functions/api/ai/absence/[id]/approve.js", import.meta.url),
  "utf8"
);
const manualRejectSource = await readFile(
  new URL("../functions/api/absence-requests/[id]/reject.js", import.meta.url),
  "utf8"
);
const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const migrationSource = await readFile(
  new URL("../migrations/0061_activate_absence_approval_rcs.sql", import.meta.url),
  "utf8"
);

for (const source of [manualApproveSource, aiApproveSource]) {
  assert.match(source, /sendAbsenceApprovalRcsNotification/);
  assert.doesNotMatch(source, /sendAbsenceDecisionSms/);
}
assert.match(manualRejectSource, /sendAbsenceDecisionSms/);
assert.match(appSource, /absence_approved_rcs: "Schváleno RCS"/);
assert.match(appSource, /absenceNotificationWarning\(result\.notification, "RCS\/SMS zaměstnanci"/);
assert.match(migrationSource, /"channel":"rcs","fallback":"sms"/);
assert.match(migrationSource, /"optOutCheck":true,"dedupe":true/);

console.log("absence-approval-rcs.test.mjs: OK");
