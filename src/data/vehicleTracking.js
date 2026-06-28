export const VEHICLE_TRACKING_ROUTE = "/sledovani-vozidel";
export const VEHICLE_TRACKING_GPS_WAITING = "Čeká na napojení GPS poskytovatele.";
export const VEHICLE_TRACKING_API_ERROR = "Sledování vozidel se nepodařilo načíst.";
export const VEHICLE_TRACKING_EMPTY = "Nejsou dostupná žádná sledovaná vozidla.";
export const VEHICLE_TRACKING_LOADING = "Načítám sledování vozidel…";
export const VEHICLE_TRACKING_NO_SIGNAL = "Vozidlo nemá aktuální GPS signál.";
export const VEHICLE_TRACKING_TCAR_PROVIDER = "tcars";
export const VEHICLE_TRACKING_TCAR_SOURCE = "T-Cars jednotka";
export const VEHICLE_TRACKING_TCAR_WAITING = "T-Cars napojení čeká na konfiguraci.";
export const VEHICLE_TRACKING_TCAR_UNAVAILABLE = "T-Cars není aktuálně dostupný.";
export const VEHICLE_TRACKING_TCAR_API_DOCUMENTATION_MISSING = "Chybí API dokumentace T-Cars. Prosím dodat dokumentaci nebo potvrdit způsob napojení.";
export const VEHICLE_TRACKING_TCAR_LAST_KNOWN = "Poslední známá poloha";
export const VEHICLE_TRACKING_TABLET_ROLE = "Primární poloha vozidla je z T-Cars jednotky. Android tablet slouží jako vozidlový terminál.";
export const VEHICLE_TRACKING_ICON_FOLDER = "/vehicles/icons/";
export const VEHICLE_TRACKING_WIM_WAITING = "WIM vrstva ceka na D1 migraci nebo API.";
export const VEHICLE_TRACKING_WIM_PLACEHOLDER_ICON = "Docasna WIM ikona je placeholder. Finalni graficky asset doda Radim nebo Martin.";
export const VEHICLE_TRACKING_WIM_ALERT_PILOT = "15km SMS a app alert jsou zatim evidovany jako navrh automatizace bez ostreho odesilani.";
export const VEHICLE_TRACKING_ICON_WAITING = "Ikony dodány a připraveny v mapě.";

export const VEHICLE_TRACKING_ICON_FORMATS = [
  "PNG s transparentním pozadím",
  "WebP s transparentním pozadím",
  "128 x 128 px nebo 256 x 256 px",
  "zobrazení v mapě 36-48 px",
  "max. 100 KB na ikonu"
];

export const VEHICLE_TRACKING_ICON_REQUIREMENTS = [
  "3D-look je povolený, skutečný 3D model ne",
  "horní šikmý pohled cca 45 stupňů",
  "bez SPZ, malých textů a pozadí",
  "stejný úhel pohledu u všech ikon",
  "stav vozidla řeší CSS obrys / badge"
];

export const VEHICLE_TRACKING_ICON_TYPES = [
  {
    key: "collection_truck",
    label: "Svozové vozidlo",
    slug: "svozove-vozidlo",
    primary: "/vehicles/icons/svozove-vozidlo.png",
    webp: "/vehicles/icons/svozove-vozidlo.webp"
  },
  {
    key: "container_truck",
    label: "Kontejnerové vozidlo",
    slug: "kontejnerove-vozidlo",
    primary: "/vehicles/icons/kontejnerove-vozidlo.png",
    webp: "/vehicles/icons/kontejnerove-vozidlo.webp"
  },
  {
    key: "van",
    label: "Dodávka",
    slug: "dodavka",
    primary: "/vehicles/icons/dodavka.png",
    webp: "/vehicles/icons/dodavka.webp"
  },
  {
    key: "special",
    label: "Speciální technika",
    slug: "specialni-technika",
    primary: "/vehicles/icons/specialni-technika.png",
    webp: "/vehicles/icons/specialni-technika.webp"
  },
  {
    key: "car",
    label: "Osobní vozidlo",
    slug: "osobni-vozidlo",
    primary: "/vehicles/icons/osobni-vozidlo.png",
    webp: "/vehicles/icons/osobni-vozidlo.webp"
  },
  {
    key: "trailer",
    label: "Přívěs / návěs",
    slug: "prives-naves",
    primary: "/vehicles/icons/prives-naves.png",
    webp: "/vehicles/icons/prives-naves.webp"
  }
];

export const VEHICLE_ICON_BY_TYPE = {
  collection_truck: "/vehicles/icons/svozove-vozidlo.png",
  container_truck: "/vehicles/icons/kontejnerove-vozidlo.png",
  van: "/vehicles/icons/dodavka.png",
  special: "/vehicles/icons/specialni-technika.png",
  car: "/vehicles/icons/osobni-vozidlo.png",
  trailer: "/vehicles/icons/prives-naves.png"
};

export const VEHICLE_ICON_WEBP_BY_TYPE = {
  collection_truck: "/vehicles/icons/svozove-vozidlo.webp",
  container_truck: "/vehicles/icons/kontejnerove-vozidlo.webp",
  van: "/vehicles/icons/dodavka.webp",
  special: "/vehicles/icons/specialni-technika.webp",
  car: "/vehicles/icons/osobni-vozidlo.webp",
  trailer: "/vehicles/icons/prives-naves.webp"
};

const VEHICLE_ICON_TYPE_ALIASES = {
  collection_truck: "collection_truck",
  svozove_vozidlo: "collection_truck",
  svoz: "collection_truck",
  popelar: "collection_truck",
  container_truck: "container_truck",
  kontejnerove_vozidlo: "container_truck",
  kontejner: "container_truck",
  van: "van",
  dodavka: "van",
  special: "special",
  specialni_technika: "special",
  technika: "special",
  car: "car",
  osobni_vozidlo: "car",
  osobni: "car",
  trailer: "trailer",
  prives_naves: "trailer",
  prives: "trailer",
  naves: "trailer"
};

export const VEHICLE_TRACKING_SOURCE_MODES = [
  {
    id: "demo",
    label: "Demo",
    badge: "DEMO REŽIM – ukázkový pohyb vozidel, nejde o reálná GPS data.",
    description: "Používá demo data a animaci bez reálných GPS poloh."
  },
  {
    id: "tcars",
    label: "T-Cars",
    badge: "T-CARS – poloha z vozidlové jednotky",
    description: "Používá vlastní Smart odpady API, které bude serverově napojené na T-Cars."
  },
  {
    id: "fallback",
    label: "Fallback",
    badge: "Poslední známá poloha",
    description: "Zapne se při výpadku T-Cars a zobrazí poslední známou polohu, pokud existuje."
  }
];

export const VEHICLE_TRACKING_STATUS_OPTIONS = [
  { value: "moving", label: "Jede", tone: "moving" },
  { value: "standing", label: "Stojí", tone: "stopped" },
  { value: "stopped", label: "Stojí", tone: "stopped" },
  { value: "offline", label: "Offline", tone: "offline" },
  { value: "off", label: "Vypnuté", tone: "off" },
  { value: "no_signal", label: "Bez signálu", tone: "no-signal" },
  { value: "service", label: "V servisu", tone: "service" },
  { value: "out_of_route", label: "Mimo trasu", tone: "off-route" },
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
  "GET /api/vehicle-tracking/wim-sites",
  "GET /api/vehicle-tracking/wim-alerts",
  "POST /api/vehicle-tracking/tcars/sync",
  "GET /api/vehicle-tracking/tcars/vehicles",
  "PATCH /api/vehicles/:id/tcars-link",
  "DELETE /api/vehicles/:id/tcars-link",
  "GET /api/vehicle-tracking/vehicles/:vehicleId",
  "GET /api/vehicle-tracking/vehicles/:vehicleId/today-trip",
  "GET /api/vehicle-tracking/vehicles/:vehicleId/trips",
  "GET /api/vehicle-tracking/trips/:tripId"
];

export const VEHICLE_TRACKING_STATUS_FIELDS = [
  "id",
  "vehicleId",
  "externalProvider",
  "externalVehicleId",
  "externalUnitId",
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
  "source",
  "gpsProvider",
  "gpsUnitId",
  "lastGpsAt",
  "receivedAt",
  "updatedAt"
];

export const VEHICLE_TRACKING_TCAR_LINK_FIELDS = [
  "tcarsVehicleId",
  "tcarsUnitId",
  "tcarsLicensePlate",
  "gpsProvider"
];

export const VEHICLE_TRACKING_TCAR_PAIRING_COLUMNS = [
  "Vozidlo Smart odpady",
  "SPZ Smart odpady",
  "T-Cars vozidlo",
  "T-Cars ID",
  "T-Cars jednotka",
  "Stav párování",
  "Akce"
];

export const VEHICLE_TRACKING_TCAR_SYNC_LOG_FIELDS = [
  "id",
  "status",
  "startedAt",
  "finishedAt",
  "vehiclesFetched",
  "locationsFetched",
  "errorMessage",
  "createdAt"
];

export const VEHICLE_TRACKING_WIM_SITE_FIELDS = [
  "id",
  "road",
  "kmLabel",
  "locationLabel",
  "orp",
  "sideLabel",
  "status",
  "statusLabel",
  "latitude",
  "longitude",
  "deviceCount",
  "sourceDate",
  "coordinateQuality"
];

export const VEHICLE_TRACKING_WIM_ALERT_FIELDS = [
  "siteId",
  "vehicleId",
  "driverId",
  "distanceKm",
  "approachSide",
  "channel",
  "status",
  "dedupeKey",
  "triggeredAt"
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

export function vehicleTrackingIconTypeKey(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return VEHICLE_ICON_TYPE_ALIASES[normalized] || "";
}

export function vehicleTrackingIconForType(value = "") {
  const key = vehicleTrackingIconTypeKey(value);
  return VEHICLE_TRACKING_ICON_TYPES.find((type) => type.key === key) || null;
}
