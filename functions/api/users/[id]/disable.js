import { json, requireUserPermission } from "../../../_lib/auth.js";

export async function onRequestPatch({ request, env }) {
  const { response } = await requireUserPermission(env, request, "users", "delete");

  if (response) {
    return response;
  }

  return json(
    {
      error: "Stav uživatele se teď nepodařilo uložit. Zkuste to prosím znovu za chvíli."
    },
    501
  );
}
