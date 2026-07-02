import assert from "node:assert/strict";

import { createSessionCookie } from "../functions/_lib/auth.js";
import { handleSarlotaVoiceRequest } from "../functions/_lib/voice-sarlota.js";
import { onRequestGet as getDriverReportContext } from "../functions/api/ai/driver-reports/context.js";
import { onRequestGet as getDriverReportLicensePlate } from "../functions/api/driver-reports/license-plate.js";
import {
  resolveFleetVehiclesForDriver,
  validateFleetLicensePlate
} from "../functions/_lib/fleet-vehicles-store.js";
import { createElevenLabsClientTools } from "../src/elevenLabsClientTools.js";

const UNVERIFIED_VEHICLE_MESSAGE = "Nevidím bezpečně přiřazené vozidlo. Nadiktuj mi prosím SPZ nebo vyber vozidlo v aplikaci.";
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
    assert.equal(payload.messageForAssistant, "Nemám teď bezpečně ověřený seznam tvých vozidel. Otevřu ti výběr v aplikaci.");
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
    assert.match(payload.vehicles[0].vinMasked, /^WDB/);
    assert.match(payload.messageForAssistant, /Mercedes Atego|SPZ 1AB 2345/);
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
    assert.match(payload.messageForAssistant, /víc vozidel|výběr v aplikaci/);

    const tools = createElevenLabsClientTools({
      requestJson: async () => payload
    });
    const toolResult = await tools.get_driver_report_context({ sessionId: "multi-vehicle-test" });

    assert.equal(toolResult.vehiclesVerified, true);
    assert.equal(toolResult.vehiclesCount, 0);
    assert.deepEqual(toolResult.vehicles, []);
    assert.match(toolResult.answerText, /víc vozidel|výběr v aplikaci/);
    assert.equal(toolResult.answerText.includes("Mercedes Atego"), false);
    assert.equal(toolResult.answerText.includes("1AB 2345"), false);
    assert.equal(toolResult.answerText.includes("Mercedes Sprinter"), false);
    assert.equal(toolResult.answerText.includes("2AB 2345"), false);
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
  }
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

  const noFleetPlate = await licensePlatePayload(noFleetEnv, noFleetUser, "1AB2345");
  assert.equal(noFleetPlate.status, 403);
  assert.equal(noFleetPlate.payload.error, "K tomu nemáš oprávnění.");

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
    assert.equal(result.answerText, UNVERIFIED_VEHICLE_MESSAGE);
    assertNoVehicleLeak(result.answerText);
  }

  {
    let requestedPath = "";
    const tools = createElevenLabsClientTools({
      requestJson: async (path) => {
        requestedPath = path;
        return {
          requests: [
            {
              id: "req-1",
              reportId: "DR-001",
              status: "new",
              reportedAt: "2026-07-02T08:00:00.000Z",
              licensePlate: "1AB 2345",
              vin: "WDB12345678901234",
              driverPhone: "731 000 001",
              note: "Citlivá interní poznámka",
              probablePart: "světlo",
              defectDescription: "Prasklé pravé zadní světlo",
              patrikEmailStatus: "pending",
              kamilSmsStatus: "not_sent"
            },
            {
              id: "req-2",
              reportId: "DR-002",
              status: "ordered",
              licensePlate: "2AB 2345",
              probablePart: "zrcátko",
              defectDescription: "Ulomené zrcátko"
            }
          ],
          permissions: { canView: true },
          apiStatus: "ready"
        };
      }
    });

    const result = await tools.get_driver_reports_summary({ limit: 5 });
    assert.equal(requestedPath, "/api/driver-reports");
    assert.equal(result.ok, true);
    assert.equal(result.count, 2);
    assert.equal(result.items[0].vin, undefined);
    assert.equal(result.items[0].driverPhone, undefined);
    assert.equal(result.items[0].note, undefined);
    assert.equal(result.answerText.includes("WDB12345678901234"), false);
    assert.equal(result.answerText.includes("731 000 001"), false);
    assert.equal(result.answerText.includes("Citlivá interní poznámka"), false);
    assert.match(result.answerText, /Tvoje poslední hlášení/);
  }
}

await testVehiclePairingContext();
await testFleetSpzValidationAndPermissions();
await testVoiceCreateConfirmationGuards();
await testClientToolsNoHallucinationAndSummary();

console.log("sarlota driver reports e2e mock tests passed");
