import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSessionCookie } from "../functions/_lib/auth.js";
import { DEFAULT_USERS } from "../functions/_lib/default-users.js";
import {
  encodeReceivablesKbOAuthState,
  validateReceivablesKbOAuthState
} from "../functions/_lib/receivables-kb-oauth-handoff.js";
import {
  receivablesKbPaymentRunnerStatus,
  RECEIVABLES_KB_PAYMENT_SYNC_URL,
  runReceivablesKbPaymentSyncRemote
} from "../functions/_lib/receivables-kb-payment-runner.js";
import {
  onRequestGet as oauthCallbackGet,
  onRequestPost as oauthCallbackPost
} from "../functions/api/receivables/kb/oauth/callback.js";
import {
  onRequestGet as registrationBackGet,
  onRequestPost as registrationBackPost
} from "../functions/api/receivables/kb/oauth/registration-back.js";
import {
  onRequestGet as oauthStateGet,
  onRequestPost as oauthStatePost
} from "../functions/api/receivables/kb/oauth/state.js";
import {
  onRequestGet as internalSyncGet,
  onRequestPost as internalSyncPost
} from "../functions/api/receivables/kb/payment-sync-internal.js";

function fromBase64Url(value) {
  return Uint8Array.from(Buffer.from(value, "base64url"));
}

const authEnv = {
  AUTH_SESSION_SECRET: "test-session-secret",
  KB_ADAA_ENVIRONMENT: "production",
  KB_ADAA_OAUTH_API_KEY: "oauth-production-key",
  KB_ADAA_CLIENT_ID: "client-id",
  KB_ADAA_CLIENT_SECRET: "client-secret",
  KB_ADAA_REDIRECT_URI: "https://smart-odpady.ai/api/receivables/kb/oauth/callback"
};
const sessionCookie = (await createSessionCookie(authEnv, DEFAULT_USERS[0])).split(";")[0];

const keyPair = await crypto.subtle.generateKey({
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256"
}, true, ["encrypt", "decrypt"]);
const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
const stateResponse = await oauthStatePost({
  request: new Request("https://smart-odpady.ai/api/receivables/kb/oauth/state", {
    method: "POST",
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ publicKey })
  }),
  env: authEnv
});
assert.equal(stateResponse.status, 200);
const statePayload = await stateResponse.json();
const { nonce, state } = statePayload;
const validatedState = await validateReceivablesKbOAuthState(state, authEnv, {
  subject: DEFAULT_USERS[0].id
});
assert.equal(validatedState.nonce, nonce);
assert.equal(validatedState.subject, DEFAULT_USERS[0].id);
assert.equal(validatedState.valid, true);
assert.equal(statePayload.signed, true);
assert.equal((await oauthStateGet()).status, 405);
const unauthenticatedState = await oauthStatePost({
  request: new Request("https://smart-odpady.ai/api/receivables/kb/oauth/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey })
  }),
  env: authEnv
});
assert.equal(unauthenticatedState.status, 401);

const unitState = await encodeReceivablesKbOAuthState({
  nonce: "production-oauth-nonce-20260723",
  publicKey,
  subject: DEFAULT_USERS[0].id
}, authEnv);
const [unitStatePayload, unitStateSignature] = unitState.split(".");
const tamperedState = `${unitStatePayload}.${unitStateSignature[0] === "A" ? "B" : "A"}${unitStateSignature.slice(1)}`;
await assert.rejects(
  () => validateReceivablesKbOAuthState(tamperedState, authEnv, {
    subject: DEFAULT_USERS[0].id
  }),
  /platný podpis/
);
const expiredIssuedAt = Date.now() - (16 * 60 * 1000);
const expiredState = await encodeReceivablesKbOAuthState({
  nonce: "expired-production-oauth-state",
  publicKey,
  subject: DEFAULT_USERS[0].id,
  issuedAt: expiredIssuedAt
}, authEnv);
await assert.rejects(
  () => validateReceivablesKbOAuthState(expiredState, authEnv, {
    subject: DEFAULT_USERS[0].id
  }),
  /platnost/
);

const originalFetch = globalThis.fetch;
let tokenExchangeCalls = 0;
globalThis.fetch = async (url, options = {}) => {
  tokenExchangeCalls += 1;
  assert.equal(String(url), "https://api-gateway.kb.cz/oauth2/v3/access_token");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.apiKey, "oauth-production-key");
  assert.equal(options.body.get("grant_type"), "authorization_code");
  assert.equal(options.body.get("code"), "authorization-code");
  assert.equal(options.body.get("redirect_uri"), authEnv.KB_ADAA_REDIRECT_URI);
  return Response.json({
    access_token: "short-lived-access-token",
    refresh_token: "refresh-token-that-must-not-be-visible",
    token_type: "Bearer",
    expires_in: 180,
    scope: "adaa"
  });
};

let callbackResponse;
try {
  callbackResponse = await oauthCallbackGet({
    request: new Request(
      `${authEnv.KB_ADAA_REDIRECT_URI}?code=authorization-code&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: sessionCookie } }
    ),
    env: authEnv
  });
} finally {
  globalThis.fetch = originalFetch;
}
assert.equal(callbackResponse.status, 200);
assert.equal(tokenExchangeCalls, 1);
assert.equal(callbackResponse.headers.get("Cache-Control"), "no-store");
assert.equal(callbackResponse.headers.get("Referrer-Policy"), "no-referrer");
const callbackText = await callbackResponse.text();
assert.equal(callbackText.includes("refresh-token-that-must-not-be-visible"), false);
assert.equal(callbackText.includes("short-lived-access-token"), false);
const callbackPayload = JSON.parse(callbackText);
assert.equal(callbackPayload.refreshTokenVisible, false);
assert.equal(callbackPayload.handoff.nonce, nonce);

const wrappedAesKey = await crypto.subtle.decrypt(
  { name: "RSA-OAEP" },
  keyPair.privateKey,
  fromBase64Url(callbackPayload.handoff.wrappedKey)
);
const aesKey = await crypto.subtle.importKey("raw", wrappedAesKey, { name: "AES-GCM" }, false, ["decrypt"]);
const plaintext = await crypto.subtle.decrypt({
  name: "AES-GCM",
  iv: fromBase64Url(callbackPayload.handoff.iv),
  additionalData: new TextEncoder().encode(`kb-oauth:${nonce}`),
  tagLength: 128
}, aesKey, fromBase64Url(callbackPayload.handoff.ciphertext));
const decrypted = JSON.parse(new TextDecoder().decode(plaintext));
assert.equal(decrypted.refreshToken, "refresh-token-that-must-not-be-visible");
assert.equal(decrypted.scope, "adaa");

let invalidStateFetchCalled = false;
globalThis.fetch = async () => {
  invalidStateFetchCalled = true;
  throw new Error("must not exchange a code for invalid state");
};
let invalidStateResponse;
try {
  invalidStateResponse = await oauthCallbackGet({
    request: new Request(`${authEnv.KB_ADAA_REDIRECT_URI}?code=one-time-code&state=invalid`, {
      headers: { Cookie: sessionCookie }
    }),
    env: authEnv
  });
} finally {
  globalThis.fetch = originalFetch;
}
assert.equal(invalidStateResponse.status, 400);
assert.equal(invalidStateFetchCalled, false);

const unauthenticatedCallback = await oauthCallbackGet({
  request: new Request(authEnv.KB_ADAA_REDIRECT_URI),
  env: authEnv
});
assert.equal(unauthenticatedCallback.status, 401);
assert.equal((await oauthCallbackPost()).status, 405);

const registrationUrl = "https://smart-odpady.ai/api/receivables/kb/oauth/registration-back?salt=YWJjZGVmZ2g=&encryptedData=QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=";
const registrationResponse = await registrationBackGet({
  request: new Request(registrationUrl, { headers: { Cookie: sessionCookie } }),
  env: authEnv
});
assert.equal(registrationResponse.status, 200);
assert.equal(registrationResponse.headers.get("Cache-Control"), "no-store");
const registrationHtml = await registrationResponse.text();
assert.equal(registrationHtml.includes("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo="), false);
assert.equal((await registrationBackPost()).status, 405);

const unauthorizedInternal = await internalSyncPost({
  request: new Request("https://smart-odpady.ai/api/receivables/kb/payment-sync-internal", {
    method: "POST",
    headers: { Authorization: "Bearer wrong" }
  }),
  env: { KB_RECEIVABLES_RUNNER_TOKEN: "expected" }
});
assert.equal(unauthorizedInternal.status, 401);
assert.equal((await unauthorizedInternal.json()).code, "receivables_kb_runner_unauthorized");

const waitingInternal = await internalSyncPost({
  request: new Request("https://smart-odpady.ai/api/receivables/kb/payment-sync-internal", {
    method: "POST",
    headers: {
      Authorization: "Bearer expected",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ scheduledTime: Date.now(), cron: "7 */2 * * *" })
  }),
  env: { KB_RECEIVABLES_RUNNER_TOKEN: "expected" }
});
assert.equal(waitingInternal.status, 200);
assert.equal((await waitingInternal.json()).result.status, "waiting_configuration");
assert.equal((await internalSyncGet()).status, 405);

const remoteCalls = [];
const remoteResult = await runReceivablesKbPaymentSyncRemote(
  { KB_RECEIVABLES_RUNNER_TOKEN: "runner-secret" },
  {
    scheduledTime: 1784768400000,
    cron: "7 */2 * * *",
    fetchImpl: async (url, options) => {
      remoteCalls.push({ url, options });
      return Response.json({
        result: {
          mode: "cloud_payment_import",
          status: "completed",
          importsKbPayments: true,
          summary: { insertedCount: 2, updatedCount: 0, ignoredCount: 1 }
        }
      });
    }
  }
);
assert.equal(remoteResult.status, "completed");
assert.equal(remoteCalls.length, 1);
assert.equal(remoteCalls[0].url, RECEIVABLES_KB_PAYMENT_SYNC_URL);
assert.equal(remoteCalls[0].options.headers.Authorization, "Bearer runner-secret");
assert.equal(JSON.parse(remoteCalls[0].options.body).runner, "kaiser-receivables-kb-payment-runner");

const missingRunnerToken = await runReceivablesKbPaymentSyncRemote({});
assert.equal(missingRunnerToken.status, "waiting_configuration");
assert.equal(receivablesKbPaymentRunnerStatus({}, "7 */2 * * *").storesKbApiKeys, false);

const workerConfig = readFileSync(new URL("../wrangler.receivables-kb-payment-runner.toml", import.meta.url), "utf8");
assert.equal(workerConfig.includes("[[d1_databases]]"), false);
assert.equal(workerConfig.includes("KB_ADAA_OAUTH_API_KEY"), false);

console.log("receivables KB production onboarding tests passed");
