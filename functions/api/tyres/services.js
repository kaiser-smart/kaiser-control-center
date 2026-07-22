import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import { createTyreServiceRecord, TyresStoreError } from "../../_lib/tyres-store.js";

function errorResponse(error) {
  if (error instanceof TyresStoreError) return json({ error: error.message, code: error.code }, error.status);
  console.error("tyres.service_failed", { message: error?.message });
  return json({ error: "Servisní záznam se teď nepodařilo uložit." }, 500);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "tyres", "edit");
  if (response) return response;
  try {
    return json({ service: await createTyreServiceRecord(env, user, await readJson(request)), apiStatus: "ready" }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
