import { json } from "../../_lib/auth.js";
import { processCustomerStatusCallback } from "../../_lib/customer-messaging-service.js";
import { processDataBoxRcsStatusCallback } from "../../_lib/data-box-rcs-notifications.js";
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

  let customer = { matched: false, status: "", twilioMessageSid: "" };
  let dataBox = { matched: false, status: "", providerMessageId: "" };
  let customerError = "";
  let dataBoxError = "";
  try {
    customer = await processCustomerStatusCallback(env, payload);
  } catch (error) {
    customerError = String(error?.message || "customer callback failed").slice(0, 300);
    console.error("twilio.customer_status_failed", { message: customerError });
  }
  try {
    dataBox = await processDataBoxRcsStatusCallback(env, payload);
  } catch (error) {
    dataBoxError = String(error?.message || "data box callback failed").slice(0, 300);
    console.error("twilio.data_box_status_failed", { message: dataBoxError });
  }
  return json({
    apiStatus: customerError && dataBoxError ? "waiting" : "ready",
    status: dataBox.status || customer.status,
    matched: Boolean(customer.matched || dataBox.matched),
    customerMatched: customer.matched,
    dataBoxMatched: dataBox.matched,
    twilioMessageSid: dataBox.providerMessageId || customer.twilioMessageSid,
    ...(customerError && dataBoxError ? { error: "Twilio status callback se nepodařilo uložit." } : {})
  }, 200);
}
