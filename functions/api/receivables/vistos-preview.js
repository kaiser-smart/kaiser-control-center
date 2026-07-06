import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  createReceivablesVistosPreview,
  receivablesVistosPreviewError
} from "../../_lib/receivables-vistos-preview.js";

export async function onRequestPost({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  try {
    const preview = await createReceivablesVistosPreview(env);
    return json({ preview, apiStatus: preview.apiStatus || "ready" });
  } catch (error) {
    const { payload, status } = receivablesVistosPreviewError(error);
    return json(payload, status);
  }
}
