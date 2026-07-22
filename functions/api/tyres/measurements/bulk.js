import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { createTyreMeasurements, TyresStoreError } from "../../../_lib/tyres-store.js";

function errorResponse(error) {
  if (error instanceof TyresStoreError) return json({ error: error.message, code: error.code }, error.status);
  console.error("tyres.measurements_bulk_failed", { message: error?.message });
  return json({ error: "Hromadné měření se teď nepodařilo uložit." }, 500);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "tyres", "edit");
  if (response) return response;
  try {
    const payload = await readJson(request);
    const measurements = await createTyreMeasurements(env, user, payload?.measurements);
    return json({ measurements, apiStatus: "ready" }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
