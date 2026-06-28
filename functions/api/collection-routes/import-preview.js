import { currentUser, json } from "../../_lib/auth.js";
import { normalizeRole } from "../../../src/permissions.js";
import {
  COLLECTION_ROUTES_MANUAL_IMPORT_MAX_FILE_SIZE_BYTES,
  CollectionRoutesStoreError,
  createCollectionRoutesImportPreview,
  createCollectionRoutesManualImportPreview
} from "../../_lib/collection-routes-store.js";

function collectionRoutesError(error) {
  if (error instanceof CollectionRoutesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("collection_routes.import_preview_failed", { message: error.message });
  return json({ error: "Import preview Tras svozu se teď nepodařilo spustit.", apiStatus: "waiting" }, 500);
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
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || typeof file.text !== "function") {
        return json({ error: "Nahrajte soubor .json nebo .csv.", apiStatus: "ready" }, 400);
      }

      if (file.size > COLLECTION_ROUTES_MANUAL_IMPORT_MAX_FILE_SIZE_BYTES) {
        return json({ error: "Soubor je příliš velký. Maximum je 1 MB.", apiStatus: "ready" }, 400);
      }

      const preview = await createCollectionRoutesManualImportPreview(env, user, {
        text: await file.text(),
        filename: file.name,
        contentType: file.type
      });

      return json({ preview, apiStatus: "ready" });
    }

    const preview = await createCollectionRoutesImportPreview(env, user);
    return json({ preview, apiStatus: preview.apiStatus || "waiting" });
  } catch (error) {
    return collectionRoutesError(error);
  }
}
