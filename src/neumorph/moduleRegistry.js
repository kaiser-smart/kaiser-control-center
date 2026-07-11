import { QuickAbsenceIcon, ReportsIcon } from "../components/icons/index.js";
import { modules, moduleDashboards } from "../data/modules.js";
import { canViewModule, hasPermission } from "../permissions.js";

export const NEUMORPH_BASE_ROUTE = "/neumorph";
export const NEUMORPH_SYSTEM_PREVIEW_ROUTE = `${NEUMORPH_BASE_ROUTE}/system-preview`;

const feedbackModule = {
  id: "feedback",
  title: "Pripominky",
  description: "Prehled pripominek k modulum, stavu, priorit a internich poznamek.",
  route: "/pripominky",
  icon: ReportsIcon,
  status: "sprava",
  active: true,
  disabled: false,
  order: 15
};

const orderedModules = [...modules, feedbackModule].sort((a, b) => a.order - b.order);

const moduleGroups = [
  {
    id: "main-work",
    label: "Hlavni prace",
    order: 1,
    moduleIds: ["dashboard", "quick-entry", "collection-routes", "driver-reports", "vehicle-tracking"]
  },
  {
    id: "fleet-ops",
    label: "Vozidla a provoz",
    order: 2,
    moduleIds: ["fleet", "service-maintenance", "tyres", "costs"]
  },
  {
    id: "customers-planning",
    label: "Zakaznici a planovani",
    order: 3,
    moduleIds: ["vistos", "sampling-routes", "feedback"]
  },
  {
    id: "administration",
    label: "Administrativa",
    order: 4,
    moduleIds: ["data-box", "absence", "reports"]
  },
  {
    id: "system",
    label: "Sprava systemu",
    order: 5,
    moduleIds: ["users", "system-check", "settings"]
  }
];

const quickEntryModule = {
  id: "quick-entry",
  title: "Rychle zadani",
  description: "Zkraceny vstup pro provozni zaznamy a zadosti.",
  route: "/dovolena-nemoc/rychle-zadani",
  icon: QuickAbsenceIcon,
  status: "mock data",
  active: true,
  disabled: false,
  order: 1.5,
  permissionModuleId: "absence",
  sourceModuleId: "absence"
};

const navigationModules = [...orderedModules, quickEntryModule].sort((a, b) => a.order - b.order);

const moduleIconNames = {
  dashboard: "dashboard",
  "quick-entry": "quick-entry",
  fleet: "fleet",
  "vehicle-tracking": "tracking",
  "data-box": "mail",
  "driver-reports": "driver",
  "service-maintenance": "service",
  tyres: "tyre",
  "collection-routes": "route",
  "sampling-routes": "sampling",
  vistos: "customers",
  costs: "costs",
  reports: "reports",
  absence: "absence",
  users: "users",
  settings: "settings",
  "system-check": "system-check",
  feedback: "feedback"
};

const moduleNavigationMeta = {
  dashboard: {
    label: "Prehled",
    shortLabel: "Prehled",
    group: "main-work",
    order: 1,
    mobilePriority: 1
  },
  "quick-entry": {
    label: "Rychle zadani",
    shortLabel: "Rychle",
    group: "main-work",
    order: 2,
    mobilePriority: 2
  },
  "collection-routes": {
    label: "Trasy svozu",
    shortLabel: "Trasy",
    group: "main-work",
    order: 3,
    mobilePriority: 3
  },
  "driver-reports": {
    label: "Hlaseni ridicu",
    shortLabel: "Hlaseni",
    group: "main-work",
    order: 4,
    mobilePriority: 8
  },
  "vehicle-tracking": {
    label: "Sledovani vozidel",
    shortLabel: "Sledovani",
    group: "main-work",
    order: 5,
    mobilePriority: 6
  },
  fleet: {
    label: "Vozovy park",
    shortLabel: "Vozidla",
    group: "fleet-ops",
    order: 1,
    mobilePriority: 4
  },
  "service-maintenance": {
    label: "Servis a udrzba",
    shortLabel: "Servis",
    group: "fleet-ops",
    order: 2,
    mobilePriority: 10
  },
  tyres: {
    label: "Pneumatiky",
    shortLabel: "Pneu",
    group: "fleet-ops",
    order: 3,
    mobilePriority: 11
  },
  costs: {
    label: "Naklady",
    shortLabel: "Naklady",
    group: "fleet-ops",
    order: 4,
    mobilePriority: 12
  },
  vistos: {
    label: "Zakaznici",
    shortLabel: "Zakaznici",
    group: "customers-planning",
    order: 1,
    mobilePriority: 7
  },
  "sampling-routes": {
    label: "Trasy vzorku",
    shortLabel: "Vzorky",
    group: "customers-planning",
    order: 2,
    mobilePriority: 13
  },
  feedback: {
    label: "Pripominky",
    shortLabel: "Pripominky",
    group: "customers-planning",
    order: 3,
    mobilePriority: 14
  },
  "data-box": {
    label: "Datova schranka",
    shortLabel: "Schranka",
    group: "administration",
    order: 1,
    mobilePriority: 15
  },
  absence: {
    label: "Dovolena a nemoc",
    shortLabel: "Absence",
    group: "administration",
    order: 2,
    mobilePriority: 9
  },
  reports: {
    label: "Reporty",
    shortLabel: "Reporty",
    group: "administration",
    order: 3,
    mobilePriority: 16
  },
  users: {
    label: "Uzivatele a role",
    shortLabel: "Uzivatele",
    group: "system",
    order: 1,
    mobilePriority: 17
  },
  "system-check": {
    label: "Kontrola systemu",
    shortLabel: "Kontrola",
    group: "system",
    order: 2,
    mobilePriority: 18
  },
  settings: {
    label: "Nastaveni",
    shortLabel: "Nastaveni",
    group: "system",
    order: 3,
    mobilePriority: 19
  }
};

function normalizePath(path = "/") {
  const [pathname] = String(path || "/").split(/[?#]/);
  const cleaned = pathname.replace(/\/+$/, "") || "/";
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

function permissionModuleId(moduleItemOrId) {
  if (typeof moduleItemOrId === "string") {
    return moduleNavigationMeta[moduleItemOrId]?.permissionModuleId || moduleItemOrId;
  }

  return moduleItemOrId?.permissionModuleId || moduleItemOrId?.id || "";
}

function canUseModule(user, moduleItemOrId) {
  if (!user) {
    return true;
  }

  return canViewModule(user, permissionModuleId(moduleItemOrId));
}

export function neumorphPathForRoute(route = "/") {
  const normalizedRoute = normalizePath(route);
  return normalizedRoute === "/" ? NEUMORPH_BASE_ROUTE : `${NEUMORPH_BASE_ROUTE}${normalizedRoute}`;
}

export function originalPathForNeumorphRoute(path = NEUMORPH_BASE_ROUTE) {
  const normalizedPath = normalizePath(path);

  if (normalizedPath === NEUMORPH_BASE_ROUTE) {
    return "/";
  }

  if (!normalizedPath.startsWith(`${NEUMORPH_BASE_ROUTE}/`)) {
    return "";
  }

  return normalizePath(normalizedPath.slice(NEUMORPH_BASE_ROUTE.length));
}

export function moduleIconName(moduleId) {
  return moduleIconNames[moduleId] || "module";
}

export function moduleDisplayLabel(moduleItemOrId) {
  const moduleId = typeof moduleItemOrId === "string" ? moduleItemOrId : moduleItemOrId?.id;
  return moduleNavigationMeta[moduleId]?.label || moduleItemOrId?.title || moduleId || "";
}

export function moduleShortLabel(moduleItemOrId) {
  const moduleId = typeof moduleItemOrId === "string" ? moduleItemOrId : moduleItemOrId?.id;
  return moduleNavigationMeta[moduleId]?.shortLabel || moduleDisplayLabel(moduleItemOrId);
}

export function moduleGroupId(moduleItemOrId) {
  const moduleId = typeof moduleItemOrId === "string" ? moduleItemOrId : moduleItemOrId?.id;
  return moduleNavigationMeta[moduleId]?.group || "main-work";
}

export function moduleGroupLabel(moduleItemOrId) {
  const groupId = typeof moduleItemOrId === "string" && moduleGroups.some((group) => group.id === moduleItemOrId)
    ? moduleItemOrId
    : moduleGroupId(moduleItemOrId);
  return moduleGroups.find((group) => group.id === groupId)?.label || "Kaiser Smart";
}

export function moduleStatusLabel(moduleItem) {
  return {
    HOTOVO: "Hotovo",
    "připraveno": "Pripraveno",
    skeleton: "Novy",
    "mock data": "Rozpracovano",
    ROZPRACOVÁN: "Rozpracovano",
    sprava: "Sprava",
    "Read-only pilot": "Read-only pilot",
    Testování: "Testovani",
    NEOVĚŘENO: "Neovereno"
  }[moduleItem?.status] || moduleItem?.status || "Rozpracovano";
}

export function moduleMigrationLabel(moduleItem) {
  const status = String(moduleItem?.status || "").toLowerCase();

  if (moduleItem?.disabled) {
    return "Planovano";
  }

  if (status.includes("hotovo")) {
    return "Dostupna funkcni neumorph varianta";
  }

  if (status.includes("pilot") || status.includes("test") || status.includes("rozprac")) {
    return "Probiha migrace";
  }

  return "Pripraveno k migraci";
}

export function moduleStatusTone(moduleItem) {
  const status = String(moduleItem?.status || "").toLowerCase();

  if (status.includes("hotovo") || status.includes("pripraveno") || status.includes("připraveno")) {
    return "success";
  }

  if (status.includes("pilot") || status.includes("test")) {
    return "info";
  }

  if (status.includes("neover") || status.includes("neově")) {
    return "warning";
  }

  return "neutral";
}

export function neumorphRouteEntries() {
  const primaryEntries = orderedModules.map((moduleItem) => ({
    id: moduleItem.id,
    type: "module",
    module: moduleItem,
    originalRoute: normalizePath(moduleItem.route),
    href: neumorphPathForRoute(moduleItem.route)
  }));

  const dashboardEntries = moduleDashboards.map((moduleItem) => ({
    id: `${moduleItem.id}:dashboard`,
    type: "dashboard",
    module: moduleItem,
    originalRoute: normalizePath(moduleItem.route),
    href: neumorphPathForRoute(moduleItem.route)
  }));

  return [...primaryEntries, ...dashboardEntries];
}

export function visibleNeumorphModules(user) {
  return orderedModules.filter((moduleItem) => canUseModule(user, moduleItem.id));
}

export function visibleNavigationModules(user) {
  return navigationModules.filter((moduleItem) => canUseModule(user, moduleItem));
}

function navigationItemForModule(moduleItem, currentOriginalPath) {
  const meta = moduleNavigationMeta[moduleItem.id] || {};
  const originalRoute = normalizePath(moduleItem.route);
  const active = currentOriginalPath === originalRoute ||
    currentOriginalPath.startsWith(`${originalRoute}/`) ||
    (moduleItem.sourceModuleId && currentOriginalPath.startsWith(`/${moduleItem.sourceModuleId}/`));

  return {
    id: moduleItem.id,
    label: meta.label || moduleItem.title,
    shortLabel: meta.shortLabel || meta.label || moduleItem.title,
    href: neumorphPathForRoute(moduleItem.route),
    route: moduleItem.route,
    group: meta.group || moduleGroupId(moduleItem),
    order: meta.order ?? moduleItem.order ?? 100,
    permission: permissionModuleId(moduleItem),
    icon: moduleIconName(moduleItem.id),
    active,
    disabled: moduleItem.disabled === true,
    planned: moduleItem.disabled === true,
    mobilePriority: meta.mobilePriority ?? 99,
    activeMatch: [originalRoute],
    module: moduleItem
  };
}

export function buildNeumorphNavigationItems({ user = null, currentPath = NEUMORPH_BASE_ROUTE } = {}) {
  const currentOriginalPath = originalPathForNeumorphRoute(currentPath);

  return visibleNavigationModules(user)
    .map((moduleItem) => navigationItemForModule(moduleItem, currentOriginalPath))
    .sort((a, b) => {
      if (a.group !== b.group) {
        const groupA = moduleGroups.find((group) => group.id === a.group)?.order ?? 100;
        const groupB = moduleGroups.find((group) => group.id === b.group)?.order ?? 100;
        return groupA - groupB;
      }

      return a.order - b.order;
    });
}

export function buildNeumorphNavigation({ user = null, currentPath = NEUMORPH_BASE_ROUTE } = {}) {
  const navigationItems = buildNeumorphNavigationItems({ user, currentPath })
    .filter((item) => item.id !== "dashboard");

  const groups = [
    {
      id: "overview",
      label: "Prehled",
      items: [
        {
          id: "home",
          label: "Prehled",
          shortLabel: "Prehled",
          href: NEUMORPH_BASE_ROUTE,
          route: NEUMORPH_BASE_ROUTE,
          group: "migration",
          order: 0,
          permission: "dashboard",
          icon: "dashboard",
          mobilePriority: 1,
          activeMatch: [NEUMORPH_BASE_ROUTE],
          active: normalizePath(currentPath) === NEUMORPH_BASE_ROUTE
        }
      ]
    }
  ];

  moduleGroups.forEach((group) => {
    const items = navigationItems.filter((item) => item.group === group.id);

    if (items.length) {
      groups.push({ ...group, items });
    }
  });

  groups.push({
    id: "system-preview",
    label: "System",
    items: [
      {
        id: "system-preview",
        label: "System preview",
        shortLabel: "System",
        href: NEUMORPH_SYSTEM_PREVIEW_ROUTE,
        route: NEUMORPH_SYSTEM_PREVIEW_ROUTE,
        group: "system-preview",
        order: 1,
        permission: "dashboard",
        icon: "components",
        mobilePriority: 20,
        activeMatch: [NEUMORPH_SYSTEM_PREVIEW_ROUTE],
        active: normalizePath(currentPath) === NEUMORPH_SYSTEM_PREVIEW_ROUTE
      }
    ]
  });

  return groups;
}

export function buildNeumorphMobileNavigation({ user = null, currentPath = NEUMORPH_BASE_ROUTE, maxItems = 4 } = {}) {
  const groups = buildNeumorphNavigation({ user, currentPath });
  const items = groups
    .flatMap((group) => group.items.map((item) => ({ ...item, groupLabel: group.label })))
    .filter((item) => !item.disabled && !item.planned)
    .sort((a, b) => (a.mobilePriority ?? 99) - (b.mobilePriority ?? 99));

  const primaryItems = items.slice(0, maxItems);
  const primaryIds = new Set(primaryItems.map((item) => item.id));
  const moreGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !primaryIds.has(item.id))
    }))
    .filter((group) => group.items.length);

  return {
    primaryItems,
    moreGroups
  };
}

function findExactRouteEntry(originalPath) {
  return neumorphRouteEntries().find((entry) => entry.originalRoute === originalPath) || null;
}

function findNearestModule(originalPath) {
  return orderedModules
    .filter((moduleItem) => {
      const route = normalizePath(moduleItem.route);
      return originalPath === route || originalPath.startsWith(`${route}/`);
    })
    .sort((a, b) => normalizePath(b.route).length - normalizePath(a.route).length)[0] || null;
}

export function resolveNeumorphRoute({ path = NEUMORPH_BASE_ROUTE, user = null } = {}) {
  const normalizedPath = normalizePath(path);

  if (normalizedPath === NEUMORPH_BASE_ROUTE) {
    return {
      view: "home",
      path: normalizedPath,
      originalPath: "/"
    };
  }

  if (normalizedPath === NEUMORPH_SYSTEM_PREVIEW_ROUTE) {
    return {
      view: "system-preview",
      path: normalizedPath,
      originalPath: "/system-preview"
    };
  }

  const originalPath = originalPathForNeumorphRoute(normalizedPath);

  if (!originalPath) {
    return {
      view: "not-found",
      path: normalizedPath,
      originalPath: ""
    };
  }

  const exactEntry = findExactRouteEntry(originalPath);
  const moduleItem = exactEntry?.module || findNearestModule(originalPath);

  if (!moduleItem) {
    return {
      view: "not-found",
      path: normalizedPath,
      originalPath
    };
  }

  if (!canUseModule(user, moduleItem.id)) {
    return {
      view: "forbidden",
      path: normalizedPath,
      originalPath,
      module: moduleItem
    };
  }

  return {
    view: "module",
    path: normalizedPath,
    originalPath,
    module: moduleItem,
    entryType: exactEntry?.type || "detail",
    isDashboard: exactEntry?.type === "dashboard"
  };
}

export function modulePermissionSummary(user, moduleId) {
  if (!user) {
    return ["nahled"];
  }

  return ["view", "create", "edit", "manage", "export", "approve"]
    .filter((action) => hasPermission(user, moduleId, action));
}
