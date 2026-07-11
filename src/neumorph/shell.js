import { roleLabel } from "../permissions.js";
import {
  buildNeumorphMobileNavigation,
  buildNeumorphNavigation
} from "./navigation.js";
import { renderOfficialIconAsset } from "./officialIcons.js";

const NEUMORPH_SIDEBAR_STORAGE_KEY = "smart_odpady_neumorph_sidebar";

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
    module: '<path d="M5 7h14"></path><path d="M5 12h14"></path><path d="M5 17h14"></path>',
    "quick-entry": '<path d="M5 13h6V5H5z"></path><path d="M13 19h6V5h-6z"></path><path d="M5 19h6v-4H5z"></path><path d="M8 8v2M16 8v2"></path>',
    fleet: '<path d="M4 16V8a2 2 0 0 1 2-2h9l4 4v6"></path><path d="M7 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"></path><path d="M17 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"></path><path d="M15 6v4h4"></path>',
    tracking: '<path d="M12 3v4"></path><path d="M7 8a7 7 0 0 0 10 0"></path><path d="M5 11a10 10 0 0 0 14 0"></path><path d="M4 20h16"></path><path d="M8 20l1-6h6l1 6"></path>',
    mail: '<path d="M4 6h16v12H4z"></path><path d="m4 7 8 6 8-6"></path>',
    driver: '<path d="M8 9a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z"></path><path d="M4 21a8 8 0 0 1 16 0"></path>',
    service: '<path d="m14.7 6.3 3 3"></path><path d="M3 21l6.8-6.8"></path><path d="M14 7a4 4 0 0 0-5.6 5.6L3 18v3h3l5.4-5.4A4 4 0 0 0 14 7Z"></path>',
    tyre: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle><path d="M12 4v3M12 17v3M4 12h3M17 12h3"></path>',
    sampling: '<path d="M10 2v6l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V2"></path><path d="M8 2h8"></path><path d="M7 15h10"></path>',
    customers: '<path d="M4 20V8l8-4 8 4v12"></path><path d="M9 20v-6h6v6"></path><path d="M8 10h.01M16 10h.01"></path>',
    costs: '<path d="M12 3v18"></path><path d="M17 7.5c0-1.7-2.1-3-5-3s-5 1.3-5 3 2.1 3 5 3 5 1.3 5 3-2.1 3-5 3-5-1.3-5-3"></path>',
    reports: '<path d="M6 3h9l3 3v15H6z"></path><path d="M15 3v4h4"></path><path d="M9 13h6M9 17h5"></path>',
    absence: '<path d="M7 3v4M17 3v4"></path><path d="M4 8h16v12H4z"></path><path d="M8 13h3M13 13h3M8 17h3"></path>',
    users: '<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"></path><path d="M2 21a7 7 0 0 1 14 0"></path><path d="M17 11a3 3 0 1 0 0-6"></path><path d="M18 14a6 6 0 0 1 4 6"></path>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"></path><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.5-.2-.1a1.7 1.7 0 0 0-2 .4l-.1.1H11l-.1-.1a1.7 1.7 0 0 0-2-.4l-.2.1-2-3.5.1-.1A1.7 1.7 0 0 0 7 15l-.1-.2-2.9-1.7V9l2.9-1.7L7 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.5.2.1a1.7 1.7 0 0 0 2-.4l.1-.2h4.2l.1.2a1.7 1.7 0 0 0 2 .4l.2-.1 2 3.5-.1.1A1.7 1.7 0 0 0 19 7l.1.2L22 9v4.1l-2.9 1.7Z"></path>',
    "system-check": '<path d="M20 7 9 18l-5-5"></path><path d="M4 4h16v16H4z"></path>',
    feedback: '<path d="M4 5h16v11H8l-4 4z"></path><path d="M8 9h8M8 12h6"></path>',
    menu: '<path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path>',
    more: '<circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle>',
    close: '<path d="M6 6l12 12M18 6 6 18"></path>',
    back: '<path d="M15 18 9 12l6-6"></path><path d="M10 12h10"></path>',
    sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>',
    moon: '<path d="M20.1 14.2A7.8 7.8 0 0 1 9.8 3.9a8.4 8.4 0 1 0 10.3 10.3Z"></path>'
  };

  return `<svg viewBox="0 0 24 24" class="nm-icon" aria-hidden="true" focusable="false">${paths[name] || paths.dashboard}</svg>`;
}

function moduleIcon(item) {
  const officialIcon = renderOfficialIconAsset(item?.icon);

  if (officialIcon) {
    return officialIcon;
  }

  if (typeof item?.module?.icon === "function") {
    return item.module.icon();
  }

  return icon(item?.icon || "module");
}

function readSidebarCompact() {
  try {
    return globalThis.localStorage?.getItem(NEUMORPH_SIDEBAR_STORAGE_KEY) === "compact";
  } catch {
    return false;
  }
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
    <span class="nm-sidebar__icon" aria-hidden="true">${moduleIcon(item)}</span>
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

function renderSidebar(routeHref, navigationGroups, compact = false) {
  return `
    <aside class="nm-sidebar" aria-label="Navigace neumorph migrace">
      <div class="nm-sidebar__top">
        <button
          class="nm-sidebar__toggle"
          type="button"
          aria-label="${compact ? "Rozbalit navigaci" : "Sbalit navigaci"}"
          aria-expanded="${compact ? "false" : "true"}"
          data-nm-action="toggle-sidebar"
        >
          ${icon("menu")}
        </button>
      </div>
      <nav class="nm-sidebar__nav">
        ${navigationGroups.map((group) => `
          <section class="nm-sidebar__group" aria-label="${escapeHtml(group.label)}">
            <span class="nm-sidebar__group-label">${escapeHtml(group.label)}</span>
            ${group.items.map((item) => renderNavItem(item, routeHref)).join("")}
          </section>
        `).join("")}
      </nav>
    </aside>
  `;
}

function renderMobileNav(routeHref, user, currentPath) {
  const { primaryItems, moreGroups } = buildNeumorphMobileNavigation({ user, currentPath });
  const hasMore = moreGroups.length > 0;

  return `
    <nav class="nm-mobile-nav" aria-label="Mobilni navigace neumorph migrace">
      ${primaryItems.map((item) => {
        const itemClass = [
          "nm-mobile-nav__item",
          item.active ? "nm-mobile-nav__item--active" : "",
          item.planned ? "nm-mobile-nav__item--planned" : ""
        ].filter(Boolean).join(" ");
        const content = `${moduleIcon(item)}<span>${escapeHtml(item.label)}</span>`;

        if (item.planned || !item.href) {
          return `<span class="${itemClass}" aria-disabled="true">${content}</span>`;
        }

        return `<a class="${itemClass}" href="${routeHref(item.href)}" data-link ${item.active ? 'aria-current="page"' : ""}>${content}</a>`;
      }).join("")}
      ${hasMore ? `
        <button class="nm-mobile-nav__item nm-mobile-nav__item--more" type="button" aria-expanded="false" data-nm-action="toggle-mobile-more">
          ${icon("more")}<span>Vice</span>
        </button>
      ` : ""}
    </nav>
  `;
}

function renderMobileMorePanel(routeHref, user, currentPath) {
  const { moreGroups } = buildNeumorphMobileNavigation({ user, currentPath });

  if (!moreGroups.length) {
    return "";
  }

  return `
    <div class="nm-mobile-more" data-nm-mobile-more hidden>
      <div class="nm-mobile-more__scrim" data-nm-action="close-mobile-more" aria-hidden="true"></div>
      <section class="nm-mobile-more__sheet" aria-label="Dalsi moduly">
        <div class="nm-mobile-more__head">
          <div>
            <span>Dalsi moduly</span>
            <strong>Kaiser Smart</strong>
          </div>
          <button class="nm-icon-button nm-mobile-more__close" type="button" aria-label="Zavrit dalsi moduly" data-nm-action="close-mobile-more">
            ${icon("close")}
          </button>
        </div>
        <div class="nm-mobile-more__groups">
          ${moreGroups.map((group) => `
            <section class="nm-mobile-more__group" aria-label="${escapeHtml(group.label)}">
              <span class="nm-mobile-more__group-label">${escapeHtml(group.label)}</span>
              ${group.items.map((item) => {
                const itemClass = [
                  "nm-mobile-more__item",
                  item.active ? "nm-mobile-more__item--active" : "",
                  item.planned ? "nm-mobile-more__item--planned" : ""
                ].filter(Boolean).join(" ");
                const content = `<span class="nm-mobile-more__icon" aria-hidden="true">${moduleIcon(item)}</span><span>${escapeHtml(item.label)}</span>`;

                if (item.planned || !item.href) {
                  return `<span class="${itemClass}" aria-disabled="true">${content}</span>`;
                }

                return `<a class="${itemClass}" href="${routeHref(item.href)}" data-link ${item.active ? 'aria-current="page"' : ""}>${content}</a>`;
              }).join("")}
            </section>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderHeader({ routeHref, theme, user }) {
  const userLabel = user?.name || "Interni nahled";
  const resolvedRole = user?.role ? roleLabel(user.role) : "Preview";
  const userAction = user?.previewOnly
    ? '<span class="nm-shell__status">Veřejný náhled</span>'
    : user
      ? '<button class="nm-shell__logout" type="button" data-logout>Odhlásit</button>'
      : "";

  return `
    <header class="nm-shell__header">
      <div class="nm-shell__brand">
        <a class="nm-shell__logo" href="${routeHref("/")}" data-link aria-label="Zpet do Kaiser Smart">
          <img src="/kaiser_logo.png" alt="Kaiser">
        </a>
        <a class="nm-shell__home-link" href="${routeHref("/")}" data-link>
          <span class="nm-shell__home-icon" aria-hidden="true">${icon("back")}</span>
          Zpet na HP
        </a>
      </div>
      <div class="nm-shell__tools">
        <span class="nm-shell__status">Neumorph preview</span>
        ${renderThemeToggle(theme)}
        <span class="nm-shell__user">
          <strong>${escapeHtml(userLabel)}</strong>
          <small>${escapeHtml(resolvedRole)}</small>
        </span>
        ${userAction}
      </div>
    </header>
  `;
}

export function renderNeumorphShell({ routeHref, theme, user, content, currentPath, context }) {
  const navigationGroups = buildNeumorphNavigation({ user, currentPath });
  const compact = readSidebarCompact();
  const shellClass = ["nm-shell", compact ? "nm-shell--compact" : ""].filter(Boolean).join(" ");

  return `
    <div class="nm-app" data-theme="${escapeHtml(theme)}">
      <div class="${shellClass}" data-nm-shell>
        ${renderHeader({ routeHref, theme, user, context })}
        <div class="nm-shell__body">
          ${renderSidebar(routeHref, navigationGroups, compact)}
          <main class="nm-shell__content" id="nm-main" tabindex="-1">
            ${content}
          </main>
        </div>
        ${renderMobileNav(routeHref, user, currentPath)}
        ${renderMobileMorePanel(routeHref, user, currentPath)}
      </div>
    </div>
  `;
}
