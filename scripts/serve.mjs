import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMetaModuleSource, resolveBuildMeta } from "./build-meta.mjs";
import { DEFAULT_USERS } from "../functions/_lib/default-users.js";
import { normalizeUserInput } from "../functions/_lib/users-store.js";
import {
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  normalizeFeedback,
  normalizeFeedbackPriority,
  normalizeFeedbackStatus
} from "../src/data/moduleFeedback.js";
import { normalizeAbsenceSettings } from "../src/data/absence.js";
import {
  calculateMedicalExamState,
  medicalExamDateValue,
  normalizeMedicalExamCategory
} from "../src/data/medicalExamRules.js";
import { renderMedicalExamRequestDocument } from "../functions/_lib/medical-exam-request-template.js";
import {
  FLEET_VISTOS_IMPORT_MAX_FILE_SIZE_BYTES,
  buildFleetVistosImportPreview
} from "../functions/_lib/fleet-vistos-import-preview.js";
import {
  COLLECTION_ROUTES_MANUAL_IMPORT_MAX_FILE_SIZE_BYTES,
  buildCollectionRoutesManualImportPreview
} from "../functions/_lib/collection-routes-store.js";
import {
  COLLECTION_ROUTE_OPTIMIZATION_MAX_FILE_SIZE_BYTES,
  buildCollectionRouteOptimizationPreview
} from "../functions/_lib/collection-route-optimization-preview.js";
import {
  EMPLOYEE_EXCEL_IMPORT_MAX_FILE_SIZE_BYTES,
  createEmployeeExcelImportPreview
} from "../functions/_lib/employee-excel-import.js";
import {
  EMPLOYEE_DOCUMENT_IMPORT_MAX_FILE_SIZE_BYTES,
  EMPLOYEE_DOCUMENT_IMPORT_MAX_FILES,
  EMPLOYEE_DOCUMENT_IMPORT_MAX_TOTAL_BYTES,
  buildEmployeeDocumentImportPreview
} from "../functions/_lib/employee-document-import.js";
import {
  TcarsClientError,
  loadFleetVehiclesPayload,
  loadTcarsStatusPayload,
  loadTcarsVehiclesPayload,
  syncTcarsLocations,
} from "../functions/_lib/tcars-client.js";
import {
  driverPartRequestMissingQuestion,
  driverPartRequestInitialStatus,
  extractLicensePlate,
  identifyProbablePartFromDescription,
  normalizeLicensePlate,
  normalizeVehicleBrand,
  partSideLabel,
  vehicleBrandLabel
} from "../functions/_lib/driver-parts-catalog.js";
import {
  findSimilarLicensePlates,
  findVehicleByLicensePlate,
  licensePlateKey,
  validateLicensePlateFormat,
  vehicleLicensePlateValue
} from "../src/data/licensePlate.js";
import { verifyMercedesPartForRequest } from "../functions/_lib/mercedes-parts-provider.js";
import { runDriverPartPriceSearch } from "../functions/_lib/driver-part-price-search.js";
import { DEFAULT_THEME_SETTINGS, normalizeThemeSettings } from "../src/data/themeSettings.js";
import { modules } from "../src/data/modules.js";
import {
  ACTIONS,
  PERMISSION_MODULES,
  hasPermission,
  isFullAccessRole,
  normalizeRole,
  roleLabel
} from "../src/permissions.js";
import { buildReceivablesVistosLedgerMapping } from "../functions/_lib/receivables-vistos-ledger-mapping.js";
import { receivablesVistosInvoiceLookbackWindow } from "../functions/_lib/receivables-vistos-preview.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedRoot = process.argv[2] === "dist" ? "dist" : ".";
const publicRoot = path.join(root, requestedRoot);
const preferredPort = Number(process.env.PORT || 5173);
const devCookieName = "smart_odpady_dev_session";
const devSessions = new Map();
let mockUsers = DEFAULT_USERS.map((user) => ({ ...user }));
let mockThemeSettings = normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
let mockAbsenceSettings = normalizeAbsenceSettings();
let mockEmployeeCards = new Map();
let mockEmployeeWorkHistory = new Map();
let mockEmployeeDocuments = new Map();
let mockEmployeeDocumentFiles = new Map();
let mockEmployeeMedicalExams = new Map();
let mockAbsenceRequests = [];
let mockDriverPartRequests = [];
let mockFleetAssignments = new Map();
let mockPartslink24Searches = [];
const mockPartslink24WorkflowUrl = "https://github.com/kaiser-smart/kaiser-control-center/actions/workflows/partslink24-vin-pilot.yml";
let mockModuleFeedback = [];
let mockNotificationLogs = [];
let mockAssistantDailyPromos = new Map();
let mockCollectionRouteBatches = [];
let mockCollectionRouteIssues = [];
let mockCollectionRouteSites = [];
let mockCollectionRouteImportRows = [];
let mockCollectionRouteServices = [];
let mockCollectionRouteContainers = [];
let mockCollectionRouteSourceBatches = [];
let mockCollectionRouteSourceFiles = [];
let mockCollectionRouteSourceRows = [];
let mockDataBoxSyncRuns = [];
let mockDataBoxActions = [];

const mockVehicleWimSites = [
  ["wim-d0-0781-modletice-jesenice", "D0", "km 78,1 / cca km 79", "mezi Modleticemi a Jesenici", "Cernosice", "vpravo + vlevo", "active", "v provozu", 49.9706, 14.5288, 2],
  ["wim-d1-1228-jihlava", "D1", "km 122,8-122,9", "u Jihlavy", "Jihlava", "vlevo 122,8; vpravo 122,9", "maintenance", "oprava do 15. 6. 2025", 49.4298, 15.6395, 2],
  ["wim-d2-0083-zidlochovice", "D2", "km 8,3", "u Brna / Zidlochovic", "Zidlochovice", "vpravo + vlevo", "active", "v provozu", 49.0907, 16.6422, 2],
  ["wim-d3-0919-sobeslav", "D3", "km 91,9", "u Sobeslavi", "Sobeslav", "vpravo + vlevo", "active", "v provozu", 49.2595, 14.7196, 2],
  ["wim-d4-0096-jiloviste", "D4", "km 9,6", "u Jiloviste", "Cernosice", "vpravo + vlevo", "active", "v provozu", 49.9224, 14.3461, 2],
  ["wim-d4-0599-pribram", "D4", "km 59,9", "u Pribrami", "Pribram", "vpravo", "active", "v provozu", 49.6746, 14.0498, 1],
  ["wim-d4-0884-pisek", "D4", "km 88,4", "u Pisku", "Pisek", "vlevo", "active", "v provozu", 49.3532, 14.0952, 1],
  ["wim-d5-0233-beroun", "D5", "km 23,3", "u Berouna", "Beroun", "vlevo", "planned", "vystavba 3Q/4Q 2025", 49.9794, 14.0499, 1],
  ["wim-d5-1062-nyrany", "D5", "km 106,2", "u Plzne / Nyran", "Nyrany", "vpravo", "active", "v provozu", 49.7155, 13.2147, 1],
  ["wim-d6-0112-unhost", "D6", "km 11,2", "u Unhoste", "Kladno", "vpravo + vlevo", "active", "v provozu", 50.0867, 14.1876, 2],
  ["wim-d7-0670-louny", "D7", "km 67,0", "u Loun", "Louny", "vpravo + vlevo", "preselection", "predvyber", 50.3402, 13.8182, 2],
  ["wim-d8-0050-brandys", "D8", "km 5,0", "u Prahy / Brandysa", "Brandys n. L. - St. Boleslav", "vlevo", "upgrade", "technologicky upgrade", 50.1583, 14.4773, 1],
  ["wim-d8-0488-lovosice", "D8", "km 48,8", "u Lovosic", "Lovosice", "vpravo + vlevo", "active", "v provozu", 50.5295, 14.0410, 2],
  ["wim-d10-0067-svemyslice", "D10", "km 6,7 / RSD km 5,70-5,75", "u Svemyslic", "Brandys n. L. - St. Boleslav", "vpravo + vlevo", "active", "v provozu / ostry provoz planovan od 6/2025", 50.1282, 14.6167, 2],
  ["wim-d11-0782-hradec-kralove", "D11", "km 78,2", "u Hradce Kralove", "Hradec Kralove", "vpravo + vlevo", "active", "v provozu", 50.1986, 15.7358, 2],
  ["wim-d35-2880-olomouc", "D35", "km 288,0", "u Olomouce", "Olomouc", "vpravo + vlevo", "active", "v provozu", 49.5992, 17.2342, 2],
  ["wim-d48-0489-frydek-mistek", "D48", "km 48,9-49,8", "u Frydku-Mistku", "Frydek-Mistek", "vlevo 48,9; vpravo 49,8", "active", "v provozu", 49.6870, 18.3509, 2],
  ["wim-d55-0610-veseli-nad-moravou", "D55", "km 61,0", "u Veseli nad Moravou", "Veseli nad Moravou", "vpravo + vlevo", "planned", "vystavba 3Q/4Q 2025", 48.9607, 17.3805, 2]
].map(([id, road, kmLabel, locationLabel, orp, sideLabel, status, statusLabel, latitude, longitude, deviceCount]) => ({
  id,
  road,
  kmLabel,
  locationLabel,
  orp,
  sideLabel,
  status,
  statusLabel,
  latitude,
  longitude,
  deviceCount,
  sourceLabel: "MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima",
  sourceDate: "2025-06-30",
  coordinateQuality: "approximate-needs-verification",
  note: "Lokalni dev mock. Produkce cte WIM mista z D1.",
  devices: Array.from({ length: deviceCount }, (_, index) => ({
    id: `${id}-mock-device-${index + 1}`,
    siteId: id,
    side: sideLabel.includes("+") ? (index === 0 ? "vpravo" : "vlevo") : sideLabel,
    kmValue: Number(String(kmLabel).match(/\d+(?:,\d+)?/)?.[0]?.replace(",", ".") || 0),
    status,
    statusLabel,
    note: ""
  }))
}));

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".ts", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"]
]);

function runtimeConfigModuleSource(env = process.env) {
  return `export const runtimeConfig = ${JSON.stringify({
    googleMapsApiKey: env.VITE_GOOGLE_MAPS_API_KEY || ""
  }, null, 2)};\n`;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once("error", () => resolve(false))
      .once("listening", () => {
        tester.close(() => resolve(true));
      })
      .listen(port, "127.0.0.1");
  });
}

async function pickPort(start) {
  for (let port = start; port < start + 20; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }

  throw new Error("Nenasel jsem volny port pro lokalni server.");
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveFile(requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const cleanPath = decodeURIComponent(url.pathname);
  const safePath = path.normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  let target = path.join(publicRoot, safePath);

  if (!target.startsWith(publicRoot)) {
    return path.join(publicRoot, "index.html");
  }

  if (await fileExists(target)) {
    const info = await stat(target);
    if (info.isDirectory()) {
      const directoryIndex = path.join(target, "index.html");
      if (await fileExists(directoryIndex)) {
        return directoryIndex;
      }
    }
    return target;
  }

  if (requestedRoot !== "dist") {
    const publicAssetRoot = path.join(root, "public");
    const publicAssetTarget = path.join(publicAssetRoot, safePath);

    if (publicAssetTarget.startsWith(publicAssetRoot) && await fileExists(publicAssetTarget)) {
      return publicAssetTarget;
    }
  }

  return path.join(publicRoot, "index.html");
}

function normalizeIdentifier(identifier) {
  const value = String(identifier || "").trim();
  return value.includes("@") ? value.toLowerCase() : value.replace(/\s+/g, "");
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    department: user.department,
    position: user.position,
    managerId: user.managerId,
    managerName: user.managerName,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    modules: user.modules,
    allowedModules: user.allowedModules,
    deniedModules: user.deniedModules,
    permissions: user.permissions,
    active: user.active
  };
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function readBodyBuffer(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseContentDisposition(value) {
  const result = {};
  for (const part of String(value || "").split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    const key = String(rawKey || "").trim().toLowerCase();
    const itemValue = rawValue.join("=").trim().replace(/^"|"$/g, "");

    if (key) {
      result[key] = itemValue;
    }
  }
  return result;
}

async function readMultipartFormData(request) {
  const contentType = request.headers["content-type"] || "";
  const boundary = /boundary=([^;]+)/i.exec(contentType)?.[1];

  if (!boundary) {
    return { fields: new Map(), files: new Map() };
  }

  const body = await readBodyBuffer(request);
  const raw = body.toString("latin1");
  const parts = raw.split(`--${boundary}`).slice(1, -1);
  const fields = new Map();
  const files = new Map();

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const separatorIndex = part.indexOf("\r\n\r\n");

    if (separatorIndex < 0) {
      continue;
    }

    const headerLines = part.slice(0, separatorIndex).split("\r\n");
    const content = part.slice(separatorIndex + 4);
    const headers = new Map();

    for (const line of headerLines) {
      const [rawName, ...rawValue] = line.split(":");
      const name = String(rawName || "").trim().toLowerCase();
      if (name) {
        headers.set(name, rawValue.join(":").trim());
      }
    }

    const disposition = parseContentDisposition(headers.get("content-disposition"));
    const fieldName = disposition.name;

    if (!fieldName) {
      continue;
    }

    if (disposition.filename) {
      files.set(fieldName, {
        name: disposition.filename,
        type: headers.get("content-type") || "application/octet-stream",
        buffer: Buffer.from(content, "latin1")
      });
    } else {
      fields.set(fieldName, Buffer.from(content, "latin1").toString("utf8"));
    }
  }

  return { fields, files };
}

function mockCollectionRouteSiteQuality(row) {
  return row.issues.some((issue) => issue.type === "missing-address" || issue.type === "unclear-location")
    ? "missing"
    : "approximate";
}

function createMockCollectionRoutesManualImportPreview(user, file) {
  const preview = buildCollectionRoutesManualImportPreview({
    text: file.buffer.toString("utf8"),
    filename: file.name,
    contentType: file.type
  });
  const now = new Date().toISOString();
  const batch = {
    id: `collection-import-batch-${randomUUID()}`,
    source: "manual-upload",
    sourceMode: "manual-import-preview",
    status: "preview",
    apiStatus: "ready",
    message: "Import preview – nevytváří ostré trasy.",
    rowCount: preview.summary.rowCount,
    issueCount: preview.summary.issueCount,
    createdByUserId: user.id,
    createdAt: now,
    finishedAt: now,
    metadata: {
      phase: "1C",
      mode: "manual-import-preview",
      source: "manual-upload",
      filename: preview.filename,
      contentType: preview.contentType,
      customerCount: preview.summary.customerCount,
      siteCount: preview.summary.siteCount,
      containerCount: preview.summary.containerCount,
      previewRows: preview.previewRows,
      createsOperationalRoutes: false,
      sendsEmailOrSms: false,
      startsAutomation: false
    }
  };
  const siteIds = new Map();

  mockCollectionRouteBatches.unshift(batch);

  for (const row of preview.rows) {
    let siteId = "";
    if (row.siteKey && !siteIds.has(row.siteKey)) {
      siteId = `collection-site-${randomUUID()}`;
      siteIds.set(row.siteKey, siteId);
      mockCollectionRouteSites.unshift({
        id: siteId,
        sourceSystem: "manual-upload",
        sourceCustomerId: row.customerName,
        sourceSiteId: row.siteKey,
        customerName: row.customerName,
        siteName: row.siteName,
        addressText: row.addressRaw,
        city: "",
        postalCode: "",
        status: "preview",
        active: true,
        locationQuality: mockCollectionRouteSiteQuality(row),
        lastImportBatchId: batch.id,
        createdAt: now,
        updatedAt: now,
        location: {
          id: `collection-site-location-${randomUUID()}`,
          latitude: null,
          longitude: null,
          quality: mockCollectionRouteSiteQuality(row),
          status: "needs-review",
          source: "manual-import-preview",
          note: "Ruční import preview bez geokódování.",
          confirmedAt: ""
        }
      });
    } else {
      siteId = siteIds.get(row.siteKey) || "";
    }

    mockCollectionRouteImportRows.push({
      id: `collection-import-row-${randomUUID()}`,
      batchId: batch.id,
      rowNumber: row.rowNumber,
      sourceEntity: "manual-upload-row",
      sourceId: row.rowKey || `manual-row-${row.rowNumber}`,
      status: "preview",
      summary: {
        customerName: row.customerName,
        addressRaw: row.addressRaw,
        siteName: row.siteName,
        wasteType: row.wasteType,
        wasteCode: row.wasteCode,
        frequency: row.frequency,
        containerVolume: row.containerVolume,
        containerCount: row.containerCount,
        note: row.note
      },
      issues: row.issues,
      createdAt: now
    });

    let serviceId = "";
    if (siteId && row.wasteType) {
      serviceId = `collection-service-${randomUUID()}`;
      mockCollectionRouteServices.push({
        id: serviceId,
        siteId,
        sourceContractId: row.rowKey || `manual-row-${row.rowNumber}`,
        wasteType: row.wasteType,
        wasteCode: row.wasteCode,
        frequencyCode: row.frequency,
        stablePattern: "",
        validFrom: "",
        validTo: "",
        status: "preview"
      });
    }

    if (siteId && row.containerVolume) {
      mockCollectionRouteContainers.push({
        id: `collection-container-${randomUUID()}`,
        siteId,
        serviceId,
        containerType: "container",
        volumeLiters: row.containerVolume,
        quantity: row.containerCount,
        wasteType: row.wasteType,
        status: "preview"
      });
    }

    for (const issue of row.issues) {
      mockCollectionRouteIssues.unshift({
        id: `collection-data-issue-${randomUUID()}`,
        batchId: batch.id,
        siteId,
        issueType: issue.type,
        severity: issue.severity,
        message: issue.message,
        status: "open",
        createdAt: now,
        resolvedAt: ""
      });
    }
  }

  return {
    batch,
    summary: preview.summary,
    previewRows: preview.previewRows,
    apiStatus: "ready"
  };
}

function cookieValue(request, name) {
  const cookies = request.headers.cookie || "";
  return cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function currentDevUser(request) {
  const token = cookieValue(request, devCookieName);
  const session = token ? devSessions.get(token) : null;

  if (!session || session.expiresAt < Date.now()) {
    return null;
  }

  return mockUsers.find((user) => user.id === session.userId && user.status === "active") || null;
}

function mockFleetVehicleFixtures() {
  return [
    {
      id: "tcars-889",
      vehicleId: "",
      externalProvider: "tcars",
      externalVehicleId: "889",
      tcarsVehicleId: "889",
      tcarsUnitId: "local-dev-unit",
      tcarsLicensePlate: "4B2 1234",
      gpsProvider: "tcars",
      licensePlate: "4B2 1234",
      internalNumber: "DEV-889",
      model: "Mercedes-Benz Actros cisterna",
      brand: "Mercedes",
      vehicleType: "Cisterna",
      vin: "WDBLOCALDEV000889",
      active: true,
      status: "active",
      source: "Lokální mock T-Cars"
    },
    {
      id: "local-passenger-bmw",
      vehicleId: "local-passenger-bmw",
      externalProvider: "local",
      externalVehicleId: "local-passenger-bmw",
      licensePlate: "9Z9 9999",
      internalNumber: "BMW osobní",
      model: "BMW 5",
      brand: "BMW",
      vehicleType: "Osobní vozidlo",
      vin: "WBA5K91050D895073",
      active: true,
      status: "active",
      source: "Lokální mock Vozový park"
    }
  ];
}

function mockFleetAssignmentFor(vehicle) {
  const key = String(vehicle?.id || "").trim();
  const assignment = mockFleetAssignments.get(key) || null;

  return {
    ...vehicle,
    assignedDriverId: assignment?.assignedDriverId || "",
    assignedDriverName: assignment?.assignedDriverName || "",
    assignedDriverPhone: assignment?.assignedDriverPhone || "",
    assignedDriverEmail: assignment?.assignedDriverEmail || "",
    driverAssignmentNote: assignment?.note || "",
    driverAssignmentUpdatedAt: assignment?.updatedAt || "",
    driverAssignmentUpdatedByName: assignment?.updatedByName || "",
    driverAssignmentEditable: true,
    driverAssignmentSource: assignment ? "local_mock" : ""
  };
}

function mockFleetSummary(vehicles) {
  return {
    total: vehicles.length,
    active: vehicles.filter((vehicle) => vehicle.active !== false).length,
    outOfOrder: 0,
    inService: 0,
    stkDue: 0,
    revisionDue: 0,
    insuranceDue: 0,
    openDefects: 0,
    assignedDrivers: vehicles.filter((vehicle) => vehicle.assignedDriverName || vehicle.assignedDriverId).length
  };
}

async function loadDevFleetPayload() {
  const payload = await loadFleetVehiclesPayload(process.env);
  const baseVehicles = Array.isArray(payload.vehicles) && payload.vehicles.length
    ? payload.vehicles
    : mockFleetVehicleFixtures();
  const vehicles = baseVehicles.map(mockFleetAssignmentFor);
  const usingFixtures = !Array.isArray(payload.vehicles) || !payload.vehicles.length;

  return {
    ...payload,
    apiStatus: usingFixtures ? "ready" : payload.apiStatus,
    configured: payload.configured || usingFixtures,
    vehicles,
    summary: mockFleetSummary(vehicles),
    assignmentApiStatus: "ready",
    assignmentMessage: "Lokální přiřazení řidičů běží v paměti dev serveru.",
    message: usingFixtures
      ? "Lokální preview používá mock vozidla. Produkce čte vozidla z T-Cars."
      : `${payload.message || ""} Lokální přiřazení řidičů běží v paměti dev serveru.`.trim(),
    lastFetchedAt: payload.lastFetchedAt || new Date().toISOString()
  };
}

function mockFleetVehicleMatches(vehicle, vehicleId) {
  const wanted = String(vehicleId || "").trim().toLowerCase();
  const compactWanted = wanted.replace(/[^a-z0-9]+/g, "");
  return [
    vehicle?.id,
    vehicle?.vehicleId,
    vehicle?.tcarsVehicleId,
    vehicle?.tcarsVehicleId ? `tcars-${vehicle.tcarsVehicleId}` : "",
    vehicle?.licensePlate,
    vehicle?.tcarsLicensePlate
  ].map((value) => String(value || "").trim().toLowerCase())
    .some((candidate) => candidate === wanted || candidate.replace(/[^a-z0-9]+/g, "") === compactWanted);
}

function mockFleetVehicleForUser(user, options = {}) {
  const userId = String(user?.id || "").trim();
  const userName = String(user?.name || "").trim().toLowerCase();
  const wantedVehicleId = String(options.vehicleId || "").trim();
  return mockFleetVehicleFixtures()
    .map(mockFleetAssignmentFor)
    .find((vehicle) => {
      const vehicleMatches = !wantedVehicleId || mockFleetVehicleMatches(vehicle, wantedVehicleId);
      const driverMatches = (userId && vehicle.assignedDriverId === userId) ||
        (userName && String(vehicle.assignedDriverName || "").trim().toLowerCase() === userName);
      return vehicleMatches && driverMatches;
    }) || null;
}

async function mockFleetVehiclesForUser(user) {
  const userId = String(user?.id || "").trim();
  const userName = String(user?.name || "").trim().toLowerCase();
  const payload = await loadDevFleetPayload();
  const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];
  return vehicles.filter((vehicle) => (
    (userId && String(vehicle.assignedDriverId || "").trim() === userId) ||
    (userName && String(vehicle.assignedDriverName || "").trim().toLowerCase() === userName)
  ));
}

function mockFleetVehicleVoiceLabel(vehicle = {}) {
  const parts = [
    vehicle.brand,
    vehicle.model,
    vehicle.internalNumber,
    vehicle.vehicleType,
    vehicle.bodyType,
    vehicle.vistosVehicleCategory
  ].map((value) => String(value || "").trim()).filter(Boolean);
  return [...new Set(parts)].slice(0, 3).join(" ") || String(vehicle.licensePlate || vehicle.tcarsLicensePlate || "vozidlo").trim();
}

function mockDriverReportContextVehicle(vehicle = {}) {
  const spz = String(vehicle.licensePlate || vehicle.tcarsLicensePlate || "").trim();
  return {
    id: String(vehicle.id || vehicle.vehicleId || vehicle.tcarsVehicleId || "").trim(),
    vehicleId: String(vehicle.vehicleId || vehicle.id || vehicle.tcarsVehicleId || "").trim(),
    displayName: mockFleetVehicleVoiceLabel(vehicle),
    spz,
    type: String(vehicle.vehicleType || vehicle.bodyType || vehicle.vistosVehicleCategory || "").trim(),
    brand: String(vehicle.brand || "").trim(),
    model: String(vehicle.model || vehicle.internalNumber || "").trim(),
    internalName: String(vehicle.internalNumber || vehicle.vehicleName || vehicle.name || "").trim(),
    licensePlate: spz,
    vin: String(vehicle.vin || "").trim(),
    assignmentHint: "přiřazené vozidlo",
    source: "fleet_db",
    assignedToCurrentDriver: true,
    existsInFleet: true,
    active: true
  };
}

function normalizeRouteSourceText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]+/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function routeSourceDay(value) {
  const text = normalizeRouteSourceText(value);
  if (text.includes("PONDELI")) return "PO";
  if (text.includes("UTERY")) return "ÚT";
  if (text.includes("STREDA")) return "ST";
  if (text.includes("CTVRTEK")) return "ČT";
  if (text.includes("PATEK")) return "PÁ";
  return "";
}

function routeSourceWeek(value) {
  const text = normalizeRouteSourceText(value);
  if (text.includes("1X30") || text.includes("MESIC")) return "měsíční / 1x30";
  if (text.includes("SUDE") || text.includes("SUDY")) return "sudý týden";
  if (text.includes("LICHE") || text.includes("LICHY")) return "lichý týden";
  return "každý týden";
}

const routeSourceSalesCodes = new Set(["DPI", "PLI", "FKU", "PCE", "PPA", "ROP"]);

function routeSourceCompactText(value) {
  return normalizeRouteSourceText(value).replace(/[^A-Z0-9]+/g, "");
}

function routeSourceSalesCode(value) {
  const parts = String(value || "").split("|").map((part) => part.trim()).filter(Boolean);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const code = routeSourceCompactText(parts[index]);
    if (routeSourceSalesCodes.has(code)) {
      return code;
    }
  }
  return "";
}

function routeSourcePartLooksContactOrNote(value) {
  const text = normalizeRouteSourceText(value);
  const compact = routeSourceCompactText(value);
  return Boolean(
    /\b(TEL|TELEFON|MOBIL|KONTAKT)\b/.test(text) ||
    /^OD\s+\d/.test(text) ||
    compact === "MYVSE" ||
    compact === "VSE" ||
    (/^\+?\d{6,}$/.test(compact) && !/[A-Z]{2,}/.test(text))
  );
}

function routeSourceFieldLooksOperational(value) {
  const text = normalizeRouteSourceText(value);
  const compact = routeSourceCompactText(value);
  return Boolean(
    text &&
    !/^\d+$/.test(text) &&
    !routeSourcePartLooksContactOrNote(value) &&
    !routeSourceSalesCodes.has(compact) &&
    !/\b(SUDY|SUDE|LICHY|LICHE|PONDELI|UTERY|STREDA|CTVRTEK|PATEK|DPI|PLI|FKU|PCE|PPA|ROP|MAP)\b/.test(text) &&
    !/\b(1X7|2X7|3X7|5X7|1X14|1X30|KONT|LTR|LITR|SKO|PAPIR|PLAST|SKLO|BIO)\b/.test(text)
  );
}

function routeSourceLooksLikeAddress(value) {
  const text = normalizeRouteSourceText(value);
  const alphaCount = (text.match(/\b[A-Z]{4,}\b/g) || []).length;
  const numberCount = (text.match(/\b\d+[A-Z]?(?:\/\d+[A-Z]?)?\b/g) || []).length;
  return alphaCount >= 1 && numberCount >= 1;
}

function routeSourceSplitCombinedCustomerAddress(value) {
  const text = String(value || "").trim();
  if (!text) {
    return { customerName: "", addressText: "" };
  }
  const commaParts = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2 && routeSourceFieldLooksOperational(commaParts[0])) {
    return { customerName: commaParts[0], addressText: commaParts.slice(1).join(", ") };
  }
  const dashParts = text.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  if (dashParts.length >= 2 && routeSourceFieldLooksOperational(dashParts[0])) {
    const rest = dashParts.slice(1).join(" - ");
    if (routeSourceLooksLikeAddress(rest) || normalizeRouteSourceText(rest).includes("BRNO")) {
      return { customerName: dashParts[0], addressText: rest };
    }
  }
  return routeSourceLooksLikeAddress(text)
    ? { customerName: text, addressText: text }
    : { customerName: text, addressText: "" };
}

function routeSourcePartLooksLikeServiceOnly(value) {
  const text = normalizeRouteSourceText(value);
  const hasServiceToken = /\b(1X7|2X7|3X7|5X7|1X14|1X30|KONT|LTR|LITR|SKO|PAPIR|PLAST|SKLO|BIO|NADOBA|NADOBY|POPELNICE)\b/.test(text);
  const nonServiceAlphaTokens = text
    .split(/\s+/)
    .filter((token) => /^[A-Z]/.test(token) && !["SKO", "PAPIR", "PLAST", "SKLO", "BIO", "KONT", "LTR", "LITR", "NADOBA", "NADOBY", "POPELNICE", "VLASTNI"].includes(token));
  return hasServiceToken && (!routeSourceLooksLikeAddress(value) || nonServiceAlphaTokens.length === 0) && nonServiceAlphaTokens.length <= 1;
}

function routeSourcePartLooksLikeCustomerAddress(value) {
  const text = String(value || "").trim();
  const normalized = normalizeRouteSourceText(text);
  const compact = routeSourceCompactText(text);
  if (
    !text ||
    /^\d+$/.test(normalized) ||
    routeSourceSalesCodes.has(compact) ||
    routeSourcePartLooksContactOrNote(text) ||
    routeSourcePartLooksLikeServiceOnly(text)
  ) {
    return false;
  }
  const split = routeSourceSplitCombinedCustomerAddress(text);
  return Boolean(split.customerName && split.addressText);
}

function routeSourceMappingFromFields(row, { customerName = "", addressText = "", salesCode = "" } = {}) {
  const issues = Array.isArray(row.qualityIssues) ? row.qualityIssues : [];
  if (!customerName || !addressText) {
    return { mappingStatus: "chybí adresa", mappingIssue: "chybí zákazník nebo adresa z Excel řádku" };
  }
  if (issues.includes("missing-container-volume")) {
    return { mappingStatus: "chybí nádoba", mappingIssue: "chybí nebo není jistý objem nádoby" };
  }
  if (!row.frequency || row.frequency === "-") {
    return { mappingStatus: "chybí frekvence", mappingIssue: "chybí četnost svozu" };
  }
  if ((issues.includes("needs-vistos-waste-type") && !salesCode) || issues.includes("source-note-cancelled-or-stopped")) {
    return { mappingStatus: "nejasné", mappingIssue: "typ odpadu nebo platnost řádku vyžaduje kontrolu" };
  }
  return { mappingStatus: "nenamapováno", mappingIssue: "čeká na Vistos match" };
}

function routeSourceDerivedFields(row, context = {}) {
  const parts = String(row.originalText || "").split("|").map((part) => part.trim()).filter(Boolean);
  const operationalParts = parts.filter(routeSourceFieldLooksOperational);
  const customerAddressParts = parts.filter(routeSourcePartLooksLikeCustomerAddress);
  const candidateParts = [...customerAddressParts];
  for (const part of operationalParts) {
    if (!candidateParts.includes(part)) {
      candidateParts.push(part);
    }
  }
  const salesCode = String(context.salesCode || "").trim() || routeSourceSalesCode(row.originalText);
  const splitPrimary = routeSourceSplitCombinedCustomerAddress(candidateParts[0] || "");
  const customerName = splitPrimary.customerName || "";
  const addressText = splitPrimary.addressText ||
    candidateParts.find((part) => /[,0-9]/.test(part) && part !== customerName && !routeSourcePartLooksContactOrNote(part)) ||
    candidateParts[1] ||
    "";
  const note = parts.find((part) => /\b(pozn|pozastav|vyraz|vyřaz|konec|volat|klic|klíč|kontakt|brana|brána)\b/i.test(part)) || "";
  const { mappingStatus, mappingIssue } = routeSourceMappingFromFields(row, { customerName, addressText, salesCode });

  return { customerName, addressText, note, mappingStatus, mappingIssue, continuationRow: false };
}

function routeSourceRowHasRoutePayload(row) {
  const text = normalizeRouteSourceText(row.originalText);
  return Boolean(
    row.frequency ||
    Number(row.containerVolume || 0) ||
    Number(row.containerCount || 0) ||
    String(row.wasteType || "").replace("-", "") ||
    /\b(1X7|2X7|3X7|5X7|1X14|1X30|LTR|LITR|SKO|PAPIR|PLAST|SKLO|BIO|NADOBA|NADOBY|POPELNICE)\b/.test(text)
  );
}

function routeSourceNameIsContinuationPlaceholder(value) {
  const compact = routeSourceCompactText(value);
  return ["VLASTNINADOBA", "VLASTNINADOBY", "VLASTNIPOPELNICE"].includes(compact);
}

function routeSourceShouldInheritPreviousStop(row, derived, previousStop) {
  if (!previousStop?.customerName || !previousStop?.addressText || !routeSourceRowHasRoutePayload(row)) {
    return false;
  }
  if (derived.customerName && derived.addressText) {
    return false;
  }
  const parts = String(row.originalText || "").split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.some(routeSourcePartLooksLikeCustomerAddress)) {
    return false;
  }
  return !derived.customerName || routeSourceNameIsContinuationPlaceholder(derived.customerName);
}

function routeSourceDerivedFieldsWithInheritedStop(row, context = {}) {
  const derived = routeSourceDerivedFields(row, context);
  const previousStop = context.previousStop || null;
  if (!routeSourceShouldInheritPreviousStop(row, derived, previousStop)) {
    return derived;
  }
  const customerName = previousStop.customerName;
  const addressText = previousStop.addressText;
  const { mappingStatus, mappingIssue } = routeSourceMappingFromFields(row, {
    customerName,
    addressText,
    salesCode: context.salesCode
  });
  return {
    ...derived,
    customerName,
    addressText,
    mappingStatus,
    mappingIssue,
    continuationRow: true,
    inheritedStop: previousStop
  };
}

function routeSourceSummary(rows = []) {
  const summary = {
    rowCount: rows.length,
    containerCount: 0,
    estimatedMinutes: 0,
    estimatedTons: 0,
    dayCounts: {},
    weekCounts: {},
    vehicleCounts: {},
    wasteCounts: {},
    mappingCounts: {},
    createsOperationalRoutes: false,
    sendsEmailOrSms: false,
    startsAutomation: false
  };

  for (const row of rows) {
    summary.containerCount += Number(row.containerCount || 0);
    summary.estimatedMinutes += Number(row.estimatedServiceMinutes || 0);
    summary.estimatedTons += Number(row.estimatedWeightTons || 0);
    summary.dayCounts[row.dayCode || "-"] = (summary.dayCounts[row.dayCode || "-"] || 0) + 1;
    summary.weekCounts[row.weekMode || "-"] = (summary.weekCounts[row.weekMode || "-"] || 0) + 1;
    summary.vehicleCounts[row.vehicleCode || "-"] = (summary.vehicleCounts[row.vehicleCode || "-"] || 0) + 1;
    summary.wasteCounts[row.wasteType || "ostatní / neznámé"] = (summary.wasteCounts[row.wasteType || "ostatní / neznámé"] || 0) + 1;
    summary.mappingCounts[row.mappingStatus || "-"] = (summary.mappingCounts[row.mappingStatus || "-"] || 0) + 1;
  }
  summary.estimatedTons = Number(summary.estimatedTons.toFixed(3));
  return summary;
}

function mockFilteredRouteSourceRows(query) {
  const latestBatchId = mockCollectionRouteSourceBatches[0]?.id || "";
  const batchId = query.get("batchId") || latestBatchId;
  const day = query.get("day") || "all";
  const week = query.get("week") || "all";
  const vehicle = query.get("vehicle") || "all";
  const waste = query.get("waste") || "all";
  const mappingStatus = query.get("mappingStatus") || "all";
  const limit = Math.max(1, Math.min(Number(query.get("limit")) || 500, 2000));

  return mockCollectionRouteSourceRows
    .filter((row) => row.batchId === batchId)
    .filter((row) => day === "all" || row.dayCode === day)
    .filter((row) => week === "all" || row.weekMode === week)
    .filter((row) => vehicle === "all" || row.vehicleCode === vehicle)
    .filter((row) => waste === "all" || (waste === "ostatní" ? !["SKO", "BIO", "PAPIR", "PLAST", "SKLO"].includes(row.wasteType) : row.wasteType === waste))
    .filter((row) => mappingStatus === "all" || row.mappingStatus === mappingStatus)
    .slice(0, limit);
}

function findMockUser(id) {
  const normalizedId = String(id || "").trim().toLowerCase();
  return mockUsers.find((user) => String(user.id || "").trim().toLowerCase() === normalizedId) || null;
}

function normalizeManagerPayload(payload, id = "", currentUser = null, existingUser = null) {
  if (!Object.prototype.hasOwnProperty.call(payload || {}, "managerId")) {
    return payload;
  }

  const managerId = String(payload.managerId || "").trim();
  const targetId = String(id || payload?.id || "").trim().toLowerCase();
  const previousManagerId = String(existingUser?.managerId || "").trim().toLowerCase();

  if (managerId.toLowerCase() !== previousManagerId && !isFullAccessRole(currentUser)) {
    const error = new Error("Nemáte oprávnění měnit nadřízeného.");
    error.status = 403;
    throw error;
  }

  if (managerId && managerId.toLowerCase() === targetId) {
    const error = new Error("Uživatel nesmí být sám sobě nadřízený.");
    error.status = 400;
    throw error;
  }

  if (!managerId) {
    return {
      ...payload,
      managerId: "",
      managerName: ""
    };
  }

  const manager = mockUsers.find((user) => (
    String(user.id || "").trim().toLowerCase() === managerId.toLowerCase() &&
    user.active !== false &&
    String(user.status || "active").toLowerCase() !== "disabled"
  ));

  if (!manager) {
    const error = new Error("Vybraný nadřízený není aktivní uživatel.");
    error.status = 400;
    throw error;
  }

  return {
    ...payload,
    managerId: manager.id,
    managerName: manager.name || ""
  };
}

function upsertMockUser(input, id = "") {
  const existingUser = id ? findMockUser(id) : null;
  const savedUser = normalizeUserInput({
    ...existingUser,
    ...input,
    id: id || input?.id
  }, { id: id || input?.id });
  const existingIndex = mockUsers.findIndex((user) => user.id === savedUser.id);

  if (existingIndex >= 0) {
    mockUsers = [
      ...mockUsers.slice(0, existingIndex),
      savedUser,
      ...mockUsers.slice(existingIndex + 1)
    ];
  } else {
    mockUsers = [...mockUsers, savedUser];
  }

  return savedUser;
}

function blocksCurrentDevUser(currentUser, payload, id) {
  const currentUserId = String(currentUser?.id || "").trim().toLowerCase();
  const targetId = String(id || "").trim().toLowerCase();

  if (!currentUserId || currentUserId !== targetId) {
    return "";
  }

  const active = payload?.active !== false && String(payload?.status || "active").toLowerCase() !== "disabled";
  if (!active) {
    return "Vlastní účet nejde vypnout, abyste se nezamkli mimo správu.";
  }

  if (isFullAccessRole(currentUser) && !isFullAccessRole({ ...currentUser, ...payload, active: true })) {
    return "Vlastní účet s plným přístupem nejde změnit na omezenou roli.";
  }

  return "";
}

function splitEmployeeName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return {
      firstName: parts[0] || "",
      lastName: ""
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1)
  };
}

function cleanMockString(value) {
  return String(value ?? "").trim();
}

function normalizeManualMockEmployeeKey(value) {
  return cleanMockString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function sameMockId(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function canViewMockNotifications(user) {
  const role = normalizeRole(user?.role);
  return isFullAccessRole(user) || role === "kancelar";
}

function mockNotificationStatus(status) {
  const cleaned = String(status || "").trim().toLowerCase();
  return cleaned === "skipped" ? "not_sent" : cleaned || "not_sent";
}

function addMockNotificationLog(input) {
  const now = new Date().toISOString();
  const item = {
    id: `notification-log-${randomUUID()}`,
    moduleId: input.moduleId || "dovolena-nemoc",
    relatedEntityType: input.relatedEntityType || "absence_request",
    relatedEntityId: input.relatedEntityId || "",
    absenceRequestId: input.relatedEntityId || "",
    channel: input.channel || "email",
    type: input.type || "absence_approval_request",
    status: mockNotificationStatus(input.status),
    recipient: input.recipient || "",
    recipientName: input.recipientName || "",
    employeeId: input.employeeId || "",
    employeeName: input.employeeName || "",
    managerId: input.managerId || "",
    managerName: input.managerName || "",
    subject: input.subject || "",
    messagePreview: input.messagePreview || input.lastError || "",
    provider: input.provider || (input.channel === "sms" ? "Twilio" : "SendGrid"),
    providerMessageId: input.providerMessageId || "",
    attempts: Number(input.attempts || 1),
    lastError: input.lastError || "",
    sentAt: input.status === "sent" ? now : "",
    failedAt: input.status === "failed" ? now : "",
    createdAt: now,
    updatedAt: now
  };

  mockNotificationLogs = [item, ...mockNotificationLogs].slice(0, 500);
  return item;
}

const MOCK_DRIVER_PART_STATUS_LABELS = {
  new_report: "Nové hlášení",
  waiting_vehicle_vin: "Čeká na doplnění auta/VIN",
  waiting_diagnostics: "Čeká na diagnostiku",
  searching_parts: "Vyhledávám díly",
  searching_prices: "Vyhledávám ceny",
  ready_for_patrik: "Připraveno pro Patrika",
  sent_to_patrik: "Odesláno Patrikovi",
  waiting_decision: "Čeká na rozhodnutí",
  waiting_part_identification: "Čeká na identifikaci dílu",
  part_identified: "Díl identifikován",
  handed_to_ordering: "Předáno Patrikovi k ověření",
  ordered: "Objednáno",
  part_arrived: "Díl dorazil",
  service_scheduled: "Servis naplánován",
  completed: "Vyřízeno",
  canceled: "Zrušeno"
};

function mockDriverClean(value) {
  return String(value ?? "").trim();
}

function mockDriverCanManage(user) {
  return isFullAccessRole(user) || hasPermission(user, "driver-reports", "manage") || hasPermission(user, "driver-reports", "edit");
}

function mockDriverCanCreate(user) {
  return hasPermission(user, "driver-reports", "create");
}

function mockDriverCanSearchPartslink24(user) {
  return mockDriverCanManage(user) || hasPermission(user, "driver-reports", "parts-search");
}

function mockDriverTruthyFlag(value) {
  const normalized = mockDriverClean(value).toLowerCase();
  return value === true || ["true", "1", "on", "yes", "ano"].includes(normalized);
}

function mockPartslink24MaskVin(value) {
  const vin = mockDriverClean(value).replace(/\s+/g, "").toUpperCase();
  if (!vin) return "";
  if (vin.length <= 7) return "*".repeat(vin.length);
  return `${vin.slice(0, 3)}${"*".repeat(Math.max(4, vin.length - 7))}${vin.slice(-4)}`;
}

function mockPartslink24Kind(value) {
  return mockDriverClean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function mockPartslink24IsPassenger(value) {
  return ["osobni", "osobni_auto", "osobni_automobil", "osobni_vozidlo", "oa", "m1", "car", "passenger", "passenger_car"]
    .includes(mockPartslink24Kind(value));
}

function mockPartslink24VehicleForItem(item = {}) {
  const ref = mockDriverClean(item.vehicleId || item.licensePlate);
  return mockFleetVehicleFixtures()
    .map(mockFleetAssignmentFor)
    .find((vehicle) => mockFleetVehicleMatches(vehicle, ref)) || null;
}

function mockPartslink24Eligibility(user, item = {}) {
  const vehicle = mockPartslink24VehicleForItem(item);
  const canSearchPartslink24 = mockDriverCanSearchPartslink24(user);
  const vin = mockDriverClean(vehicle?.vin || item.vin);
  const kind = mockPartslink24Kind(vehicle?.vehicleType || vehicle?.bodyType || vehicle?.vistosVehicleCategory);

  if (!canSearchPartslink24) {
    return {
      canSearchPartslink24,
      allowed: false,
      vehicleKind: kind,
      vinMasked: mockPartslink24MaskVin(vin),
      errorCode: "PARTSLINK24_FORBIDDEN",
      message: "K vyhledání náhradních dílů nemáš oprávnění."
    };
  }

  if (!vin) {
    return {
      canSearchPartslink24,
      allowed: false,
      vehicleKind: kind,
      vinMasked: "",
      errorCode: "PARTSLINK24_VIN_MISSING",
      message: "U vozidla není uložené VIN. Doplň VIN ve Vozovém parku."
    };
  }

  if (!mockPartslink24IsPassenger(kind)) {
    return {
      canSearchPartslink24,
      allowed: false,
      vehicleKind: kind || "neznamy",
      vinMasked: mockPartslink24MaskVin(vin),
      errorCode: "PARTSLINK24_ONLY_PASSENGER_VEHICLES",
      message: "partslink24 pilot je teď povolený jen pro osobní vozidla. Nákladní vozidla jsou mimo tento pilot."
    };
  }

  return {
    canSearchPartslink24,
    allowed: true,
    vehicleKind: "osobni",
    vinMasked: mockPartslink24MaskVin(vin),
    errorCode: "",
    message: "Osobní vozidlo má VIN a může jít do read-only pilotu partslink24."
  };
}

function mockCreatePartslink24Search(user, item = {}) {
  const eligibility = mockPartslink24Eligibility(user, item);
  if (!eligibility.canSearchPartslink24) {
    const error = new Error("K vyhledání náhradních dílů nemáš oprávnění.");
    error.status = 403;
    throw error;
  }
  if (!eligibility.allowed) {
    const error = new Error(eligibility.message);
    error.status = eligibility.errorCode === "PARTSLINK24_ONLY_PASSENGER_VEHICLES" ? 400 : 409;
    error.details = eligibility;
    throw error;
  }

  const vehicle = mockPartslink24VehicleForItem(item) || {};
  const vin = mockDriverClean(vehicle.vin || item.vin).replace(/\s+/g, "").toUpperCase();
  const vinMasked = mockPartslink24MaskVin(vin);
  const recent = mockPartslink24Searches.find((search) => (
    sameMockId(search.requestId, item.id) &&
    search.vinMasked === vinMasked &&
    Date.now() - Date.parse(search.createdAt || "") < 3 * 60 * 1000
  ));
  const workflow = {
    url: mockPartslink24WorkflowUrl,
    inputs: {
      vin,
      vehicle_id: mockDriverClean(vehicle.id || vehicle.vehicleId || item.vehicleId),
      vehicle_kind: "osobni",
      request_id: mockDriverClean(item.id),
      dry_run: false,
      allow_live_login: true
    }
  };

  if (recent) {
    return { audit: recent, eligibility, workflow, reusedRecent: true };
  }

  const now = new Date().toISOString();
  const audit = {
    id: `partslink24-search-${randomUUID()}`,
    requestId: mockDriverClean(item.id),
    vehicleId: mockDriverClean(vehicle.id || vehicle.vehicleId || item.vehicleId),
    vehicleName: mockDriverClean(vehicle.internalNumber || vehicle.model || item.vehicleName),
    licensePlate: mockDriverClean(vehicle.licensePlate || vehicle.tcarsLicensePlate || item.licensePlate),
    vinMasked,
    vehicleKind: "osobni",
    status: "manual_dispatch_required",
    errorCode: "",
    message: "Read-only pilot je auditovaný v KSO. Pokračování probíhá ručním spuštěním GitHub Actions workflow partslink24 VIN pilot; nic se neobjednává.",
    workflowUrl: mockPartslink24WorkflowUrl,
    workflowInputs: { ...workflow.inputs, vin: vinMasked },
    result: null,
    runnerKind: "github_actions_manual",
    createdByUserId: mockDriverClean(user?.id),
    createdByName: mockDriverClean(user?.name),
    createdAt: now,
    updatedAt: now
  };
  mockPartslink24Searches = [audit, ...mockPartslink24Searches].slice(0, 100);

  return { audit, eligibility, workflow, reusedRecent: false };
}

function mockFleetPlateSummary(vehicle = {}) {
  return {
    id: mockDriverClean(vehicle.id || vehicle.vehicleId || vehicle.tcarsVehicleId),
    vehicleId: mockDriverClean(vehicle.vehicleId || vehicle.id || vehicle.tcarsVehicleId),
    licensePlate: normalizeLicensePlate(vehicleLicensePlateValue(vehicle)),
    brand: mockDriverClean(vehicle.brand),
    model: mockDriverClean(vehicle.model || vehicle.internalNumber),
    vehicleType: mockDriverClean(vehicle.vehicleType || vehicle.bodyType || vehicle.vistosVehicleCategory),
    internalNumber: mockDriverClean(vehicle.internalNumber),
    vin: mockDriverClean(vehicle.vin),
    assignedDriverId: mockDriverClean(vehicle.assignedDriverId),
    assignedDriverName: mockDriverClean(vehicle.assignedDriverName),
    assignedDriverPhone: mockDriverClean(vehicle.assignedDriverPhone),
    source: mockDriverClean(vehicle.source || vehicle.telemetrySource || "local_mock")
  };
}

async function mockValidateDriverReportLicensePlate(value) {
  const normalized = normalizeLicensePlate(value);
  const payload = await loadDevFleetPayload();
  const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];
  const format = validateLicensePlateFormat(normalized, vehicles);
  const vehicle = findVehicleByLicensePlate(normalized, vehicles);
  const suggestions = findSimilarLicensePlates(normalized, vehicles, 5)
    .map((item) => ({
      ...mockFleetPlateSummary(item.vehicle),
      licensePlate: item.licensePlate,
      distance: item.distance
    }));

  return {
    input: mockDriverClean(value),
    normalized,
    key: licensePlateKey(normalized),
    validFormat: format.valid,
    formatReason: format.reason,
    exact: Boolean(vehicle),
    vehicle: vehicle ? mockFleetPlateSummary(vehicle) : null,
    suggestions,
    source: mockDriverClean(payload.source || "local_mock"),
    apiStatus: "ready",
    message: vehicle
      ? "Vozidlo nalezeno."
      : format.message || "Tahle SPZ není ve Vozovém parku. Zkontrolujte ji prosím."
  };
}

function mockDriverPermissionSummary(user) {
  const role = normalizeRole(user?.role);
  return {
    role,
    canCreate: mockDriverCanCreate(user),
    canManage: mockDriverCanManage(user),
    canSearchPartslink24: mockDriverCanSearchPartslink24(user),
    limitation: role === "ridic"
      ? "Řidič může vytvořit hlášení a sledovat vlastní stav. Objednání, doručení a servis řeší oprávněná role."
      : ""
  };
}

function mockDriverEvent(requestId, action, user, note, notification = null) {
  return {
    id: `driver-part-event-${randomUUID()}`,
    requestId,
    action,
    actorUserId: user?.id || "",
    actorName: user?.name || "",
    createdAt: new Date().toISOString(),
    before: null,
    after: null,
    note: note || "",
    notificationChannel: notification?.channel || "",
    notificationRecipient: notification?.recipient || "",
    notificationStatus: notification?.status || "",
    notificationError: notification?.errorMessage || ""
  };
}

function mockDriverDetail(item, user = null) {
  const status = mockDriverClean(item?.status) || "new_report";
  const latestPartslink24Search = mockPartslink24Searches.find((search) => sameMockId(search.requestId, item?.id)) || null;
  return {
    ...item,
    vehicleBrandLabel: vehicleBrandLabel(item?.vehicleBrand),
    probablePartSideLabel: partSideLabel(item?.probablePartSide),
    partVerificationStatus: mockDriverClean(item?.partVerificationStatus || item?.partIdentificationStatus || "waiting_manual_verification"),
    partVerificationSource: mockDriverClean(item?.partVerificationSource),
    priceBoostStatus: mockDriverClean(item?.priceBoostStatus || "not_requested"),
    statusLabel: MOCK_DRIVER_PART_STATUS_LABELS[status] || "Neznámý stav",
    events: Array.isArray(item?.events) ? item.events : [],
    partslink24Eligibility: mockPartslink24Eligibility(user, item),
    partslink24VinSearch: latestPartslink24Search
  };
}

function findMockDriverRequest(id) {
  const normalized = mockDriverClean(id).toLowerCase();
  return mockDriverPartRequests.find((item) => (
    mockDriverClean(item.id).toLowerCase() === normalized ||
    mockDriverClean(item.reportId).toLowerCase() === normalized
  ));
}

function mockDriverVisibleRequests(user) {
  return mockDriverPartRequests
    .filter((item) => mockDriverCanManage(user) || sameMockId(item.driverUserId, user?.id))
    .sort((left, right) => String(right.reportedAt || right.createdAt).localeCompare(String(left.reportedAt || left.createdAt)))
    .map((item) => mockDriverDetail(item, user));
}

function mockDriverContactForUser(user) {
  const employee = user ? mockEmployeeFromUser(user) : null;
  return {
    name: mockDriverClean(employee?.fullName || user?.name),
    email: mockDriverClean(employee?.email || user?.email),
    phone: mockDriverClean(employee?.phone || user?.phone),
    userId: mockDriverClean(employee?.userId || user?.id)
  };
}

function mockDriverPersonByName(query) {
  const normalized = mockDriverClean(query)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!normalized) {
    return null;
  }
  return mockUsers.find((user) => [user.id, user.name, user.email].map(mockDriverClean).join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes(normalized)) || null;
}

function mockDriverPartsRecipient() {
  const patrik = findMockUser("patrik-istvanek") || mockDriverPersonByName("patrik istvanek");
  const contact = mockDriverContactForUser(patrik);
  return {
    name: contact.name || "Patrik Ištvánek",
    email: contact.email || process.env.PATRICK_PARTS_EMAIL || process.env.PARTS_ORDER_EMAIL || "local-mock-patrik@example.invalid",
    userId: contact.userId
  };
}

function mockDriverServiceTechRecipient() {
  const kamil = mockDriverPersonByName("kamil");
  const contact = mockDriverContactForUser(kamil);
  return {
    name: contact.name || "Kamil",
    phone: contact.phone || process.env.KAMIL_SERVICE_PHONE || process.env.SERVICE_TECH_PHONE || "+420000000000",
    userId: contact.userId
  };
}

async function createMockDriverPartRequest(user, payload = {}) {
  const defectDescription = mockDriverClean(payload.defectDescription || payload.description || payload.speechText);
  if (!defectDescription) {
    const error = new Error("Vyplňte popis závady od řidiče.");
    error.status = 400;
    throw error;
  }

  let assignedVehicle = mockFleetVehicleForUser(user);
  const licensePlate = normalizeLicensePlate(
    payload.licensePlate ||
    payload.spz ||
    assignedVehicle?.licensePlate ||
    assignedVehicle?.tcarsLicensePlate ||
    extractLicensePlate(defectDescription)
  );
  if (!licensePlate) {
    const error = new Error("Chybí SPZ vozidla. Nejdřív doplňte vozidlo/SPZ.");
    error.status = 400;
    throw error;
  }

  const wantsUnverifiedPlate = mockDriverTruthyFlag(payload.licensePlateUnverified || payload.licensePlateOverride);
  const licensePlateOverrideNote = mockDriverClean(payload.licensePlateOverrideNote || payload.licensePlateExceptionNote);
  const canUseUnverifiedPlate = wantsUnverifiedPlate && mockDriverCanManage(user);

  if (wantsUnverifiedPlate && !mockDriverCanManage(user)) {
    const error = new Error("SPZ bez ověření může uložit jen oprávněná role.");
    error.status = 403;
    throw error;
  }

  if (wantsUnverifiedPlate && !licensePlateOverrideNote) {
    const error = new Error("Pro uložení neověřené SPZ doplňte povinnou poznámku.");
    error.status = 400;
    throw error;
  }

  const plateValidation = await mockValidateDriverReportLicensePlate(licensePlate);
  if (!plateValidation.validFormat) {
    const error = new Error("SPZ nemá platný formát. Zkontrolujte ji prosím.");
    error.status = 400;
    throw error;
  }

  if (!plateValidation.exact && !canUseUnverifiedPlate) {
    const error = new Error("Tahle SPZ není ve Vozovém parku. Zkontrolujte ji prosím.");
    error.status = 400;
    error.details = {
      normalized: plateValidation.normalized,
      suggestions: plateValidation.suggestions
    };
    throw error;
  }

  assignedVehicle = plateValidation.vehicle || assignedVehicle;
  const now = new Date().toISOString();
  const partMatch = identifyProbablePartFromDescription(defectDescription);
  const probablePart = mockDriverClean(payload.probablePart || partMatch.probablePart);
  const partAiCandidate = Boolean(probablePart && partMatch.aiPartCandidate !== false);
  const driverNote = mockDriverClean(payload.driverNote || payload.driver_note || payload.driverComment || payload.driver_comment);
  const driverContact = mockDriverContactForUser(user);
  const id = `driver-part-request-${randomUUID()}`;
  const request = {
    id,
    reportId: `ND-${now.slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    reportedAt: mockDriverClean(payload.reportedAt) || now,
    driverUserId: mockDriverClean(payload.driverUserId || user?.id),
    driverName: mockDriverClean(payload.driverName || payload.driver || driverContact.name || user?.name),
    driverPhone: mockDriverClean(payload.driverPhone || payload.phone || driverContact.phone),
    vehicleId: mockDriverClean(payload.vehicleId || assignedVehicle?.id),
    vehicleName: mockDriverClean(payload.vehicleName || payload.vehicle || assignedVehicle?.internalNumber || assignedVehicle?.model || licensePlate),
    licensePlate,
    vin: mockDriverClean(payload.vin || assignedVehicle?.vin),
    vehicleBrand: normalizeVehicleBrand(payload.vehicleBrand || payload.brand || assignedVehicle?.brand || assignedVehicle?.model),
    defectType: mockDriverClean(payload.defectType || partMatch.defectType),
    defectDescription,
    damagePhotoStatus: mockDriverClean(payload.damagePhotoStatus || "requested"),
    damagePhotoRequestedAt: mockDriverClean(payload.damagePhotoRequestedAt || now),
    damagePhotoDocumentId: mockDriverClean(payload.damagePhotoDocumentId),
    damagePhotoNote: mockDriverClean(payload.damagePhotoNote || "Šarlota / systém požádal řidiče o fotku poškození."),
    probablePart,
    probablePartSide: mockDriverClean(payload.probablePartSide || partMatch.probablePartSide || "unknown"),
    partIdentificationStatus: mockDriverClean(payload.partIdentificationStatus || partMatch.partIdentificationStatus),
    verifiedPart: mockDriverClean(payload.verifiedPart),
    partOrderNumber: mockDriverClean(payload.partOrderNumber),
    oePartNumber: mockDriverClean(payload.oePartNumber),
    partName: mockDriverClean(payload.partName),
    partVerificationStatus: mockDriverClean(payload.partVerificationStatus || partMatch.partIdentificationStatus || "waiting_manual_verification"),
    partVerificationSource: mockDriverClean(payload.partVerificationSource),
    partsProviderId: partAiCandidate ? "partslink24" : "",
    partsProviderStatus: partAiCandidate ? "waiting_vin_pilot" : "not_applicable",
    partsProviderMessage: partAiCandidate ? "AI Boost rozpoznal konkrétní díl. Ověření podle VIN je read-only pilot." : partMatch.note,
    partsProviderError: "",
    partLookupQuery: [probablePart, partMatch.defectType, defectDescription].filter(Boolean).join(" "),
    partLookupResultJson: "",
    mercedesManualPortalUrl: process.env.MERCEDES_PARTS_MANUAL_PORTAL_URL || "https://webpartstruck-cloud.mercedes-benz-trucks.com/webparts/",
    mercedesMyPartsHubUrl: process.env.MERCEDES_MYPARTSHUB_URL || "https://mypartshub.daimlertruck.com",
    priceBoostStatus: partAiCandidate ? "waiting_verified_part" : "not_requested",
    priceBoostNote: partAiCandidate
      ? "Cenový průzkum čeká na ověřené OE číslo. Nic se automaticky neobjedná."
      : "Cenový průzkum se nespustil, protože hlášení není jednoznačný požadavek na konkrétní díl.",
    priceBoostCheckedAt: "",
    priceBoostResultJson: "",
    status: mockDriverClean(payload.status || driverPartRequestInitialStatus(partMatch)),
    category: mockDriverClean(partMatch.category || "nejasná závada"),
    serviceType: mockDriverClean(partMatch.serviceType || partMatch.defectType || "diagnostika"),
    priority: mockDriverClean(partMatch.priority || "běžné"),
    backgroundAction: mockDriverClean(partMatch.backgroundAction || "diagnostics"),
    assignedToName: "",
    assignedToEmail: "",
    handedOffToPatrikAt: "",
    kamilSmsSentAt: "",
    orderedAt: "",
    orderedByUserId: "",
    deliveredAt: "",
    deliveredByUserId: "",
    serviceDate: "",
    serviceTime: "",
    serviceTechnician: "",
    serviceNote: "",
    driverSmsSentAt: "",
    completedAt: "",
    completedByUserId: "",
    canceledAt: "",
    canceledByUserId: "",
    note: [
      driverNote ? `Poznámka řidiče: ${driverNote}` : "",
      mockDriverClean(payload.note),
      mockDriverClean(partMatch.note),
      canUseUnverifiedPlate ? `SPZ neověřena: ${licensePlateOverrideNote}` : ""
    ].filter(Boolean).join(" "),
    patrikEmailStatus: "not_sent",
    patrikEmailError: "",
    kamilSmsStatus: "not_sent",
    kamilSmsRecipient: "",
    kamilSmsError: "",
    driverSmsStatus: "not_sent",
    driverSmsError: "",
    source: canUseUnverifiedPlate
      ? (mockDriverClean(payload.source) === "voice" ? "voice_unverified_plate" : "manual_unverified_plate")
      : mockDriverClean(payload.source || "manual"),
    createdByUserId: user?.id || "",
    createdAt: now,
    updatedByUserId: user?.id || "",
    updatedAt: now,
    events: []
  };
  request.events.unshift(mockDriverEvent(
    id,
    "create",
    user,
    `Vytvořeno v lokálním preview modulu Hlášení řidičů.${canUseUnverifiedPlate ? " SPZ nebyla ověřena ve Vozovém parku." : ""}`
  ));
  mockDriverPartRequests = [request, ...mockDriverPartRequests].slice(0, 100);
  return request;
}

function updateMockDriverRequest(id, updater) {
  const index = mockDriverPartRequests.findIndex((item) => sameMockId(item.id, id) || sameMockId(item.reportId, id));
  if (index < 0) {
    const error = new Error("Požadavek na náhradní díl nebyl nalezen.");
    error.status = 404;
    throw error;
  }
  const next = updater(mockDriverPartRequests[index]);
  mockDriverPartRequests = [
    ...mockDriverPartRequests.slice(0, index),
    next,
    ...mockDriverPartRequests.slice(index + 1)
  ];
  return next;
}

function mockDriverPriceOffers(item = {}) {
  try {
    const parsed = JSON.parse(mockDriverClean(item.priceBoostResultJson) || "{}");
    if (mockDriverClean(parsed?.provider) === "openai_web_search") {
      return [];
    }
    const offers = Array.isArray(parsed?.offers)
      ? parsed.offers
      : Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    return offers
      .filter((offer) => mockDriverClean(offer?.url) && (mockDriverClean(offer?.title) || mockDriverClean(offer?.seller)))
      .slice(0, 3);
  } catch {
    return [];
  }
}

function mockDriverPriceOffersProvider(item = {}) {
  try {
    const parsed = JSON.parse(mockDriverClean(item.priceBoostResultJson) || "{}");
    return mockDriverClean(parsed?.provider);
  } catch {
    return "";
  }
}

function mockDriverHasPartSeedForPatrik(item = {}) {
  return Boolean(
    item.oePartNumber ||
    item.partName ||
    item.verifiedPart ||
    item.partOrderNumber ||
    (item.partAiCandidate === true && mockDriverClean(item.probablePart || item.partAiDetectedName))
  );
}

async function handoffMockDriverPartRequest(user, id) {
  if (!mockDriverCanManage(user)) {
    const error = new Error("Nemáte oprávnění předat díl Patrikovi k ověření.");
    error.status = 403;
    throw error;
  }
  let current = mockDriverPartRequests.find((item) => sameMockId(item.id, id) || sameMockId(item.reportId, id));
  if (!current?.licensePlate || !current?.vehicleName || current.licensePlateVerified !== true || current.manualVehicleReview === true) {
    const error = new Error("Vozidlo není bezpečně ověřené proti Vozovému parku. Nejdřív proveď ruční kontrolu.");
    error.status = 400;
    throw error;
  }
  if (!current.vin) {
    const error = new Error("Bez VIN nelze předat díl Patrikovi v pilotu podle VIN.");
    error.status = 400;
    throw error;
  }
  if (!mockDriverHasPartSeedForPatrik(current)) {
    const error = new Error("Nejdřív musí být jasně rozpoznaný nebo ověřený díl.");
    error.status = 400;
    throw error;
  }
  if (mockDriverPriceOffers(current).length < 3) {
    current = await runMockDriverPartPriceBoost(user, id);
  }
  if (mockDriverPriceOffers(current).length < 3) {
    const message = mockDriverPriceOffersProvider(current) === "openai_web_search"
      ? "Finální 3 odkazy čekají na oficiální price provider. OpenAI web-search je jen read-only náhled."
      : "AI Boost zatím nedodal 3 bezpečně relevantní nabídky s odkazy. E-mail Patrikovi neposílám bez odkazů.";
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
  const patrik = mockDriverPartsRecipient();
  const ccEmail = mockDriverClean(process.env.PARTS_PILOT_CC_EMAIL || "oplustil@kaiserservis.cz");
  const now = new Date().toISOString();
  addMockNotificationLog({
    moduleId: "driver-reports",
    relatedEntityType: "driver_part_request",
    relatedEntityId: id,
    channel: "email",
    type: "driver_part_order_email",
    status: "sent",
    recipient: patrik.email,
    recipientName: patrik.name,
    subject: "Náhradní díl k ověření",
    messagePreview: `Lokální mock: e-mail Patrikovi by byl odeslán${ccEmail ? `, CC ${ccEmail}` : ""}.`
  });
  return updateMockDriverRequest(id, (item) => ({
    ...item,
    status: "handed_to_ordering",
    assignedToName: patrik.name,
    assignedToEmail: patrik.email,
    handedOffToPatrikAt: now,
    patrikEmailStatus: "sent",
    patrikEmailError: "",
    updatedByUserId: user?.id || "",
    updatedAt: now,
    events: [
      mockDriverEvent(item.id, "handoff_to_ordering", user, "Lokální mock: e-mail Patrikovi by byl odeslán. SMS Kamilovi se v tomto kroku neposílá.", {
        channel: "email",
        recipient: [patrik.email, ccEmail ? `cc: ${ccEmail}` : ""].filter(Boolean).join(", "),
        status: "sent"
      }),
      ...(item.events || [])
    ]
  }));
}

async function runMockDriverPartPriceBoost(user, id) {
  if (!mockDriverCanManage(user)) {
    const error = new Error("Nemáte oprávnění spustit cenový průzkum.");
    error.status = 403;
    throw error;
  }
  const current = findMockDriverRequest(id);
  if (!current) {
    const error = new Error("Požadavek na náhradní díl nebyl nalezen.");
    error.status = 404;
    throw error;
  }

  const result = await runDriverPartPriceSearch(process.env, current, {
    allowProbablePartSeed: false,
    requireOfficialProvider: true
  });
  return updateMockDriverRequest(id, (item) => ({
    ...item,
    priceBoostStatus: mockDriverClean(result.status || "failed"),
    priceBoostNote: mockDriverClean(result.message),
    priceBoostCheckedAt: mockDriverClean(result.checkedAt || new Date().toISOString()),
    priceBoostResultJson: mockDriverClean(result.resultJson),
    updatedByUserId: user?.id || "",
    updatedAt: new Date().toISOString(),
    events: [mockDriverEvent(item.id, "price_boost_search", user, result.message || "Cenový průzkum byl zapsaný do hlášení."), ...(item.events || [])]
  }));
}

function markMockDriverPartOrdered(user, id, payload = {}) {
  if (!mockDriverCanManage(user)) {
    const error = new Error("Nemáte oprávnění označit díl jako objednaný.");
    error.status = 403;
    throw error;
  }
  const now = new Date().toISOString();
  return updateMockDriverRequest(id, (item) => ({
    ...item,
    status: "ordered",
    verifiedPart: mockDriverClean(payload.verifiedPart || item.verifiedPart),
    oePartNumber: mockDriverClean(payload.oePartNumber || item.oePartNumber),
    partName: mockDriverClean(payload.partName || item.partName),
    partOrderNumber: mockDriverClean(payload.partOrderNumber || payload.oePartNumber || item.partOrderNumber || item.oePartNumber),
    partVerificationStatus: payload.partVerificationStatus || item.partVerificationStatus || "verified_manual",
    partVerificationSource: payload.partVerificationSource || item.partVerificationSource || "manual",
    partIdentificationStatus: payload.verifiedPart || payload.partOrderNumber || payload.oePartNumber || payload.partName ? "verified_manual" : item.partIdentificationStatus,
    orderedAt: now,
    orderedByUserId: user?.id || "",
    note: mockDriverClean(payload.note || item.note),
    updatedByUserId: user?.id || "",
    updatedAt: now,
    events: [mockDriverEvent(item.id, "mark_ordered", user, "Díl označen jako objednaný v lokálním preview."), ...(item.events || [])]
  }));
}

async function verifyMockMercedesDriverPartRequest(user, id) {
  if (!mockDriverCanManage(user)) {
    const error = new Error("Nemáte oprávnění ověřit Mercedes díl.");
    error.status = 403;
    throw error;
  }
  const item = findMockDriverRequest(id);
  if (!item) {
    const error = new Error("Požadavek na náhradní díl nebyl nalezen.");
    error.status = 404;
    throw error;
  }
  const now = new Date().toISOString();
  const isMercedes = normalizeVehicleBrand(item.vehicleBrand) === "mercedes";
  const result = isMercedes
    ? await verifyMercedesPartForRequest(process.env, item)
    : {
      partVerificationStatus: "not_applicable",
      partVerificationSource: "",
      partsProviderId: "",
      partsProviderStatus: "skipped_non_mercedes",
      partsProviderMessage: "Lokální preview: vozidlo není Mercedes-Benz Trucks, díl jde Patrikovi k ručnímu ověření.",
      partsProviderError: "",
      partLookupQuery: item.probablePart || item.defectDescription,
      resultJson: "",
      mercedesManualPortalUrl: "",
      mercedesMyPartsHubUrl: ""
    };

  return updateMockDriverRequest(id, (current) => ({
    ...current,
    verifiedPart: mockDriverClean(result.verifiedPart || current.verifiedPart),
    oePartNumber: mockDriverClean(result.oePartNumber || current.oePartNumber),
    partName: mockDriverClean(result.partName || current.partName),
    partOrderNumber: mockDriverClean(result.partOrderNumber || current.partOrderNumber || result.oePartNumber),
    partIdentificationStatus: result.partVerificationStatus === "verified_daimler"
      ? "verified_daimler"
      : result.partVerificationStatus === "not_applicable"
        ? current.partIdentificationStatus
        : "waiting_manual_verification",
    partVerificationStatus: mockDriverClean(result.partVerificationStatus || "waiting_manual_verification"),
    partVerificationSource: mockDriverClean(result.partVerificationSource),
    partsProviderId: mockDriverClean(result.partsProviderId),
    partsProviderStatus: mockDriverClean(result.partsProviderStatus),
    partsProviderMessage: mockDriverClean(result.partsProviderMessage),
    partsProviderError: mockDriverClean(result.partsProviderError),
    partLookupQuery: mockDriverClean(result.partLookupQuery),
    partLookupResultJson: mockDriverClean(result.resultJson),
    mercedesManualPortalUrl: mockDriverClean(result.mercedesManualPortalUrl || current.mercedesManualPortalUrl),
    mercedesMyPartsHubUrl: mockDriverClean(result.mercedesMyPartsHubUrl || current.mercedesMyPartsHubUrl),
    priceBoostStatus: result.oePartNumber || result.partOrderNumber ? "waiting_verified_part" : "not_requested",
    priceBoostNote: result.oePartNumber || result.partOrderNumber
      ? "AI Boost cenový průzkum smí běžet až po potvrzení kompatibility člověkem."
      : "AI Boost cenový průzkum čeká na ověřené OE číslo.",
    updatedByUserId: user?.id || "",
    updatedAt: now,
    events: [mockDriverEvent(current.id, isMercedes ? "verify_mercedes_part" : "skip_mercedes_part_verification", user, result.partsProviderMessage || "Lokální preview: ověření dílu zapsáno."), ...(current.events || [])]
  }));
}

function updateMockDriverPartManualVerification(user, id, payload = {}) {
  if (!mockDriverCanManage(user)) {
    const error = new Error("Nemáte oprávnění ručně ověřit díl.");
    error.status = 403;
    throw error;
  }
  const now = new Date().toISOString();
  return updateMockDriverRequest(id, (item) => {
    const verifiedPart = mockDriverClean(payload.verifiedPart || item.verifiedPart);
    const oePartNumber = mockDriverClean(payload.oePartNumber || item.oePartNumber);
    const partName = mockDriverClean(payload.partName || item.partName);
    const partOrderNumber = mockDriverClean(payload.partOrderNumber || item.partOrderNumber || oePartNumber);
    const hasManualData = Boolean(verifiedPart || oePartNumber || partName || partOrderNumber);
    return {
      ...item,
      verifiedPart,
      oePartNumber,
      partName,
      partOrderNumber,
      partIdentificationStatus: hasManualData ? "verified_manual" : "waiting_manual_verification",
      partVerificationStatus: hasManualData ? "verified_manual" : "waiting_manual_verification",
      partVerificationSource: hasManualData ? "manual" : item.partVerificationSource,
      note: mockDriverClean(payload.note || item.note),
      priceBoostStatus: hasManualData ? "waiting_verified_part" : item.priceBoostStatus,
      priceBoostNote: hasManualData
        ? "AI Boost cenový průzkum smí běžet až po potvrzení kompatibility člověkem."
        : item.priceBoostNote,
      updatedByUserId: user?.id || "",
      updatedAt: now,
      events: [mockDriverEvent(item.id, "manual_part_verification", user, hasManualData ? "Díl byl ručně ověřen v lokálním preview." : "Díl zůstává k ručnímu ověření v lokálním preview."), ...(item.events || [])]
    };
  });
}

function markMockDriverPartArrived(user, id, payload = {}) {
  if (!mockDriverCanManage(user)) {
    const error = new Error("Nemáte oprávnění označit doručení dílu.");
    error.status = 403;
    throw error;
  }
  const now = new Date().toISOString();
  return updateMockDriverRequest(id, (item) => ({
    ...item,
    status: "part_arrived",
    deliveredAt: now,
    deliveredByUserId: user?.id || "",
    note: mockDriverClean(payload.note || item.note),
    updatedByUserId: user?.id || "",
    updatedAt: now,
    events: [mockDriverEvent(item.id, "mark_part_arrived", user, "Díl dorazil v lokálním preview."), ...(item.events || [])]
  }));
}

function scheduleMockDriverPartService(user, id, payload = {}) {
  if (!mockDriverCanManage(user)) {
    const error = new Error("Nemáte oprávnění plánovat servis.");
    error.status = 403;
    throw error;
  }
  const serviceDate = mockDriverClean(payload.serviceDate);
  const serviceTime = mockDriverClean(payload.serviceTime);
  if (!serviceDate || !serviceTime) {
    const error = new Error("Nejdřív zadejte datum i čas přistavení do dílny.");
    error.status = 400;
    throw error;
  }
  const now = new Date().toISOString();
  return updateMockDriverRequest(id, (item) => {
    if (item.status !== "part_arrived" && item.status !== "service_scheduled") {
      const error = new Error("SMS řidiči lze poslat až po potvrzení doručení dílu.");
      error.status = 400;
      throw error;
    }
    addMockNotificationLog({
      moduleId: "driver-reports",
      relatedEntityType: "driver_part_request",
      relatedEntityId: item.id,
      channel: "sms",
      type: "driver_part_ready_driver_sms",
      status: "sent",
      recipient: item.driverPhone,
      recipientName: item.driverName,
      messagePreview: "Lokální mock: SMS řidiči by byla odeslána."
    });
    return {
      ...item,
      status: "service_scheduled",
      serviceDate,
      serviceTime,
      serviceTechnician: mockDriverClean(payload.serviceTechnician || item.serviceTechnician || "Kamil"),
      serviceNote: mockDriverClean(payload.serviceNote || item.serviceNote),
      driverSmsStatus: "sent",
      driverSmsError: "",
      driverSmsSentAt: now,
      updatedByUserId: user?.id || "",
      updatedAt: now,
      events: [mockDriverEvent(item.id, "schedule_service", user, "Servis naplánován a SMS řidiči odeslána v lokálním preview.", {
        channel: "sms",
        recipient: item.driverPhone,
        status: "sent"
      }), ...(item.events || [])]
    };
  });
}

function closeMockDriverPartRequest(user, id, payload = {}) {
  if (!mockDriverCanManage(user)) {
    const error = new Error("Nemáte oprávnění uzavřít požadavek.");
    error.status = 403;
    throw error;
  }
  const now = new Date().toISOString();
  const canceled = Boolean(payload.cancel || payload.status === "canceled");
  return updateMockDriverRequest(id, (item) => ({
    ...item,
    status: canceled ? "canceled" : "completed",
    completedAt: canceled ? item.completedAt : now,
    completedByUserId: canceled ? item.completedByUserId : user?.id || "",
    canceledAt: canceled ? now : item.canceledAt,
    canceledByUserId: canceled ? user?.id || "" : item.canceledByUserId,
    note: mockDriverClean(payload.note || item.note),
    updatedByUserId: user?.id || "",
    updatedAt: now,
    events: [mockDriverEvent(item.id, canceled ? "cancel" : "complete", user, canceled ? "Požadavek zrušen v lokálním preview." : "Požadavek uzavřen jako vyřízený v lokálním preview."), ...(item.events || [])]
  }));
}

function dateBoundary(value, end = false) {
  const cleaned = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const date = new Date();
    if (!end) {
      date.setDate(date.getDate() - 30);
    }
    return `${date.toISOString().slice(0, 10)}T${end ? "23:59:59.999" : "00:00:00.000"}Z`;
  }

  return `${cleaned}T${end ? "23:59:59.999" : "00:00:00.000"}Z`;
}

function filteredMockNotifications(url) {
  const dateFrom = dateBoundary(url.searchParams.get("dateFrom"));
  const dateTo = dateBoundary(url.searchParams.get("dateTo"), true);
  const channel = String(url.searchParams.get("channel") || "").trim();
  const status = String(url.searchParams.get("status") || "").trim();
  const type = String(url.searchParams.get("type") || "").trim();
  const employeeId = String(url.searchParams.get("employeeId") || "").trim().toLowerCase();
  const managerId = String(url.searchParams.get("managerId") || "").trim().toLowerCase();
  const search = String(url.searchParams.get("search") || "").trim().toLowerCase();

  return mockNotificationLogs.filter((item) => {
    if (item.createdAt < dateFrom || item.createdAt > dateTo) return false;
    if (channel && item.channel !== channel) return false;
    if (status && item.status !== status) return false;
    if (type && item.type !== type) return false;
    if (employeeId && String(item.employeeId || "").toLowerCase() !== employeeId) return false;
    if (managerId && String(item.managerId || "").toLowerCase() !== managerId) return false;
    if (search) {
      const haystack = [
        item.recipient,
        item.recipientName,
        item.employeeName,
        item.managerName,
        item.type,
        item.lastError,
        item.messagePreview
      ].join(" ").toLowerCase();
      return haystack.includes(search);
    }
    return true;
  });
}

function canEditMockFeedback(currentUser) {
  return hasPermission(currentUser, "feedback", "edit") || hasPermission(currentUser, "feedback", "manage");
}

function canCreateCentralMockFeedback(currentUser) {
  return ["admin", "management"].includes(normalizeRole(currentUser?.role));
}

function canManageMockTcars(currentUser) {
  return ["admin", "management", "dispecer"].includes(normalizeRole(currentUser?.role));
}

function canViewMockDataBox(currentUser) {
  return hasPermission(currentUser, "data-box", "view");
}

function canManageMockDataBox(currentUser) {
  return ["admin", "management"].includes(normalizeRole(currentUser?.role))
    && hasPermission(currentUser, "data-box", "manage");
}

function mockDataBoxStatusPayload() {
  const latestRun = mockDataBoxSyncRuns[0] || null;
  return {
    apiStatus: "ready",
    storageStatus: "waiting",
    integrationStatus: "inactive",
    isdsActive: false,
    mode: "pilot",
    dataBox: {
      id: "kaiser-primary",
      label: "Kaiser Smart Datova schranka",
      isdsId: "",
      mode: "pilot",
      status: "inactive",
      lastSyncAt: latestRun?.startedAt || "",
      lastSyncStatus: latestRun?.status || "waiting",
      lastSyncMessage: latestRun?.message || "ISDS integrace neni aktivni.",
      createdAt: "",
      updatedAt: ""
    },
    summary: {
      received: 0,
      sent: 0,
      attachments: 0,
      dataBoxes: 1,
      configuredDataBoxes: 0,
      syncRuns: mockDataBoxSyncRuns.length,
      lastSyncAt: latestRun?.startedAt || ""
    },
    isds: {
      enabled: false,
      configured: false,
      mode: "local-dev",
      baseUrl: "https://ws1.datovka.gov.cz",
      infoEndpointUrl: "https://ws1.datovka.gov.cz/DS/dx",
      hasUsername: false,
      hasPassword: false,
      missing: ["DATA_BOX_ISDS_ENABLED", "DATA_BOX_ISDS_USERNAME", "DATA_BOX_ISDS_PASSWORD"],
      configuredAccounts: 0,
      accountCount: 1,
      maxAccounts: 6,
      accounts: [{
        slot: 1,
        id: "kaiser-primary",
        label: "Kaiser Smart Datova schranka",
        isdsId: "",
        enabled: false,
        configured: false,
        mode: "local-dev",
        baseUrl: "https://ws1.datovka.gov.cz",
        infoEndpointUrl: "https://ws1.datovka.gov.cz/DS/dx",
        hasUsername: false,
        hasPassword: false,
        missing: ["DATA_BOX_ISDS_ENABLED", "DATA_BOX_ISDS_USERNAME", "DATA_BOX_ISDS_PASSWORD"],
        limit: 50,
        lookbackDays: 30,
        documentationStatus: "official-isds-wsdl-3.11-2026-06-26"
      }],
      documentationStatus: "official-isds-wsdl-3.11-2026-06-26"
    },
    message: latestRun?.message || "Lokalni dev API je pripravene, ostre ISDS napojeni neni aktivni."
  };
}

function visibleMockFeedback(currentUser) {
  const items = mockModuleFeedback
    .map(normalizeFeedback)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  if (canEditMockFeedback(currentUser)) {
    return items;
  }

  return items.filter((item) => sameMockId(item.userId, currentUser?.id));
}

function createMockModuleFeedback(currentUser, payload) {
  const message = String(payload?.message || "").trim();

  if (!message) {
    const error = new Error("Vyplňte text připomínky.");
    error.status = 400;
    throw error;
  }

  return normalizeFeedback({
    id: `module-feedback-${randomUUID()}`,
    moduleId: payload?.moduleId || "",
    moduleName: payload?.moduleName || "",
    userId: currentUser?.id || "",
    userName: currentUser?.name || currentUser?.email || "Uživatel",
    userRole: currentUser?.role || "readonly",
    message,
    priority: normalizeFeedbackPriority(payload?.priority),
    status: "Nová",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedByUserId: null,
    internalNote: ""
  });
}

function createMockCentralModuleFeedback(currentUser, payload) {
  const moduleId = String(payload?.moduleId || "").trim();
  const moduleName = String(payload?.moduleName || "").trim();
  const title = String(payload?.title || "").trim();
  const description = String(payload?.description || payload?.message || "").trim();
  const priority = String(payload?.priority || "Běžná").trim();
  const status = String(payload?.status || "Nová").trim();

  if (!moduleId || !moduleName) {
    const error = new Error("Vyberte modul připomínky.");
    error.status = 400;
    throw error;
  }

  if (!title) {
    const error = new Error("Vyplňte název připomínky.");
    error.status = 400;
    throw error;
  }

  if (!description) {
    const error = new Error("Vyplňte popis připomínky.");
    error.status = 400;
    throw error;
  }

  if (!FEEDBACK_PRIORITIES.includes(priority)) {
    const error = new Error("Vyberte platnou prioritu připomínky.");
    error.status = 400;
    throw error;
  }

  if (!FEEDBACK_STATUSES.includes(status)) {
    const error = new Error("Vyberte platný stav připomínky.");
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const finished = ["Hotovo", "Zamítnuto", "Archiv"].includes(status);

  return normalizeFeedback({
    id: `module-feedback-${randomUUID()}`,
    moduleId,
    moduleName,
    userId: currentUser?.id || "",
    userName: currentUser?.name || currentUser?.email || "Uživatel",
    userRole: currentUser?.role || "readonly",
    message: `${title}\n\n${description}`.trim(),
    priority,
    status,
    createdAt: now,
    resolvedAt: finished ? now : null,
    resolvedByUserId: finished ? currentUser?.id || null : null,
    internalNote: String(payload?.internalNote || "").trim()
  });
}

function updateMockModuleFeedback(currentUser, id, payload) {
  if (!canEditMockFeedback(currentUser)) {
    const error = new Error("Nemáte oprávnění.");
    error.status = 403;
    throw error;
  }

  const index = mockModuleFeedback.findIndex((item) => sameMockId(item.id, id));
  if (index < 0) {
    const error = new Error("Připomínka nebyla nalezena.");
    error.status = 404;
    throw error;
  }

  const existing = normalizeFeedback(mockModuleFeedback[index]);
  const status = Object.hasOwn(payload || {}, "status")
    ? normalizeFeedbackStatus(payload.status)
    : existing.status;
  const isFinished = status === "Hotovo" || status === "Zamítnuto" || status === "Archiv";
  const updated = {
    ...normalizeFeedback({
      ...existing,
      status,
      internalNote: Object.hasOwn(payload || {}, "internalNote")
        ? String(payload.internalNote || "").trim()
        : existing.internalNote,
      resolvedAt: isFinished ? (existing.resolvedAt || new Date().toISOString()) : null,
      resolvedByUserId: isFinished ? (existing.resolvedByUserId || currentUser?.id || null) : null
    }),
    previousStatus: existing.status
  };

  mockModuleFeedback = [
    ...mockModuleFeedback.slice(0, index),
    updated,
    ...mockModuleFeedback.slice(index + 1)
  ];

  return updated;
}

function mockFeedbackResolvedNotification(feedback, payload) {
  const author = mockUsers.find((user) => sameMockId(user.id, feedback.userId)) || null;
  const resolutionMessage = String(payload?.resolutionMessage || "").trim()
    || "Připomínka byla označena jako Hotovo.";

  addMockNotificationLog({
    moduleId: feedback.moduleId || "feedback",
    relatedEntityType: "module_feedback",
    relatedEntityId: feedback.id,
    channel: "email",
    type: "module_feedback_resolved_email",
    status: author?.email ? "sent" : "skipped",
    recipient: author?.email || "",
    recipientName: author?.name || feedback.userName,
    subject: "Smart odpady – připomínka vyřešena",
    messagePreview: resolutionMessage,
    lastError: author?.email ? "" : `Chybí e-mail příjemce: ${feedback.userName}.`
  });

  return author?.email
    ? { status: "sent", recipientName: author.name || feedback.userName }
    : { status: "skipped", recipientName: feedback.userName, errorMessage: `Chybí e-mail příjemce: ${feedback.userName}.` };
}

function fullEmployeeName(employee) {
  return [employee?.firstName, employee?.lastName].filter(Boolean).join(" ");
}

function defaultVacationEntitlement(user) {
  return normalizeRole(user?.role) === "ridic" ? 20 : 25;
}

function mockEmployeeFromUser(user) {
  const override = mockEmployeeCards.get(user.id) || {};
  const nameParts = splitEmployeeName(user.name);
  const entitlement = Number(override.vacationEntitlementDays ?? defaultVacationEntitlement(user));
  const used = Number(override.vacationUsedDays ?? 0);
  const pending = Number(override.vacationPendingDays ?? 0);
  const managerId = String(override.managerId ?? user.managerId ?? "");
  const manager = managerId ? findMockUser(managerId) : null;

  return {
    id: user.id,
    userId: user.id,
    firstName: override.firstName ?? nameParts.firstName,
    lastName: override.lastName ?? nameParts.lastName,
    email: override.email ?? user.email ?? "",
    phone: override.phone ?? user.phone ?? "",
    address: override.address ?? user.address ?? "",
    role: normalizeRole(override.role ?? user.role),
    department: override.department ?? user.department ?? "",
    position: override.position ?? user.position ?? "",
    managerId,
    managerName: managerId ? (manager?.name || override.managerName || "") : "",
    employmentStatus: override.employmentStatus ?? (user.active === false ? "inactive" : "active"),
    startDate: override.startDate ?? "",
    employmentType: override.employmentType ?? "",
    workplace: override.workplace ?? "",
    weeklyHours: Number(override.weeklyHours ?? 40),
    workload: Number(override.workload ?? 1),
    vacationEntitlementDays: entitlement,
    vacationUsedDays: used,
    vacationPendingDays: pending,
    vacationRemainingDays: Number(override.vacationRemainingDays ?? entitlement - used - pending),
    currentAbsenceStatus: override.currentAbsenceStatus ?? "v práci",
    sickDaysCurrentYear: Number(override.sickDaysCurrentYear ?? 0),
    lastAbsenceDate: override.lastAbsenceDate ?? "",
    internalNote: override.internalNote ?? "",
    createdAt: override.createdAt ?? user.createdAt ?? new Date().toISOString(),
    updatedAt: override.updatedAt ?? user.updatedAt ?? user.createdAt ?? new Date().toISOString()
  };
}

function mockEmployeeFromStoredCard(card) {
  const id = cleanMockString(card?.id || card?.userId);
  const nameParts = splitEmployeeName(`${card?.firstName || ""} ${card?.lastName || ""}`);
  const role = normalizeRole(card?.role || "ridic");
  const entitlement = Number(card?.vacationEntitlementDays ?? defaultVacationEntitlement({ role }));
  const used = Number(card?.vacationUsedDays ?? 0);
  const pending = Number(card?.vacationPendingDays ?? 0);

  return {
    id,
    userId: cleanMockString(card?.userId) || id,
    firstName: cleanMockString(card?.firstName) || nameParts.firstName,
    lastName: cleanMockString(card?.lastName) || nameParts.lastName,
    email: cleanMockString(card?.email),
    phone: cleanMockString(card?.phone),
    address: cleanMockString(card?.address),
    role,
    department: cleanMockString(card?.department),
    position: cleanMockString(card?.position),
    managerId: cleanMockString(card?.managerId),
    managerName: cleanMockString(card?.managerName),
    employmentStatus: cleanMockString(card?.employmentStatus) || "active",
    startDate: cleanMockString(card?.startDate),
    employmentType: cleanMockString(card?.employmentType),
    workplace: cleanMockString(card?.workplace),
    weeklyHours: Number(card?.weeklyHours ?? 40),
    workload: Number(card?.workload ?? 1),
    vacationEntitlementDays: Number.isFinite(entitlement) ? entitlement : defaultVacationEntitlement({ role }),
    vacationUsedDays: Number.isFinite(used) ? used : 0,
    vacationPendingDays: Number.isFinite(pending) ? pending : 0,
    vacationRemainingDays: Number.isFinite(entitlement - used - pending)
      ? entitlement - used - pending
      : defaultVacationEntitlement({ role }),
    currentAbsenceStatus: cleanMockString(card?.currentAbsenceStatus) || "v práci",
    sickDaysCurrentYear: Number(card?.sickDaysCurrentYear ?? 0),
    lastAbsenceDate: cleanMockString(card?.lastAbsenceDate),
    internalNote: cleanMockString(card?.internalNote),
    isHrOnly: card?.isHrOnly !== false,
    sourceSystem: cleanMockString(card?.sourceSystem) || "manual-entry",
    sourceEmployeeKey: cleanMockString(card?.sourceEmployeeKey),
    createdAt: cleanMockString(card?.createdAt) || new Date().toISOString(),
    updatedAt: cleanMockString(card?.updatedAt) || cleanMockString(card?.createdAt) || new Date().toISOString()
  };
}

function createManualMockEmployee(currentUser, payload = {}) {
  if (!canEditMockEmployee(currentUser)) {
    const error = new Error("Nemáte oprávnění založit zaměstnance.");
    error.status = 403;
    throw error;
  }

  const firstName = cleanMockString(payload.firstName);
  const lastName = cleanMockString(payload.lastName);
  if (!firstName || !lastName) {
    const error = new Error("Doplňte jméno a příjmení zaměstnance.");
    error.status = 400;
    throw error;
  }

  const base = normalizeManualMockEmployeeKey(`${firstName} ${lastName}`) || "zamestnanec";
  const id = cleanMockString(payload.id || payload.userId) || `manual-${base}-${randomUUID().slice(0, 8)}`;
  const role = normalizeRole(payload.role || "ridic");
  const entitlement = Number(payload.vacationEntitlementDays ?? defaultVacationEntitlement({ role }));
  const now = new Date().toISOString();
  const employee = mockEmployeeFromStoredCard({
    ...payload,
    id,
    userId: cleanMockString(payload.userId) || id,
    firstName,
    lastName,
    role,
    isHrOnly: true,
    sourceSystem: cleanMockString(payload.sourceSystem) || "manual-entry",
    sourceEmployeeKey: cleanMockString(payload.sourceEmployeeKey || payload.email || `${firstName} ${lastName}`),
    employmentStatus: cleanMockString(payload.employmentStatus) || "active",
    currentAbsenceStatus: cleanMockString(payload.currentAbsenceStatus) || "v práci",
    workload: Number(payload.workload ?? 1),
    weeklyHours: Number(payload.weeklyHours ?? 40),
    vacationEntitlementDays: Number.isFinite(entitlement) ? entitlement : defaultVacationEntitlement({ role }),
    vacationUsedDays: Number(payload.vacationUsedDays ?? 0),
    vacationPendingDays: Number(payload.vacationPendingDays ?? 0),
    createdAt: now,
    updatedAt: now
  });

  mockEmployeeCards.set(employee.id, employee);
  return employee;
}

function canViewMockEmployee(currentUser, employee) {
  const role = normalizeRole(currentUser?.role);

  if (isFullAccessRole(currentUser) || role === "kancelar" || role === "readonly") {
    return true;
  }

  if (sameMockId(currentUser?.id, employee?.userId || employee?.id)) {
    return true;
  }

  if (role === "garazmistr" || role === "dispecer") {
    return (
      String(currentUser?.department || "").trim() &&
      String(currentUser.department || "").trim().toLowerCase() === String(employee?.department || "").trim().toLowerCase()
    );
  }

  return false;
}

function canEditMockEmployee(currentUser) {
  return isFullAccessRole(currentUser) || normalizeRole(currentUser?.role) === "kancelar";
}

function canManageMockMedicalExam(currentUser) {
  return isFullAccessRole(currentUser);
}

function mockMedicalExamForEmployee(employee) {
  const stored = mockEmployeeMedicalExams.get(employee.id) || {};
  const category = normalizeMedicalExamCategory(stored.category);
  const dateOfBirth = medicalExamDateValue(stored.dateOfBirth);
  const lastExamDate = medicalExamDateValue(stored.lastExamDate);
  const calculated = calculateMedicalExamState({ category, dateOfBirth, lastExamDate });

  return {
    id: stored.id || "",
    employeeId: employee.id,
    employeeName: fullEmployeeName(employee),
    employeeEmail: employee.email || "",
    category,
    dateOfBirth,
    lastExamDate,
    note: stored.note || "",
    notificationEnabled: stored.notificationEnabled !== false,
    lastNotificationKey: stored.lastNotificationKey || "",
    lastNotificationSentAt: stored.lastNotificationSentAt || "",
    requestExamType: stored.requestExamType || "entry",
    requestCategory: stored.requestCategory || category,
    medicalFacilityName: stored.medicalFacilityName || "",
    medicalDoctorName: stored.medicalDoctorName || "",
    medicalFacilityAddress: stored.medicalFacilityAddress || "",
    medicalFacilityCompanyId: stored.medicalFacilityCompanyId || "",
    updatedByUserId: stored.updatedByUserId || "",
    createdAt: stored.createdAt || "",
    updatedAt: stored.updatedAt || "",
    ...calculated
  };
}

function saveMockMedicalExam(currentUser, employee, payload) {
  if (!canManageMockMedicalExam(currentUser)) {
    const error = new Error("Nemáte oprávnění upravit lékařské prohlídky.");
    error.status = 403;
    throw error;
  }

  const existing = mockEmployeeMedicalExams.get(employee.id) || {};
  const now = new Date().toISOString();
  const category = normalizeMedicalExamCategory(payload?.category ?? existing.category);
  const dateOfBirth = medicalExamDateValue(payload?.dateOfBirth ?? existing.dateOfBirth);
  const lastExamDate = medicalExamDateValue(payload?.lastExamDate ?? existing.lastExamDate);
  const calculated = calculateMedicalExamState({ category, dateOfBirth, lastExamDate });
  const item = {
    ...existing,
    id: existing.id || `medical-exam-${randomUUID()}`,
    employeeId: employee.id,
    category,
    dateOfBirth,
    lastExamDate,
    nextExamDate: calculated.nextExamDate,
    intervalMonths: calculated.intervalMonths,
    status: calculated.status,
    note: String(payload?.note ?? existing.note ?? "").trim(),
    optional: calculated.optional,
    notificationEnabled: payload?.notificationEnabled !== false,
    requestExamType: String(payload?.requestExamType ?? existing.requestExamType ?? "entry").trim() || "entry",
    requestCategory: normalizeMedicalExamCategory(payload?.requestCategory ?? existing.requestCategory ?? category) || category,
    medicalFacilityName: String(payload?.medicalFacilityName ?? existing.medicalFacilityName ?? "").trim(),
    medicalDoctorName: String(payload?.medicalDoctorName ?? existing.medicalDoctorName ?? "").trim(),
    medicalFacilityAddress: String(payload?.medicalFacilityAddress ?? existing.medicalFacilityAddress ?? "").trim(),
    medicalFacilityCompanyId: String(payload?.medicalFacilityCompanyId ?? existing.medicalFacilityCompanyId ?? "").trim(),
    updatedByUserId: currentUser.id,
    createdAt: existing.createdAt || now,
    updatedAt: now
  };

  mockEmployeeMedicalExams.set(employee.id, item);
  return mockMedicalExamForEmployee(employee);
}

function visibleMockEmployees(currentUser) {
  const userIds = new Set(mockUsers.map((user) => cleanMockString(user.id).toLowerCase()));
  const manualEmployees = Array.from(mockEmployeeCards.values())
    .filter((card) => {
      const id = cleanMockString(card?.id || card?.userId).toLowerCase();
      return id && !userIds.has(id);
    })
    .map(mockEmployeeFromStoredCard);

  return [
    ...mockUsers.map(mockEmployeeFromUser),
    ...manualEmployees
  ]
    .filter((employee) => canViewMockEmployee(currentUser, employee))
    .sort((a, b) => fullEmployeeName(a).localeCompare(fullEmployeeName(b), "cs"));
}

function findMockEmployee(currentUser, id) {
  const user = findMockUser(id);

  if (user) {
    const employee = mockEmployeeFromUser(user);
    return canViewMockEmployee(currentUser, employee) ? employee : null;
  }

  const card = Array.from(mockEmployeeCards.values())
    .find((item) => sameMockId(item.id, id) || sameMockId(item.userId, id));
  const employee = card ? mockEmployeeFromStoredCard(card) : null;
  return canViewMockEmployee(currentUser, employee) ? employee : null;
}

function normalizeAiMockSearch(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function mockAiLimit(value, fallback = 5) {
  const parsed = Number(value || fallback);
  return Math.max(1, Math.min(Number.isFinite(parsed) ? parsed : fallback, 8));
}

function mockEmployeeAiRoute(employeeId) {
  const id = String(employeeId || "").trim();
  return id ? `/dovolena-nemoc/zamestnanci/${encodeURIComponent(id)}` : "/dovolena-nemoc/zamestnanci";
}

function mockEmployeeMatchesAiQuery(employee, query) {
  const normalizedQuery = normalizeAiMockSearch(query);
  if (!normalizedQuery) {
    return false;
  }

  return normalizeAiMockSearch([
    fullEmployeeName(employee),
    employee?.department,
    employee?.position,
    employee?.role,
    roleLabel(employee?.role),
    employee?.managerName
  ].join(" ")).includes(normalizedQuery);
}

function mockUserMatchesAiQuery(user, query) {
  const normalizedQuery = normalizeAiMockSearch(query);
  if (!normalizedQuery) {
    return false;
  }

  return normalizeAiMockSearch([
    user?.name,
    user?.department,
    user?.position,
    user?.role,
    roleLabel(user?.role),
    user?.managerName
  ].join(" ")).includes(normalizedQuery);
}

function sanitizeMockEmployeeForAi(employee) {
  return {
    id: employee.id,
    userId: employee.userId,
    fullName: fullEmployeeName(employee),
    firstName: employee.firstName || "",
    lastName: employee.lastName || "",
    role: employee.role || "",
    roleLabel: roleLabel(employee.role),
    department: employee.department || "",
    position: employee.position || "",
    managerId: employee.managerId || "",
    managerName: employee.managerName || "",
    employmentStatus: employee.employmentStatus || "",
    currentAbsenceStatus: employee.currentAbsenceStatus || "",
    sickDaysCurrentYear: Number(employee.sickDaysCurrentYear || 0),
    lastAbsenceDate: employee.lastAbsenceDate || "",
    vacation: {
      year: new Date().getFullYear(),
      entitlementDays: Number(employee.vacationEntitlementDays || 0),
      usedDays: Number(employee.vacationUsedDays || 0),
      pendingDays: Number(employee.vacationPendingDays || 0),
      remainingDays: Number(employee.vacationRemainingDays || 0)
    },
    route: mockEmployeeAiRoute(employee.id)
  };
}

function mockUserAccessSummary(user) {
  const accessibleModules = PERMISSION_MODULES
    .map((moduleId) => {
      const allowedActions = ACTIONS.filter((action) => hasPermission(user, moduleId, action));

      if (!allowedActions.length) {
        return null;
      }

      return {
        moduleId,
        title: modules.find((moduleItem) => moduleItem.id === moduleId)?.title || moduleId,
        actions: allowedActions
      };
    })
    .filter(Boolean);

  return {
    role: user?.role || "",
    roleLabel: roleLabel(user?.role),
    modules: accessibleModules,
    moduleCount: accessibleModules.length
  };
}

function sanitizeMockUserForAi(user, options = {}) {
  return {
    id: user.id,
    name: user.name || "",
    role: user.role || "",
    roleLabel: roleLabel(user.role),
    status: user.status || "",
    active: user.active !== false,
    department: user.department || "",
    position: user.position || "",
    managerId: user.managerId || "",
    managerName: user.managerName || "",
    route: "/uzivatele",
    ...(options.includePermissions ? { access: mockUserAccessSummary(user) } : {})
  };
}

const MOCK_ABSENCE_TYPE_LABELS = {
  vacation: "Dovolená",
  sick: "Nemoc",
  doctor: "Lékař",
  care: "OČR",
  compensatory_leave: "Náhradní volno"
};

const MOCK_ABSENCE_TYPE_ALIASES = {
  "dovolená": "vacation",
  dovolena: "vacation",
  nemoc: "sick",
  "lékař": "doctor",
  lekar: "doctor",
  "očr": "care",
  ocr: "care",
  "náhradní volno": "compensatory_leave",
  "nahradni volno": "compensatory_leave"
};

const MOCK_ABSENCE_STATUS_LABELS = {
  pending: "Čeká na schválení",
  pending_approval: "Čeká na schválení",
  approved: "Schváleno",
  rejected: "Zamítnuto",
  cancelled: "Zrušeno",
  recorded: "Evidováno"
};

function mockIsoDate(value) {
  const cleaned = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : "";
}

function mockTimeValue(value) {
  const cleaned = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(cleaned)) {
    return "";
  }

  const [hours, minutes] = cleaned.split(":").map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return "";
  }

  return cleaned;
}

function mockTimeMinutes(value) {
  const time = mockTimeValue(value);
  if (!time) {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);
  return (hours * 60) + minutes;
}

function countMockAbsenceDays(dateFrom, dateTo, halfDay = false) {
  const from = new Date(`${dateFrom}T12:00:00`);
  const to = new Date(`${dateTo}T12:00:00`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return 0;
  }

  if (halfDay) {
    return 0.5;
  }

  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function countMockAbsenceHours(startTime, endTime) {
  const start = mockTimeMinutes(startTime);
  const end = mockTimeMinutes(endTime);

  if (start === null || end === null || end <= start) {
    return 0;
  }

  return (end - start) / 60;
}

function isMockHalfHourStep(value) {
  const minutes = mockTimeMinutes(value);
  return minutes !== null && minutes % 30 === 0;
}

function canViewMockAbsenceRequest(currentUser, requestItem) {
  const role = normalizeRole(currentUser?.role);

  if (isFullAccessRole(currentUser) || role === "kancelar" || role === "readonly") {
    return true;
  }

  if (sameMockId(currentUser?.id, requestItem.employeeId)) {
    return true;
  }

  if (sameMockId(currentUser?.id, requestItem.managerId)) {
    return true;
  }

  if (role === "garazmistr" || role === "dispecer") {
    return (
      String(currentUser?.department || "").trim() &&
      String(currentUser.department || "").trim().toLowerCase() === String(requestItem.department || "").trim().toLowerCase()
    );
  }

  return false;
}

function createMockAbsenceRequest(currentUser, payload) {
  const rawType = String(payload?.type || "").trim();
  const type = MOCK_ABSENCE_TYPE_ALIASES[rawType.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()] || rawType;
  const isDoctorHours = type === "doctor";
  const dateFrom = mockIsoDate(payload?.dateFrom);
  const dateTo = isDoctorHours ? dateFrom : (mockIsoDate(payload?.dateTo) || dateFrom);
  const halfDay = isDoctorHours ? false : Boolean(payload?.halfDay);
  const startTime = isDoctorHours ? mockTimeValue(payload?.startTime) : "";
  const endTime = isDoctorHours ? mockTimeValue(payload?.endTime) : "";
  const hours = isDoctorHours ? countMockAbsenceHours(startTime, endTime) : 0;
  const status = type === "sick" ? "recorded" : "pending_approval";

  if (!Object.hasOwn(MOCK_ABSENCE_TYPE_LABELS, type)) {
    const error = new Error("Vyberte typ nepřítomnosti.");
    error.status = 400;
    throw error;
  }

  if (!dateFrom) {
    const error = new Error("Zkontrolujte datum.");
    error.status = 400;
    throw error;
  }

  if (isDoctorHours) {
    if (!startTime || !endTime) {
      const error = new Error("U lékaře zadejte čas od a čas do.");
      error.status = 400;
      throw error;
    }

    if (!isMockHalfHourStep(startTime) || !isMockHalfHourStep(endTime)) {
      const error = new Error("Čas lékaře zadávejte po 30 minutách.");
      error.status = 400;
      throw error;
    }

    if (hours <= 0) {
      const error = new Error("Čas do musí být po času od.");
      error.status = 400;
      throw error;
    }
  } else if (countMockAbsenceDays(dateFrom, dateTo, halfDay) <= 0) {
    const error = new Error("Zkontrolujte datum.");
    error.status = 400;
    throw error;
  }

  if (!sameMockId(payload?.employeeId, currentUser?.id) && !isFullAccessRole(currentUser)) {
    const error = new Error("Můžete vytvořit jen vlastní žádost.");
    error.status = 403;
    throw error;
  }

  const employee = findMockUser(payload.employeeId) || currentUser;
  const manager = employee?.managerId ? findMockUser(employee.managerId) : null;
  const now = new Date().toISOString();
  const id = `absence-request-${randomUUID()}`;

  return {
    id,
    employeeId: employee.id,
    employeeName: employee.name || currentUser.name || "Uživatel",
    employeeEmail: employee.email || "",
    employeePhone: employee.phone || "",
    type,
    typeLabel: MOCK_ABSENCE_TYPE_LABELS[type],
    dateFrom,
    dateTo,
    halfDay,
    unit: isDoctorHours ? "hours" : "days",
    startTime,
    endTime,
    hours,
    note: String(payload?.note || "").trim(),
    status,
    statusLabel: MOCK_ABSENCE_STATUS_LABELS[status],
    daysCount: isDoctorHours ? 0 : countMockAbsenceDays(dateFrom, dateTo, halfDay),
    managerId: employee.managerId || "",
    managerName: employee.managerName || manager?.name || "",
    managerEmail: manager?.email || "",
    managerPhone: manager?.phone || "",
    approverId: "",
    approverName: "",
    approverUserId: employee.managerId || "",
    submittedAt: now,
    approvedAt: "",
    rejectedAt: "",
    rejectionReason: "",
    reminderSentAt: "",
    department: employee.department || currentUser.department || "",
    team: employee.team || employee.department || currentUser.department || "",
    createdByUserId: currentUser.id,
    createdAt: now,
    updatedAt: now,
    history: [
      {
        id: `absence-history-${randomUUID()}`,
        absenceRequestId: id,
        fromStatus: "draft",
        fromStatusLabel: "Rozpracováno",
        toStatus: status,
        toStatusLabel: MOCK_ABSENCE_STATUS_LABELS[status],
        changedByUserId: currentUser.id,
        changedByName: currentUser.name || currentUser.email || "",
        changedAt: now,
        note: String(payload?.note || "").trim()
      }
    ]
  };
}

function canApproveMockAbsence(currentUser, requestItem) {
  if (!requestItem || sameMockId(currentUser?.id, requestItem.employeeId)) {
    return false;
  }

  if (requestItem.status !== "pending_approval" && requestItem.status !== "pending") {
    return false;
  }

  if (isFullAccessRole(currentUser) || sameMockId(currentUser?.id, requestItem.managerId)) {
    return true;
  }

  const role = normalizeRole(currentUser?.role);
  if (!hasPermission(currentUser, "absence", "approve")) {
    return false;
  }

  if (role === "garazmistr" || role === "dispecer") {
    return String(currentUser?.department || "").trim().toLowerCase() === String(requestItem.department || requestItem.team || "").trim().toLowerCase();
  }

  return role === "kancelar";
}

function changeMockAbsenceStatus(currentUser, id, status, note = "") {
  const index = mockAbsenceRequests.findIndex((item) => sameMockId(item.id, id));
  if (index < 0) {
    const error = new Error("Žádost nebyla nalezena.");
    error.status = 404;
    throw error;
  }

  const existing = mockAbsenceRequests[index];
  if (!canApproveMockAbsence(currentUser, existing) && status !== "cancelled") {
    const error = new Error("Nemáte oprávnění změnit tuto žádost.");
    error.status = 403;
    throw error;
  }

  const now = new Date().toISOString();
  const updated = {
    ...existing,
    status,
    statusLabel: MOCK_ABSENCE_STATUS_LABELS[status],
    approverId: status === "approved" || status === "rejected" ? currentUser.id : existing.approverId,
    approverUserId: status === "approved" || status === "rejected" ? currentUser.id : existing.approverUserId,
    approverName: status === "approved" || status === "rejected" ? currentUser.name : existing.approverName,
    approvedAt: status === "approved" ? now : "",
    rejectedAt: status === "rejected" ? now : "",
    rejectionReason: status === "rejected" ? note : "",
    updatedAt: now,
    history: [
      {
        id: `absence-history-${randomUUID()}`,
        absenceRequestId: existing.id,
        fromStatus: existing.status,
        fromStatusLabel: existing.statusLabel,
        toStatus: status,
        toStatusLabel: MOCK_ABSENCE_STATUS_LABELS[status],
        changedByUserId: currentUser.id,
        changedByName: currentUser.name || currentUser.email || "",
        changedAt: now,
        note
      },
      ...(existing.history || [])
    ]
  };

  mockAbsenceRequests = [
    ...mockAbsenceRequests.slice(0, index),
    updated,
    ...mockAbsenceRequests.slice(index + 1)
  ];

  return updated;
}

function saveMockEmployee(currentUser, id, payload) {
  if (!canEditMockEmployee(currentUser)) {
    const error = new Error("Nemáte oprávnění upravit kartu zaměstnance.");
    error.status = 403;
    throw error;
  }

  const employee = findMockEmployee(currentUser, id);

  if (!employee) {
    const error = new Error("Zaměstnanec nebyl nalezen.");
    error.status = 404;
    throw error;
  }

  const managerId = String(payload.managerId ?? employee.managerId ?? "").trim();

  if (managerId && sameMockId(managerId, employee.id)) {
    const error = new Error("Zaměstnanec nesmí být sám sobě nadřízený.");
    error.status = 400;
    throw error;
  }

  const manager = managerId ? findMockUser(managerId) : null;

  if (managerId && (!manager || manager.active === false || String(manager.status || "active").toLowerCase() === "disabled")) {
    const error = new Error("Vybraný nadřízený není aktivní uživatel.");
    error.status = 400;
    throw error;
  }

  const entitlement = Number(payload.vacationEntitlementDays ?? employee.vacationEntitlementDays);
  const used = Number(payload.vacationUsedDays ?? employee.vacationUsedDays);
  const pending = Number(payload.vacationPendingDays ?? employee.vacationPendingDays);
  const saved = {
    ...employee,
    ...payload,
    managerId,
    managerName: managerId ? manager.name : "",
    vacationEntitlementDays: Number.isFinite(entitlement) ? entitlement : employee.vacationEntitlementDays,
    vacationUsedDays: Number.isFinite(used) ? used : employee.vacationUsedDays,
    vacationPendingDays: Number.isFinite(pending) ? pending : employee.vacationPendingDays,
    vacationRemainingDays: Number.isFinite(entitlement - used - pending)
      ? entitlement - used - pending
      : employee.vacationRemainingDays,
    updatedAt: new Date().toISOString()
  };

  mockEmployeeCards.set(employee.id, saved);
  return saved;
}

function employeeWorkHistory(employeeId) {
  return mockEmployeeWorkHistory.get(employeeId) || [];
}

function mockReceivablesLedgerReadinessPreview() {
  const invoiceLookback = receivablesVistosInvoiceLookbackWindow();
  const company = {
    entityName: "DirectoryWithBranch",
    vistoCompanyId: "C123",
    vistoBranchId: "C123",
    companyName: "Firma Alfa s.r.o.",
    branchName: "Firma Alfa s.r.o.",
    parentCompanyId: "",
    parentCompanyName: "",
    ico: "12345678",
    dic: "CZ12345678",
    billingEmail: "fakturace@firma.cz",
    email: "info@firma.cz",
    phone: "",
    standardDueDays: 14,
    billingAddress: "Ulice 1, Praha, 11000",
    deliveryAddress: "Ulice 1, Praha, 11000",
    activeStatus: "Aktivní",
    isBranch: false,
    flags: [],
    raw: {}
  };
  const invoice = {
    vistoInvoiceId: "I123",
    invoiceNumber: "2601101477",
    variableSymbol: "2601101477",
    constantSymbol: "0308",
    specificSymbol: "",
    customerId: "C123",
    customerName: "Firma Alfa s.r.o.",
    customerBranchId: "",
    customerBranchName: "",
    customerCompanyId: "C123",
    customerCompanyName: "Firma Alfa s.r.o.",
    ico: "12345678",
    dic: "CZ12345678",
    issueDate: "2026-06-01",
    dueDate: "2026-06-14",
    priceWithoutTax: 1000,
    priceWithTax: 1210,
    totalAmount: 1210,
    paidAmount: 0,
    openAmount: 1210,
    currency: "CZK",
    status: "Vystaveno",
    isPaid: false,
    raw: {}
  };
  const resolvedInvoice = {
    invoiceId: invoice.vistoInvoiceId,
    invoiceNumber: invoice.invoiceNumber,
    customerFk: "C123",
    customerBranchFk: "",
    resolvedCompanyId: "C123",
    resolvedBranchId: "C123",
    resolvedCustomerName: "Firma Alfa s.r.o.",
    resolvedIco: "12345678",
    resolvedDic: "CZ12345678",
    resolvedBillingEmail: "fakturace@firma.cz",
    resolvedStandardDueDays: 14,
    confidence: "HIGH",
    matchedBy: "customer_fk",
    warnings: [],
    flags: ["MISSING_BRANCH_FK"],
    invoice,
    company
  };
  return {
    apiStatus: "ready",
    message: "Lokální read-only mock: Firmy → Ledger preview. Ostrý ledger, rating, KB platby a komunikace zůstaly vypnuté.",
    readOnly: true,
    writesD1: false,
    createsReceivableRecords: false,
    sendsCustomerCommunication: false,
    startsAutomation: false,
    calculatesRealRating: false,
    importsKbPayments: false,
    companies: [company],
    invoices: [invoice],
    resolvedInvoices: [resolvedInvoice],
    problematicCompanies: [],
    problematicInvoices: [resolvedInvoice],
    proposedLedgerRows: {
      writesD1: false,
      receivableCustomers: [{
        visto_company_id: "C123",
        company_name: "Firma Alfa s.r.o.",
        ico: "12345678",
        dic: "CZ12345678",
        contact_email: "fakturace@firma.cz",
        preferred_channel: "email",
        automation_status: "dry_run"
      }],
      receivableInvoices: [{
        visto_invoice_id: "I123",
        invoice_number: "2601101477",
        variable_symbol: "2601101477",
        customer_external_id: "C123",
        issue_date: "2026-06-01",
        due_date: "2026-06-14",
        total_amount: 1210,
        paid_amount: 0,
        open_amount: 1210,
        currency: "CZK",
        status: "Vystaveno"
      }]
    },
    ledgerReadiness: {
      scope: "local_read_only_mock",
      ledgerImportReady: true,
      blockingReasons: [],
      recommendedNextStep: "Lokální mock prošel. Pro produkční závěr spusť přihlášené read-only preview proti živému Vistos API.",
      counts: {
        companiesLoaded: 1,
        companiesTotal: 1,
        companiesCapped: false,
        companiesWithIco: 1,
        companiesWithDic: 1,
        companiesWithBillingEmail: 1,
        companiesWithStandardDueDays: 1,
        companiesWithStableId: 1,
        invoicesLoaded: 1,
        invoicesTotal: 1,
        invoicesCapped: false,
        invoicesWithCustomerFk: 1,
        invoicesWithCustomerBranchFk: 0,
        invoicesWithDueDate: 1,
        invoicesWithVariableSymbol: 1,
        invoicesWithAmount: 1,
        invoicesWithPaidAmount: 1,
        invoicesWithRemainingAmount: 1,
        invoicesLinkedHigh: 1,
        invoicesLinkedMedium: 0,
        invoicesLinkedLow: 0,
        invoicesWithoutReliableCompany: 0
      },
      rates: {
        invoiceCustomerLinkRate: 100,
        invoiceDueDateRate: 100,
        invoiceAmountRate: 100,
        invoiceVariableSymbolRate: 100,
        customerStableIdRate: 100
      },
      confidenceCounts: {
        HIGH: 1,
        MEDIUM: 0,
        LOW: 0,
        NONE: 0
      },
      topDataQualityFlags: [{ code: "MISSING_BRANCH_FK", count: 1 }]
    },
    companyEnrichment: {
      enabled: true,
      entityName: "DirectoryWithBranch",
      attemptKey: "local_mock_enrichment",
      loadedRows: 1,
      totalRows: 1,
      capped: false,
      matchedCompanies: 1,
      pageMatchedCompanies: 1,
      metadataMatchedCompanies: 1,
      metadataLoadedRows: 1,
      detailMatchedCompanies: 0,
      companiesWithDicAfterEnrichment: 1,
      companiesWithBillingEmailAfterEnrichment: 1,
      companiesWithStandardDueDaysAfterEnrichment: 1
    },
    metadataResolver: {
      enabled: true,
      metadataProbeUsable: true,
      schemaEntitiesOk: 11,
      dbObjectsLoaded: 186,
      matchedDbObjects: 3,
      generatedCompanyAttempts: 3,
      entityName: "DirectoryWithBranch",
      attemptKey: "metadata_directory_with_branch",
      loadedRows: 1,
      totalRows: 1,
      capped: false,
      matchedCompanies: 1,
      candidateEntities: [{
        entityName: "DirectoryWithBranch",
        schemaOk: true,
        dbColumnOk: true,
        dbObjectId: "301",
        ico: ["RegNumber"],
        dic: ["VATNumber"],
        billingEmail: ["EmailInvoicing"],
        email: ["Email"],
        phone: ["PhoneNumber"],
        standardDueDays: ["InvoiceDueDays"],
        parent: ["Parent_FK"],
        blocking: []
      }],
      blockingReasons: [],
      recommendedNextStep: "Použít potvrzená metadata jen pro read-only resolver; ostrý import řešit až samostatně."
    },
    contactMetadata: {
      enabled: true,
      contactSchemaOk: true,
      contactListSchemaOk: true,
      contactListRowSchemaOk: true,
      contactListDbObjectId: "121",
      contactListRowDbObjectId: "122",
      emailCandidates: ["Email1"],
      companyLinkCandidates: ["Directory_FK"],
      canUseForCustomerCommunication: false,
      reason: "Pouze metadata. Není potvrzená ostrá vazba kontakt → zákazník/pobočka ani souhlas pro zákaznickou komunikaci."
    },
    companyDetailProbe: {
      enabled: true,
      sampledIdentifiers: [{ id: "C123", source: "company_visto_company_id" }],
      bestEntity: "DirectoryWithBranch",
      bestAttemptKey: "local_mock_detail",
      successfulRows: 1,
      usefulRows: 1,
      loadedRows: 1,
      matchedCompanies: 1
    },
    diagnostics: {
      configured: true,
      companyEntity: "DirectoryWithBranch",
      companyAttemptKey: "local_mock",
      companyColumns: ["Id", "Name", "RegNumber", "VATNumber", "BillingEmail", "InvoiceDueDays"],
      companyKeys: ["Id", "Name", "RegNumber", "VATNumber", "BillingEmail", "InvoiceDueDays"],
      companyAttempts: [],
      companyEnrichmentEntity: "DirectoryWithBranch",
      companyEnrichmentAttemptKey: "local_mock_enrichment",
      companyEnrichmentColumns: ["Id", "Name", "RegNumber", "VATNumber", "BillingEmail", "InvoiceDueDays"],
      companyEnrichmentKeys: ["Id", "Name", "RegNumber", "VATNumber", "BillingEmail", "InvoiceDueDays"],
      companyEnrichmentAttempts: [],
      metadataSchemaStatus: "ready",
      metadataSchemaEntitiesOk: 11,
      metadataCompanyEntity: "DirectoryWithBranch",
      metadataCompanyAttemptKey: "metadata_directory_with_branch",
      metadataCompanyColumns: ["Id", "Name", "RegNumber", "VATNumber", "EmailInvoicing", "InvoiceDueDays"],
      metadataCompanyKeys: ["Id", "Name", "RegNumber", "VATNumber", "EmailInvoicing", "InvoiceDueDays"],
      metadataCompanyAttempts: [],
      metadataCompanyGeneratedAttempts: [{
        key: "metadata_directory_with_branch",
        entityName: "DirectoryWithBranch",
        columns: ["Id", "Name", "RegNumber", "VATNumber", "EmailInvoicing", "InvoiceDueDays"]
      }],
      metadataBlockingReasons: [],
      companyDetailIdentifiers: [{ id: "C123", source: "company_visto_company_id" }],
      companyDetailBestEntity: "DirectoryWithBranch",
      companyDetailBestAttemptKey: "local_mock_detail",
      companyDetailKeys: ["Id", "Name", "RegNumber", "VATNumber", "EmailInvoicing", "InvoiceDueDays"],
      companyDetailAttempts: [],
      invoiceEntity: "InvoiceIssued",
      invoiceAttemptKey: "local_mock",
      invoiceColumns: ["Id", "InvoiceNumber", "BankReference2", "Customer_FK", "IssuedDate", "DueDate", "PriceWithTax", "AmountPaid", "RemainToPay"],
      invoiceFilter: invoiceLookback.filter,
      invoiceLookback,
      invoiceKeys: ["Id", "InvoiceNumber", "BankReference2", "Customer_FK", "IssuedDate", "DueDate", "PriceWithTax", "AmountPaid", "RemainToPay"],
      invoiceAttempts: []
    },
    loadedAt: new Date().toISOString()
  };
}

function mockReceivablesVistosInvoiceSnapshot() {
  const preview = mockReceivablesLedgerReadinessPreview();
  const invoiceLookback = receivablesVistosInvoiceLookbackWindow();
  const rows = preview.invoices.map((invoice, index) => ({
    id: `mock-vistos-invoice-row-${index + 1}`,
    batchId: "mock-vistos-invoice-snapshot",
    rowNumber: index + 1,
    entityKind: "vistos_invoice",
    previewStatus: "ready",
    confidence: 0.95,
    issueCode: "",
    issueMessage: "",
    invoice,
    rawPayload: invoice.raw || {},
    createdAt: new Date().toISOString()
  }));
  return {
    snapshot: {
      batch: {
        id: "mock-vistos-invoice-snapshot",
        source: "vistos",
        importKind: "vistos_invoice_snapshot",
        status: "snapshot",
        filename: "vistos-invoices-24m",
        rowCount: rows.length,
        acceptedCount: rows.length,
        reviewCount: 0,
        ignoredCount: 0,
        createdByUserId: "dev-user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parserSummary: {},
        rawPayload: {}
      },
      summary: {
        mode: "vistos-invoice-snapshot",
        source: "vistos",
        sourceMode: "local_mock",
        invoiceEntity: "InvoiceIssued",
        invoiceLookback,
        loadedRows: rows.length,
        totalRows: rows.length,
        acceptedCount: rows.length,
        reviewCount: 0,
        ignoredCount: 0,
        issueCounts: [],
        capped: false,
        readOnly: true,
        writesD1: true,
        writesLedger: false,
        createsReceivableRecords: false,
        sendsCustomerCommunication: false,
        startsAutomation: false,
        calculatesRealRating: false,
        importsKbPayments: false,
        recommendedNextStep: "Lokální mock snapshotu je načtený. Produkce použije živý Vistos read-only endpoint."
      }
    },
    rows,
    pagination: {
      page: 1,
      pageSize: 100,
      totalRows: rows.length
    },
    apiStatus: "ready"
  };
}

function mockReceivablesVistosLedgerMapping() {
  const snapshot = mockReceivablesVistosInvoiceSnapshot();
  const rows = snapshot.rows.map((row) => ({
    invoice: row.invoice,
    previewStatus: row.previewStatus,
    issueCode: row.issueCode,
    issueMessage: row.issueMessage
  }));
  const result = buildReceivablesVistosLedgerMapping(rows, { limit: 80, today: "2026-07-07" });
  const firstCandidate = result.mapping?.candidates?.[0] || null;
  const customerMetadata = {
    sourceEntity: "DirectoryWithBranch",
    sourceAttemptKey: "local_mock",
    vistoCustomerId: firstCandidate?.customerCompanyId || firstCandidate?.customerKeyValue || "C123",
    companyName: firstCandidate?.customerName || "Firma Alfa s.r.o.",
    ico: firstCandidate?.ico || "12345678",
    dic: firstCandidate?.dic || "CZ12345678",
    billingEmail: "fakturace@example.test",
    email: "info@example.test",
    phone: "",
    standardDueDays: 14,
    parentCompanyId: "",
    parentCompanyName: "",
    street: "",
    city: "",
    zip: "",
    rawKeys: ["Id", "Name", "RegNumber", "VATNumber", "EmailInvoicing", "InvoiceDueDays"]
  };
  result.mapping.customerEnrichment = {
    enabled: true,
    apiStatus: "ready",
    readOnly: true,
    writesD1: false,
    processedCandidates: firstCandidate ? 1 : 0,
    targetCandidates: firstCandidate ? 1 : 0,
    source: "local_mock_targeted_customer_lookup",
    summary: {
      enriched: firstCandidate ? 1 : 0,
      partialMetadata: 0,
      missingMetadata: 0,
      metadataConflict: 0
    },
    results: firstCandidate
      ? [{
        customerKey: firstCandidate.customerKey,
        customerName: firstCandidate.customerName,
        customerKeyType: firstCandidate.customerKeyType,
        customerKeyValue: firstCandidate.customerKeyValue,
        status: "enriched",
        metadata: customerMetadata,
        issues: []
      }]
      : [],
    diagnostics: []
  };
  result.mapping.candidates = (result.mapping.candidates || []).map((candidate, index) => (index === 0
    ? {
      ...candidate,
      customerMetadataStatus: "enriched",
      customerMetadata,
      customerMetadataIssues: []
    }
    : {
      ...candidate,
      customerMetadataStatus: "not_checked",
      customerMetadata: null,
      customerMetadataIssues: []
    }));
  return {
    ...result,
    snapshot: {
      batchId: snapshot.snapshot.batch.id,
      status: snapshot.snapshot.batch.status,
      rowCount: snapshot.snapshot.batch.rowCount,
      createdAt: snapshot.snapshot.batch.createdAt,
      updatedAt: snapshot.snapshot.batch.updatedAt
    },
    mode: "local_mock"
  };
}

function mockReceivablesVistosSchemaProbePreview() {
  const targetEntities = [
    "DirectoryWithBranch",
    "Directory",
    "ContactList",
    "ContactListRow",
    "Contact",
    "Customer",
    "CustomerBranch",
    "Company",
    "CompanyBranch",
    "Partner",
    "AddressBook"
  ];
  const entitySummaries = targetEntities.map((entityName) => {
    const baseFields = [
      { name: "Id", caption: "ID" },
      { name: "Name", caption: "Název" }
    ];
    const companyFields = [
      { name: "RegNumber", caption: "IČO" },
      { name: "VATNumber", caption: "DIČ" },
      { name: "EmailInvoicing", caption: "Fakturační e-mail" },
      { name: "PhoneNumber", caption: "Telefon" },
      { name: "InvoiceDueDays", caption: "Splatnost" }
    ];
    const contactFields = [
      { name: "Directory_FK", caption: "Firma" },
      { name: "Email1", caption: "E-mail" },
      { name: "SendMailEnabled", caption: "Povolit e-mail" }
    ];
    const fields = entityName.includes("Contact") ? [...baseFields, ...contactFields] : [...baseFields, ...companyFields];
    return {
      entityName,
      schemaOk: true,
      dbColumnOk: !["Contact"].includes(entityName),
      dbObjectId: entityName === "Directory" ? "49" : entityName === "ContactList" ? "201" : entityName === "ContactListRow" ? "202" : "",
      readAllowed: !["ContactList", "ContactListRow"].includes(entityName),
      schemaColumnCount: fields.length,
      dbColumnCount: fields.length,
      mergedColumnCount: fields.length,
      fields,
      candidates: {
        stableId: ["Id"],
        companyName: ["Name"],
        branchName: entityName === "DirectoryWithBranch" ? ["Name"] : [],
        ico: fields.some((field) => field.name === "RegNumber") ? ["RegNumber"] : [],
        dic: fields.some((field) => field.name === "VATNumber") ? ["VATNumber"] : [],
        billingEmail: fields.some((field) => field.name === "EmailInvoicing") ? ["EmailInvoicing"] : [],
        email: fields.some((field) => field.name === "Email1") ? ["Email1"] : [],
        phone: fields.some((field) => field.name === "PhoneNumber") ? ["PhoneNumber"] : [],
        standardDueDays: fields.some((field) => field.name === "InvoiceDueDays") ? ["InvoiceDueDays"] : [],
        parent: entityName === "ContactListRow" ? ["Directory_FK"] : []
      },
      blocking: entityName === "Contact" ? ["DB_OBJECT_NOT_FOUND"] : []
    };
  });

  return {
    apiStatus: "ready",
    message: "Lokální read-only mock: Vistos schema/metadata probe. Nic se neukládá, neposílá ani nepočítá jako ostrý rating.",
    readOnly: true,
    writesD1: false,
    createsReceivableRecords: false,
    sendsCustomerCommunication: false,
    startsAutomation: false,
    calculatesRealRating: false,
    importsKbPayments: false,
    createsLegalPackages: false,
    targetEntities,
    schemaEntityAttempts: entitySummaries.map((item) => ({
      entityName: item.entityName,
      method: "GetSchemaEntity",
      ok: true,
      readAllowed: item.readAllowed,
      columnCount: item.schemaColumnCount,
      entityListTitle: `${item.entityName} - List`,
      columns: item.fields
    })),
    dbObjectProbe: {
      ok: true,
      key: "local_mock",
      rowsLoaded: 4,
      totalRows: 4,
      capped: false,
      matchedObjects: targetEntities.map((entityName) => ({
        entityName,
        found: entityName !== "Contact",
        dbObjectId: entityName === "Directory" ? "49" : entityName === "ContactList" ? "201" : entityName === "ContactListRow" ? "202" : "",
        name: entityName,
        caption: entityName
      })),
      diagnostics: [{ key: "local_mock", ok: true, rows: 4, total: 4, capped: false }]
    },
    dbColumnProbe: {
      columnsByEntity: entitySummaries.map((item) => ({
        entityName: item.entityName,
        dbObjectId: item.dbObjectId,
        ok: item.dbColumnOk,
        skipped: !item.dbObjectId,
        reason: item.dbColumnOk ? "" : "DB_OBJECT_NOT_FOUND",
        key: "local_mock",
        filterField: "DbObject_FK",
        returnedRows: item.dbColumnCount,
        totalRows: item.dbColumnCount,
        capped: false,
        columns: item.fields,
        diagnostics: [{ key: "local_mock", ok: item.dbColumnOk }]
      }))
    },
    entitySummaries,
    summary: {
      dbObjectsLoaded: 4,
      matchedObjects: 10,
      entitiesWithSchema: targetEntities.length,
      entitiesWithDbColumns: 10,
      entitiesWithBillingEmailCandidate: 7,
      entitiesWithPhoneCandidate: 7,
      entitiesWithDueDaysCandidate: 7,
      entitiesWithIcoCandidate: 7,
      entitiesWithDicCandidate: 7
    },
    readiness: {
      metadataProbeUsable: true,
      blockingReasons: [],
      recommendedNextStep: "Lokální mock prošel. Pro produkční závěr spusť přihlášený read-only schema probe proti živému Vistos API."
    },
    previewLimits: {
      pageSize: 500,
      maxPages: 2,
      maxColumnsPerEntity: 80
    },
    loadedAt: new Date().toISOString()
  };
}

async function handleApi(request, response) {
  const url = new URL(request.url || "/", "http://localhost");

  if (!url.pathname.startsWith("/api/")) {
    return false;
  }

  if (url.pathname === "/api/auth/start" && request.method === "POST") {
    const { identifier } = await readJsonBody(request);
    const normalized = normalizeIdentifier(identifier);
    const user = mockUsers.find((item) => {
      return normalizeIdentifier(item.email) === normalized || normalizeIdentifier(item.phone) === normalized;
    });

    if (user?.status === "active") {
      console.log(`Mock OTP pro ${user.email}: 123456`);
    }

    sendJson(response, 200, { ok: true, mock: true });
    return true;
  }

  if (url.pathname === "/api/auth/verify" && request.method === "POST") {
    const { identifier, code } = await readJsonBody(request);
    const normalized = normalizeIdentifier(identifier);
    const user = mockUsers.find((item) => {
      return normalizeIdentifier(item.email) === normalized || normalizeIdentifier(item.phone) === normalized;
    });

    if (!user || user.status !== "active" || String(code || "").trim() !== "123456") {
      sendJson(response, 401, { error: "Přihlášení se nepodařilo." });
      return true;
    }

    const token = randomUUID();
    devSessions.set(token, {
      userId: user.id,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000
    });
    sendJson(
      response,
      200,
      {
        ok: true,
        user: publicUser({ ...user, lastLoginAt: new Date().toISOString() })
      },
      {
        "Set-Cookie": `${devCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`
      }
    );
    return true;
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = cookieValue(request, devCookieName);
    if (token) {
      devSessions.delete(token);
    }
    sendJson(response, 200, { ok: true }, {
      "Set-Cookie": `${devCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    });
    return true;
  }

  if (url.pathname === "/api/me" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    sendJson(response, 200, { user: publicUser(user) });
    return true;
  }

  if (url.pathname === "/api/ai/user/me" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    sendJson(response, 200, {
      user: publicUser(user),
      permissions: [...modules, { id: "feedback" }].map((moduleItem) => ({
        moduleId: moduleItem.id,
        actions: ["view", "create", "edit", "delete", "approve", "export", "manage"]
          .filter((action) => hasPermission(user, moduleItem.id, action))
      })),
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname.startsWith("/api/receivables/vistos/") && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "receivables", "manage")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const preview = mockReceivablesLedgerReadinessPreview();
    if (url.pathname === "/api/receivables/vistos/invoice-snapshot") {
      sendJson(response, 200, { ...mockReceivablesVistosInvoiceSnapshot(), mode: "local_mock" });
      return true;
    }
    if (url.pathname === "/api/receivables/vistos/ledger-mapping") {
      sendJson(response, 200, mockReceivablesVistosLedgerMapping());
      return true;
    }
    if (url.pathname === "/api/receivables/vistos/schema-probe") {
      sendJson(response, 200, { preview: mockReceivablesVistosSchemaProbePreview(), apiStatus: "ready" });
      return true;
    }
    if (url.pathname === "/api/receivables/vistos/companies-preview") {
      sendJson(response, 200, {
        apiStatus: "ready",
        preview: {
          apiStatus: "ready",
          message: preview.message,
          readOnly: true,
          writesD1: false,
          companies: preview.companies,
          problematicCompanies: preview.problematicCompanies,
          ledgerReadiness: preview.ledgerReadiness,
          diagnostics: preview.diagnostics
        }
      });
      return true;
    }
    if (url.pathname === "/api/receivables/vistos/invoices-preview") {
      sendJson(response, 200, {
        apiStatus: "ready",
        preview: {
          apiStatus: "ready",
          message: preview.message,
          readOnly: true,
          writesD1: false,
          invoices: preview.invoices,
          problematicInvoices: preview.problematicInvoices,
          ledgerReadiness: preview.ledgerReadiness,
          diagnostics: preview.diagnostics
        }
      });
      return true;
    }
    if (url.pathname === "/api/receivables/vistos/customer-invoice-preview") {
      sendJson(response, 200, {
        apiStatus: "ready",
        preview: {
          apiStatus: "ready",
          message: preview.message,
          readOnly: true,
          writesD1: false,
          resolvedInvoices: preview.resolvedInvoices,
          problematicInvoices: preview.problematicInvoices,
          proposedLedgerRows: preview.proposedLedgerRows,
          ledgerReadiness: preview.ledgerReadiness,
          diagnostics: preview.diagnostics
        }
      });
      return true;
    }
    if (url.pathname === "/api/receivables/vistos/ledger-readiness") {
      sendJson(response, 200, { preview, apiStatus: "ready" });
      return true;
    }
  }

  if (url.pathname === "/api/ai/driver-reports/context" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, {
        ok: false,
        module: "hlaseni-ridicu",
        errorCode: "UNAUTHENTICATED",
        message: "Nejsi přihlášený.",
        fallbackQuestion: "Vozidlo se mi teď nepodařilo ověřit. Otevřu ti výběr v aplikaci.",
        apiStatus: "ready"
      });
      return true;
    }

    const permissions = {
      canViewDriverReports: hasPermission(user, "driver-reports", "view"),
      canCreateDriverReport: mockDriverCanCreate(user),
      canViewFleet: hasPermission(user, "fleet", "view")
    };

    if (!permissions.canViewDriverReports || !permissions.canCreateDriverReport || !permissions.canViewFleet) {
      sendJson(response, 403, {
        ok: false,
        module: "hlaseni-ridicu",
        errorCode: "FORBIDDEN",
        message: "K tomu nemáš oprávnění.",
        permissions,
        fallbackQuestion: "Vozidlo se mi teď nepodařilo ověřit. Otevřu ti výběr v aplikaci.",
        apiStatus: "ready"
      });
      return true;
    }

    const rawVehicles = (await mockFleetVehiclesForUser(user)).map(mockDriverReportContextVehicle);
    const vehicles = rawVehicles;
    const fallbackQuestion = rawVehicles.length
      ? "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla."
      : "Nevidím bezpečně přiřazené vozidlo. Nadiktuj mi prosím SPZ.";
    const vehicleOptions = rawVehicles.map((vehicle) => `${vehicle.displayName} SPZ ${vehicle.spz}`);
    const message = rawVehicles.length
      ? (vehicleOptions.length === 1
        ? `Mám bezpečně ověřené tvoje vozidlo ${vehicleOptions[0]}. Týká se závada tohohle vozidla?`
        : `Vidím u tebe ${vehicleOptions.slice(0, -1).join(", ")} a ${vehicleOptions[vehicleOptions.length - 1]}. Kterého se závada týká?`)
      : fallbackQuestion;

    sendJson(response, 200, {
      ok: true,
      module: "hlaseni-ridicu",
      currentModule: url.searchParams.get("currentModule") || "hlaseni-ridicu",
      sessionId: url.searchParams.get("sessionId") || url.searchParams.get("conversationId") || "",
      status: rawVehicles.length > 1 ? "multiple" : rawVehicles.length === 1 ? "single" : "none",
      user: {
        id: user.id,
        name: user.name,
        employeeId: user.id
      },
      driver: {
        employeeId: user.id,
        displayName: user.name,
        source: "local_mock"
      },
      vehiclesVerified: rawVehicles.length > 0,
      vehiclePickerAvailable: rawVehicles.length > 0,
      vehicleLookupMode: rawVehicles.length ? "verified_vehicle_list" : "picker_or_manual",
      vehicles,
      vehiclesCount: vehicles.length,
      permissions,
      fallbackQuestion,
      message,
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/voice/sarlota" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "dashboard", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění používat Šarlotu." });
      return true;
    }

    const payload = await readJsonBody(request);
    const intent = String(payload.intent || payload.context?.requestedIntent || "").trim();
    if (intent !== "driver_part_request") {
      sendJson(response, 200, {
        ok: false,
        status: "unsupported",
        intent: intent || "unsupported",
        reply: "Lokální mock Šarloty podporuje pro tenhle test jen Hlášení řidičů.",
        text: "Lokální mock Šarloty podporuje pro tenhle test jen Hlášení řidičů.",
        verified: true,
        preparedActions: []
      });
      return true;
    }

    if (!mockDriverCanCreate(user) && !mockDriverCanManage(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění vytvořit hlášení řidiče." });
      return true;
    }

    const parameters = payload.parameters && typeof payload.parameters === "object" ? payload.parameters : {};
    const defectDescription = mockDriverClean(parameters.defectDescription || parameters.description || payload.text || payload.transcript);
    const vehicleId = mockDriverClean(parameters.vehicleId || parameters.vehicle_id);
    const spzValidated = parameters.spzValidated === true || parameters.spz_validated === true;
    const manualSpz = normalizeLicensePlate(parameters.spzManual || parameters.manualSpz);
    const assignedVehicle = vehicleId
      ? mockFleetVehicleForUser(user, { vehicleId })
      : null;
    const licensePlate = normalizeLicensePlate(
      manualSpz ||
      (spzValidated ? (parameters.licensePlate || parameters.spz) : "") ||
      assignedVehicle?.licensePlate ||
      assignedVehicle?.tcarsLicensePlate ||
      extractLicensePlate(defectDescription)
    );
    const missingQuestion = driverPartRequestMissingQuestion({
      description: defectDescription,
      licensePlate
    });

    if (missingQuestion) {
      sendJson(response, 200, {
        ok: false,
        status: "needs_input",
        intent: "driver_part_request",
        reply: missingQuestion,
        text: missingQuestion,
        verified: true,
        preparedActions: [],
        notificationsSent: false,
        apiStatus: "ready"
      });
      return true;
    }

    const plateValidation = await mockValidateDriverReportLicensePlate(licensePlate);
    if (!plateValidation.validFormat || !plateValidation.exact) {
      const reply = plateValidation.validFormat
        ? "Tuhle SPZ v evidenci vozidel nevidím. Zkontroluj ji prosím."
        : "SPZ nemá platný formát. Řekni mi ji prosím ještě jednou, nebo ji napiš ručně.";
      sendJson(response, 200, {
        ok: false,
        status: "needs_input",
        intent: "driver_part_request",
        reply,
        text: reply,
        verified: true,
        preparedActions: [],
        notificationsSent: false,
        candidates: plateValidation.suggestions,
        apiStatus: "ready"
      });
      return true;
    }

    const resolvedVehicle = plateValidation.vehicle || assignedVehicle;
    const driverNote = parameters.driverNote || parameters.driver_note || parameters.note || "";
    const driverNoteStatus = mockDriverClean(parameters.driverNoteStatus || parameters.driver_note_status || parameters.noteStatus || parameters.note_status)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/-/g, "_");
    const driverNoteQuestionAsked = mockDriverTruthyFlag(
      parameters.driverNoteQuestionAsked ||
      parameters.driver_note_question_asked ||
      parameters.noteQuestionAsked ||
      parameters.note_question_asked
    );
    const driverNoteHandled = Boolean(mockDriverClean(driverNote)) ||
      ["provided", "declined", "none", "no_note", "bez_poznamky", "empty", "skipped"].includes(driverNoteStatus);
    if (!driverNoteHandled) {
      const reply = "Doplníte k tomu ještě poznámku? Například kdy se problém projevuje, odkud jde zvuk, nebo jestli auto normálně jede. Pokud nic doplnit nechceš, řekni: bez poznámky.";
      sendJson(response, 200, {
        ok: false,
        status: "needs_input",
        code: "driver_part_driver_note_required",
        intent: "driver_part_request",
        reply,
        text: reply,
        verified: true,
        preparedActions: [],
        notificationsSent: false,
        apiStatus: "ready"
      });
      return true;
    }
    const confirmed = parameters.confirmed === true || parameters.writeConfirmed === true;
    const partMatch = identifyProbablePartFromDescription(defectDescription);
    if (!confirmed) {
      const reply = `Rozumím. Chceš vytvořit servisní hlášení na vybraném vozidle: ${defectDescription}. Po uložení se díly, ceny a případná zpráva Patrikovi vyřeší na pozadí. Mám hlášení uložit?`;
      sendJson(response, 200, {
        ok: false,
        status: "needs_confirmation",
        intent: "driver_part_request",
        reply,
        text: reply,
        verified: true,
        preparedActions: [
          {
            type: "driver_part_request",
            action: "create_service_report",
            requiresConfirmation: true,
            notificationsSent: false,
            parameters: {
              defectDescription,
              driverNote,
              driverNoteStatus,
              driverNoteQuestionAsked,
              licensePlate,
              vehicleId: resolvedVehicle?.id || "",
              vehicleName: resolvedVehicle?.internalNumber || resolvedVehicle?.model || "",
              vin: resolvedVehicle?.vin || "",
              vehicleBrand: resolvedVehicle?.brand || ""
            }
          }
        ],
        notificationsSent: false,
        apiStatus: "ready"
      });
      return true;
    }

    try {
      let item = await createMockDriverPartRequest(user, {
        ...parameters,
        defectDescription,
        driverNote,
        driverNoteStatus,
        driverNoteQuestionAsked,
        licensePlate,
        vehicleId: parameters.vehicleId || resolvedVehicle?.id,
        vehicleName: parameters.vehicleName || resolvedVehicle?.internalNumber || resolvedVehicle?.model,
        vin: parameters.vin || resolvedVehicle?.vin,
        vehicleBrand: parameters.vehicleBrand || resolvedVehicle?.brand,
        damagePhotoStatus: "requested",
        source: "voice"
      });
      const urgent = item.priority === "urgentní" || item.backgroundAction === "urgent_alert";
      if (urgent) {
        item = {
          ...item,
          status: "ready_for_patrik",
          patrikEmailStatus: "queued_mock",
          updatedAt: new Date().toISOString()
        };
        mockDriverPartRequests = mockDriverPartRequests.map((current) => current.id === item.id ? item : current);
      }
      const reply = urgent
        ? "Hlášení jsem vytvořila a předávám ho Patrikovi jako urgentní. Nic jsem neobjednala."
        : "Hlášení jsem vytvořila a předávám ho na servisní kontrolu. Díly a ceny poběží až potom na pozadí.";
      sendJson(response, 200, {
        ok: true,
        status: "created_notification_pending",
        intent: "driver_part_request",
        reply,
        text: reply,
        verified: true,
        preparedActions: [],
        driverPartRequest: {
          id: item.id,
          reportId: item.reportId,
          status: item.status,
          licensePlate: item.licensePlate,
          vin: item.vin,
          probablePart: item.probablePart,
          category: item.category,
          serviceType: item.serviceType,
          priority: item.priority
        },
        notificationsSent: false,
        priceSearchPending: true,
        apiStatus: "ready"
      });
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.message || "Hlášení se nepodařilo zapsat.",
        status: "failed",
        intent: "driver_part_request",
        verified: false,
        notificationsSent: false,
        apiStatus: "ready"
      });
    }
    return true;
  }

  if (url.pathname === "/api/driver-reports/license-plate" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!mockDriverCanCreate(user) && !mockDriverCanManage(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění vytvořit hlášení řidiče." });
      return true;
    }

    const result = await mockValidateDriverReportLicensePlate(
      url.searchParams.get("value") || url.searchParams.get("spz") || ""
    );
    sendJson(response, 200, {
      ...result,
      valid: result.validFormat && result.exact,
      status: result.exact ? "found" : result.validFormat ? "not_found" : result.formatReason,
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/driver-reports" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "driver-reports", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const search = mockDriverClean(url.searchParams.get("search")).toLowerCase();
    const status = mockDriverClean(url.searchParams.get("status"));
    let requests = mockDriverVisibleRequests(user);
    if (status) {
      requests = requests.filter((item) => item.status === status);
    }
    if (search) {
      requests = requests.filter((item) => [
        item.reportId,
        item.driverName,
        item.licensePlate,
        item.defectDescription,
        item.probablePart,
        item.verifiedPart
      ].map(mockDriverClean).join(" ").toLowerCase().includes(search));
    }

    sendJson(response, 200, {
      requests,
      permissions: mockDriverPermissionSummary(user),
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/driver-reports" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!mockDriverCanCreate(user) && !mockDriverCanManage(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění vytvořit hlášení řidiče." });
      return true;
    }

    try {
      const payload = await readJsonBody(request);
      const item = await createMockDriverPartRequest(user, payload);
      let warning = "";
      if (payload.handoffAfterCreate) {
        warning = "Hlášení je vytvořené. Následné ověření dílů, cen nebo urgentní zpráva běží mimo hlasový zápis.";
      }
      sendJson(response, 201, {
        request: mockDriverDetail(item, user),
        permissions: mockDriverPermissionSummary(user),
        warning,
        apiStatus: "ready"
      });
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.message || "Hlášení se nepodařilo uložit.",
        apiStatus: "ready"
      });
    }
    return true;
  }

  if (url.pathname === "/api/driver-reports/partslink24/search-by-vin" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno.", apiStatus: "ready" });
      return true;
    }
    if (!hasPermission(user, "driver-reports", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění.", apiStatus: "ready" });
      return true;
    }

    try {
      const payload = await readJsonBody(request);
      const item = findMockDriverRequest(payload.requestId || payload.request_id || payload.id);
      if (!item) {
        sendJson(response, 404, { error: "Požadavek na náhradní díl nebyl nalezen.", apiStatus: "ready" });
        return true;
      }
      if (!mockDriverCanManage(user) && !sameMockId(item.driverUserId, user.id)) {
        sendJson(response, 403, { error: "K tomuto hlášení nemáte oprávnění.", apiStatus: "ready" });
        return true;
      }

      const result = mockCreatePartslink24Search(user, item);
      sendJson(response, 200, {
        ok: true,
        status: result.audit.status,
        message: result.reusedRecent
          ? "Stejný partslink24 pilotní požadavek už byl před chvílí připravený. Nepřipravuji duplicitní běh."
          : result.audit.message,
        audit: result.audit,
        eligibility: result.eligibility,
        workflow: result.workflow,
        permissions: mockDriverPermissionSummary(user),
        apiStatus: "ready"
      });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        error: error.message || "Vyhledání přes partslink24 se nepodařilo připravit.",
        message: error.message || "Vyhledání přes partslink24 se nepodařilo připravit.",
        details: error.details || null,
        apiStatus: "ready"
      });
    }
    return true;
  }

  const driverReportDetailMatch = /^\/api\/driver-reports\/([^/]+)$/.exec(url.pathname);
  if (driverReportDetailMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    const item = findMockDriverRequest(decodeURIComponent(driverReportDetailMatch[1]));
    if (!item) {
      sendJson(response, 404, { error: "Požadavek na náhradní díl nebyl nalezen.", apiStatus: "ready" });
      return true;
    }
    if (!mockDriverCanManage(user) && !sameMockId(item.driverUserId, user.id)) {
      sendJson(response, 403, { error: "K tomuto hlášení nemáte oprávnění.", apiStatus: "ready" });
      return true;
    }
    sendJson(response, 200, {
      request: mockDriverDetail(item, user),
      permissions: mockDriverPermissionSummary(user),
      apiStatus: "ready"
    });
    return true;
  }

  const driverReportActionMatch = /^\/api\/driver-reports\/([^/]+)\/(handoff-patrik|ordered|part-arrived|schedule-service|complete|cancel|verify-mercedes-part|manual-part|price-boost)$/.exec(url.pathname);
  if (driverReportActionMatch && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    try {
      const id = decodeURIComponent(driverReportActionMatch[1]);
      const action = driverReportActionMatch[2];
      const payload = await readJsonBody(request);
      const item = action === "handoff-patrik"
        ? await handoffMockDriverPartRequest(user, id)
        : action === "ordered"
          ? markMockDriverPartOrdered(user, id, payload)
          : action === "part-arrived"
            ? markMockDriverPartArrived(user, id, payload)
            : action === "schedule-service"
              ? scheduleMockDriverPartService(user, id, payload)
              : action === "verify-mercedes-part"
                ? await verifyMockMercedesDriverPartRequest(user, id)
                : action === "manual-part"
                  ? updateMockDriverPartManualVerification(user, id, payload)
                  : action === "price-boost"
                    ? await runMockDriverPartPriceBoost(user, id)
                  : action === "complete"
                    ? closeMockDriverPartRequest(user, id, payload)
                    : closeMockDriverPartRequest(user, id, { ...payload, cancel: true });
      sendJson(response, 200, {
        request: mockDriverDetail(item, user),
        permissions: mockDriverPermissionSummary(user),
        apiStatus: "ready"
      });
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.message || "Akce se nepodařila uložit.",
        apiStatus: "ready"
      });
    }
    return true;
  }

  if (url.pathname === "/api/fleet/vistos-import/preview" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    if (!hasPermission(user, "fleet", "edit")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    try {
      const { files } = await readMultipartFormData(request);
      const file = files.get("file");

      if (!file?.buffer?.length) {
        sendJson(response, 400, { error: "Vyberte soubor exportu z Vistos." });
        return true;
      }

      if (file.buffer.length > FLEET_VISTOS_IMPORT_MAX_FILE_SIZE_BYTES) {
        sendJson(response, 400, { error: "Soubor je příliš velký. Maximum je 10 MB." });
        return true;
      }

      const preview = await buildFleetVistosImportPreview({
        buffer: file.buffer,
        filename: file.name,
        contentType: file.type
      });

      sendJson(response, 200, { preview, apiStatus: "ready" });
    } catch (error) {
      sendJson(response, 400, {
        error: error.message || "Náhled importu se nepodařilo zpracovat.",
        apiStatus: "waiting"
      });
    }
    return true;
  }

  if (url.pathname === "/api/collection-routes/import-preview" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    if (normalizeRole(user.role) !== "admin") {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    if ((request.headers["content-type"] || "").includes("multipart/form-data")) {
      try {
        const { files } = await readMultipartFormData(request);
        const file = files.get("file");
        if (!file) {
          sendJson(response, 400, { error: "Nahrajte soubor .json nebo .csv.", apiStatus: "ready" });
          return true;
        }
        if (file.buffer.length > COLLECTION_ROUTES_MANUAL_IMPORT_MAX_FILE_SIZE_BYTES) {
          sendJson(response, 400, { error: "Soubor je příliš velký. Maximum je 1 MB.", apiStatus: "ready" });
          return true;
        }
        const preview = createMockCollectionRoutesManualImportPreview(user, file);
        sendJson(response, 200, { preview, apiStatus: "ready" });
      } catch (error) {
        sendJson(response, error.status || 400, {
          error: error.message || "Ruční import preview se nepodařilo zpracovat.",
          apiStatus: "ready"
        });
      }
      return true;
    }

    const now = new Date().toISOString();
    const batch = {
      id: `collection-import-batch-${randomUUID()}`,
      source: "vistos",
      sourceMode: "api-discovery",
      status: "waiting_configuration",
      apiStatus: "not_configured",
      message: "Vistos API není nakonfigurováno",
      rowCount: 0,
      issueCount: 1,
      createdByUserId: user.id,
      createdAt: now,
      finishedAt: now,
      metadata: {
        phase: "1D",
        mode: "vistos-api-discovery",
        source: "vistos-api-discovery",
        vistosConfigured: false,
        createsOperationalRoutes: false,
        sendsEmailOrSms: false,
        startsAutomation: false
      }
    };
    const issue = {
      id: `collection-data-issue-${randomUUID()}`,
      batchId: batch.id,
      siteId: "",
      issueType: "vistos-api",
      severity: "warning",
      message: "Vistos API není nakonfigurováno",
      status: "open",
      createdAt: now,
      resolvedAt: ""
    };
    mockCollectionRouteBatches.unshift(batch);
    mockCollectionRouteIssues.unshift(issue);
    sendJson(response, 200, {
      preview: {
        batch,
        summary: {
          status: batch.status,
          message: batch.message,
          rowCount: 0,
          issueCount: 1,
          createsOperationalRoutes: false,
          sendsEmailOrSms: false,
          startsAutomation: false
        },
        apiStatus: "not_configured"
      },
      apiStatus: "not_configured"
    });
    return true;
  }

  if (url.pathname === "/api/collection-routes/route-optimization-preview" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    if (normalizeRole(user.role) !== "admin") {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    try {
      const { files } = await readMultipartFormData(request);
      const uploadFiles = Array.from(files.values())
        .filter((file) => file?.buffer?.length)
        .map((file) => {
          if (file.buffer.length > COLLECTION_ROUTE_OPTIMIZATION_MAX_FILE_SIZE_BYTES) {
            const error = new Error(`Soubor ${file.name || ""} je příliš velký. Maximum je 8 MB.`);
            error.status = 400;
            throw error;
          }
          return {
            buffer: file.buffer,
            filename: file.name,
            contentType: file.type
          };
        });

      if (!uploadFiles.length) {
        sendJson(response, 400, { error: "Nahrajte alespoň jeden Excel/CSV soubor tras." });
        return true;
      }

      const preview = await buildCollectionRouteOptimizationPreview({ files: uploadFiles });
      sendJson(response, 200, { preview, apiStatus: "ready" });
    } catch (error) {
      sendJson(response, error.status || 400, {
        error: error.message || "Náhled optimalizace tras se nepodařilo připravit.",
        apiStatus: "waiting"
      });
    }
    return true;
  }

  if (url.pathname === "/api/collection-routes/svozove-trasy/import" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    if (normalizeRole(user.role) !== "admin") {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    try {
      const { files } = await readMultipartFormData(request);
      const uploadFiles = Array.from(files.values())
        .filter((file) => file?.buffer?.length)
        .map((file) => {
          if (file.buffer.length > COLLECTION_ROUTE_OPTIMIZATION_MAX_FILE_SIZE_BYTES) {
            const error = new Error(`Soubor ${file.name || ""} je příliš velký. Maximum je 8 MB.`);
            error.status = 400;
            throw error;
          }
          return {
            buffer: file.buffer,
            filename: file.name,
            contentType: file.type
          };
        });

      if (!uploadFiles.length) {
        sendJson(response, 400, { error: "Nahrajte 13 Excel souborů svozových tras." });
        return true;
      }

      const parsed = await buildCollectionRouteOptimizationPreview({ files: uploadFiles });
      const batchId = `collection-route-source-batch-${randomUUID()}`;
      const createdAt = new Date().toISOString();
      const fileIds = new Map();
      const sourceFiles = (parsed.parsedFiles || []).map((file) => {
        const item = {
          id: `collection-route-source-file-${randomUUID()}`,
          batchId,
          filename: file.filename,
          dayCode: routeSourceDay(file.filename),
          weekMode: routeSourceWeek(file.filename),
          vehicleCode: normalizeRouteSourceText(file.filename).includes("FLORIAN") ? "C" : "",
          sheetCount: file.sheetCount || 0,
          sourceRowCount: file.sourceRowCount || 0,
          routeRowCount: file.plannedRowCount || 0,
          metadata: { sheets: file.sheets || [], source: "13-excel", createsOperationalRoutes: false },
          createdAt
        };
        fileIds.set(file.filename, item.id);
        return item;
      });
      const seen = new Set();
      const sourceRows = [];
      const previousStopByScope = new Map();
      for (const row of parsed.rows || []) {
        const key = [row.sourceFile, row.sheetName, row.sourceRowNumber, row.originalText].join("\u0001");
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const salesCode = routeSourceSalesCode(row.originalText);
        const sourceFile = row.sourceFile || "";
        const sourceSheet = row.sheetName || "";
        const scopeKey = [sourceFile, sourceSheet].join("\u0001");
        const derived = routeSourceDerivedFieldsWithInheritedStop(row, {
          salesCode,
          previousStop: previousStopByScope.get(scopeKey) || null
        });
        const routeOrder = sourceRows.length + 1;
        const inheritedStop = derived.inheritedStop || null;
        sourceRows.push({
          id: `collection-route-source-row-${randomUUID()}`,
          batchId,
          fileId: fileIds.get(row.sourceFile) || "",
          routeOrder,
          sourceFile,
          sourceSheet,
          sourceRowNumber: row.sourceRowNumber || 0,
          originalText: row.originalText || "",
          dayCode: routeSourceDay(row.originalText) || (row.originalDay && row.originalDay !== "-" ? row.originalDay : "") || routeSourceDay(`${row.sourceFile} ${row.sheetName}`) || row.suggestedDay || "",
          weekMode: routeSourceWeek(row.originalText) !== "každý týden"
            ? routeSourceWeek(row.originalText)
            : row.originalWeek && row.originalWeek !== "-"
              ? row.originalWeek
              : routeSourceWeek(`${row.sourceFile} ${row.sheetName}`),
          vehicleCode: row.vehicleCode || "",
          wasteType: row.wasteType === "-" ? "" : row.wasteType || "",
          wasteCode: row.wasteCode === "-" ? "" : row.wasteCode || "",
          frequency: row.frequency || "",
          containerVolume: row.containerVolume || 0,
          containerCount: row.containerCount || 0,
          customerName: derived.customerName,
          addressText: derived.addressText,
          note: derived.note,
          mappingStatus: derived.mappingStatus,
          mappingIssue: derived.mappingIssue,
          status: "preview",
          estimatedServiceMinutes: row.estimatedServiceMinutes || 0,
          estimatedWeightTons: row.estimatedWeightTons || 0,
          metadata: {
            sourceRoute: row.sourceRoute,
            qualityStatus: row.qualityStatus,
            qualityIssues: row.qualityIssues || [],
            confidence: row.confidence,
            salesCode,
            salesCodeSource: salesCode ? "source-row-suffix" : "",
            continuationRow: Boolean(derived.continuationRow),
            inheritedStopSource: inheritedStop ? {
              sourceFile: inheritedStop.sourceFile,
              sourceSheet: inheritedStop.sourceSheet,
              sourceRowNumber: inheritedStop.sourceRowNumber,
              routeOrder: inheritedStop.routeOrder
            } : null,
            vehicleSource: "working-draft",
            createsOperationalRoutes: false,
            sendsEmailOrSms: false,
            startsAutomation: false
          },
          createdAt
        });
        if (derived.customerName && derived.addressText) {
          previousStopByScope.set(scopeKey, {
            customerName: derived.customerName,
            addressText: derived.addressText,
            sourceFile,
            sourceSheet,
            sourceRowNumber: inheritedStop?.sourceRowNumber || row.sourceRowNumber || 0,
            routeOrder: inheritedStop?.routeOrder || routeOrder
          });
        }
      }
      const summary = routeSourceSummary(sourceRows);
      const batch = {
        id: batchId,
        source: "13-excel",
        status: "preview",
        message: `Načteno ${sourceFiles.length} Excel souborů a ${sourceRows.length} zdrojových řádků. Ostré trasy nevznikly.`,
        fileCount: sourceFiles.length,
        rowCount: sourceRows.length,
        issueCount: sourceRows.filter((row) => row.mappingStatus !== "namapováno").length,
        createdByUserId: user.id,
        createdAt,
        metadata: {
          phase: "svozove-trasy-source-preview",
          source: "13-excel",
          summary,
          createsOperationalRoutes: false,
          sendsEmailOrSms: false,
          startsAutomation: false
        }
      };

      mockCollectionRouteSourceBatches.unshift(batch);
      mockCollectionRouteSourceFiles = [...sourceFiles, ...mockCollectionRouteSourceFiles.filter((file) => file.batchId !== batchId)];
      mockCollectionRouteSourceRows = [...sourceRows, ...mockCollectionRouteSourceRows.filter((row) => row.batchId !== batchId)];
      sendJson(response, 200, {
        preview: {
          batch,
          files: sourceFiles,
          rows: sourceRows.slice(0, 200),
          summary,
          apiStatus: "ready"
        },
        apiStatus: "ready"
      });
    } catch (error) {
      sendJson(response, error.status || 400, {
        error: error.message || "Import Svozových tras z 13 Excelů se nepodařilo zpracovat.",
        apiStatus: "waiting"
      });
    }
    return true;
  }

  if (url.pathname === "/api/collection-routes/svozove-trasy/batches" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "collection-routes", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }
    sendJson(response, 200, { batches: mockCollectionRouteSourceBatches.slice(0, 10), apiStatus: "ready" });
    return true;
  }

  if (url.pathname === "/api/collection-routes/svozove-trasy/vistos-match" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    if (normalizeRole(user.role) !== "admin") {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const body = await readJsonBody(request);
    const batchId = String(body.batchId || mockCollectionRouteSourceBatches[0]?.id || "").trim();
    const batchRows = mockCollectionRouteSourceRows.filter((row) => row.batchId === batchId);
    const createdAt = new Date().toISOString();
    let matchedCount = 0;
    let ambiguousCount = 0;
    let unmatchedCount = 0;
    let missingAddressCount = 0;
    let missingContainerCount = 0;
    let missingFrequencyCount = 0;
    let duplicateCount = 0;

    mockCollectionRouteSourceRows = mockCollectionRouteSourceRows.map((row) => {
      if (row.batchId !== batchId) {
        return row;
      }

      const next = { ...row };
      if (!next.customerName || !next.addressText) {
        next.mappingStatus = "chybí adresa";
        next.vistosMatchStatus = "chybí adresa";
        next.vistosIssue = "Lokální mock: chybí adresa pro Vistos match.";
        missingAddressCount += 1;
      } else if (next.mappingStatus === "chybí nádoba") {
        next.vistosMatchStatus = "chybí nádoba";
        next.vistosIssue = "Lokální mock: zdrojový řádek čeká na kontrolu nádoby.";
        missingContainerCount += 1;
      } else if (next.mappingStatus === "chybí frekvence") {
        next.vistosMatchStatus = "chybí frekvence";
        next.vistosIssue = "Lokální mock: zdrojový řádek čeká na kontrolu frekvence.";
        missingFrequencyCount += 1;
      } else if (next.mappingStatus === "duplicita") {
        next.vistosMatchStatus = "duplicita";
        next.vistosIssue = "Lokální mock: duplicitní Excel text.";
        duplicateCount += 1;
      } else if ((next.routeOrder || 0) % 5 === 0) {
        next.mappingStatus = "nejasné";
        next.mappingIssue = "Lokální mock: více podobných Vistos kandidátů.";
        next.vistosMatchStatus = "nejasné";
        next.vistosIssue = next.mappingIssue;
        next.vistosContractNumber = `MOCK-${String(next.routeOrder || 0).padStart(4, "0")}`;
        next.vistosCustomerName = next.customerName;
        next.vistosSiteName = next.addressText;
        ambiguousCount += 1;
      } else {
        next.mappingStatus = "namapováno";
        next.mappingIssue = "Lokální mock Vistos match. Ostré trasy nevznikly.";
        next.vistosMatchStatus = "namapováno";
        next.vistosMatchConfidence = "vysoká";
        next.vistosIssue = next.mappingIssue;
        next.vistosContractNumber = `MOCK-${String(next.routeOrder || 0).padStart(4, "0")}`;
        next.vistosCustomerName = next.customerName;
        next.vistosBranchName = next.customerName;
        next.vistosSiteName = next.addressText;
        next.vistosAddressText = next.addressText;
        next.vistosProductName = next.wasteType || "Komunál";
        matchedCount += 1;
      }
      return next;
    });

    unmatchedCount = Math.max(0, batchRows.length - matchedCount - ambiguousCount - missingAddressCount - missingContainerCount - missingFrequencyCount - duplicateCount);
    sendJson(response, 200, {
      match: {
        status: "matched",
        apiStatus: "ready",
        message: `Lokální Vistos match hotový pro ${batchRows.length} řádků z 13 Excelů. Ostré trasy nevznikly.`,
        summary: {
          batchId,
          sourceRowCount: batchRows.length,
          sourceBatchRowCount: batchRows.length,
          vistosCandidateCount: batchRows.length,
          matchedCount,
          ambiguousCount,
          unmatchedCount,
          missingAddressCount,
          missingContainerCount,
          missingFrequencyCount,
          duplicateCount,
          createdAt,
          source: "13-excel",
          vistosUse: "read-only mapping",
          createsOperationalRoutes: false,
          sendsEmailOrSms: false,
          startsAutomation: false
        }
      },
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/collection-routes/svozove-trasy/routes" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "collection-routes", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }
    const batchId = url.searchParams.get("batchId") || mockCollectionRouteSourceBatches[0]?.id || "";
    const rows = mockFilteredRouteSourceRows(url.searchParams);
    sendJson(response, 200, {
      batch: mockCollectionRouteSourceBatches.find((item) => item.id === batchId) || null,
      files: mockCollectionRouteSourceFiles.filter((item) => item.batchId === batchId),
      rows,
      summary: routeSourceSummary(rows),
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/collection-routes/vistos/kommunal-preview" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    if (normalizeRole(user.role) !== "admin") {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const now = new Date().toISOString();
    const batch = {
      id: `collection-import-batch-${randomUUID()}`,
      source: "vistos",
      sourceMode: "vistos-komunal-preview",
      status: "waiting_configuration",
      apiStatus: "not_configured",
      message: "Vistos API není nakonfigurováno",
      rowCount: 0,
      issueCount: 1,
      createdByUserId: user.id,
      createdAt: now,
      finishedAt: now,
      metadata: {
        phase: "1E",
        mode: "vistos-komunal-preview",
        source: "vistos",
        filter: {
          Status_FK: 74,
          Typsmlouvy_FK: [14735]
        },
        vistosConfigured: false,
        createsOperationalRoutes: false,
        sendsEmailOrSms: false,
        startsAutomation: false
      }
    };
    const issue = {
      id: `collection-data-issue-${randomUUID()}`,
      batchId: batch.id,
      siteId: "",
      issueType: "vistos-api",
      severity: "warning",
      message: "Vistos API není nakonfigurováno",
      status: "open",
      createdAt: now,
      resolvedAt: ""
    };
    mockCollectionRouteBatches.unshift(batch);
    mockCollectionRouteIssues.unshift(issue);
    sendJson(response, 200, {
      preview: {
        batch,
        summary: {
          status: batch.status,
          message: batch.message,
          rowCount: 0,
          contractCount: 0,
          itemCount: 0,
          siteCount: 0,
          containerCount: 0,
          issueCount: 1,
          createsOperationalRoutes: false,
          sendsEmailOrSms: false,
          startsAutomation: false
        },
        apiStatus: "not_configured"
      },
      apiStatus: "not_configured"
    });
    return true;
  }

  if (url.pathname === "/api/collection-routes/import-batches" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "collection-routes", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }
    sendJson(response, 200, { batches: mockCollectionRouteBatches.slice(0, 20), apiStatus: "ready" });
    return true;
  }

  const collectionBatchMatch = url.pathname.match(/^\/api\/collection-routes\/import-batches\/([^/]+)$/);
  if (collectionBatchMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "collection-routes", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }
    const batch = mockCollectionRouteBatches.find((item) => item.id === decodeURIComponent(collectionBatchMatch[1]));
    if (!batch) {
      sendJson(response, 404, { error: "Importní batch nebyl nalezen." });
      return true;
    }
    sendJson(response, 200, {
      batch,
      rows: mockCollectionRouteImportRows.filter((item) => item.batchId === batch.id),
      apiStatus: "ready"
    });
    return true;
  }

  const collectionBatchRowsMatch = url.pathname.match(/^\/api\/collection-routes\/import-batches\/([^/]+)\/rows$/);
  if (collectionBatchRowsMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "collection-routes", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }
    const batchId = decodeURIComponent(collectionBatchRowsMatch[1]);
    sendJson(response, 200, {
      rows: mockCollectionRouteImportRows.filter((item) => item.batchId === batchId),
      apiStatus: "ready"
    });
    return true;
  }

  const collectionBatchIssuesMatch = url.pathname.match(/^\/api\/collection-routes\/import-batches\/([^/]+)\/issues$/);
  if (collectionBatchIssuesMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "collection-routes", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }
    const batchId = decodeURIComponent(collectionBatchIssuesMatch[1]);
    sendJson(response, 200, {
      issues: mockCollectionRouteIssues.filter((item) => item.batchId === batchId),
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/collection-routes/sites" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "collection-routes", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }
    sendJson(response, 200, { sites: mockCollectionRouteSites, apiStatus: "ready" });
    return true;
  }

  const collectionSiteMatch = url.pathname.match(/^\/api\/collection-routes\/sites\/([^/]+)$/);
  if (collectionSiteMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "collection-routes", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }
    const site = mockCollectionRouteSites.find((item) => item.id === decodeURIComponent(collectionSiteMatch[1]));
    if (!site) {
      sendJson(response, 404, { error: "Stanoviště nebylo nalezeno." });
      return true;
    }
    sendJson(response, 200, {
      site,
      services: mockCollectionRouteServices.filter((item) => item.siteId === site.id),
      containers: mockCollectionRouteContainers.filter((item) => item.siteId === site.id),
      issues: mockCollectionRouteIssues.filter((item) => item.siteId === site.id),
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/collection-routes/location-issues" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "collection-routes", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }
    sendJson(response, 200, { issues: mockCollectionRouteIssues, apiStatus: "ready" });
    return true;
  }

  if (url.pathname === "/api/modules/collection-routes/rules" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "collection-routes", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }
    sendJson(response, 200, { rules: [], apiStatus: "ready" });
    return true;
  }

  if (url.pathname === "/api/modules/collection-routes/rules" && request.method !== "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    sendJson(response, 403, {
      error: "Trasy svozu jsou ve Fázi 1A pouze read-only pilot. Pravidla ani automatizace se teď nesmí měnit.",
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/modules/collection-routes/automation-runs" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "collection-routes", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }
    sendJson(response, 200, { runs: [], runnerRuns: [], apiStatus: "ready" });
    return true;
  }

  const dataBoxModuleRulesMatch = /^\/api\/modules\/data-box\/(rules|automation-runs)$/.exec(url.pathname);
  if (dataBoxModuleRulesMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!canViewMockDataBox(user)) {
      sendJson(response, 403, { error: "Nemate opravneni." });
      return true;
    }

    if (dataBoxModuleRulesMatch[1] === "automation-runs") {
      sendJson(response, 200, { runs: [], runnerRuns: [], apiStatus: "ready" });
      return true;
    }

    sendJson(response, 200, { rules: [], apiStatus: "ready" });
    return true;
  }

  if (url.pathname === "/api/modules/data-box/rules" && request.method !== "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    sendJson(response, 403, {
      error: "Datova schranka ma v lokalnim mocku pravidla pouze read-only.",
      apiStatus: "ready"
    });
    return true;
  }

  if ((url.pathname === "/api/modules/data-box/rules/run" || url.pathname === "/api/modules/data-box/rules/dry-run") && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!canManageMockDataBox(user)) {
      sendJson(response, 403, { error: "Nemate opravneni spustit pravidla Datove schranky." });
      return true;
    }

    sendJson(response, 200, {
      apiStatus: "ready",
      mode: url.pathname.endsWith("dry-run") ? "dry-run" : "live",
      confirmed: false,
      runner: "data-box-cloud-runner",
      status: "dry_run",
      message: "Lokální mock DS runneru nespouští ostré akce.",
      rulesTotal: 0,
      dryRunCount: 0,
      skippedCount: 0,
      failedCount: 0,
      results: []
    });
    return true;
  }

  if ((url.pathname === "/api/ds/rules" || url.pathname === "/api/ds/rules/run" || url.pathname === "/api/ds/rules/dry-run")) {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!canViewMockDataBox(user)) {
      sendJson(response, 403, { error: "Nemate opravneni." });
      return true;
    }
    if (url.pathname === "/api/ds/rules" && request.method === "GET") {
      sendJson(response, 200, { rules: [], apiStatus: "ready" });
      return true;
    }
    if (request.method === "POST") {
      sendJson(response, 200, {
        apiStatus: "ready",
        mode: url.pathname.endsWith("dry-run") ? "dry-run" : "live",
        confirmed: false,
        runner: "data-box-cloud-runner",
        status: "dry_run",
        message: "Lokální mock DS pravidel nespouští ostré akce.",
        rulesTotal: 0,
        results: []
      });
      return true;
    }
  }

  const fleetVehicleDetailMatch = url.pathname.match(/^\/api\/vehicles\/([^/]+)$/);
  if (fleetVehicleDetailMatch && ["GET", "PATCH"].includes(request.method)) {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "fleet", request.method === "PATCH" ? "edit" : "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const payload = await loadDevFleetPayload();
    const vehicleId = decodeURIComponent(fleetVehicleDetailMatch[1] || "");
    const vehicle = payload.vehicles.find((item) => mockFleetVehicleMatches(item, vehicleId));

    if (!vehicle) {
      sendJson(response, 404, { error: "Vozidlo nebylo nalezeno.", apiStatus: "ready" });
      return true;
    }

    if (request.method === "PATCH") {
      const body = await readJsonBody(request);
      const assignedDriverId = String(body.assignedDriverId || "").trim();
      const selectedDriver = assignedDriverId
        ? mockUsers.find((item) => String(item.id || "") === assignedDriverId)
        : null;
      const assignedDriverName = String(selectedDriver?.name || body.assignedDriverName || "").trim();
      const now = new Date().toISOString();

      if (!assignedDriverId && !assignedDriverName && !String(body.assignedDriverPhone || body.assignedDriverEmail || body.note || "").trim()) {
        mockFleetAssignments.delete(vehicle.id);
      } else {
        mockFleetAssignments.set(vehicle.id, {
          assignedDriverId,
          assignedDriverName,
          assignedDriverPhone: String(selectedDriver?.phone || body.assignedDriverPhone || "").trim(),
          assignedDriverEmail: String(selectedDriver?.email || body.assignedDriverEmail || "").trim(),
          note: String(body.note || "").trim(),
          updatedAt: now,
          updatedByName: user.name || ""
        });
      }

      const nextPayload = await loadDevFleetPayload();
      const nextVehicle = nextPayload.vehicles.find((item) => mockFleetVehicleMatches(item, vehicle.id)) || vehicle;
      sendJson(response, 200, {
        provider: nextPayload.provider,
        source: nextPayload.source,
        apiStatus: nextPayload.apiStatus,
        assignmentApiStatus: nextPayload.assignmentApiStatus,
        assignmentMessage: nextPayload.assignmentMessage,
        vehicle: nextVehicle
      });
      return true;
    }

    sendJson(response, 200, {
      provider: payload.provider,
      source: payload.source,
      apiStatus: payload.apiStatus,
      assignmentApiStatus: payload.assignmentApiStatus,
      assignmentMessage: payload.assignmentMessage,
      vehicle
    });
    return true;
  }

  if (url.pathname === "/api/vehicles" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "fleet", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    sendJson(response, 200, await loadDevFleetPayload());
    return true;
  }

  if (url.pathname === "/api/vehicle-tracking/status" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "vehicle-tracking", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    sendJson(response, 200, await loadTcarsStatusPayload(process.env));
    return true;
  }

  if (url.pathname === "/api/vehicle-tracking/wim-sites" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!hasPermission(user, "vehicle-tracking", "view")) {
      sendJson(response, 403, { error: "Nemate opravneni." });
      return true;
    }

    const devicesTotal = mockVehicleWimSites.reduce((sum, site) => sum + site.deviceCount, 0);
    sendJson(response, 200, {
      apiStatus: "ready",
      source: {
        label: "MD/RSD PDF mapa, stav k 30. 6. 2025, dev mock",
        sourceDate: "2025-06-30",
        coordinateQuality: "approximate-needs-verification"
      },
      summary: {
        sitesTotal: mockVehicleWimSites.length,
        devicesTotal,
        activeSites: mockVehicleWimSites.filter((site) => site.status === "active").length,
        plannedSites: mockVehicleWimSites.filter((site) => site.status === "planned").length,
        maintenanceSites: mockVehicleWimSites.filter((site) => site.status === "maintenance").length,
        upgradeSites: mockVehicleWimSites.filter((site) => site.status === "upgrade").length,
        preselectionSites: mockVehicleWimSites.filter((site) => site.status === "preselection").length,
        alertDistanceKm: 15,
        automationStatus: "draft",
        automationMode: "read-only-pilot"
      },
      sites: mockVehicleWimSites
    });
    return true;
  }

  if (url.pathname === "/api/vehicle-tracking/wim-alerts" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!hasPermission(user, "vehicle-tracking", "view")) {
      sendJson(response, 403, { error: "Nemate opravneni." });
      return true;
    }

    sendJson(response, 200, {
      apiStatus: "ready",
      mode: "read-only-pilot",
      message: "Geofencing alerty jsou připravené pouze jako návrh. Ostré notifikace nejsou aktivní.",
      events: []
    });
    return true;
  }

  if (url.pathname === "/api/data-box/status" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!canViewMockDataBox(user)) {
      sendJson(response, 403, { error: "Nemate opravneni." });
      return true;
    }

    sendJson(response, 200, mockDataBoxStatusPayload());
    return true;
  }

  if (url.pathname === "/api/data-box/messages" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!canViewMockDataBox(user)) {
      sendJson(response, 403, { error: "Nemate opravneni." });
      return true;
    }

    sendJson(response, 200, { messages: [], apiStatus: "ready" });
    return true;
  }

  if (url.pathname === "/api/data-box/actions" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!canViewMockDataBox(user)) {
      sendJson(response, 403, { error: "Nemate opravneni." });
      return true;
    }

    sendJson(response, 200, { actions: mockDataBoxActions, apiStatus: "ready" });
    return true;
  }

  if (url.pathname === "/api/data-box/ai-boost/run" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!canManageMockDataBox(user)) {
      sendJson(response, 403, { error: "Nemate opravneni spustit AI Boost Datove schranky." });
      return true;
    }

    const now = new Date().toISOString();
    const action = {
      id: `mock-ai-boost-${randomUUID()}`,
      messageId: "mock-data-box-message",
      dataBoxId: "kaiser-primary",
      actionType: "ai_boost",
      status: "requires_confirmation",
      recipient: "",
      subject: "Lokální AI Boost koncept",
      bodyPreview: "Lokální mock: AI Boost by připravil koncept k ruční kontrole. Bez OpenAI secretu nic neposílá.",
      dedupeKey: `data-box:ai-boost:mock:${now}`,
      result: {
        source: "ai_boost",
        provider: "local-mock",
        recommendedAction: "review",
        reason: "Lokální mock pro ověření záložky AI Boost.",
        confidence: 0.7,
        requiresConfirmation: true
      },
      createdAt: now,
      updatedAt: now
    };
    mockDataBoxActions = [action, ...mockDataBoxActions].slice(0, 50);
    sendJson(response, 200, {
      apiStatus: "ready",
      status: "prepared",
      provider: "local-mock",
      created: 1,
      actions: [action],
      message: "Lokální mock připravil 1 AI Boost koncept. Nic se neodeslalo."
    });
    return true;
  }

  const dataBoxActionConfirmMatch = /^\/api\/data-box\/actions\/([^/]+)\/confirm$/.exec(url.pathname);
  if (dataBoxActionConfirmMatch && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!canManageMockDataBox(user)) {
      sendJson(response, 403, { error: "Nemate opravneni potvrdit AI Boost koncept." });
      return true;
    }

    const actionId = decodeURIComponent(dataBoxActionConfirmMatch[1] || "");
    const action = mockDataBoxActions.find((item) => item.id === actionId);
    if (!action) {
      sendJson(response, 404, { error: "Koncept akce nebyl nalezen.", apiStatus: "ready" });
      return true;
    }
    action.status = action.actionType === "archive" ? "archived" : action.actionType === "email" ? "sent" : "skipped";
    action.updatedAt = new Date().toISOString();
    sendJson(response, 200, {
      apiStatus: "ready",
      status: action.status,
      action,
      notice: "Lokální mock: koncept byl potvrzen bez ostrého odeslání."
    });
    return true;
  }

  const dataBoxMessageMatch = /^\/api\/data-box\/messages\/([^/]+)$/.exec(url.pathname);
  if (dataBoxMessageMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!canViewMockDataBox(user)) {
      sendJson(response, 403, { error: "Nemate opravneni." });
      return true;
    }

    sendJson(response, 404, { error: "Zprava nebyla nalezena.", apiStatus: "ready" });
    return true;
  }

  const dataBoxActionMatch = /^\/api\/data-box\/messages\/([^/]+)\/(archive|email|reply)$/.exec(url.pathname);
  if (dataBoxActionMatch && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!canManageMockDataBox(user)) {
      sendJson(response, 403, { error: "Nemate opravneni provest akci Datove schranky." });
      return true;
    }

    const action = dataBoxActionMatch[2];
    if (action === "reply") {
      sendJson(response, 503, {
        error: "Lokální mock nemá napojenou serverovou KNF/DS bránu pro odeslání odpovědi.",
        code: "data_box_reply_sender_missing",
        apiStatus: "ready"
      });
      return true;
    }
    if (action === "email") {
      sendJson(response, 503, {
        error: "Lokální mock neposílá e-maily. Produkce vyžaduje SendGrid nastavení.",
        code: "data_box_email_send_failed",
        apiStatus: "ready"
      });
      return true;
    }

    sendJson(response, 200, {
      apiStatus: "ready",
      status: "archived",
      notice: "Lokální mock: zpráva by byla archivována po potvrzení.",
      action: { id: `mock-data-box-action-${randomUUID()}`, actionType: "archive", status: "archived" }
    });
    return true;
  }

  if (url.pathname === "/api/data-box/sync-runs" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!canViewMockDataBox(user)) {
      sendJson(response, 403, { error: "Nemate opravneni." });
      return true;
    }

    sendJson(response, 200, { runs: mockDataBoxSyncRuns, apiStatus: "ready" });
    return true;
  }

  if (url.pathname === "/api/data-box/sync" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Neprihlaseno." });
      return true;
    }
    if (!canManageMockDataBox(user)) {
      sendJson(response, 403, { error: "Nemate opravneni spustit synchronizaci Datove schranky." });
      return true;
    }

    const now = new Date().toISOString();
    const run = {
      id: `data-box-sync-${randomUUID()}`,
      dataBoxId: "kaiser-primary",
      dataBoxLabel: "Kaiser Smart Datova schranka",
      triggerType: "manual",
      startedAt: now,
      finishedAt: now,
      status: "configuration_missing",
      messagesFound: 0,
      messagesCreated: 0,
      messagesUpdated: 0,
      attachmentsFound: 0,
      errorCode: "data_box_isds_not_configured",
      message: "Lokalni dev server nema ISDS secrets. Ostry sync se nespustil.",
      dedupeKey: `manual:kaiser-primary:${now}`,
      createdByUserId: user.id || ""
    };
    mockDataBoxSyncRuns = [run, ...mockDataBoxSyncRuns].slice(0, 50);

    sendJson(response, 200, {
      apiStatus: "ready",
      sync: run,
      isds: mockDataBoxStatusPayload().isds,
      message: run.message
    });
    return true;
  }

  if (url.pathname === "/api/vehicle-tracking/tcars/vehicles" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "vehicle-tracking", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    sendJson(response, 200, await loadTcarsVehiclesPayload(process.env));
    return true;
  }

  if (url.pathname === "/api/vehicle-tracking/tcars/sync" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "vehicle-tracking", "view") || !canManageMockTcars(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění spustit T-Cars synchronizaci." });
      return true;
    }

    try {
      const result = await syncTcarsLocations(process.env);
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof TcarsClientError) {
        sendJson(response, error.status, {
          error: error.message,
          code: error.code,
          apiStatus: "waiting"
        });
        return true;
      }

      sendJson(response, 500, { error: "Nepodařilo se načíst polohy z T-Cars.", apiStatus: "waiting" });
    }
    return true;
  }

  const tcarsLinkMatch = /^\/api\/vehicles\/([^/]+)\/tcars-link$/.exec(url.pathname);
  if (tcarsLinkMatch && ["PATCH", "DELETE"].includes(request.method)) {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "vehicle-tracking", "view") || !canManageMockTcars(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění měnit párování T-Cars." });
      return true;
    }

    sendJson(response, 501, {
      error: request.method === "PATCH" ? "Čeká na API pro párování T-Cars." : "Čeká na API pro odpojení T-Cars.",
      apiStatus: "waiting",
      vehicleId: decodeURIComponent(tcarsLinkMatch[1])
    });
    return true;
  }

  if ((url.pathname === "/api/sarlota-promo" || url.pathname === "/api/ai/sarlota-promo") && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    const promoDate = new Date().toISOString().slice(0, 10);
    const promoKey = "sarlota_intro_2026_06";
    const active = promoDate <= "2026-06-30";
    const stateKey = `${user.id}:${promoKey}:${promoDate}`;
    const existing = mockAssistantDailyPromos.get(stateKey) || null;

    sendJson(response, 200, {
      promoKey,
      promoDate,
      validUntil: "2026-06-30",
      show: active,
      action: existing?.action || "",
      videoUrl: "/avatars/sarlota-intro.mp4",
      fallbackImageUrl: "/avatars/sarlota-microphone.png",
      apiStatus: "ready"
    });
    return true;
  }

  if ((url.pathname === "/api/sarlota-promo" || url.pathname === "/api/ai/sarlota-promo") && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    const payload = await readJsonBody(request);
    const action = String(payload.action || "").trim().toLowerCase();
    const allowedActions = new Set(["shown", "accepted", "declined"]);
    if (!allowedActions.has(action)) {
      sendJson(response, 400, { error: "Neplatná akce promo videa.", apiStatus: "waiting" });
      return true;
    }

    const promoDate = new Date().toISOString().slice(0, 10);
    const promoKey = "sarlota_intro_2026_06";
    const active = promoDate <= "2026-06-30";
    if (!active) {
      sendJson(response, 200, {
        promoKey,
        promoDate,
        validUntil: "2026-06-30",
        show: false,
        action: "",
        videoUrl: "/avatars/sarlota-intro.mp4",
        fallbackImageUrl: "/avatars/sarlota-microphone.png",
        apiStatus: "ready"
      });
      return true;
    }

    const stateKey = `${user.id}:${promoKey}:${promoDate}`;
    mockAssistantDailyPromos.set(stateKey, {
      userId: user.id,
      promoKey,
      promoDate,
      action,
      updatedAt: new Date().toISOString()
    });
    sendJson(response, 200, {
      promoKey,
      promoDate,
      validUntil: "2026-06-30",
      show: active,
      action,
      videoUrl: "/avatars/sarlota-intro.mp4",
      fallbackImageUrl: "/avatars/sarlota-microphone.png",
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/ai/search" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    const query = String(url.searchParams.get("q") || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    const match = (item) => !query || [
      item.id,
      item.title,
      item.description,
      item.route
    ].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(query);
    const visibleModules = modules
      .filter((moduleItem) => hasPermission(user, moduleItem.id, "view"))
      .filter(match)
      .map((moduleItem) => ({
        id: moduleItem.id,
        title: moduleItem.title,
        description: moduleItem.description,
        route: moduleItem.route,
        status: moduleItem.status
      }));

    sendJson(response, 200, {
      query: url.searchParams.get("q") || "",
      modules: visibleModules,
      pages: [],
      records: [],
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/ai/employees/search" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const query = String(url.searchParams.get("q") || url.searchParams.get("query") || "").trim();
    if (!query) {
      sendJson(response, 400, { error: "Zadejte jméno nebo část jména zaměstnance.", code: "ai_employee_query_required" });
      return true;
    }

    const limit = mockAiLimit(url.searchParams.get("limit"), 5);
    const employees = visibleMockEmployees(user)
      .filter((employee) => mockEmployeeMatchesAiQuery(employee, query))
      .slice(0, limit)
      .map(sanitizeMockEmployeeForAi);

    sendJson(response, 200, {
      query,
      employees,
      count: employees.length,
      needsDisambiguation: employees.length > 1,
      apiStatus: "ready"
    });
    return true;
  }

  const aiEmployeeSummaryMatch = /^\/api\/ai\/employees\/([^/]+)\/summary$/.exec(url.pathname);
  if (aiEmployeeSummaryMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const employee = findMockEmployee(user, decodeURIComponent(aiEmployeeSummaryMatch[1]));
    if (!employee) {
      sendJson(response, 404, { error: "Zaměstnanec nebyl nalezen.", code: "employee_not_found" });
      return true;
    }

    const items = mockAbsenceRequests
      .filter((item) => sameMockId(item.employeeId, employee.id))
      .filter((item) => canViewMockAbsenceRequest(user, item))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    sendJson(response, 200, {
      employee: {
        ...sanitizeMockEmployeeForAi(employee),
        absence: {
          status: items[0]?.statusLabel || employee.currentAbsenceStatus,
          sickDaysCurrentYear: Number(employee.sickDaysCurrentYear || 0),
          lastAbsenceDate: items[0]?.dateFrom || employee.lastAbsenceDate,
          pendingCount: items.filter((item) => ["pending", "pending_approval"].includes(item.status)).length,
          approvedCount: items.filter((item) => item.status === "approved").length,
          recentCount: items.length,
          note: items.length ? "Historie nepřítomností je načtená z vývojového API." : "Zatím tu nejsou žádné žádosti."
        }
      },
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/ai/users/search" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "users", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const query = String(url.searchParams.get("q") || url.searchParams.get("query") || "").trim();
    if (!query) {
      sendJson(response, 400, { error: "Zadejte jméno nebo část jména uživatele.", code: "ai_user_query_required" });
      return true;
    }

    const limit = mockAiLimit(url.searchParams.get("limit"), 5);
    const users = mockUsers
      .filter((item) => mockUserMatchesAiQuery(item, query))
      .slice(0, limit)
      .map((item) => sanitizeMockUserForAi(item));

    sendJson(response, 200, {
      query,
      users,
      count: users.length,
      needsDisambiguation: users.length > 1,
      apiStatus: "ready"
    });
    return true;
  }

  const aiUserSummaryMatch = /^\/api\/ai\/users\/([^/]+)\/summary$/.exec(url.pathname);
  if (aiUserSummaryMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "users", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const targetUser = findMockUser(decodeURIComponent(aiUserSummaryMatch[1]));
    if (!targetUser) {
      sendJson(response, 404, { error: "Uživatel nebyl nalezen.", code: "ai_user_not_found" });
      return true;
    }

    sendJson(response, 200, {
      user: sanitizeMockUserForAi(targetUser, { includePermissions: true }),
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/ai/absence/pending" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 20), 100));
    const requests = mockAbsenceRequests
      .filter((item) => canApproveMockAbsence(user, item))
      .slice(0, limit);
    sendJson(response, 200, { requests, apiStatus: "ready" });
    return true;
  }

  const aiAbsenceActionMatch = /^\/api\/ai\/absence\/([^/]+)\/(approve|reject)$/.exec(url.pathname);
  if (aiAbsenceActionMatch && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "approve")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const payload = await readJsonBody(request);
    if (payload?.confirmed !== true || payload?.confirmationSource !== "ai_ui") {
      sendJson(response, 409, { error: "AI akce vyžaduje potvrzení uživatele.", code: "ai_confirmation_required" });
      return true;
    }

    try {
      const id = decodeURIComponent(aiAbsenceActionMatch[1]);
      const action = aiAbsenceActionMatch[2];
      const status = action === "approve" ? "approved" : "rejected";
      const item = changeMockAbsenceStatus(user, id, status, payload.reason || "Potvrzeno v AI pomocníkovi.");
      sendJson(response, 200, {
        request: item,
        notification: { status: "skipped", errorMessage: "Lokální vývojový server neposílá skutečné SMS." },
        apiStatus: "ready"
      });
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.message || "AI akci se nepodařilo dokončit.", apiStatus: "ready" });
    }
    return true;
  }

  if (url.pathname === "/api/ai/feedback" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "feedback", "create")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const payload = await readJsonBody(request);
    if (payload?.confirmed !== true || payload?.confirmationSource !== "ai_ui") {
      sendJson(response, 409, { error: "AI akce vyžaduje potvrzení uživatele.", code: "ai_confirmation_required" });
      return true;
    }

    try {
      const feedback = createMockModuleFeedback(user, payload);
      mockModuleFeedback = [feedback, ...mockModuleFeedback].slice(0, 500);
      sendJson(response, 201, { feedback, apiStatus: "ready" });
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.message || "Připomínku se nepodařilo uložit.", apiStatus: "ready" });
    }
    return true;
  }

  if (url.pathname === "/api/ai/elevenlabs/signed-url" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    const assistant = url.searchParams.get("assistant") === "marek" ? "Marek" : "Šarlota";
    sendJson(response, 503, {
      error: "ElevenLabs není nastavený v lokálním vývojovém serveru.",
      code: "elevenlabs_local_unconfigured",
      assistantId: assistant === "Marek" ? "marek" : "sarlota",
      assistantName: assistant,
      configured: false,
      apiStatus: "waiting"
    });
    return true;
  }

  if (url.pathname === "/api/ai/elevenlabs/sarlota-panel-status" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      panel: {
        title: "Šarlota",
        readOnly: true,
        openedByDeepLink: true
      },
      statuses: {
        elevenLabs: {
          label: "ElevenLabs",
          status: "unverified",
          detail: "NEOVĚŘENO v lokálním vývojovém serveru"
        },
        openAi: {
          label: "OpenAI",
          status: "unverified",
          detail: "GPT-5.1 / NEOVĚŘENO"
        },
        ksoBackend: {
          label: "KSO backend",
          status: hasPermission(user, "dashboard", "view") ? "ok" : "error",
          detail: hasPermission(user, "dashboard", "view") ? "OK, přihlášený uživatel má přístup" : "chybí oprávnění"
        },
        signedUrl: {
          label: "Signed-url endpoint",
          status: "unverified",
          detail: "NEOVĚŘENO v lokálním vývojovém serveru"
        },
        personalization: {
          label: "Personalizace",
          status: "unverified",
          detail: "NEOVĚŘENO v lokálním vývojovém serveru"
        },
        introAnnouncement: {
          label: "intro_announcement",
          status: "unverified",
          detail: "NEOVĚŘENO v lokálním vývojovém serveru"
        },
        vocative: {
          label: "Vocativ",
          status: "unverified",
          detail: "NEOVĚŘENO"
        }
      },
      checks: {
        signedUrlEndpoint: "/api/ai/elevenlabs/signed-url?assistant=sarlota",
        voiceEndpoint: "/api/voice/sarlota",
        signedUrlOmitted: true,
        secretsOmitted: true,
        dynamicVariableValuesOmitted: true,
        noLiveToolsExecuted: true
      }
    });
    return true;
  }

  if (url.pathname === "/api/ai/elevenlabs/sarlota-prompt-sync" && ["GET", "POST"].includes(request.method)) {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "settings", "manage")) {
      sendJson(response, 403, { error: "Nemáte oprávnění upravit prompt Šarloty." });
      return true;
    }

    if (request.method === "POST") {
      const payload = await readJsonBody(request);
      if (payload?.apply !== true) {
        sendJson(response, 409, {
          error: "Synchronizace promptu vyžaduje potvrzení apply: true.",
          code: "sarlota_prompt_sync_apply_required",
          apiStatus: "waiting"
        });
        return true;
      }
    }

    sendJson(response, request.method === "GET" ? 200 : 409, {
      mode: request.method === "GET" ? "dry_run" : "local_mock",
      ready: false,
      status: "missing_configuration",
      apiKeyPresent: false,
      agentIdPresent: false,
      message: "Lokální preview nemá ElevenLabs konfiguraci. Ostrý prompt se ukládá až přes produkční backend.",
      safety: {
        returnsPromptText: false,
        willNotPatchFirstMessage: true,
        willNotPatchModel: true,
        willNotPatchTools: true
      },
      apiStatus: "waiting"
    });
    return true;
  }

  if (url.pathname === "/api/theme-settings" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    sendJson(response, 200, { settings: mockThemeSettings });
    return true;
  }

  if (url.pathname === "/api/theme-settings" && request.method === "PATCH") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "settings", "manage")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    try {
      const payload = await readJsonBody(request);
      mockThemeSettings = normalizeThemeSettings(payload, {
        updatedAt: new Date().toISOString(),
        updatedByUserId: user.id
      });
      sendJson(response, 200, { settings: mockThemeSettings });
    } catch {
      sendJson(response, 400, { error: "Vzhled se nepodařilo uložit. Zkuste to prosím znovu." });
    }
    return true;
  }

  if (url.pathname === "/api/absence-settings" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    sendJson(response, 200, { settings: mockAbsenceSettings, apiStatus: "ready" });
    return true;
  }

  if (url.pathname === "/api/absence-settings" && request.method === "PATCH") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "manage")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    try {
      const payload = await readJsonBody(request);
      mockAbsenceSettings = normalizeAbsenceSettings(payload, {
        updatedAt: new Date().toISOString(),
        updatedByUserId: user.id
      });
      sendJson(response, 200, { settings: mockAbsenceSettings, apiStatus: "ready" });
    } catch {
      sendJson(response, 400, { error: "Nastavení reportu se nepodařilo uložit." });
    }
    return true;
  }

  if (url.pathname === "/api/absence-requests" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const mine = url.searchParams.get("mine") === "1";
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 20), 100));
    const requests = mockAbsenceRequests
      .filter((item) => (mine ? sameMockId(item.employeeId, user.id) : canViewMockAbsenceRequest(user, item)))
      .slice(0, limit);
    sendJson(response, 200, { requests, apiStatus: "ready" });
    return true;
  }

  if (url.pathname === "/api/absence-requests" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "create")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    try {
      const payload = await readJsonBody(request);
      const item = createMockAbsenceRequest(user, payload);
      mockAbsenceRequests = [item, ...mockAbsenceRequests].slice(0, 100);
      if (item.status === "pending_approval") {
        addMockNotificationLog({
          relatedEntityId: item.id,
          channel: "email",
          type: "absence_approval_request",
          status: item.managerEmail ? "not_sent" : "not_sent",
          recipient: item.managerEmail,
          recipientName: item.managerName,
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          managerId: item.managerId,
          managerName: item.managerName,
          subject: "Smart odpady - nová žádost ke schválení",
          lastError: item.managerEmail
            ? "Lokální vývojový server neposílá skutečné e-maily."
            : `Chybí e-mail příjemce: ${item.managerName || "nadřízený"}.`
        });
      }
      sendJson(response, 201, { request: item, apiStatus: "ready" });
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.message || "Nepodařilo se odeslat. Zkuste to znovu.",
        apiStatus: "ready"
      });
    }
    return true;
  }

  if (url.pathname === "/api/absence-requests/pending" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const requests = mockAbsenceRequests
      .filter((item) => canApproveMockAbsence(user, item))
      .slice(0, 100);
    sendJson(response, 200, { requests, apiStatus: "ready" });
    return true;
  }

  if (url.pathname === "/api/absence-requests/send-approval-reminders" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "manage")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const now = new Date().toISOString();
    const requests = mockAbsenceRequests.filter((item) => item.status === "pending_approval" && !item.reminderSentAt);
    mockAbsenceRequests = mockAbsenceRequests.map((item) => (
      requests.some((pending) => sameMockId(pending.id, item.id))
        ? { ...item, reminderSentAt: now, updatedAt: now }
        : item
    ));
    sendJson(response, 200, {
      count: requests.length,
      notifications: requests.map((item) => ({
        requestId: item.id,
        status: "skipped",
        errorMessage: "Lokální vývojový server neposílá skutečné e-maily."
      })),
      apiStatus: "ready"
    });
    return true;
  }

  const absenceRequestMatch = /^\/api\/absence-requests\/([^/]+)(?:\/(approve|reject))?$/.exec(url.pathname);
  if (absenceRequestMatch) {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const id = decodeURIComponent(absenceRequestMatch[1]);
    const action = absenceRequestMatch[2] || "";
    const existing = mockAbsenceRequests.find((item) => sameMockId(item.id, id));

    if (!existing) {
      sendJson(response, 404, { error: "Žádost nebyla nalezena.", apiStatus: "ready" });
      return true;
    }

    if (request.method === "GET" && !action) {
      if (!canViewMockAbsenceRequest(user, existing)) {
        sendJson(response, 403, { error: "Nemáte oprávnění." });
        return true;
      }
      sendJson(response, 200, { request: existing, apiStatus: "ready" });
      return true;
    }

    if (request.method === "DELETE" && !action) {
      const ownRequest = sameMockId(user.id, existing.employeeId);
      if (!ownRequest && !isFullAccessRole(user)) {
        sendJson(response, 403, { error: "Nemáte oprávnění." });
        return true;
      }
      const item = changeMockAbsenceStatus(user, id, "cancelled", "Zrušeno uživatelem.");
      sendJson(response, 200, { request: item, apiStatus: "ready" });
      return true;
    }

    if (request.method === "POST" && action === "approve") {
      try {
        const item = changeMockAbsenceStatus(user, id, "approved", "Schváleno v modulu Dovolená / Nemoc.");
        const notificationError = item.employeePhone
          ? "Lokální vývojový server neposílá skutečné SMS."
          : `Chybí telefon příjemce: ${item.employeeName}.`;
        addMockNotificationLog({
          relatedEntityId: item.id,
          channel: "sms",
          type: "absence_approved_sms",
          status: "not_sent",
          recipient: item.employeePhone,
          recipientName: item.employeeName,
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          managerId: item.managerId,
          managerName: item.managerName,
          messagePreview: notificationError,
          lastError: notificationError
        });
        sendJson(response, 200, {
          request: item,
          notification: {
            status: "skipped",
            errorMessage: notificationError,
            recipientName: item.employeeName || ""
          },
          apiStatus: "ready"
        });
      } catch (error) {
        sendJson(response, error.status || 500, { error: error.message || "Žádost se nepodařilo schválit.", apiStatus: "ready" });
      }
      return true;
    }

    if (request.method === "POST" && action === "reject") {
      try {
        const payload = await readJsonBody(request);
        const item = changeMockAbsenceStatus(user, id, "rejected", String(payload?.reason || "").trim());
        const notificationError = item.employeePhone
          ? "Lokální vývojový server neposílá skutečné SMS."
          : `Chybí telefon příjemce: ${item.employeeName}.`;
        addMockNotificationLog({
          relatedEntityId: item.id,
          channel: "sms",
          type: "absence_rejected_sms",
          status: "not_sent",
          recipient: item.employeePhone,
          recipientName: item.employeeName,
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          managerId: item.managerId,
          managerName: item.managerName,
          messagePreview: notificationError,
          lastError: notificationError
        });
        sendJson(response, 200, {
          request: item,
          notification: {
            status: "skipped",
            errorMessage: notificationError,
            recipientName: item.employeeName || ""
          },
          apiStatus: "ready"
        });
      } catch (error) {
        sendJson(response, error.status || 500, { error: error.message || "Žádost se nepodařilo zamítnout.", apiStatus: "ready" });
      }
      return true;
    }
  }

  if (url.pathname === "/api/notifications" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "reports", "view") || !canViewMockNotifications(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění zobrazit notifikace." });
      return true;
    }

    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.max(1, Math.min(Number(url.searchParams.get("pageSize") || 50), 100));
    const items = filteredMockNotifications(url);
    const offset = (page - 1) * pageSize;
    sendJson(response, 200, {
      items: items.slice(offset, offset + pageSize),
      total: items.length,
      page,
      pageSize,
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/notifications/summary" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "reports", "view") || !canViewMockNotifications(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění zobrazit notifikace." });
      return true;
    }

    const items = filteredMockNotifications(url);
    const summary = {
      emailSent: 0,
      emailNotSent: 0,
      smsSent: 0,
      smsNotSent: 0,
      pending: 0,
      failed: 0
    };

    for (const item of items) {
      if (item.channel === "email" && item.status === "sent") summary.emailSent += 1;
      if (item.channel === "email" && item.status !== "sent") summary.emailNotSent += 1;
      if (item.channel === "sms" && item.status === "sent") summary.smsSent += 1;
      if (item.channel === "sms" && item.status !== "sent") summary.smsNotSent += 1;
      if (item.status === "pending") summary.pending += 1;
      if (item.status === "failed") summary.failed += 1;
    }

    sendJson(response, 200, {
      ...summary,
      apiStatus: "ready"
    });
    return true;
  }

  if (url.pathname === "/api/module-feedback" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "feedback", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    sendJson(response, 200, { feedback: visibleMockFeedback(user), apiStatus: "ready" });
    return true;
  }

  if (url.pathname === "/api/module-feedback" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "feedback", "create")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    try {
      const feedback = createMockModuleFeedback(user, await readJsonBody(request));
      mockModuleFeedback = [feedback, ...mockModuleFeedback].slice(0, 500);
      sendJson(response, 201, { feedback, apiStatus: "ready" });
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.message || "Připomínku se nepodařilo uložit.",
        apiStatus: "ready"
      });
    }
    return true;
  }

  if (url.pathname === "/api/module-feedback/admin" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!canCreateCentralMockFeedback(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    try {
      const feedback = createMockCentralModuleFeedback(user, await readJsonBody(request));
      mockModuleFeedback = [feedback, ...mockModuleFeedback].slice(0, 500);
      sendJson(response, 201, { feedback, apiStatus: "ready" });
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.message || "Připomínku se nepodařilo vytvořit.",
        apiStatus: "ready"
      });
    }
    return true;
  }

  const moduleFeedbackPatchMatch = /^\/api\/module-feedback\/([^/]+)$/.exec(url.pathname);
  if (moduleFeedbackPatchMatch && request.method === "PATCH") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }

    try {
      const payload = await readJsonBody(request);
      const updatedFeedback = updateMockModuleFeedback(user, decodeURIComponent(moduleFeedbackPatchMatch[1]), payload);
      const { previousStatus, ...feedback } = updatedFeedback;
      const notification = feedback.status === "Hotovo" && previousStatus !== "Hotovo"
        ? mockFeedbackResolvedNotification(feedback, payload)
        : null;
      sendJson(response, 200, { feedback, notification, apiStatus: "ready" });
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.message || "Změny se nepodařilo uložit.",
        apiStatus: "ready"
      });
    }
    return true;
  }

  if (url.pathname === "/api/employees" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    sendJson(response, 200, { employees: visibleMockEmployees(user), apiStatus: "ready" });
    return true;
  }

  if (url.pathname === "/api/employees" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "edit")) {
      sendJson(response, 403, { error: "Nemáte oprávnění založit zaměstnance." });
      return true;
    }

    try {
      const payload = await readJsonBody(request);
      const employee = createManualMockEmployee(user, payload);
      sendJson(response, 201, { employee, apiStatus: "ready" });
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.message || "Zaměstnance se nepodařilo založit.",
        apiStatus: "ready"
      });
    }
    return true;
  }

  if (url.pathname === "/api/employees/import-preview" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "edit")) {
      sendJson(response, 403, { error: "Nemáte oprávnění importovat zaměstnance." });
      return true;
    }

    try {
      const { files } = await readMultipartFormData(request);
      const file = files.get("file");
      if (!file?.buffer?.length) {
        sendJson(response, 400, { error: "Nahrajte Excel export zaměstnanců.", apiStatus: "ready" });
        return true;
      }
      if (file.buffer.length > EMPLOYEE_EXCEL_IMPORT_MAX_FILE_SIZE_BYTES) {
        sendJson(response, 400, { error: "Soubor je příliš velký. Maximum je 2 MB.", apiStatus: "ready" });
        return true;
      }

      const preview = await createEmployeeExcelImportPreview({}, mockUsers, user, {
        buffer: file.buffer,
        filename: file.name,
        contentType: file.type
      });
      sendJson(response, 200, { preview, apiStatus: "ready" });
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.message || "Import preview zaměstnanců se teď nepodařilo připravit.",
        apiStatus: "waiting"
      });
    }
    return true;
  }

  if (url.pathname === "/api/employees/import" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "edit")) {
      sendJson(response, 403, { error: "Nemáte oprávnění importovat zaměstnance." });
      return true;
    }

    sendJson(response, 503, {
      error: "Lokální preview server nemá D1 databázi. Ostrý import spusťte až po cloudové migraci.",
      apiStatus: "waiting"
    });
    return true;
  }

  if (url.pathname === "/api/employees/documents/import-preview" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "edit") || !canEditMockEmployee(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění importovat dokumenty zaměstnanců." });
      return true;
    }

    try {
      const { files } = await readMultipartFormData(request);
      const importFiles = [...files.values()]
        .filter((file) => file?.buffer?.length)
        .map((file) => ({
          ...file,
          size: file.buffer.length
        }));
      const totalSize = importFiles.reduce((total, file) => total + file.size, 0);

      if (!importFiles.length) {
        sendJson(response, 400, { error: "Nahrajte dokumenty exportované nebo stažené z Pinya.", apiStatus: "ready" });
        return true;
      }
      if (importFiles.length > EMPLOYEE_DOCUMENT_IMPORT_MAX_FILES) {
        sendJson(response, 400, { error: `Najednou nahrajte nejvýše ${EMPLOYEE_DOCUMENT_IMPORT_MAX_FILES} souborů.`, apiStatus: "ready" });
        return true;
      }
      const tooLarge = importFiles.find((file) => file.size > EMPLOYEE_DOCUMENT_IMPORT_MAX_FILE_SIZE_BYTES);
      if (tooLarge) {
        sendJson(response, 400, { error: `Soubor ${tooLarge.name || ""} je příliš velký. Maximum je 10 MB.`, apiStatus: "ready" });
        return true;
      }
      if (totalSize > EMPLOYEE_DOCUMENT_IMPORT_MAX_TOTAL_BYTES) {
        sendJson(response, 400, { error: "Soubory jsou dohromady příliš velké. Maximum je 80 MB.", apiStatus: "ready" });
        return true;
      }

      const preview = buildEmployeeDocumentImportPreview(importFiles, visibleMockEmployees(user));
      sendJson(response, 200, { preview, apiStatus: "ready" });
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.message || "Preview importu dokumentů se teď nepodařilo připravit.",
        apiStatus: "waiting"
      });
    }
    return true;
  }

  if (url.pathname === "/api/employees/documents/import" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "edit") || !canEditMockEmployee(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění importovat dokumenty zaměstnanců." });
      return true;
    }

    try {
      const { files } = await readMultipartFormData(request);
      const importFiles = [...files.values()]
        .filter((file) => file?.buffer?.length)
        .map((file) => ({
          ...file,
          size: file.buffer.length
        }));
      const totalSize = importFiles.reduce((total, file) => total + file.size, 0);

      if (!importFiles.length) {
        sendJson(response, 400, { error: "Nahrajte dokumenty exportované nebo stažené z Pinya.", apiStatus: "ready" });
        return true;
      }
      if (importFiles.length > EMPLOYEE_DOCUMENT_IMPORT_MAX_FILES) {
        sendJson(response, 400, { error: `Najednou nahrajte nejvýše ${EMPLOYEE_DOCUMENT_IMPORT_MAX_FILES} souborů.`, apiStatus: "ready" });
        return true;
      }
      const tooLarge = importFiles.find((file) => file.size > EMPLOYEE_DOCUMENT_IMPORT_MAX_FILE_SIZE_BYTES);
      if (tooLarge) {
        sendJson(response, 400, { error: `Soubor ${tooLarge.name || ""} je příliš velký. Maximum je 10 MB.`, apiStatus: "ready" });
        return true;
      }
      if (totalSize > EMPLOYEE_DOCUMENT_IMPORT_MAX_TOTAL_BYTES) {
        sendJson(response, 400, { error: "Soubory jsou dohromady příliš velké. Maximum je 80 MB.", apiStatus: "ready" });
        return true;
      }

      const preview = buildEmployeeDocumentImportPreview(importFiles, visibleMockEmployees(user));
      const documents = [];
      let skippedCount = 0;

      for (const row of preview.rows) {
        const file = importFiles[row.index];
        if (!file || row.status !== "ready" || !row.employeeId) {
          skippedCount += 1;
          continue;
        }

        const now = new Date().toISOString();
        const documentId = `employee-document-${randomUUID()}`;
        const document = {
          id: documentId,
          employeeId: row.employeeId,
          type: row.documentType || "Ostatní",
          name: row.documentName || file.name || "Dokument",
          fileUrl: `/api/employees/${encodeURIComponent(row.employeeId)}/documents/${encodeURIComponent(documentId)}`,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.buffer.length,
          uploadedAt: now,
          uploadedByUserId: user.id,
          expiresAt: "",
          note: `Hromadný import dokumentů z Pinya exportu. Párování: ${row.matchMethod || "název souboru"}.`,
          employeeName: row.employeeName,
          importStatus: "imported"
        };

        mockEmployeeDocumentFiles.set(documentId, {
          employeeId: row.employeeId,
          name: document.name,
          type: document.contentType,
          buffer: file.buffer
        });
        mockEmployeeDocuments.set(row.employeeId, [document, ...(mockEmployeeDocuments.get(row.employeeId) || [])]);
        documents.push(document);
      }

      sendJson(response, 201, {
        result: {
          preview,
          documents,
          summary: {
            ...preview.summary,
            importedCount: documents.length,
            skippedCount
          },
          apiStatus: "ready"
        },
        apiStatus: "ready"
      });
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.message || "Import dokumentů se teď nepodařilo uložit.",
        apiStatus: "waiting"
      });
    }
    return true;
  }

  const employeeDocumentMatch = /^\/api\/employees\/([^/]+)\/documents$/.exec(url.pathname);
  const employeeDocumentFileMatch = /^\/api\/employees\/([^/]+)\/documents\/([^/]+)$/.exec(url.pathname);

  if (employeeDocumentFileMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const employee = findMockEmployee(user, decodeURIComponent(employeeDocumentFileMatch[1]));
    if (!employee) {
      sendJson(response, 404, { error: "Zaměstnanec nebyl nalezen." });
      return true;
    }

    const documentId = decodeURIComponent(employeeDocumentFileMatch[2]);
    const file = mockEmployeeDocumentFiles.get(documentId);
    if (!file || file.employeeId !== employee.id) {
      sendJson(response, 404, { error: "Dokument nebyl nalezen." });
      return true;
    }

    response.writeHead(200, {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name || "dokument")}`,
      "Cache-Control": "no-store"
    });
    response.end(file.buffer);
    return true;
  }

  if (employeeDocumentMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const id = decodeURIComponent(employeeDocumentMatch[1]);
    const employee = findMockEmployee(user, id);
    if (!employee) {
      sendJson(response, 404, { error: "Zaměstnanec nebyl nalezen." });
      return true;
    }

    sendJson(response, 200, {
      documents: mockEmployeeDocuments.get(employee.id) || [],
      apiStatus: "ready",
      uploadStatus: "ready",
      missingEndpoint: ""
    });
    return true;
  }

  if (employeeDocumentMatch && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view") || !canEditMockEmployee(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const employee = findMockEmployee(user, decodeURIComponent(employeeDocumentMatch[1]));
    if (!employee) {
      sendJson(response, 404, { error: "Zaměstnanec nebyl nalezen." });
      return true;
    }

    const { fields, files } = await readMultipartFormData(request);
    const file = files.get("file");
    if (!file || !file.buffer?.length) {
      sendJson(response, 400, { error: "Vyberte soubor dokumentu." });
      return true;
    }

    if (file.buffer.length > 10 * 1024 * 1024) {
      sendJson(response, 400, { error: "Soubor je příliš velký. Maximum je 10 MB." });
      return true;
    }

    const now = new Date().toISOString();
    const documentId = `employee-document-${randomUUID()}`;
    const document = {
      id: documentId,
      employeeId: employee.id,
      type: fields.get("type") || "Ostatní",
      name: fields.get("name") || file.name || "Dokument",
      fileUrl: `/api/employees/${encodeURIComponent(employee.id)}/documents/${encodeURIComponent(documentId)}`,
      contentType: file.type,
      sizeBytes: file.buffer.length,
      uploadedAt: now,
      uploadedByUserId: user.id,
      expiresAt: fields.get("expiresAt") || "",
      note: fields.get("note") || ""
    };

    mockEmployeeDocumentFiles.set(documentId, {
      employeeId: employee.id,
      name: document.name,
      type: document.contentType,
      buffer: file.buffer
    });
    mockEmployeeDocuments.set(employee.id, [document, ...(mockEmployeeDocuments.get(employee.id) || [])]);
    sendJson(response, 201, { document, apiStatus: "ready", uploadStatus: "ready" });
    return true;
  }

  const employeeWorkHistoryItemMatch = /^\/api\/employees\/([^/]+)\/work-history\/([^/]+)$/.exec(url.pathname);
  if (employeeWorkHistoryItemMatch && request.method === "PATCH") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view") || !canEditMockEmployee(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const employee = findMockEmployee(user, decodeURIComponent(employeeWorkHistoryItemMatch[1]));
    if (!employee) {
      sendJson(response, 404, { error: "Zaměstnanec nebyl nalezen." });
      return true;
    }

    const historyId = decodeURIComponent(employeeWorkHistoryItemMatch[2]);
    const items = employeeWorkHistory(employee.id);
    const existingIndex = items.findIndex((item) => sameMockId(item.id, historyId));
    if (existingIndex < 0) {
      sendJson(response, 404, { error: "Záznam pracovní historie nebyl nalezen." });
      return true;
    }

    const payload = await readJsonBody(request);
    const updated = {
      ...items[existingIndex],
      ...payload,
      id: items[existingIndex].id,
      employeeId: employee.id,
      updatedAt: new Date().toISOString()
    };
    const nextItems = [...items.slice(0, existingIndex), updated, ...items.slice(existingIndex + 1)];
    mockEmployeeWorkHistory.set(employee.id, nextItems);
    sendJson(response, 200, { item: updated });
    return true;
  }

  const employeeWorkHistoryMatch = /^\/api\/employees\/([^/]+)\/work-history$/.exec(url.pathname);
  if (employeeWorkHistoryMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const employee = findMockEmployee(user, decodeURIComponent(employeeWorkHistoryMatch[1]));
    if (!employee) {
      sendJson(response, 404, { error: "Zaměstnanec nebyl nalezen." });
      return true;
    }

    sendJson(response, 200, { items: employeeWorkHistory(employee.id), apiStatus: "ready" });
    return true;
  }

  if (employeeWorkHistoryMatch && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view") || !canEditMockEmployee(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const employee = findMockEmployee(user, decodeURIComponent(employeeWorkHistoryMatch[1]));
    if (!employee) {
      sendJson(response, 404, { error: "Zaměstnanec nebyl nalezen." });
      return true;
    }

    const now = new Date().toISOString();
    const payload = await readJsonBody(request);
    const item = {
      id: `work-history-${randomUUID()}`,
      employeeId: employee.id,
      dateFrom: payload.dateFrom || "",
      dateTo: payload.dateTo || "",
      position: payload.position || "",
      department: payload.department || "",
      note: payload.note || "",
      createdAt: now,
      updatedAt: now
    };
    mockEmployeeWorkHistory.set(employee.id, [item, ...employeeWorkHistory(employee.id)]);
    sendJson(response, 201, { item });
    return true;
  }

  const employeeVacationMatch = /^\/api\/employees\/([^/]+)\/vacation-balance$/.exec(url.pathname);
  if (employeeVacationMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const employee = findMockEmployee(user, decodeURIComponent(employeeVacationMatch[1]));
    if (!employee) {
      sendJson(response, 404, { error: "Zaměstnanec nebyl nalezen." });
      return true;
    }

    sendJson(response, 200, {
      employeeId: employee.id,
      year: new Date().getFullYear(),
      vacationEntitlementDays: employee.vacationEntitlementDays,
      vacationUsedDays: employee.vacationUsedDays,
      vacationPendingDays: employee.vacationPendingDays,
      vacationRemainingDays: employee.vacationRemainingDays,
      apiStatus: "ready"
    });
    return true;
  }

  const employeeAbsenceMatch = /^\/api\/employees\/([^/]+)\/absence$/.exec(url.pathname);
  if (employeeAbsenceMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const employee = findMockEmployee(user, decodeURIComponent(employeeAbsenceMatch[1]));
    if (!employee) {
      sendJson(response, 404, { error: "Zaměstnanec nebyl nalezen." });
      return true;
    }

    const items = mockAbsenceRequests
      .filter((item) => sameMockId(item.employeeId, employee.id))
      .filter((item) => canViewMockAbsenceRequest(user, item))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const history = items.flatMap((item) => item.history || []);

    sendJson(response, 200, {
      status: items[0]?.statusLabel || employee.currentAbsenceStatus,
      sickDaysCurrentYear: employee.sickDaysCurrentYear,
      lastAbsenceDate: items[0]?.dateFrom || employee.lastAbsenceDate,
      items,
      history,
      apiStatus: "ready",
      note: items.length ? "Historie nepřítomností je načtená z vývojového API." : "Zatím tu nejsou žádné žádosti."
    });
    return true;
  }

  const employeeMedicalExamMatch = /^\/api\/employees\/([^/]+)\/medical-exam$/.exec(url.pathname);
  if (employeeMedicalExamMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view") || !canManageMockMedicalExam(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění zobrazit lékařské prohlídky." });
      return true;
    }

    const employee = findMockEmployee(user, decodeURIComponent(employeeMedicalExamMatch[1]));
    if (!employee) {
      sendJson(response, 404, { error: "Zaměstnanec nebyl nalezen." });
      return true;
    }

    sendJson(response, 200, { medicalExam: mockMedicalExamForEmployee(employee), apiStatus: "ready" });
    return true;
  }

  if (employeeMedicalExamMatch && request.method === "PATCH") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view") || !canManageMockMedicalExam(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění upravit lékařské prohlídky." });
      return true;
    }

    const employee = findMockEmployee(user, decodeURIComponent(employeeMedicalExamMatch[1]));
    if (!employee) {
      sendJson(response, 404, { error: "Zaměstnanec nebyl nalezen." });
      return true;
    }

    try {
      const medicalExam = saveMockMedicalExam(user, employee, await readJsonBody(request));
      sendJson(response, 200, { medicalExam, apiStatus: "ready" });
    } catch (error) {
      sendJson(response, error.status || 400, { error: error.message || "Lékařskou prohlídku se nepodařilo uložit." });
    }
    return true;
  }

  const employeeMedicalExamRequestMatch = /^\/api\/employees\/([^/]+)\/medical-exam-request$/.exec(url.pathname);
  if (employeeMedicalExamRequestMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "export") || !canManageMockMedicalExam(user)) {
      sendJson(response, 403, { error: "Nemáte oprávnění exportovat žádost o zdravotní způsobilost." });
      return true;
    }

    const employee = findMockEmployee(user, decodeURIComponent(employeeMedicalExamRequestMatch[1]));
    if (!employee) {
      sendJson(response, 404, { error: "Zaměstnanec nebyl nalezen." });
      return true;
    }

    const mode = url.searchParams.get("mode") === "print" ? "print" : "download";
    const medicalExam = mockMedicalExamForEmployee(employee);
    const html = renderMedicalExamRequestDocument({ employee, exam: medicalExam, mode });
    mockNotificationLogs = [{
      id: `employee-document-audit-${randomUUID()}`,
      type: "employee_document_audit",
      channel: "system",
      status: "completed",
      subject: mode === "print" ? "Tisk žádosti o zdravotní způsobilost" : "Export žádosti o zdravotní způsobilost",
      recipient: user.email || "",
      recipientName: user.name || user.email || "",
      messagePreview: `${mode === "print" ? "Tisk" : "Export"} dokumentu pro zaměstnance ${fullEmployeeName(employee)}`,
      createdAt: new Date().toISOString()
    }, ...mockNotificationLogs].slice(0, 500);
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Disposition": mode === "download"
        ? `attachment; filename="zadost-zdravotni-zpusobilost-${employee.id}.html"`
        : "inline"
    });
    response.end(html);
    return true;
  }

  const employeeDetailMatch = /^\/api\/employees\/([^/]+)$/.exec(url.pathname);
  if (employeeDetailMatch && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    const employee = findMockEmployee(user, decodeURIComponent(employeeDetailMatch[1]));
    if (!employee) {
      sendJson(response, 404, { error: "Zaměstnanec nebyl nalezen." });
      return true;
    }

    sendJson(response, 200, { employee, apiStatus: "ready" });
    return true;
  }

  if (employeeDetailMatch && request.method === "PATCH") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "absence", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    try {
      const employee = saveMockEmployee(user, decodeURIComponent(employeeDetailMatch[1]), await readJsonBody(request));
      sendJson(response, 200, { employee });
    } catch (error) {
      sendJson(response, error.status || 400, { error: error.message || "Kartu zaměstnance se nepodařilo uložit." });
    }
    return true;
  }

  if (url.pathname === "/api/users" && request.method === "GET") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "users", "view")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }
    sendJson(response, 200, { users: mockUsers.map(publicUser) });
    return true;
  }

  if (url.pathname === "/api/users" && request.method === "POST") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "users", "edit")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    try {
      const rawPayload = await readJsonBody(request);
      const payload = normalizeManagerPayload(rawPayload, rawPayload?.id || "", user);
      const savedUser = upsertMockUser(payload);
      sendJson(response, 201, { user: publicUser(savedUser) });
    } catch (error) {
      sendJson(response, error.status || 400, { error: error.message || "Uživatele se nepodařilo uložit." });
    }
    return true;
  }

  const userPatchMatch = /^\/api\/users\/([^/]+)$/.exec(url.pathname);
  if (userPatchMatch && request.method === "PATCH") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "users", "edit")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    try {
      const id = decodeURIComponent(userPatchMatch[1]);
      const existingUser = findMockUser(id);
      if (!existingUser) {
        sendJson(response, 404, { error: "Uživatel nebyl nalezen." });
        return true;
      }
      const payload = normalizeManagerPayload(await readJsonBody(request), id, user, existingUser);
      const blockedMessage = blocksCurrentDevUser(user, payload, id);

      if (blockedMessage) {
        sendJson(response, 400, { error: blockedMessage });
        return true;
      }

      const savedUser = upsertMockUser(payload, id);
      sendJson(response, 200, { user: publicUser(savedUser) });
    } catch (error) {
      sendJson(response, error.status || 400, { error: error.message || "Uživatele se nepodařilo uložit." });
    }
    return true;
  }

  const userDisableMatch = /^\/api\/users\/([^/]+)\/disable$/.exec(url.pathname);
  if (userDisableMatch && request.method === "PATCH") {
    const user = currentDevUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Nepřihlášeno." });
      return true;
    }
    if (!hasPermission(user, "users", "edit")) {
      sendJson(response, 403, { error: "Nemáte oprávnění." });
      return true;
    }

    try {
      const id = decodeURIComponent(userDisableMatch[1]);
      const existingUser = findMockUser(id);

      if (!existingUser) {
        sendJson(response, 404, { error: "Uživatel nebyl nalezen." });
        return true;
      }

      const blockedMessage = blocksCurrentDevUser(user, { ...existingUser, active: false }, id);
      if (blockedMessage) {
        sendJson(response, 400, { error: blockedMessage });
        return true;
      }

      const savedUser = upsertMockUser({ ...existingUser, active: false, status: "disabled" }, id);
      sendJson(response, 200, { user: publicUser(savedUser) });
    } catch (error) {
      sendJson(response, error.status || 400, { error: error.message || "Stav uživatele se nepodařilo uložit." });
    }
    return true;
  }

  sendJson(response, 404, { error: "API endpoint neexistuje." });
  return true;
}

async function sendBuildMetaModule(response) {
  response.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(buildMetaModuleSource(await resolveBuildMeta(root)));
}

function sendRuntimeConfigModule(response) {
  response.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(runtimeConfigModuleSource());
}

const server = createServer(async (request, response) => {
  if (await handleApi(request, response)) {
    return;
  }

  const requestPath = new URL(request.url || "/", "http://localhost").pathname;
  if (requestPath === "/src/data/buildMeta.js") {
    await sendBuildMetaModule(response);
    return;
  }

  if (requestPath === "/src/data/runtimeConfig.js") {
    sendRuntimeConfigModule(response);
    return;
  }

  const filePath = await resolveFile(request.url || "/");
  const extension = path.extname(filePath);
  response.setHeader("Content-Type", contentTypes.get(extension) || "application/octet-stream");
  createReadStream(filePath).pipe(response);
});

const port = await pickPort(preferredPort);

server.listen(port, "127.0.0.1", () => {
  console.log(`Smart odpady bezi na http://127.0.0.1:${port}/`);
});
