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
    value: "Funkční přes API",
    note: "Cloud API a D1 model s ručním read-only sync endpointem pro metadata ISDS."
  },
  {
    label: "Zdroj dat",
    value: "Cloudflare D1",
    note: "Metadata datových schránek, zpráv, příloh, AI výsledků a auditu."
  },
  {
    label: "ISDS napojení",
    value: "ruční read-only",
    note: "SOAP/WSDL adapter projde nastavené DS účty, čte pouze seznam obálek po ručním spuštění a až po nastavení secrets."
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
    description: "Backend adapter pro seznam přijatých/odeslaných obálek napříč nastavenými DS účty, deduplikace a ruční synchronizace metadat."
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

export const DATA_BOX_REALITY_ITEMS = [
  {
    label: "Co opravdu funguje",
    value: "Chráněné API + ruční sync",
    note: "Frontend čte stav, metadata zpráv a log běhů přes backend. Ruční sync zapíše log a po secrets načte jen ISDS obálky z nastavených DS účtů."
  },
  {
    label: "Co zatím nefunguje",
    value: "Bez secrets žádné ostré čtení",
    note: "Nestahují se přílohy ani obsah zpráv, neposílají se odpovědi a neběží automatická synchronizace."
  },
  {
    label: "Když nikdo neotevře aplikaci",
    value: "Nic se nespustí",
    note: "Modul zatím nemá worker, cron ani queue. Bez další fáze nevznikne žádný nový sync běh."
  },
  {
    label: "Když selže API",
    value: "Bezpečná chyba",
    note: "Frontend zobrazí chybu z backendu a nepředstírá lokálně uložená data."
  }
];

export const DATA_BOX_EXISTING_ENDPOINTS = [
  "GET /api/data-box/status",
  "GET /api/data-box/messages",
  "GET /api/data-box/messages/:id",
  "GET /api/data-box/sync-runs",
  "POST /api/data-box/sync"
];

export const DATA_BOX_FUTURE_ENDPOINTS = [
  "GET /api/data-box/messages/:id/attachments/:attachmentId",
  "POST /api/data-box/messages/:id/ai-evaluate",
  "POST /api/data-box/outbox/drafts",
  "POST /api/data-box/outbox/drafts/:id/approve"
];

export const DATA_BOX_EMPTY_MESSAGE_COLUMNS = [
  "Datum",
  "Směr",
  "Schránka",
  "Odesílatel / příjemce",
  "Předmět",
  "Stav",
  "Přílohy",
  "AI",
  "Akce"
];
