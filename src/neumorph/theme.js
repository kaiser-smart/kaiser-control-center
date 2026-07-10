const NEUMORPH_THEME_STORAGE_KEY = "smart_odpady_neumorph_theme";
const NEUMORPH_THEMES = new Set(["light", "dark"]);
const NEUMORPH_DEFAULT_THEME = "light";

export function normalizeNeumorphTheme(value) {
  return NEUMORPH_THEMES.has(value) ? value : NEUMORPH_DEFAULT_THEME;
}

export function readStoredNeumorphTheme(storage = globalThis.localStorage) {
  try {
    return normalizeNeumorphTheme(storage?.getItem(NEUMORPH_THEME_STORAGE_KEY));
  } catch {
    return NEUMORPH_DEFAULT_THEME;
  }
}

export function writeStoredNeumorphTheme(theme, storage = globalThis.localStorage) {
  const nextTheme = normalizeNeumorphTheme(theme);

  try {
    storage?.setItem(NEUMORPH_THEME_STORAGE_KEY, nextTheme);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }

  return nextTheme;
}

export function applyNeumorphTheme(theme, { target = globalThis.document?.body, persist = false } = {}) {
  const nextTheme = normalizeNeumorphTheme(theme);

  target?.setAttribute("data-theme", nextTheme);

  if (persist) {
    writeStoredNeumorphTheme(nextTheme);
  }

  return nextTheme;
}

export function toggleNeumorphTheme(currentTheme = readStoredNeumorphTheme(), options = {}) {
  return applyNeumorphTheme(normalizeNeumorphTheme(currentTheme) === "dark" ? "light" : "dark", options);
}
