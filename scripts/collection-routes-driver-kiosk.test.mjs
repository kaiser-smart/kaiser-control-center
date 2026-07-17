import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  COLLECTION_ROUTES_DRIVER_KIOSK_ROUTE,
  collectionRoutesDriverKioskRedirectPath,
  isCollectionRoutesDriverKioskUser
} from "../src/data/collectionRoutesDriverKiosk.js";
import { hasPermission } from "../src/permissions.js";

const driver = {
  id: "driver-1",
  name: "Testovací řidič",
  role: "ridic",
  status: "active",
  active: true,
  modules: ["tyres", "absence", "vehicle-tracking"]
};
const manager = { id: "manager-1", role: "management", status: "active", active: true };

assert.equal(COLLECTION_ROUTES_DRIVER_KIOSK_ROUTE, "/trasy-svozu");
assert.equal(isCollectionRoutesDriverKioskUser(driver), true);
assert.equal(isCollectionRoutesDriverKioskUser(manager), false);
assert.equal(isCollectionRoutesDriverKioskUser({ ...driver, active: false }), false);
assert.equal(collectionRoutesDriverKioskRedirectPath(driver, "/"), "/trasy-svozu");
assert.equal(collectionRoutesDriverKioskRedirectPath(driver, "/vozovy-park"), "/trasy-svozu");
assert.equal(collectionRoutesDriverKioskRedirectPath(driver, "/trasy-svozu/"), "");
assert.equal(collectionRoutesDriverKioskRedirectPath(manager, "/vozovy-park"), "");

assert.equal(
  hasPermission(driver, "collection-routes", "view"),
  true,
  "Role Řidič musí získat Řidičský displej i se starým omezeným seznamem modulů."
);
assert.equal(hasPermission(driver, "collection-routes", "manage"), false);
assert.equal(hasPermission(driver, "collection-routes", "edit"), false);
assert.equal(hasPermission({
  ...driver,
  permissions: [{ moduleId: "collection-routes", action: "view", allowed: false }]
}, "collection-routes", "view"), false, "Výslovný zákaz konkrétního uživatele musí zůstat silnější.");

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../functions/_lib/collection-daily-routes-store.js", import.meta.url), "utf8");
const hereEndpointSource = readFileSync(new URL("../functions/api/collection-routes/here-map-image.js", import.meta.url), "utf8");
const devServerSource = readFileSync(new URL("./serve.mjs", import.meta.url), "utf8");

const driverPageStart = appSource.indexOf("function collectionDailyRouteDriverPage");
const driverPageEnd = appSource.indexOf("function collectionRoutesSourceRoutesSection", driverPageStart);
assert.ok(driverPageStart >= 0 && driverPageEnd > driverPageStart);
const driverPageSource = appSource.slice(driverPageStart, driverPageEnd);

for (const marker of [
  "data-collection-daily-driver-kiosk",
  "ŘIDIČSKÝ DISPLEJ",
  "HOTOVO",
  "HLÁŠENÍ PRO DISPEČINK",
  "MUSÍM JET VYSYPAT",
  "PŘESTÁVKA",
  "CELÁ TRASA",
  "IZOLOVANÝ TEST · BEZ JÍZDY",
  "ULOŽIT JEN DO TEST AUDITU",
  "physicalTesterName",
  "data-collection-daily-driver-sheet-close"
]) {
  assert.ok(driverPageSource.includes(marker), `Řidičský displej postrádá prvek: ${marker}`);
}

assert.ok(
  appSource.includes("function collectionDailyRouteDriverMapPanel")
    && appSource.includes("data-collection-routes-driver-map"),
  "Řidičský displej musí zobrazit chráněnou HERE mapu aktuálního stanoviště."
);

for (const forbidden of ["userBar(user)", "Zpět na HP", "uiSystemPilotSidebar", "collection-routes-mantra"]) {
  assert.equal(driverPageSource.includes(forbidden), false, `Řidičský displej nesmí obsahovat: ${forbidden}`);
}

for (const marker of [
  "collection-driver-kiosk-active",
  "height: 100dvh",
  "overflow: hidden",
  ".collection-daily-driver-workspace",
  ".collection-daily-driver-test-badge",
  ".collection-daily-driver-test-context",
  ".collection-daily-driver-action-sheet[open]::before",
  ".collection-daily-driver-sheet"
]) {
  assert.ok(styleSource.includes(marker), `Tabletový kiosk postrádá styl: ${marker}`);
}

assert.ok(
  appSource.includes("collectionRoutesDriverKioskRedirectPath(user, path)")
    && appSource.includes("window.history.replaceState({}, \"\", routeHref(driverRedirectPath))"),
  "Řidič musí být z každé interní stránky vrácen na svoji trasu."
);
assert.ok(
  appSource.includes("queueMicrotask(() =>")
    && appSource.includes("collectionRoutesPilotState.myDailyRouteLoaded = true;"),
  "Automatické načtení nesmí zanořit render ani při chybě opakovat požadavek bez konce."
);
assert.ok(
  appSource.includes("function collectionDailyRouteDriverScope()")
    && appSource.includes('new URLSearchParams(window.location.search).get("scope") === "test"')
    && appSource.includes("collectionDailyRouteDriverScopePayload"),
  "Řidičský TEST musí používat explicitní scope=test pro načtení i zápis."
);
assert.ok(
  storeSource.includes('if (normalizeRole(user?.role) === "ridic")')
    && storeSource.includes("Řidič může zobrazit pouze svoji přiřazenou trasu."),
  "Backend musí řidiči odmítnout cizí trasu i po přidání view oprávnění."
);
assert.ok(
  hereEndpointSource.includes('requireUserPermission(env, request, "collection-routes", "view")'),
  "HERE mapa řidiče musí být read-only a dostupná bez manage oprávnění."
);
assert.ok(
  devServerSource.includes('url.pathname === "/api/collection-routes/daily-routes/my"')
    && devServerSource.includes('normalizeRole(user.role) !== "ridic"')
    && devServerSource.includes('mockCollectionDailyRouteForDriver(user, { scope: url.searchParams.get("scope") })'),
  "Lokální prohlížečový test musí mít osobní ukázkovou trasu dostupnou jen roli Řidič."
);

console.log("Collection routes driver kiosk tests passed.");
