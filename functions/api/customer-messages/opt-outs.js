import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  CustomerMessageStoreError,
  addCustomerMessageOptOut,
  listCustomerMessageOptOuts
} from "../../_lib/customer-message-store.js";
import { normalizeCustomerPhone } from "../../_lib/customer-messaging-service.js";

function errorResponse(error, missingEndpoint = "GET /api/customer-messages/opt-outs") {
  if (error instanceof CustomerMessageStoreError) {
    return json({ error: error.message, apiStatus: "waiting", missingEndpoint }, error.status);
  }

  console.error("customer_message_opt_out.api_failed", { message: error.message });
  return json({ error: "Opt-out seznam se teď nepodařilo zpracovat.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "reports", "view");
  if (response) return response;

  try {
    const url = new URL(request.url);
    const result = await listCustomerMessageOptOuts(env, url.searchParams);
    return json({ ...result, apiStatus: "ready" });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "reports", "manage");
  if (response) return response;

  try {
    const body = await readJson(request);
    const phone = normalizeCustomerPhone(body.phone);
    if (!phone) {
      return json({ error: "Chybí validní telefonní číslo.", apiStatus: "ready" }, 400);
    }

    const result = await addCustomerMessageOptOut(env, {
      phone,
      source: "manual_admin",
      reason: body.reason || `Ruční opt-out: ${user?.name || user?.email || "uživatel"}`
    });
    return json({ optOut: result, apiStatus: "ready" }, 201);
  } catch (error) {
    return errorResponse(error, "POST /api/customer-messages/opt-outs");
  }
}
