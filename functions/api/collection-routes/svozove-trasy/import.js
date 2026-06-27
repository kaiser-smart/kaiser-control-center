import { currentUser, json } from "../../../_lib/auth.js";
import { normalizeRole } from "../../../../src/permissions.js";
import {
  COLLECTION_ROUTE_SOURCE_MAX_FILE_SIZE_BYTES,
  CollectionRouteSourcesError,
  createCollectionRouteSourceImport
} from "../../../_lib/collection-route-sources-store.js";

function isUploadedFile(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.size === "number";
}

function sourceImportError(error) {
  if (error instanceof CollectionRouteSourcesError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_route_sources.import_failed", { message: error.message });
  return json({ error: "Import Svozových tras z 13 Excelů se nepodařilo zpracovat.", apiStatus: "waiting" }, 500);
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
    const formData = await request.formData();
    const files = [];
    for (const [, value] of formData.entries()) {
      if (!isUploadedFile(value) || value.size <= 0) {
        continue;
      }
      if (value.size > COLLECTION_ROUTE_SOURCE_MAX_FILE_SIZE_BYTES) {
        return json({ error: `Soubor ${value.name || ""} je příliš velký. Maximum je 8 MB.`, apiStatus: "ready" }, 400);
      }
      files.push({
        buffer: await value.arrayBuffer(),
        filename: String(value.name || "soubor").trim(),
        contentType: String(value.type || "").trim()
      });
    }

    const preview = await createCollectionRouteSourceImport(env, user, { files });
    return json({ preview, apiStatus: "ready" });
  } catch (error) {
    return sourceImportError(error);
  }
}
