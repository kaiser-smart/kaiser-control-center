import { json, requireUserPermission } from "../../../_lib/auth.js";
import { loadFleetTripJobPairingPreview } from "../../../_lib/fleet-trip-job-pairing.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "fleet", "view");
  if (response) return response;

  const url = new URL(request.url);
  try {
    return json(await loadFleetTripJobPairingPreview(env, {
      limit: url.searchParams.get("limit") || 200
    }));
  } catch (error) {
    console.error("fleet.trip_job_pairing_preview_failed", {
      code: String(error?.code || "fleet_trip_job_pairing_preview_failed"),
      message: String(error?.message || "unknown")
    });
    return json({
      error: "Náhled párování jízd se teď nepodařilo načíst.",
      code: String(error?.code || "fleet_trip_job_pairing_preview_failed"),
      phase: "read-only-pilot",
      dashboardActivationAllowed: false
    }, Number(error?.status || 503));
  }
}
