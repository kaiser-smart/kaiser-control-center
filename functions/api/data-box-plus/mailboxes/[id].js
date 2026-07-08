import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  dataBoxPlusStoreErrorResponse,
  saveDataBoxPlusMailbox
} from "../../../_lib/data-box-plus-store.js";

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;

  try {
    const body = await readJson(request);
    return json(await saveDataBoxPlusMailbox(env, user, {
      ...body,
      id: params?.id || body.id
    }));
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
