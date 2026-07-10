import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  recomputeReceivablePaymentRating,
  receivablesRatingStoreError
} from "../../../_lib/receivables-rating-store.js";

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;
  try {
    return json(await recomputeReceivablePaymentRating(env, await readJson(request), user));
  } catch (error) {
    const normalized = receivablesRatingStoreError(error);
    return json({
      error: normalized.message,
      code: normalized.code,
      apiStatus: normalized.status === 503 ? "waiting" : "error"
    }, normalized.status || 500);
  }
}
