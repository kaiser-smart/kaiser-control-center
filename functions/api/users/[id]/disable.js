import { getUsers, json, publicUser, requireUserPermission } from "../../../_lib/auth.js";
import { UserStoreError, saveStoredUser } from "../../../_lib/users-store.js";

function routeUserId(request, params) {
  const parts = new URL(request.url).pathname.split("/");
  const id = params?.id || parts.at(-2);
  return decodeURIComponent(String(id || "")).trim();
}

function userSaveError(error) {
  if (error instanceof UserStoreError) {
    return json({ error: error.message }, error.status);
  }

  console.error("users.disable_failed", { message: error.message });
  return json(
    {
      error: "Stav uživatele se teď nepodařilo uložit. Zkuste to prosím znovu za chvíli."
    },
    500
  );
}

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "users", "edit");

  if (response) {
    return response;
  }

  try {
    const id = routeUserId(request, params);
    if (String(user?.id || "").trim().toLowerCase() === id.toLowerCase()) {
      return json({ error: "Vlastní účet nejde vypnout, abyste se nezamkli mimo správu." }, 400);
    }

    const users = await getUsers(env);
    const existingUser = users.find((item) => String(item.id || "").trim().toLowerCase() === id.toLowerCase());

    if (!existingUser) {
      return json({ error: "Uživatel nebyl nalezen." }, 404);
    }

    const savedUser = await saveStoredUser(env, {
      ...existingUser,
      id,
      status: "disabled",
      active: false
    }, { id });

    return json({ user: publicUser(savedUser) });
  } catch (error) {
    return userSaveError(error);
  }
}
