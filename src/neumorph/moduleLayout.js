import {
  moduleDisplayLabel,
  moduleGroupLabel,
  moduleIconName,
  moduleMigrationLabel,
  moduleStatusTone
} from "./moduleRegistry.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderInlineIcon(name) {
  const paths = {
    search: '<path d="m21 21-4.3-4.3"></path><circle cx="11" cy="11" r="7"></circle>',
    filter: '<path d="M4 5h16"></path><path d="M7 12h10"></path><path d="M10 19h4"></path>',
    calendar: '<path d="M7 3v4M17 3v4"></path><path d="M4 8h16v12H4z"></path><path d="M8 12h3M13 12h3M8 16h3"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    download: '<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path>',
    more: '<circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle>',
    close: '<path d="M6 6l12 12M18 6 6 18"></path>',
    check: '<path d="M5 12.5 9 16l10-10"></path>',
    warning: '<path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="m10.3 3.8-8.5 14.7A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.5L13.7 3.8a2 2 0 0 0-3.4 0Z"></path>',
    empty: '<path d="M5 7h14v10H5z"></path><path d="M8 10h8M8 14h5"></path>',
    loading: '<path d="M12 3a9 9 0 1 0 9 9"></path>'
  };

  return `<svg viewBox="0 0 24 24" class="nm-icon" aria-hidden="true" focusable="false">${paths[name] || paths.more}</svg>`;
}

export function renderModuleAsset(moduleItem) {
  if (typeof moduleItem?.icon !== "function") {
    return renderInlineIcon(moduleIconName(moduleItem?.id));
  }

  return moduleItem.icon();
}

function renderAction(action, index) {
  const classes = [
    "nm-button",
    action.variant ? `nm-button--${action.variant}` : index === 0 ? "nm-button--primary" : "nm-button--secondary",
    action.iconOnly ? "nm-icon-button" : ""
  ].filter(Boolean).join(" ");
  const icon = action.icon ? `<span class="nm-button__icon">${renderInlineIcon(action.icon)}</span>` : "";
  const label = action.iconOnly ? `<span class="nm-sr-only">${escapeHtml(action.label)}</span>` : escapeHtml(action.label);
  const disabled = action.disabled ? 'aria-disabled="true"' : "";

  if (action.href && !action.disabled) {
    return `<a class="${classes}" href="${escapeHtml(action.href)}" data-link ${disabled}>${icon}${label}</a>`;
  }

  return `<button class="${classes}" type="button" ${action.disabled ? "disabled" : ""}>${icon}${label}</button>`;
}

export function renderNeumorphModuleHeader({
  moduleItem,
  eyebrow,
  title,
  description,
  status,
  statusTone,
  actions = [],
  meta = []
} = {}) {
  const resolvedTitle = title || moduleDisplayLabel(moduleItem);
  const resolvedEyebrow = eyebrow || moduleGroupLabel(moduleItem);
  const resolvedDescription = description || moduleItem?.description || "";
  const resolvedStatus = status || moduleMigrationLabel(moduleItem);
  const resolvedTone = statusTone || moduleStatusTone(moduleItem);

  return `
    <header class="nm-module-header">
      <div class="nm-module-header__identity">
        <span class="nm-icon-holder nm-icon-holder--active nm-module-header__icon" aria-hidden="true">
          ${renderModuleAsset(moduleItem)}
        </span>
        <div class="nm-module-header__copy">
          <p class="nm-system-eyebrow">${escapeHtml(resolvedEyebrow)}</p>
          <h1>${escapeHtml(resolvedTitle)}</h1>
          ${resolvedDescription ? `<p>${escapeHtml(resolvedDescription)}</p>` : ""}
          <div class="nm-cluster nm-module-header__meta">
            <span class="nm-chip nm-chip--${resolvedTone}">${escapeHtml(resolvedStatus)}</span>
            ${meta.map((item) => `<span class="nm-chip">${escapeHtml(item)}</span>`).join("")}
          </div>
        </div>
      </div>
      ${actions.length ? `<div class="nm-module-header__actions">${actions.map(renderAction).join("")}</div>` : ""}
    </header>
  `;
}

export function renderNeumorphToolbar({
  label = "Nastroje pohledu",
  searchPlaceholder = "Hledat",
  segments = [],
  filters = [],
  actions = [],
  countLabel = ""
} = {}) {
  return `
    <section class="nm-toolbar" aria-label="${escapeHtml(label)}">
      <label class="nm-search-field">
        <span class="nm-sr-only">${escapeHtml(searchPlaceholder)}</span>
        ${renderInlineIcon("search")}
        <input class="nm-input" type="search" placeholder="${escapeHtml(searchPlaceholder)}">
      </label>
      ${segments.length ? `
        <div class="nm-segmented-control" role="group" aria-label="Prepinac pohledu">
          ${segments.map((segment, index) => `
            <button class="nm-segment ${index === 0 ? "nm-segment--active" : ""}" type="button" aria-pressed="${index === 0 ? "true" : "false"}">
              ${escapeHtml(segment)}
            </button>
          `).join("")}
        </div>
      ` : ""}
      <div class="nm-toolbar__filters">
        ${filters.map((filter) => `
          <label class="nm-field nm-field--compact">
            <span>${escapeHtml(filter.label)}</span>
            <select class="nm-select">
              ${filter.options.map((option) => `<option>${escapeHtml(option)}</option>`).join("")}
            </select>
          </label>
        `).join("")}
      </div>
      <div class="nm-toolbar__actions">
        ${countLabel ? `<span class="nm-chip nm-chip--info">${escapeHtml(countLabel)}</span>` : ""}
        ${actions.map(renderAction).join("")}
      </div>
    </section>
  `;
}

export function renderNeumorphStatusStrip(items = []) {
  return `
    <section class="nm-status-strip" aria-label="Stav migrace">
      ${items.map((item) => `
        <article class="nm-status-strip__item">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          ${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}
        </article>
      `).join("")}
    </section>
  `;
}

export function renderNeumorphState({
  type = "empty",
  title,
  description,
  action
} = {}) {
  const tone = {
    loading: "info",
    empty: "neutral",
    error: "danger",
    warning: "warning",
    offline: "warning"
  }[type] || "neutral";

  return `
    <article class="nm-state-card nm-state-card--${tone}">
      <span class="nm-icon-holder ${tone === "neutral" ? "" : `nm-icon-holder--${tone}`}" aria-hidden="true">
        ${renderInlineIcon(type === "loading" ? "loading" : type === "error" || type === "warning" || type === "offline" ? "warning" : "empty")}
      </span>
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
      ${action ? `<div>${renderAction(action, 1)}</div>` : ""}
    </article>
  `;
}
