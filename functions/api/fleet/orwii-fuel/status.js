import { json, requireUserPermission } from "../../../_lib/auth.js";
import { orwiiFuelStatus } from "../../../_lib/orwii-fuel-store.js";
export async function onRequestGet({ request, env }) { const { response } = await requireUserPermission(env, request, "fleet", "view"); return response || json(orwiiFuelStatus(env)); }
