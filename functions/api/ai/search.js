import { json, requireUserPermission } from "../../_lib/auth.js";
import { modules } from "../../../src/data/modules.js";
import { hasPermission } from "../../../src/permissions.js";
import { recordAiAction } from "../../_lib/ai-action-log-store.js";

const STATIC_PAGES = [
  { id: "home", title: "Hlavní stránka", route: "/", moduleId: "dashboard" },
  { id: "absence-quick", title: "Rychlé zadání dovolené a nemoci", route: "/dovolena-nemoc/rychle-zadani", moduleId: "absence" },
  { id: "absence-my", title: "Moje žádosti", route: "/dovolena-nemoc/moje-zadosti", moduleId: "absence" },
  { id: "absence-approval", title: "Žádosti ke schválení", route: "/dovolena-nemoc/ke-schvaleni", moduleId: "absence" },
  { id: "absence-calendar", title: "Kalendář nepřítomností", route: "/dovolena-nemoc/kalendar", moduleId: "absence" },
  { id: "feedback", title: "Připomínky", route: "/pripominky", moduleId: "feedback" }
];

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesQuery(item, query) {
  if (!query) {
    return true;
  }

  return normalize([
    item.title,
    item.description,
    item.route,
    item.id
  ].join(" ")).includes(query);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "dashboard", "view");

  if (response) {
    return response;
  }

  const url = new URL(request.url);
  const query = normalize(url.searchParams.get("q"));
  const visibleModules = modules
    .filter((moduleItem) => hasPermission(user, moduleItem.id, "view"))
    .filter((moduleItem) => matchesQuery(moduleItem, query))
    .map((moduleItem) => ({
      id: moduleItem.id,
      title: moduleItem.title,
      description: moduleItem.description,
      route: moduleItem.route,
      status: moduleItem.status
    }));

  const visiblePages = STATIC_PAGES
    .filter((page) => hasPermission(user, page.moduleId, "view"))
    .filter((page) => matchesQuery(page, query));

  const result = {
    query: url.searchParams.get("q") || "",
    modules: visibleModules,
    pages: visiblePages,
    records: [],
    apiStatus: "ready"
  };

  await recordAiAction(env, user, {
    assistantId: url.searchParams.get("assistant") || "",
    assistantName: url.searchParams.get("assistantName") || "",
    actionType: "search",
    toolName: "ai_search",
    input: { q: result.query },
    result: { modules: visibleModules.length, pages: visiblePages.length },
    status: "ok"
  });

  return json(result);
}

