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
import { dataBoxAssistantContext } from "../../../_lib/data-box-store.js";
import { getMyCollectionDailyRoute } from "../../../_lib/collection-daily-routes-store.js";
import { sarlotaHumanTouchContext } from "../../../_lib/sarlota-human-touch.js";
import {
  assistantConfigFromRequest,
  assistantPublicMetadata,
  maskElevenLabsAgentId
} from "../../../../src/elevenLabsAssistants.js";

const DRIVER_REPORT_NO_VEHICLE_DIAGNOSTIC_MODE = "identity_no_driver_vehicles";

function cleanString(value) {
  return String(value ?? "").trim();
}

function fallbackConversationId() {
  return `kso-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function dynamicVariablesWithConversationId(dynamicVariables = {}, conversationId = "", fallbackId = "") {
  const safeConversationId = cleanString(conversationId) || cleanString(fallbackId) || fallbackConversationId();

  return {
    ...(dynamicVariables && typeof dynamicVariables === "object" && !Array.isArray(dynamicVariables) ? dynamicVariables : {}),
    conversation_id: safeConversationId
  };
}

function isDebugRequest(request) {
  const url = new URL(request.url);
  return cleanString(url.searchParams.get("debug")) === "codex";
}

function shouldOmitDriverReportVehicleContext(request, assistant) {
  if (assistant.assistantType !== "sarlota") {
    return false;
  }

  const url = new URL(request.url);
  const includeForExplicitDiagnostic = cleanString(url.searchParams.get("includeDriverReportVehicles")) === "true";
  if (includeForExplicitDiagnostic) {
    return false;
  }

  return true;
}

function maskAgentId(agentId) {
  return maskElevenLabsAgentId(agentId) || null;
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
    assistantId: assistant.assistantKey,
    apiKeyPresent: Boolean(apiKey),
    agentIdPresent: Boolean(agentId),
    agentIdMasked: maskAgentId(agentId),
    contextWarnings,
    endpoint: "get-signed-url"
  };
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
    driver_report_vehicle_selection_question: "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.",
    driver_report_vehicle_context: "V Hlášení řidičů použij ověřený backend seznam, bezpečný výběr v aplikaci, nebo nouzově značku, typ či SPZ."
  };
}

function dataBoxContextVariables(context = {}) {
  const route = cleanString(context.route || "/datove-schranky-plus");
  return {
    current_module: cleanString(context.module || "Datová schránka"),
    current_module_route: route,
    current_module_context: JSON.stringify({
      module: cleanString(context.module || "Datová schránka"),
      state: cleanString(context.state || "unavailable"),
      apiStatus: cleanString(context.apiStatus || "waiting"),
      integrationStatus: cleanString(context.integrationStatus || "inactive"),
      mode: cleanString(context.mode || "pilot"),
      mailboxesCount: Number(context.mailboxesCount || 0),
      receivedCount: Number(context.receivedCount || 0),
      sentCount: Number(context.sentCount || 0),
      attachmentsCount: Number(context.attachmentsCount || 0),
      lastSyncAt: cleanString(context.lastSyncAt),
      safety: cleanString(context.safety)
    })
  };
}

export async function collectionRoutesContextVariables(env, user, requestedRoute = "/trasy-svozu", detailOverride = undefined) {
  const scope = requestedRoute === "/trasy-svozu/test" ? "test" : "production";
  const detail = detailOverride === undefined
    ? await getMyCollectionDailyRoute(env, user, { scope })
    : detailOverride;
  const run = detail?.run || null;
  const stops = Array.isArray(detail?.stops) ? detail.stops : [];
  const currentStop = stops.find((stop) => stop.status === "planned") || null;
  const nextStop = currentStop;
  return {
    current_module: "Svozové trasy",
    current_module_route: requestedRoute,
    current_module_context: JSON.stringify({
      module: "Svozové trasy",
      route: requestedRoute,
      mode: "driver-tablet",
      dataScope: scope,
      routeId: cleanString(run?.id),
      routeStatus: cleanString(run?.status || "none"),
      actorUserId: cleanString(user?.id),
      actorName: cleanString(user?.name || user?.email),
      vehicle: cleanString(run?.vehicleLabel || run?.vehicleRegistration || run?.vehicleCode),
      plannedCount: Number(run?.summary?.plannedCount || 0),
      doneCount: Number(run?.summary?.doneCount || 0),
      problemCount: Number(run?.summary?.problemCount || 0),
      currentStop: currentStop ? {
        id: cleanString(currentStop.id),
        order: Number(currentStop.routeOrder || 0),
        customerName: cleanString(currentStop.customerName),
        stationName: cleanString(currentStop.stationName),
        address: cleanString(currentStop.addressText),
        wasteType: cleanString(currentStop.wasteType)
      } : null,
      nextNavigationAddress: cleanString(nextStop?.addressText),
      physicalTesterName: scope === "test" ? cleanString(run?.metadata?.physicalTesterName || "Tomáš Gaží") : "",
      navigationMode: "physical-tap-opens-google-maps",
      safety: "Šarlota smí vysvětlovat aktuální trasu a připravit hlášení. Nesmí sama označit HOTOVO, spustit či ukončit přestávku nebo výsyp ani uložit hlášení. Každý zápis vyžaduje fyzické klepnutí řidiče. Nikdy neposílej zákaznickou zprávu a nikdy nezapisuj do Vistosu."
    }),
    collection_route_scope: scope,
    collection_route_status: cleanString(run?.status || "none"),
    collection_route_current_stop: cleanString(currentStop?.customerName || currentStop?.stationName),
    collection_route_current_address: cleanString(currentStop?.addressText),
    collection_route_safety: "Všechny zápisy čekají na fyzické potvrzení v tabletu."
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
  if (assistant.assistantType !== "sarlota") {
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
  const agentId = assistant.agentId;
  const contextWarnings = [];
  const omitDriverReportVehicleContext = shouldOmitDriverReportVehicleContext(request, assistant);
  const requestedRoute = cleanString(new URL(request.url).searchParams.get("currentRoute"));
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
  const driverReportVehicleVariables = assistant.assistantType === "sarlota" && !omitDriverReportVehicleContext
    ? await optionalContext(
      "driver_report_vehicle",
      () => driverReportVehicleDynamicVariables(env, user),
      fallbackDriverReportVehicleVariables,
      contextWarnings
    )
    : {};
  if (omitDriverReportVehicleContext) {
    contextWarnings.push("driver_report_vehicle_omitted_for_diagnostic");
  }
  const dataBoxVariables = requestedRoute === "/datove-schranky-plus"
    ? await optionalContext(
      "data_box",
      async () => dataBoxContextVariables(await dataBoxAssistantContext(env)),
      () => dataBoxContextVariables({
        state: "unavailable",
        safety: "Kontext Datové schránky se nepodařilo načíst. Nevymýšlej si stav, obsah zpráv ani provedené akce."
      }),
      contextWarnings
    )
    : {};
  const collectionRoutesVariables = assistant.assistantType === "sarlota" && requestedRoute.startsWith("/trasy-svozu")
    ? await optionalContext(
      "collection_routes",
      () => collectionRoutesContextVariables(env, user, requestedRoute),
      () => ({
        current_module: "Svozové trasy",
        current_module_route: requestedRoute,
        current_module_context: JSON.stringify({
          module: "Svozové trasy",
          route: requestedRoute,
          state: "unavailable",
          safety: "Kontext trasy se nepodařilo načíst. Nevymýšlej si stanoviště ani stav a neprováděj žádný zápis."
        })
      }),
      contextWarnings
    )
    : {};
  const dynamicVariables = {
    ...userDynamicVariables,
    ...introAnnouncement.variables,
    ...humanTouchVariables,
    ...driverReportVehicleVariables,
    ...dataBoxVariables,
    ...collectionRoutesVariables,
    assistant_key: assistant.assistantKey,
    assistant_display_name: assistant.displayName,
    assistant_is_test: assistant.isTest ? "true" : "false"
  };

  if (!agentId) {
    return json({
      error: `Chybí Agent ID pro asistenta ${assistant.displayName}.`,
      code: "ELEVENLABS_AGENT_ID_MISSING",
      ...assistantPublicMetadata(assistant),
      configured: false,
      apiStatus: "waiting"
    }, 503);
  }

  if (!apiKey) {
    return json({
      error: "ElevenLabs není nastavený. Doplňte ELEVENLABS_API_KEY.",
      code: "ELEVENLABS_API_KEY_MISSING",
      ...assistantPublicMetadata(assistant),
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
        ...assistantPublicMetadata(assistant),
        configured: true,
        apiStatus: "waiting"
      }, 502);
    }

    await recordAiAction(env, user, {
      assistantId: assistant.assistantKey,
      assistantName: assistant.displayName,
      actionType: "session",
      toolName: "elevenlabs_signed_url",
      input: {
        assistantId: assistant.assistantKey,
        diagnosticMode: omitDriverReportVehicleContext ? DRIVER_REPORT_NO_VEHICLE_DIAGNOSTIC_MODE : ""
      },
      result: {
        configured: true,
        userRole: cleanString(dynamicVariables.user_role),
        availableModulesLength: cleanString(dynamicVariables.available_modules).length,
        humanTouchEnabled: dynamicVariables.human_touch_enabled,
        humanTouchType: dynamicVariables.human_touch_type,
        driverReportVehicleContextOmitted: omitDriverReportVehicleContext,
        contextWarnings,
        assistantIsTest: assistant.isTest === true
      },
      status: "ok"
    });
    await recordSarlotaIntroAnnouncement(env, user, assistant, introAnnouncement);

    const conversationId = cleanString(payload.conversation_id);
    const dynamicVariablesForRuntime = dynamicVariablesWithConversationId(dynamicVariables, conversationId);

    return json({
      signedUrl: payload.signed_url,
      conversationId,
      ...assistantPublicMetadata(assistant),
      dynamicVariables: dynamicVariablesForRuntime,
      diagnostics: {
        diagnosticMode: omitDriverReportVehicleContext ? DRIVER_REPORT_NO_VEHICLE_DIAGNOSTIC_MODE : "",
        driverReportVehicleContextOmitted: omitDriverReportVehicleContext
      },
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
      ...assistantPublicMetadata(assistant),
      configured: true,
      apiStatus: "waiting"
    }, 502);
  }
}

function signedUrlServerErrorResponse({ error, assistant, debug, stage }) {
  const debugPayload = {
    assistantId: assistant.assistantKey,
    assistantName: assistant.displayName,
    stage,
    message: safeErrorMessage(error),
    endpoint: "get-signed-url"
  };

  console.error("elevenlabs.signed_url_server_error", debugPayload);

  return json({
    error: "Hlas Šarloty se teď nepodařilo připravit na serveru.",
    code: "elevenlabs_server_error",
    ...assistantPublicMetadata(assistant),
    configured: false,
    apiStatus: "waiting",
    ...(debug ? { debug: debugPayload } : {})
  }, 500);
}

export async function onRequestGet({ request, env }) {
  const assistant = assistantConfigFromRequest(request, env);
  if (!assistant) {
    return json({
      error: "Neznámý ElevenLabs assistant key.",
      code: "INVALID_ASSISTANT_KEY",
      apiStatus: "waiting"
    }, 400);
  }
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
