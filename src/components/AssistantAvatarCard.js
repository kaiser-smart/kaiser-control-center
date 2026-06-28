import { AI_ASSISTANT_AVATAR_PLACEHOLDER } from "../data/aiAssistants.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function AssistantAvatarCard({
  assistant,
  selected = false,
  assetAvailable = false
} = {}) {
  if (!assistant) {
    return "";
  }

  return `
    <button
      class="assistant-avatar-card ${selected ? "assistant-avatar-card--selected" : ""}"
      type="button"
      data-ai-assistant-select="${escapeHtml(assistant.id)}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <span class="assistant-avatar-card__media">
        ${
          assetAvailable
            ? `<img src="${escapeHtml(assistant.avatarPath)}" alt="" aria-hidden="true" />`
            : `<span class="assistant-avatar-card__placeholder">${escapeHtml(AI_ASSISTANT_AVATAR_PLACEHOLDER)}</span>`
        }
      </span>
      <span class="assistant-avatar-card__content">
        <strong>${escapeHtml(assistant.name)}</strong>
        <span>${escapeHtml(assistant.role)}</span>
      </span>
    </button>
  `;
}

