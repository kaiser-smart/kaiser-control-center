import {
  applyNeumorphTheme,
  readStoredNeumorphTheme,
  toggleNeumorphTheme
} from "./theme.js";
import { renderNeumorphShell } from "./shell.js";
import { renderNeumorphSystemPreview } from "./systemPreview.js";

export const NEUMORPH_ROUTE = "/neumorph";

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

  return false;
}

export function renderNeumorphRoute({ routeHref = (route) => route, user = null } = {}) {
  const theme = readStoredNeumorphTheme();

  return renderNeumorphShell({
    routeHref,
    theme,
    user,
    content: renderNeumorphSystemPreview()
  });
}
