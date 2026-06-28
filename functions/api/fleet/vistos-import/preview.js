import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  FLEET_VISTOS_IMPORT_MAX_FILE_SIZE_BYTES,
  buildFleetVistosImportPreview
} from "../../../_lib/fleet-vistos-import-preview.js";

function cleanFormValue(value) {
  return String(value || "").trim();
}

function isUploadedFile(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.size === "number";
}

function fleetPreviewError(error) {
  console.error("fleet.vistos_import_preview_failed", { message: error.message });
  return json({ error: error.message || "Náhled importu se nepodařilo zpracovat.", apiStatus: "waiting" }, 400);
}

export async function onRequestPost({ request, env }) {
  const { response } = await requireUserPermission(env, request, "fleet", "edit");

  if (response) {
    return response;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!isUploadedFile(file) || file.size <= 0) {
      return json({ error: "Vyberte soubor exportu z Vistos." }, 400);
    }

    if (file.size > FLEET_VISTOS_IMPORT_MAX_FILE_SIZE_BYTES) {
      return json({ error: "Soubor je příliš velký. Maximum je 10 MB." }, 400);
    }

    const preview = await buildFleetVistosImportPreview({
      buffer: await file.arrayBuffer(),
      filename: cleanFormValue(file.name),
      contentType: cleanFormValue(file.type)
    });

    return json({ preview, apiStatus: "ready" });
  } catch (error) {
    return fleetPreviewError(error);
  }
}
