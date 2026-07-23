import { json, readJson, requireUserPermission } from "../../../../_lib/auth.js";
import { dataBoxPlusStoreErrorResponse, sendDataBoxPlusReply } from "../../../../_lib/data-box-plus-store.js";

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;
  try {
    return json(await sendDataBoxPlusReply(env, params.id, await readJson(request), user));
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
