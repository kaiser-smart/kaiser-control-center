export const DATA_BOX_MODULE_KEY = "data-box";
export const DATA_BOX_ROUTE = "/datova-schranka";

export const DATA_BOX_TABS = [
  { id: "overview", label: "Přehled" },
  { id: "received", label: "Přijaté zprávy" },
  { id: "sent", label: "Odeslané zprávy" },
  { id: "ai", label: "AI vyhodnocení" },
  { id: "rules", label: "Seznam pravidel a automatizace" }
];

export const DATA_BOX_STATUS_CARDS = [
  {
    label: "Stav funkce",
    value: "Funkcni pres API",
    note: "Cloud API a D1 model bez ostreho cteni, zapisu nebo odesilani do ISDS."
  },
  {
    label: "Zdroj dat",
    value: "Cloudflare D1",
    note: "Metadata datovych schranek, zprav, priloh, AI vysledku a auditu."
  },
  {
    label: "ISDS napojení",
    value: "neaktivní",
    note: "SOAP/WSDL adapter bude až v další fázi."
  },
  {
    label: "Oprávnění",
    value: "admin / management",
    note: "Frontend i backend permission model nepouští běžné role."
  }
];

export const DATA_BOX_PHASES = [
  {
    title: "Fáze 1",
    status: "UI návrh",
    description: "Bezpečný modulový shell, prázdné seznamy, stav integrace a pravidla bez ISDS secrets."
  },
  {
    title: "Fáze 2",
    status: "Funkční přes API",
    description: "D1 tabulky, R2 přílohy, audit log a interní API pro metadata zpráv."
  },
  {
    title: "Fáze 3",
    status: "Read-only pilot",
    description: "Backend adapter pro přijaté/odeslané zprávy, deduplikace a ruční synchronizace."
  },
  {
    title: "Fáze 4",
    status: "Cloud automatizace",
    description: "Cron/Queue runner pro pravidelný sync, log běhů a bezpečné opakování."
  },
  {
    title: "Fáze 5",
    status: "Produkčně ověřeno",
    description: "Ostré ověření ISDS účtu, monitoring, provozní alerty a potvrzené odesílání."
  }
];

export const DATA_BOX_INTEGRATION_POINTS = [
  ["Rozhraní", "ISDS SOAP/WSDL přes backend adapter, nikdy z frontendu."],
  ["Metadata", "Cloudflare D1 tabulky pro schránky, zprávy, stavy, AI výsledek a audit."],
  ["Přílohy", "Cloudflare R2 pro soubory s vazbou na D1 metadata."],
  ["Automatizace", "Cloudflare Worker/Cron nebo Queue podle ověřené kompatibility ISDS."],
  ["Bezpečnost", "Secrets pouze v Cloudflare, žádné tokeny ani certifikáty v repozitáři."]
];

export const DATA_BOX_PLANNED_ENDPOINTS = [
  "GET /api/data-box/status",
  "GET /api/data-box/messages",
  "GET /api/data-box/messages/:id",
  "GET /api/data-box/sync-runs",
  "POST /api/data-box/sync",
  "GET /api/data-box/messages/:id/attachments/:attachmentId",
  "POST /api/data-box/messages/:id/ai-evaluate",
  "POST /api/data-box/outbox/drafts",
  "POST /api/data-box/outbox/drafts/:id/approve"
];

export const DATA_BOX_EMPTY_MESSAGE_COLUMNS = [
  "Datum",
  "Směr",
  "Odesílatel / příjemce",
  "Předmět",
  "Stav",
  "Přílohy",
  "AI",
  "Akce"
];
