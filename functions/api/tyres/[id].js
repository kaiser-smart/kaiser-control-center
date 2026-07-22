import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import { TyresStoreError, updateTyre } from "../../_lib/tyres-store.js";

function errorResponse(error) {
  if (error instanceof TyresStoreError) return json({ error: error.message, code: error.code }, error.status);
  console.error("tyres.item_failed", { message: error?.message });
  return json({ error: "Pneumatiku se teď nepodařilo upravit." }, 500);
}

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "tyres", "edit");
  if (response) return response;
  try {
    return json({ tyre: await updateTyre(env, user, params.id, await readJson(request)), apiStatus: "ready" });
  } catch (error) {
    return errorResponse(error);
  }
}
