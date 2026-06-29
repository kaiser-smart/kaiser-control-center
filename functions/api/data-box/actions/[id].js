import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { dataBoxActionErrorResponse, updateDataBoxActionDraft } from "../../../_lib/data-box-actions-store.js";

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "data-box", "manage");
  if (response) return response;

  try {
    const result = await updateDataBoxActionDraft(env, params.id, await readJson(request), user);
    return json(result);
  } catch (error) {
    const result = dataBoxActionErrorResponse(error);
    return json(result.payload, result.status);
  }
}
