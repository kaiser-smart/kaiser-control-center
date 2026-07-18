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
  isListening = false,
  speakingHologram = false,
  hologramPath = "",
  assistantName = "Šarlota"
} = {}) {
  if (!visible) {
    return "";
  }

  if (speakingHologram && hologramPath) {
    return `
      <aside class="ai-sarlota-speaking-hologram" role="status" aria-live="polite" aria-label="${escapeHtml(assistantName)} právě mluví">
        <div class="ai-sarlota-speaking-hologram__figure" aria-hidden="true">
          <span class="ai-sarlota-speaking-hologram__glow"></span>
          <img src="${escapeHtml(hologramPath)}" alt="" />
          <span class="ai-sarlota-speaking-hologram__scan"></span>
        </div>
        <div class="ai-sarlota-speaking-hologram__status">
          <strong>${escapeHtml(assistantName)} mluví</strong>
          <span class="ai-sarlota-speaking-hologram__wave" aria-hidden="true">
            <i></i><i></i><i></i><i></i>
          </span>
          <button type="button" data-ai-stop-voice>Ukončit</button>
        </div>
      </aside>
    `;
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
    <button class="ai-assistant-launcher" type="button" data-ai-launcher data-ai-launcher-mode="voice" aria-label="Otevřít Šarlotu">
      <span class="ai-assistant-launcher__icon" aria-hidden="true"></span>
      <span>Šarlota</span>
    </button>
  `;
}
