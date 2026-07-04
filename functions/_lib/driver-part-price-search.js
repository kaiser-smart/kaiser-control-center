const DEFAULT_TIMEOUT_MS = 12000;
const MAX_OFFERS = 3;
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

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ error: "unserializable" });
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

function providerConfig(env = {}) {
  return {
    endpoint: cleanString(env.PARTS_PRICE_SEARCH_ENDPOINT || env.PARTS_PRICE_SEARCH_API_URL),
    apiKey: cleanString(env.PARTS_PRICE_SEARCH_API_KEY || env.PARTS_SEARCH_API_KEY),
    provider: cleanString(env.PARTS_PRICE_SEARCH_PROVIDER || env.PARTS_SEARCH_PROVIDER || "custom"),
    allowUsed: truthy(env.PARTS_PRICE_SEARCH_ALLOW_USED),
    timeoutMs: Math.max(1000, Number(env.PARTS_PRICE_SEARCH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS),
    mockJson: cleanString(env.PARTS_PRICE_SEARCH_MOCK_JSON)
  };
}

export function isDriverPartPriceSearchConfigured(env = {}) {
  const config = providerConfig(env);
  return Boolean(config.endpoint || config.mockJson);
}

export function driverPartPriceSearchEligibility(request = {}) {
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
  if (!driverPartHasVerifiedPriceSeed(request)) {
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
  return [
    request.oePartNumber || request.partOrderNumber,
    request.partName || request.verifiedPart || request.probablePart,
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
  const relevant = Boolean(oeMatch || wordMatches >= Math.min(2, partWords.length || 2));

  return {
    title,
    price,
    priceValue: Number.isFinite(priceValue) ? priceValue : 0,
    seller,
    url,
    availability,
    note: truncate(note),
    relevanceNote: oeMatch ? "Shoda podle OE čísla." : wordMatches ? "Shoda podle názvu dílu." : "",
    blockedAsUsed,
    relevant
  };
}

export function selectDriverPartOffers(rawOffers = [], request = {}, options = {}) {
  return rawOffers
    .map((offer) => normalizeDriverPartOffer(offer, request, options))
    .filter((offer) => (offer.title || offer.url) && offer.relevant && !offer.blockedAsUsed)
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

async function fetchProviderOffers(config, request, query, signal) {
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query,
      oeNumber: cleanString(request.oePartNumber || request.partOrderNumber),
      partName: cleanString(request.partName || request.verifiedPart || request.probablePart),
      vehicleName: cleanString(request.vehicleName),
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

export async function runDriverPartPriceSearch(env = {}, request = {}, options = {}) {
  const eligibility = driverPartPriceSearchEligibility(request);
  const now = new Date().toISOString();
  const query = driverPartPriceSearchQuery(request);

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
  if (!config.endpoint && !config.mockJson) {
    const message = "Cenový průzkum není nastavený. Doplň PARTS_PRICE_SEARCH_ENDPOINT nebo proveď průzkum ručně.";
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
      payload = config.mockJson
        ? JSON.parse(config.mockJson)
        : await fetchProviderOffers(config, request, query, controller.signal);
    } finally {
      clearTimeout(timeoutId);
    }

    const rawOffers = offersFromProviderPayload(payload);
    const offers = selectDriverPartOffers(rawOffers, request, { allowUsed: config.allowUsed });
    const status = offers.length ? "candidates_found" : "no_results";
    const message = offers.length
      ? `Cenový průzkum našel ${offers.length} nabídky k ručnímu ověření. Nic nebylo objednáno.`
      : "Cenový průzkum nenašel 3 bezpečně relevantní nabídky. Pokračuj ručně.";

    return {
      ok: offers.length > 0,
      status,
      checkedAt: now,
      query,
      provider: config.provider,
      offers,
      message,
      resultJson: safeJson({
        ok: offers.length > 0,
        provider: config.provider,
        query,
        offers,
        checkedAt: now,
        note: "Pilotní cenový průzkum. Nic nebylo objednáno."
      })
    };
  } catch (error) {
    const message = `Cenový průzkum selhal: ${safeErrorDetail(error)}. Pokračuj ručně.`;
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
  providerConfig,
  normalizeDriverPartOffer,
  parseNumber,
  selectDriverPartOffers
};
