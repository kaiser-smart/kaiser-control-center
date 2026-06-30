import {
  extractLicensePlate,
  licensePlateKey,
  normalizeLicensePlate
} from "../../src/data/licensePlate.js";

export {
  extractLicensePlate,
  licensePlateKey,
  normalizeLicensePlate
};

const VEHICLE_BRANDS = new Set(["mercedes", "daf", "man", "jiné"]);
const PART_VERIFICATION_STATUSES = new Set([
  "waiting_identification",
  "probable_part",
  "waiting_manual_verification",
  "verified_daimler",
  "verified_manual",
  "not_found",
  "verification_error",
  "not_applicable"
]);

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
  if (brand === "mercedes") return "Mercedes-Benz Trucks";
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

function partMatchFromSide(description, config) {
  const side = config.sideAware ? mirrorSideFromText(description) : {
    side: "unknown",
    label: "neznámá strana",
    source: ""
  };
  const probablePart = side.side === "unknown" || !config.sideAware
    ? config.basePart
    : `${side.label} ${config.basePart}`;

  return {
    defectType: config.defectType,
    probablePart,
    probablePartBase: config.basePart,
    probablePartSide: side.side,
    probablePartSideLabel: side.label,
    sideSource: side.source,
    confidence: side.side === "unknown" && config.sideAware ? "medium" : "high",
    partIdentificationStatus: side.side === "unknown" && config.sideAware
      ? "probable_waiting_verification"
      : "probable_part",
    needsPartSideClarification: Boolean(config.sideAware && side.side === "unknown"),
    needsManualVerification: true,
    verifiedPart: "",
    partOrderNumber: "",
    note: "Objednací číslo dílu musí ověřit nákup nebo servis podle VIN/katalogu."
  };
}

export function identifyProbablePartFromDescription(description) {
  const text = cleanString(description);
  const normalized = normalizeText(text);

  if (normalized.includes("zrcatko") || normalized.includes("zpetne zrcat")) {
    return partMatchFromSide(text, {
      defectType: "poškozené zrcátko",
      basePart: "vnější zpětné zrcátko",
      sideAware: true
    });
  }

  if (/\b(svetlo|svetlomet|světlo|světlomet|blinkr|smerovka|směrovka)\b/.test(normalized)) {
    return partMatchFromSide(text, {
      defectType: "poškozené světlo",
      basePart: normalized.includes("zadni") || normalized.includes("zadní")
        ? "zadní světlo"
        : normalized.includes("blinkr") || normalized.includes("smerovka")
          ? "směrovka"
          : "světlomet",
      sideAware: true
    });
  }

  if (/\b(pneumatika|guma|kolo)\b/.test(normalized)) {
    return partMatchFromSide(text, {
      defectType: "poškozená pneumatika",
      basePart: "pneumatika",
      sideAware: false
    });
  }

  if (/\b(sterac|stěrač|rameno sterace|rameno stěrače)\b/.test(normalized)) {
    return partMatchFromSide(text, {
      defectType: "poškozený stěrač",
      basePart: normalized.includes("rameno") ? "rameno stěrače" : "stěrač",
      sideAware: false
    });
  }

  if (/\b(blatnik|blatník|kryt kola)\b/.test(normalized)) {
    return partMatchFromSide(text, {
      defectType: "poškozený blatník",
      basePart: normalized.includes("kryt") ? "kryt kola" : "blatník",
      sideAware: true
    });
  }

  if (/\b(naraznik|nárazník)\b/.test(normalized)) {
    return partMatchFromSide(text, {
      defectType: "poškozený nárazník",
      basePart: "nárazník / díl nárazníku",
      sideAware: false
    });
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

export function normalizePartVerificationStatus(value, fallback = "waiting_manual_verification") {
  const normalized = cleanString(value);
  return PART_VERIFICATION_STATUSES.has(normalized) ? normalized : fallback;
}

export function partLookupQueryFromRequest(request = {}) {
  return [
    request.probablePart,
    request.defectType,
    request.defectDescription,
    partSideLabel(request.probablePartSide)
  ].map(cleanString).filter(Boolean).join(" ");
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
    return "Na kterém vozidle to je? Řekni mi prosím typ, značku nebo SPZ.";
  }

  if (partMatch.needsPartSideClarification) {
    return "Je poškozené levé, nebo pravé zrcátko?";
  }

  return "";
}
