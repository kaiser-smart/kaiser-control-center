import { json } from "../../_lib/auth.js";
import { processCustomerStatusCallback } from "../../_lib/customer-messaging-service.js";
import { requireTwilioWebhookAuth } from "../../_lib/twilio-webhook-auth.js";

async function readTwilioPayload(request) {
  const rawBody = await request.text();
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return { payload: JSON.parse(rawBody || "{}"), rawBody };
    } catch {
      return { payload: {}, rawBody };
    }
  }

  return { payload: Object.fromEntries(new URLSearchParams(rawBody)), rawBody };
}

export async function onRequestPost({ request, env }) {
  const { payload, rawBody } = await readTwilioPayload(request);
  const auth = await requireTwilioWebhookAuth(env, request, payload, rawBody);
  if (!auth.ok) {
    return json({ error: auth.error, apiStatus: "waiting" }, auth.responseStatus);
  }

  try {
    const result = await processCustomerStatusCallback(env, payload);
    return json(result);
  } catch (error) {
    console.error("twilio.customer_status_failed", { message: error.message });
    return json({
      apiStatus: "waiting",
      error: "Twilio status callback se nepodařilo uložit.",
      acceptedUnknownPayload: true
    }, 200);
  }
}
