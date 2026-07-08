import { json, requireUserPermission } from "../../../../../_lib/auth.js";
import { dataBoxPlusStoreErrorResponse, getDataBoxPlusAttachmentFile } from "../../../../../_lib/data-box-plus-store.js";

export async function onRequestGet({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "data-box-plus", "view");
  if (response) return response;

  try {
    const file = await getDataBoxPlusAttachmentFile(env, params.id, params.attachmentId);
    const headers = { ...file.headers };
    const url = new URL(request.url);
    if (url.searchParams.get("download") === "1") {
      headers["Content-Disposition"] = headers["Content-Disposition"].replace(/^inline/i, "attachment");
    }
    return new Response(file.body, { headers });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
