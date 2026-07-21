import { assistantById, DEFAULT_AI_ASSISTANT_ID } from "./data/aiAssistants.js";

const TEXT_CONNECTION_TIMEOUT_MS = 15000;
const TEXT_RESPONSE_TIMEOUT_MS = 45000;
const TEXT_METADATA_FALLBACK_MS = 1200;
const VOICE_CONNECTION_TIMEOUT_MS = 15000;
const VOICE_RESPONSE_TIMEOUT_MS = 45000;
const VOICE_FINISH_GRACE_MS = 1400;
const VOICE_PLAYBACK_TAIL_GUARD_MS = 450;
const VOICE_AUDIO_UNLOCK_TIMEOUT_MS = 8000;
const VOICE_MICROPHONE_TIMEOUT_MS = 12000;
const DEFAULT_AGENT_AUDIO_FORMAT = "pcm_16000";
const DEFAULT_USER_AUDIO_FORMAT = "pcm_16000";
const VOICE_OUTPUT_GAIN = 5;
const VOICE_OUTPUT_LIMIT = 0.995;
const VOICE_INPUT_LEVEL_INTERVAL_MS = 250;
const VOICE_INPUT_SPEAKING_LEVEL = 0.035;
const INTRO_SPEECH_ACTIVITY_FRAMES = 2;
const INTRO_SERVER_VAD_SPEAKING_LEVEL = 0.55;
const DRIVER_REPORT_NO_VEHICLE_DIAGNOSTIC_MODE = "identity_no_driver_vehicles";

function cleanApiBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function signedUrlEndpoint(apiBaseUrl, assistantId, options = {}) {
  const base = cleanApiBaseUrl(apiBaseUrl);
  const query = new URLSearchParams({ assistant: assistantId || DEFAULT_AI_ASSISTANT_ID });
  if (options.omitDriverReportVehicleContext === true) {
    query.set("diagnosticMode", DRIVER_REPORT_NO_VEHICLE_DIAGNOSTIC_MODE);
  }
  const currentRoute = String(options.currentRoute || "").trim();
  if (currentRoute === "/datove-schranky-plus" || currentRoute.startsWith("/trasy-svozu")) {
    query.set("currentRoute", currentRoute);
  }
  const tabletTestSession = String(options.tabletTestSession || "").trim();
  if (currentRoute.startsWith("/trasy-svozu") && tabletTestSession) {
    query.set("tabletTestSession", tabletTestSession);
  }
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
    return "Mikrofon není povolený. Povol mikrofon pro tento web a zkus to znovu.";
  }

  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return "Mikrofon není v tomto zařízení dostupný.";
  }

  if (errorName === "NotReadableError" || errorName === "TrackStartError") {
    return "Mikrofon se nepodařilo spustit. Může ho používat jiná aplikace.";
  }

  return "Mikrofon se nepodařilo spustit. Zkontroluj oprávnění prohlížeče a zkus to znovu.";
}

function isMicrophonePermissionDenied(error) {
  const errorName = String(error?.name || "").trim();
  return errorName === "NotAllowedError" || errorName === "SecurityError" || errorName === "PermissionDeniedError";
}

function createMicrophoneStartError(error) {
  const wrappedError = new Error(microphoneErrorMessage(error));
  if (isMicrophonePermissionDenied(error)) {
    wrappedError.code = "voice_microphone_denied";
    wrappedError.voiceReason = "microphone-permission-denied";
  } else if (error?.code === "voice_microphone_timeout") {
    wrappedError.code = "voice_microphone_timeout";
    wrappedError.voiceReason = "microphone-permission-timeout";
  } else {
    wrappedError.code = error?.code || "voice_microphone_error";
    wrappedError.voiceReason = "microphone-start-failed";
  }
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
    "Mikrofon čeká na povolení. Povol mikrofon pro tento web a klepni znovu.",
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

export function createIntroSpeechActivityDetector(options = {}) {
  const threshold = Math.max(0, Number(options.threshold ?? VOICE_INPUT_SPEAKING_LEVEL));
  const requiredFrames = Math.max(1, Math.round(Number(options.requiredFrames ?? INTRO_SPEECH_ACTIVITY_FRAMES)));
  let activeFrames = 0;

  return Object.freeze({
    observe(inputLevel) {
      const level = Number(inputLevel || 0);
      activeFrames = Number.isFinite(level) && level >= threshold ? activeFrames + 1 : 0;
      return activeFrames >= requiredFrames;
    },
    reset() {
      activeFrames = 0;
    }
  });
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

export function voiceInputResumeDelayMs(baseDelayMs = VOICE_FINISH_GRACE_MS, playbackRemainingMs = 0) {
  const safeBaseDelayMs = Math.max(0, Number(baseDelayMs) || 0);
  const safePlaybackRemainingMs = Math.max(0, Number(playbackRemainingMs) || 0);
  return Math.max(safeBaseDelayMs, safePlaybackRemainingMs + VOICE_PLAYBACK_TAIL_GUARD_MS);
}

function createVoiceAudioPlayer() {
  let audioContext = null;
  let cueAudioElement = null;
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

    if (audioContext.state !== "running") {
      return false;
    }

    primeOutput();
    nextStartTime = Math.max(nextStartTime, audioContext.currentTime);
    return audioContext.state === "running";
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

    if (cueAudioElement) {
      try {
        cueAudioElement.pause();
        cueAudioElement.currentTime = 0;
      } catch {
        // The media element may not have started yet.
      }
    }

    if (audioContext) {
      nextStartTime = audioContext.currentTime;
    }
  }

  async function playCueWithMediaElement(sourceUrl) {
    const AudioConstructor = typeof window === "undefined" ? null : window.Audio;
    if (typeof AudioConstructor !== "function") return false;

    cueAudioElement = cueAudioElement || new AudioConstructor();
    const element = cueAudioElement;
    element.preload = "auto";
    element.playsInline = true;
    element.muted = false;
    element.volume = 1;
    element.src = sourceUrl;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (played) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        element.removeEventListener("ended", onEnded);
        element.removeEventListener("error", onError);
        resolve(played);
      };
      const onEnded = () => finish(true);
      const onError = () => finish(false);
      const timeoutId = window.setTimeout(() => finish(false), 15000);
      element.addEventListener("ended", onEnded, { once: true });
      element.addEventListener("error", onError, { once: true });
      try {
        element.currentTime = 0;
        const started = element.play();
        if (started && typeof started.catch === "function") {
          started.catch(() => finish(false));
        }
      } catch {
        finish(false);
      }
    });
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

  async function playCue(url) {
    const sourceUrl = String(url || "").trim();
    if (!sourceUrl || !(await unlock()) || !audioContext) return false;
    try {
      const response = await fetch(sourceUrl, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`voice_cue_http_${response.status}`);
      const encoded = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(encoded.slice(0));
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      const startAt = Math.max(audioContext.currentTime + 0.02, nextStartTime);
      const ended = new Promise((resolve) => {
        source.onended = () => {
          activeSources.delete(source);
          resolve(true);
        };
      });
      activeSources.add(source);
      source.start(startAt);
      nextStartTime = startAt + audioBuffer.duration;
      await ended;
      return true;
    } catch (error) {
      const fallbackPlayed = await playCueWithMediaElement(sourceUrl);
      if (!fallbackPlayed) {
        console.error("elevenlabs.voice_cue_playback_failed", {
          message: String(error?.message || error || "unknown")
        });
      }
      return fallbackPlayed;
    }
  }

  function remainingPlaybackMs() {
    if (!audioContext || audioContext.state === "closed") {
      return 0;
    }

    return Math.max(0, Math.ceil((nextStartTime - audioContext.currentTime) * 1000));
  }

  return {
    getContext: () => audioContext,
    playCue,
    playPcmChunk,
    remainingPlaybackMs,
    stop,
    unlock
  };
}

export function useElevenLabsAssistant({
  apiBaseUrl = "",
  clientTools = {},
  fetchJson = null,
  signedUrlOptions = null
} = {}) {
  let activeTextSession = null;
  let activeVoiceSession = null;
  let preparedVoiceInput = null;
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
      error.code = String(payload.code || "").trim() ||
        (response.status === 503 && payload.configured === false
          ? "elevenlabs_not_configured"
          : "elevenlabs_signed_url_failed");
      error.httpStatus = response.status;
      throw error;
    }

    return payload;
  }

  function signedUrlOptionsFor(assistantId, sessionContext = {}) {
    const resolvedOptions = typeof signedUrlOptions === "function"
      ? signedUrlOptions(assistantId, sessionContext)
      : signedUrlOptions;

    return resolvedOptions && typeof resolvedOptions === "object" && !Array.isArray(resolvedOptions)
      ? resolvedOptions
      : {};
  }

  async function prepareSignedUrl(assistantId = DEFAULT_AI_ASSISTANT_ID, sessionContext = {}) {
    const assistant = assistantById(assistantId);
    const loadJson = fetchJson || defaultFetchJson;
    const currentRoute = typeof window === "undefined" ? "" : String(window.location?.pathname || "");
    return loadJson(signedUrlEndpoint(apiBaseUrl, assistant.id, {
      ...signedUrlOptionsFor(assistant.id, sessionContext),
      currentRoute
    }));
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

  function prepareVoiceInput() {
    if (preparedVoiceInput) {
      return preparedVoiceInput.promise.then((outcome) => Boolean(outcome.stream));
    }

    const entry = { cancelled: false, promise: null };
    entry.promise = (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        const error = new Error("Mikrofon není v tomto prohlížeči dostupný.");
        error.code = "voice_microphone_unavailable";
        error.voiceReason = "microphone-api-unavailable";
        return { stream: null, error };
      }
      try {
        const stream = await withTimeout(
          navigator.mediaDevices.getUserMedia(voiceMicrophoneConstraints()),
          VOICE_MICROPHONE_TIMEOUT_MS,
          createMicrophoneTimeoutError,
          stopMediaStreamTracks
        );
        if (entry.cancelled) {
          stopMediaStreamTracks(stream);
          return { stream: null, error: createVoiceStoppedError() };
        }
        return { stream, error: null };
      } catch (error) {
        return { stream: null, error: createMicrophoneStartError(error) };
      }
    })();
    preparedVoiceInput = entry;
    return entry.promise.then((outcome) => Boolean(outcome.stream));
  }

  function discardVoiceInput() {
    const entry = preparedVoiceInput;
    preparedVoiceInput = null;
    if (!entry) return;
    entry.cancelled = true;
    void entry.promise.then((outcome) => stopMediaStreamTracks(outcome.stream));
  }

  async function takePreparedVoiceInput() {
    const entry = preparedVoiceInput;
    preparedVoiceInput = null;
    if (!entry) return null;
    const outcome = await entry.promise;
    if (outcome.error) throw outcome.error;
    return outcome.stream;
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

    const signedUrlSession = await prepareSignedUrl(assistant.id, { interfaceMode: "text" });
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
    const introGenerationRequest = String(callbacks.introGenerationRequest || "").trim();
    const endAfterGeneratedIntro = Boolean(introGenerationRequest && callbacks.endAfterGeneratedIntro === true);
    const continueAfterGeneratedIntro = Boolean(introGenerationRequest && callbacks.continueAfterGeneratedIntro === true);
    const deferMicrophoneUntilAfterGeneratedIntro = Boolean(continueAfterGeneratedIntro);
    const listenAfterTechnicalFirstMessage = Boolean(introGenerationRequest && callbacks.listenAfterTechnicalFirstMessage === true);
    const validateGeneratedIntro = typeof callbacks.validateGeneratedIntro === "function";
    const bufferGeneratedIntro = Boolean(introGenerationRequest && validateGeneratedIntro);

    if (typeof WebSocket === "undefined") {
      throw new Error("Hlasový režim Šarloty není v tomto prohlížeči dostupný.");
    }

    if (!endAfterGeneratedIntro && (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia)) {
      const error = new Error("Mikrofon není v tomto prohlížeči dostupný.");
      error.code = "voice_microphone_unavailable";
      error.voiceReason = "microphone-api-unavailable";
      throw error;
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
      callbacks.onAudioWarning?.("Zvuk v mobilním prohlížeči se nepodařilo připravit. Zkontroluj hlasitost, tichý režim a povolený zvuk pro prohlížeč.");
    }

    let mediaStream = null;
    if (!endAfterGeneratedIntro && !deferMicrophoneUntilAfterGeneratedIntro) {
      try {
        mediaStream = await takePreparedVoiceInput();
        if (!mediaStream) {
          mediaStream = await withTimeout(
            navigator.mediaDevices.getUserMedia(voiceMicrophoneConstraints()),
            VOICE_MICROPHONE_TIMEOUT_MS,
            createMicrophoneTimeoutError,
            stopMediaStreamTracks
          );
        }
      } catch (error) {
        if (String(error?.code || "").startsWith("voice_microphone_")) {
          throw error;
        }
        throw createMicrophoneStartError(error);
      }
    }

    let signedUrlSession = null;
    try {
      signedUrlSession = await prepareSignedUrl(assistant.id, { interfaceMode: "voice" });
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
      let bufferedIntroAudio = [];
      let introFinalizing = false;
      let introPlaybackFinished = false;
      let introAwaitingUser = false;
      let introUserEngaged = false;
      let introValidation = null;
      let audioInputStarted = false;
      let audioInputStopped = false;
      let audioInputPaused = Boolean(introGenerationRequest);
      let introGenerationPhase = introGenerationRequest ? "suppressing-technical-first-message" : "complete";
      let technicalFirstMessageComplete = false;
      let sourceNode = null;
      let processorNode = null;
      let silentGainNode = null;
      let connectionTimer = 0;
      let responseTimer = 0;
      let metadataFallbackTimer = 0;
      let finishTimer = 0;
      let introGenerationTimer = 0;
      let introSilenceTimer = 0;
      let lastInputLevelAt = 0;
      let microphoneRequest = null;
      const introSpeechActivityDetector = createIntroSpeechActivityDetector({
        requiredFrames: callbacks.introSpeechActivityFrames
      });
      const introServerVadSpeakingLevel = Math.max(
        0,
        Number(callbacks.introServerVadSpeakingLevel ?? INTRO_SERVER_VAD_SPEAKING_LEVEL)
      );

      function markIntroUserEngaged(source, text = "") {
        if (!introAwaitingUser || introUserEngaged) return false;
        introUserEngaged = true;
        introAwaitingUser = false;
        window.clearTimeout(introSilenceTimer);
        callbacks.onIntroEngaged?.({
          text: String(text || "").trim(),
          conversationId,
          source
        });
        return true;
      }

      function clearTimers() {
        window.clearTimeout(connectionTimer);
        window.clearTimeout(responseTimer);
        window.clearTimeout(metadataFallbackTimer);
        window.clearTimeout(finishTimer);
        window.clearTimeout(introGenerationTimer);
        window.clearTimeout(introSilenceTimer);
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

        mediaStream?.getTracks?.().forEach((track) => track.stop());
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

      function watchMicrophoneTrack(stream) {
        const audioTrack = stream?.getAudioTracks?.()[0] || null;
        if (!audioTrack || audioTrack.__ksoVoiceTrackWatched) return;
        audioTrack.__ksoVoiceTrackWatched = true;
        audioTrack.addEventListener("ended", () => {
          if (!settled) {
            settle(reject, createVoiceDisconnectedError(
              "Mikrofon se v prohlížeči ukončil. Zkontroluj oprávnění mikrofonu a klepni na Obnovit spojení.",
              { reason: "microphone-track-ended" }
            ), "voice-track-ended");
          }
        }, { once: true });
      }

      watchMicrophoneTrack(mediaStream);

      async function ensureMediaStream() {
        if (mediaStream) return mediaStream;
        if (microphoneRequest) return microphoneRequest;
        microphoneRequest = (async () => {
          try {
            const preparedStream = await takePreparedVoiceInput();
            const stream = preparedStream || await withTimeout(
              navigator.mediaDevices.getUserMedia(voiceMicrophoneConstraints()),
              VOICE_MICROPHONE_TIMEOUT_MS,
              createMicrophoneTimeoutError,
              stopMediaStreamTracks
            );
            mediaStream = stream;
            watchMicrophoneTrack(stream);
            return stream;
          } catch (error) {
            if (String(error?.code || "").startsWith("voice_microphone_")) throw error;
            throw createMicrophoneStartError(error);
          }
        })();
        return microphoneRequest;
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
          audioPlaybackStarted,
          introValidation
        };
      }

      function resetAgentTurn() {
        streamedAgentText = "";
        finalAgentText = "";
        audioChunkCount = 0;
        audioPlaybackStarted = false;
        audioPlaybackFailed = false;
        bufferedIntroAudio = [];
        introFinalizing = false;
        introValidation = null;
      }

      function requestGeneratedIntro() {
        if (introGenerationPhase !== "suppressing-technical-first-message" || settled) {
          return;
        }

        introGenerationPhase = "waiting-for-generated-intro";
        audioInputPaused = true;
        resetAgentTurn();
        if (!sendJson({ type: "user_message", text: introGenerationRequest })) {
          settle(reject, new Error("Šarlota nedokázala převzít požadavek na úvodní hlášení."), "intro-generation-send-failed");
          return;
        }
        startResponseTimer();
      }

      function scheduleGeneratedIntroRequest() {
        if (!technicalFirstMessageComplete || introGenerationPhase !== "suppressing-technical-first-message") {
          return;
        }
        window.clearTimeout(introGenerationTimer);
        introGenerationTimer = window.setTimeout(requestGeneratedIntro, 600);
      }

      function completeTechnicalFirstMessage() {
        window.clearTimeout(responseTimer);
        technicalFirstMessageComplete = true;
        if (!listenAfterTechnicalFirstMessage) {
          scheduleGeneratedIntroRequest();
          return;
        }
        introGenerationPhase = "complete";
        audioInputPaused = false;
        callbacks.onReady?.({
          ...resultPayload(),
          state: "listening-after-technical-first-message"
        });
      }

      async function finishValidatedGeneratedIntro() {
        if (settled || introFinalizing) return;
        introFinalizing = true;
        const text = String(finalAgentText || streamedAgentText).trim();
        const validation = validateGeneratedIntro
          ? callbacks.validateGeneratedIntro(text)
          : { valid: true, violations: [] };
        introValidation = validation && typeof validation === "object"
          ? validation
          : { valid: validation === true, violations: [] };

        if (introValidation.valid !== true) {
          const error = new Error("Šarlota vytvořila úvod s neověřenými údaji. Zvuk nebyl přehrán.");
          error.code = "voice_intro_validation_failed";
          error.violations = Array.isArray(introValidation.violations) ? introValidation.violations : [];
          error.payload = { ...resultPayload(), voiceRuntime: signedUrlSession.voiceRuntime || null };
          callbacks.onIntroValidationFailed?.(error);
          settle(reject, error, "intro-validation-failed");
          return;
        }

        if (!bufferedIntroAudio.length) {
          const error = new Error("Šarlota vrátila ověřený text, ale neposlala žádný zvuk.");
          error.code = "voice_audio_missing";
          error.payload = { ...resultPayload(), voiceRuntime: signedUrlSession.voiceRuntime || null };
          settle(reject, error, "intro-audio-missing");
          return;
        }


        if (typeof callbacks.onBeforeIntroPlayback === "function") {
          let allowed = false;
          try {
            allowed = await callbacks.onBeforeIntroPlayback({
              ...resultPayload(),
              state: "intro-ready"
            });
          } catch (cause) {
            const error = cause instanceof Error ? cause : new Error("Automatický úvod se nepodařilo bezpečně zahájit.");
            settle(reject, error, "intro-before-playback-failed");
            return;
          }
          if (allowed === false) {
            const error = new Error("Automatický úvod už v této relaci proběhl.");
            error.code = "voice_intro_already_played";
            settle(reject, error, "intro-already-played");
            return;
          }
        }

        for (const chunk of bufferedIntroAudio) {
          const played = await voiceAudioPlayer.playPcmChunk(chunk.audioBase64, chunk.format).catch(() => false);
          audioPlaybackStarted = audioPlaybackStarted || played;
          audioPlaybackFailed = audioPlaybackFailed || !played;
          if (!played) break;
        }
        bufferedIntroAudio = [];

        if (!audioPlaybackStarted || audioPlaybackFailed) {
          const error = new Error("Ověřený úvod se nepodařilo přehrát. Zkontroluj povolený zvuk pro prohlížeč a spusť ho klepnutím.");
          error.code = "voice_audio_playback_failed";
          error.payload = { ...resultPayload(), voiceRuntime: signedUrlSession.voiceRuntime || null };
          settle(reject, error, "intro-audio-playback-failed");
          return;
        }

        callbacks.onAudio?.({
          audioChunkCount,
          audioPlaybackStarted,
          audioPlaybackFailed,
          introValidated: true
        });
        const playbackDelay = voiceInputResumeDelayMs(0, voiceAudioPlayer.remainingPlaybackMs());
        finishTimer = window.setTimeout(async () => {
          introPlaybackFinished = true;
          if (continueAfterGeneratedIntro) {
            await startAudioInput();
            if (settled || !audioInputStarted) return;
            introAwaitingUser = true;
            introSpeechActivityDetector.reset();
            audioInputPaused = false;
            callbacks.onIntroListening?.({
              ...resultPayload(),
              state: "intro-waiting-for-driver",
              microphoneActive: true
            });
            const timeoutMs = Math.max(1000, Number(callbacks.introSilenceTimeoutMs || 5000));
            introSilenceTimer = window.setTimeout(async () => {
              if (settled || introUserEngaged) return;
              audioInputPaused = true;
              callbacks.onIntroSilence?.({ ...resultPayload(), state: "intro-silence" });
              try {
                await callbacks.onIntroSilenceTimeout?.({ ...resultPayload(), state: "intro-silence" });
              } finally {
                const payload = {
                  ...resultPayload(),
                  state: "intro-silence-complete",
                  microphoneActive: false
                };
                callbacks.onIntroComplete?.(payload);
                settle(resolve, payload, "intro-silence-complete");
              }
            }, timeoutMs);
            return;
          }
          const payload = {
            ...resultPayload(),
            state: "intro-complete",
            microphoneActive: false
          };
          callbacks.onIntroComplete?.(payload);
          settle(resolve, payload, "intro-complete");
        }, playbackDelay);
      }

      function scheduleReady(delay = VOICE_FINISH_GRACE_MS) {
        const responseText = String(finalAgentText || streamedAgentText).trim();
        if (bufferGeneratedIntro && !introPlaybackFinished && (!responseText || audioChunkCount === 0)) {
          return;
        }
        if (!responseText && audioChunkCount === 0) {
          return;
        }

        window.clearTimeout(finishTimer);
        if (bufferGeneratedIntro && !introPlaybackFinished) {
          finishTimer = window.setTimeout(() => {
            void finishValidatedGeneratedIntro();
          }, Math.max(300, Number(delay) || 0));
          return;
        }
        const resumeDelayMs = voiceInputResumeDelayMs(delay, voiceAudioPlayer.remainingPlaybackMs());
        finishTimer = window.setTimeout(() => {
          audioInputPaused = false;
          callbacks.onReady?.({
            ...resultPayload(),
            state: "listening"
          });
        }, resumeDelayMs);
      }

      function startResponseTimer() {
        window.clearTimeout(responseTimer);
        responseTimer = window.setTimeout(() => {
          settle(reject, new Error("Šarlota v hlasovém režimu neodpověděla včas."), "voice-timeout");
        }, VOICE_RESPONSE_TIMEOUT_MS);
      }

      async function startAudioInput() {
        if (audioInputStarted || audioInputStopped || settled) {
          return;
        }
        if (endAfterGeneratedIntro) {
          audioInputPaused = true;
          return;
        }
        if (deferMicrophoneUntilAfterGeneratedIntro && !introPlaybackFinished) {
          return;
        }

        try {
          await ensureMediaStream();
        } catch (error) {
          settle(reject, error, "audio-input-permission-failed");
          return;
        }
        if (settled || !mediaStream) return;

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

            const inputLevel = audioInputLevel(inputBuffer);
            const now = Date.now();
            if (now - lastInputLevelAt >= VOICE_INPUT_LEVEL_INTERVAL_MS) {
              lastInputLevelAt = now;
              callbacks.onInputLevel?.({
                inputLevel,
                speaking: inputLevel >= VOICE_INPUT_SPEAKING_LEVEL,
                conversationId
              });
            }

            if (audioInputPaused) {
              return;
            }

            if (introAwaitingUser && !introUserEngaged && introSpeechActivityDetector.observe(inputLevel)) {
              markIntroUserEngaged("local_voice_activity");
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
          conversationId,
          voiceRuntime: signedUrlSession.voiceRuntime || null
        });
        if (introGenerationPhase === "suppressing-technical-first-message") {
          startResponseTimer();
        }
        metadataFallbackTimer = window.setTimeout(() => {
          void startAudioInput();
        }, TEXT_METADATA_FALLBACK_MS);
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
          void startAudioInput();
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
          if (introGenerationPhase === "suppressing-technical-first-message") {
            return;
          }
          sendClientToolResult(socket, payload.client_tool_call);
          return;
        }

        if (payload.type === "user_transcript") {
          userTranscript = String(payload.user_transcription_event?.user_transcript || userTranscript).trim();
          if (introGenerationPhase === "waiting-for-generated-intro" && userTranscript === introGenerationRequest) {
            userTranscript = "";
            audioInputPaused = true;
            return;
          }
          if (userTranscript) {
            markIntroUserEngaged("user_transcript", userTranscript);
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
          if (introGenerationPhase === "suppressing-technical-first-message") {
            audioInputPaused = true;
            scheduleGeneratedIntroRequest();
            return;
          }
          if (audioBase64) {
            if (introAwaitingUser && !introUserEngaged) {
              return;
            }
            audioInputPaused = true;
            audioChunkCount += 1;
            window.clearTimeout(finishTimer);
            if (bufferGeneratedIntro && !introPlaybackFinished) {
              bufferedIntroAudio.push({ audioBase64, format: agentAudioFormat });
              scheduleReady(900);
              return;
            }
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
          if (introGenerationPhase === "suppressing-technical-first-message") {
            completeTechnicalFirstMessage();
            return;
          }
          if (introGenerationPhase === "waiting-for-generated-intro") {
            introGenerationPhase = "complete";
          }
          if (introAwaitingUser && !introUserEngaged) {
            return;
          }
          window.clearTimeout(responseTimer);
          rememberAgentText(payload.agent_response_event?.agent_response);
          return;
        }

        if (payload.type === "agent_chat_response_part") {
          const part = payload.text_response_part || {};
          const partType = String(part.type || "").trim();

          if (introGenerationPhase === "suppressing-technical-first-message") {
            if (partType === "stop") {
              completeTechnicalFirstMessage();
            }
            return;
          }
          if (introGenerationPhase === "waiting-for-generated-intro") {
            introGenerationPhase = "complete";
          }
          if (introAwaitingUser && !introUserEngaged) {
            return;
          }

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
          if (introGenerationPhase === "suppressing-technical-first-message") {
            completeTechnicalFirstMessage();
            return;
          }
          if (introGenerationPhase === "waiting-for-generated-intro") {
            introGenerationPhase = "complete";
          }
          if (introAwaitingUser && !introUserEngaged) {
            return;
          }
          window.clearTimeout(responseTimer);
          if (streamedAgentText && !finalAgentText) {
            finalAgentText = streamedAgentText;
          }
          scheduleReady(900);
          return;
        }

        if (payload.type === "vad_score") {
          const score = Number(payload.vad_score_event?.vad_score || 0);
          if (score >= introServerVadSpeakingLevel) {
            markIntroUserEngaged("vad_score");
          }
          callbacks.onInputLevel?.({
            inputLevel: score,
            speaking: score >= introServerVadSpeakingLevel,
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

  async function sendVoiceMessage(assistantId = DEFAULT_AI_ASSISTANT_ID, message = "", options = {}) {
    const assistant = assistantById(assistantId);
    const text = String(message || "").trim();
    const instructionOnly = options.instructionOnly === true;
    const automaticSpeech = options.automaticSpeech === true;
    const automaticSpeechCueUrl = String(options.automaticSpeechCueUrl || "").trim();

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

    const signedUrlSession = await prepareSignedUrl(assistant.id, { interfaceMode: "voice" });
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
      let automaticCuePromise = null;

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
          dynamic_variables: {
            ...dynamicVariablesForSession(signedUrlSession, instructionOnly ? "voice-instruction" : "voice"),
            voice_instruction_only: instructionOnly
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
          if (instructionOnly) {
            const toolCallId = String(payload.client_tool_call?.tool_call_id || "").trim();
            if (toolCallId) {
              sendJson({
                type: "client_tool_result",
                tool_call_id: toolCallId,
                result: JSON.stringify({
                  ok: false,
                  status: "disabled_for_voice_instruction",
                  error: "Přehrání pevného hlasového pokynu nesmí spouštět nástroje ani měnit stav."
                }),
                is_error: true
              });
            }
          } else {
            sendClientToolResult(socket, payload.client_tool_call);
          }
          return;
        }

        if (payload.type === "audio") {
          const audioBase64 = payload.audio_event?.audio_base_64;
          if (audioBase64) {
            audioChunkCount += 1;
            if (automaticSpeech && !automaticCuePromise) {
              automaticCuePromise = voiceAudioPlayer.playCue(automaticSpeechCueUrl);
            }
            Promise.resolve(automaticCuePromise)
              .then(() => voiceAudioPlayer.playPcmChunk(audioBase64, agentAudioFormat))
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
    discardVoiceInput,
    prepareVoiceInput,
    prepareSignedUrl,
    playVoiceCue: voiceAudioPlayer.playCue,
    sendTextMessage,
    startVoiceConversation,
    sendVoiceMessage,
    stopVoiceAudio,
    unlockVoiceAudio
  };
}
