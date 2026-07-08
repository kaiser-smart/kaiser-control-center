import { json } from "../../_lib/auth.js";
import { dataBoxPlusStoreErrorResponse, runDataBoxPlusSync } from "../../_lib/data-box-plus-store.js";

function requestToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  return bearer || request.headers.get("X-DSP-Sync-Token") || "";
}

function safeToken(value) {
  return String(value || "").trim();
}

function tokenMatches(received, expected) {
  const left = safeToken(received);
  const right = safeToken(expected);
  if (!left || !right || left.length !== right.length) return false;

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!tokenMatches(requestToken(request), env.DATA_BOX_PLUS_SYNC_TOKEN)) {
    return json({ error: "Interní načítání Datových schránek Plus není povolené." }, 401);
  }

  try {
    return json(await runDataBoxPlusSync(env, {
      id: "cloudflare-scheduler",
      name: "Autopilot"
    }, {
      triggerType: "cloud-scheduler"
    }));
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}

export async function onRequestGet() {
  return json({ error: "Tahle interní akce je dostupná jen pro plánované serverové načítání." }, 405, {
    Allow: "POST"
  });
}
