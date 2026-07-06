const DEFAULT_TIMEOUT_MS = 25000;
const MAX_OFFERS = 3;
const STRONG_COMPATIBILITY_EVIDENCE = new Set([
  "oe_number",
  "provider_fitment",
  "vin_fitment",
  "official_catalog",
  "verified_compatibility"
]);
const BLOCKED_USED_MARKERS = [
  "bazar",
  "bazos",
  "bazoš",
  "sbazar",
  "aukro",
  "facebook",
  "marketplace",
  "vrakoviste",
  "vrakoviště",
  "pouzite",
  "použité",
  "pouzity",
  "použitý",
  "demontaz",
  "demontáž"
];

function cleanString(value) {
  return String(value ?? "").trim();
}

function truthy(value) {
  const normalized = cleanString(value).toLowerCase();
  return value === true || ["true", "1", "on", "yes", "ano"].includes(normalized);
}

function normalizeText(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function compactIdentifier(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function normalizeCompatibilityEvidence(value) {
  const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) return "";
  if (["oe", "oem", "oe_number", "oem_number", "part_number"].includes(normalized)) return "oe_number";
  if (["vin", "vin_fitment", "vin_match", "vin_verified"].includes(normalized)) return "vin_fitment";
  if (["provider", "provider_fitment", "fitment", "vehicle_fitment", "fits_vehicle"].includes(normalized)) return "provider_fitment";
  if (["catalog", "official_catalog", "official"].includes(normalized)) return "official_catalog";
  if (["verified", "verified_compatibility", "compatibility_verified"].includes(normalized)) return "verified_compatibility";
  if (normalized === "part_name_only") return "part_name_only";
  return STRONG_COMPATIBILITY_EVIDENCE.has(normalized) ? normalized : "";
}

function explicitCompatibilityEvidence(rawOffer = {}, request = {}) {
  const oeCompact = compactIdentifier(request.oePartNumber || request.partOrderNumber);
  const offerOeCompact = compactIdentifier(
    rawOffer.oeNumber ||
    rawOffer.oe_number ||
    rawOffer.oemNumber ||
    rawOffer.oem_number ||
    rawOffer.partNumber ||
    rawOffer.part_number
  );
  if (oeCompact && offerOeCompact && offerOeCompact === oeCompact) {
    return "oe_number";
  }

  const explicit = normalizeCompatibilityEvidence(
    rawOffer.compatibilityEvidence ||
    rawOffer.compatibility_evidence ||
    rawOffer.fitmentEvidence ||
    rawOffer.fitment_evidence ||
    rawOffer.vehicleFitmentEvidence ||
    rawOffer.vehicle_fitment_evidence ||
    rawOffer.matchEvidence ||
    rawOffer.match_evidence
  );
  if (explicit) {
    return explicit;
  }

  if (
    rawOffer.compatible === true ||
    rawOffer.compatibleWithVin === true ||
    rawOffer.compatible_with_vin === true ||
    rawOffer.fitsVehicle === true ||
    rawOffer.fits_vehicle === true ||
    rawOffer.fitmentVerified === true ||
    rawOffer.fitment_verified === true ||
    rawOffer.vehicleCompatibilityVerified === true ||
    rawOffer.vehicle_compatibility_verified === true
  ) {
    return "provider_fitment";
  }

  return "";
}

function hasStrongCompatibilityEvidence(offer = {}) {
  return STRONG_COMPATIBILITY_EVIDENCE.has(cleanString(offer.compatibilityEvidence));
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

function truncate(value, max = 180) {
  const text = cleanString(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function parseNumber(value) {
  const text = cleanString(value)
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function vehicleFitmentFromRequest(request = {}) {
  const lookup = parseJsonValue(request.partLookupResultJson, {});
  const details = lookup?.vehicleDetails || lookup?.vehicle?.vehicleDetails || lookup?.vehicle || {};
  const brand = cleanString(details.brand || request.vehicleBrandLabel || request.vehicleBrand);
  const model = cleanString(details.model || details.modelName);
  const modelYear = cleanString(details.modelYear || details.year || details.productionYear);
  const engine = cleanString(details.engine || details.engineName || details.motorization || details.motorisation);
  const body = cleanString(details.body || details.bodyType || details.variant);
  const fuel = cleanString(details.fuel || details.fuelType);
  const label = cleanString(details.label || [brand, model, modelYear, engine].filter(Boolean).join(" "));

  return {
    brand,
    model,
    modelYear,
    engine,
    body,
    fuel,
    label
  };
}

function providerConfig(env = {}) {
  const endpoint = cleanString(env.PARTS_PRICE_SEARCH_ENDPOINT || env.PARTS_PRICE_SEARCH_API_URL);
  const mockJson = cleanString(env.PARTS_PRICE_SEARCH_MOCK_JSON);
  const openAiApiKey = cleanString(
    env.PARTS_PRICE_SEARCH_OPENAI_API_KEY ||
    env.AI_BOOST_OPENAI_API_KEY ||
    env.OPENAI_API_KEY
  );
  const provider = cleanString(
    env.PARTS_PRICE_SEARCH_PROVIDER ||
    env.PARTS_SEARCH_PROVIDER ||
    (endpoint ? "custom" : openAiApiKey ? "openai_web_search" : "custom")
  );
  return {
    endpoint,
    apiKey: cleanString(env.PARTS_PRICE_SEARCH_API_KEY || env.PARTS_SEARCH_API_KEY),
    provider,
    allowUsed: truthy(env.PARTS_PRICE_SEARCH_ALLOW_USED),
    timeoutMs: Math.max(1000, Number(env.PARTS_PRICE_SEARCH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS),
    mockJson,
    openAiApiKey,
    openAiModel: cleanString(env.PARTS_PRICE_SEARCH_OPENAI_MODEL || env.OPENAI_MODEL || "gpt-5.5")
  };
}

export function isDriverPartPriceSearchConfigured(env = {}) {
  const config = providerConfig(env);
  return Boolean(config.endpoint || config.mockJson || config.openAiApiKey);
}

export function isDriverPartOfficialPriceSearchConfigured(env = {}) {
  const config = providerConfig(env);
  return Boolean(config.endpoint || config.mockJson);
}

function canUseProbablePartPriceSeed(request = {}, options = {}) {
  return options.allowProbablePartSeed === true && Boolean(cleanString(request.probablePart || request.partAiDetectedName));
}

export function driverPartPriceSearchEligibility(request = {}, options = {}) {
  if (!request.licensePlate || !request.vehicleName) {
    return {
      allowed: false,
      code: "driver_part_price_vehicle_required",
      message: "Cenový průzkum čeká na bezpečně určené vozidlo a SPZ."
    };
  }
  if (request.licensePlateVerified !== true || request.manualVehicleReview === true) {
    return {
      allowed: false,
      code: "driver_part_price_vehicle_not_verified",
      message: "Cenový průzkum čeká na ruční ověření vozidla proti Vozovému parku."
    };
  }
  if (!request.vin) {
    return {
      allowed: false,
      code: "driver_part_price_vin_required",
      message: "Cenový průzkum čeká na VIN."
    };
  }
  if (!driverPartHasVerifiedPriceSeed(request) && !canUseProbablePartPriceSeed(request, options)) {
    return {
      allowed: false,
      code: "driver_part_price_verified_part_required",
      message: "Cenový průzkum čeká na ověřený díl, OE číslo nebo ruční potvrzení kompatibility."
    };
  }
  return {
    allowed: true,
    code: "",
    message: "Cenový průzkum může běžet. Nic se nebude objednávat."
  };
}

export function driverPartHasVerifiedPriceSeed(request = {}) {
  return Boolean(
    cleanString(request.oePartNumber) ||
    cleanString(request.partOrderNumber) ||
    cleanString(request.partName) ||
    cleanString(request.verifiedPart)
  );
}

export function driverPartPriceSearchQuery(request = {}) {
  const fitment = vehicleFitmentFromRequest(request);
  return [
    request.oePartNumber || request.partOrderNumber,
    request.partName || request.verifiedPart || request.probablePart,
    fitment.label,
    request.vehicleName,
    request.vehicleBrandLabel || request.vehicleBrand
  ].map(cleanString).filter(Boolean).join(" ");
}

export function normalizeDriverPartOffer(rawOffer = {}, request = {}, options = {}) {
  const title = cleanString(rawOffer.title || rawOffer.name || rawOffer.productName);
  const seller = cleanString(rawOffer.seller || rawOffer.vendor || rawOffer.shop || rawOffer.source);
  const url = cleanString(rawOffer.url || rawOffer.link);
  const availability = cleanString(rawOffer.availability || rawOffer.stock || rawOffer.delivery);
  const note = cleanString(rawOffer.note || rawOffer.relevanceNote || rawOffer.snippet || rawOffer.description);
  const price = cleanString(rawOffer.price || rawOffer.priceText || rawOffer.priceWithVat || rawOffer.priceWithoutVat);
  const priceValue = Number(rawOffer.priceValue || rawOffer.priceAmount || parseNumber(price));
  const haystack = normalizeText([title, seller, url, availability, note].join(" "));
  const allowUsed = Boolean(options.allowUsed);
  const blockedAsUsed = !allowUsed && BLOCKED_USED_MARKERS.some((marker) => haystack.includes(normalizeText(marker)));
  const oeCompact = compactIdentifier(request.oePartNumber || request.partOrderNumber);
  const partWords = normalizeText(request.partName || request.verifiedPart || request.probablePart)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4);
  const titleCompact = compactIdentifier([title, seller, note, url].join(" "));
  const oeMatch = oeCompact ? titleCompact.includes(oeCompact) : false;
  const wordMatches = partWords.filter((word) => haystack.includes(word)).length;
  const nameMatch = wordMatches >= Math.min(2, partWords.length || 2);
  const explicitEvidence = explicitCompatibilityEvidence(rawOffer, request);
  const compatibilityEvidence = oeMatch
    ? "oe_number"
    : explicitEvidence || (nameMatch ? "part_name_only" : "");
  const relevant = oeCompact
    ? (oeMatch || hasStrongCompatibilityEvidence({ compatibilityEvidence }))
    : (nameMatch || hasStrongCompatibilityEvidence({ compatibilityEvidence }));

  return {
    title,
    price,
    priceValue: Number.isFinite(priceValue) ? priceValue : 0,
    seller,
    url,
    availability,
    note: truncate(note),
    relevanceNote: oeMatch
      ? "Shoda podle ověřeného OE čísla."
      : wordMatches
        ? "Shoda podle názvu dílu bez ověřeného OE čísla."
        : "",
    compatibilityEvidence,
    blockedAsUsed,
    relevant
  };
}

export function selectDriverPartOffers(rawOffers = [], request = {}, options = {}) {
  const requireCompatibilityEvidence = options.requireCompatibilityEvidence !== false;
  return rawOffers
    .map((offer) => normalizeDriverPartOffer(offer, request, options))
    .filter((offer) => (
      (offer.title || offer.url) &&
      offer.relevant &&
      !offer.blockedAsUsed &&
      (!requireCompatibilityEvidence || hasStrongCompatibilityEvidence(offer))
    ))
    .sort((left, right) => {
      if (left.priceValue && right.priceValue) return left.priceValue - right.priceValue;
      if (left.priceValue) return -1;
      if (right.priceValue) return 1;
      return left.title.localeCompare(right.title, "cs");
    })
    .slice(0, MAX_OFFERS)
    .map(({ blockedAsUsed, relevant, ...offer }) => offer);
}

function offersFromProviderPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.offers)) return payload.offers;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.candidates)) return payload.candidates;
  return [];
}

function safeErrorDetail(error) {
  return truncate(cleanString(error?.message || error), 220);
}

function extractOpenAiOutputText(payload = {}) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const texts = [];
  for (const outputItem of Array.isArray(payload.output) ? payload.output : []) {
    if (typeof outputItem?.text === "string") {
      texts.push(outputItem.text);
    }
    for (const contentItem of Array.isArray(outputItem?.content) ? outputItem.content : []) {
      if (typeof contentItem?.text === "string") texts.push(contentItem.text);
      if (typeof contentItem?.content === "string") texts.push(contentItem.content);
    }
  }
  return texts.join("\n").trim();
}

function parseJsonObjectFromText(text) {
  const normalized = cleanString(text);
  if (!normalized) return {};
  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(normalized.slice(start, end + 1));
      } catch {
        return {};
      }
    }
  }
  return {};
}

async function fetchProviderOffers(config, request, query, signal, fetchImpl = fetch) {
  const headers = { "Content-Type": "application/json" };
  const vehicleFitment = vehicleFitmentFromRequest(request);
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query,
      oeNumber: cleanString(request.oePartNumber || request.partOrderNumber),
      partName: cleanString(request.partName || request.verifiedPart || request.probablePart),
      requireOeNumber: Boolean(cleanString(request.oePartNumber || request.partOrderNumber)),
      requireCompatibilityEvidence: true,
      acceptedCompatibilityEvidence: [...STRONG_COMPATIBILITY_EVIDENCE],
      vehicleName: cleanString(request.vehicleName),
      vehicleFitment,
      country: "CZ",
      maxResults: 10,
      allowUsed: config.allowUsed
    }),
    signal
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { text: truncate(text, 500) };
  }

  if (!response.ok) {
    throw new Error(`price search ${response.status}: ${truncate(payload?.error || payload?.message || text, 120)}`);
  }

  return payload;
}

async function fetchOpenAiWebSearchOffers(config, request, query, signal, fetchImpl = fetch) {
  const vehicleFitment = vehicleFitmentFromRequest(request);
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.openAiModel,
      tools: [{
        type: "web_search",
        search_context_size: "low",
        user_location: {
          type: "approximate",
          country: "CZ",
          timezone: "Europe/Prague"
        }
      }],
      tool_choice: "required",
      input: [
        "Najdi nejlevnejsi relevantni dostupne nove nabidky nahradniho dilu v CR nebo EU.",
        "Jde o pilot AI Boost pro servisni overeni. Nic neobjednavej.",
        `Dotaz: ${query}`,
        `OE cislo: ${cleanString(request.oePartNumber || request.partOrderNumber) || "neuvedeno"}`,
        `Dil: ${cleanString(request.partName || request.verifiedPart || request.probablePart) || "neuvedeno"}`,
        `Vozidlo: ${cleanString(request.vehicleName) || "neuvedeno"}`,
        `VIN metadata: ${vehicleFitment.label || "neuvedeno"}`,
        `Rok/model/motorizace: ${[vehicleFitment.modelYear, vehicleFitment.model, vehicleFitment.engine].filter(Boolean).join(" ") || "neuvedeno"}`,
        cleanString(request.oePartNumber || request.partOrderNumber)
          ? "Kazda vracena nabidka musi na strance, v nazvu, URL nebo snippet/note explicitne obsahovat toto OE cislo. Bez OE cisla ji vynech."
          : "Pokud chybi OE cislo, vrat jen nabidky s jasnym dukazem kompatibility pro uvedeny model/motorizaci z katalogu nebo stranky produktu. Pouha shoda nazvu dilu nestaci.",
        "Do kazde nabidky pridej compatibilityEvidence: oe_number, provider_fitment, vin_fitment, official_catalog nebo verified_compatibility. Bez takove evidence nabidku vynech.",
        "Neposilam VIN ani SPZ. Neber bazar, pouzite dily, vrakoviste, marketplace ani podezrele vysledky.",
        "Vrat pouze validni JSON bez komentare ve tvaru:",
        "{\"offers\":[{\"title\":\"\",\"price\":\"\",\"seller\":\"\",\"url\":\"\",\"availability\":\"\",\"note\":\"\",\"compatibilityEvidence\":\"\"}]}",
        "Pokud nemas jistou cenu a URL, nabidku vynech. Maximalne 5 nabidek."
      ].join("\n")
    }),
    signal
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { text: truncate(text, 800) };
  }

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.error || payload?.message || text;
    throw new Error(`openai web search ${response.status}: ${truncate(detail, 160)}`);
  }

  const outputText = extractOpenAiOutputText(payload);
  const parsed = parseJsonObjectFromText(outputText);
  return {
    ...parsed,
    provider: "openai_web_search",
    outputText: truncate(outputText, 500)
  };
}

export async function runDriverPartPriceSearch(env = {}, request = {}, options = {}) {
  const eligibility = driverPartPriceSearchEligibility(request, options);
  const now = new Date().toISOString();
  const query = driverPartPriceSearchQuery(request);
  const fetchImpl = options.fetchImpl || fetch;

  if (!eligibility.allowed) {
    return {
      ok: false,
      status: "waiting_verified_part",
      checkedAt: now,
      query,
      provider: "",
      offers: [],
      message: eligibility.message,
      resultJson: safeJson({ ok: false, reason: eligibility.code, query, offers: [] })
    };
  }

  const config = providerConfig(env);
  if (options.requireOfficialProvider === true && !config.endpoint && !config.mockJson) {
    const message = "Finální cenový průzkum čeká na oficiální price provider. OpenAI web-search je jen read-only náhled a nesmí sám dodat Patrikovy 3 odkazy.";
    return {
      ok: false,
      status: "official_provider_not_configured",
      checkedAt: now,
      query,
      provider: config.openAiApiKey ? "openai_web_search" : "",
      offers: [],
      message,
      resultJson: safeJson({ ok: false, reason: "official_provider_not_configured", provider: config.openAiApiKey ? "openai_web_search" : "", query, offers: [] })
    };
  }

  if (!config.endpoint && !config.mockJson && !config.openAiApiKey) {
    const message = "AI Boost web-search není nastavený. Chybí OPENAI_API_KEY nebo PARTS_PRICE_SEARCH_ENDPOINT.";
    return {
      ok: false,
      status: "provider_not_configured",
      checkedAt: now,
      query,
      provider: "",
      offers: [],
      message,
      resultJson: safeJson({ ok: false, reason: "provider_not_configured", query, offers: [] })
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
    let payload = null;
    try {
      if (config.mockJson) {
        payload = JSON.parse(config.mockJson);
      } else if (config.endpoint) {
        payload = await fetchProviderOffers(config, request, query, controller.signal, fetchImpl);
      } else {
        payload = await fetchOpenAiWebSearchOffers(config, request, query, controller.signal, fetchImpl);
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const rawOffers = offersFromProviderPayload(payload);
    const offers = selectDriverPartOffers(rawOffers, request, { allowUsed: config.allowUsed });
    const hasRequiredOffers = offers.length >= MAX_OFFERS;
    const status = hasRequiredOffers ? "candidates_found" : offers.length ? "partial_results" : "no_results";
    const message = hasRequiredOffers
      ? "AI Boost našel 3 prokazatelně kompatibilní nabídky k ručnímu ověření. Nic nebylo objednáno."
      : offers.length
        ? `AI Boost našel jen ${offers.length} z 3 potřebných prokazatelně kompatibilních nabídek s odkazy. E-mail Patrikovi zatím neposílám.`
        : "AI Boost nenašel 3 prokazatelně kompatibilní nabídky. Pokračuj ručně.";
    const provider = config.mockJson ? "mock" : config.endpoint ? config.provider : "openai_web_search";

    return {
      ok: hasRequiredOffers,
      status,
      checkedAt: now,
      query,
      provider,
      offers,
      message,
      resultJson: safeJson({
        ok: hasRequiredOffers,
        provider,
        query,
        offers,
        checkedAt: now,
        note: "Pilotní AI Boost cenový průzkum. Nic nebylo objednáno."
      })
    };
  } catch (error) {
    const message = `AI Boost cenový průzkum selhal: ${safeErrorDetail(error)}. Pokračuj ručně.`;
    return {
      ok: false,
      status: "failed",
      checkedAt: now,
      query,
      provider: config.provider,
      offers: [],
      message,
      resultJson: safeJson({
        ok: false,
        provider: config.provider,
        query,
        error: safeErrorDetail(error),
        offers: [],
        checkedAt: now
      })
    };
  }
}

export const __test = {
  driverPartHasVerifiedPriceSeed,
  driverPartPriceSearchQuery,
  providerConfig,
  extractOpenAiOutputText,
  isDriverPartOfficialPriceSearchConfigured,
  vehicleFitmentFromRequest,
  normalizeDriverPartOffer,
  hasStrongCompatibilityEvidence,
  parseJsonObjectFromText,
  parseNumber,
  selectDriverPartOffers
};
