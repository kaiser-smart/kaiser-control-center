import { isUserActive, normalizeRole } from "../permissions.js";

export const COLLECTION_ROUTES_DRIVER_KIOSK_ROUTE = "/trasy-svozu";
export const COLLECTION_ROUTES_DRIVER_TEST_KIOSK_ROUTE = "/trasy-svozu/test";
export const COLLECTION_ROUTES_DRIVER_SIMULATED_GPS_VALUE = "simulated";

function normalizedPathname(pathname) {
  const value = String(pathname || "/").trim() || "/";
  if (value === "/") return value;
  return value.replace(/\/+$/, "") || "/";
}

export function isCollectionRoutesDriverKioskUser(user) {
  return Boolean(isUserActive(user) && normalizeRole(user?.role) === "ridic");
}

export function isCollectionRoutesDriverKioskPath(pathname) {
  const path = normalizedPathname(pathname);
  return path === COLLECTION_ROUTES_DRIVER_KIOSK_ROUTE
    || path === COLLECTION_ROUTES_DRIVER_TEST_KIOSK_ROUTE;
}

export function collectionRoutesDriverKioskScope(pathname, search = "") {
  if (normalizedPathname(pathname) === COLLECTION_ROUTES_DRIVER_TEST_KIOSK_ROUTE) return "test";
  return new URLSearchParams(String(search || "")).get("scope") === "test" ? "test" : "production";
}

export function collectionRoutesDriverSimulatedGpsEnabled(pathname, search = "", routeScope = "") {
  return normalizedPathname(pathname) === COLLECTION_ROUTES_DRIVER_TEST_KIOSK_ROUTE
    && String(routeScope || "").trim().toLowerCase() === "test"
    && new URLSearchParams(String(search || "")).get("gps") === COLLECTION_ROUTES_DRIVER_SIMULATED_GPS_VALUE;
}

export function collectionRoutesDriverKioskCanonicalPath(user, pathname, search = "") {
  if (!isCollectionRoutesDriverKioskUser(user)) return "";
  return normalizedPathname(pathname) === COLLECTION_ROUTES_DRIVER_KIOSK_ROUTE
    && collectionRoutesDriverKioskScope(pathname, search) === "test"
    ? COLLECTION_ROUTES_DRIVER_TEST_KIOSK_ROUTE
    : "";
}

export function collectionRoutesDriverKioskRedirectPath(user, pathname) {
  if (!isCollectionRoutesDriverKioskUser(user)) return "";
  return isCollectionRoutesDriverKioskPath(pathname)
    ? ""
    : COLLECTION_ROUTES_DRIVER_KIOSK_ROUTE;
}
