import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { applyDataBoxPlusBulkAction, dataBoxPlusStoreErrorResponse } from "../../../_lib/data-box-plus-store.js";

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;
  try {
    return json({ apiStatus: "ready", ...(await applyDataBoxPlusBulkAction(env, user, await readJson(request))) });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
