import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  CollectionRoutesTestIncidentError,
  listCollectionRoutesTestIncidents,
  reportCollectionRoutesTestIncident
} from "../../_lib/collection-routes-test-incidents-store.js";

const MAX_PHOTO_SIZE_BYTES = 6 * 1024 * 1024;

function errorResponse(error) {
  if (error instanceof CollectionRoutesTestIncidentError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_routes_test_incident.api_failed", { message: error?.message });
  return json({ error: "TEST hlášení se teď nepodařilo zpracovat.", apiStatus: "waiting" }, 500);
}

function cleanFormValue(value) {
  return String(value ?? "").trim();
}

function uploadedFile(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.size === "number";
}

export function detectCollectionRouteTestIncidentImageType(bytes) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (value.length >= 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) return "image/jpeg";
  if (
    value.length >= 8 &&
    value[0] === 0x89 && value[1] === 0x50 && value[2] === 0x4e && value[3] === 0x47 &&
    value[4] === 0x0d && value[5] === 0x0a && value[6] === 0x1a && value[7] === 0x0a
  ) return "image/png";
  if (
    value.length >= 12 &&
    String.fromCharCode(...value.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...value.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return "";
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const url = new URL(request.url);
    return json({
      ...(await listCollectionRoutesTestIncidents(env, user, { runId: url.searchParams.get("runId") })),
      apiStatus: "ready"
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!uploadedFile(file) || file.size <= 0) {
      return json({ error: "Vyfoť stav nádoby nebo přístupu do firmy.", code: "collection_routes_test_incident_photo_required" }, 400);
    }
    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      return json({ error: "Fotografie je příliš velká. Maximum je 6 MB.", code: "collection_routes_test_incident_photo_too_large" }, 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = detectCollectionRouteTestIncidentImageType(bytes);
    if (!contentType) {
      return json({ error: "Fotografie musí být JPEG, PNG nebo WebP.", code: "collection_routes_test_incident_photo_type_invalid" }, 400);
    }
    const result = await reportCollectionRoutesTestIncident(env, user, {
      runId: cleanFormValue(formData.get("runId")),
      stopId: cleanFormValue(formData.get("stopId")),
      type: cleanFormValue(formData.get("type")),
      note: cleanFormValue(formData.get("note")),
      idempotencyKey: cleanFormValue(formData.get("idempotencyKey"))
    }, {
      body: bytes,
      contentType,
      sizeBytes: bytes.byteLength
    });
    return json({
      ...result,
      apiStatus: "ready",
      sendsNotifications: false,
      changesRoute: false
    }, result.reused ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export const __test = { MAX_PHOTO_SIZE_BYTES };
