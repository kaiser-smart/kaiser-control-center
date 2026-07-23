import { json, readJson, requireUserPermission } from "../../../../_lib/auth.js";
import {
  encodeReceivablesKbOAuthState,
  ReceivablesKbOAuthHandoffError
} from "../../../../_lib/receivables-kb-oauth-handoff.js";

const STATE_TTL_SECONDS = 15 * 60;

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  try {
    const body = await readJson(request);
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const state = await encodeReceivablesKbOAuthState({
      nonce,
      publicKey: body.publicKey,
      subject: user.id
    }, env);
    return json({
      state,
      nonce,
      expiresInSeconds: STATE_TTL_SECONDS,
      signed: true,
      refreshTokenVisible: false
    });
  } catch (error) {
    const normalized = error instanceof ReceivablesKbOAuthHandoffError
      ? error
      : new ReceivablesKbOAuthHandoffError("Vytvoření OAuth state selhalo.", 400);
    return json({ error: normalized.message, code: normalized.code }, normalized.status || 400);
  }
}

export async function onRequestGet() {
  return json({ error: "OAuth state lze vytvořit pouze zabezpečeným POST požadavkem." }, 405, {
    Allow: "POST"
  });
}
