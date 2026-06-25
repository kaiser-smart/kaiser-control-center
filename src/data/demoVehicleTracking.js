export const DEMO_VEHICLE_TRACKING_NOTICE = "DEMO REŽIM – ukázkový pohyb vozidel, nejde o reálná GPS data.";

export const DEMO_VEHICLE_TRACKING_API_NOTICE = "Reálné GPS API zatím není připojené.";

export const DEMO_VEHICLE_TRACKING_API_DETAIL = "Demo ukazuje budoucí chování modulu. Reálné polohy budou později chodit z Android tabletů ve vozidlech přes cloud API.";

export const DEMO_VEHICLE_TRACKING_GOOGLE_MAPS_WAITING = "Čeká na Google Maps API key.";

export const DEMO_VEHICLE_TRACKING_LOOP_MS = 50000;

export const DEMO_VEHICLE_TRACKING_DEVIATION_START_MS = 25000;

export const DEMO_VEHICLE_TRACKING_ALERT_START_MS = 35000;

export const DEMO_VEHICLE_TRACKING_ALERT_END_MS = 50000;

export const DEMO_VEHICLE_TRACKING_ALERT = {
  vehicleId: "ks-204",
  title: "ALERT",
  text: "Vozidlo se vychýlilo z plánované trasy",
  detail: "KS 204 | 2BK 8912 | odchylka 420 m",
  distanceMeters: 420
};

export const BRNO_POINTS = {
  centrum: { lat: 49.1951, lng: 16.6068 },
  cernovice: { lat: 49.1836, lng: 16.6357 },
  slatina: { lat: 49.1778, lng: 16.6821 },
  komarov: { lat: 49.1810, lng: 16.6150 },
  modrice: { lat: 49.1295, lng: 16.6140 },
  kralovoPole: { lat: 49.2269, lng: 16.5967 },
  lisen: { lat: 49.2108, lng: 16.6865 },
  odbockaMimoTrasu: { lat: 49.1510, lng: 16.6450 }
};

export const DEMO_VEHICLE_TRACKING_MAP_CENTER = { lat: 49.1785, lng: 16.6320 };

export const DEMO_VEHICLE_TRACKING_BOUNDS = {
  minLat: 49.120,
  maxLat: 49.235,
  minLng: 16.580,
  maxLng: 16.695
};

export const DEMO_VEHICLE_TRACKING_PHASES = [
  {
    fromMs: 0,
    toMs: 10000,
    label: "Normální provoz",
    description: "Tři vozidla jedou po plánovaných trasách, jedno vozidlo stojí."
  },
  {
    fromMs: 10000,
    toMs: 25000,
    label: "Plánované trasy",
    description: "Na mapě jsou zeleně vyznačené trasy a vozidla se plynule pohybují."
  },
  {
    fromMs: 25000,
    toMs: 35000,
    label: "Odchylka z trasy",
    description: "KS 204 opouští plánovanou trasu, skutečná trasa se kreslí oranžově."
  },
  {
    fromMs: 35000,
    toMs: 50000,
    label: "ALERT",
    description: "Dispečink vidí výrazné upozornění na vychýlení vozidla."
  }
];

export const DEMO_VEHICLE_TRACKING_STATUS_FILTERS = [
  { value: "all", label: "Vše" },
  { value: "moving", label: "Jede" },
  { value: "stopped", label: "Stojí" },
  { value: "off_route", label: "Mimo trasu" }
];

export const DEMO_VEHICLE_TRACKING_STATUS_META = {
  moving: { label: "Jede", tone: "moving" },
  stopped: { label: "Stojí", tone: "stopped" },
  off_route: { label: "Mimo trasu", tone: "off-route" },
  no_signal: { label: "Bez signálu", tone: "no-signal" },
  offline: { label: "Offline", tone: "offline" }
};

export const DEMO_VEHICLE_TRACKING_PLACES = [
  { label: "Brno-střed", ...BRNO_POINTS.centrum },
  { label: "Černovice", ...BRNO_POINTS.cernovice },
  { label: "Slatina", ...BRNO_POINTS.slatina },
  { label: "Komárov", ...BRNO_POINTS.komarov },
  { label: "Modřice", ...BRNO_POINTS.modrice },
  { label: "Líšeň", ...BRNO_POINTS.lisen },
  { label: "Královo Pole", ...BRNO_POINTS.kralovoPole },
  { label: "Odbočka mimo trasu", ...BRNO_POINTS.odbockaMimoTrasu }
];

export const DEMO_VEHICLE_TRACKING_VEHICLES = [
  {
    id: "ks-101",
    shortLabel: "KS101",
    internalNumber: "KS 101",
    licensePlate: "1BK 2345",
    type: "Svozové vozidlo",
    driver: "Jarmila Olšaníková",
    baseStatus: "moving",
    speedKmh: 31,
    speedWave: 4,
    lastUpdate: "teď",
    accuracy: "Demo",
    source: "Android tablet – demo",
    routeName: "Brno-střed → Černovice → Slatina",
    plannedRoute: [BRNO_POINTS.centrum, BRNO_POINTS.cernovice, BRNO_POINTS.slatina],
    actualRoute: [BRNO_POINTS.centrum, BRNO_POINTS.cernovice, BRNO_POINTS.slatina],
    progressOffset: 0,
    progressScale: 1.05
  },
  {
    id: "ks-204",
    shortLabel: "KS204",
    internalNumber: "KS 204",
    licensePlate: "2BK 8912",
    type: "Kontejnerové vozidlo",
    driver: "Radim Opluštil",
    baseStatus: "moving",
    speedKmh: 34,
    speedWave: 5,
    lastUpdate: "teď",
    accuracy: "Demo",
    source: "Android tablet – demo",
    routeName: "Komárov → Modřice",
    plannedRoute: [BRNO_POINTS.komarov, BRNO_POINTS.modrice],
    actualRoute: [BRNO_POINTS.komarov, BRNO_POINTS.modrice],
    deviationRoute: [BRNO_POINTS.komarov, { lat: 49.1605, lng: 16.6160 }, BRNO_POINTS.odbockaMimoTrasu],
    deviationMeters: 420,
    progressOffset: 0.08,
    progressScale: 0.9
  },
  {
    id: "ks-318",
    shortLabel: "KS318",
    internalNumber: "KS 318",
    licensePlate: "3BK 4455",
    type: "Dodávka",
    driver: "Marek",
    baseStatus: "moving",
    speedKmh: 43,
    speedWave: 6,
    lastUpdate: "teď",
    accuracy: "Demo",
    source: "Android tablet – demo",
    routeName: "Královo Pole → Brno-střed",
    plannedRoute: [BRNO_POINTS.kralovoPole, { lat: 49.2118, lng: 16.6012 }, BRNO_POINTS.centrum],
    actualRoute: [BRNO_POINTS.kralovoPole, { lat: 49.2118, lng: 16.6012 }, BRNO_POINTS.centrum],
    progressOffset: 0.28,
    progressScale: 0.95
  },
  {
    id: "ks-407",
    shortLabel: "KS407",
    internalNumber: "KS 407",
    licensePlate: "4BK 7788",
    type: "Speciální technika",
    driver: "Šarlota",
    baseStatus: "stopped",
    speedKmh: 0,
    speedWave: 0,
    lastUpdate: "před 6 min",
    accuracy: "Demo",
    source: "Android tablet – demo",
    routeName: "Líšeň",
    plannedRoute: [BRNO_POINTS.lisen],
    actualRoute: [BRNO_POINTS.lisen],
    progressOffset: 0,
    progressScale: 0
  }
];
