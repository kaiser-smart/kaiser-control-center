import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { driverReportContextForUser } from "../../../_lib/driver-report-context.js";
import { handleSarlotaVoiceRequest } from "../../../_lib/voice-sarlota.js";

const CONFIRM_PHRASE = "ZAPSAT TEST";
const DEFAULT_DEFECT_DESCRIPTION = "TEST Sarlota kontrolni hlasovy zapis - praskle predni sklo";
const SESSION_ID = "kso-admin-sarlota-voice-write-test";

function cleanString(value) {
  return String(value ?? "").trim();
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== "")
  );
}

function safeShortText(value, limit = 180) {
  const text = cleanString(value).replace(/\s+/g, " ");
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}...`;
}

function safeVehicleLabel(vehicle = {}) {
  return [
    cleanString(vehicle.displayName || vehicle.internalName || vehicle.model || vehicle.type || "Vozidlo"),
    cleanString(vehicle.licensePlate || vehicle.spz) ? `SPZ ${cleanString(vehicle.licensePlate || vehicle.spz)}` : ""
  ].filter(Boolean).join(", ");
}

function safeVehicleForUi(vehicle = {}) {
  return compactObject({
    vehicleId: cleanString(vehicle.vehicleId || vehicle.id),
    label: safeVehicleLabel(vehicle),
    licensePlate: cleanString(vehicle.licensePlate || vehicle.spz)
  });
}

function statusFromContextResult(contextResult = {}) {
  const payload = contextResult.payload || {};
  const vehicles = payload.vehiclesVerified === true && Array.isArray(payload.vehicles)
    ? payload.vehicles.map(safeVehicleForUi).filter((vehicle) => vehicle.vehicleId)
    : [];
  const ready = contextResult.status === 200 && payload.vehiclesVerified === true && vehicles.length > 0;

  return {
    generatedAt: new Date().toISOString(),
    ready,
    status: ready ? "ready" : "blocked",
    code: ready ? "" : cleanString(payload.errorCode || payload.reason || "NO_VERIFIED_VEHICLES"),
    reason: ready
      ? "VERIFIED_VEHICLES_AVAILABLE"
      : cleanString(payload.reason || payload.errorCode || "NO_VERIFIED_VEHICLES"),
    message: ready
      ? "Kontrolni hlasovy zapis je mozne spustit po vyberu vozidla a potvrzeni."
      : cleanString(payload.assistantMessage || payload.message || "Nevidim bezpecne prirazene vozidlo."),
    vehiclesVerified: payload.vehiclesVerified === true,
    vehiclesCount: vehicles.length,
    requiresVehicleSelection: vehicles.length > 1,
    vehicles,
    confirmPhrase: CONFIRM_PHRASE,
    defaultDefectDescription: DEFAULT_DEFECT_DESCRIPTION,
    endpoint: "/api/ai/elevenlabs/sarlota-voice-write-test",
    effects: {
      writesDriverReport: true,
      usesVoiceHandler: true,
      confirmationSource: "kso-ui",
      maySendNotifications: true,
      returnsVin: false,
      touchesSecrets: false,
      touchesElevenLabsAgent: false
    }
  };
}

async function voiceWriteTestPlan(env, user) {
  const contextResult = await driverReportContextForUser(env, user, {
    currentModule: "hlaseni-ridicu",
    intent: "driver_part_request",
    sessionId: SESSION_ID
  });

  return statusFromContextResult(contextResult);
}

function selectVehicle(plan = {}, vehicleId = "") {
  const vehicles = Array.isArray(plan.vehicles) ? plan.vehicles : [];
  const requestedId = cleanString(vehicleId);

  if (requestedId) {
    return vehicles.find((vehicle) => cleanString(vehicle.vehicleId) === requestedId) || null;
  }

  return vehicles.length === 1 ? vehicles[0] : null;
}

function driverPartAction(result = {}) {
  return Array.isArray(result.preparedActions)
    ? result.preparedActions.find((action) => action?.type === "driver_part_request") || result.preparedActions[0]
    : null;
}

function voicePayload({ vehicleId, defectDescription, confirmed = false, action = null }) {
  const confirmationId = cleanString(action?.confirmationId);
  const actionParameters = action?.parameters && typeof action.parameters === "object" ? action.parameters : {};
  const confirmedParameters = confirmed
    ? {
        confirmationSource: "kso-ui",
        confirmation_source: "kso-ui",
        confirmationId,
        confirmation_id: confirmationId
      }
    : {};

  return {
    intent: "driver_part_request",
    text: [
      defectDescription,
      "na vybranem vozidle",
      confirmed ? "potvrzeno v aplikaci" : ""
    ].filter(Boolean).join(" "),
    transcript: [
      defectDescription,
      "na vybranem vozidle",
      confirmed ? "potvrzeno v aplikaci" : ""
    ].filter(Boolean).join(" "),
    parameters: {
      ...actionParameters,
      defectDescription,
      vehicleId,
      vehicleSelectionSource: "kso-admin-voice-write-test",
      diagnosticVoiceWriteTest: true,
      ...confirmedParameters,
      confirmed,
      writeConfirmed: confirmed
    },
    context: {
      requestedIntent: "driver_part_request",
      currentModule: "hlaseni-ridicu",
      defectDescription,
      vehicleId,
      vehicleSelectionSource: "kso-admin-voice-write-test",
      diagnosticVoiceWriteTest: true,
      ...confirmedParameters,
      confirmed
    },
    metadata: {
      source: "kso-admin-voice-write-test",
      diagnostic: true
    }
  };
}

function safeWriteResult(result = {}) {
  const request = result.driverPartRequest || null;
  return {
    ok: ["created", "created_notification_pending", "created_mock"].includes(cleanString(result.status)),
    status: cleanString(result.status || "unknown"),
    message: safeShortText(result.reply || result.message || ""),
    reportId: cleanString(request?.reportId),
    driverPartRequest: request
      ? {
          reportId: cleanString(request.reportId),
          status: cleanString(request.status),
          probablePart: cleanString(request.probablePart)
        }
      : null,
    notificationsSent: result.notificationsSent === true,
    diagnostics: {
      usesVoiceHandler: true,
      confirmationSource: "kso-ui",
      confirmationTrusted: true,
      returnsVin: false,
      source: "kso-admin-voice-write-test"
    }
  };
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "settings", "manage");

  if (response) {
    return response;
  }

  return json(await voiceWriteTestPlan(env, user));
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "settings", "manage");

  if (response) {
    return response;
  }

  const payload = await readJson(request);
  if (payload.apply !== true || cleanString(payload.confirm) !== CONFIRM_PHRASE) {
    return json({
      ok: false,
      status: "confirmation_required",
      error: `Kontrolni zapis vyzaduje potvrzeni ${CONFIRM_PHRASE}.`,
      confirmPhrase: CONFIRM_PHRASE
    }, 400);
  }

  const plan = await voiceWriteTestPlan(env, user);
  if (!plan.ready) {
    return json({
      ok: false,
      status: "blocked",
      error: plan.message,
      code: plan.code,
      plan
    }, 409);
  }

  const selectedVehicle = selectVehicle(plan, payload.vehicleId);
  if (!selectedVehicle) {
    return json({
      ok: false,
      status: "vehicle_selection_required",
      error: "Vyber konkretni overene vozidlo pro kontrolni zapis.",
      plan
    }, 409);
  }

  const defectDescription = safeShortText(payload.defectDescription || DEFAULT_DEFECT_DESCRIPTION, 220);
  const prepared = await handleSarlotaVoiceRequest(
    env,
    user,
    voicePayload({
      vehicleId: selectedVehicle.vehicleId,
      defectDescription,
      confirmed: false
    }),
    { authSource: "session" }
  );

  const action = driverPartAction(prepared);
  if (cleanString(prepared.status) !== "needs_confirmation" || !action?.confirmationId) {
    return json({
      ok: false,
      status: "prepare_failed",
      error: safeShortText(prepared.reply || prepared.message || "Kontrolni zapis se nepodarilo pripravit."),
      preparedStatus: cleanString(prepared.status)
    }, 502);
  }

  const result = await handleSarlotaVoiceRequest(
    env,
    user,
    voicePayload({
      vehicleId: selectedVehicle.vehicleId,
      defectDescription,
      confirmed: true,
      action
    }),
    { authSource: "session" }
  );

  return json({
    ...safeWriteResult(result),
    plan: {
      vehiclesVerified: plan.vehiclesVerified,
      vehiclesCount: plan.vehiclesCount,
      requiresVehicleSelection: plan.requiresVehicleSelection
    }
  });
}

export const __test = {
  CONFIRM_PHRASE,
  DEFAULT_DEFECT_DESCRIPTION,
  safeVehicleForUi,
  statusFromContextResult
};
