function previewMetric(label, value, detail, tone = "neutral") {
  return `
    <article class="nm-card nm-preview-metric nm-preview-metric--${tone}">
      <span class="nm-preview-metric__label">${label}</span>
      <strong>${value}</strong>
      <span>${detail}</span>
    </article>
  `;
}

function statusChip(label, modifier) {
  return `<span class="nm-chip nm-chip--${modifier}">${label}</span>`;
}

export function renderNeumorphSystemPreview() {
  return `
    <section class="nm-system-preview" aria-labelledby="nm-system-title">
      <div class="nm-panel nm-system-hero">
        <div class="nm-system-hero__copy">
          <span class="nm-system-eyebrow">Kaiser Smart / migrace UI</span>
          <h1 id="nm-system-title">Neumorph system</h1>
          <p>
            Paralelni izolovany shell pro postupny prevod aplikace do soft-metal / neumorph 2.0 designu.
            Zatim bez realnych modulu, API a produkcnich akci.
          </p>
          <div class="nm-cluster">
            ${statusChip("Izolovano pod .nm-app", "success")}
            ${statusChip("Light / dark tokeny", "info")}
            ${statusChip("Bez produkcnich dat", "warning")}
          </div>
        </div>
        <div class="nm-card nm-system-hero__status" aria-label="Stav migrace">
          <span class="nm-icon-holder nm-icon-holder--active" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="nm-icon">
              <path d="M5 12.5 9 16l10-10"></path>
            </svg>
          </span>
          <div>
            <strong>Faze 2</strong>
            <span>AppShell a responsivni kostra</span>
          </div>
        </div>
      </div>

      <div class="nm-grid nm-preview-metrics" aria-label="Souhrn foundation">
        ${previewMetric("Tokeny", "60+", "barvy, stiny, mezery, radiusy", "success")}
        ${previewMetric("Motivy", "2", "jeden markup pro den i noc", "info")}
        ${previewMetric("Route", "/neumorph", "paralelni migracni vstup", "neutral")}
      </div>

      <section class="nm-grid nm-system-layout">
        <article class="nm-panel nm-system-section" id="components">
          <div class="nm-system-section__head">
            <span class="nm-icon-holder" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="nm-icon">
                <path d="M4 8h16M4 16h16M8 4v16M16 4v16"></path>
              </svg>
            </span>
            <div>
              <h2>Komponenty</h2>
              <p>Zakladni primitives z Faze 1 v jednom zivem katalogu.</p>
            </div>
          </div>

          <div class="nm-stack">
            <div class="nm-card">
              <h3>Tlacitka</h3>
              <div class="nm-cluster">
                <button class="nm-button nm-button--primary" type="button">Primary</button>
                <button class="nm-button nm-button--secondary" type="button">Secondary</button>
                <button class="nm-button nm-button--subtle" type="button">Subtle</button>
                <button class="nm-button nm-button--danger" type="button">Danger</button>
                <button class="nm-button" type="button" disabled>Disabled</button>
              </div>
            </div>

            <div class="nm-card">
              <h3>Status chipy</h3>
              <div class="nm-cluster">
                ${statusChip("Aktivni", "success")}
                ${statusChip("Ceka", "warning")}
                ${statusChip("Chyba", "danger")}
                ${statusChip("Info", "info")}
                <span class="nm-chip">Neutral</span>
              </div>
            </div>

            <div class="nm-card nm-form-preview">
              <h3>Formulare</h3>
              <div class="nm-grid">
                <label class="nm-field">
                  <span>Nazev pohledu</span>
                  <input class="nm-input" type="text" value="Migracni shell">
                </label>
                <label class="nm-field">
                  <span>Stav</span>
                  <select class="nm-select">
                    <option>Pripraveno pro pilot</option>
                    <option>V navrhu</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </article>

        <aside class="nm-stack nm-system-aside" aria-label="Doplnkove ukazky">
          <div class="nm-alert">
            <strong>Interni nahled.</strong>
            <span>Slouzi jen pro kontrolu shellu, tokenu a komponent.</span>
          </div>
          <div class="nm-alert nm-alert--success">
            <strong>Bezpecne oddeleno.</strong>
            <span>Puvodni routy se nemeni a bez .nm-app se styly neuplatni.</span>
          </div>
          <div class="nm-card nm-card--inset">
            <h3>Inset panel</h3>
            <p>Ukazka zapusteneho soft-metal povrchu pro budouci filtry nebo staticke souhrny.</p>
          </div>
        </aside>
      </section>

      <section class="nm-panel nm-system-section">
        <div class="nm-system-section__head">
          <span class="nm-icon-holder" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="nm-icon">
              <path d="M4 6h16M4 12h16M4 18h10"></path>
            </svg>
          </span>
          <div>
            <h2>Tabulka a prazdny stav</h2>
            <p>Neutralni staticka data pro kontrolu typografie a hran.</p>
          </div>
        </div>

        <div class="nm-system-table-wrap">
          <table class="nm-table">
            <thead>
              <tr>
                <th>Oblast</th>
                <th>Stav</th>
                <th>Poznamka</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Foundation CSS</td>
                <td>Hotovo</td>
                <td>Tokeny a primitives pod .nm-app.</td>
              </tr>
              <tr>
                <td>AppShell</td>
                <td>Faze 2</td>
                <td>Header, sidebar, content a mobilni nav.</td>
              </tr>
              <tr>
                <td>Pilotni modul</td>
                <td>Priste</td>
                <td>Bez migrace v tomto kroku.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="nm-empty-state">
          <span class="nm-icon-holder" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="nm-icon">
              <path d="M5 7h14v10H5z"></path>
              <path d="M8 10h8M8 14h5"></path>
            </svg>
          </span>
          <h3>Zadne produkcni akce</h3>
          <p>Tato route je pouze zivy katalog systemu. Nevola realna API a nepracuje s ostrymi daty.</p>
        </div>
      </section>
    </section>
  `;
}
