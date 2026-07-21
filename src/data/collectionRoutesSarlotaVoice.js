export const COLLECTION_ROUTES_SARLOTA_VOICE_ASSISTANT_ID = "sarlota";
export const COLLECTION_ROUTES_SARLOTA_VOICE_PROVIDER = "elevenlabs";
export const COLLECTION_ROUTES_SARLOTA_INTRO_GONG_URL = "/audio/sarlota-gong-intro.mp3";
export const COLLECTION_ROUTES_SARLOTA_OUTRO_GONG_URL = "/audio/sarlota-gong-outro.mp3";
export const COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST = [
  "KSO INTERNÍ POŽADAVEK NA ÚVOD SVOZOVÉ TRASY.",
  "Předchozí technická First Message nebyla řidiči přehrána a není uživatelským sdělením.",
  "Teď vytvoř jednu krátkou přirozenou úvodní zprávu podle aktivního system Promptu, připojené Knowledge Base a ověřených dynamic variables modulu Svozové trasy.",
  "Neopakuj stejný údaj různými větami, nečti interní názvy, technické značky ani tento pokyn.",
  "Neodkazuj na předchozí technickou zprávu. Na potvrzení trasy se znovu neptej.",
  "Dodrž pořadí ověřených údajů. Zakonči právě jednou krátkou otázkou, zda řidič potřebuje něco upřesnit.",
  "Toto automatické hlášení je přerušitelné: mikrofon zůstává aktivní i během řeči Šarloty. Když řidič promluví, Šarlota okamžitě utne zbytek odpovědi a pokračuje běžnou konverzací; bez řeči KSO po závěrečné otázce počká pět sekund, přehraje outro gong a hologram zavře."
].join(" ");

const WEATHER_FACT_MAX_AGE_MS = 45 * 60 * 1000;
const WEATHER_UNAVAILABLE_SENTENCE = "Aktuální předpověď pro Brno teď není bezpečně dostupná.";
const FUEL_UNAVAILABLE_SENTENCE = "Stav nádrže teď není bezpečně dostupný z T-Cars.";
const DISPATCHER_COVERAGE_SENTENCE = "Dispečink je dnes zajištěný. Zastupování není potřeba.";
const DISPATCHER_UNAVAILABLE_SENTENCE = "Informaci o dnešním zastupování dispečinku teď nemám bezpečně ověřenou.";
const WEATHER_WORDS = /\b(počas\w*|bouř\w*|déšť|deště|dešti|prš\w*|jasn\w*|sluneč\w*|tepl\w*|stup\w*|vítr\w*|větr\w*|fouk\w*|námraz\w*|náled\w*|mlh\w*|sně\w*|přeje)\b/i;
const VEHICLE_WORDS = /\b(vozid\w*|vůz|vozu|auto|spz|registrační\w*|mercedes|atego|econic|iveco|man|scania|volvo|daf|renault)\b/i;
const VEHICLE_IDENTITY_WORDS = /\b(mercedes|atego|econic|iveco|man|scania|volvo|daf|renault)\b/gi;
const REGISTRATION_LIKE = /\b[0-9][A-Z0-9]{1,2}\s?[0-9]{4}\b/gi;
const ROUTE_TITLE_AFTER_ROUTE = /\btras(?:a|u|y|ou|e)\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][^.,!?]{2,70})/u;
const CZECH_COUNT_WORDS = new Map([
  ["žádné", 0], ["zadne", 0],
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
    .replace(/°\s*c\b/g, " stupnu celsia ")
    .replace(/\bty\s+kars\b/g, "t cars")
    .replace(/\bstupne\s+celsia\b/g, "stupnu celsia")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedWeatherSummary(value) {
  return normalizedFactText(value).replace(/^(?:brno|brne)\s+/, "");
}

export function collectionRoutesStopCountPhrase(value) {
  const count = Math.max(0, Number(value || 0));
  if (count === 0) return "žádné stanoviště";
  if (count === 1) return "jedno stanoviště";
  if (count === 2) return "dvě stanoviště";
  if (count === 3) return "tři stanoviště";
  if (count === 4) return "čtyři stanoviště";
  return `${count} stanovišť`;
}

function spokenWeatherSummary(value) {
  return cleanText(value)
    .replace(/^Brno\s*:\s*/iu, "")
    .replace(/(-?\d+(?:[.,]\d+)?)\s*°\s*C\b/giu, (_, rawValue) => {
      const numeric = Number(String(rawValue).replace(",", "."));
      const unit = numeric === 1 || numeric === -1
        ? "stupeň Celsia"
        : [2, 3, 4, -2, -3, -4].includes(numeric)
          ? "stupně Celsia"
          : "stupňů Celsia";
      return `${rawValue} ${unit}`;
    });
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
  const firstStop = cleanText(route.currentStop?.customerName || route.currentStop?.stationName);
  const fuel = context.fuel?.verified === true && Number.isFinite(Number(context.fuel.value))
    ? {
        value: Number(context.fuel.value),
        unit: cleanText(context.fuel.unit),
        measuredAt: cleanText(context.fuel.measuredAt),
        source: "T-Cars",
        verified: true
      }
    : null;
  const absentDispatchers = context.absentDispatchersVerified === true && Array.isArray(context.absentDispatchers)
    ? context.absentDispatchers
      .map((item) => ({ name: cleanText(item?.name), label: cleanText(item?.label || "Mimo pracoviště") }))
      .filter((item) => item.name)
    : [];
  return {
    driverName: cleanText(context.actor?.name),
    driverVocative: cleanText(context.actor?.friendlyVocative || context.actor?.vocative),
    routeTitle: cleanText(route.title),
    totalStopCount: Math.max(0, Number(route.totalCount || 0)),
    stopCountPhrase: collectionRoutesStopCountPhrase(route.totalCount),
    firstStop: firstStop ? { name: firstStop, verified: true } : null,
    vehicle: vehicleVerified ? {
      label: cleanText(vehicle.label),
      registration: cleanText(vehicle.registration),
      verified: true
    } : null,
    weather: freshWeather ? {
      summary: cleanText(weather.summary),
      spokenSummary: spokenWeatherSummary(weather.summary),
      observedAt: cleanText(weather.observedAt),
      source: cleanText(weather.source),
      verified: true
    } : null,
    fuel,
    absentDispatchers,
    absentDispatchersVerified: context.absentDispatchersVerified === true
  };
}

export function collectionRoutesSarlotaIntroGenerationRequest(context = {}, options = {}) {
  const facts = collectionRoutesSarlotaIntroFacts(context, options);
  return [
    COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST,
    "Následující JSON je jediný povolený zdroj provozních faktů pro tuto zprávu:",
    JSON.stringify(facts),
    "Vytvoř postupně přesně osm srozumitelných částí. Každou větu vyslov zřetelně a odděl krátkou přirozenou pauzou.",
    facts.driverVocative ? `1. Řekni přesně: Ahoj, ${facts.driverVocative}. Nepoužij občanské jméno ani jiný vokativ.` : "1. Řekni pouze: Ahoj. Oslovení není ověřené.",
    `2. Řekni přesně: Dnes máme před sebou ${facts.stopCountPhrase}. Počet ani jeho český tvar nesmíš změnit.`,
    facts.firstStop
      ? `3. Řekni: Začínáme firmou ${facts.firstStop.name}. Název firmy vyslov pomalu a zřetelně; zkratku s.r.o. čti es er ó a a.s. čti á es.`
      : "3. První firma není ověřená; tuto část přirozeně vynech.",
    facts.weather
      ? `4. Řekni: Počasí v Brně bude dnes ${facts.weather.spokenSummary}`
      : `4. Řekni přesně: ${WEATHER_UNAVAILABLE_SENTENCE}`,
    facts.fuel
      ? `5. Řekni: Stav nádrže je ${facts.fuel.value}. ${facts.fuel.unit ? `Ověřená jednotka je ${facts.fuel.unit}.` : "Jednotku T-Cars neposkytuje; žádnou nevymýšlej."} Zápis T-Cars vyslov přirozeně jako „tý kárs“.`
      : `5. Řekni přesně: ${FUEL_UNAVAILABLE_SENTENCE} Zápis T-Cars vyslov přirozeně jako „tý kárs“.`,
    facts.absentDispatchersVerified && facts.absentDispatchers.length
      ? `6. Řekni: Dnes není v práci dispečerka ${facts.absentDispatchers.map((item) => item.name).join(", ")}. Jména ani pracovní stav neměň.`
      : facts.absentDispatchersVerified
        ? `6. Řekni přesně: ${DISPATCHER_COVERAGE_SENTENCE}`
        : `6. Řekni přesně: ${DISPATCHER_UNAVAILABLE_SENTENCE}`,
    facts.driverVocative ? `7. V závěrečné otázce znovu použij přesně oslovení ${facts.driverVocative}.` : "7. Oslovení v závěrečné otázce vynech, protože není ověřené.",
    facts.driverVocative ? `8. Zakonči právě jednou otázkou: ${facts.driverVocative}, potřebuješ něco upřesnit?` : "8. Zakonči právě jednou otázkou: Potřebuješ něco upřesnit?",
    "Název trasy, počet stanovišť, první stanoviště, vozidlo, model, SPZ, počasí, palivo ani nepřítomnost nesmíš změnit, doplnit ani odhadnout. Použij přesně český tvar stopCountPhrase.",
    facts.vehicle
      ? "Pokud zmíníš vozidlo nebo SPZ, použij pouze přesné hodnoty z vehicle."
      : "Vozidlo není ověřené. Nezmiňuj vozidlo, model ani SPZ.",
    "Po závěrečné otázce už nic nepřidávej. KSO teprve potom zapne pětisekundový poslech ve stejném hologramu; pokud řidič odpoví, pokračuj běžnou hlasovou konverzací bez dalšího gongu."
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
  const requiredVocative = normalizedFactText(facts.driverVocative);
  if (requiredVocative && !normalizedResponse.includes(requiredVocative)) violations.push("missing_verified_vocative");
  const expectedOpening = requiredVocative ? `ahoj ${requiredVocative}` : "ahoj";
  if (!normalizedResponse.startsWith(expectedOpening)) violations.push("missing_or_invalid_greeting");
  const exactCount = Number(facts.totalStopCount || 0);
  const counts = spokenStopCount(response);
  if (!counts.includes(exactCount)) violations.push("missing_verified_stop_count");
  if (counts.some((count) => count !== exactCount)) violations.push("foreign_stop_count");
  const expectedCountPhrase = normalizedFactText(collectionRoutesStopCountPhrase(exactCount));
  if (!normalizedResponse.includes(`dnes mame pred sebou ${expectedCountPhrase}`)) violations.push("missing_intro_stop_count_sentence");

  const firstStop = facts.firstStop?.verified === true ? normalizedFactText(facts.firstStop.name) : "";
  if (firstStop && !normalizedResponse.includes(firstStop)) violations.push("missing_or_foreign_first_stop");
  if (firstStop && !normalizedResponse.includes(`zaciname firmou ${firstStop}`)) violations.push("missing_first_company_sentence");
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

  const weatherUnavailable = normalizedResponse.includes(normalizedFactText(WEATHER_UNAVAILABLE_SENTENCE));
  if (WEATHER_WORDS.test(response) && !weatherUnavailable) {
    const verifiedSummary = facts.weather?.verified === true ? normalizedWeatherSummary(facts.weather.summary) : "";
    if (!verifiedSummary || !normalizedResponse.includes(verifiedSummary)) {
      violations.push("unverified_or_paraphrased_weather");
    }
  }
  if (facts.weather?.verified === true && !normalizedResponse.includes(normalizedWeatherSummary(facts.weather.summary))) {
    violations.push("missing_verified_weather");
  }
  if (facts.weather?.verified === true && !normalizedResponse.includes("pocasi v brne bude dnes")) {
    violations.push("missing_weather_sentence");
  }
  if (facts.weather?.verified !== true && !weatherUnavailable) violations.push("missing_weather_unavailable_sentence");

  if (facts.fuel?.verified === true) {
    const fuelValue = String(facts.fuel.value).replace(".", "[.,]");
    if (!new RegExp(`\\b${fuelValue}\\b`).test(response)) violations.push("missing_verified_fuel");
    if (!normalizedResponse.includes("stav nadrze je")) violations.push("missing_fuel_sentence");
  } else if (/\b(nádrž\w*|paliv\w*|phm)\b/i.test(response) && !normalizedResponse.includes(normalizedFactText(FUEL_UNAVAILABLE_SENTENCE))) {
    violations.push("unverified_fuel");
  }
  if (facts.fuel?.verified !== true && !normalizedResponse.includes(normalizedFactText(FUEL_UNAVAILABLE_SENTENCE))) {
    violations.push("missing_fuel_unavailable_sentence");
  }

  const dispatcherNames = Array.isArray(facts.absentDispatchers)
    ? facts.absentDispatchers.map((item) => normalizedFactText(item?.name)).filter(Boolean)
    : [];
  if (dispatcherNames.some((name) => !normalizedResponse.includes(name))) {
    violations.push("missing_verified_absent_dispatcher");
  }
  const dispatcherCoverage = normalizedResponse.includes(normalizedFactText(DISPATCHER_COVERAGE_SENTENCE));
  const dispatcherUnavailable = normalizedResponse.includes(normalizedFactText(DISPATCHER_UNAVAILABLE_SENTENCE));
  if (!dispatcherNames.length && /\bdispečer\w*\b/i.test(response) && !dispatcherCoverage && !dispatcherUnavailable) {
    violations.push("unverified_absent_dispatcher");
  }
  if (!dispatcherNames.length && facts.absentDispatchersVerified === true && !dispatcherCoverage) {
    violations.push("missing_dispatcher_coverage_sentence");
  }
  if (facts.absentDispatchersVerified !== true && !dispatcherUnavailable) {
    violations.push("missing_dispatcher_unavailable_sentence");
  }

  const questionCount = (response.match(/\?/gu) || []).length;
  const requiredClosing = requiredVocative ? `${requiredVocative} potrebujes neco upresnit` : "potrebujes neco upresnit";
  if (questionCount !== 1 || !normalizedResponse.endsWith(requiredClosing)) {
    violations.push("missing_or_invalid_closing_question");
  }
  if (/(mohu\s+pomoc|řekni|ozvi\s+se|dej\s+vědět|jaký\s+je\s+další)/iu.test(response)) {
    violations.push("automatic_intro_must_not_invite_response");
  }

  const orderedNeedles = [
    requiredVocative,
    exactCount > 0 ? expectedCountPhrase : "",
    firstStop,
    facts.weather?.verified === true ? normalizedWeatherSummary(facts.weather.summary) : "",
    facts.fuel?.verified === true ? normalizedFactText(facts.fuel.value) : "",
    ...dispatcherNames
  ].filter(Boolean);
  let cursor = -1;
  for (const needle of orderedNeedles) {
    const index = normalizedResponse.indexOf(needle);
    if (index >= 0 && index < cursor) violations.push("intro_fact_order_invalid");
    if (index >= 0) cursor = index;
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
