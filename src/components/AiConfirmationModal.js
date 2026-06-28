function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function AiConfirmationModal({ confirmation = null } = {}) {
  if (!confirmation) {
    return "";
  }

  return `
    <div class="ai-confirmation-backdrop" role="presentation">
      <section
        class="ai-confirmation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-confirmation-title"
        aria-describedby="ai-confirmation-message"
      >
        <span class="ai-confirmation-modal__eyebrow">Potvrzení AI akce</span>
        <h2 id="ai-confirmation-title">${escapeHtml(confirmation.title)}</h2>
        <p id="ai-confirmation-message">${escapeHtml(confirmation.message)}</p>
        <div class="ai-confirmation-modal__actions">
          <button class="ai-secondary-button" type="button" data-ai-confirmation-action="cancel">
            ${escapeHtml(confirmation.cancelLabel || "Zrušit")}
          </button>
          <button class="primary-action" type="button" data-ai-confirmation-action="confirm">
            ${escapeHtml(confirmation.confirmLabel || "Potvrdit")}
          </button>
        </div>
      </section>
    </div>
  `;
}

