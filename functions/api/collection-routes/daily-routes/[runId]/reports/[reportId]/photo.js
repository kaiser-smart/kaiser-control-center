import { currentUser, json } from "../../../../../../_lib/auth.js";
import { collectionDailyRoutesErrorResponse } from "../../../../../../_lib/collection-daily-routes-api.js";
import { getCollectionDailyRouteReportPhoto } from "../../../../../../_lib/collection-daily-routes-store.js";

function pathParam(request, params, key, marker, offset) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const index = parts.lastIndexOf(marker);
  return decodeURIComponent(String(params?.[key] || parts[index + offset] || "")).trim();
}

export async function onRequestGet({ request, env, params }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Nepřihlášeno." }, 401);
  try {
    const url = new URL(request.url);
    const photo = await getCollectionDailyRouteReportPhoto(
      env,
      user,
      pathParam(request, params, "runId", "daily-routes", 1),
      pathParam(request, params, "reportId", "reports", 1),
      { scope: url.searchParams.get("scope"), photoIndex: url.searchParams.get("index") }
    );
    return new Response(photo.body, {
      headers: {
        "Content-Type": photo.contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return collectionDailyRoutesErrorResponse(error, "Fotografii hlášení se teď nepodařilo načíst.");
  }
}
