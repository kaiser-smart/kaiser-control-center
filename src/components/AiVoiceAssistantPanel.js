import { AiAssistantModeSwitch } from "./AiAssistantModeSwitch.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  const normalizedVoiceUiState = ["idle", "listening", "processing", "speaking", "error"].includes(voiceUiState)
    ? voiceUiState
    : "idle";
  const fallbackStatus = listening ? "Poslouchám…" : "Klepni a mluv";
  const statusText = demoStatus || (normalizedVoiceStatus && normalizedVoiceStatus !== "Připraven"
    ? normalizedVoiceStatus
    : fallbackStatus);
  const assistantTitle = `${assistantName} Smart asistentka`;
  const microphonePath = assistant?.microphonePath || "src/assets/smart-helper-microphone.png";
  const transcriptText = String(voiceTranscript || "").trim();
  const answerText = String(voiceAnswer || "").trim();
  const noticeText = String(voiceNotice || "").trim();
  const showMicrophoneHelp = noticeText.includes("Mikrofon není povolený");
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
          <span class="ai-voice-assistant-panel__app-name">Smart odpady</span>
          <button class="ai-voice-assistant-panel__close" type="button" data-ai-close aria-label="Zavřít Smart pomocníka">
            Zavřít
          </button>
        </div>
        <h2 id="ai-voice-assistant-title">${escapeHtml(assistantTitle)}</h2>
      </header>

      <div class="ai-voice-assistant-panel__body">
        ${AiAssistantModeSwitch({ mode })}

        <div class="ai-voice-assistant-panel__voice-control">
          <span class="ai-voice-assistant-panel__wave ai-voice-assistant-panel__wave--left" aria-hidden="true">
            <span></span><span></span><span></span><span></span>
          </span>
          <button
            class="ai-voice-assistant-panel__mic"
            type="button"
            data-ai-start-voice
            aria-label="Spustit hlasového pomocníka"
            aria-pressed="${listening ? "true" : "false"}"
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
        ${elevenLabsStatus ? `
          <p class="ai-voice-assistant-panel__elevenlabs-status">${escapeHtml(elevenLabsStatus)}</p>
        ` : ""}
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
        ${demoPlaying ? `
          <button class="ai-voice-assistant-panel__stop" type="button" data-ai-stop-voice>
            Zastavit ukázku
          </button>
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
    </section>
  `;
}
