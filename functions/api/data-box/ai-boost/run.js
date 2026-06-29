import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { dataBoxAiBoostErrorResponse, runDataBoxAiBoost } from "../../../_lib/data-box-ai-boost.js";

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "data-box", "manage");
  if (response) return response;

  try {
    const payload = await readJson(request);
    const result = await runDataBoxAiBoost(env, {
      limit: payload.limit,
      currentUser: user
    });
    return json(result);
  } catch (error) {
    const result = dataBoxAiBoostErrorResponse(error);
    return json(result.payload, result.status);
  }
}
