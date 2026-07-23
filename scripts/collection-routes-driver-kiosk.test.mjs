import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  COLLECTION_ROUTES_DRIVER_KIOSK_ROUTE,
  COLLECTION_ROUTES_DRIVER_SIMULATED_GPS_VALUE,
  COLLECTION_ROUTES_DRIVER_TEST_KIOSK_ROUTE,
  collectionRoutesDriverKioskCanonicalPath,
  collectionRoutesDriverKioskRedirectPath,
  collectionRoutesDriverKioskScope,
  collectionRoutesDriverSimulatedGpsEnabled,
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
assert.equal(COLLECTION_ROUTES_DRIVER_SIMULATED_GPS_VALUE, "simulated");
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
assert.equal(collectionRoutesDriverSimulatedGpsEnabled("/trasy-svozu/test", "?gps=simulated", "test"), true);
assert.equal(collectionRoutesDriverSimulatedGpsEnabled("/trasy-svozu/test/", "?gps=simulated", "test"), true);
assert.equal(collectionRoutesDriverSimulatedGpsEnabled("/trasy-svozu", "?gps=simulated&scope=test", "test"), false);
assert.equal(collectionRoutesDriverSimulatedGpsEnabled("/trasy-svozu/test", "?gps=simulated", "production"), false);
assert.equal(collectionRoutesDriverSimulatedGpsEnabled("/trasy-svozu/test", "?gps=browser", "test"), false);

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
const driverPageEnd = appSource.indexOf("function collectionRoutesTestHomeSection", driverPageStart);
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
  "collection-daily-driver-stop-overview",
  "MAPOVÁNÍ STANOVIŠTĚ",
  "IZOLOVANÝ TEST · BEZ JÍZDY",
  "data-collection-driver-panel=\"report\"",
  "data-collection-driver-panel=\"dump\"",
  "data-collection-driver-panel=\"break\"",
  "data-collection-driver-settings"
]) {
  assert.ok(driverPageSource.includes(marker), `Řidičský displej postrádá prvek: ${marker}`);
}

for (const marker of [
  "collection-daily-driver-actions__primary",
  "collection-daily-driver-actions__context",
  "collection-daily-driver-actions__assistant",
  "collection-daily-driver-actions__label",
  "collection-daily-driver-action--wide",
  "aria-label=\"Pomoc Šarloty\"",
  "HLAVNÍ AKCE",
  "DALŠÍ AKCE",
  "HLASOVÁ POMOC",
  "STANOVIŠTĚ OBSLOUŽENO",
  "TYP · FOTO · POZNÁMKA",
  "is-admin-tablet-test"
]) {
  assert.ok(driverPageSource.includes(marker), `Řidičský displej postrádá bezpečnou skupinu akcí: ${marker}`);
}

for (const marker of [
  "collection-routes-tablet-test-status is-${summaryTone}",
  "collection-routes-tablet-test-status__result",
  "collection-routes-tablet-test-status__toggle",
  "Kontrola testu",
  "připraveno"
]) {
  assert.ok(appSource.includes(marker), `Administrátorská kontrola tabletu postrádá kompaktní stav: ${marker}`);
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
    && appSource.includes("<details class=\"collection-daily-driver-simulated-gps\"")
    && appSource.includes("TEST POLOHA")
    && appSource.includes("collection-daily-driver-map-spider-line")
    && appSource.includes("data-collection-driver-navigate")
    && driverMapSource.includes("Optimalizováno HERE"),
  "Řidičský displej musí zobrazit ovladatelnou HERE mapu aktuálního úseku i celé trasy."
);

assert.equal(driverPageSource.includes("<details"), false, "Pracovní akce řidiče nesmí být schované v rozbalovacím detailu.");
assert.equal(driverPageSource.includes("<select"), false, "Hlášení řidiče nesmí používat rozbalovací select.");
for (const marker of [
  "VYFOTIT STAV",
  "PŘIDAT DALŠÍ FOTKU",
  "POKRAČOVAT KE KONTROLE",
  "ZPĚT K TYPU HLÁŠENÍ",
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
for (const forbidden of ["DALŠÍ FOTKA?", "ANO · PŘIDAT DALŠÍ FOTKU", "NE · POKRAČOVAT"]) {
  assert.equal(appSource.includes(forbidden), false, `Hlášení řidiče nesmí obsahovat nejasnou volbu: ${forbidden}`);
}
assert.ok(
  appSource.includes('Object.entries(COLLECTION_DAILY_DRIVER_REPORT_TYPES).filter(([value]) => value !== "other")')
    && appSource.includes("COLLECTION_DAILY_DRIVER_REPORT_TYPE_OPTIONS.map"),
  "Řidičské hlášení nesmí nabízet kartu Jiný problém."
);
assert.ok(
  appSource.includes("const COLLECTION_DAILY_DRIVER_SARLOTA_ENABLED = false")
    && appSource.includes("if (!COLLECTION_DAILY_DRIVER_SARLOTA_ENABLED) return \"\";")
    && appSource.includes("COLLECTION_DAILY_DRIVER_SARLOTA_ENABLED && collectionRoutesAdminTabletTestActive()"),
  "Šarlota musí být na tabletu dočasně vypnutá v UI i ve všech automatických startech."
);
assert.ok(
  driverPageSource.includes("collection-daily-driver-route-kpi-link")
    && driverPageSource.includes("<span>HLÁŠENÍ</span>")
    && driverPageSource.includes('aria-label="Otevřít hlášení pro dispečink"'),
  "Souhrn HLÁŠENÍ musí jedním klepnutím otevřít formulář pro dispečink."
);
assert.ok(
  appSource.includes("function collectionDailyDriverBreakActivePanel(")
    && appSource.includes("PŘESTÁVKA BĚŽÍ")
    && appSource.includes("data-collection-driver-break-elapsed")
    && appSource.includes("data-collection-driver-break-start-time")
    && appSource.includes('data-collection-driver-operation="break" data-phase="ended"'),
  "Běžící přestávka musí být na celém tabletu nepřehlédnutelná a musí mít jednoznačné ukončení."
);
assert.ok(
  appSource.includes('collectionDailyDriverLatestOperation(collectionRoutesPilotState.myDailyRoute, "break") && action !== "break"')
    && appSource.includes("Nejdřív ukonči běžící přestávku."),
  "Běžící přestávka musí blokovat ostatní pracovní zápisy."
);
assert.ok(
  styleSource.includes(".collection-daily-driver-break-active")
    && styleSource.includes("z-index: 4200;")
    && styleSource.includes("width: 100vw;")
    && styleSource.includes("min-height: 100dvh;"),
  "Běžící přestávka musí překrýt celou pracovní obrazovku."
);
assert.ok(
  appSource.includes('function collectionDailyDriverStopStatusLabel(status)')
    && appSource.includes('return status === "problem" ? "Hlášení"')
    && appSource.includes('<i class="is-problem"></i> Hlášení'),
  "Řidičský tablet nesmí provozní stav nazývat slovem Problém."
);
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
  ".collection-daily-driver-actions__primary",
  ".collection-daily-driver-actions__context",
  ".collection-daily-driver-actions__assistant",
  ".collection-daily-driver-actions__label",
  ".collection-daily-driver-page.is-admin-tablet-test",
  ".collection-routes-tablet-test-status > summary",
  "min-height: 88px",
  "min-height: 76px",
  "overflow-wrap: anywhere"
]) {
  assert.ok(styleSource.includes(marker), `Tabletový kiosk postrádá terénní ergonomii: ${marker}`);
}

for (const marker of [
  ".collection-daily-driver-action--operational",
  "minmax(360px, 0.82fr)",
  "minmax(350px, 0.88fr)",
  "translateY(4px) scale(0.985)",
  ".collection-daily-driver-page.is-theme-night",
  ".collection-daily-driver-display-settings__modes",
  ".collection-daily-driver-sound-setting"
]) {
  assert.ok(styleSource.includes(marker), `Tabletový kiosk postrádá nové ovládání: ${marker}`);
}

assert.match(
  styleSource,
  /\.collection-daily-driver-page\.is-theme-night \.collection-daily-driver-sound-setting strong \{\s*color: #75bd25;/,
  "Stav zvuku musí zůstat čitelný i v nočním režimu."
);

assert.ok(
  appSource.includes("new DriverTabletAudioManager")
    && appSource.includes("function playCollectionDailyDriverSound(eventName")
    && appSource.includes("data-collection-driver-sound-mode")
    && appSource.includes("data-collection-driver-display-mode")
    && appSource.includes('playCollectionDailyDriverSound("primary_tap")')
    && appSource.includes("collectionDailyDriverPrimaryAudioTarget")
    && appSource.includes("collectionDailyDriverSoundTarget")
    && appSource.includes("unlockAndPreloadCollectionDailyDriverAudio"),
  "Skutečný kiosk musí používat centrální sémantický audio manager a ozvučit jen primární fyzické akce."
);

const audioHelperStart = appSource.indexOf("let collectionRoutesDriverAudioContext = null;");
const audioHelperEnd = appSource.indexOf("function collectionRoutesSourceDriverSoundsEnabled()", audioHelperStart);
assert.ok(audioHelperStart >= 0 && audioHelperEnd > audioHelperStart, "Zvuková pomocná funkce tabletu musí být dostupná pro regresní test.");
const audioHelperSource = appSource.slice(audioHelperStart, audioHelperEnd);
let finishAudioResume;
const simulatedAudioContext = {
  state: "suspended",
  resume() {
    return new Promise((resolve) => {
      finishAudioResume = resolve;
    });
  }
};
const withTabletAudioContext = new Function(
  "window",
  "console",
  `${audioHelperSource}\nreturn withCollectionRoutesDriverAudioContext;`
)(
  { AudioContext: function SimulatedAudioContext() { return simulatedAudioContext; } },
  { warn() {} }
);
const scheduledAudioStates = [];
withTabletAudioContext((context) => scheduledAudioStates.push(context.state));
assert.deepEqual(scheduledAudioStates, [], "Tón se nesmí plánovat do pozastaveného AudioContextu.");
simulatedAudioContext.state = "running";
finishAudioResume();
await Promise.resolve();
assert.deepEqual(scheduledAudioStates, ["running"], "Tón se musí naplánovat až po skutečném odemčení AudioContextu.");

assert.ok(
  appSource.includes('window.matchMedia?.("(prefers-color-scheme: dark)")')
    && appSource.includes("data-collection-driver-resolved-theme")
    && appSource.includes("data-collection-driver-current-display-mode")
    && appSource.includes("collectionDailyDriverColorSchemeMedia?.addEventListener"),
  "Automatický režim musí živě sledovat denní/noční režim Androidu."
);

assert.equal(
  appSource.includes("data-collection-daily-driver-kiosk data-collection-driver-display-mode="),
  false,
  "Kořen kiosku nesmí zachytit kliknutí určená ovládacím tlačítkům barevného režimu."
);

const sourcePreviewStart = appSource.indexOf("function collectionRoutesSourceDriverModePanel");
const sourcePreviewEnd = appSource.indexOf("function collectionRoutesSourceDriverPreviewPanel", sourcePreviewStart);
const sourcePreviewSource = appSource.slice(sourcePreviewStart, sourcePreviewEnd);
assert.ok(sourcePreviewStart >= 0 && sourcePreviewEnd > sourcePreviewStart, "Zdrojový náhled musí mít vlastní vykreslovací funkci.");
for (const marker of [
  "collection-daily-driver-page--source-preview",
  "collection-daily-driver-kiosk-bar",
  "collection-daily-driver-workspace",
  "collection-daily-driver-action--done",
  "HLÁŠENÍ PRO DISPEČINK",
  "data-collection-routes-source-driver-settings",
  "data-collection-routes-source-driver-current-display-mode",
  "data-collection-routes-source-driver-resolved-theme"
]) {
  assert.ok(sourcePreviewSource.includes(marker), `Zdrojový náhled nepoužívá prvek skutečného kiosku: ${marker}`);
}
assert.ok(
  !sourcePreviewSource.includes("Šarlota") && !sourcePreviewSource.includes('"Jiné"') && !sourcePreviewSource.includes(">Problém<"),
  "Zdrojový náhled nesmí vracet vypnutou Šarlotu, Jiný důvod ani starý název Problém."
);
assert.ok(
  appSource.includes("function collectionRoutesSourceDriverSettingsPanel()")
    && appSource.includes("data-collection-routes-source-driver-display-mode")
    && appSource.includes("data-collection-routes-driver-sound-toggle")
    && appSource.includes("sourceDriverDisplayMode: \"night\"")
    && appSource.includes("myDailyRouteDisplayMode: \"night\"")
    && appSource.includes("sourceDriverSettingsOpen: false"),
  "Zdrojový náhled i skutečný kiosk musí mít noční režim jako výchozí a zpřístupnit stejné nastavení displeje a zvuku."
);
for (const marker of [
  ".collection-daily-driver-page--source-preview",
  ".collection-routes-driver-source-map__grid",
  ".collection-routes-driver-source-route-list",
  ".collection-daily-driver-modal h2",
  "body:has([data-collection-routes-source-driver-preview-kiosk]) .ai-assistant-launcher"
]) {
  assert.ok(styleSource.includes(marker), `Sjednocený zdrojový náhled postrádá styl: ${marker}`);
}

const nightThemeStart = styleSource.indexOf(".collection-daily-driver-page.is-theme-night {");
const nightThemeEnd = styleSource.indexOf(".collection-driver-kiosk-active .ai-assistant-launcher", nightThemeStart);
const nightThemeSource = styleSource.slice(nightThemeStart, nightThemeEnd);
assert.ok(nightThemeStart >= 0 && nightThemeEnd > nightThemeStart, "Noční režim tabletu musí mít vlastní stylový blok.");
for (const marker of ["#151515", "#252525", "#2d2d2d", "#303030", "#2a2a2a", "#75bd25"]) {
  assert.ok(nightThemeSource.includes(marker), `Noční režim postrádá antracitový odstín: ${marker}`);
}
assert.ok(
  nightThemeSource.includes("background: rgba(20, 20, 20, 0.78);")
    && nightThemeSource.includes(".collection-daily-driver-modal header span {\n  color: #75bd25;"),
  "Noční dialog tabletu musí mít neutrální tmavě šedé pozadí a přesný zelený akcent."
);
assert.ok(
  nightThemeSource.includes(".collection-daily-driver-kiosk-bar,")
    && nightThemeSource.includes(".collection-daily-driver-actions {")
    && nightThemeSource.includes("background: #252525;"),
  "Noční režim musí změnit i horní lištu a pracovní sloupec z modré na tmavě šedou."
);
assert.ok(
  nightThemeSource.includes(".collection-daily-driver-choice-grid button {\n  border-color: #75bd25;\n  border-width: 2px;")
    && nightThemeSource.includes(".collection-daily-driver-choice-grid button.is-selected {\n  border-width: 3px;"),
  "Volby v nočních modálních oknech musí mít jemnou souvislou linku #75bd25 kolem celé volby a mírně silnější vybraný stav."
);
for (const legacyBlue of ["#090f19", "#111a28", "#182334", "#253044", "#142b4a", "#263247", "#202c3e", "#273347"]) {
  assert.ok(!nightThemeSource.includes(legacyBlue), `Noční režim stále obsahuje modrý odstín: ${legacyBlue}`);
}
for (const legacyGreenTint of ["#80ca39", "#72c82a", "#1d3c23", "#18351f", "#b9ef83", "#5ca91b", "#397e12"]) {
  assert.ok(!nightThemeSource.includes(legacyGreenTint), `Noční režim stále obsahuje zelený odstín mimo akcent: ${legacyGreenTint}`);
}

const sourceNightThemeStart = styleSource.indexOf(".collection-daily-driver-page--source-preview.is-theme-night");
const sourceNightThemeEnd = styleSource.indexOf("@media (max-width: 1100px)", sourceNightThemeStart);
const sourceNightThemeSource = styleSource.slice(sourceNightThemeStart, sourceNightThemeEnd);
assert.ok(sourceNightThemeStart >= 0 && sourceNightThemeEnd > sourceNightThemeStart, "Zdrojový náhled musí mít vlastní noční paletu.");
for (const legacySourceGreenTint of ["#497c25", "#263a25", "#b9ef83", "#69b22b"]) {
  assert.ok(!sourceNightThemeSource.includes(legacySourceGreenTint), `Noční zdrojový náhled stále obsahuje zelený odstín mimo akcent: ${legacySourceGreenTint}`);
}
assert.ok(
  sourceNightThemeSource.includes("#75bd25")
    && sourceNightThemeSource.includes(".collection-routes-driver-source-map__road"),
  "Noční zdrojový náhled musí používat přesný akcent #75bd25 i pro trasu v mapě."
);

for (const marker of [
  ".collection-daily-driver-map.is-fullscreen > .collection-daily-driver-simulated-gps",
  ".collection-daily-driver-map.is-fullscreen > .collection-daily-driver-map__primary-actions",
  ".collection-daily-driver-map.is-fullscreen > footer",
  ".collection-daily-driver-map.is-fullscreen > .collection-daily-driver-navigation-guidance"
]) {
  assert.ok(styleSource.includes(marker), `Celá mapa nesmí ponechat překážký přes mapový podklad: ${marker}`);
}
assert.ok(
  appSource.includes('fullscreen ? "ZPĚT K OBSLUZE" : "CELÁ MAPA"'),
  "Celá mapa musí mít krátké otevření a jednoznačný návrat k obsluze."
);

assert.ok(
  styleSource.includes(".collection-daily-driver-stop-overview")
    && styleSource.includes("min-height: clamp(260px, 54dvh, 340px)")
    && styleSource.includes(".collection-daily-driver-map__primary-actions")
    && styleSource.includes("position: absolute")
    && styleSource.includes(".collection-daily-driver-feedback"),
  "Blackview musí dát mapě garantovanou pracovní výšku a pomocné prvky přesunout do kompaktních vrstev."
);

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
    && appSource.includes("COLLECTION_ROUTES_DRIVER_TABLET_DEVICE.viewportProfile")
    && appSource.includes("window.visualViewport?.addEventListener"),
  "Řidičský displej musí automaticky zaznamenat skutečný viewport Blackview bez provozního zápisu."
);

assert.ok(
  appSource.includes("function collectionDriverBlackviewSimulatorRequested()")
    && appSource.includes('new URLSearchParams(window.location.search).get("device")')
    && appSource.includes("COLLECTION_ROUTES_DRIVER_TEST_KIOSK_ROUTE")
    && appSource.includes("data-collection-driver-blackview-simulator")
    && appSource.includes("data-collection-driver-blackview-frame")
    && appSource.includes('width="${escapeHtml(device.cssWidth)}"')
    && appSource.includes('height="${escapeHtml(device.cssHeight)}"')
    && appSource.includes("COLLECTION_ROUTES_DRIVER_TABLET_DEVICE")
    && appSource.includes('allow="camera; microphone; geolocation; autoplay; fullscreen"')
    && appSource.includes('url.searchParams.delete("device")')
    && styleSource.includes("collection-driver-blackview-simulator-active")
    && styleSource.includes(".collection-driver-blackview-simulator-frame iframe")
    && styleSource.includes("width: 960px")
    && styleSource.includes("height: 600px"),
  "TEST URL musí nabídnout trvalý interaktivní simulátor Blackview 960 × 600 bez vnořeného simulátoru."
);

for (const marker of [
  "SIMULOVANÁ POLOHA · NEJDE O GPS",
  "SIMULOVANÁ NAVIGACE · HERE",
  "data-collection-driver-simulated-gps=\"depot\"",
  "data-collection-driver-simulated-gps=\"current\"",
  "data-collection-driver-simulated-gps=\"next\"",
  "SPUSTIT JÍZDU",
  "JET PO TRASE",
  "RYCHLOST",
  "simulated-test-position",
  "function collectionDailyDriverSimulatedGpsEnabled",
  "function applyCollectionDailyDriverNavigationPoint",
  "function scheduleCollectionDailyDriverSimulatedPlayback"
]) {
  assert.ok(appSource.includes(marker), `TEST simulace polohy postrádá ochranu nebo ovládání: ${marker}`);
}
assert.ok(
  styleSource.includes(".collection-daily-driver-simulated-gps")
    && styleSource.includes("min-height: 44px")
    && styleSource.includes(".collection-daily-driver-simulated-gps > summary")
    && styleSource.includes('content: "ROZBALIT"'),
  "Simulace polohy musí být na 11palcovém tabletu zřetelná, sbalená a ovladatelná."
);
assert.equal(appSource.includes("sessionStorage"), false, "Simulovaná poloha se nesmí ukládat do sessionStorage.");
assert.equal(appSource.includes("localStorage"), false, "Simulovaná poloha se nesmí ukládat do localStorage.");
const physicalGpsCaptureSource = appSource.slice(
  appSource.indexOf("function collectCollectionRoutesTestGpsSamples"),
  appSource.indexOf("function collectionRoutesActiveGpsDetail")
);
assert.ok(
  physicalGpsCaptureSource.includes("navigator.geolocation.watchPosition")
    && !physicalGpsCaptureSource.includes("simulated-test-position"),
  "Fyzické mapování stanoviště musí dál používat skutečnou geolokaci a nesmí přijmout simulaci."
);
const simulatedGpsRuntimeSource = appSource.slice(
  appSource.indexOf("function clearCollectionDailyDriverSimulatedPlayback"),
  appSource.indexOf("function syncCollectionRoutesTestTabletHereMap")
);
assert.equal(simulatedGpsRuntimeSource.includes('method: "POST"'), false, "Simulace polohy nesmí zapisovat přes API.");
for (const forbidden of ["test-gps-confirmations", "notifications", "Vistos", "sessionStorage", "localStorage"]) {
  assert.equal(
    simulatedGpsRuntimeSource.includes(forbidden),
    false,
    `Simulace polohy nesmí zasahovat do chráněného toku: ${forbidden}`
  );
}

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
