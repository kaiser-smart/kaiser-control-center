import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COLLECTION_ROUTES_MANTRA } from "../src/data/collectionRoutesMantra.js";
import {
  collectionRoutesFieldTestOwnedByUser,
  selectCollectionRoutesFieldTestRun
} from "../src/data/collectionRoutesFieldTestSelection.js";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const mantraSource = readFileSync(new URL("../src/data/collectionRoutesMantra.js", import.meta.url), "utf8");
const sarlotaVisionSource = readFileSync(new URL("../docs/COLLECTION_ROUTES_VOICE_SARLOTA_VISION.md", import.meta.url), "utf8");
const calculatorSource = readFileSync(new URL("../src/data/collectionRoutesReadonlyCalculator.js", import.meta.url), "utf8");
const wranglerSource = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

const radimActiveTest = {
  id: "field-radim-active",
  status: "active",
  metadata: { fieldTesterUserId: "radim" }
};
const tomasCompletedTest = {
  id: "field-tomas-completed",
  status: "completed",
  metadata: { fieldTesterUserId: "tomas" }
};
const tomasDraftTest = {
  id: "field-tomas-draft",
  status: "draft",
  metadata: { fieldTesterUserId: "tomas" }
};

assert.equal(collectionRoutesFieldTestOwnedByUser(tomasCompletedTest, "tomas"), true);
assert.equal(collectionRoutesFieldTestOwnedByUser(tomasCompletedTest, "radim"), false);
assert.equal(
  selectCollectionRoutesFieldTestRun([radimActiveTest, tomasCompletedTest], { userId: "tomas" })?.id,
  "field-tomas-completed",
  "Tomášovi se nesmí místo jeho dokončeného TESTU automaticky otevřít Radimův aktivní TEST."
);
assert.equal(
  selectCollectionRoutesFieldTestRun([radimActiveTest, tomasCompletedTest, tomasDraftTest], { userId: "tomas" })?.id,
  "field-tomas-draft",
  "Bez ručního výběru se má testerovi nabídnout jeho vlastní nejbližší rozpracovaný TEST."
);
assert.equal(
  selectCollectionRoutesFieldTestRun([radimActiveTest, tomasCompletedTest], {
    userId: "tomas",
    selectedRunId: "field-tomas-completed"
  })?.id,
  "field-tomas-completed",
  "Výslovně vybraný TEST se nesmí po otevření tabletu tiše přepnout."
);
assert.equal(
  selectCollectionRoutesFieldTestRun([radimActiveTest], { userId: "tomas" }),
  null,
  "Cizí aktivní TEST se nesmí automaticky vydávat za Tomášův pracovní TEST."
);

for (const marker of [
  "TEST Brno 501",
  "Firma test 501",
  "Trnkova 3052/137, 628 00 Brno",
  "Management · oddělená data",
  "ŘIDIČSKÝ TABLET",
  "Stacionární TEST řidičského tabletu",
  "Historie testů tabletu",
  "Můj TEST",
  "Jen náhled",
  "Tester se výběrem historie nemění",
  "ZPĚT NA MŮJ TEST",
  "PŘIPRAVIT NOVÝ TEST",
  "PŘIPRAVIT TEST TABLETU",
  "PŘIPRAVIT TEST PRO MIROSLAVA",
  "data-collection-daily-route-transition=\"prepare\"",
  "testTabletSelectedRunId",
  "collectionRoutesStationaryFieldTestOwnedByCurrentUser",
  "stationary-field-test",
  "Terénní tester",
  "Bez jízdy",
  "OVĚŘIT JEDEN TEST BOD",
  "POTVRDIT STACIONÁRNÍ TEST",
  "OTEVŘÍT TEST TABLETU",
  "SPUSTIT TEST TABLETU",
  "DOKONČIT TEST TABLETU",
  "GPS měření je uložené. TEST můžeš dokončit",
  "Kontrola navigačního bodu proběhne samostatně.",
  "Řidičský tablet · zdrojový náhled",
  "collectionRoutesTestTabletWorkspace",
  "collectionRoutesTestHomeSection",
  "Zkušební pracoviště tabletu",
  "DOPORUČENÝ DALŠÍ KROK",
  "Plánování trasy a HERE",
  "Data, bezpečnost a provozní podklady",
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
  "Fyzická GPS testera",
  "Změřeno terénním testerem",
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
  "PROVOZNÍ MANTRA · READ-ONLY NÁHLED",
  "NIC NESPOUŠTÍ",
  "ROZBALIT",
  "Stacionární tablet · bez jízdy",
  "Firma test 501 · jeden bod · bez jízdy",
  "Výpočetní pilot · kapacita + HERE",
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
  "READ-ONLY VÝPOČET",
  "Fyzické potvrzení GPS stanoviště",
  "data-collection-routes-test-gps-capture",
  "data-collection-routes-test-voice-provider",
  "Hlas: ElevenLabs Šarlota · systémové čtení vypnuto",
  "data-collection-driver-sarlota-memory",
  "PAMĚŤ: ZAPNUTÁ",
  "Povolit pracovní paměť?",
  "SPUSTIT BEZ PAMĚTI",
  "VYPNOUT A SMAZAT PAMĚŤ",
  "/api/ai/collection-routes/context",
  "/api/ai/sarlota/memory",
  "remember_exchange",
  "await enableCollectionDailyDriverSarlota()",
  "data-collection-routes-test-gps-voice",
  "data-collection-routes-test-gps-save",
  "prepareCollectionRouteGpsCapture",
  "prepareCollectionRoutesTestGpsFromSarlota",
  "vehicleSelectionRequired: false",
  "finalTapRequired: true",
  "preview.idempotencyKey",
  "/api/collection-routes/test-gps-confirmations",
  "Přeplněná nádoba",
  "Poškozená nádoba",
  "Nelze se dostat do firmy",
  "PŘIPRAVIT TEST HLÁŠENÍ",
  "POKRAČOVAT K POTVRZENÍ TESTU",
  "POKRAČOVAT K POTVRZENÍ ODESLÁNÍ",
  "Opravdu odeslat?",
  "Odešle se pouze jednou",
  "ANO, ODESLAT 1×",
  "HOTOVO – ZAVŘÍT A VRÁTIT SE",
  "INTERNÍ E-MAIL + SMS",
  "Skutečný interní e-mail a SMS odejdou zobrazené dispečerce",
  "Skutečný zákazník ani dispečerka zprávu nedostanou",
  "TEST A · jedeme kolem do 24 h",
  "TEST B · nejedeme kolem do 24 h",
  "KLIDNÁ ODPOVĚĎ",
  "VYHROCENÁ ODPOVĚĎ",
  "capture=\"environment\"",
  "accept=\"image/*\"",
  "data-collection-routes-test-incident-open",
  "data-collection-routes-test-incident-photo",
  "data-collection-routes-test-incident-form",
  "data-collection-routes-test-incident-workflow-review-form",
  "data-collection-routes-test-incident-workflow-form",
  "data-collection-routes-test-incident-final-back",
  "compressCollectionRoutesTestIncidentPhoto",
  "prepareCollectionRoutesTestIncidentFromSarlota",
  "openCollectionRoutesTestIncidentFinalConfirmation",
  "closeCollectionRoutesTestIncidentFinalConfirmation",
  "confirmCollectionRoutesTestIncidentWorkflow",
  "simulateCollectionRoutesTestIncidentReply",
  "finalTapRequired: true",
  "sendsNotifications: false",
  "changesRoute: false",
  "/api/collection-routes/test-incidents",
  "/workflow",
  "/reply"
]) {
  assert.ok(appSource.includes(marker), `UI postrádá ochranný nebo viditelný prvek: ${marker}`);
}

const testDatasetPanelSource = appSource.slice(
  appSource.indexOf("function collectionRoutesTestDatasetPanel"),
  appSource.indexOf("function collectionRoutesTestSiteDetailTable")
);
assert.ok(
  testDatasetPanelSource.includes("!collectionDailyRouteIsTestScope()") &&
    !testDatasetPanelSource.includes("data-collection-daily-route-scope"),
  "Ostrá stránka nesmí vykreslit TEST dataset ani přepínač datového režimu."
);
assert.ok(
  appSource.includes('isTest && options.showTestPrelude !== false ? collectionRoutesTestDatasetPanel(user) : ""') &&
    appSource.includes("return collectionRoutesTestHomeSection(user)") &&
    appSource.includes("PROVOZNÍ MANTRA · READ-ONLY NÁHLED"),
  "Oddělený dataset smí být jen v TEST scope, hlavní úkol musí mít vlastní pracoviště a Mantra musí zůstat read-only."
);
assert.ok(
  appSource.includes("isCollectionRoutesDriverKioskUser(user) || collectionRoutesCanUseTestDataset(user)") &&
    appSource.includes('const requestedScope = path === COLLECTION_ROUTES_DRIVER_TEST_KIOSK_ROUTE ? "test" : "production"'),
  "Přímá /trasy-svozu/test musí zachovat oddělený scope řidiči i oprávněné správě bez přepínače na ostré stránce."
);

for (const column of ["Stav", "Pořadí", "Zákazník", "Stanoviště", "Odpad / nádoba", "Interval", "Den svozu", "Smlouva"]) {
  assert.ok(
    appSource.includes(`<th>${column}</th>`) && appSource.includes(`data-label="${column}"`),
    `TEST řádek musí stejně jako ostrá data obsahovat sloupec ${column}.`
  );
}

assert.ok(
  appSource.includes('"missing-address-place": {') &&
    appSource.includes('"address-place-read-incomplete": {'),
  "UI musí rozlišit skutečně chybějící Adresní místo od technicky nedokončeného načtení KSO."
);

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
  ".collection-routes-test-tablet-owner-warning",
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
  ".collection-routes-test-gps__rugged-button--finish",
  ".collection-routes-test-gps__confirm",
  ".collection-routes-test-incidents",
  ".collection-routes-test-incidents__buttons",
  ".collection-routes-test-incident-modal",
  ".collection-routes-test-incident-camera",
  ".collection-routes-test-incident-submit",
  ".collection-routes-test-incident-scenarios",
  ".collection-routes-test-incident-confirmation",
  ".collection-routes-test-incident-final-warning",
  ".collection-routes-test-incident-final-actions",
  ".collection-routes-test-incident-final-back",
  ".collection-routes-test-incident-result",
  ".collection-routes-test-incident-result-close",
  ".collection-routes-test-incident-replies"
]) {
  assert.ok(styleSource.includes(marker), `Styly TEST rozhraní postrádají: ${marker}`);
}

for (const marker of [
  "KSO Svozový autopilot – provozní mantra",
  "Ostrý interní pilot se zákaznickou komunikací stále v TESTU",
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
  "prepare_collection_route_gps_capture",
  "Nesmí otevřít výběr vozidla",
  "fyzický GPS bod se uloží až po velkém ručním klepnutí",
  "HLAS NAVIGACE A HLASOVÁ ŠARLOTA",
  "Hlas navigace a hlasová Šarlota jsou dva oddělené systémy",
  "Navigační pokyn má vždy zvukovou prioritu",
  "aktuální počasí",
  "ověřený seznam a přiřazení vozidel",
  "oficiálního RSS iROZHLAS",
  "Neoficiální scraping, přebírání popisů a předčítání celých článků je zakázané",
  "dlouhodobou paměť vázanou na stabilní KSO user ID a firmu",
  "SMS musí být bez diakritiky, nejvýše 160 znaků a v jednom segmentu",
  "minimálně 120 px vysoké a na úzkém displeji 132 px",
  "TEST řidičského tabletu musí mít na začátku modulu jedno zřetelné tlačítko",
  "Řidičský tablet nesmí tiše zaměnit vybraný TEST ani jeho terénního testera",
  "Cizí TEST je pouze náhled bez tlačítek",
  "Staré stacionární TESTY patří do sbalené historie",
  "Řidičský TEST zobrazuje nad GPS tlačítkem HERE mapový výřez aktuálního stanoviště",
  "Bez výslovného potvrzení dispečerky nic neměň ani neodesílej",
  "Paměť musí být cloudová",
  "Stacionární terénní TEST smí obsahovat přesně jediný bod",
  "skutečné datum přítomnosti testera",
  "Změřeno terénním testerem",
  "TEST HLÁŠENÍ STANOVIŠTĚ",
  "prepare_collection_route_test_incident",
  "PŘEPLNĚNÁ NÁDOBA, POŠKOZENÁ NÁDOBA a NELZE SE DOSTAT DO FIRMY",
  "PŘEPLNĚNÁ NEBO POŠKOZENÁ NÁDOBA",
  "NELZE SE DOSTAT DO FIRMY",
  "TEST KOMUNIKACE A ESKALACE",
  "POKRAČOVAT K POTVRZENÍ ODESLÁNÍ",
  "ANO, ODESLAT 1×",
  "HOTOVO – ZAVŘÍT A VRÁTIT SE",
  "nejvýše 12 dvojic e-mail + SMS",
  "nejvýše šesti e-mailových pokusů",
  "Skutečný zákazník nesmí být kontaktován"
]) {
  assert.ok(mantraSource.includes(marker), `Provozní mantra postrádá závazný bod: ${marker}`);
}

for (const marker of [
  "Hlas navigace a hlasová Šarlota jsou dva samostatné systémy",
  "Agentic AI nebo jazykový model nesmí tvořit ani přeformulovávat kritické navigační pokyny",
  "jméno, příjmení, funkce a schválený služební telefon a e-mail",
  "dovolenou a nadřízeného",
  "nejvýše tři aktuální titulky z oficiálního RSS iROZHLAS",
  "Až po fyzickém klepnutí na potvrzení",
  "dlouhodobou paměť vázanou na stabilní KSO user ID a firmu",
  "ne nepřetržitou nahrávku hlasu",
  "Neznamená automatické povolení nových integrací"
]) {
  assert.ok(sarlotaVisionSource.includes(marker), `Produktová vize hlasové Šarloty postrádá: ${marker}`);
}

assert.ok(
  appSource.includes("draft.finalSendConfirmationOpen !== true") &&
    appSource.includes('collectionRoutesPilotState.testIncidentPending = "workflow"') &&
    appSource.includes("draft.workflowReused = result.reused === true"),
  "Finální odeslání musí vyžadovat otevřené potvrzení, okamžitě zamknout tlačítko a rozpoznat uložený výsledek."
);
assert.ok(
  appSource.includes("if (collectionRoutesPilotState.testIncidentPending || collectionRoutesPilotState.testIncidentReplyPending) return;") &&
    appSource.includes("closeCollectionRoutesTestIncidentFinalConfirmation();") &&
    appSource.includes('document.querySelector("[data-collection-routes-test-incident-open]")?.focus()'),
  "Během odesílání se dialog nesmí zavřít; po výsledku se musí bezpečně vrátit na výchozí výběr hlášení."
);

assert.ok(
  appSource.includes("collectionRoutesStationaryFieldGpsReady") &&
    appSource.includes('data-collection-daily-route-transition="complete"'),
  "Uložené stacionární GPS měření musí zpřístupnit explicitní dokončení TESTU tabletu."
);
assert.ok(
  mantraSource.includes("Čeká na kontrolu\u201c blokuje použití bodu v navigaci") &&
    mantraSource.includes("Bez uloženého GPS měření dokončení nepovol"),
  "Mantra musí oddělit dokončení fyzického TESTU od schválení navigačního bodu."
);

assert.ok(
  mantraSource.includes("U nepřístupné firmy smí každý e-mail fyzicky mířit pouze na chráněný COLLECTION_ROUTES_TEST_EMAIL_TO") &&
    mantraSource.includes("skutečný interní e-mail s fotografií") &&
    mantraSource.includes("samostatné okno „Opravdu odeslat?“") &&
    mantraSource.includes("Opakované, souběžné ani obnovené potvrzení nesmí vytvořit druhý e-mail nebo SMS") &&
    mantraSource.includes("do Vistosu nezapisuje") &&
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
assert.ok(
  appSource.includes(`./data/collectionRoutesMantra.js?v=${COLLECTION_ROUTES_MANTRA.version}`),
  "Import Mantry musí používat její verzi, aby produkční prohlížeč nezobrazil starý audit z cache."
);

const tabletWorkspaceStart = appSource.indexOf("function collectionRoutesTestTabletWorkspace");
const tabletWorkspaceEnd = appSource.indexOf("function collectionRoutesTestDatasetPanel", tabletWorkspaceStart);
const tabletWorkspaceSource = appSource.slice(tabletWorkspaceStart, tabletWorkspaceEnd);
assert.ok(tabletWorkspaceStart >= 0 && tabletWorkspaceEnd > tabletWorkspaceStart, "Samostatný TEST tablet musí mít vlastní vykreslovací tok.");
assert.ok(!tabletWorkspaceSource.includes("<table"), "Samostatný TEST tablet nesmí obsahovat tabulku 501 stanovišť.");
assert.ok(!tabletWorkspaceSource.includes("data-collection-daily-route-assign-form"), "Stacionární TEST nesmí předstírat přiřazení řidiče.");
assert.ok(
  appSource.includes("collectionRoutesIsStationaryFieldTestRun") &&
    appSource.includes("preview.testMode ||") &&
    appSource.includes("collectionRoutesPilotState.dailyRoutes.filter(collectionRoutesIsStationaryFieldTestRun)"),
  "Tabletový TEST musí být oddělený typ trasy a nesmí převzít starou vícestopou TEST trasu."
);

const tabletOpenStart = appSource.indexOf("async function openCollectionRoutesTestTablet");
const tabletOpenEnd = appSource.indexOf("function closeCollectionRoutesTestTablet", tabletOpenStart);
const tabletOpenSource = appSource.slice(tabletOpenStart, tabletOpenEnd);
assert.ok(
  tabletOpenStart >= 0 && tabletOpenEnd > tabletOpenStart &&
    tabletOpenSource.includes("testTabletSelectedRunId") &&
    !tabletOpenSource.includes('currentRun.status === "completed"'),
  "Otevření tabletu musí zachovat výslovně vybraný TEST a nesmí dokončený Tomášův TEST přepsat aktivním Radimovým."
);

const dailyRoutesListStart = appSource.indexOf("function collectionDailyRoutesList");
const dailyRoutesListEnd = appSource.indexOf("function collectionRoutesTestOperationalConfigPanel", dailyRoutesListStart);
const dailyRoutesListSource = appSource.slice(dailyRoutesListStart, dailyRoutesListEnd);
assert.ok(
  dailyRoutesListSource.includes("!collectionRoutesIsStationaryFieldTestRun(route)") &&
    dailyRoutesListSource.includes("Zkoušky tabletu najdeš pouze v jejich přehledné historii"),
  "Stacionární testy tabletu nesmí znovu zaplnit hlavní seznam ručních výpočetních tras."
);

const dispatcherDetailStart = appSource.indexOf("function collectionDailyRouteDispatcherDetail");
const dispatcherDetailEnd = appSource.indexOf("function collectionDailyRoutesDispatcherPanel", dispatcherDetailStart);
const dispatcherDetailSource = appSource.slice(dispatcherDetailStart, dispatcherDetailEnd);
assert.ok(
  dispatcherDetailSource.includes('if (stationaryFieldTest) return "";'),
  "Detail stacionárního TESTU se má zobrazit pouze v odděleném tabletovém okně."
);
assert.ok(
  dispatcherDetailSource.indexOf("collectionRoutesTestGpsPanel(detail)") < dispatcherDetailSource.indexOf("collection-daily-route-table-wrap"),
  "GPS panel musí být i v běžném detailu před dlouhou tabulkou zastávek."
);

const tabletMapStart = appSource.indexOf("function collectionRoutesTestTabletMapPanel");
const tabletMapEnd = appSource.indexOf("function collectionDailyRouteDriverMapPanel", tabletMapStart);
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
