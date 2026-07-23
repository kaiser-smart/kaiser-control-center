import { json } from "../../_lib/auth.js";
import {
  dataBoxPlusStoreErrorResponse,
  runDataBoxPlusArchiveBatch
} from "../../_lib/data-box-plus-store.js";

function tokenFromRequest(request) {
  const authorization = request.headers.get("Authorization") || "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]
    || request.headers.get("X-DSP-Sync-Token")
    || "";
}

function tokenMatches(received, expected) {
  const left = String(received || "").trim();
  const right = String(expected || "").trim();
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!tokenMatches(tokenFromRequest(request), env.DATA_BOX_PLUS_SYNC_TOKEN)) {
    return json({ error: "Interní archiv Datových schránek Plus není povolený." }, 401);
  }
  try {
    return json(await runDataBoxPlusArchiveBatch(env, {
      id: "cloudflare-archive-runner",
      name: "Archiv KSO"
    }, {
      triggerType: "cloud-archive-runner"
    }));
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}

export async function onRequestGet() {
  return json({ error: "Archivní dávku může spouštět jen interní cloudový runner." }, 405, {
    Allow: "POST"
  });
}
