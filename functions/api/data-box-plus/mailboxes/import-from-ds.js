import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  dataBoxPlusStoreErrorResponse,
  importDataBoxPlusCredentialsFromDataBox
} from "../../../_lib/data-box-plus-store.js";

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;

  try {
    return json(await importDataBoxPlusCredentialsFromDataBox(env, user));
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
