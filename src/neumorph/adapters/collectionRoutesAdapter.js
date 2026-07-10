import { hasPermission } from "../../permissions.js";

const DAY_OPTIONS = [
  ["all", "vše"],
  ["PO", "pondělí"],
  ["ÚT", "úterý"],
  ["ST", "středa"],
  ["ČT", "čtvrtek"],
  ["PÁ", "pátek"]
];

const WEEK_OPTIONS = [
  ["all", "všechny týdny"],
  ["sudý týden", "sudý týden"],
  ["lichý týden", "lichý týden"],
  ["každý týden", "každý týden"],
  ["měsíční / 1x30", "měsíční / 1x30"]
];

const VEHICLE_OPTIONS = [
  ["all", "všechna auta"],
  ["A", "Auto A"],
  ["B", "Auto B"],
  ["C", "Auto C"]
];

const WASTE_OPTIONS = [
  ["all", "vše"],
  ["SKO", "SKO"],
  ["BIO", "BIO"],
  ["PAPIR", "PAPÍR"],
  ["PLAST", "PLAST"],
  ["SKLO", "SKLO"],
  ["ostatní", "ostatní / neznámé"]
];

const MAPPING_OPTIONS = [
  ["all", "vše"],
  ["namapováno", "namapováno"],
  ["nenamapováno", "nenamapováno"],
  ["nejasné", "nejasné"],
  ["duplicita", "duplicita"],
  ["chybí adresa", "chybí adresa"],
  ["chybí nádoba", "chybí nádoba"],
  ["chybí frekvence", "chybí frekvence"]
];

const SMART_STATUS_OPTIONS = [
  ["all", "vše"],
  ["problemove", "jen problémové"],
  ["namapováno", "namapováno"],
  ["nejasné", "nejasné"],
  ["nenamapováno", "nenamapováno"],
  ["chybí adresa", "chybí adresa"],
  ["chybí nádoba", "chybí nádoba"],
  ["chybí frekvence", "chybí frekvence"],
  ["duplicita", "duplicita"]
];

const SMART_DAY_OPTIONS = [
  ["all", "všechny pracovní dny"],
  ["today", "dnes"],
  ["tomorrow", "zítra"],
  ["after-tomorrow", "pozítří"],
  ["next-workday", "další pracovní den"],
  ["custom", "vlastní datum"]
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function selectedRowKey(row, index) {
  return [
    row?.sourceFile || "",
    row?.sourceSheet || "",
    row?.sourceRowNumber || "",
    row?.routeOrder || "",
    index
  ].map((value) => String(value || "").trim()).join("::");
}

function selectedRouteRow(rows, selectedKey) {
  if (!rows.length) {
    return null;
  }

  if (selectedKey) {
    const found = rows.find((row, index) => selectedRowKey(row, index) === selectedKey);
    if (found) {
      return found;
    }
  }

  return rows[0];
}

function routeSummary(rows = [], fallbackSummary = {}) {
  const base = rows.reduce((summary, row) => {
    summary.rowCount += 1;
    summary.containerCount += asNumber(row?.containerCount);
    summary.estimatedMinutes += asNumber(row?.estimatedServiceMinutes);
    summary.estimatedTons += asNumber(row?.estimatedWeightTons);
    const status = String(row?.vistosMatchStatus || row?.mappingStatus || "-").trim() || "-";
    summary.mappingCounts[status] = (summary.mappingCounts[status] || 0) + 1;
    return summary;
  }, {
    rowCount: 0,
    containerCount: 0,
    estimatedMinutes: 0,
    estimatedTons: 0,
    mappingCounts: {}
  });

  return {
    rowCount: base.rowCount || asNumber(fallbackSummary.rowCount),
    containerCount: base.containerCount || asNumber(fallbackSummary.containerCount),
    estimatedMinutes: base.estimatedMinutes || asNumber(fallbackSummary.estimatedMinutes),
    estimatedTons: base.estimatedTons || asNumber(fallbackSummary.estimatedTons),
    mappingCounts: Object.keys(base.mappingCounts).length ? base.mappingCounts : fallbackSummary.mappingCounts || {}
  };
}

function routeTitle(filters = {}) {
  const day = DAY_OPTIONS.find(([value]) => value === filters.day)?.[1] || "všechny dny";
  const week = WEEK_OPTIONS.find(([value]) => value === filters.week)?.[1] || "všechny týdny";
  const vehicle = VEHICLE_OPTIONS.find(([value]) => value === filters.vehicle)?.[1] || "všechna auta";
  return `${vehicle} / ${day} / ${week}`;
}

function latestBatch(batches = [], selectedId = "") {
  return asArray(batches).find((batch) => batch.id === selectedId) || asArray(batches)[0] || null;
}

export function createCollectionRoutesViewModel({
  user = null,
  runtime = {},
  routeHref = (route) => route
} = {}) {
  const state = runtime.collectionRoutes || {};
  const rows = asArray(state.sourceRows);
  const allRows = asArray(state.sourceAllRows);
  const sourceBatches = asArray(state.sourceBatches);
  const filters = {
    day: state.sourceFilters?.day || "all",
    week: state.sourceFilters?.week || "all",
    vehicle: state.sourceFilters?.vehicle || "all",
    waste: state.sourceFilters?.waste || "all",
    mappingStatus: state.sourceFilters?.mappingStatus || "all"
  };
  const summary = routeSummary(rows, state.sourceSummary || {});
  const selectedBatch = latestBatch(sourceBatches, state.sourceSelectedBatchId);
  const selectedRow = selectedRouteRow(rows, state.sourceDriverSelectedRowKey);
  const selectedIndex = selectedRow ? rows.indexOf(selectedRow) : -1;

  return {
    loaded: Boolean(state.loaded),
    loading: Boolean(state.loading),
    error: state.error || "",
    message: state.message || "",
    apiStatus: state.apiStatus || "waiting",
    canView: state.canView !== false,
    canManage: Boolean(state.canManage || hasPermission(user, "collection-routes", "manage")),
    routeHref,
    rows,
    allRows,
    sourceBatches,
    sourceFiles: asArray(state.sourceFiles),
    sites: asArray(state.sites),
    issues: asArray(state.issues),
    batches: asArray(state.batches),
    filters,
    routeTitle: routeTitle(filters),
    summary,
    selectedBatch,
    selectedRow,
    selectedIndex,
    selectedRowKey: selectedRow ? selectedRowKey(selectedRow, selectedIndex) : "",
    sourceImportLoading: Boolean(state.sourceImportLoading),
    sourceImportMessage: state.sourceImportMessage || "",
    sourceImportError: state.sourceImportError || "",
    sourceVistosMatchLoading: Boolean(state.sourceVistosMatchLoading),
    sourceVistosMatchMessage: state.sourceVistosMatchMessage || "",
    sourceVistosMatchError: state.sourceVistosMatchError || "",
    sourceVistosMatchSummary: state.sourceVistosMatchSummary || null,
    sourceSmartDayKey: state.sourceSmartDayKey || "all",
    sourceSmartCustomDate: state.sourceSmartCustomDate || "",
    sourceSmartStatus: state.sourceSmartStatus || "all",
    sourceRouteView: state.sourceRouteView === "driver" ? "driver" : "print",
    sourceDriverListExpanded: Boolean(state.sourceDriverListExpanded),
    options: {
      days: DAY_OPTIONS,
      weeks: WEEK_OPTIONS,
      vehicles: VEHICLE_OPTIONS,
      wastes: WASTE_OPTIONS,
      mappings: MAPPING_OPTIONS,
      smartDays: SMART_DAY_OPTIONS,
      smartStatuses: SMART_STATUS_OPTIONS
    }
  };
}
