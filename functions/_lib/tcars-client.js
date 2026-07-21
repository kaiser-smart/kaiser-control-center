const TCARS_DEFAULT_BASE_URL = "https://webservice.t-cars.cz/v2/";
const TCARS_SOAP_METHOD_NAMESPACE = "https://webservice.t-cars.cz/v2/index.php?wsdl";
const TCARS_SOAP_ACTION_BASE = "https://webservice.t-cars.cz/v2/index.php";
const TCARS_MIN_POLL_INTERVAL_SECONDS = 30;
const TCARS_DEFAULT_POLL_INTERVAL_SECONDS = 60;
const TCARS_REQUEST_TIMEOUT_MS = 15000;
const TCARS_STALE_LOCATION_SECONDS = 30 * 60;
const TCARS_FUEL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class TcarsClientError extends Error {
  constructor(message, status = 503, code = "tcars_unavailable") {
    super(message);
    this.name = "TcarsClientError";
    this.status = status;
    this.code = code;
  }
}

function present(value) {
  return String(value || "").trim() !== "";
}

function numberValue(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function gpsDateValue(item = {}) {
  return item.lastGpsAt || item.gpsAt || item.positionAt || item.updatedAt || item.receivedAt || "";
}

function gpsDate(item = {}) {
  const value = gpsDateValue(item);
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isCoordinateValid(item = {}) {
  const latitude = numberValue(item.latitude);
  const longitude = numberValue(item.longitude);
  return latitude !== null
    && longitude !== null
    && latitude !== 0
    && longitude !== 0
    && Math.abs(latitude) <= 90
    && Math.abs(longitude) <= 180;
}

function locationKey(item = {}) {
  const vehicle = item.vehicle || {};
  return String(
    item.externalVehicleId
      || item.tcarsVehicleId
      || item.vehicleId
      || item.licensePlate
      || item.internalNumber
      || vehicle.externalVehicleId
      || vehicle.tcarsVehicleId
      || vehicle.vehicleId
      || vehicle.licensePlate
      || vehicle.internalNumber
      || item.id
      || vehicle.id
      || ""
  ).trim().toLowerCase();
}

function latestTimestamp(items = []) {
  const latest = items
    .map((item) => gpsDate(item))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return latest ? latest.toISOString() : "";
}

function summarizeTcarsData(vehicles = [], locations = [], options = {}) {
  const staleAfterSeconds = Number(options.staleAfterSeconds || TCARS_STALE_LOCATION_SECONDS);
  const nowMs = Number(options.nowMs || Date.now());
  const vehicleKeys = new Set((Array.isArray(vehicles) ? vehicles : []).map(locationKey).filter(Boolean));
  const validLocations = [];
  const staleLocations = [];
  const invalidLocations = [];

  for (const location of Array.isArray(locations) ? locations : []) {
    const date = gpsDate(location);
    if (!isCoordinateValid(location) || !date || date.getFullYear() <= 1900) {
      invalidLocations.push(location);
      continue;
    }

    const ageSeconds = Math.max(0, Math.round((nowMs - date.getTime()) / 1000));
    if (ageSeconds > staleAfterSeconds) {
      staleLocations.push(location);
      continue;
    }

    validLocations.push(location);
  }

  const validKeys = new Set(validLocations.map(locationKey).filter(Boolean));
  const staleKeys = new Set(staleLocations.map(locationKey).filter(Boolean));
  const invalidKeys = new Set(invalidLocations.map(locationKey).filter(Boolean));
  const totalVehicles = vehicleKeys.size || new Set((Array.isArray(locations) ? locations : []).map(locationKey).filter(Boolean)).size || (vehicles.length || locations.length || 0);
  const withoutValidLocationCount = Math.max(0, totalVehicles - validKeys.size);

  return {
    dataMode: options.dataMode || "waiting",
    isDemo: false,
    isLive: options.dataMode === "live-readonly",
    liveVerified: options.dataMode === "live-readonly" && validLocations.length > 0,
    vehiclesTotal: totalVehicles,
    validLocationCount: validLocations.length,
    staleLocationCount: staleLocations.length,
    invalidLocationCount: Math.max(invalidLocations.length, invalidKeys.size),
    withoutValidLocationCount,
    lastUpdatedAt: latestTimestamp(locations),
    staleAfterSeconds,
    hasStalePositions: staleLocations.length > 0,
    notificationsEnabled: false,
    geofencing: {
      alertDistanceKm: 15,
      status: "draft",
      mode: "proposal-only",
      cloudRunner: "not-active",
      auditLog: "required-before-live",
      permissionCheck: "required-before-live",
      liveModeRequired: true,
      notificationsEnabled: false
    }
  };
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xmlDecode(value) {
  return String(value || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function pollIntervalSeconds(env) {
  const value = Number(env.TCARS_POLL_INTERVAL_SECONDS || TCARS_DEFAULT_POLL_INTERVAL_SECONDS);
  if (!Number.isFinite(value)) {
    return TCARS_DEFAULT_POLL_INTERVAL_SECONDS;
  }

  return Math.max(TCARS_MIN_POLL_INTERVAL_SECONDS, Math.round(value));
}

function endpointUrl(baseUrl) {
  const value = String(baseUrl || TCARS_DEFAULT_BASE_URL).trim() || TCARS_DEFAULT_BASE_URL;
  if (/\/index\.php$/i.test(value)) {
    return value;
  }

  return new URL("index.php", value.endsWith("/") ? value : `${value}/`).toString();
}

function tagRegExp(tag, flags = "i") {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<(?:[\\w.-]+:)?${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escapedTag}>`, flags);
}

function selfClosingTagRegExp(tag, flags = "i") {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<(?:[\\w.-]+:)?${escapedTag}\\b([^>]*)\\/>`, flags);
}

function attributeValue(attributes, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)(?:[\\w.-]+:)?${escapedName}=(["'])(.*?)\\1`, "i").exec(attributes || "");
  return match ? xmlDecode(match[2]) : "";
}

function tagValue(block, tag) {
  const match = tagRegExp(tag).exec(block || "");
  if (!match) {
    return "";
  }

  return xmlDecode(match[1].replace(/<[^>]+>/g, "").trim());
}

function allTagBlocks(xml, tag) {
  return [...String(xml || "").matchAll(tagRegExp(tag, "gi"))].map((match) => match[1]);
}

function multiRefMap(xml) {
  const refs = new Map();
  const refMatches = String(xml || "").matchAll(/<multiRef\b([^>]*)>([\s\S]*?)<\/multiRef>/gi);
  for (const match of refMatches) {
    const attributes = match[1] || "";
    const id = attributeValue(attributes, "id");
    if (!id) {
      continue;
    }

    refs.set(id, {
      body: match[2] || "",
      type: attributeValue(attributes, "type")
    });
  }
  return refs;
}

function blockTypeMatches(type, expectedType) {
  return String(type || "").split(":").pop() === expectedType;
}

function hrefFromAttributes(attributes) {
  return attributeValue(attributes, "href").replace(/^#/, "");
}

function resolveChildBlock(block, tag, refs) {
  const nested = tagRegExp(tag).exec(block || "");
  if (nested) {
    const opening = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b([^>]*)>`, "i").exec(nested[0]);
    const href = hrefFromAttributes(opening?.[1] || "");
    return href && refs.has(href) ? refs.get(href).body : nested[1];
  }

  const selfClosing = selfClosingTagRegExp(tag).exec(block || "");
  if (!selfClosing) {
    return "";
  }

  const href = hrefFromAttributes(selfClosing[1] || "");
  return href && refs.has(href) ? refs.get(href).body : "";
}

function typedBlocks(xml, tag, typeName) {
  const refs = multiRefMap(xml);
  const directBlocks = allTagBlocks(xml, tag);
  const selfClosingBlocks = [...String(xml || "").matchAll(selfClosingTagRegExp(tag, "gi"))]
    .map((match) => refs.get(hrefFromAttributes(match[1] || ""))?.body || "")
    .filter(Boolean);
  const refBlocks = [...refs.values()]
    .filter((ref) => blockTypeMatches(ref.type, typeName))
    .map((ref) => ref.body);

  return [...directBlocks, ...selfClosingBlocks, ...refBlocks]
    .map((block) => String(block || "").trim())
    .filter(Boolean);
}

function parseNumber(value) {
  const number = Number(String(value || "").trim().replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function parseInteger(value) {
  const number = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(number) ? number : null;
}

function parseBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["true", "1", "ano", "yes"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "ne", "no"].includes(normalized)) {
    return false;
  }
  return null;
}

function parseTcarsDictionary(block) {
  if (!cleanString(block)) return null;
  return {
    id: parseInteger(tagValue(block, "id")),
    name: tagValue(block, "nazev"),
    code: tagValue(block, "kod")
  };
}

function parseTcarsConsumption(block) {
  if (!cleanString(block)) return null;
  return {
    city: parseNumber(tagValue(block, "spotrebaMesto")),
    outsideCity: parseNumber(tagValue(block, "spotrebaMimoMesto")),
    combined: parseNumber(tagValue(block, "spotrebaKombinovana")),
    co2: parseNumber(tagValue(block, "spotrebaEmiseCO2"))
  };
}

function parseTcarsGroupBasic(block, refs = new Map(), depth = 0) {
  if (!cleanString(block)) return null;
  const group = {
    id: parseInteger(tagValue(block, "skupinaId")),
    name: tagValue(block, "skupinaNazev"),
    number: tagValue(block, "skupinaCislo"),
    superior: null,
    leader: null,
    center: parseTcarsDictionary(resolveChildBlock(block, "skupinaStredisko", refs)),
    retired: parseBoolean(tagValue(block, "skupinaVyrazeno")),
    lastChangedAt: tagValue(block, "skupinaPosledniZmena")
  };
  if (depth < 2) {
    group.superior = parseTcarsGroupBasic(resolveChildBlock(block, "skupinaNadrizena", refs), refs, depth + 1);
    group.leader = parseTcarsPerson(resolveChildBlock(block, "skupinaVedouci", refs), refs, depth + 1);
  }
  return group;
}

function parseTcarsPerson(block, refs = new Map(), depth = 0) {
  if (!cleanString(block)) return null;
  return {
    id: parseInteger(tagValue(block, "osobaId")),
    name: tagValue(block, "osobaJmeno"),
    number: tagValue(block, "osobaCislo"),
    phone: tagValue(block, "osobaTelefon"),
    mobile: tagValue(block, "osobaMobil"),
    email: tagValue(block, "osobaEmail"),
    rfid: tagValue(block, "osobaRFID"),
    driverCard: tagValue(block, "osobaKartaRidice"),
    login: tagValue(block, "osobaLogin"),
    group: depth < 2 ? parseTcarsGroupBasic(resolveChildBlock(block, "osobaSkupina", refs), refs, depth + 1) : null,
    role: tagValue(block, "osobaRole"),
    center: parseTcarsDictionary(resolveChildBlock(block, "osobaStredisko", refs)),
    position: parseTcarsDictionary(resolveChildBlock(block, "osobaPozice", refs)),
    retired: parseBoolean(tagValue(block, "osobaVyrazeno")),
    refrigerationQualificationFrom: tagValue(block, "osobaRefZkOd"),
    refrigerationQualificationTo: tagValue(block, "osobaRefZkDo"),
    lastChangedAt: tagValue(block, "osobaPosledniZmena")
  };
}

function parseTcarsVehicle(block, refs = new Map()) {
  const vehicleId = tagValue(block, "vozidloId");
  const licensePlate = tagValue(block, "vozidloRz");
  const internalNumber = tagValue(block, "vozidloEvidCis") || licensePlate || vehicleId;
  const unitId = tagValue(block, "vozidloCisloPalubniJednotky");
  const retired = parseBoolean(tagValue(block, "vozidloVyrazeno"));

  return {
    id: vehicleId ? `tcars-${vehicleId}` : `tcars-${licensePlate || internalNumber}`,
    vehicleId: "",
    externalProvider: "tcars",
    externalVehicleId: vehicleId,
    externalUnitId: unitId,
    tcarsVehicleId: vehicleId,
    tcarsUnitId: unitId,
    tcarsLicensePlate: licensePlate,
    gpsProvider: "tcars",
    licensePlate,
    internalNumber,
    model: tagValue(block, "vozidloModel"),
    vin: tagValue(block, "vozidloVin"),
    retired,
    active: retired !== true,
    availableForReservation: parseBoolean(tagValue(block, "vozidloProRezervace")),
    allowedForPrivateUse: parseBoolean(tagValue(block, "vozidloProSoukromeUcely")),
    group: parseTcarsGroupBasic(resolveChildBlock(block, "vozidloSkupina", refs), refs),
    responsiblePerson: parseTcarsPerson(resolveChildBlock(block, "vozidloOdpovedny", refs), refs),
    responsibleSince: tagValue(block, "vozidloOdpovednyOd"),
    center: parseTcarsDictionary(resolveChildBlock(block, "vozidloStredisko", refs)),
    type: parseTcarsDictionary(resolveChildBlock(block, "vozidloDruh", refs)),
    category: parseTcarsDictionary(resolveChildBlock(block, "vozidloKategorie", refs)),
    emissionStandard: parseTcarsDictionary(resolveChildBlock(block, "vozidloEmisniNorma", refs)),
    primaryFuel: parseTcarsDictionary(resolveChildBlock(block, "vozidloPalivo1", refs)),
    secondaryFuel: parseTcarsDictionary(resolveChildBlock(block, "vozidloPalivo2", refs)),
    primaryConsumption: parseTcarsConsumption(resolveChildBlock(block, "vozidloSpotreba1", refs)),
    secondaryConsumption: parseTcarsConsumption(resolveChildBlock(block, "vozidloSpotreba2", refs)),
    purchasePrice: parseNumber(tagValue(block, "vozidloPorizovaciCena")),
    registrationDate: tagValue(block, "vozidloDatumRegistrace"),
    lastChangedAt: tagValue(block, "vozidloPosledniZmena"),
    source: "T-Cars jednotka"
  };
}

function parseTcarsGpsData(block) {
  return {
    id: tagValue(block, "id"),
    recordedAt: tagValue(block, "datumCas"),
    longitude: parseNumber(tagValue(block, "longitude")),
    latitude: parseNumber(tagValue(block, "latitude")),
    gpsValid: parseBoolean(tagValue(block, "gpsValid")),
    address: tagValue(block, "misto"),
    odometerKm: parseNumber(tagValue(block, "tachometer")),
    speedKmh: parseInteger(tagValue(block, "rychlost")),
    altitude: parseInteger(tagValue(block, "altitude")),
    heading: parseInteger(tagValue(block, "azimut")),
    ignition: parseBoolean(tagValue(block, "zapalovani")),
    emergency: parseBoolean(tagValue(block, "nouze")),
    switchActive: parseBoolean(tagValue(block, "prepinac")),
    eventCode: parseInteger(tagValue(block, "udalost")),
    eventText: tagValue(block, "udalostText"),
    voltage: parseNumber(tagValue(block, "napeti"))
  };
}

function vehicleStatusFromGps(gps) {
  if (gps.gpsValid === false || gps.latitude === null || gps.longitude === null) {
    return "no_signal";
  }

  return Number(gps.speedKmh || 0) > 0 ? "moving" : "stopped";
}

function parseTcarsPosition(block, refs) {
  const vehicle = parseTcarsVehicle(resolveChildBlock(block, "vozidlo", refs), refs);
  const gps = parseTcarsGpsData(resolveChildBlock(block, "gpsData", refs));

  return {
    id: gps.id ? `tcars-position-${gps.id}` : `tcars-position-${vehicle.externalVehicleId || vehicle.licensePlate}`,
    vehicleId: "",
    externalProvider: "tcars",
    externalVehicleId: vehicle.externalVehicleId,
    externalUnitId: vehicle.externalUnitId,
    licensePlate: vehicle.licensePlate,
    internalNumber: vehicle.internalNumber,
    driverId: "",
    driverName: "",
    status: vehicleStatusFromGps(gps),
    latitude: gps.latitude,
    longitude: gps.longitude,
    speedKmh: gps.speedKmh,
    heading: gps.heading,
    address: gps.address,
    source: "T-Cars jednotka",
    gpsProvider: "tcars",
    gpsUnitId: vehicle.externalUnitId,
    lastGpsAt: gps.recordedAt,
    receivedAt: new Date().toISOString(),
    updatedAt: gps.recordedAt || new Date().toISOString(),
    gpsValid: gps.gpsValid,
    odometerKm: gps.odometerKm,
    altitude: gps.altitude,
    ignition: gps.ignition,
    emergency: gps.emergency,
    switchActive: gps.switchActive,
    eventCode: gps.eventCode,
    eventText: gps.eventText,
    voltage: gps.voltage,
    vehicle
  };
}

function parseTcarsTrip(block, refs = new Map()) {
  return {
    id: tagValue(block, "jizdaId"),
    startedAt: tagValue(block, "jizdaOd"),
    endedAt: tagValue(block, "jizdaDo"),
    origin: tagValue(block, "jizdaOdkud"),
    destination: tagValue(block, "jizdaKam"),
    country: tagValue(block, "jizdaStat"),
    odometerStartKm: parseNumber(tagValue(block, "jizdaStavKmPocatek")),
    odometerEndKm: parseNumber(tagValue(block, "jizdaStavKmKonec")),
    distanceKm: parseNumber(tagValue(block, "jizdaDelkaKm")),
    engineHoursStart: parseNumber(tagValue(block, "jizdaStavMthPocatek")),
    engineHoursEnd: parseNumber(tagValue(block, "jizdaStavMthKonec")),
    cityOutsideRatio: parseNumber(tagValue(block, "jizdaPomerMestoMimomesto")),
    fuelState: parseNumber(tagValue(block, "jizdaStavPhm")),
    fuelStateSecondary: parseNumber(tagValue(block, "jizdaStavPhm2")),
    privateTrip: parseBoolean(tagValue(block, "jizdaSoukroma")),
    purpose: tagValue(block, "jizdaUcel"),
    center: parseTcarsDictionary(resolveChildBlock(block, "jizdaStredisko", refs)),
    driver: parseTcarsPerson(resolveChildBlock(block, "jizdaRidic", refs), refs),
    responsiblePerson: parseTcarsPerson(resolveChildBlock(block, "jizdaOdpovedny", refs), refs),
    note: tagValue(block, "jizdaPoznamka")
  };
}

export function parseTcarsTripsXml(xml) {
  const refs = multiRefMap(xml);
  return typedBlocks(xml, "jizda", "tJizda").map((block) => parseTcarsTrip(block, refs));
}

function parseTcarsCost(block, refs = new Map()) {
  return {
    id: tagValue(block, "nakladId"),
    kind: parseTcarsDictionary(resolveChildBlock(block, "nakladDruh", refs)),
    type: parseTcarsDictionary(resolveChildBlock(block, "nakladTyp", refs)),
    occurredAt: tagValue(block, "nakladDatum"),
    price: parseNumber(tagValue(block, "nakladCena")),
    priceWithoutVat: parseNumber(tagValue(block, "nakladCenaBezDPH")),
    priceWithVat: parseNumber(tagValue(block, "nakladCenaSDPH")),
    vatPercent: parseInteger(tagValue(block, "nakladDPHProcento")),
    quantity: parseNumber(tagValue(block, "nakladMnozstvi")),
    description: tagValue(block, "nakladPopis"),
    invoiceFrom: tagValue(block, "nakladFakturaOd"),
    invoiceNumber: tagValue(block, "nakladFakturaCislo"),
    invoiceTo: tagValue(block, "nakladFakturaDo"),
    internalInvoiceNumber: tagValue(block, "nakladFakturaInterni"),
    note: tagValue(block, "nakladPoznamka"),
    imported: parseBoolean(tagValue(block, "nakladImportovan")),
    importedToSap: parseBoolean(tagValue(block, "nakladImportovanSAP")),
    cardType: tagValue(block, "nakladTypKarty")
  };
}

export function parseTcarsCostsXml(xml) {
  const refs = multiRefMap(xml);
  return typedBlocks(xml, "naklad", "tNaklady").map((block) => parseTcarsCost(block, refs));
}

function parseTcarsAreaEvent(block) {
  return {
    occurredAt: tagValue(block, "datum"),
    vehicleId: tagValue(block, "vozidloId"),
    vehicleModel: tagValue(block, "vozidloModel"),
    licensePlate: tagValue(block, "vozidloRz"),
    internalNumber: tagValue(block, "vozidloEvidCis"),
    area: tagValue(block, "oblast"),
    address: tagValue(block, "adresa"),
    city: tagValue(block, "mesto"),
    postalCode: tagValue(block, "psc"),
    action: tagValue(block, "akce"),
    place: tagValue(block, "misto"),
    longitude: parseNumber(tagValue(block, "longitude")),
    latitude: parseNumber(tagValue(block, "latitude")),
    speedKmh: parseInteger(tagValue(block, "rychlost"))
  };
}

export function parseTcarsAreaEventsXml(xml) {
  return typedBlocks(xml, "vozidloOblasti", "tVozidlaOblasti").map(parseTcarsAreaEvent);
}

function parseTcarsIdentification(block) {
  return {
    occurredAt: tagValue(block, "datum"),
    vehicleId: tagValue(block, "vozidloId"),
    vehicleModel: tagValue(block, "vozidloModel"),
    licensePlate: tagValue(block, "vozidloRz"),
    internalNumber: tagValue(block, "vozidloEvidCis"),
    driverId: tagValue(block, "ridicId"),
    driverName: tagValue(block, "ridicJmeno"),
    driverNumber: tagValue(block, "ridicOsCis"),
    place: tagValue(block, "misto"),
    chipNumber: tagValue(block, "cipCislo"),
    cardNumber: tagValue(block, "kartaCislo")
  };
}

export function parseTcarsIdentificationsXml(xml) {
  return typedBlocks(xml, "identifikace", "tIdentifikace").map(parseTcarsIdentification);
}

function parseTcarsRoadTax(block) {
  const months = {};
  for (let month = 1; month <= 12; month += 1) {
    months[`M${month}`] = parseNumber(tagValue(block, `M${month}`));
  }
  const quarters = {};
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    quarters[`Q${quarter}`] = parseNumber(tagValue(block, `Q${quarter}`));
  }
  return {
    vehicleId: tagValue(block, "vozidloId"),
    licensePlate: tagValue(block, "vozidloRz"),
    registrationDate: tagValue(block, "vozidloDatumRegistrace"),
    displacementCm3: parseNumber(tagValue(block, "cm3")),
    axleCount: parseInteger(tagValue(block, "vozidloPocetNaprav")),
    annualRate: parseNumber(tagValue(block, "rocniSazba")),
    osv: parseInteger(tagValue(block, "OSV")),
    months,
    quarters,
    total: parseNumber(tagValue(block, "celkem"))
  };
}

export function parseTcarsRoadTaxXml(xml) {
  return typedBlocks(xml, "result", "tPodkladProSilnicniDan").map(parseTcarsRoadTax);
}

export function parseTcarsVehiclesXml(xml) {
  const refs = multiRefMap(xml);
  return typedBlocks(xml, "vozidlo", "tVozidlo").map((block) => parseTcarsVehicle(block, refs));
}

export function parseTcarsPositionsXml(xml) {
  const refs = multiRefMap(xml);
  return typedBlocks(xml, "pozice", "tPozice").map((block) => parseTcarsPosition(block, refs));
}

function normalizeRegistration(value) {
  return cleanString(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function dateTimeValue(value) {
  const date = new Date(cleanString(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function loginDataXml(config) {
  return `
    <loginData xsi:type="tns:tLoginData">
      <cisloSmlouvy xsi:type="xsd:string">${xmlEscape(config.customerNumber)}</cisloSmlouvy>
      <jmeno xsi:type="xsd:string">${xmlEscape(config.username)}</jmeno>
      <heslo xsi:type="xsd:string">${xmlEscape(config.password)}</heslo>
    </loginData>`;
}

function soapEnvelope(method, paramsXml) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope
  xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:tns="http://webservice.t-cars.cz/soap/TCarsWebService">
  <SOAP-ENV:Body>
    <m:${method} xmlns:m="${TCARS_SOAP_METHOD_NAMESPACE}" SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      ${paramsXml}
    </m:${method}>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

export function tcarsConfig(env = {}) {
  const baseUrl = String(env.TCARS_BASE_URL || TCARS_DEFAULT_BASE_URL).trim();
  const apiMode = String(env.TCARS_API_MODE || "").trim();
  const customerNumber = String(env.TCARS_CUSTOMER_NUMBER || "").trim();
  const username = String(env.TCARS_USERNAME || "").trim();
  const password = String(env.TCARS_PASSWORD || "").trim();
  const hasCustomerNumber = present(env.TCARS_CUSTOMER_NUMBER);
  const hasUsernamePassword = present(env.TCARS_USERNAME) && present(env.TCARS_PASSWORD);
  const hasApiToken = present(env.TCARS_API_TOKEN);
  const hasCredentials = hasUsernamePassword || hasApiToken;

  return {
    baseUrl,
    endpointUrl: endpointUrl(baseUrl),
    apiMode,
    customerNumber,
    username,
    password,
    configured: Boolean(baseUrl && apiMode && hasCustomerNumber && hasCredentials),
    hasCustomerNumber,
    hasCredentials,
    hasApiToken,
    hasUsernamePassword,
    pollIntervalSeconds: pollIntervalSeconds(env),
    documentationStatus: "verified-wsdl"
  };
}

function ensureSoapConfig(config) {
  if (!config.configured) {
    throw new TcarsClientError("T-Cars napojení čeká na konfiguraci.", 409, "tcars_not_configured");
  }

  if (!config.hasUsernamePassword) {
    throw new TcarsClientError("T-Cars SOAP API vyžaduje zákaznické číslo, uživatelské jméno a heslo.", 409, "tcars_username_password_required");
  }
}

async function withTimeout(promise, timeoutMs = TCARS_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await promise(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function soapFaultMessage(xml) {
  return tagValue(xml, "faultstring") || tagValue(xml, "faultcode") || "";
}

async function tcarsSoapRequest(env, method, paramsXml) {
  const config = tcarsConfig(env);
  ensureSoapConfig(config);

  const body = soapEnvelope(method, paramsXml);
  const response = await withTimeout((signal) => fetch(config.endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `${TCARS_SOAP_ACTION_BASE}/${method}`
    },
    body,
    signal
  }));

  const text = await response.text();
  const fault = soapFaultMessage(text);

  if (!response.ok || fault) {
    throw new TcarsClientError(
      fault ? `T-Cars SOAP chyba: ${fault}` : "T-Cars SOAP API nevrátilo úspěšnou odpověď.",
      response.ok ? 502 : response.status,
      "tcars_soap_failed"
    );
  }

  return text;
}

export async function fetchTcarsVehicles(env = {}, options = {}) {
  const config = tcarsConfig(env);
  const activeOnly = options.activeOnly !== false;
  const xml = await tcarsSoapRequest(env, "vozidlaSeznam", `
    ${loginDataXml(config)}
    <pouzeAktivni xsi:type="xsd:boolean">${activeOnly ? "true" : "false"}</pouzeAktivni>
    <zmenyOd xsi:type="xsd:dateTime">2000-01-01T00:00:00</zmenyOd>
    <zaznamyLimit xsi:type="xsd:int">500</zaznamyLimit>
  `);

  return parseTcarsVehiclesXml(xml);
}

export async function fetchTcarsPositions(env = {}, options = {}) {
  const config = tcarsConfig(env);
  const activeOnly = options.activeOnly !== false;
  const xml = await tcarsSoapRequest(env, "vozidlaPozice", `
    ${loginDataXml(config)}
    <pouzeAktivni xsi:type="xsd:boolean">${activeOnly ? "true" : "false"}</pouzeAktivni>
  `);
  return parseTcarsPositionsXml(xml);
}

export async function fetchTcarsVehicleTrips(env = {}, vehicle = {}, options = {}) {
  const config = tcarsConfig(env);
  const now = dateTimeValue(options.now) || new Date();
  const from = dateTimeValue(options.from) || new Date(now.getTime() - TCARS_FUEL_MAX_AGE_MS);
  const vehicleId = cleanString(vehicle.tcarsVehicleId || vehicle.externalVehicleId || vehicle.vehicleId);
  const licensePlate = cleanString(vehicle.tcarsLicensePlate || vehicle.licensePlate || vehicle.registration);
  if (!vehicleId && !licensePlate) {
    throw new TcarsClientError("Pro načtení stavu nádrže chybí ověřené vozidlo.", 400, "tcars_vehicle_required");
  }
  const xml = await tcarsSoapRequest(env, "knihaJizdVozidlo", `
    ${loginDataXml(config)}
    <vozidloId xsi:type="xsd:int">${xmlEscape(vehicleId || 0)}</vozidloId>
    <vozidloRz xsi:type="xsd:string">${xmlEscape(licensePlate)}</vozidloRz>
    <datumOd xsi:type="xsd:date">${xmlEscape(from.toISOString().slice(0, 10))}</datumOd>
    <datumDo xsi:type="xsd:date">${xmlEscape(now.toISOString().slice(0, 10))}</datumDo>
  `);
  return parseTcarsTripsXml(xml);
}

function tcarsDateRange(options = {}) {
  const now = dateTimeValue(options.now) || new Date();
  const daysValue = Number.parseInt(String(options.days || "30"), 10);
  const days = [1, 7, 30].includes(daysValue) ? daysValue : 30;
  const from = dateTimeValue(options.from) || new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  return {
    days,
    from,
    now,
    fromDate: from.toISOString().slice(0, 10),
    toDate: now.toISOString().slice(0, 10)
  };
}

export async function fetchTcarsVehicleCosts(env = {}, vehicle = {}, options = {}) {
  const config = tcarsConfig(env);
  const range = tcarsDateRange(options);
  const vehicleId = cleanString(vehicle.tcarsVehicleId || vehicle.externalVehicleId || vehicle.vehicleId);
  const licensePlate = cleanString(vehicle.tcarsLicensePlate || vehicle.licensePlate || vehicle.registration);
  const xml = await tcarsSoapRequest(env, "vozidloNaklady", `
    ${loginDataXml(config)}
    <vozidloId xsi:type="xsd:int">${xmlEscape(vehicleId || 0)}</vozidloId>
    <vozidloRz xsi:type="xsd:string">${xmlEscape(licensePlate)}</vozidloRz>
    <datumOd xsi:type="xsd:date">${xmlEscape(range.fromDate)}</datumOd>
    <datumDo xsi:type="xsd:date">${xmlEscape(range.toDate)}</datumDo>
  `);
  return parseTcarsCostsXml(xml);
}

export async function fetchTcarsAreaEvents(env = {}, options = {}) {
  const config = tcarsConfig(env);
  const range = tcarsDateRange(options);
  const xml = await tcarsSoapRequest(env, "vozidlaOblasti", `
    ${loginDataXml(config)}
    <datumOd xsi:type="xsd:date">${xmlEscape(range.fromDate)}</datumOd>
    <datumDo xsi:type="xsd:date">${xmlEscape(range.toDate)}</datumDo>
  `);
  return parseTcarsAreaEventsXml(xml);
}

export async function fetchTcarsIdentifications(env = {}, options = {}) {
  const config = tcarsConfig(env);
  const range = tcarsDateRange(options);
  const xml = await tcarsSoapRequest(env, "vozidlaIdentifikace", `
    ${loginDataXml(config)}
    <datumOd xsi:type="xsd:date">${xmlEscape(range.fromDate)}</datumOd>
    <datumDo xsi:type="xsd:date">${xmlEscape(range.toDate)}</datumDo>
  `);
  return parseTcarsIdentificationsXml(xml);
}

export async function fetchTcarsRoadTax(env = {}, vehicle = {}, options = {}) {
  const config = tcarsConfig(env);
  const now = dateTimeValue(options.now) || new Date();
  const year = Number.parseInt(String(options.year || now.getUTCFullYear()), 10) || now.getUTCFullYear();
  const vehicleId = cleanString(vehicle.tcarsVehicleId || vehicle.externalVehicleId || vehicle.vehicleId);
  const xml = await tcarsSoapRequest(env, "reportPodkladProSilnicniDan", `
    ${loginDataXml(config)}
    <rok xsi:type="xsd:integer">${xmlEscape(year)}</rok>
    <vozidloId xsi:type="xsd:integer">${xmlEscape(vehicleId || 0)}</vozidloId>
  `);
  return parseTcarsRoadTaxXml(xml);
}

export function verifiedTcarsFuelState(trips = [], vehicle = {}, options = {}) {
  const now = dateTimeValue(options.now) || new Date();
  const maxAgeMs = Number.isFinite(Number(options.maxAgeMs))
    ? Math.max(0, Number(options.maxAgeMs))
    : TCARS_FUEL_MAX_AGE_MS;
  const exactVehicleId = cleanString(vehicle.tcarsVehicleId || vehicle.externalVehicleId || vehicle.vehicleId);
  const exactRegistration = normalizeRegistration(
    vehicle.tcarsLicensePlate || vehicle.licensePlate || vehicle.registration
  );
  if (!exactVehicleId && !exactRegistration) {
    return { verified: false, status: "vehicle_unverified", value: null, unit: "", source: "T-Cars" };
  }
  const latest = (Array.isArray(trips) ? trips : [])
    .filter((trip) => trip && trip.fuelState !== null && Number.isFinite(Number(trip.fuelState)))
    .map((trip) => ({ ...trip, endedDate: dateTimeValue(trip.endedAt || trip.startedAt) }))
    .filter((trip) => trip.endedDate)
    .sort((left, right) => right.endedDate.getTime() - left.endedDate.getTime())[0] || null;
  if (!latest) {
    return { verified: false, status: "fuel_unavailable", value: null, unit: "", source: "T-Cars" };
  }
  const ageMs = now.getTime() - latest.endedDate.getTime();
  if (ageMs < 0 || ageMs > maxAgeMs) {
    return {
      verified: false,
      status: "fuel_stale",
      value: null,
      unit: "",
      source: "T-Cars",
      measuredAt: latest.endedDate.toISOString()
    };
  }
  return {
    verified: true,
    status: "verified",
    value: Number(latest.fuelState),
    unit: "",
    unitStatus: "not_provided_by_api",
    source: "T-Cars",
    measuredAt: latest.endedDate.toISOString(),
    vehicleId: exactVehicleId,
    registration: exactRegistration
  };
}

export async function loadVerifiedTcarsFuelState(env = {}, vehicle = {}, options = {}) {
  try {
    const trips = await fetchTcarsVehicleTrips(env, vehicle, options);
    return verifiedTcarsFuelState(trips, vehicle, options);
  } catch (error) {
    console.error("tcars.read_fuel_failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return {
      verified: false,
      status: error?.code || "tcars_fuel_read_failed",
      value: null,
      unit: "",
      source: "T-Cars"
    };
  }
}

function tcarsVehicleIdentity(vehicle = {}) {
  return {
    id: cleanString(vehicle.tcarsVehicleId || vehicle.externalVehicleId || vehicle.vehicleId)
      .replace(/^tcars-/i, ""),
    registration: normalizeRegistration(
      vehicle.tcarsLicensePlate || vehicle.licensePlate || vehicle.registration
    )
  };
}

function tcarsVehicleMatches(candidate = {}, vehicle = {}) {
  const wanted = tcarsVehicleIdentity(vehicle);
  const actual = tcarsVehicleIdentity(candidate);
  if (wanted.id && actual.id) return wanted.id === actual.id;
  return Boolean(wanted.registration && actual.registration && wanted.registration === actual.registration);
}

function tcarsFilterVehicleItems(items = [], vehicle = {}) {
  return (Array.isArray(items) ? items : []).filter((item) => tcarsVehicleMatches(item, vehicle));
}

function tcarsSettledResult(result, fallback = []) {
  return result?.status === "fulfilled" ? result.value : fallback;
}

function tcarsSettledStatus(result) {
  if (result?.status === "fulfilled") return { apiStatus: "ready", errorCode: "" };
  return {
    apiStatus: "waiting",
    errorCode: cleanString(result?.reason?.code || "tcars_read_failed")
  };
}

export async function loadTcarsVehicleDetailPayload(env = {}, fleetVehicle = {}, options = {}) {
  const config = tcarsConfig(env);
  const range = tcarsDateRange(options);
  const base = {
    provider: "tcars",
    source: "T-Cars read-only SOAP API",
    apiStatus: "waiting",
    dataStatus: "waiting",
    readOnly: true,
    writesData: false,
    startsAutomation: false,
    sendsNotifications: false,
    period: { days: range.days, from: range.fromDate, to: range.toDate },
    capabilities: {
      engineRpm: { available: false, reason: "not_exposed_by_tcars_wsdl" },
      fuelState: { available: true, source: "knihaJizdVozidlo.jizdaStavPhm", unitProvided: false },
      liveTelemetry: { available: true, source: "vozidlaPozice.gpsData" }
    },
    vehicle: null,
    currentPosition: null,
    fuelState: { verified: false, status: "waiting", value: null, unit: "", source: "T-Cars" },
    trips: [],
    costs: [],
    areaEvents: [],
    identifications: [],
    roadTax: [],
    methodStatus: {},
    fetchedAt: "",
    message: config.configured
      ? "T-Cars detail čeká na načtení."
      : "T-Cars napojení čeká na konfiguraci."
  };

  if (!config.configured) return base;

  try {
    const [vehicles, positions] = await Promise.all([
      fetchTcarsVehicles(env, { activeOnly: false }),
      fetchTcarsPositions(env, { activeOnly: false })
    ]);
    const exactVehicles = tcarsFilterVehicleItems(vehicles, fleetVehicle);
    if (exactVehicles.length !== 1) {
      return {
        ...base,
        dataStatus: exactVehicles.length > 1 ? "ambiguous_vehicle" : "vehicle_not_linked",
        message: exactVehicles.length > 1
          ? "T-Cars vozidlo nelze bezpečně určit jednoznačně."
          : "Vozidlo není jednoznačně propojené s T-Cars."
      };
    }

    const vehicle = exactVehicles[0];
    const currentPosition = tcarsFilterVehicleItems(positions, vehicle)
      .sort((left, right) => String(right.lastGpsAt || "").localeCompare(String(left.lastGpsAt || "")))[0] || null;
    const detailOptions = { ...options, days: range.days, from: range.from, now: range.now };
    const [tripsResult, costsResult, areasResult, identificationsResult, roadTaxResult] = await Promise.allSettled([
      fetchTcarsVehicleTrips(env, vehicle, detailOptions),
      fetchTcarsVehicleCosts(env, vehicle, detailOptions),
      fetchTcarsAreaEvents(env, detailOptions),
      fetchTcarsIdentifications(env, detailOptions),
      fetchTcarsRoadTax(env, vehicle, detailOptions)
    ]);
    const trips = tcarsSettledResult(tripsResult, [])
      .sort((left, right) => String(right.endedAt || right.startedAt || "").localeCompare(String(left.endedAt || left.startedAt || "")));
    const costs = tcarsSettledResult(costsResult, [])
      .sort((left, right) => String(right.occurredAt || "").localeCompare(String(left.occurredAt || "")));
    const areaEvents = tcarsFilterVehicleItems(tcarsSettledResult(areasResult, []), vehicle)
      .sort((left, right) => String(right.occurredAt || "").localeCompare(String(left.occurredAt || "")));
    const identifications = tcarsFilterVehicleItems(tcarsSettledResult(identificationsResult, []), vehicle)
      .sort((left, right) => String(right.occurredAt || "").localeCompare(String(left.occurredAt || "")));
    const roadTax = tcarsFilterVehicleItems(tcarsSettledResult(roadTaxResult, []), vehicle);
    const methodStatus = {
      vehicles: { apiStatus: "ready", errorCode: "" },
      positions: { apiStatus: "ready", errorCode: "" },
      trips: tcarsSettledStatus(tripsResult),
      costs: tcarsSettledStatus(costsResult),
      areaEvents: tcarsSettledStatus(areasResult),
      identifications: tcarsSettledStatus(identificationsResult),
      roadTax: tcarsSettledStatus(roadTaxResult)
    };
    const partial = Object.values(methodStatus).some((status) => status.apiStatus !== "ready");
    const fetchedAt = new Date().toISOString();

    return {
      ...base,
      apiStatus: "ready",
      dataStatus: partial ? "partial" : "ready",
      vehicle,
      currentPosition,
      fuelState: verifiedTcarsFuelState(trips, vehicle, { now: range.now }),
      trips,
      costs,
      areaEvents,
      identifications,
      roadTax,
      methodStatus,
      fetchedAt,
      message: partial
        ? "T-Cars detail byl načten částečně; nedostupné části jsou označené."
        : "T-Cars detail byl načten read-only bez zápisu do provozních dat."
    };
  } catch (error) {
    console.error("tcars.read_vehicle_detail_failed", {
      code: error?.code || "unknown",
      message: error?.message || "unknown"
    });
    return {
      ...base,
      errorCode: error?.code || "tcars_vehicle_detail_failed",
      message: "T-Cars detail vozidla se nepodařilo načíst."
    };
  }
}

function tcarsErrorPayload(basePayload, error) {
  const summary = {
    ...(basePayload.summary || summarizeTcarsData([], [], { dataMode: "waiting" })),
    dataMode: "waiting",
    isLive: false,
    liveVerified: false,
    hasStalePositions: false
  };

  return {
    ...basePayload,
    apiStatus: "waiting",
    dataMode: "waiting",
    isDemo: false,
    isLive: false,
    liveVerified: false,
    waitingReason: error?.code || "tcars_read_failed",
    message: "Nepodařilo se načíst data z T-Cars.",
    errorCode: error?.code || "tcars_read_failed",
    summary
  };
}

export function tcarsStatusPayload(env = {}) {
  const config = tcarsConfig(env);
  const waitingReason = config.configured
    ? "read-only-ready"
    : "configuration";

  return {
    provider: "tcars",
    mode: config.configured ? "tcars" : "waiting",
    dataMode: "waiting",
    isDemo: false,
    isLive: false,
    liveVerified: false,
    apiStatus: "waiting",
    configured: config.configured,
    waitingReason,
    message: config.configured
      ? "T-Cars read-only napojení je připravené."
      : "T-Cars napojení čeká na konfiguraci.",
    source: "T-Cars jednotka",
    tabletRole: "Primární poloha vozidla je z T-Cars jednotky. Android tablet slouží jako vozidlový terminál.",
    pollIntervalSeconds: config.pollIntervalSeconds,
    vehicles: [],
    locations: [],
    lastKnownLocations: [],
    lastUpdatedAt: "",
    summary: summarizeTcarsData([], [], { dataMode: "waiting" }),
    fallback: {
      enabled: false,
      message: "Poslední známá poloha zatím není k dispozici."
    },
    config: {
      baseUrl: config.baseUrl,
      endpointUrl: config.endpointUrl,
      apiMode: config.apiMode || "",
      hasCustomerNumber: config.hasCustomerNumber,
      hasCredentials: config.hasCredentials,
      hasApiToken: config.hasApiToken,
      hasUsernamePassword: config.hasUsernamePassword,
      documentationStatus: config.documentationStatus
    }
  };
}

export async function loadTcarsStatusPayload(env = {}) {
  const basePayload = tcarsStatusPayload(env);

  if (!basePayload.configured) {
    return basePayload;
  }

  try {
    const [vehicles, locations] = await Promise.all([
      fetchTcarsVehicles(env),
      fetchTcarsPositions(env)
    ]);
    const fetchedAt = new Date().toISOString();
    const summary = summarizeTcarsData(vehicles, locations, {
      dataMode: "live-readonly",
      nowMs: Date.now()
    });

    return {
      ...basePayload,
      mode: "tcars",
      dataMode: "live-readonly",
      isDemo: false,
      isLive: true,
      liveVerified: summary.liveVerified,
      apiStatus: "ready",
      waitingReason: "",
      message: "T-Cars data byla načtena přes read-only SOAP API.",
      vehicles,
      locations,
      lastKnownLocations: locations,
      lastFetchedAt: fetchedAt,
      lastUpdatedAt: summary.lastUpdatedAt || fetchedAt,
      summary,
      fallback: {
        enabled: false,
        message: locations.length ? "Fallback není aktivní, T-Cars data jsou dostupná." : "T-Cars nevrátil aktuální polohy."
      }
    };
  } catch (error) {
    console.error("tcars.read_status_failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return tcarsErrorPayload(basePayload, error);
  }
}

export function tcarsVehiclesPayload(env = {}) {
  const status = tcarsStatusPayload(env);
  return {
    provider: status.provider,
    apiStatus: status.apiStatus,
    configured: status.configured,
    message: status.message,
    vehicles: [],
    units: []
  };
}

export async function loadTcarsVehiclesPayload(env = {}) {
  const basePayload = tcarsVehiclesPayload(env);

  if (!basePayload.configured) {
    return basePayload;
  }

  try {
    const vehicles = await fetchTcarsVehicles(env);
    return {
      ...basePayload,
      apiStatus: "ready",
      message: "T-Cars vozidla byla načtena přes read-only SOAP API.",
      vehicles,
      units: vehicles
        .filter((vehicle) => vehicle.tcarsUnitId)
        .map((vehicle) => ({
          tcarsVehicleId: vehicle.tcarsVehicleId,
          tcarsUnitId: vehicle.tcarsUnitId,
          licensePlate: vehicle.licensePlate,
          internalNumber: vehicle.internalNumber,
          model: vehicle.model
        }))
    };
  } catch (error) {
    console.error("tcars.read_vehicles_failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return tcarsErrorPayload(basePayload, error);
  }
}

function fleetVehicleFromTcars(vehicle) {
  const internalNumber = vehicle.internalNumber || vehicle.licensePlate || vehicle.tcarsVehicleId || "";
  const status = vehicle.active === false ? "retired" : "active";

  return {
    id: vehicle.tcarsVehicleId ? `tcars-${vehicle.tcarsVehicleId}` : `tcars-${internalNumber}`,
    internalNumber,
    licensePlate: vehicle.licensePlate || "",
    vehicleType: vehicle.type?.name || vehicle.category?.name || "",
    brand: "",
    model: vehicle.model || "",
    vin: vehicle.vin || "",
    year: "",
    fuelType: [vehicle.primaryFuel?.name, vehicle.secondaryFuel?.name].filter(Boolean).join(" + "),
    euroNorm: vehicle.emissionStandard?.name || "",
    bodyType: "",
    department: vehicle.center?.name || vehicle.group?.name || "",
    assignedDriverId: "",
    assignedDriverName: vehicle.responsiblePerson?.name || "",
    status,
    mileageKm: null,
    stkValidTo: "",
    emissionsValidTo: "",
    tachographValidTo: "",
    craneRevisionValidTo: "",
    liftRevisionValidTo: "",
    pressureEquipmentRevisionValidTo: "",
    fireExtinguisherValidTo: "",
    insuranceCompany: "",
    insurancePolicyNumber: "",
    insuranceValidTo: "",
    openDefects: null,
    tcarsVehicleId: vehicle.tcarsVehicleId || "",
    tcarsUnitId: vehicle.tcarsUnitId || "",
    tcarsLicensePlate: vehicle.tcarsLicensePlate || vehicle.licensePlate || "",
    gpsProvider: "tcars",
    gpsUnitId: vehicle.tcarsUnitId || "",
    telemetrySource: "T-Cars read-only",
    tcarsProfile: vehicle,
    source: "T-Cars read-only",
    readOnly: true,
    createdAt: "",
    updatedAt: vehicle.lastChangedAt || ""
  };
}

function fleetSummaryFromVehicles(vehicles) {
  const active = vehicles.filter((vehicle) => vehicle.status === "active").length;
  const retired = vehicles.filter((vehicle) => vehicle.status === "retired").length;

  return {
    total: vehicles.length,
    active,
    outOfOrder: 0,
    inService: 0,
    retired,
    stkDue: 0,
    revisionDue: 0,
    insuranceDue: 0,
    openDefects: 0
  };
}

export async function loadFleetVehiclesPayload(env = {}) {
  const basePayload = {
    provider: "tcars",
    source: "T-Cars read-only",
    apiStatus: "waiting",
    configured: tcarsConfig(env).configured,
    readOnly: true,
    vehicles: [],
    summary: fleetSummaryFromVehicles([]),
    message: "Vozový park čeká na T-Cars konfiguraci."
  };

  if (!basePayload.configured) {
    return basePayload;
  }

  try {
    const vehicles = (await fetchTcarsVehicles(env)).map(fleetVehicleFromTcars);
    return {
      ...basePayload,
      apiStatus: "ready",
      configured: true,
      vehicles,
      summary: fleetSummaryFromVehicles(vehicles),
      message: "Vozidla byla načtena read-only z T-Cars. Do D1 se nic neukládá.",
      lastFetchedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("fleet.tcars_vehicles_failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return {
      ...basePayload,
      waitingReason: error?.code || "tcars_read_failed",
      errorCode: error?.code || "tcars_read_failed",
      message: "Vozidla z T-Cars se nepodařilo načíst."
    };
  }
}

export async function syncTcarsLocations(env = {}) {
  const status = tcarsStatusPayload(env);

  if (!status.configured) {
    throw new TcarsClientError(status.message, 409, "tcars_not_configured");
  }

  const locations = await fetchTcarsPositions(env);

  return {
    provider: "tcars",
    apiStatus: "ready",
    saved: false,
    message: "T-Cars polohy byly načteny read-only. Ukládání do D1 není v této fázi zapnuté.",
    locationsFetched: locations.length,
    locations
  };
}
