import assert from "node:assert/strict";
import {
  KAISER_RCS_CONSENT,
  onRequestOptions,
  onRequestPost
} from "../functions/api/public/rcs/opt-in.js";

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.bindings = [];
  }

  bind(...bindings) {
    this.bindings = bindings;
    return this;
  }

  first() {
    return this.db.first(this.sql, this.bindings);
  }

  run() {
    return this.db.run(this.sql, this.bindings);
  }
}

class FakeD1 {
  constructor() {
    this.consents = [];
    this.optOuts = new Set();
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  first(sql, bindings) {
    if (!sql.includes("FROM customer_message_consent")) return null;
    return this.consents.find((item) => (
      item.phone === bindings[0] &&
      item.consent_version === bindings[1] &&
      item.created_at >= bindings[2]
    )) || null;
  }

  run(sql, bindings) {
    if (sql.includes("INSERT INTO customer_message_consent")) {
      this.consents.push({
        id: bindings[0],
        phone: bindings[1],
        consent_version: bindings[2],
        consent_text: bindings[3],
        terms_url: bindings[4],
        privacy_url: bindings[5],
        source_url: bindings[6],
        source_origin: bindings[7],
        metadata_json: bindings[8],
        created_at: bindings[9]
      });
    }

    if (sql.includes("DELETE FROM customer_message_opt_out")) {
      this.optOuts.delete(bindings[0]);
    }
    return { success: true };
  }
}

function request(body, { origin = "https://www.kaiserservis.cz", ip = "203.0.113.10" } = {}) {
  return new Request("https://smart-odpady.ai/api/public/rcs/opt-in", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": origin,
      "CF-Connecting-IP": ip
    },
    body: JSON.stringify(body)
  });
}

async function payload(response) {
  return response.json();
}

assert.match(KAISER_RCS_CONSENT.text, /provozních a transakčních RCS zpráv/);
assert.match(KAISER_RCS_CONSENT.text, /STOP/);

{
  const response = await onRequestOptions({
    request: new Request("https://smart-odpady.ai/api/public/rcs/opt-in", {
      method: "OPTIONS",
      headers: { Origin: "https://www.kaiserservis.cz" }
    })
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://www.kaiserservis.cz");
}

{
  const database = new FakeD1();
  const response = await onRequestPost({
    request: request({ phone: "+420777123456", operationalRcsConsent: true }, { origin: "https://example.com", ip: "203.0.113.11" }),
    env: { SMART_ODPADY_DB: database }
  });
  assert.equal(response.status, 403);
  assert.equal(database.consents.length, 0);
}

{
  const database = new FakeD1();
  const response = await onRequestPost({
    request: request({ phone: "+420777123456", operationalRcsConsent: false }, { ip: "203.0.113.12" }),
    env: { SMART_ODPADY_DB: database }
  });
  assert.equal(response.status, 400);
  assert.match((await payload(response)).error, /samostatný souhlas/);
  assert.equal(database.consents.length, 0);
}

{
  const database = new FakeD1();
  const response = await onRequestPost({
    request: request({ phone: "123", operationalRcsConsent: true }, { ip: "203.0.113.13" }),
    env: { SMART_ODPADY_DB: database }
  });
  assert.equal(response.status, 400);
  assert.match((await payload(response)).error, /české telefonní číslo/);
}

{
  const database = new FakeD1();
  const response = await onRequestPost({
    request: request({ phone: "+420777123456", operationalRcsConsent: true, website: "robot" }, { ip: "203.0.113.14" }),
    env: { SMART_ODPADY_DB: database }
  });
  assert.equal(response.status, 200);
  assert.equal(database.consents.length, 0);
}

{
  const database = new FakeD1();
  database.optOuts.add("+420777123456");
  const firstResponse = await onRequestPost({
    request: request({ phone: "777 123 456", operationalRcsConsent: true }, { ip: "203.0.113.15" }),
    env: { SMART_ODPADY_DB: database }
  });
  assert.equal(firstResponse.status, 201);
  const firstPayload = await payload(firstResponse);
  assert.equal(firstPayload.messageSent, false);
  assert.equal(database.consents.length, 1);
  assert.equal(database.consents[0].phone, "+420777123456");
  assert.equal(database.consents[0].consent_version, KAISER_RCS_CONSENT.version);
  assert.equal(database.optOuts.has("+420777123456"), false);

  const duplicateResponse = await onRequestPost({
    request: request({ phone: "+420777123456", operationalRcsConsent: true }, { ip: "203.0.113.16" }),
    env: { SMART_ODPADY_DB: database }
  });
  assert.equal(duplicateResponse.status, 200);
  assert.equal((await payload(duplicateResponse)).duplicate, true);
  assert.equal(database.consents.length, 1);
}

console.log("RCS consent tests passed.");
