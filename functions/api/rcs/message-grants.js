import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  cancelRcsTemplateSendGrant,
  prepareRcsTemplateSendGrant
} from "../../_lib/rcs-template-service.js";

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "settings", "manage");
  if (response) return response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await prepareRcsTemplateSendGrant(env, body, {
      id: user.id,
      name: user.name,
      phone: user.phone
    });
    return json({ ...result, apiStatus: "ready" }, 201);
  } catch (error) {
    return json({
      error: error.message || "Jednorázové RCS oprávnění se nepodařilo připravit.",
      apiStatus: "waiting"
    }, 400);
  }
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "settings", "manage");
  if (response) return response;
  try {
    const url = new URL(request.url);
    const result = await cancelRcsTemplateSendGrant(env, {
      grantId: url.searchParams.get("grantId")
    }, {
      id: user.id,
      name: user.name,
      phone: user.phone
    });
    return json({ ...result, apiStatus: "ready" });
  } catch (error) {
    return json({
      error: error.message || "Jednorázové RCS oprávnění se nepodařilo zrušit.",
      apiStatus: "waiting"
    }, 400);
  }
}
