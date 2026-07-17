import { isUserActive, normalizeRole } from "../permissions.js";

export const COLLECTION_ROUTES_DRIVER_KIOSK_ROUTE = "/trasy-svozu";

function normalizedPathname(pathname) {
  const value = String(pathname || "/").trim() || "/";
  if (value === "/") return value;
  return value.replace(/\/+$/, "") || "/";
}

export function isCollectionRoutesDriverKioskUser(user) {
  return Boolean(isUserActive(user) && normalizeRole(user?.role) === "ridic");
}

export function collectionRoutesDriverKioskRedirectPath(user, pathname) {
  if (!isCollectionRoutesDriverKioskUser(user)) return "";
  return normalizedPathname(pathname) === COLLECTION_ROUTES_DRIVER_KIOSK_ROUTE
    ? ""
    : COLLECTION_ROUTES_DRIVER_KIOSK_ROUTE;
}
