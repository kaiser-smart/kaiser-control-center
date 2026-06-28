import { currentUser, json, readJson } from "../../_lib/auth.js";
import {
  AssistantPromoStoreError,
  getSarlotaPromoState,
  recordSarlotaPromoAction
} from "../../_lib/assistant-promo-store.js";

function promoError(error, missingEndpoint = "GET /api/ai/sarlota-promo") {
  if (error instanceof AssistantPromoStoreError) {
    return json({ error: error.message, apiStatus: "waiting", missingEndpoint }, error.status);
  }

  console.error("assistant_promo.failed", { message: error.message });
  return json({ error: "Promo Šarloty se teď nepodařilo ověřit.", apiStatus: "waiting" }, 500);
}

async function requirePromoUser(env, request) {
  const user = await currentUser(env, request);

  if (!user) {
    return { user: null, response: json({ error: "Nepřihlášeno." }, 401) };
  }

  return { user, response: null };
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requirePromoUser(env, request);

  if (response) {
    return response;
  }

  try {
    return json(await getSarlotaPromoState(env, user));
  } catch (error) {
    return promoError(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requirePromoUser(env, request);

  if (response) {
    return response;
  }

  try {
    const payload = await readJson(request);
    return json(await recordSarlotaPromoAction(env, user, payload));
  } catch (error) {
    return promoError(error, "POST /api/ai/sarlota-promo");
  }
}
