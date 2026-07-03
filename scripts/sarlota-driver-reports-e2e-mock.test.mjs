import assert from "node:assert/strict";

import { createSessionCookie } from "../functions/_lib/auth.js";
import { handleSarlotaVoiceRequest } from "../functions/_lib/voice-sarlota.js";
import { onRequestGet as getDriverReportContext } from "../functions/api/ai/driver-reports/context.js";
import { createElevenLabsClientTools } from "../src/elevenLabsClientTools.js";

const TEST_URL = "https://kso.test";
const UNVERIFIED_VEHICLE_MESSAGE = "Nevidím bezpečně přiřazené vozidlo. Nadiktuj mi prosím SPZ.";
const NO_VERIFIED_ASSIGNED_VEHICLES_REASON = "NO_VERIFIED_ASSIGNED_VEHICLES";
const VEHICLE_QUESTION_PHRASES = [
  "Jaký tam jsou vozidla?",
  "Jaký tam mám?",
  "Ty tam vidíš co?",
  "Který vozidla mám přiřazený?"
];

const baseUser = {
  id: "driver-radim",
  name: "Radim Test",
  email: "radim.test@example.invalid",
  phone: "731 000 001",
  role: "ridic",
  status: "active"
};

function vehicle(overrides = {}) {
  return {
    id: "vehicle-1",
    vehicleId: "vehicle-1",
    internalNumber: "Mercedes Atego",
    licensePlate: "1AB 2345",
    vin: "WDB12345678901234",
    brand: "Mercedes",
    model: "Atego",
    status: "active",
    assignedDriverId: "driver-radim",
    assignedDriverName: "Radim Test",
    assignedDriverPhone: "731 000 001",
    source: "fleet_db",
    ...overrides
  };
}

function envFor({ user = baseUser, vehicles = [], provider = "fleet_db", source = "fleet_db" } = {}) {
  return {
    APP_ENV: "test",
    NODE_ENV: "test",
    AUTH_MODE: "mock",
    AUTH_SESSION_SECRET: "sarlota-driver-reports-test-secret",
    SARLOTA_DRIVER_REPORTS_MOCK_MODE: "true",
    AUTH_USERS_JSON: JSON.stringify([user]),
    SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON: JSON.stringify({
      provider,
      source,
      apiStatus: "ready",
      message: "Testovací fleet fixture pro Šarlotu.",
      vehicles
    })
  };
}

async function contextPayload(env, user = baseUser, params = {}) {
  const cookie = await createSessionCookie(env, user);
  const url = new URL("/api/ai/driver-reports/context", TEST_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await getDriverReportContext({
    request: new Request(url, {
      headers: {
        Cookie: cookie.split(";")[0]
      }
    }),
    env
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function prepareVoiceCreate(env, payload = {}) {
  return handleSarlotaVoiceRequest(env, baseUser, {
    mockMode: true,
    intent: "driver_part_request",
    text: "Chci nahlásit prasklé pravé zadní světlo na autě 1AB 2345.",
    parameters: {
      defectDescription: "prasklé pravé zadní světlo",
      licensePlate: "1AB 2345",
      spzManual: "1AB 2345",
      spzValidated: true,
      ...payload.parameters
    },
    context: {
      requestedIntent: "driver_part_request",
      ...payload.context
    },
    ...payload
  }, { authSource: "test" });
}

function assertNoVehicleLeak(text = "") {
  assert.equal(text.includes("Ford Transit"), false);
  assert.equal(text.includes("5A4 8921"), false);
  assert.equal(text.includes("1A2 3456"), false);
  assert.equal(text.includes("WDB"), false);
}

{
  const env = envFor();
  const { status, payload } = await contextPayload(env);

  assert.equal(status, 200);
  assert.equal(payload.vehiclesVerified, false);
  assert.equal(payload.vehiclesCount, 0);
  assert.equal(payload.reason, NO_VERIFIED_ASSIGNED_VEHICLES_REASON);
  assert.equal(payload.assistantMessage, UNVERIFIED_VEHICLE_MESSAGE);
  assert.equal(payload.messageForAssistant, UNVERIFIED_VEHICLE_MESSAGE);
}

{
  const env = envFor({
    vehicles: [
      vehicle(),
      vehicle({
        id: "vehicle-2",
        vehicleId: "vehicle-2",
        internalNumber: "Mercedes Sprinter",
        model: "Sprinter",
        licensePlate: "2AB 2345",
        vin: "WDB22222222222222"
      })
    ]
  });
  const { status, payload } = await contextPayload(env);

  assert.equal(status, 200);
  assert.equal(payload.vehiclesVerified, true);
  assert.equal(payload.vehiclesCount, 2);
  assert.equal(payload.vehicles[0].vin, undefined);
  assert.equal(payload.vehicles[0].vinPresent, true);
  assert.match(payload.vehicles[0].vinMasked, /^WDB/);
  assert.match(payload.messageForAssistant, /Mercedes Atego/);
  assert.match(payload.messageForAssistant, /SPZ 1AB 2345/);
  assert.match(payload.messageForAssistant, /Mercedes Sprinter/);
  assert.match(payload.messageForAssistant, /SPZ 2AB 2345/);
  assert.equal(payload.assistantMessage, payload.messageForAssistant);
  assert.equal(payload.messageForAssistant.includes("WDB"), false);

  const tools = createElevenLabsClientTools({
    requestJson: async () => payload
  });
  for (const [index, phrase] of VEHICLE_QUESTION_PHRASES.entries()) {
    const phrasePayload = await contextPayload(env, baseUser, { transcriptIntent: phrase });
    assert.equal(phrasePayload.payload.vehiclesVerified, true);
    assert.equal(phrasePayload.payload.vehiclesCount, 2);
    assert.match(phrasePayload.payload.messageForAssistant, /Mercedes Atego/);
    assert.match(phrasePayload.payload.messageForAssistant, /SPZ 1AB 2345/);
    assert.match(phrasePayload.payload.messageForAssistant, /Mercedes Sprinter/);
    assert.match(phrasePayload.payload.messageForAssistant, /SPZ 2AB 2345/);
    assert.equal(phrasePayload.payload.messageForAssistant.includes("WDB"), false);

    const toolResult = await tools.get_driver_report_context({
      sessionId: `vehicle-question-${index}`,
      transcriptIntent: phrase
    });
    assert.equal(toolResult.vehiclesVerified, true);
    assert.equal(toolResult.vehiclesCount, 2);
    assert.equal(toolResult.assistantMessage, toolResult.answerText);
    assert.match(toolResult.answerText, /Kterého se závada týká/);
    assert.equal(toolResult.answerText.includes("WDB"), false);
  }
}

{
  const env = envFor({
    provider: "local_mock",
    source: "local_mock",
    vehicles: [vehicle({ source: "local_mock" })]
  });
  const { status, payload } = await contextPayload(env);

  assert.equal(status, 200);
  assert.equal(payload.vehiclesVerified, false);
  assert.deepEqual(payload.vehicles, []);
  assert.equal(payload.reason, NO_VERIFIED_ASSIGNED_VEHICLES_REASON);
  assert.equal(payload.assistantMessage, UNVERIFIED_VEHICLE_MESSAGE);
  assert.equal(payload.messageForAssistant.includes("1AB 2345"), false);
}

{
  const env = envFor({ vehicles: [vehicle()] });
  const prepared = await prepareVoiceCreate(env);

  assert.equal(prepared.status, "needs_confirmation");
  assert.equal(prepared.notificationsSent, false);
  assert.equal(prepared.preparedActions.length, 1);

  const action = prepared.preparedActions[0];
  assert.equal(action.requiresConfirmation, true);
  assert.deepEqual(action.confirmationSourceRequired, ["kso-ui"]);
  assert.match(action.confirmationId, /^driver-part-confirm-/);

  const voiceExplicit = await prepareVoiceCreate(env, {
    parameters: {
      ...action.parameters,
      confirmed: true,
      confirmationSource: "voice-explicit",
      confirmationId: action.confirmationId
    }
  });
  assert.equal(voiceExplicit.status, "needs_confirmation");
  assert.equal(voiceExplicit.driverPartRequest, null);
  assert.equal(voiceExplicit.notificationsSent, false);
  assert.equal(voiceExplicit.reply, "Potvrď to prosím v aplikaci.");

  const confirmed = await prepareVoiceCreate(env, {
    parameters: {
      ...action.parameters,
      confirmed: true,
      confirmationSource: "kso-ui",
      confirmationId: action.confirmationId
    }
  });
  assert.equal(confirmed.status, "created_mock");
  assert.equal(confirmed.notificationsSent, false);
  assert.equal(confirmed.driverPartRequest.status, "mock_created");
  assert.match(confirmed.reply, /Mock hotovo/);
}

{
  const tools = createElevenLabsClientTools({
    requestJson: async () => ({
      ok: true,
      module: "hlaseni-ridicu",
      userName: "Radim",
      userResolved: true,
      employeeResolved: true,
      driverResolved: false,
      vehiclesVerified: false,
      vehiclePickerAvailable: false,
      vehicles: [
        {
          id: "fake",
          vehicleId: "fake",
          displayName: "Ford Transit",
          licensePlate: "5A4 8921",
          spz: "5A4 8921",
          vin: "WDBFAKEVIN0000000",
          assignedToCurrentDriver: true,
          existsInFleet: true,
          active: true,
          source: "fleet_db"
        }
      ],
      vehiclesCount: 1,
      messageForAssistant: "Tool called successfully.",
      apiStatus: "ready"
    })
  });
  const result = await tools.get_driver_report_context({ sessionId: "hallucination-guard" });

  assert.equal(result.vehiclesVerified, false);
  assert.deepEqual(result.vehicles, []);
  assert.equal(result.reason, NO_VERIFIED_ASSIGNED_VEHICLES_REASON);
  assert.equal(result.assistantMessage, UNVERIFIED_VEHICLE_MESSAGE);
  assert.equal(result.answerText, UNVERIFIED_VEHICLE_MESSAGE);
  assertNoVehicleLeak(result.answerText);
}

for (const [name, payload] of [
  ["empty object", {}],
  ["generic string", "Tool called successfully."],
  ["generic response message", { ok: true, message: "Tool called successfully." }],
  ["vehicles verified false", { ok: true, vehiclesVerified: false, vehicles: [] }]
]) {
  const tools = createElevenLabsClientTools({
    requestJson: async () => payload
  });
  const result = await tools.get_driver_report_context({ sessionId: `hallucination-guard-${name}` });

  assert.equal(result.vehiclesVerified, false, name);
  assert.deepEqual(result.vehicles, [], name);
  assert.equal(result.reason, NO_VERIFIED_ASSIGNED_VEHICLES_REASON, name);
  assert.equal(result.assistantMessage, UNVERIFIED_VEHICLE_MESSAGE, name);
  assert.equal(result.answerText, UNVERIFIED_VEHICLE_MESSAGE, name);
  assertNoVehicleLeak(result.answerText);
}

console.log("sarlota driver reports e2e mock tests passed");
