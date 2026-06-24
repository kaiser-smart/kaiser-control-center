import { AiAssistantModeSwitch } from "./AiAssistantModeSwitch.js";

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
  demoPlaying = false,
  demoSpeaker = "",
  demoSpeakerLabel = "",
  demoLine = "",
  demoStatus = ""
} = {}) {
  if (!open) {
    return "";
  }

  const assistantName = assistant?.name || "Smart pomocník";
  const speakerClass = demoSpeaker ? `ai-voice-assistant-panel--speaker-${escapeHtml(demoSpeaker)}` : "";
  const normalizedVoiceStatus = String(voiceStatus || "").trim();
  const normalizedVoiceUiState = VOICE_UI_STATES.includes(voiceUiState)
    ? voiceUiState
    : "idle";
  const fallbackStatus = listening ? "Poslouchám…" : "Klepni a začni";
  const statusText = demoStatus || (normalizedVoiceStatus && normalizedVoiceStatus !== "Připraven"
    ? normalizedVoiceStatus
    : fallbackStatus);
  const microphonePath = assistant?.microphonePath || "src/assets/smart-helper-microphone.png";
  const transcriptText = String(voiceTranscript || "").trim();
  const answerText = String(voiceAnswer || "").trim();
  const noticeText = String(voiceNotice || "").trim();
  const wakeLockText = String(voiceWakeLockMessage || "").trim();
  const showMicrophoneHelp = noticeText.includes("Mikrofon není povolený");
  const rawConnectionStatus = String(elevenLabsStatus || "").trim();
  const connectionStatus = rawConnectionStatus.includes("Agent ID a API klíč")
    ? "Spojení připravíme po klepnutí."
    : rawConnectionStatus;
  const canStopVoice = demoPlaying || listening || STOPPABLE_VOICE_STATES.includes(normalizedVoiceUiState);
  const voiceBusy = listening || [
    "connecting",
    "listening",
    "userSpeaking",
    "processing",
    "assistantSpeaking"
  ].includes(normalizedVoiceUiState);
  const micLabel = normalizedVoiceUiState === "disconnected"
    ? "Obnovit spojení se Šarlotou"
    : normalizedVoiceUiState === "error"
      ? "Zkusit znovu spustit hlasového pomocníka"
      : "Spustit hlasového pomocníka";
  const primaryActionText = normalizedVoiceUiState === "disconnected"
    ? "Obnovit spojení"
    : normalizedVoiceUiState === "error"
      ? "Zkusit znovu"
      : normalizedVoiceUiState === "connecting"
        ? "Připojuji…"
        : normalizedVoiceUiState === "assistantSpeaking"
          ? "Šarlota mluví"
          : normalizedVoiceUiState === "processing"
            ? "Zpracovávám"
            : listening || normalizedVoiceUiState === "listening" || normalizedVoiceUiState === "userSpeaking"
              ? "Mikrofon běží"
              : "Klepni a začni";
  const statusHint = normalizedVoiceUiState === "listening"
    ? "Mluvte normálně do telefonu."
    : normalizedVoiceUiState === "assistantSpeaking"
      ? "Nechte zapnutý zvuk zařízení."
      : normalizedVoiceUiState === "disconnected"
        ? "Klepnutím obnovíte hovor."
        : normalizedVoiceUiState === "error"
          ? "Zkontrolujte oprávnění mikrofonu."
          : "Mikrofon se spustí až po klepnutí.";
  const tags = Array.isArray(voiceTags) && voiceTags.length
    ? voiceTags
    : ["Připraven", "Bez odeslání", "Čeká na hlas"];

  return `
    <section
      class="ai-voice-assistant-panel ai-voice-assistant-panel--state-${escapeHtml(normalizedVoiceUiState)} ${listening ? "ai-voice-assistant-panel--listening" : ""} ${demoPlaying ? "ai-voice-assistant-panel--demo-playing" : ""} ${speakerClass}"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-voice-assistant-title"
    >
      <header class="ai-voice-assistant-panel__header">
        <div class="ai-voice-assistant-panel__topline">
          <div class="ai-voice-assistant-panel__identity">
            <h2 id="ai-voice-assistant-title">${escapeHtml(assistantName)}</h2>
            <p>AI asistentka Smart odpady</p>
          </div>
          <button class="ai-voice-assistant-panel__close" type="button" data-ai-close aria-label="Zavřít Smart pomocníka">
            Zavřít
          </button>
        </div>
        <div class="ai-voice-assistant-panel__connection" aria-live="polite">
          ${escapeHtml(connectionStatus || "Připraveno po klepnutí.")}
        </div>
      </header>

      <div class="ai-voice-assistant-panel__body">
        <div class="ai-voice-assistant-panel__mode">
          ${AiAssistantModeSwitch({ mode })}
        </div>

        <div class="ai-voice-assistant-panel__stage">
          <div class="ai-voice-assistant-panel__voice-control">
            <span class="ai-voice-assistant-panel__wave ai-voice-assistant-panel__wave--left" aria-hidden="true">
              <span></span><span></span><span></span><span></span>
            </span>
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
            <span class="ai-voice-assistant-panel__wave ai-voice-assistant-panel__wave--right" aria-hidden="true">
              <span></span><span></span><span></span><span></span>
            </span>
          </div>
          <p class="ai-voice-assistant-panel__status" aria-live="polite">
            ${escapeHtml(statusText)}
          </p>
          <p class="ai-voice-assistant-panel__hint">${escapeHtml(statusHint)}</p>
          ${wakeLockText ? `
            <p class="ai-voice-assistant-panel__wake-lock" aria-live="polite">
              ${escapeHtml(wakeLockText)}
            </p>
          ` : ""}
        </div>

        ${noticeText ? `
          <div class="ai-voice-assistant-panel__notice" role="status">
            <p>${escapeHtml(noticeText)}</p>
            ${showMicrophoneHelp ? `
              <ul>
                <li>iPhone Safari: Nastavení → Safari → Mikrofon → Povolit</li>
                <li>Chrome Android: ikona zámku u adresy → Oprávnění → Mikrofon → Povolit</li>
                <li>Desktop Chrome: ikona zámku u adresy → Mikrofon → Povolit</li>
              </ul>
            ` : ""}
          </div>
        ` : ""}
        ${demoLine ? `
          <article class="ai-voice-assistant-panel__demo-line" aria-live="polite">
            <span>${escapeHtml(demoSpeakerLabel)}</span>
            <p>${escapeHtml(demoLine)}</p>
          </article>
        ` : ""}
        <div class="ai-voice-assistant-panel__conversation" aria-label="Konverzace s AI asistentem">
          <article class="ai-voice-assistant-panel__bubble ai-voice-assistant-panel__bubble--user">
            <span>Přepis řeči</span>
            <p>${escapeHtml(transcriptText || "Přepis řeči se zobrazí tady.")}</p>
          </article>
          <article class="ai-voice-assistant-panel__bubble ai-voice-assistant-panel__bubble--assistant">
            <span>${escapeHtml(assistantName)}</span>
            <p>${escapeHtml(answerText || "Odpověď asistenta se zobrazí tady.")}</p>
          </article>
        </div>
        <div class="ai-voice-assistant-panel__tags" aria-label="Stavové štítky">
          ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
        </div>
      </div>

      <footer class="ai-voice-assistant-panel__actions">
        <button class="ai-voice-assistant-panel__primary" type="button" data-ai-start-voice ${voiceBusy ? "disabled" : ""}>
          ${escapeHtml(primaryActionText)}
        </button>
        ${canStopVoice ? `
          <button class="ai-voice-assistant-panel__stop" type="button" data-ai-stop-voice>
            ${demoPlaying ? "Zastavit ukázku" : "Ukončit"}
          </button>
        ` : ""}
      </footer>
    </section>
  `;
}
