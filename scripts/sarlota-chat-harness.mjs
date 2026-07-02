import { handleSarlotaVoiceRequest } from "../functions/_lib/voice-sarlota.js";
import { createElevenLabsClientTools } from "../src/elevenLabsClientTools.js";

const user = {
  id: "driver-radim",
  name: "Radim Test",
  email: "radim.test@example.invalid",
  phone: "731 000 001",
  role: "ridic",
  status: "active"
};

const env = {
  APP_ENV: "test",
  NODE_ENV: "test",
  AUTH_MODE: "mock",
  AUTH_SESSION_SECRET: "sarlota-chat-harness-secret",
  SARLOTA_DRIVER_REPORTS_MOCK_MODE: "true",
  AUTH_USERS_JSON: JSON.stringify([user]),
  SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON: JSON.stringify({
    provider: "fleet_db",
    source: "fleet_db",
    apiStatus: "ready",
    message: "Testovací fleet fixture pro Šarlotu.",
    vehicles: [
      {
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
        source: "fleet_db"
      }
    ]
  })
};

function safeResponse(result = {}) {
  return {
    ok: result.ok,
    status: result.status,
    route: result.route,
    answerText: result.answerText || result.reply || result.message,
    vehiclesVerified: result.vehiclesVerified,
    vehiclesCount: result.vehiclesCount,
    vehicleId: result.vehicleId,
    spzNormalized: result.spzNormalized,
    existsInFleet: result.existsInFleet,
    assignedToCurrentDriver: result.assignedToCurrentDriver,
    requiresConfirmation: result.requiresConfirmation,
    preparedActions: Array.isArray(result.preparedActions)
      ? result.preparedActions.map((action) => ({
        type: action.type,
        action: action.action,
        requiresConfirmation: action.requiresConfirmation === true,
        confirmationIdPresent: Boolean(action.confirmationId)
      }))
      : [],
    driverPartRequest: result.driverPartRequest
      ? {
        id: result.driverPartRequest.id,
        reportId: result.driverPartRequest.reportId,
        status: result.driverPartRequest.status,
        licensePlate: result.driverPartRequest.licensePlate,
        probablePart: result.driverPartRequest.probablePart
      }
      : null,
    notificationsSent: result.notificationsSent === true
  };
}

function createMockTools() {
  const navigations = [];
  const tools = createElevenLabsClientTools({
    navigate: (route) => navigations.push(route),
    canUseRoute: () => true,
    requestJson: async (path) => {
      if (path.startsWith("/api/ai/driver-reports/context")) {
        return {
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
              spz: "1AB 2345",
              licensePlate: "1AB 2345",
              vinPresent: true,
              assignedToCurrentDriver: true,
              existsInFleet: true,
              active: true,
              source: "fleet_db"
            }
          ],
          vehiclesCount: 1,
          vehicleLookupMode: "verified_vehicle_list",
          messageForAssistant: "Mám bezpečně ověřené tvoje vozidlo Mercedes Atego, SPZ 1AB 2345. Týká se závada tohohle vozidla?",
          apiStatus: "ready"
        };
      }

      if (path.startsWith("/api/driver-reports/license-plate")) {
        const url = new URL(path, "https://kso.test");
        const spz = url.searchParams.get("spz") || "";
        const exact = spz.replace(/\s+/g, "").toUpperCase() === "1AB2345";
        return {
          input: spz,
          normalized: exact ? "1AB 2345" : spz.toUpperCase(),
          validFormat: true,
          exact,
          vehicle: exact
            ? {
              id: "vehicle-1",
              vehicleId: "vehicle-1",
              licensePlate: "1AB 2345"
            }
            : null,
          suggestions: [],
          apiStatus: "ready"
        };
      }

      if (path.startsWith("/api/driver-reports")) {
        return {
          requests: [
            {
              id: "mock-last-1",
              reportId: "MOCK-001",
              status: "mock_created",
              licensePlate: "1AB 2345",
              probablePart: "světlo",
              defectDescription: "Prasklé světlo"
            }
          ],
          permissions: { canView: true, canCreate: true },
          apiStatus: "ready"
        };
      }

      throw new Error(`Unknown mock path: ${path}`);
    }
  });

  return { tools, navigations };
}

async function runHarness() {
  const { tools, navigations } = createMockTools();
  const scenarios = [];

  scenarios.push({
    userText: "Otevři hlášení řidičů",
    result: safeResponse(await tools.open_module({ moduleId: "driver-reports" }))
  });

  scenarios.push({
    userText: "Jaké mám vozidlo?",
    result: safeResponse(await tools.get_driver_report_context({ sessionId: "chat-harness" }))
  });

  scenarios.push({
    userText: "Moje SPZ je 1AB2345",
    result: safeResponse(await tools.validate_driver_vehicle_spz({
      spz: "1AB2345",
      sessionId: "chat-harness"
    }))
  });

  const prepared = await handleSarlotaVoiceRequest(env, user, {
    mockMode: true,
    intent: "driver_part_request",
    text: "Závada je prasklé pravé zadní světlo na autě 1AB2345.",
    parameters: {
      defectDescription: "prasklé pravé zadní světlo",
      licensePlate: "1AB2345",
      spzManual: "1AB2345",
      spzValidated: true
    },
    context: {
      requestedIntent: "driver_part_request"
    }
  }, { authSource: "chat-harness" });
  scenarios.push({
    userText: "Závada je prasklé pravé zadní světlo",
    result: safeResponse(prepared)
  });

  const action = Array.isArray(prepared.preparedActions) ? prepared.preparedActions[0] : null;
  const confirmed = action
    ? await handleSarlotaVoiceRequest(env, user, {
      mockMode: true,
      intent: "driver_part_request",
      text: "Ano, potvrzuji vytvoření hlášení.",
      parameters: {
        ...action.parameters,
        confirmed: true,
        confirmationSource: "kso-ui",
        confirmationId: action.confirmationId
      },
      context: {
        requestedIntent: "driver_part_request"
      }
    }, { authSource: "chat-harness" })
    : { ok: false, status: "missing_prepared_action", message: "Chybí prepared action." };
  scenarios.push({
    userText: "Vytvoř hlášení",
    result: safeResponse(confirmed)
  });

  scenarios.push({
    userText: "Ukaž moje poslední hlášení",
    result: safeResponse(await tools.get_driver_reports_summary({ limit: 3 }))
  });

  return {
    ok: scenarios.every((scenario) => scenario.result.status !== "failed"),
    mode: "local-mock",
    productionWrites: false,
    sendsNotifications: false,
    microphoneRequired: false,
    navigations,
    scenarios
  };
}

const result = await runHarness();
console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  process.exitCode = 1;
}
