import { json, requireUserPermission } from "../../../_lib/auth.js";
import { createFleetVistosVehiclePreview } from "../../../_lib/fleet-vistos-vehicle-preview.js";
import { fetchTcarsVehicles } from "../../../_lib/tcars-client.js";
import { buildTcarsPairingAuditPayload } from "../../../_lib/tcars-pairing-audit.js";

export async function onRequestGet({ request, env }) {
  const trackingAuth = await requireUserPermission(env, request, "vehicle-tracking", "view");
  if (trackingAuth.response) return trackingAuth.response;

  const fleetAuth = await requireUserPermission(env, request, "fleet", "view");
  if (fleetAuth.response) return fleetAuth.response;

  try {
    const [fleet, tcarsVehicles] = await Promise.all([
      createFleetVistosVehiclePreview(env),
      fetchTcarsVehicles(env, { activeOnly: true })
    ]);

    if (fleet.apiStatus !== "ready" && fleet.apiStatus !== "empty") {
      return json({
        apiStatus: "waiting",
        dataStatus: fleet.apiStatus || "waiting",
        readOnly: true,
        writesData: false,
        createsLinks: false,
        requiresManualConfirmation: true,
        summary: { total: 0, candidateRows: 0, unmatched: 0, ambiguous: 0, conflict: 0, readyToVerify: 0 },
        rows: [],
        message: fleet.message || "Audit párování čeká na dostupný seznam vozidel Vistos."
      }, 409);
    }

    return json(buildTcarsPairingAuditPayload(fleet.vehicles, tcarsVehicles));
  } catch (error) {
    console.error("tcars.pairing_audit_failed", {
      code: error?.code || "unknown",
      message: error?.message || "unknown"
    });
    return json({
      apiStatus: "waiting",
      dataStatus: "read_failed",
      readOnly: true,
      writesData: false,
      createsLinks: false,
      requiresManualConfirmation: true,
      summary: { total: 0, candidateRows: 0, unmatched: 0, ambiguous: 0, conflict: 0, readyToVerify: 0 },
      rows: [],
      errorCode: error?.code || "tcars_pairing_audit_failed",
      error: "Read-only audit párování se teď nepodařilo načíst."
    }, Number(error?.status) >= 400 ? Number(error.status) : 503);
  }
}
