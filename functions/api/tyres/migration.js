import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import { importLegacyTyres, TyresStoreError } from "../../_lib/tyres-store.js";

function errorResponse(error) {
  if (error instanceof TyresStoreError) return json({ error: error.message, code: error.code }, error.status);
  console.error("tyres.migration_failed", { message: error?.message });
  return json({ error: "Převod Pneumatik se teď nepodařilo dokončit." }, 500);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "tyres", "manage");
  if (response) return response;
  try {
    return json({ migration: await importLegacyTyres(env, user, await readJson(request)), apiStatus: "ready" }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
