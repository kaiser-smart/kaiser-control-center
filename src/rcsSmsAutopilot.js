export const RCS_SMS_AUTOPILOT_MODULE_KEY = "rcs-sms-autopilot";
export const RCS_SMS_AUTOPILOT_ROUTE = "/rcs-sms-konverzace";

const EMPTY_REVIEW_DRAFT = () => ({
  conversationId: "",
  messageId: "",
  originalText: "",
  text: "",
  dirty: false,
  grant: null
});

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
  reviewDraft: EMPTY_REVIEW_DRAFT(),
  error: "",
  detailError: "",
  message: "",
  contactPanelOpen: false,
  moreMenuOpen: false,
  filters: {
    view: "all",
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

function dateValue(value) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = dateValue(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatListTime(value) {
  const date = dateValue(value);
  if (!date) return "";
  const now = new Date();
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(date)
    === new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(now);
  return new Intl.DateTimeFormat("cs-CZ", sameDay
    ? { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" }
    : { timeZone: "Europe/Prague", day: "numeric", month: "numeric" }
  ).format(date);
}

function contactTypeLabel(value) {
  return {
    employee: "Uživatel",
    customer: "Zákazník",
    unknown: "Neznámý kontakt",
    opted_out: "Odhlášený kontakt"
  }[value] || "Neznámý kontakt";
}

function statusLabel(value) {
  return {
    new: "Nová",
    waiting: "Čeká na odpověď",
    answered: "Odpovězeno",
    resolved: "Vyřešeno"
  }[value] || "Čeká na odpověď";
}

function conversationUiStatus(conversation = {}) {
  const status = String(conversation.status || "");
  if (status === "closed") return "resolved";
  if (status === "replied" || conversation.latestMessage?.direction === "outbound") return "answered";
  if (status === "open" && !conversation.humanTakeover) return "new";
  return "waiting";
}

function statusTone(value) {
  return {
    new: "new",
    waiting: "waiting",
    answered: "answered",
    resolved: "resolved"
  }[value] || "waiting";
}

function statusChip(value) {
  const uiStatus = ["new", "waiting", "answered", "resolved"].includes(value)
    ? value
    : conversationUiStatus({ status: value });
  return `<span class="rcs-inbox-status rcs-inbox-status--${esc(statusTone(uiStatus))}">${esc(statusLabel(uiStatus))}</span>`;
}

function modeLabel(mode) {
  return {
    off: "Vypnuto",
    review: "Návrhy s ručním odesláním",
    live: "Řízený provoz"
  }[mode] || "Neověřeno";
}

function isToday(value) {
  const date = dateValue(value);
  if (!date) return false;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" });
  return formatter.format(date) === formatter.format(new Date());
}

function inboxCounts() {
  return rcsSmsAutopilotState.items.reduce((counts, item) => {
    const status = conversationUiStatus(item);
    if (status === "new") counts.new += 1;
    if (status === "waiting") counts.waiting += 1;
    if (status === "resolved" && isToday(item.updatedAt || item.lastActivityAt)) counts.resolvedToday += 1;
    return counts;
  }, { new: 0, waiting: 0, resolvedToday: 0 });
}

function summaryHtml() {
  const counts = inboxCounts();
  return `
    <div class="rcs-inbox-summary${counts.new + counts.waiting + counts.resolvedToday === 0 ? " is-empty" : ""}" aria-label="Přehled zpráv">
      <div><strong>${counts.new}</strong><span>Nové zprávy</span></div>
      <div><strong>${counts.waiting}</strong><span>Čekají na odpověď</span></div>
      <div><strong>${counts.resolvedToday}</strong><span>Vyřešené dnes</span></div>
    </div>
  `;
}

function filterMatches(item) {
  const view = rcsSmsAutopilotState.filters.view;
  const status = conversationUiStatus(item);
  if (view === "new") return status === "new";
  if (view === "waiting") return status === "waiting";
  if (view === "resolved") return status === "resolved";
  return true;
}

function filtersHtml() {
  const filters = rcsSmsAutopilotState.filters;
  const options = [
    ["all", "Všechny"],
    ["new", "Nové"],
    ["waiting", "Čekají na odpověď"],
    ["resolved", "Vyřešené"]
  ];
  return `
    <form class="rcs-inbox-filters" data-rcs-autopilot-filters>
      <label class="rcs-inbox-search">
        <span class="sr-only">Vyhledat konverzaci</span>
        <input
          name="search"
          type="search"
          value="${esc(filters.search)}"
          placeholder="Hledat jméno, telefon nebo zprávu"
          autocomplete="off"
        />
      </label>
      <div class="rcs-inbox-filter-tabs" role="group" aria-label="Filtrovat konverzace">
        ${options.map(([value, label]) => `
          <button
            type="button"
            class="${filters.view === value ? "is-active" : ""}"
            data-rcs-filter-view="${value}"
            aria-pressed="${filters.view === value ? "true" : "false"}"
          >${esc(label)}</button>
        `).join("")}
      </div>
    </form>
  `;
}

function unreadDot(item) {
  const unread = item.unread === true || Number(item.unreadCount || 0) > 0;
  return unread ? '<span class="rcs-inbox-unread" aria-label="Nepřečtená zpráva"></span>' : "";
}

function conversationList() {
  if (rcsSmsAutopilotState.loading && !rcsSmsAutopilotState.loaded) {
    return '<p class="rcs-inbox-empty">Načítám zprávy…</p>';
  }
  if (rcsSmsAutopilotState.error) {
    return `
      <div class="rcs-inbox-error" role="alert">
        <p>${esc(rcsSmsAutopilotState.error)}</p>
        <button class="secondary-link" type="button" data-rcs-autopilot-reload>Zkusit znovu</button>
      </div>
    `;
  }
  const visibleItems = rcsSmsAutopilotState.items.filter(filterMatches);
  if (!visibleItems.length) {
    return '<p class="rcs-inbox-empty">Žádné nové zprávy.</p>';
  }
  return `
    <div class="rcs-inbox-conversations" role="list">
      ${visibleItems.map((item) => {
        const selected = item.id === rcsSmsAutopilotState.selectedId;
        const uiStatus = conversationUiStatus(item);
        return `
          <button
            class="rcs-inbox-conversation${selected ? " is-selected" : ""}"
            type="button"
            data-rcs-autopilot-open="${esc(item.id)}"
            role="listitem"
            aria-current="${selected ? "true" : "false"}"
          >
            ${unreadDot(item)}
            <span class="rcs-inbox-conversation__body">
              <span class="rcs-inbox-conversation__top">
                <strong>${esc(item.contactName || item.phone || "Neznámý kontakt")}</strong>
                <time>${esc(formatListTime(item.latestMessage?.createdAt || item.lastActivityAt))}</time>
              </span>
              <span class="rcs-inbox-conversation__preview">${esc(item.latestMessage?.body || "Bez textu zprávy")}</span>
              <span class="rcs-inbox-conversation__meta">
                <span class="rcs-inbox-channel">${esc(String(item.channel || "sms").toUpperCase())}</span>
                ${statusChip(uiStatus)}
              </span>
            </span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function messageAuthor(item, conversation) {
  if (item.direction !== "outbound") return conversation.contactName || "Kontakt";
  if (item.senderType === "human" || item.responseMode === "manual_review") return "Pracovník";
  return "Šarlota";
}

function savedProposalBubble(item) {
  if (
    item.direction !== "inbound"
    || item.status === "review_ready"
    || !String(item.replyText || "").trim()
  ) return "";
  return `
    <article class="rcs-inbox-message rcs-inbox-message--sarlota">
      <span class="rcs-inbox-message__author">Šarlota · návrh odpovědi</span>
      <p>${esc(item.replyText)}</p>
      <small>${item.status === "replied" ? "Návrh byl zpracovaný." : "Uložený návrh"}</small>
    </article>
  `;
}

function messageBubble(item, conversation) {
  const outbound = item.direction === "outbound";
  return `
    <article class="rcs-inbox-message rcs-inbox-message--${outbound ? "outbound" : "inbound"}">
      <span class="rcs-inbox-message__author">${esc(messageAuthor(item, conversation))}</span>
      <p>${esc(item.body || (item.media?.length ? "Příloha bez textu" : "Prázdná zpráva"))}</p>
      <time>${esc(formatDateTime(item.createdAt || item.receivedAt))}</time>
      ${item.errorMessage ? `<small class="rcs-inbox-message__error">${esc(item.errorMessage)}</small>` : ""}
    </article>
    ${savedProposalBubble(item)}
  `;
}

function latestReviewMessage(detail) {
  return [...(detail?.messages || [])].reverse().find((item) => (
    item.direction === "inbound"
    && item.status === "review_ready"
    && String(item.replyText || "").trim()
  )) || null;
}

function openRequest(detail) {
  return (detail?.requests || []).find((item) => item.status === "open") || null;
}

function contactPanel(detail, canManage) {
  if (!rcsSmsAutopilotState.contactPanelOpen || !detail?.conversation) return "";
  const conversation = detail.conversation;
  const request = openRequest(detail);
  const lastCommunication = detail.messages?.at(-1)?.createdAt || conversation.lastActivityAt;
  return `
    <aside class="rcs-inbox-contact-panel" aria-labelledby="rcs-contact-title">
      <div class="rcs-inbox-contact-panel__head">
        <h3 id="rcs-contact-title">Informace o kontaktu</h3>
        <button type="button" data-rcs-contact-close aria-label="Zavřít informace o kontaktu">×</button>
      </div>
      <dl>
        <div><dt>Jméno</dt><dd>${esc(conversation.contactName || "Neznámý kontakt")}</dd></div>
        <div><dt>Telefon</dt><dd>${esc(conversation.phone)}</dd></div>
        <div><dt>Typ kontaktu</dt><dd>${esc(contactTypeLabel(conversation.contactType))}</dd></div>
        ${conversation.contactType === "customer" && conversation.contactName
          ? `<div><dt>Firma</dt><dd>${esc(conversation.contactName)}</dd></div>`
          : ""}
        ${lastCommunication ? `<div><dt>Poslední komunikace</dt><dd>${esc(formatDateTime(lastCommunication))}</dd></div>` : ""}
        ${request ? `<div><dt>Otevřený požadavek</dt><dd>${esc(request.summary || "Požadavek čeká na vyřízení")}</dd></div>` : ""}
        ${conversation.internalNote ? `<div><dt>Interní poznámka</dt><dd>${esc(conversation.internalNote)}</dd></div>` : ""}
      </dl>
      ${conversation.contactType === "unknown" && canManage ? `
        <button class="secondary-link" type="button" data-rcs-autopilot-action="assign_contact">
          Přiřadit ke kontaktu
        </button>
      ` : ""}
      <button class="rcs-inbox-contact-backdrop" type="button" data-rcs-contact-close aria-label="Zavřít panel"></button>
    </aside>
  `;
}

function reviewSuggestion(detail, canApprove) {
  const candidate = latestReviewMessage(detail);
  if (!candidate) return "";
  const draft = rcsSmsAutopilotState.reviewDraft;
  const pending = Boolean(rcsSmsAutopilotState.actionPending);
  return `
    <section class="rcs-inbox-suggestion" aria-labelledby="rcs-suggestion-title">
      <div>
        <span>Šarlota navrhuje odpověď</span>
        <button type="button" data-rcs-suggestion-discard ${pending ? "disabled" : ""}>Zahodit</button>
      </div>
      <p id="rcs-suggestion-title">${esc(candidate.replyText)}</p>
      <div class="rcs-inbox-suggestion__actions">
        <button class="secondary-link" type="button" data-rcs-suggestion-use ${!canApprove || pending ? "disabled" : ""}>Upravit</button>
        <button class="primary-action" type="button" data-rcs-suggestion-send ${!canApprove || pending ? "disabled" : ""}>Odeslat</button>
      </div>
    </section>
  `;
}

function sendConfirmation() {
  const grant = rcsSmsAutopilotState.reviewDraft.grant;
  if (!grant) return "";
  const pending = Boolean(rcsSmsAutopilotState.actionPending);
  return `
    <div class="rcs-inbox-send-confirmation" role="group" aria-labelledby="rcs-send-confirm-title">
      <strong id="rcs-send-confirm-title">Odeslat tuto odpověď?</strong>
      <p>${esc(grant.preview)}</p>
      <span>${esc(String(grant.channel || "sms").toUpperCase())} · ${esc(grant.recipient)}</span>
      <div>
        <button class="secondary-link" type="button" data-rcs-review-cancel ${pending ? "disabled" : ""}>Zpět</button>
        <button class="primary-action" type="button" data-rcs-review-send ${pending ? "disabled" : ""}>
          ${rcsSmsAutopilotState.actionPending === "review_send" ? "Odesílám…" : "Odeslat"}
        </button>
      </div>
    </div>
  `;
}

function composer(detail, canApprove) {
  const candidate = latestReviewMessage(detail);
  const draft = rcsSmsAutopilotState.reviewDraft;
  const grant = draft.grant;
  const pending = Boolean(rcsSmsAutopilotState.actionPending);
  const enabled = Boolean(candidate && canApprove && !grant);
  const channel = candidate?.channel || detail.conversation.channel || "sms";
  return `
    <footer class="rcs-inbox-composer">
      ${reviewSuggestion(detail, canApprove)}
      ${sendConfirmation()}
      <form data-rcs-reply-form>
        <textarea
          name="replyText"
          data-rcs-review-draft
          maxlength="1200"
          placeholder="Napište odpověď…"
          aria-label="Napište odpověď"
          ${enabled ? "" : "disabled"}
        >${esc(draft.text)}</textarea>
        <div class="rcs-inbox-composer__bottom">
          <div>
            <button type="button" class="rcs-inbox-prepared-reply" data-rcs-suggestion-use ${enabled ? "" : "disabled"}>
              Vložit připravenou odpověď
            </button>
            <span>Odešle se jako <strong>${esc(String(channel).toUpperCase())}</strong></span>
          </div>
          <button class="primary-action" type="submit" ${!enabled || !draft.text.trim() || pending ? "disabled" : ""}>
            ${rcsSmsAutopilotState.actionPending === "review_prepare" ? "Připravuji…" : "Odeslat"}
          </button>
        </div>
      </form>
    </footer>
  `;
}

function technicalDetails(detail) {
  const events = detail.events || [];
  if (!events.length) return "";
  return `
    <details class="rcs-inbox-technical">
      <summary>Technické podrobnosti</summary>
      <div>
        ${events.map((item) => `
          <p><strong>${esc(item.eventType)}</strong><span>${esc(item.detail || item.status)} · ${esc(formatDateTime(item.createdAt))}</span></p>
        `).join("")}
      </div>
    </details>
  `;
}

function detailPanel(canManage, canApprove, canViewTechnical) {
  if (rcsSmsAutopilotState.detailLoading) {
    return '<section class="rcs-inbox-detail is-open"><p class="rcs-inbox-empty">Načítám konverzaci…</p></section>';
  }
  const detail = rcsSmsAutopilotState.detail;
  if (!detail?.conversation) {
    return `
      <section class="rcs-inbox-detail rcs-inbox-detail--empty">
        ${rcsSmsAutopilotState.detailError
          ? `<p class="rcs-inbox-error" role="alert">${esc(rcsSmsAutopilotState.detailError)}</p>`
          : "<p>Vyberte konverzaci vlevo.</p>"}
      </section>
    `;
  }
  const conversation = detail.conversation;
  const pending = Boolean(rcsSmsAutopilotState.actionPending);
  const resolved = conversation.status === "closed";
  return `
    <section class="rcs-inbox-detail is-open" aria-labelledby="rcs-inbox-contact-name">
      <header class="rcs-inbox-detail__header">
        <button class="rcs-inbox-mobile-back" type="button" data-rcs-mobile-back aria-label="Zpět na konverzace">←</button>
        <div>
          <h2 id="rcs-inbox-contact-name">${esc(conversation.contactName || "Neznámý kontakt")}</h2>
          <p>${esc(conversation.phone)} <span class="rcs-inbox-channel">${esc(String(conversation.channel || "sms").toUpperCase())}</span></p>
        </div>
        <div class="rcs-inbox-detail__controls">
          ${statusChip(conversationUiStatus(conversation))}
          <button type="button" data-rcs-contact-open>Informace o kontaktu</button>
          <button class="rcs-inbox-more" type="button" data-rcs-more-menu aria-label="Další možnosti" aria-expanded="${rcsSmsAutopilotState.moreMenuOpen ? "true" : "false"}">•••</button>
          ${rcsSmsAutopilotState.moreMenuOpen ? `
            <div class="rcs-inbox-more-menu">
              ${canManage ? `
                <button type="button" data-rcs-autopilot-action="${resolved ? "release" : "close"}" ${pending ? "disabled" : ""}>
                  ${resolved ? "Znovu otevřít" : "Označit jako vyřešené"}
                </button>
              ` : ""}
            </div>
          ` : ""}
        </div>
      </header>
      ${rcsSmsAutopilotState.message ? `<p class="rcs-inbox-notice" role="status">${esc(rcsSmsAutopilotState.message)}</p>` : ""}
      ${rcsSmsAutopilotState.detailError ? `<p class="rcs-inbox-error" role="alert">${esc(rcsSmsAutopilotState.detailError)}</p>` : ""}
      ${canManage ? `
        <div class="rcs-inbox-primary-actions">
          ${resolved
            ? `<button class="primary-action" type="button" data-rcs-autopilot-action="release" ${pending ? "disabled" : ""}>Znovu otevřít</button>`
            : conversation.humanTakeover
              ? `<button class="primary-action" type="button" data-rcs-suggestion-use ${pending ? "disabled" : ""}>Odpovědět</button>`
              : `<button class="primary-action" type="button" data-rcs-autopilot-action="take_over" ${pending ? "disabled" : ""}>Převzít</button>`}
          ${!resolved ? `<button class="secondary-link" type="button" data-rcs-autopilot-action="close" ${pending ? "disabled" : ""}>Označit jako vyřešené</button>` : ""}
        </div>
      ` : ""}
      <div class="rcs-inbox-thread" data-rcs-thread>
        ${detail.messages.map((item) => messageBubble(item, conversation)).join("") || '<p class="rcs-inbox-empty">Žádné zprávy.</p>'}
        ${canViewTechnical ? technicalDetails(detail) : ""}
      </div>
      ${composer(detail, canApprove)}
      ${contactPanel(detail, canManage)}
    </section>
  `;
}

export function rcsSmsAutopilotEventLogHtml() {
  const status = rcsSmsAutopilotState.status || {};
  return `
    <section aria-label="RCS/SMS log událostí">
      <h2>RCS/SMS</h2>
      <p>Stav: ${esc(modeLabel(status.mode))}</p>
    </section>
  `;
}

export function rcsSmsAutopilotContent({
  canManage = false,
  canApprove = false,
  canViewTechnical = false
} = {}) {
  return `
    <div class="rcs-inbox" data-rcs-sms-autopilot>
      ${summaryHtml()}
      <div class="rcs-inbox-workspace${rcsSmsAutopilotState.selectedId ? " has-selection" : ""}">
        <aside class="rcs-inbox-sidebar" aria-label="Konverzace">
          ${filtersHtml()}
          ${conversationList()}
        </aside>
        ${detailPanel(canManage, canApprove, canViewTechnical)}
      </div>
    </div>
  `;
}

function queryString() {
  const params = new URLSearchParams({ pageSize: "50" });
  if (rcsSmsAutopilotState.filters.search.trim()) {
    params.set("search", rcsSmsAutopilotState.filters.search.trim());
  }
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
      rcsSmsAutopilotState.selectedId
      && !rcsSmsAutopilotState.items.some((item) => item.id === rcsSmsAutopilotState.selectedId)
    ) {
      rcsSmsAutopilotState.selectedId = "";
      rcsSmsAutopilotState.detail = null;
    }
  } catch (error) {
    rcsSmsAutopilotState.items = [];
    rcsSmsAutopilotState.total = 0;
    rcsSmsAutopilotState.status = null;
    rcsSmsAutopilotState.loaded = true;
    rcsSmsAutopilotState.error = error?.payload?.error || error?.message || "Zprávy se teď nepodařilo načíst.";
  } finally {
    rcsSmsAutopilotState.loading = false;
    render();
    const firstConversationId = String(rcsSmsAutopilotState.items[0]?.id || "");
    const shouldOpenFirst = options.openFirst !== false
      && !rcsSmsAutopilotState.selectedId
      && firstConversationId
      && typeof window !== "undefined"
      && window.matchMedia?.("(min-width: 901px)")?.matches;
    if (shouldOpenFirst) {
      void loadRcsSmsAutopilotDetail(apiJson, render, firstConversationId);
    }
  }
}

export async function loadRcsSmsAutopilotDetail(apiJson, render, id) {
  const conversationId = String(id || "").trim();
  if (!conversationId || rcsSmsAutopilotState.detailLoading) return;
  rcsSmsAutopilotState.selectedId = conversationId;
  rcsSmsAutopilotState.detailLoading = true;
  rcsSmsAutopilotState.contactPanelOpen = false;
  rcsSmsAutopilotState.moreMenuOpen = false;
  rcsSmsAutopilotState.detailError = "";
  rcsSmsAutopilotState.message = "";
  render();
  try {
    const detail = await apiJson(`/api/rcs-sms-autopilot/${encodeURIComponent(conversationId)}`);
    rcsSmsAutopilotState.detail = detail;
    const candidate = latestReviewMessage(detail);
    rcsSmsAutopilotState.reviewDraft = {
      conversationId,
      messageId: String(candidate?.id || ""),
      originalText: String(candidate?.replyText || ""),
      text: String(candidate?.replyText || ""),
      dirty: false,
      grant: null
    };
  } catch (error) {
    rcsSmsAutopilotState.detail = null;
    rcsSmsAutopilotState.detailError = error?.payload?.error || error?.message || "Konverzaci se teď nepodařilo načíst.";
  } finally {
    rcsSmsAutopilotState.detailLoading = false;
    render();
    requestAnimationFrame(() => {
      const thread = document.querySelector("[data-rcs-thread]");
      if (thread) thread.scrollTop = thread.scrollHeight;
    });
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
  rcsSmsAutopilotState.detailError = "";
  rcsSmsAutopilotState.message = "";
  render();
  try {
    rcsSmsAutopilotState.detail = await apiJson(`/api/rcs-sms-autopilot/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ action })
    });
    rcsSmsAutopilotState.message = {
      take_over: "Konverzaci jste převzali.",
      release: "Konverzace je znovu otevřená.",
      close: "Konverzace je vyřešená.",
      assign_contact: rcsSmsAutopilotState.detail?.conversation?.contactType === "unknown"
        ? "Kontakt se v adresáři nepodařilo jednoznačně najít."
        : "Kontakt byl přiřazený.",
      discard_draft: "Návrh byl zahozený."
    }[action] || "";
    if (action === "discard_draft") {
      rcsSmsAutopilotState.reviewDraft = EMPTY_REVIEW_DRAFT();
    }
    await loadRcsSmsAutopilot(apiJson, render, { renderBefore: false });
  } catch (error) {
    rcsSmsAutopilotState.detailError = error?.payload?.error || error?.message || "Změnu se nepodařilo uložit.";
  } finally {
    rcsSmsAutopilotState.actionPending = "";
    rcsSmsAutopilotState.moreMenuOpen = false;
    render();
  }
}

async function prepareReviewSend(apiJson, render) {
  const id = rcsSmsAutopilotState.selectedId;
  const draft = rcsSmsAutopilotState.reviewDraft;
  if (!id || !draft.text.trim() || rcsSmsAutopilotState.actionPending) return;
  rcsSmsAutopilotState.actionPending = "review_prepare";
  rcsSmsAutopilotState.detailError = "";
  rcsSmsAutopilotState.message = "";
  render();
  try {
    draft.grant = await apiJson(`/api/rcs-sms-autopilot/${encodeURIComponent(id)}/review-grants`, {
      method: "POST",
      body: JSON.stringify({ replyText: draft.text })
    });
    draft.dirty = false;
  } catch (error) {
    rcsSmsAutopilotState.detailError = error?.payload?.error || error?.message || "Odpověď se nepodařilo připravit.";
  } finally {
    rcsSmsAutopilotState.actionPending = "";
    render();
  }
}

async function cancelReviewSend(apiJson, render) {
  const id = rcsSmsAutopilotState.selectedId;
  const draft = rcsSmsAutopilotState.reviewDraft;
  const grantId = draft.grant?.grantId;
  if (!id || !grantId || rcsSmsAutopilotState.actionPending) return;
  rcsSmsAutopilotState.actionPending = "review_cancel";
  rcsSmsAutopilotState.detailError = "";
  render();
  try {
    await apiJson(
      `/api/rcs-sms-autopilot/${encodeURIComponent(id)}/review-grants?grantId=${encodeURIComponent(grantId)}`,
      { method: "DELETE" }
    );
    draft.grant = null;
    draft.dirty = draft.text !== draft.originalText;
    rcsSmsAutopilotState.message = "Odeslání bylo zrušené.";
  } catch (error) {
    rcsSmsAutopilotState.detailError = error?.payload?.error || error?.message || "Odeslání se nepodařilo zrušit.";
  } finally {
    rcsSmsAutopilotState.actionPending = "";
    render();
  }
}

async function confirmReviewSend(apiJson, render) {
  const id = rcsSmsAutopilotState.selectedId;
  const draft = rcsSmsAutopilotState.reviewDraft;
  const grantId = draft.grant?.grantId;
  if (!id || !grantId || rcsSmsAutopilotState.actionPending) return;
  rcsSmsAutopilotState.actionPending = "review_send";
  rcsSmsAutopilotState.detailError = "";
  rcsSmsAutopilotState.message = "";
  render();
  try {
    const result = await apiJson(`/api/rcs-sms-autopilot/${encodeURIComponent(id)}/review-send`, {
      method: "POST",
      body: JSON.stringify({ grantId, confirm: "send-one-reviewed-reply" })
    });
    draft.grant = null;
    draft.dirty = false;
    await loadRcsSmsAutopilot(apiJson, render, { renderBefore: false });
    await loadRcsSmsAutopilotDetail(apiJson, render, id);
    rcsSmsAutopilotState.detailError = result.sent
      ? ""
      : result.errorMessage || "Zprávu se nepodařilo odeslat.";
    rcsSmsAutopilotState.message = result.sent ? "Odpověď byla odeslaná." : "";
  } catch (error) {
    rcsSmsAutopilotState.detailError = error?.payload?.error || error?.message || "Odpověď se nepodařilo odeslat.";
  } finally {
    rcsSmsAutopilotState.actionPending = "";
    render();
  }
}

function useSuggestion(render) {
  const candidate = latestReviewMessage(rcsSmsAutopilotState.detail);
  if (!candidate) return;
  const draft = rcsSmsAutopilotState.reviewDraft;
  draft.text = String(candidate.replyText || "");
  draft.dirty = draft.text !== draft.originalText;
  render();
  requestAnimationFrame(() => document.querySelector("[data-rcs-review-draft]")?.focus());
}

let reviewBeforeUnloadBound = false;

export function bindRcsSmsAutopilot(root, { apiJson, render }) {
  const container = root?.querySelector?.("[data-rcs-sms-autopilot]");
  if (!container || container.dataset.bound === "true") return;
  container.dataset.bound = "true";
  if (!reviewBeforeUnloadBound) {
    window.addEventListener("beforeunload", (event) => {
      if (!rcsSmsAutopilotState.reviewDraft.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
    reviewBeforeUnloadBound = true;
  }

  container.addEventListener("submit", (event) => {
    const filterForm = event.target.closest("[data-rcs-autopilot-filters]");
    if (filterForm) {
      event.preventDefault();
      const data = new FormData(filterForm);
      rcsSmsAutopilotState.filters.search = String(data.get("search") || "").trim();
      void loadRcsSmsAutopilot(apiJson, render);
      return;
    }
    if (event.target.closest("[data-rcs-reply-form]")) {
      event.preventDefault();
      void prepareReviewSend(apiJson, render);
    }
  });

  container.addEventListener("click", (event) => {
    const open = event.target.closest("[data-rcs-autopilot-open]");
    if (open) {
      const nextId = String(open.dataset.rcsAutopilotOpen || "");
      if (
        nextId !== rcsSmsAutopilotState.selectedId
        && rcsSmsAutopilotState.reviewDraft.dirty
        && !window.confirm("Zahodit rozepsanou odpověď?")
      ) return;
      void loadRcsSmsAutopilotDetail(apiJson, render, nextId);
      return;
    }
    const filter = event.target.closest("[data-rcs-filter-view]");
    if (filter) {
      rcsSmsAutopilotState.filters.view = filter.dataset.rcsFilterView || "all";
      render();
      return;
    }
    if (event.target.closest("[data-rcs-autopilot-reload]")) {
      void loadRcsSmsAutopilot(apiJson, render);
      return;
    }
    if (event.target.closest("[data-rcs-mobile-back]")) {
      if (
        rcsSmsAutopilotState.reviewDraft.dirty
        && !window.confirm("Zahodit rozepsanou odpověď?")
      ) return;
      rcsSmsAutopilotState.selectedId = "";
      rcsSmsAutopilotState.detail = null;
      rcsSmsAutopilotState.reviewDraft = EMPTY_REVIEW_DRAFT();
      render();
      return;
    }
    if (event.target.closest("[data-rcs-contact-open]")) {
      rcsSmsAutopilotState.contactPanelOpen = true;
      render();
      return;
    }
    if (event.target.closest("[data-rcs-contact-close]")) {
      rcsSmsAutopilotState.contactPanelOpen = false;
      render();
      return;
    }
    if (event.target.closest("[data-rcs-more-menu]")) {
      rcsSmsAutopilotState.moreMenuOpen = !rcsSmsAutopilotState.moreMenuOpen;
      render();
      return;
    }
    const action = event.target.closest("[data-rcs-autopilot-action]");
    if (action) {
      void runConversationAction(apiJson, render, action.dataset.rcsAutopilotAction);
      return;
    }
    if (event.target.closest("[data-rcs-suggestion-use]")) {
      useSuggestion(render);
      return;
    }
    if (event.target.closest("[data-rcs-suggestion-discard]")) {
      void runConversationAction(apiJson, render, "discard_draft");
      return;
    }
    if (event.target.closest("[data-rcs-suggestion-send]")) {
      useSuggestion(render);
      void prepareReviewSend(apiJson, render);
      return;
    }
    if (event.target.closest("[data-rcs-review-cancel]")) {
      void cancelReviewSend(apiJson, render);
      return;
    }
    if (event.target.closest("[data-rcs-review-send]")) {
      void confirmReviewSend(apiJson, render);
    }
  });

  container.addEventListener("input", (event) => {
    const search = event.target.closest(".rcs-inbox-search input");
    if (search) {
      rcsSmsAutopilotState.filters.search = String(search.value || "");
      window.clearTimeout(container.searchTimer);
      container.searchTimer = window.setTimeout(() => {
        void loadRcsSmsAutopilot(apiJson, render);
      }, 300);
      return;
    }
    const textarea = event.target.closest("[data-rcs-review-draft]");
    if (!textarea) return;
    const draft = rcsSmsAutopilotState.reviewDraft;
    draft.text = String(textarea.value || "");
    draft.dirty = draft.text !== draft.originalText;
  });
}

export const __test = {
  contactTypeLabel,
  conversationUiStatus,
  latestReviewMessage,
  modeLabel,
  statusLabel,
  statusTone
};
