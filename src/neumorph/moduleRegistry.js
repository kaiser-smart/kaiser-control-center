import { ReportsIcon } from "../components/icons/index.js";
import { modules, moduleDashboards } from "../data/modules.js";
import { canViewModule, hasPermission } from "../permissions.js";

export const NEUMORPH_BASE_ROUTE = "/neumorph";

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
    id: "overview",
    label: "Prehled",
    moduleIds: ["dashboard"]
  },
  {
    id: "operations",
    label: "Provoz",
    moduleIds: [
      "collection-routes",
      "vehicle-tracking",
      "fleet",
      "driver-reports",
      "service-maintenance",
      "tyres",
      "sampling-routes"
    ]
  },
  {
    id: "office",
    label: "Agenda",
    moduleIds: ["data-box", "vistos", "absence", "costs", "reports"]
  },
  {
    id: "system",
    label: "Rizeni",
    moduleIds: ["users", "settings", "system-check", "feedback"]
  }
];

const moduleIconNames = {
  dashboard: "dashboard",
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

function normalizePath(path = "/") {
  const [pathname] = String(path || "/").split(/[?#]/);
  const cleaned = pathname.replace(/\/+$/, "") || "/";
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

function canUseModule(user, moduleId) {
  if (!user) {
    return true;
  }

  return canViewModule(user, moduleId);
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

export function buildNeumorphNavigation({ user = null, currentPath = NEUMORPH_BASE_ROUTE } = {}) {
  const currentOriginalPath = originalPathForNeumorphRoute(currentPath);
  const visibleModules = visibleNeumorphModules(user);

  const groups = [
    {
      id: "migration",
      label: "Migrace",
      items: [
        {
          id: "system-preview",
          label: "Systemovy nahled",
          href: NEUMORPH_BASE_ROUTE,
          icon: "dashboard",
          active: normalizePath(currentPath) === NEUMORPH_BASE_ROUTE
        },
        {
          id: "components",
          label: "Komponenty",
          href: `${NEUMORPH_BASE_ROUTE}#components`,
          icon: "components",
          active: false
        }
      ]
    }
  ];

  moduleGroups.forEach((group) => {
    const items = group.moduleIds
      .map((moduleId) => visibleModules.find((moduleItem) => moduleItem.id === moduleId))
      .filter(Boolean)
      .map((moduleItem) => {
        const originalRoute = normalizePath(moduleItem.route);
        const active = currentOriginalPath === originalRoute ||
          currentOriginalPath.startsWith(`${originalRoute}/`);

        return {
          id: moduleItem.id,
          label: moduleItem.title,
          href: neumorphPathForRoute(moduleItem.route),
          icon: moduleIconName(moduleItem.id),
          active,
          planned: moduleItem.disabled === true
        };
      });

    if (items.length) {
      groups.push({ ...group, items });
    }
  });

  return groups;
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
