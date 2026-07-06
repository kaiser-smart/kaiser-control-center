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
  "probable_waiting_verification",
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
  "urgent_safety",
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
  if (brand === "mercedes") return "Mercedes-Benz";
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
    category: config.category || "jasný servisní úkon",
    serviceType: config.serviceType || config.defectType,
    priority: config.priority || "běžné",
    backgroundAction: config.backgroundAction || "parts_search",
    verifiedPart: "",
    partOrderNumber: "",
    note: "Objednací číslo dílu musí ověřit nákup nebo servis podle VIN/katalogu."
  };
}

function skipPartMatch(reason, message, status = "waiting_manual_verification", options = {}) {
  const maintenance = reason === "maintenance_or_consumable";
  const urgent = reason === "urgent_safety";
  return {
    defectType: options.defectType || (urgent ? "bezpečnostní problém" : maintenance ? "běžná údržba / provozní materiál" : "neurčitá závada"),
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
    category: options.category || (urgent ? "bezpečnostní problém" : maintenance ? "jasný servisní úkon" : "nejasná závada"),
    serviceType: options.serviceType || (urgent ? "urgentní zásah" : maintenance ? "servisní údržba" : "diagnostika"),
    priority: options.priority || (urgent ? "urgentní" : "běžné"),
    backgroundAction: options.backgroundAction || (urgent ? "urgent_alert" : maintenance ? "parts_search" : "diagnostics"),
    verifiedPart: "",
    partOrderNumber: "",
    note: message
  };
}

function clearServiceMatch(description, config) {
  return {
    defectType: config.defectType || "servisní údržba",
    probablePart: config.probablePart,
    probablePartBase: config.probablePart,
    probablePartSide: config.probablePartSide || "unknown",
    probablePartSideLabel: partSideLabel(config.probablePartSide || "unknown"),
    sideSource: config.sideSource || "",
    confidence: config.confidence || "high",
    partIdentificationStatus: config.needsPartSideClarification ? "probable_waiting_verification" : "probable_part",
    needsPartSideClarification: config.needsPartSideClarification === true,
    needsManualVerification: true,
    aiPartCandidate: true,
    aiSkipReason: "",
    aiPilotStatus: config.needsPartSideClarification ? "manual_verification_required" : "ready_for_vin_verification",
    category: "jasný servisní úkon",
    serviceType: config.serviceType,
    priority: config.priority || "běžné",
    backgroundAction: "parts_search",
    verifiedPart: "",
    partOrderNumber: "",
    note: config.note || "Díl musí být ověřený podle VIN a kompatibility. Nic se automaticky neobjedná."
  };
}

function axleFromText(normalized) {
  if (/\b(predni|přední|predek|předek)\b/.test(normalized)) return "přední";
  if (/\b(zadni|zadní|zadek)\b/.test(normalized)) return "zadní";
  return "";
}

export function identifyProbablePartFromDescription(description) {
  const text = cleanString(description);
  const normalized = normalizeText(text);

  if (/\b(nebrzdi|nebrzdí|spatne brzdi|špatně brzdí|mekky pedal|měkký pedál|kouri se|kouří se|kour z auta|kouř z auta|unika palivo|uniká palivo|tece palivo|teče palivo|tece benzin|teče benzin|tece nafta|teče nafta|nejde rizeni|nejde řízení|praskla pneumatika|prasklá pneumatika|cervena kontrolka|červená kontrolka)\b/.test(normalized)) {
    return skipPartMatch(
      "urgent_safety",
      "Urgentní bezpečnostní problém. Nepokračovat v jízdě, dokud Patrik nepotvrdí další postup.",
      "not_applicable",
      {
        category: "bezpečnostní problém",
        serviceType: "urgentní zásah",
        priority: "urgentní",
        backgroundAction: "urgent_alert"
      }
    );
  }

  if (/\b(olej|oleje|vymena oleje|výměna oleje|motorovy olej|motorový olej)\b/.test(normalized)) {
    return clearServiceMatch(text, {
      defectType: "servisní údržba",
      serviceType: "výměna oleje",
      probablePart: "motorový olej podle specifikace + olejový filtr",
      note: "Hledat motorový olej podle specifikace, olejový filtr a vypouštěcí šroub nebo těsnění jen pokud je pro dané auto potřeba."
    });
  }

  if (/\b(sterac|sterace|steracu|stirac|stirace|stiracu|stěrač|stěrače|stěračů)\b/.test(normalized)) {
    return clearServiceMatch(text, {
      defectType: "servisní údržba",
      serviceType: "výměna stěračů",
      probablePart: "přední stěrače",
      note: "Hledat přední stěrače a zadní stěrač jen pokud dané auto zadní stěrač má."
    });
  }

  if (/\b(brzdove desticky|brzdové destičky|desticky|destičky)\b/.test(normalized)) {
    const axle = axleFromText(normalized);
    return clearServiceMatch(text, {
      defectType: "brzdy",
      serviceType: "výměna brzdových destiček",
      probablePart: axle ? `${axle} brzdové destičky` : "brzdové destičky",
      needsPartSideClarification: !axle,
      note: axle
        ? "Ověřit kompatibilní brzdové destičky podle VIN a nápravy."
        : "Potřeba upřesnit přední / zadní nápravu. Pokud lze napovědět z historie auta, označit jen jako návrh, ne jistotu."
    });
  }

  if (/\b(brzdove kotouce|brzdové kotouče|kotouc|kotouč|kotouce|kotouče)\b/.test(normalized)) {
    const axle = axleFromText(normalized);
    return clearServiceMatch(text, {
      defectType: "brzdy",
      serviceType: "výměna brzdových kotoučů",
      probablePart: axle ? `${axle} brzdové kotouče` : "brzdové kotouče",
      needsPartSideClarification: !axle,
      note: axle
        ? "Ověřit kompatibilní brzdové kotouče podle VIN a nápravy."
        : "Potřeba upřesnit přední / zadní nápravu. Bez nápravy neposílat jako jistý díl."
    });
  }

  if (/\b(zarovka|zarovky|žárovka|žárovky)\b/.test(normalized)) {
    return clearServiceMatch(text, {
      defectType: "servisní údržba",
      serviceType: "výměna žárovky",
      probablePart: "žárovka",
      confidence: "medium",
      note: "Ověřit přesný typ žárovky podle VIN, světla a pozice."
    });
  }

  if (/\b(baterie|akumulator|akumulátor)\b/.test(normalized)) {
    return clearServiceMatch(text, {
      defectType: "servisní údržba",
      serviceType: "výměna baterie",
      probablePart: "autobaterie",
      confidence: "medium",
      note: "Ověřit kapacitu, rozměr, polaritu a typ baterie podle VIN."
    });
  }

  if (/\b(neco|něco|vrze|vrže|boucha|bouchá|klepe|piska|píská|vibruje|cuka|cuká|divne|divně|nejde nastartovat|nestartuje|spatne startuje|špatně startuje|sviti kontrolka|svítí kontrolka|kontrolka|tece kapalina|teče kapalina|smrdi spojka|smrdí spojka|brzdi divne|brzdí divně|podvozek)\b/.test(normalized)) {
    return skipPartMatch(
      "ambiguous_fault",
      "Nelze spolehlivě určit konkrétní díl bez kontroly auta. Čeká na servisní diagnostiku.",
      "waiting_manual_verification",
      {
        category: "nejasná závada",
        serviceType: "diagnostika",
        priority: "běžné",
        backgroundAction: "diagnostics"
      }
    );
  }

  if (/\b(servis|udrzba|údržba|kontrola|kapalina|kapaliny|filtr|filtry|pneumatika|pneumatiky|guma|gumy|provozni material|provozní materiál|adblue)\b/.test(normalized)) {
    return skipPartMatch(
      "maintenance_or_consumable",
      "Jde o obecný servis nebo provozní materiál. Bez přesnějšího požadavku neposílat jako jistý díl.",
      "not_applicable",
      {
        category: "jasný servisní úkon",
        serviceType: "servisní údržba",
        priority: "běžné",
        backgroundAction: "diagnostics"
      }
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

  if (/\b(vyfuk|výfuk|koncovka vyfuku|koncovka výfuku|tlumic vyfuku|tlumič výfuku|vyfukove potrubi|výfukové potrubí)\b/.test(normalized)) {
    return partMatchFromSide(text, {
      defectType: "poškozený výfuk",
      basePart: "výfuk / díl výfuku",
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
    aiPartCandidate: false,
    aiSkipReason: "ambiguous_fault",
    aiPilotStatus: "ambiguous_fault",
    category: "nejasná závada",
    serviceType: "diagnostika",
    priority: "běžné",
    backgroundAction: "diagnostics",
    verifiedPart: "",
    partOrderNumber: "",
    note: "Díl zatím nebyl bezpečně rozpoznán. Čeká na servisní diagnostiku."
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
  if (normalized === "urgent_safety") return "urgentní bezpečnostní problém";
  if (normalized === "out_of_pilot") return "mimo pilot";
  if (normalized === "missing_vin") return "chybí VIN";
  if (normalized === "vehicle_not_verified") return "vozidlo není bezpečně ověřené";
  if (normalized === "part_not_clear") return "díl není jednoznačný";
  return normalized || "neuvedeno";
}

export function driverPartRequestInitialStatus(partMatch) {
  if (partMatch?.backgroundAction === "urgent_alert") {
    return "ready_for_patrik";
  }

  if (partMatch?.backgroundAction === "diagnostics") {
    return "waiting_diagnostics";
  }

  if (!driverPartAiCandidateFromMatch(partMatch)) {
    return "new_report";
  }

  if (partMatch.needsPartSideClarification) {
    return "waiting_part_identification";
  }

  return "part_identified";
}

export function driverPartRequestMissingQuestion(input = {}) {
  const description = cleanString(input.description || input.defectDescription || input.speechText);
  const licensePlate = normalizeLicensePlate(input.licensePlate || extractLicensePlate(description));

  if (!licensePlate) {
    return "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.";
  }

  return "";
}
