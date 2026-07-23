import { json, requireUserPermission } from "../../../../../_lib/auth.js";
import {
  dataBoxPlusStoreErrorResponse,
  deleteDataBoxPlusDraftAttachment,
  getDataBoxPlusDraftAttachmentFile
} from "../../../../../_lib/data-box-plus-store.js";

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;
  try {
    const file = await getDataBoxPlusDraftAttachmentFile(env, params.id, params.attachmentId, user);
    return new Response(file.body, { headers: file.headers });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;
  try {
    return json({
      apiStatus: "ready",
      draft: await deleteDataBoxPlusDraftAttachment(env, params.id, params.attachmentId, user)
    });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
