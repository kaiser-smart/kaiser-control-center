import { json, readJson, requireUserPermission } from "../../../../_lib/auth.js";
import { dataBoxPlusStoreErrorResponse, executeDataBoxPlusMessageInstruction } from "../../../../_lib/data-box-plus-store.js";

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;

  try {
    return json(await executeDataBoxPlusMessageInstruction(env, params.id, user, await readJson(request)));
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
