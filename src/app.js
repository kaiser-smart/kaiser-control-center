import { moduleDashboards, modules } from "./data/modules.js";
import { VersionBackupInfo } from "./components/VersionBackupInfo.js";
import { VersionNewsInfo } from "./components/VersionNewsInfo.js";
import { ModuleFeedbackBox } from "./components/ModuleFeedbackBox.js";
import { AppearanceSettingsBox } from "./components/AppearanceSettingsBox.js";
import { ReportsIcon } from "./components/icons/index.js";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard.js";
import {
  ABSENCE_REPORT_DAY,
  ABSENCE_REPORT_EMAIL,
  ABSENCE_REPORT_TIME,
  ABSENCE_STATUS_TONES,
  ABSENCE_TABS,
  ABSENCE_TYPES,
  ABSENCE_TYPE_TONES,
  absenceBalanceForEmployee,
  absenceEmployeeOptions,
  absenceRequestsToCsv,
  absenceSummary,
  approvalAbsenceRequests,
  canApproveAbsence,
  canCancelAbsence,
  canSeeAllAbsences,
  canSubmitAbsenceForOthers,
  changeAbsenceRequestStatus,
  countAbsenceDays,
  createAbsenceRequest,
  currentMonthKey,
  employeeIdForUser,
  filterAbsenceRequests,
  generateMonthlyAbsenceReport,
  initialStatusForAbsenceType,
  loadAbsenceState,
  monthlyAbsenceReportToCsv,
  monthlyAbsenceTotals,
  ownAbsenceRequests,
  requestOverlapsDate,
  requestOverlapsMonth,
  saveAbsenceState,
  toIsoDate,
  updateAbsenceSettings,
  visibleAbsenceRequests
} from "./data/absence.js";
import {
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  canManageFeedback,
  createModuleFeedback,
  feedbackSummary,
  filterModuleFeedback,
  moduleFeedbackToCsv,
  readModuleFeedback,
  updateModuleFeedback,
  visibleFeedbackForUser
} from "./data/moduleFeedback.js";
import {
  ACTIONS,
  ROLE_DEFINITIONS,
  canViewModule,
  filterModulesByUser,
  hasPermission,
  isFullAccessRole,
  isUserActive,
  normalizeRole,
  roleLabel
} from "./permissions.js";
import {
  loadAccessState,
  makePermissionsFromMatrix,
  mergeAccessUsers,
  permissionMap,
  rolePermissionsFor,
  saveAccessState,
  withAccessContext
} from "./data/accessControl.js";
import {
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings,
  sameThemeSettings,
  themeSettingsToCssProperties
} from "./data/themeSettings.js";

const app = document.querySelector("#app");
const orderedModules = [...modules].sort((a, b) => a.order - b.order);
const feedbackMenuItem = {
  id: "feedback",
  title: "Připomínky",
  description: "Přehled připomínek k modulům, stavů, priorit a interních poznámek.",
  route: "/pripominky",
  icon: ReportsIcon,
  status: "správa",
  active: true,
  disabled: false,
  order: 14
};
const permissionModules = [...orderedModules, feedbackMenuItem];
const primaryRoutes = new Map(orderedModules.map((moduleItem) => [moduleItem.route, moduleItem]));
const dashboardRoutes = new Map(moduleDashboards.map((moduleItem) => [moduleItem.route, moduleItem]));
const TYRES_MODULE_URL = "https://oplustil-prog.github.io/kaiser-pneu-evidence/";
const APP_NAME = "Smart odpady";
const HOME_SUBTITLE = "Provozní systém pro odpady, vozidla a trasy";
const LOGIN_SUBTITLE = "Přihlášení do interního provozního systému";
const FEEDBACK_ROUTE = "/pripominky";
const EMPLOYEE_CARD_ROUTE_PREFIX = "/dovolena-nemoc/zamestnanci";
const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "active", label: "Aktivní" },
  { value: "inactive", label: "Neaktivní" }
];
const EMPLOYMENT_TYPE_OPTIONS = [
  "Hlavní pracovní poměr",
  "Dohoda",
  "Externí spolupráce",
  "Jiné"
];
const EMPLOYEE_ABSENCE_STATUS_OPTIONS = ["v práci", "nemoc", "dovolená", "OČR", "lékař", "náhradní volno"];
const DOCUMENT_TYPE_LABELS = ["Pracovní smlouva", "Dodatek", "Školení", "Lékařská prohlídka", "Ostatní"];
const basePath = new URL(document.querySelector("base")?.href || "/", window.location.origin)
  .pathname
  .replace(/\/$/, "");

let authState = {
  status: "loading",
  user: null,
  pendingIdentifier: "",
  codeSent: false,
  message: "",
  error: "",
  mockCode: false
};

const adminUsersState = {
  loaded: false,
  loading: false,
  users: [],
  error: ""
};

const accessManagerState = {
  savingUserId: "",
  pendingManagerId: ""
};

let accessState = loadAccessState();

const themeState = {
  loaded: false,
  loading: false,
  saving: false,
  settings: normalizeThemeSettings(DEFAULT_THEME_SETTINGS),
  draft: normalizeThemeSettings(DEFAULT_THEME_SETTINGS),
  preview: null,
  message: "",
  error: ""
};

const feedbackFormState = {};
const feedbackFilters = {
  moduleId: "",
  status: "",
  priority: "",
  author: "",
  search: ""
};

let absenceState = loadAbsenceState();
const absenceUiState = {
  tab: "dashboard",
  message: "",
  error: "",
  typeFilter: "",
  employeeFilter: "",
  monthFilter: currentMonthKey()
};

const employeeCardState = {
  employees: [],
  employeesLoaded: false,
  employeesLoading: false,
  employee: null,
  loadingId: "",
  failedId: "",
  saving: false,
  managerSaving: false,
  managerPendingId: "",
  workHistorySaving: false,
  error: "",
  message: "",
  apiStatus: "waiting",
  absence: null,
  vacationBalance: null,
  workHistory: [],
  documents: [],
  documentsUploadStatus: "waiting",
  documentsMissingEndpoint: "POST /api/employees/:id/documents"
};

let lastRenderedUrl = window.location.href;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function activeThemeSettings() {
  return normalizeThemeSettings(themeState.preview || themeState.settings);
}

function moduleThemeStyleAttribute() {
  const properties = themeSettingsToCssProperties(activeThemeSettings());
  const style = Object.entries(properties)
    .map(([name, value]) => `${name}: ${String(value).replaceAll('"', "&quot;")}`)
    .join("; ");

  return `style="${style}"`;
}

function normalizePath(pathname) {
  let path = pathname || "/";

  if (basePath && (path === basePath || path.startsWith(`${basePath}/`))) {
    path = path.slice(basePath.length) || "/";
  }

  if (path === "/") {
    return "/";
  }

  return path.replace(/\/+$/, "") || "/";
}

function routeHref(route) {
  if (route === "/") {
    return `${basePath || ""}/`;
  }

  return `${basePath || ""}${route}`;
}

function employeeCardRoute(employeeId) {
  return `${EMPLOYEE_CARD_ROUTE_PREFIX}/${encodeURIComponent(employeeId || employeeIdForUser(currentUser()))}`;
}

function routeEmployeeId(path) {
  if (!path.startsWith(`${EMPLOYEE_CARD_ROUTE_PREFIX}/`)) {
    return "";
  }

  return decodeURIComponent(path.slice(`${EMPLOYEE_CARD_ROUTE_PREFIX}/`.length).split("/")[0] || "").trim();
}

function absenceModuleItem() {
  return orderedModules.find((moduleItem) => moduleItem.id === "absence");
}

function renderModuleIcon(moduleItem) {
  return moduleItem.icon();
}

function statusBadge(moduleItem) {
  if (moduleItem.status !== "HOTOVO") {
    return "";
  }

  return '<span class="status-badge">HOTOVO</span>';
}

function visibleModules(user) {
  return filterModulesByUser(user, orderedModules);
}

function menuModules(user) {
  const items = visibleModules(user);

  if (canViewModule(user, feedbackMenuItem.id)) {
    return [...items, feedbackMenuItem];
  }

  return items;
}

function visibleDashboardRoutes(user) {
  return filterModulesByUser(user, moduleDashboards);
}

function moduleFeedbackItems(moduleId, user) {
  const items = readModuleFeedback().filter((item) => item.moduleId === moduleId);
  return visibleFeedbackForUser(items, user);
}

function moduleFeedbackBoxFor(moduleItem, user, options = {}) {
  if (!hasPermission(user, "feedback", "create")) {
    return "";
  }

  const moduleId = options.moduleId || moduleItem.id;
  const moduleName = options.moduleName || moduleItem.title;
  const feedbackState = feedbackFormState[moduleId] || {};

  return ModuleFeedbackBox({
    moduleId,
    moduleName,
    currentUser: user,
    feedbackItems: moduleFeedbackItems(moduleId, user),
    notice: feedbackState.message || "",
    error: feedbackState.error || "",
    placeholder: options.placeholder
  });
}

function formatDateTime(value) {
  if (!value) {
    return "neuvedeno";
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function optionList(options, selected, emptyLabel = "Vše") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...options.map((option) => `
      <option value="${escapeHtml(option.value ?? option)}" ${(option.value ?? option) === selected ? "selected" : ""}>
        ${escapeHtml(option.label ?? option)}
      </option>
    `)
  ].join("");
}

function userBar(user) {
  return `
    <div class="user-bar" aria-label="Přihlášený uživatel">
      <div class="user-bar__identity">
        <span class="user-bar__name">${escapeHtml(user.name || user.email || "Uživatel")}</span>
        <span class="user-bar__role">${escapeHtml(roleLabel(user.role))}</span>
      </div>
      <button class="logout-button" type="button" data-logout>Odhlásit</button>
    </div>
  `;
}

function stackedCell(primary, secondary) {
  const primaryValue = String(primary || "-").trim();
  const secondaryValue = String(secondary || "").trim();
  const secondaryLine = secondaryValue && secondaryValue !== primaryValue
    ? `<span>${escapeHtml(secondaryValue)}</span>`
    : "";

  return `
    <span class="users-contact">
      <span>${escapeHtml(primaryValue)}</span>
      ${secondaryLine}
    </span>
  `;
}

const permissionActionLabels = {
  view: "zobrazit",
  create: "vytvořit",
  edit: "upravit",
  delete: "smazat",
  approve: "schválit",
  export: "export",
  manage: "správa",
  "*": "vše"
};

function moduleTitleByPermissionId(moduleId) {
  if (moduleId === "*") {
    return "Všechny moduly";
  }

  const moduleItem = [...orderedModules, feedbackMenuItem].find((item) => item.id === moduleId);
  return moduleItem?.title || moduleId;
}

function roleOrderIndex(roleId) {
  const index = ROLE_DEFINITIONS.findIndex((role) => role.id === normalizeRole(roleId));
  return index === -1 ? ROLE_DEFINITIONS.length : index;
}

function orderedAccessRoles() {
  return [...accessState.roles].sort((a, b) => roleOrderIndex(a.id) - roleOrderIndex(b.id));
}

function setAccessState(nextState) {
  accessState = saveAccessState(nextState);
}

function scrollToPageTop() {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  } catch {
    window.scrollTo(0, 0);
  }
}

function currentUser() {
  return withAccessContext(authState.user, {
    ...accessState,
    users: []
  });
}

function allAccessUsers() {
  return mergeAccessUsers(adminUsersState.users, accessState.users);
}

function accessUserKey(user) {
  return String(user?.email || user?.id || "").trim().toLowerCase();
}

function findAccessUser(userId) {
  const normalizedId = String(userId || "").trim().toLowerCase();
  return allAccessUsers().find((user) => String(user.id || "").trim().toLowerCase() === normalizedId) || null;
}

function findSavedAccessUser(userId) {
  const normalizedId = String(userId || "").trim().toLowerCase();
  return adminUsersState.users.find((user) => String(user.id || "").trim().toLowerCase() === normalizedId) || null;
}

function sameAccessUserIdentity(user, reference) {
  const userId = String(user?.id || "").trim().toLowerCase();
  const referenceId = String(reference?.id || "").trim().toLowerCase();
  const userEmail = String(user?.email || "").trim().toLowerCase();
  const referenceEmail = String(reference?.email || "").trim().toLowerCase();

  return (
    (userId && referenceId && userId === referenceId) ||
    (userEmail && referenceEmail && userEmail === referenceEmail)
  );
}

function selectedAccessUser(users) {
  const selectedId = String(accessState.selectedUserId || "").trim().toLowerCase();
  return users.find((user) => String(user.id || "").trim().toLowerCase() === selectedId) || users[0] || null;
}

function selectedAccessRole() {
  const roles = orderedAccessRoles();
  return roles.find((role) => role.id === accessState.selectedRoleId) || roles[0];
}

function nextDraftUserId() {
  const usedIds = new Set(allAccessUsers().map((user) => user.id));
  let id = `draft-user-${Date.now()}`;
  let index = 2;

  while (usedIds.has(id)) {
    id = `draft-user-${Date.now()}-${index}`;
    index += 1;
  }

  return id;
}

function matrixPermissions(permissions, roleId = "") {
  const map = permissionMap(permissions || []);
  const fullAccessAlwaysAllowed = isFullAccessRole({ role: roleId, active: true });

  return {
    allows(moduleId, action) {
      return (
        fullAccessAlwaysAllowed ||
        map.get(`${moduleId}:${action}`) === true ||
        map.get(`${moduleId}:*`) === true ||
        map.get(`*:*`) === true
      );
    }
  };
}

function fullPermissionsAllowed() {
  return permissionModules.flatMap((moduleItem) => (
    ACTIONS.map((action) => ({
      moduleId: moduleItem.id,
      action,
      allowed: true
    }))
  ));
}

function permissionsFromMatrix(form, prefix, roleId = "") {
  if (isFullAccessRole({ role: roleId, active: true })) {
    return fullPermissionsAllowed();
  }

  return makePermissionsFromMatrix(permissionModules, ACTIONS, new FormData(form), prefix);
}

function userDefaultPermissions(roleId) {
  return isFullAccessRole({ role: roleId, active: true })
    ? fullPermissionsAllowed()
    : rolePermissionsFor(roleId, accessState.roles);
}

function comparablePermissions(permissions = [], roleId = "") {
  const state = matrixPermissions(permissions, roleId);

  return permissionModules.flatMap((moduleItem) => (
    ACTIONS.map((action) => ({
      moduleId: moduleItem.id,
      action,
      allowed: state.allows(moduleItem.id, action)
    }))
  ));
}

function comparableUser(user) {
  if (!user) {
    return null;
  }

  const role = normalizeRole(user.role);
  const active = user.active !== false && String(user.status || "").toLowerCase() !== "disabled";
  const permissions = Array.isArray(user.permissions) && user.permissions.length
    ? user.permissions
    : userDefaultPermissions(role);

  return {
    id: String(user.id || ""),
    name: String(user.name || "").trim(),
    email: String(user.email || "").trim(),
    phone: String(user.phone || "").trim(),
    role,
    department: String(user.department || "").trim(),
    active,
    permissions: comparablePermissions(permissions, role)
  };
}

function comparableRole(role) {
  if (!role) {
    return null;
  }

  return {
    id: normalizeRole(role.id || role.name),
    description: String(role.description || "").trim(),
    defaultPermissions: comparablePermissions(role.defaultPermissions || [], role.id || role.name)
  };
}

function isSameData(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function employeeFullName(employee) {
  return [employee?.firstName, employee?.lastName].map((part) => String(part || "").trim()).filter(Boolean).join(" ") ||
    employee?.name ||
    "Zaměstnanec";
}

function employeeNameLink(employeeId, employeeName) {
  return `
    <a class="absence-employee-link" href="${routeHref(employeeCardRoute(employeeId))}" data-link>
      ${escapeHtml(employeeName || "Zaměstnanec")}
    </a>
  `;
}

function canEditEmployeeCards(user = currentUser()) {
  const role = normalizeRole(user?.role);
  return isFullAccessRole(user) || role === "kancelar";
}

function canSeeEmployeeInternalNote(user = currentUser()) {
  const role = normalizeRole(user?.role);
  return isFullAccessRole(user) || role === "kancelar";
}

function currentEmployeeCardId() {
  return routeEmployeeId(normalizePath(window.location.pathname));
}

function employeeOptionList(selectedId) {
  return employeeCardState.employees
    .map((employee) => `
      <option value="${escapeHtml(employee.id)}" ${employee.id === selectedId ? "selected" : ""}>
        ${escapeHtml(employeeFullName(employee))}
      </option>
    `)
    .join("");
}

function employeeManagerOptions(employee, selectedId) {
  const targetId = String(employee?.id || "").trim().toLowerCase();
  const options = employeeCardState.employees.filter((item) => (
    String(item.id || "").trim().toLowerCase() !== targetId &&
    item.employmentStatus !== "inactive"
  ));

  return [
    `<option value="" ${!selectedId ? "selected" : ""}>Bez nadřízeného</option>`,
    ...options.map((item) => `
      <option value="${escapeHtml(item.id)}" ${item.id === selectedId ? "selected" : ""}>
        ${escapeHtml(employeeFullName(item))}
      </option>
    `)
  ].join("");
}

function employeeCardComparable(employee) {
  if (!employee) {
    return null;
  }

  const entitlement = Number(employee.vacationEntitlementDays || 0);
  const used = Number(employee.vacationUsedDays || 0);
  const pending = Number(employee.vacationPendingDays || 0);

  return {
    firstName: String(employee.firstName || "").trim(),
    lastName: String(employee.lastName || "").trim(),
    email: String(employee.email || "").trim().toLowerCase(),
    phone: String(employee.phone || "").trim(),
    role: normalizeRole(employee.role),
    department: String(employee.department || "").trim(),
    position: String(employee.position || "").trim(),
    managerId: String(employee.managerId || "").trim(),
    employmentStatus: String(employee.employmentStatus || "active").trim(),
    startDate: String(employee.startDate || "").trim(),
    employmentType: String(employee.employmentType || "").trim(),
    workload: Number(employee.workload || 0),
    vacationEntitlementDays: entitlement,
    vacationUsedDays: used,
    vacationPendingDays: pending,
    vacationRemainingDays: Number.isFinite(entitlement - used - pending) ? entitlement - used - pending : 0,
    currentAbsenceStatus: String(employee.currentAbsenceStatus || "v práci").trim(),
    sickDaysCurrentYear: Number(employee.sickDaysCurrentYear || 0),
    lastAbsenceDate: String(employee.lastAbsenceDate || "").trim(),
    internalNote: String(employee.internalNote || "").trim()
  };
}

function employeeCardFormData(form) {
  const source = employeeCardState.employee || {};
  const entitlement = Number(form.elements.vacationEntitlementDays?.value || 0);
  const used = Number(form.elements.vacationUsedDays?.value || 0);
  const pending = Number(form.elements.vacationPendingDays?.value || 0);

  return {
    ...source,
    firstName: form.elements.firstName?.value.trim() || "",
    lastName: form.elements.lastName?.value.trim() || "",
    email: form.elements.email?.value.trim() || "",
    phone: form.elements.phone?.value.trim() || "",
    role: normalizeRole(form.elements.role?.value || source.role),
    department: form.elements.department?.value.trim() || "",
    position: form.elements.position?.value.trim() || "",
    managerId: form.elements.managerId?.value || "",
    employmentStatus: form.elements.employmentStatus?.value || "active",
    startDate: form.elements.startDate?.value || "",
    employmentType: form.elements.employmentType?.value.trim() || "",
    workload: Number(form.elements.workload?.value || 0),
    vacationEntitlementDays: entitlement,
    vacationUsedDays: used,
    vacationPendingDays: pending,
    vacationRemainingDays: Number.isFinite(entitlement - used - pending) ? entitlement - used - pending : 0,
    currentAbsenceStatus: form.elements.currentAbsenceStatus?.value || "v práci",
    sickDaysCurrentYear: Number(form.elements.sickDaysCurrentYear?.value || 0),
    lastAbsenceDate: form.elements.lastAbsenceDate?.value || "",
    internalNote: form.elements.internalNote?.value.trim() || ""
  };
}

function currentEmployeeCardDirtyTarget() {
  if (!currentEmployeeCardId() || !canEditEmployeeCards()) {
    return null;
  }

  const form = document.querySelector("[data-employee-card-form]");
  if (!form || !employeeCardState.employee) {
    return null;
  }

  const current = employeeCardFormData(form);
  const baseline = employeeCardState.employee;
  const isDirty = !isSameData(employeeCardComparable(current), employeeCardComparable(baseline));

  return {
    type: "employee-card",
    form,
    current,
    baseline,
    isDirty
  };
}

function accessUserFormData(form, options = {}) {
  const sourceUser = findAccessUser(form?.dataset.userId) || {};
  const now = options.updatedAt || new Date().toISOString();
  const role = normalizeRole(options.role || form.elements.role.value);
  const active = Boolean(form.elements.active?.checked);

  return {
    ...sourceUser,
    id: sourceUser.id || form.dataset.userId || nextDraftUserId(),
    name: form.elements.name.value.trim(),
    email: form.elements.email.value.trim(),
    phone: form.elements.phone.value.trim(),
    role,
    department: form.elements.department.value.trim(),
    position: sourceUser.position || "",
    active,
    status: active ? "active" : "disabled",
    permissions: options.permissions || permissionsFromMatrix(form, "userperm", role),
    createdAt: sourceUser.createdAt || now,
    updatedAt: now,
    lastLoginAt: sourceUser.lastLoginAt || null
  };
}

function currentAccessUserFormTarget() {
  const form = document.querySelector("[data-access-user-form]");

  if (!form || !canEditAccessUsers()) {
    return null;
  }

  const current = accessUserFormData(form);
  const baselineUser = findSavedAccessUser(form.dataset.userId);

  return {
    type: "user",
    form,
    current,
    baseline: comparableUser(baselineUser),
    isDirty: !baselineUser || !isSameData(comparableUser(current), comparableUser(baselineUser))
  };
}

function currentAccessRoleFormTarget() {
  const form = document.querySelector("[data-access-role-form]");

  if (!form || !canManageAccessRoles()) {
    return null;
  }

  const roleId = normalizeRole(form.dataset.roleId);
  const role = accessState.roles.find((item) => item.id === roleId);

  if (!role || isFullAccessRole({ role: roleId, active: true })) {
    return null;
  }

  const current = {
    ...role,
    description: form.elements.description?.value.trim() || "",
    defaultPermissions: permissionsFromMatrix(form, "roleperm", roleId)
  };

  return {
    type: "role",
    form,
    current,
    baseline: comparableRole(role),
    isDirty: !isSameData(comparableRole(current), comparableRole(role))
  };
}

function currentAccessDirtyTarget() {
  const userTarget = currentAccessUserFormTarget();

  if (userTarget?.isDirty) {
    return userTarget;
  }

  const roleTarget = currentAccessRoleFormTarget();

  if (roleTarget?.isDirty) {
    return roleTarget;
  }

  return null;
}

function appearanceFormData(form) {
  return normalizeThemeSettings({
    logoUrl: form.elements.logoUrl.value,
    primaryColor: form.elements.primaryColor.value,
    secondaryColor: form.elements.secondaryColor.value,
    backgroundColor: form.elements.backgroundColor.value,
    cardColor: form.elements.cardColor.value,
    textColor: form.elements.textColor.value,
    mutedTextColor: form.elements.mutedTextColor.value,
    cardRadius: form.elements.cardRadius.value,
    buttonRadius: form.elements.buttonRadius.value,
    buttonStyle: form.elements.buttonStyle.value,
    backgroundStyle: form.elements.backgroundStyle.value,
    cardShadow: form.elements.cardShadow.value,
    fontFamily: form.elements.fontFamily.value
  });
}

function currentAppearanceDirtyTarget() {
  if (normalizePath(window.location.pathname) !== "/nastaveni" || !canManageAppearanceSettings()) {
    return null;
  }

  const form = document.querySelector("[data-appearance-form]");
  const current = form ? appearanceFormData(form) : themeState.draft;

  return {
    type: "appearance",
    form,
    current,
    baseline: themeState.settings,
    isDirty: !sameThemeSettings(current, themeState.settings)
  };
}

function currentDirtyTarget() {
  return currentAccessDirtyTarget() || currentAppearanceDirtyTarget() || currentEmployeeCardDirtyTarget();
}

function discardAccessUserDraft(userId, referenceUser = null) {
  const reference = referenceUser || findAccessUser(userId) || { id: userId };
  const users = accessState.users.filter((user) => !sameAccessUserIdentity(user, reference));
  const selectedUserId = findSavedAccessUser(userId)
    ? accessState.selectedUserId
    : (adminUsersState.users[0]?.id || "");

  setAccessState({
    ...accessState,
    users,
    selectedUserId,
    message: "Neuložené změny byly zahozeny.",
    error: "",
    feedbackTarget: "user"
  });
}

function discardAccessDirtyChanges() {
  const target = currentAccessDirtyTarget();

  if (target?.type === "user") {
    discardAccessUserDraft(target.form.dataset.userId, target.current);
    render();
    return;
  }

  if (target?.type === "role") {
    setAccessState({
      ...accessState,
      message: "Neuložené změny byly zahozeny.",
      error: "",
      feedbackTarget: "role"
    });
    render();
  }
}

function discardAppearanceDirtyChanges() {
  themeState.draft = normalizeThemeSettings(themeState.settings);
  themeState.preview = null;
  themeState.message = "Neuložené změny vzhledu byly zahozeny.";
  themeState.error = "";
  render();
}

function roleOptions(selectedRole) {
  return orderedAccessRoles().map((role) => `
    <option value="${escapeHtml(role.id)}" ${role.id === normalizeRole(selectedRole) ? "selected" : ""}>
      ${escapeHtml(role.label || roleLabel(role.id))}
    </option>
  `).join("");
}

function activeStatusLabel(user) {
  return user?.active === false ? "Vypnutý" : "Aktivní";
}

function statusPill(user) {
  const active = user?.active !== false;
  return `<span class="access-status ${active ? "access-status--active" : "access-status--disabled"}">${activeStatusLabel(user)}</span>`;
}

function canEditManagers() {
  return isFullAccessRole(currentUser());
}

function managerLabel(user, users) {
  const managerId = String(user?.managerId || "").trim().toLowerCase();

  if (!managerId) {
    return "Bez nadřízeného";
  }

  const manager = users.find((item) => String(item.id || "").trim().toLowerCase() === managerId);
  return manager?.name || user?.managerName || "Bez nadřízeného";
}

function managerSelectOptions(targetUser, users) {
  const selectedManagerId = String(targetUser?.managerId || "");
  const targetUserId = String(targetUser?.id || "").trim().toLowerCase();
  const options = users.filter((user) => (
    user.active !== false &&
    String(user.status || "active").toLowerCase() !== "disabled" &&
    String(user.id || "").trim().toLowerCase() !== targetUserId
  ));

  return [
    `<option value="" ${!selectedManagerId ? "selected" : ""}>Bez nadřízeného</option>`,
    ...options.map((user) => {
      const selected = String(user.id || "") === selectedManagerId ? "selected" : "";
      return `<option value="${escapeHtml(user.id)}" ${selected}>${escapeHtml(user.name || user.email || "Bez jména")}</option>`;
    })
  ].join("");
}

function managerCell(user, users, editable) {
  const isSaving = String(accessManagerState.savingUserId || "") === String(user.id || "");
  const value = isSaving ? accessManagerState.pendingManagerId : String(user.managerId || "");

  if (!editable) {
    return `<span class="manager-readonly">${escapeHtml(managerLabel(user, users))}</span>`;
  }

  return `
    <label class="manager-cell">
      <select
        class="manager-select"
        aria-label="Nadřízený uživatele ${escapeHtml(user.name || user.email || "")}"
        data-access-manager-select
        data-access-manager-user="${escapeHtml(user.id)}"
        ${isSaving ? "disabled" : ""}
      >
        ${managerSelectOptions({ ...user, managerId: value }, users)}
      </select>
      ${isSaving ? '<span class="manager-cell__saving">Ukládám…</span>' : ""}
    </label>
  `;
}

function accessFeedbackMessage(extraClass = "", target = "") {
  const message = accessState.error || accessState.message;

  if (!message) {
    return "";
  }

  if (target && accessState.feedbackTarget && accessState.feedbackTarget !== target) {
    return "";
  }

  const toneClass = accessState.error ? "module-feedback__error" : "module-feedback__notice";
  const role = accessState.error ? "alert" : "status";
  const className = [toneClass, extraClass].filter(Boolean).join(" ");

  return `
    <p class="${className}" role="${role}" aria-live="polite">${escapeHtml(message)}</p>
  `;
}

function accessNotice() {
  return accessFeedbackMessage("access-notice");
}

function accessInlineNotice(target) {
  return accessFeedbackMessage("access-inline-notice", target);
}

function accessToast() {
  return accessFeedbackMessage("access-toast");
}

function permissionsMatrixTable({ namePrefix, permissions, roleId = "", disabled = false }) {
  const state = matrixPermissions(permissions, roleId);
  const disabledAttribute = disabled ? "disabled" : "";

  return `
    <div class="access-permissions-wrap">
      <table class="users-table access-permissions-table">
        <thead>
          <tr>
            <th>Modul</th>
            ${ACTIONS.map((action) => `<th>${escapeHtml(permissionActionLabels[action] || action)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${permissionModules.map((moduleItem) => `
            <tr>
              <td data-label="Modul">
                <strong>${escapeHtml(moduleTitleByPermissionId(moduleItem.id))}</strong>
              </td>
              ${ACTIONS.map((action) => {
                const checked = state.allows(moduleItem.id, action) ? "checked" : "";
                return `
                  <td data-label="${escapeHtml(permissionActionLabels[action] || action)}">
                    <label class="access-check" title="${escapeHtml(`${moduleTitleByPermissionId(moduleItem.id)} · ${permissionActionLabels[action] || action}`)}">
                      <input
                        type="checkbox"
                        name="${escapeHtml(`${namePrefix}-${moduleItem.id}-${action}`)}"
                        ${checked}
                        ${disabledAttribute}
                      />
                      <span></span>
                    </label>
                  </td>
                `;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function upsertAccessUserInMemory(user, message = "") {
  const nextKey = accessUserKey(user);
  const nextId = String(user.id || "").trim().toLowerCase();
  const users = accessState.users.filter((item) => {
    const itemKey = accessUserKey(item);
    const itemId = String(item.id || "").trim().toLowerCase();
    return itemKey !== nextKey && itemId !== nextId;
  });

  setAccessState({
    ...accessState,
    users: [...users, user],
    selectedUserId: user.id,
    message,
    error: "",
    feedbackTarget: "user"
  });
}

function focusAccessUserEditor() {
  const editor = document.querySelector("#access-user-editor");

  if (!editor) {
    return;
  }

  try {
    editor.scrollIntoView({ block: "start", behavior: "auto" });
    editor.querySelector("input[name='name']")?.focus({ preventScroll: true });
  } catch (error) {
    console.error("smart_odpady_access_focus_failed", error);
  }
}

function currentAccessUserFormFor(userId) {
  const form = document.querySelector("[data-access-user-form]");
  const normalizedId = String(userId || "").trim().toLowerCase();

  if (!form) {
    return null;
  }

  return String(form.dataset.userId || "").trim().toLowerCase() === normalizedId ? form : null;
}

function accessUserForm(user, canEditUsers) {
  if (!user) {
    return `
      <section class="users-panel access-editor">
        <h2>Detail uživatele</h2>
        <p>Zatím tu není žádný uživatel. Přidejte prvního uživatele a nastavte mu roli.</p>
      </section>
    `;
  }

  const effectivePermissions = user.permissions?.length ? user.permissions : userDefaultPermissions(user.role);
  const disabled = canEditUsers ? "" : "disabled";
  const activeChecked = user.active !== false ? "checked" : "";
  const roleHasFullAccess = isFullAccessRole({ role: user.role, active: true });

  return `
    <section class="users-panel access-editor" id="access-user-editor" aria-labelledby="access-user-title">
      <div class="users-panel__head">
        <div>
          <h2 id="access-user-title">Detail / editace uživatele</h2>
          <p>Individuální oprávnění uživatele mají přednost před výchozí rolí.</p>
        </div>
      </div>

      <form class="access-form" data-access-user-form data-user-id="${escapeHtml(user.id)}">
        <div class="access-form-grid">
          <label>
            <span>Jméno</span>
            <input name="name" value="${escapeHtml(user.name)}" ${disabled} required />
          </label>
          <label>
            <span>E-mail</span>
            <input name="email" type="email" value="${escapeHtml(user.email)}" ${disabled} />
          </label>
          <label>
            <span>Telefon</span>
            <input name="phone" value="${escapeHtml(user.phone)}" ${disabled} />
          </label>
          <label>
            <span>Role</span>
            <select name="role" data-access-user-role ${disabled}>
              ${roleOptions(user.role)}
            </select>
          </label>
          <label>
            <span>Oddělení</span>
            <input name="department" value="${escapeHtml(user.department)}" ${disabled} />
          </label>
          <label class="access-switch">
            <input name="active" type="checkbox" ${activeChecked} ${disabled} />
            <span>Aktivní uživatel</span>
          </label>
        </div>

        ${roleHasFullAccess ? `
          <p class="permissions-note">Tato role má v testovacím režimu vždy plný přístup. Checkboxy jsou předvyplněné naplno.</p>
        ` : ""}

        <h3 class="access-subtitle">Oprávnění podle modulů</h3>
        ${permissionsMatrixTable({
          namePrefix: "userperm",
          permissions: effectivePermissions,
          roleId: user.role,
          disabled: !canEditUsers
        })}

        <div class="access-form-actions">
          ${canEditUsers ? `
            <button class="primary-action" type="submit">Uložit uživatele</button>
            <button class="secondary-link" type="button" data-access-reset-user-permissions="${escapeHtml(user.id)}">
              Použít výchozí práva role
            </button>
          ` : '<p class="permissions-note">Máte pouze čtení správy uživatelů.</p>'}
        </div>
        ${accessInlineNotice("user")}
      </form>
    </section>
  `;
}

function rolesManagementSection(canManageRoles) {
  const roles = orderedAccessRoles();
  const selectedRole = selectedAccessRole();
  const rolePermissions = selectedRole?.defaultPermissions || [];
  const roleHasFullAccess = isFullAccessRole({ role: selectedRole?.id, active: true });

  return `
    <section class="users-panel permissions-panel access-roles" aria-labelledby="access-roles-title">
      <div class="users-panel__head">
        <div>
          <h2 id="access-roles-title">Role a oprávnění</h2>
          <p>Výchozí práva role se použijí při výběru role u uživatele. Uživatel je může mít následně ručně upravená.</p>
        </div>
      </div>

      <div class="access-roles-grid">
        ${roles.map((role) => `
          <button
            class="role-card ${role.id === selectedRole?.id ? "role-card--active" : ""}"
            type="button"
            data-access-edit-role="${escapeHtml(role.id)}"
          >
            <span>${escapeHtml(role.label || roleLabel(role.id))}</span>
            <strong>${escapeHtml(role.description || "")}</strong>
          </button>
        `).join("")}
      </div>

      ${selectedRole ? `
        <form class="access-form access-role-form" data-access-role-form data-role-id="${escapeHtml(selectedRole.id)}">
          <div class="access-form-grid access-form-grid--role">
            <label>
              <span>Role</span>
              <input value="${escapeHtml(selectedRole.label || roleLabel(selectedRole.id))}" disabled />
            </label>
            <label>
              <span>Popis role</span>
              <input name="description" value="${escapeHtml(selectedRole.description || "")}" ${canManageRoles ? "" : "disabled"} />
            </label>
          </div>

          ${roleHasFullAccess ? `
            <p class="permissions-note">Admin a Management mají v testovacím režimu vždy všechna práva. Tuto plnou roli nejde omylem omezit.</p>
          ` : ""}

          ${permissionsMatrixTable({
            namePrefix: "roleperm",
            permissions: rolePermissions,
            roleId: selectedRole.id,
            disabled: !canManageRoles || roleHasFullAccess
          })}

          <div class="access-form-actions">
            ${canManageRoles && !roleHasFullAccess ? `
              <button class="primary-action" type="submit">Uložit výchozí oprávnění role</button>
            ` : roleHasFullAccess
              ? '<p class="permissions-note">Plnou roli v testovacím režimu nejde omezit.</p>'
              : '<p class="permissions-note">Výchozí oprávnění role může měnit pouze uživatel s právem spravovat uživatele.</p>'}
          </div>
          ${accessInlineNotice("role")}
        </form>
      ` : ""}
    </section>
  `;
}

function loadingPage() {
  return `
    <main class="login-shell">
      <section class="login-panel" aria-label="Načítání přihlášení">
        <a class="kaiser-logo" href="${routeHref("/")}" data-link aria-label="${APP_NAME}">kaiser.</a>
        <h1>${APP_NAME}</h1>
        <p class="login-subtitle">Ověřuji přihlášení...</p>
      </section>
    </main>
  `;
}

function loginPage() {
  const codeStep = authState.codeSent;
  const busy = authState.status === "submitting";
  const identifier = escapeHtml(authState.pendingIdentifier);

  return `
    <main class="login-shell">
      <section class="login-panel" aria-labelledby="login-title">
        <a class="kaiser-logo" href="${routeHref("/")}" data-link aria-label="${APP_NAME}">kaiser.</a>
        <h1 id="login-title">${APP_NAME}</h1>
        <p class="login-subtitle">${LOGIN_SUBTITLE}</p>

        <form class="login-form" data-auth-form data-step="${codeStep ? "verify" : "start"}">
          <label class="form-field">
            <span>E-mail nebo telefon</span>
            <input
              name="identifier"
              type="text"
              autocomplete="username"
              inputmode="email"
              value="${identifier}"
              ${codeStep ? "readonly" : ""}
              required
            />
          </label>

          ${
            codeStep
              ? `
                <label class="form-field">
                  <span>Ověřovací kód</span>
                  <input
                    name="code"
                    type="text"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    maxlength="8"
                    required
                  />
                </label>
              `
              : ""
          }

          <button class="primary-action" type="submit" ${busy ? "disabled" : ""}>
            ${busy ? "Pracuji..." : codeStep ? "Přihlásit" : "Poslat ověřovací kód"}
          </button>
        </form>

        ${
          codeStep
            ? '<button class="text-action" type="button" data-change-identifier>Změnit e-mail nebo telefon</button>'
            : ""
        }

        ${authState.message ? `<p class="login-message">${escapeHtml(authState.message)}</p>` : ""}
        ${authState.error ? `<p class="login-error">${escapeHtml(authState.error)}</p>` : ""}
        ${authState.mockCode ? '<p class="login-dev-note">Vývojový kód: 123456</p>' : ""}
      </section>
    </main>
  `;
}

function homePage(user) {
  const modulesForUser = menuModules(user);
  const completedCount = modulesForUser.filter((moduleItem) => moduleItem.status === "HOTOVO").length;
  const cards = modulesForUser
    .map(
      (moduleItem) => `
        <a class="module-card" href="${routeHref(moduleItem.route)}" data-link>
          <span class="module-card__media">
            <span class="module-icon">${renderModuleIcon(moduleItem)}</span>
            ${statusBadge(moduleItem)}
          </span>
          <span class="module-card__content">
            <span class="module-card__header">
              <span class="module-card__title">${moduleItem.title}</span>
            </span>
            <span class="module-card__description">${moduleItem.description}</span>
          </span>
        </a>
      `
    )
    .join("");

  return `
    <main class="app-shell home-page-fixed-theme">
      ${userBar(user)}
      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-hero__main">
          <a class="kaiser-logo" href="${routeHref("/")}" data-link aria-label="${APP_NAME}">kaiser.</a>
          <h1 id="home-title">${APP_NAME}</h1>
          <p class="home-subtitle">${HOME_SUBTITLE}</p>
        </div>
        <div class="home-status" aria-label="Stav modulů">
          <span class="home-status__item">
            <span class="home-status__value">${modulesForUser.length}</span>
            <span class="home-status__label">modulů</span>
          </span>
          <span class="home-status__item">
            <span class="home-status__value">${completedCount}</span>
            <span class="home-status__label">hotový</span>
          </span>
        </div>
      </section>
      <section class="module-grid" aria-label="Hlavní moduly">
        ${cards}
      </section>
      ${VersionBackupInfo()}
      ${VersionNewsInfo()}
    </main>
  `;
}

function usersManagementSection() {
  if (adminUsersState.loading) {
    return '<section class="users-panel"><p>Načítám uživatele...</p></section>';
  }

  const user = currentUser();
  const users = allAccessUsers();
  const selectedUser = selectedAccessUser(users);
  const canEditUsers = hasPermission(user, "users", "edit") || hasPermission(user, "users", "manage");
  const canManageRoles = hasPermission(user, "users", "manage");
  const canEditManagerColumn = canEditManagers();

  const rows = users
    .map(
      (user) => `
        <tr class="${String(user.id) === String(selectedUser?.id) ? "users-table__row--selected" : ""}">
          <td data-label="Jméno"><strong>${escapeHtml(user.name || "Bez jména")}</strong></td>
          <td data-label="Kontakt">${stackedCell(user.email, user.phone)}</td>
          <td data-label="Role">${escapeHtml(roleLabel(user.role))}</td>
          <td data-label="Nadřízený">${managerCell(user, users, canEditManagerColumn)}</td>
          <td data-label="Stav">${statusPill(user)}</td>
          <td data-label="Poslední přihlášení">${formatDateTime(user.lastLoginAt)}</td>
          <td data-label="Akce">
            <div class="users-actions">
              <button
                class="secondary-link secondary-link--compact"
                type="button"
                data-access-edit-user="${escapeHtml(user.id)}"
                ${String(user.id) === String(selectedUser?.id) ? 'aria-current="true"' : ""}
              >
                ${String(user.id) === String(selectedUser?.id) ? "Vybráno" : "Upravit"}
              </button>
              ${canEditUsers ? (
                user.active === false
                  ? `<button class="text-action text-action--compact" type="button" data-access-enable-user="${escapeHtml(user.id)}">Zapnout</button>`
                  : `<button class="text-action text-action--compact" type="button" data-access-disable-user="${escapeHtml(user.id)}">Vypnout</button>`
              ) : ""}
            </div>
          </td>
        </tr>
      `
    )
    .join("") || `
      <tr>
        <td colspan="7">Zatím tu není žádný uživatel.</td>
      </tr>
    `;

  return `
    ${accessNotice()}
    ${accessToast()}
    ${adminUsersState.error ? `<section class="users-panel"><p class="login-error">${escapeHtml(adminUsersState.error)}</p></section>` : ""}
    <section class="users-panel" aria-labelledby="users-title">
      <div class="users-panel__head">
        <div>
          <h2 id="users-title">Přehled uživatelů</h2>
          <p>Vidíte role, stav účtu a možnost upravit konkrétní oprávnění. Změny se ukládají do centrální správy uživatelů.</p>
        </div>
        ${canEditUsers ? '<button class="primary-action" type="button" data-access-new-user>Přidat uživatele</button>' : ""}
      </div>
      <div class="users-table-wrap">
        <table class="users-table">
          <thead>
            <tr>
              <th>Jméno</th>
              <th>Kontakt</th>
              <th>Role</th>
              <th>Nadřízený</th>
              <th>Stav</th>
              <th>Poslední přihlášení</th>
              <th>Akce</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
    ${accessUserForm(selectedUser, canEditUsers)}
    ${rolesManagementSection(canManageRoles)}
  `;
}

function canManageAppearanceSettings(user = currentUser()) {
  return hasPermission(user, "settings", "manage");
}

function settingsManagementSection(user) {
  if (!canManageAppearanceSettings(user)) {
    return "";
  }

  return AppearanceSettingsBox({
    draftSettings: themeState.draft,
    savedSettings: themeState.settings,
    loading: themeState.loading,
    saving: themeState.saving,
    previewActive: Boolean(themeState.preview),
    message: themeState.message,
    error: themeState.error
  });
}

function formatAbsenceDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T12:00:00`));
}

function formatAbsenceMonth(monthKey) {
  if (!monthKey) {
    return "neuvedeno";
  }

  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("cs-CZ", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, 1));
}

function formatAbsenceDays(value) {
  const days = Number(value || 0);
  const formatted = days.toLocaleString("cs-CZ", { maximumFractionDigits: 1 });

  if (days === 1) {
    return "1 den";
  }

  if (Number.isInteger(days) && days >= 2 && days <= 4) {
    return `${formatted} dny`;
  }

  return `${formatted} dne`;
}

function absenceSubmitLabel(type) {
  if (type === "Nemoc") {
    return "Nahlásit nemoc";
  }

  if (type === "OČR") {
    return "Nahlásit OČR";
  }

  return "Odeslat žádost";
}

function absenceStatusBadge(status) {
  const tone = ABSENCE_STATUS_TONES[status] || "new";
  return `<span class="absence-badge absence-badge--${tone}">${escapeHtml(status)}</span>`;
}

function absenceTypeBadge(type) {
  const tone = ABSENCE_TYPE_TONES[type] || "vacation";
  return `<span class="absence-type absence-type--${tone}">${escapeHtml(type)}</span>`;
}

function canUseAbsenceTab(user, tabId) {
  if (!canViewModule(user, "absence")) {
    return false;
  }

  if (tabId === "new") {
    return hasPermission(user, "absence", "create");
  }

  if (tabId === "approval") {
    return hasPermission(user, "absence", "approve");
  }

  if (tabId === "reports") {
    return hasPermission(user, "absence", "export");
  }

  if (tabId === "settings") {
    return hasPermission(user, "absence", "manage");
  }

  return true;
}

function absenceTabsForUser(user) {
  return ABSENCE_TABS.filter((tab) => canUseAbsenceTab(user, tab.id));
}

function resolveAbsenceTab(user, tabId) {
  return canUseAbsenceTab(user, tabId) ? tabId : "dashboard";
}

function permissionInlineNotice() {
  return `
    <section class="absence-panel">
      <p class="absence-empty">Nemáte oprávnění k této akci.</p>
    </section>
  `;
}

function absenceFilterPanel(user, mode = "calendar") {
  const employeeOptions = absenceEmployeeOptions(absenceState, user).map((employee) => ({
    value: employee.id,
    label: employee.name
  }));

  return `
    <form class="absence-filters" data-absence-filter-form data-mode="${escapeHtml(mode)}">
      <label>
        <span>Typ</span>
        <select name="type" data-absence-filter>
          ${optionList(ABSENCE_TYPES, absenceUiState.typeFilter)}
        </select>
      </label>
      <label>
        <span>Zaměstnanec</span>
        <select name="employeeId" data-absence-filter>
          ${optionList(employeeOptions, absenceUiState.employeeFilter)}
        </select>
      </label>
      <label>
        <span>Měsíc</span>
        <input name="month" type="month" value="${escapeHtml(absenceUiState.monthFilter)}" data-absence-filter />
      </label>
      <button class="secondary-link absence-filter-button" type="submit">Filtrovat</button>
    </form>
  `;
}

function absenceRequestActions(request, user) {
  const approveButton = canApproveAbsence(request, user)
    ? `
        <button class="absence-icon-button absence-icon-button--approve" type="button" data-absence-approve="${escapeHtml(request.id)}" title="Schválit">
          ✓
        </button>
        <button class="absence-icon-button absence-icon-button--reject" type="button" data-absence-reject="${escapeHtml(request.id)}" title="Zamítnout">
          ×
        </button>
      `
    : "";
  const cancelButton = canCancelAbsence(request, user)
    ? `
        <button class="absence-icon-button" type="button" data-absence-cancel="${escapeHtml(request.id)}" title="Zrušit">
          Zrušit
        </button>
      `
    : "";

  return approveButton || cancelButton
    ? `<div class="absence-actions">${approveButton}${cancelButton}</div>`
    : '<span class="absence-muted">bez akce</span>';
}

function absenceRequestsTable(requests, user, emptyText, showActions = true) {
  if (!requests.length) {
    return `<p class="absence-empty">${emptyText}</p>`;
  }

  return `
    <div class="absence-table-wrap">
      <table class="absence-table">
        <thead>
          <tr>
            <th>Zaměstnanec</th>
            <th>Typ</th>
            <th>Termín</th>
            <th>Dny</th>
            <th>Stav</th>
            ${showActions ? "<th>Akce</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${requests.map((request) => `
            <tr>
              <td data-label="Zaměstnanec">
                <strong>${employeeNameLink(request.employeeId, request.employeeName)}</strong>
                <span>${escapeHtml(request.team || request.department || "Provoz")}</span>
              </td>
              <td data-label="Typ">${absenceTypeBadge(request.type)}</td>
              <td data-label="Termín">
                <strong>${formatAbsenceDate(request.dateFrom)} - ${formatAbsenceDate(request.dateTo)}</strong>
                <span>${request.halfDayFrom || request.halfDayTo ? "obsahuje půlden" : "celý den"}</span>
              </td>
              <td data-label="Dny">${escapeHtml(formatAbsenceDays(request.daysCount))}</td>
              <td data-label="Stav">${absenceStatusBadge(request.status)}</td>
              ${showActions ? `<td data-label="Akce">${absenceRequestActions(request, user)}</td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function absenceMiniList(items, user, emptyText) {
  if (!items.length) {
    return `<p class="absence-empty">${emptyText}</p>`;
  }

  return `
    <ul class="absence-mini-list">
      ${items.map((request) => `
        <li>
          <span class="absence-mini-list__main">
            <strong>${employeeNameLink(request.employeeId, request.employeeName)}</strong>
            <span>${absenceTypeBadge(request.type)} ${absenceStatusBadge(request.status)}</span>
          </span>
          <span class="absence-mini-list__date">
            ${formatAbsenceDate(request.dateFrom)} - ${formatAbsenceDate(request.dateTo)}
          </span>
        </li>
      `).join("")}
    </ul>
  `;
}

function absenceDashboard(user) {
  const summary = absenceSummary(absenceState, user);
  const balance = absenceBalanceForEmployee(absenceState, employeeIdForUser(user));
  const pending = approvalAbsenceRequests(absenceState, user);
  const newRequestButton = hasPermission(user, "absence", "create")
    ? '<button class="primary-action" type="button" data-absence-tab="new">Nová žádost</button>'
    : "";

  return `
    <section class="absence-dashboard" aria-label="Dashboard Dovolená / Nemoc">
      <div class="absence-kpis">
        <article class="absence-kpi">
          <span>Čeká na schválení</span>
          <strong>${summary.pendingCount}</strong>
        </article>
        <article class="absence-kpi">
          <span>Lidé mimo práci dnes</span>
          <strong>${summary.peopleOutToday.length}</strong>
        </article>
        <article class="absence-kpi">
          <span>Dovolená tento měsíc</span>
          <strong>${summary.approvedVacationThisMonth}</strong>
        </article>
        <article class="absence-kpi">
          <span>Nemoc tento měsíc</span>
          <strong>${summary.illnessThisMonth}</strong>
        </article>
        <article class="absence-kpi absence-kpi--action">
          <span>Moje zbývající dovolená</span>
          <strong>${balance.vacationRemainingDays}</strong>
          ${newRequestButton}
        </article>
      </div>

      <div class="absence-panels">
        <section class="absence-panel">
          <div class="absence-panel__head">
            <h2>Žádosti čekající na schválení</h2>
          </div>
          ${absenceRequestsTable(pending, user, "Teď tu není nic ke schválení.")}
        </section>
        <section class="absence-panel">
          <div class="absence-panel__head">
            <h2>Nadcházející nepřítomnosti</h2>
          </div>
          ${absenceMiniList(summary.upcoming, user, "Zatím nejsou naplánované žádné další nepřítomnosti.")}
        </section>
        <section class="absence-panel">
          <div class="absence-panel__head">
            <h2>Mimo práci dnes</h2>
          </div>
          ${absenceMiniList(summary.peopleOutToday, user, "Dnes podle evidence nikdo nechybí.")}
        </section>
      </div>
    </section>
  `;
}

function absenceMyRequests(user) {
  const requests = ownAbsenceRequests(absenceState, user);
  const visibleLabel = canSeeAllAbsences(user)
    ? "Tady vidíte svoje žádosti. V reportech a kalendáři vidíte i ostatní."
    : "Tady vidíte svoje žádosti a hlášení.";
  const newRequestButton = hasPermission(user, "absence", "create")
    ? '<button class="primary-action" type="button" data-absence-tab="new">Nová žádost</button>'
    : "";

  return `
    <section class="absence-panel">
      <div class="absence-panel__head">
        <div>
          <h2>Moje žádosti</h2>
          <p>${visibleLabel}</p>
        </div>
        ${newRequestButton}
      </div>
      ${absenceRequestsTable(requests, user, "Zatím nemáte žádnou žádost.")}
    </section>
  `;
}

function absenceNewRequest(user) {
  if (!hasPermission(user, "absence", "create")) {
    return permissionInlineNotice();
  }

  const employees = absenceEmployeeOptions(absenceState, user);
  const currentEmployeeId = employeeIdForUser(user);
  const employeeOptions = employees.map((employee) => ({
    value: employee.id,
    label: employee.name
  }));
  const substituteOptions = employees
    .filter((employee) => employee.id !== currentEmployeeId)
    .map((employee) => ({
      value: employee.id,
      label: employee.name
    }));
  const canChooseEmployee = canSubmitAbsenceForOthers(user);

  return `
    <section class="absence-panel">
      <div class="absence-panel__head">
        <div>
          <h2>Nová žádost</h2>
          <p>Dovolená, lékař a náhradní volno jdou ke schválení. Nemoc a OČR se pouze evidují.</p>
        </div>
      </div>
      <form class="absence-form" data-absence-request-form>
        ${canChooseEmployee ? `
          <label>
            <span>Zaměstnanec</span>
            <select name="employeeId">
              ${optionList(employeeOptions, currentEmployeeId, "Vyberte zaměstnance")}
            </select>
          </label>
        ` : `<input type="hidden" name="employeeId" value="${escapeHtml(currentEmployeeId)}" />`}
        <label>
          <span>Typ nepřítomnosti</span>
          <select name="type" data-absence-type>
            ${ABSENCE_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Datum od</span>
          <input name="dateFrom" type="date" value="${toIsoDate(new Date())}" data-absence-date required />
        </label>
        <label>
          <span>Datum do</span>
          <input name="dateTo" type="date" value="${toIsoDate(new Date())}" data-absence-date required />
        </label>
        <label class="absence-checkbox">
          <input name="halfDayFrom" type="checkbox" data-absence-date />
          <span>Půlden od</span>
        </label>
        <label class="absence-checkbox">
          <input name="halfDayTo" type="checkbox" data-absence-date />
          <span>Půlden do</span>
        </label>
        <label>
          <span>Zástup</span>
          <select name="substituteUserId">
            ${optionList(substituteOptions, "", "Bez zástupu")}
          </select>
        </label>
        <label>
          <span>Příloha</span>
          <input name="attachment" type="file" multiple />
        </label>
        <label class="absence-form__wide">
          <span>Poznámka</span>
          <textarea name="note" rows="4" placeholder="Volitelná poznámka"></textarea>
        </label>
        <div class="absence-form__summary">
          <span>Počet dnů</span>
          <strong data-absence-days-preview>1 den</strong>
          <small data-absence-status-preview>${initialStatusForAbsenceType("Dovolená")}</small>
        </div>
        <button class="primary-action absence-form__submit" type="submit" data-absence-submit>
          ${absenceSubmitLabel("Dovolená")}
        </button>
      </form>
    </section>
  `;
}

function absenceApproval(user) {
  if (!hasPermission(user, "absence", "approve")) {
    return permissionInlineNotice();
  }

  const requests = approvalAbsenceRequests(absenceState, user);

  return `
    <section class="absence-panel">
      <div class="absence-panel__head">
        <div>
          <h2>Ke schválení</h2>
          <p>Schválení a zamítnutí se ukládá do historie žádosti.</p>
        </div>
      </div>
      ${absenceRequestsTable(requests, user, "Teď tu není žádná žádost ke schválení.")}
    </section>
  `;
}

function absenceCalendarDays(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const start = new Date(firstDay);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  start.setDate(firstDay.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      iso: toIsoDate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month - 1
    };
  });
}

function absenceCalendar(user) {
  const requests = filterAbsenceRequests(visibleAbsenceRequests(absenceState, user), {
    type: absenceUiState.typeFilter,
    employeeId: absenceUiState.employeeFilter,
    month: absenceUiState.monthFilter
  });
  const agenda = [...requests].sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
  const days = absenceCalendarDays(absenceUiState.monthFilter);
  const weekdays = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
  const today = toIsoDate(new Date());

  return `
    <section class="absence-panel">
      <div class="absence-panel__head">
        <div>
          <h2>Kalendář</h2>
          <p>${formatAbsenceMonth(absenceUiState.monthFilter)}</p>
        </div>
      </div>
      ${absenceFilterPanel(user, "calendar")}
      <div class="absence-calendar">
        ${weekdays.map((day) => `<div class="absence-calendar__weekday">${day}</div>`).join("")}
        ${days.map((day) => {
          const dayRequests = requests.filter((request) => requestOverlapsDate(request, day.iso));
          return `
            <div class="absence-calendar__day ${day.inMonth ? "" : "absence-calendar__day--muted"} ${day.iso === today ? "absence-calendar__day--today" : ""}">
              <span class="absence-calendar__date">${day.day}</span>
              <div class="absence-calendar__events">
                ${dayRequests.slice(0, 3).map((request) => `
                  <a
                    class="absence-calendar__event absence-calendar__event--${ABSENCE_TYPE_TONES[request.type] || "vacation"}"
                    href="${routeHref(employeeCardRoute(request.employeeId))}"
                    data-link
                    title="${escapeHtml(`${request.employeeName} · ${request.type}`)}"
                  >
                    ${escapeHtml(request.employeeName)} · ${escapeHtml(request.type)}
                  </a>
                `).join("")}
                ${dayRequests.length > 3 ? `<span class="absence-calendar__more">+${dayRequests.length - 3}</span>` : ""}
              </div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="absence-calendar-agenda">
        <h3>Události v měsíci</h3>
        ${absenceMiniList(agenda, user, "Pro vybraný měsíc nejsou žádné nepřítomnosti.")}
      </div>
    </section>
  `;
}

function absenceReports(user) {
  if (!hasPermission(user, "absence", "export")) {
    return permissionInlineNotice();
  }

  const reportRequests = filterAbsenceRequests(visibleAbsenceRequests(absenceState, user), {
    type: absenceUiState.typeFilter,
    employeeId: absenceUiState.employeeFilter,
    month: absenceUiState.monthFilter
  });
  const totals = monthlyAbsenceTotals(reportRequests);

  return `
    <section class="absence-panel">
      <div class="absence-panel__head">
        <div>
          <h2>Reporty</h2>
          <p>Měsíční report je zatím připravený jako lokální HTML/CSV návrh bez reálného odesílání.</p>
        </div>
        <div class="absence-report-actions">
          <button class="primary-action" type="button" data-absence-generate-report>Vygenerovat měsíční report</button>
          <button class="secondary-link" type="button" data-absence-export-csv>Export CSV</button>
        </div>
      </div>
      ${absenceFilterPanel(user, "reports")}
      <div class="absence-report-grid">
        <article>
          <span>Období</span>
          <strong>${formatAbsenceMonth(absenceUiState.monthFilter)}</strong>
        </article>
        <article>
          <span>Žádostí celkem</span>
          <strong>${reportRequests.length}</strong>
        </article>
        <article>
          <span>Dovolená</span>
          <strong>${formatAbsenceDays(totals.Dovolená)}</strong>
        </article>
        <article>
          <span>Nemoc</span>
          <strong>${formatAbsenceDays(totals.Nemoc)}</strong>
        </article>
        <article>
          <span>Lékař</span>
          <strong>${formatAbsenceDays(totals.Lékař)}</strong>
        </article>
        <article>
          <span>OČR</span>
          <strong>${formatAbsenceDays(totals.OČR)}</strong>
        </article>
        <article>
          <span>Náhradní volno</span>
          <strong>${formatAbsenceDays(totals["Náhradní volno"])}</strong>
        </article>
        <article>
          <span>Čekající žádosti</span>
          <strong>${reportRequests.filter((request) => request.status === "Čeká na schválení").length}</strong>
        </article>
      </div>
      ${absenceRequestsTable(reportRequests, user, "Pro vybrané období nejsou žádné záznamy.", false)}
      <div class="absence-report-history">
        <h3>Historie vygenerovaných reportů</h3>
        ${absenceState.reports.length ? `
          <ul>
            ${absenceState.reports.slice(0, 8).map((report) => `
              <li>
                <strong>${String(report.periodMonth).padStart(2, "0")}/${report.periodYear}</strong>
                <span>${escapeHtml(report.recipientEmail)} · ${escapeHtml(report.status)}</span>
                <small>${formatDateTime(report.generatedAt)}</small>
              </li>
            `).join("")}
          </ul>
        ` : '<p class="absence-empty">Zatím nebyl vygenerovaný žádný report.</p>'}
      </div>
    </section>
  `;
}

function absenceSettings(user) {
  if (!hasPermission(user, "absence", "manage")) {
    return permissionInlineNotice();
  }

  const settings = absenceState.settings;

  return `
    <section class="absence-panel">
      <div class="absence-panel__head">
        <div>
          <h2>Nastavení</h2>
          <p>Měsíční report je připravený pro pozdější backend/worker. Reálné e-maily se bez potvrzení neposílají.</p>
        </div>
      </div>
      <form class="absence-form absence-form--settings" data-absence-settings-form>
        <label>
          <span>Příjemce reportu</span>
          <input name="recipientEmail" type="email" value="${escapeHtml(settings.recipientEmail || ABSENCE_REPORT_EMAIL)}" />
        </label>
        <label>
          <span>Den v měsíci</span>
          <input name="reportDay" type="number" min="1" max="28" value="${escapeHtml(settings.reportDay || ABSENCE_REPORT_DAY)}" />
        </label>
        <label>
          <span>Čas</span>
          <input name="reportTime" type="time" value="${escapeHtml(settings.reportTime || ABSENCE_REPORT_TIME)}" />
        </label>
        <label>
          <span>E-mail provider</span>
          <input name="emailProvider" value="${escapeHtml(settings.emailProvider || "")}" placeholder="nenastaveno" />
        </label>
        <div class="absence-module-note">
          <strong>Plán:</strong> 1× měsíčně v ${escapeHtml(settings.reportTime || ABSENCE_REPORT_TIME)} odeslat report za předchozí měsíc na ${escapeHtml(settings.recipientEmail || ABSENCE_REPORT_EMAIL)}.
        </div>
        <button class="primary-action absence-form__submit" type="submit">Uložit nastavení</button>
      </form>
    </section>
  `;
}

function employeeCardApiBadge() {
  return employeeCardState.apiStatus === "ready"
    ? '<span class="employee-card-status employee-card-status--ready">API aktivní</span>'
    : '<span class="employee-card-status employee-card-status--waiting">Čeká na API</span>';
}

function employeeCardKpis(employee) {
  const balance = employeeCardState.vacationBalance || employee;
  const absence = employeeCardState.absence || {};

  return `
    <div class="employee-card-kpis" aria-label="Přehled zaměstnance">
      <article class="employee-card-kpi">
        <span>Zbývá dovolené</span>
        <strong>${escapeHtml(formatAbsenceDays(balance.vacationRemainingDays ?? employee.vacationRemainingDays ?? 0))}</strong>
      </article>
      <article class="employee-card-kpi">
        <span>Čeká na schválení</span>
        <strong>${escapeHtml(formatAbsenceDays(balance.vacationPendingDays ?? employee.vacationPendingDays ?? 0))}</strong>
      </article>
      <article class="employee-card-kpi">
        <span>Nemoc tento rok</span>
        <strong>${escapeHtml(formatAbsenceDays(absence.sickDaysCurrentYear ?? employee.sickDaysCurrentYear ?? 0))}</strong>
      </article>
      <article class="employee-card-kpi">
        <span>Aktuální stav</span>
        <strong>${escapeHtml(absence.status || employee.currentAbsenceStatus || "v práci")}</strong>
      </article>
    </div>
  `;
}

function employeeCardField(label, content) {
  return `
    <label class="employee-card-field">
      <span>${escapeHtml(label)}</span>
      ${content}
    </label>
  `;
}

function employeeCardInput(name, value, options = {}) {
  const type = options.type || "text";
  const step = options.step ? `step="${escapeHtml(options.step)}"` : "";
  const min = options.min !== undefined ? `min="${escapeHtml(options.min)}"` : "";
  const disabled = options.disabled ? "disabled" : "";

  return `<input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value ?? "")}" ${step} ${min} ${disabled} />`;
}

function employeeCardSelect(name, options, selected, disabled = false, extraAttributes = "") {
  const disabledAttribute = disabled ? "disabled" : "";

  return `
    <select name="${escapeHtml(name)}" ${disabledAttribute} ${extraAttributes}>
      ${options.map((option) => {
        const value = option.value ?? option;
        const label = option.label ?? option;
        return `
          <option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>
            ${escapeHtml(label)}
          </option>
        `;
      }).join("")}
    </select>
  `;
}

function employeeCardReadonlyValue(label, value) {
  return `
    <div class="employee-card-readonly">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "neuvedeno")}</strong>
    </div>
  `;
}

function employeeDocumentsSection(employee, canEdit) {
  const documents = employeeCardState.documents;
  const rows = documents.length
    ? documents.map((document) => `
        <tr>
          <td data-label="Typ">${escapeHtml(document.type || "Dokument")}</td>
          <td data-label="Název">${escapeHtml(document.name || "Bez názvu")}</td>
          <td data-label="Platnost">${escapeHtml(document.expiresAt ? formatAbsenceDate(document.expiresAt) : "neuvedeno")}</td>
          <td data-label="Stav">
            ${document.fileUrl
              ? `<a href="${escapeHtml(document.fileUrl)}" target="_blank" rel="noopener noreferrer">Otevřít</a>`
              : '<span class="employee-card-status employee-card-status--waiting">Čeká na API</span>'}
          </td>
        </tr>
      `).join("")
    : `
      <tr>
        <td colspan="4">Zatím nejsou uložené žádné dokumenty.</td>
      </tr>
    `;

  return `
    <section class="employee-card-section">
      <div class="employee-card-section__head">
        <div>
          <h2>Dokumenty</h2>
          <p>Pracovní smlouvy, dodatky, školení, lékařské prohlídky a ostatní dokumenty.</p>
        </div>
        <div class="employee-card-actions">
          <button class="secondary-link" type="button" disabled>Přidat dokument</button>
          <span class="employee-card-status employee-card-status--waiting">Čeká na API</span>
        </div>
      </div>
      <div class="employee-card-document-types">
        ${DOCUMENT_TYPE_LABELS.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
      </div>
      <div class="absence-table-wrap">
        <table class="absence-table employee-card-table">
          <thead>
            <tr>
              <th>Typ</th>
              <th>Název</th>
              <th>Platnost</th>
              <th>Stav</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${canEdit ? `
        <p class="employee-card-api-note">
          Upload souborů není spuštěný. Chybí ${escapeHtml(employeeCardState.documentsMissingEndpoint)}.
        </p>
      ` : ""}
    </section>
  `;
}

function employeeWorkHistorySection(employee, canEdit) {
  const rows = employeeCardState.workHistory.length
    ? employeeCardState.workHistory.map((item) => `
        <tr>
          <td data-label="Od">${escapeHtml(item.dateFrom ? formatAbsenceDate(item.dateFrom) : "neuvedeno")}</td>
          <td data-label="Do">${escapeHtml(item.dateTo ? formatAbsenceDate(item.dateTo) : "dosud")}</td>
          <td data-label="Pozice">${escapeHtml(item.position || "neuvedeno")}</td>
          <td data-label="Oddělení">${escapeHtml(item.department || "neuvedeno")}</td>
          <td data-label="Poznámka">${escapeHtml(item.note || "")}</td>
        </tr>
      `).join("")
    : `
      <tr>
        <td colspan="5">Zatím tu není žádná pracovní historie.</td>
      </tr>
    `;

  return `
    <section class="employee-card-section">
      <div class="employee-card-section__head">
        <div>
          <h2>Pracovní historie</h2>
          <p>Přehled pracovních pozic, oddělení a poznámek v čase.</p>
        </div>
      </div>
      <div class="absence-table-wrap">
        <table class="absence-table employee-card-table">
          <thead>
            <tr>
              <th>Od</th>
              <th>Do</th>
              <th>Pozice</th>
              <th>Oddělení</th>
              <th>Poznámka</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${canEdit ? `
        <form class="employee-work-history-form" data-employee-work-history-form>
          ${employeeCardField("Datum od", employeeCardInput("dateFrom", "", { type: "date" }))}
          ${employeeCardField("Datum do", employeeCardInput("dateTo", "", { type: "date" }))}
          ${employeeCardField("Pozice", employeeCardInput("position", employee.position || ""))}
          ${employeeCardField("Oddělení", employeeCardInput("department", employee.department || ""))}
          <label class="employee-card-field employee-card-field--wide">
            <span>Poznámka</span>
            <textarea name="note" rows="3" placeholder="Poznámka k pracovní historii"></textarea>
          </label>
          <button class="secondary-link" type="submit" ${employeeCardState.workHistorySaving ? "disabled" : ""}>
            ${employeeCardState.workHistorySaving ? "Ukládám..." : "Přidat pracovní historii"}
          </button>
        </form>
      ` : ""}
    </section>
  `;
}

function employeeCardContent(employeeId, user) {
  ensureEmployeeCardData(employeeId);

  const employee = employeeCardState.employee;
  const loading = employeeCardState.loadingId === employeeId || employeeCardState.employeesLoading;

  if (loading && (!employee || employee.id !== employeeId)) {
    return '<section class="absence-panel"><p class="absence-empty">Načítám kartu zaměstnance...</p></section>';
  }

  if (!employee || employee.id !== employeeId) {
    return `
      <section class="absence-panel">
        <p class="absence-empty">${employeeCardState.error || "Kartu zaměstnance se nepodařilo otevřít."}</p>
      </section>
    `;
  }

  const canEdit = canEditEmployeeCards(user);
  const canSeeNote = canSeeEmployeeInternalNote(user);
  const disabled = !canEdit || employeeCardState.saving;
  const managerSaving = employeeCardState.managerSaving && employeeCardState.managerPendingId === employee.id;

  return `
    <section class="employee-card" aria-labelledby="employee-card-title">
      <div class="employee-card-header">
        <div>
          <p class="module-detail__eyebrow">Karta zaměstnance</p>
          <h2 id="employee-card-title">${escapeHtml(employeeFullName(employee))}</h2>
          <p>${escapeHtml(employee.position || roleLabel(employee.role))} · ${escapeHtml(employee.department || "bez oddělení")}</p>
        </div>
        <div class="employee-card-header__actions">
          ${employeeCardApiBadge()}
          <select class="employee-card-switcher" data-employee-card-select aria-label="Vybrat zaměstnance">
            ${employeeOptionList(employee.id)}
          </select>
          <button class="secondary-link" type="button" data-employee-open-requests="${escapeHtml(employee.id)}">
            Otevřít žádosti zaměstnance
          </button>
        </div>
      </div>

      ${employeeCardState.message ? `<p class="module-feedback__notice">${escapeHtml(employeeCardState.message)}</p>` : ""}
      ${employeeCardState.error ? `<p class="module-feedback__error">${escapeHtml(employeeCardState.error)}</p>` : ""}
      ${employeeCardKpis(employee)}

      <form class="employee-card-form" data-employee-card-form data-employee-id="${escapeHtml(employee.id)}">
        <div class="employee-card-grid">
          <section class="employee-card-section">
            <div class="employee-card-section__head">
              <div>
                <h2>Základní údaje</h2>
                <p>Kontaktní údaje, role a pracovní zařazení zaměstnance.</p>
              </div>
            </div>
            <div class="employee-card-fields">
              ${employeeCardField("Jméno", employeeCardInput("firstName", employee.firstName, { disabled }))}
              ${employeeCardField("Příjmení", employeeCardInput("lastName", employee.lastName, { disabled }))}
              ${employeeCardField("E-mail", employeeCardInput("email", employee.email, { type: "email", disabled }))}
              ${employeeCardField("Telefon", employeeCardInput("phone", employee.phone, { disabled }))}
              ${employeeCardField("Role", employeeCardSelect("role", ROLE_DEFINITIONS.map((role) => ({ value: role.id, label: role.label })), normalizeRole(employee.role), disabled))}
              ${employeeCardField("Oddělení", employeeCardInput("department", employee.department, { disabled }))}
              ${employeeCardField("Pracovní pozice", employeeCardInput("position", employee.position, { disabled }))}
              ${employeeCardField("Stav zaměstnance", employeeCardSelect("employmentStatus", EMPLOYMENT_STATUS_OPTIONS, employee.employmentStatus || "active", disabled))}
              ${employeeCardField("Datum nástupu", employeeCardInput("startDate", employee.startDate, { type: "date", disabled }))}
              ${employeeCardField("Pracovní úvazek", employeeCardInput("workload", employee.workload, { type: "number", step: "0.1", min: "0", disabled }))}
              ${employeeCardField("Typ pracovního vztahu", employeeCardSelect("employmentType", EMPLOYMENT_TYPE_OPTIONS, employee.employmentType, disabled))}
            </div>
          </section>

          <section class="employee-card-section">
            <div class="employee-card-section__head">
              <div>
                <h2>Dovolená</h2>
                <p>Nárok, čerpání, čekající žádosti a aktuální zůstatek.</p>
              </div>
            </div>
            <div class="employee-card-fields">
              ${employeeCardField("Roční nárok dovolené", employeeCardInput("vacationEntitlementDays", employee.vacationEntitlementDays, { type: "number", step: "0.5", min: "0", disabled }))}
              ${employeeCardField("Čerpáno", employeeCardInput("vacationUsedDays", employee.vacationUsedDays, { type: "number", step: "0.5", min: "0", disabled }))}
              ${employeeCardField("Čeká na schválení", employeeCardInput("vacationPendingDays", employee.vacationPendingDays, { type: "number", step: "0.5", min: "0", disabled }))}
              ${employeeCardReadonlyValue("Zbývá", formatAbsenceDays(employee.vacationRemainingDays || 0))}
            </div>
          </section>

          <section class="employee-card-section">
            <div class="employee-card-section__head">
              <div>
                <h2>Nemoc / absence</h2>
                <p>Aktuální stav, počet dní nemoci a poslední evidence.</p>
              </div>
            </div>
            <div class="employee-card-fields">
              ${employeeCardField("Aktuální stav", employeeCardSelect("currentAbsenceStatus", EMPLOYEE_ABSENCE_STATUS_OPTIONS, employee.currentAbsenceStatus || "v práci", disabled))}
              ${employeeCardField("Nemoc tento rok", employeeCardInput("sickDaysCurrentYear", employee.sickDaysCurrentYear, { type: "number", step: "0.5", min: "0", disabled }))}
              ${employeeCardField("Poslední absence", employeeCardInput("lastAbsenceDate", employee.lastAbsenceDate, { type: "date", disabled }))}
              ${employeeCardReadonlyValue("Přehled absencí", employeeCardState.absence?.note || "Detailní seznam čeká na cloudové API nepřítomností.")}
            </div>
          </section>

          <section class="employee-card-section">
            <div class="employee-card-section__head">
              <div>
                <h2>Nadřízený a schvalování</h2>
                <p>Aktuální nadřízený a schvalovatel dovolené.</p>
              </div>
              ${managerSaving ? '<span class="employee-card-status employee-card-status--waiting">Ukládám...</span>' : ""}
            </div>
            <div class="employee-card-fields">
              ${employeeCardField("Aktuální nadřízený", employeeCardSelect(
                "managerId",
                [{ value: "", label: "Bez nadřízeného" }, ...employeeCardState.employees
                  .filter((item) => item.id !== employee.id && item.employmentStatus !== "inactive")
                  .map((item) => ({ value: item.id, label: employeeFullName(item) }))],
                employee.managerId || "",
                !canEdit || employeeCardState.managerSaving,
                `data-employee-manager-select data-employee-manager-employee="${escapeHtml(employee.id)}"`
              ))}
              ${employeeCardReadonlyValue("Schvalovatel dovolené", employee.managerName || "Bez nadřízeného")}
            </div>
          </section>

          ${canSeeNote ? `
            <section class="employee-card-section employee-card-section--wide">
              <div class="employee-card-section__head">
                <div>
                  <h2>Poznámky</h2>
                  <p>Interní poznámka kanceláře a managementu.</p>
                </div>
              </div>
              <label class="employee-card-field employee-card-field--wide">
                <span>Interní poznámka</span>
                <textarea name="internalNote" rows="4" ${disabled ? "disabled" : ""}>${escapeHtml(employee.internalNote || "")}</textarea>
              </label>
            </section>
          ` : '<input type="hidden" name="internalNote" value="" />'}
        </div>

        ${canEdit ? `
          <div class="employee-card-form-actions">
            <button class="text-action" type="button" data-employee-focus-edit>Upravit údaje</button>
            <button class="primary-action" type="submit" ${employeeCardState.saving ? "disabled" : ""}>
              ${employeeCardState.saving ? "Ukládám..." : "Uložit změny"}
            </button>
            <button class="secondary-link" type="button" data-employee-discard>
              Zrušit změny
            </button>
          </div>
        ` : ""}
      </form>

      <div class="employee-card-grid employee-card-grid--bottom">
        ${employeeWorkHistorySection(employee, canEdit)}
        ${employeeDocumentsSection(employee, canEdit)}
      </div>
    </section>
  `;
}

function absenceActiveContent(activeTab, user, context = {}) {
  const safeTab = resolveAbsenceTab(user, activeTab);

  if (safeTab === "my") {
    return absenceMyRequests(user);
  }

  if (safeTab === "new") {
    return absenceNewRequest(user);
  }

  if (safeTab === "approval") {
    return absenceApproval(user);
  }

  if (safeTab === "calendar") {
    return absenceCalendar(user);
  }

  if (safeTab === "employee-card") {
    return employeeCardContent(context.employeeId || employeeIdForUser(user), user);
  }

  if (safeTab === "reports") {
    return absenceReports(user);
  }

  if (safeTab === "settings") {
    return absenceSettings(user);
  }

  return absenceDashboard(user);
}

function absenceModulePage(moduleItem, user, isDashboard = false, context = {}) {
  const activeTab = resolveAbsenceTab(user, context.employeeId ? "employee-card" : (isDashboard ? "dashboard" : absenceUiState.tab));
  const feedbackBox = activeTab === "dashboard"
    ? moduleFeedbackBoxFor(moduleItem, user, {
        moduleId: "dovolena-nemoc",
        moduleName: "Dovolená / Nemoc",
        placeholder: "Např. chybí mi přehled zůstatku dovolené, filtr podle zaměstnance, export do PDF…"
      })
    : "";
  const tabs = absenceTabsForUser(user);

  return `
    <main class="app-shell module-page module-theme-scope absence-page" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na ${APP_NAME}">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>

      <section class="absence-hero" aria-labelledby="absence-title">
        <div class="module-detail__icon">${renderModuleIcon(moduleItem)}</div>
        <div>
          <div class="module-detail__eyebrow">SMART ODPADY / DOVOLENÁ A NEMOC</div>
          <h1 id="absence-title">Dovolená / Nemoc</h1>
          <p>Jedno místo pro žádosti o dovolenou, nemoc, lékaře, OČR a náhradní volno.</p>
        </div>
        <div class="absence-hero__meta">
          <span>Report</span>
          <strong>${ABSENCE_REPORT_EMAIL}</strong>
          <small>${ABSENCE_REPORT_DAY}. den v měsíci · ${ABSENCE_REPORT_TIME}</small>
        </div>
      </section>

      <nav class="absence-tabs" aria-label="Menu modulu Dovolená / Nemoc">
        ${tabs.map((tab) => `
          <button
            class="absence-tab ${tab.id === activeTab ? "absence-tab--active" : ""}"
            type="button"
            data-absence-tab="${escapeHtml(tab.id)}"
          >
            ${escapeHtml(tab.label)}
          </button>
        `).join("")}
      </nav>

      ${absenceUiState.message ? `<p class="module-feedback__notice">${escapeHtml(absenceUiState.message)}</p>` : ""}
      ${absenceUiState.error ? `<p class="module-feedback__error">${escapeHtml(absenceUiState.error)}</p>` : ""}
      ${absenceActiveContent(activeTab, user, context)}
      ${feedbackBox}
    </main>
  `;
}

function modulePage(moduleItem, user, isDashboard = false) {
  if (moduleItem.id === "absence") {
    return absenceModulePage(moduleItem, user, isDashboard);
  }

  const isTyres = moduleItem.id === "tyres";
  const title = isDashboard ? moduleItem.pageTitle : moduleItem.title;
  const description = isTyres && !isDashboard
    ? "Hotový modul evidence pneumatik."
    : moduleItem.description;
  const dashboardLink = !isDashboard && moduleItem.dashboardRoute
    ? `<a class="secondary-link" href="${routeHref(moduleItem.dashboardRoute)}" data-link>Dashboard modulu</a>`
    : "";
  const tyresLink = isTyres && !isDashboard
    ? `
        <a class="primary-link" href="${TYRES_MODULE_URL}" target="_blank" rel="noopener noreferrer">
          Otevřít modul Pneumatiky
        </a>
      `
    : "";
  const usersPanel = moduleItem.id === "users" && !isDashboard ? usersManagementSection() : "";
  const settingsPanel = moduleItem.id === "settings" && !isDashboard ? settingsManagementSection(user) : "";
  const feedbackBox = moduleFeedbackBoxFor(moduleItem, user);

  return `
    <main class="app-shell module-page module-theme-scope" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na ${APP_NAME}">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>

      <section class="module-detail" aria-labelledby="module-title">
        <div class="module-detail__icon">${renderModuleIcon(moduleItem)}</div>
        <div class="module-detail__body">
          <div class="module-detail__eyebrow">${isDashboard ? "Modulový dashboard" : "Modul"}</div>
          <h1 id="module-title">${title}</h1>
          <p>${description}</p>
          <div class="module-detail__status">
            <span>Stav</span>
            <strong>${moduleItem.status}</strong>
          </div>
          <div class="module-actions">
            ${tyresLink}
            ${dashboardLink}
          </div>
        </div>
      </section>
      ${usersPanel}
      ${settingsPanel}
      ${feedbackBox}
    </main>
  `;
}

function compactStatsList(items, emptyText) {
  const entries = Object.entries(items).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    return `<p class="feedback-empty">${emptyText}</p>`;
  }

  return `
    <ul class="feedback-breakdown">
      ${entries.map(([label, count]) => `
        <li>
          <span>${escapeHtml(label)}</span>
          <strong>${count}</strong>
        </li>
      `).join("")}
    </ul>
  `;
}

function priorityTone(priority) {
  return {
    Nízká: "low",
    Běžná: "normal",
    Důležitá: "important",
    Kritická: "critical"
  }[priority] || "normal";
}

function feedbackAdminItem(item, canEdit) {
  return `
    <article class="feedback-ticket">
      <header class="feedback-ticket__header">
        <div>
          <p class="feedback-ticket__module">${escapeHtml(item.moduleName)}</p>
          <h3>${escapeHtml(item.userName)}</h3>
        </div>
        <span class="feedback-priority feedback-priority--${priorityTone(item.priority)}">${escapeHtml(item.priority)}</span>
      </header>

      <p class="feedback-ticket__message">${escapeHtml(item.message)}</p>

      <dl class="feedback-ticket__meta">
        <div>
          <dt>Vytvořeno</dt>
          <dd>${formatDateTime(item.createdAt)}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>${escapeHtml(roleLabel(item.userRole))}</dd>
        </div>
        <div>
          <dt>ID</dt>
          <dd>${escapeHtml(item.id.slice(0, 8))}</dd>
        </div>
      </dl>

      ${canEdit ? `
        <div class="feedback-ticket__controls">
          <label class="module-feedback__field">
            <span>Stav</span>
            <select data-feedback-status data-feedback-id="${escapeHtml(item.id)}">
              ${FEEDBACK_STATUSES.map((status) => `
                <option value="${escapeHtml(status)}" ${status === item.status ? "selected" : ""}>${escapeHtml(status)}</option>
              `).join("")}
            </select>
          </label>
          <label class="module-feedback__field module-feedback__field--message">
            <span>Interní poznámka</span>
            <textarea
              rows="3"
              data-feedback-note
              data-feedback-id="${escapeHtml(item.id)}"
              placeholder="Interní poznámka pro kancelář / management"
            >${escapeHtml(item.internalNote)}</textarea>
          </label>
        </div>
      ` : ""}
    </article>
  `;
}

function feedbackPage(user) {
  const allFeedback = readModuleFeedback();
  const visibleFeedback = visibleFeedbackForUser(allFeedback, user);
  const summary = feedbackSummary(visibleFeedback);
  const filteredFeedback = filterModuleFeedback(visibleFeedback, feedbackFilters);
  const canEdit = canManageFeedback(user);
  const canExport = hasPermission(user, "feedback", "export");
  const moduleOptions = orderedModules.map((moduleItem) => ({
    value: moduleItem.id === "absence" ? "dovolena-nemoc" : moduleItem.id,
    label: moduleItem.title
  }));
  const items = filteredFeedback
    .map((item) => feedbackAdminItem(item, canEdit))
    .join("");

  return `
    <main class="app-shell module-page module-theme-scope" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na ${APP_NAME}">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>

      <section class="feedback-admin" aria-labelledby="feedback-title">
        <div class="feedback-admin__head">
          <div>
            <p class="module-detail__eyebrow">Správa</p>
            <h1 id="feedback-title">Připomínky</h1>
            <p>Seznam připomínek k modulům, jejich stavů, priorit a interních poznámek.</p>
          </div>
          ${canExport ? `
            <button class="primary-action feedback-admin__export" type="button" data-feedback-export>
              Export CSV
            </button>
          ` : ""}
        </div>

        <div class="feedback-stats" aria-label="Dashboard připomínek">
          <div class="feedback-stat">
            <span>Nové</span>
            <strong>${summary.newCount}</strong>
          </div>
          <div class="feedback-stat">
            <span>V řešení</span>
            <strong>${summary.inProgressCount}</strong>
          </div>
          <div class="feedback-stat">
            <span>Hotovo</span>
            <strong>${summary.doneCount}</strong>
          </div>
        </div>

        <div class="feedback-dashboard">
          <section>
            <h2>Podle modulů</h2>
            ${compactStatsList(summary.byModule, "Zatím nejsou uložené žádné připomínky.")}
          </section>
          <section>
            <h2>Podle priority</h2>
            ${compactStatsList(summary.byPriority, "Zatím nejsou uložené žádné priority.")}
          </section>
        </div>

        <form class="feedback-filters" data-feedback-filters>
          <label>
            <span>Modul</span>
            <select name="moduleId" data-feedback-filter>
              ${optionList(moduleOptions, feedbackFilters.moduleId)}
            </select>
          </label>
          <label>
            <span>Stav</span>
            <select name="status" data-feedback-filter>
              ${optionList(FEEDBACK_STATUSES, feedbackFilters.status)}
            </select>
          </label>
          <label>
            <span>Priorita</span>
            <select name="priority" data-feedback-filter>
              ${optionList(FEEDBACK_PRIORITIES, feedbackFilters.priority)}
            </select>
          </label>
          <label>
            <span>Autor</span>
            <input name="author" value="${escapeHtml(feedbackFilters.author)}" placeholder="Jméno autora" />
          </label>
          <label class="feedback-filters__search">
            <span>Vyhledat</span>
            <input name="search" value="${escapeHtml(feedbackFilters.search)}" placeholder="Text připomínky nebo poznámky" />
          </label>
          <button class="secondary-link feedback-filter-button" type="submit">Filtrovat</button>
        </form>

        <div class="feedback-list" aria-label="Seznam připomínek">
          ${items || '<p class="feedback-empty feedback-empty--large">Žádná připomínka neodpovídá filtru.</p>'}
        </div>
      </section>
    </main>
  `;
}

function forbiddenPage(user) {
  return `
    <main class="app-shell module-page module-theme-scope" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na ${APP_NAME}">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>
      <section class="module-detail" aria-labelledby="module-title">
        <div class="module-detail__body">
          <div class="module-detail__eyebrow">Oprávnění</div>
          <h1 id="module-title">Nemáte oprávnění</h1>
          <p>Nemáte oprávnění k této části systému.</p>
          <p>Pokud přístup potřebujete, obraťte se na kancelář nebo administrátora.</p>
          <div class="module-actions">
            <a class="primary-link" href="${routeHref("/")}" data-link>Zpět na hlavní stránku</a>
          </div>
        </div>
      </section>
    </main>
  `;
}

function notFoundPage(user) {
  return `
    <main class="app-shell module-page module-theme-scope" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na ${APP_NAME}">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>
      <section class="module-detail" aria-labelledby="module-title">
        <div class="module-detail__body">
          <div class="module-detail__eyebrow">Nenalezeno</div>
          <h1 id="module-title">Stránka neexistuje</h1>
          <p>Požadovaná route zatím není v aplikaci Smart odpady připravená.</p>
        </div>
      </section>
    </main>
  `;
}

function appErrorPage() {
  return `
    <main class="login-shell">
      <section class="login-panel" aria-labelledby="app-error-title">
        <a class="kaiser-logo" href="${routeHref("/")}" data-link aria-label="${APP_NAME}">kaiser.</a>
        <h1 id="app-error-title">${APP_NAME}</h1>
        <p class="login-subtitle">Aplikace se nepodařila načíst.</p>
        <p class="login-error">
          Aplikace narazila na chybu. Obnovte stránku, případně se vraťte na hlavní stránku.
        </p>
        <a class="primary-action" href="${routeHref("/")}" data-link>Zpět na hlavní stránku</a>
      </section>
    </main>
  `;
}

async function apiJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Požadavek se nepodařilo dokončit.");
  }

  return payload;
}

function upsertEmployeeCardInList(employee) {
  const existingIndex = employeeCardState.employees.findIndex((item) => item.id === employee.id);

  if (existingIndex >= 0) {
    employeeCardState.employees = [
      ...employeeCardState.employees.slice(0, existingIndex),
      employee,
      ...employeeCardState.employees.slice(existingIndex + 1)
    ];
    return;
  }

  employeeCardState.employees = [...employeeCardState.employees, employee]
    .sort((a, b) => employeeFullName(a).localeCompare(employeeFullName(b), "cs"));
}

async function loadEmployeeList(options = {}) {
  if (
    authState.status !== "authenticated" ||
    !authState.user ||
    employeeCardState.employeesLoaded ||
    employeeCardState.employeesLoading ||
    !hasPermission(currentUser(), "absence", "view")
  ) {
    return;
  }

  employeeCardState.employeesLoading = true;
  employeeCardState.error = "";

  try {
    const result = await apiJson("/api/employees");
    employeeCardState.employees = Array.isArray(result.employees) ? result.employees : [];
    employeeCardState.apiStatus = result.apiStatus || "waiting";
    employeeCardState.employeesLoaded = true;
  } catch (error) {
    console.error("smart_odpady_employees_load_failed", error);
    employeeCardState.error = "Seznam zaměstnanců se teď nepodařilo načíst.";
  } finally {
    employeeCardState.employeesLoading = false;
  }

  if (options.renderAfter !== false) {
    render();
  }
}

async function loadEmployeeCard(employeeId, options = {}) {
  if (
    !employeeId ||
    authState.status !== "authenticated" ||
    !authState.user ||
    employeeCardState.loadingId === employeeId
  ) {
    return;
  }

  employeeCardState.loadingId = employeeId;
  employeeCardState.failedId = "";
  employeeCardState.error = "";
  employeeCardState.message = "";

  if (options.clearCurrent !== false && employeeCardState.employee?.id !== employeeId) {
    employeeCardState.employee = null;
    employeeCardState.absence = null;
    employeeCardState.vacationBalance = null;
    employeeCardState.workHistory = [];
    employeeCardState.documents = [];
  }

  if (options.renderBefore !== false) {
    render();
  }

  try {
    const detail = await apiJson(`/api/employees/${encodeURIComponent(employeeId)}`);
    employeeCardState.employee = detail.employee || null;
    employeeCardState.apiStatus = detail.apiStatus || employeeCardState.apiStatus;

    if (detail.employee) {
      upsertEmployeeCardInList(detail.employee);
    }

    const [vacation, absence, history, documents] = await Promise.allSettled([
      apiJson(`/api/employees/${encodeURIComponent(employeeId)}/vacation-balance`),
      apiJson(`/api/employees/${encodeURIComponent(employeeId)}/absence`),
      apiJson(`/api/employees/${encodeURIComponent(employeeId)}/work-history`),
      apiJson(`/api/employees/${encodeURIComponent(employeeId)}/documents`)
    ]);

    if (vacation.status === "fulfilled") {
      employeeCardState.vacationBalance = vacation.value;
    }

    if (absence.status === "fulfilled") {
      employeeCardState.absence = absence.value;
    }

    if (history.status === "fulfilled") {
      employeeCardState.workHistory = Array.isArray(history.value.items) ? history.value.items : [];
    }

    if (documents.status === "fulfilled") {
      employeeCardState.documents = Array.isArray(documents.value.documents) ? documents.value.documents : [];
      employeeCardState.documentsUploadStatus = documents.value.uploadStatus || "waiting";
      employeeCardState.documentsMissingEndpoint = documents.value.missingEndpoint || "POST /api/employees/:id/documents";
    }
  } catch (error) {
    console.error("smart_odpady_employee_card_load_failed", error);
    employeeCardState.failedId = employeeId;
    employeeCardState.error = "Kartu zaměstnance se teď nepodařilo načíst.";
  } finally {
    employeeCardState.loadingId = "";
  }

  if (options.renderAfter !== false) {
    render();
  }
}

function ensureEmployeeCardData(employeeId) {
  if (authState.status !== "authenticated" || !authState.user) {
    return;
  }

  loadEmployeeList();

  if (
    employeeId &&
    employeeCardState.employee?.id !== employeeId &&
    employeeCardState.loadingId !== employeeId &&
    employeeCardState.failedId !== employeeId
  ) {
    loadEmployeeCard(employeeId, { renderBefore: false });
  }
}

async function loadThemeSettings(options = {}) {
  if (!authState.user || themeState.loading) {
    return;
  }

  themeState.loading = true;
  themeState.error = "";

  try {
    const result = await apiJson("/api/theme-settings");
    const settings = normalizeThemeSettings(result.settings);
    themeState.settings = settings;
    themeState.draft = settings;
    themeState.preview = null;
    themeState.loaded = true;
    themeState.message = "";
  } catch (error) {
    console.error("smart_odpady_theme_load_failed", error);
    themeState.settings = normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
    themeState.draft = normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
    themeState.preview = null;
    themeState.error = "Nastavení vzhledu se teď nepodařilo načíst. Používá se výchozí vzhled.";
  } finally {
    themeState.loading = false;
  }

  if (options.renderAfter !== false) {
    render();
  }
}

function updateAppearanceDraft(form, options = {}) {
  themeState.draft = appearanceFormData(form);
  themeState.error = "";

  if (options.preview) {
    themeState.preview = themeState.draft;
    themeState.message = "Náhled změn je zapnutý pouze pro vnitřní modulové stránky.";
  }
}

async function saveAppearanceSettings(settings = themeState.draft) {
  if (!canManageAppearanceSettings()) {
    themeState.error = "Nemáte oprávnění upravovat vzhled aplikace.";
    render();
    return false;
  }

  const payload = normalizeThemeSettings(settings);
  themeState.saving = true;
  themeState.message = "Ukládám vzhled...";
  themeState.error = "";
  themeState.preview = payload;
  render();

  try {
    const result = await apiJson("/api/theme-settings", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    const savedSettings = normalizeThemeSettings(result.settings || payload);
    themeState.settings = savedSettings;
    themeState.draft = savedSettings;
    themeState.preview = null;
    themeState.loaded = true;
    themeState.message = "Vzhled aplikace byl uložen.";
    themeState.error = "";
    return true;
  } catch (error) {
    console.error("smart_odpady_theme_save_failed", error);
    themeState.preview = null;
    themeState.error = "Vzhled se nepodařilo uložit. Zkuste to prosím znovu.";
    themeState.message = "";
    return false;
  } finally {
    themeState.saving = false;
    render();
  }
}

function previewAppearanceSettings(form) {
  updateAppearanceDraft(form, { preview: true });
  render();
}

async function resetAppearanceSettings() {
  themeState.draft = normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
  themeState.preview = themeState.draft;
  await saveAppearanceSettings(themeState.draft);
}

function exportAppearanceSettings() {
  const json = JSON.stringify(normalizeThemeSettings(themeState.draft), null, 2);
  downloadText(`smart-odpady-vzhled-${new Date().toISOString().slice(0, 10)}.json`, json, "application/json;charset=utf-8");
}

async function importAppearanceSettings(input) {
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    themeState.draft = normalizeThemeSettings(JSON.parse(text));
    themeState.preview = themeState.draft;
    themeState.message = "Import je připravený v náhledu. Pro trvalé uložení klikněte na Uložit vzhled.";
    themeState.error = "";
  } catch (error) {
    console.error("smart_odpady_theme_import_failed", error);
    themeState.error = "Import vzhledu se nepodařil. Zkontrolujte JSON soubor.";
    themeState.message = "";
  } finally {
    input.value = "";
    render();
  }
}

async function startLogin(form) {
  const identifier = form.elements.identifier.value.trim();

  if (!identifier) {
    authState.error = "Vyplňte e-mail nebo telefon.";
    render();
    return;
  }

  authState = {
    ...authState,
    status: "submitting",
    pendingIdentifier: identifier,
    message: "",
    error: "",
    mockCode: false
  };
  render();

  try {
    const result = await apiJson("/api/auth/start", {
      method: "POST",
      body: JSON.stringify({ identifier })
    });

    authState = {
      ...authState,
      status: "anonymous",
      codeSent: true,
      message: "Pokud je účet povolený, kód byl odeslán.",
      error: "",
      mockCode: Boolean(result.mock)
    };
  } catch {
    authState = {
      ...authState,
      status: "anonymous",
      error: "Ověřovací kód teď nejde odeslat. Zkuste to prosím znovu.",
      mockCode: false
    };
  }

  render();
}

async function verifyLogin(form) {
  const identifier = authState.pendingIdentifier || form.elements.identifier.value.trim();
  const code = form.elements.code.value.trim();

  if (!code) {
    authState.error = "Vyplňte ověřovací kód.";
    render();
    return;
  }

  authState = {
    ...authState,
    status: "submitting",
    message: "",
    error: ""
  };
  render();

  try {
    const result = await apiJson("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ identifier, code })
    });

    authState = {
      status: "authenticated",
      user: result.user,
      pendingIdentifier: "",
      codeSent: false,
      message: "",
      error: "",
      mockCode: false
    };
    await loadThemeSettings({ renderAfter: false });
  } catch {
    authState = {
      ...authState,
      status: "anonymous",
      error: "Přihlášení se nepodařilo. Zkontrolujte kód a zkuste to znovu."
    };
  }

  render();
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  authState = {
    status: "anonymous",
    user: null,
    pendingIdentifier: "",
    codeSent: false,
    message: "",
    error: "",
    mockCode: false
  };
  adminUsersState.loaded = false;
  adminUsersState.users = [];
  themeState.loaded = false;
  themeState.loading = false;
  themeState.saving = false;
  themeState.settings = normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
  themeState.draft = normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
  themeState.preview = null;
  themeState.message = "";
  themeState.error = "";
  navigateToUrl(routeHref("/"));
}

async function loadAdminUsers() {
  if (adminUsersState.loaded || adminUsersState.loading || !hasPermission(currentUser(), "users", "view")) {
    return;
  }

  adminUsersState.loading = true;
  adminUsersState.error = "";

  try {
    const result = await apiJson("/api/users");
    adminUsersState.users = result.users || [];
    adminUsersState.loaded = true;
  } catch {
    adminUsersState.error = "Seznam uživatelů teď nejde načíst.";
  } finally {
    adminUsersState.loading = false;
    render();
  }
}

function renderAuthenticatedApp(user) {
  const path = normalizePath(window.location.pathname);
  const userPrimaryRoutes = new Map(visibleModules(user).map((moduleItem) => [moduleItem.route, moduleItem]));
  const userDashboardRoutes = new Map(visibleDashboardRoutes(user).map((moduleItem) => [moduleItem.route, moduleItem]));

  if (path === "/") {
    app.innerHTML = homePage(user);
    document.title = APP_NAME;
    return;
  }

  if (path === FEEDBACK_ROUTE) {
    if (!canViewModule(user, "feedback")) {
      app.innerHTML = forbiddenPage(user);
      document.title = `Bez oprávnění | ${APP_NAME}`;
      return;
    }

    app.innerHTML = feedbackPage(user);
    document.title = `Připomínky | ${APP_NAME}`;
    return;
  }

  const employeeId = routeEmployeeId(path);
  if (employeeId) {
    if (!canViewModule(user, "absence")) {
      app.innerHTML = forbiddenPage(user);
      document.title = `Bez oprávnění | ${APP_NAME}`;
      return;
    }

    const moduleItem = absenceModuleItem();
    app.innerHTML = absenceModulePage(moduleItem, user, false, { employeeId });
    const titleName = employeeCardState.employee?.id === employeeId
      ? employeeFullName(employeeCardState.employee)
      : "Karta zaměstnance";
    document.title = `${titleName} | ${APP_NAME}`;
    return;
  }

  if (userPrimaryRoutes.has(path)) {
    const moduleItem = userPrimaryRoutes.get(path);
    app.innerHTML = modulePage(moduleItem, user);
    document.title = `${moduleItem.title} | ${APP_NAME}`;

    if (moduleItem.id === "users" && hasPermission(user, "users", "view")) {
      loadAdminUsers();
    }
    return;
  }

  if (userDashboardRoutes.has(path)) {
    const moduleItem = userDashboardRoutes.get(path);
    app.innerHTML = modulePage(moduleItem, user, true);
    document.title = `${moduleItem.pageTitle} | ${APP_NAME}`;
    return;
  }

  if (primaryRoutes.has(path) || dashboardRoutes.has(path)) {
    app.innerHTML = forbiddenPage(user);
    document.title = `Bez oprávnění | ${APP_NAME}`;
    return;
  }

  app.innerHTML = notFoundPage(user);
  document.title = `Nenalezeno | ${APP_NAME}`;
}

function renderApp() {
  if (authState.status === "loading") {
    app.innerHTML = loadingPage();
    document.title = `Přihlášení | ${APP_NAME}`;
    return;
  }

  if (!authState.user) {
    app.innerHTML = loginPage();
    document.title = `Přihlášení | ${APP_NAME}`;
    return;
  }

  const user = currentUser();

  if (!isUserActive(user)) {
    app.innerHTML = forbiddenPage(user || authState.user);
    document.title = `Bez oprávnění | ${APP_NAME}`;
    return;
  }

  renderAuthenticatedApp(user);
}

function render() {
  try {
    accessUnsavedChangesGuard.unmountModal();
    renderApp();
    app.insertAdjacentHTML("beforeend", accessUnsavedChangesGuard.renderModal());
  } catch (error) {
    console.error("smart_odpady_render_failed", error);
    app.innerHTML = appErrorPage();
    document.title = `Chyba | ${APP_NAME}`;
    scrollToPageTop();
  }
}

async function bootstrapAuth() {
  try {
    const result = await apiJson("/api/me");
    authState = {
      status: "authenticated",
      user: result.user,
      pendingIdentifier: "",
      codeSent: false,
      message: "",
      error: "",
      mockCode: false
    };
    await loadThemeSettings({ renderAfter: false });
  } catch {
    authState = {
      status: "anonymous",
      user: null,
      pendingIdentifier: "",
      codeSent: false,
      message: "",
      error: "",
      mockCode: false
    };
  }

  render();
}

function hasUnsavedChanges() {
  return Boolean(currentDirtyTarget());
}

const accessUnsavedChangesGuard = useUnsavedChangesGuard({
  isDirty: hasUnsavedChanges,
  saveChanges: saveDirtyChanges,
  discardChanges: discardDirtyChanges,
  render
});

function navigateToUrl(url) {
  window.history.pushState({}, "", url);
  lastRenderedUrl = window.location.href;
  render();
}

function guardedAccessAction(action) {
  accessUnsavedChangesGuard.confirm(action);
}

function handlePopStateNavigation() {
  const targetUrl = window.location.href;

  if (accessUnsavedChangesGuard.isDirty()) {
    window.history.pushState({}, "", lastRenderedUrl);
    accessUnsavedChangesGuard.confirm(() => {
      window.history.pushState({}, "", targetUrl);
      lastRenderedUrl = window.location.href;
      render();
    });
    return;
  }

  lastRenderedUrl = targetUrl;
  render();
}

function submitModuleFeedback(form) {
  const user = currentUser();
  if (!hasPermission(user, "feedback", "create")) {
    feedbackFormState[form.dataset.moduleId || ""] = {
      message: "",
      error: "Nemáte oprávnění odeslat připomínku."
    };
    render();
    return;
  }

  const moduleId = form.dataset.moduleId || "";
  const moduleName = form.dataset.moduleName || "";
  const message = form.elements.message.value;
  const priority = form.elements.priority.value;

  try {
    createModuleFeedback({
      moduleId,
      moduleName,
      currentUser: user,
      message,
      priority
    });
    feedbackFormState[moduleId] = {
      message: "Děkujeme, připomínka byla uložena.",
      error: ""
    };
  } catch {
    feedbackFormState[moduleId] = {
      message: "",
      error: "Připomínku se nepodařilo uložit. Zkuste to prosím znovu."
    };
  }

  render();
}

function applyFeedbackFilters(form) {
  feedbackFilters.moduleId = form.elements.moduleId?.value || "";
  feedbackFilters.status = form.elements.status?.value || "";
  feedbackFilters.priority = form.elements.priority?.value || "";
  feedbackFilters.author = form.elements.author?.value || "";
  feedbackFilters.search = form.elements.search?.value || "";
  render();
}

function currentFilteredFeedback() {
  return filterModuleFeedback(visibleFeedbackForUser(readModuleFeedback(), currentUser()), feedbackFilters);
}

function exportFeedbackCsv() {
  if (!hasPermission(currentUser(), "feedback", "export")) {
    return;
  }

  const csv = moduleFeedbackToCsv(currentFilteredFeedback());
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `smart-odpady-pripominky-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function saveAbsence(state) {
  absenceState = saveAbsenceState(state);
}

function setAbsenceNotice(message, error = "") {
  absenceUiState.message = message;
  absenceUiState.error = error;
}

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename, csv) {
  downloadText(filename, csv, "text/csv;charset=utf-8");
}

function submitAbsenceRequest(form) {
  const user = currentUser();
  if (!hasPermission(user, "absence", "create")) {
    setAbsenceNotice("", "Nemáte oprávnění vytvořit žádost.");
    render();
    return;
  }

  const type = form.elements.type.value;
  const dateFrom = form.elements.dateFrom.value;
  const dateTo = form.elements.dateTo.value;
  const halfDayFrom = Boolean(form.elements.halfDayFrom?.checked);
  const halfDayTo = Boolean(form.elements.halfDayTo?.checked);
  const daysCount = countAbsenceDays(dateFrom, dateTo, halfDayFrom, halfDayTo);

  if (!dateFrom || !dateTo || daysCount <= 0) {
    setAbsenceNotice("", "Zkontrolujte prosím datum od a do.");
    render();
    return;
  }

  const employees = absenceEmployeeOptions(absenceState, user);
  const selectedEmployee = employees.find((employee) => employee.id === form.elements.employeeId.value) || employees[0];
  const attachmentInput = form.elements.attachment;
  const attachmentUrls = attachmentInput?.files ? [...attachmentInput.files].map((file) => file.name) : [];
  const nextState = createAbsenceRequest(absenceState, {
    employee: selectedEmployee,
    type,
    dateFrom,
    dateTo,
    halfDayFrom,
    halfDayTo,
    note: form.elements.note.value.trim(),
    attachmentUrls,
    substituteUserId: form.elements.substituteUserId?.value || ""
  }, user);

  saveAbsence(nextState);
  absenceUiState.tab = "my";
  setAbsenceNotice(
    initialStatusForAbsenceType(type) === "Evidováno"
      ? "Nepřítomnost byla evidována."
      : "Žádost byla odeslána ke schválení."
  );
  render();
}

function saveAbsenceSettings(form) {
  if (!hasPermission(currentUser(), "absence", "manage")) {
    setAbsenceNotice("", "Nemáte oprávnění měnit nastavení.");
    render();
    return;
  }

  const nextState = updateAbsenceSettings(absenceState, {
    recipientEmail: form.elements.recipientEmail.value.trim() || ABSENCE_REPORT_EMAIL,
    reportDay: Number(form.elements.reportDay.value || ABSENCE_REPORT_DAY),
    reportTime: form.elements.reportTime.value || ABSENCE_REPORT_TIME,
    emailProvider: form.elements.emailProvider.value.trim()
  });

  saveAbsence(nextState);
  setAbsenceNotice("Nastavení reportu bylo uloženo lokálně.");
  render();
}

function applyAbsenceFilters(form) {
  absenceUiState.typeFilter = form.elements.type?.value || "";
  absenceUiState.employeeFilter = form.elements.employeeId?.value || "";
  absenceUiState.monthFilter = form.elements.month?.value || currentMonthKey();
  render();
}

function updateAbsenceFormPreview(form) {
  const type = form.elements.type.value;
  const days = countAbsenceDays(
    form.elements.dateFrom.value,
    form.elements.dateTo.value,
    Boolean(form.elements.halfDayFrom?.checked),
    Boolean(form.elements.halfDayTo?.checked)
  );
  const daysPreview = form.querySelector("[data-absence-days-preview]");
  const statusPreview = form.querySelector("[data-absence-status-preview]");
  const submitButton = form.querySelector("[data-absence-submit]");

  if (daysPreview) {
    daysPreview.textContent = days > 0 ? formatAbsenceDays(days) : "zkontrolujte datum";
  }

  if (statusPreview) {
    statusPreview.textContent = initialStatusForAbsenceType(type);
  }

  if (submitButton) {
    submitButton.textContent = absenceSubmitLabel(type);
  }
}

function approveAbsenceRequest(requestId) {
  const user = currentUser();
  if (!hasPermission(user, "absence", "approve")) {
    setAbsenceNotice("", "Nemáte oprávnění schvalovat žádosti.");
    render();
    return;
  }

  saveAbsence(changeAbsenceRequestStatus(absenceState, requestId, "Schváleno", user, "Schváleno v modulu Dovolená / Nemoc."));
  setAbsenceNotice("Žádost byla schválena.");
  render();
}

function rejectAbsenceRequest(requestId) {
  const user = currentUser();
  if (!hasPermission(user, "absence", "approve")) {
    setAbsenceNotice("", "Nemáte oprávnění zamítat žádosti.");
    render();
    return;
  }

  const reason = window.prompt("Důvod zamítnutí", "");

  if (reason === null) {
    return;
  }

  saveAbsence(changeAbsenceRequestStatus(absenceState, requestId, "Zamítnuto", user, reason));
  setAbsenceNotice("Žádost byla zamítnuta.");
  render();
}

function cancelAbsenceRequest(requestId) {
  if (!window.confirm("Opravdu zrušit tuto žádost?")) {
    return;
  }

  saveAbsence(changeAbsenceRequestStatus(absenceState, requestId, "Zrušeno", currentUser(), "Zrušeno uživatelem."));
  setAbsenceNotice("Žádost byla zrušena.");
  render();
}

function exportAbsenceCsv() {
  const user = currentUser();
  if (!hasPermission(user, "absence", "export")) {
    setAbsenceNotice("", "Nemáte oprávnění exportovat reporty.");
    render();
    return;
  }

  const requests = filterAbsenceRequests(visibleAbsenceRequests(absenceState, user), {
    type: absenceUiState.typeFilter,
    employeeId: absenceUiState.employeeFilter,
    month: absenceUiState.monthFilter
  });

  downloadCsv(`dovolena-nemoc-${absenceUiState.monthFilter}.csv`, absenceRequestsToCsv(requests));
}

function generateAbsenceMonthlyReport() {
  const user = currentUser();
  if (!hasPermission(user, "absence", "export")) {
    setAbsenceNotice("", "Nemáte oprávnění generovat report.");
    render();
    return;
  }

  const result = generateMonthlyAbsenceReport(absenceState, user);
  saveAbsence(result.state);
  const period = `${String(result.report.periodMonth).padStart(2, "0")}-${result.report.periodYear}`;

  downloadCsv(
    `mesicni-report-nepritomnosti-${period}.csv`,
    monthlyAbsenceReportToCsv(result.report, result.requests)
  );
  setAbsenceNotice("Měsíční report byl vygenerovaný lokálně. Reálný e-mail zatím nebyl odeslán.");
  render();
}

async function saveEmployeeCardChanges(target = currentEmployeeCardDirtyTarget()) {
  if (!target?.isDirty || !employeeCardState.employee?.id) {
    return true;
  }

  employeeCardState.saving = true;
  employeeCardState.message = "Ukládám kartu zaměstnance...";
  employeeCardState.error = "";
  render();

  try {
    const result = await apiJson(`/api/employees/${encodeURIComponent(employeeCardState.employee.id)}`, {
      method: "PATCH",
      body: JSON.stringify(employeeCardComparable(target.current))
    });
    const savedEmployee = result.employee || target.current;
    employeeCardState.employee = savedEmployee;
    upsertEmployeeCardInList(savedEmployee);
    employeeCardState.message = "Karta zaměstnance byla uložena.";
    employeeCardState.error = "";
    return true;
  } catch (error) {
    console.error("smart_odpady_employee_card_save_failed", error);
    employeeCardState.error = "Kartu zaměstnance se nepodařilo uložit. Zkuste to prosím znovu.";
    employeeCardState.message = "";
    return false;
  } finally {
    employeeCardState.saving = false;
    render();
  }
}

function discardEmployeeCardDirtyChanges() {
  employeeCardState.message = "Neuložené změny karty byly zahozeny.";
  employeeCardState.error = "";
  render();
}

async function saveEmployeeManager(employeeId, managerId) {
  if (!canEditEmployeeCards()) {
    employeeCardState.error = "Nemáte oprávnění měnit nadřízeného.";
    render();
    return false;
  }

  employeeCardState.managerSaving = true;
  employeeCardState.managerPendingId = employeeId;
  employeeCardState.message = "Ukládám nadřízeného...";
  employeeCardState.error = "";
  render();

  try {
    const result = await apiJson(`/api/employees/${encodeURIComponent(employeeId)}`, {
      method: "PATCH",
      body: JSON.stringify({ managerId })
    });
    const savedEmployee = result.employee;

    if (savedEmployee) {
      employeeCardState.employee = savedEmployee;
      upsertEmployeeCardInList(savedEmployee);
    }

    employeeCardState.message = "Nadřízený byl uložen.";
    employeeCardState.error = "";
    return true;
  } catch (error) {
    console.error("smart_odpady_employee_manager_save_failed", error);
    employeeCardState.error = "Nadřízeného se nepodařilo uložit.";
    employeeCardState.message = "";
    return false;
  } finally {
    employeeCardState.managerSaving = false;
    employeeCardState.managerPendingId = "";
    render();
  }
}

async function saveEmployeeWorkHistory(form) {
  if (!employeeCardState.employee?.id || !canEditEmployeeCards()) {
    employeeCardState.error = "Nemáte oprávnění upravit pracovní historii.";
    render();
    return;
  }

  employeeCardState.workHistorySaving = true;
  employeeCardState.message = "Ukládám pracovní historii...";
  employeeCardState.error = "";
  render();

  try {
    const result = await apiJson(`/api/employees/${encodeURIComponent(employeeCardState.employee.id)}/work-history`, {
      method: "POST",
      body: JSON.stringify({
        dateFrom: form.elements.dateFrom.value,
        dateTo: form.elements.dateTo.value,
        position: form.elements.position.value.trim(),
        department: form.elements.department.value.trim(),
        note: form.elements.note.value.trim()
      })
    });

    employeeCardState.workHistory = [result.item, ...employeeCardState.workHistory].filter(Boolean);
    employeeCardState.message = "Pracovní historie byla uložena.";
    employeeCardState.error = "";
  } catch (error) {
    console.error("smart_odpady_employee_work_history_save_failed", error);
    employeeCardState.error = "Pracovní historii se nepodařilo uložit.";
    employeeCardState.message = "";
  } finally {
    employeeCardState.workHistorySaving = false;
    render();
  }
}

function canEditAccessUsers() {
  const user = currentUser();
  return hasPermission(user, "users", "edit") || hasPermission(user, "users", "manage");
}

function canManageAccessRoles() {
  return hasPermission(currentUser(), "users", "manage");
}

function setAccessError(error, feedbackTarget = "") {
  setAccessState({
    ...accessState,
    message: "",
    error,
    feedbackTarget
  });
}

function handleAccessActionError(error, message, feedbackTarget = "user") {
  console.error("smart_odpady_access_action_failed", error);
  try {
    setAccessError(message, feedbackTarget);
    render();
  } catch (renderError) {
    console.error("smart_odpady_access_error_render_failed", renderError);
    app.innerHTML = appErrorPage();
    document.title = `Chyba | ${APP_NAME}`;
    scrollToPageTop();
  }
}

async function saveAccessUserForm(form) {
  if (!canEditAccessUsers()) {
    setAccessError("Nemáte oprávnění upravovat uživatele.", "user");
    render();
    return false;
  }

  const now = new Date().toISOString();
  const payload = accessUserFormData(form, { updatedAt: now });

  if (!payload.name) {
    setAccessError("Vyplňte jméno uživatele.", "user");
    render();
    return false;
  }

  if (!payload.email && !payload.phone) {
    setAccessError("Vyplňte alespoň e-mail nebo telefon.", "user");
    render();
    return false;
  }

  const signedUserId = String(currentUser()?.id || "").trim().toLowerCase();
  const targetUserId = String(payload.id || form.dataset.userId || "").trim().toLowerCase();
  if (!payload.active && signedUserId && signedUserId === targetUserId) {
    setAccessError("Vlastní účet nejde vypnout, abyste se nezamkli mimo správu.", "user");
    render();
    return false;
  }

  if (
    signedUserId &&
    signedUserId === targetUserId &&
    isFullAccessRole(currentUser()) &&
    !isFullAccessRole({ role: payload.role, active: true })
  ) {
    setAccessError("Vlastní účet s plným přístupem nejde v testovacím režimu změnit na omezenou roli.", "user");
    render();
    return false;
  }

  setAccessState({
    ...accessState,
    selectedUserId: payload.id,
    message: "Ukládám změny...",
    error: "",
    feedbackTarget: "user"
  });
  render();

  try {
    const savedSourceUser = findSavedAccessUser(form.dataset.userId);
    const isNewUser = !savedSourceUser?.id || String(payload.id || "").startsWith("draft-user-");
    const result = await apiJson(isNewUser ? "/api/users" : `/api/users/${encodeURIComponent(payload.id)}`, {
      method: isNewUser ? "POST" : "PATCH",
      body: JSON.stringify(payload)
    });
    const savedUser = result.user || payload;
    adminUsersState.users = mergeAccessUsers(adminUsersState.users, [savedUser]);
    const users = accessState.users.filter((user) => (
      !sameAccessUserIdentity(user, payload) &&
      !sameAccessUserIdentity(user, savedUser)
    ));
    if (String(authState.user?.id || "") === String(savedUser.id || "")) {
      authState = {
        ...authState,
        user: savedUser
      };
    }
    setAccessState({
      ...accessState,
      users,
      selectedUserId: savedUser.id,
      message: "Změny byly uloženy.",
      error: "",
      feedbackTarget: "user"
    });
    render();
    return true;
  } catch (error) {
    console.error("smart_odpady_user_save_failed", error);
    setAccessError("Změny se teď nepodařilo uložit. Zkuste to prosím znovu za chvíli.", "user");
    render();
    return false;
  }
}

async function saveAccessUserStatus(user, active) {
  const payload = {
    ...user,
    active,
    status: active ? "active" : "disabled",
    updatedAt: new Date().toISOString()
  };

  setAccessState({
    ...accessState,
    selectedUserId: user.id,
    message: active ? "Zapínám uživatele..." : "Vypínám uživatele...",
    error: "",
    feedbackTarget: "user"
  });
  render();

  try {
    const result = await apiJson(`/api/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    const savedUser = result.user || payload;
    adminUsersState.users = mergeAccessUsers(adminUsersState.users, [savedUser]);
    if (String(authState.user?.id || "") === String(savedUser.id || "")) {
      authState = {
        ...authState,
        user: savedUser
      };
    }
    setAccessState({
      ...accessState,
      selectedUserId: savedUser.id,
      message: "Stav uživatele byl uložen.",
      error: "",
      feedbackTarget: "user"
    });
  } catch (error) {
    console.error("smart_odpady_user_status_save_failed", error);
    setAccessError("Stav uživatele se teď nepodařilo uložit. Zkuste to prosím znovu za chvíli.", "user");
  }

  render();
}

async function saveAccessUserManager(userId, managerId) {
  if (!canEditManagers()) {
    setAccessError("Nemáte oprávnění měnit nadřízeného.", "user");
    render();
    return;
  }

  const user = findAccessUser(userId);
  if (!user) {
    setAccessError("Uživatel nebyl nalezen.", "user");
    render();
    return;
  }

  const normalizedManagerId = String(managerId || "").trim();
  if (
    normalizedManagerId &&
    normalizedManagerId.toLowerCase() === String(user.id || "").trim().toLowerCase()
  ) {
    setAccessError("Uživatel nesmí být sám sobě nadřízený.", "user");
    render();
    return;
  }

  if (normalizedManagerId) {
    const manager = allAccessUsers().find((item) => (
      String(item.id || "").trim().toLowerCase() === normalizedManagerId.toLowerCase() &&
      item.active !== false &&
      String(item.status || "active").toLowerCase() !== "disabled"
    ));

    if (!manager) {
      setAccessError("Nadřízeného se nepodařilo uložit.", "user");
      render();
      return;
    }
  }

  accessManagerState.savingUserId = user.id;
  accessManagerState.pendingManagerId = normalizedManagerId;
  setAccessState({
    ...accessState,
    selectedUserId: user.id,
    message: "Ukládám…",
    error: "",
    feedbackTarget: "user"
  });
  render();

  try {
    const result = await apiJson(`/api/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ managerId: normalizedManagerId })
    });
    const savedUser = result.user || {
      ...user,
      managerId: normalizedManagerId,
      managerName: managerLabel({ managerId: normalizedManagerId }, allAccessUsers())
    };
    adminUsersState.users = mergeAccessUsers(adminUsersState.users, [savedUser]);
    if (String(authState.user?.id || "") === String(savedUser.id || "")) {
      authState = {
        ...authState,
        user: savedUser
      };
    }
    setAccessState({
      ...accessState,
      selectedUserId: savedUser.id,
      message: "Nadřízený byl uložen.",
      error: "",
      feedbackTarget: "user"
    });
  } catch (error) {
    console.error("smart_odpady_user_manager_save_failed", error);
    setAccessError("Nadřízeného se nepodařilo uložit.", "user");
  } finally {
    accessManagerState.savingUserId = "";
    accessManagerState.pendingManagerId = "";
    render();
  }
}

function saveAccessRoleForm(form) {
  if (!canManageAccessRoles()) {
    setAccessError("Nemáte oprávnění upravovat role.", "role");
    render();
    return false;
  }

  const roleId = normalizeRole(form.dataset.roleId);
  if (isFullAccessRole({ role: roleId, active: true })) {
    setAccessError("Admin a Management mají v testovacím režimu vždy plná práva a nejde je omezit.", "role");
    render();
    return false;
  }

  setAccessError("Změny oprávnění se teď nepodařilo uložit. Zkuste to prosím znovu za chvíli.", "role");
  render();
  return false;
}

async function saveAccessDirtyChanges() {
  const target = currentAccessDirtyTarget();

  if (!target) {
    return true;
  }

  if (target.type === "user") {
    return saveAccessUserForm(target.form);
  }

  if (target.type === "role") {
    return saveAccessRoleForm(target.form);
  }

  return false;
}

async function saveDirtyChanges() {
  const accessTarget = currentAccessDirtyTarget();

  if (accessTarget) {
    return saveAccessDirtyChanges();
  }

  const appearanceTarget = currentAppearanceDirtyTarget();

  if (appearanceTarget?.isDirty) {
    return saveAppearanceSettings(appearanceTarget.current);
  }

  const employeeTarget = currentEmployeeCardDirtyTarget();

  if (employeeTarget?.isDirty) {
    return saveEmployeeCardChanges(employeeTarget);
  }

  return true;
}

function discardDirtyChanges() {
  const accessTarget = currentAccessDirtyTarget();

  if (accessTarget) {
    discardAccessDirtyChanges();
    return;
  }

  const appearanceTarget = currentAppearanceDirtyTarget();

  if (appearanceTarget?.isDirty) {
    discardAppearanceDirtyChanges();
    return;
  }

  const employeeTarget = currentEmployeeCardDirtyTarget();

  if (employeeTarget?.isDirty) {
    discardEmployeeCardDirtyChanges();
  }
}

function createAccessUser() {
  if (!canEditAccessUsers()) {
    setAccessError("Nemáte oprávnění přidávat uživatele.", "user");
    render();
    return;
  }

  const now = new Date().toISOString();
  const role = "ridic";
  upsertAccessUserInMemory({
    id: nextDraftUserId(),
    name: "Nový uživatel",
    email: "",
    phone: "",
    role,
    department: "",
    position: "",
    managerId: "",
    managerName: "",
    active: true,
    status: "active",
    permissions: userDefaultPermissions(role),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  }, "Nový uživatel je připravený. Pro dokončení klikněte na Uložit uživatele.");
  render();
  focusAccessUserEditor();
}

function selectAccessUser(userId) {
  try {
    const user = findAccessUser(userId);

    if (!user) {
      setAccessError("Uživatel nebyl nalezen.", "user");
      render();
      return;
    }

    setAccessState({
      ...accessState,
      selectedUserId: user.id,
      message: "",
      error: "",
      feedbackTarget: ""
    });
    render();
    requestAnimationFrame(focusAccessUserEditor);
  } catch (error) {
    handleAccessActionError(error, "Uživatele se nepodařilo otevřít. Zkuste obnovit aplikaci.", "user");
  }
}

function selectAccessRole(roleId) {
  setAccessState({
    ...accessState,
    selectedRoleId: normalizeRole(roleId),
    message: "",
    error: "",
    feedbackTarget: ""
  });
  render();
}

function setAccessUserActive(userId, active) {
  if (!canEditAccessUsers()) {
    setAccessError("Nemáte oprávnění měnit stav uživatele.", "user");
    render();
    return;
  }

  const signedUserId = String(currentUser()?.id || "").trim().toLowerCase();
  if (!active && signedUserId && signedUserId === String(userId || "").trim().toLowerCase()) {
    setAccessError("Vlastní účet nejde vypnout, abyste se nezamkli mimo správu.", "user");
    render();
    return;
  }

  const user = findAccessUser(userId);
  if (!user) {
    setAccessError("Uživatel nebyl nalezen.", "user");
    render();
    return;
  }

  saveAccessUserStatus(user, active);
}

function resetAccessUserPermissions(userId) {
  if (!canEditAccessUsers()) {
    setAccessError("Nemáte oprávnění měnit oprávnění uživatele.", "user");
    render();
    return;
  }

  const user = findAccessUser(userId);
  if (!user) {
    setAccessError("Uživatel nebyl nalezen.", "user");
    render();
    return;
  }

  const form = currentAccessUserFormFor(userId);
  const sourceUser = form ? accessUserFormData(form) : user;

  upsertAccessUserInMemory({
    ...sourceUser,
    permissions: userDefaultPermissions(sourceUser.role),
    updatedAt: new Date().toISOString()
  }, "Výchozí práva jsou připravená ve formuláři. Pro trvalou změnu použijte Uložit uživatele.");
  render();
}

function changeAccessUserRole(select) {
  if (!canEditAccessUsers()) {
    return;
  }

  const form = select.closest("[data-access-user-form]");
  const user = findAccessUser(form?.dataset.userId);
  if (!user) {
    return;
  }

  const role = normalizeRole(select.value);
  const signedUserId = String(currentUser()?.id || "").trim().toLowerCase();
  const targetUserId = String(user.id || "").trim().toLowerCase();

  if (
    signedUserId &&
    signedUserId === targetUserId &&
    isFullAccessRole(currentUser()) &&
    !isFullAccessRole({ role, active: true })
  ) {
    setAccessError("Vlastní účet s plným přístupem nejde v testovacím režimu změnit na omezenou roli.", "user");
    render();
    return;
  }

  const sourceUser = accessUserFormData(form, {
    role,
    permissions: userDefaultPermissions(role),
    updatedAt: new Date().toISOString()
  });

  upsertAccessUserInMemory({
    ...sourceUser,
    role,
    permissions: userDefaultPermissions(role)
  }, "Role je změněná jen ve formuláři. Pro trvalou změnu použijte Uložit uživatele.");
  render();
}

document.addEventListener("submit", (event) => {
  const appearanceForm = event.target.closest("[data-appearance-form]");
  if (appearanceForm) {
    event.preventDefault();
    updateAppearanceDraft(appearanceForm, { preview: true });
    saveAppearanceSettings(themeState.draft);
    return;
  }

  const accessUserForm = event.target.closest("[data-access-user-form]");
  if (accessUserForm) {
    event.preventDefault();
    saveAccessUserForm(accessUserForm);
    return;
  }

  const accessRoleForm = event.target.closest("[data-access-role-form]");
  if (accessRoleForm) {
    event.preventDefault();
    saveAccessRoleForm(accessRoleForm);
    return;
  }

  const employeeCardForm = event.target.closest("[data-employee-card-form]");
  if (employeeCardForm) {
    event.preventDefault();
    saveEmployeeCardChanges(currentEmployeeCardDirtyTarget());
    return;
  }

  const employeeWorkHistoryForm = event.target.closest("[data-employee-work-history-form]");
  if (employeeWorkHistoryForm) {
    event.preventDefault();
    saveEmployeeWorkHistory(employeeWorkHistoryForm);
    return;
  }

  const absenceRequestForm = event.target.closest("[data-absence-request-form]");
  if (absenceRequestForm) {
    event.preventDefault();
    submitAbsenceRequest(absenceRequestForm);
    return;
  }

  const absenceSettingsForm = event.target.closest("[data-absence-settings-form]");
  if (absenceSettingsForm) {
    event.preventDefault();
    saveAbsenceSettings(absenceSettingsForm);
    return;
  }

  const absenceFilterForm = event.target.closest("[data-absence-filter-form]");
  if (absenceFilterForm) {
    event.preventDefault();
    applyAbsenceFilters(absenceFilterForm);
    return;
  }

  const feedbackForm = event.target.closest("[data-feedback-form]");
  if (feedbackForm) {
    event.preventDefault();
    submitModuleFeedback(feedbackForm);
    return;
  }

  const filtersForm = event.target.closest("[data-feedback-filters]");
  if (filtersForm) {
    event.preventDefault();
    applyFeedbackFilters(filtersForm);
    return;
  }

  const form = event.target.closest("[data-auth-form]");

  if (!form) {
    return;
  }

  event.preventDefault();

  if (form.dataset.step === "verify") {
    verifyLogin(form);
    return;
  }

  startLogin(form);
});

document.addEventListener("input", (event) => {
  const appearanceField = event.target.closest("[data-appearance-field]");
  if (appearanceField) {
    const form = appearanceField.closest("[data-appearance-form]");
    if (form) {
      updateAppearanceDraft(form);
    }
  }
});

document.addEventListener("change", (event) => {
  const appearanceImport = event.target.closest("[data-appearance-import]");
  if (appearanceImport) {
    importAppearanceSettings(appearanceImport);
    return;
  }

  const appearanceField = event.target.closest("[data-appearance-field]");
  if (appearanceField) {
    const form = appearanceField.closest("[data-appearance-form]");
    if (form) {
      updateAppearanceDraft(form);
      render();
    }
    return;
  }

  const accessManagerSelect = event.target.closest("[data-access-manager-select]");
  if (accessManagerSelect) {
    const userId = accessManagerSelect.dataset.accessManagerUser;
    const nextManagerId = accessManagerSelect.value;
    const previousManagerId = findAccessUser(userId)?.managerId || "";
    accessManagerSelect.value = previousManagerId;
    guardedAccessAction(() => saveAccessUserManager(userId, nextManagerId));
    return;
  }

  const accessUserRole = event.target.closest("[data-access-user-role]");
  if (accessUserRole) {
    changeAccessUserRole(accessUserRole);
    return;
  }

  const employeeCardSelect = event.target.closest("[data-employee-card-select]");
  if (employeeCardSelect) {
    const nextEmployeeId = employeeCardSelect.value;
    employeeCardSelect.value = employeeCardState.employee?.id || "";
    guardedAccessAction(() => navigateToUrl(routeHref(employeeCardRoute(nextEmployeeId))));
    return;
  }

  const employeeManagerSelect = event.target.closest("[data-employee-manager-select]");
  if (employeeManagerSelect) {
    const employeeId = employeeManagerSelect.dataset.employeeManagerEmployee;
    const nextManagerId = employeeManagerSelect.value;
    employeeManagerSelect.value = employeeCardState.employee?.managerId || "";
    guardedAccessAction(() => saveEmployeeManager(employeeId, nextManagerId));
    return;
  }

  const absenceFilter = event.target.closest("[data-absence-filter]");
  if (absenceFilter) {
    const form = absenceFilter.closest("[data-absence-filter-form]");
    if (form) {
      applyAbsenceFilters(form);
    }
    return;
  }

  const absenceFormField = event.target.closest("[data-absence-type], [data-absence-date]");
  if (absenceFormField) {
    const form = absenceFormField.closest("[data-absence-request-form]");
    if (form) {
      updateAbsenceFormPreview(form);
    }
    return;
  }

  const filterField = event.target.closest("[data-feedback-filter]");
  if (filterField) {
    const form = filterField.closest("[data-feedback-filters]");
    if (form) {
      applyFeedbackFilters(form);
    }
    return;
  }

  const statusField = event.target.closest("[data-feedback-status]");
  if (statusField) {
    const user = currentUser();
    if (!canManageFeedback(user)) {
      return;
    }

    updateModuleFeedback(statusField.dataset.feedbackId, { status: statusField.value }, user);
    render();
    return;
  }

  const noteField = event.target.closest("[data-feedback-note]");
  if (noteField) {
    const user = currentUser();
    if (!canManageFeedback(user)) {
      return;
    }

    updateModuleFeedback(noteField.dataset.feedbackId, { internalNote: noteField.value }, user);
  }
});

document.addEventListener("click", async (event) => {
  const appearancePreview = event.target.closest("[data-appearance-preview]");
  if (appearancePreview) {
    const form = appearancePreview.closest("[data-appearance-form]");
    if (form) {
      previewAppearanceSettings(form);
    }
    return;
  }

  const appearanceReset = event.target.closest("[data-appearance-reset]");
  if (appearanceReset) {
    await resetAppearanceSettings();
    return;
  }

  const appearanceExport = event.target.closest("[data-appearance-export]");
  if (appearanceExport) {
    exportAppearanceSettings();
    return;
  }

  const unsavedAction = event.target.closest("[data-unsaved-action]");
  if (unsavedAction) {
    const action = unsavedAction.dataset.unsavedAction;

    if (action === "save") {
      await accessUnsavedChangesGuard.saveAndContinue();
      return;
    }

    if (action === "discard") {
      await accessUnsavedChangesGuard.discardAndContinue();
      return;
    }

    accessUnsavedChangesGuard.stay();
    return;
  }

  const newAccessUser = event.target.closest("[data-access-new-user]");
  if (newAccessUser) {
    guardedAccessAction(createAccessUser);
    return;
  }

  const editAccessUser = event.target.closest("[data-access-edit-user]");
  if (editAccessUser) {
    guardedAccessAction(() => selectAccessUser(editAccessUser.dataset.accessEditUser));
    return;
  }

  const disableAccessUser = event.target.closest("[data-access-disable-user]");
  if (disableAccessUser) {
    guardedAccessAction(() => setAccessUserActive(disableAccessUser.dataset.accessDisableUser, false));
    return;
  }

  const enableAccessUser = event.target.closest("[data-access-enable-user]");
  if (enableAccessUser) {
    guardedAccessAction(() => setAccessUserActive(enableAccessUser.dataset.accessEnableUser, true));
    return;
  }

  const resetUserPermissions = event.target.closest("[data-access-reset-user-permissions]");
  if (resetUserPermissions) {
    resetAccessUserPermissions(resetUserPermissions.dataset.accessResetUserPermissions);
    return;
  }

  const editAccessRole = event.target.closest("[data-access-edit-role]");
  if (editAccessRole) {
    guardedAccessAction(() => selectAccessRole(editAccessRole.dataset.accessEditRole));
    return;
  }

  const employeeFocusEdit = event.target.closest("[data-employee-focus-edit]");
  if (employeeFocusEdit) {
    const firstInput = document.querySelector("[data-employee-card-form] input:not([disabled]), [data-employee-card-form] select:not([disabled]), [data-employee-card-form] textarea:not([disabled])");
    firstInput?.focus();
    return;
  }

  const employeeDiscard = event.target.closest("[data-employee-discard]");
  if (employeeDiscard) {
    discardEmployeeCardDirtyChanges();
    return;
  }

  const employeeOpenRequests = event.target.closest("[data-employee-open-requests]");
  if (employeeOpenRequests) {
    const employeeId = employeeOpenRequests.dataset.employeeOpenRequests || "";
    guardedAccessAction(() => {
      absenceUiState.tab = "reports";
      absenceUiState.employeeFilter = employeeId;
      navigateToUrl(routeHref("/dovolena-nemoc"));
    });
    return;
  }

  const absenceTab = event.target.closest("[data-absence-tab]");
  if (absenceTab) {
    const nextTab = absenceTab.dataset.absenceTab || "dashboard";
    const resolvedTab = resolveAbsenceTab(currentUser(), nextTab);
    const currentPath = normalizePath(window.location.pathname);

    if (resolvedTab === "employee-card") {
      const targetEmployeeId = employeeCardState.employee?.id || employeeCardState.employees[0]?.id || employeeIdForUser(currentUser());
      guardedAccessAction(() => navigateToUrl(routeHref(employeeCardRoute(targetEmployeeId))));
      return;
    }

    guardedAccessAction(() => {
      absenceUiState.tab = resolvedTab;
      setAbsenceNotice("");

      if (routeEmployeeId(currentPath)) {
        navigateToUrl(routeHref("/dovolena-nemoc"));
        return;
      }

      render();
    });
    return;
  }

  const absenceApprove = event.target.closest("[data-absence-approve]");
  if (absenceApprove) {
    approveAbsenceRequest(absenceApprove.dataset.absenceApprove);
    return;
  }

  const absenceReject = event.target.closest("[data-absence-reject]");
  if (absenceReject) {
    rejectAbsenceRequest(absenceReject.dataset.absenceReject);
    return;
  }

  const absenceCancel = event.target.closest("[data-absence-cancel]");
  if (absenceCancel) {
    cancelAbsenceRequest(absenceCancel.dataset.absenceCancel);
    return;
  }

  const absenceExport = event.target.closest("[data-absence-export-csv]");
  if (absenceExport) {
    exportAbsenceCsv();
    return;
  }

  const absenceReport = event.target.closest("[data-absence-generate-report]");
  if (absenceReport) {
    generateAbsenceMonthlyReport();
    return;
  }

  const feedbackExport = event.target.closest("[data-feedback-export]");
  if (feedbackExport) {
    exportFeedbackCsv();
    return;
  }

  const changeIdentifier = event.target.closest("[data-change-identifier]");
  if (changeIdentifier) {
    authState = {
      ...authState,
      status: "anonymous",
      codeSent: false,
      message: "",
      error: "",
      mockCode: false
    };
    render();
    return;
  }

  const logoutButton = event.target.closest("[data-logout]");
  if (logoutButton) {
    guardedAccessAction(logout);
    return;
  }

  const link = event.target.closest("a[data-link]");

  if (!link || link.origin !== window.location.origin) {
    return;
  }

  event.preventDefault();
  guardedAccessAction(() => navigateToUrl(link.href));
});

window.addEventListener("beforeunload", (event) => accessUnsavedChangesGuard.beforeUnload(event));
window.addEventListener("popstate", handlePopStateNavigation);
render();
bootstrapAuth();
