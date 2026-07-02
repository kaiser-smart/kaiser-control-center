import assert from "node:assert/strict";

import { createSessionCookie } from "../functions/_lib/auth.js";
import { onRequestGet as getDriverReportContext } from "../functions/api/ai/driver-reports/context.js";
import { onRequestGet as getDriverReportLicensePlate } from "../functions/api/driver-reports/license-plate.js";
import { resolveFleetVehiclesForDriver } from "../functions/_lib/fleet-vehicles-store.js";
import { createElevenLabsClientTools } from "../src/elevenLabsClientTools.js";

const TEST_URL = "https://kso.test";

const radimUser = {
  id: "user-radim",
  name: "Radim Caller",
  email: "radim.caller@example.invalid",
  phone: "731 000 001",
  role: "ridic",
  status: "active"
};

const otherUserWithSameContact = {
  id: "user-other",
  name: "Radim Caller",
  email: "other.caller@example.invalid",
  phone: "731 000 001",
  role: "ridic",
  status: "active"
};

const noFleetUser = {
  ...radimUser,
  id: "user-no-fleet",
  email: "no-fleet@example.invalid",
  permissions: [
    { moduleId: "fleet", action: "view", allowed: false }
  ]
};

const employeeRows = [
  {
    id: "employee-radim",
    user_id: "user-radim",
    first_name: "Radim",
    last_name: "Caller",
    email: "radim.caller@example.invalid",
    phone: "731 000 001",
    role: "ridic",
    employment_status: "active"
  },
  {
    id: "employee-other",
    user_id: "user-other",
    first_name: "Radim",
    last_name: "Caller",
    email: "other.caller@example.invalid",
    phone: "731 000 001",
    role: "ridic",
    employment_status: "active"
  },
  {
    id: "employee-no-fleet",
    user_id: "user-no-fleet",
    first_name: "No",
    last_name: "Fleet",
    email: "no-fleet@example.invalid",
    phone: "731 000 009",
    role: "ridic",
    employment_status: "active"
  }
];

function vehicle(overrides = {}) {
  return {
    id: "vehicle-radim",
    vehicleId: "vehicle-radim",
    internalNumber: "Mercedes Atego",
    licensePlate: "1AB 2345",
    vin: "WDB12345678901234",
    brand: "Mercedes",
    model: "Atego",
    status: "active",
    assignedDriverId: "employee-radim",
    assignedDriverName: "Radim Caller",
    assignedDriverPhone: "731 000 001",
    source: "fleet_db",
    ...overrides
  };
}

function fakeD1(employeeCards = []) {
  return {
    prepare(sql) {
      const query = String(sql || "").replace(/\s+/g, " ").trim();

      return {
        bind() {
          return this;
        },
        async all() {
          if (/\bFROM users\b/i.test(query)) {
            return { results: [] };
          }

          if (/\bFROM employee_cards\b/i.test(query)) {
            return { results: employeeCards };
          }

          throw new Error(`Unexpected read query in caller identity harness: ${query.slice(0, 120)}`);
        },
        async first() {
          return null;
        },
        async run() {
          throw new Error("Caller identity harness is read-only.");
        }
      };
    }
  };
}

function envFor({
  users = [radimUser, otherUserWithSameContact],
  employees = employeeRows,
  vehicles = []
} = {}) {
  return {
    APP_ENV: "test",
    NODE_ENV: "test",
    AUTH_MODE: "mock",
    AUTH_SESSION_SECRET: "sarlota-caller-identity-runtime-secret",
    AUTH_USERS_JSON: JSON.stringify(users),
    SARLOTA_DRIVER_REPORTS_MOCK_MODE: "true",
    SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON: JSON.stringify({
      provider: "fleet_db",
      source: "fleet_db",
      apiStatus: "ready",
      message: "Caller identity runtime fixture.",
      vehicles
    }),
    SMART_ODPADY_DB: fakeD1(employees)
  };
}

async function cookieFor(env, user) {
  const cookie = await createSessionCookie(env, user);
  return cookie.split(";")[0];
}

async function contextPayload(env, user, params = {}) {
  const url = new URL("/api/ai/driver-reports/context", TEST_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await getDriverReportContext({
    request: new Request(url, {
      headers: {
        Cookie: await cookieFor(env, user)
      }
    }),
    env
  });

  return {
    status: response.status,
    payload: await response.json()
  };
}

async function licensePlatePayload(env, user, spz) {
  const url = new URL("/api/driver-reports/license-plate", TEST_URL);
  url.searchParams.set("spz", spz);

  const response = await getDriverReportLicensePlate({
    request: new Request(url, {
      headers: {
        Cookie: await cookieFor(env, user)
      }
    }),
    env
  });

  return {
    status: response.status,
    payload: await response.json()
  };
}

function assertNoTrapVehicle(payload) {
  const text = JSON.stringify(payload);
  assert.equal(text.includes("vehicle-other"), false);
  assert.equal(text.includes("vehicle-phone-trap"), false);
  assert.equal(text.includes("9ZZ 9999"), false);
}

async function testKsoSessionUserControlsVehicleLookup() {
  const env = envFor({
    vehicles: [
      vehicle(),
      vehicle({
        id: "vehicle-other",
        vehicleId: "vehicle-other",
        internalNumber: "Other driver's vehicle",
        licensePlate: "9ZZ 9999",
        assignedDriverId: "employee-other"
      }),
      vehicle({
        id: "vehicle-phone-trap",
        vehicleId: "vehicle-phone-trap",
        internalNumber: "Phone-only trap",
        licensePlate: "8ZZ 9999",
        assignedDriverId: "",
        assignedDriverPhone: "731 000 001"
      })
    ]
  });

  const { status, payload } = await contextPayload(env, radimUser, {
    transcriptIntent: "Chci nahlasit zavadu na aute.",
    callerPhone: "+420999999999"
  });

  assert.equal(status, 200);
  assert.equal(payload.user.id, "user-radim");
  assert.equal(payload.driver.employeeId, "employee-radim");
  assert.equal(payload.driver.source, "employees");
  assert.equal(payload.vehiclesVerified, true);
  assert.equal(payload.vehiclesCount, 1);
  assert.equal(payload.vehicles[0].vehicleId, "vehicle-radim");
  assert.equal(payload.vehicles[0].licensePlate, "1AB 2345");
  assertNoTrapVehicle(payload.vehicles);

  const directMatch = await resolveFleetVehiclesForDriver(env, radimUser, {
    strictDriverAssignment: true,
    driverIds: ["employee-radim", "user-radim"],
    driverPhone: "731 000 001",
    driverName: "Radim Caller"
  });

  assert.equal(directMatch.status, "single");
  assert.equal(directMatch.fallbackUsed, false);
  assert.equal(directMatch.lookupReason, "driver_id");
  assert.equal(directMatch.candidates[0].id, "vehicle-radim");
  assertNoTrapVehicle(directMatch.candidates);
}

async function testMultipleVehiclesForcePickerWithoutVoiceLeak() {
  const env = envFor({
    vehicles: [
      vehicle(),
      vehicle({
        id: "vehicle-radim-2",
        vehicleId: "vehicle-radim-2",
        internalNumber: "Mercedes Sprinter",
        licensePlate: "2AB 2345",
        assignedDriverId: "user-radim"
      })
    ]
  });
  const { payload } = await contextPayload(env, radimUser);

  assert.equal(payload.vehiclesVerified, true);
  assert.equal(payload.vehiclesCount, 2);

  const tools = createElevenLabsClientTools({
    requestJson: async () => payload
  });
  const toolResult = await tools.get_driver_report_context({ sessionId: "caller-identity-multiple" });

  assert.equal(toolResult.vehiclesVerified, true);
  assert.equal(toolResult.vehiclesCount, 0);
  assert.deepEqual(toolResult.vehicles, []);
  assert.match(toolResult.answerText, /vyber|výběr|vic|víc/i);
  assert.equal(toolResult.answerText.includes("1AB 2345"), false);
  assert.equal(toolResult.answerText.includes("2AB 2345"), false);
}

async function testNoAssignedVehicleDoesNotFallBackToPhone() {
  const env = envFor({
    vehicles: [
      vehicle({
        id: "vehicle-phone-trap",
        vehicleId: "vehicle-phone-trap",
        internalNumber: "Phone-only trap",
        licensePlate: "8ZZ 9999",
        assignedDriverId: "",
        assignedDriverPhone: "731 000 001"
      })
    ]
  });
  const { status, payload } = await contextPayload(env, radimUser);

  assert.equal(status, 200);
  assert.equal(payload.vehiclesVerified, false);
  assert.equal(payload.vehiclesCount, 0);
  assert.equal(payload.errorCode, "NO_DRIVER_VEHICLES");
  assertNoTrapVehicle(payload);
}

async function testUnknownAndForbiddenCallerStates() {
  const env = envFor({
    users: [radimUser, otherUserWithSameContact, noFleetUser],
    vehicles: [vehicle()]
  });
  const unknownUser = {
    ...radimUser,
    id: "user-not-in-kso",
    email: "missing@example.invalid"
  };

  const unauthenticated = await contextPayload(env, unknownUser);
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.payload.vehiclesVerified, false);

  const forbidden = await contextPayload(env, noFleetUser);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.payload.vehiclesVerified, false);
  assert.deepEqual(forbidden.payload.vehicles, []);
}

async function testManualSpzFallbackUsesFleetReadOnly() {
  const env = envFor({ vehicles: [vehicle()] });

  const exact = await licensePlatePayload(env, radimUser, "1AB2345");
  assert.equal(exact.status, 200);
  assert.equal(exact.payload.exact, true);
  assert.equal(exact.payload.vehicle.vehicleId, "vehicle-radim");

  const missing = await licensePlatePayload(env, radimUser, "9ZZ9999");
  assert.equal(missing.status, 200);
  assert.equal(missing.payload.exact, false);
}

await testKsoSessionUserControlsVehicleLookup();
await testMultipleVehiclesForcePickerWithoutVoiceLeak();
await testNoAssignedVehicleDoesNotFallBackToPhone();
await testUnknownAndForbiddenCallerStates();
await testManualSpzFallbackUsesFleetReadOnly();

console.log("sarlota caller identity runtime tests passed");
