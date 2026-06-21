import { moduleDashboards, modules } from "./data/modules.js";

const app = document.querySelector("#app");
const orderedModules = [...modules].sort((a, b) => a.order - b.order);
const primaryRoutes = new Map(orderedModules.map((moduleItem) => [moduleItem.route, moduleItem]));
const dashboardRoutes = new Map(moduleDashboards.map((moduleItem) => [moduleItem.route, moduleItem]));
const TYRES_MODULE_URL = "https://oplustil-prog.github.io/kaiser-pneu-evidence/";
const basePath = new URL(document.querySelector("base")?.href || "/", window.location.origin)
  .pathname
  .replace(/\/$/, "");

function normalizePath(pathname) {
  let path = pathname || "/";

  if (basePath && (path === basePath || path.startsWith(`${basePath}/`))) {
    path = path.slice(basePath.length) || "/";
  }

  if (path === "/") {
    return "/";
  }

  return path.replace(/\/+$/, "") || "/";
}

function routeHref(route) {
  if (route === "/") {
    return `${basePath || ""}/`;
  }

  return `${basePath || ""}${route}`;
}

function renderModuleIcon(moduleItem) {
  return moduleItem.icon();
}

function statusBadge(moduleItem) {
  if (moduleItem.status !== "HOTOVO") {
    return "";
  }

  return '<span class="status-badge">HOTOVO</span>';
}

function homePage() {
  const completedCount = orderedModules.filter((moduleItem) => moduleItem.status === "HOTOVO").length;
  const cards = orderedModules
    .map(
      (moduleItem) => `
        <a class="module-card" href="${routeHref(moduleItem.route)}" data-link>
          <span class="module-card__media">
            <span class="module-icon">${renderModuleIcon(moduleItem)}</span>
            ${statusBadge(moduleItem)}
          </span>
          <span class="module-card__content">
            <span class="module-card__header">
              <span class="module-card__title">${moduleItem.title}</span>
            </span>
            <span class="module-card__description">${moduleItem.description}</span>
          </span>
        </a>
      `
    )
    .join("");

  return `
    <main class="app-shell">
      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-hero__main">
          <a class="kaiser-logo" href="${routeHref("/")}" data-link aria-label="Kaiser Control Center">kaiser.</a>
          <h1 id="home-title">Kaiser Control Center</h1>
          <p class="home-subtitle">Centrální systém pro provoz, servis a trasy</p>
        </div>
        <div class="home-status" aria-label="Stav modulů">
          <span class="home-status__item">
            <span class="home-status__value">${orderedModules.length}</span>
            <span class="home-status__label">modulů</span>
          </span>
          <span class="home-status__item">
            <span class="home-status__value">${completedCount}</span>
            <span class="home-status__label">hotový</span>
          </span>
        </div>
      </section>
      <section class="module-grid" aria-label="Hlavní moduly">
        ${cards}
      </section>
    </main>
  `;
}

function modulePage(moduleItem, isDashboard = false) {
  const isTyres = moduleItem.id === "tyres";
  const title = isDashboard ? moduleItem.pageTitle : moduleItem.title;
  const description = isTyres && !isDashboard
    ? "Hotový modul evidence pneumatik."
    : moduleItem.description;
  const dashboardLink = !isDashboard && moduleItem.dashboardRoute
    ? `<a class="secondary-link" href="${routeHref(moduleItem.dashboardRoute)}" data-link>Dashboard modulu</a>`
    : "";
  const tyresLink = isTyres && !isDashboard
    ? `
        <a class="primary-link" href="${TYRES_MODULE_URL}" target="_blank" rel="noopener noreferrer">
          Otevřít modul Pneumatiky
        </a>
      `
    : "";

  return `
    <main class="app-shell module-page">
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na Kaiser Control Center">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>

      <section class="module-detail" aria-labelledby="module-title">
        <div class="module-detail__icon">${renderModuleIcon(moduleItem)}</div>
        <div class="module-detail__body">
          <div class="module-detail__eyebrow">${isDashboard ? "Modulový dashboard" : "Modul"}</div>
          <h1 id="module-title">${title}</h1>
          <p>${description}</p>
          <div class="module-detail__status">
            <span>Stav</span>
            <strong>${moduleItem.status}</strong>
          </div>
          <div class="module-actions">
            ${tyresLink}
            ${dashboardLink}
          </div>
        </div>
      </section>
    </main>
  `;
}

function notFoundPage() {
  return `
    <main class="app-shell module-page">
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na Kaiser Control Center">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>
      <section class="module-detail" aria-labelledby="module-title">
        <div class="module-detail__body">
          <div class="module-detail__eyebrow">Nenalezeno</div>
          <h1 id="module-title">Stránka neexistuje</h1>
          <p>Požadovaná route zatím není v Kaiser Control Center připravená.</p>
        </div>
      </section>
    </main>
  `;
}

function render() {
  const path = normalizePath(window.location.pathname);

  if (path === "/") {
    app.innerHTML = homePage();
    document.title = "Kaiser Control Center";
    return;
  }

  if (primaryRoutes.has(path)) {
    const moduleItem = primaryRoutes.get(path);
    app.innerHTML = modulePage(moduleItem);
    document.title = `${moduleItem.title} | Kaiser Control Center`;
    return;
  }

  if (dashboardRoutes.has(path)) {
    const moduleItem = dashboardRoutes.get(path);
    app.innerHTML = modulePage(moduleItem, true);
    document.title = `${moduleItem.pageTitle} | Kaiser Control Center`;
    return;
  }

  app.innerHTML = notFoundPage();
  document.title = "Nenalezeno | Kaiser Control Center";
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-link]");

  if (!link || link.origin !== window.location.origin) {
    return;
  }

  event.preventDefault();
  window.history.pushState({}, "", link.href);
  render();
});

window.addEventListener("popstate", render);
render();
