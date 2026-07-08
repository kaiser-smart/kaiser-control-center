import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  CustomerMessageStoreError,
  removeCustomerMessageOptOut
} from "../../../_lib/customer-message-store.js";
import { normalizeCustomerPhone } from "../../../_lib/customer-messaging-service.js";

function errorResponse(error) {
  if (error instanceof CustomerMessageStoreError) {
    return json({ error: error.message, apiStatus: "waiting" }, error.status);
  }

  console.error("customer_message_opt_out.delete_failed", { message: error.message });
  return json({ error: "Opt-out číslo se teď nepodařilo odebrat.", apiStatus: "waiting" }, 500);
}

export async function onRequestDelete({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "reports", "manage");
  if (response) return response;

  try {
    const url = new URL(request.url);
    const confirmed = url.searchParams.get("confirm") === "remove-opt-out";
    if (!confirmed) {
      return json({ error: "Odebrání opt-out vyžaduje potvrzení confirm=remove-opt-out.", apiStatus: "ready" }, 400);
    }

    const phone = normalizeCustomerPhone(params.phone);
    if (!phone) {
      return json({ error: "Chybí validní telefonní číslo.", apiStatus: "ready" }, 400);
    }

    const result = await removeCustomerMessageOptOut(env, phone);
    return json({ ...result, apiStatus: "ready" });
  } catch (error) {
    return errorResponse(error);
  }
}
