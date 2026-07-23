import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  dataBoxPlusStoreErrorResponse,
  deleteDataBoxPlusDraft,
  saveDataBoxPlusDraft
} from "../../../_lib/data-box-plus-store.js";

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;
  try {
    return json({
      apiStatus: "ready",
      draft: await saveDataBoxPlusDraft(env, user, { ...(await readJson(request)), id: params.id })
    });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;
  try {
    return json({ apiStatus: "ready", ...(await deleteDataBoxPlusDraft(env, params.id, user)) });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
