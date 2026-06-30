const VEHICLE_BRANDS = new Set(["mercedes", "daf", "man", "jiné"]);

export const PART_CATALOG_SOURCES = [
  {
    id: "mercedes_webparts",
    label: "Mercedes-Benz Trucks / Daimler Truck WebParts / MyPartsHub",
    status: "not_configured",
    lookupMode: "official_api_required"
  },
  {
    id: "daf_paccar",
    label: "DAF / PACCAR",
    status: "not_configured",
    lookupMode: "official_api_required"
  },
  {
    id: "man_webmantis",
    label: "MAN / webMANTIS",
    status: "not_configured",
    lookupMode: "official_api_required"
  },
  {
    id: "tecdoc_tecalliance",
    label: "TecDoc / TecAlliance",
    status: "not_configured",
    lookupMode: "official_api_required"
  },
  {
    id: "kaiser_common_parts",
    label: "Interní databáze často používaných dílů Kaiser",
    status: "planned",
    lookupMode: "internal_database"
  }
];

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeLicensePlate(value) {
  const compact = cleanString(value).toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!compact) {
    return "";
  }

  if (compact.length === 7) {
    return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  }

  return compact;
}

export function licensePlateKey(value) {
  return normalizeLicensePlate(value).replace(/\s+/g, "");
}

export function extractLicensePlate(text) {
  const normalized = cleanString(text).toUpperCase();
  const match = normalized.match(/\b([0-9][A-Z][0-9]\s?[0-9]{4}|[0-9][A-Z]{2}\s?[0-9]{4}|[A-Z]{2,3}\s?[0-9]{3,4})\b/);
  return normalizeLicensePlate(match?.[1] || "");
}

export function normalizeVehicleBrand(value) {
  const normalized = normalizeText(value);
  if (normalized.includes("mercedes") || normalized.includes("daimler")) {
    return "mercedes";
  }
  if (normalized.includes("daf") || normalized.includes("paccar")) {
    return "daf";
  }
  if (normalized.includes("man")) {
    return "man";
  }

  return VEHICLE_BRANDS.has(normalized) ? normalized : "jiné";
}

export function vehicleBrandLabel(value) {
  const brand = normalizeVehicleBrand(value);
  if (brand === "mercedes") return "Mercedes";
  if (brand === "daf") return "DAF";
  if (brand === "man") return "MAN";
  return "jiné";
}

function mirrorSideFromText(text) {
  const normalized = normalizeText(text);

  if (/\b(prav[ayeou]?|vpravo)\b/.test(normalized) || normalized.includes("spolujezdce")) {
    return {
      side: "right",
      label: "pravé",
      source: normalized.includes("spolujezdce") ? "passenger_side_phrase" : "explicit_side"
    };
  }

  if (/\b(lev[ayeou]?|vlevo)\b/.test(normalized) || normalized.includes("ridice")) {
    return {
      side: "left",
      label: "levé",
      source: normalized.includes("ridice") ? "driver_side_phrase" : "explicit_side"
    };
  }

  return {
    side: "unknown",
    label: "neznámá strana",
    source: ""
  };
}

export function partSideLabel(side) {
  if (side === "left") return "levé";
  if (side === "right") return "pravé";
  return "neznámá strana";
}

export function identifyProbablePartFromDescription(description) {
  const text = cleanString(description);
  const normalized = normalizeText(text);

  if (normalized.includes("zrcatko") || normalized.includes("zpetne zrcat")) {
    const side = mirrorSideFromText(text);
    const basePart = "vnější zpětné zrcátko";
    return {
      defectType: "poškozené zrcátko",
      probablePart: side.side === "unknown" ? basePart : `${side.label} ${basePart}`,
      probablePartBase: basePart,
      probablePartSide: side.side,
      probablePartSideLabel: side.label,
      sideSource: side.source,
      confidence: side.side === "unknown" ? "medium" : "high",
      partIdentificationStatus: "probable_waiting_verification",
      needsPartSideClarification: side.side === "unknown",
      needsManualVerification: true,
      verifiedPart: "",
      partOrderNumber: "",
      note: "Objednací číslo dílu musí ověřit nákup nebo servis podle VIN/katalogu."
    };
  }

  return {
    defectType: "náhradní díl",
    probablePart: "",
    probablePartBase: "",
    probablePartSide: "unknown",
    probablePartSideLabel: "neznámá strana",
    sideSource: "",
    confidence: "low",
    partIdentificationStatus: "waiting_manual_verification",
    needsPartSideClarification: false,
    needsManualVerification: true,
    verifiedPart: "",
    partOrderNumber: "",
    note: "Díl zatím nebyl bezpečně rozpoznán. Čeká na ruční ověření."
  };
}

export function driverPartRequestInitialStatus(partMatch) {
  if (!partMatch?.probablePart) {
    return "waiting_part_identification";
  }

  if (partMatch.needsPartSideClarification) {
    return "waiting_part_identification";
  }

  return "part_identified";
}

export function driverPartRequestMissingQuestion(input = {}) {
  const description = cleanString(input.description || input.defectDescription || input.speechText);
  const licensePlate = normalizeLicensePlate(input.licensePlate || extractLicensePlate(description));
  const partMatch = identifyProbablePartFromDescription(description);

  if (!licensePlate) {
    return "Na kterém vozidle to je? Řekni mi prosím SPZ.";
  }

  if (partMatch.needsPartSideClarification) {
    return "Je poškozené levé, nebo pravé zrcátko?";
  }

  return "";
}
