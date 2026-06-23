import { AiVoiceAssistantPanel } from "./AiVoiceAssistantPanel.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMessageActions(actions = []) {
  if (!actions.length) {
    return "";
  }

  return `
    <div class="ai-assistant-chat__message-actions">
      ${actions
        .map(
          (action) => `
            <button
              class="ai-assistant-chat__action"
              type="button"
              data-ai-route="${escapeHtml(action.route)}"
            >
              ${escapeHtml(action.label)}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderMessages(messages = []) {
  return messages
    .map(
      (message) => `
        <article class="ai-assistant-chat__message ai-assistant-chat__message--${escapeHtml(message.sender)}">
          <span class="ai-assistant-chat__message-label">
            ${message.sender === "user" ? "Ty" : "Smart pomocník"}
          </span>
          <p>${escapeHtml(message.text)}</p>
          ${renderMessageActions(message.actions)}
        </article>
      `
    )
    .join("");
}

export function AiAssistantChat({
  open = false,
  mode = "text",
  messages = [],
  input = "",
  isListening = false,
  demoPlaying = false,
  demoSpeaker = "",
  demoSpeakerLabel = "",
  demoLine = "",
  demoStatus = ""
} = {}) {
  if (!open) {
    return "";
  }

  const isVoiceMode = mode === "voice";
  const headerText = "Napiš, s čím potřebuješ poradit.";

  if (isVoiceMode) {
    return AiVoiceAssistantPanel({
      open,
      listening: isListening,
      demoPlaying,
      demoSpeaker,
      demoSpeakerLabel,
      demoLine,
      demoStatus
    });
  }

  return `
    <section
      class="ai-assistant-chat ai-assistant-chat--${escapeHtml(mode)}"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-assistant-title"
    >
      <header class="ai-assistant-chat__header">
        <div>
          <span class="ai-assistant-chat__eyebrow">Smart odpady</span>
          <h2 id="ai-assistant-title">Smart pomocník</h2>
          <p>${escapeHtml(headerText)}</p>
        </div>
        <button class="ai-assistant-chat__close" type="button" data-ai-close aria-label="Zavřít Smart pomocníka">
          Zavřít
        </button>
      </header>

      ${
        messages.length
          ? `<div class="ai-assistant-chat__messages" aria-live="polite">
              ${renderMessages(messages)}
            </div>`
          : ""
      }

      <form class="ai-assistant-chat__composer" data-ai-form>
        <label class="sr-only" for="ai-assistant-input">Napiš dotaz</label>
        <input
          id="ai-assistant-input"
          name="question"
          type="text"
          value="${escapeHtml(input)}"
          placeholder="Napiš dotaz…"
          autocomplete="off"
          data-ai-input
        />
        <button class="primary-action" type="submit">Odeslat</button>
      </form>
    </section>
  `;
}
