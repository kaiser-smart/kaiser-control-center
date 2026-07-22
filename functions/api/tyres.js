import { json, readJson, requireUserPermission } from "../_lib/auth.js";
import {
  createTyre,
  getTyresDashboard,
  getTyresHistory,
  getTyresOverview,
  getTyresSettings,
  getTyresVehicleDetail,
  getTyresVehicles,
  listTyres,
  TyresStoreError
} from "../_lib/tyres-store.js";

function errorResponse(error) {
  if (error instanceof TyresStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("tyres.api_failed", { message: error?.message });
  return json({ error: "Pneumatiky se teď nepodařilo zpracovat.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "tyres", "view");
  if (response) return response;
  try {
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "";
    const query = Object.fromEntries(url.searchParams.entries());
    if (view === "overview") return json(await getTyresOverview(env));
    if (view === "inventory") return json(await listTyres(env, query));
    if (view === "vehicles") return json({ apiStatus: "ready", vehicles: await getTyresVehicles(env) });
    if (view === "vehicle") return json(await getTyresVehicleDetail(env, url.searchParams.get("vehicle")));
    if (view === "history") return json(await getTyresHistory(env, query));
    if (view === "settings") return json(await getTyresSettings(env));
    return json(await getTyresDashboard(env));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "tyres", "edit");
  if (response) return response;
  try {
    return json({ tyre: await createTyre(env, user, await readJson(request)), apiStatus: "ready" }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
