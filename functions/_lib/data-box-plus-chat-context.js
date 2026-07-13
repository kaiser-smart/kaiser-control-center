import { getUsers } from "./auth.js";
import { modules } from "../../src/data/modules.js";
import { ACTIONS, ROLE_LABELS, hasPermission, isUserActive } from "../../src/permissions.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

function publicUser(user = {}) {
  return {
    id: cleanString(user.id),
    name: cleanString(user.name),
    email: cleanString(user.email),
    phone: cleanString(user.phone),
    role: cleanString(user.role),
    roleLabel: ROLE_LABELS[user.role] || cleanString(user.role),
    department: cleanString(user.department),
    position: cleanString(user.position),
    managerName: cleanString(user.managerName)
  };
}

function sameUser(left = {}, right = {}) {
  const leftId = cleanString(left.id).toLowerCase();
  const rightId = cleanString(right.id).toLowerCase();
  const leftEmail = cleanString(left.email).toLowerCase();
  const rightEmail = cleanString(right.email).toLowerCase();
  return Boolean((leftId && leftId === rightId) || (leftEmail && leftEmail === rightEmail));
}

function publicModule(module, currentUser) {
  const availableActions = ACTIONS.filter((action) => hasPermission(currentUser, module.id, action));
  return {
    id: module.id,
    title: module.title,
    description: module.description,
    route: module.route,
    dashboardRoute: module.dashboardRoute || "",
    status: module.status,
    permittedActions: availableActions
  };
}

export async function buildDataBoxPlusChatContext(env, currentUser = {}) {
  const users = (await getUsers(env)).filter(isUserActive);
  const canonicalCurrentUser = users.find((user) => sameUser(user, currentUser)) || currentUser;
  const knownUsers = users.map(publicUser).filter((user) => user.name);
  return {
    application: {
      name: "Kaiser Smart",
      purpose: "Interní operační aplikace pro provoz, vozidla, datové schránky, trasy, zaměstnance, zákazníky, finance a administrativu.",
      modules: modules
        .filter((module) => module.active !== false && !module.disabled && hasPermission(canonicalCurrentUser, module.id, "view"))
        .map((module) => publicModule(module, canonicalCurrentUser)),
      dataBoxCapabilities: [
        "číst konkrétní datovou zprávu a její uložené přílohy",
        "odpovídat na otázky o zprávě a aplikaci",
        "vyřešit uživatele z kanonického adresáře",
        "připravit a po potvrzení provést e-mail, SMS, odpověď DS, archivaci, úkol, poznámku, připomínku nebo interní předání"
      ],
      safety: "Chat smí popsat pouze moduly dostupné přihlášenému uživateli a nesmí zpřístupnit citlivou konfiguraci."
    },
    currentUser: publicUser(canonicalCurrentUser),
    knownUsers
  };
}

export const __test = { publicModule, publicUser, sameUser };
