import { buildMeta } from "./buildMeta.js";

const UNKNOWN = "neuvedeno";

function valueOrUnknown(value, fallback = UNKNOWN) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export const versionInfo = {
  appName: "Smart odpady",
  version: valueOrUnknown(buildMeta.version, "v0.1.29"),
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
