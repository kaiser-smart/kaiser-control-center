import { json, requireUserPermission } from "../../../_lib/auth.js";
import { recordAiAction } from "../../../_lib/ai-action-log-store.js";
import { loadTcarsStatusPayload } from "../../../_lib/tcars-client.js";
import {
  listVehicleWimAlertEvents,
  listVehicleWimSites,
  VehicleWimStoreError,
  vehicleWimApiStatus
} from "../../../_lib/vehicle-wim-store.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function countBy(items, keyForItem) {
  return items.reduce((acc, item) => {
    const key = cleanString(keyForItem(item)) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function latestLocations(locations = []) {
  return [...locations]
    .sort((left, right) => cleanString(right.lastGpsAt || right.updatedAt).localeCompare(cleanString(left.lastGpsAt || left.updatedAt)))
    .slice(0, 8)
    .map((location) => ({
      vehicleId: cleanString(location.vehicleId || location.externalVehicleId),
      licensePlate: cleanString(location.licensePlate),
      internalNumber: cleanString(location.internalNumber),
      driverName: cleanString(location.driverName),
      status: cleanString(location.status),
      speedKmh: numberValue(location.speedKmh),
      address: cleanString(location.address),
      lastGpsAt: cleanString(location.lastGpsAt),
      gpsValid: location.gpsValid === true
    }));
}

function summarizeTcars(payload = {}) {
  const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];
  const locations = Array.isArray(payload.locations) ? payload.locations : [];

  return {
    provider: cleanString(payload.provider || "tcars"),
    apiStatus: cleanString(payload.apiStatus || "waiting"),
    configured: Boolean(payload.configured),
    message: cleanString(payload.message),
    pollIntervalSeconds: numberValue(payload.pollIntervalSeconds),
    vehiclesTotal: vehicles.length,
    locationsTotal: locations.length,
    locationsByStatus: countBy(locations, (location) => location.status),
    latestLocations: latestLocations(locations),
    lastFetchedAt: cleanString(payload.lastFetchedAt),
    waitingReason: cleanString(payload.waitingReason || payload.errorCode)
  };
}

function summarizeWimSites(payload = {}) {
  const sites = Array.isArray(payload.sites) ? payload.sites : [];

  return {
    apiStatus: cleanString(payload.apiStatus || "waiting"),
    source: payload.source || null,
    summary: payload.summary || {
      sitesTotal: sites.length,
      devicesTotal: 0,
      alertDistanceKm: 15,
      automationStatus: "draft",
      automationMode: "read-only-pilot"
    },
    sites: sites.slice(0, 12).map((site) => ({
      id: cleanString(site.id),
      road: cleanString(site.road),
      kmLabel: cleanString(site.kmLabel),
      locationLabel: cleanString(site.locationLabel),
      orp: cleanString(site.orp),
      sideLabel: cleanString(site.sideLabel),
      status: cleanString(site.status),
      statusLabel: cleanString(site.statusLabel),
      deviceCount: numberValue(site.deviceCount, 0),
      coordinateQuality: cleanString(site.coordinateQuality)
    }))
  };
}

function summarizeWimAlerts(payload = {}) {
  const events = Array.isArray(payload.events) ? payload.events : [];

  return {
    apiStatus: cleanString(payload.apiStatus || "waiting"),
    mode: cleanString(payload.mode || "read-only-pilot"),
    message: cleanString(payload.message),
    eventsTotal: events.length,
    latestEvents: events.slice(0, 8).map((event) => ({
      id: cleanString(event.id),
      siteId: cleanString(event.siteId),
      vehicleId: cleanString(event.vehicleId),
      licensePlate: cleanString(event.licensePlate),
      distanceKm: numberValue(event.distanceKm),
      alertType: cleanString(event.alertType),
      channel: cleanString(event.channel),
      status: cleanString(event.status),
      triggeredAt: cleanString(event.triggeredAt)
    }))
  };
}

function wimErrorPayload(env, error, fallbackMessage) {
  const isStoreError = error instanceof VehicleWimStoreError;
  return {
    apiStatus: vehicleWimApiStatus(env),
    error: cleanString(error?.message || fallbackMessage),
    code: cleanString(isStoreError ? error.code : "vehicle_wim_ai_summary_failed")
  };
}

async function loadWimSitesForAi(env) {
  try {
    return await listVehicleWimSites(env);
  } catch (error) {
    return wimErrorPayload(env, error, "WIM místa se nepodařilo načíst.");
  }
}

async function loadWimAlertsForAi(env) {
  try {
    return await listVehicleWimAlertEvents(env, 20);
  } catch (error) {
    return wimErrorPayload(env, error, "WIM alerty se nepodařilo načíst.");
  }
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "vehicle-tracking", "view");

  if (response) {
    return response;
  }

  const url = new URL(request.url);

  try {
    const [tcarsPayload, wimSitesPayload, wimAlertsPayload] = await Promise.all([
      loadTcarsStatusPayload(env),
      loadWimSitesForAi(env),
      loadWimAlertsForAi(env)
    ]);

    const summary = {
      moduleId: "vehicle-tracking",
      moduleName: "Sledování vozidel",
      apiStatus: "ready",
      featureState: {
        readOnlyPilot: true,
        notificationSend: "functional-through-api-after-ui-confirmation",
        cloudAutomation: false,
        automationNote: "15km WIM automatizace zatím nemá cloud runner ani cron."
      },
      permissions: {
        read: "vehicle-tracking:view",
        sendNotification: "vehicle-tracking:manage"
      },
      tcars: summarizeTcars(tcarsPayload),
      wim: summarizeWimSites(wimSitesPayload),
      wimAlerts: summarizeWimAlerts(wimAlertsPayload)
    };

    await recordAiAction(env, user, {
      assistantId: url.searchParams.get("assistant") || "sarlota",
      assistantName: url.searchParams.get("assistantName") || "Šarlota",
      actionType: "read",
      toolName: "ai_vehicle_tracking_summary",
      input: { moduleId: "vehicle-tracking" },
      result: {
        tcarsApiStatus: summary.tcars.apiStatus,
        vehiclesTotal: summary.tcars.vehiclesTotal,
        wimApiStatus: summary.wim.apiStatus,
        wimSitesTotal: summary.wim.summary?.sitesTotal || 0
      },
      status: "ok"
    });

    return json(summary);
  } catch (error) {
    console.error("ai.vehicle_tracking.summary_failed", { message: error.message });
    await recordAiAction(env, user, {
      assistantId: url.searchParams.get("assistant") || "sarlota",
      assistantName: url.searchParams.get("assistantName") || "Šarlota",
      actionType: "read",
      toolName: "ai_vehicle_tracking_summary",
      input: { moduleId: "vehicle-tracking" },
      result: { error: error.message },
      status: "error"
    });

    return json({
      error: "Souhrn Sledování vozidel se teď nepodařilo načíst.",
      apiStatus: "waiting"
    }, 500);
  }
}
