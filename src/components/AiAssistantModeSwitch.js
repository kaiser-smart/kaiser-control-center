function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function AiAssistantModeSwitch({ mode = "text" } = {}) {
  const activeMode = mode === "voice" ? "voice" : "text";
  const modes = [
    { id: "voice", label: "Hlasem" },
    { id: "text", label: "Textem" }
  ];

  return `
    <div class="ai-assistant-mode-switch" role="group" aria-label="Režim Šarloty">
      ${modes.map((item) => `
        <button
          class="ai-assistant-mode-switch__button ${activeMode === item.id ? "ai-assistant-mode-switch__button--active" : ""}"
          type="button"
          data-ai-mode="${escapeHtml(item.id)}"
          aria-pressed="${activeMode === item.id ? "true" : "false"}"
        >
          ${escapeHtml(item.label)}
        </button>
      `).join("")}
    </div>
  `;
}
