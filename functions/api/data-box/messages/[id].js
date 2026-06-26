import { json, requireUserPermission } from "../../../_lib/auth.js";
import { dataBoxApiStatus, dataBoxStoreErrorResponse, getDataBoxMessage } from "../../../_lib/data-box-store.js";

export async function onRequestGet({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "data-box", "view");
  if (response) return response;

  try {
    const message = await getDataBoxMessage(env, params.id);
    return json({ message, apiStatus: dataBoxApiStatus(env) });
  } catch (error) {
    const result = dataBoxStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
