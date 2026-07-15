export const ORWII_FUEL_PERIODS = Object.freeze([
  { id: "today", label: "Dnes" },
  { id: "7d", label: "7 dní" },
  { id: "30d", label: "30 dní" },
  { id: "12m", label: "12 měsíců" },
  { id: "all", label: "Vše" }
]);

export function orwiiFuelPeriod(periodId = "30d") {
  return ORWII_FUEL_PERIODS.find((period) => period.id === periodId)
    || ORWII_FUEL_PERIODS.find((period) => period.id === "30d");
}

export function orwiiFuelSummary(analytics = {}) {
  const source = analytics?.summary || {};
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const nullableNumber = (value) => value === null || value === undefined || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  return {
    transactionCount: number(source.transactionCount),
    liters: number(source.liters),
    totalCost: nullableNumber(source.totalCost),
    averageUnitPrice: nullableNumber(source.averageUnitPrice),
    matchedCount: number(source.matchedCount),
    unmatchedCount: number(source.unmatchedCount),
    ambiguousCount: number(source.ambiguousCount),
    matchCoverage: number(source.matchCoverage)
  };
}

export function orwiiFuelVehicleSummary(analytics = {}, vehicleId = "") {
  const id = String(vehicleId || "").trim();
  if (!id) return null;
  return (Array.isArray(analytics?.byVehicle) ? analytics.byVehicle : [])
    .find((row) => String(row?.key || "").trim() === id) || null;
}

export function filterOrwiiFuelTransactions(transactions = [], filters = {}) {
  const search = String(filters.search || "").trim().toLocaleLowerCase("cs-CZ");
  const status = String(filters.status || "all").trim();
  const fuelType = String(filters.fuelType || "all").trim();
  return (Array.isArray(transactions) ? transactions : []).filter((item) => {
    if (status !== "all" && String(item?.matchStatus || "unmatched") !== status) return false;
    if (fuelType !== "all" && String(item?.fuelType || "Neuvedeno") !== fuelType) return false;
    if (!search) return true;
    return [item?.licensePlate, item?.fuelChipId, item?.orwiiVehicleId, item?.externalId, item?.fuelType]
      .some((value) => String(value || "").toLocaleLowerCase("cs-CZ").includes(search));
  });
}
