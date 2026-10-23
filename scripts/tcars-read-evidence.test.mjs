import assert from "node:assert/strict";
import { auditTcarsReadEvidence } from "../functions/_lib/tcars-client.js";
const env = { TCARS_BASE_URL: "https://tcars.example.test/v2/", TCARS_API_MODE: "soap", TCARS_CUSTOMER_NUMBER: "SECRET_CUSTOMER", TCARS_USERNAME: "SECRET_USER", TCARS_PASSWORD: "SECRET_PASSWORD" };
const originalFetch = globalThis.fetch;
let variant = "soap";
const calls = [];
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), "https://tcars.example.test/v2/index.php");
  const method = init.headers.SOAPAction.split("/").pop();
  assert.ok(["vozidlaSeznam", "vozidlaPozice"].includes(method));
  calls.push(method);
  if (variant === "html") return new Response("<html><body>SECRET_HTML cf-chl-test</body></html>");
  const body = variant === "fault" ? "<SOAP-ENV:Fault><faultstring>SECRET_FAULT</faultstring></SOAP-ENV:Fault>" : '<m:' + method + 'Response xmlns:m="urn:test">' + (method === "vozidlaSeznam" ? "<vozidlo><vozidloId>1220</vozidloId><vozidloRz>SECRET_PLATE</vozidloRz></vozidlo>" : "<pozice><poziceId>1</poziceId><poziceDatumCas>2026-10-23T08:00:00Z</poziceDatumCas></pozice>") + '</m:' + method + 'Response>';
  return new Response('<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body>' + body + '</SOAP-ENV:Body></SOAP-ENV:Envelope>');
};
try {
  const soap = await auditTcarsReadEvidence(env);
  assert.equal(calls.length, 2);
  assert.equal(soap.writesData, false);
  assert.equal(soap.exposesRawResponse, false);
  for (const result of soap.methods) {
    assert.equal(result.hasSoapEnvelope, true);
    assert.equal(result.hasSoapBody, true);
    assert.equal(result.hasHtml, false);
    assert.equal(result.responseElementFound, true);
    assert.equal(result.parsedCount, 1);
  }
  assert.equal(soap.methods[0].expectedFieldsPresent.vozidloId, true);
  assert.equal(JSON.stringify(soap).includes("SECRET_"), false);
  variant = "html";
  const html = await auditTcarsReadEvidence(env);
  assert.ok(html.methods.every(result => result.hasHtml && result.challengeMarkerPresent && !result.hasSoapEnvelope && result.parsedCount === 0));
  assert.equal(JSON.stringify(html).includes("SECRET_"), false);
  variant = "fault";
  const fault = await auditTcarsReadEvidence(env);
  assert.ok(fault.methods.every(result => result.status === "blocked" && result.errorCode === "tcars_soap_failed"));
  assert.equal(JSON.stringify(fault).includes("SECRET_"), false);
  const before = calls.length;
  const unconfigured = await auditTcarsReadEvidence({});
  assert.equal(calls.length, before);
  assert.ok(unconfigured.methods.every(result => result.errorCode === "tcars_not_configured"));
} finally { globalThis.fetch = originalFetch; }
console.log("T-Cars shape-only read audit, SOAP/HTML distinction, faults and redaction passed.");
