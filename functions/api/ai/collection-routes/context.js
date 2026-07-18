import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  buildCollectionRoutesSarlotaContext,
  CollectionRoutesSarlotaContextError
} from "../../../_lib/collection-routes-sarlota-context.js";
import { recordAiAction } from "../../../_lib/ai-action-log-store.js";

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) return response;
  const url = new URL(request.url);
  try {
    const context = await buildCollectionRoutesSarlotaContext(env, user, {
      scope: url.searchParams.get("scope"),
      date: url.searchParams.get("date")
    });
    await recordAiAction(env, user, {
      assistantId: "sarlota",
      assistantName: "Šarlota",
      actionType: "read",
      toolName: "collection_routes_context",
      input: { scope: context.scope, date: context.date },
      result: {
        routeAssigned: context.route.assigned,
        routeCanStart: context.readiness.canStart,
        routeBlockerCount: context.readiness.blockers.length,
        routeWarningCount: context.readiness.warnings.length,
        crewVerified: context.crew.verified,
        assignedVehicleStatus: context.vehicle.status,
        vehiclesVerified: context.vehicles.verified,
        directoryCount: context.directory.length,
        memoryConsent: context.memory.consent,
        weatherStatus: context.weather.status,
        weatherHazardCount: Array.isArray(context.weather.hazards) ? context.weather.hazards.length : 0,
        newsStatus: context.news.status,
        newsItemCount: context.news.items.length
      },
      status: "ok"
    });
    return json({ context, apiStatus: "ready" });
  } catch (error) {
    if (!(error instanceof CollectionRoutesSarlotaContextError)) {
      console.error("collection_routes_sarlota.context_failed", { message: error.message });
    }
    return json({
      error: error.message || "Kontext Šarloty se teď nepodařilo načíst.",
      code: error.code || "collection_routes_sarlota_context_failed",
      apiStatus: "waiting"
    }, Number(error.status || 500));
  }
}
