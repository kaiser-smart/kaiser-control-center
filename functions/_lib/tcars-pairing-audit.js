function clean(value) {
  return String(value ?? "").trim();
}

function normalizePlate(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeVin(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function vinEvidence(fleetVin, tcarsVin) {
  const fleet = normalizeVin(fleetVin);
  const tcars = normalizeVin(tcarsVin);

  if (!fleet || !tcars) {
    return { status: "unknown", label: "VIN nelze porovnat" };
  }

  const suffixLength = Math.min(fleet.length, tcars.length);
  const matches = suffixLength >= 6 && tcars.endsWith(fleet.slice(-suffixLength));
  return matches
    ? { status: "match", label: `Shoda posledních ${suffixLength} znaků VIN` }
    : { status: "conflict", label: "VIN se neshoduje" };
}

function candidateFor(vehicle, fleetVehicle) {
  const evidence = vinEvidence(fleetVehicle.vinMasked || fleetVehicle.vin, vehicle.vin);
  return {
    tcarsVehicleId: clean(vehicle.tcarsVehicleId || vehicle.externalVehicleId || vehicle.vehicleId),
    licensePlate: clean(vehicle.licensePlate || vehicle.tcarsLicensePlate),
    internalNumber: clean(vehicle.internalNumber),
    model: clean(vehicle.model),
    active: vehicle.active !== false && vehicle.retired !== true,
    vinEvidence: evidence
  };
}

function rowStatus(candidates) {
  if (!candidates.length) {
    return { status: "unmatched", reason: "V T-Cars nebyl nalezen kandidát se stejnou SPZ." };
  }
  if (candidates.length > 1) {
    return { status: "ambiguous", reason: "Stejná SPZ odpovídá více vozidlům T-Cars." };
  }
  if (candidates[0].vinEvidence.status === "conflict") {
    return { status: "conflict", reason: "SPZ souhlasí, ale dostupná část VIN je v konfliktu." };
  }
  return {
    status: "ready_to_verify",
    reason: candidates[0].vinEvidence.status === "match"
      ? "SPZ i dostupná část VIN souhlasí; vazba čeká na ruční potvrzení."
      : "SPZ souhlasí; VIN není dostupné pro druhou kontrolu a vazba čeká na ruční potvrzení."
  };
}

export function buildTcarsPairingAuditPayload(vistosVehicles = [], tcarsVehicles = [], options = {}) {
  const tcarsByPlate = new Map();
  for (const vehicle of Array.isArray(tcarsVehicles) ? tcarsVehicles : []) {
    const plate = normalizePlate(vehicle.licensePlate || vehicle.tcarsLicensePlate);
    if (!plate || vehicle.active === false || vehicle.retired === true) continue;
    tcarsByPlate.set(plate, [...(tcarsByPlate.get(plate) || []), vehicle]);
  }

  const rows = (Array.isArray(vistosVehicles) ? vistosVehicles : []).map((vehicle) => {
    const licensePlate = clean(vehicle.registrationPlate || vehicle.licensePlate);
    const candidates = (tcarsByPlate.get(normalizePlate(licensePlate)) || [])
      .map((candidate) => candidateFor(candidate, vehicle));
    const state = rowStatus(candidates);
    return {
      fleetVehicleId: clean(vehicle.vistosVehicleId || vehicle.vehicleId || vehicle.id),
      licensePlate,
      fleetName: clean(vehicle.name),
      fleetCategory: clean(vehicle.category),
      candidateCount: candidates.length,
      candidates,
      ...state
    };
  });

  const count = (status) => rows.filter((row) => row.status === status).length;
  const candidateRows = rows.filter((row) => row.candidateCount > 0).length;
  return {
    provider: "tcars",
    source: "Vistos Vehicle + T-Cars vozidlaSeznam",
    apiStatus: "ready",
    dataStatus: rows.length ? "ready" : "empty",
    readOnly: true,
    writesData: false,
    createsLinks: false,
    requiresManualConfirmation: true,
    generatedAt: options.generatedAt || new Date().toISOString(),
    summary: {
      total: rows.length,
      candidateRows,
      unmatched: count("unmatched"),
      ambiguous: count("ambiguous"),
      conflict: count("conflict"),
      readyToVerify: count("ready_to_verify")
    },
    rows,
    message: "Audit pouze připravil kandidáty podle přesné shody SPZ. Žádná vazba nebyla uložená."
  };
}
