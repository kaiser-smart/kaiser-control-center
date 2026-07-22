import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import { fitTyre, TyresStoreError } from "../../_lib/tyres-store.js";

function errorResponse(error) {
  if (error instanceof TyresStoreError) return json({ error: error.message, code: error.code }, error.status);
  console.error("tyres.fitment_failed", { message: error?.message });
  return json({ error: "Osazení pneumatiky se teď nepodařilo uložit." }, 500);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "tyres", "edit");
  if (response) return response;
  try {
    return json({ tyre: await fitTyre(env, user, await readJson(request)), apiStatus: "ready" });
  } catch (error) {
    return errorResponse(error);
  }
}
