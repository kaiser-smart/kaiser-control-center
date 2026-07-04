import assert from "node:assert/strict";

import { createSessionCookie } from "../functions/_lib/auth.js";
import {
  __test as voiceWriteTestInternals,
  onRequestGet as getVoiceWriteTestPlan,
  onRequestPost as postVoiceWriteTest
} from "../functions/api/ai/elevenlabs/sarlota-voice-write-test.js";

const TEST_URL = "https://kso.test";

const adminUser = {
  id: "radim-oplustil",
  name: "Radim Oplustil",
  email: "radim@example.invalid",
  phone: "731 000 001",
  role: "admin",
  status: "active"
};

function vehicle(overrides = {}) {
  return {
    id: "vehicle-radim-1",
    vehicleId: "vehicle-radim-1",
    internalNumber: "Mercedes Atego",
    licensePlate: "1AB 2345",
    vin: "WDB12345678901234",
    brand: "Mercedes",
    model: "Atego",
    status: "active",
    assignedDriverId: "radim-oplustil",
    assignedDriverName: "Radim Oplustil",
    assignedDriverPhone: "731 000 001",
    source: "fleet_db",
    ...overrides
  };
}

function envFor({ vehicles = [vehicle()] } = {}) {
  return {
    APP_ENV: "test",
    NODE_ENV: "test",
    AUTH_MODE: "mock",
    AUTH_SESSION_SECRET: "sarlota-voice-write-test-secret",
    SARLOTA_DRIVER_REPORTS_MOCK_MODE: "true",
    AUTH_USERS_JSON: JSON.stringify([adminUser]),
    SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON: JSON.stringify({
      provider: "fleet_db",
      source: "fleet_db",
      apiStatus: "ready",
      message: "Testovaci fleet fixture pro kontrolni voice write.",
      vehicles
    })
  };
}

async function sessionCookie(env) {
  const cookie = await createSessionCookie(env, adminUser);
  return cookie.split(";")[0];
}

async function getPlan(env) {
  const response = await getVoiceWriteTestPlan({
    request: new Request(`${TEST_URL}/api/ai/elevenlabs/sarlota-voice-write-test`, {
      headers: {
        Cookie: await sessionCookie(env)
      }
    }),
    env
  });
  return {
    status: response.status,
    payload: await response.json()
  };
}

async function postPlan(env, body = {}) {
  const response = await postVoiceWriteTest({
    request: new Request(`${TEST_URL}/api/ai/elevenlabs/sarlota-voice-write-test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await sessionCookie(env)
      },
      body: JSON.stringify(body)
    }),
    env
  });
  return {
    status: response.status,
    payload: await response.json()
  };
}

{
  const env = envFor();
  const { status, payload } = await getPlan(env);

  assert.equal(status, 200);
  assert.equal(payload.ready, true);
  assert.equal(payload.vehiclesVerified, true);
  assert.equal(payload.vehiclesCount, 1);
  assert.equal(payload.requiresVehicleSelection, false);
  assert.equal(payload.vehicles[0].vehicleName, "Mercedes Atego");
  assert.equal(payload.vehicles[0].licensePlate, "1AB 2345");
  assert.equal(payload.effects.usesVoiceHandler, true);
  assert.equal(payload.effects.confirmationSource, "kso-ui");
  assert.equal(payload.effects.returnsVin, false);
  assert.equal(JSON.stringify(payload).includes("WDB12345678901234"), false);
}

{
  const env = envFor();
  const { status, payload } = await postPlan(env, {
    apply: true,
    vehicleId: "vehicle-radim-1"
  });

  assert.equal(status, 400);
  assert.equal(payload.status, "confirmation_required");
  assert.equal(payload.confirmPhrase, voiceWriteTestInternals.CONFIRM_PHRASE);
}

{
  const env = envFor({
    vehicles: [
      vehicle({ id: "vehicle-radim-1", vehicleId: "vehicle-radim-1", licensePlate: "1AB 2345" }),
      vehicle({ id: "vehicle-radim-2", vehicleId: "vehicle-radim-2", licensePlate: "2AB 2345" })
    ]
  });
  const { status, payload } = await postPlan(env, {
    apply: true,
    confirm: voiceWriteTestInternals.CONFIRM_PHRASE
  });

  assert.equal(status, 409);
  assert.equal(payload.status, "vehicle_selection_required");
  assert.equal(payload.plan.requiresVehicleSelection, true);
}

{
  const env = envFor();
  const { status, payload } = await postPlan(env, {
    apply: true,
    confirm: voiceWriteTestInternals.CONFIRM_PHRASE,
    vehicleId: "vehicle-radim-1"
  });

  assert.equal(status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.status, "created_mock");
  assert.match(payload.reportId, /^MOCK-/);
  assert.equal(payload.notificationsSent, false);
  assert.equal(payload.diagnostics.usesVoiceHandler, true);
  assert.equal(payload.diagnostics.confirmationSource, "kso-ui");
  assert.equal(payload.diagnostics.confirmationTrusted, true);
  assert.equal(JSON.stringify(payload).includes("WDB12345678901234"), false);
}

console.log("sarlota voice write test endpoint tests passed");
