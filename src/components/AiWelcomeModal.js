function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function AiWelcomeModal({ visible = false } = {}) {
  if (!visible) {
    return "";
  }

  return `
    <div class="ai-welcome-backdrop" role="presentation">
      <section
        class="ai-welcome-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-welcome-title"
        aria-describedby="ai-welcome-description"
      >
        <div class="ai-welcome-modal__voice-mark" aria-hidden="true">
          <span class="ai-welcome-modal__mic"></span>
        </div>
        <span class="ai-welcome-modal__badge">SMART ODPADY</span>
        <h2 id="ai-welcome-title">Potřebuješ pomoct?</h2>
        <p id="ai-welcome-description">
          ${escapeHtml("Provedu tě aplikací, poradím kam kliknout a zvládnu i hlasové pokyny.")}
        </p>
        <div class="ai-welcome-modal__actions">
          <button class="ai-secondary-button" type="button" data-ai-welcome-action="dismiss">
            Zvládnu to sám
          </button>
          <button class="primary-action" type="button" data-ai-welcome-action="text">
            Textový pomocník
          </button>
          <button class="ai-voice-start-button" type="button" data-ai-welcome-action="voice">
            <span class="ai-voice-start-button__icon" aria-hidden="true"></span>
            Hlasový pomocník
          </button>
        </div>
      </section>
    </div>
  `;
}
