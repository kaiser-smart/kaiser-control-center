export const MAIN_DASHBOARD_PERIODS = Object.freeze([
  { id: "today", label: "Dnes", context: "dnešní období" },
  { id: "7d", label: "7 dní", context: "posledních 7 dní" },
  { id: "30d", label: "30 dní", context: "posledních 30 dní" }
]);

export const MAIN_DASHBOARD_ECONOMICS_METRICS = Object.freeze([
  { id: "jobs", label: "Odjeté zakázky", source: "Vozidlo ↔ zakázka" },
  { id: "productive-share", label: "Produktivní km", source: "Historie jízd + zakázka" },
  { id: "revenue-km", label: "Výnos / km", source: "Výnos zakázky / celkové km" },
  { id: "cost-km", label: "Náklad / km", source: "Přímé náklady / celkové km" },
  { id: "contribution", label: "Příspěvek na úhradu", source: "Výnos minus přímé náklady" }
]);

export const MAIN_DASHBOARD_ECONOMICS_SOURCES = Object.freeze([
  { id: "trip-history", label: "Historie jízd", state: "waiting", detail: "Čeká na skutečné GPS body a ujeté úseky." },
  { id: "job-pairing", label: "Párování zakázek", state: "waiting", detail: "Vazba vozidlo → jízda → zakázka není nasazená." },
  {
    id: "cost-data",
    label: "Náklady a PHM",
    state: "running",
    status: "Běží",
    detail: "ORWII PHM se automaticky synchronizuje do D1 a je dostupné pro read-only statistiky. Úplné přímé náklady čekají na další zdroje."
  }
]);

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegative(value) {
  const number = numericOrNull(value);
  return number === null ? null : Math.max(0, number);
}

export function mainDashboardPeriod(periodId = "30d") {
  return MAIN_DASHBOARD_PERIODS.find((period) => period.id === periodId)
    || MAIN_DASHBOARD_PERIODS[MAIN_DASHBOARD_PERIODS.length - 1];
}

export function mainDashboardVehicleSnapshot(validLocations = [], invalidVehicles = []) {
  const locations = Array.isArray(validLocations) ? validLocations : [];
  const invalid = Array.isArray(invalidVehicles) ? invalidVehicles : [];
  const withSpeed = locations
    .map((location) => ({
      location,
      speed: nonNegative(location?.speedKmh ?? location?.speed)
    }))
    .filter((item) => item.speed !== null);
  const moving = withSpeed.filter((item) => item.speed > 2);
  const standing = withSpeed.filter((item) => item.speed <= 2);
  const fastest = withSpeed.reduce((best, item) => (!best || item.speed > best.speed ? item : best), null);

  return {
    total: locations.length + invalid.length,
    movingCount: moving.length,
    standingCount: standing.length,
    unknownMotionCount: Math.max(0, locations.length - withSpeed.length),
    noSignalCount: invalid.length,
    speedCoverage: withSpeed.length,
    fastestLocation: fastest?.location || null,
    fastestSpeed: fastest?.speed ?? null,
    averageMovingSpeed: moving.length
      ? moving.reduce((sum, item) => sum + item.speed, 0) / moving.length
      : null
  };
}

export function mainDashboardDistanceCompositionRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const productiveKm = nonNegative(row?.productiveKm) ?? 0;
    const deadheadKm = nonNegative(row?.deadheadKm) ?? 0;
    const explicitUnclassifiedKm = nonNegative(row?.unclassifiedKm);
    const suppliedTotalKm = nonNegative(row?.totalKm);
    const classifiedKm = productiveKm + deadheadKm;
    const totalKm = Math.max(suppliedTotalKm ?? classifiedKm + (explicitUnclassifiedKm ?? 0), classifiedKm);
    const unclassifiedKm = explicitUnclassifiedKm ?? Math.max(0, totalKm - classifiedKm);
    const denominator = Math.max(totalKm, classifiedKm + unclassifiedKm);

    return {
      id: String(row?.id || `vehicle-${index + 1}`),
      label: String(row?.label || row?.name || `Vozidlo ${index + 1}`),
      productiveKm,
      deadheadKm,
      unclassifiedKm,
      totalKm: denominator,
      productiveShare: denominator > 0 ? productiveKm / denominator : null,
      classifiedCoverage: denominator > 0 ? classifiedKm / denominator : null
    };
  }).filter((row) => row.totalKm > 0);
}

export function mainDashboardUnitEconomicsRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const totalKm = nonNegative(row?.totalKm);
    const revenue = nonNegative(row?.revenue);
    const directCost = nonNegative(row?.directCost);
    const hasComparableValues = totalKm !== null && totalKm > 0 && revenue !== null && directCost !== null;
    const revenuePerKm = hasComparableValues ? revenue / totalKm : null;
    const costPerKm = hasComparableValues ? directCost / totalKm : null;

    return {
      id: String(row?.id || `vehicle-${index + 1}`),
      label: String(row?.label || row?.name || `Vozidlo ${index + 1}`),
      totalKm,
      revenue,
      directCost,
      revenuePerKm,
      costPerKm,
      marginPerKm: hasComparableValues ? revenuePerKm - costPerKm : null,
      comparable: hasComparableValues
    };
  });
}

export function mainDashboardEconomicsReady(sourceStates = {}) {
  return MAIN_DASHBOARD_ECONOMICS_SOURCES.every((source) => sourceStates[source.id] === "ready");
}
