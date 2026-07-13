import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import { dataBoxPlusStoreErrorResponse, getDataBoxPlusChatSettings, saveDataBoxPlusChatSettings } from "../../_lib/data-box-plus-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "data-box-plus", "view");
  if (response) return response;
  try { return json(await getDataBoxPlusChatSettings(env)); } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error); return json(result.payload, result.status);
  }
}

export async function onRequestPut({ request, env }) {
  const { response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;
  try { return json(await saveDataBoxPlusChatSettings(env, await readJson(request))); } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error); return json(result.payload, result.status);
  }
}
