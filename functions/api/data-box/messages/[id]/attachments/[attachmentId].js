import { json, requireUserPermission } from "../../../../../_lib/auth.js";
import { dataBoxStoreErrorResponse, getDataBoxAttachmentFile } from "../../../../../_lib/data-box-store.js";

export async function onRequestGet({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "data-box", "view");
  if (response) return response;

  try {
    const file = await getDataBoxAttachmentFile(env, params.id, params.attachmentId);
    return new Response(file.body, {
      headers: file.headers
    });
  } catch (error) {
    const result = dataBoxStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
