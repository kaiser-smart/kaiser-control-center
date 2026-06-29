import { requireUserPermission, json } from "../../_lib/auth.js";
import { sarlotaIntroAnnouncementForAi } from "../../_lib/ai-session-announcements.js";
import { userDynamicVariablesForAi } from "../../_lib/ai-people-summary.js";
import {
  SARLOTA_PROMPT_VERSION,
  sarlotaRealtimePrompt
} from "../../../src/sarlota/sarlotaSystemPrompt.js";

const OPENAI_REALTIME_CLIENT_SECRET_ENDPOINT = "https://api.openai.com/v1/realtime/client_secrets";
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2";
const DEFAULT_REALTIME_VOICE = "marin";

function cleanString(value) {
  return String(value ?? "").trim();
}

function maskId(value) {
  const text = cleanString(value);
  if (!text) {
    return "";
  }

  if (text.length <= 12) {
    return `${text.slice(0, 4)}…${text.slice(-2)}`;
  }

  return `${text.slice(0, 8)}…${text.slice(-4)}`;
}

function hexFromBuffer(buffer) {
  return [...new Uint8Array(buffer)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

async function safetyIdentifierFor(user) {
  const source = cleanString(user?.id || user?.email || user?.name || "unknown-user");
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`kso-sarlota:${source}`));
  return hexFromBuffer(digest);
}

function openAiRealtimeConfig(env) {
  const apiKey = cleanString(env?.OPENAI_API_KEY);
  const model = cleanString(
    env?.SARLOTA_OPENAI_REALTIME_MODEL ||
    env?.OPENAI_REALTIME_MODEL ||
    env?.VOICE_ASSISTANT_OPENAI_REALTIME_MODEL ||
    DEFAULT_REALTIME_MODEL
  );
  const voice = cleanString(
    env?.SARLOTA_OPENAI_REALTIME_VOICE ||
    env?.OPENAI_REALTIME_VOICE ||
    DEFAULT_REALTIME_VOICE
  );

  return {
    apiKey,
    model,
    voice
  };
}

function realtimeTools() {
  return [
    {
      type: "function",
      name: "create_absence_request",
      description: [
        "Zapíše potvrzenou žádost o dovolenou do Kaiser Smart Odpady přes backend.",
        "Volej až po jasném potvrzení uživatele.",
        "Pokud chybí datum, rozsah nebo potvrzení, nejdřív se uživatele zeptej a nástroj nevolej."
      ].join(" "),
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          dateFrom: {
            type: "string",
            description: "Datum začátku ve formátu YYYY-MM-DD."
          },
          dateTo: {
            type: "string",
            description: "Datum konce ve formátu YYYY-MM-DD. Pokud jde o jeden den, použij stejné datum jako dateFrom."
          },
          dayPart: {
            type: "string",
            enum: ["full_day", "half_day"],
            description: "Rozsah dovolené."
          },
          confirmed: {
            type: "boolean",
            description: "True jen když uživatel výslovně potvrdil zápis."
          },
          note: {
            type: "string",
            description: "Krátká poznámka. Neuváděj soukromé ani zdravotní důvody."
          },
          spokenSummary: {
            type: "string",
            description: "Krátké shrnutí, které uživatel potvrdil."
          }
        },
        required: ["dateFrom", "dayPart", "confirmed"]
      }
    },
    {
      type: "function",
      name: "open_kso_module",
      description: "Otevře bezpečně známý modul KSO v prohlížeči.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          moduleId: {
            type: "string",
            description: "ID modulu, například servis-udrzba, vozovy-park, dovolena-nemoc nebo dashboard."
          }
        },
        required: ["moduleId"]
      }
    }
  ];
}

function realtimeSessionBody({ model, voice, instructions }) {
  return {
    session: {
      type: "realtime",
      model,
      instructions,
      audio: {
        input: {
          transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "cs"
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 850,
            create_response: true,
            interrupt_response: true
          }
        },
        output: {
          voice
        }
      },
      tools: realtimeTools(),
      tool_choice: "auto"
    }
  };
}

function safeErrorPayload(response, payload) {
  const message = cleanString(payload?.error?.message || payload?.message || "OpenAI Realtime session se nepodařilo připravit.");
  return {
    error: message,
    configured: true,
    apiStatus: "waiting",
    upstreamStatus: response?.status || null
  };
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "dashboard", "view");

  if (response) {
    return response;
  }

  const { apiKey, model, voice } = openAiRealtimeConfig(env);

  if (!apiKey) {
    return json({
      error: "OpenAI Realtime není nastavené. Chybí server-side OPENAI_API_KEY.",
      configured: false,
      apiStatus: "waiting"
    }, 503);
  }

  const payload = await request.json().catch(() => ({}));
  const assistant = { id: "sarlota", name: "Šarlota" };
  const introAnnouncement = await sarlotaIntroAnnouncementForAi(env, user, assistant);
  const dynamicVariables = {
    ...userDynamicVariablesForAi(user),
    ...introAnnouncement.variables
  };
  const currentModule = cleanString(payload?.currentModule || payload?.module || "");
  const instructions = sarlotaRealtimePrompt({
    userName: dynamicVariables.user_name,
    userRole: dynamicVariables.user_role,
    availableModules: dynamicVariables.available_modules,
    userPermissions: dynamicVariables.user_permissions,
    introAnnouncement: dynamicVariables.intro_announcement,
    currentModule
  });

  try {
    const upstream = await fetch(OPENAI_REALTIME_CLIENT_SECRET_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": await safetyIdentifierFor(user)
      },
      body: JSON.stringify(realtimeSessionBody({ model, voice, instructions }))
    });
    const upstreamPayload = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return json(safeErrorPayload(upstream, upstreamPayload), 502);
    }

    const clientSecret = cleanString(upstreamPayload?.value || upstreamPayload?.client_secret?.value);
    if (!clientSecret) {
      return json({
        error: "OpenAI Realtime session nevrátila krátkodobý klientský token.",
        configured: true,
        apiStatus: "waiting"
      }, 502);
    }

    return json({
      configured: true,
      apiStatus: "ready",
      provider: "openai_realtime",
      assistantId: "sarlota",
      assistantName: "Šarlota",
      model,
      voice,
      promptVersion: SARLOTA_PROMPT_VERSION,
      sessionIdMasked: maskId(upstreamPayload?.id),
      expiresAt: upstreamPayload?.expires_at || upstreamPayload?.client_secret?.expires_at || null,
      clientSecret,
      tools: realtimeTools().map((tool) => tool.name),
      secretsOmittedFromLogs: true
    });
  } catch (error) {
    return json({
      error: cleanString(error?.message) || "OpenAI Realtime teď neodpovědělo.",
      configured: true,
      apiStatus: "waiting"
    }, 502);
  }
}
