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
  "GET /api/vehicles/summary"
];

export const FLEET_DASHBOARD_METRICS = [
  { id: "total", label: "Celkem" },
  { id: "active", label: "Provozuschopná" },
  { id: "outOfOrder", label: "Mimo provoz" },
  { id: "inService", label: "V servisu" },
  { id: "stkDue", label: "STK do 30 dnů" },
  { id: "revisionDue", label: "Revize do 30 dnů" },
  { id: "insuranceDue", label: "Pojištění do 30 dnů" },
  { id: "openDefects", label: "Otevřené závady" }
];

export const FLEET_STATUS_OPTIONS = [
  { value: "active", label: "Provozuschopné", tone: "active" },
  { value: "service", label: "V servisu", tone: "service" },
  { value: "out_of_order", label: "Mimo provoz", tone: "out-of-order" },
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
  "Interní číslo",
  "SPZ",
  "Typ",
  "Značka/model",
  "Řidič",
  "Stav",
  "STK do",
  "Revize do",
  "Pojištění do",
  "Otevřené závady",
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
  { id: "dashboard", label: "Dashboard" },
  { id: "vehicles", label: "Seznam vozidel" },
  { id: "detail", label: "Detail vozidla" },
  { id: "terms", label: "Termíny" },
  { id: "defects", label: "Závady" },
  { id: "service", label: "Servisní historie" },
  { id: "documents", label: "Dokumenty" },
  { id: "settings", label: "Nastavení / číselníky" }
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
  "tcarsVehicleId",
  "tcarsUnitId",
  "tcarsLicensePlate",
  "gpsProvider",
  "gpsUnitId",
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
  return FLEET_STATUS_OPTIONS.find((option) => option.value === status)?.label || "Čeká na API";
}

export function fleetStatusTone(status) {
  return FLEET_STATUS_OPTIONS.find((option) => option.value === status)?.tone || "waiting";
}
