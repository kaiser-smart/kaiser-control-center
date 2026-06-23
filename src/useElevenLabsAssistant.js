import { assistantById, DEFAULT_AI_ASSISTANT_ID } from "./data/aiAssistants.js";

const TEXT_CONNECTION_TIMEOUT_MS = 15000;
const TEXT_RESPONSE_TIMEOUT_MS = 45000;
const TEXT_METADATA_FALLBACK_MS = 1200;

function cleanApiBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function signedUrlEndpoint(apiBaseUrl, assistantId) {
  const base = cleanApiBaseUrl(apiBaseUrl);
  const query = new URLSearchParams({ assistant: assistantId || DEFAULT_AI_ASSISTANT_ID });
  return `${base}/api/ai/elevenlabs/signed-url?${query.toString()}`;
}

export function useElevenLabsAssistant({
  apiBaseUrl = "",
  clientTools = {},
  fetchJson = null
} = {}) {
  let activeTextSession = null;

  async function defaultFetchJson(path) {
    const response = await fetch(path, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(payload.error || "ElevenLabs session se nepodařilo připravit.");
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  async function prepareSignedUrl(assistantId = DEFAULT_AI_ASSISTANT_ID) {
    const assistant = assistantById(assistantId);
    const loadJson = fetchJson || defaultFetchJson;
    return loadJson(signedUrlEndpoint(apiBaseUrl, assistant.id));
  }

  function closeTextSession(reason = "reset") {
    const session = activeTextSession;
    activeTextSession = null;

    if (session?.socket && session.socket.readyState <= WebSocket.OPEN) {
      try {
        session.socket.close(1000, reason);
      } catch {
        // Closing a stale browser WebSocket can fail silently.
      }
    }
  }

  async function sendClientToolResult(socket, toolCall = {}) {
    const toolName = String(toolCall.tool_name || "").trim();
    const toolCallId = String(toolCall.tool_call_id || "").trim();
    const parameters = toolCall.parameters || {};
    const tool = clientTools[toolName];
    let isError = false;
    let result = { ok: false, error: "Nástroj není v textovém režimu dostupný." };

    if (tool && toolCallId) {
      try {
        result = await tool.call(clientTools, parameters);
      } catch (error) {
        isError = true;
        result = { ok: false, error: error?.message || "Nástroj se nepodařilo spustit." };
      }
    } else {
      isError = true;
    }

    if (socket.readyState === WebSocket.OPEN && toolCallId) {
      try {
        socket.send(JSON.stringify({
          type: "client_tool_result",
          tool_call_id: toolCallId,
          result: JSON.stringify(result),
          is_error: isError
        }));
      } catch {
        // Tool result delivery is best-effort; the session will surface socket errors separately.
      }
    }
  }

  async function sendTextMessage(assistantId = DEFAULT_AI_ASSISTANT_ID, message = "") {
    const assistant = assistantById(assistantId);
    const text = String(message || "").trim();

    if (!text) {
      throw new Error("Napište dotaz pro Šarlotu.");
    }

    if (typeof WebSocket === "undefined") {
      throw new Error("Textový režim Šarloty není v tomto prohlížeči dostupný.");
    }

    closeTextSession("new-text-session");

    const signedUrlSession = await prepareSignedUrl(assistant.id);
    const signedUrl = String(signedUrlSession?.signedUrl || "").trim();

    if (!signedUrl) {
      throw new Error("ElevenLabs session se nepodařilo připravit.");
    }

    return new Promise((resolve, reject) => {
      let socket = null;
      let settled = false;
      let userMessageSent = false;
      let conversationId = String(signedUrlSession.conversationId || "");
      let responseTimer = 0;
      let metadataFallbackTimer = 0;
      let streamedAgentText = "";

      const connectionTimer = window.setTimeout(() => {
        settle(reject, new Error("Textový režim Šarloty se nepodařilo připojit."));
      }, TEXT_CONNECTION_TIMEOUT_MS);

      function clearTimers() {
        window.clearTimeout(connectionTimer);
        window.clearTimeout(responseTimer);
        window.clearTimeout(metadataFallbackTimer);
      }

      function settle(done, value) {
        if (settled) {
          return;
        }

        settled = true;
        clearTimers();

        if (activeTextSession?.socket === socket) {
          activeTextSession = null;
        }

        if (socket && socket.readyState <= WebSocket.OPEN) {
          try {
            socket.close(1000, "done");
          } catch {
            // The browser may already be closing the socket.
          }
        }

        done(value);
      }

      function sendJson(payload) {
        if (socket?.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify(payload));
            return true;
          } catch {
            return false;
          }
        }
        return false;
      }

      function startResponseTimer() {
        window.clearTimeout(responseTimer);
        responseTimer = window.setTimeout(() => {
          settle(reject, new Error("Šarlota v textovém režimu neodpověděla včas."));
        }, TEXT_RESPONSE_TIMEOUT_MS);
      }

      function sendUserMessage() {
        if (userMessageSent || settled) {
          return;
        }

        userMessageSent = true;
        if (!sendJson({ type: "user_message", text })) {
          settle(reject, new Error("Textový režim Šarloty se nepodařilo odeslat."));
          return;
        }

        startResponseTimer();
      }

      function resolveAgentText(responseText) {
        const cleanedText = String(responseText || "").trim();

        if (!cleanedText) {
          return;
        }

        settle(resolve, {
          text: cleanedText,
          assistantId: signedUrlSession.assistantId || assistant.id,
          assistantName: signedUrlSession.assistantName || assistant.name,
          conversationId,
          configured: Boolean(signedUrlSession.configured)
        });
      }

      try {
        socket = new WebSocket(signedUrl);
        activeTextSession = { socket };
      } catch {
        settle(reject, new Error("Textový režim Šarloty se nepodařilo spustit."));
        return;
      }

      socket.addEventListener("open", () => {
        window.clearTimeout(connectionTimer);
        sendJson({
          type: "conversation_initiation_client_data",
          conversation_config_override: {
            conversation: {
              text_only: true
            }
          },
          dynamic_variables: {
            interface_mode: "text",
            app_name: "Smart odpady"
          }
        });
        metadataFallbackTimer = window.setTimeout(sendUserMessage, TEXT_METADATA_FALLBACK_MS);
      });

      socket.addEventListener("message", (event) => {
        let payload = {};
        try {
          payload = JSON.parse(event.data || "{}");
        } catch {
          payload = {};
        }

        if (payload.type === "conversation_initiation_metadata") {
          conversationId = String(payload.conversation_initiation_metadata_event?.conversation_id || conversationId);
          window.clearTimeout(metadataFallbackTimer);
          sendUserMessage();
          return;
        }

        if (payload.type === "ping") {
          sendJson({
            type: "pong",
            event_id: payload.ping_event?.event_id
          });
          return;
        }

        if (payload.type === "client_tool_call") {
          sendClientToolResult(socket, payload.client_tool_call);
          return;
        }

        if (payload.type === "agent_response") {
          resolveAgentText(payload.agent_response_event?.agent_response);
          return;
        }

        if (payload.type === "agent_chat_response_part") {
          const part = payload.text_response_part || {};
          const partType = String(part.type || "").trim();

          if (partType === "start") {
            streamedAgentText = "";
          }

          if (part.text && partType !== "start") {
            streamedAgentText += String(part.text);
          }

          if (partType === "stop") {
            resolveAgentText(streamedAgentText || part.text);
          }
          return;
        }

        if (payload.type === "agent_response_complete") {
          resolveAgentText(streamedAgentText);
          return;
        }

        if (payload.type === "error") {
          const messageText = payload.error_event?.message || payload.message || "ElevenLabs textový režim vrátil chybu.";
          settle(reject, new Error(messageText));
        }
      });

      socket.addEventListener("error", () => {
        settle(reject, new Error("Textový režim Šarloty se nepodařilo připojit."));
      });

      socket.addEventListener("close", () => {
        if (!settled) {
          settle(reject, new Error("Textová session Šarloty se ukončila bez odpovědi."));
        }
      });
    });
  }

  return {
    clientTools,
    closeTextSession,
    prepareSignedUrl,
    sendTextMessage
  };
}
