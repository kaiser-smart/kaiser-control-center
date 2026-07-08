import { json, requireUserPermission } from "../../_lib/auth.js";
import { dataBoxPlusStoreErrorResponse, runDataBoxPlusSync } from "../../_lib/data-box-plus-store.js";

function canRunSync(user) {
  return ["admin", "management"].includes(String(user?.role || "").trim().toLowerCase());
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "data-box-plus", "manage");
  if (response) return response;

  if (!canRunSync(user)) {
    return json({ error: "Nemáš oprávnění spustit servisní načtení Datových schránek Plus." }, 403);
  }

  try {
    return json(await runDataBoxPlusSync(env, user, { triggerType: "manual" }));
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
