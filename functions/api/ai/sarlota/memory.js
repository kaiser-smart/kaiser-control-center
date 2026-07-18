import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  getSarlotaUserMemory,
  rememberSarlotaExchange,
  setSarlotaMemoryConsent
} from "../../../_lib/sarlota-user-memory.js";

function errorResponse(error) {
  console.error("sarlota_memory.api_failed", { message: error.message });
  return json({
    error: error.message || "Paměť Šarloty se teď nepodařilo změnit.",
    code: error.code || "sarlota_memory_failed",
    apiStatus: "waiting"
  }, Number(error.status || 500));
}

async function authenticated(env, request) {
  return requireUserPermission(env, request, "collection-routes", "view");
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await authenticated(env, request);
  if (response) return response;
  return json({ memory: await getSarlotaUserMemory(env, user), apiStatus: "ready" });
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await authenticated(env, request);
  if (response) return response;
  const input = await readJson(request);
  try {
    if (input.action === "consent") {
      return json({ memory: await setSarlotaMemoryConsent(env, user, input.consent === true), apiStatus: "ready" });
    }
    if (input.action === "remember_exchange") {
      return json({ memory: await rememberSarlotaExchange(env, user, input), apiStatus: "ready" });
    }
    return json({ error: "Neznámá akce paměti Šarloty.", code: "sarlota_memory_action_invalid" }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await authenticated(env, request);
  if (response) return response;
  try {
    return json({ memory: await setSarlotaMemoryConsent(env, user, false), apiStatus: "ready" });
  } catch (error) {
    return errorResponse(error);
  }
}
