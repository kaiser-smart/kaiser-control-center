function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function VoiceAssistantButton({ listening = false, status = "Připraven" } = {}) {
  return `
    <div class="voice-assistant">
      <button
        class="voice-assistant__button ${listening ? "voice-assistant__button--active" : ""}"
        type="button"
        data-ai-start-voice
        aria-pressed="${listening ? "true" : "false"}"
      >
        <span class="voice-assistant__icon" aria-hidden="true"></span>
        <span class="voice-assistant__button-text">Mluvit</span>
      </button>
      <p class="voice-assistant__status" aria-live="polite">${escapeHtml(status)}</p>
      ${
        listening
          ? `<button class="voice-assistant__stop" type="button" data-ai-stop-voice>Zastavit</button>`
          : ""
      }
    </div>
  `;
}
