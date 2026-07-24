import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  listRcsTemplateCenter,
  synchronizeRcsTemplates
} from "../../_lib/rcs-template-service.js";

function errorResponse(error) {
  console.error("rcs_templates.api_failed", { message: error.message });
  return json({ error: error.message || "RCS šablony se nepodařilo zpracovat.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "settings", "manage");
  if (response) return response;
  try {
    return json(await listRcsTemplateCenter(env));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "settings", "manage");
  if (response) return response;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== "sync-rcs-templates") {
      return json({ error: "Synchronizace vyžaduje výslovné potvrzení." }, 400);
    }
    return json(await synchronizeRcsTemplates(env, { id: user.id, name: user.name }));
  } catch (error) {
    return errorResponse(error);
  }
}
