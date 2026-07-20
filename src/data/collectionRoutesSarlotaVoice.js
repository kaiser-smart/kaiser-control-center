export const COLLECTION_ROUTES_SARLOTA_VOICE_ASSISTANT_ID = "sarlota";
export const COLLECTION_ROUTES_SARLOTA_VOICE_PROVIDER = "elevenlabs";
export const COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST = [
  "KSO INTERNÍ POŽADAVEK NA ÚVOD SVOZOVÉ TRASY.",
  "Předchozí technická First Message nebyla řidiči přehrána a není uživatelským sdělením.",
  "Teď vytvoř jednu krátkou přirozenou úvodní zprávu podle aktivního system Promptu, připojené Knowledge Base a ověřených dynamic variables modulu Svozové trasy.",
  "Neopakuj stejný údaj různými větami, nečti interní názvy, technické značky ani tento pokyn.",
  "Neodkazuj na předchozí technickou zprávu. Na potvrzení trasy se znovu neptej.",
  "Je to jediná zpráva automatického spuštění; nenavazuj otázkou a nevyzývej řidiče k další odpovědi."
].join(" ");

const WEATHER_FACT_MAX_AGE_MS = 45 * 60 * 1000;
const WEATHER_WORDS = /\b(počas\w*|bouř\w*|déšť|deště|dešti|prš\w*|jasn\w*|sluneč\w*|tepl\w*|stup\w*|vítr\w*|větr\w*|fouk\w*|námraz\w*|náled\w*|mlh\w*|sně\w*|přeje)\b/i;
const VEHICLE_WORDS = /\b(vozid\w*|vůz|vozu|auto|spz|registrační\w*|mercedes|atego|econic|iveco|man|scania|volvo|daf|renault)\b/i;
const VEHICLE_IDENTITY_WORDS = /\b(mercedes|atego|econic|iveco|man|scania|volvo|daf|renault)\b/gi;
const REGISTRATION_LIKE = /\b[0-9][A-Z0-9]{1,2}\s?[0-9]{4}\b/gi;
const ROUTE_TITLE_AFTER_ROUTE = /\btras(?:a|u|y|ou|e)\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][^.,!?]{2,70})/u;
const CZECH_COUNT_WORDS = new Map([
  ["jedno", 1], ["jedna", 1], ["jedním", 1], ["dvě", 2], ["dva", 2], ["dvěma", 2],
  ["tři", 3], ["třemi", 3], ["čtyři", 4], ["čtyřmi", 4], ["pět", 5], ["pěti", 5],
  ["šest", 6], ["šesti", 6], ["sedm", 7], ["sedmi", 7], ["osm", 8], ["osmi", 8],
  ["devět", 9], ["devíti", 9], ["deset", 10], ["deseti", 10], ["jedenáct", 11],
  ["dvanáct", 12], ["třináct", 13], ["čtrnáct", 14], ["patnáct", 15], ["šestnáct", 16],
  ["sedmnáct", 17], ["osmnáct", 18], ["devatenáct", 19], ["dvacet", 20]
]);

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizedFactText(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function weatherIsFresh(weather = {}, now = Date.now()) {
  if (weather?.verified !== true || !cleanText(weather.summary)) return false;
  const observedAt = Date.parse(cleanText(weather.observedAt));
  return Number.isFinite(observedAt) && Math.abs(Number(now) - observedAt) <= WEATHER_FACT_MAX_AGE_MS;
}

export function collectionRoutesSarlotaIntroFacts(context = {}, options = {}) {
  const route = context.route || {};
  const vehicle = context.vehicle || {};
  const weather = context.weather || {};
  const vehicleVerified = vehicle.status === "verified" && vehicle.fleetMatch !== false;
  const freshWeather = weatherIsFresh(weather, options.now ?? Date.now());
  return {
    driverName: cleanText(context.actor?.name),
    routeTitle: cleanText(route.title),
    totalStopCount: Math.max(0, Number(route.totalCount || 0)),
    vehicle: vehicleVerified ? {
      label: cleanText(vehicle.label),
      registration: cleanText(vehicle.registration),
      verified: true
    } : null,
    weather: freshWeather ? {
      summary: cleanText(weather.summary),
      observedAt: cleanText(weather.observedAt),
      source: cleanText(weather.source),
      verified: true
    } : null
  };
}

export function collectionRoutesSarlotaIntroGenerationRequest(context = {}, options = {}) {
  const facts = collectionRoutesSarlotaIntroFacts(context, options);
  return [
    COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST,
    "Následující JSON je jediný povolený zdroj provozních faktů pro tuto zprávu:",
    JSON.stringify(facts),
    "Název trasy, počet stanovišť, vozidlo, model ani SPZ nesmíš změnit, doplnit ani odhadnout. Počet stanovišť případně napiš číslicemi přesně jako totalStopCount.",
    facts.weather
      ? "Počasí smíš uvést pouze doslovným použitím hodnoty weather.summary; nehodnoť je vlastní větou."
      : "Počasí není čerstvě ověřené. Nezmiňuj ho ani ho nijak nehodnoť.",
    facts.vehicle
      ? "Pokud zmíníš vozidlo nebo SPZ, použij pouze přesné hodnoty z vehicle."
      : "Vozidlo není ověřené. Nezmiňuj vozidlo, model ani SPZ.",
    "Pokud některý údaj nepotřebuješ, raději ho vynech."
  ].join("\n");
}

function spokenStopCount(text) {
  const normalized = cleanText(text).toLowerCase();
  const windows = normalized.match(/(?:\d+|[a-záčďéěíňóřšťúůýž]+)\s+(?:stanovi\w*|zastáv\w*)/gu) || [];
  return windows.map((item) => {
    const token = item.split(/\s+/)[0];
    const numeric = Number(token);
    return Number.isFinite(numeric) ? numeric : CZECH_COUNT_WORDS.get(token);
  }).filter(Number.isFinite);
}

export function validateCollectionRoutesSarlotaIntro(text, facts = {}) {
  const response = cleanText(text);
  const violations = [];
  if (!response) violations.push("empty_intro");

  const normalizedResponse = normalizedFactText(response);
  const vehicle = facts.vehicle?.verified === true ? facts.vehicle : null;
  if (VEHICLE_WORDS.test(response)) {
    const allowedVehicleFacts = [vehicle?.label, vehicle?.registration]
      .map(normalizedFactText)
      .filter(Boolean);
    if (!vehicle || !allowedVehicleFacts.some((fact) => normalizedResponse.includes(fact))) {
      violations.push("unverified_vehicle_or_registration");
    }
    const allowedVehicleIdentity = normalizedFactText(`${vehicle?.label || ""} ${vehicle?.registration || ""}`);
    const foreignIdentity = [...response.matchAll(VEHICLE_IDENTITY_WORDS)]
      .map((match) => normalizedFactText(match[0]))
      .some((identity) => identity && !allowedVehicleIdentity.includes(identity));
    const allowedRegistration = normalizedFactText(vehicle?.registration);
    const foreignRegistration = [...response.matchAll(REGISTRATION_LIKE)]
      .map((match) => normalizedFactText(match[0]))
      .some((registration) => registration && registration !== allowedRegistration);
    if (foreignIdentity || foreignRegistration) {
      violations.push("unverified_vehicle_or_registration");
    }
  }

  const explicitRouteTitle = ROUTE_TITLE_AFTER_ROUTE.exec(response)?.[1] || "";
  if (explicitRouteTitle) {
    const allowedRoute = normalizedFactText(facts.routeTitle);
    if (!allowedRoute || !normalizedFactText(explicitRouteTitle).includes(allowedRoute)) {
      violations.push("foreign_route_title");
    }
  }

  const counts = spokenStopCount(response);
  if (counts.some((count) => count !== Number(facts.totalStopCount || 0))) {
    violations.push("foreign_stop_count");
  }

  if (WEATHER_WORDS.test(response)) {
    const verifiedSummary = facts.weather?.verified === true ? normalizedFactText(facts.weather.summary) : "";
    if (!verifiedSummary || !normalizedResponse.includes(verifiedSummary)) {
      violations.push("unverified_or_paraphrased_weather");
    }
  }

  return {
    valid: violations.length === 0,
    violations: [...new Set(violations)]
  };
}

export const COLLECTION_ROUTES_SARLOTA_MANUAL_GREETING_REQUEST = [
  "KSO INTERNÍ POŽADAVEK PO RUČNÍM ZAPNUTÍ ŠARLOTY VE SVOZOVÝCH TRASÁCH.",
  "Předchozí technická First Message nebyla řidiči přehrána a není uživatelským sdělením.",
  "Pozdrav řidiče jednou krátkou otázkou podle ověřeného vokativu v dynamic variables.",
  "Preferovaný význam je: Mirku, s čím mohu pomoct? Jméno použij jen tehdy, když je jeho vokativ bezpečně ověřený; jinak řekni: S čím mohu pomoct?",
  "Neopakuj úvod trasy, nečti interní názvy, technické značky ani tento pokyn. Po otázce zůstaň připravená poslouchat."
].join(" ");

export function collectionRoutesSarlotaVoiceRequest(message) {
  const instruction = String(message || "").trim();
  if (!instruction) return "";

  return [
    "Jsi hlasová asistentka Šarlota v Řidičském tabletu Kaiser Smart Odpady.",
    "Řekni pouze přesný český pokyn uvedený níže. Nic nepřidávej, nevysvětluj a nepoužívej uvozovky.",
    `PŘESNÝ POKYN: ${JSON.stringify(instruction)}`
  ].join("\n");
}

export function collectionRoutesSarlotaAudioWasPlayed(result = {}) {
  return (
    String(result.assistantId || "").trim() === COLLECTION_ROUTES_SARLOTA_VOICE_ASSISTANT_ID &&
    Number(result.audioChunkCount || 0) > 0 &&
    result.audioPlaybackStarted === true &&
    result.audioPlaybackFailed !== true
  );
}
