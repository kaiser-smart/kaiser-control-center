export const AI_ROUTE_ALIASES = {
  "/rychle-zadani": "/dovolena-nemoc/rychle-zadani"
};

export const AI_ALLOWED_ROUTES = [
  "/",
  "/dashboard",
  "/rychle-zadani",
  "/dovolena-nemoc/rychle-zadani",
  "/dovolena-nemoc",
  "/dovolena-nemoc/moje-zadosti",
  "/dovolena-nemoc/ke-schvaleni",
  "/dovolena-nemoc/kalendar",
  "/dovolena-nemoc/zamestnanci",
  "/pneumatiky",
  "/hlaseni-ridicu",
  "/vozovy-park",
  "/sledovani-vozidel",
  "/datove-schranky-plus",
  "/servis-udrzba",
  "/trasy-svozu",
  "/trasy-svozu/test",
  "/trasy-vzorku",
  "/vistos",
  "/naklady",
  "/reporty",
  "/uzivatele",
  "/nastaveni",
  "/pripominky"
];

const AI_ALLOWED_ROUTE_PREFIXES = [
  "/dovolena-nemoc/zamestnanci/",
  "/sledovani-vozidel/"
];

export const AI_MODULE_ROUTE_MAP = {
  dashboard: "/dashboard",
  "rychle-zadani": "/dovolena-nemoc/rychle-zadani",
  absence: "/dovolena-nemoc",
  "dovolena-nemoc": "/dovolena-nemoc",
  "moje-zadosti": "/dovolena-nemoc/moje-zadosti",
  "ke-schvaleni": "/dovolena-nemoc/ke-schvaleni",
  kalendar: "/dovolena-nemoc/kalendar",
  zamestnanci: "/dovolena-nemoc/zamestnanci",
  tyres: "/pneumatiky",
  pneumatiky: "/pneumatiky",
  "driver-reports": "/hlaseni-ridicu",
  "hlaseni-ridicu": "/hlaseni-ridicu",
  fleet: "/vozovy-park",
  "vozovy-park": "/vozovy-park",
  "vehicle-tracking": "/sledovani-vozidel",
  "sledovani-vozidel": "/sledovani-vozidel",
  "data-box": "/datove-schranky-plus",
  "datova-schranka": "/datove-schranky-plus",
  "service-maintenance": "/servis-udrzba",
  "servis-udrzba": "/servis-udrzba",
  "collection-routes": "/trasy-svozu",
  "trasy-svozu": "/trasy-svozu",
  "sampling-routes": "/trasy-vzorku",
  "trasy-vzorku": "/trasy-vzorku",
  vistos: "/vistos",
  costs: "/naklady",
  naklady: "/naklady",
  reports: "/reporty",
  reporty: "/reporty",
  users: "/uzivatele",
  uzivatele: "/uzivatele",
  settings: "/nastaveni",
  nastaveni: "/nastaveni",
  feedback: "/pripominky",
  pripominky: "/pripominky"
};

const ABSENCE_TOOL_TYPE_ALIASES = {
  dovolena: "vacation",
  dovolenou: "vacation",
  vacation: "vacation",
  nemoc: "sick",
  sick: "sick",
  lekar: "doctor",
  lekare: "doctor",
  doctor: "doctor",
  ocr: "care",
  care: "care",
  nahradni_volno: "compensatory_leave",
  compensatory_leave: "compensatory_leave",
  neplacene_volno: "unpaid_leave",
  unpaid_leave: "unpaid_leave",
  jina_nepritomnost: "other",
  jina_absence: "other",
  other: "other"
};

const ABSENCE_TOOL_TYPE_LABELS = {
  vacation: "dovolenou",
  sick: "nemoc",
  doctor: "lékaře",
  care: "OČR",
  compensatory_leave: "náhradní volno",
  unpaid_leave: "neplacené volno",
  other: "jinou nepřítomnost"
};

const DRIVER_REPORT_CONTEXT_LOADING_MESSAGE = "Rozumím. Podívám se do Smart systému.";
const DRIVER_REPORT_PICKER_MESSAGE = "Otevřu ti výběr v aplikaci.";
const DRIVER_REPORT_PICKER_OR_SPZ_MESSAGE = "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.";
const DRIVER_REPORT_PICKER_FAILED_MESSAGE = "Výběr se mi nepodařilo otevřít. Řekni mi prosím značku, typ nebo SPZ vozidla.";
const DRIVER_REPORT_VEHICLE_SELECTED_MESSAGE = "Vozidlo je vybrané v aplikaci.";
const DRIVER_REPORT_UNVERIFIED_VEHICLE_MESSAGE = "Nevidím bezpečně přiřazené vozidlo. Nadiktuj mi prosím SPZ.";
const DRIVER_REPORT_NO_VERIFIED_VEHICLES_REASON = "NO_VERIFIED_ASSIGNED_VEHICLES";
const DRIVER_REPORT_VEHICLE_PICKER_SELECTION_TTL_MS = 5 * 60 * 1000;
const COLLECTION_ROUTE_GPS_TOOL_NAME = "prepare_collection_route_gps_capture";
const COLLECTION_ROUTE_TEST_INCIDENT_TOOL_NAME = "prepare_collection_route_test_incident";
const COLLECTION_ROUTE_DRIVER_ACTION_TOOL_NAME = "prepare_collection_route_driver_action";
const COLLECTION_ROUTE_GPS_ROUTE = "/trasy-svozu";
const COLLECTION_ROUTE_DRIVER_TEST_ROUTE = "/trasy-svozu/test";
const COLLECTION_ROUTE_GPS_WRONG_TOOL_MESSAGE = "Pro GPS stanoviště není potřeba vybírat vozidlo. Připravím GPS měření přímo ve Svozových trasách.";

export const ELEVENLABS_CLIENT_TOOL_SCHEMAS = [
  {
    name: "navigate_to",
    description: "Přejde na povolenou route v aplikaci Smart odpady.",
    parameters: [{ name: "route", type: "string", required: true }]
  },
  {
    name: "open_module",
    description: "Otevře známý modul aplikace podle moduleId.",
    parameters: [{ name: "moduleId", type: "string", required: true }]
  },
  {
    name: "show_confirmation",
    description: "Zobrazí potvrzení před citlivou akcí.",
    parameters: [
      { name: "title", type: "string", required: true },
      { name: "message", type: "string", required: true },
      { name: "confirmLabel", type: "string", required: false },
      { name: "cancelLabel", type: "string", required: false }
    ]
  },
  {
    name: "show_toast",
    description: "Zobrazí krátkou stavovou zprávu v UI.",
    parameters: [
      { name: "type", type: "string", required: true },
      { name: "message", type: "string", required: true }
    ]
  },
  {
    name: "get_collection_routes_context",
    description: "Read-only načte z KSO vlastní dnešní trasu přihlášeného řidiče, ověřená přiřazená vozidla, počasí, omezený služební adresář, dostupnost, nadřízené a bezpečnou pracovní paměť. Nic nezapisuje, neposílá ani nemění. Pro zprávy vrací pravdivý stav nenastaveno, dokud není připojený oficiální zdroj.",
    parameters: [
      { name: "date", type: "string", required: false },
      { name: "scope", type: "string", required: false }
    ]
  },
  {
    name: COLLECTION_ROUTE_GPS_TOOL_NAME,
    description: "Ve Svozových trasách připraví fyzické GPS měření aktuálního TEST stanoviště. Použij ho pro povel potvrdit, změřit nebo zmapovat GPS stanoviště. Nikdy kvůli tomu neotvírej výběr vozidla. Nástroj nic neukládá; finální uložení vždy vyžaduje fyzické klepnutí člověka v KSO.",
    parameters: [
      { name: "transcriptIntent", type: "string", required: false },
      { name: "currentModuleRoute", type: "string", required: false }
    ]
  },
  {
    name: COLLECTION_ROUTE_TEST_INCIDENT_TOOL_NAME,
    description: "Ve Svozových trasách otevře bezpečný krokový formulář hlášení pro dispečink. Nástroj nic neukládá ani neodesílá. Fotografie a velké fyzické klepnutí člověka v KSO jsou vždy povinné.",
    parameters: [
      { name: "incidentType", type: "string", required: true, description: "Použij overfilled_container, damaged_container, site_inaccessible, container_missing, contaminated_waste, site_closed nebo other." },
      { name: "transcriptIntent", type: "string", required: false },
      { name: "currentModuleRoute", type: "string", required: false }
    ]
  },
  {
    name: COLLECTION_ROUTE_DRIVER_ACTION_TOOL_NAME,
    description: "Na řidičském tabletu Svozových tras pouze otevře bezpečný krok pro HOTOVO, přestávku, výsyp, celou trasu nebo navigaci. Nástroj nikdy sám nezapisuje stav a nikdy nespouští externí komunikaci. Každý zápis nebo otevření navigace vyžaduje fyzické klepnutí řidiče.",
    parameters: [
      { name: "action", type: "string", required: true, description: "Použij done, break, dump, route nebo navigation." },
      { name: "transcriptIntent", type: "string", required: false },
      { name: "currentModuleRoute", type: "string", required: false }
    ]
  },
  {
    name: "highlight_element",
    description: "Dočasně zvýrazní prvek v aktuální obrazovce. Nepoužívej pro výběr vozidla v Hlášení řidičů.",
    parameters: [
      { name: "selector", type: "string", required: true },
      { name: "message", type: "string", required: false }
    ]
  },
  {
    name: "show_driver_vehicle_picker",
    description: "Otevře bezpečný výběr vozidla v aplikaci pro Hlášení řidičů. Nepoužívej jako první krok pro dotaz na vozidla; nejdřív vždy zavolej get_driver_report_context. Picker je fallback nebo UI pomoc po backend kontrole.",
    parameters: [
      { name: "sessionId", type: "string", required: false },
      { name: "conversationId", type: "string", required: false },
      { name: "transcriptIntent", type: "string", required: false },
      { name: "currentModule", type: "string", required: false }
    ]
  },
  {
    name: "get_driver_vehicle_picker_selection",
    description: "Read-only ověří, jestli uživatel v bezpečném UI pickeru vybral vozidlo. Vrací pouze vehicleId; nikdy nevrací seznam ani názvy vozidel.",
    parameters: [
      { name: "sessionId", type: "string", required: false },
      { name: "conversationId", type: "string", required: false }
    ]
  },
  {
    name: "search_employee",
    description: "Vyhledá zaměstnance podle jména nebo části jména přes bezpečné cloud API.",
    parameters: [
      { name: "query", type: "string", required: true },
      { name: "limit", type: "number", required: false }
    ]
  },
  {
    name: "get_employee_detail",
    description: "Načte bezpečný souhrn zaměstnance podle ID, případně dohledá jednoznačné jméno.",
    parameters: [
      { name: "employeeId", type: "string", required: false },
      { name: "query", type: "string", required: false }
    ]
  },
  {
    name: "open_employee_card",
    description: "Otevře kartu zaměstnance v aplikaci bez hard reloadu.",
    parameters: [
      { name: "employeeId", type: "string", required: false },
      { name: "query", type: "string", required: false }
    ]
  },
  {
    name: "get_employee_manager",
    description: "Zjistí nadřízeného zaměstnance přes bezpečný souhrn karty.",
    parameters: [
      { name: "employeeId", type: "string", required: false },
      { name: "query", type: "string", required: false }
    ]
  },
  {
    name: "get_employee_absence_summary",
    description: "Vrátí stručný souhrn dovolené a nepřítomností zaměstnance.",
    parameters: [
      { name: "employeeId", type: "string", required: false },
      { name: "query", type: "string", required: false }
    ]
  },
  {
    name: "create_absence_request",
    description: "Zapíše potvrzenou nepřítomnost přes KSO backend. Backend ověřuje oprávnění a bez potvrzení nic nezapíše.",
    parameters: [
      { name: "type", type: "string", required: true },
      { name: "employeeId", type: "string", required: false },
      { name: "employeeName", type: "string", required: false },
      { name: "dateFrom", type: "string", required: true },
      { name: "dateTo", type: "string", required: false },
      { name: "dayPart", type: "string", required: false },
      { name: "startTime", type: "string", required: false },
      { name: "endTime", type: "string", required: false },
      { name: "confirmed", type: "boolean", required: true },
      { name: "note", type: "string", required: false },
      { name: "spokenSummary", type: "string", required: false }
    ]
  },
  {
    name: "create_driver_part_request",
    description: "Zapíše servisní hlášení řidiče přes KSO backend. Hlášení se vytvoří hned po jedné otázce na poznámku; dohledání dílů, cen a případná zpráva Patrikovi běží až potom na pozadí. Vyžaduje vehicleId z ověřeného seznamu, get_driver_vehicle_picker_selection nebo ručně ověřenou SPZ. Po vyřízení poznámky volej s confirmed true, confirmationSource voice-intake, driverNoteStatus provided/declined a driverNoteQuestionAsked true. Za vytvořené hlášení považuj jen výsledek s ok true a neprázdným driverPartRequest.reportId; jinak nikdy neříkej, že hlášení vzniklo.",
    parameters: [
      { name: "defectDescription", type: "string", required: true },
      { name: "driverNote", type: "string", required: false },
      { name: "licensePlate", type: "string", required: false },
      { name: "spzManual", type: "string", required: false },
      { name: "spzValidated", type: "boolean", required: false },
      { name: "vehicleId", type: "string", required: false },
      { name: "vehicleName", type: "string", required: false },
      { name: "vin", type: "string", required: false },
      { name: "vehicleBrand", type: "string", required: false },
      { name: "confirmed", type: "boolean", required: true },
      { name: "confirmationSource", type: "string", required: false },
      { name: "driverNoteStatus", type: "string", required: false },
      { name: "driverNoteQuestionAsked", type: "boolean", required: false },
      { name: "spokenSummary", type: "string", required: false }
    ]
  },
  {
    name: "get_driver_report_context",
    description: "Read-only ověří kontext Hlášení řidičů: přihlášeného řidiče, oprávnění a bezpečně ověřená přiřazená vozidla. Pro dotaz na vozidla volej vždy jako první. V hlasu čti jen assistantMessage/answerText z výsledku; nikdy si nedoplňuj vozidlo ani SPZ. Nic nezapisuje.",
    parameters: [
      { name: "sessionId", type: "string", required: false },
      { name: "conversationId", type: "string", required: false },
      { name: "transcriptIntent", type: "string", required: false },
      { name: "currentModule", type: "string", required: false },
      { name: "forceReload", type: "boolean", required: false }
    ]
  },
  {
    name: "validate_driver_vehicle_spz",
    description: "Read-only ověří ručně nadiktovanou SPZ pro Hlášení řidičů proti Vozovému parku a aktuálnímu kontextu řidiče. Nic nezapisuje.",
    parameters: [
      { name: "spz", type: "string", required: true },
      { name: "sessionId", type: "string", required: false },
      { name: "conversationId", type: "string", required: false }
    ]
  },
  {
    name: "search_user",
    description: "Vyhledá uživatele podle jména nebo role, pouze pokud má přihlášený uživatel oprávnění.",
    parameters: [
      { name: "query", type: "string", required: true },
      { name: "limit", type: "number", required: false }
    ]
  },
  {
    name: "get_user_access_summary",
    description: "Načte read-only souhrn role a oprávnění uživatele přes cloud API.",
    parameters: [
      { name: "userId", type: "string", required: false },
      { name: "query", type: "string", required: false }
    ]
  }
];

const ALLOWED_ROUTE_SET = new Set(AI_ALLOWED_ROUTES.map((route) => AI_ROUTE_ALIASES[route] || route));
const TOAST_TYPES = new Set(["success", "error", "info", "warning"]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeAiRoute(route) {
  const cleaned = cleanString(route);

  if (!cleaned || cleaned.startsWith("//") || /^https?:\/\//i.test(cleaned)) {
    return "";
  }

  const path = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  const withoutQuery = path.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  return AI_ROUTE_ALIASES[withoutQuery] || withoutQuery;
}

export function isAllowedAiRoute(route) {
  const normalizedRoute = normalizeAiRoute(route);
  return Boolean(
    normalizedRoute &&
    (
      ALLOWED_ROUTE_SET.has(normalizedRoute) ||
      AI_ALLOWED_ROUTE_PREFIXES.some((prefix) => normalizedRoute.startsWith(prefix))
    )
  );
}

export function routeForAiModule(moduleId) {
  return AI_MODULE_ROUTE_MAP[normalizeKey(moduleId)] || "";
}

export function createElevenLabsClientTools({
  navigate = () => {},
  canUseRoute = () => true,
  confirm = async () => false,
  toast = () => {},
  highlight = () => {},
  requestJson = null,
  prepareCollectionRouteGpsCapture = null,
  prepareCollectionRouteTestIncident = null,
  prepareCollectionRouteDriverAction = null
} = {}) {
  function guardedRoute(route) {
    const normalizedRoute = normalizeAiRoute(route);

    if (!normalizedRoute || !isAllowedAiRoute(normalizedRoute)) {
      return { ok: false, error: "Route není povolená.", route: normalizedRoute };
    }

    if (!canUseRoute(normalizedRoute)) {
      return { ok: false, error: "Nemáš oprávnění k této části aplikace.", route: normalizedRoute };
    }

    return { ok: true, route: normalizedRoute };
  }

  async function defaultRequestJson(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      headers: {
        ...(options.headers || {})
      },
      ...options
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(payload.error || payload.message || "Požadavek se nepodařilo dokončit.");
      error.payload = payload;
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  const safeRequestJson = requestJson || defaultRequestJson;
  const driverReportContextCache = new Map();
  const driverReportVehiclePickerCache = new Map();
  const driverReportVehiclePickerOpenCache = new Map();
  const driverReportVehiclePickerSelectionCache = new Map();
  let driverReportVehiclePickerLatestSelection = null;

  function withQuery(path, params = {}) {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      const cleaned = cleanString(value);
      if (cleaned) {
        query.set(key, cleaned);
      }
    });

    const suffix = query.toString();
    return suffix ? `${path}?${suffix}` : path;
  }

  function identityParameters(parameters = {}, idKey = "employeeId") {
    return {
      id: cleanString(parameters[idKey] || parameters.id),
      query: cleanString(parameters.query || parameters.name || parameters.fullName || parameters.q)
    };
  }

  async function readJson(path, params = {}) {
    return safeRequestJson(withQuery(path, params), { method: "GET" });
  }

  async function postJson(path, payload = {}) {
    return safeRequestJson(path, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  }

  function booleanToolValue(value) {
    if (value === true || value === false) {
      return value;
    }

    const normalized = normalizeKey(value);
    if (["true", "ano", "jo", "yes", "confirmed", "potvrzeno", "souhlasim"].includes(normalized)) {
      return true;
    }

    if (["false", "ne", "no", "cancelled", "zruseno", "storno"].includes(normalized)) {
      return false;
    }

    return false;
  }

  function driverReportSessionKey(parameters = {}) {
    return cleanString(
      parameters.sessionId ||
      parameters.session_id ||
      parameters.conversationId ||
      parameters.conversation_id ||
      "active"
    ) || "active";
  }

  function licensePlateCompareKey(value) {
    return cleanString(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function truncateForAssistant(value, max = 160) {
    const text = cleanString(value).replace(/\s+/g, " ");
    return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trim()}…` : text;
  }

  function driverReportContextSource(result = {}) {
    return result && typeof result === "object" && !Array.isArray(result)
      ? result
      : { message: cleanString(result) };
  }

  function driverReportContextAnswer(result = {}) {
    const source = driverReportContextSource(result);
    const vehicles = safeDriverReportVehicles(source);

    if (source.vehiclesVerified === true && vehicles.length) {
      return cleanString(source.assistantMessage || source.messageForAssistant) ||
        verifiedVehicleListAnswer(vehicles);
    }

    return DRIVER_REPORT_UNVERIFIED_VEHICLE_MESSAGE;
  }

  function isSafeDriverReportVehicle(vehicle = {}) {
    return Boolean(
      cleanString(vehicle.vehicleId || vehicle.id) &&
      cleanString(vehicle.displayName) &&
      cleanString(vehicle.spz || vehicle.licensePlate) &&
      vehicle.assignedToCurrentDriver === true &&
      vehicle.existsInFleet === true &&
      vehicle.active === true &&
      cleanString(vehicle.source) === "fleet_db"
    );
  }

  function normalizeSafeDriverReportVehicle(vehicle = {}) {
    const vehicleId = cleanString(vehicle.vehicleId || vehicle.id);
    const spz = cleanString(vehicle.spz || vehicle.licensePlate);

    return {
      vehicleId,
      id: vehicleId,
      displayName: cleanString(vehicle.displayName),
      spz,
      licensePlate: spz,
      assignedToCurrentDriver: true,
      existsInFleet: true,
      active: true,
      source: "fleet_db"
    };
  }

  function safeDriverReportVehicles(result = {}) {
    const vehicles = Array.isArray(result.vehicles) ? result.vehicles : [];
    if (result.vehiclesVerified !== true || !vehicles.length) {
      return [];
    }

    const unsafeCount = vehicles.filter((vehicle) => !isSafeDriverReportVehicle(vehicle)).length;
    if (unsafeCount > 0) {
      console.error?.("driver_reports.client_unsafe_vehicle_list_blocked", {
        vehiclesCount: vehicles.length,
        unsafeCount,
        vehiclesVerified: result.vehiclesVerified === true
      });
      return [];
    }

    return vehicles.map(normalizeSafeDriverReportVehicle);
  }

  function joinCzechList(items = []) {
    const values = items.map(cleanString).filter(Boolean);
    if (values.length <= 1) {
      return values[0] || "";
    }

    return `${values.slice(0, -1).join(", ")} a ${values[values.length - 1]}`;
  }

  function driverReportVehiclePhrase(vehicle = {}) {
    const label = cleanString(vehicle.displayName);
    const plate = cleanString(vehicle.spz || vehicle.licensePlate);
    return [label, plate ? `SPZ ${plate}` : ""].filter(Boolean).join(" ");
  }

  function verifiedVehicleListAnswer(vehicles = []) {
    const options = vehicles.map(driverReportVehiclePhrase).filter(Boolean);
    if (!options.length) {
      return DRIVER_REPORT_UNVERIFIED_VEHICLE_MESSAGE;
    }

    if (options.length === 1) {
      return `Mám bezpečně ověřené tvoje vozidlo ${options[0]}. Týká se závada tohohle vozidla?`;
    }

    return `Vidím u tebe ${joinCzechList(options)}. Kterého se závada týká?`;
  }

  function safeDriverReportDiagnostics(diagnostics = null) {
    if (!diagnostics || typeof diagnostics !== "object") {
      return null;
    }

    return {
      driverMapped: diagnostics.driverMapped === true,
      driverResolved: diagnostics.driverResolved === true,
      vehiclePickerAvailable: diagnostics.vehiclePickerAvailable === true,
      vehicleLookupMode: cleanString(diagnostics.vehicleLookupMode),
      vehicleListReturned: diagnostics.vehicleListReturned === true,
      fallbackUsed: diagnostics.fallbackUsed === true,
      mockData: diagnostics.mockData === true,
      emptyReason: cleanString(diagnostics.emptyReason),
      unsafeVoiceVehicleCount: Number(diagnostics.unsafeVoiceVehicleCount || 0)
    };
  }

  function assistantSafeDriverReportContext(result = {}, parameters = {}) {
    const source = driverReportContextSource(result);
    const vehicles = safeDriverReportVehicles(source);
    const vehiclesVerified = source.vehiclesVerified === true && vehicles.length > 0;
    const exposeVehicleListToVoice = vehiclesVerified;
    const vehiclePickerAvailable = vehiclesVerified;
    const assistantMessage = vehiclesVerified
      ? verifiedVehicleListAnswer(vehicles)
      : DRIVER_REPORT_UNVERIFIED_VEHICLE_MESSAGE;
    const reason = vehiclesVerified
      ? cleanString(source.reason)
      : DRIVER_REPORT_NO_VERIFIED_VEHICLES_REASON;

    return {
      ok: source.ok !== false,
      module: source.module || "hlaseni-ridicu",
      currentModule: source.currentModule || "hlaseni-ridicu",
      sessionId: source.sessionId || cleanString(parameters.sessionId || parameters.session_id || parameters.conversationId || parameters.conversation_id),
      status: source.status || (vehiclesVerified ? "verified_vehicle_list" : "picker_or_manual"),
      userName: source.userName || source.user?.name || "",
      userResolved: source.userResolved === true,
      employeeResolved: source.employeeResolved === true,
      driverResolved: vehiclesVerified,
      vehiclesVerified,
      vehiclePickerAvailable,
      vehicleLookupMode: vehiclesVerified
        ? "verified_vehicle_list"
        : "picker_or_manual",
      errorCode: cleanString(source.errorCode || (!vehiclesVerified ? reason : "")),
      reason,
      user: source.user || null,
      driver: source.driver ? {
        employeeId: cleanString(source.driver.employeeId),
        source: cleanString(source.driver.source)
      } : null,
      vehicles: exposeVehicleListToVoice ? vehicles : [],
      vehiclesCount: exposeVehicleListToVoice ? vehicles.length : 0,
      vehicleOrdinalSelectionAllowed: vehicles.length > 1,
      permissions: source.permissions || {},
      fallbackQuestion: assistantMessage,
      message: assistantMessage,
      assistantMessage,
      messageForAssistant: assistantMessage,
      answerText: assistantMessage,
      diagnostics: safeDriverReportDiagnostics(source.diagnostics),
      apiStatus: source.apiStatus || "ready"
    };
  }

  function cacheDriverReportContext(key, result) {
    if (result?.ok !== true) {
      return;
    }

    driverReportContextCache.set(key, {
      ...result,
      cachedAt: new Date().toISOString()
    });
  }

  function cacheDriverReportPickerContext(key, result) {
    if (result?.ok !== true || result?.vehiclesVerified !== true || !Array.isArray(result.vehicles)) {
      return;
    }

    driverReportVehiclePickerCache.set(key, {
      ...result,
      cachedAt: new Date().toISOString()
    });
  }

  function clearDriverVehiclePickerSelectionCache() {
    driverReportVehiclePickerSelectionCache.clear();
    driverReportVehiclePickerLatestSelection = null;
  }

  function isFreshDriverVehiclePickerSelection(selection = {}) {
    if (!selection?.vehicleId) {
      return false;
    }

    const selectedAt = new Date(selection.selectedAt || 0).getTime();
    if (!Number.isFinite(selectedAt) || selectedAt <= 0) {
      return false;
    }

    return Date.now() - selectedAt <= DRIVER_REPORT_VEHICLE_PICKER_SELECTION_TTL_MS;
  }

  function resolveDriverVehiclePickerSelection(key = "") {
    const sessionKey = cleanString(key) || "active";
    const candidates = [
      driverReportVehiclePickerSelectionCache.get(sessionKey),
      sessionKey === "active" ? null : driverReportVehiclePickerSelectionCache.get("active"),
      driverReportVehiclePickerLatestSelection
    ].filter(Boolean);

    const selection = candidates.find(isFreshDriverVehiclePickerSelection) || null;
    if (!selection) {
      if (driverReportVehiclePickerSelectionCache.has(sessionKey)) {
        driverReportVehiclePickerSelectionCache.delete(sessionKey);
      }
      if (!isFreshDriverVehiclePickerSelection(driverReportVehiclePickerLatestSelection)) {
        driverReportVehiclePickerLatestSelection = null;
      }
    }

    return selection;
  }

  function driverVehiclePickerDiagnostic(toolName, status, detail = {}) {
    const statusText = status === "succeeded"
      ? "succeeded"
      : status === "called"
        ? "called"
        : "failed";
    const eventText = `Tool ${statusText}: ${toolName}`;
    const payload = {
      toolName,
      toolStatus: statusText,
      eventText,
      detail,
      createdAt: new Date().toISOString()
    };

    if (typeof console !== "undefined") {
      const logger = statusText === "failed" ? console.warn : console.info;
      logger?.call(console, eventText, detail);
    }

    if (typeof window !== "undefined") {
      window.__sarlotaDriverVehiclePickerDiagnostics = [
        ...(Array.isArray(window.__sarlotaDriverVehiclePickerDiagnostics)
          ? window.__sarlotaDriverVehiclePickerDiagnostics
          : []),
        payload
      ].slice(-20);

      if (typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
        window.dispatchEvent(new window.CustomEvent("sarlota-driver-vehicle-picker-tool", { detail: payload }));
      }
    }

    return payload;
  }

  function toolDiagnosticFields(toolName, status, diagnostics = []) {
    const current = driverVehiclePickerDiagnostic(toolName, status);
    const eventTexts = [...diagnostics, current]
      .map((item) => cleanString(item?.eventText))
      .filter(Boolean);

    return {
      toolCalled: toolName,
      toolStatus: current.toolStatus,
      toolDiagnostic: current.eventText,
      transcriptDiagnostic: current.eventText,
      toolDiagnostics: eventTexts
    };
  }

  function cacheDriverVehiclePickerSelection(key, payload = {}) {
    const sessionKey = cleanString(key) || "active";
    const vehicle = payload.vehicle && typeof payload.vehicle === "object" ? payload.vehicle : {};
    const vehicleId = cleanString(payload.vehicleId || vehicle.vehicleId || vehicle.id);
    const licensePlate = cleanString(vehicle.licensePlate || vehicle.spz);
    const selection = {
      status: cleanString(payload.status || "selected"),
      vehicleId,
      licensePlate,
      vehicleName: cleanString(vehicle.displayName || vehicle.vehicleName || vehicle.name),
      vehicleSelectionSource: "backend_ui_picker",
      selectedAt: new Date().toISOString()
    };

    driverReportVehiclePickerSelectionCache.set(sessionKey, selection);
    driverReportVehiclePickerSelectionCache.set("active", selection);
    driverReportVehiclePickerLatestSelection = selection;
  }

  async function getDriverReportContext(parameters = {}) {
    const sessionKey = driverReportSessionKey(parameters);
    const forceReload = booleanToolValue(parameters.forceReload || parameters.force_reload);
    const cached = driverReportContextCache.get(sessionKey);

    if (cached && !forceReload) {
      const answerText = driverReportContextAnswer(cached);
      return {
        ...cached,
        cached: true,
        sessionCacheKey: sessionKey,
        message: answerText,
        assistantMessage: answerText,
        messageForAssistant: answerText,
        answerText
      };
    }

    toast({ type: "info", message: DRIVER_REPORT_CONTEXT_LOADING_MESSAGE });

    let result;
    try {
      result = await readJson("/api/ai/driver-reports/context", {
        sessionId: cleanString(parameters.sessionId || parameters.session_id || parameters.conversationId || parameters.conversation_id),
        transcriptIntent: cleanString(parameters.transcriptIntent || parameters.transcript_intent || parameters.intent || parameters.query),
        currentModule: cleanString(parameters.currentModule || parameters.current_module || "hlaseni-ridicu")
      });
    } catch (error) {
      const code = cleanString(error?.payload?.errorCode || error?.payload?.code || "DRIVER_REPORT_CONTEXT_FAILED");
      const message = code === "UNAUTHENTICATED"
        ? "Nejsi přihlášený. Přihlas se a zkus to znovu."
        : code === "FORBIDDEN"
          ? "K tomu nemáš oprávnění."
        : "Vozidlo se mi teď nepodařilo ověřit. Otevřu ti výběr v aplikaci.";
      return {
        ok: false,
        module: "hlaseni-ridicu",
        status: "failed",
        userResolved: false,
        employeeResolved: false,
        driverResolved: false,
        vehiclesVerified: false,
        vehicles: [],
        vehiclesCount: 0,
        vehicleLookupMode: "picker_or_manual",
        vehiclePickerAvailable: false,
        cached: false,
        sessionCacheKey: sessionKey,
        errorCode: code,
        reason: code,
        message,
        assistantMessage: message,
        messageForAssistant: message,
        answerText: message,
        apiStatus: error?.payload?.apiStatus || "waiting"
      };
    }

    const normalizedResult = assistantSafeDriverReportContext(result, parameters);
    cacheDriverReportPickerContext(sessionKey, normalizedResult);
    cacheDriverReportContext(sessionKey, normalizedResult);
    const answerText = driverReportContextAnswer(normalizedResult);

    return {
      ...normalizedResult,
      cached: false,
      sessionCacheKey: sessionKey,
      intent: "driver_part_request",
      verified: normalizedResult.vehiclesVerified,
      requiresConfirmation: false,
      preparedActions: [],
      driverPartRequest: null,
      notificationsSent: false,
      message: answerText,
      answerText
    };
  }

  async function validateDriverVehicleSpz(parameters = {}) {
    const spz = cleanString(parameters.spz || parameters.licensePlate || parameters.plate);
    const sessionKey = driverReportSessionKey(parameters);

    if (!spz) {
      return {
        ok: false,
        errorCode: "SPZ_REQUIRED",
        vehiclesVerified: false,
        existsInFleet: false,
        assignedToCurrentDriver: false,
        manualVehicleReview: true,
        messageForAssistant: "Řekni mi prosím SPZ vozidla."
      };
    }

    const spzKey = licensePlateCompareKey(spz);
    if (spzKey.length < 5) {
      const message = "Tohle není úplná SPZ. Nadiktuj mi prosím celou SPZ, nebo ti otevřu výběr vozidla v aplikaci.";
      return {
        ok: false,
        status: "needs_input",
        errorCode: "SPZ_INCOMPLETE",
        spzNormalized: "",
        spzManual: "",
        spzValidated: false,
        existsInFleet: false,
        assignedToCurrentDriver: false,
        vehicleVerified: false,
        vehiclesVerified: false,
        vehicleId: null,
        manualVehicleReview: true,
        vehiclePickerAvailable: true,
        messageForAssistant: message,
        answerText: message,
        apiStatus: "ready"
      };
    }

    let validation;
    try {
      validation = await readJson("/api/driver-reports/license-plate", { spz });
    } catch (error) {
      const message = cleanString(error?.payload?.error || error?.message) || "SPZ se teď nepodařilo ověřit.";
      return {
        ok: false,
        errorCode: cleanString(error?.payload?.code || "SPZ_LOOKUP_FAILED"),
        vehiclesVerified: false,
        existsInFleet: false,
        assignedToCurrentDriver: false,
        manualVehicleReview: true,
        messageForAssistant: `${message} Můžu ji zapsat ručně ke kontrole dispečera?`,
        apiStatus: error?.payload?.apiStatus || "waiting"
      };
    }

    const normalized = cleanString(validation.normalized || spz);
    const normalizedKey = licensePlateCompareKey(normalized);
    let cachedPickerContext = driverReportVehiclePickerCache.get(sessionKey);
    if (!cachedPickerContext) {
      try {
        const pickerContext = await readJson("/api/ai/driver-reports/context", {
          sessionId: sessionKey,
          transcriptIntent: cleanString(parameters.transcriptIntent || parameters.transcript_intent || parameters.intent || parameters.query),
          currentModule: "hlaseni-ridicu",
          includeVehiclePicker: "true"
        });
        cacheDriverReportPickerContext(sessionKey, pickerContext);
        cachedPickerContext = driverReportVehiclePickerCache.get(sessionKey);
      } catch {
        cachedPickerContext = null;
      }
    }
    const assignedVehicle = cachedPickerContext?.vehiclesVerified === true && Array.isArray(cachedPickerContext.vehicles)
      ? cachedPickerContext.vehicles.find((vehicle) => licensePlateCompareKey(vehicle.licensePlate) === normalizedKey)
      : null;
    const assignedToCurrentDriver = Boolean(assignedVehicle);
    const existsInFleet = validation.exact === true;
    const manualVehicleReview = !existsInFleet || !assignedToCurrentDriver;
    const messageForAssistant = assignedToCurrentDriver
      ? "Děkuji. SPZ mám ověřenou u tebe."
      : existsInFleet
        ? "Tuhle SPZ u tebe nemám přiřazenou, ale můžu závadu zapsat k ruční kontrole dispečera. Je to tak správně?"
        : "Tuhle SPZ v seznamu vozidel nevidím. Můžu ji zapsat ručně ke kontrole dispečera?";

    return {
      ok: true,
      spzNormalized: normalized,
      spzManual: normalized,
      spzValidated: existsInFleet,
      existsInFleet,
      assignedToCurrentDriver,
      vehicleVerified: assignedToCurrentDriver,
      vehiclesVerified: assignedToCurrentDriver,
      vehicleId: assignedToCurrentDriver ? cleanString(assignedVehicle?.id || assignedVehicle?.vehicleId || validation.vehicle?.id || validation.vehicle?.vehicleId) : null,
      manualVehicleReview,
      messageForAssistant,
      validation: {
        normalized,
        exact: validation.exact === true,
        validFormat: validation.validFormat === true,
        suggestionsCount: Array.isArray(validation.suggestions) ? validation.suggestions.length : 0
      },
      apiStatus: validation.apiStatus || "ready"
    };
  }

  function driverVehiclePickerLabel(vehicle = {}) {
    return cleanString(
      vehicle.displayName ||
      [vehicle.type, vehicle.brand, vehicle.model || vehicle.internalName].map(cleanString).filter(Boolean).join(" ") ||
      vehicle.internalName ||
      vehicle.licensePlate ||
      "Vozidlo"
    );
  }

  function driverVehiclePickerMeta(vehicle = {}) {
    return [
      cleanString(vehicle.licensePlate),
      cleanString(vehicle.vin) ? "VIN uložené" : "",
      cleanString(vehicle.assignmentHint)
    ].filter(Boolean).join(" · ");
  }

  function removeExistingDriverVehiclePicker() {
    if (typeof document === "undefined") {
      return;
    }

    document.querySelectorAll("[data-ai-driver-vehicle-picker]").forEach((element) => element.remove());
  }

  function openDriverVehiclePickerDialog(vehicles = [], { sessionKey = "active" } = {}) {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return { status: "unavailable", pickerOpened: false };
    }

    removeExistingDriverVehiclePicker();
    clearDriverVehiclePickerSelectionCache();

    let settled = false;
    let timeout = null;
    const backdrop = document.createElement("div");
    const dialog = document.createElement("section");
    const eyebrow = document.createElement("span");
    const title = document.createElement("h2");
    const note = document.createElement("p");
    const list = document.createElement("div");
    const actions = document.createElement("div");
    const cancel = document.createElement("button");

    function settle(payload) {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      document.removeEventListener("keydown", onKeydown);
      backdrop.remove();
      driverReportVehiclePickerOpenCache.set(sessionKey, {
        status: cleanString(payload.status || "closed"),
        pickerOpened: false,
        updatedAt: new Date().toISOString()
      });

      if (payload.status === "selected" && payload.vehicle?.vehicleId) {
        cacheDriverVehiclePickerSelection(sessionKey, payload);
        toast({ type: "success", message: DRIVER_REPORT_VEHICLE_SELECTED_MESSAGE });
      }
    }

    function onKeydown(event) {
      if (event.key === "Escape") {
        settle({ status: "cancelled" });
      }
    }

    backdrop.className = "ai-driver-vehicle-picker-backdrop";
    backdrop.dataset.aiDriverVehiclePicker = "true";
    backdrop.setAttribute("role", "presentation");
    dialog.className = "ai-driver-vehicle-picker";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "ai-driver-vehicle-picker-title");
    dialog.setAttribute("aria-describedby", "ai-driver-vehicle-picker-note");
    eyebrow.className = "ai-driver-vehicle-picker__eyebrow";
    eyebrow.textContent = "Hlášení řidičů";
    title.id = "ai-driver-vehicle-picker-title";
    title.textContent = "Vyber vozidlo";
    note.id = "ai-driver-vehicle-picker-note";
    note.textContent = "Potvrď vozidlo pro aktuální hlášení.";
    list.className = "ai-driver-vehicle-picker__list";
    actions.className = "ai-driver-vehicle-picker__actions";
    cancel.className = "ai-secondary-button";
    cancel.type = "button";
    cancel.textContent = "Zrušit";
    cancel.addEventListener("click", () => settle({ status: "cancelled" }));

    vehicles.forEach((vehicle) => {
      const button = document.createElement("button");
      const label = document.createElement("strong");
      const meta = document.createElement("span");
      const vehicleId = cleanString(vehicle?.id || vehicle?.vehicleId);

      button.className = "ai-driver-vehicle-picker__option";
      button.type = "button";
      button.disabled = !vehicleId;
      label.textContent = driverVehiclePickerLabel(vehicle);
      meta.textContent = driverVehiclePickerMeta(vehicle);
      button.append(label, meta);
      button.addEventListener("click", () => settle({
        status: "selected",
        vehicle: {
          id: vehicleId,
          vehicleId,
          displayName: cleanString(vehicle?.displayName),
          licensePlate: cleanString(vehicle?.licensePlate || vehicle?.spz),
          assignedToCurrentDriver: vehicle?.assignedToCurrentDriver === true,
          existsInFleet: vehicle?.existsInFleet === true
        }
      }));
      list.append(button);
    });

    actions.append(cancel);
    dialog.append(eyebrow, title, note, list, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    document.addEventListener("keydown", onKeydown);
    timeout = window.setTimeout(() => settle({ status: "timeout" }), 90000);
    const firstButton = list.querySelector("button:not(:disabled)");
    firstButton?.focus?.();

    driverReportVehiclePickerOpenCache.set(sessionKey, {
      status: "opened",
      pickerOpened: true,
      openedAt: new Date().toISOString()
    });

    return { status: "opened", pickerOpened: true };
  }

  async function showDriverVehiclePicker(parameters = {}) {
    if (isCollectionRouteGpsIntent(parameters)) {
      return {
        ok: false,
        status: "wrong_tool_for_collection_gps",
        errorCode: "COLLECTION_ROUTE_GPS_TOOL_REQUIRED",
        pickerOpened: false,
        nextTool: COLLECTION_ROUTE_GPS_TOOL_NAME,
        message: COLLECTION_ROUTE_GPS_WRONG_TOOL_MESSAGE,
        messageForAssistant: `${COLLECTION_ROUTE_GPS_WRONG_TOOL_MESSAGE} Hned zavolej ${COLLECTION_ROUTE_GPS_TOOL_NAME}.`,
        answerText: COLLECTION_ROUTE_GPS_WRONG_TOOL_MESSAGE,
        apiStatus: "ready"
      };
    }
    if (isCollectionRouteTestIncidentIntent(parameters)) {
      return {
        ok: false,
        status: "wrong_tool_for_collection_incident",
        errorCode: "COLLECTION_ROUTE_TEST_INCIDENT_TOOL_REQUIRED",
        pickerOpened: false,
        nextTool: COLLECTION_ROUTE_TEST_INCIDENT_TOOL_NAME,
        message: "Pro hlášení ze stanoviště není potřeba vybírat vozidlo.",
        messageForAssistant: `Neotvírej výběr vozidla. Hned zavolej ${COLLECTION_ROUTE_TEST_INCIDENT_TOOL_NAME} se správným incidentType.`,
        answerText: "Pro hlášení ze stanoviště není potřeba vybírat vozidlo.",
        apiStatus: "ready"
      };
    }

    const sessionKey = driverReportSessionKey(parameters);
    const calledDiagnostic = driverVehiclePickerDiagnostic("show_driver_vehicle_picker", "called", { sessionKey });
    let result;

    toast({ type: "info", message: DRIVER_REPORT_PICKER_MESSAGE });

    try {
      result = await readJson("/api/ai/driver-reports/context", {
        sessionId: cleanString(parameters.sessionId || parameters.session_id || parameters.conversationId || parameters.conversation_id || sessionKey),
        transcriptIntent: cleanString(parameters.transcriptIntent || parameters.transcript_intent || parameters.intent || parameters.query),
        currentModule: cleanString(parameters.currentModule || parameters.current_module || "hlaseni-ridicu"),
        includeVehiclePicker: "true"
      });
    } catch (error) {
      return {
        ok: false,
        status: "failed",
        errorCode: cleanString(error?.payload?.code || error?.payload?.errorCode || "DRIVER_VEHICLE_PICKER_FAILED"),
        vehiclesVerified: false,
        vehiclePickerAvailable: false,
        vehicles: [],
        vehiclesCount: 0,
        messageForAssistant: DRIVER_REPORT_PICKER_FAILED_MESSAGE,
        answerText: DRIVER_REPORT_PICKER_FAILED_MESSAGE,
        apiStatus: error?.payload?.apiStatus || "waiting",
        ...toolDiagnosticFields("show_driver_vehicle_picker", "failed", [calledDiagnostic])
      };
    }

    cacheDriverReportPickerContext(sessionKey, result);
    const vehicles = safeDriverReportVehicles(result)
      .filter((vehicle) => cleanString(vehicle?.id || vehicle?.vehicleId));

    if (!vehicles.length) {
      return {
        ok: false,
        status: "needs_input",
        errorCode: "DRIVER_VEHICLE_PICKER_EMPTY",
        vehiclesVerified: false,
        vehiclePickerAvailable: false,
        vehicles: [],
        vehiclesCount: 0,
        messageForAssistant: DRIVER_REPORT_PICKER_FAILED_MESSAGE,
        answerText: DRIVER_REPORT_PICKER_FAILED_MESSAGE,
        apiStatus: result.apiStatus || "ready",
        ...toolDiagnosticFields("show_driver_vehicle_picker", "failed", [calledDiagnostic])
      };
    }

    const picker = openDriverVehiclePickerDialog(vehicles, { sessionKey });
    if (picker.status !== "opened" || picker.pickerOpened !== true) {
      return {
        ok: false,
        status: picker.status || "failed",
        errorCode: "DRIVER_VEHICLE_PICKER_UNAVAILABLE",
        vehiclesVerified: false,
        vehiclePickerAvailable: false,
        pickerOpened: false,
        vehicles: [],
        vehiclesCount: 0,
        messageForAssistant: DRIVER_REPORT_PICKER_FAILED_MESSAGE,
        answerText: DRIVER_REPORT_PICKER_FAILED_MESSAGE,
        apiStatus: result.apiStatus || "ready",
        ...toolDiagnosticFields("show_driver_vehicle_picker", "failed", [calledDiagnostic])
      };
    }

    return {
      ok: true,
      status: "picker_opened",
      intent: "driver_part_request",
      pickerOpened: true,
      vehicleId: null,
      vehicleVerified: false,
      vehiclesVerified: false,
      vehicleSelectionSource: "backend_ui_picker",
      vehicles: [],
      vehiclesCount: 0,
      message: DRIVER_REPORT_PICKER_MESSAGE,
      messageForAssistant: "Výběr vozidla je otevřený v aplikaci. Pokud uživatel řekne `toto`, `vybráno` nebo chce pokračovat, zavolej get_driver_vehicle_picker_selection. Pokud nevrátí vehicleId, řekni: Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.",
      answerText: DRIVER_REPORT_PICKER_MESSAGE,
      apiStatus: result.apiStatus || "ready",
      ...toolDiagnosticFields("show_driver_vehicle_picker", "succeeded", [calledDiagnostic])
    };
  }

  function getDriverVehiclePickerSelection(parameters = {}) {
    const sessionKey = driverReportSessionKey(parameters);
    const calledDiagnostic = driverVehiclePickerDiagnostic("get_driver_vehicle_picker_selection", "called", { sessionKey });
    const selection = resolveDriverVehiclePickerSelection(sessionKey);

    if (selection?.vehicleId) {
      return {
        ok: true,
        status: "selected",
        intent: "driver_part_request",
        nextTool: "create_driver_part_request",
        nextAction: "call_create_driver_part_request",
        vehicleId: selection.vehicleId,
        vehicleVerified: true,
        vehiclesVerified: false,
        vehicleSelectionSource: selection.vehicleSelectionSource || "backend_ui_picker",
        vehicles: [],
        vehiclesCount: 0,
        message: DRIVER_REPORT_VEHICLE_SELECTED_MESSAGE,
        createDriverPartRequestParameters: {
          vehicleId: selection.vehicleId,
          vehicleSelectionSource: selection.vehicleSelectionSource || "backend_ui_picker"
        },
        messageForAssistant: "Vozidlo je vybrané v aplikaci. Nepojmenovávej ho nahlas. Pokud už znáš popis závady, hned zavolej create_driver_part_request s vehicleId z tohoto výsledku; samotný výběr vozidla ještě není zápis.",
        answerText: DRIVER_REPORT_VEHICLE_SELECTED_MESSAGE,
        apiStatus: "ready",
        ...toolDiagnosticFields("get_driver_vehicle_picker_selection", "succeeded", [calledDiagnostic])
      };
    }

    const pickerState = driverReportVehiclePickerOpenCache.get(sessionKey);
    const code = pickerState?.pickerOpened === true
      ? "DRIVER_VEHICLE_PICKER_SELECTION_PENDING"
      : "VEHICLE_SPZ_REQUIRED";

    return {
      ok: false,
      status: "needs_input",
      code,
      errorCode: code,
      vehicleVerified: false,
      vehiclesVerified: false,
      vehicles: [],
      vehiclesCount: 0,
      message: DRIVER_REPORT_PICKER_OR_SPZ_MESSAGE,
      messageForAssistant: DRIVER_REPORT_PICKER_OR_SPZ_MESSAGE,
      answerText: DRIVER_REPORT_PICKER_OR_SPZ_MESSAGE,
      apiStatus: "ready",
      ...toolDiagnosticFields("get_driver_vehicle_picker_selection", "failed", [calledDiagnostic])
    };
  }

  function isDriverVehicleHighlightAttempt(parameters = {}) {
    const selector = cleanString(parameters.selector);
    const message = cleanString(parameters.message || parameters.label || parameters.text);
    const currentModule = cleanString(parameters.currentModule || parameters.current_module || parameters.module || parameters.intent);
    const text = normalizeKey([selector, message, currentModule].filter(Boolean).join(" "));
    const inDriverReports = typeof window !== "undefined" &&
      normalizeKey(window.location?.pathname || "").includes("hlaseni-ridicu");

    return /\b(vozidlo|vozidla|auto|auta|vuz|spz|ridic|driver|vehicle|driver_report|hlaseni_ridicu)\b/.test(text) ||
      (inDriverReports && /\b(toto|tohle|prvni|druhe|vyber|select|option|moznost)\b/.test(text));
  }

  function isCollectionRouteGpsIntent(parameters = {}) {
    const actualRoute = typeof window !== "undefined"
      ? normalizeAiRoute(window.location?.pathname || "")
      : "";
    const requestedRoute = normalizeAiRoute(
      parameters.currentModuleRoute
      || parameters.current_module_route
      || parameters.route
      || ""
    );
    const inCollectionRoutes = actualRoute === COLLECTION_ROUTE_GPS_ROUTE || requestedRoute === COLLECTION_ROUTE_GPS_ROUTE;
    if (!inCollectionRoutes) {
      return false;
    }

    const text = normalizeKey([
      parameters.transcriptIntent,
      parameters.transcript_intent,
      parameters.intent,
      parameters.query,
      parameters.message,
      parameters.currentModule,
      parameters.current_module
    ].filter(Boolean).join(" "));
    const mentionsGpsPoint = text.includes("gps") && (text.includes("stanovist") || text.includes("poloh"));
    const mentionsStationAction = text.includes("stanovist") && /(potvrd|zmer|zmap|mapuj|nacti|uloz)/.test(text);

    return mentionsGpsPoint || mentionsStationAction;
  }

  function isCollectionRouteTestIncidentIntent(parameters = {}) {
    const actualRoute = typeof window !== "undefined"
      ? normalizeAiRoute(window.location?.pathname || "")
      : "";
    const requestedRoute = normalizeAiRoute(
      parameters.currentModuleRoute
      || parameters.current_module_route
      || parameters.route
      || ""
    );
    if (![COLLECTION_ROUTE_GPS_ROUTE, COLLECTION_ROUTE_DRIVER_TEST_ROUTE].includes(actualRoute)
      && ![COLLECTION_ROUTE_GPS_ROUTE, COLLECTION_ROUTE_DRIVER_TEST_ROUTE].includes(requestedRoute)) return false;
    const text = normalizeKey([
      parameters.transcriptIntent,
      parameters.transcript_intent,
      parameters.intent,
      parameters.query,
      parameters.message
    ].filter(Boolean).join(" "));
    return /(prepln|poskoz|nepristup|nelze se dostat|neda se dostat|nemuzu se dostat|chybi nadob|neni nadob|kontamin|firma zavren|zavreno|jiny problem)/.test(text);
  }

  function absenceDayPartValue(value, halfDay = null) {
    if (halfDay === true) {
      return "half_day";
    }

    if (halfDay === false) {
      return "full_day";
    }

    const normalized = normalizeKey(value).replace(/[^a-z0-9]+/g, "_");
    if (["half_day", "half", "pulden", "pul_dne", "puldne"].includes(normalized)) {
      return "half_day";
    }

    if (["full_day", "full", "cely_den", "celodenni", "den"].includes(normalized)) {
      return "full_day";
    }

    return "";
  }

  function absenceToolTypeValue(value) {
    const normalized = normalizeKey(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return ABSENCE_TOOL_TYPE_ALIASES[normalized] || normalized || "";
  }

  function absenceToolTypeLabel(type) {
    return ABSENCE_TOOL_TYPE_LABELS[type] || "nepřítomnost";
  }

  async function employeeDetailFor(parameters = {}) {
    const identity = identityParameters(parameters, "employeeId");

    if (identity.id) {
      const result = await readJson(`/api/ai/employees/${encodeURIComponent(identity.id)}/summary`);
      return { ok: true, employee: result.employee, apiStatus: result.apiStatus };
    }

    if (!identity.query) {
      return { ok: false, error: "Chybí jméno nebo ID zaměstnance." };
    }

    const search = await tools.search_employee({ query: identity.query, limit: parameters.limit || 5 });

    if (!search.ok || search.count !== 1) {
      return search;
    }

    const employeeId = search.employees[0]?.id;
    if (!employeeId) {
      return { ok: false, error: "Zaměstnanec nebyl nalezen." };
    }

    return employeeDetailFor({ employeeId });
  }

  async function userSummaryFor(parameters = {}) {
    const identity = identityParameters(parameters, "userId");

    if (identity.id) {
      const result = await readJson(`/api/ai/users/${encodeURIComponent(identity.id)}/summary`);
      return { ok: true, user: result.user, apiStatus: result.apiStatus };
    }

    if (!identity.query) {
      return { ok: false, error: "Chybí jméno nebo ID uživatele." };
    }

    const search = await tools.search_user({ query: identity.query, limit: parameters.limit || 5 });

    if (!search.ok || search.count !== 1) {
      return search;
    }

    const userId = search.users[0]?.id;
    if (!userId) {
      return { ok: false, error: "Uživatel nebyl nalezen." };
    }

    return userSummaryFor({ userId });
  }

  async function createAbsenceRequest(parameters = {}) {
    const type = absenceToolTypeValue(
      parameters.type ||
      parameters.absenceType ||
      parameters.absence_type ||
      "vacation"
    );
    const employeeId = cleanString(parameters.employeeId || parameters.employee_id || parameters.userId || parameters.user_id);
    const employeeName = cleanString(
      parameters.employeeName ||
      parameters.employee_name ||
      parameters.employee ||
      parameters.name ||
      parameters.query
    );
    const dateFrom = cleanString(
      parameters.dateFrom ||
      parameters.date_from ||
      parameters.absenceDate ||
      parameters.absence_date ||
      parameters.date ||
      parameters.startDate ||
      parameters.start_date
    );
    const dateTo = cleanString(
      parameters.dateTo ||
      parameters.date_to ||
      parameters.endDate ||
      parameters.end_date ||
      dateFrom
    );
    const dayPart = absenceDayPartValue(
      parameters.dayPart || parameters.day_part || parameters.scope || parameters.range,
      typeof parameters.halfDay === "boolean" ? parameters.halfDay : null
    ) || (type === "doctor" ? "" : "full_day");
    const startTime = cleanString(parameters.startTime || parameters.start_time || parameters.timeFrom || parameters.time_from);
    const endTime = cleanString(parameters.endTime || parameters.end_time || parameters.timeTo || parameters.time_to);
    const confirmed = booleanToolValue(
      parameters.confirmed ??
      parameters.writeConfirmed ??
      parameters.write_confirmed
    );
    const note = cleanString(parameters.note || parameters.absenceNote || parameters.absence_note || parameters.comment);
    const spokenSummary = cleanString(parameters.spokenSummary || parameters.summary || parameters.message);
    const driverNote = cleanString(parameters.driverNote || parameters.driver_note || parameters.note || parameters.comment);
    const text = spokenSummary || [
      `Zapiš ${absenceToolTypeLabel(type)}`,
      employeeName ? `pro ${employeeName}` : "",
      dateFrom,
      dateTo && dateTo !== dateFrom ? `do ${dateTo}` : "",
      startTime && endTime ? `od ${startTime} do ${endTime}` : "",
      dayPart === "half_day" ? "půlden" : dayPart === "full_day" ? "celý den" : "",
      confirmed ? "ano, zapiš to" : ""
    ].filter(Boolean).join(" ");

    let result;

    try {
      result = await postJson("/api/voice/sarlota", {
        transcript: text,
        text,
        intent: "absence_request",
        parameters: {
          type,
          employeeId,
          employeeName,
          dateFrom,
          dateTo: dateTo || dateFrom,
          dayPart,
          startTime,
          endTime,
          confirmed,
          writeConfirmed: confirmed,
          note
        },
        context: {
          requestedIntent: "absence_request",
          absenceType: type,
          absenceEmployeeId: employeeId,
          absenceEmployeeQuery: employeeName,
          absenceDateFrom: dateFrom,
          absenceDateTo: dateTo || dateFrom,
          absenceDayPart: dayPart,
          absenceStartTime: startTime,
          absenceEndTime: endTime,
          absenceConfirmed: confirmed
        },
        metadata: {
          source: "elevenlabs_client_tool"
        }
      });
    } catch (error) {
      const message = cleanString(error?.payload?.error || error?.message) || "Zápis se nepodařil.";
      return {
        ok: false,
        status: "request_failed",
        message: `${message} Nic jsem nezapsala.`,
        answerText: `${message} Nic jsem nezapsala.`,
        intent: "absence_request",
        verified: false,
        requiresConfirmation: false,
        preparedActions: [],
        absenceRequest: null,
        notificationsSent: false,
        apiStatus: error?.payload?.apiStatus || "waiting",
        code: error?.payload?.code || "absence_request_failed"
      };
    }

    return {
      ok: result.ok === true,
      status: result.status || "unknown",
      message: result.reply || result.text || "",
      answerText: result.reply || result.text || "",
      intent: result.intent || "absence_request",
      verified: result.verified === true,
      requiresConfirmation: result.status === "needs_confirmation",
      preparedActions: Array.isArray(result.preparedActions) ? result.preparedActions : [],
      absenceRequest: result.absenceRequest || null,
      notificationsSent: result.notificationsSent === true,
      apiStatus: result.apiStatus || "ready"
    };
  }

  async function createDriverPartRequest(parameters = {}) {
    const sessionKey = driverReportSessionKey(parameters);
    const defectDescription = cleanString(
      parameters.defectDescription ||
      parameters.defect_description ||
      parameters.description ||
      parameters.issue ||
      parameters.spokenSummary ||
      parameters.summary
    );
    const rawLicensePlate = cleanString(parameters.licensePlate || parameters.spz || parameters.plate);
    const spzManual = cleanString(parameters.spzManual || parameters.manualSpz || parameters.manual_spz);
    const spzValidated = booleanToolValue(
      parameters.spzValidated ??
      parameters.spz_validated ??
      parameters.manualSpzValidated ??
      parameters.manual_spz_validated
    );
    let licensePlate = spzManual || (spzValidated ? rawLicensePlate : "");
    let vehicleId = cleanString(parameters.vehicleId || parameters.vehicle_id);
    let vehicleName = cleanString(parameters.vehicleName || parameters.vehicle || parameters.car);
    let vin = cleanString(parameters.vin || parameters.VIN);
    let vehicleBrand = cleanString(parameters.vehicleBrand || parameters.brand);
    let vehicleSelectionSource = cleanString(parameters.vehicleSelectionSource || parameters.vehicle_selection_source);
    const spokenSummary = cleanString(parameters.spokenSummary || parameters.summary || parameters.message);
    const driverNote = cleanString(parameters.driverNote || parameters.driver_note || parameters.note || parameters.comment);
    const requestedConfirmed = booleanToolValue(
      parameters.confirmed ??
      parameters.writeConfirmed ??
      parameters.write_confirmed
    );
    const requestedConfirmationSource = cleanString(parameters.confirmationSource || parameters.confirmation_source);
    const driverNoteStatus = normalizeKey(parameters.driverNoteStatus || parameters.driver_note_status || parameters.noteStatus || parameters.note_status).replace(/-/g, "_");
    const driverNoteQuestionAsked = booleanToolValue(
      parameters.driverNoteQuestionAsked ??
      parameters.driver_note_question_asked ??
      parameters.noteQuestionAsked ??
      parameters.note_question_asked
    ) || Boolean(driverNote || driverNoteStatus);
    const driverNoteHandled = Boolean(driverNote) ||
      ["provided", "declined", "none", "no_note", "bez_poznamky", "empty", "skipped"].includes(driverNoteStatus);
    const cachedSelection = resolveDriverVehiclePickerSelection(sessionKey);
    if (!vehicleId && cachedSelection?.vehicleId) {
      vehicleId = cachedSelection.vehicleId;
      vehicleSelectionSource = cachedSelection.vehicleSelectionSource || "backend_ui_picker";
    }
    if (!licensePlate && cachedSelection?.licensePlate) {
      licensePlate = cachedSelection.licensePlate;
    }
    if (!vehicleName && cachedSelection?.vehicleName) {
      vehicleName = cachedSelection.vehicleName;
    }
    const vehicleSelectionValid = Boolean(vehicleId || licensePlate);
    if (vehicleSelectionValid) {
      vehicleName = "";
      vin = "";
      vehicleBrand = "";
    }
    const basePayload = (confirmed = false, extraParameters = {}) => ({
      transcript: spokenSummary || [
        defectDescription,
        licensePlate ? `na autě ${licensePlate}` : "",
        confirmed ? "ano" : ""
      ].filter(Boolean).join(" "),
      text: spokenSummary || [
        defectDescription,
        licensePlate ? `na autě ${licensePlate}` : "",
        confirmed ? "ano" : ""
      ].filter(Boolean).join(" "),
      intent: "driver_part_request",
      parameters: {
        defectDescription,
        driverNote,
        driverNoteStatus,
        driverNoteQuestionAsked,
        licensePlate,
        spzManual: licensePlate || "",
        spzValidated: Boolean(licensePlate),
        vehicleId,
        vehicleName,
        vin,
        vehicleBrand,
        vehicleSelectionSource,
        ...extraParameters,
        confirmed,
        writeConfirmed: confirmed
      },
      context: {
        requestedIntent: "driver_part_request",
        defectDescription,
        driverNote,
        driverNoteStatus,
        driverNoteQuestionAsked,
        licensePlate,
        spzManual: licensePlate || "",
        spzValidated: Boolean(licensePlate),
        vehicleId,
        vehicleName,
        vin,
        vehicleBrand,
        vehicleSelectionSource,
        ...extraParameters,
        confirmed
      },
      metadata: {
        source: "elevenlabs_client_tool"
      }
    });

    if (!vehicleSelectionValid) {
      return {
        ok: false,
        status: "needs_input",
        message: DRIVER_REPORT_PICKER_OR_SPZ_MESSAGE,
        answerText: DRIVER_REPORT_PICKER_OR_SPZ_MESSAGE,
        intent: "driver_part_request",
        verified: false,
        requiresConfirmation: false,
        preparedActions: [],
        driverPartRequest: null,
        notificationsSent: false,
        apiStatus: "ready",
        code: "VEHICLE_SPZ_REQUIRED",
        errorCode: "VEHICLE_SPZ_REQUIRED"
      };
    }

    toast({ type: "info", message: "Připravuji hlášení řidiče." });

    let preparedResult;

    try {
      preparedResult = await postJson("/api/voice/sarlota", basePayload(false));
    } catch (error) {
      const message = cleanString(error?.payload?.error || error?.message) || "Hlášení se nepodařilo připravit.";
      return {
        ok: false,
        status: "request_failed",
        message: `${message} Nic jsem neodeslala.`,
        answerText: `${message} Nic jsem neodeslala.`,
        intent: "driver_part_request",
        verified: false,
        requiresConfirmation: false,
        preparedActions: [],
        driverPartRequest: null,
        notificationsSent: false,
        apiStatus: error?.payload?.apiStatus || "waiting",
        code: error?.payload?.code || "driver_part_request_prepare_failed"
      };
    }

    if (preparedResult.status !== "needs_confirmation") {
      return {
        ok: preparedResult.ok === true,
        status: preparedResult.status || "unknown",
        message: preparedResult.reply || preparedResult.text || preparedResult.message || "",
        answerText: preparedResult.reply || preparedResult.text || preparedResult.message || "",
        intent: preparedResult.intent || "driver_part_request",
        verified: preparedResult.verified === true,
        requiresConfirmation: false,
        preparedActions: Array.isArray(preparedResult.preparedActions) ? preparedResult.preparedActions : [],
        driverPartRequest: preparedResult.driverPartRequest || null,
        notificationsSent: preparedResult.notificationsSent === true,
        apiStatus: preparedResult.apiStatus || "ready"
      };
    }

    const preparedAction = Array.isArray(preparedResult.preparedActions)
      ? preparedResult.preparedActions.find((action) => action?.type === "driver_part_request") || preparedResult.preparedActions[0]
      : null;
    const preparedParameters = preparedAction?.parameters || {};
    const confirmationMessage = [
      "Šarlota chce vytvořit servisní hlášení řidiče.",
      preparedParameters.defectDescription ? `Závada: ${preparedParameters.defectDescription}` : (defectDescription ? `Závada: ${defectDescription}` : ""),
      preparedParameters.driverNote ? `Poznámka: ${preparedParameters.driverNote}` : (driverNote ? `Poznámka: ${driverNote}` : ""),
      preparedParameters.vehicleId ? "Vozidlo: vybrané v aplikaci" : "",
      preparedParameters.licensePlate ? `SPZ: ${preparedParameters.licensePlate}` : "",
      preparedParameters.vehicleName ? `Vozidlo: ${preparedParameters.vehicleName}` : "",
      preparedParameters.vin ? `VIN: ${preparedParameters.vin}` : (vin ? `VIN: ${vin}` : ""),
      "Dohledání dílů, cen a případná zpráva Patrikovi poběží až po uložení na pozadí."
    ].filter(Boolean).join("\n");
    const selectedByKsoPicker = cachedSelection?.vehicleId &&
      cleanString(preparedParameters.vehicleId || vehicleId) === cachedSelection.vehicleId &&
      cleanString(cachedSelection.vehicleSelectionSource) === "backend_ui_picker";
    const voiceIntakeConfirmed = !selectedByKsoPicker &&
      requestedConfirmed &&
      driverNoteHandled &&
      (!requestedConfirmationSource || requestedConfirmationSource === "voice-intake");
    const popupConfirmed = selectedByKsoPicker
      ? true
      : voiceIntakeConfirmed
      ? true
      : await confirm({
        title: "Potvrdit hlášení řidiče",
        message: confirmationMessage,
        confirmLabel: "Uložit hlášení",
        cancelLabel: "Zrušit"
      });

    if (!popupConfirmed) {
      return {
        ok: false,
        status: "cancelled",
        message: "Zrušeno. Nic jsem nezapsala ani neodeslala.",
        answerText: "Zrušeno. Nic jsem nezapsala ani neodeslala.",
        intent: "driver_part_request",
        verified: true,
        requiresConfirmation: false,
        preparedActions: [],
        driverPartRequest: null,
        notificationsSent: false,
        apiStatus: "ready"
      };
    }

    const confirmed = Boolean(popupConfirmed);
    const confirmationId = cleanString(preparedAction?.confirmationId || preparedResult.confirmationId);

    if (!confirmationId) {
      return {
        ok: false,
        status: "confirmation_missing",
        message: "Chybí bezpečné potvrzení z aplikace. Nic jsem nezapsala ani neodeslala.",
        answerText: "Chybí bezpečné potvrzení z aplikace. Nic jsem nezapsala ani neodeslala.",
        intent: "driver_part_request",
        verified: false,
        requiresConfirmation: false,
        preparedActions: [],
        driverPartRequest: null,
        notificationsSent: false,
        apiStatus: "ready",
        code: "driver_part_confirmation_id_missing"
      };
    }
    const trustedParameters = {
      ...preparedParameters,
      confirmationSource: voiceIntakeConfirmed ? "voice-intake" : "kso-ui",
      confirmation_source: voiceIntakeConfirmed ? "voice-intake" : "kso-ui",
      confirmationId,
      confirmation_id: confirmationId
    };

    let result;

    try {
      result = await postJson("/api/voice/sarlota", basePayload(confirmed, trustedParameters));
    } catch (error) {
      const message = cleanString(error?.payload?.error || error?.message) || "Hlášení se nepodařilo zapsat.";
      return {
        ok: false,
        status: "request_failed",
        message: `${message} Nic jsem neodeslala.`,
        answerText: `${message} Nic jsem neodeslala.`,
        intent: "driver_part_request",
        verified: false,
        requiresConfirmation: false,
        preparedActions: [],
        driverPartRequest: null,
        notificationsSent: false,
        apiStatus: error?.payload?.apiStatus || "waiting",
        code: error?.payload?.code || "driver_part_request_failed"
      };
    }

    const status = result.status || "unknown";
    const message = cleanString(result.reply || result.text || result.message) ||
      (status === "needs_confirmation"
        ? "Potvrď to prosím v aplikaci."
        : "Hlášení se nepodařilo zapsat. Nic jsem neodeslala.");
    const driverPartRequest = result.driverPartRequest || null;
    const created = ["created", "created_notification_pending", "created_mock"].includes(status);
    if (created && !cleanString(driverPartRequest?.reportId)) {
      return {
        ok: false,
        status: "write_unverified",
        message: "Backend nepotvrdil číslo hlášení. Nic nepotvrzuju jako zapsané.",
        answerText: "Backend nepotvrdil číslo hlášení. Nic nepotvrzuju jako zapsané.",
        intent: result.intent || "driver_part_request",
        verified: result.verified === true,
        requiresConfirmation: false,
        preparedActions: [],
        driverPartRequest: null,
        notificationsSent: false,
        apiStatus: result.apiStatus || "ready",
        code: "driver_part_report_id_missing"
      };
    }

    return {
      ok: result.ok === true && created,
      status,
      message,
      answerText: message,
      intent: result.intent || "driver_part_request",
      verified: result.verified === true,
      requiresConfirmation: status === "needs_confirmation",
      preparedActions: Array.isArray(result.preparedActions) ? result.preparedActions : [],
      driverPartRequest,
      notificationsSent: result.notificationsSent === true,
      apiStatus: result.apiStatus || "ready"
    };
  }

  const tools = {
    async navigate_to(parameters = {}) {
      const result = guardedRoute(parameters.route);

      if (!result.ok) {
        return result;
      }

      navigate(result.route);
      return result;
    },

    async open_module(parameters = {}) {
      const route = routeForAiModule(parameters.moduleId);

      if (!route) {
        return { ok: false, error: "Modul není známý." };
      }

      return this.navigate_to({ route });
    },

    async show_confirmation(parameters = {}) {
      const confirmed = await confirm({
        title: cleanString(parameters.title) || "Potvrdit akci",
        message: cleanString(parameters.message) || "Chceš pokračovat?",
        confirmLabel: cleanString(parameters.confirmLabel) || "Potvrdit",
        cancelLabel: cleanString(parameters.cancelLabel) || "Zrušit"
      });

      return { ok: true, confirmed: Boolean(confirmed) };
    },

    async show_toast(parameters = {}) {
      const type = TOAST_TYPES.has(cleanString(parameters.type)) ? cleanString(parameters.type) : "info";
      const message = cleanString(parameters.message);

      if (!message) {
        return { ok: false, error: "Chybí text zprávy." };
      }

      toast({ type, message });
      return { ok: true, type, message };
    },

    async get_collection_routes_context(parameters = {}) {
      const currentRoute = typeof window !== "undefined"
        ? normalizeAiRoute(window.location?.pathname || "")
        : COLLECTION_ROUTE_GPS_ROUTE;
      const scope = currentRoute === COLLECTION_ROUTE_DRIVER_TEST_ROUTE ? "test" : "production";
      if (![COLLECTION_ROUTE_GPS_ROUTE, COLLECTION_ROUTE_DRIVER_TEST_ROUTE].includes(currentRoute)) {
        return {
          ok: false,
          status: "wrong_module",
          answerText: "Kontext Svozových tras načtu jen na otevřeném řidičském tabletu."
        };
      }
      try {
        const result = await readJson("/api/ai/collection-routes/context", {
          scope,
          date: parameters.date
        });
        return {
          ok: true,
          status: "ready",
          ...(result.context || {}),
          answerText: "Kontext řidiče a trasy je načtený z KSO."
        };
      } catch (error) {
        return {
          ok: false,
          status: "unavailable",
          route: null,
          vehicles: { verified: false, count: 0, items: [] },
          directory: [],
          news: { status: "not_configured", items: [] },
          answerText: error?.payload?.error || "Kontext řidiče a trasy se teď nepodařilo načíst. Nic si nevymýšlej."
        };
      }
    },

    async prepare_collection_route_gps_capture(parameters = {}) {
      const currentRoute = typeof window !== "undefined"
        ? normalizeAiRoute(window.location?.pathname || "")
        : "";
      if (![COLLECTION_ROUTE_GPS_ROUTE, COLLECTION_ROUTE_DRIVER_TEST_ROUTE].includes(currentRoute)) {
        return {
          ok: false,
          status: "wrong_module",
          measurementPrepared: false,
          saved: false,
          finalTapRequired: true,
          vehicleSelectionRequired: false,
          answerText: "GPS stanoviště připravím jen v otevřeném modulu Svozové trasy.",
          messageForAssistant: "Požádej uživatele, aby otevřel Svozové trasy. Neotvírej výběr vozidla."
        };
      }
      if (typeof prepareCollectionRouteGpsCapture !== "function") {
        return {
          ok: false,
          status: "unavailable",
          measurementPrepared: false,
          saved: false,
          finalTapRequired: true,
          vehicleSelectionRequired: false,
          answerText: "GPS měření teď nejde připravit. Použij velké tlačítko Potvrdit GPS stanoviště.",
          messageForAssistant: "GPS měření není dostupné. Neotvírej výběr vozidla."
        };
      }

      try {
        const result = await prepareCollectionRouteGpsCapture({
          ...parameters,
          currentModuleRoute: currentRoute
        });
        return result && typeof result === "object"
          ? result
          : {
              ok: false,
              status: "failed",
              measurementPrepared: false,
              saved: false,
              finalTapRequired: true,
              vehicleSelectionRequired: false,
              answerText: "GPS měření se nepodařilo připravit. Použij velké tlačítko Potvrdit GPS stanoviště."
            };
      } catch (_) {
        return {
          ok: false,
          status: "failed",
          measurementPrepared: false,
          saved: false,
          finalTapRequired: true,
          vehicleSelectionRequired: false,
          answerText: "GPS měření se nepodařilo připravit. Použij velké tlačítko Potvrdit GPS stanoviště.",
          messageForAssistant: "Řekni stručně, že měření selhalo. Neotvírej výběr vozidla."
        };
      }
    },

    async prepare_collection_route_test_incident(parameters = {}) {
      const currentRoute = typeof window !== "undefined"
        ? normalizeAiRoute(window.location?.pathname || "")
        : "";
      const incidentType = cleanString(parameters.incidentType || parameters.incident_type || parameters.type);
      if (![COLLECTION_ROUTE_GPS_ROUTE, COLLECTION_ROUTE_DRIVER_TEST_ROUTE].includes(currentRoute)) {
        return {
          ok: false,
          status: "wrong_module",
          incidentPrepared: false,
          saved: false,
          finalTapRequired: true,
          photoRequired: true,
          sendsNotifications: false,
          changesRoute: false,
          answerText: "Hlášení připravím jen v otevřeném modulu Svozové trasy."
        };
      }
      if (!["overfilled_container", "damaged_container", "site_inaccessible", "container_missing", "contaminated_waste", "site_closed", "other"].includes(incidentType)) {
        return {
          ok: false,
          status: "incident_type_required",
          incidentPrepared: false,
          saved: false,
          finalTapRequired: true,
          photoRequired: true,
          sendsNotifications: false,
          changesRoute: false,
          answerText: "Řekni stručně, co je na stanovišti špatně."
        };
      }
      if (typeof prepareCollectionRouteTestIncident !== "function") {
        return {
          ok: false,
          status: "unavailable",
          incidentPrepared: false,
          saved: false,
          finalTapRequired: true,
          photoRequired: true,
          sendsNotifications: false,
          changesRoute: false,
          answerText: "Hlášení teď nejde hlasem připravit. Použij velké tlačítko Hlášení pro dispečink."
        };
      }
      try {
        const result = await prepareCollectionRouteTestIncident({
          ...parameters,
          incidentType,
          currentModuleRoute: currentRoute
        });
        return result && typeof result === "object"
          ? result
          : {
              ok: false,
              status: "failed",
              incidentPrepared: false,
              saved: false,
              finalTapRequired: true,
              photoRequired: true,
              sendsNotifications: false,
              changesRoute: false,
              answerText: "TEST hlášení se nepodařilo připravit. Použij jedno ze tří velkých tlačítek."
            };
      } catch (_) {
        return {
          ok: false,
          status: "failed",
          incidentPrepared: false,
          saved: false,
          finalTapRequired: true,
          photoRequired: true,
          sendsNotifications: false,
          changesRoute: false,
          answerText: "TEST hlášení se nepodařilo připravit. Použij jedno ze tří velkých tlačítek."
        };
      }
    },

    async prepare_collection_route_driver_action(parameters = {}) {
      const currentRoute = typeof window !== "undefined"
        ? normalizeAiRoute(window.location?.pathname || "")
        : "";
      const action = cleanString(parameters.action).toLowerCase();
      if (![COLLECTION_ROUTE_GPS_ROUTE, COLLECTION_ROUTE_DRIVER_TEST_ROUTE].includes(currentRoute)) {
        return {
          ok: false,
          status: "wrong_module",
          prepared: false,
          saved: false,
          finalTapRequired: true,
          answerText: "Tento krok připravím jen na otevřeném řidičském tabletu Svozových tras."
        };
      }
      if (!["done", "break", "dump", "route", "navigation"].includes(action)) {
        return {
          ok: false,
          status: "action_required",
          prepared: false,
          saved: false,
          finalTapRequired: true,
          answerText: "Řekni, jestli chceš potvrdit stanoviště, přestávku, výsyp, celou trasu nebo navigaci."
        };
      }
      if (typeof prepareCollectionRouteDriverAction !== "function") {
        return {
          ok: false,
          status: "unavailable",
          prepared: false,
          saved: false,
          finalTapRequired: true,
          answerText: "Krok teď nejde připravit hlasem. Použij velké tlačítko na tabletu."
        };
      }
      try {
        return await prepareCollectionRouteDriverAction({
          ...parameters,
          action,
          currentModuleRoute: currentRoute
        });
      } catch (_) {
        return {
          ok: false,
          status: "failed",
          prepared: false,
          saved: false,
          finalTapRequired: true,
          answerText: "Krok se nepodařilo připravit. Použij velké tlačítko na tabletu."
        };
      }
    },

    async show_driver_vehicle_picker(parameters = {}) {
      return showDriverVehiclePicker(parameters);
    },

    async get_driver_vehicle_picker_selection(parameters = {}) {
      return getDriverVehiclePickerSelection(parameters);
    },

    async highlight_element(parameters = {}) {
      const selector = cleanString(parameters.selector);
      const message = cleanString(parameters.message);

      if (isDriverVehicleHighlightAttempt(parameters)) {
        return {
          ok: false,
          errorCode: "DRIVER_VEHICLE_PICKER_REQUIRED",
          message: DRIVER_REPORT_PICKER_OR_SPZ_MESSAGE,
          messageForAssistant: "Vozidlo nejde vybrat slovem toto ani zvýrazněním. Otevři výběr vozidla v aplikaci, nebo požádej o značku, typ nebo SPZ vozidla.",
          vehiclesVerified: false,
          vehicles: [],
          vehiclesCount: 0
        };
      }

      if (!selector || selector.length > 160 || typeof document === "undefined") {
        return { ok: false, error: "Selector není platný." };
      }

      let element = null;
      try {
        element = document.querySelector(selector);
      } catch {
        return { ok: false, error: "Selector není platný." };
      }

      if (!element) {
        return { ok: false, error: "Prvek nebyl nalezen." };
      }

      element.classList.add("ai-assistant-highlight");
      window.setTimeout(() => element.classList.remove("ai-assistant-highlight"), 2600);
      highlight({ selector, message });
      return { ok: true, selector, message };
    },

    async search_employee(parameters = {}) {
      const query = cleanString(parameters.query || parameters.name || parameters.q);

      if (!query) {
        return { ok: false, error: "Chybí hledané jméno zaměstnance." };
      }

      const result = await readJson("/api/ai/employees/search", {
        q: query,
        limit: parameters.limit || 5
      });
      const count = Number(result.count || 0);

      return {
        ok: true,
        query: result.query,
        employees: Array.isArray(result.employees) ? result.employees : [],
        count,
        needsDisambiguation: Boolean(result.needsDisambiguation),
        message: count > 1
          ? "Našlo se více zaměstnanců. Požádejte uživatele o upřesnění."
          : count === 1
            ? "Našel se jeden zaměstnanec."
            : "Zaměstnanec nebyl nalezen."
      };
    },

    async get_employee_detail(parameters = {}) {
      return employeeDetailFor(parameters);
    },

    async open_employee_card(parameters = {}) {
      const result = await employeeDetailFor(parameters);
      const route = result.employee?.route || "";

      if (!result.ok || !route) {
        return result;
      }

      const guarded = guardedRoute(route);
      if (!guarded.ok) {
        return guarded;
      }

      navigate(guarded.route);
      return {
        ok: true,
        opened: true,
        route: guarded.route,
        employee: result.employee,
        message: `Otevírám kartu zaměstnance ${result.employee.fullName || ""}.`.trim()
      };
    },

    async get_employee_manager(parameters = {}) {
      const result = await employeeDetailFor(parameters);

      if (!result.ok) {
        return result;
      }

      return {
        ok: true,
        employee: result.employee,
        managerName: result.employee?.managerName || "",
        message: result.employee?.managerName
          ? `Nadřízený zaměstnance ${result.employee.fullName} je ${result.employee.managerName}.`
          : `U zaměstnance ${result.employee?.fullName || ""} není nadřízený vyplněný.`
      };
    },

    async get_employee_absence_summary(parameters = {}) {
      const result = await employeeDetailFor(parameters);

      if (!result.ok) {
        return result;
      }

      return {
        ok: true,
        employee: result.employee,
        vacation: result.employee?.vacation || null,
        absence: result.employee?.absence || null
      };
    },

    async create_absence_request(parameters = {}) {
      return createAbsenceRequest(parameters);
    },

    async create_driver_part_request(parameters = {}) {
      return createDriverPartRequest(parameters);
    },

    async get_driver_report_context(parameters = {}) {
      return getDriverReportContext(parameters);
    },

    async validate_driver_vehicle_spz(parameters = {}) {
      return validateDriverVehicleSpz(parameters);
    },

    async search_user(parameters = {}) {
      const query = cleanString(parameters.query || parameters.name || parameters.q);

      if (!query) {
        return { ok: false, error: "Chybí hledané jméno uživatele." };
      }

      const result = await readJson("/api/ai/users/search", {
        q: query,
        limit: parameters.limit || 5
      });
      const count = Number(result.count || 0);

      return {
        ok: true,
        query: result.query,
        users: Array.isArray(result.users) ? result.users : [],
        count,
        needsDisambiguation: Boolean(result.needsDisambiguation),
        message: count > 1
          ? "Našlo se více uživatelů. Požádejte uživatele o upřesnění."
          : count === 1
            ? "Našel se jeden uživatel."
            : "Uživatel nebyl nalezen."
      };
    },

    async get_user_access_summary(parameters = {}) {
      return userSummaryFor(parameters);
    }
  };

  return tools;
}
