export const ACTIONS = ["view", "create", "edit", "delete", "approve", "export", "manage"];

export const ROLE_LABELS = {
  admin: "Admin",
  management: "Management",
  kancelar: "Kancelář",
  garazmistr: "Garážmistr",
  dispecer: "Dispečer",
  ridic: "Řidič",
  readonly: "Readonly"
};

export const ROLE_DESCRIPTIONS = {
  admin: "Plný přístup ke všem modulům, nastavení, uživatelům a integracím.",
  management: "Vedení firmy, přehledy, náklady, reporty a schvalování.",
  kancelar: "Administrativa, zákazníci, reporty, dovolené a základní práce s uživateli.",
  garazmistr: "Vozidla, servis, pneumatiky, hlášení závad a týmové schvalování.",
  dispecer: "Trasy, svozy, řidiči a provozní přehled.",
  ridic: "Jednoduché zadávání hlášení, dovolené a vlastních provozních údajů.",
  readonly: "Pouze čtení vybraných modulů bez úprav."
};

const ROLE_ALIASES = {
  garage_master: "garazmistr",
  garaz_master: "garazmistr",
  driver: "ridic",
  office: "kancelar",
  dispatcher: "dispecer",
  read_only: "readonly"
};

const MODULE_ALIASES = {
  "vozovy-park": "fleet",
  "hlaseni-ridicu": "driver-reports",
  "servis-udrzba": "service-maintenance",
  pneumatiky: "tyres",
  "trasy-svozu": "collection-routes",
  "trasy-vzorku": "sampling-routes",
  zakaznici: "vistos",
  naklady: "costs",
  reporty: "reports",
  uzivatele: "users",
  nastaveni: "settings",
  "dovolena-nemoc": "absence",
  pripominky: "feedback"
};

function actions(moduleId, actionList) {
  return actionList.map((action) => `${moduleId}:${action}`);
}

export const ROLE_PERMISSIONS = {
  admin: ["*:*"],
  management: [
    ...actions("dashboard", ["view", "export"]),
    ...actions("fleet", ["view", "export"]),
    ...actions("driver-reports", ["view", "export"]),
    ...actions("service-maintenance", ["view", "export"]),
    ...actions("tyres", ["view", "export"]),
    ...actions("collection-routes", ["view", "export"]),
    ...actions("sampling-routes", ["view", "export"]),
    ...actions("vistos", ["view", "export"]),
    ...actions("costs", ["view", "export"]),
    ...actions("reports", ["view", "export"]),
    ...actions("settings", ["view"]),
    ...actions("absence", ["view", "create", "approve", "export"]),
    ...actions("feedback", ["view", "create", "edit", "export"])
  ],
  kancelar: [
    ...actions("dashboard", ["view"]),
    ...actions("vistos", ["view", "edit", "export"]),
    ...actions("costs", ["view", "edit", "export"]),
    ...actions("reports", ["view", "export"]),
    ...actions("users", ["view", "edit"]),
    ...actions("settings", ["view"]),
    ...actions("absence", ["view", "create", "edit", "export"]),
    ...actions("feedback", ["view", "create", "edit", "export"])
  ],
  garazmistr: [
    ...actions("dashboard", ["view"]),
    ...actions("fleet", ["view", "edit"]),
    ...actions("driver-reports", ["view", "edit"]),
    ...actions("service-maintenance", ["view", "create", "edit", "manage"]),
    ...actions("tyres", ["view", "edit", "export"]),
    ...actions("costs", ["view", "export"]),
    ...actions("reports", ["view", "export"]),
    ...actions("absence", ["view", "create", "approve"]),
    ...actions("feedback", ["view", "create"])
  ],
  dispecer: [
    ...actions("dashboard", ["view"]),
    ...actions("fleet", ["view"]),
    ...actions("driver-reports", ["view"]),
    ...actions("collection-routes", ["view", "edit", "manage"]),
    ...actions("sampling-routes", ["view", "edit", "manage"]),
    ...actions("costs", ["view"]),
    ...actions("reports", ["view"]),
    ...actions("absence", ["view", "create", "approve"]),
    ...actions("feedback", ["view", "create"])
  ],
  ridic: [
    ...actions("dashboard", ["view"]),
    ...actions("fleet", ["view"]),
    ...actions("driver-reports", ["view", "create"]),
    ...actions("collection-routes", ["view"]),
    ...actions("absence", ["view", "create"]),
    ...actions("feedback", ["view", "create"])
  ],
  readonly: [
    ...actions("dashboard", ["view"]),
    ...actions("fleet", ["view"]),
    ...actions("driver-reports", ["view"]),
    ...actions("service-maintenance", ["view"]),
    ...actions("tyres", ["view"]),
    ...actions("collection-routes", ["view"]),
    ...actions("sampling-routes", ["view"]),
    ...actions("vistos", ["view"]),
    ...actions("costs", ["view"]),
    ...actions("reports", ["view"]),
    ...actions("absence", ["view"])
  ]
};

export const ROLE_DEFINITIONS = Object.keys(ROLE_LABELS).map((role) => ({
  id: role,
  name: role,
  label: ROLE_LABELS[role],
  description: ROLE_DESCRIPTIONS[role],
  defaultPermissions: ROLE_PERMISSIONS[role].flatMap((permission) => {
    if (permission === "*:*") {
      return [{ moduleId: "*", action: "*", allowed: true }];
    }

    const [moduleId, action] = permission.split(":");
    return [{ moduleId, action, allowed: true }];
  })
}));

export function normalizeRole(role) {
  const key = String(role || "readonly").trim().toLowerCase();
  return ROLE_ALIASES[key] || key || "readonly";
}

export function normalizeModuleId(moduleId) {
  const key = String(moduleId || "").trim();
  return MODULE_ALIASES[key] || key;
}

export function roleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || "Uživatel";
}

export function isUserActive(user) {
  if (!user) {
    return false;
  }

  if (user.active === false) {
    return false;
  }

  const status = String(user.status || "active").toLowerCase();
  return status === "active" || status === "aktivní";
}

function moduleListIncludes(list, moduleId) {
  const normalized = normalizeModuleId(moduleId);
  return Array.isArray(list) && list.some((item) => normalizeModuleId(item) === normalized);
}

function permissionSetForRole(role) {
  return new Set(ROLE_PERMISSIONS[normalizeRole(role)] || ROLE_PERMISSIONS.readonly);
}

function permissionKey(moduleId, action) {
  return `${normalizeModuleId(moduleId)}:${String(action || "view").trim()}`;
}

function rolePermissionSet(user) {
  const role = normalizeRole(user?.role);
  const rolePermissions = user?.rolePermissions?.[role];

  if (Array.isArray(rolePermissions)) {
    return new Set(rolePermissions
      .filter((permission) => permission?.allowed !== false)
      .map((permission) => (
        permission.moduleId === "*" && permission.action === "*"
          ? "*:*"
          : permissionKey(permission.moduleId, permission.action)
      )));
  }

  return permissionSetForRole(role);
}

function explicitPermission(user, moduleId, action) {
  const normalizedModuleId = normalizeModuleId(moduleId);
  const normalizedAction = String(action || "view").trim();
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];

  return permissions.find((permission) => (
    normalizeModuleId(permission.moduleId) === normalizedModuleId &&
    String(permission.action || "").trim() === normalizedAction
  ));
}

export function hasPermission(user, moduleId, action = "view") {
  if (!isUserActive(user)) {
    return false;
  }

  const normalizedModuleId = normalizeModuleId(moduleId);
  const normalizedAction = String(action || "view").trim();

  if (normalizeRole(user?.role) === "admin") {
    return true;
  }

  const userPermission = explicitPermission(user, normalizedModuleId, normalizedAction);
  if (userPermission) {
    return userPermission.allowed === true;
  }

  if (moduleListIncludes(user.deniedModules, normalizedModuleId)) {
    return false;
  }

  if (Array.isArray(user.modules) && user.modules.length > 0 && !moduleListIncludes(user.modules, normalizedModuleId)) {
    return false;
  }

  if (normalizedAction === "view" && moduleListIncludes(user.allowedModules, normalizedModuleId)) {
    return true;
  }

  const permissions = rolePermissionSet(user);
  return (
    permissions.has("*:*") ||
    permissions.has(`${normalizedModuleId}:*`) ||
    permissions.has(`${normalizedModuleId}:${normalizedAction}`)
  );
}

export function canViewModule(user, moduleId) {
  return hasPermission(user, moduleId, "view");
}

export function filterModulesByUser(user, moduleItems) {
  return moduleItems.filter((moduleItem) => canViewModule(user, moduleItem.id));
}

export function requirePermission(user, moduleId, action = "view") {
  if (!hasPermission(user, moduleId, action)) {
    throw new Error("permission_denied");
  }

  return true;
}
