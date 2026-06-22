import { getUsers, json, publicUser, readJson, requireUserPermission } from "../_lib/auth.js";
import { UserStoreError, saveStoredUser } from "../_lib/users-store.js";

function userSaveError(error) {
  if (error instanceof UserStoreError) {
    return json({ error: error.message }, error.status);
  }

  console.error("users.save_failed", { message: error.message });
  return json(
    {
      error: "Změny se teď nepodařilo uložit. Zkuste to prosím znovu za chvíli."
    },
    500
  );
}

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

  try {
    const payload = await readJson(request);
    const user = await saveStoredUser(env, payload);
    return json({ user: publicUser(user) }, 201);
  } catch (error) {
    return userSaveError(error);
  }
}
