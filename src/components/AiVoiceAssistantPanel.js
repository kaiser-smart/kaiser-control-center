import { AiAssistantModeSwitch } from "./AiAssistantModeSwitch.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const VOICE_UI_STATES = [
  "idle",
  "connecting",
  "ready",
  "listening",
  "userSpeaking",
  "processing",
  "assistantSpeaking",
  "muted",
  "microphoneDenied",
  "disconnected",
  "error"
];

const STOPPABLE_VOICE_STATES = [
  "connecting",
  "ready",
  "listening",
  "userSpeaking",
  "processing",
  "assistantSpeaking"
];

function statusMeta(status) {
  const normalized = String(status || "unverified").trim().toLowerCase();
  const labels = {
    ok: "OK",
    error: "chyba",
    configured: "OK",
    unverified: "NEOVĚŘENO",
    waiting: "NEOVĚŘENO"
  };

  return {
    status: labels[normalized] ? normalized : "unverified",
    label: labels[normalized] || "NEOVĚŘENO"
  };
}

function statusBadge(status) {
  const meta = statusMeta(status);
  const tone = meta.status === "configured" ? "ok" : meta.status;

  return `
    <span class="ai-voice-assistant-panel__status-badge ai-voice-assistant-panel__status-badge--${escapeHtml(tone)}">
      ${escapeHtml(meta.label)}
    </span>
  `;
}

function assistantStatusRows(status = null) {
  const statuses = status?.statuses || {};
  const rows = [
    statuses.elevenLabs || { label: "ElevenLabs", status: "unverified", detail: "NEOVĚŘENO" },
    statuses.openAi || { label: "OpenAI", status: "unverified", detail: "NEOVĚŘENO" },
    statuses.ksoBackend || { label: "KSO backend", status: "unverified", detail: "NEOVĚŘENO" },
    statuses.signedUrl || { label: "signed-url endpoint", status: "unverified", detail: "NEOVĚŘENO" },
    statuses.personalization || { label: "Personalizace", status: "unverified", detail: "NEOVĚŘENO" },
    statuses.introAnnouncement || { label: "intro_announcement", status: "unverified", detail: "NEOVĚŘENO" },
    statuses.vocative || { label: "Vocativ", status: "unverified", detail: "NEOVĚŘENO" }
  ];

  return rows.map((row) => `
    <div class="ai-voice-assistant-panel__status-row">
      <span>${escapeHtml(row.label || "Stav")}</span>
      ${statusBadge(row.status)}
      <em>${escapeHtml(row.detail || "NEOVĚŘENO")}</em>
    </div>
  `).join("");
}

export function AiVoiceAssistantPanel({
  open = false,
  mode = "voice",
  assistant = null,
  elevenLabsStatus = "",
  listening = false,
  voiceStatus = "",
  voiceUiState = "idle",
  voiceTranscript = "",
  voiceAnswer = "",
  voiceTags = [],
  voiceNotice = "",
  voiceWakeLockMessage = "",
  assistantStatus = null,
  assistantStatusLoading = false,
  assistantStatusError = "",
  quickStart = false,
  demoPlaying = false,
  demoSpeaker = "",
  demoSpeakerLabel = "",
  demoLine = "",
  demoStatus = ""
} = {}) {
  if (!open) {
    return "";
  }

  const assistantName = assistant?.name || "Smart pomocník";
  const speakerClass = demoSpeaker ? `ai-voice-assistant-panel--speaker-${escapeHtml(demoSpeaker)}` : "";
  const normalizedVoiceStatus = String(voiceStatus || "").trim();
  const normalizedVoiceUiState = VOICE_UI_STATES.includes(voiceUiState)
    ? voiceUiState
    : "idle";
  const fallbackStatus = listening ? "Poslouchám…" : "Klepni a začni";
  const statusText = demoStatus || (normalizedVoiceStatus && normalizedVoiceStatus !== "Připraven"
    ? normalizedVoiceStatus
    : fallbackStatus);
  const microphonePath = assistant?.microphonePath || "/avatars/sarlota-microphone-black.png";
  const transcriptText = String(voiceTranscript || "").trim();
  const answerText = String(voiceAnswer || "").trim();
  const noticeText = String(voiceNotice || "").trim();
  const wakeLockText = String(voiceWakeLockMessage || "").trim();
  const showMicrophoneHelp = normalizedVoiceUiState === "microphoneDenied"
    || noticeText.includes("Mikrofon není povolený")
    || noticeText.includes("oprávnění prohlížeče")
    || noticeText.includes("oprávnění mikrofonu");
  const rawConnectionStatus = String(elevenLabsStatus || "").trim();
  const connectionStatus = rawConnectionStatus.includes("Agent ID a API klíč")
    ? "Spojení připravíme po klepnutí."
    : rawConnectionStatus;
  const canStopVoice = demoPlaying || listening || STOPPABLE_VOICE_STATES.includes(normalizedVoiceUiState);
  const voiceBusy = listening || [
    "connecting",
    "listening",
    "userSpeaking",
    "processing",
    "assistantSpeaking"
  ].includes(normalizedVoiceUiState);
  const micLabel = normalizedVoiceUiState === "microphoneDenied"
    ? "Zkusit znovu povolit mikrofon"
    : normalizedVoiceUiState === "disconnected"
    ? "Obnovit spojení se Šarlotou"
    : normalizedVoiceUiState === "error"
      ? "Zkusit znovu spustit hlasového pomocníka"
      : "Spustit hlasového pomocníka";
  const primaryActionText = normalizedVoiceUiState === "microphoneDenied"
    ? "Zkusit znovu"
    : normalizedVoiceUiState === "disconnected"
    ? "Obnovit spojení"
    : normalizedVoiceUiState === "error"
      ? "Zkusit znovu"
      : normalizedVoiceUiState === "connecting"
        ? "Připojuji…"
        : normalizedVoiceUiState === "assistantSpeaking"
          ? "Šarlota mluví"
          : normalizedVoiceUiState === "processing"
            ? "Zpracovávám"
            : listening || normalizedVoiceUiState === "listening" || normalizedVoiceUiState === "userSpeaking"
              ? "Mikrofon běží"
              : "Spustit hlas";
  const statusHint = normalizedVoiceUiState === "listening"
    ? "Mluv normálně do telefonu."
    : normalizedVoiceUiState === "assistantSpeaking"
      ? "Nech zapnutý zvuk zařízení."
      : normalizedVoiceUiState === "microphoneDenied"
        ? "Povol mikrofon pro tento web."
      : normalizedVoiceUiState === "disconnected"
        ? "Zkontroluj mikrofon a obnov hovor."
        : normalizedVoiceUiState === "error"
          ? "Zkontroluj oprávnění mikrofonu."
          : "Mikrofon se spustí až po klepnutí.";
  const tags = Array.isArray(voiceTags) && voiceTags.length
    ? voiceTags
    : ["Připraven", "Bez odeslání", "Čeká na hlas"];
  const showTopVoiceLaunch = mode === "voice";
  const topLaunchText = demoPlaying
    ? "Ukázka běží"
    : voiceBusy
      ? primaryActionText
      : "Spustit hlas";
  const topLaunchHint = demoPlaying
    ? "Ukázku zastavíš tlačítkem Zastavit."
    : voiceBusy
      ? statusHint
      : "Mikrofon se spustí až po klepnutí.";

  return `
    <section
      class="ai-voice-assistant-panel ai-voice-assistant-panel--state-${escapeHtml(normalizedVoiceUiState)} ${showTopVoiceLaunch ? "ai-voice-assistant-panel--quick-start" : ""} ${quickStart ? "ai-voice-assistant-panel--deep-link" : ""} ${listening ? "ai-voice-assistant-panel--listening" : ""} ${demoPlaying ? "ai-voice-assistant-panel--demo-playing" : ""} ${speakerClass}"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-voice-assistant-title"
    >
      <header class="ai-voice-assistant-panel__header">
        <div class="ai-voice-assistant-panel__topline">
          <div class="ai-voice-assistant-panel__identity">
            <h2 id="ai-voice-assistant-title">${escapeHtml(assistantName)}</h2>
            <p>AI asistentka Smart odpady</p>
          </div>
          <button class="ai-voice-assistant-panel__close" type="button" data-ai-close aria-label="Zavřít Smart pomocníka">
            Zavřít
          </button>
        </div>
        <div class="ai-voice-assistant-panel__connection" aria-live="polite">
          ${escapeHtml(connectionStatus || "Připraveno po klepnutí.")}
        </div>
      </header>

      <div class="ai-voice-assistant-panel__body">
        ${showTopVoiceLaunch ? `
          <div class="ai-voice-assistant-panel__quick-start" aria-label="Rychlé spuštění Šarloty">
            <button class="ai-voice-assistant-panel__quick-start-button" type="button" data-ai-start-voice ${voiceBusy || demoPlaying ? "disabled" : ""}>
              ${escapeHtml(topLaunchText)}
            </button>
            <p>${escapeHtml(topLaunchHint)}</p>
          </div>
        ` : ""}

        <div class="ai-voice-assistant-panel__mode">
          ${AiAssistantModeSwitch({ mode })}
        </div>

        <div class="ai-voice-assistant-panel__system-status" aria-label="Stav Šarloty">
          <div class="ai-voice-assistant-panel__system-status-head">
            <strong>Stav připojení</strong>
            <span>${escapeHtml(assistantStatusLoading ? "Načítám…" : assistantStatus?.generatedAt ? "Aktualizováno" : "NEOVĚŘENO")}</span>
          </div>
          ${assistantStatusError ? `
            <p class="ai-voice-assistant-panel__system-status-error" role="alert">
              ${escapeHtml(assistantStatusError)}
            </p>
          ` : ""}
          <div class="ai-voice-assistant-panel__status-grid">
            ${assistantStatusRows(assistantStatus)}
          </div>
        </div>

        <div class="ai-voice-assistant-panel__stage">
          <div class="ai-voice-assistant-panel__voice-control">
            <span class="ai-voice-assistant-panel__wave ai-voice-assistant-panel__wave--left" aria-hidden="true">
              <span></span><span></span><span></span><span></span>
            </span>
            <button
              class="ai-voice-assistant-panel__mic"
              type="button"
              data-ai-start-voice
              aria-label="${escapeHtml(micLabel)}"
              aria-pressed="${listening ? "true" : "false"}"
              title="${escapeHtml(micLabel)}"
              ${voiceBusy ? "disabled" : ""}
            >
              <span class="ai-voice-assistant-panel__mic-loader" aria-hidden="true"></span>
              <img src="${escapeHtml(microphonePath)}" alt="" aria-hidden="true" />
            </button>
            <span class="ai-voice-assistant-panel__wave ai-voice-assistant-panel__wave--right" aria-hidden="true">
              <span></span><span></span><span></span><span></span>
            </span>
          </div>
          <p class="ai-voice-assistant-panel__status" aria-live="polite">
            ${escapeHtml(statusText)}
          </p>
          <p class="ai-voice-assistant-panel__hint">${escapeHtml(statusHint)}</p>
          ${wakeLockText ? `
            <p class="ai-voice-assistant-panel__wake-lock" aria-live="polite">
              ${escapeHtml(wakeLockText)}
            </p>
          ` : ""}
        </div>

        ${noticeText ? `
          <div class="ai-voice-assistant-panel__notice" role="status">
            <p>${escapeHtml(noticeText)}</p>
            ${showMicrophoneHelp ? `
              <details class="ai-voice-assistant-panel__notice-help">
                <summary>Jak povolit mikrofon</summary>
                <ul>
                  <li>iPhone Safari: Nastavení → Safari → Mikrofon → Povolit</li>
                  <li>Chrome Android: ikona zámku u adresy → Oprávnění → Mikrofon → Povolit</li>
                  <li>Desktop Chrome: ikona zámku u adresy → Mikrofon → Povolit</li>
                </ul>
              </details>
            ` : ""}
          </div>
        ` : ""}
        ${demoLine ? `
          <article class="ai-voice-assistant-panel__demo-line" aria-live="polite">
            <span>${escapeHtml(demoSpeakerLabel)}</span>
            <p>${escapeHtml(demoLine)}</p>
          </article>
        ` : ""}
        <div class="ai-voice-assistant-panel__conversation" aria-label="Konverzace s AI asistentem">
          <article class="ai-voice-assistant-panel__bubble ai-voice-assistant-panel__bubble--user">
            <span>Přepis řeči</span>
            <p>${escapeHtml(transcriptText || "Přepis řeči se zobrazí tady.")}</p>
          </article>
          <article class="ai-voice-assistant-panel__bubble ai-voice-assistant-panel__bubble--assistant">
            <span>${escapeHtml(assistantName)}</span>
            <p>${escapeHtml(answerText || "Odpověď asistenta se zobrazí tady.")}</p>
          </article>
        </div>
        <div class="ai-voice-assistant-panel__tags" aria-label="Stavové štítky">
          ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
        </div>
      </div>

      <footer class="ai-voice-assistant-panel__actions">
        <button class="ai-voice-assistant-panel__primary" type="button" data-ai-start-voice ${voiceBusy ? "disabled" : ""}>
          ${escapeHtml(primaryActionText)}
        </button>
        <button class="ai-voice-assistant-panel__text-fallback" type="button" data-ai-mode="text">
          Napsat dotaz
        </button>
        ${canStopVoice ? `
          <button class="ai-voice-assistant-panel__stop" type="button" data-ai-stop-voice>
            ${demoPlaying ? "Zastavit ukázku" : "Zastavit"}
          </button>
        ` : ""}
      </footer>
    </section>
  `;
}
