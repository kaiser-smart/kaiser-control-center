import { currentUser, json } from "../../../_lib/auth.js";
import { normalizeRole } from "../../../../src/permissions.js";
import {
  CollectionRouteSourcesError,
  matchCollectionRouteSourceRowsWithVistos
} from "../../../_lib/collection-route-sources-store.js";

function sourceVistosMatchError(error) {
  if (error instanceof CollectionRouteSourcesError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_route_sources.vistos_match_failed", { message: error.message });
  return json({ error: "Vistos match pro Svozové trasy se teď nepodařilo spustit.", apiStatus: "waiting" }, 500);
}

async function requireAdmin(env, request) {
  const user = await currentUser(env, request);
  if (!user) {
    return { user: null, response: json({ error: "Nepřihlášeno." }, 401) };
  }
  if (normalizeRole(user.role) !== "admin") {
    return { user, response: json({ error: "Nemáte oprávnění." }, 403) };
  }
  return { user, response: null };
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireAdmin(env, request);
  if (response) {
    return response;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const match = await matchCollectionRouteSourceRowsWithVistos(env, user, {
      batchId: String(body?.batchId || "").trim(),
      limit: body?.limit || 5000
    });
    return json({ match, apiStatus: match.apiStatus || "ready" });
  } catch (error) {
    return sourceVistosMatchError(error);
  }
}
