import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  previewReceivablePaymentRating,
  receivablesRatingStoreError
} from "../../../_lib/receivables-rating-store.js";

export async function onRequestPost({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "view");
  if (response) return response;
  try {
    return json(await previewReceivablePaymentRating(env, await readJson(request)));
  } catch (error) {
    const normalized = receivablesRatingStoreError(error);
    return json({
      error: normalized.message,
      code: normalized.code,
      apiStatus: normalized.status === 503 ? "waiting" : "error"
    }, normalized.status || 500);
  }
}
