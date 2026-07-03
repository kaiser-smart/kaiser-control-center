import { currentUser, getUsers, json } from "./auth.js";
import { isUserActive } from "../../src/permissions.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

function safeToken(value) {
  return cleanString(value).replace(/^Bearer\s+/i, "");
}

function configuredWebhookToken(env) {
  return cleanString(env.VOICE_ASSISTANT_WEBHOOK_TOKEN || env.ELEVENLABS_WEBHOOK_TOKEN);
}

function requestWebhookToken(request) {
  return safeToken(
    request.headers.get("authorization")
    || request.headers.get("x-voice-assistant-token")
    || request.headers.get("x-elevenlabs-webhook-token")
  );
}

export function payloadUserId(payload = {}) {
  const parameters = payload.parameters || payload.params || {};

  return cleanString(
    payload.userId
    || payload.user_id
    || parameters.userId
    || parameters.user_id
    || payload.metadata?.userId
    || payload.metadata?.user_id
    || payload.dynamicVariables?.user_id
    || payload.dynamic_variables?.user_id
    || payload.conversation_initiation_client_data?.dynamic_variables?.user_id
  );
}

export async function resolveVoiceUser(env, request, payload) {
  const sessionUser = await currentUser(env, request);

  if (sessionUser) {
    return { user: sessionUser, authSource: "session", response: null };
  }

  const expectedToken = configuredWebhookToken(env);
  const receivedToken = requestWebhookToken(request);

  if (!expectedToken || !receivedToken || receivedToken !== expectedToken) {
    return {
      user: null,
      authSource: "",
      response: json({ error: "Nepřihlášeno." }, 401)
    };
  }

  const userId = payloadUserId(payload);
  if (!userId) {
    return {
      user: null,
      authSource: "webhook",
      response: json({ error: "Webhook Šarloty nemá ověřenou identitu uživatele Smart odpady." }, 401)
    };
  }

  const users = await getUsers(env);
  const user = users.find((item) => cleanString(item.id) === userId) || null;

  if (!isUserActive(user)) {
    return {
      user: null,
      authSource: "webhook",
      response: json({ error: "Uživatel Šarloty není aktivní." }, 403)
    };
  }

  return { user, authSource: "webhook", response: null };
}
