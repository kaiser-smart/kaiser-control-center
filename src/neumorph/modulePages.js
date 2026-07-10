import {
  moduleDisplayLabel,
  moduleGroupLabel,
  moduleIconName,
  moduleMigrationLabel,
  modulePermissionSummary,
  moduleStatusLabel,
  moduleStatusTone,
  neumorphPathForRoute,
  neumorphRouteEntries,
  visibleNeumorphModules
} from "./moduleRegistry.js";
import {
  escapeHtml,
  renderModuleAsset,
  renderNeumorphModuleHeader,
  renderNeumorphState,
  renderNeumorphStatusStrip,
  renderNeumorphToolbar
} from "./moduleLayout.js";

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
        <span class="nm-module-card__eyebrow">${escapeHtml(moduleGroupLabel(moduleItem))}</span>
        <span class="nm-module-card__title">${escapeHtml(moduleDisplayLabel(moduleItem))}</span>
        <span class="nm-module-card__text">${escapeHtml(moduleItem.description)}</span>
      </span>
      <span class="nm-chip nm-chip--${moduleStatusTone(moduleItem)}">${escapeHtml(moduleMigrationLabel(moduleItem))}</span>
    </a>
  `;
}

export function renderNeumorphModuleCatalog({ user = null, routeHref = (route) => route } = {}) {
  const moduleItems = visibleNeumorphModules(user);

  return `
    <section class="nm-module-catalog" aria-labelledby="nm-module-catalog-title">
      <div class="nm-panel nm-module-section-head nm-module-section-head--raised">
        <div>
          <p class="nm-system-eyebrow">Modulova mapa</p>
          <h2 id="nm-module-catalog-title">Paralelni neumorph prostredi</h2>
          <p>Stejne moduly, permissions a route registry. Detailni obsah se bude migrovat po modulech.</p>
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

function renderMigrationPlan(moduleItem) {
  return `
    <div class="nm-grid nm-migration-plan">
      <article class="nm-card nm-card--inset">
        <h3>Stav migrace</h3>
        <p>${escapeHtml(moduleMigrationLabel(moduleItem))}</p>
      </article>
      <article class="nm-card nm-card--inset">
        <h3>Design system</h3>
        <p>Shell, navigace, toolbar, panely, formulare a tabulkovy wrapper jsou pripraveny jako sdileny zaklad.</p>
      </article>
      <article class="nm-card nm-card--inset">
        <h3>Data a API</h3>
        <p>Bez zmen. Funkcni workflow zustava na puvodni route, dokud nebude modul migrovan samostatne.</p>
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
  const actions = [
    {
      label: "Otevrit puvodni modul",
      href: routeHref(resolvedRoute.originalPath),
      variant: "primary"
    },
    dashboardHref
      ? {
          label: "Neumorph dashboard",
          href: routeHref(dashboardHref),
          variant: "secondary"
        }
      : null,
    {
      label: "Mapa migrace",
      href: routeHref("/neumorph"),
      variant: "subtle"
    }
  ].filter(Boolean);

  return `
    <section class="nm-module-page" aria-labelledby="nm-module-title">
      ${renderNeumorphModuleHeader({
        moduleItem,
        eyebrow: `Kaiser Smart / ${moduleGroupLabel(moduleItem)}`,
        title: moduleDisplayLabel(moduleItem),
        description: moduleItem.description,
        status: moduleMigrationLabel(moduleItem),
        statusTone: moduleStatusTone(moduleItem),
        actions,
        meta: [resolvedRoute.isDashboard ? "dashboard" : resolvedRoute.entryType, moduleStatusLabel(moduleItem)]
      })}

      ${renderModuleKpis(moduleItem, resolvedRoute, user)}

      ${renderNeumorphStatusStrip([
        { label: "Route", value: resolvedRoute.path, detail: "paralelni neumorph cesta" },
        { label: "Puvodni modul", value: resolvedRoute.originalPath, detail: "beze zmen business logiky" },
        { label: "Stav", value: moduleMigrationLabel(moduleItem), detail: "bez falesnych produkcnich dat" }
      ])}

      ${renderNeumorphToolbar({
        label: "Budouci toolbar modulu",
        searchPlaceholder: `Hledat v ${moduleDisplayLabel(moduleItem)}`,
        segments: ["Prehled", "Aktivni", "Archiv"],
        filters: [
          { label: "Stav", options: ["Vse", "Aktivni", "Ceka"] },
          { label: "Obdobi", options: ["Dnes", "Tyden", "Mesic"] }
        ],
        actions: [
          { label: "Export", icon: "download", variant: "secondary", disabled: true },
          { label: "Nova akce", icon: "plus", variant: "primary", disabled: true }
        ],
        countLabel: "ukazka toolbaru"
      })}

      <div class="nm-grid nm-module-grid">
        <section class="nm-panel nm-module-section" aria-labelledby="nm-module-actions-title">
          <div class="nm-module-section-head">
            <div>
              <p class="nm-system-eyebrow">Migracni prototyp</p>
              <h2 id="nm-module-actions-title">Akce a napojeni</h2>
            </div>
          </div>
          <p>
            Tento pohled ukazuje finalizovany sdileny shell a module layout.
            Nejde jeste o detailni migraci realne funkcni obrazovky modulu.
          </p>
          ${renderMigrationPlan(moduleItem)}
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

      <div class="nm-grid nm-module-state-grid">
        ${renderNeumorphState({
          type: "empty",
          title: "Obsah modulu zatim neni migrovan",
          description: "Tento ramec je pripraveny pro dalsi fazi, ktera prevede konkretni tabulky, formulare a workflow."
        })}
        ${renderNeumorphState({
          type: "warning",
          title: "Realne akce zustavaji na puvodni route",
          description: "Dokud modul neprojde samostatnou migraci, neumorph route nesimuluje produkcni workflow."
        })}
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
