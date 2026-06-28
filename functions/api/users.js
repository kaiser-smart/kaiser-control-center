import { getUsers, json, publicUser, readJson, requireUserPermission } from "../_lib/auth.js";
import { UserStoreError, saveStoredUser } from "../_lib/users-store.js";
import { isFullAccessRole } from "../../src/permissions.js";

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

function sameUserId(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function normalizeManagerPayload(payload, users, id = "", currentUser = null) {
  if (!Object.prototype.hasOwnProperty.call(payload || {}, "managerId")) {
    return payload;
  }

  const managerId = String(payload.managerId || "").trim();

  if (managerId && !isFullAccessRole(currentUser)) {
    throw new UserStoreError("Nemáte oprávnění měnit nadřízeného.", 403, "user_manager_forbidden");
  }

  if (managerId && id && sameUserId(managerId, id)) {
    throw new UserStoreError("Uživatel nesmí být sám sobě nadřízený.", 400, "user_manager_self");
  }

  if (!managerId) {
    return {
      ...payload,
      managerId: "",
      managerName: ""
    };
  }

  const manager = users.find((item) => (
    sameUserId(item.id, managerId) &&
    item.active !== false &&
    String(item.status || "active").toLowerCase() !== "disabled"
  ));

  if (!manager) {
    throw new UserStoreError("Vybraný nadřízený není aktivní uživatel.", 400, "user_manager_invalid");
  }

  return {
    ...payload,
    managerId: manager.id,
    managerName: manager.name || ""
  };
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
  const { user, response } = await requireUserPermission(env, request, "users", "edit");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const rawPayload = await readJson(request);
    const payload = normalizeManagerPayload(rawPayload, users, rawPayload?.id || "", user);
    const savedUser = await saveStoredUser(env, payload);
    return json({ user: publicUser(savedUser) }, 201);
  } catch (error) {
    return userSaveError(error);
  }
}
