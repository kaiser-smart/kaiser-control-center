import assert from "node:assert/strict";
import { auditFleetVistosJobEvidence } from "../functions/_lib/fleet-vistos-job-evidence.js";
const noConfig = await auditFleetVistosJobEvidence({});
assert.equal(noConfig.status, "blocked");
assert.equal(noConfig.errorCode, "vistos_api_not_configured");
const originalFetch = globalThis.fetch;
const requests = [];
let denied = false;
globalThis.fetch = async (url, init) => {
  assert.match(String(url), /^https:\/\/vistos\.example\.test\/API\/VistosAPI\/Execute\?/);
  const body = JSON.parse(init.body);
  const method = Object.keys(body).find(key => ["LoginParam", "GetSchemaEntity", "GetPageParam"].includes(key));
  assert.ok(method, "only documented authentication and read operations are used");
  requests.push({ method, input: body[method] });
  if (method === "LoginParam") return Response.json({ status: "OK" }, { headers: { "set-cookie": "VistosAccessToken=test-only; Path=/" } });
  assert.equal(init.headers.Cookie, "VistosAccessToken=test-only");
  assert.ok(["ServiceList", "ServiceListItem"].includes(body[method].EntityName));
  if (denied) return Response.json({ status: "Unauthorized" }, { status: 403 });
  if (method === "GetSchemaEntity") return Response.json({ status: "OK", data: { Columns: ["Id", "Auto_FK", "RidicContact_FK", "Status_FK", "DateOfRealization", "PriceWithoutTax"].map(ColumnName => ({ ColumnName, DataType: "test-type", Caption: ColumnName })) } });
  assert.equal(body.GetPageParam.Length, 5);
  assert.equal(body.GetPageParam.Start, 0);
  assert.ok(body.GetPageParam.Columns.every(column => column.Status === 1));
  return Response.json({ status: "OK", data: { recordsTotal: 12, recordsFiltered: 12, data: [{ Id: 7, Auto_FK_RecordId: 42, RidicContact_FK_RecordId: 81, RidicContact_FK: "DO_NOT_EXPOSE_DRIVER_NAME", DateOfRealization: null, PriceWithoutTax: null }, { Id: 8, Auto_FK: 43, RidicContact_FK: 82, Status_FK: 7 }, { Id: 9, Auto_FK: "3BI2007", RidicContact_FK: "81", Status_FK: 0 }, { Id: 10, Auto_FK: -1, RidicContact_FK: 1.5, Status_FK: false }] } });
};
try {
  const env = { VISTOS_API_BASE_URL: "https://vistos.example.test", VISTOS_API_USERNAME: "test-only", VISTOS_API_PASSWORD: "test-only" };
  const schema = await auditFleetVistosJobEvidence(env);
  assert.equal(schema.status, "available");
  assert.equal(schema.mappingStatus, "requires_semantic_verification");
  assert.equal(schema.readOnly, true);
  assert.equal(schema.writesD1, false);
  assert.equal(schema.writesVistos, false);
  assert.equal(requests.filter(row => row.method === "GetPageParam").length, 0);
  const sample = await auditFleetVistosJobEvidence(env, { sample: true, start: -100 });
  assert.equal(sample.entities.length, 2);
  for (const entity of sample.entities) {
    assert.equal(entity.page.limit, 5);
    assert.equal(entity.page.total, 12);
    assert.equal(entity.page.completeImport, false);
    if (entity.entityName === "ServiceList") {
      assert.equal(entity.rows[0].RidicContact_FK.recordId, 81);
      assert.equal(entity.rows[0].Auto_FK.recordId, 42);
      assert.equal(entity.rows[1].Auto_FK.recordId, 43);
      assert.equal(entity.rows[1].RidicContact_FK.recordId, 82);
      assert.equal(entity.rows[1].Status_FK.recordId, 7);
      for (const row of entity.rows.slice(2)) {
        assert.equal(row.Auto_FK.recordId, null);
        assert.equal(row.RidicContact_FK.recordId, null);
        assert.equal(row.Status_FK.recordId, null);
      }
    } else {
      assert.equal(entity.rows[0].RidicContact_FK, undefined, "item evidence does not invent a driver field");
      assert.equal(entity.rows[0].Auto_FK, undefined, "item evidence does not invent a vehicle field");
    }
    assert.equal(entity.rows[0].PriceWithoutTax, null);
    assert.equal(entity.rows[0].DateOfRealization, null);
    assert.equal(entity.sampleIsNotMappingProof, true);
    assert.ok(entity.missingCandidateFields.length > 0);
  }
  assert.equal(JSON.stringify(sample).includes("DO_NOT_EXPOSE_DRIVER_NAME"), false);
  assert.equal(JSON.stringify(sample).includes("test-only"), false, "credentials and sessions never enter evidence responses");
  denied = true;
  const blocked = await auditFleetVistosJobEvidence(env, { sample: true });
  assert.equal(blocked.status, "partial");
  assert.ok(blocked.entities.every(entity => entity.status === "blocked" && entity.upstreamStatus === 403));
  assert.ok(blocked.entities.every(entity => entity.requiredReadOperations.includes("GetPageParam")));
} finally { globalThis.fetch = originalFetch; }
console.log("Vistos job evidence schema, bounded samples, read-only operations and permission failures passed");
