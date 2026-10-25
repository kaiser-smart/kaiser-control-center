import { modules } from "./modules.js";
import { hasPermission } from "../permissions.js";

export function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs").replace(/\s+/g, " ").trim();
}
export function matchesSearch(item, query) {
  const text = normalizeSearch([item.title, item.description, item.keywords, item.id].join(" "));
  return normalizeSearch(query).split(" ").filter(Boolean).every(word => text.includes(word));
}
const extraPages = [
  ["home", "Hlavní stránka", "/", "dashboard", "view", "HP úvod moduly"],
  ["absence-quick", "Nepřítomnost", "/dovolena-nemoc/rychle-zadani", "absence", "create", "dovolená nemoc lékař OČR volno"],
  ["absence-my", "Moje žádosti", "/dovolena-nemoc/moje-zadosti", "absence"],
  ["absence-approval", "Žádosti ke schválení", "/dovolena-nemoc/ke-schvaleni", "absence", "approve"],
  ["absence-calendar", "Kalendář nepřítomností", "/dovolena-nemoc/kalendar", "absence"],
  ["absence-notifications", "Notifikace nepřítomností", "/dovolena-nemoc/notifikace", "absence"],
  ["absence-reports", "Reporty nepřítomností", "/dovolena-nemoc/reporty", "absence", "export"],
  ["absence-rules", "Pravidla a automatizace nepřítomností", "/dovolena-nemoc/pravidla-automatizace", "absence", "manage"],
  ["absence-settings", "Nastavení nepřítomností", "/dovolena-nemoc/nastaveni", "absence", "manage"],
  ["receivables-settings", "Nastavení pohledávek", "/pohledavky/settings", "receivables", "manage"],
  ["receivables-import", "Import faktur", "/pohledavky/import", "receivables", "manage"],
  ["feedback", "Připomínky a chyby", "/pripominky", "feedback", "view", "nahlásit problém podpora"]
].map(([id, title, route, moduleId, action = "view", keywords = ""]) => ({ id, title, route, moduleId, action, keywords, kind: "Stránka" }));
const aliases = { fleet: "auto auta vozový park SPZ registrační značka", "vehicle-tracking": "GPS mapa sledování", vistos: "kontakty zákazník", absence: "dovolená nemoc lékař OČR volno", receivables: "pohledávky faktura platby", "service-maintenance": "opravy údržba", costs: "PHM tankování ekonomika", "collection-routes": "svoz stanoviště nádoby" };
export function searchNavigation(user, query) {
  const catalog = modules.filter(item => item.active !== false && !item.disabled).flatMap(item => [
    { ...item, moduleId: item.id, kind: "Modul", keywords: aliases[item.id] || "" },
    ...(item.dashboardRoute ? [{ id: `${item.id}-dashboard`, title: `${item.title} – dashboard`, route: item.dashboardRoute, moduleId: item.id, kind: "Přehled" }] : [])
  ]).concat(extraPages);
  return catalog.filter(item => hasPermission(user, item.moduleId, item.action || "view") && matchesSearch(item, query))
    .sort((a, b) => Number(normalizeSearch(b.title).startsWith(normalizeSearch(query))) - Number(normalizeSearch(a.title).startsWith(normalizeSearch(query))) || a.title.localeCompare(b.title, "cs"))
    .map(({ id, title, description = "", route, moduleId, kind }) => ({ id, title, description, route, moduleId, kind }));
}
