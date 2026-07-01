import { json, requireUserPermission } from "../../../_lib/auth.js";
import { recordAiAction } from "../../../_lib/ai-action-log-store.js";
import {
  recordSarlotaIntroAnnouncement,
  sarlotaIntroAnnouncementForAi
} from "../../../_lib/ai-session-announcements.js";
import {
  introAnnouncementFallbackForAi,
  userDynamicVariablesForAi
} from "../../../_lib/ai-people-summary.js";
import { driverReportVehicleDynamicVariables } from "../../../_lib/fleet-vehicles-store.js";
import { sarlotaHumanTouchContext } from "../../../_lib/sarlota-human-touch.js";

const ASSISTANTS = {
  sarlota: {
    id: "sarlota",
    name: "Šarlota",
    agentEnvKeys: ["ELEVENLABS_AGENT_ID_SARLOTA", "VITE_ELEVENLABS_AGENT_ID_SARLOTA"]
  },
  marek: {
    id: "marek",
    name: "Marek",
    agentEnvKeys: ["ELEVENLABS_AGENT_ID_MAREK", "VITE_ELEVENLABS_AGENT_ID_MAREK"]
  }
};

function cleanString(value) {
  return String(value ?? "").trim();
}

function isDebugRequest(request) {
  const url = new URL(request.url);
  return cleanString(url.searchParams.get("debug")) === "codex";
}

function maskAgentId(agentId) {
  const value = cleanString(agentId);
  if (!value) {
    return null;
  }

  if (value.length <= 12) {
    return `${value.slice(0, 4)}…${value.slice(-2)}`;
  }

  return `${value.slice(0, 10)}…${value.slice(-4)}`;
}

function safeExcerpt(value, { apiKey = "", agentId = "" } = {}) {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? {});
  const agentIdMasked = maskAgentId(agentId);
  const cleanApiKey = cleanString(apiKey);
  let excerpt = raw
    .replace(/("signed_url"\s*:\s*")[^"]+(")/gi, "$1[redacted-signed-url]$2")
    .replace(/(conversation_signature=)[^&"'\s]+/gi, "$1[redacted-signature]")
    .replace(/(xi-api-key["'\s:=]+)["']?[^"',}\s]+/gi, "$1[redacted-api-key]");

  if (cleanApiKey) {
    excerpt = excerpt.replaceAll(cleanApiKey, "[redacted-api-key]");
  }

  if (agentId && agentIdMasked) {
    excerpt = excerpt.replaceAll(agentId, agentIdMasked);
  }

  return excerpt.slice(0, 500);
}

function diagnosticPayload({
  responseFromElevenLabs = null,
  responseBody = "",
  assistant,
  apiKey,
  agentId,
  contextWarnings = []
}) {
  return {
    upstreamStatus: responseFromElevenLabs?.status ?? null,
    upstreamStatusText: responseFromElevenLabs?.statusText || "",
    upstreamBodyExcerpt: safeExcerpt(responseBody, { apiKey, agentId }),
    assistantId: assistant.id,
    apiKeyPresent: Boolean(apiKey),
    agentIdPresent: Boolean(agentId),
    agentIdMasked: maskAgentId(agentId),
    contextWarnings,
    endpoint: "get-signed-url"
  };
}

function assistantFor(request) {
  const url = new URL(request.url);
  const assistantId = cleanString(url.searchParams.get("assistant") || "sarlota").toLowerCase();
  return ASSISTANTS[assistantId] || ASSISTANTS.sarlota;
}

function agentIdFor(env, assistant) {
  return assistant.agentEnvKeys
    .map((key) => cleanString(env?.[key]))
    .find(Boolean) || "";
}

function safeErrorMessage(error) {
  return cleanString(error?.message || error?.name || "unknown_error");
}

function fallbackHumanTouchVariables() {
  return {
    human_touch_enabled: "ne",
    human_touch_suggestion: "",
    human_touch_type: "",
    human_touch_source: ""
  };
}

function fallbackDriverReportVehicleVariables() {
  return {
    driver_report_vehicle_status: "nenalezeno",
    driver_report_vehicle_id: "",
    driver_report_vehicle_name: "",
    driver_report_vehicle_license_plate: "",
    driver_report_vehicle_vin: "",
    driver_report_vehicle_type: "",
    driver_report_vehicle_options_count: "0",
    driver_report_vehicle_options: "",
    driver_report_vehicle_selection_question: "Nemám u tebe teď přiřazené žádné vozidlo. Můžeš mi říct SPZ, ke které chceš závadu nahlásit?",
    driver_report_vehicle_context: "V Hlášení řidičů není vozidlo podle volajícího jistě přiřazené. Neříkej, že máš vozidla načtená, a požádej o SPZ pro ruční ověření."
  };
}

function fallbackIntroAnnouncement(user) {
  return {
    enabled: false,
    variables: {
      intro_announcement: introAnnouncementFallbackForAi(user),
      intro_announcement_enabled: "ne",
      intro_announcement_key: "fallback",
      intro_announcement_until: "",
      intro_announcement_limit: "0",
      intro_announcement_remaining_after_this: "0"
    }
  };
}

async function optionalContext(name, loader, fallback, warnings) {
  try {
    return await loader();
  } catch (error) {
    console.error("elevenlabs.optional_context_failed", {
      context: name,
      message: safeErrorMessage(error)
    });
    warnings.push(name);
    return typeof fallback === "function" ? fallback() : fallback;
  }
}

async function sarlotaHumanTouchDynamicVariables(env, user, baseDynamicVariables, assistant) {
  if (assistant.id !== "sarlota") {
    return fallbackHumanTouchVariables();
  }

  const humanTouch = await sarlotaHumanTouchContext(env, user, {
    dynamic_variables: baseDynamicVariables
  });
  const suggestion = Array.isArray(humanTouch.suggestions) ? humanTouch.suggestions[0] : null;

  return {
    human_touch_enabled: humanTouch.enabled && suggestion?.text ? "ano" : "ne",
    human_touch_suggestion: suggestion?.text || "",
    human_touch_type: suggestion?.type || "",
    human_touch_source: suggestion?.source || ""
  };
}

async function signedUrlPayload({ request, env, user, assistant, debug }) {
  const apiKey = cleanString(env.ELEVENLABS_API_KEY);
  const agentId = agentIdFor(env, assistant);
  const contextWarnings = [];
  const userDynamicVariables = userDynamicVariablesForAi(user);
  const introAnnouncement = await optionalContext(
    "intro_announcement",
    () => sarlotaIntroAnnouncementForAi(env, user, assistant),
    () => fallbackIntroAnnouncement(user),
    contextWarnings
  );
  const humanTouchVariables = await optionalContext(
    "human_touch",
    () => sarlotaHumanTouchDynamicVariables(env, user, userDynamicVariables, assistant),
    fallbackHumanTouchVariables,
    contextWarnings
  );
  const driverReportVehicleVariables = assistant.id === "sarlota"
    ? await optionalContext(
      "driver_report_vehicle",
      () => driverReportVehicleDynamicVariables(env, user),
      fallbackDriverReportVehicleVariables,
      contextWarnings
    )
    : {};
  const dynamicVariables = {
    ...userDynamicVariables,
    ...introAnnouncement.variables,
    ...humanTouchVariables,
    ...driverReportVehicleVariables
  };

  if (!apiKey || !agentId) {
    return json({
      error: "ElevenLabs není nastavený. Doplňte ELEVENLABS_API_KEY a Agent ID pro vybraného asistenta.",
      assistantId: assistant.id,
      assistantName: assistant.name,
      configured: false,
      apiStatus: "waiting"
    }, 503);
  }

  const signedUrl = new URL("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url");
  signedUrl.searchParams.set("agent_id", agentId);
  signedUrl.searchParams.set("include_conversation_id", "true");

  try {
    const responseFromElevenLabs = await fetch(signedUrl.toString(), {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
        Accept: "application/json"
      }
    });
    const responseBody = await responseFromElevenLabs.text();
    let payload = {};
    try {
      payload = JSON.parse(responseBody || "{}");
    } catch {
      payload = {};
    }

    if (!responseFromElevenLabs.ok || !payload.signed_url) {
      const debugPayload = diagnosticPayload({
        responseFromElevenLabs,
        responseBody: responseBody || { error: "missing_signed_url" },
        assistant,
        apiKey,
        agentId,
        contextWarnings
      });

      console.error("elevenlabs.signed_url_failed", debugPayload);

      if (debug) {
        return json({
          ok: false,
          message: "ElevenLabs session se nepodařilo připravit.",
          debug: debugPayload
        }, 502);
      }

      return json({
        error: "ElevenLabs session se nepodařilo připravit.",
        assistantId: assistant.id,
        assistantName: assistant.name,
        configured: true,
        apiStatus: "waiting"
      }, 502);
    }

    await recordAiAction(env, user, {
      assistantId: assistant.id,
      assistantName: assistant.name,
      actionType: "session",
      toolName: "elevenlabs_signed_url",
      input: { assistantId: assistant.id },
      result: {
        configured: true,
        userRole: cleanString(dynamicVariables.user_role),
        availableModulesLength: cleanString(dynamicVariables.available_modules).length,
        humanTouchEnabled: dynamicVariables.human_touch_enabled,
        humanTouchType: dynamicVariables.human_touch_type,
        contextWarnings
      },
      status: "ok"
    });
    await recordSarlotaIntroAnnouncement(env, user, assistant, introAnnouncement);

    return json({
      signedUrl: payload.signed_url,
      conversationId: payload.conversation_id || "",
      assistantId: assistant.id,
      assistantName: assistant.name,
      dynamicVariables,
      configured: true,
      apiStatus: "ready"
    });
  } catch (error) {
    const debugPayload = diagnosticPayload({
      responseBody: { error: error.message || "fetch_failed" },
      assistant,
      apiKey,
      agentId,
      contextWarnings
    });

    console.error("elevenlabs.signed_url_error", debugPayload);

    if (debug) {
      return json({
        ok: false,
        message: "ElevenLabs teď neodpověděl.",
        debug: debugPayload
      }, 502);
    }

    return json({
      error: "ElevenLabs teď neodpověděl.",
      assistantId: assistant.id,
      assistantName: assistant.name,
      configured: true,
      apiStatus: "waiting"
    }, 502);
  }
}

function signedUrlServerErrorResponse({ error, assistant, debug, stage }) {
  const debugPayload = {
    assistantId: assistant.id,
    assistantName: assistant.name,
    stage,
    message: safeErrorMessage(error),
    endpoint: "get-signed-url"
  };

  console.error("elevenlabs.signed_url_server_error", debugPayload);

  return json({
    error: "Hlas Šarloty se teď nepodařilo připravit na serveru.",
    code: "elevenlabs_server_error",
    assistantId: assistant.id,
    assistantName: assistant.name,
    configured: false,
    apiStatus: "waiting",
    ...(debug ? { debug: debugPayload } : {})
  }, 500);
}

export async function onRequestGet({ request, env }) {
  const assistant = assistantFor(request);
  const debug = isDebugRequest(request);

  try {
    const { user, response } = await requireUserPermission(env, request, "dashboard", "view");

    if (response) {
      return response;
    }

    return await signedUrlPayload({ request, env, user, assistant, debug });
  } catch (error) {
    return signedUrlServerErrorResponse({
      error,
      assistant,
      debug,
      stage: "request"
    });
  }
}
