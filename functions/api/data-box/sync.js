import { json, requireUserPermission } from "../../_lib/auth.js";
import { dataBoxStoreErrorResponse, runDataBoxManualSync } from "../../_lib/data-box-store.js";

function canRunDataBoxSync(user) {
  return ["admin", "management"].includes(String(user?.role || "").trim().toLowerCase());
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "data-box", "manage");
  if (response) return response;

  if (!canRunDataBoxSync(user)) {
    return json({ error: "Nemate opravneni spustit synchronizaci Datove schranky." }, 403);
  }

  try {
    return json(await runDataBoxManualSync(env, user));
  } catch (error) {
    const result = dataBoxStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
