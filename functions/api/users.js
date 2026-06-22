import { getUsers, json, publicUser, readJson, requireUserPermission } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "users", "view");

  if (response) {
    return response;
  }

  const users = await getUsers(env);
  return json({ users: users.map(publicUser) });
}

export async function onRequestPost({ request, env }) {
  const { response } = await requireUserPermission(env, request, "users", "edit");

  if (response) {
    return response;
  }

  await readJson(request);
  return json(
    {
      error: "Změny se teď nepodařilo uložit. Zkuste to prosím znovu za chvíli."
    },
    501
  );
}
