import { buildMeta } from "./buildMeta.js";

const UNKNOWN = "neuvedeno";

function valueOrUnknown(value, fallback = UNKNOWN) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export const versionInfo = {
  appName: "Smart odpady",
  version: valueOrUnknown(buildMeta.version, "v0.1.103"),
  status: "development",
  backupName: "Bod nula – Evidence pneumatik",
  backupNote: "Plně funkční původní aplikace evidence pneumatik.",
  tyreModuleStatus: "Hotovo – neměnit",
  branch: valueOrUnknown(buildMeta.branch),
  commit: valueOrUnknown(buildMeta.commit),
  backupDate: valueOrUnknown(buildMeta.backupDate)
};

export const versionNews = [
  {
    title: "Branding: firemni barevne schema",
    text: "Nastaveni vzhledu umi automatickou paletu z jedne firemni barvy i rucni doladeni vice barev pro budouci nasazeni aplikace u dalsich firem."
  },
  {
    title: "Datova schranka: cloud API zaklad",
    text: "Modul ma D1 model, chranene read-only API pro status, zpravy a log synchronizaci a UI cte stav z backendu bez ostreho ISDS napojeni."
  },
  {
    title: "Datová schránka: bezpečný pilot",
    text: "Nový modul Datová schránka je přidaný jako UI návrh pro admin/management, jasně ukazuje neaktivní ISDS integraci a připravuje pravidla, audit, API a cloud automatizace bez ostrých dat."
  },
  {
    title: "Pravidla a automatizace: audit cronu",
    text: "Fáze 2A zapisuje každé spuštění cloud runneru do samostatného run-level auditu, takže je vidět dry-run, skipped i chyba bez ostrých e-mailů/SMS."
  },
  {
    title: "Pravidla a automatizace: cloud dry-run",
    text: "Fáze 2A přidává Cloudflare Worker s Cron Triggerem, který zapisuje pouze dry-run běhy automatizací do D1 bez e-mailů, SMS a reálných akcí nad absencemi."
  },
  {
    title: "Dovolená / Nemoc: ostrá cloud pravidla",
    text: "Seznam pravidel a automatizace přechází z read-only návrhů na cloud DB, API, admin editaci a audit log změn."
  },
  {
    title: "Dovolená / Nemoc: kompaktnější tabulka pravidel",
    text: "Read-only pilot pravidel a automatizací má lehčí typografii tabulky, menší písmo a kompaktnější řádky bez změny logiky nebo API."
  },
  {
    title: "Dovolená / Nemoc: read-only vyhledávání pravidel",
    text: "Pilot Seznam pravidel a automatizace má aktivní lokální vyhledávání nad jasně označenými návrhy bez API volání, zápisu nebo editace."
  },
  {
    title: "Dovolená / Nemoc: přímá URL pilotu",
    text: "Záložka Seznam pravidel a automatizace má vlastní produkční routu a přímé otevření přes Cloudflare Pages nepadá na 404."
  },
  {
    title: "Dovolená / Nemoc: pilot pravidel a automatizací",
    text: "Projektová příručka zavádí povinnou záložku Seznam pravidel a automatizace a modul Dovolená / Nemoc má první bezpečný pilot čekající na cloud API."
  },
  {
    title: "Sledování vozidel: spolehlivější klik na T-Cars polohu",
    text: "Výběr markeru i položky seznamu používá úzký pointer handler, aby Google overlay ani layout nepohltily výběr vozidla."
  },
  {
    title: "Sledování vozidel: výběr z T-Cars seznamu",
    text: "Klik na položku v seznamu validních T-Cars poloh okamžitě vybere vozidlo, obnoví detail a zaostří Google mapu."
  },
  {
    title: "Sledování vozidel: čistší T-Cars marker",
    text: "Fallback jednotné ikony už nepřidává do markeru text, takže hlavní popisek zůstává značka/model nebo Vozidlo."
  },
  {
    title: "Sledování vozidel: mapa T-Cars přes celou šířku",
    text: "T-Cars Google mapa je v jednom sloupci nad seznamem, používá jednotný marker vozidla a má přirozené ovládání kolečkem myši."
  },
  {
    title: "Sledování vozidel: neplatné T-Cars polohy mimo mapu",
    text: "Neplatné T-Cars GPS záznamy se vždy zobrazí v samostatné sekci bez aktuální polohy a nepřimíchají se mezi validní Google markery."
  },
  {
    title: "Sledování vozidel: Google mapa T-Cars poloh",
    text: "T-Cars režim odděluje validní GPS polohy od neplatných, validní body zobrazuje nad Google mapou a vozidla bez použitelné polohy drží mimo mapu."
  },
  {
    title: "Sledování vozidel: T-Cars mapa poloh",
    text: "T-Cars režim zobrazuje read-only mapu aktuálních GPS poloh, PNG ikony vozidel, klikací marker a detail vybrané polohy bez zápisu do D1."
  },
  {
    title: "Sledování vozidel: PNG ikony vozidel",
    text: "Mapa vozidel používá dodané PNG ikony pro svozové vozidlo, kontejnerové vozidlo, dodávku, speciální techniku, osobní vozidlo a přívěs/návěs."
  },
  {
    title: "Sledování vozidel: specifikace ikon",
    text: "Modul má připravené mapování PNG/WebP ikon vozidel, CSS fallback marker KS a stavové obrysy pro Google mapu bez generování finálních assetů."
  },
  {
    title: "Vozový park: čitelnější T-Cars seznam",
    text: "Read-only seznam T-Cars vozidel ve Vozovém parku zobrazuje prázdné provozní hodnoty jako pomlčku místo technických hodnot."
  },
  {
    title: "Vozový park: T-Cars seznam read-only",
    text: "Seznam vozidel ve Vozovém parku umí zobrazit všechna vozidla načtená z T-Cars přes chráněné backend API bez zápisu do D1."
  },
  {
    title: "Sledování vozidel: read-only T-Cars SOAP",
    text: "Backend umí přes vlastní Smart odpady API read-only načíst seznam vozidel a aktuální polohy z T-Cars SOAP služby bez ukládání do D1 a bez volání T-Cars z frontendu."
  },
  {
    title: "Sledování vozidel: základ T-Cars režimu",
    text: "Modul rozlišuje demo a T-Cars režim, připravuje vlastní Smart odpady API pro T-Cars a ponechává Android tablet jako vozidlový terminál."
  },
  {
    title: "Sledování vozidel: SVG ikony na mapě",
    text: "Demo mapa používá dodaná SVG vozidla přímo jako mapové ikony v interní fallback mapě i v připraveném Google Maps overlay markeru."
  },
  {
    title: "Sledování vozidel: čitelnější demo mapa",
    text: "Demo mapa už nepřekrývá vozidla velkým hlášením o Google Maps klíči a k demo vozidlům jsou doplněné dodané SVG podklady."
  },
  {
    title: "Sledování vozidel: Google mapa demo",
    text: "Demo modul Sledování vozidel je připravený na Google Maps API key, má 50s smyčku se čtyřmi vozidly, odchylkou KS 204, alertem a bezpečným fallbackem bez bílé obrazovky."
  },
  {
    title: "Sledování vozidel: demo režim",
    text: "Modul Sledování vozidel má jasně označený demo režim s interní mapou, ukázkovými vozidly, pohybem po trasách, filtry, detailem a upozorněním, že nejde o reálná GPS data."
  },
  {
    title: "HP karta Vozový park bez vnitřního tlačítka",
    text: "Homepage karta Vozový park zůstává celá klikací, ale už neobsahuje samostatné tlačítko Otevřít modul."
  },
  {
    title: "Vozový park: oprava záložek",
    text: "Interní záložky Vozového parku mají vlastní handler, přepínají správné panely a nespouštějí úvodní promo video."
  },
  {
    title: "Vozový park: vlastní akce tlačítek",
    text: "Tlačítka ve Vozovém parku mají vlastní mapování akcí, otevírají správnou route nebo zobrazí jasný stav Čeká na API bez spuštění promo videa."
  },
  {
    title: "Sledování vozidel",
    text: "Nový samostatný modul Sledování vozidel připravuje mapový přehled, detail, dnešní trasu a historii jízd pro budoucí cloud GPS API bez lokálního ukládání a bez vymyšlených GPS dat."
  },
  {
    title: "Detail Vozového parku přes Pages Function",
    text: "Produkční detailové odkazy /vozovy-park/:vehicleId mají vlastní Cloudflare Pages Function fallback na aplikaci, aby přímé otevření nevracelo 404."
  },
  {
    title: "Detail Vozového parku bez 404",
    text: "Přímé produkční odkazy na detail vozidla pod /vozovy-park/ se vrací do aplikace přes Cloudflare Pages fallback místo 404."
  },
  {
    title: "Vozový park připravený na API",
    text: "Modul Vozový park má dashboard, seznam, detail vozidla, termíny, závady, servisní historii, dokumenty a číselníky připravené pro chráněné cloud API bez lokálního ukládání provozních dat."
  },
  {
    title: "Vozový park import preview",
    text: "Modul Vozový park má chráněný náhled ručního Vistos exportu s mapováním sloupců a kontrolou duplicit bez automatické synchronizace a bez zápisu do databáze."
  },
  {
    title: "Pneumatiky pod Kaiser Smart",
    text: "Modul Pneumatiky otevírá hotovou evidenci na nové adrese organizace kaiser-smart bez zásahu do funkční aplikace pneumatik."
  },
  {
    title: "PDF žádost o zdravotní způsobilost",
    text: "Karta zaměstnance má chráněnou tiskovou šablonu žádosti o posouzení zdravotní způsobilosti k práci s údaji zaměstnance, kategorií prohlídky a auditovaným exportem."
  },
  {
    title: "Lékařské prohlídky v kartě zaměstnance",
    text: "Karta zaměstnance má chráněnou evidenci pracovnělékařských prohlídek, výpočet dalšího termínu a backendové upozornění na blížící se nebo prošlé prohlídky."
  },
  {
    title: "Co je nového e-mailem",
    text: "Backend umí po zápisu novinky poslat stejný text druhé straně přes schválený Opluštil e-mail a zapsat výsledek do Notifikací."
  },
  {
    title: "Šarlota vždy posílá úvodní proměnnou",
    text: "ElevenLabs session má vždy vyplněné intro_announcement, takže WebSocket nespadne na chybějící required dynamic variable."
  },
  {
    title: "Šarlota rozlišuje nepovolený mikrofon",
    text: "Hlasový panel už při blokovaném mikrofonu neukazuje odpojený ElevenLabs agent, ale jasný stav Mikrofon není povolený."
  },
  {
    title: "Čitelnější chyba mikrofonu Šarloty",
    text: "Hlasový panel Šarloty má kompaktnější nápovědu při odpojeném mikrofonu a ukáže bezpečný důvod zavření hlasového spojení."
  },
  {
    title: "Promo video Šarloty nahlas",
    text: "Promo video Šarloty se po každém načtení pokusí odtlumit a nastavit hlasitost přehrávání na maximum bez lokálního ukládání."
  },
  {
    title: "Stabilnější okno Šarloty",
    text: "Promo okno Šarloty už nepřekrývá běžné welcome okno, video není po načtení vynuceně ztlumené a hlasový panel ukazuje jasnější návod při přerušeném spojení."
  },
  {
    title: "Promo Šarloty s fallbackem",
    text: "Pokud prohlížeč nebo síť zablokuje ověření promo API, přihlášenému uživateli se video Šarloty do 30. 6. 2026 zobrazí i tak."
  },
  {
    title: "Spolehlivější promo Šarloty",
    text: "Promo modal Šarloty používá novou neblokovanou API cestu, aby se video zobrazilo i tam, kde klient blokuje původní /api/ai/promo volání."
  },
  {
    title: "Promo Šarloty bez denního blokování",
    text: "Promo modal Šarloty se do 30. 6. 2026 zobrazí podle aktivního období a jeho zobrazení už nezávisí na zápisu denní akce shown."
  },
  {
    title: "Promo Šarloty do konce června",
    text: "Promo video Šarloty se do 30. 6. 2026 už neblokuje denním zobrazením; volby se dál zapisují jen přes cloudový audit."
  },
  {
    title: "Přirozenější pozdrav Šarloty",
    text: "Šarlota používá přesnější denní pozdrav podle času v Praze, takže dopoledne už neříká Dobré ráno a drží kratší tykací úvod."
  },
  {
    title: "Nová připomínka ve správě",
    text: "Admin a management mohou v modulu Připomínky založit novou připomínku přes samostatné cloud API bez změny běžného odesílání připomínek z modulů."
  },
  {
    title: "Hotovo připomínky e-mailem",
    text: "Při přepnutí připomínky na Hotovo odešle backend autorovi e-mail se stručnou zprávou, co bylo vyřešeno, a zapíše výsledek do Notifikací."
  },
  {
    title: "Lékař v hodinách",
    text: "Modul Dovolená / Nemoc umí u typu Lékař zadat datum, čas od/do a zobrazit přesný hodinový rozsah bez změny ostatních typů absencí."
  },
  {
    title: "Oprava startu mikrofonu Šarloty",
    text: "Hlasový režim už nezůstane viset na Připojuji, pokud prohlížeč nevrátí oprávnění mikrofonu nebo přípravu zvuku včas."
  },
  {
    title: "Denní promo video Šarloty",
    text: "Aplikace umí do 30. 6. 2026 zobrazit přihlášenému uživateli video Šarloty s volbou rovnou spustit hlasový režim."
  },
  {
    title: "Osobní uvítání Šarloty",
    text: "ElevenLabs session dostává křestní jméno a bezpečný pozdrav podle denní doby, aby Šarlota mohla začít hovor osobně."
  },
  {
    title: "Šarlota zná přihlášeného uživatele",
    text: "ElevenLabs session dostává bezpečný kontext aktuálního přihlášeného uživatele, jeho role, dostupných modulů a oprávnění bez citlivých údajů."
  },
  {
    title: "Šarlota pro zaměstnance",
    text: "AI asistentka Šarlota má read-only nástroje pro vyhledání zaměstnance, otevření karty, zjištění nadřízeného a souhrn role nebo oprávnění přes bezpečné cloud API."
  },
  {
    title: "Displej během hovoru se Šarlotou",
    text: "Hlasový režim Šarloty během aktivního hovoru používá Screen Wake Lock, pokud ho prohlížeč podporuje, a bezpečně ho uvolní po ukončení."
  },
  {
    title: "Nový mikrofon Šarloty",
    text: "Hlasový panel používá dodaný PNG mikrofon v app-like stylu, jemnější stavové animace a bezpečnou haptickou odezvu tam, kde ji prohlížeč podporuje."
  },
  {
    title: "Šarlota drží hovor při navigaci",
    text: "Hlasová relace Šarloty se při otevření modulu přes AI už neukončí a zůstane viditelná v persistentním stavovém docku."
  },
  {
    title: "Mobilní Šarlota jako appka",
    text: "Hlasový panel Šarloty má mobil-first rozložení, jasné stavy mikrofonu, obnovu odpojeného spojení a bezpečně nastavené mikrofonní audio."
  },
  {
    title: "Stabilnější hlas Šarloty",
    text: "Hlasový režim drží ElevenLabs session otevřenou po odpovědi, jasně ukazuje stav mikrofonu a používá maximální zesílení výstupu s limiterem."
  },
  {
    title: "Hlasitější Šarlota",
    text: "Přehrávání ElevenLabs hlasu Šarloty má zesílený mobilní výstup, aby odpověď nebyla na telefonu příliš potichu."
  },
  {
    title: "Mobilní zvuk Šarloty",
    text: "Hlasový režim Šarloty odemyká mobilní audio a přehrává ElevenLabs zvukovou odpověď z WebSocket audio streamu."
  },
  {
    title: "Nové ElevenLabs spojení pro Šarlotu",
    text: "Textový režim Šarloty nově zavírá starou session a používá čisté ElevenLabs Chat Mode spojení se čtením běžných i streamovaných odpovědí."
  },
  {
    title: "Šarlota textem bez mikrofonu",
    text: "AI asistentka Šarlota má textový diagnostický režim přes ElevenLabs Chat Mode, aby šla ověřit bez mikrofonního oprávnění."
  },
  {
    title: "Šarlota v prémiovém hlasovém režimu",
    text: "Hlasová Smart asistentka Šarlota má jednotnou mobilní obrazovku bez Marka, s novým mikrofonem, jemnější typografií a app-like rozložením pro iPhone."
  },
  {
    title: "Responzivita Smart pomocníka",
    text: "Hlasový panel Šarloty má mobilní zobrazení přes celou obrazovku, vlastní scroll, kompaktnější prvky a stabilnější překreslování bez problikávání."
  },
  {
    title: "AI Smart pomocník",
    text: "Připravená fáze 1 pro ElevenLabs asistentku Šarlotu: bezpečné client tools a cloudové AI API endpointy."
  },
  {
    title: "Reporty a moduly",
    text: "Notifikace zobrazují v tabulce krátký souhrn jen u neodeslaných zpráv a modulové štítky jsou sjednocené na Nový, Rozpracováno a Hotovo."
  },
  {
    title: "Smart pomocník",
    text: "Uvítací okno pomocníka zůstává dostupné, ale při dočtení dat v modulech už znovu nespouští vstupní animaci."
  },
  {
    title: "Dovolená / Nemoc zdroj dat",
    text: "Seed data byla odstraněná z modulu Dovolená / Nemoc, nastavení reportu se ukládá přes cloud API a hluboké routy jsou připravené v buildu."
  },
  {
    title: "Notifikace v Reportech",
    text: "Zápisy v tabulce notifikací mají jemnější netučné písmo pro klidnější čtení."
  },
  {
    title: "Nová žádost Dovolená / Nemoc",
    text: "Výběr zaměstnance v nové žádosti používá úplný cloudový seznam zaměstnanců."
  },
  {
    title: "SMS notifikace",
    text: "Produkční SMS notifikace jsou napojené na Twilio Messaging Service se SMS číslem pro provozní zprávy."
  },
  {
    title: "Centrální notifikace",
    text: "Modul Reporty má centrální přehled e-mailů a SMS napříč aplikací se souhrnem, filtry, detailem a exportem CSV."
  },
  {
    title: "Schvalování Dovolená / Nemoc",
    text: "Hláška u e-mailu a SMS nově rozlišuje chybějící kontakt příjemce od chybějící produkční konfigurace odesílání."
  },
  {
    title: "Schvalování Dovolená / Nemoc",
    text: "Chybová hláška u SMS/e-mailu nově ukáže konkrétního příjemce, kterému chybí telefon nebo e-mail."
  },
  {
    title: "Hlasový pomocník",
    text: "Po klepnutí na mikrofon se spustí ukázková 30s česká zvuková komunikace AI a uživatele Kaiser smart s animovaným obrázkem."
  },
  {
    title: "Schvalování Dovolená / Nemoc",
    text: "Žádosti mají cloudový schvalovací workflow, historii, e-mail nadřízenému, SMS zaměstnanci a logování notifikací."
  },
  {
    title: "Hlasový pomocník",
    text: "Hlasový panel používá nový PNG mikrofon a jemnější texty Hlasový pomocník a Zažij hlasovou interakci."
  },
  {
    title: "Smart pomocník",
    text: "Hlasový režim má nový referenční bílý panel s velkým zeleným mikrofonem bez textového inputu."
  },
  {
    title: "E-mailové šablony",
    text: "Projekt má základní HTML šablonu Smart odpady / Kaiser a konkrétní šablonu pro ověřovací kód."
  },
  {
    title: "Smart pomocník",
    text: "Mobilní hlasový pomocník má nový čistý fullscreen vzhled, kompaktní hlavičku, výrazný mikrofon a texty v tykání."
  },
  {
    title: "Dovolená / Nemoc",
    text: "Navigace z Rychlého zadání nově otevírá skutečné podstránky modulu a nezůstává zamrzlá na rychlém zadání."
  },
  {
    title: "Smart pomocník",
    text: "Vstupní okno, textový chat a hlasový režim mají nový prémiový vzhled bez napojení na externí AI API."
  },
  {
    title: "Rychlé zadání",
    text: "Klik na HP box Rychlé zadání otevře formulář přímo u otázky Co potřebujete nahlásit."
  },
  {
    title: "Smart pomocník",
    text: "Aplikace má první testovací UI pomocníka s textovým chatem, hlasovým ovládáním přes prohlížeč a bez ukládání konverzace."
  },
  {
    title: "Rychlé zadání na HP",
    text: "Na hlavní stránce je nový první box Rychlé zadání pro dovolenou, nemoc nebo lékaře přímo z mobilu."
  },
  {
    title: "Připomínky",
    text: "Modul Připomínky má kompaktní karty, přehledné filtry a ukládání stavu i interní poznámky přes cloud API."
  },
  {
    title: "Schvalování dovolené",
    text: "Box Žádosti čekající na schválení je na dashboardu Dovolená / Nemoc zobrazený přes celou šířku."
  },
  {
    title: "Vyhledávání uživatelů",
    text: "Přehled uživatelů má jednoduché vyhledávání podle jména, kontaktu, role, stavu a nadřízeného."
  },
  {
    title: "Rychlé zadání",
    text: "Dovolená / Nemoc má jednoduchý mobilní režim pro vlastní žádost přes cloudové API."
  },
  {
    title: "Neuložené změny",
    text: "Karta zaměstnance už upozorní jen při skutečné změně hodnot a po chybě API nechá rozpracovaná data ve formuláři."
  },
  {
    title: "Upload dokumentů",
    text: "Karta zaměstnance umí nahrávat a stahovat dokumenty přes cloudové API, D1 metadata a Cloudflare R2 úložiště."
  },
  {
    title: "Karta zaměstnance",
    text: "V modulu Dovolená / Nemoc je přidaná zaměstnanecká karta s údaji, dovolenou, absencemi, nadřízeným, historií a dokumenty přes cloud API."
  },
  {
    title: "Vzhled jen pro moduly",
    text: "Nastavení vzhledu je oddělené od HP a mění pouze vnitřní modulové obrazovky."
  },
  {
    title: "Nadřízený u uživatelů",
    text: "Správa uživatelů má nový sloupec Nadřízený s okamžitým ukládáním přes cloud API."
  },
  {
    title: "Ochrana neuložených změn",
    text: "Správa uživatelů upozorní při odchodu z rozpracovaných změn a ukládá jen přes cloud API."
  },
  {
    title: "Uživatelé přes D1",
    text: "Správa uživatelů je připravená na ukládání přes Cloudflare D1 a serverové API."
  },
  {
    title: "Nový název aplikace",
    text: "Aplikace je sjednocená pod názvem Smart odpady."
  },
  {
    title: "Provozní přehled",
    text: "Na HP je přidaný kompaktní přehled verze, zálohy, branche a commitu."
  },
  {
    title: "Přihlášení a role",
    text: "Připravené passwordless přihlášení, role a seznam povolených uživatelů."
  },
  {
    title: "Pneumatiky",
    text: "Hotový modul zůstává napojený jako samostatná externí aplikace."
  }
];

export function versionStatusText(status) {
  return status === "stable" ? "Stabilní build" : "Vývojová verze";
}

export function versionStatusBadge(status) {
  return status === "stable" ? "STABILNÍ" : "VÝVOJ";
}
