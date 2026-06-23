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
import { DEFAULT_THEME_SETTINGS, normalizeThemeSettings } from "../src/data/themeSettings.js";
import { hasPermission, isFullAccessRole, normalizeRole } from "../src/permissions.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedRoot = process.argv[2] === "dist" ? "dist" : ".";
const publicRoot = path.join(root, requestedRoot);
const preferredPort = Number(process.env.PORT || 5173);
const devCookieName = "smart_odpady_dev_session";
const devSessions = new Map();
let mockUsers = DEFAULT_USERS.map((user) => ({ ...user }));
let mockThemeSettings = normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
let mockEmployeeCards = new Map();
let mockEmployeeWorkHistory = new Map();
let mockEmployeeDocuments = new Map();
let mockEmployeeDocumentFiles = new Map();
let mockAbsenceRequests = [];

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".ts", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

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
    role: normalizeRole(override.role ?? user.role),
    department: override.department ?? user.department ?? "",
    position: override.position ?? user.position ?? "",
    managerId,
    managerName: managerId ? (manager?.name || override.managerName || "") : "",
    employmentStatus: override.employmentStatus ?? (user.active === false ? "inactive" : "active"),
    startDate: override.startDate ?? "",
    employmentType: override.employmentType ?? "",
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

const MOCK_ABSENCE_TYPE_LABELS = {
  vacation: "Dovolená",
  sick: "Nemoc",
  doctor: "Lékař",
  care: "OČR",
  compensatory_leave: "Náhradní volno"
};

const MOCK_ABSENCE_STATUS_LABELS = {
  pending: "Čeká na schválení",
  recorded: "Evidováno"
};

function mockIsoDate(value) {
  const cleaned = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : "";
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

function canViewMockAbsenceRequest(currentUser, requestItem) {
  const role = normalizeRole(currentUser?.role);

  if (isFullAccessRole(currentUser) || role === "kancelar" || role === "readonly") {
    return true;
  }

  if (sameMockId(currentUser?.id, requestItem.employeeId)) {
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
  const type = String(payload?.type || "").trim();
  const status = String(payload?.status || "").trim();
  const dateFrom = mockIsoDate(payload?.dateFrom);
  const dateTo = mockIsoDate(payload?.dateTo) || dateFrom;
  const halfDay = Boolean(payload?.halfDay);

  if (!Object.hasOwn(MOCK_ABSENCE_TYPE_LABELS, type)) {
    const error = new Error("Vyberte typ nepřítomnosti.");
    error.status = 400;
    throw error;
  }

  if (!Object.hasOwn(MOCK_ABSENCE_STATUS_LABELS, status)) {
    const error = new Error("Vyberte platný stav žádosti.");
    error.status = 400;
    throw error;
  }

  if (!dateFrom || countMockAbsenceDays(dateFrom, dateTo, halfDay) <= 0) {
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

  return {
    id: `absence-request-${randomUUID()}`,
    employeeId: employee.id,
    employeeName: employee.name || currentUser.name || "Uživatel",
    type,
    typeLabel: MOCK_ABSENCE_TYPE_LABELS[type],
    dateFrom,
    dateTo,
    halfDay,
    note: String(payload?.note || "").trim(),
    status,
    statusLabel: MOCK_ABSENCE_STATUS_LABELS[status],
    daysCount: countMockAbsenceDays(dateFrom, dateTo, halfDay),
    managerId: employee.managerId || "",
    managerName: employee.managerName || manager?.name || "",
    approverUserId: employee.managerId || "",
    department: employee.department || currentUser.department || "",
    team: employee.team || employee.department || currentUser.department || "",
    createdByUserId: currentUser.id,
    createdAt: now,
    updatedAt: now
  };
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
      sendJson(response, 201, { request: item, apiStatus: "ready" });
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.message || "Nepodařilo se odeslat. Zkuste to znovu.",
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

    sendJson(response, 200, {
      status: employee.currentAbsenceStatus,
      sickDaysCurrentYear: employee.sickDaysCurrentYear,
      lastAbsenceDate: employee.lastAbsenceDate,
      items: [],
      apiStatus: "ready",
      note: "Detailní historie absencí čeká na samostatné cloudové API nepřítomností."
    });
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

const server = createServer(async (request, response) => {
  if (await handleApi(request, response)) {
    return;
  }

  const requestPath = new URL(request.url || "/", "http://localhost").pathname;
  if (requestPath === "/src/data/buildMeta.js") {
    await sendBuildMetaModule(response);
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
