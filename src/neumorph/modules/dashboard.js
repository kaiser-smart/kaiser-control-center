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
    return "čeká";
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
      title: "Načítám Trasy svozu",
      description: "Přehled čeká na stejná API data jako původní modul."
    });
  }

  if (collectionRoutes.error) {
    return renderNeumorphState({
      type: "error",
      title: "Trasy svozu nejsou dostupné",
      description: collectionRoutes.error
    });
  }

  return `
    <section class="nm-panel nm-dashboard-section nm-dashboard-routes" aria-labelledby="nm-dashboard-routes-title">
      <div class="nm-module-section-head">
        <div>
          <p class="nm-system-eyebrow">Provozní přehled</p>
          <h2 id="nm-dashboard-routes-title">Trasy svozu</h2>
          <p>Stejný read-only zdroj 13 Excelů, filtry a API jako v původním modulu.</p>
        </div>
        <a class="nm-button nm-button--primary" href="${escapeHtml(viewModel.routeHref("/neumorph/trasy-svozu/dashboard"))}" data-link>Otevřít detail</a>
      </div>
      ${hasRows ? `
        <div class="nm-grid nm-dashboard-route-kpis">
          ${metricCard({ label: "Zastávky", value: metrics.rowCount, detail: "aktuální filtr" })}
          ${metricCard({ label: "Nádoby", value: metrics.containerCount, detail: "souhrn z API" })}
          ${metricCard({ label: "Odhad času", value: metrics.estimatedMinutes, detail: "minut" })}
          ${metricCard({ label: "Odhad hmotnosti", value: metrics.estimatedTons, detail: "tun" })}
        </div>
        <div class="nm-dashboard-route-note">
          <strong>Poslední import</strong>
          <span>${escapeHtml(formatDateTime(sourceBatch?.createdAt))}</span>
        </div>
      ` : renderNeumorphState({
        type: collectionRoutes.sourceImportError ? "warning" : "empty",
        title: collectionRoutes.sourceImportError ? "Zdroj tras čeká na kontrolu" : "Zatím nejsou načtené žádné zastávky",
        description: collectionRoutes.sourceImportError || "Po importu nebo úpravě filtru se tu objeví skutečný provozní souhrn."
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
        title: "Žádné kritické priority",
        description: "Přehled zobrazuje pouze dostupná reálná data a nevytváří falešné alerty."
      });

  return `
    <section class="nm-dashboard-page" aria-labelledby="nm-dashboard-title">
      ${renderNeumorphModuleHeader({
        moduleItem: viewModel.dashboardModule,
        eyebrow: "Kaiser Smart / Hlavní práce",
        title: "Přehled systému",
        description: "Provozní vstup do neumorph prostředí. Používá skutečné moduly, permissions a dostupná API data.",
        status: "Funkční přehled",
        statusTone: "success",
        actions: [
          { label: "Trasy svozu", href: routeHref("/neumorph/trasy-svozu/dashboard"), variant: "primary" },
          { label: "System preview", href: viewModel.systemPreviewHref, variant: "secondary" }
        ],
        meta: ["reálná data", "bez produkčního deploye"]
      })}

      <div class="nm-grid nm-dashboard-metrics" aria-label="Hlavní provozní údaje">
        ${viewModel.metrics.map(metricCard).join("")}
      </div>

      ${renderNeumorphStatusStrip([
        { label: "Data", value: viewModel.collectionRoutes.loaded ? "načteno" : "čeká", detail: "Trasy svozu API" },
        { label: "API stav", value: viewModel.collectionRoutes.apiStatus || "waiting", detail: "beze změn kontraktu" },
        { label: "Role", value: user?.role || "public", detail: "stávající permissions" }
      ])}

      <div class="nm-grid nm-dashboard-layout">
        <section class="nm-dashboard-section" aria-labelledby="nm-dashboard-priority-title">
          <div class="nm-module-section-head">
            <div>
              <p class="nm-system-eyebrow">Pozornost</p>
              <h2 id="nm-dashboard-priority-title">Co vyžaduje kontrolu</h2>
            </div>
          </div>
          <div class="nm-dashboard-priority-list">${priorities}</div>
        </section>

        <section class="nm-dashboard-section" aria-labelledby="nm-dashboard-actions-title">
          <div class="nm-module-section-head">
            <div>
              <p class="nm-system-eyebrow">Rychlé akce</p>
              <h2 id="nm-dashboard-actions-title">Kam pokračovat</h2>
            </div>
          </div>
          <div class="nm-dashboard-action-list">
            ${viewModel.quickActions.length
              ? viewModel.quickActions.map(quickAction).join("")
              : renderNeumorphState({
                  type: "warning",
                  title: "Žádné akce pro aktuální roli",
                  description: "Zobrazení respektuje stávající permissions."
                })}
          </div>
        </section>
      </div>

      ${collectionRoutesPanel(viewModel)}

      <section class="nm-panel nm-dashboard-section" aria-labelledby="nm-dashboard-modules-title">
        <div class="nm-module-section-head">
          <div>
            <p class="nm-system-eyebrow">Hlavní moduly</p>
            <h2 id="nm-dashboard-modules-title">Další vstupy</h2>
          </div>
        </div>
        <div class="nm-grid nm-dashboard-module-grid">
          ${viewModel.primaryModules.map((moduleItem) => moduleLinkCard(moduleItem, viewModel)).join("")}
        </div>
      </section>
    </section>
  `;
}
