import { json, readJson } from "../../_lib/auth.js";
import {
  CommunicationStoreError,
  processInboundEmailReply,
  requireWebhookToken
} from "../../_lib/communication-store.js";

async function readInboundPayload(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return readJson(request);
  }

  if (contentType.includes("form")) {
    const form = await request.formData();
    return Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
  }

  return {
    provider: "raw-email-webhook",
    body: await request.text()
  };
}

export async function onRequestPost({ request, env }) {
  const token = requireWebhookToken(env, request, "KSO_INBOUND_EMAIL_WEBHOOK_TOKEN", "SENDGRID_INBOUND_PARSE_TOKEN");
  if (!token.ok) {
    return json({ error: token.error, apiStatus: "waiting" }, token.responseStatus);
  }

  try {
    const payload = await readInboundPayload(request);
    const result = await processInboundEmailReply(env, {
      ...payload,
      provider: payload.provider || "SendGrid inbound parse"
    });
    return json(result);
  } catch (error) {
    if (error instanceof CommunicationStoreError) {
      return json({ error: error.message, apiStatus: "waiting" }, error.status);
    }

    console.error("communication.inbound_email_failed", { message: error.message });
    return json({ error: "Příchozí e-mail se nepodařilo zpracovat.", apiStatus: "waiting" }, 500);
  }
}
