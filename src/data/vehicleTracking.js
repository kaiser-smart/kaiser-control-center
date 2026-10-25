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
export const VEHICLE_TRACKING_DEMO_MODE_WARNING = "DEMO REŽIM – vozidla na mapě nejsou reálná GPS data.";
export const VEHICLE_TRACKING_REAL_DATA_UNVERIFIED = "Reálná T-Cars data zatím nejsou v produkci ověřena.";
export const VEHICLE_TRACKING_STALE_POSITION_WARNING = "Pozice některých vozidel nemusí být aktuální.";
export const VEHICLE_TRACKING_API_ERROR_MODE_WARNING = "T-Cars API se nepodařilo načíst. Demo mapa se nezapíná automaticky a zůstává oddělená v demo režimu.";
export const VEHICLE_TRACKING_TABLET_ROLE = "Primární poloha vozidla je z T-Cars jednotky. Android tablet slouží jako vozidlový terminál.";
export const VEHICLE_TRACKING_ICON_FOLDER = "/vehicles/icons/";
export const VEHICLE_TRACKING_KAISER_SITE = Object.freeze({
  id: "kaiser-trnkova",
  label: "Kaiser servis",
  address: "Trnkova 3052/137, 628 00 Brno",
  latitude: 49.19121,
  longitude: 16.67013,
  logoSrc: "/logo-kaiser.png"
});
export const VEHICLE_TRACKING_WIM_WAITING = "WIM vrstva ceka na D1 migraci nebo API.";
export const VEHICLE_TRACKING_WIM_PLACEHOLDER_ICON = "WIM vrstva ceka na finalni graficky podklad od Radima nebo Martina.";
export const VEHICLE_TRACKING_WIM_ALERT_PILOT = "15km SMS a app alert jsou zatim evidovany jako navrh automatizace bez ostreho odesilani.";
export const VEHICLE_TRACKING_GEOFENCING_NOTICE = "Geofencing alerty jsou připravené pouze jako návrh. Ostré notifikace nejsou aktivní.";
export const VEHICLE_TRACKING_ICON_WAITING = "Ikony dodány a připraveny v mapě.";

export const VEHICLE_TRACKING_ICON_FORMATS = [
  "SVG s transparentním pozadím",
  "vektorová mřížka 24 × 24",
  "zobrazení v mapě 36-48 px",
  "méně než 1 KB na ikonu"
];

export const VEHICLE_TRACKING_ICON_REQUIREMENTS = [
  "minimalistické 2D obrysy #243128",
  "zelený akcent #75BD25",
  "bez SPZ, malých textů a pozadí",
  "jednotné oblé linky; orientace mapových ikon na sever",
  "stav vozidla řeší CSS obrys / badge"
];

export const VEHICLE_TRACKING_ICON_TYPES = [
  {
    key: "collection_truck",
    label: "Svozové vozidlo",
    slug: "svozove-vozidlo",
    primary: "/vehicles/icons/svozove-vozidlo.svg",
    webp: "/vehicles/icons/svozove-vozidlo.svg"
  },
  {
    key: "container_truck",
    label: "Kontejnerové vozidlo",
    slug: "kontejnerove-vozidlo",
    primary: "/vehicles/icons/kontejnerove-vozidlo.svg",
    webp: "/vehicles/icons/kontejnerove-vozidlo.svg"
  },
  {
    key: "van",
    label: "Dodávka",
    slug: "dodavka",
    primary: "/vehicles/icons/dodavka.svg",
    webp: "/vehicles/icons/dodavka.svg"
  },
  {
    key: "special",
    label: "Speciální technika",
    slug: "specialni-technika",
    primary: "/vehicles/icons/specialni-technika.svg",
    webp: "/vehicles/icons/specialni-technika.svg"
  },
  {
    key: "car",
    label: "Osobní vozidlo",
    slug: "osobni-vozidlo",
    primary: "/vehicles/icons/osobni-vozidlo.svg",
    webp: "/vehicles/icons/osobni-vozidlo.svg"
  },
  {
    key: "trailer",
    label: "Přívěs / návěs",
    slug: "prives-naves",
    primary: "/vehicles/icons/prives-naves.svg",
    webp: "/vehicles/icons/prives-naves.svg"
  }
];

export const VEHICLE_ICON_BY_TYPE = {
  collection_truck: "/vehicles/icons/svozove-vozidlo.svg",
  container_truck: "/vehicles/icons/kontejnerove-vozidlo.svg",
  van: "/vehicles/icons/dodavka.svg",
  special: "/vehicles/icons/specialni-technika.svg",
  car: "/vehicles/icons/osobni-vozidlo.svg",
  trailer: "/vehicles/icons/prives-naves.svg"
};

export const VEHICLE_ICON_WEBP_BY_TYPE = {
  collection_truck: "/vehicles/icons/svozove-vozidlo.svg",
  container_truck: "/vehicles/icons/kontejnerove-vozidlo.svg",
  van: "/vehicles/icons/dodavka.svg",
  special: "/vehicles/icons/specialni-technika.svg",
  car: "/vehicles/icons/osobni-vozidlo.svg",
  trailer: "/vehicles/icons/prives-naves.svg"
};

// Mapové SVG jsou kreslené směrem na sever. GPS azimut se nemění.
export const VEHICLE_TRACKING_ICON_HEADING_OFFSETS = Object.freeze({
  collection_truck: 0,
  container_truck: 0,
  van: 0,
  special: 0,
  car: 0,
  trailer: 0
});

export const VEHICLE_TRACKING_CUSTOM_ICON_BY_LICENSE_PLATE = Object.freeze({
  "8B43007": "/vehicles/icons/man-abroll.svg",
  "1BM1150": "/vehicles/icons/man-abroll.svg",
  "3BF1394": "/vehicles/icons/mercedes-abroll-v2.svg",
  "1BR6359": "/vehicles/icons/mercedes-abroll-v2.svg",
  "2BD8835": "/vehicles/icons/mercedes-abroll-v2.svg",
  "3BP5305": "/vehicles/icons/mercedes-abroll-v2.svg",
  "3BH5548": "/vehicles/icons/mercedes-ramenac-v2.svg",
  "5B80857": "/vehicles/icons/mercedes-ramenac-v2.svg",
  "3BP2836": "/vehicles/icons/mercedes-ramenac-v2.svg",
  "2BC1983": "/vehicles/icons/skoda-citigo-v2.svg",
  "2BC1984": "/vehicles/icons/skoda-citigo-v2.svg",
  "1BP8373": "/vehicles/icons/mercedes-popelarske.svg",
  "3BN3558": "/vehicles/icons/mercedes-popelarske.svg",
  "3BE2831": "/vehicles/icons/mercedes-popelarske.svg",
  "6B93840": "/vehicles/icons/man-popelarske.svg",
  "1BV6295": "/vehicles/icons/mercedes-skrin.svg",
  "2BE2247": "/vehicles/icons/mercedes-skrin.svg",
  "3BI2007": "/vehicles/icons/daf-abroll.svg",
  "2BR0904": "/vehicles/icons/man-ramenac.svg",
  "9B46276": "/vehicles/icons/fuso-v2.svg",
  "2BJ7654": "/vehicles/icons/iveco-rioned-v2.svg",
  "1BI4520": "/vehicles/icons/man-cisterna-v2.svg",
  "9C83570": "/vehicles/icons/mercedes-cisterna-milanek-v2.svg",
  "5B14417": "/vehicles/icons/man-cisterna-v2.svg",
  "5E73753": "/vehicles/icons/man-cisterna-v2.svg",
  "1BC3390": "/vehicles/icons/man-cisterna-v2.svg",
  "3BK4123": "/vehicles/icons/skoda-kamiq-v2.svg",
  "3BI9901": "/vehicles/icons/skoda-kamiq-v2.svg",
  "9B29971": "/vehicles/icons/opel-astra-v2.svg",
  "8B42064": "/vehicles/icons/opel-astra-v2.svg",
  "3BK5611": "/vehicles/icons/toyota-proace-v2.svg",
  "2BK7741": "/vehicles/icons/mercedes-vito.svg",
  "3BH3767": "/vehicles/icons/actros-vlek.svg",
  "HYUNDAIVZV": "/vehicles/icons/hyundai-vzv.svg",
  "VIN000098": "/vehicles/icons/hyundai-vzv.svg",
  "2BS6064": "/vehicles/icons/daf-naves-jenda-v2.svg"
});

const VEHICLE_TRACKING_CUSTOM_ICON_BY_TEXT = Object.freeze([
  [/\b(?:mercedes|mb)\b.*\b(?:skrin|skříň|box)\b|\bskrin(?:ovy|ový)?\b/, "/vehicles/icons/mercedes-skrin.svg"],
  [/\b(?:daf)\b.*\b(?:abroll|hooklift|nosi[cč])\b|\babroll\b.*\bdaf\b/, "/vehicles/icons/daf-abroll.svg"],
  [/\b(?:man)\b.*\b(?:ramenac|ramenáč|hak)\b|\bramenac\b/, "/vehicles/icons/man-ramenac.svg"],
  [/\bfuso\b/, "/vehicles/icons/fuso-v2.svg"],
  [/\b(?:iveco)\b.*\b(?:rioned|cisteni|čištění)\b|\brioned\b/, "/vehicles/icons/iveco-rioned-v2.svg"],
  [/\b(?:mercedes|mb)\b.*\b(?:cisterna|cistern|ibos)\b.*\b(?:milanek|milánek)\b/, "/vehicles/icons/mercedes-cisterna-milanek-v2.svg"],
  [/\b(?:mercedes|mb)\b.*\b(?:ibos|cisterna|cistern)\b|\bmercedes\s+ibos\b/, "/vehicles/icons/mercedes-cisterna-milanek-v2.svg"],
  [/\bdaf\b.*\b(?:naves|návěs|jenda|ibos|cisterna|cistern)\b/, "/vehicles/icons/daf-naves-jenda-v2.svg"],
  [/\bman\b.*\b(?:cisterna|cistern|tanker)\b/, "/vehicles/icons/man-cisterna-v2.svg"],
  [/\b(?:jcb|jcm|manitou)\b.*\b(?:mlt\s*630|630)\b/, "/vehicles/icons/manitou-mlt-630-v2.svg"],
  [/\b(?:jcb|jcm|manitou)\b.*\b(?:mt\s*625h|625h)\b/, "/vehicles/icons/manitou-mt-625h-v2.svg"],
  [/\b(?:jcb|jcm|manitou)\b.*\bmlt\b/, "/vehicles/icons/manitou-mlt-v2.svg"],
  [/\b(?:mercedes|mb)\b.*\bsprinter\b.*\bandrej\b/, "/vehicles/icons/mercedes-sprinter-andrej-v2.svg"],
  [/\b(?:mercedes|mb)\b.*\bsprinter\b.*\b(?:el|dodavka|dodávka)\b/, "/vehicles/icons/mercedes-sprinter-el-v2.svg"],
  [/\b(?:mercedes|mb)\b.*\bsprinter\b/, "/vehicles/icons/mercedes-sprinter-el-v2.svg"],
  [/\bford\b.*\b(?:transit|tranzit)\b|\b(?:transit|tranzit)\b/, "/vehicles/icons/ford-transit-v2.svg"],
  [/\b(?:mercedes|mb)\b.*\bcitan\b|\bcitan\b/, "/vehicles/icons/mercedes-citan-v2.svg"],
  [/\b(?:skoda|škoda)\b.*\b(?:kamiq|kamiq)\b|\bkamiq\b/, "/vehicles/icons/skoda-kamiq-v2.svg"],
  [/\b(?:skoda|škoda)\b.*\bkaroq\b|\bkaroq\b/, "/vehicles/icons/skoda-karoq-v2.svg"],
  [/\baudi\b.*\ba\s?1\b|\ba\s?1\b.*\baudi\b/, "/vehicles/icons/audi-a1-v2.svg"],
  [/\bopel\b.*\bgrandland\b|\bgrandland\b/, "/vehicles/icons/opel-grandland-v2.svg"],
  [/\b(?:opel)\b.*\b(?:astra)\b|\bopel\s+astra\b/, "/vehicles/icons/opel-astra-v2.svg"],
  [/\b(?:toyota)\b.*\b(?:proace)\b|\bproace\b/, "/vehicles/icons/toyota-proace-v2.svg"],
  [/\b(?:mercedes|mb)\b.*\b(?:vito)\b|\bvito\b/, "/vehicles/icons/mercedes-vito.svg"],
  [/\b(?:actros|mercedes)\b.*\b(?:vlek|naves|návěs|trailer)\b|\bactros\s+vlek\b/, "/vehicles/icons/actros-vlek.svg"],
  [/\b(?:hyundai)\b.*\b(?:vzv|forklift|vidle)\b|\b(?:vzv|forklift)\b/, "/vehicles/icons/hyundai-vzv.svg"]
]);

const builtInVehicleSvgPaths = new Set([
  ...VEHICLE_TRACKING_ICON_TYPES.map(item => item.primary),
  ...Object.values(VEHICLE_TRACKING_CUSTOM_ICON_BY_LICENSE_PLATE),
  ...VEHICLE_TRACKING_CUSTOM_ICON_BY_TEXT.map(([, source]) => source)
]);
export function vehicleTrackingSvgIconSource(source = "") {
  const candidate = String(source).replace(/\.(png|webp)$/, ".svg");
  return builtInVehicleSvgPaths.has(candidate) ? candidate : source;
}

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
    badge: "T-Cars – poloha z GPS jednotky ve vozidle",
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
  "GET /api/vehicle-tracking/maps-config",
  "GET /api/vehicle-tracking/wim-sites",
  "GET /api/vehicle-tracking/wim-alerts",
  "POST /api/vehicle-tracking/tcars/sync",
  "GET /api/vehicle-tracking/tcars/vehicles",
  "GET /api/vehicle-tracking/tcars/pairing-audit",
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

export function normalizeVehicleTrackingLicensePlate(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function vehicleTrackingVisualHeading(heading, speedKmh, visualOffset = 0) {
  const speed = Number(speedKmh);
  const rawHeading = Number(heading);
  const offset = Number(visualOffset);

  if (!Number.isFinite(speed) || speed <= 2 || !Number.isFinite(rawHeading)) {
    return 0;
  }

  return ((rawHeading + (Number.isFinite(offset) ? offset : 0)) % 360 + 360) % 360;
}

export function vehicleTrackingHeadingOffsetForVehicle(vehicle = {}) {
  const nestedVehicle = vehicle.vehicle || {};
  const relatedVehicle = vehicle.fleetVehicle || vehicle.pairedVehicle || {};
  const iconType = vehicleTrackingIconTypeKey(
    vehicle.iconType
      || vehicle.vehicleType
      || vehicle.type
      || vehicle.bodyType
      || nestedVehicle.iconType
      || nestedVehicle.vehicleType
      || nestedVehicle.type
      || nestedVehicle.bodyType
      || relatedVehicle.iconType
      || relatedVehicle.vehicleType
      || relatedVehicle.type
      || relatedVehicle.bodyType
      || ""
  );

  return VEHICLE_TRACKING_ICON_HEADING_OFFSETS[iconType] || 0;
}

export function vehicleTrackingCustomIconForVehicle(vehicle = {}) {
  const nestedVehicle = vehicle.vehicle || {};
  const relatedVehicle = vehicle.fleetVehicle || vehicle.pairedVehicle || {};
  const licensePlates = [
    vehicle.licensePlate,
    vehicle.registrationNumber,
    vehicle.spz,
    nestedVehicle.licensePlate,
    nestedVehicle.registrationNumber,
    nestedVehicle.spz
  ];

  for (const licensePlate of licensePlates) {
    const normalized = normalizeVehicleTrackingLicensePlate(licensePlate);
    const icon = VEHICLE_TRACKING_CUSTOM_ICON_BY_LICENSE_PLATE[normalized];
    if (icon) {
      return icon;
    }
  }

  const vehicleText = [
    vehicle.name,
    vehicle.description,
    vehicle.model,
    vehicle.vehicleName,
    vehicle.internalNumber,
    vehicle.type,
    vehicle.vehicleType,
    vehicle.bodyType,
    nestedVehicle.name,
    nestedVehicle.description,
    nestedVehicle.model,
    nestedVehicle.vehicleName,
    nestedVehicle.type,
    nestedVehicle.vehicleType,
    nestedVehicle.bodyType,
    relatedVehicle.name,
    relatedVehicle.description,
    relatedVehicle.model,
    relatedVehicle.vehicleName,
    relatedVehicle.type,
    relatedVehicle.vehicleType,
    relatedVehicle.bodyType
  ].filter(Boolean).join(" ").toLowerCase();

  for (const [pattern, icon] of VEHICLE_TRACKING_CUSTOM_ICON_BY_TEXT) {
    if (pattern.test(vehicleText)) {
      return icon;
    }
  }

  return "";
}
