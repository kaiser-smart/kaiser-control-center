import { VersionBackupInfo } from "../../components/VersionBackupInfo.js";
import { VersionNewsInfo } from "../../components/VersionNewsInfo.js";
import { createDashboardViewModel } from "../adapters/dashboardAdapter.js";
import {
  escapeHtml,
  renderModuleAsset,
  renderNeumorphModuleHeader
} from "../moduleLayout.js";

function statusBadge(card) {
  if (!card.statusLabel) {
    return "";
  }

  return `
    <span class="nm-home-card__status nm-home-card__status--${escapeHtml(card.statusTone)}">
      ${escapeHtml(card.statusLabel)}
    </span>
  `;
}

function unreadBadge(card) {
  const value = Number(card.dataBoxUnreadCount || 0);

  if (value <= 0) {
    return "";
  }

  const label = card.dataBoxUnreadLabel || "Nové zprávy";

  return `
    <span
      class="nm-home-card__unread"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(`${label}: ${value}`)}"
    >
      ${escapeHtml(value > 99 ? "99+" : String(value))}
    </span>
  `;
}

function moduleCard(card) {
  return `
    <a class="nm-card nm-home-card" href="${escapeHtml(card.href)}" data-link>
      <span class="nm-home-card__media">
        <span class="nm-icon-holder nm-home-card__icon" aria-hidden="true">
          ${renderModuleAsset(card.moduleItem)}
        </span>
        ${statusBadge(card)}
      </span>
      ${unreadBadge(card)}
      <span class="nm-home-card__content">
        <strong class="nm-home-card__title">${escapeHtml(card.title)}</strong>
        <span class="nm-home-card__description">${escapeHtml(card.description)}</span>
      </span>
    </a>
  `;
}

export function renderNeumorphDashboard({
  user = null,
  routeHref = (route) => route,
  runtime = {}
} = {}) {
  const viewModel = createDashboardViewModel({ user, routeHref, runtime });

  return `
    <section class="nm-dashboard-page nm-dashboard-page--home" aria-labelledby="nm-dashboard-title">
      ${renderNeumorphModuleHeader({
        moduleItem: viewModel.dashboardModule,
        eyebrow: "Kaiser Smart / Hlavní práce",
        title: viewModel.appName,
        description: viewModel.subtitle,
        status: `${viewModel.moduleCount} modulů`,
        statusTone: "success",
        meta: [`${viewModel.completedCount} hotový`]
      })}

      <section class="nm-panel nm-dashboard-home-modules" aria-label="Hlavní moduly">
        <h2 class="nm-sr-only">Hlavní moduly</h2>
        <div class="nm-grid nm-dashboard-home-grid">
          ${viewModel.moduleCards.map(moduleCard).join("")}
        </div>
      </section>

      <div class="nm-dashboard-version-sections">
        ${VersionNewsInfo()}
        ${VersionBackupInfo()}
      </div>
    </section>
  `;
}
