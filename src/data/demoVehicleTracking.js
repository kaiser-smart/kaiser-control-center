export const DEMO_VEHICLE_TRACKING_NOTICE = "DEMO REŽIM – ukázkový pohyb vozidel, nejde o reálná GPS data.";

export const DEMO_VEHICLE_TRACKING_API_NOTICE = "Reálné GPS API zatím není připojené.";

export const DEMO_VEHICLE_TRACKING_API_DETAIL = "Demo režim ukazuje budoucí chování modulu. Reálné polohy budou později chodit z Android tabletů ve vozidlech přes cloud API.";

export const DEMO_VEHICLE_TRACKING_BOUNDS = {
  minLat: 49.145,
  maxLat: 49.245,
  minLng: 16.535,
  maxLng: 16.705
};

export const DEMO_VEHICLE_TRACKING_STATUS_FILTERS = [
  { value: "all", label: "Vše" },
  { value: "moving", label: "Jede" },
  { value: "stopped", label: "Stojí" },
  { value: "service", label: "V servisu" },
  { value: "no_signal", label: "Bez signálu" },
  { value: "offline", label: "Offline" }
];

export const DEMO_VEHICLE_TRACKING_STATUS_META = {
  moving: { label: "Jede", tone: "moving" },
  stopped: { label: "Stojí", tone: "stopped" },
  service: { label: "V servisu", tone: "service" },
  no_signal: { label: "Bez signálu", tone: "no-signal" },
  offline: { label: "Offline", tone: "offline" }
};

export const DEMO_VEHICLE_TRACKING_PLACES = [
  { label: "Brno-střed", lat: 49.1951, lng: 16.6068 },
  { label: "Černovice", lat: 49.1881, lng: 16.6405 },
  { label: "Slatina", lat: 49.1749, lng: 16.6819 },
  { label: "Líšeň", lat: 49.2066, lng: 16.6946 },
  { label: "Komárov", lat: 49.1778, lng: 16.6174 },
  { label: "Modřice", lat: 49.1298, lng: 16.6149 },
  { label: "Heršpice", lat: 49.1632, lng: 16.6023 },
  { label: "Královo Pole", lat: 49.2244, lng: 16.5967 }
];

export const DEMO_VEHICLE_TRACKING_VEHICLES = [
  {
    id: "ks-101",
    shortLabel: "KS101",
    internalNumber: "KS 101",
    licensePlate: "1BK 2345",
    type: "Svozové vozidlo",
    driver: "Jarmila Olšaníková",
    status: "moving",
    speedKmh: 32,
    speedWave: 4,
    animationSeconds: 34,
    lastUpdate: "teď",
    accuracy: "Demo",
    source: "Android tablet – demo",
    routeName: "Brno-střed / Černovice / Slatina",
    route: [
      { lat: 49.1951, lng: 16.6068 },
      { lat: 49.1905, lng: 16.6201 },
      { lat: 49.1778, lng: 16.6402 },
      { lat: 49.1749, lng: 16.6819 }
    ]
  },
  {
    id: "ks-204",
    shortLabel: "KS204",
    internalNumber: "KS 204",
    licensePlate: "2BK 8912",
    type: "Kontejnerové vozidlo",
    driver: "Radim Opluštil",
    status: "stopped",
    speedKmh: 0,
    speedWave: 0,
    animationSeconds: 44,
    lastUpdate: "před 4 min",
    accuracy: "Demo",
    source: "Android tablet – demo",
    routeName: "Komárov / Heršpice",
    route: [
      { lat: 49.1778, lng: 16.6174 },
      { lat: 49.1693, lng: 16.6102 },
      { lat: 49.1632, lng: 16.6023 }
    ]
  },
  {
    id: "ks-318",
    shortLabel: "KS318",
    internalNumber: "KS 318",
    licensePlate: "3BK 4455",
    type: "Dodávka",
    driver: "Marek",
    status: "moving",
    speedKmh: 46,
    speedWave: 6,
    animationSeconds: 28,
    lastUpdate: "teď",
    accuracy: "Demo",
    source: "Android tablet – demo",
    routeName: "Královo Pole / Brno-střed",
    route: [
      { lat: 49.2244, lng: 16.5967 },
      { lat: 49.2132, lng: 16.6018 },
      { lat: 49.2037, lng: 16.6072 },
      { lat: 49.1951, lng: 16.6068 }
    ]
  },
  {
    id: "ks-407",
    shortLabel: "KS407",
    internalNumber: "KS 407",
    licensePlate: "4BK 7788",
    type: "Speciální technika",
    driver: "Šarlota",
    status: "service",
    speedKmh: 0,
    speedWave: 0,
    animationSeconds: 40,
    lastUpdate: "před 18 min",
    accuracy: "Demo",
    source: "Android tablet – demo",
    routeName: "Servisní areál / Slatina",
    route: [
      { lat: 49.1815, lng: 16.6638 },
      { lat: 49.1749, lng: 16.6819 }
    ]
  },
  {
    id: "ks-512",
    shortLabel: "KS512",
    internalNumber: "KS 512",
    licensePlate: "5BK 1122",
    type: "Kontejnerové vozidlo",
    driver: "Dispečink",
    status: "no_signal",
    speedKmh: 0,
    speedWave: 0,
    animationSeconds: 46,
    lastUpdate: "před 47 min",
    accuracy: "Demo",
    source: "Android tablet – demo",
    routeName: "Modřice / Heršpice",
    route: [
      { lat: 49.1298, lng: 16.6149 },
      { lat: 49.1455, lng: 16.6078 },
      { lat: 49.1632, lng: 16.6023 }
    ]
  },
  {
    id: "ks-606",
    shortLabel: "KS606",
    internalNumber: "KS 606",
    licensePlate: "6BK 9090",
    type: "Svozové vozidlo",
    driver: "Petr",
    status: "moving",
    speedKmh: 28,
    speedWave: 5,
    animationSeconds: 37,
    lastUpdate: "teď",
    accuracy: "Demo",
    source: "Android tablet – demo",
    routeName: "Líšeň / Černovice / Komárov",
    route: [
      { lat: 49.2066, lng: 16.6946 },
      { lat: 49.1976, lng: 16.6721 },
      { lat: 49.1881, lng: 16.6405 },
      { lat: 49.1778, lng: 16.6174 }
    ]
  },
  {
    id: "ks-707",
    shortLabel: "KS707",
    internalNumber: "KS 707",
    licensePlate: "7BK 7070",
    type: "Servisní dodávka",
    driver: "Dispečink",
    status: "offline",
    speedKmh: 0,
    speedWave: 0,
    animationSeconds: 52,
    lastUpdate: "před 2 h",
    accuracy: "Demo",
    source: "Android tablet – demo",
    routeName: "Královo Pole / servisní dvůr",
    route: [
      { lat: 49.2244, lng: 16.5967 },
      { lat: 49.2131, lng: 16.5868 }
    ]
  }
];
