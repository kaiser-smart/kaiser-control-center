import { json, readJson, requireUserPermission } from "../../_lib/auth.js";

export async function onRequestPatch({ request, env }) {
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
