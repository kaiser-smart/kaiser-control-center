import {
  checkRateLimit,
  findAllowedUser,
  isMockEnabled,
  json,
  normalizeIdentifier,
  rateLimitKey,
  readJson,
  startTwilioVerification
} from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const { identifier } = await readJson(request);
  const normalized = normalizeIdentifier(identifier);

  if (!normalized) {
    return json({ error: "Vyplňte e-mail nebo telefon." }, 400);
  }

  if (!checkRateLimit(rateLimitKey(request, "start", normalized), 6)) {
    return json({ ok: true });
  }

  const user = await findAllowedUser(env, normalized);

  if (!user) {
    console.log("auth.start.ignored", { identifierType: normalized.includes("@") ? "email" : "phone" });
    return json({ ok: true });
  }

  if (isMockEnabled(env)) {
    console.log("auth.start.mock", { userId: user.id });
    return json({ ok: true, mock: true });
  }

  try {
    await startTwilioVerification(env, normalized);
    console.log("auth.start.sent", { userId: user.id });
    return json({ ok: true });
  } catch (error) {
    console.error("auth.start.failed", { message: error.message });
    return json({ error: "Ověřovací kód teď nejde odeslat." }, 503);
  }
}
