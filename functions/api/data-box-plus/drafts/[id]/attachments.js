import { json, requireUserPermission } from "../../../../_lib/auth.js";
import {
  addDataBoxPlusDraftAttachment,
  dataBoxPlusStoreErrorResponse
} from "../../../../_lib/data-box-plus-store.js";

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") return json({ error: "Vyber přílohu." }, 400);
    const draft = await addDataBoxPlusDraftAttachment(env, params.id, user, {
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer())
    });
    return json({ apiStatus: "ready", draft }, 201);
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
