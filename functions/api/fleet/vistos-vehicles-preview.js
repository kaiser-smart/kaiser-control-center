import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  createFleetVistosVehiclePreview,
  fleetVistosVehiclePreviewError
} from "../../_lib/fleet-vistos-vehicle-preview.js";

export async function onRequestPost({ request, env }) {
  const { response } = await requireUserPermission(env, request, "fleet", "edit");

  if (response) {
    return response;
  }

  try {
    const preview = await createFleetVistosVehiclePreview(env);
    return json({ preview, apiStatus: preview.apiStatus || "ready" });
  } catch (error) {
    const { payload, status } = fleetVistosVehiclePreviewError(error);
    return json(payload, status);
  }
}
