import { currentUser, json, publicUser, verifySession } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);

  if (!user) {
    return json({ error: "Nepřihlášeno." }, 401);
  }

  const session = await verifySession(env, request);
  if (!session) return json({ error: "Nepřihlášeno." }, 401);
  return json({ user: publicUser(user), sessionExpiresAt: session.exp * 1000 });
}
