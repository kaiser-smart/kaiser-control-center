import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  dataBoxPlusStoreErrorResponse,
  listDataBoxPlusMailboxes,
  saveDataBoxPlusMailbox
} from "../../_lib/data-box-plus-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "data-box-plus", "view");
  if (response) return response;

  try {
    return json({ apiStatus: "ready", mailboxes: await listDataBoxPlusMailboxes(env) });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;

  try {
    return json(await saveDataBoxPlusMailbox(env, user, await readJson(request)), 201);
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
