import { getUsers, json, publicUser, readJson, requireUserPermission } from "../../_lib/auth.js";
import { UserStoreError, normalizeUserInput, saveStoredUser } from "../../_lib/users-store.js";
import { isFullAccessRole } from "../../../src/permissions.js";

function routeUserId(request, params) {
  const id = params?.id || new URL(request.url).pathname.split("/").at(-1);
  return decodeURIComponent(String(id || "")).trim();
}

function userSaveError(error) {
  if (error instanceof UserStoreError) {
    return json({ error: error.message }, error.status);
  }

  console.error("users.patch_failed", { message: error.message });
  return json(
    {
      error: "Změny se teď nepodařilo uložit. Zkuste to prosím znovu za chvíli."
    },
    500
  );
}

function blocksCurrentUser(user, payload, id) {
  const currentUserId = String(user?.id || "").trim().toLowerCase();
  const targetId = String(id || "").trim().toLowerCase();

  if (!currentUserId || currentUserId !== targetId) {
    return "";
  }

  const active = payload?.active !== false && String(payload?.status || "active").toLowerCase() !== "disabled";
  if (!active) {
    return "Vlastní účet nejde vypnout, abyste se nezamkli mimo správu.";
  }

  const normalizedPayload = normalizeUserInput({ ...payload, id }, { id, now: user?.updatedAt || new Date().toISOString() });
  if (isFullAccessRole(user) && !isFullAccessRole(normalizedPayload)) {
    return "Vlastní účet s plným přístupem nejde změnit na omezenou roli.";
  }

  return "";
}

function sameUserId(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function normalizeManagerPayload(payload, users, id, currentUser, existingUser) {
  if (!Object.prototype.hasOwnProperty.call(payload || {}, "managerId")) {
    return payload;
  }

  const managerId = String(payload.managerId || "").trim();
  const previousManagerId = String(existingUser?.managerId || "").trim().toLowerCase();

  if (managerId.toLowerCase() !== previousManagerId && !isFullAccessRole(currentUser)) {
    throw new UserStoreError("Nemáte oprávnění měnit nadřízeného.", 403, "user_manager_forbidden");
  }

  if (managerId && sameUserId(managerId, id)) {
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

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "users", "edit");

  if (response) {
    return response;
  }

  try {
    const id = routeUserId(request, params);
    const users = await getUsers(env);
    const existingUser = users.find((item) => sameUserId(item.id, id));

    if (!existingUser) {
      return json({ error: "Uživatel nebyl nalezen." }, 404);
    }

    const payload = normalizeManagerPayload(await readJson(request), users, id, user, existingUser);
    const nextUser = {
      ...existingUser,
      ...payload,
      id
    };
    const blockedMessage = blocksCurrentUser(user, nextUser, id);

    if (blockedMessage) {
      return json({ error: blockedMessage }, 400);
    }

    const savedUser = await saveStoredUser(env, nextUser, { id });
    return json({ user: publicUser(savedUser) });
  } catch (error) {
    return userSaveError(error);
  }
}
