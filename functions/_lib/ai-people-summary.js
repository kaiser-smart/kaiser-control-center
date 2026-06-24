import {
  ACTIONS,
  PERMISSION_MODULES,
  hasPermission,
  roleLabel
} from "../../src/permissions.js";
import { modules } from "../../src/data/modules.js";

const MODULE_TITLE_BY_ID = new Map(modules.map((moduleItem) => [moduleItem.id, moduleItem.title]));
const AI_DYNAMIC_VARIABLE_MAX_LENGTH = 1400;

export function cleanAiString(value) {
  return String(value ?? "").trim();
}

export function normalizeAiSearch(value) {
  return cleanAiString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function clampAiLimit(value, fallback = 5, max = 10) {
  const parsed = Number(value || fallback);
  return Math.max(1, Math.min(Number.isFinite(parsed) ? parsed : fallback, max));
}

function employeeFullName(employee) {
  return [employee?.firstName, employee?.lastName]
    .map(cleanAiString)
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function employeeMatchesAiQuery(employee, query) {
  const normalizedQuery = normalizeAiSearch(query);

  if (!normalizedQuery) {
    return false;
  }

  return normalizeAiSearch([
    employeeFullName(employee),
    employee?.department,
    employee?.position,
    employee?.role,
    roleLabel(employee?.role),
    employee?.managerName
  ].join(" ")).includes(normalizedQuery);
}

export function userMatchesAiQuery(user, query) {
  const normalizedQuery = normalizeAiSearch(query);

  if (!normalizedQuery) {
    return false;
  }

  return normalizeAiSearch([
    user?.name,
    user?.department,
    user?.position,
    user?.role,
    roleLabel(user?.role),
    user?.managerName
  ].join(" ")).includes(normalizedQuery);
}

export function employeeAiRoute(employeeId) {
  const cleanedId = cleanAiString(employeeId);
  return cleanedId ? `/dovolena-nemoc/zamestnanci/${encodeURIComponent(cleanedId)}` : "/dovolena-nemoc/zamestnanci";
}

export function sanitizeEmployeeForAi(employee) {
  const fullName = employeeFullName(employee);

  return {
    id: cleanAiString(employee?.id || employee?.userId),
    userId: cleanAiString(employee?.userId || employee?.id),
    fullName,
    firstName: cleanAiString(employee?.firstName),
    lastName: cleanAiString(employee?.lastName),
    role: cleanAiString(employee?.role),
    roleLabel: roleLabel(employee?.role),
    department: cleanAiString(employee?.department),
    position: cleanAiString(employee?.position),
    managerId: cleanAiString(employee?.managerId),
    managerName: cleanAiString(employee?.managerName),
    employmentStatus: cleanAiString(employee?.employmentStatus),
    currentAbsenceStatus: cleanAiString(employee?.currentAbsenceStatus),
    sickDaysCurrentYear: Number(employee?.sickDaysCurrentYear || 0),
    lastAbsenceDate: cleanAiString(employee?.lastAbsenceDate),
    vacation: {
      year: new Date().getFullYear(),
      entitlementDays: Number(employee?.vacationEntitlementDays || 0),
      usedDays: Number(employee?.vacationUsedDays || 0),
      pendingDays: Number(employee?.vacationPendingDays || 0),
      remainingDays: Number(employee?.vacationRemainingDays || 0)
    },
    route: employeeAiRoute(employee?.id || employee?.userId)
  };
}

function moduleTitle(moduleId) {
  if (moduleId === "*") {
    return "Všechny moduly";
  }

  if (moduleId === "feedback") {
    return "Připomínky";
  }

  return MODULE_TITLE_BY_ID.get(moduleId) || moduleId;
}

export function permissionSummaryForAi(user) {
  const accessibleModules = PERMISSION_MODULES
    .map((moduleId) => {
      const allowedActions = ACTIONS.filter((action) => hasPermission(user, moduleId, action));

      if (!allowedActions.length) {
        return null;
      }

      return {
        moduleId,
        title: moduleTitle(moduleId),
        actions: allowedActions
      };
    })
    .filter(Boolean);

  return {
    role: cleanAiString(user?.role),
    roleLabel: roleLabel(user?.role),
    modules: accessibleModules,
    moduleCount: accessibleModules.length
  };
}

function truncateAiDynamicVariable(value, maxLength = AI_DYNAMIC_VARIABLE_MAX_LENGTH) {
  const cleanedValue = cleanAiString(value).replace(/\s+/g, " ");

  if (cleanedValue.length <= maxLength) {
    return cleanedValue;
  }

  return `${cleanedValue.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function permissionLine(moduleItem) {
  const actions = Array.isArray(moduleItem?.actions) ? moduleItem.actions : [];
  return `${moduleItem.moduleId}:${actions.join("/")}`;
}

export function userDynamicVariablesForAi(user) {
  const access = permissionSummaryForAi(user);
  const availableModules = access.modules
    .map((moduleItem) => moduleItem.title)
    .filter(Boolean)
    .join(", ");
  const userPermissions = access.modules
    .map(permissionLine)
    .filter(Boolean)
    .join("; ");

  return {
    user_name: truncateAiDynamicVariable(user?.name || "Uživatel", 120),
    user_role: truncateAiDynamicVariable(access.roleLabel || access.role || "Uživatel", 120),
    user_permissions: truncateAiDynamicVariable(userPermissions || "bez oprávnění"),
    available_modules: truncateAiDynamicVariable(availableModules || "žádné moduly"),
    user_department: truncateAiDynamicVariable(user?.department || "neuvedeno", 160),
    user_position: truncateAiDynamicVariable(user?.position || "neuvedeno", 160)
  };
}

export function sanitizeUserForAi(user, { includePermissions = false } = {}) {
  return {
    id: cleanAiString(user?.id),
    name: cleanAiString(user?.name),
    role: cleanAiString(user?.role),
    roleLabel: roleLabel(user?.role),
    status: cleanAiString(user?.status),
    active: user?.active !== false,
    department: cleanAiString(user?.department),
    position: cleanAiString(user?.position),
    managerId: cleanAiString(user?.managerId),
    managerName: cleanAiString(user?.managerName),
    route: "/uzivatele",
    ...(includePermissions ? { access: permissionSummaryForAi(user) } : {})
  };
}
