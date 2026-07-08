import { json } from "../../../_lib/auth.js";
import {
  CollectionRoutesStoreError,
  createCollectionRoutesVistosKommunalPreview
} from "../../../_lib/collection-routes-store.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

function requestToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  return bearer || request.headers.get("X-Collection-Routes-Runner-Token") || "";
}

function tokenMatches(received, expected) {
  const left = cleanString(received);
  const right = cleanString(expected);
  if (!left || !right || left.length !== right.length) return false;

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function collectionRoutesError(error) {
  if (error instanceof CollectionRoutesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  const detail = String(error?.message || "").slice(0, 240);
  console.error("collection_routes.vistos_kommunal_preview_internal_failed", { message: detail });
  return json({
    error: "Interní Vistos Komunál preview se teď nepodařilo spustit.",
    code: "collection_routes_internal_preview_failed",
    apiStatus: "waiting"
  }, 500);
}

export async function onRequestPost({ request, env }) {
  if (!tokenMatches(requestToken(request), env.COLLECTION_ROUTES_RUNNER_TOKEN)) {
    return json({
      error: "Interní načítání Tras svozu není povolené.",
      code: "collection_routes_runner_unauthorized"
    }, 401);
  }

  try {
    const preview = await createCollectionRoutesVistosKommunalPreview(env, {
      id: "cloud-runner:collection-routes-vistos-snapshot-15m",
      name: "Cloud runner Trasy svozu"
    }, {
      derivedRowsLimit: 0
    });
    return json({ preview, apiStatus: preview.apiStatus || "ready" });
  } catch (error) {
    return collectionRoutesError(error);
  }
}

export async function onRequestGet() {
  return json({ error: "Tahle interní akce je dostupná jen pro plánované serverové načítání." }, 405, {
    Allow: "POST"
  });
}
