import { currentUser, json } from "../../../../../../_lib/auth.js";
import {
  collectionDailyRouteRunId,
  collectionDailyRouteStopId,
  collectionDailyRoutesErrorResponse
} from "../../../../../../_lib/collection-daily-routes-api.js";
import { recordCollectionDailyRouteReport } from "../../../../../../_lib/collection-daily-routes-store.js";

const MAX_PHOTO_SIZE_BYTES = 6 * 1024 * 1024;

function cleanFormValue(value) {
  return String(value ?? "").trim();
}

function uploadedFile(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.size === "number";
}

export function detectCollectionDailyRouteReportImageType(bytes) {
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

export async function onRequestPost({ request, env, params }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Nepřihlášeno." }, 401);
  try {
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!uploadedFile(file) || file.size <= 0) {
      return json({
        error: "Hlášení pro dispečink musí obsahovat fotografii.",
        code: "collection_daily_route_report_photo_required",
        apiStatus: "waiting"
      }, 400);
    }
    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      return json({
        error: "Fotografie je příliš velká. Maximum je 6 MB.",
        code: "collection_daily_route_report_photo_too_large",
        apiStatus: "waiting"
      }, 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = detectCollectionDailyRouteReportImageType(bytes);
    if (!contentType) {
      return json({
        error: "Fotografie musí být JPEG, PNG nebo WebP.",
        code: "collection_daily_route_report_photo_type_invalid",
        apiStatus: "waiting"
      }, 400);
    }
    const result = await recordCollectionDailyRouteReport(
      env,
      user,
      collectionDailyRouteRunId(request, params),
      collectionDailyRouteStopId(request, params),
      {
        scope: cleanFormValue(formData.get("scope")),
        type: cleanFormValue(formData.get("type")),
        note: cleanFormValue(formData.get("note")),
        idempotencyKey: cleanFormValue(formData.get("idempotencyKey"))
      },
      { body: bytes, contentType, sizeBytes: bytes.byteLength }
    );
    return json({
      ...result,
      apiStatus: "ready",
      sendsNotifications: false,
      writesVistos: false
    }, result.reused ? 200 : 201);
  } catch (error) {
    return collectionDailyRoutesErrorResponse(error, "Hlášení pro dispečink se teď nepodařilo uložit.");
  }
}

export const __test = { MAX_PHOTO_SIZE_BYTES };
