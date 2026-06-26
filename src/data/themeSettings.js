export const DEFAULT_THEME_SETTINGS = {
  paletteMode: "manual",
  logoUrl: "/logo-kaiser.svg",
  primaryColor: "#75bd25",
  secondaryColor: "#3f4a45",
  accentColor: "#2f7d4c",
  backgroundColor: "#f7f9f4",
  cardColor: "#ffffff",
  textColor: "#1f2921",
  mutedTextColor: "#667064",
  cardRadius: 18,
  buttonRadius: 14,
  buttonStyle: "solid",
  backgroundStyle: "soft-green-gradient",
  cardShadow: "soft",
  fontFamily: "Quicksand",
  updatedAt: "",
  updatedByUserId: ""
};

export const THEME_PALETTE_MODES = ["auto", "manual"];
export const THEME_CARD_RADIUS_OPTIONS = [8, 12, 16, 18, 20, 24];
export const THEME_BUTTON_RADIUS_OPTIONS = [6, 10, 14, 18, 999];
export const THEME_BUTTON_STYLES = ["solid", "outline", "soft"];
export const THEME_BACKGROUND_STYLES = ["solid", "soft-green-gradient", "neutral"];
export const THEME_CARD_SHADOWS = ["none", "soft", "strong"];
export const THEME_FONTS = ["Quicksand", "Arial", "System font"];

export const THEME_LABELS = {
  paletteMode: {
    auto: "Automaticky z firemni barvy",
    manual: "Rucni paleta"
  },
  buttonStyle: {
    solid: "Plné zelené",
    outline: "Obrysové",
    soft: "Jemné světle zelené"
  },
  backgroundStyle: {
    solid: "Jednobarevné",
    "soft-green-gradient": "Jemný zelený gradient",
    neutral: "Světlé neutrální"
  },
  cardShadow: {
    none: "Vypnuto",
    soft: "Jemné",
    strong: "Výraznější"
  },
  fontFamily: {
    Quicksand: "Quicksand",
    Arial: "Arial",
    "System font": "System font"
  }
};

function cleanString(value) {
  return String(value ?? "").trim();
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex) {
  const color = cleanString(hex).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(color)) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: parseInt(color.slice(0, 2), 16),
    g: parseInt(color.slice(2, 4), 16),
    b: parseInt(color.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, "0")).join("")}`;
}

function mixColor(left, right, amount) {
  const a = hexToRgb(left);
  const b = hexToRgb(right);
  const ratio = Math.max(0, Math.min(1, amount));

  return rgbToHex({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio
  });
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const channels = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function readableTextFor(backgroundColor) {
  return relativeLuminance(backgroundColor) > 0.52 ? "#1f2921" : "#ffffff";
}

function derivedPalette(primaryColor) {
  const primary = cleanColor(primaryColor, DEFAULT_THEME_SETTINGS.primaryColor);
  const isLight = relativeLuminance(primary) > 0.5;
  const secondary = isLight ? mixColor(primary, "#17251c", 0.72) : mixColor(primary, "#ffffff", 0.28);
  const accent = mixColor(primary, "#2563eb", isLight ? 0.24 : 0.18);
  const background = mixColor(primary, "#ffffff", 0.91);
  const card = mixColor(primary, "#ffffff", 0.97);
  const text = readableTextFor(background) === "#ffffff" ? "#ffffff" : mixColor(secondary, "#101512", 0.52);
  const muted = readableTextFor(background) === "#ffffff" ? mixColor("#ffffff", primary, 0.28) : mixColor(text, "#ffffff", 0.38);

  return {
    secondaryColor: secondary,
    accentColor: accent,
    backgroundColor: background,
    cardColor: card,
    textColor: text,
    mutedTextColor: muted
  };
}

function cleanColor(value, fallback) {
  const color = cleanString(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function numericOption(value, allowed, fallback) {
  const number = Number(value);
  return allowed.includes(number) ? number : fallback;
}

function cleanLogoUrl(value, fallback) {
  const url = cleanString(value);

  if (!url) {
    return fallback;
  }

  if (url.startsWith("/") || url.startsWith("https://") || url.startsWith("http://")) {
    return url.slice(0, 500);
  }

  return fallback;
}

export function normalizeThemeSettings(input = {}, options = {}) {
  const fallback = DEFAULT_THEME_SETTINGS;
  const paletteMode = oneOf(input.paletteMode, THEME_PALETTE_MODES, fallback.paletteMode);
  const primaryColor = cleanColor(input.primaryColor, fallback.primaryColor);
  const palette = paletteMode === "auto"
    ? derivedPalette(primaryColor)
    : {
      secondaryColor: cleanColor(input.secondaryColor, fallback.secondaryColor),
      accentColor: cleanColor(input.accentColor, fallback.accentColor),
      backgroundColor: cleanColor(input.backgroundColor, fallback.backgroundColor),
      cardColor: cleanColor(input.cardColor, fallback.cardColor),
      textColor: cleanColor(input.textColor, fallback.textColor),
      mutedTextColor: cleanColor(input.mutedTextColor, fallback.mutedTextColor)
    };

  return {
    paletteMode,
    logoUrl: cleanLogoUrl(input.logoUrl, fallback.logoUrl),
    primaryColor,
    secondaryColor: palette.secondaryColor,
    accentColor: palette.accentColor,
    backgroundColor: palette.backgroundColor,
    cardColor: palette.cardColor,
    textColor: palette.textColor,
    mutedTextColor: palette.mutedTextColor,
    cardRadius: numericOption(input.cardRadius, THEME_CARD_RADIUS_OPTIONS, fallback.cardRadius),
    buttonRadius: numericOption(input.buttonRadius, THEME_BUTTON_RADIUS_OPTIONS, fallback.buttonRadius),
    buttonStyle: oneOf(input.buttonStyle, THEME_BUTTON_STYLES, fallback.buttonStyle),
    backgroundStyle: oneOf(input.backgroundStyle, THEME_BACKGROUND_STYLES, fallback.backgroundStyle),
    cardShadow: oneOf(input.cardShadow, THEME_CARD_SHADOWS, fallback.cardShadow),
    fontFamily: oneOf(input.fontFamily, THEME_FONTS, fallback.fontFamily),
    updatedAt: cleanString(options.updatedAt || input.updatedAt),
    updatedByUserId: cleanString(options.updatedByUserId || input.updatedByUserId)
  };
}

export function sameThemeSettings(left, right) {
  return JSON.stringify(normalizeThemeSettings(left)) === JSON.stringify(normalizeThemeSettings(right));
}

export function themeFontStack(fontFamily) {
  if (fontFamily === "Arial") {
    return "Arial, sans-serif";
  }

  if (fontFamily === "System font") {
    return "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
  }

  return "\"Quicksand\", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
}

export function themeShadow(cardShadow) {
  if (cardShadow === "none") {
    return "none";
  }

  if (cardShadow === "strong") {
    return "0 24px 58px rgba(31, 41, 33, 0.16)";
  }

  return "0 18px 45px rgba(31, 41, 33, 0.10)";
}

export function themeBackground(settings) {
  if (settings.backgroundStyle === "solid") {
    return settings.backgroundColor;
  }

  if (settings.backgroundStyle === "neutral") {
    return `linear-gradient(180deg, #ffffff 0%, ${settings.backgroundColor} 100%)`;
  }

  return `linear-gradient(145deg, color-mix(in srgb, ${settings.primaryColor} 16%, transparent) 0%, transparent 36%), ${settings.backgroundColor}`;
}

export function themeSettingsToCssProperties(input = {}) {
  const settings = normalizeThemeSettings(input);
  const softButtonBackground = `color-mix(in srgb, ${settings.primaryColor} 14%, #ffffff)`;
  const buttonBackground = settings.buttonStyle === "soft" ? softButtonBackground : settings.primaryColor;
  const buttonColor = settings.buttonStyle === "soft" ? settings.textColor : "#ffffff";
  const buttonBorder = settings.buttonStyle === "outline" ? `1px solid ${settings.primaryColor}` : "1px solid transparent";
  const focusRing = `color-mix(in srgb, ${settings.primaryColor} 18%, transparent)`;

  return {
    "--theme-primary": settings.primaryColor,
    "--theme-secondary": settings.secondaryColor,
    "--theme-accent": settings.accentColor,
    "--theme-bg": settings.backgroundColor,
    "--theme-bg-surface": themeBackground(settings),
    "--theme-card": settings.cardColor,
    "--theme-text": settings.textColor,
    "--theme-muted": settings.mutedTextColor,
    "--theme-focus-ring": focusRing,
    "--theme-border": "color-mix(in srgb, var(--theme-muted) 26%, #ffffff)",
    "--theme-card-radius": `${settings.cardRadius}px`,
    "--theme-button-radius": settings.buttonRadius === 999 ? "999px" : `${settings.buttonRadius}px`,
    "--theme-shadow-card": themeShadow(settings.cardShadow),
    "--theme-font-main": themeFontStack(settings.fontFamily),
    "--theme-button-background": buttonBackground,
    "--theme-button-color": buttonColor,
    "--theme-button-border": buttonBorder,
    "--kaiser-green": settings.primaryColor,
    "--kaiser-green-dark": settings.secondaryColor,
    "--ink": settings.textColor,
    "--muted": settings.mutedTextColor,
    "--line": "color-mix(in srgb, var(--theme-muted) 26%, #ffffff)",
    "--page": settings.backgroundColor,
    "--card": settings.cardColor,
    "--surface": settings.cardColor,
    "--surface-strong": `color-mix(in srgb, ${settings.primaryColor} 12%, #ffffff)`,
    "--steel": settings.secondaryColor,
    "--color-primary": settings.primaryColor,
    "--color-primary-dark": settings.secondaryColor,
    "--color-accent": settings.accentColor,
    "--color-text": settings.textColor,
    "--color-muted": settings.mutedTextColor,
    "--color-bg": settings.backgroundColor,
    "--color-card": settings.cardColor,
    "--radius-card": `${settings.cardRadius}px`,
    "--shadow-card": themeShadow(settings.cardShadow)
  };
}
