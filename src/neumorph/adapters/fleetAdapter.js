import {
  FLEET_API_WAITING_LABEL,
  FLEET_DASHBOARD_METRICS,
  FLEET_DEFECT_FIELDS,
  FLEET_DOCUMENT_FIELDS,
  FLEET_REQUIRED_SECTIONS,
  FLEET_SERVICE_FIELDS,
  FLEET_STATUS_OPTIONS,
  FLEET_TERM_DEFINITIONS,
  FLEET_VEHICLE_FIELDS,
  FLEET_VEHICLE_TYPES,
  fleetStatusLabel,
  fleetStatusTone
} from "../../data/fleet.js";
import { hasPermission } from "../../permissions.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function textValue(...values) {
  return values.map(cleanText).find(Boolean) || "";
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function numberText(value, fallback = "0") {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return new Intl.NumberFormat("cs-CZ").format(number);
}

function displayValue(value, fallback = "-") {
  const text = cleanText(value);
  return text || fallback;
}

function normalizeKey(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function formatDate(value, fallback = "-") {
  const raw = cleanText(value);
  if (!raw) {
    return fallback;
  }

  const date = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatDateTime(value, fallback = "-") {
  const raw = cleanText(value);
  if (!raw) {
    return fallback;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function dateDueWithinDays(value, days = 30) {
  const raw = cleanText(value);
  if (!raw) {
    return false;
  }

  const date = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + days);
  return date <= limit;
}

function vehicleId(vehicle = {}) {
  return textValue(
    vehicle.id,
    vehicle.vehicleId,
    vehicle.tcarsVehicleId ? `tcars-${vehicle.tcarsVehicleId}` : "",
    vehicle.vistosVehicleId ? `vistos-${vehicle.vistosVehicleId}` : "",
    vehicle.licensePlate,
    vehicle.tcarsLicensePlate
  );
}

function vehicleMatchesId(vehicle = {}, targetId = "") {
  const target = cleanText(targetId);
  const normalizedTarget = normalizeKey(target);
  if (!target) {
    return false;
  }

  return [
    vehicle.id,
    vehicle.vehicleId,
    vehicle.externalVehicleId,
    vehicle.tcarsVehicleId,
    vehicle.tcarsVehicleId ? `tcars-${vehicle.tcarsVehicleId}` : "",
    vehicle.vistosVehicleId,
    vehicle.vistosVehicleId ? `vistos-${vehicle.vistosVehicleId}` : "",
    vehicle.licensePlate,
    vehicle.tcarsLicensePlate
  ].some((candidate) => {
    const value = cleanText(candidate);
    return value && (value === target || normalizeKey(value) === normalizedTarget);
  });
}

function selectedVehicleIdFromPath(originalPath = "") {
  const path = cleanText(originalPath).replace(/\/+$/, "");
  const prefix = "/vozovy-park/";
  if (!path.startsWith(prefix) || path === "/vozovy-park/dashboard") {
    return "";
  }

  return decodeURIComponent(path.slice(prefix.length).split("/")[0] || "").trim();
}

function vehicleModel(vehicle = {}) {
  return [vehicle.brand, vehicle.model].map(cleanText).filter(Boolean).join(" ") || cleanText(vehicle.model);
}

function vehicleName(vehicle = {}) {
  return textValue(vehicle.internalNumber, vehicle.vistosVehicleName, vehicle.model, vehicle.licensePlate, vehicle.id, "Vozidlo");
}

function statusTone(status) {
  const tone = fleetStatusTone(status);
  return {
    active: "success",
    service: "warning",
    "out-of-order": "danger",
    retired: "neutral",
    waiting: "warning"
  }[tone] || "neutral";
}

function vehicleHasOpenDefect(vehicle = {}) {
  return Number.isFinite(Number(vehicle.openDefects)) && Number(vehicle.openDefects) > 0;
}

function vehicleHasDueTerm(vehicle = {}) {
  return FLEET_TERM_DEFINITIONS.some((term) => dateDueWithinDays(vehicle[term.id]));
}

function normalizeVehicle(vehicle = {}, index = 0, selectedId = "") {
  const id = vehicleId(vehicle) || `fleet-vehicle-${index}`;
  const status = cleanText(vehicle.status) || "waiting";
  return {
    id,
    raw: vehicle,
    selected: selectedId ? vehicleMatchesId(vehicle, selectedId) : index === 0,
    name: vehicleName(vehicle),
    licensePlate: displayValue(vehicle.licensePlate || vehicle.tcarsLicensePlate, "SPZ neuvedena"),
    type: displayValue(vehicle.vehicleType || vehicle.vistosVehicleCategory || vehicle.bodyType, "Typ neuveden"),
    model: displayValue(vehicleModel(vehicle), "Model neuveden"),
    driver: displayValue(vehicle.assignedDriverName, "Bez ridice"),
    status,
    statusLabel: fleetStatusLabel(status),
    statusTone: statusTone(status),
    vin: displayValue(vehicle.vin),
    mileage: Number.isFinite(Number(vehicle.mileageKm)) ? `${numberText(vehicle.mileageKm)} km` : "-",
    source: displayValue(vehicle.source || vehicle.telemetrySource, "Smart odpady API"),
    telemetrySource: displayValue(vehicle.telemetrySource),
    updatedAt: formatDateTime(vehicle.updatedAt || vehicle.lastChangedAt || vehicle.driverAssignmentUpdatedAt),
    stkValidTo: formatDate(vehicle.stkValidTo),
    revisionValidTo: formatDate(
      vehicle.tachographValidTo ||
      vehicle.craneRevisionValidTo ||
      vehicle.liftRevisionValidTo ||
      vehicle.pressureEquipmentRevisionValidTo
    ),
    insuranceValidTo: formatDate(vehicle.insuranceValidTo),
    openDefects: Number.isFinite(Number(vehicle.openDefects)) ? numberText(vehicle.openDefects) : "-",
    hasDueTerm: vehicleHasDueTerm(vehicle),
    hasOpenDefect: vehicleHasOpenDefect(vehicle),
    assignedDriverId: cleanText(vehicle.assignedDriverId),
    driverAssignmentNote: cleanText(vehicle.driverAssignmentNote),
    driverAssignmentUpdatedAt: formatDateTime(vehicle.driverAssignmentUpdatedAt),
    driverAssignmentUpdatedByName: cleanText(vehicle.driverAssignmentUpdatedByName)
  };
}

function driverLabel(driver = {}) {
  const meta = [driver.position, driver.department].map(cleanText).filter(Boolean).join(" / ");
  return meta ? `${driver.name || driver.id} (${meta})` : (driver.name || driver.id || "Zamestnanec");
}

function normalizeDrivers(drivers = []) {
  return asArray(drivers)
    .filter((driver) => cleanText(driver?.id || driver?.userId))
    .map((driver) => ({
      id: cleanText(driver.id || driver.userId),
      userId: cleanText(driver.userId || driver.id),
      label: driverLabel(driver),
      name: cleanText(driver.name),
      phone: cleanText(driver.phone),
      email: cleanText(driver.email)
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "cs"));
}

function summaryFromVehicles(vehicles = []) {
  return vehicles.reduce((summary, vehicle) => {
    summary.total += 1;
    if (vehicle.status === "active") summary.active += 1;
    if (vehicle.status === "service") summary.inService += 1;
    if (vehicle.status === "out_of_order") summary.outOfOrder += 1;
    if (vehicle.status === "retired") summary.retired += 1;
    if (vehicle.hasDueTerm) summary.stkDue += 1;
    if (vehicle.hasDueTerm) summary.revisionDue += 1;
    if (vehicle.insuranceValidTo !== "-" && dateDueWithinDays(vehicle.raw?.insuranceValidTo)) summary.insuranceDue += 1;
    if (vehicle.hasOpenDefect) summary.openDefects += numberValue(vehicle.raw?.openDefects);
    if (cleanText(vehicle.raw?.assignedDriverName || vehicle.raw?.assignedDriverId)) summary.assignedDrivers += 1;
    return summary;
  }, {
    total: 0,
    active: 0,
    inService: 0,
    outOfOrder: 0,
    retired: 0,
    stkDue: 0,
    revisionDue: 0,
    insuranceDue: 0,
    openDefects: 0,
    assignedDrivers: 0
  });
}

function valueFromSummary(summary = {}, fallback = {}, key) {
  const value = summary[key];
  if (Number.isFinite(Number(value))) {
    return Number(value);
  }
  return Number(fallback[key] || 0);
}

function metricItems(summary = {}, fallbackSummary = {}, loading = false) {
  return FLEET_DASHBOARD_METRICS.map((metric) => ({
    id: metric.id,
    label: metric.label,
    value: loading ? "..." : numberText(valueFromSummary(summary, fallbackSummary, metric.id)),
    detail: metric.id === "total"
      ? "vsechna vozidla"
      : metric.id === "openDefects"
        ? "z realneho zdroje"
        : "aktualni filtr nezmeni souhrn"
  }));
}

function optionValues(values = [], fallback = []) {
  const result = new Set(fallback);
  asArray(values).forEach((value) => {
    const text = cleanText(value);
    if (text) {
      result.add(text);
    }
  });
  return [...result].sort((left, right) => left.localeCompare(right, "cs"));
}

function termsForVehicle(vehicle = null, allVehicles = []) {
  return FLEET_TERM_DEFINITIONS.map((term) => {
    const rawValue = vehicle?.raw?.[term.id] || "";
    const dueCount = allVehicles.filter((item) => dateDueWithinDays(item.raw?.[term.id])).length;
    return {
      ...term,
      value: rawValue ? formatDate(rawValue) : "-",
      due: Boolean(rawValue && dateDueWithinDays(rawValue)),
      dueCount
    };
  });
}

function sectionLabel(sectionId) {
  return FLEET_REQUIRED_SECTIONS.find((section) => section.id === sectionId)?.label || sectionId;
}

function normalizeActiveTab({ state = {}, selectedVehicleId = "", originalPath = "" } = {}) {
  const active = cleanText(state.activeTab);
  const routeIsDashboard = cleanText(originalPath).replace(/\/+$/, "") === "/vozovy-park/dashboard";
  const allowed = new Set(FLEET_REQUIRED_SECTIONS.map((section) => section.id));
  if (allowed.has(active)) {
    return active;
  }
  if (selectedVehicleId) {
    return "detail";
  }
  return routeIsDashboard ? "dashboard" : "dashboard";
}

function fieldList(fields = []) {
  return asArray(fields).map((field) => cleanText(field)).filter(Boolean);
}

export function createFleetViewModel({
  user = null,
  runtime = {},
  resolvedRoute = {},
  routeHref = (route) => route
} = {}) {
  const state = runtime.fleet || {};
  const selectedId = selectedVehicleIdFromPath(resolvedRoute.originalPath || "");
  const canView = state.canView !== false && (state.authRequired || !user || hasPermission(user, "fleet", "view"));

  if (!canView) {
    return {
      canView: false,
      routeHref,
      activeTab: "dashboard",
      error: state.error || "Aktualni role nema opravneni fleet:view.",
      vehicles: [],
      filteredVehicles: [],
      metrics: []
    };
  }

  const rawVehicles = asArray(state.vehicles);
  const rawFilteredVehicles = asArray(state.filteredVehicles).length ? asArray(state.filteredVehicles) : rawVehicles;
  const vehicles = rawVehicles.map((vehicle, index) => normalizeVehicle(vehicle, index, selectedId));
  const filteredVehicles = rawFilteredVehicles.map((vehicle, index) => normalizeVehicle(vehicle, index, selectedId));
  const selectedVehicle = vehicles.find((vehicle) => vehicle.selected) || filteredVehicles[0] || vehicles[0] || null;
  const fallbackSummary = summaryFromVehicles(vehicles);
  const summary = {
    ...fallbackSummary,
    ...(state.summary || {})
  };
  const activeTab = normalizeActiveTab({ state, selectedVehicleId: selectedId, originalPath: resolvedRoute.originalPath });
  const drivers = normalizeDrivers(state.driverCandidates);
  const filters = {
    status: state.filters?.status || "all",
    type: state.filters?.type || "all",
    driver: state.filters?.driver || "all",
    terms: state.filters?.terms || "all",
    defects: state.filters?.defects || "all",
    search: state.filters?.search || ""
  };

  return {
    canView: true,
    canEdit: Boolean(state.canEdit || hasPermission(user, "fleet", "edit")),
    canExport: Boolean(state.canExport || hasPermission(user, "fleet", "export")),
    authRequired: Boolean(state.authRequired),
    routeHref,
    originalPath: resolvedRoute.originalPath || "/vozovy-park",
    activeTab,
    activeTabLabel: sectionLabel(activeTab),
    loading: Boolean(state.loading),
    loaded: Boolean(state.loaded),
    error: state.error || "",
    message: state.actionMessage || state.message || "",
    apiStatus: state.apiStatus || "waiting",
    provider: state.provider || "",
    source: state.source || "",
    sourceLabel: state.sourceLabel || state.source || "Read-only API",
    sourceDescription: state.sourceDescription || "Vozidla se ctou pres chranene Smart odpady API.",
    statusText: state.statusText || state.message || "",
    lastFetchedAt: formatDateTime(state.lastFetchedAt),
    savingAssignmentVehicleId: state.savingAssignmentVehicleId || "",
    filters,
    filtersActive: Boolean(state.filtersActive),
    statusOptions: FLEET_STATUS_OPTIONS,
    typeOptions: optionValues(state.typeOptions, FLEET_VEHICLE_TYPES),
    driverOptions: optionValues(state.driverOptions),
    drivers,
    vehicles,
    filteredVehicles,
    selectedVehicle,
    selectedVehicleId: selectedVehicle?.id || selectedId,
    summary,
    metrics: metricItems(summary, fallbackSummary, Boolean(state.loading)),
    terms: termsForVehicle(selectedVehicle, vehicles),
    sections: FLEET_REQUIRED_SECTIONS,
    fields: {
      vehicles: fieldList(FLEET_VEHICLE_FIELDS),
      defects: fieldList(FLEET_DEFECT_FIELDS),
      service: fieldList(FLEET_SERVICE_FIELDS),
      documents: fieldList(FLEET_DOCUMENT_FIELDS)
    },
    notices: [
      state.authRequired ? {
        tone: "warning",
        text: "Verejne static-only preview neni prihlasene do Smart odpady API. Zivy seznam vozidel se nacte az v chranene aplikaci."
      } : null,
      state.loading ? { tone: "info", text: "Nacitam vozidla pres puvodni /api/vehicles runtime." } : null,
      state.error ? { tone: "danger", text: state.error } : null,
      state.actionError ? { tone: "danger", text: state.actionError } : null,
      state.actionMessage ? { tone: "info", text: state.actionMessage } : null,
      !state.loading && !state.error && state.apiStatus !== "ready" ? {
        tone: "warning",
        text: state.message || FLEET_API_WAITING_LABEL
      } : null
    ].filter(Boolean)
  };
}
