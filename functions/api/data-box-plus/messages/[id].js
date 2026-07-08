import { json, requireUserPermission } from "../../../_lib/auth.js";
import { dataBoxPlusStoreErrorResponse, getDataBoxPlusMessage } from "../../../_lib/data-box-plus-store.js";

export async function onRequestGet({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "data-box-plus", "view");
  if (response) return response;

  try {
    return json({ apiStatus: "ready", message: await getDataBoxPlusMessage(env, params.id) });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
