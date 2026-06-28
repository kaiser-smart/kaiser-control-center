import { AssistantAvatarCard } from "./AssistantAvatarCard.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function AssistantAvatarSelector({
  assistants = [],
  selectedAssistantId = "",
  avatarAssetStatus = {}
} = {}) {
  return `
    <div class="assistant-avatar-selector" aria-label="Volba Smart pomocníka">
      <span class="assistant-avatar-selector__label">${escapeHtml("Asistent")}</span>
      <div class="assistant-avatar-selector__grid">
        ${assistants
          .map((assistant) => AssistantAvatarCard({
            assistant,
            selected: assistant.id === selectedAssistantId,
            assetAvailable: avatarAssetStatus[assistant.id] === "available"
          }))
          .join("")}
      </div>
    </div>
  `;
}

