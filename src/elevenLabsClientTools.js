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
  "/datova-schranka",
  "/servis-udrzba",
  "/trasy-svozu",
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
  "data-box": "/datova-schranka",
  "datova-schranka": "/datova-schranka",
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
    name: "highlight_element",
    description: "Dočasně zvýrazní prvek v aktuální obrazovce.",
    parameters: [
      { name: "selector", type: "string", required: true },
      { name: "message", type: "string", required: false }
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
    description: "Zapíše potvrzené hlášení náhradního dílu přes KSO backend. Bez potvrzení nic nezapíše ani neodešle.",
    parameters: [
      { name: "defectDescription", type: "string", required: true },
      { name: "licensePlate", type: "string", required: false },
      { name: "vehicleName", type: "string", required: false },
      { name: "vin", type: "string", required: false },
      { name: "vehicleBrand", type: "string", required: false },
      { name: "confirmed", type: "boolean", required: true },
      { name: "spokenSummary", type: "string", required: false }
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
  requestJson = null
} = {}) {
  function guardedRoute(route) {
    const normalizedRoute = normalizeAiRoute(route);

    if (!normalizedRoute || !isAllowedAiRoute(normalizedRoute)) {
      return { ok: false, error: "Route není povolená.", route: normalizedRoute };
    }

    if (!canUseRoute(normalizedRoute)) {
      return { ok: false, error: "Nemáte oprávnění k této části aplikace.", route: normalizedRoute };
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
      throw new Error(payload.error || "Požadavek se nepodařilo dokončit.");
    }

    return payload;
  }

  const safeRequestJson = requestJson || defaultRequestJson;

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
    const defectDescription = cleanString(
      parameters.defectDescription ||
      parameters.defect_description ||
      parameters.description ||
      parameters.issue ||
      parameters.spokenSummary ||
      parameters.summary
    );
    const licensePlate = cleanString(parameters.licensePlate || parameters.spz || parameters.plate);
    const vehicleName = cleanString(parameters.vehicleName || parameters.vehicle || parameters.car);
    const vin = cleanString(parameters.vin || parameters.VIN);
    const vehicleBrand = cleanString(parameters.vehicleBrand || parameters.brand);
    const confirmed = booleanToolValue(
      parameters.confirmed ??
      parameters.writeConfirmed ??
      parameters.write_confirmed
    );
    const spokenSummary = cleanString(parameters.spokenSummary || parameters.summary || parameters.message);
    const text = spokenSummary || [
      defectDescription,
      licensePlate ? `na autě ${licensePlate}` : "",
      confirmed ? "ano" : ""
    ].filter(Boolean).join(" ");

    let result;

    try {
      result = await postJson("/api/voice/sarlota", {
        transcript: text,
        text,
        intent: "driver_part_request",
        parameters: {
          defectDescription,
          licensePlate,
          vehicleName,
          vin,
          vehicleBrand,
          confirmed,
          writeConfirmed: confirmed
        },
        context: {
          requestedIntent: "driver_part_request",
          defectDescription,
          licensePlate,
          vehicleName,
          vin,
          vehicleBrand,
          confirmed
        },
        metadata: {
          source: "elevenlabs_client_tool"
        }
      });
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

    return {
      ok: result.ok === true,
      status: result.status || "unknown",
      message: result.reply || result.text || "",
      answerText: result.reply || result.text || "",
      intent: result.intent || "driver_part_request",
      verified: result.verified === true,
      requiresConfirmation: result.status === "needs_confirmation",
      preparedActions: Array.isArray(result.preparedActions) ? result.preparedActions : [],
      driverPartRequest: result.driverPartRequest || null,
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
        message: cleanString(parameters.message) || "Chcete pokračovat?",
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

    async highlight_element(parameters = {}) {
      const selector = cleanString(parameters.selector);
      const message = cleanString(parameters.message);

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
