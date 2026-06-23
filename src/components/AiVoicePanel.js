import { VoiceAssistantButton } from "./VoiceAssistantButton.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function AiVoicePanel({ listening = false, status = "Připraven", notice = "" } = {}) {
  return `
    <section class="ai-voice-panel" aria-label="Hlasový režim Smart pomocníka">
      <p class="ai-voice-panel__lead">
        Zkuste: „chci dovolenou“, „nahlásit nemoc“ nebo „otevřít pneumatiky“.
      </p>
      ${VoiceAssistantButton({ listening, status })}
      ${notice ? `<p class="ai-assistant-chat__voice-notice">${escapeHtml(notice)}</p>` : ""}
      <p class="ai-assistant-chat__privacy">
        Hlas se neukládá. Slouží jen pro aktuální pokyn.
      </p>
    </section>
  `;
}
