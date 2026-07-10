import { modules } from "../../data/modules.js";
import { createDriverReportsViewModel } from "../adapters/driverReportsAdapter.js";
import {
  escapeHtml,
  renderInlineIcon,
  renderNeumorphModuleHeader,
  renderNeumorphState,
  renderNeumorphStatusStrip
} from "../moduleLayout.js";
import {
  renderDriverReportCreateForm,
  renderDriverReportManualPartForm,
  renderDriverReportOrderForm,
  renderDriverReportServiceForm
} from "./driverReportForms.js";

const driverReportsModule = modules.find((moduleItem) => moduleItem.id === "driver-reports");

function renderNotice(notice) {
  return `<p class="nm-alert nm-alert--${escapeHtml(notice.tone)}">${escapeHtml(notice.text)}</p>`;
}

function renderNotices(viewModel) {
  if (!viewModel.notices.length) {
    return "";
  }

  return `<div class="nm-driver-report-notices">${viewModel.notices.map(renderNotice).join("")}</div>`;
}

function renderStatusChip(item) {
  return `<span class="nm-chip nm-chip--${escapeHtml(item.statusTone)}">${escapeHtml(item.statusLabel)}</span>`;
}

function renderMetric(metric) {
  return `
    <article class="nm-card nm-driver-report-metric">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <small>${escapeHtml(metric.detail)}</small>
    </article>
  `;
}

function renderToolbar(viewModel) {
  return `
    <form class="nm-toolbar nm-driver-report-toolbar" data-driver-report-search-form aria-label="Hledani hlaseni ridicu">
      <label class="nm-search-field nm-driver-report-toolbar__search">
        <span class="nm-sr-only">Hledat hlaseni</span>
        ${renderInlineIcon("search")}
        <input
          class="nm-input"
          type="search"
          name="search"
          value="${escapeHtml(viewModel.search)}"
          placeholder="Hledat SPZ, ridice, pozadavek"
        >
      </label>
      <div class="nm-toolbar__filters">
        <span class="nm-chip nm-chip--info">${escapeHtml(viewModel.items.length)} hlaseni</span>
        <span class="nm-chip nm-chip--${viewModel.apiStatus === "ready" ? "success" : "warning"}">${escapeHtml(viewModel.apiStatus)}</span>
      </div>
      <div class="nm-toolbar__actions">
        <button class="nm-button nm-button--secondary" type="submit">
          Hledat
        </button>
        <button class="nm-button nm-button--secondary" type="button" data-driver-report-refresh ${viewModel.loading ? "disabled" : ""}>
          ${viewModel.loading ? "Nacitam..." : "Obnovit"}
        </button>
      </div>
    </form>
  `;
}

function reportIcon(item) {
  const text = item.licensePlate === "SPZ neuvedena"
    ? item.reportId.slice(0, 2)
    : item.licensePlate.replace(/\s+/g, "").slice(0, 2);

  return `<span class="nm-driver-report-icon" aria-hidden="true">${escapeHtml(text || "ND")}</span>`;
}

function renderListItem(item) {
  return `
    <button
      class="nm-driver-report-item ${item.selected ? "nm-driver-report-item--active" : ""}"
      type="button"
      data-driver-report-select="${escapeHtml(item.id)}"
      aria-current="${item.selected ? "true" : "false"}"
    >
      <span class="nm-driver-report-item__top">
        ${reportIcon(item)}
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.reportId)} / ${escapeHtml(item.reportedAt)}</small>
        </span>
        ${renderStatusChip(item)}
      </span>
      <span class="nm-driver-report-item__part">${escapeHtml(item.partTitle)}</span>
      <span class="nm-driver-report-item__meta">
        <small>${escapeHtml(item.driverName)}</small>
        <small>${escapeHtml(item.vehicleName)}</small>
        <small>${escapeHtml(item.damagePhotoStatusLabel)}</small>
      </span>
      <span class="nm-driver-report-item__footer">
        <small>${escapeHtml(item.licensePlate)}</small>
        <small>${escapeHtml(item.partVerificationLabel)}</small>
      </span>
    </button>
  `;
}

function renderList(viewModel) {
  const body = (() => {
    if (viewModel.loading && !viewModel.items.length) {
      return renderNeumorphState({
        type: "loading",
        title: "Nacitam hlaseni",
        description: "Cekam na odpoved puvodniho /api/driver-reports."
      });
    }

    if (viewModel.error && !viewModel.items.length) {
      return renderNeumorphState({
        type: "error",
        title: "Hlaseni se nepodarilo nacist",
        description: viewModel.error
      });
    }

    if (!viewModel.items.length) {
      return renderNeumorphState({
        type: "empty",
        title: "Zadne hlaseni zatim neni ulozene",
        description: "Static-only preview nevytvari zadna ukazkova provozni data. Ziva data se nactou v chranene aplikaci."
      });
    }

    return `<div class="nm-driver-report-list">${viewModel.items.map(renderListItem).join("")}</div>`;
  })();

  return `
    <section class="nm-panel nm-driver-report-list-panel" aria-labelledby="nm-driver-report-list-title">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">Seznam</p>
          <h2 id="nm-driver-report-list-title">Seznam hlaseni</h2>
          <p>Stejny vyber a hledani jako v puvodnim modulu. Klik na polozku nacita detail pres puvodni handler.</p>
        </div>
        <span class="nm-chip">${escapeHtml(viewModel.items.length)} polozek</span>
      </div>
      ${body}
    </section>
  `;
}

function field(label, value) {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </article>
  `;
}

function copyField(label, value) {
  return `
    <label class="nm-driver-report-copy-field">
      <span>${escapeHtml(label)}</span>
      <input class="nm-input" value="${escapeHtml(value || "")}" readonly aria-label="${escapeHtml(label)}">
    </label>
  `;
}

function renderNotifications(item) {
  return `
    <div class="nm-driver-report-notifications" aria-label="Stavy notifikaci">
      ${item.notifications.map((notification) => `
        <span class="nm-chip nm-chip--${escapeHtml(notification.tone)}" ${notification.error ? `title="${escapeHtml(notification.error)}"` : ""}>
          ${escapeHtml(notification.label)}: ${escapeHtml(notification.text)}
        </span>
      `).join("")}
    </div>
  `;
}

function renderPrimaryActions(viewModel, item) {
  if (!viewModel.canManage || !item) {
    return "";
  }

  const actions = viewModel.selectedActions;
  return `
    <div class="nm-driver-report-actions" aria-label="Akce hlaseni">
      <button class="nm-button nm-button--secondary" type="button" data-driver-report-action="handoff" data-request-id="${escapeHtml(item.id)}" ${actions.canHandoff ? "" : "disabled"}>
        Predat Patrikovi
      </button>
      <button class="nm-button nm-button--secondary" type="button" data-driver-report-action="arrived" data-request-id="${escapeHtml(item.id)}" ${actions.canArrived ? "" : "disabled"}>
        Dil dorazil
      </button>
      <button class="nm-button nm-button--secondary" type="button" data-driver-report-action="complete" data-request-id="${escapeHtml(item.id)}" ${actions.canComplete ? "" : "disabled"}>
        Vyrizeno
      </button>
      <button class="nm-button nm-button--ghost" type="button" data-driver-report-action="cancel" data-request-id="${escapeHtml(item.id)}" ${actions.canCancel ? "" : "disabled"}>
        Zrusit
      </button>
    </div>
  `;
}

function renderHistory(item) {
  if (!item.events.length) {
    return `<p class="nm-driver-report-empty">Historie se zobrazi po prvni ulozene akci.</p>`;
  }

  return `
    <ol class="nm-driver-report-history">
      ${item.events.map((event) => `
        <li>
          <span>${escapeHtml(event.createdAt)}</span>
          <strong>${escapeHtml(event.action)}</strong>
          <small>${escapeHtml(event.actor)}${event.notificationStatus ? ` / ${escapeHtml(event.notificationStatus)}` : ""}</small>
        </li>
      `).join("")}
    </ol>
  `;
}

function renderMercedesSection(viewModel, item) {
  if (!item?.isMercedes) {
    return "";
  }

  return `
    <section class="nm-card nm-driver-report-part-block" aria-label="Nahradni dil Mercedes">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">Mercedes</p>
          <h3>Nahradni dil Mercedes</h3>
          <p>${escapeHtml(item.partVerificationLabel)}</p>
        </div>
        ${viewModel.canManage ? `
          <button class="nm-button nm-button--secondary" type="button" data-driver-report-action="verify-mercedes" data-request-id="${escapeHtml(item.id)}" ${viewModel.actionLoading ? "disabled" : ""}>
            Overit dil Mercedes
          </button>
        ` : ""}
      </div>
      <div class="nm-driver-report-detail-grid">
        ${field("OE cislo", item.oePartNumber)}
        ${field("Nazev dilu", item.partName || item.verifiedPart)}
        ${field("Zdroj overeni", item.partVerificationSource)}
        ${field("Stav provideru", item.partsProviderStatus)}
        ${field("AI Boost cena", item.priceBoostStatus)}
        ${field("Dotaz pro katalog", item.partLookupQuery)}
      </div>
      ${item.partsProviderMessage ? `<p class="nm-driver-report-note">${escapeHtml(item.partsProviderMessage)}</p>` : ""}
      ${item.priceBoostNote ? `<p class="nm-driver-report-note">${escapeHtml(item.priceBoostNote)}</p>` : ""}
      <div class="nm-driver-report-copy-grid" aria-label="Udaje pro rucni overeni">
        ${copyField("VIN", item.raw.vin)}
        ${copyField("SPZ", item.raw.licensePlate)}
        ${copyField("Zavada", item.raw.defectDescription)}
        ${copyField("Pravdepodobny dil", item.raw.probablePart)}
        ${copyField("OE cislo", item.raw.oePartNumber || item.raw.partOrderNumber)}
      </div>
      <div class="nm-driver-report-external-links">
        <a class="nm-button nm-button--secondary" href="${escapeHtml(item.mercedesManualPortalUrl || "https://webpartstruck-cloud.mercedes-benz-trucks.com/webparts/")}" target="_blank" rel="noopener noreferrer">WebParts</a>
        <a class="nm-button nm-button--secondary" href="${escapeHtml(item.mercedesMyPartsHubUrl || "https://mypartshub.daimlertruck.com")}" target="_blank" rel="noopener noreferrer">MyPartsHub</a>
      </div>
    </section>
  `;
}

function renderPartslink24Section(viewModel, item) {
  if (!item) {
    return "";
  }

  const allowed = viewModel.canSearchPartslink24 && item.partslink24.allowed && item.partslink24.canSearchPartslink24;

  return `
    <section class="nm-card nm-driver-report-part-block" aria-label="Nahradni dily podle VIN">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">partslink24</p>
          <h3>Nahradni dily podle VIN</h3>
          <p>Read-only pilot pro osobni vozidla. Nic se neobjednava automaticky.</p>
        </div>
        ${allowed ? `
          <button class="nm-button nm-button--secondary" type="button" data-driver-report-partslink24-search data-request-id="${escapeHtml(item.id)}" ${viewModel.actionLoading ? "disabled" : ""}>
            ${viewModel.actionLoading === `${item.id}:partslink24-vin` ? "Pripravuji..." : "Vyhledat ND podle VIN"}
          </button>
        ` : ""}
      </div>
      <div class="nm-driver-report-detail-grid">
        ${field("Vozidlo", item.vehicleName || item.licensePlate)}
        ${field("VIN", item.partslink24.vinMasked || (item.raw.vin ? "ulozene ve Vozovem parku" : "neni dostupne"))}
        ${field("Rozsah pilotu", item.partslink24.vehicleKind === "osobni" ? "osobni vozidlo" : "mimo pilot / neovereno")}
        ${field("Stav posledniho hledani", item.partslink24.status)}
      </div>
      <p class="nm-driver-report-note">${escapeHtml(item.partslink24.message)}</p>
      ${item.partslink24.workflowUrl ? `
        <div class="nm-driver-report-external-links">
          <a class="nm-button nm-button--secondary" href="${escapeHtml(item.partslink24.workflowUrl)}" target="_blank" rel="noopener noreferrer">GitHub Actions runner</a>
        </div>
      ` : ""}
    </section>
  `;
}

function renderDetail(viewModel) {
  const item = viewModel.selected;

  if (!item) {
    return `
      <section class="nm-panel nm-driver-report-detail" aria-labelledby="nm-driver-report-detail-title">
        <div class="nm-section-head">
          <div>
            <p class="nm-system-eyebrow">Detail</p>
            <h2 id="nm-driver-report-detail-title">Detail hlaseni</h2>
          </div>
        </div>
        ${renderNeumorphState({
          type: viewModel.loading ? "loading" : "empty",
          title: viewModel.loading ? "Cekam na hlaseni" : "Detail ceka na vyber",
          description: viewModel.loading ? "Seznam se nacita ze Smart odpady API." : "Vyberte hlaseni ze seznamu. Static-only preview nevytvari provozni data."
        })}
      </section>
    `;
  }

  return `
    <section class="nm-panel nm-driver-report-detail" aria-labelledby="nm-driver-report-detail-title">
      <div class="nm-driver-report-detail__hero">
        ${reportIcon(item)}
        <div>
          <p class="nm-system-eyebrow">${escapeHtml(item.reportId)}</p>
          <h2 id="nm-driver-report-detail-title">${escapeHtml(item.licensePlate)} / ${escapeHtml(item.partTitle)}</h2>
          <div class="nm-cluster">
            ${renderStatusChip(item)}
            <span class="nm-chip">${escapeHtml(item.driverName)}</span>
            <span class="nm-chip">${escapeHtml(item.damagePhotoStatusLabel)}</span>
          </div>
        </div>
      </div>

      <div class="nm-driver-report-detail-grid">
        ${field("Datum hlaseni", item.reportedAt)}
        ${field("Ridic", item.driverName)}
        ${field("Telefon ridice", item.driverPhone)}
        ${field("Vozidlo", item.vehicleName)}
        ${field("SPZ", item.licensePlate)}
        ${field("VIN", item.vin)}
        ${field("Znacka", item.vehicleBrandLabel)}
        ${field("Typ hlaseni", item.defectType)}
        ${field("Fotka / podklad", item.damagePhotoStatusLabel)}
      </div>

      <section class="nm-card nm-driver-report-part-block" aria-label="Nahradni dil">
        <div class="nm-section-head">
          <div>
            <p class="nm-system-eyebrow">Nahradni dil</p>
            <h3>${escapeHtml(item.partTitle)}</h3>
            <p>${escapeHtml(item.partVerificationLabel)}</p>
          </div>
          <span class="nm-chip nm-chip--${escapeHtml(item.statusTone)}">${escapeHtml(item.licensePlateValidationStatus)}</span>
        </div>
        <div class="nm-driver-report-detail-grid">
          ${field("Pravdepodobny dil", item.probablePart)}
          ${field("Strana", item.probablePartSideLabel)}
          ${field("Overeny dil", item.verifiedPart)}
          ${field("Objednaci cislo", item.partOrderNumber)}
          ${field("OE cislo", item.oePartNumber)}
          ${field("Nazev dilu", item.partName)}
          ${field("Zdroj overeni", item.partVerificationSource)}
          ${field("Komu predano", item.assignedToName)}
          ${field("Predano Patrikovi", item.handedOffToPatrikAt)}
          ${field("SMS Kamilovi", item.kamilSmsSentAt)}
          ${field("Objednano", item.orderedAt)}
          ${field("Dil dorazil", item.deliveredAt)}
          ${field("Termin pristaveni", item.serviceDate !== "-" && item.serviceTime !== "-" ? `${item.serviceDate} ${item.serviceTime}` : "-")}
        </div>
        <p class="nm-driver-report-description">${escapeHtml(item.defectDescription)}</p>
        ${item.note ? `<p class="nm-driver-report-note">${escapeHtml(item.note)}</p>` : ""}
      </section>

      ${renderMercedesSection(viewModel, item)}
      ${renderPartslink24Section(viewModel, item)}
      ${renderNotifications(item)}
      ${renderPrimaryActions(viewModel, item)}
      ${renderDriverReportManualPartForm(viewModel, item)}
      ${renderDriverReportOrderForm(viewModel, item)}
      ${renderDriverReportServiceForm(viewModel, item)}

      <section class="nm-card nm-driver-report-history-block" aria-label="Historie akci">
        <h3>Historie akci</h3>
        ${renderHistory(item)}
      </section>
    </section>
  `;
}

function renderCreatePanel(viewModel) {
  return `
    <section class="nm-panel nm-driver-report-create" id="nm-driver-report-new" aria-labelledby="nm-driver-report-new-title">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">Novy pozadavek</p>
          <h2 id="nm-driver-report-new-title">Nove hlaseni</h2>
          <p>Stejna pole, validace SPZ a POST /api/driver-reports jako v puvodnim modulu.</p>
        </div>
        <span class="nm-chip nm-chip--${viewModel.canCreate ? "success" : "warning"}">${viewModel.canCreate ? "create povoleno" : "read-only"}</span>
      </div>
      ${renderDriverReportCreateForm(viewModel)}
    </section>
  `;
}

function renderDashboard(viewModel) {
  return `
    <section class="nm-driver-report-dashboard" aria-label="Souhrn hlaseni ridicu">
      <div class="nm-grid nm-driver-report-metrics">
        ${viewModel.metrics.map(renderMetric).join("")}
      </div>
      <div class="nm-grid nm-driver-report-workspace">
        ${renderCreatePanel(viewModel)}
        ${renderList(viewModel)}
        ${renderDetail(viewModel)}
      </div>
    </section>
  `;
}

export function renderNeumorphDriverReports({
  user = null,
  routeHref = (route) => route,
  runtime = {},
  resolvedRoute = {}
} = {}) {
  const viewModel = createDriverReportsViewModel({ user, routeHref, runtime, resolvedRoute });

  if (!viewModel.canView) {
    return renderNeumorphState({
      type: "warning",
      title: "Bez pristupu k Hlaseni ridicu",
      description: viewModel.error || "Aktualni role nema opravneni driver-reports:view."
    });
  }

  return `
    <section class="nm-driver-report-page" aria-labelledby="nm-driver-report-title">
      ${renderNeumorphModuleHeader({
        moduleItem: driverReportsModule,
        eyebrow: "Kaiser Smart / Hlavni prace",
        title: "Hlaseni ridicu",
        description: "Funkcni neumorph varianta nad realnym runtime Hlaseni ridicu: stejny seznam, detail, SPZ validace, akce a permissions.",
        status: viewModel.apiStatus === "ready" ? "realny runtime" : "ceka na API",
        statusTone: viewModel.error ? "danger" : viewModel.apiStatus === "ready" ? "success" : "warning",
        actions: [
          { label: "Puvodni modul", href: routeHref("/hlaseni-ridicu"), variant: "secondary" },
          { label: "Neumorph dashboard", href: routeHref("/neumorph/hlaseni-ridicu/dashboard"), variant: "subtle" }
        ],
        meta: [
          viewModel.canManage ? "manage/edit" : viewModel.canCreate ? "create" : "read-only",
          viewModel.authRequired ? "static preview" : "chranena app",
          `${viewModel.items.length} hlaseni`
        ]
      })}
      ${renderNeumorphStatusStrip([
        { label: "API", value: viewModel.apiStatus, detail: "/api/driver-reports" },
        { label: "Opravneni", value: viewModel.canManage ? "manage/edit" : viewModel.canCreate ? "create" : "read-only", detail: "driver-reports permissions" },
        { label: "Vyber", value: viewModel.selected?.reportId || "bez detailu", detail: viewModel.selected?.statusLabel || "ceka" },
        { label: "Workflow", value: "SPZ -> dil -> servis", detail: "puvodni runtime" }
      ])}
      ${renderNotices(viewModel)}
      ${renderToolbar(viewModel)}
      ${renderDashboard(viewModel)}
    </section>
  `;
}
