import { assistantById, DEFAULT_AI_ASSISTANT_ID } from "./data/aiAssistants.js";

const TEXT_CONNECTION_TIMEOUT_MS = 15000;
const TEXT_RESPONSE_TIMEOUT_MS = 45000;
const TEXT_METADATA_FALLBACK_MS = 1200;
const VOICE_CONNECTION_TIMEOUT_MS = 15000;
const VOICE_RESPONSE_TIMEOUT_MS = 45000;
const VOICE_FINISH_GRACE_MS = 1400;
const VOICE_AUDIO_UNLOCK_TIMEOUT_MS = 8000;
const VOICE_MICROPHONE_TIMEOUT_MS = 12000;
const DEFAULT_AGENT_AUDIO_FORMAT = "pcm_16000";
const DEFAULT_USER_AUDIO_FORMAT = "pcm_16000";
const VOICE_OUTPUT_GAIN = 5;
const VOICE_OUTPUT_LIMIT = 0.995;
const VOICE_INPUT_LEVEL_INTERVAL_MS = 250;
const VOICE_INPUT_SPEAKING_LEVEL = 0.035;

function cleanApiBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function signedUrlEndpoint(apiBaseUrl, assistantId) {
  const base = cleanApiBaseUrl(apiBaseUrl);
  const query = new URLSearchParams({ assistant: assistantId || DEFAULT_AI_ASSISTANT_ID });
  return `${base}/api/ai/elevenlabs/signed-url?${query.toString()}`;
}

function browserAudioContextConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.AudioContext || window.webkitAudioContext || null;
}

function sampleRateFromAudioFormat(format = DEFAULT_AGENT_AUDIO_FORMAT) {
  const match = /pcm_(\d+)/i.exec(String(format || ""));
  const parsed = Number(match?.[1] || 16000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16000;
}

function base64FromBytes(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return window.btoa(binary);
}

function float32ToPcm16Base64(input, inputSampleRate, outputSampleRate = 16000) {
  const sampleRateRatio = Math.max(1, inputSampleRate / outputSampleRate);
  const outputLength = Math.max(1, Math.floor(input.length / sampleRateRatio));
  const bytes = new Uint8Array(outputLength * 2);
  const view = new DataView(bytes.buffer);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * sampleRateRatio);
    const end = Math.min(input.length, Math.floor((outputIndex + 1) * sampleRateRatio));
    let total = 0;
    let count = 0;

    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      total += input[inputIndex];
      count += 1;
    }

    const normalized = Math.max(-1, Math.min(1, total / Math.max(1, count)));
    const sample = normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff;
    view.setInt16(outputIndex * 2, sample, true);
  }

  return base64FromBytes(bytes);
}

function microphoneErrorMessage(error) {
  if (error?.code === "voice_microphone_timeout") {
    return error.message;
  }

  const errorName = String(error?.name || "").trim();

  if (errorName === "NotAllowedError" || errorName === "SecurityError" || errorName === "PermissionDeniedError") {
    return "Mikrofon není povolený. Povolte mikrofon pro tento web a zkuste to znovu.";
  }

  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return "Mikrofon není v tomto zařízení dostupný.";
  }

  if (errorName === "NotReadableError" || errorName === "TrackStartError") {
    return "Mikrofon se nepodařilo spustit. Může ho používat jiná aplikace.";
  }

  return "Mikrofon se nepodařilo spustit. Zkontrolujte oprávnění prohlížeče a zkuste to znovu.";
}

function isMicrophonePermissionDenied(error) {
  const errorName = String(error?.name || "").trim();
  return errorName === "NotAllowedError" || errorName === "SecurityError" || errorName === "PermissionDeniedError";
}

function createMicrophoneStartError(error) {
  const wrappedError = new Error(microphoneErrorMessage(error));
  wrappedError.code = isMicrophonePermissionDenied(error)
    ? "voice_microphone_denied"
    : error?.code || "voice_microphone_error";
  wrappedError.voiceReason = wrappedError.code === "voice_microphone_denied"
    ? "microphone-permission-denied"
    : "microphone-start-failed";
  wrappedError.originalName = String(error?.name || "");
  return wrappedError;
}

function createVoiceTimeoutError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createMicrophoneTimeoutError() {
  return createVoiceTimeoutError(
    "Mikrofon čeká na povolení. Povolte mikrofon pro tento web a klepněte znovu.",
    "voice_microphone_timeout"
  );
}

function createVoiceStoppedError() {
  const error = new Error("Hlasový režim byl zastaven.");
  error.code = "voice_stopped";
  return error;
}

function createVoiceDisconnectedError(message = "Spojení se přerušilo. Klepni pro obnovení.", details = {}) {
  const error = new Error(message);
  error.code = "voice_disconnected";
  error.voiceReason = details.reason || "";
  error.closeCode = details.closeCode || 0;
  error.closeReason = details.closeReason || "";
  return error;
}

function bytesFromBase64(value) {
  const binary = window.atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function amplifyOutputSample(value) {
  const amplified = Number(value || 0) * VOICE_OUTPUT_GAIN;
  return Math.tanh(amplified) * VOICE_OUTPUT_LIMIT;
}

function audioInputLevel(inputBuffer) {
  if (!inputBuffer?.length) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < inputBuffer.length; index += 1) {
    total += inputBuffer[index] * inputBuffer[index];
  }

  return Math.sqrt(total / inputBuffer.length);
}

function stopMediaStreamTracks(mediaStream) {
  try {
    mediaStream?.getTracks?.().forEach((track) => track.stop());
  } catch {
    // Late media cleanup must never break the voice UI.
  }
}

function withTimeout(promise, timeoutMs, timeoutErrorFactory, onLateResolve = null) {
  let timer = 0;
  let timedOut = false;

  return new Promise((resolve, reject) => {
    timer = window.setTimeout(() => {
      timedOut = true;
      reject(timeoutErrorFactory());
    }, timeoutMs);

    promise.then((value) => {
      if (timedOut) {
        onLateResolve?.(value);
        return;
      }

      window.clearTimeout(timer);
      resolve(value);
    }).catch((error) => {
      if (timedOut) {
        return;
      }

      window.clearTimeout(timer);
      reject(error);
    });
  });
}

function supportedMediaConstraints() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getSupportedConstraints) {
    return {};
  }

  try {
    return navigator.mediaDevices.getSupportedConstraints() || {};
  } catch {
    return {};
  }
}

function voiceMicrophoneConstraints() {
  const supportedConstraints = supportedMediaConstraints();
  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  };

  if (supportedConstraints.volume) {
    audio.volume = 1;
  }

  return { audio };
}

function cleanDynamicVariableValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "";
  }

  return String(value ?? "").trim();
}

function dynamicVariablesForSession(signedUrlSession, interfaceMode) {
  const serverVariables = (
    signedUrlSession?.dynamicVariables &&
    typeof signedUrlSession.dynamicVariables === "object" &&
    !Array.isArray(signedUrlSession.dynamicVariables)
  )
    ? signedUrlSession.dynamicVariables
    : {};

  return Object.fromEntries(Object.entries({
    ...serverVariables,
    interface_mode: interfaceMode,
    app_name: "Smart odpady"
  })
    .map(([key, value]) => [key, cleanDynamicVariableValue(value)])
    .filter(([key, value]) => String(key || "").trim() && value !== ""));
}

function createVoiceAudioPlayer() {
  let audioContext = null;
  let nextStartTime = 0;
  let outputPrimed = false;
  const activeSources = new Set();

  function primeOutput() {
    if (!audioContext || outputPrimed) {
      return;
    }

    try {
      const buffer = audioContext.createBuffer(1, 1, Math.max(8000, audioContext.sampleRate || 16000));
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(0);
      outputPrimed = true;
    } catch {
      outputPrimed = false;
    }
  }

  async function unlock() {
    const AudioContextConstructor = browserAudioContextConstructor();

    if (!AudioContextConstructor) {
      return false;
    }

    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextConstructor();
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    primeOutput();
    nextStartTime = Math.max(nextStartTime, audioContext.currentTime);
    return audioContext.state !== "closed";
  }

  function stop() {
    for (const source of activeSources) {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
    }

    activeSources.clear();

    if (audioContext) {
      nextStartTime = audioContext.currentTime;
    }
  }

  async function playPcmChunk(base64Audio, format = DEFAULT_AGENT_AUDIO_FORMAT) {
    if (!base64Audio || !(await unlock())) {
      return false;
    }

    const sampleRate = sampleRateFromAudioFormat(format);
    const bytes = bytesFromBase64(base64Audio);
    const frameCount = Math.floor(bytes.length / 2);

    if (!frameCount || !audioContext) {
      return false;
    }

    const audioBuffer = audioContext.createBuffer(1, frameCount, sampleRate);
    const channel = audioBuffer.getChannelData(0);

    for (let index = 0; index < frameCount; index += 1) {
      const offset = index * 2;
      let sample = bytes[offset] | (bytes[offset + 1] << 8);
      if (sample & 0x8000) {
        sample -= 0x10000;
      }
      channel[index] = amplifyOutputSample(sample / 32768);
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.onended = () => activeSources.delete(source);
    activeSources.add(source);

    const startAt = Math.max(audioContext.currentTime + 0.02, nextStartTime);
    source.start(startAt);
    nextStartTime = startAt + audioBuffer.duration;
    return true;
  }

  return {
    getContext: () => audioContext,
    playPcmChunk,
    stop,
    unlock
  };
}

export function useElevenLabsAssistant({
  apiBaseUrl = "",
  clientTools = {},
  fetchJson = null
} = {}) {
  let activeTextSession = null;
  let activeVoiceSession = null;
  const voiceAudioPlayer = createVoiceAudioPlayer();

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

  function closeVoiceSession(reason = "reset") {
    const session = activeVoiceSession;
    activeVoiceSession = null;

    if (session?.close) {
      session.close(reason);
      return;
    }

    if (session?.socket && session.socket.readyState <= WebSocket.OPEN) {
      try {
        session.socket.close(1000, reason);
      } catch {
        // Closing a stale browser WebSocket can fail silently.
      }
    }
  }

  async function unlockVoiceAudio() {
    try {
      return await voiceAudioPlayer.unlock();
    } catch {
      return false;
    }
  }

  function stopVoiceAudio() {
    closeVoiceSession("stop-audio");
    voiceAudioPlayer.stop();
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
          dynamic_variables: dynamicVariablesForSession(signedUrlSession, "text")
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

  async function startVoiceConversation(assistantId = DEFAULT_AI_ASSISTANT_ID, callbacks = {}) {
    const assistant = assistantById(assistantId);

    if (typeof WebSocket === "undefined") {
      throw new Error("Hlasový režim Šarloty není v tomto prohlížeči dostupný.");
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Mikrofon není v tomto prohlížeči dostupný.");
    }

    closeTextSession("new-voice-stream-session");
    closeVoiceSession("new-voice-stream-session");
    voiceAudioPlayer.stop();

    let audioReady = false;
    try {
      audioReady = await withTimeout(
        unlockVoiceAudio(),
        VOICE_AUDIO_UNLOCK_TIMEOUT_MS,
        () => createVoiceTimeoutError("Zvuk se v mobilním prohlížeči nepodařilo připravit včas.", "voice_audio_unlock_timeout")
      );
    } catch {
      audioReady = false;
    }

    if (!audioReady) {
      callbacks.onAudioWarning?.("Zvuk v mobilním prohlížeči se nepodařilo připravit. Zkontrolujte hlasitost, tichý režim a povolený zvuk pro prohlížeč.");
    }

    let mediaStream = null;
    try {
      mediaStream = await withTimeout(
        navigator.mediaDevices.getUserMedia(voiceMicrophoneConstraints()),
        VOICE_MICROPHONE_TIMEOUT_MS,
        createMicrophoneTimeoutError,
        stopMediaStreamTracks
      );
    } catch (error) {
      throw createMicrophoneStartError(error);
    }

    let signedUrlSession = null;
    try {
      signedUrlSession = await prepareSignedUrl(assistant.id);
    } catch (error) {
      stopMediaStreamTracks(mediaStream);
      throw error;
    }

    const signedUrl = String(signedUrlSession?.signedUrl || "").trim();
    if (!signedUrl) {
      stopMediaStreamTracks(mediaStream);
      throw new Error("ElevenLabs hlasovou session se nepodařilo připravit.");
    }

    return new Promise((resolve, reject) => {
      let socket = null;
      let settled = false;
      let conversationId = String(signedUrlSession.conversationId || "");
      let agentAudioFormat = DEFAULT_AGENT_AUDIO_FORMAT;
      let userAudioFormat = DEFAULT_USER_AUDIO_FORMAT;
      let userTranscript = "";
      let streamedAgentText = "";
      let finalAgentText = "";
      let audioChunkCount = 0;
      let audioPlaybackStarted = false;
      let audioPlaybackFailed = false;
      let audioInputStarted = false;
      let audioInputStopped = false;
      let audioInputPaused = false;
      let sourceNode = null;
      let processorNode = null;
      let silentGainNode = null;
      let connectionTimer = 0;
      let responseTimer = 0;
      let metadataFallbackTimer = 0;
      let finishTimer = 0;
      let lastInputLevelAt = 0;
      const audioTrack = mediaStream.getAudioTracks?.()[0] || null;

      function clearTimers() {
        window.clearTimeout(connectionTimer);
        window.clearTimeout(responseTimer);
        window.clearTimeout(metadataFallbackTimer);
        window.clearTimeout(finishTimer);
      }

      function stopAudioInput() {
        audioInputStopped = true;

        if (processorNode) {
          processorNode.onaudioprocess = null;
          try {
            processorNode.disconnect();
          } catch {
            // The node may already be disconnected.
          }
          processorNode = null;
        }

        if (silentGainNode) {
          try {
            silentGainNode.disconnect();
          } catch {
            // The node may already be disconnected.
          }
          silentGainNode = null;
        }

        if (sourceNode) {
          try {
            sourceNode.disconnect();
          } catch {
            // The node may already be disconnected.
          }
          sourceNode = null;
        }

        mediaStream.getTracks().forEach((track) => track.stop());
      }

      function cleanup(reason = "done") {
        clearTimers();
        stopAudioInput();

        if (socket && socket.readyState <= WebSocket.OPEN) {
          try {
            socket.close(1000, reason);
          } catch {
            // The browser may already be closing the socket.
          }
        }
      }

      function settle(done, value, reason = "done") {
        if (settled) {
          return;
        }

        settled = true;

        if (activeVoiceSession?.socket === socket) {
          activeVoiceSession = null;
        }

        cleanup(reason);
        done(value);
      }

      if (audioTrack) {
        audioTrack.addEventListener("ended", () => {
          if (!settled) {
            settle(reject, createVoiceDisconnectedError(
              "Mikrofon se v prohlížeči ukončil. Zkontroluj oprávnění mikrofonu a klepni na Obnovit spojení.",
              { reason: "microphone-track-ended" }
            ), "voice-track-ended");
          }
        }, { once: true });
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

      function resultPayload() {
        return {
          text: finalAgentText || streamedAgentText,
          transcript: userTranscript,
          assistantId: signedUrlSession.assistantId || assistant.id,
          assistantName: signedUrlSession.assistantName || assistant.name,
          conversationId,
          configured: Boolean(signedUrlSession.configured),
          audioChunkCount,
          audioPlaybackFailed,
          audioPlaybackStarted
        };
      }

      function scheduleReady(delay = VOICE_FINISH_GRACE_MS) {
        if (!String(finalAgentText || streamedAgentText).trim() && audioChunkCount === 0) {
          return;
        }

        window.clearTimeout(finishTimer);
        finishTimer = window.setTimeout(() => {
          audioInputPaused = false;
          callbacks.onReady?.({
            ...resultPayload(),
            state: "listening"
          });
        }, delay);
      }

      function startResponseTimer() {
        window.clearTimeout(responseTimer);
        responseTimer = window.setTimeout(() => {
          settle(reject, new Error("Šarlota v hlasovém režimu neodpověděla včas."), "voice-timeout");
        }, VOICE_RESPONSE_TIMEOUT_MS);
      }

      function startAudioInput() {
        if (audioInputStarted || audioInputStopped || settled) {
          return;
        }

        const audioContext = voiceAudioPlayer.getContext();
        if (!audioContext || audioContext.state === "closed") {
          settle(reject, new Error("Hlasový režim se nepodařilo připravit pro tento prohlížeč."), "audio-context-missing");
          return;
        }

        const inputSampleRate = audioContext.sampleRate || sampleRateFromAudioFormat(userAudioFormat);
        const outputSampleRate = sampleRateFromAudioFormat(userAudioFormat);

        try {
          sourceNode = audioContext.createMediaStreamSource(mediaStream);
          processorNode = audioContext.createScriptProcessor(4096, 1, 1);
          silentGainNode = audioContext.createGain();
          silentGainNode.gain.value = 0;
          processorNode.onaudioprocess = (event) => {
            if (settled || audioInputStopped || socket?.readyState !== WebSocket.OPEN) {
              return;
            }

            const inputBuffer = event.inputBuffer.getChannelData(0);
            const outputBuffer = event.outputBuffer?.getChannelData?.(0);
            if (outputBuffer) {
              outputBuffer.fill(0);
            }

            const now = Date.now();
            if (now - lastInputLevelAt >= VOICE_INPUT_LEVEL_INTERVAL_MS) {
              lastInputLevelAt = now;
              const inputLevel = audioInputLevel(inputBuffer);
              callbacks.onInputLevel?.({
                inputLevel,
                speaking: inputLevel >= VOICE_INPUT_SPEAKING_LEVEL,
                conversationId
              });
            }

            if (audioInputPaused) {
              return;
            }

            const audioChunk = float32ToPcm16Base64(inputBuffer, inputSampleRate, outputSampleRate);
            if (audioChunk) {
              sendJson({ user_audio_chunk: audioChunk });
            }
          };

          sourceNode.connect(processorNode);
          processorNode.connect(silentGainNode);
          silentGainNode.connect(audioContext.destination);
          audioInputStarted = true;
          callbacks.onListening?.({
            assistantId: signedUrlSession.assistantId || assistant.id,
            assistantName: signedUrlSession.assistantName || assistant.name,
            conversationId
          });
        } catch {
          settle(reject, new Error("Mikrofon se nepodařilo připojit k hlasové session."), "audio-input-failed");
        }
      }

      function rememberAgentText(responseText) {
        const cleanedText = String(responseText || "").trim();

        if (!cleanedText) {
          return;
        }

        finalAgentText = cleanedText;
        audioInputPaused = true;
        callbacks.onAgentResponse?.({
          text: cleanedText,
          conversationId
        });
        scheduleReady();
      }

      try {
        socket = new WebSocket(signedUrl);
        activeVoiceSession = {
          socket,
          close: (reason = "voice-stopped") => {
            settle(reject, createVoiceStoppedError(), reason);
          }
        };
      } catch {
        settle(reject, new Error("Hlasový režim Šarloty se nepodařilo spustit."), "voice-start-failed");
        return;
      }

      connectionTimer = window.setTimeout(() => {
        settle(reject, new Error("Hlasový režim Šarloty se nepodařilo připojit."), "voice-connection-timeout");
      }, VOICE_CONNECTION_TIMEOUT_MS);

      socket.addEventListener("open", () => {
        window.clearTimeout(connectionTimer);
        sendJson({
          type: "conversation_initiation_client_data",
          dynamic_variables: dynamicVariablesForSession(signedUrlSession, "voice")
        });
        callbacks.onConnected?.({
          assistantId: signedUrlSession.assistantId || assistant.id,
          assistantName: signedUrlSession.assistantName || assistant.name,
          conversationId
        });
        metadataFallbackTimer = window.setTimeout(startAudioInput, TEXT_METADATA_FALLBACK_MS);
      });

      socket.addEventListener("message", (event) => {
        let payload = {};
        try {
          payload = JSON.parse(event.data || "{}");
        } catch {
          payload = {};
        }

        if (payload.type === "conversation_initiation_metadata") {
          const metadata = payload.conversation_initiation_metadata_event || {};
          conversationId = String(metadata.conversation_id || conversationId);
          agentAudioFormat = String(metadata.agent_output_audio_format || agentAudioFormat);
          userAudioFormat = String(metadata.user_input_audio_format || userAudioFormat);
          window.clearTimeout(metadataFallbackTimer);
          startAudioInput();
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

        if (payload.type === "user_transcript") {
          userTranscript = String(payload.user_transcription_event?.user_transcript || userTranscript).trim();
          if (userTranscript) {
            audioInputPaused = true;
            streamedAgentText = "";
            finalAgentText = "";
            audioChunkCount = 0;
            audioPlaybackStarted = false;
            audioPlaybackFailed = false;
            callbacks.onUserTranscript?.({
              text: userTranscript,
              conversationId
            });
            startResponseTimer();
          }
          return;
        }

        if (payload.type === "audio") {
          const audioBase64 = payload.audio_event?.audio_base_64;
          if (audioBase64) {
            audioInputPaused = true;
            audioChunkCount += 1;
            window.clearTimeout(finishTimer);
            voiceAudioPlayer.playPcmChunk(audioBase64, agentAudioFormat)
              .then((played) => {
                audioPlaybackStarted = audioPlaybackStarted || Boolean(played);
                audioPlaybackFailed = audioPlaybackFailed || !played;
                callbacks.onAudio?.({
                  audioChunkCount,
                  audioPlaybackStarted,
                  audioPlaybackFailed
                });
                scheduleReady();
              })
              .catch(() => {
                audioPlaybackFailed = true;
                callbacks.onAudio?.({
                  audioChunkCount,
                  audioPlaybackStarted,
                  audioPlaybackFailed
                });
                scheduleReady();
              });
          }
          return;
        }

        if (payload.type === "agent_response") {
          window.clearTimeout(responseTimer);
          rememberAgentText(payload.agent_response_event?.agent_response);
          return;
        }

        if (payload.type === "agent_chat_response_part") {
          const part = payload.text_response_part || {};
          const partType = String(part.type || "").trim();

          if (partType === "start") {
            streamedAgentText = "";
            audioInputPaused = true;
          }

          if (part.text && partType !== "start") {
            streamedAgentText += String(part.text);
            callbacks.onAgentResponse?.({
              text: streamedAgentText,
              conversationId
            });
          }

          if (partType === "stop") {
            rememberAgentText(streamedAgentText || part.text);
          }
          return;
        }

        if (payload.type === "agent_response_complete") {
          window.clearTimeout(responseTimer);
          if (streamedAgentText && !finalAgentText) {
            finalAgentText = streamedAgentText;
          }
          scheduleReady(900);
          return;
        }

        if (payload.type === "vad_score") {
          const score = Number(payload.vad_score_event?.vad_score || 0);
          callbacks.onInputLevel?.({
            inputLevel: score,
            speaking: score >= 0.55,
            conversationId,
            source: "vad_score"
          });
          return;
        }

        if (payload.type === "error") {
          const messageText = payload.error_event?.message || payload.message || "ElevenLabs hlasový režim vrátil chybu.";
          settle(reject, new Error(messageText), "voice-error");
        }
      });

      socket.addEventListener("error", () => {
        settle(reject, createVoiceDisconnectedError(
          "WebSocket spojení se Šarlotou se nepodařilo udržet. Zkus Obnovit spojení.",
          { reason: "voice-socket-error" }
        ), "voice-socket-error");
      });

      socket.addEventListener("close", (event) => {
        if (settled) {
          return;
        }

        const closeCode = Number(event?.code || 0);
        const closeReason = String(event?.reason || "").trim().slice(0, 120);
        const closeText = closeCode
          ? `WebSocket spojení se Šarlotou se zavřelo (${closeCode}${closeReason ? `: ${closeReason}` : ""}). Klepni na Obnovit spojení.`
          : "WebSocket spojení se Šarlotou se zavřelo. Klepni na Obnovit spojení.";
        settle(reject, createVoiceDisconnectedError(closeText, {
          reason: "voice-socket-close",
          closeCode,
          closeReason
        }), "voice-socket-close");
      });
    });
  }

  async function sendVoiceMessage(assistantId = DEFAULT_AI_ASSISTANT_ID, message = "") {
    const assistant = assistantById(assistantId);
    const text = String(message || "").trim();

    if (!text) {
      throw new Error("Napište nebo nadiktujte dotaz pro Šarlotu.");
    }

    if (typeof WebSocket === "undefined") {
      throw new Error("Hlasový režim Šarloty není v tomto prohlížeči dostupný.");
    }

    closeTextSession("new-voice-session");
    closeVoiceSession("new-voice-session");
    voiceAudioPlayer.stop();
    await unlockVoiceAudio();

    const signedUrlSession = await prepareSignedUrl(assistant.id);
    const signedUrl = String(signedUrlSession?.signedUrl || "").trim();

    if (!signedUrl) {
      throw new Error("ElevenLabs hlasovou session se nepodařilo připravit.");
    }

    return new Promise((resolve, reject) => {
      let socket = null;
      let settled = false;
      let userMessageSent = false;
      let conversationId = String(signedUrlSession.conversationId || "");
      let responseTimer = 0;
      let metadataFallbackTimer = 0;
      let streamedAgentText = "";
      let agentAudioFormat = DEFAULT_AGENT_AUDIO_FORMAT;
      let audioChunkCount = 0;
      let audioPlaybackStarted = false;
      let audioPlaybackFailed = false;

      const connectionTimer = window.setTimeout(() => {
        settle(reject, new Error("Hlasový režim Šarloty se nepodařilo připojit."));
      }, VOICE_CONNECTION_TIMEOUT_MS);

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

        if (activeVoiceSession?.socket === socket) {
          activeVoiceSession = null;
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
          settle(reject, new Error("Šarlota v hlasovém režimu neodpověděla včas."));
        }, VOICE_RESPONSE_TIMEOUT_MS);
      }

      function sendUserMessage() {
        if (userMessageSent || settled) {
          return;
        }

        userMessageSent = true;
        if (!sendJson({ type: "user_message", text })) {
          settle(reject, new Error("Hlasový režim Šarloty se nepodařilo odeslat."));
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
          configured: Boolean(signedUrlSession.configured),
          audioChunkCount,
          audioPlaybackFailed,
          audioPlaybackStarted
        });
      }

      try {
        socket = new WebSocket(signedUrl);
        activeVoiceSession = { socket };
      } catch {
        settle(reject, new Error("Hlasový režim Šarloty se nepodařilo spustit."));
        return;
      }

      socket.addEventListener("open", () => {
        window.clearTimeout(connectionTimer);
        sendJson({
          type: "conversation_initiation_client_data",
          dynamic_variables: dynamicVariablesForSession(signedUrlSession, "voice")
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
          const metadata = payload.conversation_initiation_metadata_event || {};
          conversationId = String(metadata.conversation_id || conversationId);
          agentAudioFormat = String(metadata.agent_output_audio_format || agentAudioFormat);
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

        if (payload.type === "audio") {
          const audioBase64 = payload.audio_event?.audio_base_64;
          if (audioBase64) {
            audioChunkCount += 1;
            voiceAudioPlayer.playPcmChunk(audioBase64, agentAudioFormat)
              .then((played) => {
                audioPlaybackStarted = audioPlaybackStarted || Boolean(played);
                audioPlaybackFailed = audioPlaybackFailed || !played;
              })
              .catch(() => {
                audioPlaybackFailed = true;
              });
          }
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
          const messageText = payload.error_event?.message || payload.message || "ElevenLabs hlasový režim vrátil chybu.";
          settle(reject, new Error(messageText));
        }
      });

      socket.addEventListener("error", () => {
        settle(reject, new Error("Hlasový režim Šarloty se nepodařilo připojit."));
      });

      socket.addEventListener("close", () => {
        if (!settled) {
          settle(reject, new Error("Hlasová session Šarloty se ukončila bez odpovědi."));
        }
      });
    });
  }

  return {
    clientTools,
    closeVoiceSession,
    closeTextSession,
    prepareSignedUrl,
    sendTextMessage,
    startVoiceConversation,
    sendVoiceMessage,
    stopVoiceAudio,
    unlockVoiceAudio
  };
}
