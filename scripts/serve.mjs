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
  TcarsClientError,
  loadFleetVehiclesPayload,
  loadTcarsStatusPayload,
  loadTcarsVehiclesPayload,
  syncTcarsLocations,
} from "../functions/_lib/tcars-client.js";
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
let mockModuleFeedback = [];
let mockNotificationLogs = [];
let mockAssistantDailyPromos = new Map();

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

function mockDataBoxStatusPayload() {
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
      lastSyncAt: "",
      lastSyncStatus: "waiting",
      lastSyncMessage: "ISDS integrace neni aktivni.",
      createdAt: "",
      updatedAt: ""
    },
    summary: {
      received: 0,
      sent: 0,
      attachments: 0,
      syncRuns: 0,
      lastSyncAt: ""
    },
    message: "Lokalni dev API je pripravene, ostre ISDS napojeni neni aktivni."
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
  return mockUsers
    .map(mockEmployeeFromUser)
    .filter((employee) => canViewMockEmployee(currentUser, employee))
    .sort((a, b) => fullEmployeeName(a).localeCompare(fullEmployeeName(b), "cs"));
}

function findMockEmployee(currentUser, id) {
  const user = findMockUser(id);

  if (!user) {
    return null;
  }

  const employee = mockEmployeeFromUser(user);
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

    sendJson(response, 200, await loadFleetVehiclesPayload(process.env));
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

    sendJson(response, 200, { runs: [], apiStatus: "ready" });
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
      assistantId: assistant === "Marek" ? "marek" : "sarlota",
      assistantName: assistant,
      configured: false,
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
