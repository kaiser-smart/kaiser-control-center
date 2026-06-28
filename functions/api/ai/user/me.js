import { ACTIONS, PERMISSION_MODULES, hasPermission } from "../../../../src/permissions.js";
import { currentUser, json, publicUser } from "../../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);

  if (!user) {
    return json({ error: "Nepřihlášeno." }, 401);
  }

  const permissions = PERMISSION_MODULES.map((moduleId) => ({
    moduleId,
    actions: ACTIONS.filter((action) => hasPermission(user, moduleId, action))
  }));

  return json({
    user: publicUser(user),
    permissions,
    apiStatus: "ready"
  });
}

