import { ROLE_DEFINITIONS, isFullAccessRole, normalizeRole } from "../permissions.js";

export function cloneRoleDefinitions() {
  return ROLE_DEFINITIONS.map((role) => ({
    ...role,
    defaultPermissions: role.defaultPermissions.map((permission) => ({ ...permission }))
  }));
}

function normalizePermission(permission) {
  return {
    moduleId: String(permission?.moduleId || ""),
    action: String(permission?.action || "view"),
    allowed: permission?.allowed !== false
  };
}

export function normalizeRoleDefinition(role) {
  const roleId = normalizeRole(role?.id || role?.name);
  const fallback = ROLE_DEFINITIONS.find((item) => item.id === roleId) || ROLE_DEFINITIONS.at(-1);
  const defaultPermissions = isFullAccessRole({ role: roleId, active: true })
    ? fallback.defaultPermissions.map((permission) => ({ ...permission }))
    : Array.isArray(role?.defaultPermissions)
      ? role.defaultPermissions.map(normalizePermission)
      : fallback.defaultPermissions.map((permission) => ({ ...permission }));

  return {
    id: normalizeRole(role?.id || role?.name || fallback.id),
    name: normalizeRole(role?.name || role?.id || fallback.name),
    label: String(role?.label || fallback.label),
    description: String(role?.description || fallback.description),
    defaultPermissions
  };
}

export function normalizeAccessUser(user) {
  const active = user?.active === false || String(user?.status || "").toLowerCase() === "disabled"
    ? false
    : true;

  return {
    id: String(user?.id || ""),
    name: String(user?.name || ""),
    email: String(user?.email || ""),
    phone: String(user?.phone || ""),
    role: normalizeRole(user?.role || "readonly"),
    department: String(user?.department || ""),
    position: String(user?.position || ""),
    managerId: String(user?.managerId || ""),
    managerName: String(user?.managerName || ""),
    active,
    status: active ? "active" : "disabled",
    permissions: Array.isArray(user?.permissions) ? user.permissions.map(normalizePermission) : [],
    modules: Array.isArray(user?.modules) ? [...user.modules] : undefined,
    allowedModules: Array.isArray(user?.allowedModules) ? [...user.allowedModules] : undefined,
    deniedModules: Array.isArray(user?.deniedModules) ? [...user.deniedModules] : undefined,
    createdAt: user?.createdAt || new Date().toISOString(),
    updatedAt: user?.updatedAt || new Date().toISOString(),
    lastLoginAt: user?.lastLoginAt || null
  };
}

export function defaultAccessState() {
  return {
    users: [],
    roles: cloneRoleDefinitions(),
    selectedUserId: "",
    selectedRoleId: "ridic",
    message: "",
    error: "",
    feedbackTarget: ""
  };
}

export function loadAccessState() {
  return defaultAccessState();
}

export function saveAccessState(state) {
  return {
    ...defaultAccessState(),
    ...state,
    users: Array.isArray(state.users) ? state.users.map(normalizeAccessUser) : [],
    roles: Array.isArray(state.roles) ? state.roles.map(normalizeRoleDefinition) : cloneRoleDefinitions()
  };
}

function userKey(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  return email || String(user?.id || "").trim().toLowerCase();
}

function userId(user) {
  return String(user?.id || "").trim().toLowerCase();
}

export function mergeAccessUsers(baseUsers, accessUsers) {
  const users = new Map();
  const idToKey = new Map();

  function upsert(user) {
    const normalized = normalizeAccessUser(user);
    const key = userKey(normalized);
    const id = userId(normalized);

    if (!key && !id) {
      return;
    }

    const existingKey = (key && users.has(key) ? key : "") || (id ? idToKey.get(id) : "");
    const nextUser = existingKey ? { ...users.get(existingKey), ...normalized } : normalized;
    const nextKey = userKey(nextUser) || key || id;

    if (existingKey && existingKey !== nextKey) {
      users.delete(existingKey);
    }

    users.set(nextKey, nextUser);
    if (id) {
      idToKey.set(id, nextKey);
    }
  }

  baseUsers.forEach(upsert);
  accessUsers.forEach(upsert);

  return [...users.values()].sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

export function rolePermissionContext(roles) {
  return Object.fromEntries(roles.map((role) => [
    role.id,
    role.defaultPermissions.map((permission) => ({ ...permission }))
  ]));
}

export function withAccessContext(user, accessState) {
  if (!user) {
    return null;
  }

  const normalizedUser = normalizeAccessUser(user);
  const mergedUsers = mergeAccessUsers([normalizedUser], accessState.users);
  const normalizedEmail = normalizedUser.email.trim().toLowerCase();
  const normalizedId = normalizedUser.id.trim().toLowerCase();
  const merged = mergedUsers.find((item) => (
    (normalizedEmail && item.email.trim().toLowerCase() === normalizedEmail) ||
    (normalizedId && item.id.trim().toLowerCase() === normalizedId)
  )) || normalizedUser;

  return {
    ...merged,
    rolePermissions: rolePermissionContext(accessState.roles)
  };
}

export function permissionMap(permissions) {
  const map = new Map();
  permissions.forEach((permission) => {
    map.set(`${permission.moduleId}:${permission.action}`, permission.allowed !== false);
  });
  return map;
}

export function rolePermissionsFor(roleId, roles) {
  const role = roles.find((item) => item.id === normalizeRole(roleId));
  return role ? role.defaultPermissions.map((permission) => ({ ...permission })) : [];
}

export function makePermissionsFromMatrix(moduleItems, actions, formData, prefix) {
  const permissions = [];

  moduleItems.forEach((moduleItem) => {
    actions.forEach((action) => {
      permissions.push({
        moduleId: moduleItem.id,
        action,
        allowed: formData.get(`${prefix}-${moduleItem.id}-${action}`) === "on"
      });
    });
  });

  return permissions;
}
