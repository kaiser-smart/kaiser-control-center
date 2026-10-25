import { json, requireUserPermission } from "../../_lib/auth.js";
import { searchNavigation } from "../../../src/data/globalSearch.js";
import { recordAiAction } from "../../_lib/ai-action-log-store.js";
import { searchRecords } from "../../_lib/global-search-store.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const { user, response } = await requireUserPermission(env, request, "dashboard", "view");
  if (response) return response;
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const navigation = searchNavigation(user, query);
  const data = query.length >= 2 && url.searchParams.get("records") === "1"
    ? await searchRecords(context, user, query)
    : { records: [], unavailable: [], more: [] };
  if (url.searchParams.get("records") !== "1") {
    await recordAiAction(env, user, { assistantId: url.searchParams.get("assistant") || "", assistantName: url.searchParams.get("assistantName") || "", actionType: "search", toolName: "ai_search", input: { q: query }, result: { count: navigation.length }, status: "ok" });
  }
  return json({ query, modules: navigation.filter(item => item.kind === "Modul"), pages: navigation.filter(item => item.kind !== "Modul"), ...data, apiStatus: data.unavailable.length ? "partial" : "ready" });
}
