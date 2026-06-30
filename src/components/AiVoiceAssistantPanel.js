function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const VOICE_UI_STATES = [
  "idle",
  "connecting",
  "ready",
  "listening",
  "userSpeaking",
  "processing",
  "assistantSpeaking",
  "muted",
  "microphoneDenied",
  "disconnected",
  "error"
];

const STOPPABLE_VOICE_STATES = [
  "connecting",
  "ready",
  "listening",
  "userSpeaking",
  "processing",
  "assistantSpeaking"
];

function compactVoiceStatus(state, { listening = false, demoStatus = "", voiceStatus = "" } = {}) {
  if (demoStatus) {
    return "Naslouchám…";
  }

  if (state === "connecting") {
    return "Připojuji…";
  }

  if (state === "ready") {
    return "Mluvte prosím";
  }

  if (listening || state === "listening" || state === "userSpeaking") {
    return "Naslouchám…";
  }

  if (state === "processing") {
    return "Zpracovávám…";
  }

  if (state === "assistantSpeaking") {
    return "Odpovídám…";
  }

  if (state === "microphoneDenied" || state === "disconnected" || state === "error") {
    return "Nepodařilo se spustit mikrofon.";
  }

  const normalized = String(voiceStatus || "").trim();
  if (normalized && normalized !== "Připraven") {
    return normalized.length > 32 ? "Zpracovávám…" : normalized;
  }

  return "";
}

export function AiVoiceAssistantPanel({
  open = false,
  mode = "voice",
  assistant = null,
  elevenLabsStatus = "",
  listening = false,
  voiceStatus = "",
  voiceUiState = "idle",
  voiceTranscript = "",
  voiceAnswer = "",
  voiceTags = [],
  voiceNotice = "",
  voiceWakeLockMessage = "",
  assistantStatus = null,
  assistantStatusLoading = false,
  assistantStatusError = "",
  quickStart = false,
  demoPlaying = false,
  demoSpeaker = "",
  demoSpeakerLabel = "",
  demoLine = "",
  demoStatus = ""
} = {}) {
  if (!open) {
    return "";
  }

  const assistantName = assistant?.name || "Šarlota";
  const normalizedVoiceUiState = VOICE_UI_STATES.includes(voiceUiState)
    ? voiceUiState
    : "idle";
  const microphonePath = assistant?.microphonePath || "/avatars/sarlota-microphone-black.png";
  const canStopVoice = demoPlaying || listening || STOPPABLE_VOICE_STATES.includes(normalizedVoiceUiState);
  const voiceBusy = listening || [
    "connecting",
    "listening",
    "userSpeaking",
    "processing",
    "assistantSpeaking"
  ].includes(normalizedVoiceUiState);
  const micLabel = normalizedVoiceUiState === "microphoneDenied"
    ? "Zkusit znovu povolit mikrofon"
    : normalizedVoiceUiState === "disconnected"
    ? "Obnovit spojení se Šarlotou"
    : normalizedVoiceUiState === "error"
      ? "Zkusit znovu spustit hlasového pomocníka"
      : "Spustit hlasového pomocníka";
  const statusText = compactVoiceStatus(normalizedVoiceUiState, {
    listening,
    demoStatus,
    voiceStatus
  });
  const showStatus = Boolean(statusText);
  const hasError = ["microphoneDenied", "disconnected", "error"].includes(normalizedVoiceUiState);

  return `
    <section
      class="ai-voice-assistant-panel ai-voice-assistant-panel--minimal ai-voice-assistant-panel--state-${escapeHtml(normalizedVoiceUiState)} ${quickStart ? "ai-voice-assistant-panel--deep-link" : ""} ${listening ? "ai-voice-assistant-panel--listening" : ""} ${demoPlaying ? "ai-voice-assistant-panel--demo-playing" : ""}"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-voice-assistant-title"
    >
      <header class="ai-voice-assistant-panel__header">
        <h2 id="ai-voice-assistant-title" class="sr-only">${escapeHtml(assistantName)}</h2>
        <button class="ai-voice-assistant-panel__close" type="button" data-ai-close aria-label="Zavřít hlasové okno">
          Zavřít
        </button>
      </header>

      <div class="ai-voice-assistant-panel__body">
        <div class="ai-voice-assistant-panel__stage">
          <div class="ai-voice-assistant-panel__voice-control">
            <button
              class="ai-voice-assistant-panel__mic"
              type="button"
              data-ai-start-voice
              aria-label="${escapeHtml(micLabel)}"
              aria-pressed="${listening ? "true" : "false"}"
              title="${escapeHtml(micLabel)}"
              ${voiceBusy ? "disabled" : ""}
            >
              <span class="ai-voice-assistant-panel__mic-loader" aria-hidden="true"></span>
              <img src="${escapeHtml(microphonePath)}" alt="" aria-hidden="true" />
            </button>
            <span class="ai-voice-assistant-panel__wave" aria-hidden="true">
              <span></span><span></span><span></span><span></span>
            </span>
          </div>
          ${showStatus ? `
            <p class="ai-voice-assistant-panel__status ${hasError ? "ai-voice-assistant-panel__status--error" : ""}" aria-live="polite">
              ${escapeHtml(statusText)}
            </p>
          ` : ""}
        </div>
      </div>

      <footer class="ai-voice-assistant-panel__actions">
        ${canStopVoice ? `
          <button class="ai-voice-assistant-panel__stop" type="button" data-ai-stop-voice>
            ${demoPlaying ? "Zastavit" : "Ukončit"}
          </button>
        ` : ""}
        <button class="ai-voice-assistant-panel__close ai-voice-assistant-panel__close--bottom" type="button" data-ai-close aria-label="Zavřít hlasové okno">
          Zavřít
        </button>
      </footer>
    </section>
  `;
}
