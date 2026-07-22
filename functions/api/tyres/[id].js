import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import { getTyreDetail, TyresStoreError, updateTyre } from "../../_lib/tyres-store.js";

function errorResponse(error) {
  if (error instanceof TyresStoreError) return json({ error: error.message, code: error.code }, error.status);
  console.error("tyres.item_failed", { message: error?.message });
  return json({ error: "Pneumatiku se teď nepodařilo načíst nebo upravit." }, 500);
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

export async function onRequestGet({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "tyres", "view");
  if (response) return response;
  try {
    return json(await getTyreDetail(env, params.id));
  } catch (error) {
    return errorResponse(error);
  }
}
