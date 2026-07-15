export const FLEET_API_WAITING_LABEL = "Čeká na API";
export const FLEET_API_MISSING_MESSAGE = "Čeká na API pro vozový park.";

export const FLEET_API_ENDPOINTS = [
  "GET /api/vehicles",
  "POST /api/vehicles",
  "GET /api/vehicles/:id",
  "PATCH /api/vehicles/:id",
  "DELETE /api/vehicles/:id",
  "GET /api/vehicles/:id/defects",
  "POST /api/vehicles/:id/defects",
  "PATCH /api/vehicle-defects/:defectId",
  "GET /api/vehicles/:id/service-records",
  "POST /api/vehicles/:id/service-records",
  "PATCH /api/vehicle-service-records/:recordId",
  "GET /api/vehicles/:id/documents",
  "POST /api/vehicles/:id/documents",
  "DELETE /api/vehicle-documents/:documentId",
  "GET /api/vehicles/summary",
  "POST /api/fleet/vistos-vehicles-preview",
  "GET /api/fleet/orwii-fuel/analytics"
];

export const FLEET_DASHBOARD_METRICS = [
  { id: "total", label: "Vozidla celkem" },
  { id: "active", label: "Aktivní vozidla" },
  { id: "attention", label: "K řešení" },
  { id: "termsDue", label: "STK / revize končí" },
  { id: "insuranceDue", label: "Pojištění končí" },
  { id: "inService", label: "V servisu" },
  { id: "waitingPart", label: "Čeká na díl" },
  { id: "risks", label: "Rizika" }
];

export const FLEET_STATUS_OPTIONS = [
  { value: "ok", label: "V pořádku", tone: "active" },
  { value: "attention", label: "K řešení", tone: "attention" },
  { value: "waiting_part", label: "Čeká na díl", tone: "warning" },
  { value: "service", label: "V servisu", tone: "service" },
  { value: "out_of_order", label: "Neprovozní", tone: "out-of-order" },
  { value: "waiting_approval", label: "Čeká na schválení", tone: "warning" },
  { value: "risk", label: "Riziko", tone: "risk" },
  { value: "retired", label: "Vyřazené", tone: "retired" }
];

export const FLEET_VEHICLE_TYPES = [
  "Svozové vozidlo",
  "Hákový nosič",
  "Kontejnerové vozidlo",
  "Dodávka",
  "Osobní vozidlo",
  "Manipulační technika",
  "Přívěs",
  "Ostatní"
];

export const FLEET_LIST_COLUMNS = [
  "Stav",
  "SPZ",
  "Vozidlo",
  "Řidič / odpovědný",
  "GPS / sledování",
  "Hlášení / servis",
  "Termíny",
  "Doporučená akce",
  "Akce"
];

export const FLEET_TERM_DEFINITIONS = [
  { id: "stkValidTo", label: "STK", endpoint: "GET /api/vehicles/:id" },
  { id: "emissionsValidTo", label: "Emise", endpoint: "GET /api/vehicles/:id" },
  { id: "tachographValidTo", label: "Tachograf", endpoint: "GET /api/vehicles/:id" },
  { id: "craneRevisionValidTo", label: "Revize jeřábu", endpoint: "GET /api/vehicles/:id" },
  { id: "liftRevisionValidTo", label: "Revize čela", endpoint: "GET /api/vehicles/:id" },
  { id: "pressureEquipmentRevisionValidTo", label: "Tlakové zařízení", endpoint: "GET /api/vehicles/:id" },
  { id: "fireExtinguisherValidTo", label: "Hasicí přístroj", endpoint: "GET /api/vehicles/:id" },
  { id: "insuranceValidTo", label: "Pojištění", endpoint: "GET /api/vehicles/:id" }
];

export const FLEET_REQUIRED_SECTIONS = [
  { id: "overview", label: "Přehled" },
  { id: "vehicles", label: "Vozidla" },
  { id: "fuel", label: "Tankování" },
  { id: "terms", label: "Termíny" },
  { id: "service", label: "Servis" },
  { id: "costs", label: "Náklady" },
  { id: "documents", label: "Dokumenty" },
  { id: "settings", label: "Nastavení" },
  { id: "rules-automation", label: "Seznam pravidel a automatizace" }
];

export const FLEET_VEHICLE_FIELDS = [
  "id",
  "internalNumber",
  "licensePlate",
  "vehicleType",
  "brand",
  "model",
  "vin",
  "year",
  "fuelType",
  "euroNorm",
  "bodyType",
  "department",
  "assignedDriverId",
  "assignedDriverName",
  "assignedDriverPhone",
  "assignedDriverEmail",
  "status",
  "mileageKm",
  "stkValidTo",
  "emissionsValidTo",
  "tachographValidTo",
  "craneRevisionValidTo",
  "liftRevisionValidTo",
  "pressureEquipmentRevisionValidTo",
  "fireExtinguisherValidTo",
  "insuranceCompany",
  "insurancePolicyNumber",
  "insuranceValidTo",
  "highwayVignetteValidTo",
  "lastServiceDate",
  "nextServiceDate",
  "vistosTermSources",
  "tcarsVehicleId",
  "tcarsUnitId",
  "tcarsLicensePlate",
  "vistosVehicleId",
  "vistosVehicleName",
  "vistosVehicleCategory",
  "vistosVehicleStatus",
  "vistosStartingDate",
  "vistosEliminatedDate",
  "gpsProvider",
  "gpsUnitId",
  "telemetrySource",
  "note",
  "createdAt",
  "updatedAt"
];

export const FLEET_DEFECT_FIELDS = [
  "id",
  "vehicleId",
  "reportedAt",
  "reportedById",
  "reportedByName",
  "severity",
  "status",
  "title",
  "description",
  "photoDocumentId",
  "resolvedAt",
  "resolvedById",
  "resolutionNote"
];

export const FLEET_SERVICE_FIELDS = [
  "id",
  "vehicleId",
  "serviceDate",
  "serviceType",
  "supplier",
  "mileageKm",
  "costWithoutVat",
  "description",
  "nextServiceDate",
  "documentId",
  "createdById",
  "createdAt"
];

export const FLEET_DOCUMENT_FIELDS = [
  "id",
  "vehicleId",
  "documentType",
  "fileName",
  "contentType",
  "sizeBytes",
  "r2Key",
  "uploadedById",
  "uploadedAt",
  "note"
];

export function fleetStatusLabel(status) {
  if (status === "active") return "V pořádku";
  if (status === "out_of_order") return "Neprovozní";
  return FLEET_STATUS_OPTIONS.find((option) => option.value === status)?.label || "Zatím není dostupný stav";
}

export function fleetStatusTone(status) {
  if (status === "active") return "active";
  if (status === "out_of_order") return "out-of-order";
  return FLEET_STATUS_OPTIONS.find((option) => option.value === status)?.tone || "waiting";
}
