import { hasPermission } from "../../permissions.js";
import {
  VEHICLE_ICON_BY_TYPE,
  VEHICLE_TRACKING_API_ERROR,
  VEHICLE_TRACKING_TCAR_WAITING,
  vehicleTrackingIconForType,
  vehicleTrackingStatusLabel,
  vehicleTrackingStatusTone
} from "../../data/vehicleTracking.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function textValue(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function formatDateTime(value) {
  if (!value) {
    return "neuvedeno";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function locationId(location = {}, index = 0) {
  return String(
    location._locationId
      || location.id
      || location.externalVehicleId
      || location.tcarsVehicleId
      || location.licensePlate
      || location.internalNumber
      || `tcars-location-${index}`
  );
}

function gpsDateValue(location = {}) {
  return location.lastGpsAt
    || location.gpsAt
    || location.positionAt
    || location.updatedAt
    || location.receivedAt
    || "";
}

function vehicleBrand(location = {}) {
  const vehicle = location.vehicle || {};
  const fleetVehicle = location.fleetVehicle || location.pairedVehicle || {};
  return textValue(
    location.brand,
    location.make,
    location.manufacturer,
    location.vehicleBrand,
    vehicle.brand,
    vehicle.make,
    vehicle.manufacturer,
    vehicle.vehicleBrand,
    fleetVehicle.brand,
    fleetVehicle.make,
    fleetVehicle.manufacturer,
    fleetVehicle.vehicleBrand
  );
}

function vehicleModel(location = {}) {
  const vehicle = location.vehicle || {};
  const fleetVehicle = location.fleetVehicle || location.pairedVehicle || {};
  return textValue(
    location.model,
    location.vehicleModel,
    location.modelName,
    vehicle.model,
    vehicle.vehicleModel,
    vehicle.modelName,
    fleetVehicle.model,
    fleetVehicle.vehicleModel,
    fleetVehicle.modelName
  );
}

function displayName(location = {}) {
  return [vehicleBrand(location), vehicleModel(location)].filter(Boolean).join(" ") || "Vozidlo";
}

function iconTypeForLocation(location = {}) {
  const vehicle = location.vehicle || {};
  const sourceText = [
    location.iconType,
    location.vehicleType,
    location.type,
    location.bodyType,
    location.model,
    location.internalNumber,
    vehicle.iconType,
    vehicle.vehicleType,
    vehicle.type,
    vehicle.bodyType,
    vehicle.model,
    vehicle.internalNumber
  ].filter(Boolean).join(" ");
  const iconType = vehicleTrackingIconForType(sourceText);
  return iconType?.key || "collection_truck";
}

function vehicleStatus(location = {}, invalid = false) {
  if (invalid) {
    return {
      value: "no_signal",
      label: vehicleTrackingStatusLabel("no_signal"),
      tone: vehicleTrackingStatusTone("no_signal")
    };
  }

  const explicitStatus = textValue(location.status, location.vehicle?.status);
  const speed = asNumber(location.speedKmh);
  const value = explicitStatus || (speed && speed > 0 ? "moving" : "standing");

  return {
    value,
    label: vehicleTrackingStatusLabel(value),
    tone: vehicleTrackingStatusTone(value)
  };
}

function speedText(location = {}) {
  const speed = asNumber(location.speedKmh);
  return speed === null ? "neuvedeno" : `${speed} km/h`;
}

function coordinateText(location = {}) {
  const latitude = asNumber(location.latitude);
  const longitude = asNumber(location.longitude);
  if (latitude === null || longitude === null) {
    return "neuvedeno";
  }

  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function normalizeVehicle(location = {}, index = 0, selectedId = "") {
  const vehicle = location.vehicle || {};
  const id = locationId(location, index);
  const iconType = iconTypeForLocation(location);
  const status = vehicleStatus(location, Boolean(location._invalidReason));

  return {
    id,
    raw: location,
    selected: selectedId ? id === selectedId : index === 0,
    name: displayName(location),
    licensePlate: textValue(location.licensePlate, vehicle.licensePlate, "SPZ neuvedena"),
    internalNumber: textValue(location.internalNumber, vehicle.internalNumber, location.externalVehicleId, vehicle.externalVehicleId),
    driverName: textValue(location.driverName, vehicle.driverName, location.driver?.name),
    status,
    source: textValue(location.source, "T-Cars jednotka"),
    address: textValue(location.address, location.addressText, "adresa neuvedena"),
    speedText: speedText(location),
    lastGpsAt: gpsDateValue(location),
    lastGpsText: formatDateTime(gpsDateValue(location)),
    coordinates: coordinateText(location),
    latitude: asNumber(location.latitude),
    longitude: asNumber(location.longitude),
    heading: asNumber(location.heading) || 0,
    gpsUnitId: textValue(location.gpsUnitId, location.externalUnitId, vehicle.gpsUnitId, vehicle.externalUnitId),
    iconType,
    iconSrc: VEHICLE_ICON_BY_TYPE[iconType] || VEHICLE_ICON_BY_TYPE.collection_truck,
    invalidReason: location._invalidReason || ""
  };
}

function normalizeWimSite(site = {}, index = 0, selectedId = "") {
  const id = String(site.id || `wim-${index}`);
  const status = String(site.status || "").trim().toLowerCase();
  const tone = {
    active: "success",
    planned: "warning",
    maintenance: "warning",
    upgrade: "warning",
    preselection: "info"
  }[status] || "neutral";

  return {
    id,
    raw: site,
    selected: selectedId ? id === selectedId : index === 0,
    title: [site.road, site.kmLabel, site.locationLabel].filter(Boolean).join(" ") || "WIM bod",
    road: site.road || "WIM",
    kmLabel: site.kmLabel || "",
    locationLabel: site.locationLabel || "",
    orp: site.orp || "neuvedeno",
    sideLabel: site.sideLabel || "neuvedeno",
    status: site.status || "",
    statusLabel: site.statusLabel || "neznamy stav",
    tone,
    latitude: asNumber(site.latitude),
    longitude: asNumber(site.longitude),
    deviceCount: Number(site.deviceCount || site.devices?.length || 0),
    coordinateQuality: site.coordinateQuality || "needs-verification",
    sourceLabel: site.sourceLabel || "MD/RSD PDF mapa"
  };
}

function mapBounds(points = []) {
  const validPoints = points.filter((point) => point.latitude !== null && point.longitude !== null);
  if (!validPoints.length) {
    return null;
  }

  const latitudes = validPoints.map((point) => point.latitude);
  const longitudes = validPoints.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    latRange: Math.max(maxLat - minLat, 0.0001),
    lngRange: Math.max(maxLng - minLng, 0.0001)
  };
}

function mapPosition(point = {}, bounds = null) {
  if (!bounds || point.latitude === null || point.longitude === null) {
    return { x: 50, y: 50 };
  }

  const x = ((point.longitude - bounds.minLng) / bounds.lngRange) * 78 + 11;
  const y = ((bounds.maxLat - point.latitude) / bounds.latRange) * 78 + 11;

  return {
    x: Math.max(8, Math.min(92, x)),
    y: Math.max(8, Math.min(92, y))
  };
}

function createMapPoints(vehicles = [], wimSites = []) {
  const bounds = mapBounds([...vehicles, ...wimSites]);
  return {
    bounds,
    vehicles: vehicles.map((vehicle) => ({
      ...vehicle,
      mapPosition: mapPosition(vehicle, bounds)
    })),
    wimSites: wimSites.map((site) => ({
      ...site,
      mapPosition: mapPosition(site, bounds)
    }))
  };
}

export function createVehicleTrackingViewModel({
  user = null,
  runtime = {},
  routeHref = (route) => route
} = {}) {
  const state = runtime.vehicleTracking || {};
  const canView = state.canView !== false && hasPermission(user, "vehicle-tracking", "view");

  if (!canView) {
    return {
      canView: false,
      routeHref,
      loaded: false,
      loading: false,
      error: user ? "Aktualni role nema pristup k modulu Sledovani vozidel." : "",
      vehicles: [],
      invalidVehicles: [],
      wimSites: [],
      map: createMapPoints([], [])
    };
  }

  const validLocations = asArray(state.validLocations);
  const selectedVehicleId = state.selectedLocationId || validLocations[0]?._locationId || "";
  const vehicles = validLocations.map((location, index) => normalizeVehicle(location, index, selectedVehicleId));
  const invalidVehicles = asArray(state.invalidVehicles).map((location, index) => normalizeVehicle(location, index, ""));
  const wimSites = asArray(state.wimSites).map((site, index) => normalizeWimSite(site, index, state.selectedWimSiteId));
  const selectedVehicle = vehicles.find((vehicle) => vehicle.selected) || vehicles[0] || null;
  const selectedWimSite = wimSites.find((site) => site.selected) || wimSites[0] || null;
  const map = createMapPoints(vehicles, wimSites);
  const status = state.status || {};

  return {
    canView: true,
    canExport: hasPermission(user, "vehicle-tracking", "export"),
    routeHref,
    loaded: Boolean(state.loaded),
    loading: Boolean(state.loading),
    error: state.error || "",
    status,
    statusMessage: state.error || status.message || VEHICLE_TRACKING_TCAR_WAITING,
    apiStatus: status.apiStatus || state.wimApiStatus || "waiting",
    configured: Boolean(status.configured),
    hasGoogleMapsKey: Boolean(state.hasGoogleMapsKey),
    sourceMode: "tcars",
    vehicles,
    invalidVehicles,
    vehicleCount: Number(state.vehicleCount || vehicles.length + invalidVehicles.length),
    selectedVehicle,
    selectedVehicleId: selectedVehicle?.id || "",
    wimSites,
    selectedWimSite,
    map,
    wim: {
      loaded: Boolean(state.wimLoaded),
      loading: Boolean(state.wimLoading),
      error: state.wimError || "",
      apiStatus: state.wimApiStatus || "waiting",
      summary: state.wimSummary || {},
      source: state.wimSource || {},
      alertEvents: asArray(state.wimAlertEvents)
    },
    configItems: asArray(state.configItems),
    metrics: [
      {
        label: "Vozidla",
        value: String(Number(state.vehicleCount || vehicles.length + invalidVehicles.length)),
        detail: `${vehicles.length} validnich poloh`
      },
      {
        label: "Bez GPS",
        value: String(invalidVehicles.length),
        detail: "oddeleno mimo mapu"
      },
      {
        label: "WIM body",
        value: String(wimSites.length),
        detail: state.wimApiStatus === "ready" ? "read-only API" : "ceka na D1"
      },
      {
        label: "Zdroj",
        value: status.configured ? "T-Cars" : "Ceka",
        detail: status.source || "Smart odpady API"
      }
    ],
    notices: [
      state.loading && !state.loaded ? { type: "info", text: "Nacitam aktualni T-Cars stav vozidel." } : null,
      state.error ? { type: "danger", text: state.error || VEHICLE_TRACKING_API_ERROR } : null,
      state.wimLoading && !state.wimLoaded ? { type: "info", text: "Nacitam WIM vrstvu." } : null,
      state.wimError ? { type: "warning", text: state.wimError } : null,
      !vehicles.length && !state.loading && !state.error ? { type: "warning", text: "Nejsou dostupne zadne validni GPS polohy pro mapu." } : null
    ].filter(Boolean)
  };
}
