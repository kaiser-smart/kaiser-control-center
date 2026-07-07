import { currentUser, json } from "../../../_lib/auth.js";
import { normalizeRole } from "../../../../src/permissions.js";
import {
  CollectionRoutesStoreError,
  createCollectionRoutesVistosKommunalPreviewExport,
  createCollectionRoutesVistosSvozKaiserSitesSnapshot,
  getLatestCollectionRoutesVistosSvozKaiserSitesSnapshot
} from "../../../_lib/collection-routes-store.js";

function collectionRoutesError(error) {
  if (error instanceof CollectionRoutesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  const detail = String(error?.message || "").slice(0, 240);
  console.error("collection_routes.vistos_kommunal_preview_export_failed", { message: detail });
  return json({
    error: "Vistos Komunál export se teď nepodařilo načíst.",
    detail: detail || "Neznámá chyba backendu.",
    apiStatus: "waiting"
  }, 500);
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

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireCollectionRoutesAdmin(env, request);

  if (response) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const mode = String(url.searchParams.get("mode") || "latest").trim().toLowerCase();
    const live = mode === "live" || url.searchParams.get("live") === "1";
    const page = url.searchParams.get("page") || 1;
    const pageSize = url.searchParams.get("pageSize") || 100;

    if (live) {
      await createCollectionRoutesVistosSvozKaiserSitesSnapshot(env, {
        limit: url.searchParams.get("limit") || 10000,
        createdByUserId: user?.id,
        triggeredBy: "ui-live-refresh",
        runner: "collection-routes-sites-endpoint",
        scheduleMode: "manual-live-refresh",
        message: "Živý read-only snapshot Stanovišť z Vistos Svoz Kaiser."
      });
    }

    let snapshotPayload = await getLatestCollectionRoutesVistosSvozKaiserSitesSnapshot(env, { page, pageSize });

    if (!snapshotPayload) {
      await createCollectionRoutesVistosSvozKaiserSitesSnapshot(env, {
        limit: url.searchParams.get("limit") || 10000,
        createdByUserId: user?.id,
        triggeredBy: "ui-first-open",
        runner: "collection-routes-sites-endpoint",
        scheduleMode: "first-snapshot",
        message: "První read-only snapshot Stanovišť z Vistos Svoz Kaiser."
      });
      snapshotPayload = await getLatestCollectionRoutesVistosSvozKaiserSitesSnapshot(env, { page, pageSize });
    }

    if (!snapshotPayload) {
      const exportPayload = await createCollectionRoutesVistosKommunalPreviewExport(env, {
        issueType: url.searchParams.get("issueType") || "",
        query: url.searchParams.get("q") || "",
        limit: url.searchParams.get("limit") || 5000
      });
      return json({ export: exportPayload, apiStatus: exportPayload.apiStatus || "ready" });
    }

    return json({
      export: {
        status: "snapshot-export",
        apiStatus: snapshotPayload.apiStatus || "ready",
        phase: "1E",
        mode: "vistos-svoz-kaiser-sites-snapshot",
        source: "vistos",
        sourceMode: snapshotPayload.sourceMode,
        rowCount: snapshotPayload.rows.length,
        summary: snapshotPayload.summary || {},
        metadata: snapshotPayload.metadata || {},
        issueSummaryRows: snapshotPayload.issueSummaryRows || [],
        rows: snapshotPayload.rows,
        batch: snapshotPayload.batch,
        snapshot: snapshotPayload.snapshot,
        pagination: snapshotPayload.pagination,
        createsOperationalRoutes: false,
        sendsEmailOrSms: false,
        startsAutomation: false
      },
      snapshot: snapshotPayload.snapshot,
      pagination: snapshotPayload.pagination,
      latest: !live,
      apiStatus: snapshotPayload.apiStatus || "ready"
    });
  } catch (error) {
    return collectionRoutesError(error);
  }
}
