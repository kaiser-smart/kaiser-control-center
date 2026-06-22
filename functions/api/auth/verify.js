import {
  checkRateLimit,
  createSessionCookie,
  findAllowedUser,
  isMockEnabled,
  json,
  normalizeIdentifier,
  publicUser,
  rateLimitKey,
  readJson,
  verifyTwilioCode
} from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const { identifier, code } = await readJson(request);
  const normalized = normalizeIdentifier(identifier);
  const otp = String(code || "").trim();

  if (!normalized || !otp) {
    return json({ error: "Přihlášení se nepodařilo." }, 400);
  }

  if (!checkRateLimit(rateLimitKey(request, "verify", normalized), 8)) {
    return json({ error: "Přihlášení se nepodařilo." }, 429);
  }

  const user = await findAllowedUser(env, normalized);

  if (!user) {
    console.log("auth.verify.denied", { reason: "user_not_allowed" });
    return json({ error: "Přihlášení se nepodařilo." }, 401);
  }

  let verified = false;

  if (isMockEnabled(env)) {
    verified = otp === "123456";
  } else {
    try {
      verified = await verifyTwilioCode(env, normalized, otp);
    } catch (error) {
      console.error("auth.verify.failed", { message: error.message });
      return json({ error: "Přihlášení se nepodařilo." }, 503);
    }
  }

  if (!verified) {
    console.log("auth.verify.denied", { reason: "bad_code", userId: user.id });
    return json({ error: "Přihlášení se nepodařilo." }, 401);
  }

  const sessionCookie = await createSessionCookie(env, user);
  console.log("auth.verify.success", { userId: user.id, role: user.role });

  return json(
    {
      ok: true,
      user: publicUser({
        ...user,
        lastLoginAt: new Date().toISOString()
      })
    },
    200,
    { "Set-Cookie": sessionCookie }
  );
}
