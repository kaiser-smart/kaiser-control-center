import { hasPermission, normalizeRole } from "../permissions.js";

export const ABSENCE_STORAGE_KEY = "smart-odpady-absence-v1";
export const ABSENCE_REPORT_EMAIL = "kancelar@kaiserservis.cz";
export const ABSENCE_REPORT_DAY = 1;
export const ABSENCE_REPORT_TIME = "06:00";

export const ABSENCE_TYPES = ["Dovolená", "Nemoc", "Lékař", "OČR", "Náhradní volno"];
export const ABSENCE_STATUSES = [
  "Nová žádost",
  "Čeká na schválení",
  "Schváleno",
  "Zamítnuto",
  "Zrušeno",
  "Evidováno"
];
export const ABSENCE_APPROVAL_TYPES = new Set(["Dovolená", "Lékař", "Náhradní volno"]);
export const ABSENCE_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "my", label: "Moje žádosti" },
  { id: "new", label: "Nová žádost" },
  { id: "approval", label: "Ke schválení" },
  { id: "calendar", label: "Kalendář" },
  { id: "employee-card", label: "Karta zaměstnance" },
  { id: "reports", label: "Reporty" },
  { id: "settings", label: "Nastavení" }
];

export const ABSENCE_STATUS_TONES = {
  "Nová žádost": "new",
  "Čeká na schválení": "pending",
  Schváleno: "approved",
  Zamítnuto: "rejected",
  Zrušeno: "cancelled",
  Evidováno: "recorded"
};

export const ABSENCE_TYPE_TONES = {
  Dovolená: "vacation",
  Nemoc: "illness",
  Lékař: "doctor",
  OČR: "care",
  "Náhradní volno": "timeoff"
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPLOYEE_ID_ALIASES = {
  "martin-bartos": "pneumatiky-martin-bartos",
  "lukas-malanik": "pneumatiky-lukas-malanik",
  "roman-drdlik": "pneumatiky-roman-drdlik"
};
const EMPLOYEE_NAME_ALIASES = {
  "pneumatiky-lukas-malanik": "Lukáš Malánik",
  "pneumatiky-martin-bartos": "Martin Bartoš",
  "pneumatiky-roman-drdlik": "Roman Drdlík"
};

const MOCK_EMPLOYEES = [
  {
    id: "radim-oplustil",
    name: "Radim Opluštil",
    email: "oplustil@kaiserservis.cz",
    role: "admin",
    department: "Vedení společnosti",
    team: "Vedení"
  },
  {
    id: "marcela-oplustilova",
    name: "Marcela Opluštilová",
    email: "kancelar@kaiserservis.cz",
    role: "management",
    department: "Finanční oddělení",
    team: "Kancelář"
  },
  {
    id: "lucie-jezkova",
    name: "Bc. Lucie Ježková, DiS.",
    email: "jezkova@kaiserservis.cz",
    role: "management",
    department: "Kancelář",
    team: "Kancelář"
  },
  {
    id: "pneumatiky-martin-bartos",
    name: "Martin Bartoš",
    email: "martin.bartos@kaiser.local",
    role: "ridic",
    department: "Provoz",
    team: "Svoz"
  },
  {
    id: "pneumatiky-lukas-malanik",
    name: "Lukáš Malánik",
    email: "lukas.malanik@kaiser.local",
    role: "ridic",
    department: "Provoz",
    team: "Svoz"
  },
  {
    id: "pneumatiky-roman-drdlik",
    name: "Roman Drdlík",
    email: "roman.drdlik@kaiser.local",
    role: "ridic",
    department: "Provoz",
    team: "Svoz"
  }
];

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

function dateInMonth(day, offset = 0) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return toIsoDate(date);
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

function canonicalEmployeeId(employeeId) {
  const id = String(employeeId || "").trim();
  return EMPLOYEE_ID_ALIASES[id] || id;
}

function normalizeStoredRequest(request) {
  const employeeId = canonicalEmployeeId(request.employeeId);
  const substituteUserId = canonicalEmployeeId(request.substituteUserId);
  const approverUserId = canonicalEmployeeId(request.approverUserId);

  return {
    ...request,
    employeeId,
    employeeName: EMPLOYEE_NAME_ALIASES[employeeId] || request.employeeName,
    substituteUserId,
    approverUserId
  };
}

function normalizeStoredBalance(balance) {
  return {
    ...balance,
    employeeId: canonicalEmployeeId(balance.employeeId)
  };
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

function seededRequests() {
  const now = isoNow();

  return [
    {
      id: "absence-seed-vacation-pending",
      employeeId: "pneumatiky-martin-bartos",
      employeeName: "Martin Bartoš",
      type: "Dovolená",
      dateFrom: dateInMonth(24),
      dateTo: dateInMonth(26),
      halfDayFrom: false,
      halfDayTo: false,
      daysCount: countAbsenceDays(dateInMonth(24), dateInMonth(26)),
      note: "Rodinná dovolená.",
      attachmentUrls: [],
      substituteUserId: "pneumatiky-roman-drdlik",
      status: "Čeká na schválení",
      approverUserId: "radim-oplustil",
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: "",
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      department: "Provoz",
      team: "Svoz"
    },
    {
      id: "absence-seed-vacation-approved",
      employeeId: "lucie-jezkova",
      employeeName: "Bc. Lucie Ježková, DiS.",
      type: "Dovolená",
      dateFrom: dateInMonth(10),
      dateTo: dateInMonth(12),
      halfDayFrom: false,
      halfDayTo: false,
      daysCount: countAbsenceDays(dateInMonth(10), dateInMonth(12)),
      note: "",
      attachmentUrls: [],
      substituteUserId: "marcela-oplustilova",
      status: "Schváleno",
      approverUserId: "radim-oplustil",
      approvedAt: now,
      rejectedAt: null,
      rejectionReason: "",
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      department: "Kancelář",
      team: "Kancelář"
    },
    {
      id: "absence-seed-illness",
      employeeId: "pneumatiky-lukas-malanik",
      employeeName: "Lukáš Malánik",
      type: "Nemoc",
      dateFrom: dateInMonth(21),
      dateTo: dateInMonth(23),
      halfDayFrom: false,
      halfDayTo: false,
      daysCount: countAbsenceDays(dateInMonth(21), dateInMonth(23)),
      note: "Nahlášeno telefonicky.",
      attachmentUrls: [],
      substituteUserId: "",
      status: "Evidováno",
      approverUserId: "",
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: "",
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      department: "Provoz",
      team: "Svoz"
    },
    {
      id: "absence-seed-doctor",
      employeeId: "pneumatiky-roman-drdlik",
      employeeName: "Roman Drdlík",
      type: "Lékař",
      dateFrom: dateInMonth(22),
      dateTo: dateInMonth(22),
      halfDayFrom: true,
      halfDayTo: false,
      daysCount: countAbsenceDays(dateInMonth(22), dateInMonth(22), true, false),
      note: "Kontrola.",
      attachmentUrls: [],
      substituteUserId: "",
      status: "Čeká na schválení",
      approverUserId: "radim-oplustil",
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: "",
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      department: "Provoz",
      team: "Svoz"
    },
    {
      id: "absence-seed-care",
      employeeId: "marcela-oplustilova",
      employeeName: "Marcela Opluštilová",
      type: "OČR",
      dateFrom: dateInMonth(14),
      dateTo: dateInMonth(15),
      halfDayFrom: false,
      halfDayTo: false,
      daysCount: countAbsenceDays(dateInMonth(14), dateInMonth(15)),
      note: "",
      attachmentUrls: [],
      substituteUserId: "lucie-jezkova",
      status: "Evidováno",
      approverUserId: "",
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: "",
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      department: "Finanční oddělení",
      team: "Kancelář"
    },
    {
      id: "absence-seed-next-month",
      employeeId: "radim-oplustil",
      employeeName: "Radim Opluštil",
      type: "Náhradní volno",
      dateFrom: dateInMonth(4, 1),
      dateTo: dateInMonth(4, 1),
      halfDayFrom: false,
      halfDayTo: false,
      daysCount: countAbsenceDays(dateInMonth(4, 1), dateInMonth(4, 1)),
      note: "Kompenzace víkendového zásahu.",
      attachmentUrls: [],
      substituteUserId: "tomas-gazi",
      status: "Schváleno",
      approverUserId: "tomas-gazi",
      approvedAt: now,
      rejectedAt: null,
      rejectionReason: "",
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      department: "Vedení společnosti",
      team: "Vedení"
    }
  ];
}

function seededBalances() {
  const year = new Date().getFullYear();
  const now = isoNow();

  return MOCK_EMPLOYEES.map((employee, index) => {
    const used = [4, 6, 8, 3, 2, 5][index] || 0;
    const pending = [0, 0, 1.5, 3, 0, 0.5][index] || 0;
    const entitlement = normalizeRole(employee.role) === "ridic" ? 20 : 25;

    return {
      id: `absence-balance-${employee.id}-${year}`,
      employeeId: employee.id,
      year,
      vacationEntitlementDays: entitlement,
      vacationUsedDays: used,
      vacationPendingDays: pending,
      vacationRemainingDays: entitlement - used - pending,
      updatedAt: now
    };
  });
}

function createHistoryEntry(absenceRequestId, fromStatus, toStatus, changedByUserId, note = "") {
  return {
    id: newId("absence-history"),
    absenceRequestId,
    fromStatus,
    toStatus,
    changedByUserId,
    changedAt: isoNow(),
    note
  };
}

function initialAbsenceState() {
  const requests = seededRequests();

  return {
    version: 1,
    requests,
    balances: seededBalances(),
    history: requests.map((request) => createHistoryEntry(
      request.id,
      "Nová žádost",
      request.status,
      request.employeeId,
      request.note
    )),
    reports: [],
    settings: {
      recipientEmail: ABSENCE_REPORT_EMAIL,
      reportDay: ABSENCE_REPORT_DAY,
      reportTime: ABSENCE_REPORT_TIME,
      emailProvider: ""
    }
  };
}

function normalizeAbsenceState(state) {
  const seeded = initialAbsenceState();

  return {
    ...seeded,
    ...(state || {}),
    requests: Array.isArray(state?.requests) ? state.requests.map(normalizeStoredRequest) : seeded.requests,
    balances: Array.isArray(state?.balances) ? state.balances.map(normalizeStoredBalance) : seeded.balances,
    history: Array.isArray(state?.history) ? state.history : seeded.history,
    reports: Array.isArray(state?.reports) ? state.reports : seeded.reports,
    settings: {
      ...seeded.settings,
      ...(state?.settings || {})
    }
  };
}

export function loadAbsenceState() {
  if (typeof window === "undefined" || !window.localStorage) {
    return initialAbsenceState();
  }

  const raw = window.localStorage.getItem(ABSENCE_STORAGE_KEY);

  if (!raw) {
    const state = initialAbsenceState();
    saveAbsenceState(state);
    return state;
  }

  try {
    return normalizeAbsenceState(JSON.parse(raw));
  } catch {
    const state = initialAbsenceState();
    saveAbsenceState(state);
    return state;
  }
}

export function saveAbsenceState(state) {
  const normalized = normalizeAbsenceState(state);

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(ABSENCE_STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

export function absenceEmployeeOptions(state, user) {
  const employees = new Map(MOCK_EMPLOYEES.map((employee) => [employee.id, employee]));
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
  const cancellableStatus = ["Nová žádost", "Čeká na schválení"].includes(request.status);

  return cancellableStatus && (ownRequest || canSeeAllAbsences(user));
}

export function canApproveAbsence(request, user) {
  if (!canApproveAbsences(user) || request.status !== "Čeká na schválení") {
    return false;
  }

  if (canSeeAllAbsences(user)) {
    return true;
  }

  return request.approverUserId === employeeIdForUser(user) || request.team === user?.department;
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
    if (filters.type && request.type !== filters.type) {
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
    vacationEntitlementDays: 20,
    vacationUsedDays: 0,
    vacationPendingDays: 0,
    vacationRemainingDays: 20,
    updatedAt: isoNow()
  };
}

export function absenceSummary(state, user) {
  const requests = visibleAbsenceRequests(state, user);
  const month = currentMonthKey();
  const today = toIsoDate(new Date());
  const activeStatuses = new Set(["Čeká na schválení", "Schváleno", "Evidováno"]);
  const currentMonthRequests = requests.filter((request) => requestOverlapsMonth(request, month));
  const upcoming = requests
    .filter((request) => dateNumber(request.dateFrom) >= dateNumber(today) && activeStatuses.has(request.status))
    .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom))
    .slice(0, 6);

  return {
    pendingCount: requests.filter((request) => request.status === "Čeká na schválení").length,
    approvedVacationThisMonth: currentMonthRequests.filter((request) => request.type === "Dovolená" && request.status === "Schváleno").length,
    illnessThisMonth: currentMonthRequests.filter((request) => request.type === "Nemoc").length,
    peopleOutToday: requests.filter((request) => activeStatuses.has(request.status) && requestOverlapsDate(request, today)),
    upcoming
  };
}

export function createAbsenceRequest(state, formData, user) {
  const employee = formData.employee || currentUserEmployee(user);
  const status = initialStatusForAbsenceType(formData.type);
  const now = isoNow();
  const request = {
    id: newId("absence-request"),
    employeeId: employee.id,
    employeeName: employee.name,
    type: formData.type,
    dateFrom: formData.dateFrom,
    dateTo: formData.dateTo,
    halfDayFrom: Boolean(formData.halfDayFrom),
    halfDayTo: Boolean(formData.halfDayTo),
    daysCount: countAbsenceDays(formData.dateFrom, formData.dateTo, formData.halfDayFrom, formData.halfDayTo),
    note: formData.note || "",
    attachmentUrls: formData.attachmentUrls || [],
    substituteUserId: formData.substituteUserId || "",
    status,
    approverUserId: ABSENCE_APPROVAL_TYPES.has(formData.type) ? (formData.approverUserId || "radim-oplustil") : "",
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: "",
    createdAt: now,
    updatedAt: now,
    cancelledAt: null,
    department: employee.department || "Provoz",
    team: employee.team || employee.department || "Provoz"
  };

  return {
    ...state,
    requests: [request, ...state.requests],
    history: [
      createHistoryEntry(request.id, "Nová žádost", status, employeeIdForUser(user), formData.note || ""),
      ...state.history
    ]
  };
}

export function changeAbsenceRequestStatus(state, requestId, toStatus, user, note = "") {
  const request = state.requests.find((item) => item.id === requestId);

  if (!request || request.status === toStatus) {
    return state;
  }

  const now = isoNow();
  const changedRequest = {
    ...request,
    status: toStatus,
    updatedAt: now
  };

  if (toStatus === "Schváleno") {
    changedRequest.approvedAt = now;
    changedRequest.rejectedAt = null;
    changedRequest.rejectionReason = "";
  }

  if (toStatus === "Zamítnuto") {
    changedRequest.rejectedAt = now;
    changedRequest.rejectionReason = note;
  }

  if (toStatus === "Zrušeno") {
    changedRequest.cancelledAt = now;
  }

  return {
    ...state,
    requests: state.requests.map((item) => item.id === requestId ? changedRequest : item),
    history: [
      createHistoryEntry(requestId, request.status, toStatus, employeeIdForUser(user), note),
      ...state.history
    ]
  };
}

export function updateAbsenceSettings(state, settings) {
  return {
    ...state,
    settings: {
      ...state.settings,
      ...settings
    }
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
    status: "vygenerováno lokálně",
    csvUrl: `local://absence-report-${periodKey}.csv`,
    pdfUrl: "",
    errorMessage: "",
    generatedByUserId: employeeIdForUser(user)
  };

  return {
    state: {
      ...state,
      reports: [report, ...state.reports]
    },
    report,
    requests
  };
}

export function monthlyAbsenceTotals(requests) {
  return ABSENCE_TYPES.reduce((totals, type) => {
    totals[type] = requests
      .filter((request) => request.type === type)
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
      request.type,
      request.dateFrom,
      request.dateTo,
      request.daysCount,
      request.status,
      request.note
    ])
  ];

  return `\uFEFF${rows.map(csvRow).join("\n")}`;
}

export function monthlyAbsenceReportToCsv(report, requests) {
  const totals = monthlyAbsenceTotals(requests);
  const pendingCount = requests.filter((request) => request.status === "Čeká na schválení").length;
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
      request.type,
      request.dateFrom,
      request.dateTo,
      request.daysCount,
      request.status
    ])
  ];

  return `\uFEFF${rows.map(csvRow).join("\n")}`;
}
