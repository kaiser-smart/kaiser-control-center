import { AssistantAvatarSelector } from "./AssistantAvatarSelector.js";
import { AiAssistantModeSwitch } from "./AiAssistantModeSwitch.js";

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

function renderMessages(messages = [], assistantName = "Smart pomocník") {
  return messages
    .map(
      (message) => `
        <article class="ai-assistant-chat__message ai-assistant-chat__message--${escapeHtml(message.sender)}">
          <span class="ai-assistant-chat__message-label">
            ${message.sender === "user" ? "Ty" : escapeHtml(message.assistantName || assistantName)}
          </span>
          <p>${escapeHtml(message.text)}</p>
          ${renderMessageActions(message.actions)}
        </article>
      `
    )
    .join("");
}

export function AiTextAssistantPanel({
  open = false,
  mode = "text",
  messages = [],
  input = "",
  assistant,
  assistants = [],
  selectedAssistantId = "",
  avatarAssetStatus = {},
  elevenLabsStatus = "",
  textStatus = "",
  textSending = false
} = {}) {
  if (!open || !assistant) {
    return "";
  }

  const assistantSelector = assistants.length > 1
    ? AssistantAvatarSelector({ assistants, selectedAssistantId, avatarAssetStatus })
    : "";
  const statusText = String(textStatus || elevenLabsStatus || "").trim();

  return `
    <section
      class="ai-assistant-chat ai-assistant-chat--text"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-assistant-title"
    >
      <header class="ai-assistant-chat__header">
        <div>
          <span class="ai-assistant-chat__eyebrow">Smart odpady</span>
          <h2 id="ai-assistant-title">${escapeHtml(assistant.name)}</h2>
          <p>${escapeHtml(assistant.intro)}</p>
        </div>
        <button class="ai-assistant-chat__close" type="button" data-ai-close aria-label="Zavřít Smart pomocníka">
          Zavřít
        </button>
      </header>

      ${AiAssistantModeSwitch({ mode })}

      ${assistantSelector}

      ${statusText ? `
        <p class="ai-assistant-chat__voice-notice">${escapeHtml(statusText)}</p>
      ` : ""}

      ${
        messages.length
          ? `<div class="ai-assistant-chat__messages" aria-live="polite">
              ${renderMessages(messages, assistant.name)}
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
          ${textSending ? "disabled" : ""}
        />
        <button class="primary-action" type="submit" ${textSending ? "disabled" : ""}>
          ${textSending ? "Odesílám" : "Odeslat"}
        </button>
      </form>
    </section>
  `;
}
