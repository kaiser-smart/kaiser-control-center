import { DEFAULT_AI_ASSISTANT_ID, assistantById } from "./data/aiAssistants.js";
import { routeForAiModule } from "./elevenLabsClientTools.js";

const OPENAI_REALTIME_WEBRTC_ENDPOINT = "https://api.openai.com/v1/realtime/calls";
const VOICE_MICROPHONE_ERROR_CODE = "voice_microphone_denied";

function cleanString(value) {
  return String(value ?? "").trim();
}

function parseJson(value, fallback = {}) {
  if (value && typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(cleanString(value));
  } catch {
    return fallback;
  }
}

function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function microphoneError(error) {
  const wrapped = new Error(
    error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError"
      ? "Mikrofon není povolený. Povol mikrofon pro tento web a zkus to znovu."
      : "Mikrofon se nepodařilo spustit."
  );
  wrapped.code = VOICE_MICROPHONE_ERROR_CODE;
  return wrapped;
}

function createHiddenAudioElement() {
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.playsInline = true;
  audio.controls = false;
  audio.style.position = "fixed";
  audio.style.width = "1px";
  audio.style.height = "1px";
  audio.style.opacity = "0";
  audio.style.pointerEvents = "none";
  audio.style.left = "-9999px";
  audio.setAttribute("aria-hidden", "true");
  document.body.appendChild(audio);
  return audio;
}

function safeToolOutput(value) {
  return JSON.stringify(value ?? {});
}

export function useOpenAiRealtimeAssistant({
  requestJson = null,
  navigate = () => {},
  canUseRoute = () => true
} = {}) {
  let activeVoiceSession = null;

  async function defaultRequestJson(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      },
      ...options
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(payload.error || `Požadavek selhal (${response.status}).`);
      error.payload = payload;
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  function requester() {
    return requestJson || defaultRequestJson;
  }

  function closeVoiceSession(reason = "voice-stopped") {
    const session = activeVoiceSession;
    activeVoiceSession = null;

    if (!session) {
      return;
    }

    session.closed = true;
    stopMediaStream(session.mediaStream);

    try {
      session.dataChannel?.close();
    } catch {
      // The data channel may already be closed.
    }

    try {
      session.peerConnection?.close();
    } catch {
      // The peer connection may already be closed.
    }

    if (session.audioElement) {
      session.audioElement.srcObject = null;
      session.audioElement.remove();
    }

    session.callbacks?.onDisconnected?.({ reason });
  }

  async function callAbsenceTool(args = {}, context = {}) {
    const confirmed = args.confirmed === true;
    const dayPart = cleanString(args.dayPart);
    const dateFrom = cleanString(args.dateFrom);
    const dateTo = cleanString(args.dateTo || args.dateFrom);
    const summary = cleanString(args.spokenSummary);
    const note = cleanString(args.note);
    const text = summary || `Zapiš dovolenou ${dateFrom || ""} ${dayPart || ""}`.trim();
    const payload = {
      transcript: text,
      text,
      intent: "absence_vacation_request",
      parameters: {
        type: "vacation",
        dateFrom,
        dateTo,
        dayPart,
        confirmed,
        note
      },
      context: {
        conversationId: context.conversationId || "",
        absenceType: "vacation",
        absenceDateFrom: dateFrom,
        absenceDateTo: dateTo,
        absenceDayPart: dayPart,
        absenceConfirmed: confirmed
      },
      metadata: {
        source: "openai_realtime",
        callId: context.callId || ""
      }
    };
    const result = await requester()("/api/voice/sarlota", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    return {
      ok: result.ok === true,
      status: result.status || "unknown",
      answerText: result.reply || result.text || "",
      intent: result.intent || "absence_vacation_request",
      verified: result.verified === true,
      requiresConfirmation: result.status === "needs_confirmation",
      absenceRequest: result.absenceRequest || null,
      notificationsSent: result.notificationsSent === true
    };
  }

  async function callOpenModuleTool(args = {}) {
    const route = routeForAiModule(args.moduleId);
    if (!route) {
      return {
        ok: false,
        status: "not_found",
        answerText: "Tenhle modul neumím jednoznačně otevřít."
      };
    }

    if (!canUseRoute(route)) {
      return {
        ok: false,
        status: "forbidden",
        answerText: "K tomu modulu nemáš oprávnění."
      };
    }

    navigate(route);
    return {
      ok: true,
      status: "opened",
      route,
      answerText: "Otevírám modul."
    };
  }

  async function handleToolCall(session, event) {
    const callId = cleanString(event.call_id || event.callId || event.item?.call_id || event.item?.callId);
    const name = cleanString(event.name || event.item?.name);
    const rawArguments = event.arguments || event.item?.arguments || "{}";
    const args = parseJson(rawArguments, {});
    const toolKey = callId || `${name}:${rawArguments}`;

    if (!name || session.handledToolCalls.has(toolKey)) {
      return;
    }

    session.handledToolCalls.add(toolKey);

    let output = {
      ok: false,
      status: "unsupported",
      answerText: "Tohle zatím neumím bezpečně provést."
    };

    try {
      if (name === "create_absence_request") {
        output = await callAbsenceTool(args, {
          conversationId: session.conversationId,
          callId
        });
      } else if (name === "open_kso_module") {
        output = await callOpenModuleTool(args);
      }
    } catch (error) {
      output = {
        ok: false,
        status: "failed",
        answerText: error?.payload?.error || error?.message || "Nástroj se nepodařilo provést."
      };
    }

    session.callbacks?.onToolResult?.({
      name,
      status: output.status,
      text: output.answerText || ""
    });

    if (session.dataChannel?.readyState !== "open" || !callId) {
      return;
    }

    session.dataChannel.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: safeToolOutput(output)
      }
    }));
    session.dataChannel.send(JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["text", "audio"],
        instructions: output.answerText
          ? `Řekni uživateli krátce tento výsledek: ${output.answerText}`
          : "Řekni uživateli krátce výsledek nástroje."
      }
    }));
  }

  function handleRealtimeEvent(session, event) {
    const type = cleanString(event?.type);

    if (!type) {
      return;
    }

    if (type === "session.created" || type === "session.updated") {
      session.callbacks?.onReady?.({
        assistantId: session.assistant.id,
        assistantName: session.assistant.name,
        provider: "openai_realtime",
        conversationId: session.conversationId
      });
      return;
    }

    if (type === "conversation.created") {
      session.conversationId = cleanString(event.conversation?.id || session.conversationId);
      return;
    }

    if (type === "input_audio_buffer.speech_started") {
      session.callbacks?.onInputLevel?.({
        speaking: true,
        inputLevel: 1,
        conversationId: session.conversationId
      });
      return;
    }

    if (type === "input_audio_buffer.speech_stopped") {
      session.callbacks?.onInputLevel?.({
        speaking: false,
        inputLevel: 0,
        conversationId: session.conversationId
      });
      return;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      session.userTranscript = cleanString(event.transcript || session.userTranscript);
      if (session.userTranscript) {
        session.assistantTranscript = "";
        session.callbacks?.onUserTranscript?.({
          text: session.userTranscript,
          conversationId: session.conversationId
        });
      }
      return;
    }

    if (type === "response.audio_transcript.delta" || type === "response.text.delta") {
      const delta = cleanString(event.delta);
      if (delta) {
        session.assistantTranscript += delta;
        session.callbacks?.onAgentResponse?.({
          text: session.assistantTranscript,
          conversationId: session.conversationId
        });
      }
      return;
    }

    if (type === "response.audio_transcript.done" || type === "response.text.done") {
      const text = cleanString(event.transcript || event.text || session.assistantTranscript);
      if (text) {
        session.assistantTranscript = text;
        session.callbacks?.onAgentResponse?.({
          text,
          conversationId: session.conversationId
        });
      }
      return;
    }

    if (type === "response.function_call_arguments.done") {
      void handleToolCall(session, event);
      return;
    }

    if (type === "response.output_item.done" && event.item?.type === "function_call") {
      void handleToolCall(session, event);
      return;
    }

    if (type === "response.done") {
      session.callbacks?.onReady?.({
        assistantId: session.assistant.id,
        assistantName: session.assistant.name,
        provider: "openai_realtime",
        conversationId: session.conversationId
      });
      return;
    }

    if (type === "error") {
      const message = cleanString(event.error?.message || event.message || "OpenAI Realtime vrátil chybu.");
      session.callbacks?.onError?.({ message, status: message });
    }
  }

  async function startVoiceConversation(assistantId = DEFAULT_AI_ASSISTANT_ID, callbacks = {}) {
    const assistant = assistantById(assistantId);

    if (typeof RTCPeerConnection === "undefined") {
      throw new Error("OpenAI hlasový režim není v tomto prohlížeči dostupný.");
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Mikrofon není v tomto prohlížeči dostupný.");
    }

    closeVoiceSession("new-openai-realtime-session");

    const sessionConfig = await requester()("/api/sarlota/realtime-session", {
      method: "POST",
      body: JSON.stringify({
        currentModule: typeof window !== "undefined" ? window.location.pathname : ""
      })
    });
    const clientSecret = cleanString(sessionConfig.clientSecret);
    if (!clientSecret) {
      throw new Error("OpenAI Realtime nevrátil krátkodobý token.");
    }

    let mediaStream = null;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (error) {
      throw microphoneError(error);
    }

    const peerConnection = new RTCPeerConnection();
    const dataChannel = peerConnection.createDataChannel("oai-events");
    const audioElement = createHiddenAudioElement();
    const session = {
      assistant,
      callbacks,
      peerConnection,
      dataChannel,
      mediaStream,
      audioElement,
      conversationId: "",
      userTranscript: "",
      assistantTranscript: "",
      handledToolCalls: new Set(),
      closed: false
    };
    activeVoiceSession = session;

    mediaStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, mediaStream);
    });

    peerConnection.ontrack = (event) => {
      audioElement.srcObject = event.streams[0];
      audioElement.play?.().catch(() => {
        callbacks.onAudioWarning?.("Zvuk odpovědi se nepodařilo automaticky přehrát. Zkontroluj hlasitost a tichý režim.");
      });
      callbacks.onAudio?.({
        audioPlaybackStarted: true,
        audioPlaybackFailed: false
      });
    };

    peerConnection.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(peerConnection.connectionState) && !session.closed) {
        callbacks.onDisconnected?.({
          reason: peerConnection.connectionState
        });
      }
    };

    dataChannel.onmessage = (messageEvent) => {
      handleRealtimeEvent(session, parseJson(messageEvent.data, {}));
    };
    dataChannel.onerror = () => {
      callbacks.onError?.({
        message: "OpenAI Realtime datový kanál vrátil chybu.",
        status: "Chyba hlasu"
      });
    };

    const dataChannelReady = new Promise((resolve, reject) => {
      let opened = false;
      const timer = window.setTimeout(() => {
        reject(new Error("OpenAI hlasové spojení se nepodařilo otevřít včas."));
      }, 12000);
      dataChannel.onopen = () => {
        opened = true;
        window.clearTimeout(timer);
        callbacks.onConnected?.({
          assistantId: assistant.id,
          assistantName: assistant.name,
          provider: "openai_realtime",
          model: sessionConfig.model,
          voice: sessionConfig.voice,
          conversationId: session.conversationId
        });
        callbacks.onListening?.({
          assistantId: assistant.id,
          assistantName: assistant.name,
          provider: "openai_realtime",
          conversationId: session.conversationId
        });
        resolve();
      };
      dataChannel.onclose = () => {
        window.clearTimeout(timer);
        if (!opened) {
          reject(new Error("OpenAI hlasové spojení se zavřelo před dokončením."));
        }
      };
    });

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const sdpResponse = await fetch(OPENAI_REALTIME_WEBRTC_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp"
        },
        body: offer.sdp
      });

      if (!sdpResponse.ok) {
        throw new Error("OpenAI Realtime WebRTC spojení se nepodařilo připravit.");
      }

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text()
      };
      await peerConnection.setRemoteDescription(answer);
      await dataChannelReady;
    } catch (error) {
      closeVoiceSession("openai-realtime-start-failed");
      throw error;
    }

    return {
      assistantId: assistant.id,
      assistantName: assistant.name,
      provider: "openai_realtime",
      model: sessionConfig.model,
      voice: sessionConfig.voice,
      configured: true
    };
  }

  return {
    closeVoiceSession,
    startVoiceConversation,
    stopVoiceAudio: closeVoiceSession
  };
}
