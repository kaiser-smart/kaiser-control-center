import { hasPermission } from "../../permissions.js";

const STATUS_LABELS = {
  new_report: "Nove hlaseni",
  waiting_part_identification: "Ceka na identifikaci dilu",
  part_identified: "Dil identifikovan",
  handed_to_ordering: "Predano k objednani",
  ordered: "Objednano",
  part_arrived: "Dil dorazil",
  service_scheduled: "Servis naplanovan",
  completed: "Vyrizeno",
  canceled: "Zruseno"
};

const PHOTO_STATUS_LABELS = {
  requested: "Vyzadana od ridice",
  pending: "Ceka na fotku",
  attached: "Prilozena",
  not_needed: "Nevyzadovana"
};

const PART_SIDE_LABELS = {
  left: "leve",
  right: "prave",
  unknown: "neznama strana"
};

const PART_VERIFICATION_LABELS = {
  waiting_identification: "Ceka na identifikaci",
  probable_part: "Pravdepodobny dil",
  probable_waiting_verification: "Pravdepodobny dil",
  waiting_manual_verification: "Ceka na rucni overeni",
  verified_daimler: "Overeno v Daimler",
  verified_manual: "Overeno rucne",
  verified: "Overeno rucne",
  failed: "Chyba overeni"
};

const PART_SOURCE_LABELS = {
  daimler: "Daimler",
  manual: "Rucne",
  internal: "Interni odhad",
  tecdoc: "TecDoc"
};

const BRAND_OPTIONS = [
  { value: "mercedes", label: "Mercedes" },
  { value: "daf", label: "DAF" },
  { value: "man", label: "MAN" },
  { value: "jine", label: "jine" },
  { value: "jiné", label: "jine" }
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function textValue(...values) {
  return values.map(cleanText).find(Boolean) || "";
}

function displayValue(value, fallback = "-") {
  return cleanText(value) || fallback;
}

function numberText(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "0";
  }

  return new Intl.NumberFormat("cs-CZ").format(number);
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

function statusTone(status) {
  if (["completed"].includes(status)) return "success";
  if (["canceled"].includes(status)) return "danger";
  if (["part_arrived", "service_scheduled"].includes(status)) return "info";
  if (["ordered", "handed_to_ordering", "part_identified"].includes(status)) return "warning";
  return "neutral";
}

function statusGroup(status) {
  if (["completed", "canceled"].includes(status)) return "closed";
  if (["ordered"].includes(status)) return "ordered";
  if (["part_arrived", "service_scheduled"].includes(status)) return "ready";
  return "waiting";
}

function statusLabel(status) {
  return STATUS_LABELS[status] || displayValue(status, "Neznamy stav");
}

function photoStatusLabel(status) {
  return PHOTO_STATUS_LABELS[status] || displayValue(status, "Vyzadana od ridice");
}

function partSideLabel(side) {
  return PART_SIDE_LABELS[side] || PART_SIDE_LABELS.unknown;
}

function partVerificationLabel(status) {
  return PART_VERIFICATION_LABELS[status] || displayValue(status, "Ceka na rucni overeni");
}

function partSourceLabel(source) {
  return PART_SOURCE_LABELS[source] || displayValue(source, "neuvedeno");
}

function notificationLabel(status) {
  const normalized = cleanText(status || "not_sent");
  if (normalized === "sent") return "Odeslano";
  if (normalized === "failed") return "Chyba";
  if (normalized === "skipped") return "Neodeslano";
  return "Neodeslano";
}

function notificationTone(status) {
  if (status === "sent") return "success";
  if (status === "failed") return "danger";
  return "warning";
}

function partslink24StatusLabel(status) {
  const normalized = cleanText(status);
  if (normalized === "manual_dispatch_required") return "Vyzaduje rucni spusteni";
  if (normalized === "manual_review_required") return "Vyzaduje rucni kontrolu";
  if (normalized === "dry_run_ready") return "Dry-run pripraven";
  if (normalized === "configuration_missing") return "Nenakonfigurovano";
  if (normalized === "blocked") return "Blokovano";
  if (normalized === "failed") return "Chyba";
  return normalized || "Zatim bez hledani";
}

function requestId(item = {}) {
  return textValue(item.id, item.reportId);
}

function itemTitle(item = {}) {
  return textValue(item.licensePlate, item.vehicleName, item.reportId, item.id, "Hlaseni");
}

function partTitle(item = {}) {
  return textValue(item.probablePart, item.verifiedPart, item.defectType, "nahradni dil");
}

function normalizeNotification(label, status, error) {
  return {
    label,
    status: cleanText(status || "not_sent"),
    text: notificationLabel(status),
    tone: notificationTone(status),
    error: cleanText(error)
  };
}

function normalizeEvent(event = {}) {
  return {
    id: textValue(event.id, event.createdAt, event.action),
    createdAt: formatDateTime(event.createdAt),
    action: displayValue(event.note || event.action, "zmena"),
    actor: displayValue(event.actorName, "system"),
    notificationStatus: cleanText(event.notificationStatus)
  };
}

function normalizeReport(item = {}, selectedId = "") {
  const id = requestId(item);
  const status = cleanText(item.status || "new_report");
  const partVerificationStatus = cleanText(item.partVerificationStatus || item.partIdentificationStatus);
  const eligibility = item.partslink24Eligibility || {};
  const latestPartslink = item.partslink24VinSearch || null;

  return {
    id,
    raw: item,
    selected: selectedId ? [id, item.reportId].map(cleanText).includes(selectedId) : false,
    title: itemTitle(item),
    reportId: displayValue(item.reportId, "ND"),
    reportedAt: formatDateTime(item.reportedAt),
    driverName: displayValue(item.driverName, "ridic"),
    driverPhone: displayValue(item.driverPhone),
    vehicleName: displayValue(item.vehicleName),
    licensePlate: displayValue(item.licensePlate, "SPZ neuvedena"),
    vin: displayValue(item.vin, "neni dostupne"),
    vehicleBrand: cleanText(item.vehicleBrand || "jine"),
    vehicleBrandLabel: displayValue(item.vehicleBrandLabel || item.vehicleBrand, "neuvedeno"),
    defectType: displayValue(item.defectType, "servisni potreba"),
    defectDescription: displayValue(item.defectDescription, "Bez popisu"),
    damagePhotoStatus: cleanText(item.damagePhotoStatus || "requested"),
    damagePhotoStatusLabel: photoStatusLabel(item.damagePhotoStatus),
    probablePart: displayValue(item.probablePart),
    probablePartSide: cleanText(item.probablePartSide || "unknown"),
    probablePartSideLabel: displayValue(item.probablePartSideLabel || partSideLabel(item.probablePartSide)),
    verifiedPart: displayValue(item.verifiedPart),
    partOrderNumber: displayValue(item.partOrderNumber),
    oePartNumber: displayValue(item.oePartNumber),
    partName: displayValue(item.partName),
    partTitle: partTitle(item),
    partVerificationStatus,
    partVerificationLabel: partVerificationLabel(partVerificationStatus),
    partVerificationSource: partSourceLabel(item.partVerificationSource),
    partsProviderStatus: displayValue(item.partsProviderStatus),
    partsProviderMessage: cleanText(item.partsProviderMessage),
    partLookupQuery: displayValue(item.partLookupQuery),
    priceBoostStatus: displayValue(item.priceBoostStatus || "not_requested"),
    priceBoostNote: cleanText(item.priceBoostNote),
    mercedesManualPortalUrl: cleanText(item.mercedesManualPortalUrl),
    mercedesMyPartsHubUrl: cleanText(item.mercedesMyPartsHubUrl),
    status,
    statusLabel: statusLabel(status),
    statusTone: statusTone(status),
    statusGroup: statusGroup(status),
    assignedToName: displayValue(item.assignedToName),
    handedOffToPatrikAt: formatDateTime(item.handedOffToPatrikAt),
    kamilSmsSentAt: formatDateTime(item.kamilSmsSentAt),
    orderedAt: formatDateTime(item.orderedAt),
    deliveredAt: formatDateTime(item.deliveredAt),
    serviceDate: formatDate(item.serviceDate),
    serviceTime: displayValue(item.serviceTime),
    serviceDateRaw: cleanText(item.serviceDate),
    serviceTimeRaw: cleanText(item.serviceTime),
    serviceTechnician: cleanText(item.serviceTechnician || "Kamil"),
    serviceNote: cleanText(item.serviceNote),
    completedAt: formatDateTime(item.completedAt),
    canceledAt: formatDateTime(item.canceledAt),
    note: cleanText(item.note),
    manualVehicleReview: Boolean(item.manualVehicleReview),
    licensePlateVerified: item.licensePlateVerified !== false,
    licensePlateValidationStatus: displayValue(item.licensePlateValidationStatus, "SPZ neoverena"),
    notifications: [
      normalizeNotification("E-mail Patrikovi", item.patrikEmailStatus, item.patrikEmailError),
      normalizeNotification("SMS Kamilovi", item.kamilSmsStatus, item.kamilSmsError),
      normalizeNotification("SMS ridici", item.driverSmsStatus, item.driverSmsError)
    ],
    events: asArray(item.events).map(normalizeEvent),
    isMercedes: cleanText(item.vehicleBrand) === "mercedes",
    partslink24: {
      eligibility,
      latest: latestPartslink,
      status: partslink24StatusLabel(latestPartslink?.status),
      message: cleanText(latestPartslink?.message || eligibility.message || "Pilotni vyhledani je dostupne jen pro osobni vozidla s VIN."),
      workflowUrl: cleanText(latestPartslink?.workflowUrl),
      allowed: eligibility.allowed === true,
      canSearchPartslink24: eligibility.canSearchPartslink24 === true,
      vehicleKind: cleanText(eligibility.vehicleKind),
      vinMasked: cleanText(eligibility.vinMasked)
    }
  };
}

function selectedIdFromState(state = {}) {
  return textValue(state.selectedId, state.selected?.id, state.selected?.reportId);
}

function summary(items = []) {
  return {
    total: items.length,
    waiting: items.filter((item) => item.statusGroup === "waiting").length,
    ordered: items.filter((item) => item.status === "ordered").length,
    arrived: items.filter((item) => item.status === "part_arrived").length,
    scheduled: items.filter((item) => item.status === "service_scheduled").length,
    closed: items.filter((item) => item.statusGroup === "closed").length
  };
}

function canHandoff(item = {}, loading = "") {
  return (
    !["handed_to_ordering", "ordered", "part_arrived", "service_scheduled", "completed", "canceled"].includes(item.status) ||
    item.raw?.patrikEmailStatus !== "sent" ||
    item.raw?.kamilSmsStatus !== "sent"
  ) && !loading;
}

function actionState(item = {}, loading = "") {
  return {
    canHandoff: canHandoff(item, loading),
    canArrived: ["ordered", "handed_to_ordering"].includes(item.status) && !loading,
    canComplete: item.status === "service_scheduled" && !loading,
    canCancel: !["completed", "canceled"].includes(item.status) && !loading,
    canOrder: !["completed", "canceled"].includes(item.status) && !loading,
    canManualPart: !["ordered", "part_arrived", "service_scheduled", "completed", "canceled"].includes(item.status) && !loading,
    canScheduleService: ["part_arrived", "service_scheduled"].includes(item.status) && !loading,
    loading
  };
}

function plateValidationView(validation = {}) {
  const status = cleanText(validation.status || "idle");
  return {
    ...validation,
    status,
    normalized: cleanText(validation.normalized),
    message: cleanText(validation.message),
    tone: status === "found" ? "success" : status === "idle" ? "neutral" : status === "validating" || validation.loading ? "info" : "danger",
    vehicle: validation.vehicle || null,
    suggestions: asArray(validation.suggestions),
    loading: Boolean(validation.loading)
  };
}

export function createDriverReportsViewModel({
  user = null,
  runtime = {},
  routeHref = (route) => route
} = {}) {
  const state = runtime.driverReports || {};
  const canView = state.canView !== false && (state.authRequired || !user || hasPermission(user, "driver-reports", "view"));

  if (!canView) {
    return {
      canView: false,
      routeHref,
      error: state.error || "Aktualni role nema opravneni driver-reports:view.",
      items: [],
      selected: null,
      metrics: []
    };
  }

  const selectedId = selectedIdFromState(state);
  const items = asArray(state.items).map((item) => normalizeReport(item, selectedId));
  const selectedRaw = state.selected || asArray(state.items).find((item) => [item.id, item.reportId].map(cleanText).includes(selectedId)) || null;
  const selected = selectedRaw ? normalizeReport(selectedRaw, selectedId) : items.find((item) => item.selected) || items[0] || null;
  const counts = summary(items);
  const permissions = state.permissions || {};
  const canManage = Boolean(permissions.canManage || state.canManage || hasPermission(user, "driver-reports", "manage") || hasPermission(user, "driver-reports", "edit"));
  const canCreate = Boolean(permissions.canCreate || state.canCreate || hasPermission(user, "driver-reports", "create"));
  const canSearchPartslink24 = Boolean(permissions.canSearchPartslink24 || state.canSearchPartslink24 || canManage);

  return {
    canView: true,
    canCreate,
    canManage,
    canSearchPartslink24,
    authRequired: Boolean(state.authRequired),
    routeHref,
    loading: Boolean(state.loading),
    loaded: Boolean(state.loaded),
    saving: Boolean(state.saving),
    actionLoading: cleanText(state.actionLoading),
    apiStatus: state.apiStatus || "waiting",
    error: state.error || "",
    message: state.message || "",
    search: state.search || "",
    draft: {
      licensePlate: state.draft?.licensePlate || "",
      defectDescription: state.draft?.defectDescription || "",
      driverName: state.draft?.driverName || user?.name || "",
      driverPhone: state.draft?.driverPhone || user?.phone || "",
      vehicleName: state.draft?.vehicleName || "",
      vin: state.draft?.vin || "",
      vehicleBrand: state.draft?.vehicleBrand || "jine",
      note: state.draft?.note || "",
      handoffAfterCreate: state.draft?.handoffAfterCreate !== false,
      licensePlateUnverified: state.draft?.licensePlateUnverified === true,
      licensePlateOverrideNote: state.draft?.licensePlateOverrideNote || ""
    },
    canSubmitCreate: Boolean(state.canSubmitCreate),
    plateValidation: plateValidationView(state.plateValidation),
    permissions,
    limitation: cleanText(permissions.limitation),
    items,
    selected,
    selectedId: selected?.id || selectedId,
    summary: counts,
    metrics: [
      { id: "waiting", label: "Ceka na dil", value: numberText(counts.waiting), detail: "nove a rozpracovane" },
      { id: "ordered", label: "Objednano", value: numberText(counts.ordered), detail: "dil je na ceste" },
      { id: "arrived", label: "Dil dorazil", value: numberText(counts.arrived), detail: "ceka servis" },
      { id: "scheduled", label: "Servis", value: numberText(counts.scheduled), detail: "naplanovano" }
    ],
    statusLabels: STATUS_LABELS,
    brandOptions: BRAND_OPTIONS,
    notices: [
      state.authRequired ? {
        tone: "warning",
        text: "Verejne static-only preview neni prihlasene do Smart odpady API. Ziva hlaseni se nactou az v chranene aplikaci."
      } : null,
      state.loading ? { tone: "info", text: "Nacitam hlaseni pres puvodni /api/driver-reports runtime." } : null,
      state.error ? { tone: "danger", text: state.error } : null,
      state.message ? { tone: "info", text: state.message } : null,
      permissions.limitation ? { tone: "warning", text: permissions.limitation } : null
    ].filter(Boolean),
    selectedActions: selected ? actionState(selected, state.actionLoading) : actionState({}, state.actionLoading)
  };
}
