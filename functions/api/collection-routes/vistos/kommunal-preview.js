import { currentUser, json } from "../../../_lib/auth.js";
import { normalizeRole } from "../../../../src/permissions.js";
import {
  CollectionRoutesStoreError,
  createCollectionRoutesVistosKommunalPreview
} from "../../../_lib/collection-routes-store.js";

function collectionRoutesError(error) {
  if (error instanceof CollectionRoutesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  const detail = String(error?.message || "").slice(0, 240);
  console.error("collection_routes.vistos_kommunal_preview_failed", { message: detail });
  return json({
    error: "Vistos Komunál preview se teď nepodařilo spustit.",
    detail: detail || "Neznámá chyba backendu.",
    apiStatus: "waiting"
  }, 500);
}

async function requireCollectionRoutesAdmin(env, request) {
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
  const { user, response } = await requireCollectionRoutesAdmin(env, request);

  if (response) {
    return response;
  }

  try {
    const preview = await createCollectionRoutesVistosKommunalPreview(env, user);
    return json({ preview, apiStatus: preview.apiStatus || "ready" });
  } catch (error) {
    return collectionRoutesError(error);
  }
}
