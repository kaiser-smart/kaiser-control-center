import assert from "node:assert/strict";

import { createSessionCookie } from "../functions/_lib/auth.js";
import { handleSarlotaVoiceRequest } from "../functions/_lib/voice-sarlota.js";
import { onRequestGet as getDriverReportContext } from "../functions/api/ai/driver-reports/context.js";
import { onRequestPost as getDriverReportContextVoiceWebhook } from "../functions/api/voice/driver-report-context.js";
import { onRequestGet as getDriverReportLicensePlate } from "../functions/api/driver-reports/license-plate.js";
import {
  resolveFleetVehiclesForDriver,
  validateFleetLicensePlate
} from "../functions/_lib/fleet-vehicles-store.js";
import { createElevenLabsClientTools } from "../src/elevenLabsClientTools.js";
import { elevenLabsWebhookToolConfigs } from "../src/elevenLabsWebhookTools.js";

const UNVERIFIED_VEHICLE_MESSAGE = "Nevidím bezpečně přiřazené vozidlo. Nadiktuj mi prosím SPZ.";
const NO_VERIFIED_ASSIGNED_VEHICLES_REASON = "NO_VERIFIED_ASSIGNED_VEHICLES";
const VEHICLE_QUESTION_PHRASES = [
  "Jaký tam jsou vozidla?",
  "Jaký tam mám?",
  "Ty tam vidíš co?",
  "Který vozidla mám přiřazený?"
];
const TEST_URL = "https://kso.test";

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

function envFor({
  user = baseUser,
  vehicles = [],
  provider = "fleet_db",
  source = "fleet_db",
  message = "Testovací fleet fixture pro Šarlotu."
} = {}) {
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
      message,
      vehicles
    })
  };
}

function userWithoutPermission(moduleId, action) {
  return {
    ...baseUser,
    permissions: [
      { moduleId, action, allowed: false }
    ]
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

async function voiceWebhookContextPayload(env, payload = {}, headers = {}) {
  const response = await getDriverReportContextVoiceWebhook({
    request: new Request(`${TEST_URL}/api/voice/driver-report-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-voice-assistant-token": "voice-test-token",
        ...headers
      },
      body: JSON.stringify(payload)
    }),
    env: {
      ...env,
      VOICE_ASSISTANT_WEBHOOK_TOKEN: "voice-test-token"
    }
  });
  const responsePayload = await response.json();
  return { status: response.status, payload: responsePayload };
}

async function licensePlatePayload(env, user = baseUser, value = "1AB2345") {
  const cookie = await createSessionCookie(env, user);
  const url = new URL("/api/driver-reports/license-plate", TEST_URL);
  url.searchParams.set("spz", value);

  const response = await getDriverReportLicensePlate({
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

function assertNoVehicleLeak(text = "") {
  assert.equal(text.includes("Falešný vůz"), false);
  assert.equal(text.includes("9ZZ 9999"), false);
  assert.equal(text.includes("WDBFAKEVIN0000000"), false);
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

async function testVehiclePairingContext() {
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
    const env = envFor({ vehicles: [vehicle()] });
    const { status, payload } = await contextPayload(env);

    assert.equal(status, 200);
    assert.equal(payload.vehiclesVerified, true);
    assert.equal(payload.vehiclesCount, 1);
    assert.equal(payload.vehicles[0].licensePlate, "1AB 2345");
    assert.equal(payload.vehicles[0].vin, undefined);
    assert.equal(payload.vehicles[0].vinPresent, true);
    assert.equal(payload.vehicles[0].vinMasked, undefined);
    assert.equal(payload.assistantMessage, payload.messageForAssistant);
    assert.match(payload.messageForAssistant, /Mercedes Atego|SPZ 1AB 2345/);
    assert.equal(payload.messageForAssistant.includes("WDB12345678901234"), false);
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
    assert.match(payload.messageForAssistant, /Mercedes Atego/);
    assert.match(payload.messageForAssistant, /SPZ 1AB 2345/);
    assert.match(payload.messageForAssistant, /Mercedes Sprinter/);
    assert.match(payload.messageForAssistant, /SPZ 2AB 2345/);
    assert.match(payload.messageForAssistant, /Kterého se závada týká/);
    assert.equal(payload.assistantMessage, payload.messageForAssistant);
    assert.equal(payload.messageForAssistant.includes("WDB"), false);

    const tools = createElevenLabsClientTools({
      requestJson: async () => payload
    });
    const toolResult = await tools.get_driver_report_context({ sessionId: "multi-vehicle-test" });

    assert.equal(toolResult.vehiclesVerified, true);
    assert.equal(toolResult.vehiclesCount, 2);
    assert.equal(toolResult.vehicles.length, 2);
    assert.equal(toolResult.vehicleOrdinalSelectionAllowed, true);
    assert.match(toolResult.answerText, /Mercedes Atego/);
    assert.match(toolResult.answerText, /SPZ 1AB 2345/);
    assert.match(toolResult.answerText, /Mercedes Sprinter/);
    assert.match(toolResult.answerText, /SPZ 2AB 2345/);
    assert.match(toolResult.answerText, /Kterého se závada týká/);
    assert.equal(toolResult.assistantMessage, toolResult.answerText);
    assert.equal(toolResult.answerText.includes("WDB"), false);

    for (const [index, phrase] of VEHICLE_QUESTION_PHRASES.entries()) {
      const phrasePayload = await contextPayload(env, baseUser, { transcriptIntent: phrase });
      assert.equal(phrasePayload.payload.vehiclesVerified, true);
      assert.equal(phrasePayload.payload.vehiclesCount, 2);
      assert.match(phrasePayload.payload.messageForAssistant, /Mercedes Atego/);
      assert.match(phrasePayload.payload.messageForAssistant, /SPZ 1AB 2345/);
      assert.match(phrasePayload.payload.messageForAssistant, /Mercedes Sprinter/);
      assert.match(phrasePayload.payload.messageForAssistant, /SPZ 2AB 2345/);
      assert.equal(phrasePayload.payload.assistantMessage, phrasePayload.payload.messageForAssistant);
      assert.equal(phrasePayload.payload.messageForAssistant.includes("WDB"), false);

      const phraseToolResult = await tools.get_driver_report_context({
        sessionId: `vehicle-question-${index}`,
        transcriptIntent: phrase
      });
      assert.equal(phraseToolResult.vehiclesVerified, true);
      assert.equal(phraseToolResult.vehiclesCount, 2);
      assert.match(phraseToolResult.answerText, /Kterého se závada týká/);
      assert.equal(phraseToolResult.assistantMessage, phraseToolResult.answerText);
      assert.equal(phraseToolResult.answerText.includes("WDB"), false);
    }
  }

  {
    const env = envFor({
      provider: "local_mock",
      source: "local_mock",
      message: "Lokální mock data",
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
    const env = envFor({
      vehicles: [vehicle({ assignedDriverId: "driver-someone-else" })]
    });
    const { status, payload } = await contextPayload(env);

    assert.equal(status, 200);
    assert.equal(payload.vehiclesVerified, false);
    assert.deepEqual(payload.vehicles, []);
    assert.equal(payload.reason, NO_VERIFIED_ASSIGNED_VEHICLES_REASON);
    assert.equal(payload.assistantMessage, UNVERIFIED_VEHICLE_MESSAGE);
  }
}

async function testVoiceWebhookContext() {
  {
    const env = envFor();
    const { status, payload } = await voiceWebhookContextPayload(env, {
      dynamic_variables: { user_id: "driver-radim" },
      conversation_id: "conv-no-vehicles",
      transcriptIntent: "Jaký tam mám vozidla?"
    });

    assert.equal(status, 200);
    assert.equal(payload.source, "kso_voice_webhook");
    assert.equal(payload.toolName, "get_driver_report_context");
    assert.equal(payload.vehiclesVerified, false);
    assert.deepEqual(payload.vehicles, []);
    assert.equal(payload.reason, NO_VERIFIED_ASSIGNED_VEHICLES_REASON);
    assert.equal(payload.assistantMessage, UNVERIFIED_VEHICLE_MESSAGE);
    assert.equal(payload.answerText, UNVERIFIED_VEHICLE_MESSAGE);
    assert.equal(payload.answerText.includes("Ford Transit"), false);
    assert.equal(payload.answerText.includes("5A4 8921"), false);
    assert.equal(payload.answerText.includes("1A2 3456"), false);
  }

  {
    const env = envFor({ vehicles: [vehicle()] });
    const { status, payload } = await voiceWebhookContextPayload(env, {
      user_id: "driver-radim",
      conversation_id: "conv-one-vehicle",
      transcriptIntent: "Potřebuju nahlásit závadu na vozidle."
    });

    assert.equal(status, 200);
    assert.equal(payload.source, "kso_voice_webhook");
    assert.equal(payload.toolName, "get_driver_report_context");
    assert.equal(payload.vehiclesVerified, true);
    assert.equal(payload.vehiclesCount, 1);
    assert.equal(payload.vehicles[0].displayName, "Mercedes Atego");
    assert.equal(payload.vehicles[0].licensePlate, "1AB 2345");
    assert.equal(payload.vehicles[0].vin, undefined);
    assert.equal(payload.vehicles[0].vinMasked, undefined);
    assert.match(payload.assistantMessage, /Mercedes Atego/);
    assert.match(payload.assistantMessage, /SPZ 1AB 2345/);
    assert.equal(payload.assistantMessage.includes("WDB"), false);
  }

  {
    const env = envFor({ vehicles: [vehicle()] });
    const { status, payload } = await voiceWebhookContextPayload(env, {
      user_id: "driver-radim"
    }, {
      "x-voice-assistant-token": "wrong-token"
    });

    assert.equal(status, 401);
    assert.equal(payload.error, "Nepřihlášeno.");
  }
}

function testElevenLabsWebhookToolSchema() {
  const [tool] = elevenLabsWebhookToolConfigs({
    APP_BASE_URL: "https://kso.example.test/",
    ELEVENLABS_VOICE_WEBHOOK_TOKEN_ENV_LABEL: "kso_test_voice_token"
  });

  assert.equal(tool.type, "webhook");
  assert.equal(tool.name, "get_driver_report_context");
  assert.equal(tool.api_schema.url, "https://kso.example.test/api/voice/driver-report-context");
  assert.equal(tool.api_schema.method, "POST");
  assert.equal(tool.api_schema.request_headers["x-voice-assistant-token"].env_var_label, "kso_test_voice_token");
  assert.equal(tool.api_schema.request_body_schema.properties.user_id.dynamic_variable, "user_id");
  assert.equal(tool.api_schema.request_body_schema.properties.conversation_id.dynamic_variable, "conversation_id");
  assert.equal(tool.api_schema.request_body_schema.properties.currentModule.constant_value, "hlaseni-ridicu");
  assert.deepEqual(tool.api_schema.request_body_schema.required, ["user_id"]);
  assert.equal(tool.api_schema.response_filter.mode, "allow");
  assert.deepEqual(tool.api_schema.response_filter.filters, [
    "vehiclesVerified",
    "vehicles",
    "vehiclesCount",
    "reason",
    "assistantMessage",
    "answerText"
  ]);
  assert.equal(JSON.stringify(tool).includes("voice-test-token"), false);
  assert.equal(JSON.stringify(tool).includes("sk_"), false);
}

async function testFleetSpzValidationAndPermissions() {
  const env = envFor({ vehicles: [vehicle()] });
  const exact = await validateFleetLicensePlate(env, "1AB2345", baseUser);
  assert.equal(exact.exact, true);
  assert.equal(exact.vehicle.licensePlate, "1AB 2345");

  const exactEndpoint = await licensePlatePayload(env, baseUser, "1AB2345");
  assert.equal(exactEndpoint.status, 200);
  assert.equal(exactEndpoint.payload.exact, true);

  const missing = await validateFleetLicensePlate(env, "9ZZ9999", baseUser);
  assert.equal(missing.exact, false);

  const noFleetUser = userWithoutPermission("fleet", "view");
  const noFleetEnv = envFor({ user: noFleetUser, vehicles: [vehicle()] });
  const noFleetContext = await contextPayload(noFleetEnv, noFleetUser);
  assert.equal(noFleetContext.status, 403);
  assert.equal(noFleetContext.payload.message, "K tomu nemáš oprávnění.");

  const noCreateUser = userWithoutPermission("driver-reports", "create");
  const noCreateEnv = envFor({ user: noCreateUser, vehicles: [vehicle()] });
  const noCreateContext = await contextPayload(noCreateEnv, noCreateUser);
  assert.equal(noCreateContext.status, 403);
  assert.equal(noCreateContext.payload.message, "K tomu nemáš oprávnění.");

  const noFleetMatch = await resolveFleetVehiclesForDriver(noFleetEnv, noFleetUser, { strictDriverAssignment: true });
  assert.equal(noFleetMatch.status, "unavailable");
  assert.deepEqual(noFleetMatch.candidates, []);
}

async function testVoiceCreateConfirmationGuards() {
  const env = envFor({ vehicles: [vehicle()] });

  const prepared = await prepareVoiceCreate(env);
  assert.equal(prepared.status, "needs_confirmation");
  assert.equal(prepared.notificationsSent, false);
  assert.match(prepared.reply, /Potvrď|uložit|předat/);
  assert.equal(prepared.preparedActions.length, 1);

  const action = prepared.preparedActions[0];
  assert.equal(action.requiresConfirmation, true);
  assert.deepEqual(action.confirmationSourceRequired, ["kso-ui"]);
  assert.match(action.confirmationId, /^driver-part-confirm-/);

  const forged = await prepareVoiceCreate(env, {
    parameters: {
      confirmed: true
    }
  });
  assert.equal(forged.status, "needs_confirmation");
  assert.equal(forged.driverPartRequest, null);
  assert.equal(forged.notificationsSent, false);
  assert.equal(forged.reply, "Potvrď to prosím v aplikaci.");

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
  assert.equal(confirmed.reply.includes("předala Patrikovi"), false);
  assert.equal(confirmed.reply.includes("předala Kamilovi"), false);

  const missingVehicle = await handleSarlotaVoiceRequest(env, baseUser, {
    mockMode: true,
    intent: "driver_part_request",
    text: "Chci nahlásit prasklé pravé zadní světlo.",
    parameters: {
      defectDescription: "prasklé pravé zadní světlo"
    },
    context: {
      requestedIntent: "driver_part_request"
    }
  }, { authSource: "test" });

  assert.equal(missingVehicle.status, "needs_input");
  assert.equal(missingVehicle.reply, UNVERIFIED_VEHICLE_MESSAGE);
}

async function testClientToolsNoHallucinationAndSummary() {
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
            displayName: "Falešný vůz",
            licensePlate: "9ZZ 9999",
            spz: "9ZZ 9999",
            vin: "WDBFAKEVIN0000000",
            assignedToCurrentDriver: true,
            existsInFleet: true,
            active: true,
            source: "fleet_db"
          }
        ],
        vehiclesCount: 1,
        messageForAssistant: UNVERIFIED_VEHICLE_MESSAGE,
        apiStatus: "ready"
      })
    });
    const result = await tools.get_driver_report_context({ sessionId: "hallucination-guard" });

    assert.equal(result.vehiclesVerified, false);
    assert.deepEqual(result.vehicles, []);
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
    assert.equal(result.answerText.includes("Ford Transit"), false, name);
    assert.equal(result.answerText.includes("5A4 8921"), false, name);
    assert.equal(result.answerText.includes("1A2 3456"), false, name);
  }

  {
    const tools = createElevenLabsClientTools({
      requestJson: async () => ({
        ok: true,
        module: "hlaseni-ridicu",
        userName: "Radim",
        userResolved: true,
        employeeResolved: true,
        driverResolved: true,
        vehiclesVerified: true,
        vehiclePickerAvailable: true,
        vehicles: [
          {
            id: "vehicle-1",
            vehicleId: "vehicle-1",
            displayName: "Mercedes Atego",
            licensePlate: "1AB 2345",
            spz: "1AB 2345",
            vinMasked: "WDB**********1234",
            assignedToCurrentDriver: true,
            existsInFleet: true,
            active: true,
            source: "fleet_db"
          }
        ],
        vehiclesCount: 1,
        assistantMessage: "Vidím VIN WDB12345678901234 a tohle se nesmí přečíst.",
        apiStatus: "ready"
      })
    });
    const result = await tools.get_driver_report_context({ sessionId: "one-verified-vehicle" });

    assert.equal(result.vehiclesVerified, true);
    assert.equal(result.vehiclesCount, 1);
    assert.equal(result.assistantMessage, result.answerText);
    assert.match(result.answerText, /Mercedes Atego/);
    assert.match(result.answerText, /SPZ 1AB 2345/);
    assert.equal(result.answerText.includes("WDB"), false);
  }

}

await testVehiclePairingContext();
await testVoiceWebhookContext();
testElevenLabsWebhookToolSchema();
await testFleetSpzValidationAndPermissions();
await testVoiceCreateConfirmationGuards();
await testClientToolsNoHallucinationAndSummary();

console.log("sarlota driver reports e2e mock tests passed");
