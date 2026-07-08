import { json, requireUserPermission } from "../_lib/auth.js";
import {
  CustomerMessageStoreError,
  listCustomerMessages
} from "../_lib/customer-message-store.js";
import {
  customerMessagingStatus,
  sendCustomerMessage
} from "../_lib/customer-messaging-service.js";
import { customerTemplateOptions } from "../_lib/customer-message-templates.js";

function errorResponse(error, missingEndpoint = "GET /api/customer-messages") {
  if (error instanceof CustomerMessageStoreError) {
    return json({ error: error.message, apiStatus: "waiting", missingEndpoint }, error.status);
  }

  console.error("customer_messages.api_failed", { message: error.message });
  return json({ error: "Zákaznické zprávy se teď nepodařilo zpracovat.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "reports", "view");
  if (response) return response;

  try {
    const url = new URL(request.url);
    const result = await listCustomerMessages(env, url.searchParams);
    return json({
      ...result,
      templates: customerTemplateOptions(),
      status: customerMessagingStatus(env),
      apiStatus: "ready"
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { response } = await requireUserPermission(env, request, "reports", "manage");
  if (response) return response;

  try {
    const body = await request.json().catch(() => ({}));
    const result = await sendCustomerMessage(env, body);
    return json({ ...result, apiStatus: "ready" }, result.sent ? 202 : 200);
  } catch (error) {
    return errorResponse(error, "POST /api/customer-messages");
  }
}
