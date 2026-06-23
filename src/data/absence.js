import { hasPermission, normalizeRole } from "../permissions.js";

export const ABSENCE_REPORT_EMAIL = "kancelar@kaiserservis.cz";
export const ABSENCE_REPORT_DAY = 1;
export const ABSENCE_REPORT_TIME = "06:00";

export const ABSENCE_TYPES = ["Dovolená", "Nemoc", "Lékař", "OČR", "Náhradní volno"];
export const ABSENCE_STATUSES = [
  "Rozpracováno",
  "Čeká na schválení",
  "Schváleno",
  "Zamítnuto",
  "Zrušeno",
  "Evidováno"
];
export const ABSENCE_APPROVAL_TYPES = new Set(["Dovolená", "Lékař", "OČR", "Náhradní volno"]);
export const ABSENCE_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "quick", label: "Rychlé zadání" },
  { id: "my", label: "Moje žádosti" },
  { id: "new", label: "Nová žádost" },
  { id: "approval", label: "Ke schválení" },
  { id: "calendar", label: "Kalendář" },
  { id: "employee-card", label: "Karta zaměstnance" },
  { id: "reports", label: "Reporty" },
  { id: "settings", label: "Nastavení" }
];

export const ABSENCE_STATUS_TONES = {
  Rozpracováno: "new",
  "Nová žádost": "new",
  "Čeká na schválení": "pending",
  Schváleno: "approved",
  Zamítnuto: "rejected",
  Zrušeno: "cancelled",
  Evidováno: "recorded",
  draft: "new",
  pending_approval: "pending",
  approved: "approved",
  rejected: "rejected",
  cancelled: "cancelled",
  recorded: "recorded"
};

export const ABSENCE_TYPE_TONES = {
  Dovolená: "vacation",
  Nemoc: "illness",
  Lékař: "doctor",
  OČR: "care",
  "Náhradní volno": "timeoff",
  vacation: "vacation",
  sick: "illness",
  doctor: "doctor",
  care: "care",
  compensatory_leave: "timeoff"
};

export const ABSENCE_API_STATUS_LABELS = {
  draft: "Rozpracováno",
  pending: "Čeká na schválení",
  pending_approval: "Čeká na schválení",
  approved: "Schváleno",
  rejected: "Zamítnuto",
  cancelled: "Zrušeno",
  recorded: "Evidováno"
};

export const ABSENCE_API_TYPE_LABELS = {
  vacation: "Dovolená",
  sick: "Nemoc",
  doctor: "Lékař",
  care: "OČR",
  compensatory_leave: "Náhradní volno"
};

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, "0");
}

export function toIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function currentMonthKey() {
  return toIsoDate(new Date()).slice(0, 7);
}

function monthKeyWithOffset(offset) {
  const now = new Date();
  return toIsoDate(new Date(now.getFullYear(), now.getMonth() + offset, 1)).slice(0, 7);
}

function isoNow() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function dateNumber(value) {
  return Number(String(value || "").replaceAll("-", ""));
}

export function countAbsenceDays(dateFrom, dateTo, halfDayFrom = false, halfDayTo = false) {
  if (!dateFrom || !dateTo) {
    return 0;
  }

  const from = new Date(`${dateFrom}T12:00:00`);
  const to = new Date(`${dateTo}T12:00:00`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return 0;
  }

  let days = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;

  if (halfDayFrom) {
    days -= 0.5;
  }

  if (halfDayTo && dateTo !== dateFrom) {
    days -= 0.5;
  } else if (halfDayTo && !halfDayFrom) {
    days -= 0.5;
  }

  return Math.max(0.5, days);
}

export function initialStatusForAbsenceType(type) {
  return ABSENCE_APPROVAL_TYPES.has(type) ? "Čeká na schválení" : "Evidováno";
}

export function absenceStatusLabel(status) {
  return ABSENCE_API_STATUS_LABELS[status] || status || "";
}

export function absenceTypeLabel(type) {
  return ABSENCE_API_TYPE_LABELS[type] || type || "";
}

export function employeeIdForUser(user) {
  const fallback = user?.email || user?.name || "uzivatel";
  return String(user?.id || fallback)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "uzivatel";
}

function currentUserEmployee(user) {
  return {
    id: employeeIdForUser(user),
    name: user?.name || user?.email || "Uživatel",
    email: user?.email || "",
    role: user?.role || "ridic",
    department: user?.department || "Provoz",
    team: user?.department || "Provoz"
  };
}

export function normalizeAbsenceSettings(input = {}, options = {}) {
  const parsedReportDay = Number(input.reportDay || ABSENCE_REPORT_DAY);
  const reportDay = Number.isFinite(parsedReportDay)
    ? Math.max(1, Math.min(parsedReportDay, 28))
    : ABSENCE_REPORT_DAY;
  const reportTime = /^\d{2}:\d{2}$/.test(String(input.reportTime || ""))
    ? String(input.reportTime)
    : ABSENCE_REPORT_TIME;

  return {
    recipientEmail: String(input.recipientEmail || ABSENCE_REPORT_EMAIL).trim() || ABSENCE_REPORT_EMAIL,
    reportDay,
    reportTime,
    emailProvider: String(input.emailProvider || "").trim(),
    updatedAt: String(options.updatedAt || input.updatedAt || "").trim(),
    updatedByUserId: String(options.updatedByUserId || input.updatedByUserId || "").trim()
  };
}

export function sameAbsenceSettings(left, right) {
  function comparable(value) {
    const settings = normalizeAbsenceSettings(value);
    return {
      recipientEmail: settings.recipientEmail,
      reportDay: settings.reportDay,
      reportTime: settings.reportTime,
      emailProvider: settings.emailProvider
    };
  }

  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

function initialAbsenceState() {
  return {
    version: 1,
    requests: [],
    balances: [],
    history: [],
    reports: [],
    settings: normalizeAbsenceSettings()
  };
}

function normalizeAbsenceState(state) {
  const initial = initialAbsenceState();

  return {
    ...initial,
    ...(state || {}),
    requests: Array.isArray(state?.requests) ? state.requests : initial.requests,
    balances: Array.isArray(state?.balances) ? state.balances : initial.balances,
    history: Array.isArray(state?.history) ? state.history : initial.history,
    reports: Array.isArray(state?.reports) ? state.reports : initial.reports,
    settings: normalizeAbsenceSettings(state?.settings || initial.settings)
  };
}

export function loadAbsenceState() {
  return initialAbsenceState();
}

export function saveAbsenceState(state) {
  return normalizeAbsenceState(state);
}

export function absenceEmployeeOptions(state, user) {
  const employees = new Map();
  const currentEmployee = currentUserEmployee(user);

  employees.set(currentEmployee.id, currentEmployee);
  state.requests.forEach((request) => {
    employees.set(request.employeeId, {
      id: request.employeeId,
      name: request.employeeName,
      email: "",
      role: "ridic",
      department: request.department || "Provoz",
      team: request.team || request.department || "Provoz"
    });
  });

  return [...employees.values()].sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

export function canSeeAllAbsences(user) {
  return (
    hasPermission(user, "absence", "edit") ||
    hasPermission(user, "absence", "export") ||
    normalizeRole(user?.role) === "readonly"
  );
}

export function canApproveAbsences(user) {
  return hasPermission(user, "absence", "approve");
}

export function canSubmitAbsenceForOthers(user) {
  return hasPermission(user, "absence", "edit") || hasPermission(user, "absence", "manage");
}

export function canCancelAbsence(request, user) {
  const ownRequest = request.employeeId === employeeIdForUser(user);
  const status = absenceStatusLabel(request.statusLabel || request.status);
  const cancellableStatus = ["Rozpracováno", "Nová žádost", "Čeká na schválení"].includes(status);

  return cancellableStatus && (ownRequest || canSeeAllAbsences(user));
}

export function canApproveAbsence(request, user) {
  const status = absenceStatusLabel(request.statusLabel || request.status);
  if (status !== "Čeká na schválení") {
    return false;
  }

  const employeeId = employeeIdForUser(user);
  if (request.employeeId === employeeId || request.employeeId === user?.id) {
    return false;
  }

  if (canSeeAllAbsences(user) && canApproveAbsences(user)) {
    return true;
  }

  if (request.approverUserId === employeeId || request.managerId === user?.id || request.managerId === employeeId) {
    return true;
  }

  return canApproveAbsences(user) && (request.team === user?.department || request.department === user?.department);
}

export function visibleAbsenceRequests(state, user) {
  const requests = [...state.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (canSeeAllAbsences(user)) {
    return requests;
  }

  const employeeId = employeeIdForUser(user);

  if (canApproveAbsences(user)) {
    return requests.filter((request) => (
      request.employeeId === employeeId ||
      request.approverUserId === employeeId ||
      request.team === user?.department ||
      request.department === user?.department
    ));
  }

  return requests.filter((request) => request.employeeId === employeeId);
}

export function approvalAbsenceRequests(state, user) {
  return visibleAbsenceRequests(state, user).filter((request) => canApproveAbsence(request, user));
}

export function ownAbsenceRequests(state, user) {
  const employeeId = employeeIdForUser(user);
  return state.requests
    .filter((request) => request.employeeId === employeeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function requestOverlapsDate(request, isoDate) {
  const date = dateNumber(isoDate);
  return dateNumber(request.dateFrom) <= date && date <= dateNumber(request.dateTo);
}

export function requestOverlapsMonth(request, monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;

  return dateNumber(request.dateFrom) <= dateNumber(monthEnd) && dateNumber(request.dateTo) >= dateNumber(monthStart);
}

export function filterAbsenceRequests(requests, filters = {}) {
  return requests.filter((request) => {
    if (filters.type && absenceTypeLabel(request.typeLabel || request.type) !== filters.type) {
      return false;
    }

    if (filters.employeeId && request.employeeId !== filters.employeeId) {
      return false;
    }

    if (filters.month && !requestOverlapsMonth(request, filters.month)) {
      return false;
    }

    return true;
  });
}

export function absenceBalanceForEmployee(state, employeeId) {
  const year = new Date().getFullYear();
  const balance = state.balances.find((item) => item.employeeId === employeeId && item.year === year);

  return balance || {
    id: `absence-balance-${employeeId}-${year}`,
    employeeId,
    year,
    vacationEntitlementDays: null,
    vacationUsedDays: null,
    vacationPendingDays: null,
    vacationRemainingDays: null,
    updatedAt: ""
  };
}

export function absenceSummary(state, user) {
  const requests = visibleAbsenceRequests(state, user);
  const month = currentMonthKey();
  const today = toIsoDate(new Date());
  const activeStatuses = new Set(["Čeká na schválení", "Schváleno", "Evidováno"]);
  const currentMonthRequests = requests.filter((request) => requestOverlapsMonth(request, month));
  const upcoming = requests
    .filter((request) => dateNumber(request.dateFrom) >= dateNumber(today) && activeStatuses.has(absenceStatusLabel(request.statusLabel || request.status)))
    .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom))
    .slice(0, 6);

  return {
    pendingCount: requests.filter((request) => absenceStatusLabel(request.statusLabel || request.status) === "Čeká na schválení").length,
    approvedVacationThisMonth: currentMonthRequests.filter((request) => absenceTypeLabel(request.typeLabel || request.type) === "Dovolená" && absenceStatusLabel(request.statusLabel || request.status) === "Schváleno").length,
    illnessThisMonth: currentMonthRequests.filter((request) => absenceTypeLabel(request.typeLabel || request.type) === "Nemoc").length,
    peopleOutToday: requests.filter((request) => activeStatuses.has(absenceStatusLabel(request.statusLabel || request.status)) && requestOverlapsDate(request, today)),
    upcoming
  };
}

export function generateMonthlyAbsenceReport(state, user) {
  const periodKey = monthKeyWithOffset(-1);
  const [periodYear, periodMonth] = periodKey.split("-").map(Number);
  const requests = filterAbsenceRequests(state.requests, { month: periodKey });
  const report = {
    id: newId("absence-report"),
    periodMonth,
    periodYear,
    recipientEmail: state.settings.recipientEmail || ABSENCE_REPORT_EMAIL,
    generatedAt: isoNow(),
    sentAt: null,
    status: "vygenerováno v prohlížeči",
    csvUrl: `local://absence-report-${periodKey}.csv`,
    pdfUrl: "",
    errorMessage: "",
    generatedByUserId: employeeIdForUser(user)
  };

  return {
    report,
    requests
  };
}

export function monthlyAbsenceTotals(requests) {
  return ABSENCE_TYPES.reduce((totals, type) => {
    totals[type] = requests
      .filter((request) => absenceTypeLabel(request.typeLabel || request.type) === type)
      .reduce((sum, request) => sum + Number(request.daysCount || 0), 0);
    return totals;
  }, {});
}

function csvCell(value) {
  const text = String(value ?? "");

  if (/[",\n;]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function csvRow(values) {
  return values.map(csvCell).join(";");
}

export function absenceRequestsToCsv(requests) {
  const rows = [
    ["Zaměstnanec", "Typ", "Od", "Do", "Dny", "Stav", "Poznámka"],
    ...requests.map((request) => [
      request.employeeName,
      absenceTypeLabel(request.typeLabel || request.type),
      request.dateFrom,
      request.dateTo,
      request.daysCount,
      absenceStatusLabel(request.statusLabel || request.status),
      request.note
    ])
  ];

  return `\uFEFF${rows.map(csvRow).join("\n")}`;
}

export function monthlyAbsenceReportToCsv(report, requests) {
  const totals = monthlyAbsenceTotals(requests);
  const pendingCount = requests.filter((request) => absenceStatusLabel(request.statusLabel || request.status) === "Čeká na schválení").length;
  const period = `${pad(report.periodMonth)}/${report.periodYear}`;
  const rows = [
    ["Období reportu", period],
    ["Příjemce", report.recipientEmail],
    ["Vygenerováno", report.generatedAt],
    ["Počet žádostí celkem", requests.length],
    ["Dovolená celkem dnů", totals.Dovolená],
    ["Nemoc celkem dnů", totals.Nemoc],
    ["Lékař celkem dnů", totals.Lékař],
    ["OČR celkem dnů", totals.OČR],
    ["Náhradní volno celkem dnů", totals["Náhradní volno"]],
    ["Čekající žádosti", pendingCount],
    [],
    ["Zaměstnanec", "Typ", "Od", "Do", "Počet dnů", "Stav"],
    ...requests.map((request) => [
      request.employeeName,
      absenceTypeLabel(request.typeLabel || request.type),
      request.dateFrom,
      request.dateTo,
      request.daysCount,
      absenceStatusLabel(request.statusLabel || request.status)
    ])
  ];

  return `\uFEFF${rows.map(csvRow).join("\n")}`;
}
