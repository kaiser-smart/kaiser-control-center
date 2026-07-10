import { modules } from "../../data/modules.js";
import { createVehicleTrackingViewModel } from "../adapters/vehicleTrackingAdapter.js";
import {
  escapeHtml,
  renderInlineIcon,
  renderNeumorphModuleHeader,
  renderNeumorphState,
  renderNeumorphStatusStrip
} from "../moduleLayout.js";

const vehicleTrackingModule = modules.find((moduleItem) => moduleItem.id === "vehicle-tracking");

function formatNumber(value) {
  return new Intl.NumberFormat("cs-CZ").format(Number(value || 0));
}

function statusChip(status) {
  return `<span class="nm-chip nm-chip--${escapeHtml(status?.tone || "neutral")}">${escapeHtml(status?.label || "Bez dat")}</span>`;
}

function renderNotices(viewModel) {
  if (!viewModel.notices?.length) {
    return "";
  }

  return `
    <div class="nm-vehicle-notices">
      ${viewModel.notices.map((notice) => `
        <p class="nm-alert nm-alert--${escapeHtml(notice.type)}">${escapeHtml(notice.text)}</p>
      `).join("")}
    </div>
  `;
}

function renderMetric(metric) {
  return `
    <article class="nm-card nm-vehicle-metric">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <small>${escapeHtml(metric.detail)}</small>
    </article>
  `;
}

function renderToolbar(viewModel) {
  return `
    <section class="nm-toolbar nm-vehicle-toolbar" aria-label="Nastroje sledovani vozidel">
      <div class="nm-vehicle-toolbar__source">
        <span class="nm-chip nm-chip--success">T-Cars read-only</span>
        <span class="nm-chip">${escapeHtml(viewModel.apiStatus)}</span>
        <span class="nm-chip">${escapeHtml(viewModel.hasGoogleMapsKey ? "Google mapa" : "Fallback mapa")}</span>
      </div>
      <div class="nm-segmented-control nm-vehicle-toolbar__anchors" role="group" aria-label="Skok na cast pohledu">
        <a class="nm-segment nm-segment--active" href="#nm-vehicle-map">Mapa</a>
        <a class="nm-segment" href="#nm-vehicle-list">Vozidla</a>
        <a class="nm-segment" href="#nm-vehicle-detail">Detail</a>
        <a class="nm-segment" href="#nm-vehicle-wim">WIM</a>
      </div>
      <div class="nm-toolbar__actions">
        <a class="nm-button nm-button--secondary" href="${escapeHtml(viewModel.routeHref("/sledovani-vozidel"))}" data-link>
          Puvodni modul
        </a>
      </div>
    </section>
  `;
}

function renderVehicleImage(vehicle) {
  return `
    <span class="nm-vehicle-icon" aria-hidden="true">
      <img src="${escapeHtml(vehicle.iconSrc)}" alt="" loading="lazy" decoding="async">
    </span>
  `;
}

function renderVehicleCard(vehicle) {
  const selected = vehicle.selected;
  return `
    <button
      class="nm-card nm-vehicle-card ${selected ? "nm-vehicle-card--selected" : ""}"
      type="button"
      data-tracking-tcars-select="${escapeHtml(vehicle.id)}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      ${renderVehicleImage(vehicle)}
      <span class="nm-vehicle-card__body">
        <span class="nm-vehicle-card__head">
          <strong>${escapeHtml(vehicle.name)}</strong>
          ${statusChip(vehicle.status)}
        </span>
        <span>${escapeHtml(vehicle.licensePlate)}</span>
        <small>${escapeHtml(vehicle.address)}</small>
        <span class="nm-vehicle-card__meta">
          <span>${escapeHtml(vehicle.speedText)}</span>
          <span>${escapeHtml(vehicle.lastGpsText)}</span>
        </span>
      </span>
    </button>
  `;
}

function renderVehicleList(viewModel) {
  return `
    <section class="nm-panel nm-vehicle-list-panel" id="nm-vehicle-list" aria-labelledby="nm-vehicle-list-title">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">T-Cars vozidla</p>
          <h2 id="nm-vehicle-list-title">Aktualni polohy</h2>
        </div>
        <span class="nm-chip nm-chip--info">${escapeHtml(formatNumber(viewModel.vehicles.length))} validnich</span>
      </div>
      ${viewModel.vehicles.length ? `
        <div class="nm-vehicle-list">
          ${viewModel.vehicles.map(renderVehicleCard).join("")}
        </div>
      ` : renderNeumorphState({
        type: viewModel.loading ? "loading" : "empty",
        title: viewModel.loading ? "Nacitam vozidla" : "Bez validnich poloh",
        description: viewModel.loading ? "Cekam na odpoved Smart odpady API." : "T-Cars zatim nevratil zadne vozidlo s validni GPS polohou."
      })}
    </section>
  `;
}

function renderStaticVehicleMarker(vehicle) {
  return `
    <button
      class="nm-vehicle-map-marker nm-vehicle-map-marker--${escapeHtml(vehicle.status.tone)} ${vehicle.selected ? "nm-vehicle-map-marker--selected" : ""}"
      type="button"
      style="--nm-map-x: ${vehicle.mapPosition.x.toFixed(2)}%; --nm-map-y: ${vehicle.mapPosition.y.toFixed(2)}%;"
      data-tracking-tcars-select="${escapeHtml(vehicle.id)}"
      aria-label="Vybrat vozidlo ${escapeHtml(vehicle.name)}"
      aria-pressed="${vehicle.selected ? "true" : "false"}"
    >
      ${renderVehicleImage(vehicle)}
      <span>${escapeHtml(vehicle.internalNumber || vehicle.licensePlate)}</span>
    </button>
  `;
}

function renderStaticWimMarker(site) {
  return `
    <button
      class="nm-vehicle-map-wim nm-vehicle-map-wim--${escapeHtml(site.tone)} ${site.selected ? "nm-vehicle-map-wim--selected" : ""}"
      type="button"
      style="--nm-map-x: ${site.mapPosition.x.toFixed(2)}%; --nm-map-y: ${site.mapPosition.y.toFixed(2)}%;"
      data-tracking-wim-select="${escapeHtml(site.id)}"
      aria-label="Vybrat WIM bod ${escapeHtml(site.title)}"
      aria-pressed="${site.selected ? "true" : "false"}"
    >
      <span>WIM</span>
      <small>${escapeHtml(site.road)}</small>
    </button>
  `;
}

function renderMap(viewModel) {
  const hasGoogle = viewModel.hasGoogleMapsKey;
  return `
    <section class="nm-panel nm-vehicle-map-panel" id="nm-vehicle-map" aria-labelledby="nm-vehicle-map-title">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">Mapa</p>
          <h2 id="nm-vehicle-map-title">Poloha vozidel</h2>
        </div>
        <span class="nm-chip nm-chip--${hasGoogle ? "success" : "warning"}">${escapeHtml(hasGoogle ? "Google Maps" : "projekce souradnic")}</span>
      </div>
      <div class="nm-vehicle-map-shell ${hasGoogle ? "nm-vehicle-map-shell--google" : "nm-vehicle-map-shell--static"}">
        ${hasGoogle ? `
          <div class="tracking-google-map tracking-tcars-google-map nm-vehicle-google-map" data-tracking-tcars-google-map aria-label="Google mapa T-Cars poloh"></div>
          ${viewModel.vehicles.length ? "" : `
            <div class="nm-vehicle-map-empty" role="status">
              <strong>Bez validnich markeru</strong>
              <span>Mapa je pripravena, ale API zatim neposlalo validni GPS polohy.</span>
            </div>
          `}
        ` : `
          <div class="nm-vehicle-map-road nm-vehicle-map-road--one" aria-hidden="true"></div>
          <div class="nm-vehicle-map-road nm-vehicle-map-road--two" aria-hidden="true"></div>
          <div class="nm-vehicle-map-road nm-vehicle-map-road--three" aria-hidden="true"></div>
          ${viewModel.map.vehicles.map(renderStaticVehicleMarker).join("")}
          ${viewModel.map.wimSites.map(renderStaticWimMarker).join("")}
          ${viewModel.map.vehicles.length || viewModel.map.wimSites.length ? "" : `
            <div class="nm-vehicle-map-empty" role="status">
              <strong>Bez souradnic</strong>
              <span>T-Cars ani WIM API zatim nedodalo mapove body.</span>
            </div>
          `}
        `}
      </div>
      <div class="nm-vehicle-map-legend" aria-label="Legenda mapy">
        <span><i class="nm-vehicle-map-dot nm-vehicle-map-dot--vehicle"></i>vozidlo</span>
        <span><i class="nm-vehicle-map-dot nm-vehicle-map-dot--wim"></i>WIM</span>
        <span><i class="nm-vehicle-map-dot nm-vehicle-map-dot--selected"></i>vybrano</span>
      </div>
    </section>
  `;
}

function detailField(label, value) {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "neuvedeno")}</strong>
    </article>
  `;
}

function renderVehicleDetail(viewModel) {
  const vehicle = viewModel.selectedVehicle;
  if (!vehicle) {
    return `
      <section class="nm-panel nm-vehicle-detail" id="nm-vehicle-detail" aria-labelledby="nm-vehicle-detail-title">
        <div class="nm-section-head">
          <div>
            <p class="nm-system-eyebrow">Detail</p>
            <h2 id="nm-vehicle-detail-title">Detail vozidla</h2>
          </div>
        </div>
        ${renderNeumorphState({
          type: "empty",
          title: "Detail ceka na vozidlo",
          description: "Vyberte vozidlo s validni T-Cars polohou."
        })}
      </section>
    `;
  }

  return `
    <section class="nm-panel nm-vehicle-detail" id="nm-vehicle-detail" aria-labelledby="nm-vehicle-detail-title">
      <div class="nm-vehicle-detail__hero">
        ${renderVehicleImage(vehicle)}
        <div>
          <p class="nm-system-eyebrow">Detail vozidla</p>
          <h2 id="nm-vehicle-detail-title">${escapeHtml(vehicle.name)}</h2>
          <div class="nm-cluster">
            ${statusChip(vehicle.status)}
            <span class="nm-chip">${escapeHtml(vehicle.licensePlate)}</span>
            <span class="nm-chip">${escapeHtml(vehicle.source)}</span>
          </div>
        </div>
      </div>
      <div class="nm-vehicle-detail__grid">
        ${detailField("Interni cislo", vehicle.internalNumber)}
        ${detailField("Ridic", vehicle.driverName)}
        ${detailField("Rychlost", vehicle.speedText)}
        ${detailField("Posledni GPS", vehicle.lastGpsText)}
        ${detailField("Adresa", vehicle.address)}
        ${detailField("Souradnice", vehicle.coordinates)}
        ${detailField("GPS jednotka", vehicle.gpsUnitId)}
        ${detailField("Stav GPS", vehicle.invalidReason || "Validni poloha")}
      </div>
    </section>
  `;
}

function renderInvalidVehicles(viewModel) {
  if (!viewModel.invalidVehicles.length) {
    return "";
  }

  return `
    <section class="nm-panel nm-vehicle-invalid" aria-labelledby="nm-vehicle-invalid-title">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">Bez validni GPS</p>
          <h2 id="nm-vehicle-invalid-title">Oddelena vozidla</h2>
        </div>
        <span class="nm-chip nm-chip--warning">${escapeHtml(formatNumber(viewModel.invalidVehicles.length))}</span>
      </div>
      <div class="nm-vehicle-mini-list">
        ${viewModel.invalidVehicles.slice(0, 8).map((vehicle) => `
          <article>
            ${renderVehicleImage(vehicle)}
            <div>
              <strong>${escapeHtml(vehicle.name)}</strong>
              <span>${escapeHtml(vehicle.licensePlate)} / ${escapeHtml(vehicle.lastGpsText)}</span>
              <small>${escapeHtml(vehicle.invalidReason || "Bez validni GPS polohy")}</small>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderWimPanel(viewModel) {
  const site = viewModel.selectedWimSite;
  return `
    <section class="nm-panel nm-vehicle-wim" id="nm-vehicle-wim" aria-labelledby="nm-vehicle-wim-title">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">WIM vrstva</p>
          <h2 id="nm-vehicle-wim-title">Vahy a alerty</h2>
        </div>
        <span class="nm-chip nm-chip--${escapeHtml(viewModel.wim.apiStatus === "ready" ? "success" : "warning")}">${escapeHtml(viewModel.wim.apiStatus)}</span>
      </div>
      ${site ? `
        <div class="nm-vehicle-wim__detail">
          <strong>${escapeHtml(site.title)}</strong>
          <span>${escapeHtml(site.statusLabel)} / ${escapeHtml(site.orp)}</span>
          <div class="nm-vehicle-detail__grid nm-vehicle-detail__grid--compact">
            ${detailField("Komunikace", site.road)}
            ${detailField("Kilometr", site.kmLabel)}
            ${detailField("Strana", site.sideLabel)}
            ${detailField("Zarizeni", String(site.deviceCount))}
            ${detailField("Kvalita GPS", site.coordinateQuality)}
            ${detailField("Zdroj", site.sourceLabel)}
          </div>
        </div>
      ` : renderNeumorphState({
        type: viewModel.wim.loading ? "loading" : "empty",
        title: viewModel.wim.loading ? "Nacitam WIM" : "Bez WIM bodu",
        description: viewModel.wim.loading ? "Cekam na WIM API." : "WIM vrstva zatim nema dostupne body."
      })}
    </section>
  `;
}

function renderDiagnostics(viewModel) {
  return `
    <section class="nm-panel nm-vehicle-diagnostics" aria-labelledby="nm-vehicle-diagnostics-title">
      <div class="nm-section-head">
        <div>
          <p class="nm-system-eyebrow">Diagnostika</p>
          <h2 id="nm-vehicle-diagnostics-title">T-Cars napojeni</h2>
        </div>
        <span class="nm-chip">${escapeHtml(viewModel.configured ? "konfigurovano" : "ceka na konfiguraci")}</span>
      </div>
      <div class="nm-vehicle-config-grid">
        ${viewModel.configItems.slice(0, 8).map((item) => detailField(item.label, item.value)).join("")}
      </div>
    </section>
  `;
}

export function renderNeumorphVehicleTracking({ user = null, routeHref = (route) => route, runtime = {} } = {}) {
  const viewModel = createVehicleTrackingViewModel({ user, routeHref, runtime });

  if (!viewModel.canView) {
    return renderNeumorphState({
      type: "warning",
      title: "Bez pristupu ke sledovani vozidel",
      description: viewModel.error || "Aktualni role nema opravneni vehicle-tracking:view."
    });
  }

  return `
    <div class="nm-vehicle-page">
      ${renderNeumorphModuleHeader({
        moduleItem: vehicleTrackingModule,
        eyebrow: "Smart odpady / provoz",
        title: "Sledovani vozidel",
        description: "Funkcni neumorph pohled nad realnym T-Cars a WIM runtime bez demo dat.",
        status: "realny runtime",
        statusTone: viewModel.error ? "danger" : viewModel.loaded ? "success" : "warning",
        actions: [
          { label: "Puvodni modul", href: routeHref("/sledovani-vozidel"), variant: "secondary" },
          { label: "Vozovy park", href: routeHref("/vozovy-park"), variant: "primary" }
        ],
        meta: [
          viewModel.hasGoogleMapsKey ? "Google mapa aktivni" : "fallback mapa",
          viewModel.canExport ? "export povolen" : "read-only"
        ]
      })}
      ${renderNeumorphStatusStrip(viewModel.metrics)}
      ${renderNotices(viewModel)}
      ${renderToolbar(viewModel)}
      <div class="nm-grid nm-vehicle-layout">
        <div class="nm-vehicle-main">
          ${renderMap(viewModel)}
          ${renderVehicleDetail(viewModel)}
        </div>
        <aside class="nm-vehicle-aside" aria-label="Seznam vozidel a souvisejici stavy">
          ${renderVehicleList(viewModel)}
          ${renderInvalidVehicles(viewModel)}
        </aside>
      </div>
      <div class="nm-grid nm-vehicle-support">
        ${renderWimPanel(viewModel)}
        ${renderDiagnostics(viewModel)}
      </div>
    </div>
  `;
}
