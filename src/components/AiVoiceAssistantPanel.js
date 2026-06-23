import { AssistantAvatarSelector } from "./AssistantAvatarSelector.js";

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
  assistant = null,
  assistants = [],
  selectedAssistantId = "",
  avatarAssetStatus = {},
  elevenLabsStatus = "",
  listening = false,
  voiceStatus = "",
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
  const fallbackStatus = listening ? "Poslouchám…" : "Klepnutím spustíš hlasový pokyn.";
  const statusText = demoStatus || (normalizedVoiceStatus && normalizedVoiceStatus !== "Připraven"
    ? normalizedVoiceStatus
    : fallbackStatus);

  return `
    <section
      class="ai-voice-assistant-panel ${listening ? "ai-voice-assistant-panel--listening" : ""} ${demoPlaying ? "ai-voice-assistant-panel--demo-playing" : ""} ${speakerClass}"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-voice-assistant-title"
    >
      <header class="ai-voice-assistant-panel__header">
        <div class="ai-voice-assistant-panel__topline">
          <button class="ai-voice-assistant-panel__close" type="button" data-ai-close aria-label="Zavřít Smart pomocníka">
            Zavřít
          </button>
        </div>
        <h2 id="ai-voice-assistant-title">${escapeHtml(assistantName)}</h2>
        <p>${escapeHtml(assistant?.intro || "Hlasový pomocník pro Smart odpady.")}</p>
      </header>

      ${AssistantAvatarSelector({ assistants, selectedAssistantId, avatarAssetStatus })}

      <div class="ai-voice-assistant-panel__body">
        <button
          class="ai-voice-assistant-panel__mic"
          type="button"
          data-ai-start-voice
          aria-label="Spustit hlasového pomocníka"
          aria-pressed="${listening ? "true" : "false"}"
        >
          <img src="src/assets/smart-helper-microphone.png" alt="" aria-hidden="true" />
        </button>
        <p class="ai-voice-assistant-panel__status" aria-live="polite">
          ${escapeHtml(statusText)}
        </p>
        ${elevenLabsStatus ? `
          <p class="ai-voice-assistant-panel__elevenlabs-status">${escapeHtml(elevenLabsStatus)}</p>
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
      </div>
    </section>
  `;
}
