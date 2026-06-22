import { moduleDashboards, modules } from "./data/modules.js";
import { VersionBackupInfo } from "./components/VersionBackupInfo.js";
import { VersionNewsInfo } from "./components/VersionNewsInfo.js";
import { ModuleFeedbackBox } from "./components/ModuleFeedbackBox.js";
import { ReportsIcon } from "./components/icons/index.js";
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
  isUserActive,
  normalizeRole,
  roleLabel
} from "./permissions.js";
import {
  ACCESS_STORAGE_KEY,
  loadAccessState,
  makePermissionsFromMatrix,
  mergeAccessUsers,
  permissionMap,
  rolePermissionsFor,
  saveAccessState,
  withAccessContext
} from "./data/accessControl.js";

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

let accessState = loadAccessState();

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function currentUser() {
  return withAccessContext(authState.user, accessState);
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

function selectedAccessUser(users) {
  const selectedId = accessState.selectedUserId;
  return users.find((user) => user.id === selectedId) || users[0] || null;
}

function selectedAccessRole() {
  const roles = orderedAccessRoles();
  return roles.find((role) => role.id === accessState.selectedRoleId) || roles[0];
}

function nextLocalUserId() {
  const usedIds = new Set(allAccessUsers().map((user) => user.id));
  let id = `local-user-${Date.now()}`;
  let index = 2;

  while (usedIds.has(id)) {
    id = `local-user-${Date.now()}-${index}`;
    index += 1;
  }

  return id;
}

function matrixPermissions(permissions, roleId = "") {
  const map = permissionMap(permissions || []);
  const adminAlwaysAllowed = normalizeRole(roleId) === "admin";

  return {
    allows(moduleId, action) {
      return (
        adminAlwaysAllowed ||
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
  if (normalizeRole(roleId) === "admin") {
    return fullPermissionsAllowed();
  }

  return makePermissionsFromMatrix(permissionModules, ACTIONS, new FormData(form), prefix);
}

function userDefaultPermissions(roleId) {
  return normalizeRole(roleId) === "admin"
    ? fullPermissionsAllowed()
    : rolePermissionsFor(roleId, accessState.roles);
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

function accessNotice() {
  return `
    ${accessState.message ? `<p class="module-feedback__notice access-notice">${escapeHtml(accessState.message)}</p>` : ""}
    ${accessState.error ? `<p class="module-feedback__error access-notice">${escapeHtml(accessState.error)}</p>` : ""}
  `;
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

function upsertLocalAccessUser(user) {
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
    message: "Uživatel byl uložen lokálně.",
    error: ""
  });
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
  const roleIsAdmin = normalizeRole(user.role) === "admin";

  return `
    <section class="users-panel access-editor" aria-labelledby="access-user-title">
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

        ${roleIsAdmin ? `
          <p class="permissions-note">Admin má vždy všechna práva. Checkboxy jsou předvyplněné naplno.</p>
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
      </form>
    </section>
  `;
}

function rolesManagementSection(canManageRoles) {
  const roles = orderedAccessRoles();
  const selectedRole = selectedAccessRole();
  const rolePermissions = selectedRole?.defaultPermissions || [];
  const roleIsAdmin = normalizeRole(selectedRole?.id) === "admin";

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

          ${roleIsAdmin ? `
            <p class="permissions-note">Admin má vždy všechna práva. Výchozí práva admina nejdou omezit.</p>
          ` : ""}

          ${permissionsMatrixTable({
            namePrefix: "roleperm",
            permissions: rolePermissions,
            roleId: selectedRole.id,
            disabled: !canManageRoles || roleIsAdmin
          })}

          <div class="access-form-actions">
            ${canManageRoles && !roleIsAdmin ? `
              <button class="primary-action" type="submit">Uložit výchozí oprávnění role</button>
            ` : '<p class="permissions-note">Výchozí oprávnění role může měnit pouze uživatel s právem spravovat uživatele.</p>'}
          </div>
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
    <main class="app-shell">
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

  const rows = users
    .map(
      (user) => `
        <tr>
          <td data-label="Jméno"><strong>${escapeHtml(user.name || "Bez jména")}</strong></td>
          <td data-label="Kontakt">${stackedCell(user.email, user.phone)}</td>
          <td data-label="Role">${escapeHtml(roleLabel(user.role))}</td>
          <td data-label="Stav">${statusPill(user)}</td>
          <td data-label="Poslední přihlášení">${formatDateTime(user.lastLoginAt)}</td>
          <td data-label="Akce">
            <div class="users-actions">
              <button class="secondary-link secondary-link--compact" type="button" data-access-edit-user="${escapeHtml(user.id)}">
                Upravit
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
        <td colspan="6">Zatím tu není žádný uživatel.</td>
      </tr>
    `;

  return `
    ${accessNotice()}
    ${adminUsersState.error ? `<section class="users-panel"><p class="login-error">${escapeHtml(adminUsersState.error)}</p></section>` : ""}
    <section class="users-panel" aria-labelledby="users-title">
      <div class="users-panel__head">
        <div>
          <h2 id="users-title">Přehled uživatelů</h2>
          <p>Vidíte role, stav účtu a možnost upravit konkrétní oprávnění. Změny se v mock režimu ukládají lokálně.</p>
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
                <strong>${escapeHtml(request.employeeName)}</strong>
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
            <strong>${escapeHtml(request.employeeName)}</strong>
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
                  <span
                    class="absence-calendar__event absence-calendar__event--${ABSENCE_TYPE_TONES[request.type] || "vacation"}"
                    title="${escapeHtml(`${request.employeeName} · ${request.type}`)}"
                  >
                    ${escapeHtml(request.employeeName)} · ${escapeHtml(request.type)}
                  </span>
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

function absenceActiveContent(activeTab, user) {
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

  if (safeTab === "reports") {
    return absenceReports(user);
  }

  if (safeTab === "settings") {
    return absenceSettings(user);
  }

  return absenceDashboard(user);
}

function absenceModulePage(moduleItem, user, isDashboard = false) {
  const activeTab = resolveAbsenceTab(user, isDashboard ? "dashboard" : absenceUiState.tab);
  const feedbackBox = activeTab === "dashboard"
    ? moduleFeedbackBoxFor(moduleItem, user, {
        moduleId: "dovolena-nemoc",
        moduleName: "Dovolená / Nemoc",
        placeholder: "Např. chybí mi přehled zůstatku dovolené, filtr podle zaměstnance, export do PDF…"
      })
    : "";
  const tabs = absenceTabsForUser(user);

  return `
    <main class="app-shell module-page absence-page">
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
      ${absenceActiveContent(activeTab, user)}
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
  const feedbackBox = moduleFeedbackBoxFor(moduleItem, user);

  return `
    <main class="app-shell module-page">
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
    <main class="app-shell module-page">
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
    <main class="app-shell module-page">
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
    <main class="app-shell module-page">
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
          V prohlížeči může být uložená stará verze lokálních oprávnění. Obnovení smaže pouze lokální nastavení práv v tomto prohlížeči.
        </p>
        <button class="primary-action" type="button" data-reset-access-state>
          Obnovit aplikaci
        </button>
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
  window.history.pushState({}, "", routeHref("/"));
  render();
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
    renderApp();
  } catch (error) {
    console.error("smart_odpady_render_failed", error);
    app.innerHTML = appErrorPage();
    document.title = `Chyba | ${APP_NAME}`;
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

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

function canEditAccessUsers() {
  const user = currentUser();
  return hasPermission(user, "users", "edit") || hasPermission(user, "users", "manage");
}

function canManageAccessRoles() {
  return hasPermission(currentUser(), "users", "manage");
}

function setAccessError(error) {
  setAccessState({
    ...accessState,
    message: "",
    error
  });
}

function saveAccessUserForm(form) {
  if (!canEditAccessUsers()) {
    setAccessError("Nemáte oprávnění upravovat uživatele.");
    render();
    return;
  }

  const sourceUser = findAccessUser(form.dataset.userId) || {};
  const now = new Date().toISOString();
  const role = normalizeRole(form.elements.role.value);
  const name = form.elements.name.value.trim();
  const email = form.elements.email.value.trim();
  const phone = form.elements.phone.value.trim();
  const department = form.elements.department.value.trim();
  const active = Boolean(form.elements.active?.checked);

  if (!name) {
    setAccessError("Vyplňte jméno uživatele.");
    render();
    return;
  }

  if (!email && !phone) {
    setAccessError("Vyplňte alespoň e-mail nebo telefon.");
    render();
    return;
  }

  const signedUserId = String(currentUser()?.id || "").trim().toLowerCase();
  const targetUserId = String(sourceUser.id || form.dataset.userId || "").trim().toLowerCase();
  if (!active && signedUserId && signedUserId === targetUserId) {
    setAccessError("Vlastní účet v mock režimu nejde vypnout, abyste se nezamkli mimo správu.");
    render();
    return;
  }

  upsertLocalAccessUser({
    ...sourceUser,
    id: sourceUser.id || form.dataset.userId || nextLocalUserId(),
    name,
    email,
    phone,
    role,
    department,
    position: sourceUser.position || "",
    active,
    status: active ? "active" : "disabled",
    permissions: permissionsFromMatrix(form, "userperm", role),
    createdAt: sourceUser.createdAt || now,
    updatedAt: now,
    lastLoginAt: sourceUser.lastLoginAt || null
  });
  render();
}

function saveAccessRoleForm(form) {
  if (!canManageAccessRoles()) {
    setAccessError("Nemáte oprávnění upravovat role.");
    render();
    return;
  }

  const roleId = normalizeRole(form.dataset.roleId);
  if (roleId === "admin") {
    setAccessError("Admin má vždy všechna práva a nejde ho omezit.");
    render();
    return;
  }

  const roles = accessState.roles.map((role) => (
    role.id === roleId
      ? {
          ...role,
          description: form.elements.description.value.trim(),
          defaultPermissions: permissionsFromMatrix(form, "roleperm", roleId)
        }
      : role
  ));

  setAccessState({
    ...accessState,
    roles,
    selectedRoleId: roleId,
    message: "Výchozí oprávnění role byla uložena lokálně.",
    error: ""
  });
  render();
}

function createAccessUser() {
  if (!canEditAccessUsers()) {
    setAccessError("Nemáte oprávnění přidávat uživatele.");
    render();
    return;
  }

  const now = new Date().toISOString();
  const role = "ridic";
  upsertLocalAccessUser({
    id: nextLocalUserId(),
    name: "Nový uživatel",
    email: "",
    phone: "",
    role,
    department: "",
    position: "",
    active: true,
    status: "active",
    permissions: userDefaultPermissions(role),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  });
  render();
}

function selectAccessUser(userId) {
  setAccessState({
    ...accessState,
    selectedUserId: userId,
    message: "",
    error: ""
  });
  render();
}

function selectAccessRole(roleId) {
  setAccessState({
    ...accessState,
    selectedRoleId: normalizeRole(roleId),
    message: "",
    error: ""
  });
  render();
}

function setAccessUserActive(userId, active) {
  if (!canEditAccessUsers()) {
    setAccessError("Nemáte oprávnění měnit stav uživatele.");
    render();
    return;
  }

  const signedUserId = String(currentUser()?.id || "").trim().toLowerCase();
  if (!active && signedUserId && signedUserId === String(userId || "").trim().toLowerCase()) {
    setAccessError("Vlastní účet v mock režimu nejde vypnout, abyste se nezamkli mimo správu.");
    render();
    return;
  }

  const user = findAccessUser(userId);
  if (!user) {
    setAccessError("Uživatel nebyl nalezen.");
    render();
    return;
  }

  upsertLocalAccessUser({
    ...user,
    active,
    status: active ? "active" : "disabled",
    updatedAt: new Date().toISOString()
  });
  render();
}

function resetAccessUserPermissions(userId) {
  if (!canEditAccessUsers()) {
    setAccessError("Nemáte oprávnění měnit oprávnění uživatele.");
    render();
    return;
  }

  const user = findAccessUser(userId);
  if (!user) {
    setAccessError("Uživatel nebyl nalezen.");
    render();
    return;
  }

  upsertLocalAccessUser({
    ...user,
    permissions: userDefaultPermissions(user.role),
    updatedAt: new Date().toISOString()
  });
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
  upsertLocalAccessUser({
    ...user,
    role,
    permissions: userDefaultPermissions(role),
    updatedAt: new Date().toISOString()
  });
  render();
}

document.addEventListener("submit", (event) => {
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

document.addEventListener("change", (event) => {
  const accessUserRole = event.target.closest("[data-access-user-role]");
  if (accessUserRole) {
    changeAccessUserRole(accessUserRole);
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

document.addEventListener("click", (event) => {
  const resetAccessState = event.target.closest("[data-reset-access-state]");
  if (resetAccessState) {
    window.localStorage.removeItem(ACCESS_STORAGE_KEY);
    accessState = loadAccessState();
    window.location.reload();
    return;
  }

  const newAccessUser = event.target.closest("[data-access-new-user]");
  if (newAccessUser) {
    createAccessUser();
    return;
  }

  const editAccessUser = event.target.closest("[data-access-edit-user]");
  if (editAccessUser) {
    selectAccessUser(editAccessUser.dataset.accessEditUser);
    return;
  }

  const disableAccessUser = event.target.closest("[data-access-disable-user]");
  if (disableAccessUser) {
    setAccessUserActive(disableAccessUser.dataset.accessDisableUser, false);
    return;
  }

  const enableAccessUser = event.target.closest("[data-access-enable-user]");
  if (enableAccessUser) {
    setAccessUserActive(enableAccessUser.dataset.accessEnableUser, true);
    return;
  }

  const resetUserPermissions = event.target.closest("[data-access-reset-user-permissions]");
  if (resetUserPermissions) {
    resetAccessUserPermissions(resetUserPermissions.dataset.accessResetUserPermissions);
    return;
  }

  const editAccessRole = event.target.closest("[data-access-edit-role]");
  if (editAccessRole) {
    selectAccessRole(editAccessRole.dataset.accessEditRole);
    return;
  }

  const absenceTab = event.target.closest("[data-absence-tab]");
  if (absenceTab) {
    const nextTab = absenceTab.dataset.absenceTab || "dashboard";
    absenceUiState.tab = resolveAbsenceTab(currentUser(), nextTab);
    setAbsenceNotice("");
    render();
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
    logout();
    return;
  }

  const link = event.target.closest("a[data-link]");

  if (!link || link.origin !== window.location.origin) {
    return;
  }

  event.preventDefault();
  window.history.pushState({}, "", link.href);
  render();
});

window.addEventListener("popstate", render);
render();
bootstrapAuth();
