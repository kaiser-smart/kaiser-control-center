import { json, requireUserPermission } from "../../../../_lib/auth.js";
import {
  CollectionRoutesTestIncidentError,
  getCollectionRoutesTestIncidentPhoto
} from "../../../../_lib/collection-routes-test-incidents-store.js";

function incidentId(request, params) {
  return decodeURIComponent(String(params?.incidentId || new URL(request.url).pathname.split("/").at(-2) || "")).trim();
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const photo = await getCollectionRoutesTestIncidentPhoto(env, user, incidentId(request, params));
    return new Response(photo.body, {
      headers: {
        "Content-Type": photo.contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (error instanceof CollectionRoutesTestIncidentError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    console.error("collection_routes_test_incident.photo_failed", { message: error?.message });
    return json({ error: "Fotografii TEST hlášení se teď nepodařilo načíst." }, 500);
  }
}
