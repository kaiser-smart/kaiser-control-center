import { json, requireUserPermission } from "../../../../_lib/auth.js";
import {
  exchangeReceivablesKbAuthorizationCode,
  receivablesKbApiError
} from "../../../../_lib/receivables-kb-api-client.js";
import {
  encryptReceivablesKbOAuthHandoff,
  ReceivablesKbOAuthHandoffError,
  validateReceivablesKbOAuthState
} from "../../../../_lib/receivables-kb-oauth-handoff.js";

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff"
};

function clean(value) {
  return String(value ?? "").trim();
}

function callbackError(error) {
  if (error instanceof ReceivablesKbOAuthHandoffError) return error;
  return receivablesKbApiError(error) || {
    message: "Dokončení KB OAuth selhalo.",
    status: 502,
    code: "receivables_kb_oauth_callback_failed"
  };
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  const url = new URL(request.url);
  const upstreamError = clean(url.searchParams.get("error"));
  if (upstreamError) {
    return json({
      error: "KB autorizaci nepotvrdila.",
      code: "receivables_kb_oauth_authorization_rejected",
      apiStatus: "error",
      refreshTokenVisible: false
    }, 400, SECURITY_HEADERS);
  }

  try {
    const state = clean(url.searchParams.get("state"));
    await validateReceivablesKbOAuthState(state, env, { subject: user.id });
    const tokens = await exchangeReceivablesKbAuthorizationCode(
      env,
      url.searchParams.get("code")
    );
    const handoff = await encryptReceivablesKbOAuthHandoff(tokens, state, env, { subject: user.id });
    return json({
      apiStatus: "ready",
      handoff,
      refreshTokenVisible: false,
      accessTokenVisible: false,
      storesToken: false,
      sendsCustomerCommunication: false
    }, 200, SECURITY_HEADERS);
  } catch (error) {
    const normalized = callbackError(error);
    return json({
      error: normalized.message,
      code: normalized.code,
      apiStatus: "error",
      refreshTokenVisible: false
    }, normalized.status || 502, SECURITY_HEADERS);
  }
}

export async function onRequestPost() {
  return json({ error: "KB OAuth callback přijímá pouze bezpečné přesměrování GET." }, 405, {
    ...SECURITY_HEADERS,
    Allow: "GET"
  });
}
