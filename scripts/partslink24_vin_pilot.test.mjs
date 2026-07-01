import assert from "node:assert/strict";

import {
  detectPartslink24AttentionReloadText,
  detectTwoFactorChallengeText,
  isPassengerVehicleKind,
  maskVin,
  normalizeVehicleKind,
  parseBoolean,
  redactSensitive,
  runPartslink24VinPilot,
  safePreview
} from "./partslink24_vin_pilot.mjs";

assert.equal(maskVin("WDB12345678901234"), "WDB**********1234");
assert.equal(maskVin("ABC1234"), "*******");
assert.equal(normalizeVehicleKind("osobní"), "osobni");
assert.equal(isPassengerVehicleKind("osobní"), true);
assert.equal(isPassengerVehicleKind("nákladní"), false);
assert.equal(detectTwoFactorChallengeText("Zadej ověřovací kód z e-mailu."), true);
assert.equal(detectTwoFactorChallengeText("Enter the verification code sent to your email."), true);
assert.equal(detectTwoFactorChallengeText("Bitte geben Sie den Sicherheitscode ein."), true);
assert.equal(detectTwoFactorChallengeText("Vítej ve vyhledávání VIN."), false);
assert.equal(detectPartslink24AttentionReloadText("Attention - Please read carefully. This site may appear because you are using a bookmark. Reload the page using the main domain."), true);
assert.equal(detectPartslink24AttentionReloadText("partslink24 user login Company ID User name Password"), false);
assert.equal(parseBoolean("true"), true);
assert.equal(parseBoolean("0"), false);
assert.equal(redactSensitive("login admin pass dummy-password VIN WDB12345678901234", [
  "admin",
  "dummy-password",
  "WDB12345678901234"
]), "login [REDACTED] pass [REDACTED] VIN [REDACTED]");
assert.equal(safePreview("company cz-879576 user admin pass dummy-password VIN WDB12345678901234", {
  companyId: "cz-879576",
  username: "admin",
  password: "dummy-password",
  vin: "WDB12345678901234"
}), "company [REDACTED] user [REDACTED] pass [REDACTED] VIN [REDACTED]");

{
  const result = await runPartslink24VinPilot({}, {
    PARTSLINK24_COMPANY_ID: "cz-879576",
    PARTSLINK24_USERNAME: "admin",
    PARTSLINK24_PASSWORD: "dummy-password",
    PARTSLINK24_TEST_VIN: "WDB12345678901234",
    PARTSLINK24_TEST_VEHICLE_KIND: "osobni",
    PARTSLINK24_PILOT_DRY_RUN: "true"
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "dry_run_ready");
  assert.equal(result.vinMasked, "WDB**********1234");
}

{
  const result = await runPartslink24VinPilot({}, {
    PARTSLINK24_TEST_VEHICLE_KIND: "osobni",
    PARTSLINK24_TEST_VIN: "WDB12345678901234"
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "configuration_missing");
  assert.equal(result.errorCode, "PARTSLINK24_SECRETS_MISSING");
  assert.deepEqual(result.missingSecrets, [
    "PARTSLINK24_COMPANY_ID",
    "PARTSLINK24_USERNAME",
    "PARTSLINK24_PASSWORD"
  ]);
}

{
  const result = await runPartslink24VinPilot({}, {
    PARTSLINK24_COMPANY_ID: "cz-879576",
    PARTSLINK24_USERNAME: "admin",
    PARTSLINK24_PASSWORD: "dummy-password",
    PARTSLINK24_TEST_VIN: "WDB12345678901234",
    PARTSLINK24_TEST_VEHICLE_KIND: "nakladni",
    PARTSLINK24_PILOT_DRY_RUN: "true"
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.errorCode, "VEHICLE_KIND_NOT_SUPPORTED");
}

{
  const result = await runPartslink24VinPilot({}, {
    PARTSLINK24_COMPANY_ID: "cz-879576",
    PARTSLINK24_USERNAME: "admin",
    PARTSLINK24_PASSWORD: "dummy-password",
    PARTSLINK24_TEST_VIN: "WDB12345678901234",
    PARTSLINK24_PILOT_DRY_RUN: "true"
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.errorCode, "VEHICLE_KIND_REQUIRED");
}

console.log("partslink24 VIN pilot tests passed");
