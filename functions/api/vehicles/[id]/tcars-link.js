import { json, requireUserPermission } from "../../../_lib/auth.js";

function canManageTcarsLink(user) {
  return ["admin", "management", "dispecer"].includes(String(user?.role || "").trim());
}

async function tcarsLinkWaitingResponse(env, request) {
  const { user, response } = await requireUserPermission(env, request, "vehicle-tracking", "view");

  if (response) {
    return response;
  }

  if (!canManageTcarsLink(user)) {
    return json({ error: "Nemáte oprávnění měnit párování T-Cars." }, 403);
  }

  return null;
}

export async function onRequestPatch({ request, env, params }) {
  const response = await tcarsLinkWaitingResponse(env, request);

  if (response) {
    return response;
  }

  return json({
    error: "Čeká na API pro párování T-Cars.",
    apiStatus: "waiting",
    vehicleId: params.id
  }, 501);
}

export async function onRequestDelete({ request, env, params }) {
  const response = await tcarsLinkWaitingResponse(env, request);

  if (response) {
    return response;
  }

  return json({
    error: "Čeká na API pro odpojení T-Cars.",
    apiStatus: "waiting",
    vehicleId: params.id
  }, 501);
}
