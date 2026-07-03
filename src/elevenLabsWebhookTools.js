const DEFAULT_APP_BASE_URL = "https://kaiser-control-center.pages.dev";
const DEFAULT_VOICE_WEBHOOK_TOKEN_ENV_LABEL = "voice_assistant_webhook_token";

function cleanString(value) {
  return String(value ?? "").trim();
}

function withoutTrailingSlash(value) {
  return cleanString(value).replace(/\/+$/, "");
}

export function elevenLabsWebhookBaseUrl(env = {}) {
  return withoutTrailingSlash(
    env.APP_BASE_URL ||
    env.PUBLIC_APP_BASE_URL ||
    env.KSO_PUBLIC_BASE_URL ||
    DEFAULT_APP_BASE_URL
  ) || DEFAULT_APP_BASE_URL;
}

export function elevenLabsVoiceWebhookTokenEnvLabel(env = {}) {
  return cleanString(env.ELEVENLABS_VOICE_WEBHOOK_TOKEN_ENV_LABEL).toLowerCase() || DEFAULT_VOICE_WEBHOOK_TOKEN_ENV_LABEL;
}

export const ELEVENLABS_WEBHOOK_TOOL_SCHEMAS = [
  {
    name: "get_driver_report_context",
    description: "Read-only serverově ověří kontext Hlášení řidičů podle user_id volajícího: oprávnění, řidiče a bezpečně ověřená přiřazená vozidla. Pro dotaz na vozidla a začátek hlášení závady volej vždy jako první. V hlasu čti jen assistantMessage/answerText z výsledku; nikdy si nedoplňuj vozidlo ani SPZ. Nic nezapisuje.",
    path: "/api/voice/driver-report-context",
    method: "POST",
    bodyParameters: [
      {
        name: "user_id",
        type: "string",
        required: true,
        dynamicVariable: "user_id"
      },
      {
        name: "transcriptIntent",
        type: "string",
        required: false,
        description: "Krátký popis aktuálního záměru uživatele, například dotaz na vozidla nebo hlášení závady."
      },
      {
        name: "currentModule",
        type: "string",
        required: false,
        constantValue: "hlaseni-ridicu"
      }
    ]
  }
];

function literalSchemaProperty(parameter = {}) {
  const property = {
    type: cleanString(parameter.type) || "string"
  };

  if (parameter.dynamicVariable) {
    property.dynamic_variable = cleanString(parameter.dynamicVariable);
    return property;
  }

  if (Object.prototype.hasOwnProperty.call(parameter, "constantValue")) {
    property.constant_value = parameter.constantValue;
    return property;
  }

  property.description = cleanString(parameter.description || parameter.name);
  return property;
}

export function elevenLabsWebhookToolConfigs(env = {}) {
  const baseUrl = elevenLabsWebhookBaseUrl(env);
  const tokenEnvLabel = elevenLabsVoiceWebhookTokenEnvLabel(env);

  return ELEVENLABS_WEBHOOK_TOOL_SCHEMAS.map((tool) => {
    const properties = {};
    const required = [];

    for (const parameter of tool.bodyParameters || []) {
      const name = cleanString(parameter.name);
      if (!name) {
        continue;
      }

      properties[name] = literalSchemaProperty(parameter);
      if (parameter.required) {
        required.push(name);
      }
    }

    return {
      type: "webhook",
      name: cleanString(tool.name),
      description: cleanString(tool.description),
      response_timeout_secs: 10,
      api_schema: {
        url: `${baseUrl}${tool.path}`,
        method: cleanString(tool.method) || "POST",
        request_headers: {
          "x-voice-assistant-token": {
            env_var_label: tokenEnvLabel
          }
        },
        request_body_schema: {
          type: "object",
          properties,
          required
        },
        response_body_schema: {
          type: "object",
          properties: {
            vehiclesVerified: { type: "boolean", description: "True jen pokud backend ověřil přiřazená vozidla." },
            vehicles: {
              type: "array",
              description: "Bezpečně ověřená vozidla bez VIN.",
              items: {
                type: "object",
                properties: {
                  displayName: { type: "string", description: "Bezpečný hlasový název vozidla." },
                  licensePlate: { type: "string", description: "SPZ vozidla." },
                  spz: { type: "string", description: "Alias pro SPZ vozidla." }
                }
              }
            },
            vehiclesCount: { type: "number", description: "Počet bezpečně ověřených vozidel." },
            reason: { type: "string", description: "Strojový důvod fallbacku nebo prázdný string." },
            assistantMessage: { type: "string", description: "Jediná věta, kterou má agent přečíst uživateli." },
            answerText: { type: "string", description: "Alias pro assistantMessage." }
          },
          required: ["vehiclesVerified", "vehicles", "assistantMessage"]
        },
        response_filter: {
          mode: "allow",
          filters: [
            "vehiclesVerified",
            "vehicles",
            "vehiclesCount",
            "reason",
            "assistantMessage",
            "answerText"
          ],
          content_type: "application/json"
        }
      }
    };
  });
}
