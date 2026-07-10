import { createDashboardViewModel } from "../adapters/dashboardAdapter.js";
import {
  escapeHtml,
  renderInlineIcon,
  renderModuleAsset,
  renderNeumorphModuleHeader,
  renderNeumorphState,
  renderNeumorphStatusStrip
} from "../moduleLayout.js";

function formatNumber(value) {
  return new Intl.NumberFormat("cs-CZ").format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return "ceka";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function metricCard(metric) {
  return `
    <article class="nm-card nm-dashboard-metric">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(formatNumber(metric.value))}</strong>
      <small>${escapeHtml(metric.detail)}</small>
    </article>
  `;
}

function priorityCard(priority) {
  return `
    <article class="nm-state-card nm-state-card--${escapeHtml(priority.tone || "neutral")} nm-dashboard-priority">
      <span class="nm-icon-holder nm-icon-holder--${priority.tone === "danger" ? "danger" : priority.tone === "warning" ? "warning" : "info"}" aria-hidden="true">
        ${renderInlineIcon(priority.tone === "danger" || priority.tone === "warning" ? "warning" : "check")}
      </span>
      <div>
        <h3>${escapeHtml(priority.title)}</h3>
        <p>${escapeHtml(priority.text)}</p>
      </div>
    </article>
  `;
}

function quickAction(action) {
  return `
    <a class="nm-card nm-dashboard-action nm-dashboard-action--${escapeHtml(action.tone || "secondary")}" href="${escapeHtml(action.href)}" data-link>
      <span class="nm-icon-holder ${action.tone === "primary" ? "nm-icon-holder--active" : ""}" aria-hidden="true">
        ${renderInlineIcon(action.tone === "primary" ? "check" : "more")}
      </span>
      <span>
        <strong>${escapeHtml(action.label)}</strong>
        <small>${escapeHtml(action.detail)}</small>
      </span>
    </a>
  `;
}

function moduleLinkCard(moduleItem, viewModel) {
  return `
    <a class="nm-card nm-dashboard-module-link" href="${escapeHtml(viewModel.routeHref(`/neumorph${moduleItem.route}`))}" data-link>
      <span class="nm-icon-holder" aria-hidden="true">${renderModuleAsset(moduleItem)}</span>
      <span>
        <strong>${escapeHtml(viewModel.moduleLabel(moduleItem))}</strong>
        <small>${escapeHtml(moduleItem.description)}</small>
      </span>
    </a>
  `;
}

function collectionRoutesPanel(viewModel) {
  const collectionRoutes = viewModel.collectionRoutes;
  const metrics = collectionRoutes.metrics;
  const hasRows = metrics.rowCount > 0;
  const sourceBatch = metrics.sourceBatch;

  if (collectionRoutes.loading) {
    return renderNeumorphState({
      type: "loading",
      title: "Nacitam Trasy svozu",
      description: "Prehled ceka na stejna API data jako puvodni modul."
    });
  }

  if (collectionRoutes.error) {
    return renderNeumorphState({
      type: "error",
      title: "Trasy svozu nejsou dostupne",
      description: collectionRoutes.error
    });
  }

  return `
    <section class="nm-panel nm-dashboard-section nm-dashboard-routes" aria-labelledby="nm-dashboard-routes-title">
      <div class="nm-module-section-head">
        <div>
          <p class="nm-system-eyebrow">Provozni prehled</p>
          <h2 id="nm-dashboard-routes-title">Trasy svozu</h2>
          <p>Stejny read-only zdroj 13 Excelu, filtry a API jako v puvodnim modulu.</p>
        </div>
        <a class="nm-button nm-button--primary" href="${escapeHtml(viewModel.routeHref("/neumorph/trasy-svozu/dashboard"))}" data-link>Otevrit detail</a>
      </div>
      ${hasRows ? `
        <div class="nm-grid nm-dashboard-route-kpis">
          ${metricCard({ label: "Zastavky", value: metrics.rowCount, detail: "aktualni filtr" })}
          ${metricCard({ label: "Nadoby", value: metrics.containerCount, detail: "souhrn z API" })}
          ${metricCard({ label: "Odhad casu", value: metrics.estimatedMinutes, detail: "minut" })}
          ${metricCard({ label: "Odhad hmotnosti", value: metrics.estimatedTons, detail: "tun" })}
        </div>
        <div class="nm-dashboard-route-note">
          <strong>Posledni import</strong>
          <span>${escapeHtml(formatDateTime(sourceBatch?.createdAt))}</span>
        </div>
      ` : renderNeumorphState({
        type: collectionRoutes.sourceImportError ? "warning" : "empty",
        title: collectionRoutes.sourceImportError ? "Zdroj tras ceka na kontrolu" : "Zatim nejsou nactene zadne zastavky",
        description: collectionRoutes.sourceImportError || "Po importu nebo uprave filtru se tu objevi skutecny provozni souhrn."
      })}
    </section>
  `;
}

export function renderNeumorphDashboard({
  user = null,
  routeHref = (route) => route,
  runtime = {}
} = {}) {
  const viewModel = createDashboardViewModel({ user, routeHref, runtime });
  const priorities = viewModel.priorities.length
    ? viewModel.priorities.map(priorityCard).join("")
    : renderNeumorphState({
        type: "empty",
        title: "Zadne kriticke priority",
        description: "Prehled zobrazuje pouze dostupna realna data a nevytvari falesne alerty."
      });

  return `
    <section class="nm-dashboard-page" aria-labelledby="nm-dashboard-title">
      ${renderNeumorphModuleHeader({
        moduleItem: viewModel.dashboardModule,
        eyebrow: "Kaiser Smart / Hlavni prace",
        title: "Prehled systemu",
        description: "Provozni vstup do neumorph prostredi. Pouziva skutecne moduly, permissions a dostupna API data.",
        status: "Funkcni prehled",
        statusTone: "success",
        actions: [
          { label: "Trasy svozu", href: routeHref("/neumorph/trasy-svozu/dashboard"), variant: "primary" },
          { label: "System preview", href: viewModel.systemPreviewHref, variant: "secondary" }
        ],
        meta: ["realna data", "bez produkcniho deploye"]
      })}

      <div class="nm-grid nm-dashboard-metrics" aria-label="Hlavni provozni udaje">
        ${viewModel.metrics.map(metricCard).join("")}
      </div>

      ${renderNeumorphStatusStrip([
        { label: "Data", value: viewModel.collectionRoutes.loaded ? "nacteno" : "ceka", detail: "Trasy svozu API" },
        { label: "API stav", value: viewModel.collectionRoutes.apiStatus || "waiting", detail: "beze zmen kontraktu" },
        { label: "Role", value: user?.role || "public", detail: "stavajici permissions" }
      ])}

      <div class="nm-grid nm-dashboard-layout">
        <section class="nm-dashboard-section" aria-labelledby="nm-dashboard-priority-title">
          <div class="nm-module-section-head">
            <div>
              <p class="nm-system-eyebrow">Pozornost</p>
              <h2 id="nm-dashboard-priority-title">Co vyzaduje kontrolu</h2>
            </div>
          </div>
          <div class="nm-dashboard-priority-list">${priorities}</div>
        </section>

        <section class="nm-dashboard-section" aria-labelledby="nm-dashboard-actions-title">
          <div class="nm-module-section-head">
            <div>
              <p class="nm-system-eyebrow">Rychle akce</p>
              <h2 id="nm-dashboard-actions-title">Kam pokracovat</h2>
            </div>
          </div>
          <div class="nm-dashboard-action-list">
            ${viewModel.quickActions.length
              ? viewModel.quickActions.map(quickAction).join("")
              : renderNeumorphState({
                  type: "warning",
                  title: "Zadne akce pro aktualni roli",
                  description: "Zobrazeni respektuje stavajici permissions."
                })}
          </div>
        </section>
      </div>

      ${collectionRoutesPanel(viewModel)}

      <section class="nm-panel nm-dashboard-section" aria-labelledby="nm-dashboard-modules-title">
        <div class="nm-module-section-head">
          <div>
            <p class="nm-system-eyebrow">Hlavni moduly</p>
            <h2 id="nm-dashboard-modules-title">Dalsi vstupy</h2>
          </div>
        </div>
        <div class="nm-grid nm-dashboard-module-grid">
          ${viewModel.primaryModules.map((moduleItem) => moduleLinkCard(moduleItem, viewModel)).join("")}
        </div>
      </section>
    </section>
  `;
}
