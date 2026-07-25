export const RCS_SMS_AUTOPILOT_MODULE_KEY = "rcs-sms-autopilot";
export const RCS_SMS_AUTOPILOT_ROUTE = "/rcs-sms-konverzace";

export const rcsSmsAutopilotState = {
  items: [],
  total: 0,
  status: null,
  detail: null,
  selectedId: "",
  loaded: false,
  loading: false,
  detailLoading: false,
  actionPending: "",
  error: "",
  message: "",
  filters: {
    contactType: "",
    status: "",
    search: ""
  }
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  const text = String(value || "").trim();
  if (!text) return "neuvedeno";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function contactTypeLabel(value) {
  return {
    employee: "Uživatel KSO",
    customer: "Zákazník",
    unknown: "Neznámý",
    opted_out: "Odhlášený"
  }[value] || value || "Neznámý";
}

function statusLabel(value) {
  return {
    open: "Otevřeno",
    ai_processing: "AI odpovídá",
    awaiting_field: "Čeká na údaj",
    awaiting_confirmation: "Čeká na potvrzení",
    human_takeover: "Předáno člověku",
    closed: "Uzavřeno",
    blocked: "Blokováno",
    error: "Chyba",
    received: "Přijato",
    processing: "Zpracovává se",
    processing_failed: "Čeká na opakování",
    replied: "Odpovězeno",
    review_ready: "Návrh ke kontrole",
    autopilot_disabled: "Autopilot vypnutý"
  }[value] || value || "Neznámý";
}

function statusTone(value) {
  if (["open", "replied", "completed", "provider_accepted"].includes(value)) return "ready";
  if (["closed", "blocked", "autopilot_disabled"].includes(value)) return "neutral";
  if (["error", "processing_failed", "failed"].includes(value)) return "error";
  if (["human_takeover", "awaiting_confirmation", "awaiting_field", "review_ready"].includes(value)) return "warning";
  return "waiting";
}

function statusChip(value) {
  return `<span class="rcs-autopilot-chip rcs-autopilot-chip--${esc(statusTone(value))}">${esc(statusLabel(value))}</span>`;
}

function modeLabel(mode) {
  return {
    off: "Vypnuto",
    review: "Pouze návrhy",
    live: "Řízený live provoz"
  }[mode] || "Neověřeno";
}

function statusCards() {
  const status = rcsSmsAutopilotState.status || {};
  const counts = status.counts || {};
  const cards = [
    ["Režim", modeLabel(status.mode)],
    ["Konverzace", counts.conversations || 0],
    ["Čeká na člověka", counts.humanTakeover || 0],
    ["Neznámé kontakty", counts.unknownContacts || 0],
    ["Otevřené požadavky", counts.openRequests || 0],
    ["Chyby", counts.errors || 0]
  ];
  return `
    <div class="rcs-autopilot-stats">
      ${cards.map(([label, value]) => `
        <article>
          <span>${esc(label)}</span>
          <strong>${esc(value)}</strong>
        </article>
      `).join("")}
    </div>
  `;
}

function filtersForm() {
  const filters = rcsSmsAutopilotState.filters;
  return `
    <form class="rcs-autopilot-filters" data-rcs-autopilot-filters>
      <label>
        <span>Kontakt</span>
        <select name="contactType">
          <option value="">Všechny kontakty</option>
          <option value="employee"${filters.contactType === "employee" ? " selected" : ""}>Uživatelé KSO</option>
          <option value="customer"${filters.contactType === "customer" ? " selected" : ""}>Zákazníci</option>
          <option value="unknown"${filters.contactType === "unknown" ? " selected" : ""}>Neznámí</option>
          <option value="opted_out"${filters.contactType === "opted_out" ? " selected" : ""}>Odhlášení</option>
        </select>
      </label>
      <label>
        <span>Stav</span>
        <select name="status">
          <option value="">Všechny stavy</option>
          <option value="open"${filters.status === "open" ? " selected" : ""}>Otevřeno</option>
          <option value="awaiting_field"${filters.status === "awaiting_field" ? " selected" : ""}>Čeká na údaj</option>
          <option value="awaiting_confirmation"${filters.status === "awaiting_confirmation" ? " selected" : ""}>Čeká na potvrzení</option>
          <option value="human_takeover"${filters.status === "human_takeover" ? " selected" : ""}>Předáno člověku</option>
          <option value="error"${filters.status === "error" ? " selected" : ""}>Chyba</option>
          <option value="closed"${filters.status === "closed" ? " selected" : ""}>Uzavřeno</option>
        </select>
      </label>
      <label class="rcs-autopilot-filters__search">
        <span>Vyhledávání</span>
        <input name="search" type="search" value="${esc(filters.search)}" placeholder="Jméno, telefon, záměr nebo text" />
      </label>
      <div>
        <button class="primary-action" type="submit">Filtrovat</button>
        <button class="secondary-link" type="button" data-rcs-autopilot-reset>Reset</button>
      </div>
    </form>
  `;
}

function conversationList() {
  if (rcsSmsAutopilotState.loading && !rcsSmsAutopilotState.loaded) {
    return '<p class="rcs-autopilot-empty">Načítám konverzace…</p>';
  }
  if (rcsSmsAutopilotState.error) {
    return `
      <div class="rcs-autopilot-error" role="alert">
        <p>${esc(rcsSmsAutopilotState.error)}</p>
        <button class="secondary-link" type="button" data-rcs-autopilot-reload>Zkusit znovu</button>
      </div>
    `;
  }
  if (!rcsSmsAutopilotState.items.length) {
    return '<p class="rcs-autopilot-empty">Filtru neodpovídá žádná RCS/SMS konverzace.</p>';
  }
  return `
    <div class="rcs-autopilot-conversations" role="list">
      ${rcsSmsAutopilotState.items.map((item) => `
        <button
          class="rcs-autopilot-conversation${item.id === rcsSmsAutopilotState.selectedId ? " is-selected" : ""}"
          type="button"
          data-rcs-autopilot-open="${esc(item.id)}"
          role="listitem"
        >
          <span class="rcs-autopilot-conversation__top">
            <strong>${esc(item.contactName || item.phone || "Neznámý kontakt")}</strong>
            ${statusChip(item.status)}
          </span>
          <span>${esc(contactTypeLabel(item.contactType))} · ${esc(item.channel?.toUpperCase() || "SMS")}</span>
          <p>${esc(item.latestMessage?.body || "Zatím bez textu.")}</p>
          <small>${esc(formatDateTime(item.latestMessage?.createdAt || item.lastActivityAt))}${item.latestMessage?.intent ? ` · ${esc(item.latestMessage.intent)}` : ""}</small>
        </button>
      `).join("")}
    </div>
  `;
}

function messageBubble(item) {
  const outbound = item.direction === "outbound";
  return `
    <article class="rcs-autopilot-message rcs-autopilot-message--${outbound ? "outbound" : "inbound"}">
      <div>
        <strong>${outbound ? "Šarlota / KSO" : "Kontakt"}</strong>
        ${statusChip(item.status)}
      </div>
      <p>${esc(item.body || (item.media?.length ? "Samotná příloha bez textu." : "Prázdná zpráva."))}</p>
      ${item.media?.length ? `<small>${esc(item.media.length)} příloh · obsah je dostupný jen přes chráněný backend</small>` : ""}
      <time>${esc(formatDateTime(item.createdAt || item.receivedAt))}</time>
      ${item.intent ? `<small>Záměr: ${esc(item.intent)} · jistota ${esc(Math.round(Number(item.confidence || 0) * 100))} %</small>` : ""}
      ${item.requestedTool ? `<small>Nástroj: ${esc(item.requestedTool)}${item.requiresHuman ? " · vyžaduje člověka" : ""}</small>` : ""}
      ${item.errorMessage ? `<small class="rcs-autopilot-message__error">${esc(item.errorMessage)}</small>` : ""}
    </article>
  `;
}

function requestList(detail) {
  if (!detail.requests?.length) {
    return '<p class="rcs-autopilot-empty">Z této konverzace zatím nevznikl žádný provozní požadavek.</p>';
  }
  return `
    <div class="rcs-autopilot-request-list">
      ${detail.requests.map((item) => `
        <article>
          <span>${esc(item.requestType)}</span>
          <strong>${esc(item.summary || "Požadavek")}</strong>
          <small>${esc(statusLabel(item.status))} · ${esc(formatDateTime(item.createdAt))}</small>
        </article>
      `).join("")}
    </div>
  `;
}

function toolList(detail) {
  if (!detail.toolRuns?.length) {
    return '<p class="rcs-autopilot-empty">Žádný nástroj nebyl proveden.</p>';
  }
  return `
    <div class="rcs-autopilot-tool-list">
      ${detail.toolRuns.map((item) => `
        <article>
          <div><strong>${esc(item.toolName)}</strong>${statusChip(item.status)}</div>
          <span>${esc(item.executionMode)} · ${esc(formatDateTime(item.startedAt))}</span>
          ${item.errorMessage ? `<p>${esc(item.errorMessage)}</p>` : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function detailPanel(canManage) {
  if (rcsSmsAutopilotState.detailLoading) {
    return '<section class="rcs-autopilot-detail"><p class="rcs-autopilot-empty">Načítám detail…</p></section>';
  }
  const detail = rcsSmsAutopilotState.detail;
  if (!detail?.conversation) {
    return `
      <section class="rcs-autopilot-detail rcs-autopilot-detail--empty">
        <h2>Detail konverzace</h2>
        <p>Vyber vlevo konkrétní odpověď.</p>
      </section>
    `;
  }
  const conversation = detail.conversation;
  const originalOutbound = detail.originalOutbound;
  const pending = Boolean(rcsSmsAutopilotState.actionPending);
  return `
    <section class="rcs-autopilot-detail" aria-labelledby="rcs-autopilot-detail-title">
      <header>
        <div>
          <span>${esc(contactTypeLabel(conversation.contactType))} · ${esc(conversation.channel.toUpperCase())}</span>
          <h2 id="rcs-autopilot-detail-title">${esc(conversation.contactName || conversation.phone)}</h2>
          <p>${esc(conversation.phone)} · původní šablona ${esc(conversation.lastOutboundTemplateKey || "nenalezena")}</p>
        </div>
        ${statusChip(conversation.status)}
      </header>
      ${rcsSmsAutopilotState.message ? `<p class="rcs-autopilot-notice">${esc(rcsSmsAutopilotState.message)}</p>` : ""}
      ${canManage ? `
        <div class="rcs-autopilot-actions">
          ${conversation.humanTakeover
            ? `<button class="secondary-link" type="button" data-rcs-autopilot-action="release" ${pending ? "disabled" : ""}>Vrátit do otevřeného stavu</button>`
            : `<button class="primary-action" type="button" data-rcs-autopilot-action="take_over" ${pending ? "disabled" : ""}>Převzít konverzaci člověkem</button>`}
          ${conversation.status !== "closed" ? `<button class="secondary-link" type="button" data-rcs-autopilot-action="close" ${pending ? "disabled" : ""}>Uzavřít konverzaci</button>` : ""}
        </div>
      ` : ""}
      <div class="rcs-autopilot-context">
        <div><span>Identita</span><strong>${esc(contactTypeLabel(conversation.contactType))}</strong></div>
        <div><span>Zdroj oprávnění</span><strong>KSO backend</strong></div>
        <div><span>Otevřený záměr</span><strong>${esc(conversation.openIntent || "není")}</strong></div>
        <div><span>Čeká na údaj</span><strong>${esc(conversation.awaitingField || "ne")}</strong></div>
      </div>
      <section>
        <h3>Původní odchozí zpráva</h3>
        ${originalOutbound ? `
          <article class="rcs-autopilot-original">
            <div>
              <strong>${esc(originalOutbound.templateKey || "Provozní zpráva")}</strong>
              ${statusChip(originalOutbound.status)}
            </div>
            <p>${esc(originalOutbound.body || "Text původní zprávy není uložený.")}</p>
            <dl>
              <div><dt>Kanál</dt><dd>${esc((originalOutbound.channel || conversation.channel).toUpperCase())}</dd></div>
              <div><dt>Twilio SID</dt><dd>${esc(originalOutbound.twilioMessageSid || "neuvedeno")}</dd></div>
              <div><dt>Událost</dt><dd>${esc(originalOutbound.eventId || "neuvedena")}</dd></div>
              <div><dt>Vazba</dt><dd>${esc([originalOutbound.relatedEntityType, originalOutbound.relatedEntityId].filter(Boolean).join(" · ") || "neuvedena")}</dd></div>
            </dl>
            <time>${esc(formatDateTime(originalOutbound.createdAt))}</time>
          </article>
        ` : '<p class="rcs-autopilot-empty">Původní odchozí zpráva nebyla v zákaznickém logu nalezena.</p>'}
      </section>
      <section>
        <h3>Konverzace</h3>
        <div class="rcs-autopilot-thread">
          ${detail.messages.map(messageBubble).join("") || '<p class="rcs-autopilot-empty">Konverzace je prázdná.</p>'}
        </div>
      </section>
      <section>
        <h3>Provozní požadavky</h3>
        ${requestList(detail)}
      </section>
      <section>
        <h3>Provedené nástroje</h3>
        ${toolList(detail)}
      </section>
      <details>
        <summary>Audit a diagnostika</summary>
        <div class="rcs-autopilot-event-list">
          ${detail.events.map((item) => `
            <article>
              <strong>${esc(item.eventType)}</strong>
              <span>${esc(item.detail || item.status)}</span>
              <time>${esc(formatDateTime(item.createdAt))}</time>
            </article>
          `).join("") || '<p class="rcs-autopilot-empty">Audit je prázdný.</p>'}
        </div>
      </details>
    </section>
  `;
}

export function rcsSmsAutopilotEventLogHtml() {
  const status = rcsSmsAutopilotState.status || {};
  const mode = status.mode || "unknown";
  const asyncActive = status.asyncProcessing?.active === true;
  const liveActive = mode === "live" && asyncActive && status.outboundEffects === "enabled_with_server_gates";
  const reviewActive = mode === "review" && asyncActive;
  const lastEvent = status.lastEvent;
  return `
    <section class="rcs-autopilot-event-log" aria-labelledby="rcs-autopilot-event-log-title">
      <header>
        <div>
          <span>Nastavení → Log událostí</span>
          <h2 id="rcs-autopilot-event-log-title">Pravdivý provozní stav</h2>
        </div>
        ${statusChip(liveActive ? "open" : reviewActive ? "review_ready" : "autopilot_disabled")}
      </header>
      <div class="rcs-autopilot-event-log__grid">
        <article><span>Autopilot</span><strong>${esc(liveActive ? modeLabel(mode) : reviewActive ? modeLabel(mode) : "Vypnuto bezpečnostní bránou")}</strong><p>${liveActive ? "AI i odpovědi jsou povolené jen přes serverové ochrany." : reviewActive ? "AI vytváří pouze návrhy bez automatické odpovědi." : "AI a automatické odpovědi nemají provozní účinek."}</p></article>
        <article><span>Twilio</span><strong>${status.twilio?.twilioConfigured ? "Nastavené" : "Čeká na ENV"}</strong><p>Webhook používá podpis nebo serverový secret.</p></article>
        <article><span>OpenAI</span><strong>${status.openAi?.configured ? "Nastavené" : "Čeká na ENV"}</strong><p>Model pouze navrhuje strukturovaný výsledek.</p></article>
        <article><span>Cloud runner</span><strong>${status.retryRunner?.active ? "Aktivní podle režimu" : "Bez provozního účinku"}</strong><p>${esc(status.retryRunner?.cron || "*/5 * * * *")} · nejvýše tři pokusy.</p></article>
      </div>
      <details>
        <summary>Zobrazit diagnostiku</summary>
        <dl>
          <div><dt>Zdroj dat</dt><dd>D1 SMART_ODPADY_DB</dd></div>
          <div><dt>Zpracování</dt><dd>${esc(status.cloudProcessing || "Cloudflare Pages Functions waitUntil")}</dd></div>
          <div><dt>Asynchronní pravidlo</dt><dd>${asyncActive ? "active" : "inactive"}</dd></div>
          <div><dt>Oprávnění</dt><dd>${esc(status.permissionsSource || "KSO backend")}</dd></div>
          <div><dt>Externí účinky</dt><dd>${esc(status.outboundEffects || "disabled")}</dd></div>
          <div><dt>Poslední událost</dt><dd>${lastEvent ? `${esc(lastEvent.eventType)} · ${esc(formatDateTime(lastEvent.createdAt))}` : "Zatím není uložená"}</dd></div>
        </dl>
      </details>
    </section>
  `;
}

export function rcsSmsAutopilotContent({ canManage = false, rulesHtml = "" } = {}) {
  return `
    <div class="rcs-autopilot" data-rcs-sms-autopilot>
      <section class="rcs-autopilot-overview">
        <header>
          <div>
            <span>RCS/SMS Autopilot Šarlota</span>
            <h2>Společná schránka odpovědí</h2>
            <p>Jedno místo pro RCS i SMS. Telefon pomáhá najít kontext, ale oprávnění vždy ověřuje backend KSO.</p>
          </div>
          <button class="secondary-link" type="button" data-rcs-autopilot-reload ${rcsSmsAutopilotState.loading ? "disabled" : ""}>${rcsSmsAutopilotState.loading ? "Načítám…" : "Obnovit"}</button>
        </header>
        ${statusCards()}
        ${filtersForm()}
        <div class="rcs-autopilot-workspace">
          <section>
            <h3>Konverzace <span>${esc(rcsSmsAutopilotState.total)}</span></h3>
            ${conversationList()}
          </section>
          ${detailPanel(canManage)}
        </div>
      </section>
      ${rcsSmsAutopilotEventLogHtml()}
      ${rulesHtml}
    </div>
  `;
}

function queryString() {
  const params = new URLSearchParams({ pageSize: "50" });
  Object.entries(rcsSmsAutopilotState.filters).forEach(([key, value]) => {
    if (String(value || "").trim()) params.set(key, String(value).trim());
  });
  return params.toString();
}

export async function loadRcsSmsAutopilot(apiJson, render, options = {}) {
  if (rcsSmsAutopilotState.loading) return;
  rcsSmsAutopilotState.loading = true;
  rcsSmsAutopilotState.error = "";
  if (options.renderBefore !== false) render();
  try {
    const result = await apiJson(`/api/rcs-sms-autopilot?${queryString()}`);
    rcsSmsAutopilotState.items = Array.isArray(result.items) ? result.items : [];
    rcsSmsAutopilotState.total = Number(result.total || 0);
    rcsSmsAutopilotState.status = result.status || null;
    rcsSmsAutopilotState.loaded = true;
    if (
      rcsSmsAutopilotState.selectedId &&
      !rcsSmsAutopilotState.items.some((item) => item.id === rcsSmsAutopilotState.selectedId)
    ) {
      rcsSmsAutopilotState.selectedId = "";
      rcsSmsAutopilotState.detail = null;
    }
  } catch (error) {
    rcsSmsAutopilotState.items = [];
    rcsSmsAutopilotState.total = 0;
    rcsSmsAutopilotState.status = null;
    rcsSmsAutopilotState.loaded = true;
    rcsSmsAutopilotState.error = error?.payload?.error || error?.message || "RCS/SMS konverzace se teď nepodařilo načíst.";
  } finally {
    rcsSmsAutopilotState.loading = false;
    render();
  }
}

export async function loadRcsSmsAutopilotDetail(apiJson, render, id) {
  const conversationId = String(id || "").trim();
  if (!conversationId || rcsSmsAutopilotState.detailLoading) return;
  rcsSmsAutopilotState.selectedId = conversationId;
  rcsSmsAutopilotState.detailLoading = true;
  rcsSmsAutopilotState.error = "";
  rcsSmsAutopilotState.message = "";
  render();
  try {
    rcsSmsAutopilotState.detail = await apiJson(`/api/rcs-sms-autopilot/${encodeURIComponent(conversationId)}`);
  } catch (error) {
    rcsSmsAutopilotState.detail = null;
    rcsSmsAutopilotState.error = error?.payload?.error || error?.message || "Detail konverzace se teď nepodařilo načíst.";
  } finally {
    rcsSmsAutopilotState.detailLoading = false;
    render();
  }
}

export function ensureRcsSmsAutopilotData(apiJson, render) {
  if (!rcsSmsAutopilotState.loaded && !rcsSmsAutopilotState.loading) {
    void loadRcsSmsAutopilot(apiJson, render);
  }
}

async function runConversationAction(apiJson, render, action) {
  const id = rcsSmsAutopilotState.selectedId;
  if (!id || rcsSmsAutopilotState.actionPending) return;
  rcsSmsAutopilotState.actionPending = action;
  rcsSmsAutopilotState.error = "";
  rcsSmsAutopilotState.message = "";
  render();
  try {
    rcsSmsAutopilotState.detail = await apiJson(`/api/rcs-sms-autopilot/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ action })
    });
    rcsSmsAutopilotState.message = action === "take_over"
      ? "Konverzaci převzal člověk."
      : action === "release"
        ? "Konverzace je znovu otevřená."
        : "Konverzace je uzavřená.";
    await loadRcsSmsAutopilot(apiJson, render, { renderBefore: false });
  } catch (error) {
    rcsSmsAutopilotState.error = error?.payload?.error || error?.message || "Stav konverzace se nepodařilo změnit.";
  } finally {
    rcsSmsAutopilotState.actionPending = "";
    render();
  }
}

export function bindRcsSmsAutopilot(root, { apiJson, render }) {
  const container = root?.querySelector?.("[data-rcs-sms-autopilot]");
  if (!container || container.dataset.bound === "true") return;
  container.dataset.bound = "true";

  container.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-rcs-autopilot-filters]");
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    rcsSmsAutopilotState.filters = {
      contactType: String(data.get("contactType") || ""),
      status: String(data.get("status") || ""),
      search: String(data.get("search") || "").trim()
    };
    void loadRcsSmsAutopilot(apiJson, render);
  });

  container.addEventListener("click", (event) => {
    const open = event.target.closest("[data-rcs-autopilot-open]");
    if (open) {
      void loadRcsSmsAutopilotDetail(apiJson, render, open.dataset.rcsAutopilotOpen);
      return;
    }
    if (event.target.closest("[data-rcs-autopilot-reload]")) {
      void loadRcsSmsAutopilot(apiJson, render);
      return;
    }
    if (event.target.closest("[data-rcs-autopilot-reset]")) {
      rcsSmsAutopilotState.filters = { contactType: "", status: "", search: "" };
      void loadRcsSmsAutopilot(apiJson, render);
      return;
    }
    const action = event.target.closest("[data-rcs-autopilot-action]");
    if (action) {
      void runConversationAction(apiJson, render, action.dataset.rcsAutopilotAction);
    }
  });
}

export const __test = {
  contactTypeLabel,
  modeLabel,
  statusLabel,
  statusTone
};
