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
const PART_AI_STATUSES = new Set([
  "waiting_part_identification",
  "manual_verification_required",
  "maintenance_or_consumable",
  "ambiguous_fault",
  "out_of_pilot",
  "waiting_vin",
  "ready_for_vin_verification",
  "provider_not_configured",
  "waiting_verified_oe",
  "email_ready",
  "email_sent",
  "handed_to_patrik",
  "ordered_manually",
  "part_arrived",
  "completed",
  "canceled"
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

function skipPartMatch(reason, message, status = "waiting_manual_verification") {
  const maintenance = reason === "maintenance_or_consumable";
  return {
    defectType: maintenance ? "běžná údržba / provozní materiál" : "neurčitá závada",
    probablePart: "",
    probablePartBase: "",
    probablePartSide: "unknown",
    probablePartSideLabel: "neznámá strana",
    sideSource: "",
    confidence: "none",
    partIdentificationStatus: status,
    needsPartSideClarification: false,
    needsManualVerification: true,
    aiPartCandidate: false,
    aiSkipReason: reason,
    aiPilotStatus: reason,
    verifiedPart: "",
    partOrderNumber: "",
    note: message
  };
}

export function identifyProbablePartFromDescription(description) {
  const text = cleanString(description);
  const normalized = normalizeText(text);

  if (/\b(servis|udrzba|kontrola|olej|oleje|kapalina|kapaliny|filtr|filtry|zarovka|zarovky|sterac|sterace|stirac|stirace|pneumatika|pneumatiky|guma|gumy|provozni material|adblue)\b/.test(normalized)) {
    return skipPartMatch(
      "maintenance_or_consumable",
      "AI Boost nespustil hledání, protože jde o běžnou údržbu nebo provozní materiál.",
      "not_applicable"
    );
  }

  if (/\b(neco|něco|piska|píská|vibruje|divne|divně|nejde nastartovat|nestartuje|sviti kontrolka|svítí kontrolka|kontrolka|brzdi divne|brzdí divně|podvozek)\b/.test(normalized)) {
    return skipPartMatch(
      "ambiguous_fault",
      "AI Boost nespustil hledání, protože hlášení není jednoznačný požadavek na konkrétní díl."
    );
  }

  if (/\b(predni sklo|přední sklo|celni sklo|čelní sklo|sklo)\b/.test(normalized)) {
    return partMatchFromSide(text, {
      defectType: "poškozené sklo",
      basePart: normalized.includes("zadni") || normalized.includes("zadní") ? "zadní sklo" : "přední sklo",
      sideAware: false
    });
  }

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

  if (/\b(kolo|disk)\b/.test(normalized)) {
    return partMatchFromSide(text, {
      defectType: "poškozené kolo",
      basePart: normalized.includes("disk") ? "disk kola" : "kolo",
      sideAware: false
    });
  }

  if (/\b(klika|madlo dveri|madlo dveří)\b/.test(normalized)) {
    return partMatchFromSide(text, {
      defectType: "poškozená klika dveří",
      basePart: normalized.includes("ridice") || normalized.includes("řidiče") ? "klika dveří řidiče" : "klika dveří",
      sideAware: true
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

  if (/\b(kapota|haubna)\b/.test(normalized)) {
    return partMatchFromSide(text, {
      defectType: "poškozená kapota",
      basePart: "kapota",
      sideAware: false
    });
  }

  if (/\b(cidlo abs|čidlo abs|abs senzor|senzor abs)\b/.test(normalized)) {
    return partMatchFromSide(text, {
      defectType: "vadné čidlo ABS",
      basePart: "čidlo ABS",
      sideAware: true
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
    aiPartCandidate: false,
    aiSkipReason: "ambiguous_fault",
    aiPilotStatus: "ambiguous_fault",
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

export function driverPartAiCandidateFromMatch(partMatch = {}) {
  return Boolean(partMatch.probablePart && partMatch.aiPartCandidate !== false);
}

export function normalizePartAiStatus(value, fallback = "waiting_part_identification") {
  const normalized = cleanString(value);
  return PART_AI_STATUSES.has(normalized) ? normalized : fallback;
}

export function driverPartAiSkipReasonLabel(reason = "") {
  const normalized = cleanString(reason);
  if (normalized === "maintenance_or_consumable") return "běžná údržba / provozní materiál";
  if (normalized === "ambiguous_fault") return "neurčitá závada";
  if (normalized === "out_of_pilot") return "mimo pilot";
  if (normalized === "missing_vin") return "chybí VIN";
  if (normalized === "vehicle_not_verified") return "vozidlo není bezpečně ověřené";
  if (normalized === "part_not_clear") return "díl není jednoznačný";
  return normalized || "neuvedeno";
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
    return "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.";
  }

  if (partMatch.needsPartSideClarification) {
    return "Je poškozené levé, nebo pravé zrcátko?";
  }

  return "";
}
