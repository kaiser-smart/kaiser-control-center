import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  SelfRepairStoreError,
  getSelfRepairStatus,
  selfRepairApiStatus
} from "../../_lib/self-repair-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "self-repair", "view");
  if (response) return response;

  try {
    const status = await getSelfRepairStatus(env);
    return json({ ...status, apiStatus: selfRepairApiStatus(env) });
  } catch (error) {
    if (error instanceof SelfRepairStoreError) {
      return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
    }
    console.error("self_repair.status_failed", { message: error?.message });
    return json({ error: "Stav Samooprav se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
  }
}
