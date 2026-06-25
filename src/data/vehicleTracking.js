export const VEHICLE_TRACKING_ROUTE = "/sledovani-vozidel";
export const VEHICLE_TRACKING_GPS_WAITING = "Čeká na napojení GPS poskytovatele.";
export const VEHICLE_TRACKING_API_ERROR = "Sledování vozidel se nepodařilo načíst.";
export const VEHICLE_TRACKING_EMPTY = "Nejsou dostupná žádná sledovaná vozidla.";
export const VEHICLE_TRACKING_LOADING = "Načítám sledování vozidel…";
export const VEHICLE_TRACKING_NO_SIGNAL = "Vozidlo nemá aktuální GPS signál.";

export const VEHICLE_TRACKING_STATUS_OPTIONS = [
  { value: "moving", label: "Jede", tone: "moving" },
  { value: "stopped", label: "Stojí", tone: "stopped" },
  { value: "off", label: "Vypnuté", tone: "off" },
  { value: "no_signal", label: "Bez signálu", tone: "no-signal" },
  { value: "service", label: "V servisu", tone: "service" },
  { value: "out_of_order", label: "Mimo provoz", tone: "out-of-order" }
];

export const VEHICLE_TRACKING_FILTERS = [
  "Stav",
  "Typ vozidla",
  "Řidič",
  "Středisko",
  "Vozidla v pohybu",
  "Vozidla stojící",
  "Bez GPS signálu",
  "SPZ / řidič / interní číslo"
];

export const VEHICLE_TRACKING_LIST_COLUMNS = [
  "SPZ",
  "Interní číslo",
  "Řidič",
  "Stav",
  "Rychlost",
  "Poslední aktualizace",
  "Lokalita",
  "Akce"
];

export const VEHICLE_TRACKING_API_ENDPOINTS = [
  "GET /api/vehicle-tracking/status",
  "GET /api/vehicle-tracking/vehicles/:vehicleId",
  "GET /api/vehicle-tracking/vehicles/:vehicleId/today-trip",
  "GET /api/vehicle-tracking/vehicles/:vehicleId/trips",
  "GET /api/vehicle-tracking/trips/:tripId"
];

export const VEHICLE_TRACKING_STATUS_FIELDS = [
  "id",
  "vehicleId",
  "licensePlate",
  "internalNumber",
  "driverId",
  "driverName",
  "status",
  "latitude",
  "longitude",
  "speedKmh",
  "heading",
  "address",
  "gpsProvider",
  "gpsUnitId",
  "lastGpsAt",
  "updatedAt"
];

export const VEHICLE_TRIP_FIELDS = [
  "id",
  "vehicleId",
  "driverId",
  "startedAt",
  "endedAt",
  "startLatitude",
  "startLongitude",
  "endLatitude",
  "endLongitude",
  "startAddress",
  "endAddress",
  "distanceKm",
  "drivingTimeMinutes",
  "idleTimeMinutes",
  "maxSpeedKmh",
  "averageSpeedKmh",
  "createdAt"
];

export const VEHICLE_TRIP_POINT_FIELDS = [
  "id",
  "tripId",
  "vehicleId",
  "latitude",
  "longitude",
  "speedKmh",
  "heading",
  "recordedAt"
];

export const VEHICLE_STOP_FIELDS = [
  "id",
  "tripId",
  "vehicleId",
  "latitude",
  "longitude",
  "address",
  "startedAt",
  "endedAt",
  "durationMinutes"
];

export function vehicleTrackingStatusLabel(status) {
  return VEHICLE_TRACKING_STATUS_OPTIONS.find((option) => option.value === status)?.label || "Bez GPS dat";
}

export function vehicleTrackingStatusTone(status) {
  return VEHICLE_TRACKING_STATUS_OPTIONS.find((option) => option.value === status)?.tone || "waiting";
}
