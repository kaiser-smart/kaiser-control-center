import { json, requireUserPermission } from "./auth.js";
import { getModuleDatabase } from "./databases.js";
import { normalizeSearch } from "../../src/data/globalSearch.js";
import { hasPermission } from "../../src/permissions.js";
import { matchesSearch } from "../../src/data/globalSearch.js";
import { onRequestGet as vehicles } from "../api/vehicles.js";
import { onRequestGet as employees } from "../api/employees.js";
import { onRequestGet as reports } from "../api/driver-reports.js";
import { onRequestGet as messages } from "../api/data-box-plus/messages.js";
import { onRequestGet as feedback } from "../api/feedback-cases.js";

const part = value => encodeURIComponent(String(value || ""));
const join = (...values) => values.filter(Boolean).join(" · ");

async function receivableSearch({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "view");
  if (response) return response;
  const db = getModuleDatabase(env, { moduleName: "receivables-store", allowedDomains: ["core", "messages", "audit", "archive"], defaultDomain: "core", required: true });
  const query = new URL(request.url).searchParams.get("search") || "";
  // Static column expressions only; query words are always bound parameters.
  const fold = expression => {
    for (const letter of "áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ") expression = `replace(${expression}, '${letter}', '${normalizeSearch(letter)}')`;
    return `lower(${expression})`;
  };
  const words = normalizeSearch(query).split(" ").filter(Boolean).slice(0, 8);
  const patterns = words.map(word => `%${word.replace(/[\\%_]/g, "\\$&")}%`);
  const where = expression => words.map(() => `${fold(expression)} LIKE ? ESCAPE '\\'`).join(" AND ");
  const [customers, invoices] = await Promise.all([
    db.prepare(`SELECT id, company_name, ico FROM receivable_customers WHERE ${where("coalesce(company_name,'') || ' ' || coalesce(ico,'')")} ORDER BY company_name LIMIT 9`).bind(...patterns).all(),
    db.prepare(`SELECT i.id, i.customer_id, i.invoice_number, c.company_name FROM receivable_invoices i JOIN receivable_customers c ON c.id = i.customer_id WHERE ${where("coalesce(i.invoice_number,'') || ' ' || coalesce(c.company_name,'')")} ORDER BY i.due_date DESC LIMIT 9`).bind(...patterns).all()
  ]);
  return json({ items: [
    ...(customers.results || []).map(c => ({ id: `customer-${c.id}`, title: c.company_name, description: `Zákazník · IČO ${c.ico || "—"}`, route: `/pohledavky/customers/${part(c.id)}` })),
    ...(invoices.results || []).map(i => ({ id: `invoice-${i.id}`, title: `Faktura ${i.invoice_number}`, description: i.company_name, route: `/pohledavky/customers/${part(i.customer_id)}` }))
  ], apiStatus: "ready" });
}

// Reuse the normal read endpoints: their row-level visibility remains authoritative.
export const searchSources = [
  { id: "receivables", title: "Zákazníci a faktury", handler: receivableSearch, path: "/api/receivables/search", key: "items", queryKey: "search", map: item => item },
  { id: "fleet", title: "Vozidla", handler: vehicles, path: "/api/vehicles", key: "vehicles", map: v => ({ id: v.id, title: join(v.licensePlate, v.name || v.brand), description: join(v.model, v.assignedDriverName, v.vin), route: `/vozovy-park/${part(v.id)}` }) },
  { id: "absence", title: "Zaměstnanci", handler: employees, path: "/api/employees", key: "employees", map: e => ({ id: e.id || e.userId, title: e.fullName || e.name || join(e.firstName, e.lastName).replace(" · ", " "), description: join(e.position, e.department), route: `/zamestnanci/${part(e.id || e.userId)}` }) },
  { id: "driver-reports", title: "Hlášení z vozidel", handler: reports, path: "/api/driver-reports", key: "requests", queryKey: "search", map: r => ({ id: r.id, title: join(r.reportId, r.licensePlate), description: join(r.defectDescription, r.driverName), route: `/hlaseni-ridicu?request=${part(r.id)}` }) },
  { id: "data-box-plus", title: "Datové zprávy", handler: messages, path: "/api/data-box-plus/messages?limit=9", key: "messages", queryKey: "query", map: m => ({ id: m.id, title: m.subject, description: m.senderName || m.sender_name || "Datová zpráva", route: `/datove-schranky-plus?message=${part(m.id)}` }) },
  { id: "feedback", title: "Připomínky", handler: feedback, path: "/api/feedback-cases?limit=9", key: "cases", queryKey: "search", map: c => ({ id: c.id, title: c.title, description: c.description, route: `/pripominky/${part(c.id)}` }) }
];
export async function searchRecords(context, user, query, sources = searchSources) {
  const allowed = sources.filter(source => hasPermission(user, source.id, "view"));
  const results = await Promise.all(allowed.map(async source => {
    let timeout;
    try {
      const url = new URL(source.path, context.request.url);
      if (source.queryKey) url.searchParams.set(source.queryKey, query);
      const response = await Promise.race([
        source.handler({ ...context, request: new Request(url, { headers: context.request.headers }) }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("timeout")), 7000); })
      ]);
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json();
      if (payload.apiStatus === "waiting" || payload.apiStatus === "unavailable") throw new Error("unavailable");
      const records = (payload[source.key] || []).map(source.map).filter(item => item.id && item.title)
        .filter(item => source.queryKey || matchesSearch(item, query));
      return { records: records.slice(0, 8).map(item => ({ ...item, description: String(item.description || "").slice(0, 180), moduleId: source.id, kind: source.title })), more: records.length > 8 ? source.title : null };
    } catch {
      return { records: [], unavailable: source.title };
    } finally {
      clearTimeout(timeout);
    }
  }));
  return { records: results.flatMap(result => result.records), unavailable: results.flatMap(result => result.unavailable || []), more: results.flatMap(result => result.more || []) };
}
