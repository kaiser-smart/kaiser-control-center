import {
  moduleIconName,
  modulePermissionSummary,
  moduleStatusLabel,
  moduleStatusTone,
  neumorphPathForRoute,
  neumorphRouteEntries,
  visibleNeumorphModules
} from "./moduleRegistry.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderModuleAsset(moduleItem) {
  if (typeof moduleItem?.icon !== "function") {
    return "";
  }

  return moduleItem.icon();
}

function renderRoutePath(path) {
  return `<code>${escapeHtml(path)}</code>`;
}

function renderPermissionChips(user, moduleId) {
  return modulePermissionSummary(user, moduleId)
    .map((action) => `<span class="nm-chip">${escapeHtml(action)}</span>`)
    .join("");
}

function renderModuleCard(moduleItem, routeHref) {
  return `
    <a class="nm-module-card" href="${routeHref(neumorphPathForRoute(moduleItem.route))}" data-link>
      <span class="nm-icon-holder nm-module-card__icon" data-nm-module-icon="${escapeHtml(moduleIconName(moduleItem.id))}">
        ${renderModuleAsset(moduleItem)}
      </span>
      <span class="nm-module-card__body">
        <span class="nm-module-card__title">${escapeHtml(moduleItem.title)}</span>
        <span class="nm-module-card__text">${escapeHtml(moduleItem.description)}</span>
      </span>
      <span class="nm-chip nm-chip--${moduleStatusTone(moduleItem)}">${escapeHtml(moduleStatusLabel(moduleItem))}</span>
    </a>
  `;
}

export function renderNeumorphModuleCatalog({ user = null, routeHref = (route) => route } = {}) {
  const moduleItems = visibleNeumorphModules(user);

  return `
    <section class="nm-panel nm-module-catalog" aria-labelledby="nm-module-catalog-title">
      <div class="nm-module-section-head">
        <div>
          <p class="nm-system-eyebrow">Migracni mapa</p>
          <h2 id="nm-module-catalog-title">Paralelni neumorph moduly</h2>
        </div>
        <span class="nm-chip nm-chip--info">${moduleItems.length} modulu</span>
      </div>
      <div class="nm-module-card-grid">
        ${moduleItems.map((moduleItem) => renderModuleCard(moduleItem, routeHref)).join("")}
      </div>
    </section>
  `;
}

function renderSiblingRoutes(moduleItem, routeHref) {
  const routes = neumorphRouteEntries()
    .filter((entry) => entry.module.id === moduleItem.id)
    .sort((a, b) => a.originalRoute.localeCompare(b.originalRoute));

  if (!routes.length) {
    return "";
  }

  return `
    <div class="nm-route-list">
      ${routes.map((entry) => `
        <a class="nm-route-list__item" href="${routeHref(entry.href)}" data-link>
          <span>${entry.type === "dashboard" ? "Dashboard" : "Modul"}</span>
          ${renderRoutePath(entry.href)}
        </a>
      `).join("")}
    </div>
  `;
}

function renderModuleKpis(moduleItem, resolvedRoute, user) {
  const chips = renderPermissionChips(user, moduleItem.id);

  return `
    <div class="nm-grid nm-module-kpis">
      <article class="nm-card nm-module-kpi">
        <span>Status</span>
        <strong>${escapeHtml(moduleStatusLabel(moduleItem))}</strong>
      </article>
      <article class="nm-card nm-module-kpi">
        <span>Aktualni route</span>
        ${renderRoutePath(resolvedRoute.path)}
      </article>
      <article class="nm-card nm-module-kpi">
        <span>Puvodni route</span>
        ${renderRoutePath(resolvedRoute.originalPath)}
      </article>
      <article class="nm-card nm-module-kpi">
        <span>Opravneni</span>
        <div class="nm-cluster">${chips || '<span class="nm-chip">view</span>'}</div>
      </article>
    </div>
  `;
}

export function renderNeumorphModulePage({
  resolvedRoute,
  user = null,
  routeHref = (route) => route
} = {}) {
  const moduleItem = resolvedRoute.module;
  const dashboardHref = moduleItem.dashboardRoute ? neumorphPathForRoute(moduleItem.dashboardRoute) : "";

  return `
    <section class="nm-module-page" aria-labelledby="nm-module-title">
      <div class="nm-panel nm-module-hero">
        <div class="nm-module-hero__copy">
          <p class="nm-system-eyebrow">Kaiser Smart / ${escapeHtml(moduleItem.title)}</p>
          <h1 id="nm-module-title">${escapeHtml(moduleItem.title)}</h1>
          <p>${escapeHtml(moduleItem.description)}</p>
          <div class="nm-cluster">
            <span class="nm-chip nm-chip--${moduleStatusTone(moduleItem)}">${escapeHtml(moduleStatusLabel(moduleItem))}</span>
            <span class="nm-chip">${resolvedRoute.isDashboard ? "dashboard" : resolvedRoute.entryType}</span>
          </div>
        </div>
        <div class="nm-module-hero__visual" aria-hidden="true">
          <span class="nm-icon-holder nm-icon-holder--active nm-module-hero__icon">
            ${renderModuleAsset(moduleItem)}
          </span>
        </div>
      </div>

      ${renderModuleKpis(moduleItem, resolvedRoute, user)}

      <div class="nm-grid nm-module-grid">
        <section class="nm-panel nm-module-section" aria-labelledby="nm-module-actions-title">
          <div class="nm-module-section-head">
            <div>
              <p class="nm-system-eyebrow">Migracni prototyp</p>
              <h2 id="nm-module-actions-title">Akce a napojeni</h2>
            </div>
          </div>
          <p>
            Tato stranka je izolovany neumorph prototyp pro stejny modulovy vstup.
            Data, API a realne akce zustavaji beze zmen na puvodnich routach.
          </p>
          <div class="nm-cluster">
            <a class="nm-button nm-button--primary" href="${routeHref(resolvedRoute.originalPath)}" data-link>Otevrit puvodni modul</a>
            ${dashboardHref ? `<a class="nm-button nm-button--secondary" href="${routeHref(dashboardHref)}" data-link>Neumorph dashboard</a>` : ""}
            <a class="nm-button nm-button--subtle" href="${routeHref("/neumorph")}" data-link>Zpet na mapu migrace</a>
          </div>
        </section>

        <section class="nm-panel nm-module-section" aria-labelledby="nm-module-routes-title">
          <div class="nm-module-section-head">
            <div>
              <p class="nm-system-eyebrow">Route parity</p>
              <h2 id="nm-module-routes-title">Znami potomci modulu</h2>
            </div>
          </div>
          ${renderSiblingRoutes(moduleItem, routeHref)}
        </section>
      </div>
    </section>
  `;
}

export function renderNeumorphAccessState({ type = "not-found", routeHref = (route) => route } = {}) {
  const forbidden = type === "forbidden";

  return `
    <section class="nm-empty-state nm-module-access-state">
      <span class="nm-icon-holder ${forbidden ? "" : "nm-icon-holder--active"}" aria-hidden="true"></span>
      <h1>${forbidden ? "Bez opravneni" : "Route nenalezena"}</h1>
      <p>
        ${forbidden
          ? "Aktualni uzivatel nema opravneni zobrazit tento neumorph modul."
          : "Tato neumorph route zatim nema vazbu na znamy modul Kaiser Smart."}
      </p>
      <a class="nm-button nm-button--primary" href="${routeHref("/neumorph")}" data-link>Zpet na neumorph prehled</a>
    </section>
  `;
}
