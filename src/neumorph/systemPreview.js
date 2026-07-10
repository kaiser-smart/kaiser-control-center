import { modules } from "../data/modules.js";
import {
  renderInlineIcon,
  renderNeumorphModuleHeader,
  renderNeumorphState,
  renderNeumorphStatusStrip,
  renderNeumorphToolbar
} from "./moduleLayout.js";

function statusChip(label, modifier = "neutral") {
  return `<span class="nm-chip nm-chip--${modifier}">${label}</span>`;
}

function previewMetric(label, value, detail, tone = "neutral") {
  return `
    <article class="nm-card nm-preview-metric nm-preview-metric--${tone}">
      <span class="nm-preview-metric__label">${label}</span>
      <strong>${value}</strong>
      <span>${detail}</span>
    </article>
  `;
}

function renderComponentGallery() {
  return `
    <section class="nm-panel nm-system-section" id="components">
      <div class="nm-system-section__head">
        <span class="nm-icon-holder nm-icon-holder--active" aria-hidden="true">${renderInlineIcon("check")}</span>
        <div>
          <p class="nm-system-eyebrow">Komponenty</p>
          <h2>Spolecny soft-metal zaklad</h2>
          <p>Viditelne ukazky pro budoucni moduly bez realnych provoznich dat.</p>
        </div>
      </div>

      <div class="nm-grid nm-system-component-grid">
        <article class="nm-card nm-system-card">
          <h3>Tlacitka a akce</h3>
          <div class="nm-cluster">
            <button class="nm-button nm-button--primary" type="button">Primary</button>
            <button class="nm-button nm-button--secondary" type="button">Secondary</button>
            <button class="nm-button nm-button--subtle" type="button">Subtle</button>
            <button class="nm-button nm-button--danger" type="button">Danger</button>
            <button class="nm-button" type="button" disabled>Disabled</button>
            <button class="nm-button nm-icon-button" type="button" aria-label="Vice moznosti">${renderInlineIcon("more")}</button>
          </div>
        </article>

        <article class="nm-card nm-system-card">
          <h3>Chipy a stavy</h3>
          <div class="nm-cluster">
            ${statusChip("Aktivni", "success")}
            ${statusChip("Info", "info")}
            ${statusChip("Ceka", "warning")}
            ${statusChip("Chyba", "danger")}
            ${statusChip("Neutral")}
          </div>
        </article>

        <article class="nm-card nm-system-card">
          <h3>Formulare</h3>
          <div class="nm-grid nm-form-grid">
            <label class="nm-field">
              <span>Nazev pohledu</span>
              <input class="nm-input" type="text" value="Migracni shell">
            </label>
            <label class="nm-field">
              <span>Stav</span>
              <select class="nm-select">
                <option>Pripraveno k migraci</option>
                <option>Probiha migrace</option>
              </select>
            </label>
            <label class="nm-field nm-field--wide">
              <span>Poznamka</span>
              <textarea class="nm-textarea">Sdilene komponenty jsou izolovane pod .nm-app.</textarea>
            </label>
          </div>
          <div class="nm-option-grid">
            <label class="nm-check-option">
              <input type="checkbox" checked>
              <span>Ukazat aktivni moduly</span>
            </label>
            <label class="nm-radio-option">
              <input type="radio" name="nm-system-tone" checked>
              <span>Soft-metal</span>
            </label>
            <label class="nm-switch-option">
              <input type="checkbox" checked>
              <span>Tokenovy motiv</span>
            </label>
          </div>
        </article>

        <article class="nm-card nm-system-card">
          <h3>Progress a dostupnost</h3>
          <div class="nm-progress" aria-label="Stav pripravy systemu">
            <span style="--nm-progress-value: 72%"></span>
          </div>
          <p>Shell, navigace a komponenty jsou pripraveny pro navazujici detailni migraci.</p>
        </article>
      </div>
    </section>
  `;
}

function renderTablePreview() {
  return `
    <section class="nm-panel nm-system-section">
      <div class="nm-system-section__head">
        <span class="nm-icon-holder" aria-hidden="true">${renderInlineIcon("filter")}</span>
        <div>
          <p class="nm-system-eyebrow">Data shell</p>
          <h2>Tabulka, toolbar a stavy</h2>
          <p>Staticky priklad wrapperu. Neobsahuje realna provozni data.</p>
        </div>
      </div>

      ${renderNeumorphToolbar({
        label: "Ukazkovy toolbar",
        searchPlaceholder: "Hledat modul nebo stav",
        segments: ["Vse", "Aktivni", "Pripravene"],
        filters: [
          { label: "Skupina", options: ["Vse", "Provoz", "Administrativa"] },
          { label: "Motiv", options: ["Light", "Dark"] }
        ],
        actions: [
          { label: "Export", icon: "download", variant: "secondary", disabled: true },
          { label: "Nova akce", icon: "plus", variant: "primary", disabled: true }
        ],
        countLabel: "staticka ukazka"
      })}

      <div class="nm-table-shell">
        <div class="nm-table-shell__head">
          <strong>Modulove oblasti</strong>
          <span>3 radky</span>
        </div>
        <div class="nm-table-wrap">
          <table class="nm-table">
            <thead>
              <tr>
                <th>Oblast</th>
                <th>Stav</th>
                <th>Poznamka</th>
                <th>Akce</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>AppShell</td>
                <td>${statusChip("Finalizovano", "success")}</td>
                <td>Header, sidebar, compact rail a mobile nav.</td>
                <td><button class="nm-button nm-button--subtle nm-button--sm" type="button">Detail</button></td>
              </tr>
              <tr>
                <td>Module layout</td>
                <td>${statusChip("Pripraveno", "info")}</td>
                <td>Header, toolbar, status strip a content shell.</td>
                <td><button class="nm-button nm-button--subtle nm-button--sm" type="button">Detail</button></td>
              </tr>
              <tr>
                <td>Realne workflow</td>
                <td>${statusChip("Dalsi faze", "warning")}</td>
                <td>Budou migrovana samostatne po modulech.</td>
                <td><button class="nm-button nm-button--subtle nm-button--sm" type="button" disabled>Plan</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="nm-pagination-shell" aria-label="Ukazkove strankovani">
          <button class="nm-button nm-button--subtle nm-button--sm" type="button" disabled>Predchozi</button>
          <span>1 / 1</span>
          <button class="nm-button nm-button--subtle nm-button--sm" type="button" disabled>Dalsi</button>
        </div>
      </div>
    </section>
  `;
}

function renderStatePreview() {
  return `
    <section class="nm-grid nm-system-state-grid" aria-label="Systemove stavy">
      ${renderNeumorphState({
        type: "loading",
        title: "Nacitani",
        description: "Jednoduchy loading stav pro budouci datove obrazovky."
      })}
      ${renderNeumorphState({
        type: "empty",
        title: "Prazdny stav",
        description: "Bezpecny empty state bez falesnych provoznich dat."
      })}
      ${renderNeumorphState({
        type: "error",
        title: "Chybovy stav",
        description: "Kontrastni, ale klidny error panel pro problemove akce."
      })}
      ${renderNeumorphState({
        type: "offline",
        title: "Nedostupne",
        description: "Stav pro offline nebo docasne nedostupnou sluzbu."
      })}
    </section>
  `;
}

export function renderNeumorphSystemPreview() {
  const dashboardModule = modules.find((moduleItem) => moduleItem.id === "dashboard") || modules[0];

  return `
    <section class="nm-system-preview" aria-labelledby="nm-system-title">
      ${renderNeumorphModuleHeader({
        moduleItem: dashboardModule,
        eyebrow: "Kaiser Smart / neumorph system",
        title: "Neumorph zaklad aplikace",
        description: "Finalizovany spolecny shell, navigace a komponenty pro navazujici prevod realnych modulu.",
        status: "Faze 3B",
        statusTone: "success",
        actions: [
          { label: "Projit moduly", href: "#nm-module-catalog-title", variant: "primary" },
          { label: "Komponenty", href: "#components", variant: "secondary" }
        ],
        meta: ["bez produkcniho deploye", "izolovano pod .nm-app"]
      })}

      <div class="nm-grid nm-preview-metrics" aria-label="Souhrn systemu">
        ${previewMetric("Shell", "1", "spolecny layout pro desktop, tablet a mobil", "success")}
        ${previewMetric("Navigace", "5", "logicke skupiny z realnych modulu", "info")}
        ${previewMetric("Motivy", "2", "jedna struktura, light/dark tokeny", "success")}
      </div>

      ${renderNeumorphStatusStrip([
        { label: "CSS izolace", value: ".nm-app", detail: "bez globalniho dopadu" },
        { label: "Route", value: "/neumorph", detail: "paralelni migracni prostor" },
        { label: "Workflow", value: "beze zmen", detail: "API, data a permissions zustavaji puvodni" }
      ])}

      ${renderComponentGallery()}
      ${renderTablePreview()}
      ${renderStatePreview()}
    </section>
  `;
}
