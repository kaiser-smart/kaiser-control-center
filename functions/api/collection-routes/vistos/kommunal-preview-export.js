import { json, requireUserPermission } from "../../../_lib/auth.js";
import { normalizeRole } from "../../../../src/permissions.js";
import {
  CollectionRoutesStoreError,
  createCollectionRoutesVistosKommunalPreviewExport
} from "../../../_lib/collection-routes-store.js";

function collectionRoutesError(error) {
  if (error instanceof CollectionRoutesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  const detail = String(error?.message || "").slice(0, 240);
  console.error("collection_routes.vistos_kommunal_preview_export_failed", { message: detail });
  return json({
    error: "Vistos Komunál export se teď nepodařilo načíst.",
    detail: detail || "Neznámá chyba backendu.",
    apiStatus: "waiting"
  }, 500);
}

function canRunCollectionRoutesVistosRefresh(user) {
  return ["admin", "management"].includes(normalizeRole(user?.role));
}

async function requireCollectionRoutesVistosRefresh(env, request) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) {
    return { user, response };
  }

  if (!canRunCollectionRoutesVistosRefresh(user)) {
    return { user, response: json({ error: "Nemáte oprávnění." }, 403) };
  }

  return { user, response: null };
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireCollectionRoutesVistosRefresh(env, request);

  if (response) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const exportPayload = await createCollectionRoutesVistosKommunalPreviewExport(env, {
      issueType: url.searchParams.get("issueType") || "",
      query: url.searchParams.get("q") || "",
      limit: url.searchParams.get("limit") || 5000
    });
    return json({ export: exportPayload, apiStatus: exportPayload.apiStatus || "ready" });
  } catch (error) {
    return collectionRoutesError(error);
  }
}
