import { json, readJson } from "../../../_lib/auth.js";
import {
  CommunicationStoreError,
  recordTwilioStatusCallback,
  requireWebhookToken
} from "../../../_lib/communication-store.js";

async function readTwilioPayload(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return readJson(request);
  }

  const form = await request.formData();
  return Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
}

export async function onRequestPost({ request, env }) {
  const token = requireWebhookToken(env, request, "TWILIO_KAISER_STATUS_WEBHOOK_TOKEN", "KAISER_TWILIO_STATUS_WEBHOOK_TOKEN");
  if (!token.ok) {
    return json({ error: token.error, apiStatus: "waiting" }, token.responseStatus);
  }

  try {
    const result = await recordTwilioStatusCallback(env, await readTwilioPayload(request));
    return json(result);
  } catch (error) {
    if (error instanceof CommunicationStoreError) {
      return json({ error: error.message, apiStatus: "waiting" }, error.status);
    }

    console.error("communication.twilio_status_failed", { message: error.message });
    return json({ error: "Twilio delivery status se nepodařilo uložit.", apiStatus: "waiting" }, 500);
  }
}
