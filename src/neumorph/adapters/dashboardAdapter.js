import { QuickAbsenceIcon, ReportsIcon } from "../../components/icons/index.js";
import { DATA_BOX_MODULE_KEY } from "../../data/dataBox.js";
import { modules } from "../../data/modules.js";
import { canViewModule, filterModulesByUser, hasPermission } from "../../permissions.js";
import { assertDashboardParityViewModel } from "../parityManifest.js";

const APP_NAME = "Smart odpady";
const HOME_SUBTITLE = "Provozní systém pro odpady, vozidla a trasy";
const ABSENCE_QUICK_ROUTE = "/dovolena-nemoc/rychle-zadani";
const QUICK_ABSENCE_ENTRY_HASH = "#co-potrebujete";
const QUICK_ABSENCE_ENTRY_ROUTE = `${ABSENCE_QUICK_ROUTE}${QUICK_ABSENCE_ENTRY_HASH}`;

const orderedModules = [...modules].sort((a, b) => a.order - b.order);
const previewDashboardUser = {
  id: "neumorph-dashboard-preview",
  role: "management",
  active: true,
  status: "active",
  previewOnly: true
};

const quickAbsenceMenuItem = {
  id: "quick-absence",
  title: "Rychlé zadání",
  description: "Nepřítomnost na pár kliknutí nebo hlasem přímo z mobilu.",
  route: QUICK_ABSENCE_ENTRY_ROUTE,
  icon: QuickAbsenceIcon,
  status: "ROZPRACOVÁN",
  active: true,
  disabled: false,
  order: 0
};

const feedbackMenuItem = {
  id: "feedback",
  title: "Připomínky",
  description: "Přehled připomínek k modulům, stavů, priorit a interních poznámek.",
  route: "/pripominky",
  icon: ReportsIcon,
  status: "správa",
  active: true,
  disabled: false,
  order: 15
};

function moduleStatusLabel(moduleItem) {
  return {
    HOTOVO: "Hotovo",
    "připraveno": "Rozpracováno",
    skeleton: "Nový",
    "mock data": "Rozpracováno",
    ROZPRACOVÁN: "Rozpracováno",
    správa: ""
  }[moduleItem?.status] || moduleItem?.status || "";
}

function moduleStatusTone(moduleItem) {
  if (moduleItem?.status === "HOTOVO") {
    return "done";
  }

  if (moduleItem?.status === "skeleton") {
    return "new";
  }

  return "progress";
}

function visibleModules(user) {
  return filterModulesByUser(user, orderedModules);
}

function menuModules(user) {
  const items = visibleModules(user);

  if (canViewModule(user, feedbackMenuItem.id)) {
    return [...items, feedbackMenuItem];
  }

  return items;
}

function routeForModuleCard(moduleItem) {
  return moduleItem.route;
}

function homeModulesForUser(user) {
  const effectiveUser = user || previewDashboardUser;

  return hasPermission(effectiveUser, "absence", "create")
    ? [quickAbsenceMenuItem, ...menuModules(effectiveUser)]
    : menuModules(effectiveUser);
}

function moduleCardViewModel(moduleItem, routeHref, runtime) {
  const sourceRoute = routeForModuleCard(moduleItem);
  const statusLabel = moduleStatusLabel(moduleItem);
  const dataBoxUnreadCount = moduleItem.id === DATA_BOX_MODULE_KEY
    ? Number(runtime.dataBox?.unreadCount || 0)
    : 0;

  return {
    id: moduleItem.id,
    title: moduleItem.title,
    description: moduleItem.description,
    sourceRoute,
    href: routeHref(sourceRoute),
    moduleItem,
    statusLabel,
    statusTone: statusLabel ? moduleStatusTone(moduleItem) : "",
    dataBoxUnreadCount,
    dataBoxUnreadLabel: "Nové datové zprávy"
  };
}

export function createDashboardViewModel({
  user = null,
  routeHref = (route) => route,
  runtime = {}
} = {}) {
  const moduleCards = homeModulesForUser(user)
    .map((moduleItem) => moduleCardViewModel(moduleItem, routeHref, runtime));
  const completedCount = moduleCards.filter((card) => card.moduleItem.status === "HOTOVO").length;
  const dashboardModule = modules.find((moduleItem) => moduleItem.id === "dashboard") || modules[0];

  const viewModel = {
    appName: APP_NAME,
    subtitle: HOME_SUBTITLE,
    dashboardModule,
    moduleCount: moduleCards.length,
    completedCount,
    moduleCards,
    sectionOrder: ["hero", "module-grid", "version-news", "version-backup"],
    routeHref
  };

  assertDashboardParityViewModel(viewModel);

  return viewModel;
}
