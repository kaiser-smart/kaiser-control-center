import { TYPES, SYMBOLS, ageText, statusText } from "./model.js";
export function escape(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function artwork(type, size = "list") {
  return `<span class="vm-art vm-art--${size}" aria-hidden="true"><img src="vehicles/silhouettes/${Object.hasOwn(TYPES, type.key) ? type.key : "unknown"}.svg" alt="" width="${size === "map" ? 36 : 64}" height="${size === "map" ? 24 : 43}" decoding="async"></span>`;
}

export function markerHTML(v) {
  return `${artwork(v.type, "map")}<span class="vm-badge" aria-hidden="true">${v.emergency ? "!" : SYMBOLS[v.category]}</span>${v.heading !== null ? `<span class="vm-heading" style="transform:rotate(${v.heading}deg)" aria-hidden="true"><i></i></span>` : ""}`;
}
export function markerName(v) { return `${v.label}, ${v.type.label}, ${statusText(v)}, ${v.previousPoint ? "poslední známá poloha, " : ""}${ageText(v)}`; }
export function legendHTML() {
  return `<h2>Ikony a stavy</h2><p>Pracovní náhled: dočasné siluety z dodaného balíčku. Čeká se na finální realistické ikony k návrhu OpenArt 2.0.</p><div class="vm-legend-art">${Object.entries(TYPES).map(([key, t]) => `<div>${artwork({ key, ...t })}<span>${escape(t.label)}</span></div>`).join("")}</div>
    <p>Typ vychází z doložené evidence. Neurčená nástavba zůstává označená otazníkem.</p><p>› Jede · ■ Stojí · ◷ Stará poloha · ? Neověřeno</p><p>Stará poloha zůstává na mapě s původním časem GPS. Obnova dat neznamená nový GPS vzorek.</p>`;
}
