import { FEEDBACK_PRIORITIES } from "../data/moduleFeedback.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) {
    return "neuvedeno";
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function priorityOptions(selected = "Běžná") {
  return FEEDBACK_PRIORITIES
    .map((priority) => `
      <option value="${escapeHtml(priority)}" ${priority === selected ? "selected" : ""}>${priority}</option>
    `)
    .join("");
}

function feedbackList(items) {
  if (!items.length) {
    return "";
  }

  return `
    <div class="module-feedback__history" aria-label="Moje připomínky k modulu">
      <h3>Moje poslední připomínky</h3>
      <ul>
        ${items.slice(0, 3).map((item) => `
          <li>
            <span>${escapeHtml(item.message)}</span>
            <small>${escapeHtml(item.status)} · ${escapeHtml(item.priority)} · ${formatDate(item.createdAt)}</small>
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

export function ModuleFeedbackBox({
  moduleId,
  moduleName,
  currentUser,
  feedbackItems = [],
  notice = "",
  error = "",
  placeholder = "Např. chybí mi filtr podle SPZ, tlačítko je moc schované, potřebuji export…"
}) {
  return `
    <section class="module-feedback" aria-labelledby="module-feedback-title-${escapeHtml(moduleId)}">
      <div class="module-feedback__head">
        <div>
          <p class="module-feedback__eyebrow">${escapeHtml(moduleName)}</p>
          <h2 id="module-feedback-title-${escapeHtml(moduleId)}">Připomínky k modulu</h2>
          <p>Máte nápad, co v tomto modulu změnit nebo vylepšit? Napište nám připomínku.</p>
        </div>
      </div>

      <form class="module-feedback__form" data-feedback-form data-module-id="${escapeHtml(moduleId)}" data-module-name="${escapeHtml(moduleName)}">
        <label class="module-feedback__field module-feedback__field--message">
          <span>Připomínka</span>
          <textarea
            name="message"
            rows="4"
            placeholder="${escapeHtml(placeholder)}"
            required
          ></textarea>
        </label>
        <label class="module-feedback__field">
          <span>Priorita</span>
          <select name="priority">
            ${priorityOptions()}
          </select>
        </label>
        <button class="primary-action module-feedback__submit" type="submit">Odeslat připomínku</button>
      </form>

      ${notice ? `<p class="module-feedback__notice">${escapeHtml(notice)}</p>` : ""}
      ${error ? `<p class="module-feedback__error">${escapeHtml(error)}</p>` : ""}
      ${feedbackList(feedbackItems)}

      <p class="module-feedback__meta">
        Připomínka se uloží s modulem, autorem ${escapeHtml(currentUser?.name || currentUser?.email || "uživatelem")} a datem odeslání.
      </p>
    </section>
  `;
}
