import { json, requireUserPermission } from "../../../_lib/auth.js";
import { getOrwiiFuelAnalytics, OrwiiFuelStoreError } from "../../../_lib/orwii-fuel-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "fleet", "view");
  if (response) return response;
  try {
    const period = new URL(request.url).searchParams.get("period") || "30d";
    return json(await getOrwiiFuelAnalytics(env, { period }));
  } catch (error) {
    if (error instanceof OrwiiFuelStoreError) {
      return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
    }
    console.error("fleet.orwii_analytics_failed", { message: error?.message });
    return json({ error: "Statistiky tankování se nepodařilo načíst.", apiStatus: "waiting" }, 500);
  }
}
