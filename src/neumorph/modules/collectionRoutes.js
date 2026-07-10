import { modules } from "../../data/modules.js";
import { createCollectionRoutesViewModel } from "../adapters/collectionRoutesAdapter.js";
import {
  escapeHtml,
  renderInlineIcon,
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

function optionList(options, selectedValue) {
  return options.map(([value, label]) => `
    <option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>
  `).join("");
}

function fieldSelect({ label, value, options, dataAttribute }) {
  return `
    <label class="nm-field nm-field--compact">
      <span>${escapeHtml(label)}</span>
      <select class="nm-select" ${dataAttribute}>
        ${optionList(options, value)}
      </select>
    </label>
  `;
}

function statusTone(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("nena")) return "danger";
  if (normalized.includes("nejas") || normalized.includes("chyb") || normalized.includes("duplic")) return "warning";
  if (normalized.includes("namap")) return "success";
  return "neutral";
}

function statusChip(status = "-") {
  return `<span class="nm-chip nm-chip--${statusTone(status)}">${escapeHtml(status || "-")}</span>`;
}

function rowAddress(row) {
  return row?.addressText || row?.addressRaw || row?.customerAddress || "-";
}

function rowWaste(row) {
  const waste = row?.wasteType || row?.wasteCode || "ostatní";
  return row?.wasteCode && row?.wasteType ? `${row.wasteType} (${row.wasteCode})` : waste;
}

function rowContainer(row) {
  if (!row?.containerVolume && !row?.containerCount) {
    return "-";
  }
  const count = row.containerCount || 1;
  return row.containerVolume ? `${count}× ${row.containerVolume} l` : `${count}× nádoba`;
}

function rowMappingStatus(row) {
  return row?.vistosMatchStatus || row?.mappingStatus || "-";
}

function rowSource(row) {
  return `${row?.sourceFile || "-"} / ${row?.sourceSheet || "-"} / ř. ${row?.sourceRowNumber || "-"}`;
}

function routeRowKey(row, index) {
  return [
    row?.sourceFile || "",
    row?.sourceSheet || "",
    row?.sourceRowNumber || "",
    row?.routeOrder || "",
    index
  ].map((value) => String(value || "").trim()).join("::");
}

function renderMetric(label, value, detail) {
  return `
    <article class="nm-card nm-collection-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatNumber(value))}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function renderNotice(viewModel) {
  const notices = [
    viewModel.message ? ["info", viewModel.message] : null,
    viewModel.error ? ["danger", viewModel.error] : null,
    viewModel.sourceImportMessage ? ["info", viewModel.sourceImportMessage] : null,
    viewModel.sourceImportError ? ["warning", viewModel.sourceImportError] : null,
    viewModel.sourceVistosMatchMessage ? ["info", viewModel.sourceVistosMatchMessage] : null,
    viewModel.sourceVistosMatchError ? ["danger", viewModel.sourceVistosMatchError] : null
  ].filter(Boolean);

  if (!notices.length) {
    return "";
  }

  return `
    <div class="nm-collection-notices">
      ${notices.map(([tone, text]) => `
        <p class="nm-alert nm-alert--${escapeHtml(tone)}">${escapeHtml(text)}</p>
      `).join("")}
    </div>
  `;
}

function renderToolbar(viewModel) {
  return `
    <section class="nm-toolbar nm-collection-toolbar" aria-label="Filtry svozových tras">
      ${fieldSelect({
        label: "Import",
        value: viewModel.selectedBatch?.id || "",
        options: viewModel.sourceBatches.length
          ? viewModel.sourceBatches.map((batch) => [batch.id, formatDateTime(batch.createdAt) || batch.id])
          : [["", "čeká na import"]],
        dataAttribute: 'data-collection-routes-source-filter="batch"'
      })}
      ${fieldSelect({
        label: "Den",
        value: viewModel.filters.day,
        options: viewModel.options.days,
        dataAttribute: 'data-collection-routes-source-filter="day"'
      })}
      ${fieldSelect({
        label: "Týden",
        value: viewModel.filters.week,
        options: viewModel.options.weeks,
        dataAttribute: 'data-collection-routes-source-filter="week"'
      })}
      ${fieldSelect({
        label: "Auto",
        value: viewModel.filters.vehicle,
        options: viewModel.options.vehicles,
        dataAttribute: 'data-collection-routes-source-filter="vehicle"'
      })}
      ${fieldSelect({
        label: "Odpad",
        value: viewModel.filters.waste,
        options: viewModel.options.wastes,
        dataAttribute: 'data-collection-routes-source-filter="waste"'
      })}
      ${fieldSelect({
        label: "Mapování",
        value: viewModel.filters.mappingStatus,
        options: viewModel.options.mappings,
        dataAttribute: 'data-collection-routes-source-filter="mappingStatus"'
      })}
      <div class="nm-toolbar__actions">
        <span class="nm-chip nm-chip--info">${formatNumber(viewModel.rows.length)} zastávek</span>
        <button class="nm-button nm-button--secondary" type="button" data-collection-routes-source-export-csv ${viewModel.rows.length ? "" : "disabled"}>CSV</button>
      </div>
    </section>
  `;
}

function renderSmartPanel(viewModel) {
  return `
    <section class="nm-panel nm-collection-smart" aria-labelledby="nm-collection-smart-title">
      <div class="nm-module-section-head">
        <div>
          <p class="nm-system-eyebrow">Pracovní filtr</p>
          <h2 id="nm-collection-smart-title">${escapeHtml(viewModel.routeTitle)}</h2>
          <p>Stejný filtr jako původní modul. Změna hodnot volá původní load tras z API.</p>
        </div>
        <span class="nm-chip nm-chip--success">${formatNumber(viewModel.rows.length)} zastávek</span>
      </div>
      <div class="nm-collection-smart__grid" data-collection-routes-source-smart-panel>
        ${fieldSelect({
          label: "Auto",
          value: viewModel.filters.vehicle,
          options: viewModel.options.vehicles,
          dataAttribute: 'data-collection-routes-source-smart-filter="vehicle"'
        })}
        ${fieldSelect({
          label: "Termín",
          value: viewModel.sourceSmartDayKey,
          options: viewModel.options.smartDays,
          dataAttribute: 'data-collection-routes-source-smart-filter="day"'
        })}
        <label class="nm-field nm-field--compact">
          <span>Datum</span>
          <input class="nm-input" type="date" value="${escapeHtml(viewModel.sourceSmartCustomDate)}" data-collection-routes-source-smart-filter="customDate">
        </label>
        ${fieldSelect({
          label: "Odpad",
          value: viewModel.filters.waste,
          options: viewModel.options.wastes,
          dataAttribute: 'data-collection-routes-source-smart-filter="waste"'
        })}
        ${fieldSelect({
          label: "Kontrola",
          value: viewModel.sourceSmartStatus,
          options: viewModel.options.smartStatuses,
          dataAttribute: 'data-collection-routes-source-smart-filter="status"'
        })}
      </div>
      <div class="nm-collection-actions">
        <button class="nm-button nm-button--primary" type="button" data-collection-routes-source-print-driver ${viewModel.rows.length ? "" : "disabled"}>
          Tisk pro řidiče
        </button>
        <button class="nm-button nm-button--secondary" type="button" data-collection-routes-source-print-pdf ${viewModel.rows.length ? "" : "disabled"}>
          Detailní PDF
        </button>
      </div>
    </section>
  `;
}

function renderViewSwitch(viewModel) {
  const options = [
    ["print", "Přehled", "Tabulka a mobilní karty"],
    ["driver", "Řidičský náhled", "Read-only práce se zastávkou"]
  ];

  return `
    <div class="nm-segmented-control nm-collection-view-switch" role="group" aria-label="Zobrazení trasy">
      ${options.map(([value, label, detail]) => `
        <button
          class="nm-segment ${viewModel.sourceRouteView === value ? "nm-segment--active" : ""}"
          type="button"
          aria-pressed="${viewModel.sourceRouteView === value ? "true" : "false"}"
          data-collection-routes-source-view="${escapeHtml(value)}"
          title="${escapeHtml(detail)}"
        >
          ${escapeHtml(label)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderRouteTable(viewModel) {
  if (!viewModel.rows.length) {
    return renderNeumorphState({
      type: viewModel.sourceImportError ? "warning" : "empty",
      title: viewModel.sourceImportError ? "Zdroj tras není dostupný" : "V aktuálním filtru nejsou žádné zastávky",
      description: viewModel.sourceImportError || "Nahrajte 13 Excelů, nebo upravte filtr."
    });
  }

  return `
    <div class="nm-table-shell nm-collection-table-shell">
      <div class="nm-table-shell__head">
        <strong>Zastávky aktuální trasy</strong>
        <span>${formatNumber(viewModel.rows.length)} řádků</span>
      </div>
      <div class="nm-table-wrap">
        <table class="nm-table nm-collection-table">
          <thead>
            <tr>
              <th>Pořadí</th>
              <th>Zákazník</th>
              <th>Stanoviště / adresa</th>
              <th>Odpad</th>
              <th>Nádoba</th>
              <th>Mapování</th>
              <th>Zdroj</th>
              <th>Akce</th>
            </tr>
          </thead>
          <tbody>
            ${viewModel.rows.map((row, index) => {
              const key = routeRowKey(row, index);
              return `
                <tr class="${key === viewModel.selectedRowKey ? "nm-table-row--active" : ""}">
                  <td>${escapeHtml(row?.routeOrder || index + 1)}</td>
                  <td><strong>${escapeHtml(row?.customerName || "-")}</strong></td>
                  <td>${escapeHtml(rowAddress(row))}</td>
                  <td>${escapeHtml(rowWaste(row))}</td>
                  <td>${escapeHtml(rowContainer(row))}</td>
                  <td>${statusChip(rowMappingStatus(row))}</td>
                  <td>${escapeHtml(rowSource(row))}</td>
                  <td>
                    <button class="nm-button nm-button--subtle nm-button--sm" type="button" data-collection-routes-source-driver-stop="${escapeHtml(key)}">
                      Detail
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderRouteCards(viewModel) {
  if (!viewModel.rows.length) {
    return "";
  }

  return `
    <div class="nm-collection-mobile-cards" aria-label="Mobilní seznam zastávek">
      ${viewModel.rows.map((row, index) => {
        const key = routeRowKey(row, index);
        return `
          <article class="nm-card nm-collection-route-card ${key === viewModel.selectedRowKey ? "nm-collection-route-card--active" : ""}">
            <div>
              <span class="nm-chip">#${escapeHtml(row?.routeOrder || index + 1)}</span>
              ${statusChip(rowMappingStatus(row))}
            </div>
            <h3>${escapeHtml(row?.customerName || "Zastávka")}</h3>
            <p>${escapeHtml(rowAddress(row))}</p>
            <dl>
              <div><dt>Odpad</dt><dd>${escapeHtml(rowWaste(row))}</dd></div>
              <div><dt>Nádoba</dt><dd>${escapeHtml(rowContainer(row))}</dd></div>
              <div><dt>Zdroj</dt><dd>${escapeHtml(rowSource(row))}</dd></div>
            </dl>
            <button class="nm-button nm-button--secondary nm-button--sm" type="button" data-collection-routes-source-driver-stop="${escapeHtml(key)}">Detail</button>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderRouteDetail(viewModel) {
  const row = viewModel.selectedRow;

  if (!row) {
    return renderNeumorphState({
      type: "empty",
      title: "Detail čeká na trasu",
      description: "Po načtení a výběru zastávky se tu zobrazí detail stejného řádku."
    });
  }

  return `
    <section class="nm-panel nm-collection-detail" aria-labelledby="nm-collection-detail-title">
      <div class="nm-module-section-head">
        <div>
          <p class="nm-system-eyebrow">Detail zastávky</p>
          <h2 id="nm-collection-detail-title">${escapeHtml(row.customerName || "Zastávka")}</h2>
          <p>${escapeHtml(rowAddress(row))}</p>
        </div>
        ${statusChip(rowMappingStatus(row))}
      </div>
      <div class="nm-grid nm-collection-detail-grid">
        ${renderMetric("Pořadí", row.routeOrder || viewModel.selectedIndex + 1, "v aktuální trase")}
        ${renderMetric("Nádoby", row.containerCount || 0, rowContainer(row))}
        ${renderMetric("Minuty", row.estimatedServiceMinutes || 0, "odhad obsluhy")}
        ${renderMetric("Tuny", row.estimatedWeightTons || 0, "odhad hmotnosti")}
      </div>
      <div class="nm-collection-detail__body">
        <article>
          <span>Vistos smlouva</span>
          <strong>${escapeHtml(row.vistosContractNumber || row.vistosContractId || "-")}</strong>
        </article>
        <article>
          <span>Vistos zákazník</span>
          <strong>${escapeHtml(row.vistosCustomerName || row.vistosBranchName || "-")}</strong>
        </article>
        <article>
          <span>Vistos stanoviště</span>
          <strong>${escapeHtml(row.vistosSiteName || row.vistosAddressText || "-")}</strong>
        </article>
        <article>
          <span>Problém</span>
          <strong>${escapeHtml(row.vistosIssue || row.mappingIssue || "-")}</strong>
        </article>
      </div>
      <div class="nm-collection-actions">
        <button class="nm-button nm-button--secondary" type="button" data-collection-routes-source-driver-prev ${viewModel.selectedIndex <= 0 ? "disabled" : ""}>Předchozí</button>
        <button class="nm-button nm-button--primary" type="button" data-collection-routes-source-driver-next ${viewModel.selectedIndex >= viewModel.rows.length - 1 ? "disabled" : ""}>Další</button>
      </div>
    </section>
  `;
}

function renderDriverPanel(viewModel) {
  if (viewModel.sourceRouteView !== "driver") {
    return "";
  }

  return `
    <section class="nm-panel nm-collection-driver" aria-labelledby="nm-collection-driver-title">
      <div class="nm-module-section-head">
        <div>
          <p class="nm-system-eyebrow">Řidičský read-only náhled</p>
          <h2 id="nm-collection-driver-title">Aktuální zastávka</h2>
        </div>
        <span class="nm-chip nm-chip--info">${viewModel.selectedIndex + 1} / ${viewModel.rows.length || 0}</span>
      </div>
      ${renderRouteDetail(viewModel)}
      <div class="nm-collection-driver__actions" aria-label="Read-only akce řidiče">
        ${["navigate", "done", "problem", "dump", "break"].map((action) => `
          <button class="nm-button nm-button--secondary" type="button" data-collection-routes-driver-readonly-action="${escapeHtml(action)}">
            ${escapeHtml({
              navigate: "Navigovat",
              done: "Hotovo",
              problem: "Nahlásit problém",
              dump: "Musím vysypat",
              break: "Přestávka"
            }[action])}
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDataPanel(viewModel) {
  return `
    <section class="nm-panel nm-collection-data" aria-labelledby="nm-collection-data-title">
      <div class="nm-module-section-head">
        <div>
          <p class="nm-system-eyebrow">Data a import</p>
          <h2 id="nm-collection-data-title">Zdroj tras a kontrola mapování</h2>
          <p>Formuláře používají původní API, validaci a permission pravidla.</p>
        </div>
        <span class="nm-chip nm-chip--${viewModel.canManage ? "success" : "warning"}">${viewModel.canManage ? "manage" : "view only"}</span>
      </div>
      ${viewModel.canManage ? `
        <form class="nm-form-grid nm-collection-import-form" data-collection-routes-source-import-form>
          <label class="nm-field nm-field--wide">
            <span>13 Excel souborů svozových tras</span>
            <input class="nm-input" type="file" name="files" accept=".xlsx,.csv,.tsv,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values" multiple>
          </label>
          <button class="nm-button nm-button--primary" type="submit" ${viewModel.sourceImportLoading ? "disabled" : ""}>
            ${viewModel.sourceImportLoading ? "Ukládám read-only zdroj..." : "Nahrát 13 Excelů"}
          </button>
        </form>
      ` : `
        <p class="nm-alert nm-alert--warning">Import a Vistos match může spustit pouze role s oprávněním manage.</p>
      `}
      <div class="nm-collection-actions">
        <button class="nm-button nm-button--secondary" type="button" data-collection-routes-source-vistos-match ${(viewModel.sourceBatches.length && viewModel.canManage && !viewModel.sourceVistosMatchLoading) ? "" : "disabled"}>
          ${viewModel.sourceVistosMatchLoading ? "Páruju s Vistosem..." : "Spustit Vistos match"}
        </button>
        <button class="nm-button nm-button--secondary" type="button" data-collection-routes-source-focus-po-a-review>Nejasné řádky</button>
        <button class="nm-button nm-button--secondary" type="button" data-collection-routes-source-focus-po-a-repair>Řádky k opravě</button>
      </div>
    </section>
  `;
}

function renderIssuesPanel(viewModel) {
  return `
    <section class="nm-panel nm-collection-side-panel" aria-labelledby="nm-collection-issues-title">
      <div class="nm-module-section-head">
        <div>
          <p class="nm-system-eyebrow">Kontrola</p>
          <h2 id="nm-collection-issues-title">Stanoviště a problémy</h2>
        </div>
      </div>
      <div class="nm-grid nm-collection-side-grid">
        ${renderMetric("Stanoviště", viewModel.sites.length, "z preview API")}
        ${renderMetric("Problémy", viewModel.issues.length, "k doplnění polohy")}
        ${renderMetric("Importy", viewModel.sourceBatches.length, "13 Excelů")}
      </div>
      ${viewModel.issues.length ? `
        <div class="nm-collection-mini-list">
          ${viewModel.issues.slice(0, 4).map((issue) => `
            <article>
              <strong>${escapeHtml(issue.issueType || "data-quality")}</strong>
              <span>${escapeHtml(issue.message || issue.severity || "Bez detailu")}</span>
            </article>
          `).join("")}
        </div>
      ` : renderNeumorphState({
        type: "empty",
        title: "Bez položek k doplnění",
        description: "Po reálném importu se tu objeví nejasné adresy nebo GPS."
      })}
    </section>
  `;
}

export function renderNeumorphCollectionRoutes({
  user = null,
  routeHref = (route) => route,
  runtime = {}
} = {}) {
  const viewModel = createCollectionRoutesViewModel({ user, runtime, routeHref });
  const moduleItem = modules.find((item) => item.id === "collection-routes");

  if (!viewModel.canView) {
    return renderNeumorphState({
      type: "warning",
      title: "Bez oprávnění",
      description: "Aktuální role nemá přístup k modulu Trasy svozu."
    });
  }

  return `
    <section class="nm-collection-page" aria-labelledby="nm-collection-title">
      ${renderNeumorphModuleHeader({
        moduleItem,
        eyebrow: "Kaiser Smart / Hlavní práce",
        title: "Trasy svozu",
        description: "Funkční neumorph varianta hlavní obrazovky Tras svozu. Používá původní API, filtry, permissions a akce.",
        status: "Read-only pilot",
        statusTone: "info",
        actions: [
          { label: "Původní modul", href: routeHref("/trasy-svozu/dashboard"), variant: "secondary" },
          { label: "Systémový přehled", href: routeHref("/neumorph"), variant: "subtle" }
        ],
        meta: ["13 Excelů", "Vistos match", "bez ostrých tras"]
      })}

      ${renderNeumorphStatusStrip([
        { label: "API", value: viewModel.apiStatus, detail: "původní endpointy" },
        { label: "Import", value: viewModel.selectedBatch ? formatDateTime(viewModel.selectedBatch.createdAt) : "čeká", detail: "svozove-trasy/batches" },
        { label: "Permission", value: viewModel.canManage ? "manage" : "view", detail: "beze změny rolí" }
      ])}

      ${renderNotice(viewModel)}
      ${renderToolbar(viewModel)}
      ${renderSmartPanel(viewModel)}

      <div class="nm-grid nm-collection-metrics">
        ${renderMetric("Zastávky", viewModel.summary.rowCount, "aktuální filtr")}
        ${renderMetric("Nádoby", viewModel.summary.containerCount, "souhrn z řádků")}
        ${renderMetric("Odhad času", viewModel.summary.estimatedMinutes, "minut")}
        ${renderMetric("Odhad hmotnosti", viewModel.summary.estimatedTons, "tun")}
      </div>

      ${renderViewSwitch(viewModel)}

      <div class="nm-grid nm-collection-layout">
        <div class="nm-collection-main">
          ${viewModel.sourceRouteView === "driver" ? renderDriverPanel(viewModel) : `
            ${renderRouteDetail(viewModel)}
            ${renderRouteTable(viewModel)}
            ${renderRouteCards(viewModel)}
          `}
        </div>
        <aside class="nm-collection-aside">
          ${renderDataPanel(viewModel)}
          ${renderIssuesPanel(viewModel)}
        </aside>
      </div>
    </section>
  `;
}
