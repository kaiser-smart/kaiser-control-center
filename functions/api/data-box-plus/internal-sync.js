import { json } from "../../_lib/auth.js";
import { dataBoxPlusStoreErrorResponse, runDataBoxPlusSync, planDataBoxPlusSync, completeDataBoxPlusSync } from "../../_lib/data-box-plus-store.js";

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
    const body = await request.json().catch(() => ({}));
    const actor = { id: "cloudflare-scheduler", name: "Autopilot" };
    if (body.mode === "plan") return json(await planDataBoxPlusSync(env));
    if (body.mode === "complete") return json(await completeDataBoxPlusSync(env, actor, body.results));
    return json(await runDataBoxPlusSync(env, actor, {
      triggerType: body.mailboxId ? "cloud-scheduler-mailbox" : "cloud-scheduler",
      mailboxId: body.mailboxId
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
