import { json, readJson } from "../../_lib/auth.js";
import { handleSarlotaVoiceRequest, voiceSarlotaErrorResponse } from "../../_lib/voice-sarlota.js";
import { resolveVoiceUser } from "../../_lib/voice-webhook-auth.js";
import { hasPermission } from "../../../src/permissions.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const payload = await readJson(request);
  const { user, authSource, response } = await resolveVoiceUser(env, request, payload);

  if (response) {
    return response;
  }

  if (!hasPermission(user, "dashboard", "view")) {
    return json({ error: "Nemáš oprávnění používat Šarlotu." }, 403);
  }

  try {
    const result = await handleSarlotaVoiceRequest(env, user, payload, {
      authSource,
      waitUntil: typeof context.waitUntil === "function" ? context.waitUntil.bind(context) : null
    });
    return json(result);
  } catch (error) {
    const result = voiceSarlotaErrorResponse(error);
    return json(result.payload, result.status);
  }
}
