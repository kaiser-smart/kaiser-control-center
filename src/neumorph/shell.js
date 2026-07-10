import { NEUMORPH_NAV_GROUPS } from "./navigation.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function icon(name) {
  const paths = {
    dashboard: '<path d="M4 13h6V4H4z"></path><path d="M14 20h6V4h-6z"></path><path d="M4 20h6v-3H4z"></path>',
    components: '<path d="M4 8h16"></path><path d="M4 16h16"></path><path d="M8 4v16"></path><path d="M16 4v16"></path>',
    route: '<path d="M6 18c4-6 8 6 12 0"></path><path d="M7 6a3 3 0 0 0-3 3c0 2.5 3 5 3 5s3-2.5 3-5a3 3 0 0 0-3-3Z"></path><path d="M17 4a3 3 0 0 0-3 3c0 2.5 3 5 3 5s3-2.5 3-5a3 3 0 0 0-3-3Z"></path>',
    chart: '<path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M8 15v-4"></path><path d="M12 15V8"></path><path d="M16 15v-6"></path>',
    menu: '<path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path>',
    sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>',
    moon: '<path d="M20.1 14.2A7.8 7.8 0 0 1 9.8 3.9a8.4 8.4 0 1 0 10.3 10.3Z"></path>'
  };

  return `<svg viewBox="0 0 24 24" class="nm-icon" aria-hidden="true" focusable="false">${paths[name] || paths.dashboard}</svg>`;
}

function renderThemeToggle(theme) {
  const isDark = theme === "dark";

  return `
    <button
      class="nm-theme-toggle"
      type="button"
      role="switch"
      aria-checked="${isDark ? "true" : "false"}"
      aria-label="Prepnout na ${isDark ? "denni" : "nocni"} motiv"
      data-nm-action="toggle-theme"
    >
      <span class="nm-theme-toggle__icon nm-theme-toggle__icon--sun">${icon("sun")}</span>
      <span class="nm-theme-toggle__thumb" aria-hidden="true"></span>
      <span class="nm-theme-toggle__icon nm-theme-toggle__icon--moon">${icon("moon")}</span>
      <span class="nm-theme-toggle__label" data-nm-theme-label>${isDark ? "Noc" : "Den"}</span>
    </button>
  `;
}

function renderNavItem(item, routeHref) {
  const itemClass = [
    "nm-sidebar__item",
    item.active ? "nm-sidebar__item--active" : "",
    item.planned ? "nm-sidebar__item--planned" : ""
  ].filter(Boolean).join(" ");
  const content = `
    <span class="nm-sidebar__icon" aria-hidden="true">${icon(item.icon)}</span>
    <span class="nm-sidebar__text">${escapeHtml(item.label)}</span>
    ${item.planned ? '<span class="nm-sidebar__badge">plan</span>' : ""}
  `;

  if (item.planned || !item.href) {
    return `<span class="${itemClass}" aria-disabled="true" title="${escapeHtml(item.label)}">${content}</span>`;
  }

  return `
    <a
      class="${itemClass}"
      href="${routeHref(item.href)}"
      data-link
      ${item.active ? 'aria-current="page"' : ""}
      title="${escapeHtml(item.label)}"
    >${content}</a>
  `;
}

function renderSidebar(routeHref) {
  return `
    <aside class="nm-sidebar" aria-label="Navigace neumorph migrace">
      <div class="nm-sidebar__top">
        <button
          class="nm-sidebar__toggle"
          type="button"
          aria-label="Sbalit navigaci"
          aria-expanded="true"
          data-nm-action="toggle-sidebar"
        >
          ${icon("menu")}
        </button>
      </div>
      <nav class="nm-sidebar__nav">
        ${NEUMORPH_NAV_GROUPS.map((group) => `
          <section class="nm-sidebar__group" aria-label="${escapeHtml(group.label)}">
            <span class="nm-sidebar__group-label">${escapeHtml(group.label)}</span>
            ${group.items.map((item) => renderNavItem(item, routeHref)).join("")}
          </section>
        `).join("")}
      </nav>
    </aside>
  `;
}

function renderMobileNav(routeHref) {
  const items = NEUMORPH_NAV_GROUPS.flatMap((group) => group.items).slice(0, 4);

  return `
    <nav class="nm-mobile-nav" aria-label="Mobilni navigace neumorph migrace">
      ${items.map((item) => {
        const itemClass = [
          "nm-mobile-nav__item",
          item.active ? "nm-mobile-nav__item--active" : "",
          item.planned ? "nm-mobile-nav__item--planned" : ""
        ].filter(Boolean).join(" ");
        const content = `${icon(item.icon)}<span>${escapeHtml(item.label)}</span>`;

        if (item.planned || !item.href) {
          return `<span class="${itemClass}" aria-disabled="true">${content}</span>`;
        }

        return `<a class="${itemClass}" href="${routeHref(item.href)}" data-link ${item.active ? 'aria-current="page"' : ""}>${content}</a>`;
      }).join("")}
    </nav>
  `;
}

function renderHeader({ routeHref, theme, user }) {
  const userLabel = user?.name || "Interni nahled";

  return `
    <header class="nm-shell__header">
      <div class="nm-shell__brand">
        <a class="nm-shell__logo" href="${routeHref("/")}" data-link aria-label="Zpet do Kaiser Smart">
          <img src="/kaiser_logo.png" alt="Kaiser">
        </a>
        <div class="nm-shell__title">
          <span>Kaiser Smart</span>
          <strong>Neumorph migrace</strong>
        </div>
      </div>
      <div class="nm-shell__tools">
        <span class="nm-shell__status">Migracni nahled</span>
        ${renderThemeToggle(theme)}
        <span class="nm-shell__user">${escapeHtml(userLabel)}</span>
      </div>
    </header>
  `;
}

export function renderNeumorphShell({ routeHref, theme, user, content }) {
  return `
    <div class="nm-app" data-theme="${escapeHtml(theme)}">
      <div class="nm-shell" data-nm-shell>
        ${renderHeader({ routeHref, theme, user })}
        <div class="nm-shell__body">
          ${renderSidebar(routeHref)}
          <main class="nm-shell__content" id="nm-main" tabindex="-1">
            ${content}
          </main>
        </div>
        ${renderMobileNav(routeHref)}
      </div>
    </div>
  `;
}
