import { modules } from "../../data/modules.js";
import { hasPermission } from "../../permissions.js";
import {
  moduleDisplayLabel,
  neumorphPathForRoute,
  visibleNeumorphModules
} from "../moduleRegistry.js";

function asNumber(value) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function latestItem(items = []) {
  return Array.isArray(items) && items.length ? items[0] : null;
}

function collectionRowsMetrics(collectionRoutes = {}) {
  const summary = collectionRoutes.sourceSummary || {};
  const rows = Array.isArray(collectionRoutes.sourceRows) ? collectionRoutes.sourceRows : [];
  const mappingCounts = summary.mappingCounts || {};
  const mappedEntry = Object.entries(mappingCounts)
    .find(([key]) => String(key || "").toLowerCase().includes("namap"));

  return {
    rowCount: asNumber(summary.rowCount || rows.length),
    containerCount: asNumber(summary.containerCount),
    estimatedMinutes: asNumber(summary.estimatedMinutes),
    estimatedTons: asNumber(summary.estimatedTons),
    mappedCount: asNumber(mappedEntry?.[1]),
    sourceBatch: latestItem(collectionRoutes.sourceBatches),
    previewBatch: latestItem(collectionRoutes.batches)
  };
}

function buildPriorityItems(collectionRoutes = {}) {
  const priorities = [];

  if (collectionRoutes.loading) {
    priorities.push({
      tone: "info",
      title: "Nacitam Trasy svozu",
      text: "Aplikace nacita stejna API data jako puvodni modul."
    });
  }

  if (collectionRoutes.error) {
    priorities.push({
      tone: "danger",
      title: "Trasy svozu se nepodarilo nacist",
      text: collectionRoutes.error
    });
  }

  if (collectionRoutes.sourceImportError) {
    priorities.push({
      tone: "warning",
      title: "Zdroj svozovych tras vyzaduje kontrolu",
      text: collectionRoutes.sourceImportError
    });
  }

  if (Array.isArray(collectionRoutes.issues) && collectionRoutes.issues.length) {
    priorities.push({
      tone: "warning",
      title: "Datove problemy u stanovist",
      text: `${collectionRoutes.issues.length} polozek ceka na kontrolu polohy nebo mapovani.`
    });
  }

  if (!collectionRoutes.loading && collectionRoutes.loaded && !collectionRoutes.sourceBatches?.length) {
    priorities.push({
      tone: "neutral",
      title: "Svozove trasy cekaji na import",
      text: "V systemu zatim neni ulozeny import 13 Excelu pro provozni filtr tras."
    });
  }

  return priorities.slice(0, 4);
}

function buildQuickActions(user, routeHref) {
  const actions = [];

  if (hasPermission(user, "collection-routes", "view")) {
    actions.push({
      label: "Otevrit Trasy svozu",
      detail: "Pracovni filtr, tisk a ridicsky nahled",
      href: routeHref(neumorphPathForRoute("/trasy-svozu/dashboard")),
      tone: "primary"
    });
  }

  if (hasPermission(user, "absence", "create")) {
    actions.push({
      label: "Rychle zadani",
      detail: "Zadost nebo provozni zaznam",
      href: routeHref(neumorphPathForRoute("/dovolena-nemoc/rychle-zadani")),
      tone: "secondary"
    });
  }

  if (hasPermission(user, "vehicle-tracking", "view")) {
    actions.push({
      label: "Sledovani vozidel",
      detail: "Poloha vozidel a provozni stav",
      href: routeHref(neumorphPathForRoute("/sledovani-vozidel")),
      tone: "secondary"
    });
  }

  if (hasPermission(user, "driver-reports", "view")) {
    actions.push({
      label: "Hlaseni ridicu",
      detail: "Servisni hlaseni a pozadavky",
      href: routeHref(neumorphPathForRoute("/hlaseni-ridicu")),
      tone: "secondary"
    });
  }

  return actions;
}

export function createDashboardViewModel({
  user = null,
  routeHref = (route) => route,
  runtime = {}
} = {}) {
  const collectionRoutes = runtime.collectionRoutes || {};
  const rowsMetrics = collectionRowsMetrics(collectionRoutes);
  const visibleModules = visibleNeumorphModules(user);
  const dashboardModule = modules.find((moduleItem) => moduleItem.id === "dashboard") || modules[0];
  const collectionRoutesModule = modules.find((moduleItem) => moduleItem.id === "collection-routes");
  const primaryModules = ["collection-routes", "vehicle-tracking", "driver-reports", "fleet"]
    .map((moduleId) => visibleModules.find((moduleItem) => moduleItem.id === moduleId))
    .filter(Boolean);

  return {
    dashboardModule,
    collectionRoutesModule,
    visibleModules,
    primaryModules,
    priorities: buildPriorityItems(collectionRoutes),
    quickActions: buildQuickActions(user, routeHref),
    collectionRoutes: {
      ...collectionRoutes,
      metrics: rowsMetrics
    },
    metrics: [
      {
        label: "Moduly dostupne roli",
        value: visibleModules.length,
        detail: "podle stavajicich permissions"
      },
      {
        label: "Zastavky ve filtru",
        value: rowsMetrics.rowCount,
        detail: "Trasy svozu / 13 Excelu"
      },
      {
        label: "Datove problemy",
        value: Array.isArray(collectionRoutes.issues) ? collectionRoutes.issues.length : 0,
        detail: "poloha a mapovani"
      },
      {
        label: "Stanoviste",
        value: Array.isArray(collectionRoutes.sites) ? collectionRoutes.sites.length : 0,
        detail: "z realneho preview API"
      }
    ],
    systemPreviewHref: routeHref(`${neumorphPathForRoute("/")}/system-preview`),
    routeHref,
    moduleLabel: moduleDisplayLabel
  };
}
