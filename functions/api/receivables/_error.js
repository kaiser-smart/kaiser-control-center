import { json } from "../../_lib/auth.js";
import { ReceivablesStoreError } from "../../_lib/receivables-store.js";

export function receivablesErrorResponse(error, missingEndpoint = "GET /api/receivables/dashboard") {
  if (error instanceof ReceivablesStoreError) {
    return json({
      error: error.message,
      code: error.code,
      apiStatus: "waiting",
      missingEndpoint
    }, error.status);
  }

  console.error("receivables.api_failed", { message: error?.message });
  return json({
    error: "Pohledávkový kompas AI se teď nepodařilo načíst.",
    apiStatus: "waiting",
    missingEndpoint
  }, 500);
}
