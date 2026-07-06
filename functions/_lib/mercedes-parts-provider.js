import {
  normalizePartVerificationStatus,
  partLookupQueryFromRequest
} from "./driver-parts-catalog.js";

const DEFAULT_WEBPARTS_URL = "https://webpartstruck-cloud.mercedes-benz-trucks.com/webparts/";
const DEFAULT_MYPARTSHUB_URL = "https://mypartshub.daimlertruck.com";

function cleanString(value) {
  return String(value ?? "").trim();
}

function truthy(value) {
  return ["1", "true", "yes", "ano", "on"].includes(cleanString(value).toLowerCase());
}

function withoutTrailingSlash(value) {
  return cleanString(value).replace(/\/+$/, "");
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ error: "unserializable" });
  }
}

function parseJsonValue(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeVehicleDetails(data = {}) {
  const vehicle = Array.isArray(data?.vehicles)
    ? data.vehicles[0]
    : data?.vehicle || data?.result || data;
  const model = cleanString(vehicle?.model || vehicle?.modelName || vehicle?.series || vehicle?.type);
  const modelYear = cleanString(vehicle?.modelYear || vehicle?.year || vehicle?.productionYear || vehicle?.registrationYear);
  const engine = cleanString(vehicle?.engine || vehicle?.engineName || vehicle?.motorization || vehicle?.motorisation);
  const body = cleanString(vehicle?.body || vehicle?.bodyType || vehicle?.variant);
  const fuel = cleanString(vehicle?.fuel || vehicle?.fuelType);
  const brand = cleanString(vehicle?.brand || vehicle?.make || "Mercedes-Benz");

  return {
    brand,
    model,
    modelYear,
    engine,
    body,
    fuel,
    label: [brand, model, modelYear, engine].filter(Boolean).join(" ")
  };
}

function mergeProviderResultJson(partResult = {}, vehicleResult = null, vehicleDetails = {}) {
  const partPayload = parseJsonValue(partResult.resultJson, {});
  const vehiclePayload = parseJsonValue(vehicleResult?.resultJson, {});
  return safeJson({
    vehicleDetails,
    vehicleProviderStatus: cleanString(vehicleResult?.status),
    vehicle: vehiclePayload,
    part: partPayload
  });
}

async function fetchAccessToken(config) {
  if (!config.authUrl || !config.clientId || !config.clientSecret) {
    return "";
  }

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);
  if (config.scope) {
    body.set("scope", config.scope);
  }

  const response = await fetch(config.authUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`mercedes_auth_failed_${response.status}`);
  }

  const data = await response.json();
  return cleanString(data.access_token);
}

async function postOfficialJson(config, path, payload) {
  const token = await fetchAccessToken(config);
  const headers = {
    "content-type": "application/json",
    accept: "application/json"
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`mercedes_api_failed_${response.status}`);
  }
  return data;
}

function normalizeOfficialPartResult(data, request) {
  const candidate = Array.isArray(data?.parts) ? data.parts[0] : data?.part || data?.result || null;
  const partNumber = cleanString(candidate?.partNumber || candidate?.oePartNumber || candidate?.oeNumber || candidate?.number);
  const partName = cleanString(candidate?.name || candidate?.partName || candidate?.description);
  const verified = candidate?.verified === true || data?.verified === true;

  if (!verified || !partNumber) {
    return {
      status: "manual_required",
      partVerificationStatus: "waiting_manual_verification",
      providerStatus: "no_verified_match",
      providerMessage: "Oficiální odpověď neobsahuje jednoznačně ověřené OE číslo. Díl musí ověřit Patrik ručně.",
      resultJson: safeJson(data)
    };
  }

  return {
    status: "verified",
    partVerificationStatus: "verified_daimler",
    providerStatus: "verified",
    providerMessage: "Díl byl ověřen přes nakonfigurovaný oficiální Mercedes/Daimler zdroj.",
    verifiedPart: partName || cleanString(request.probablePart),
    oePartNumber: partNumber,
    partName,
    partOrderNumber: partNumber,
    resultJson: safeJson(data)
  };
}

export function mercedesPartsProviderConfig(env = {}) {
  return {
    enabled: truthy(env.MERCEDES_PARTS_PROVIDER_ENABLED),
    baseUrl: withoutTrailingSlash(env.MERCEDES_PARTS_API_BASE_URL),
    authUrl: cleanString(env.MERCEDES_PARTS_AUTH_URL),
    clientId: cleanString(env.MERCEDES_PARTS_CLIENT_ID),
    clientSecret: cleanString(env.MERCEDES_PARTS_CLIENT_SECRET),
    scope: cleanString(env.MERCEDES_PARTS_SCOPE),
    manualPortalUrl: cleanString(env.MERCEDES_PARTS_MANUAL_PORTAL_URL) || DEFAULT_WEBPARTS_URL,
    myPartsHubUrl: cleanString(env.MERCEDES_MYPARTSHUB_URL) || DEFAULT_MYPARTSHUB_URL
  };
}

export function mercedesManualFallback(config, request, message = "") {
  return {
    status: "manual_required",
    partVerificationStatus: normalizePartVerificationStatus("waiting_manual_verification"),
    partVerificationSource: "manual",
    partsProviderId: "mercedes_webparts",
    partsProviderStatus: config.enabled ? "api_not_available" : "not_configured",
    partsProviderMessage: message || "Oficiální Mercedes/Daimler API není nakonfigurované. Díl musí Patrik ověřit ručně ve WebParts nebo MyPartsHub.",
    mercedesManualPortalUrl: config.manualPortalUrl,
    mercedesMyPartsHubUrl: config.myPartsHubUrl,
    partLookupQuery: partLookupQueryFromRequest(request),
    resultJson: ""
  };
}

export function createMercedesPartsProvider(env = {}) {
  const config = mercedesPartsProviderConfig(env);

  return {
    config,
    async getVehicleByVin(vin) {
      const cleanVin = cleanString(vin);
      if (!config.enabled || !config.baseUrl || !cleanVin) {
        return mercedesManualFallback(config, { vin: cleanVin }, "Vozidlo podle VIN čeká na ruční ověření v Mercedes portálu.");
      }

      const data = await postOfficialJson(config, "/vehicles/by-vin", { vin: cleanVin });
      return {
        status: "ok",
        resultJson: safeJson(data),
        data
      };
    },
    async searchPartsByVin(vin, query) {
      return this.searchPartsByVinAndCategory(vin, query, "");
    },
    async searchPartsByVinAndCategory(vin, query, category = "") {
      const request = { vin, probablePart: query, defectType: category };
      if (!config.enabled || !config.baseUrl) {
        return mercedesManualFallback(config, request);
      }

      const data = await postOfficialJson(config, "/parts/search-by-vin", {
        vin: cleanString(vin),
        query: cleanString(query),
        category: cleanString(category)
      });
      return normalizeOfficialPartResult(data, request);
    },
    async getPartDetail(partNumber) {
      if (!config.enabled || !config.baseUrl || !cleanString(partNumber)) {
        return mercedesManualFallback(config, { partOrderNumber: partNumber }, "Detail dílu čeká na ruční ověření v Mercedes portálu.");
      }

      const data = await postOfficialJson(config, "/parts/detail", { partNumber: cleanString(partNumber) });
      return {
        status: "ok",
        resultJson: safeJson(data),
        data
      };
    },
    async getPartAvailability(partNumber) {
      if (!config.enabled || !config.baseUrl || !cleanString(partNumber)) {
        return mercedesManualFallback(config, { partOrderNumber: partNumber }, "Dostupnost dílu čeká na ruční ověření u dodavatele.");
      }

      const data = await postOfficialJson(config, "/parts/availability", { partNumber: cleanString(partNumber) });
      return {
        status: "ok",
        resultJson: safeJson(data),
        data
      };
    },
    async createPartsOrderRequest(payload = {}) {
      if (!config.enabled || !config.baseUrl) {
        return mercedesManualFallback(config, payload, "Automatické vytvoření objednávky Mercedes není zapnuté. Objednávku musí potvrdit člověk.");
      }

      const data = await postOfficialJson(config, "/orders/request", payload);
      return {
        status: "ok",
        resultJson: safeJson(data),
        data
      };
    }
  };
}

export async function verifyMercedesPartForRequest(env, request) {
  const provider = createMercedesPartsProvider(env);
  const config = provider.config;
  const vin = cleanString(request.vin);

  if (!vin) {
    return mercedesManualFallback(config, request, "Chybí VIN. Mercedes díl nelze automaticky ověřit, čeká na ruční ověření.");
  }

  const query = partLookupQueryFromRequest(request);
  if (!query) {
    return mercedesManualFallback(config, request, "Chybí dostatečný popis dílu. Čeká na ruční ověření.");
  }

  try {
    let vehicleResult = null;
    try {
      vehicleResult = await provider.getVehicleByVin(vin);
    } catch (error) {
      vehicleResult = {
        status: "error",
        resultJson: safeJson({ error: cleanString(error?.message) })
      };
    }
    const vehicleDetails = normalizeVehicleDetails(parseJsonValue(vehicleResult?.resultJson, {}));
    const result = await provider.searchPartsByVinAndCategory(vin, query, request.defectType);
    return {
      ...result,
      resultJson: mergeProviderResultJson(result, vehicleResult, vehicleDetails),
      vehicleDetails,
      partVerificationSource: result.partVerificationStatus === "verified_daimler" ? "daimler" : "manual",
      partsProviderId: "mercedes_webparts",
      mercedesManualPortalUrl: config.manualPortalUrl,
      mercedesMyPartsHubUrl: config.myPartsHubUrl,
      partLookupQuery: query
    };
  } catch (error) {
    return {
      ...mercedesManualFallback(config, request, "Ověření přes Mercedes zdroj selhalo. Díl musí Patrik ověřit ručně ve WebParts nebo MyPartsHub."),
      partVerificationStatus: "verification_error",
      partsProviderStatus: "error",
      partsProviderError: cleanString(error?.message)
    };
  }
}
