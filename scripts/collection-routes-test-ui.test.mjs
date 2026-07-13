import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COLLECTION_ROUTES_MANTRA } from "../src/data/collectionRoutesMantra.js";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const mantraSource = readFileSync(new URL("../src/data/collectionRoutesMantra.js", import.meta.url), "utf8");
const calculatorSource = readFileSync(new URL("../src/data/collectionRoutesReadonlyCalculator.js", import.meta.url), "utf8");
const wranglerSource = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

for (const marker of [
  "TEST Brno 501",
  "Firma test 501",
  "Trnkova 3052/137, 628 00 Brno",
  "Management · oddělená testovací data",
  "TEST ŘIDIČSKÉHO TABLETU",
  "OTEVŘÍT TEST TABLETU",
  "SPUSTIT TEST TABLETU",
  "Řidičský tablet · zdrojový náhled",
  "collectionRoutesTestTabletWorkspace",
  "data-collection-routes-test-tablet-open",
  "data-collection-routes-test-tablet-close",
  "data-collection-routes-test-tablet-dialog",
  "Mapový výřez u nádoby",
  "NÁHLED · NENÍ NAVIGACE",
  "data-collection-routes-test-tablet-map",
  "syncCollectionRoutesTestTabletHereMap",
  "HERE mapa aktuálního TEST stanoviště",
  "/api/collection-routes/here-map-image",
  "Fyzická GPS řidiče",
  'data-collection-daily-route-scope="production"',
  'data-collection-daily-route-scope="test"',
  "Připravit 1 SMS + 1 e-mail",
  "Připravit zprávy pro celou trasu",
  "Dny u četností Nx7 se zrcadlí 1:1",
  "1x30 má pevný pracovní den i pořadí v měsíci",
  "Archivní TEST v1",
  "TEST v2",
  "data-collection-routes-test-site-detail",
  "collectionRoutesTestSiteDetailTable",
  'testDatasetExpandedRowKeys.length ? "open" : ""',
  "data-collection-routes-test-notification-confirm-form",
  "Potvrzuju skutečné odeslání",
  "data-collection-routes-test-notification-retry-form",
  "Opakovat pouze 1 neúspěšnou SMS",
  "Již odeslané zprávy, včetně e-mailu, zůstanou nedotčené.",
  "Novou úplnou dávku nelze připravit",
  "collectionRoutesCanUseTestDataset",
  "data-collection-routes-mantra",
  "data-collection-routes-mantra-toggle",
  "data-collection-routes-mantra-audit",
  "Poslední úprava",
  "Co se změnilo",
  "Provedl",
  "mantraExpanded = !collectionRoutesPilotState.mantraExpanded",
  "NÁHLED · NIC NESPOUŠTÍ",
  "TEST výpočetní pilot · kapacita + HERE",
  "Ověřit stanoviště pro datum",
  "Spočítat read-only návrh A/B/C",
  "data-collection-routes-readonly-calculate",
  "data-collection-routes-readonly-calculation",
  "calculateCollectionRoutesReadonlyPlan",
  "HERE Tour Planning · ČR · truck routing",
  "data-collection-route-here-waste",
  "data-collection-route-here-readiness",
  "data-collection-route-here-start",
  "data-collection-route-here-refresh",
  "start-here-test-readonly",
  "/api/collection-routes/here-optimization",
  "Žádné automatické opakování neběží",
  "TEST · READ-ONLY VÝPOČET",
  "Fyzické potvrzení GPS stanoviště",
  "data-collection-routes-test-gps-capture",
  "data-collection-routes-test-gps-voice",
  "data-collection-routes-test-gps-save",
  "preview.idempotencyKey",
  "/api/collection-routes/test-gps-confirmations"
]) {
  assert.ok(appSource.includes(marker), `UI postrádá ochranný nebo viditelný prvek: ${marker}`);
}

for (const column of ["Stav", "Pořadí", "Zákazník", "Stanoviště", "Odpad / nádoba", "Interval", "Den svozu", "Smlouva"]) {
  assert.ok(
    appSource.includes(`<th>${column}</th>`) && appSource.includes(`data-label="${column}"`),
    `TEST řádek musí stejně jako ostrá data obsahovat sloupec ${column}.`
  );
}

assert.ok(
  appSource.includes("collection-routes-sites-table collection-routes-preview-table") &&
    appSource.includes("collection-daily-route-table-wrap collection-routes-sites-table collection-routes-preview-table"),
  "TEST zdrojový řádek i uložená trasa musí používat stejný responzivní tabulkový vzor jako ostrá data."
);

for (const detailColumn of ["Od-do", "Adresní místo", "Stanoviště", "Odpad", "Nádoba", "Interval", "Den svozu", "Poznámka", "Zákaznický manažer"]) {
  assert.ok(
    appSource.includes(`<th>${detailColumn}</th>`) && appSource.includes(`data-label="${detailColumn}"`),
    `TEST detail musí stejně jako ostrý detail obsahovat pole ${detailColumn}.`
  );
}

assert.ok(
  appSource.includes("function collectionDailyRouteTestDate") &&
    appSource.includes("collectionRoutesPilotState.dailyRouteDate = collectionDailyRouteTestDate"),
  "TEST režim musí o víkendu nabídnout nejbližší pracovní den."
);

assert.ok(
  appSource.includes('["admin", "management"].includes(normalizeRole(user?.role))'),
  "TEST režim musí být omezený na Admin a Management."
);
assert.ok(
  appSource.includes('confirmation: "create-test-brno-500"'),
  "Založení TEST dat musí posílat explicitní potvrzení."
);
assert.ok(
  appSource.includes("expectedMessageCount: preview.messageCount") &&
    appSource.includes("idempotencyKey: preview.idempotencyKey"),
  "Skutečné odeslání musí potvrdit přesný počet zpráv a při opakování použít stejný klíč."
);
assert.ok(
  appSource.includes("expectedFailedCount: retry.failedCount") &&
    appSource.includes("expectedRetryableCount: retry.retryableCount") &&
    appSource.includes("expectedJobUpdatedAt: job.updatedAt") &&
    appSource.includes("confirmation: retry.confirmation"),
  "Opakování musí potvrdit přesný počet neúspěšných a bezpečně opakovatelných kanálů."
);
assert.ok(
  appSource.includes("/api/collection-routes/test-notifications?runId=") &&
    appSource.includes('const canPrepareNew = !job || job.status === "completed"'),
  "Reload musí obnovit rozpracovanou úlohu a částečný stav nesmí nabídnout novou úplnou dávku."
);
assert.ok(
  !appSource.includes("COLLECTION_ROUTES_TEST_SMS_TO") && !appSource.includes("COLLECTION_ROUTES_TEST_EMAIL_TO"),
  "Chráněné příjemce nesmí obsahovat frontendový zdroj."
);
assert.ok(
  !appSource.includes("HERE_ACCESS_KEY_ID") && !appSource.includes("HERE_ACCESS_KEY_SECRET"),
  "HERE OAuth přístupy nesmí obsahovat frontendový zdroj."
);
assert.ok(
  !appSource.includes("HERE_MAPS_API_KEY"),
  "Serverový HERE mapový klíč nesmí obsahovat frontendový zdroj."
);

for (const marker of [
  ".collection-routes-test-dataset",
  ".collection-routes-test-tablet-entry",
  ".collection-routes-test-tablet-overlay",
  ".collection-routes-test-tablet-workspace",
  ".collection-routes-test-tablet-steps",
  ".collection-routes-test-tablet-form",
  ".collection-routes-test-tablet-map",
  ".collection-routes-test-tablet-map__canvas",
  ".collection-routes-test-notifications",
  ".collection-routes-test-badge",
  ".collection-routes-test-notification-retry",
  "@media (max-width: 640px)",
  ".collection-routes-mantra",
  ".collection-routes-mantra__highlights",
  ".collection-routes-mantra__audit",
  ".collection-daily-routes__reality",
  ".collection-routes-calculation",
  ".collection-routes-calculation__vehicles",
  ".collection-routes-calculation__truth",
  ".collection-route-here",
  ".collection-route-here__facts",
  ".collection-route-here__actions",
  ".collection-routes-test-gps__rugged-button",
  ".collection-routes-test-gps__confirm"
]) {
  assert.ok(styleSource.includes(marker), `Styly TEST rozhraní postrádají: ${marker}`);
}

for (const marker of [
  "KSO Svozový autopilot – provozní mantra",
  "TEST návrh pravidel",
  "Četnosti Nx7 musí být v lichém a sudém týdnu přesně zrcadlené 1:1",
  "A – 3BN 3558",
  "B – 1BP 8373",
  "C – 3BE 2831",
  "120 l: 3 minuty",
  "1100 l: 5 minut",
  "SAKO Brno, a.s.",
  "Hamburger Recycling CZ s.r.o.",
  "FCC Česká republika",
  "Kompostárna Fertia",
  "JIŽ HOTOVO",
  "MUSÍM JET VYSYPAT",
  "FYZICKÉ GPS MAPOVÁNÍ STANOVIŠTĚ",
  "minimálně 120 px vysoké a na úzkém displeji 132 px",
  "TEST řidičského tabletu musí mít na začátku modulu jedno zřetelné tlačítko",
  "Řidičský TEST zobrazuje nad GPS tlačítkem HERE mapový výřez aktuálního stanoviště",
  "Bez výslovného potvrzení dispečerky nic neměň ani neodesílej",
  "Paměť musí být cloudová"
]) {
  assert.ok(mantraSource.includes(marker), `Provozní mantra postrádá závazný bod: ${marker}`);
}

assert.ok(
  mantraSource.includes("Tato verze nic sama neodesílá") &&
    mantraSource.includes("nezapisuje do Vistosu") &&
    mantraSource.includes("Dokud práh není schválený, neodesílej automatické upozornění"),
  "Read-only mantra musí přímo zakazovat falešnou automatizaci, produkční zápisy a neodsouhlasené alerty."
);

const mantraChangeWordCount = String(COLLECTION_ROUTES_MANTRA.lastChange || "").trim().split(/\s+/).filter(Boolean).length;
assert.ok(
  mantraChangeWordCount >= 4 && mantraChangeWordCount <= 5,
  "Krátký popis poslední úpravy Mantry musí mít 4 až 5 slov."
);
assert.ok(
  Number.isFinite(Date.parse(COLLECTION_ROUTES_MANTRA.updatedAtIso)) && COLLECTION_ROUTES_MANTRA.updatedBy,
  "Mantra musí mít strojově čitelný čas a autora poslední úpravy."
);

const tabletWorkspaceStart = appSource.indexOf("function collectionRoutesTestTabletWorkspace");
const tabletWorkspaceEnd = appSource.indexOf("function collectionRoutesTestDatasetPanel", tabletWorkspaceStart);
const tabletWorkspaceSource = appSource.slice(tabletWorkspaceStart, tabletWorkspaceEnd);
assert.ok(tabletWorkspaceStart >= 0 && tabletWorkspaceEnd > tabletWorkspaceStart, "Samostatný TEST tablet musí mít vlastní vykreslovací tok.");
assert.ok(!tabletWorkspaceSource.includes("<table"), "Samostatný TEST tablet nesmí obsahovat tabulku 501 stanovišť.");

const dispatcherDetailStart = appSource.indexOf("function collectionDailyRouteDispatcherDetail");
const dispatcherDetailEnd = appSource.indexOf("function collectionDailyRoutesDispatcherPanel", dispatcherDetailStart);
const dispatcherDetailSource = appSource.slice(dispatcherDetailStart, dispatcherDetailEnd);
assert.ok(
  dispatcherDetailSource.indexOf("collectionRoutesTestGpsPanel(detail)") < dispatcherDetailSource.indexOf("collection-daily-route-table-wrap"),
  "GPS panel musí být i v běžném detailu před dlouhou tabulkou zastávek."
);

const tabletMapStart = appSource.indexOf("function collectionRoutesTestTabletMapPanel");
const tabletMapEnd = appSource.indexOf("function collectionRoutesTestGpsPanel", tabletMapStart);
const tabletMapSource = appSource.slice(tabletMapStart, tabletMapEnd);
assert.ok(tabletMapStart >= 0 && tabletMapEnd > tabletMapStart, "TEST tablet musí mít vlastní bezpečný mapový výřez.");
for (const forbiddenMapField of ["customerName", "driverName", "contractNumber", "recipientPhone", "recipientEmail"]) {
  assert.ok(!tabletMapSource.includes(forbiddenMapField), `Mapový provider nesmí dostat pole ${forbiddenMapField}.`);
}
assert.ok(!tabletMapSource.includes("Google"), "Tabletový mapový výřez nesmí používat Google mapu.");
assert.ok(tabletMapSource.includes("HERE") && tabletMapSource.includes("chráněný backend"));

for (const marker of [
  "120: 3",
  "240: 3",
  "1100: 5",
  "knownWeightTons",
  "estimatedDumpCount",
  "READ-ONLY · POTŘEBUJE DOPLNĚNÍ",
  "Neurčuje pořadí ulic ani optimální trasu",
  "writesData: false",
  "sendsNotifications: false"
]) {
  assert.ok(calculatorSource.includes(marker), `Read-only výpočetní jádro postrádá: ${marker}`);
}
assert.ok(
  !calculatorSource.includes("localStorage") &&
    !calculatorSource.includes("sessionStorage") &&
    !calculatorSource.includes("fetch("),
  "Výpočetní jádro nesmí ukládat data ani samo volat API."
);

assert.ok(
  wranglerSource.includes('binding = "COLLECTION_ROUTES_TEST_DB"') &&
    wranglerSource.includes('database_name = "smart-odpady-routes-test"'),
  "Pages konfigurace musí používat samostatný TEST D1 binding."
);
assert.ok(
  !wranglerSource.includes("COLLECTION_ROUTES_TEST_SMS_TO") &&
    !wranglerSource.includes("COLLECTION_ROUTES_TEST_EMAIL_TO"),
  "Skuteční testovací příjemci musí zůstat mimo verzovanou Pages konfiguraci."
);

console.log("Collection routes TEST Brno 501 UI tests passed.");
