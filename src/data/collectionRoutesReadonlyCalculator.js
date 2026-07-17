import { COLLECTION_ROUTE_VEHICLES } from "./collectionRouteVehicles.js";

export const COLLECTION_ROUTES_READONLY_CALCULATOR_VERSION = "1.1";

const SERVICE_MINUTES_BY_VOLUME = Object.freeze({
  120: 3,
  240: 3,
  1100: 5
});

const WEIGHT_TONS_BY_WASTE_AND_VOLUME = Object.freeze({
  SKO: Object.freeze({ 120: 0.006, 240: 0.015, 1100: 0.06 }),
  PAPIR: Object.freeze({ 120: 0.002, 240: 0.004, 1100: 0.02 }),
  PLAST: Object.freeze({ 120: 0.002, 240: 0.004, 1100: 0.02 }),
  SKLO: Object.freeze({ 120: 0.002, 240: 0.003, 1100: 0.014 })
});

const VEHICLES = Object.freeze(COLLECTION_ROUTE_VEHICLES.map((vehicle) => Object.freeze({
  code: vehicle.code,
  registration: vehicle.registration,
  label: vehicle.label,
  capacities: vehicle.capacitiesTons,
  technical: vehicle.technical
})));

const WASTE_ORDER = Object.freeze(["SKO", "PAPIR", "PLAST", "BIO", "SKLO", "OSTATNI"]);

const WASTE_LABELS = Object.freeze({
  SKO: "SKO",
  PAPIR: "PAPÍR",
  PLAST: "PLAST",
  BIO: "BIO",
  SKLO: "SKLO",
  OSTATNI: "OSTATNÍ"
});

const OPERATING_WINDOWS = Object.freeze({
  SKO: Object.freeze({
    label: "SAKO · 06:00–17:00",
    status: "verify",
    note: "Před ostrou trasou je nutné ověřit svátek nebo odstávku."
  }),
  PAPIR: Object.freeze({
    label: "Hamburger Recycling · 06:00–14:30",
    status: "verify",
    note: "Ve svátek nepracuje; sváteční režim tento pilot neověřuje."
  }),
  PLAST: Object.freeze({
    label: "FCC Brno · čas nepotvrzen",
    status: "blocked",
    note: "Interní a veřejná provozní doba jsou v rozporu."
  }),
  BIO: Object.freeze({
    label: "BIO Brno · výsyp nepotvrzen",
    status: "blocked",
    note: "Fertia je schválená jen pro BIO Blansko, ne pro syntetická stanoviště Brno."
  }),
  SKLO: Object.freeze({
    label: "SKLO · výsyp nepotvrzen",
    status: "blocked",
    note: "Mantra zatím neobsahuje schválené místo ani provozní dobu pro sklo."
  }),
  OSTATNI: Object.freeze({
    label: "Výsyp neurčen",
    status: "blocked",
    note: "Druh odpadu nemá potvrzené provozní pravidlo."
  })
});

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizedText(value) {
  return cleanString(value)
    .toLocaleUpperCase("cs")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rounded(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((numberValue(value) + Number.EPSILON) * factor) / factor;
}

export function collectionRoutesCalculatorWasteType(value) {
  const text = normalizedText(value);
  if (/\bSKO\b|SMESN|KOMUNAL/.test(text)) return "SKO";
  if (/PAPIR|LEPENK|KARTON/.test(text)) return "PAPIR";
  if (/PLAST/.test(text)) return "PLAST";
  if (/\bBIO\b|BIOLOG/.test(text)) return "BIO";
  if (/SKLO/.test(text)) return "SKLO";
  return "OSTATNI";
}

function vehicleCapacity(vehicle, wasteType) {
  const value = Number(vehicle?.capacities?.[wasteType]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function sourceRowsById(sourceRows = []) {
  return new Map(sourceRows.map((row) => [cleanString(row?.id), row]).filter(([id]) => id));
}

function calculatedStop(eligibleRow, sourceRow, index) {
  const summary = sourceRow?.summary || {};
  const sourceRowId = cleanString(eligibleRow?.sourceRowId || sourceRow?.id);
  const containerVolume = Math.max(0, numberValue(summary.containerVolume ?? eligibleRow?.containerVolume));
  const containerCount = Math.max(1, Math.floor(numberValue(summary.containerCount, 1)));
  const wasteType = collectionRoutesCalculatorWasteType(summary.wasteType || eligibleRow?.wasteType);
  const serviceMinutesPerContainer = SERVICE_MINUTES_BY_VOLUME[containerVolume] || null;
  const unitWeightTons = WEIGHT_TONS_BY_WASTE_AND_VOLUME[wasteType]?.[containerVolume] ?? null;
  return {
    sourceRowId,
    rowNumber: Math.max(0, numberValue(sourceRow?.rowNumber ?? eligibleRow?.rowNumber, index + 1)),
    customerName: cleanString(summary.customerName || eligibleRow?.customerName),
    stationName: cleanString(summary.stationName || summary.siteName || eligibleRow?.stationName),
    wasteType,
    wasteLabel: WASTE_LABELS[wasteType] || wasteType,
    containerVolume,
    containerCount,
    serviceMinutesKnown: Boolean(serviceMinutesPerContainer),
    serviceMinutes: serviceMinutesPerContainer ? serviceMinutesPerContainer * containerCount : 0,
    weightKnown: Number.isFinite(unitWeightTons),
    weightTons: Number.isFinite(unitWeightTons) ? rounded(unitWeightTons * containerCount) : null,
    sourceFound: Boolean(sourceRow),
    latitude: numberValue(summary.latitude, null),
    longitude: numberValue(summary.longitude, null)
  };
}

function emptyVehicle(vehicle) {
  return {
    ...vehicle,
    stopCount: 0,
    containerCount: 0,
    serviceMinutes: 0,
    knownWeightTons: 0,
    unknownWeightStopCount: 0,
    stops: [],
    waste: new Map()
  };
}

function vehicleWasteState(vehicle, wasteType) {
  if (!vehicle.waste.has(wasteType)) {
    vehicle.waste.set(wasteType, {
      wasteType,
      wasteLabel: WASTE_LABELS[wasteType] || wasteType,
      stopCount: 0,
      containerCount: 0,
      serviceMinutes: 0,
      knownWeightTons: 0,
      unknownWeightStopCount: 0
    });
  }
  return vehicle.waste.get(wasteType);
}

function compareAssignmentCandidates(left, right, stop) {
  const leftWaste = left.waste.get(stop.wasteType) || { knownWeightTons: 0 };
  const rightWaste = right.waste.get(stop.wasteType) || { knownWeightTons: 0 };
  const leftCapacity = vehicleCapacity(left, stop.wasteType);
  const rightCapacity = vehicleCapacity(right, stop.wasteType);
  if (stop.weightKnown && leftCapacity && rightCapacity) {
    const leftCapacityRatio = (leftWaste.knownWeightTons + stop.weightTons) / leftCapacity;
    const rightCapacityRatio = (rightWaste.knownWeightTons + stop.weightTons) / rightCapacity;
    if (Math.abs(leftCapacityRatio - rightCapacityRatio) > 1e-9) {
      return leftCapacityRatio - rightCapacityRatio;
    }
  }
  const leftService = left.serviceMinutes + stop.serviceMinutes;
  const rightService = right.serviceMinutes + stop.serviceMinutes;
  if (leftService !== rightService) return leftService - rightService;
  if (left.stopCount !== right.stopCount) return left.stopCount - right.stopCount;
  return left.code.localeCompare(right.code, "cs");
}

function assignStop(vehicle, stop) {
  const waste = vehicleWasteState(vehicle, stop.wasteType);
  vehicle.stops.push(stop);
  vehicle.stopCount += 1;
  vehicle.containerCount += stop.containerCount;
  vehicle.serviceMinutes += stop.serviceMinutes;
  waste.stopCount += 1;
  waste.containerCount += stop.containerCount;
  waste.serviceMinutes += stop.serviceMinutes;
  if (stop.weightKnown) {
    vehicle.knownWeightTons = rounded(vehicle.knownWeightTons + stop.weightTons);
    waste.knownWeightTons = rounded(waste.knownWeightTons + stop.weightTons);
  } else {
    vehicle.unknownWeightStopCount += 1;
    waste.unknownWeightStopCount += 1;
  }
}

function operatingWindow(wasteType) {
  return OPERATING_WINDOWS[wasteType] || OPERATING_WINDOWS.OSTATNI;
}

function summarizedWaste(vehicle, waste) {
  const capacityTons = vehicleCapacity(vehicle, waste.wasteType);
  const loadEquivalent = capacityTons && waste.knownWeightTons > 0
    ? rounded(waste.knownWeightTons / capacityTons, 2)
    : null;
  return {
    ...waste,
    knownWeightTons: rounded(waste.knownWeightTons),
    capacityTons,
    capacityKnown: Boolean(capacityTons),
    loadEquivalent,
    estimatedDumpCount: loadEquivalent ? Math.max(1, Math.ceil(loadEquivalent - 1e-9)) : null,
    operatingWindow: operatingWindow(waste.wasteType)
  };
}

function summarizedVehicle(vehicle) {
  return {
    code: vehicle.code,
    registration: vehicle.registration,
    label: vehicle.label,
    capacities: { ...vehicle.capacities },
    technical: vehicle.technical,
    stopCount: vehicle.stopCount,
    containerCount: vehicle.containerCount,
    serviceMinutes: vehicle.serviceMinutes,
    knownWeightTons: rounded(vehicle.knownWeightTons),
    unknownWeightStopCount: vehicle.unknownWeightStopCount,
    wasteSummaries: [...vehicle.waste.values()]
      .map((waste) => summarizedWaste(vehicle, waste))
      .sort((left, right) => WASTE_ORDER.indexOf(left.wasteType) - WASTE_ORDER.indexOf(right.wasteType)),
    stops: vehicle.stops.map((stop) => ({ ...stop }))
  };
}

function unique(values) {
  return [...new Set(values.map(cleanString).filter(Boolean))];
}

export function calculateCollectionRoutesReadonlyPlan({
  routeDate = "",
  dateInfo = {},
  eligibleRows = [],
  sourceRows = [],
  vehicleCodes = []
} = {}) {
  const requestedVehicleCodes = new Set(
    (Array.isArray(vehicleCodes) ? vehicleCodes : [])
      .map((value) => cleanString(value).toUpperCase())
      .filter(Boolean)
  );
  const availableVehicles = requestedVehicleCodes.size
    ? VEHICLES.filter((vehicle) => requestedVehicleCodes.has(vehicle.code))
    : VEHICLES;
  const sourceMap = sourceRowsById(sourceRows);
  const stops = eligibleRows
    .map((eligibleRow, index) => {
      const sourceRowId = cleanString(eligibleRow?.sourceRowId);
      return calculatedStop(eligibleRow, sourceMap.get(sourceRowId) || null, index);
    })
    .sort((left, right) => {
      const wasteDifference = WASTE_ORDER.indexOf(left.wasteType) - WASTE_ORDER.indexOf(right.wasteType);
      if (wasteDifference) return wasteDifference;
      if (left.rowNumber !== right.rowNumber) return left.rowNumber - right.rowNumber;
      return left.sourceRowId.localeCompare(right.sourceRowId, "cs");
    });

  if (!stops.length) {
    return {
      version: COLLECTION_ROUTES_READONLY_CALCULATOR_VERSION,
      status: "empty",
      statusLabel: "BEZ STANOVIŠŤ",
      routeDate: cleanString(routeDate || dateInfo?.routeDate),
      dateInfo: { ...dateInfo },
      totals: { stopCount: 0, containerCount: 0, serviceMinutes: 0, knownWeightTons: 0, unknownWeightStopCount: 0 },
      vehicles: availableVehicles.map((vehicle) => summarizedVehicle(emptyVehicle(vehicle))),
      blockers: ["Pro vybraný den nejsou žádná ověřená TEST stanoviště."],
      limitations: [],
      createsRoute: false,
      writesData: false,
      sendsNotifications: false
    };
  }

  const vehicles = availableVehicles.map(emptyVehicle);
  if (!vehicles.length) {
    return {
      version: COLLECTION_ROUTES_READONLY_CALCULATOR_VERSION,
      status: "blocked",
      statusLabel: "BLOKOVÁNO",
      routeDate: cleanString(routeDate || dateInfo?.routeDate),
      dateInfo: { ...dateInfo },
      totals: { stopCount: stops.length, containerCount: 0, serviceMinutes: 0, knownWeightTons: 0, unknownWeightStopCount: 0 },
      vehicles: [],
      blockers: ["Pro přípravu návrhu není dostupný žádný povolený vůz."],
      limitations: [],
      createsRoute: false,
      writesData: false,
      sendsNotifications: false
    };
  }
  for (const stop of stops) {
    const selectedVehicle = [...vehicles].sort((left, right) => compareAssignmentCandidates(left, right, stop))[0];
    assignStop(selectedVehicle, stop);
  }

  const presentWasteTypes = new Set(stops.map((stop) => stop.wasteType));
  const blockers = [];
  const missingSources = stops.filter((stop) => !stop.sourceFound).length;
  const unknownService = stops.filter((stop) => !stop.serviceMinutesKnown).length;
  if (missingSources) blockers.push(`${missingSources} stanovišť nemá úplný zdrojový TEST řádek.`);
  if (unknownService) blockers.push(`${unknownService} stanovišť používá nepotvrzený objem nádoby, takže chybí čas obsluhy.`);
  for (const wasteType of WASTE_ORDER) {
    if (!presentWasteTypes.has(wasteType)) continue;
    const window = operatingWindow(wasteType);
    if (window.status === "blocked") blockers.push(`${WASTE_LABELS[wasteType] || wasteType}: ${window.note}`);
    const capacityMissing = availableVehicles.some((vehicle) => !vehicleCapacity(vehicle, wasteType));
    if (capacityMissing) blockers.push(`${WASTE_LABELS[wasteType] || wasteType}: chybí potvrzená hmotnostní kapacita vozidel.`);
    const weightMissing = stops.some((stop) => stop.wasteType === wasteType && !stop.weightKnown);
    if (weightMissing) blockers.push(`${WASTE_LABELS[wasteType] || wasteType}: chybí potvrzený hmotnostní odhad nádoby.`);
  }

  const totals = stops.reduce((result, stop) => ({
    stopCount: result.stopCount + 1,
    containerCount: result.containerCount + stop.containerCount,
    serviceMinutes: result.serviceMinutes + stop.serviceMinutes,
    knownWeightTons: rounded(result.knownWeightTons + (stop.weightKnown ? stop.weightTons : 0)),
    unknownWeightStopCount: result.unknownWeightStopCount + (stop.weightKnown ? 0 : 1)
  }), { stopCount: 0, containerCount: 0, serviceMinutes: 0, knownWeightTons: 0, unknownWeightStopCount: 0 });

  return {
    version: COLLECTION_ROUTES_READONLY_CALCULATOR_VERSION,
    status: "needs-review",
    statusLabel: "READ-ONLY · POTŘEBUJE DOPLNĚNÍ",
    routeDate: cleanString(routeDate || dateInfo?.routeDate),
    dateInfo: { ...dateInfo },
    totals,
    vehicles: vehicles.map(summarizedVehicle),
    blockers: unique(blockers),
    limitations: [
      "Čas znamená pouze čistou obsluhu nádob; neobsahuje přejezdy, výsypy, přestávky ani dopravní rezervu.",
      "Rozdělení A/B/C vyrovnává známé hmotnosti podle kapacity a ostatní práci podle času. Neurčuje pořadí ulic ani optimální trasu.",
      "Kilometry, silniční časy, Waze, uzavírky a aktuální doprava se v této fázi nepočítají.",
      "Dostupnost řidičů a vozidel, dovolené, poruchy, svátky a mimořádné pokyny dispečerky se v této fázi neověřují."
    ],
    createsRoute: false,
    writesData: false,
    sendsNotifications: false
  };
}

export const __test = {
  SERVICE_MINUTES_BY_VOLUME,
  WEIGHT_TONS_BY_WASTE_AND_VOLUME,
  VEHICLES,
  WASTE_LABELS,
  OPERATING_WINDOWS,
  rounded
};
