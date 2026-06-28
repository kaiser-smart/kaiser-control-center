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
