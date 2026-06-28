function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function voiceDockTitle(state, listening) {
  if (state === "disconnected" || state === "error") {
    return "Spojení se přerušilo";
  }

  if (state === "assistantSpeaking") {
    return "Šarlota odpovídá";
  }

  if (state === "processing") {
    return "Šarlota zpracovává";
  }

  if (state === "connecting" || state === "ready") {
    return "Spojení aktivní";
  }

  if (listening || state === "listening" || state === "userSpeaking") {
    return "Šarlota poslouchá";
  }

  return "Šarlota je aktivní";
}

export function AiAssistantLauncher({
  visible = false,
  voiceActive = false,
  voiceUiState = "",
  voiceStatus = "",
  isListening = false
} = {}) {
  if (!visible) {
    return "";
  }

  if (voiceActive) {
    const title = voiceDockTitle(voiceUiState, isListening);
    const status = voiceUiState === "disconnected" || voiceUiState === "error"
      ? "Klepni pro obnovení."
      : (voiceStatus || "Spojení aktivní");

    return `
      <div class="ai-assistant-voice-dock ai-assistant-voice-dock--state-${escapeHtml(voiceUiState || "active")}" role="status" aria-live="polite">
        <span class="ai-assistant-voice-dock__pulse" aria-hidden="true"></span>
        <span class="ai-assistant-voice-dock__content">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(status)}</span>
        </span>
        <button class="ai-assistant-voice-dock__button" type="button" data-ai-launcher data-ai-launcher-mode="voice">
          Zobrazit Šarlotu
        </button>
        <button class="ai-assistant-voice-dock__button ai-assistant-voice-dock__button--stop" type="button" data-ai-stop-voice>
          Ukončit
        </button>
      </div>
    `;
  }

  return `
    <button class="ai-assistant-launcher" type="button" data-ai-launcher data-ai-launcher-mode="text" aria-label="Otevřít Smart pomocníka">
      <span class="ai-assistant-launcher__icon" aria-hidden="true"></span>
      <span>Pomocník</span>
    </button>
  `;
}
