import {
  DEFAULT_THEME_SETTINGS,
  THEME_BACKGROUND_STYLES,
  THEME_BUTTON_RADIUS_OPTIONS,
  THEME_BUTTON_STYLES,
  THEME_CARD_RADIUS_OPTIONS,
  THEME_CARD_SHADOWS,
  THEME_FONTS,
  THEME_LABELS,
  THEME_PALETTE_MODES,
  normalizeThemeSettings
} from "../data/themeSettings.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function colorField(name, label, value) {
  return `
    <label class="appearance-field appearance-field--color">
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" type="color" value="${escapeHtml(value)}" data-appearance-field />
      <strong>${escapeHtml(value)}</strong>
    </label>
  `;
}

function paletteSwatch(label, value) {
  return `
    <div class="appearance-palette-swatch">
      <span style="background: ${escapeHtml(value)}"></span>
      <strong>${escapeHtml(label)}</strong>
      <small>${escapeHtml(value)}</small>
    </div>
  `;
}

function selectField(name, label, options, selected, labels = {}) {
  return `
    <label class="appearance-field">
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}" data-appearance-field>
        ${options.map((option) => `
          <option value="${escapeHtml(option)}" ${option === selected ? "selected" : ""}>
            ${escapeHtml(labels[option] || option)}
          </option>
        `).join("")}
      </select>
    </label>
  `;
}

export function AppearanceSettingsBox({
  draftSettings = DEFAULT_THEME_SETTINGS,
  savedSettings = DEFAULT_THEME_SETTINGS,
  loading = false,
  saving = false,
  previewActive = false,
  message = "",
  error = ""
} = {}) {
  const draft = normalizeThemeSettings(draftSettings);
  const saved = normalizeThemeSettings(savedSettings);
  const busy = loading || saving;
  const manualPaletteDisabled = draft.paletteMode === "auto" ? "disabled" : "";

  return `
    <section class="appearance-settings users-panel" aria-labelledby="appearance-title">
      <div class="users-panel__head">
        <div>
          <h2 id="appearance-title">Vzhled a firemní barevné schéma</h2>
          <p>Upravte logo, firemní barvu, automatickou paletu nebo ruční barvy pro celé nasazení aplikace.</p>
        </div>
        <span class="appearance-scope-badge">${draft.paletteMode === "auto" ? "auto paleta" : "ruční paleta"}</span>
      </div>

      <p class="appearance-fixed-note">
        Nastavení se ukládá přes cloud API. Automatický režim dopočítá čitelnou paletu z jedné firemní barvy, ruční režim dovolí přesné doladění více barev.
      </p>

      <form class="appearance-form" data-appearance-form>
        <div class="appearance-form__grid">
          <label class="appearance-field appearance-field--wide">
            <span>Logo URL</span>
            <input name="logoUrl" value="${escapeHtml(draft.logoUrl)}" placeholder="/logo-kaiser.svg" data-appearance-field />
          </label>

          ${selectField("paletteMode", "Režim palety", THEME_PALETTE_MODES, draft.paletteMode, THEME_LABELS.paletteMode)}
          ${colorField("primaryColor", "Firemní barva", draft.primaryColor)}
          ${colorField("accentColor", "Akcent", draft.accentColor).replace("data-appearance-field", `${manualPaletteDisabled} data-appearance-field`)}
          ${colorField("secondaryColor", "Sekundární barva", draft.secondaryColor).replace("data-appearance-field", `${manualPaletteDisabled} data-appearance-field`)}
          ${colorField("backgroundColor", "Pozadí aplikace", draft.backgroundColor).replace("data-appearance-field", `${manualPaletteDisabled} data-appearance-field`)}
          ${colorField("cardColor", "Barva boxů", draft.cardColor).replace("data-appearance-field", `${manualPaletteDisabled} data-appearance-field`)}
          ${colorField("textColor", "Text", draft.textColor).replace("data-appearance-field", `${manualPaletteDisabled} data-appearance-field`)}
          ${colorField("mutedTextColor", "Sekundární text", draft.mutedTextColor).replace("data-appearance-field", `${manualPaletteDisabled} data-appearance-field`)}

          ${selectField("cardRadius", "Rádius boxů", THEME_CARD_RADIUS_OPTIONS, draft.cardRadius)}
          ${selectField("buttonRadius", "Rádius tlačítek", THEME_BUTTON_RADIUS_OPTIONS, draft.buttonRadius)}
          ${selectField("buttonStyle", "Styl tlačítek", THEME_BUTTON_STYLES, draft.buttonStyle, THEME_LABELS.buttonStyle)}
          ${selectField("backgroundStyle", "Pozadí modulů", THEME_BACKGROUND_STYLES, draft.backgroundStyle, THEME_LABELS.backgroundStyle)}
          ${selectField("cardShadow", "Stíny boxů", THEME_CARD_SHADOWS, draft.cardShadow, THEME_LABELS.cardShadow)}
          ${selectField("fontFamily", "Font v modulech", THEME_FONTS, draft.fontFamily, THEME_LABELS.fontFamily)}
        </div>

        <div class="appearance-palette-preview" aria-label="Výsledná paleta">
          ${paletteSwatch("Firemní", draft.primaryColor)}
          ${paletteSwatch("Sekundární", draft.secondaryColor)}
          ${paletteSwatch("Akcent", draft.accentColor)}
          ${paletteSwatch("Pozadí", draft.backgroundColor)}
          ${paletteSwatch("Boxy", draft.cardColor)}
          ${paletteSwatch("Text", draft.textColor)}
        </div>

        <div class="appearance-preview" aria-label="Živý náhled vzhledu">
          <div class="appearance-preview__logo">
            <img src="${escapeHtml(draft.logoUrl)}" alt="Náhled loga" />
          </div>
          <article class="appearance-preview__card">
            <span class="appearance-preview__badge">Ukázkový badge</span>
            <h3>Ukázková karta</h3>
            <p>Takto budou působit boxy, formuláře a ovládací prvky uvnitř modulů.</p>
            <label>
              <span>Ukázkový input</span>
              <input value="Vnitřní modul" readonly />
            </label>
            <div class="appearance-preview__actions">
              <button class="primary-action" type="button">Primární tlačítko</button>
              <button class="secondary-link" type="button">Sekundární tlačítko</button>
            </div>
          </article>
        </div>

        <div class="appearance-actions">
          <button class="primary-action" type="submit" ${busy ? "disabled" : ""}>
            ${saving ? "Ukládám..." : "Uložit vzhled"}
          </button>
          <button class="secondary-link" type="button" data-appearance-preview ${busy ? "disabled" : ""}>
            Náhled změn
          </button>
          <button class="secondary-link" type="button" data-appearance-reset ${busy ? "disabled" : ""}>
            Obnovit výchozí
          </button>
          <button class="text-action" type="button" data-appearance-export>
            Exportovat JSON
          </button>
          <label class="text-action appearance-import">
            Importovat JSON
            <input type="file" accept="application/json" data-appearance-import />
          </label>
        </div>

        <dl class="appearance-meta">
          <div>
            <dt>Uloženo</dt>
            <dd>${escapeHtml(saved.updatedAt || "neuvedeno")}</dd>
          </div>
          <div>
            <dt>Náhled</dt>
            <dd>${previewActive ? "zapnutý" : "vypnutý"}</dd>
          </div>
        </dl>

        ${message ? `<p class="module-feedback__notice">${escapeHtml(message)}</p>` : ""}
        ${error ? `<p class="module-feedback__error">${escapeHtml(error)}</p>` : ""}
      </form>
    </section>
  `;
}
