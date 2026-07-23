import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  dataBoxPlusStoreErrorResponse,
  listDataBoxPlusDrafts,
  saveDataBoxPlusDraft
} from "../../../_lib/data-box-plus-store.js";

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "view");
  if (response) return response;
  const url = new URL(request.url);
  try {
    return json({
      apiStatus: "ready",
      drafts: await listDataBoxPlusDrafts(env, user, {
        mailboxId: url.searchParams.get("mailboxId"),
        status: url.searchParams.get("status") || "all"
      })
    });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;
  try {
    return json({ apiStatus: "ready", draft: await saveDataBoxPlusDraft(env, user, await readJson(request)) }, 201);
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
