import { currentUser, json } from "../../../../../_lib/auth.js";
import {
  getSelfRepairAttachmentFile,
  SelfRepairStoreError
} from "../../../../../_lib/self-repair-store.js";

function routeValue(request, params, key, index) {
  const direct = String(params?.[key] || "").trim();
  if (direct) return direct;
  return decodeURIComponent(new URL(request.url).pathname.split("/").filter(Boolean)[index] || "");
}

export async function onRequestGet({ request, env, params }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Nepřihlášeno." }, 401);

  try {
    const caseId = routeValue(request, params, "id", 3);
    const attachmentId = routeValue(request, params, "attachmentId", 5);
    const file = await getSelfRepairAttachmentFile(env, user, caseId, attachmentId);
    return new Response(file.body, { headers: file.headers });
  } catch (error) {
    if (error instanceof SelfRepairStoreError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    console.error("self_repair.attachment_download_failed", { message: error?.message });
    return json({ error: "Přílohu se teď nepodařilo otevřít." }, 500);
  }
}
