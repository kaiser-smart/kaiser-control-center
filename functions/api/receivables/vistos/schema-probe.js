import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  createReceivablesVistosSchemaProbe,
  receivablesVistosSchemaProbeError
} from "../../../_lib/receivables-vistos-schema-probe.js";

function previewOptions(request) {
  const url = new URL(request.url);
  return {
    pageSize: url.searchParams.get("pageSize"),
    maxPages: url.searchParams.get("maxPages"),
    maxColumnsPerEntity: url.searchParams.get("maxColumnsPerEntity")
  };
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  try {
    const preview = await createReceivablesVistosSchemaProbe(env, previewOptions(request));
    return json({ preview, apiStatus: preview.apiStatus || "ready" });
  } catch (error) {
    const { payload, status } = receivablesVistosSchemaProbeError(error);
    return json(payload, status);
  }
}
