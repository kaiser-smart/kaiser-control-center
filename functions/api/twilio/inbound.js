import { json } from "../../_lib/auth.js";
import { processCustomerInboundMessage } from "../../_lib/customer-messaging-service.js";
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

function twiml(message = "") {
  const body = message
    ? `<Response><Message>${String(message).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</Message></Response>`
    : "<Response></Response>";
  return new Response(body, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestPost({ request, env }) {
  const { payload, rawBody } = await readTwilioPayload(request);
  const auth = await requireTwilioWebhookAuth(env, request, payload, rawBody);
  if (!auth.ok) {
    return json({ error: auth.error, apiStatus: "waiting" }, auth.responseStatus);
  }

  try {
    const result = await processCustomerInboundMessage(env, payload);
    return twiml(result.reply);
  } catch (error) {
    console.error("twilio.customer_inbound_failed", { message: error.message });
    return json({ error: "Příchozí Twilio zprávu se nepodařilo uložit.", apiStatus: "waiting" }, 500);
  }
}
