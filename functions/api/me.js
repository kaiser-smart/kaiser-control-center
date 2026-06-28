import { currentUser, json, publicUser } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);

  if (!user) {
    return json({ error: "Nepřihlášeno." }, 401);
  }

  return json({ user: publicUser(user) });
}
