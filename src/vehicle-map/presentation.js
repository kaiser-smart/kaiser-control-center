import { TYPES, SYMBOLS, ageText, statusText } from "./model.js";
export function escape(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function artwork(type, size = "list") {
  const exportSize = size === "map" ? "128x96" : "256x192";
  return `<span class="vm-art vm-art--${size}" aria-hidden="true">${type.image
    ? `<img src="vehicles/openart/${type.key}-${exportSize}.webp" alt="" width="${size === "map" ? 48 : size === "detail" ? 108 : 48}" height="${size === "map" ? 36 : size === "detail" ? 81 : 36}" decoding="async">`
    : `<span class="vm-monogram">${escape(type.monogram || "?")}</span>`}</span>`;
}
export function markerHTML(v) {
  return `${artwork(v.type, "map")}<span class="vm-badge" aria-hidden="true">${v.emergency ? "!" : SYMBOLS[v.category]}</span>${v.heading !== null ? `<span class="vm-heading" style="transform:rotate(${v.heading}deg)" aria-hidden="true"><i></i></span>` : ""}`;
}
export function markerName(v) { return `${v.label}, ${v.type.label}, ${statusText(v)}, ${v.previousPoint ? "poslední známá poloha, " : ""}${ageText(v)}`; }
export function legendHTML() {
  return `<h2>Ikony a stavy</h2><div class="vm-legend-art">${Object.entries(TYPES).filter(([, t]) => t.image).map(([key, t]) => `<div>${artwork({ key, ...t })}<span>${escape(t.label)}</span></div>`).join("")}</div>
    <div class="vm-legend-mono">${Object.values(TYPES).filter((t) => !t.image).map((t) => `<p><b>${escape(t.monogram)}</b> ${escape(t.label)}</p>`).join("")}</div>
    <p>Kontejnerové vozidlo bez doloženého podtypu: <b>?</b></p>
    <p>› Jede · ■ Stojí · ◷ Stará poloha · ? Neověřeno</p><p>Obrázky jsou ilustrace podle referenčních vozidel. Bílá dlaždice zůstává v obou motivech.</p>`;
}
