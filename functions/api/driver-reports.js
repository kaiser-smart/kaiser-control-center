import { json, readJson, requireUserPermission } from "../_lib/auth.js";
import {
  DriverPartRequestsStoreError,
  createDriverPartRequest,
  driverPartRequestPermissionSummary,
  processDriverPartRequestAfterVoiceCreate,
  listDriverPartRequests
} from "../_lib/driver-part-requests-store.js";

function errorResponse(error, missingEndpoint = "GET /api/driver-reports") {
  if (error instanceof DriverPartRequestsStoreError) {
    return json({
      error: error.message,
      apiStatus: "waiting",
      code: error.code,
      missingEndpoint,
      details: error.details || null
    }, error.status);
  }

  console.error("driver_reports.failed", { message: error?.message });
  return json({ error: "Hlášení řidičů se teď nepodařilo zpracovat.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "driver-reports", "view");

  if (response) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const requests = await listDriverPartRequests(env, user, {
      status: url.searchParams.get("status"),
      search: url.searchParams.get("search")
    });
    return json({
      requests,
      permissions: driverPartRequestPermissionSummary(user),
      apiStatus: "ready"
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  const { user, response } = await requireUserPermission(env, request, "driver-reports", "create");

  if (response) {
    return response;
  }

  try {
    const payload = await readJson(request);
    const partRequest = await createDriverPartRequest(env, user, payload);
    let handoffWarning = "";
    let handoffCode = "";
    if (payload.handoffAfterCreate === true) {
      if (typeof waitUntil === "function") {
        waitUntil(processDriverPartRequestAfterVoiceCreate(env, user, partRequest.id, {
          allowCreatorHandoff: true,
          allowProbablePartHandoff: true,
          runPriceBoost: true,
          requireVinPartVerification: true,
          requirePriceOffersForHandoff: true
        }).catch((error) => {
          console.info("driver_reports.post_create_background_failed", {
            reportId: partRequest.reportId,
            code: error?.code || "driver_part_background_failed",
            message: error?.message
          });
        }));
        handoffWarning = "Hlášení je vytvořené. Následné ověření dílů, cen nebo urgentní zpráva běží na pozadí.";
        handoffCode = "driver_part_background_scheduled";
      } else {
        handoffWarning = "Hlášení je vytvořené. Pozadí se spustí v cloudovém běhu mimo tento požadavek.";
        handoffCode = "driver_part_background_waituntil_unavailable";
      }
    }
    return json({
      request: partRequest,
      apiStatus: "ready",
      warning: handoffWarning,
      code: handoffCode
    }, 201);
  } catch (error) {
    return errorResponse(error, "POST /api/driver-reports");
  }
}
