import {
  applyNeumorphTheme,
  readStoredNeumorphTheme,
  toggleNeumorphTheme
} from "./theme.js";
import { renderNeumorphShell } from "./shell.js";
import {
  renderNeumorphAccessState,
  renderNeumorphModuleCatalog,
  renderNeumorphModulePage
} from "./modulePages.js";
import {
  NEUMORPH_BASE_ROUTE,
  moduleDisplayLabel,
  moduleGroupLabel,
  resolveNeumorphRoute
} from "./moduleRegistry.js";
import { renderNeumorphCollectionRoutes } from "./modules/collectionRoutes.js";
import { renderNeumorphDashboard } from "./modules/dashboard.js";
import { renderNeumorphSystemPreview } from "./systemPreview.js";

export const NEUMORPH_ROUTE = NEUMORPH_BASE_ROUTE;
const NEUMORPH_SIDEBAR_STORAGE_KEY = "smart_odpady_neumorph_sidebar";

export function isNeumorphRoute(path = "") {
  const normalizedPath = String(path || "/").replace(/\/+$/, "") || "/";
  return normalizedPath === NEUMORPH_ROUTE || normalizedPath.startsWith(`${NEUMORPH_ROUTE}/`);
}

function updateThemeToggle(root) {
  const appRoot = root?.matches?.(".nm-app") ? root : root?.querySelector?.(".nm-app");
  if (!appRoot) {
    return;
  }

  const theme = appRoot.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const isDark = theme === "dark";
  appRoot.querySelectorAll("[data-nm-action='toggle-theme']").forEach((button) => {
    button.setAttribute("aria-checked", isDark ? "true" : "false");
    button.setAttribute("aria-label", `Prepnout na ${isDark ? "denni" : "nocni"} motiv`);
  });
  appRoot.querySelectorAll("[data-nm-theme-label]").forEach((label) => {
    label.textContent = isDark ? "Noc" : "Den";
  });
}

export function syncNeumorphRouteTheme(root = document.querySelector(".nm-app")) {
  if (!root) {
    return "light";
  }

  const theme = applyNeumorphTheme(readStoredNeumorphTheme(), { target: root });
  updateThemeToggle(root);
  return theme;
}

function toggleTheme(button) {
  const appRoot = button.closest(".nm-app");
  if (!appRoot) {
    return;
  }

  toggleNeumorphTheme(appRoot.getAttribute("data-theme"), {
    target: appRoot,
    persist: true
  });
  updateThemeToggle(appRoot);
}

function toggleSidebar(button) {
  const shell = button.closest("[data-nm-shell]");
  if (!shell) {
    return;
  }

  const compact = shell.classList.toggle("nm-shell--compact");
  button.setAttribute("aria-expanded", compact ? "false" : "true");
  button.setAttribute("aria-label", compact ? "Rozbalit navigaci" : "Sbalit navigaci");

  try {
    globalThis.localStorage?.setItem(NEUMORPH_SIDEBAR_STORAGE_KEY, compact ? "compact" : "expanded");
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

function setMobileMoreState(button, open) {
  const shell = button.closest("[data-nm-shell]");
  if (!shell) {
    return;
  }

  const nextOpen = typeof open === "boolean" ? open : !shell.classList.contains("nm-shell--mobile-more-open");
  const panel = shell.querySelector("[data-nm-mobile-more]");
  shell.classList.toggle("nm-shell--mobile-more-open", nextOpen);
  shell.querySelectorAll("[data-nm-action='toggle-mobile-more']").forEach((toggle) => {
    toggle.setAttribute("aria-expanded", nextOpen ? "true" : "false");
  });

  if (panel) {
    panel.hidden = !nextOpen;
  }
}

export function handleNeumorphAction(actionElement) {
  const action = actionElement?.dataset?.nmAction || "";

  if (action === "toggle-theme") {
    toggleTheme(actionElement);
    return true;
  }

  if (action === "toggle-sidebar") {
    toggleSidebar(actionElement);
    return true;
  }

  if (action === "toggle-mobile-more") {
    setMobileMoreState(actionElement);
    return true;
  }

  if (action === "close-mobile-more") {
    setMobileMoreState(actionElement, false);
    return true;
  }

  return false;
}

function shellContextForRoute(resolvedRoute) {
  if (resolvedRoute.view === "home") {
    return {
      title: "Prehled systemu",
      group: "Hlavni prace"
    };
  }

  if (resolvedRoute.view === "system-preview") {
    return {
      title: "System preview",
      group: "Migracni nahled"
    };
  }

  if (resolvedRoute.view === "module" && resolvedRoute.module) {
    return {
      title: moduleDisplayLabel(resolvedRoute.module),
      group: moduleGroupLabel(resolvedRoute.module)
    };
  }

  if (resolvedRoute.view === "forbidden" && resolvedRoute.module) {
    return {
      title: moduleDisplayLabel(resolvedRoute.module),
      group: "Bez opravneni"
    };
  }

  return {
    title: "Neumorph system",
    group: "Migracni nahled"
  };
}

function renderNeumorphContent({ resolvedRoute, routeHref, user, runtime }) {
  if (resolvedRoute.view === "home") {
    return renderNeumorphDashboard({ user, routeHref, runtime });
  }

  if (resolvedRoute.view === "system-preview") {
    return `
      <div class="nm-stack">
        ${renderNeumorphSystemPreview({ routeHref })}
        ${renderNeumorphModuleCatalog({ user, routeHref })}
      </div>
    `;
  }

  if (resolvedRoute.view === "module") {
    if (resolvedRoute.module?.id === "collection-routes") {
      return renderNeumorphCollectionRoutes({ user, routeHref, runtime });
    }

    return renderNeumorphModulePage({ resolvedRoute, user, routeHref });
  }

  return renderNeumorphAccessState({
    type: resolvedRoute.view,
    routeHref
  });
}

export function renderNeumorphRoute({ routeHref = (route) => route, user = null, path = NEUMORPH_ROUTE, runtime = {} } = {}) {
  const theme = readStoredNeumorphTheme();
  const resolvedRoute = resolveNeumorphRoute({ path, user });

  return renderNeumorphShell({
    routeHref,
    currentPath: path,
    theme,
    user,
    context: shellContextForRoute(resolvedRoute),
    content: renderNeumorphContent({ resolvedRoute, routeHref, user, runtime })
  });
}
