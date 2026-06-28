function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function AiAssistantPromoModal({
  visible = false,
  videoUrl = "/avatars/sarlota-intro.mp4",
  fallbackImageUrl = "/avatars/sarlota-microphone.png",
  videoFailed = false,
  saving = false
} = {}) {
  if (!visible) {
    return "";
  }

  const safeVideoUrl = videoUrl || "/avatars/sarlota-intro.mp4";
  const safeFallbackImageUrl = fallbackImageUrl || "/avatars/sarlota-microphone.png";

  return `
    <div class="ai-assistant-promo-backdrop" role="presentation">
      <section
        class="ai-assistant-promo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assistant-promo-title"
        aria-describedby="ai-assistant-promo-description"
      >
        <div class="ai-assistant-promo-modal__media">
          ${videoFailed ? `
            <div class="ai-assistant-promo-modal__fallback" role="img" aria-label="Šarlota">
              <img src="${escapeHtml(safeFallbackImageUrl)}" alt="" aria-hidden="true" />
              <span>Video se nepodařilo přehrát</span>
            </div>
          ` : `
            <video
              src="${escapeHtml(safeVideoUrl)}"
              poster="${escapeHtml(safeFallbackImageUrl)}"
              playsinline
              controls
              preload="metadata"
              data-ai-promo-video
              aria-label="Ukázka hlasové asistentky Šarloty"
            ></video>
          `}
        </div>
        <div class="ai-assistant-promo-modal__content">
          <span class="ai-assistant-promo-modal__badge">ŠARLOTA</span>
          <h2 id="ai-assistant-promo-title">Vyzkoušejte Šarlotu</h2>
          <p id="ai-assistant-promo-description">
            Šarlota vám pomůže najít informace, zapsat hlášení nebo otevřít správný modul hlasem.
          </p>
        </div>
        <div class="ai-assistant-promo-modal__actions">
          <button
            class="ai-assistant-promo-modal__secondary"
            type="button"
            data-ai-promo-action="declined"
            ${saving ? "disabled" : ""}
          >
            Nechci
          </button>
          <button
            class="ai-assistant-promo-modal__primary"
            type="button"
            data-ai-promo-action="accepted"
            ${saving ? "disabled" : ""}
          >
            To vyzkouším
          </button>
        </div>
      </section>
    </div>
  `;
}
