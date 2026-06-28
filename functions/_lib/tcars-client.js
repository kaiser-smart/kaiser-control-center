const TCARS_DEFAULT_BASE_URL = "https://webservice.t-cars.cz/v2/";
const TCARS_SOAP_METHOD_NAMESPACE = "https://webservice.t-cars.cz/v2/index.php?wsdl";
const TCARS_SOAP_ACTION_BASE = "https://webservice.t-cars.cz/v2/index.php";
const TCARS_MIN_POLL_INTERVAL_SECONDS = 30;
const TCARS_DEFAULT_POLL_INTERVAL_SECONDS = 60;
const TCARS_REQUEST_TIMEOUT_MS = 15000;

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

function parseTcarsVehicle(block) {
  const vehicleId = tagValue(block, "vozidloId");
  const licensePlate = tagValue(block, "vozidloRz");
  const internalNumber = tagValue(block, "vozidloEvidCis") || licensePlate || vehicleId;
  const unitId = tagValue(block, "vozidloCisloPalubniJednotky");

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
    active: parseBoolean(tagValue(block, "vozidloVyrazeno")) === false,
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
  const vehicle = parseTcarsVehicle(resolveChildBlock(block, "vozidlo", refs));
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
    ignition: gps.ignition,
    eventText: gps.eventText,
    vehicle
  };
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

export async function fetchTcarsVehicles(env = {}) {
  const config = tcarsConfig(env);
  const xml = await tcarsSoapRequest(env, "vozidlaSeznam", `
    ${loginDataXml(config)}
    <pouzeAktivni xsi:type="xsd:boolean">true</pouzeAktivni>
    <zmenyOd xsi:type="xsd:dateTime">2000-01-01T00:00:00</zmenyOd>
    <zaznamyLimit xsi:type="xsd:int">500</zaznamyLimit>
  `);

  return typedBlocks(xml, "vozidlo", "tVozidlo").map(parseTcarsVehicle);
}

export async function fetchTcarsPositions(env = {}) {
  const config = tcarsConfig(env);
  const xml = await tcarsSoapRequest(env, "vozidlaPozice", `
    ${loginDataXml(config)}
    <pouzeAktivni xsi:type="xsd:boolean">true</pouzeAktivni>
  `);
  const refs = multiRefMap(xml);

  return typedBlocks(xml, "pozice", "tPozice").map((block) => parseTcarsPosition(block, refs));
}

function tcarsErrorPayload(basePayload, error) {
  return {
    ...basePayload,
    apiStatus: "waiting",
    waitingReason: error?.code || "tcars_read_failed",
    message: "Nepodařilo se načíst data z T-Cars.",
    errorCode: error?.code || "tcars_read_failed"
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

    return {
      ...basePayload,
      mode: "tcars",
      apiStatus: "ready",
      waitingReason: "",
      message: "T-Cars data byla načtena přes read-only SOAP API.",
      vehicles,
      locations,
      lastKnownLocations: locations,
      lastFetchedAt: fetchedAt,
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
    vehicleType: "",
    brand: "",
    model: vehicle.model || "",
    vin: vehicle.vin || "",
    year: "",
    fuelType: "",
    euroNorm: "",
    bodyType: "",
    department: "",
    assignedDriverId: "",
    assignedDriverName: "",
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
