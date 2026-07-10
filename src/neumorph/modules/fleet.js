import { modules } from "../../data/modules.js";
import { FLEET_API_ENDPOINTS } from "../../data/fleet.js";
import { createFleetViewModel } from "../adapters/fleetAdapter.js";
import {
  escapeHtml,
  renderInlineIcon,
  renderNeumorphModuleHeader,
  renderNeumorphState,
  renderNeumorphStatusStrip
} from "../moduleLayout.js";

const fleetModule = modules.find((moduleItem) => moduleItem.id === "fleet");

function optionList(options = [], selectedValue = "") {
  return options.map((option) => {
    const value = Array.isArray(option) ? option[0] : option.value ?? option;
    const label = Array.isArray(option) ? option[1] : option.label ?? option;
    return `
      <option value="${escapeHtml(value)}" ${String(value) === String(selectedValue) ? "selected" : ""}>
        ${escapeHtml(label)}
      </option>
    `;
  }).join("");
}

function renderNotice(notice) {
  return `<p class="nm-alert nm-alert--${escapeHtml(notice.tone)}">${escapeHtml(notice.text)}</p>`;
}

function renderNotices(viewModel) {
  if (!viewModel.notices.length) {
    return "";
  }

  return `<div class="nm-fleet-notices">${viewModel.notices.map(renderNotice).join("")}</div>`;
}

function renderStatusChip(vehicle) {
  return `<span class="nm-chip nm-chip--${escapeHtml(vehicle.statusTone)}">${escapeHtml(vehicle.statusLabel)}</span>`;
}

function renderMetric(metric) {
  return `
    <article class="nm-card nm-fleet-metric">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <small>${escapeHtml(metric.detail)}</small>
    </article>
  `;
}

function renderTabs(viewModel) {
  return `
    <nav class="nm-fleet-tabs" role="tablist" aria-label="Sekce Vozoveho parku">
      ${viewModel.sections.map((section) => `
        <a
          class="nm-fleet-tab ${section.id === viewModel.activeTab ? "nm-fleet-tab--active" : ""}"
          href="#fleet-${escapeHtml(section.id)}"
          role="tab"
          aria-selected="${section.id === viewModel.activeTab ? "true" : "false"}"
          data-fleet-tab="${escapeHtml(section.id)}"
        >
          ${escapeHtml(section.label)}
        </a>
      `).join("")}
    </nav>
  `;
}

function renderToolbar(viewModel) {
  return `
    <form class="nm-toolbar nm-fleet-toolbar" aria-label="Filtry vozidel" data-fleet-filters>
      <label class="nm-search-field nm-fleet-toolbar__search">
        <span class="nm-sr-only">Hledat vozidlo</span>
        ${renderInlineIcon("search")}
        <input
          class="nm-input"
          type="search"
          name="search"
          value="${escapeHtml(viewModel.filters.search)}"
          placeholder="Nazev, SPZ, VIN, ridic"
          data-fleet-filter
        >
      </label>
      <div class="nm-toolbar__filters">
        <label class="nm-field nm-field--compact">
          <span>Stav</span>
          <select class="nm-select" name="status" data-fleet-filter>
            <option value="all" ${viewModel.filters.status === "all" ? "selected" : ""}>Vsechny stavy</option>
            ${optionList(viewModel.statusOptions, viewModel.filters.status)}
          </select>
        </label>
        <label class="nm-field nm-field--compact">
          <span>Typ</span>
          <select class="nm-select" name="type" data-fleet-filter>
            <option value="all" ${viewModel.filters.type === "all" ? "selected" : ""}>Vsechny typy</option>
            ${optionList(viewModel.typeOptions, viewModel.filters.type)}
          </select>
        </label>
        <label class="nm-field nm-field--compact">
          <span>Ridic</span>
          <select class="nm-select" name="driver" data-fleet-filter>
            <option value="all" ${viewModel.filters.driver === "all" ? "selected" : ""}>Vsichni ridici</option>
            ${optionList(viewModel.driverOptions, viewModel.filters.driver)}
          </select>
        </label>
        <label class="nm-field nm-field--compact">
          <span>Terminy</span>
          <select class="nm-select" name="terms" data-fleet-filter>
            ${optionList([
              ["all", "Vsechny terminy"],
              ["due_30", "Do 30 dnu"]
            ], viewModel.filters.terms)}
          </select>
        </label>
        <label class="nm-field nm-field--compact">
          <span>Zavady</span>
          <select class="nm-select" name="defects" data-fleet-filter>
            ${optionList([
              ["all", "Vsechny zavady"],
              ["open", "Otevrene"]
            ], viewModel.filters.defects)}
          </select>
        </label>
      </div>
      <div class="nm-toolbar__actions">
        <span class="nm-chip nm-chip--info">${escapeHtml(viewModel.filteredVehicles.length)} / ${escapeHtml(viewModel.vehicles.length)} vozidel</span>
        <button class="nm-button nm-button--secondary" type="button" data-fleet-reset-filters ${viewModel.filtersActive ? "" : "disabled"}>
          Reset
        </button>
        <button class="nm-button nm-button--secondary" type="button" data-fleet-action="refresh" ${viewModel.loading ? "disabled" : ""}>
          ${viewModel.loading ? "Nacitam..." : "Obnovit"}
        </button>
      </div>
    </form>
  `;
}

function renderVehicleIcon(vehicle) {
  const initials = vehicle.licensePlate === "SPZ neuvedena"
    ? vehicle.name.slice(0, 2)
    : vehicle.licensePlate.replace(/\s+/g, "").slice(0, 2);
  return `<span class="nm-fleet-vehicle-icon" aria-hidden="true">${escapeHtml(initials || "VP")}</span>`;
}

function renderVehicleCard(vehicle) {
  return `
    <article class="nm-card nm-fleet-card ${vehicle.selected ? "nm-fleet-card--selected" : ""}">
      <div class="nm-fleet-card__top">
        ${renderVehicleIcon(vehicle)}
        <div>
          <h3>${escapeHtml(vehicle.name)}</h3>
          <p>${escapeHtml(vehicle.licensePlate)} / ${escapeHtml(vehicle.type)}</p>
        </div>
        ${renderStatusChip(vehicle)}
      </div>
      <dl class="nm-fleet-card__facts">
        <div><dt>Ridic</dt><dd>${escapeHtml(vehicle.driver)}</dd></div>
        <div><dt>Model</dt><dd>${escapeHtml(vehicle.model)}</dd></div>
        <div><dt>STK</dt><dd>${escapeHtml(vehicle.stkValidTo)}</dd></div>
        <div><dt>Zavady</dt><dd>${escapeHtml(vehicle.openDefects)}</dd></div>
      </dl>
      <div class="nm-fleet-card__actions">
        <button class="nm-button nm-button--secondary nm-button--sm" type="button" data-fleet-action="detail" data-fleet-vehicle-id="${escapeHtml(vehicle.id)}">
          Detail
        </button>
      </div>
    </article>
  `;
}

function renderVehicleRows(viewModel) {
  if (viewModel.loading) {
    return `
      <tr>
        <td colspan="8">${renderNeumorphState({
          type: "loading",
          title: "Nacitam vozidla",
          description: "Cekam na odpoved puvodniho /api/vehicles."
        })}</td>
      </tr>
    `;
  }

  if (viewModel.error) {
    return `
      <tr>
        <td colspan="8">${renderNeumorphState({
          type: "error",
          title: "Vozidla se nepodarilo nacist",
          description: viewModel.error
        })}</td>
      </tr>
    `;
  }

  if (!viewModel.filteredVehicles.length) {
    return `
      <tr>
        <td colspan="8">${renderNeumorphState({
          type: "empty",
          title: viewModel.vehicles.length ? "Zadna vozidla neodpovidaji filtru" : "Bez vozidel",
          description: viewModel.vehicles.length ? "Upravte hledani nebo resetujte filtry." : "Produkci data nejsou ve frontendu napevno. Seznam se nacita pouze z API."
        })}</td>
      </tr>
    `;
  }

  return viewModel.filteredVehicles.map((vehicle) => `
    <tr class="${vehicle.selected ? "nm-table-row--active" : ""}">
      <td>
        <strong>${escapeHtml(vehicle.name)}</strong>
        <span>${escapeHtml(vehicle.source)}</span>
      </td>
      <td>${escapeHtml(vehicle.licensePlate)}</td>
      <td>${escapeHtml(vehicle.type)}</td>
      <td>${escapeHtml(vehicle.model)}</td>
      <td>${escapeHtml(vehicle.driver)}</td>
      <td>${renderStatusChip(vehicle)}</td>
      <td>${escapeHtml(vehicle.stkValidTo)}</td>
      <td>
        <button class="nm-button nm-button--secondary nm-button--sm" type="button" data-fleet-action="detail" data-fleet-vehicle-id="${escapeHtml(vehicle.id)}">
          Detail
        </button>
      </td>
    </tr>
  `).join("");
}

function renderVehicleList(viewModel, compact = false) {
  return `
    <section class="nm-panel nm-fleet-list" aria-labelledby="nm-fleet-list-title">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">Seznam vozidel</p>
          <h2 id="nm-fleet-list-title">Vozidla z realneho zdroje</h2>
          <p>${escapeHtml(viewModel.statusText || viewModel.sourceDescription)}</p>
        </div>
        <span class="nm-chip nm-chip--${viewModel.apiStatus === "ready" ? "success" : "warning"}">${escapeHtml(viewModel.sourceLabel)}</span>
      </div>
      <div class="nm-table-shell nm-fleet-table-shell ${compact ? "nm-fleet-table-shell--compact" : ""}">
        <div class="nm-table-shell__head">
          <strong>${escapeHtml(viewModel.filteredVehicles.length)} vozidel</strong>
          <span>${escapeHtml(viewModel.filtersActive ? "filtr aktivni" : "bez filtru")}</span>
        </div>
        <div class="nm-table-wrap">
          <table class="nm-table nm-fleet-table">
            <thead>
              <tr>
                <th>Nazev</th>
                <th>SPZ</th>
                <th>Typ</th>
                <th>Model</th>
                <th>Ridic</th>
                <th>Stav</th>
                <th>STK</th>
                <th>Akce</th>
              </tr>
            </thead>
            <tbody>${renderVehicleRows(viewModel)}</tbody>
          </table>
        </div>
      </div>
      ${viewModel.filteredVehicles.length ? `
        <div class="nm-fleet-card-list" aria-label="Mobilni seznam vozidel">
          ${viewModel.filteredVehicles.map(renderVehicleCard).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderDriverOptions(viewModel, selectedDriverId = "") {
  if (!viewModel.drivers.length) {
    return '<option value="">Nejdriv doplnte zamestnance</option>';
  }

  return [
    `<option value="" ${!selectedDriverId ? "selected" : ""}>Bez prirazeneho ridice</option>`,
    ...viewModel.drivers.map((driver) => `
      <option value="${escapeHtml(driver.id)}" ${driver.id === selectedDriverId || driver.userId === selectedDriverId ? "selected" : ""}>
        ${escapeHtml(driver.label)}
      </option>
    `)
  ].join("");
}

function renderDriverAssignment(viewModel, vehicle) {
  const saving = viewModel.savingAssignmentVehicleId === vehicle.id;
  const disabled = viewModel.canEdit ? "" : "disabled";

  return `
    <article class="nm-fleet-driver-card">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">Ridic</p>
          <h3>Prirazeni ridice</h3>
          <p>Stejny PATCH /api/vehicles/:id workflow jako v puvodnim modulu.</p>
        </div>
        <span class="nm-chip nm-chip--${vehicle.driver === "Bez ridice" ? "warning" : "success"}">${escapeHtml(vehicle.driver === "Bez ridice" ? "ceka" : "prirazeno")}</span>
      </div>
      <form class="nm-form-grid nm-fleet-driver-form" data-fleet-driver-assignment-form data-vehicle-id="${escapeHtml(vehicle.id)}">
        <label class="nm-field">
          <span>Ridic ze zamestnancu</span>
          <select class="nm-select" name="assignedDriverId" ${disabled}>
            ${renderDriverOptions(viewModel, vehicle.assignedDriverId)}
          </select>
        </label>
        <label class="nm-field nm-field--wide">
          <span>Poznamka</span>
          <input class="nm-input" name="note" value="${escapeHtml(vehicle.driverAssignmentNote)}" placeholder="Napr. strida vozidlo v tydnu" ${disabled}>
        </label>
        ${viewModel.canEdit ? `
          <button class="nm-button nm-button--primary" type="submit" ${saving ? "disabled" : ""}>
            ${saving ? "Ukladam..." : "Ulozit ridice"}
          </button>
        ` : `
          <p class="nm-alert nm-alert--warning">Ridice muze upravit jen role s opravnenim fleet:edit.</p>
        `}
      </form>
      ${vehicle.driverAssignmentUpdatedAt !== "-" ? `
        <p class="nm-fleet-driver-card__meta">
          Naposledy upraveno: ${escapeHtml(vehicle.driverAssignmentUpdatedAt)}
          ${vehicle.driverAssignmentUpdatedByName ? ` / ${escapeHtml(vehicle.driverAssignmentUpdatedByName)}` : ""}
        </p>
      ` : ""}
    </article>
  `;
}

function detailField(label, value) {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </article>
  `;
}

function renderVehicleDetail(viewModel) {
  const vehicle = viewModel.selectedVehicle;

  if (!vehicle) {
    return `
      <section class="nm-panel nm-fleet-detail" aria-labelledby="nm-fleet-detail-title">
        <div class="nm-section-head">
          <div>
            <p class="nm-system-eyebrow">Detail</p>
            <h2 id="nm-fleet-detail-title">Detail vozidla</h2>
          </div>
        </div>
        ${renderNeumorphState({
          type: viewModel.loading ? "loading" : "empty",
          title: viewModel.loading ? "Cekam na vozidla" : "Detail ceka na vyber",
          description: viewModel.loading ? "Seznam se nacita ze Smart odpady API." : "Vyberte vozidlo ze seznamu. Falesna produkcni data se nevytvareji."
        })}
      </section>
    `;
  }

  return `
    <section class="nm-panel nm-fleet-detail" aria-labelledby="nm-fleet-detail-title">
      <div class="nm-fleet-detail__hero">
        ${renderVehicleIcon(vehicle)}
        <div>
          <p class="nm-system-eyebrow">Detail vozidla</p>
          <h2 id="nm-fleet-detail-title">${escapeHtml(vehicle.name)}</h2>
          <div class="nm-cluster">
            ${renderStatusChip(vehicle)}
            <span class="nm-chip">${escapeHtml(vehicle.licensePlate)}</span>
            <span class="nm-chip">${escapeHtml(vehicle.source)}</span>
          </div>
        </div>
      </div>
      <div class="nm-fleet-detail__grid">
        ${detailField("SPZ", vehicle.licensePlate)}
        ${detailField("Typ", vehicle.type)}
        ${detailField("Model", vehicle.model)}
        ${detailField("VIN", vehicle.vin)}
        ${detailField("Najeto", vehicle.mileage)}
        ${detailField("STK", vehicle.stkValidTo)}
        ${detailField("Revize", vehicle.revisionValidTo)}
        ${detailField("Pojisteni", vehicle.insuranceValidTo)}
        ${detailField("Otevrene zavady", vehicle.openDefects)}
        ${detailField("Telemetrie", vehicle.telemetrySource)}
        ${detailField("Posledni zmena", vehicle.updatedAt)}
      </div>
      ${renderDriverAssignment(viewModel, vehicle)}
    </section>
  `;
}

function renderDashboard(viewModel) {
  return `
    <section class="nm-fleet-dashboard" aria-labelledby="nm-fleet-dashboard-title">
      <div class="nm-grid nm-fleet-metrics">
        ${viewModel.metrics.map(renderMetric).join("")}
      </div>
      <div class="nm-grid nm-fleet-workspace">
        ${renderVehicleList(viewModel, true)}
        ${renderVehicleDetail(viewModel)}
      </div>
    </section>
  `;
}

function renderTerms(viewModel) {
  return `
    <section class="nm-panel nm-fleet-terms" aria-labelledby="nm-fleet-terms-title">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">Terminy</p>
          <h2 id="nm-fleet-terms-title">STK, revize a pojisteni</h2>
          <p>Hodnoty vychazeji ze stejneho vehicle payloadu jako puvodni detail.</p>
        </div>
        <span class="nm-chip">${escapeHtml(viewModel.selectedVehicle?.name || "bez vyberu")}</span>
      </div>
      <div class="nm-grid nm-fleet-term-grid">
        ${viewModel.terms.map((term) => `
          <article class="nm-card nm-fleet-term ${term.due ? "nm-fleet-term--due" : ""}">
            <span>${escapeHtml(term.label)}</span>
            <strong>${escapeHtml(term.value)}</strong>
            <small>${escapeHtml(term.due ? "do 30 dnu" : `${term.dueCount} vozidel do 30 dnu`)}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderWaitingModulePart({ id, title, description, fields, endpoint, action }) {
  return `
    <section class="nm-panel nm-fleet-waiting" aria-labelledby="nm-fleet-${escapeHtml(id)}-title">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">Ceka na API</p>
          <h2 id="nm-fleet-${escapeHtml(id)}-title">${escapeHtml(title)}</h2>
          <p>${escapeHtml(description)}</p>
        </div>
        <span class="nm-chip nm-chip--warning">${escapeHtml(endpoint)}</span>
      </div>
      <div class="nm-fleet-field-chips">
        ${fields.map((field) => `<span>${escapeHtml(field)}</span>`).join("")}
      </div>
      <div class="nm-fleet-actions">
        ${action ? `
          <button class="nm-button nm-button--secondary" type="button" data-fleet-action="${escapeHtml(action)}">
            Otevrit sekci
          </button>
        ` : ""}
      </div>
    </section>
  `;
}

function renderSettings(viewModel) {
  return `
    <section class="nm-panel nm-fleet-settings" aria-labelledby="nm-fleet-settings-title">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">Nastaveni</p>
          <h2 id="nm-fleet-settings-title">Ciselniky a endpointy</h2>
          <p>Prehled zachovava puvodni hodnoty a neprepina zadne API ani permissions.</p>
        </div>
        <span class="nm-chip nm-chip--${viewModel.canEdit ? "success" : "warning"}">${viewModel.canEdit ? "edit" : "read-only"}</span>
      </div>
      <div class="nm-grid nm-fleet-settings-grid">
        <article class="nm-card">
          <h3>Stavy</h3>
          <div class="nm-fleet-field-chips">
            ${viewModel.statusOptions.map((status) => `<span>${escapeHtml(status.label)}</span>`).join("")}
          </div>
        </article>
        <article class="nm-card">
          <h3>Typy vozidel</h3>
          <div class="nm-fleet-field-chips">
            ${viewModel.typeOptions.map((type) => `<span>${escapeHtml(type)}</span>`).join("")}
          </div>
        </article>
        <article class="nm-card">
          <h3>API</h3>
          <div class="nm-fleet-field-chips">
            ${FLEET_API_ENDPOINTS.map((endpoint) => `<span>${escapeHtml(endpoint)}</span>`).join("")}
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderActiveContent(viewModel) {
  if (viewModel.activeTab === "vehicles") {
    return `<div class="nm-grid nm-fleet-workspace">${renderVehicleList(viewModel)}${renderVehicleDetail(viewModel)}</div>`;
  }

  if (viewModel.activeTab === "detail") {
    return `<div class="nm-grid nm-fleet-workspace">${renderVehicleDetail(viewModel)}${renderVehicleList(viewModel, true)}</div>`;
  }

  if (viewModel.activeTab === "terms") {
    return renderTerms(viewModel);
  }

  if (viewModel.activeTab === "defects") {
    return renderWaitingModulePart({
      id: "defects",
      title: "Zavady",
      description: "Evidence zavad zustava napojena jen na skutecne cloud API. Neumorph varianta nevytvari zadne lokalni zaznamy.",
      fields: viewModel.fields.defects,
      endpoint: "GET /api/vehicles/:id/defects",
      action: "defect"
    });
  }

  if (viewModel.activeTab === "service") {
    return renderWaitingModulePart({
      id: "service",
      title: "Servisni historie",
      description: "Servisy, opravy a naklady se budou nacitat pres puvodni API vrstvu, ne z prohlizece.",
      fields: viewModel.fields.service,
      endpoint: "GET /api/vehicles/:id/service-records",
      action: "service"
    });
  }

  if (viewModel.activeTab === "documents") {
    return renderWaitingModulePart({
      id: "documents",
      title: "Dokumenty",
      description: "Dokumenty musi zustat v cloud/R2 workflow. Neumorph varianta nepridava lokalni uloziste.",
      fields: viewModel.fields.documents,
      endpoint: "GET /api/vehicles/:id/documents",
      action: "documents"
    });
  }

  if (viewModel.activeTab === "settings") {
    return renderSettings(viewModel);
  }

  return renderDashboard(viewModel);
}

export function renderNeumorphFleet({
  user = null,
  routeHref = (route) => route,
  runtime = {},
  resolvedRoute = {}
} = {}) {
  const viewModel = createFleetViewModel({ user, routeHref, runtime, resolvedRoute });

  if (!viewModel.canView) {
    return renderNeumorphState({
      type: "warning",
      title: "Bez pristupu k Vozovemu parku",
      description: viewModel.error || "Aktualni role nema opravneni fleet:view."
    });
  }

  return `
    <section class="nm-fleet-page" aria-labelledby="nm-fleet-title">
      ${renderNeumorphModuleHeader({
        moduleItem: fleetModule,
        eyebrow: "Kaiser Smart / Vozidla a provoz",
        title: "Vozovy park",
        description: "Funkcni neumorph varianta nad realnym runtime Vozoveho parku: stejna data, API, filtry, permissions a prirazeni ridice.",
        status: viewModel.apiStatus === "ready" ? "realny runtime" : "ceka na API",
        statusTone: viewModel.error ? "danger" : viewModel.apiStatus === "ready" ? "success" : "warning",
        actions: [
          { label: "Puvodni modul", href: routeHref("/vozovy-park"), variant: "secondary" },
          { label: "Neumorph dashboard", href: routeHref("/neumorph/vozovy-park/dashboard"), variant: "subtle" }
        ],
        meta: [
          viewModel.canEdit ? "edit" : "read-only",
          viewModel.sourceLabel,
          viewModel.authRequired ? "static preview" : "chranena app"
        ]
      })}
      ${renderNeumorphStatusStrip([
        { label: "API", value: viewModel.apiStatus, detail: "/api/vehicles" },
        { label: "Zdroj", value: viewModel.sourceLabel, detail: viewModel.sourceDescription },
        { label: "Ridici", value: `${viewModel.summary.assignedDrivers || 0} prirazeno`, detail: "D1 assignment vrstva" },
        { label: "Aktualni sekce", value: viewModel.activeTabLabel, detail: viewModel.originalPath }
      ])}
      ${renderNotices(viewModel)}
      ${renderToolbar(viewModel)}
      ${renderTabs(viewModel)}
      ${renderActiveContent(viewModel)}
    </section>
  `;
}
