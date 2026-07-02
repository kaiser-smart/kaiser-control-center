import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  return cleanString(error?.message || error?.name || "unknown_error");
}

export async function onRequestPost({ request, env }) {
  try {
    const { response } = await requireUserPermission(env, request, "settings", "manage");

    if (response) {
      return response;
    }

    const payload = await readJson(request);
    if (payload?.apply !== true) {
      return json({
        error: "Vytvoření Smart 2 vyžaduje potvrzení apply: true.",
        code: "APPLY_REQUIRED",
        apiStatus: "waiting"
      }, 409);
    }

    return json({
      error: "Automatické vytvoření Smart 2 z KSO je vypnuté. Testovací agent se musí založit jako čistý nový agent v ElevenLabs přes Nový agent / Prázdný agent.",
      code: "SMART_2_CREATE_DISABLED_USE_BLANK_AGENT",
      apiStatus: "waiting"
    }, 409);
  } catch (error) {
    console.error("elevenlabs.sarlota_smart_2_create_disabled_failed", {
      message: safeErrorMessage(error),
      status: error?.status || 500
    });

    return json({
      error: "Kontrola vytvoření ElevenLabs agenta Smart 2 se nepodařila.",
      code: "ELEVENLABS_SMART_2_CREATE_DISABLED_CHECK_FAILED",
      apiStatus: "waiting"
    }, error?.status && error.status >= 400 && error.status < 600 ? error.status : 500);
  }
}
