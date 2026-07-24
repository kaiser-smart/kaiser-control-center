import { json, requireUserPermission } from "../../_lib/auth.js";
import { sendRcsTemplateMessage } from "../../_lib/rcs-template-service.js";

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "settings", "manage");
  if (response) return response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await sendRcsTemplateMessage(env, body, { id: user.id, name: user.name });
    return json({ ...result, apiStatus: "ready" }, result.sent ? 202 : 200);
  } catch (error) {
    return json({ error: error.message || "RCS zprávu se nepodařilo odeslat.", apiStatus: "waiting" }, 400);
  }
}
