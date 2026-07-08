import { json, requireUserPermission } from "../../_lib/auth.js";
import { dataBoxPlusStoreErrorResponse, listDataBoxPlusRules } from "../../_lib/data-box-plus-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "data-box-plus", "view");
  if (response) return response;

  try {
    return json({ apiStatus: "ready", rules: await listDataBoxPlusRules(env) });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
