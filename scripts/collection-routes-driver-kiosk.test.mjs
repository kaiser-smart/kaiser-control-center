import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  COLLECTION_ROUTES_DRIVER_KIOSK_ROUTE,
  COLLECTION_ROUTES_DRIVER_TEST_KIOSK_ROUTE,
  collectionRoutesDriverKioskCanonicalPath,
  collectionRoutesDriverKioskRedirectPath,
  collectionRoutesDriverKioskScope,
  isCollectionRoutesDriverKioskPath,
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
assert.equal(COLLECTION_ROUTES_DRIVER_TEST_KIOSK_ROUTE, "/trasy-svozu/test");
assert.equal(isCollectionRoutesDriverKioskUser(driver), true);
assert.equal(isCollectionRoutesDriverKioskUser(manager), false);
assert.equal(isCollectionRoutesDriverKioskUser({ ...driver, active: false }), false);
assert.equal(collectionRoutesDriverKioskRedirectPath(driver, "/"), "/trasy-svozu");
assert.equal(collectionRoutesDriverKioskRedirectPath(driver, "/vozovy-park"), "/trasy-svozu");
assert.equal(collectionRoutesDriverKioskRedirectPath(driver, "/trasy-svozu/"), "");
assert.equal(collectionRoutesDriverKioskRedirectPath(driver, "/trasy-svozu/test"), "");
assert.equal(collectionRoutesDriverKioskRedirectPath(manager, "/vozovy-park"), "");
assert.equal(isCollectionRoutesDriverKioskPath("/trasy-svozu/test/"), true);
assert.equal(collectionRoutesDriverKioskScope("/trasy-svozu", "?scope=test"), "test");
assert.equal(collectionRoutesDriverKioskScope("/trasy-svozu/test", ""), "test");
assert.equal(collectionRoutesDriverKioskScope("/trasy-svozu", ""), "production");
assert.equal(collectionRoutesDriverKioskCanonicalPath(driver, "/trasy-svozu", "?scope=test"), "/trasy-svozu/test");
assert.equal(collectionRoutesDriverKioskCanonicalPath(driver, "/trasy-svozu", ""), "");
assert.equal(collectionRoutesDriverKioskCanonicalPath(manager, "/trasy-svozu", "?scope=test"), "");

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
const mantraSource = readFileSync(new URL("../src/data/collectionRoutesMantra.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../functions/_lib/collection-daily-routes-store.js", import.meta.url), "utf8");
const hereEndpointSource = readFileSync(new URL("../functions/api/collection-routes/here-map-image.js", import.meta.url), "utf8");
const driverMapEndpointSource = readFileSync(new URL("../functions/api/collection-routes/daily-routes/[runId]/map.js", import.meta.url), "utf8");
const driverMapSource = readFileSync(new URL("../functions/_lib/collection-daily-route-map.js", import.meta.url), "utf8");
const devServerSource = readFileSync(new URL("./serve.mjs", import.meta.url), "utf8");
const buildSource = readFileSync(new URL("./build.mjs", import.meta.url), "utf8");

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
  "NÁSLEDUJÍCÍ ZASTÁVKA",
  "MAPOVÁNÍ STANOVIŠTĚ",
  "IZOLOVANÝ TEST · BEZ JÍZDY",
  "data-collection-driver-panel=\"report\"",
  "data-collection-driver-panel=\"dump\"",
  "data-collection-driver-panel=\"break\"",
  "ZAPNOUT ŠARLOTU"
]) {
  assert.ok(driverPageSource.includes(marker), `Řidičský displej postrádá prvek: ${marker}`);
}

assert.ok(
  appSource.includes("function collectionDailyRouteDriverMapPanel")
    && appSource.includes("function syncCollectionDailyDriverInteractiveMap")
    && appSource.includes("data-collection-routes-driver-map")
    && appSource.includes("AKTUÁLNÍ ÚSEK PO SILNICI")
    && appSource.includes("Výjezd: Trnkova 3052/137, Brno")
    && appSource.includes("Aktuální pořadí trasy")
    && appSource.includes("data-collection-driver-map-control=\"zoom-in\"")
    && appSource.includes("data-collection-driver-map-control=\"fullscreen\"")
    && appSource.includes("data-collection-driver-navigation=\"")
    && appSource.includes("navigator.geolocation.watchPosition")
    && appSource.includes("data-collection-driver-map-mode=\"overview\"")
    && appSource.includes("collection-daily-driver-map-spider-line")
    && appSource.includes("data-collection-driver-navigate")
    && driverMapSource.includes("Optimalizováno HERE"),
  "Řidičský displej musí zobrazit ovladatelnou HERE mapu aktuálního úseku i celé trasy."
);

assert.equal(driverPageSource.includes("<details"), false, "Pracovní akce řidiče nesmí být schované v rozbalovacím detailu.");
assert.equal(driverPageSource.includes("<select"), false, "Hlášení řidiče nesmí používat rozbalovací select.");
for (const marker of [
  "VYFOTIT STAV",
  "DALŠÍ FOTKA?",
  "ANO · PŘIDAT DALŠÍ FOTKU",
  "NE · POKRAČOVAT",
  "POTVRDIT A ULOŽIT HLÁŠENÍ",
  "ZMĚŘIT GPS STANOVIŠTĚ",
  "ULOŽIT FYZICKOU GPS",
  "ZOBRAZIT NA MAPĚ",
  "NAVIGOVAT SEM",
  "JSEM ZPĚT NA TRASE",
  "UKONČIT PŘESTÁVKU"
]) {
  assert.ok(appSource.includes(marker), `Krokový tablet postrádá prvek: ${marker}`);
}
assert.equal(driverPageSource.includes("collection-daily-driver-test-identity"), false, "Řidičský displej nesmí vypisovat auditní identitu testera.");

assert.ok(
  appSource.includes("collection-daily-driver-finish-workspace")
    && appSource.includes("Na mapě jsou obsloužená stanoviště potvrzená zeleně."),
  "Mapa musí zůstat viditelná i po obsloužení posledního stanoviště."
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
  ".collection-daily-driver-modal",
  ".collection-daily-driver-map__controls",
  ".collection-daily-driver-map.is-fullscreen",
  ".collection-daily-driver-navigation-guidance",
  ".collection-daily-driver-next-stop",
  ".collection-daily-driver-photo-button"
]) {
  assert.ok(styleSource.includes(marker), `Tabletový kiosk postrádá styl: ${marker}`);
}

for (const marker of [
  "Blackview Active 7 LTE",
  "1920 × 1200",
  "960 × 600 CSS px",
  "min-width: 900px",
  "max-width: 1024px",
  "min-height: 500px",
  "max-height: 640px",
  "grid-template-columns: repeat(4, max-content)",
  "min-height: 56px",
  ".collection-driver-kiosk-active .ai-assistant-launcher",
  "display: none"
]) {
  assert.ok(
    styleSource.includes(marker) || mantraSource.includes(marker),
    `Regrese Blackview Active 7 postrádá parametr: ${marker}`
  );
}

assert.ok(
  appSource.includes("function syncCollectionDailyDriverViewportDiagnostics()")
    && appSource.includes("window.innerWidth")
    && appSource.includes("window.innerHeight")
    && appSource.includes("window.devicePixelRatio")
    && appSource.includes("data-collection-daily-driver-kiosk")
    && appSource.includes("collectionDriverViewportProfile")
    && appSource.includes("blackview-active-7-landscape")
    && appSource.includes("window.visualViewport?.addEventListener"),
  "Řidičský displej musí automaticky zaznamenat skutečný viewport Blackview bez provozního zápisu."
);

for (const marker of [
  "OPTIMALIZOVAT HERE",
  "/here-sequence",
  "/route-geometry",
  "optimize-own-test-route-here",
  "routePoints",
  "Body zůstávají na mapě bez falešných přímých spojnic."
]) {
  assert.ok(appSource.includes(marker), `Řidičský displej postrádá HERE optimalizaci nebo silniční geometrii: ${marker}`);
}

for (const marker of [
  "HERE Waypoints Sequence počítá pořadí stanovišť jedné již přidělené trasy",
  "potvrzeným technickým profilem konkrétního vozidla",
  "Google Maps je pouze externí nouzové otevření"
]) {
  assert.ok(mantraSource.includes(marker), `Mantra postrádá pravidlo navigace: ${marker}`);
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
    && appSource.includes("collectionRoutesDriverKioskScope(window.location.pathname, window.location.search)")
    && appSource.includes("collectionDailyRouteDriverScopePayload"),
  "Řidičský TEST musí používat explicitní scope=test pro načtení i zápis."
);
assert.ok(
  appSource.includes("collectionRoutesDriverKioskCanonicalPath(user, path, window.location.search)")
    && appSource.includes("userPrimaryRoutes.set(COLLECTION_ROUTES_DRIVER_TEST_KIOSK_ROUTE")
    && buildSource.includes('{ path: "/trasy-svozu/test", moduleKey: "collection-routes"'),
  "Stabilní TEST cesta musí přežít přihlášení, načíst řidičský modul a vzniknout v produkčním buildu."
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
  driverMapEndpointSource.includes("getCollectionDailyRoute(env, user, runId")
    && driverMapEndpointSource.includes("buildCollectionDailyRouteHereMapImageUrl")
    && !driverMapEndpointSource.includes("collection-routes\", \"manage"),
  "Mapa celé trasy musí použít stejnou serverovou kontrolu přidělené trasy a nesmí vyžadovat manage oprávnění."
);
assert.ok(
  devServerSource.includes('url.pathname === "/api/collection-routes/daily-routes/my"')
    && devServerSource.includes('normalizeRole(user.role) !== "ridic"')
    && devServerSource.includes('mockCollectionDailyRouteForDriver(user, { scope: url.searchParams.get("scope") })'),
  "Lokální prohlížečový test musí mít osobní ukázkovou trasu dostupnou jen roli Řidič."
);
assert.ok(
  devServerSource.includes('user.id === "pneumatiky-miroslav-vasek"')
    && devServerSource.includes('email: "radim@nanolab.cz"'),
  "Lokální simulace musí otevřít Miroslavův účet přes dohodnutý testovací e-mail."
);
assert.ok(
  devServerSource.includes("mockDailyRouteTransitionMatch")
    && devServerSource.includes("mockDailyRouteStopEventMatch")
    && devServerSource.includes("mockDailyRouteMapMatch")
    && devServerSource.includes("mockDailyRouteNavigationMatch")
    && devServerSource.includes("mockDailyRouteReportMatch")
    && devServerSource.includes("eventType: action")
    && devServerSource.includes("externalEffectsDisabled: true")
    && devServerSource.includes("notificationsDisabled: true")
    && devServerSource.includes("vistosWritesDisabled: true")
    && devServerSource.includes("productionRouteWritesDisabled: true"),
  "Lokální Miroslavův displej musí umět bezpečně nasimulovat trasu i hlášení bez externích dopadů."
);

console.log("Collection routes driver kiosk tests passed.");
