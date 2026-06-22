import { json, readJson, requireUserPermission } from "../../_lib/auth.js";

export async function onRequestPatch({ request, env }) {
  const { response } = await requireUserPermission(env, request, "users", "edit");

  if (response) {
    return response;
  }

  await readJson(request);
  return json(
    {
      error: "Trvalá úprava uživatele vyžaduje D1 databázi. Endpoint je připravený pro další krok."
    },
    501
  );
}
