import { requireUserPermission } from "./_lib/auth.js";
import { cleanupDuplicatedDataBoxMessages, dataBoxStoreErrorResponse } from "./_lib/data-box-store.js";

const CLEANUP_CONFIRMATION = "DELETE_DUPLICATE_KS_FROM_NANOLAB_PLUS";

function canCleanupDataBox(user) {
  return ["admin", "management"].includes(String(user?.role || "").trim().toLowerCase());
}

function html(payload, status = 200) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return new Response(`<pre>${body.replace(/[&<>]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  }[char]))}</pre>`, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "data-box", "manage");
  if (response) return response;

  if (!canCleanupDataBox(user)) {
    return html({ error: "Nemate opravneni cistit zpravy Datove schranky." }, 403);
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") !== "false";
  const confirm = String(url.searchParams.get("confirm") || "");

  if (!dryRun && confirm !== CLEANUP_CONFIRMATION) {
    return html({
      error: "Cleanup vyzaduje potvrzeni.",
      requiredConfirm: CLEANUP_CONFIRMATION
    }, 400);
  }

  try {
    const result = await cleanupDuplicatedDataBoxMessages(env, {
      dryRun,
      sourceDataBoxId: url.searchParams.get("sourceDataBoxId") || "kaiser-primary",
      targetDataBoxId: url.searchParams.get("targetDataBoxId") || "kaiser-data-box-3",
      changedByUserId: user?.id || user?.email || "system"
    });
    return html(result);
  } catch (error) {
    const result = dataBoxStoreErrorResponse(error);
    return html(result.payload, result.status);
  }
}
