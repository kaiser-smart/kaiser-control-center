import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  createReceivablesVistosInvoiceDiscovery,
  receivablesVistosPreviewError
} from "../../_lib/receivables-vistos-preview.js";

export async function onRequestPost({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  try {
    const discovery = await createReceivablesVistosInvoiceDiscovery(env);
    return json({ discovery, apiStatus: discovery.apiStatus || "ready" });
  } catch (error) {
    const { payload, status } = receivablesVistosPreviewError(error);
    return json(payload, status);
  }
}
