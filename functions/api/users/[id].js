import { json, publicUser, readJson, requireUserPermission } from "../../_lib/auth.js";
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

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "users", "edit");

  if (response) {
    return response;
  }

  try {
    const id = routeUserId(request, params);
    const payload = await readJson(request);
    const blockedMessage = blocksCurrentUser(user, payload, id);

    if (blockedMessage) {
      return json({ error: blockedMessage }, 400);
    }

    const savedUser = await saveStoredUser(env, { ...payload, id }, { id });
    return json({ user: publicUser(savedUser) });
  } catch (error) {
    return userSaveError(error);
  }
}
