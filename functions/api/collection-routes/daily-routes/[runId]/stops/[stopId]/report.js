import { currentUser, json } from "../../../../../../_lib/auth.js";
import {
  collectionDailyRouteRunId,
  collectionDailyRouteStopId,
  collectionDailyRoutesErrorResponse
} from "../../../../../../_lib/collection-daily-routes-api.js";
import { recordCollectionDailyRouteReport } from "../../../../../../_lib/collection-daily-routes-store.js";

const MAX_PHOTO_SIZE_BYTES = 6 * 1024 * 1024;
const MAX_PHOTO_COUNT = 5;
const MAX_TOTAL_PHOTO_SIZE_BYTES = 20 * 1024 * 1024;

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
    const files = formData.getAll("photo").filter(uploadedFile);
    if (files.some((file) => file.size <= 0)) {
      return json({
        error: "Přiložená fotografie je prázdná.",
        code: "collection_daily_route_report_photo_empty",
        apiStatus: "waiting"
      }, 400);
    }
    if (files.length > MAX_PHOTO_COUNT) {
      return json({
        error: "K hlášení lze přidat nejvýše 5 fotografií.",
        code: "collection_daily_route_report_photo_count_invalid",
        apiStatus: "waiting"
      }, 400);
    }
    if (files.some((file) => file.size > MAX_PHOTO_SIZE_BYTES)) {
      return json({
        error: "Fotografie je příliš velká. Maximum je 6 MB.",
        code: "collection_daily_route_report_photo_too_large",
        apiStatus: "waiting"
      }, 400);
    }
    if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_PHOTO_SIZE_BYTES) {
      return json({
        error: "Fotografie mají dohromady příliš velkou velikost. Maximum je 20 MB.",
        code: "collection_daily_route_report_photos_too_large",
        apiStatus: "waiting"
      }, 400);
    }
    const photos = await Promise.all(files.map(async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { bytes, contentType: detectCollectionDailyRouteReportImageType(bytes) };
    }));
    if (photos.some((photo) => !photo.contentType)) {
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
      photos.map((photo) => ({ body: photo.bytes, contentType: photo.contentType, sizeBytes: photo.bytes.byteLength }))
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

export const __test = { MAX_PHOTO_SIZE_BYTES, MAX_PHOTO_COUNT, MAX_TOTAL_PHOTO_SIZE_BYTES };
