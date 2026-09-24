import { json, requireUserPermission } from "../../../../_lib/auth.js";
import {
  dataBoxPlusStoreErrorResponse,
  testDataBoxPlusMailboxConnection
} from "../../../../_lib/data-box-plus-store.js";

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;

  try {
    return json(await testDataBoxPlusMailboxConnection(env, params?.id, user));
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    if (["data_box_isds_auth_failed", "data_box_isds_access_denied"].includes(result.payload.code)) {
      return json({ ...result.payload, status: "error" });
    }
    return json(result.payload, result.status);
  }
}
