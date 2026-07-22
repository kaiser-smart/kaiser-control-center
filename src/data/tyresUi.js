export const TYRES_TABS = Object.freeze([
  { id: "overview", label: "Přehled" },
  { id: "inventory", label: "Pneumatiky" },
  { id: "vehicles", label: "Vozidla" },
  { id: "measurement", label: "Měření" },
  { id: "service", label: "Servis a náklady" },
  { id: "history", label: "Historie" },
  { id: "settings", label: "Nastavení" }
]);

export const TYRES_PAGE_SIZES = Object.freeze([25, 50, 100]);

export const TYRES_OPTIONAL_COLUMNS = Object.freeze([
  { id: "type", label: "Typ" },
  { id: "state", label: "Stav" },
  { id: "location", label: "Umístění" },
  { id: "dot", label: "DOT" },
  { id: "price", label: "Cena bez DPH" },
  { id: "measurement", label: "Poslední měření" }
]);

export function tyresTab(value) {
  return TYRES_TABS.some((tab) => tab.id === value) ? value : "overview";
}

export function tyresInventoryQuery(filters = {}) {
  const params = new URLSearchParams({
    view: "inventory",
    page: String(Math.max(1, Number(filters.page) || 1)),
    pageSize: String(TYRES_PAGE_SIZES.includes(Number(filters.pageSize)) ? Number(filters.pageSize) : 25),
    sort: String(filters.sort || "updated"),
    direction: String(filters.direction || "desc")
  });
  ["q", "manufacturer", "size", "type", "state", "location", "vehicle", "tread", "attention"].forEach((key) => {
    const value = String(filters[key] ?? "").trim();
    if (value) params.set(key, value);
  });
  return `/api/tyres?${params.toString()}`;
}

export function tyresHistoryQuery(history = {}) {
  const params = new URLSearchParams({
    view: "history",
    type: history.type === "services" ? "services" : "measurements",
    page: String(Math.max(1, Number(history.page) || 1)),
    pageSize: String(TYRES_PAGE_SIZES.includes(Number(history.pageSize)) ? Number(history.pageSize) : 25)
  });
  return `/api/tyres?${params.toString()}`;
}

export function tyresServiceTotal(values = {}) {
  return [values.labor, values.material, values.tireCost]
    .map(Number)
    .filter(Number.isFinite)
    .reduce((sum, value) => sum + Math.max(0, value), 0);
}

export function tyresPositionLayout(position, index = 0, configuration = []) {
  const positions = Array.isArray(configuration) && configuration.length ? configuration : [position];
  const normalized = String(position || "").toLocaleLowerCase("cs-CZ");
  const side = /^\d+\s*p|^sp|^(p|hp|vp|zp)|prav/.test(normalized)
    ? "right"
    : /^\d+\s*l|^sl|^(l|hl|vl|zl)|lev/.test(normalized)
      ? "left"
      : index % 2
        ? "right"
        : "left";
  const axle = /vnitř|vnitr/.test(normalized) ? "inner" : /vněj|vnej/.test(normalized) ? "outer" : "single";
  const numericAxle = normalized.match(/^(\d+)/);
  const normalizedPositions = positions.map((item) => String(item || "").toLocaleLowerCase("cs-CZ"));
  const hasExplicitSecondAxle = normalizedPositions.some((item) => /^([2-9]|s[lp])/.test(item));
  const hasDriveAxle = normalizedPositions.some((item) => /^h/.test(item));
  const hasMiddleAxle = normalizedPositions.some((item) => /^v/.test(item));
  let row = Math.floor(index / 2);
  if (numericAxle) row = Math.max(0, Number(numericAxle[1]) - 1);
  else if (/^s[lp]/.test(normalized)) row = 1;
  else if (/^(l|p)$|před/.test(normalized)) row = 0;
  else if (/^h/.test(normalized)) row = hasExplicitSecondAxle ? 2 : 1;
  else if (/^v/.test(normalized)) row = hasDriveAxle ? (hasExplicitSecondAxle ? 3 : 2) : 1;
  else if (/^z|zad/.test(normalized)) {
    if (hasDriveAxle && hasMiddleAxle) row = hasExplicitSecondAxle ? 4 : 3;
    else if (hasMiddleAxle) row = 2;
    else if (hasDriveAxle) row = hasExplicitSecondAxle ? 3 : 2;
    else row = 1;
  }
  return { side, axle, row, top: 52 + row * 96, code: `row-${row}-${side}-${axle}` };
}

export function tyresPositionCode(position, index = 0, configuration = []) {
  return tyresPositionLayout(position, index, configuration).code;
}

export function tyresPositionShortLabel(position) {
  const text = String(position || "").trim();
  if (!text) return "?";
  return text
    .replace(/vnitřní/gi, "vn.")
    .replace(/vnější/gi, "vj.")
    .replace(/přední/gi, "př.")
    .slice(0, 12);
}
