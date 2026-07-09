import { currentUser, json } from "../../_lib/auth.js";
import { isFullAccessRole } from "../../../src/permissions.js";
import {
  COLLECTION_ROUTE_OPTIMIZATION_MAX_FILE_SIZE_BYTES,
  buildCollectionRouteOptimizationPreview
} from "../../_lib/collection-route-optimization-preview.js";

function cleanFormValue(value) {
  return String(value || "").trim();
}

function isUploadedFile(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.size === "number";
}

async function requireCollectionRoutesAdmin(env, request) {
  const user = await currentUser(env, request);

  if (!user) {
    return { user: null, response: json({ error: "Nepřihlášeno." }, 401) };
  }

  if (!isFullAccessRole(user)) {
    return { user, response: json({ error: "Nemáte oprávnění." }, 403) };
  }

  return { user, response: null };
}

function routeOptimizationError(error) {
  console.error("collection_routes.route_optimization_preview_failed", {
    message: String(error?.message || "").slice(0, 240)
  });
  return json({
    error: error.message || "Náhled optimalizace tras se nepodařilo připravit.",
    apiStatus: "waiting"
  }, 400);
}

export async function onRequestPost({ request, env }) {
  const { response } = await requireCollectionRoutesAdmin(env, request);

  if (response) {
    return response;
  }

  try {
    const formData = await request.formData();
    const files = [];

    for (const [, value] of formData.entries()) {
      if (!isUploadedFile(value) || value.size <= 0) {
        continue;
      }
      if (value.size > COLLECTION_ROUTE_OPTIMIZATION_MAX_FILE_SIZE_BYTES) {
        return json({ error: `Soubor ${cleanFormValue(value.name) || ""} je příliš velký. Maximum je 8 MB.` }, 400);
      }
      files.push({
        buffer: await value.arrayBuffer(),
        filename: cleanFormValue(value.name),
        contentType: cleanFormValue(value.type)
      });
    }

    if (!files.length) {
      return json({ error: "Nahrajte alespoň jeden Excel/CSV soubor tras." }, 400);
    }

    const preview = await buildCollectionRouteOptimizationPreview({ files });
    return json({ preview, apiStatus: "ready" });
  } catch (error) {
    return routeOptimizationError(error);
  }
}
