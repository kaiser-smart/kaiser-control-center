import {
  ACTIONS,
  PERMISSION_MODULES,
  ROLE_LABELS,
  normalizeModuleId,
  normalizeRole
} from "../../src/permissions.js";

const USER_DB_BINDING = "SMART_ODPADY_DB";
const DRAFT_USER_PREFIX = "draft-user-";

export class UserStoreError extends Error {
  constructor(message, status = 400, code = "user_store_error") {
    super(message);
    this.name = "UserStoreError";
    this.status = status;
    this.code = code;
  }
}

function userDatabase(env, required = false) {
  const db = env?.[USER_DB_BINDING] || null;

  if (!db && required) {
    throw new UserStoreError(
      "Databáze uživatelů není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "users_database_missing"
    );
  }

  return db;
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function nullableString(value) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function normalizeRoleId(value) {
  const role = normalizeRole(value);
  return ROLE_LABELS[role] ? role : "readonly";
}

function normalizeStatus(value, active) {
  if (active === false) {
    return "disabled";
  }

  const status = cleanString(value).toLowerCase();
  return status === "disabled" || status === "vypnutý" ? "disabled" : "active";
}

function normalizeActive(user) {
  if (user?.active === false) {
    return false;
  }

  const status = cleanString(user?.status).toLowerCase();
  return status !== "disabled" && status !== "vypnutý";
}

function normalizeModuleList(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const modules = value
    .map((item) => normalizeModuleId(item))
    .filter((item) => PERMISSION_MODULES.includes(item));

  return modules.length ? [...new Set(modules)] : undefined;
}

function normalizePermissions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((permission) => {
      const moduleId = normalizeModuleId(permission?.moduleId);
      const action = cleanString(permission?.action || "view");

      if (!PERMISSION_MODULES.includes(moduleId) || !ACTIONS.includes(action)) {
        return null;
      }

      return {
        moduleId,
        action,
        allowed: permission?.allowed !== false
      };
    })
    .filter(Boolean);
}

function parseJsonArray(value) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function jsonOrNull(value) {
  return Array.isArray(value) && value.length ? JSON.stringify(value) : null;
}

function permissionsJson(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function slugPart(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function newUserId(user) {
  const emailName = cleanString(user?.email).split("@")[0];
  const base = slugPart(emailName) || slugPart(user?.name) || "uzivatel";
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : String(Date.now()).slice(-8);

  return `${base}-${suffix}`;
}

function userFromRow(row) {
  if (!row) {
    return null;
  }

  const permissions = parseJsonArray(row.permissions_json) || [];
  const modules = parseJsonArray(row.modules_json);
  const allowedModules = parseJsonArray(row.allowed_modules_json);
  const deniedModules = parseJsonArray(row.denied_modules_json);
  const active = Boolean(row.active);

  return {
    id: cleanString(row.id),
    name: cleanString(row.name),
    email: cleanString(row.email),
    phone: cleanString(row.phone),
    role: normalizeRoleId(row.role),
    status: normalizeStatus(row.status, active),
    active,
    department: cleanString(row.department),
    position: cleanString(row.position),
    managerId: cleanString(row.manager_id),
    managerName: cleanString(row.manager_name),
    permissions: normalizePermissions(permissions),
    modules: normalizeModuleList(modules),
    allowedModules: normalizeModuleList(allowedModules),
    deniedModules: normalizeModuleList(deniedModules),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
    lastLoginAt: row.last_login_at || null
  };
}

export function normalizeUserInput(input, options = {}) {
  const now = options.now || new Date().toISOString();
  const active = normalizeActive(input);
  const idFromInput = cleanString(options.id || input?.id);
  const id = !idFromInput || idFromInput.startsWith(DRAFT_USER_PREFIX)
    ? newUserId(input)
    : idFromInput;
  const name = cleanString(input?.name);
  const email = cleanString(input?.email).toLowerCase();
  const phone = cleanString(input?.phone);

  if (!name) {
    throw new UserStoreError("Vyplňte jméno uživatele.", 400, "user_name_required");
  }

  if (!email && !phone) {
    throw new UserStoreError("Vyplňte alespoň e-mail nebo telefon.", 400, "user_contact_required");
  }

  return {
    id,
    name,
    email,
    phone,
    role: normalizeRoleId(input?.role),
    status: normalizeStatus(input?.status, active),
    active,
    department: cleanString(input?.department),
    position: cleanString(input?.position),
    managerId: cleanString(input?.managerId),
    managerName: cleanString(input?.managerName),
    permissions: normalizePermissions(input?.permissions),
    modules: normalizeModuleList(input?.modules),
    allowedModules: normalizeModuleList(input?.allowedModules),
    deniedModules: normalizeModuleList(input?.deniedModules),
    createdAt: cleanString(input?.createdAt) || now,
    updatedAt: now,
    lastLoginAt: input?.lastLoginAt || null
  };
}

export async function listStoredUsers(env) {
  const db = userDatabase(env);

  if (!db) {
    return [];
  }

  try {
    const result = await db
      .prepare(`
        SELECT
          id,
          name,
          email,
          phone,
          role,
          status,
          active,
          department,
          position,
          manager_id,
          manager_name,
          permissions_json,
          modules_json,
          allowed_modules_json,
          denied_modules_json,
          created_at,
          updated_at,
          last_login_at
        FROM users
        ORDER BY name COLLATE NOCASE ASC
      `)
      .all();

    return (result.results || []).map(userFromRow).filter(Boolean);
  } catch (error) {
    console.error("users.d1_list_failed", { message: error.message });
    return [];
  }
}

export async function saveStoredUser(env, input, options = {}) {
  const db = userDatabase(env, true);
  const user = normalizeUserInput(input, options);

  await db
    .prepare(`
      INSERT INTO users (
        id,
        name,
        email,
        phone,
        role,
        status,
        active,
        department,
        position,
        manager_id,
        manager_name,
        permissions_json,
        modules_json,
        allowed_modules_json,
        denied_modules_json,
        created_at,
        updated_at,
        last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        role = excluded.role,
        status = excluded.status,
        active = excluded.active,
        department = excluded.department,
        position = excluded.position,
        manager_id = excluded.manager_id,
        manager_name = excluded.manager_name,
        permissions_json = excluded.permissions_json,
        modules_json = excluded.modules_json,
        allowed_modules_json = excluded.allowed_modules_json,
        denied_modules_json = excluded.denied_modules_json,
        updated_at = excluded.updated_at,
        last_login_at = excluded.last_login_at
    `)
    .bind(
      user.id,
      user.name,
      nullableString(user.email),
      nullableString(user.phone),
      user.role,
      user.status,
      user.active ? 1 : 0,
      nullableString(user.department),
      nullableString(user.position),
      nullableString(user.managerId),
      nullableString(user.managerName),
      permissionsJson(user.permissions),
      jsonOrNull(user.modules),
      jsonOrNull(user.allowedModules),
      jsonOrNull(user.deniedModules),
      user.createdAt,
      user.updatedAt,
      user.lastLoginAt
    )
    .run();

  return user;
}
