import { TYPES, SYMBOLS, ageText, statusText } from "./model.js";
export function escape(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
// Exact pixels supplied by the user in OpenArt. These bounds only select each
// item from the unchanged atlas; no drawing, recoloring or generated replacement.
export const VEHICLE_SPRITES = Object.freeze({
  collection: [103, 303, 768, 380], skip: [53, 131, 502, 296],
  truck: [173, 107, 273, 178], hook: [560, 72, 314, 213],
  tanker: [143, 340, 333, 161], container: [556, 340, 331, 161],
  car: [174, 569, 259, 118], van: [567, 544, 302, 144],
  excavator: [167, 707, 319, 216], forklift: [575, 730, 261, 187]
});
const typeSprite = { box_body: "container", collection_truck: "collection", truck: "truck", tanker: "tanker", skip_loader: "skip", container_truck: "hook", car: "car", van: "van", excavator: "excavator", forklift: "forklift" };
// Remove the supplied near-white canvas at render time, including white wheel
// and window openings. The original atlas remains byte-for-byte unchanged.
export const artworkFilterHTML = `<svg class="vm-art-filters" aria-hidden="true"><defs><filter id="vm-white-canvas" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 -1.4 0 1.33"/></filter></defs></svg>`;
export function artwork(type, size = "list") {
  const key = typeSprite[type.key], crop = VEHICLE_SPRITES[key];
  if (!crop) return `<span class="vm-art vm-art--${size} vm-art-neutral" aria-hidden="true">${escape(type.monogram || TYPES[type.key]?.monogram || "?")}</span>`;
  const source = key === "collection" ? ["collection-truck.png",934,882] : key === "skip" ? ["skip-loader.png",584,520] : ["atlas.png",1024,1024];
  const [x,y,w,h] = crop, scale = Math.min((size === "map" ? 36 : 64) / w, (size === "map" ? 24 : 43) / h);
  return `<span class="vm-art vm-art--${size}" aria-hidden="true"><span class="vm-sprite" data-vm-artwork="${key}" style="width:${w*scale}px;height:${h*scale}px"><img src="vehicles/openart-2/${source[0]}" alt="" width="${source[1]}" height="${source[2]}" decoding="async" style="width:${source[1]*scale}px;height:${source[2]*scale}px;left:${-x*scale}px;top:${-y*scale}px"></span></span>`;
}

export function markerHTML(v) {
  return `${artwork(v.type, "map")}<span class="vm-badge" aria-hidden="true">${v.emergency ? "!" : SYMBOLS[v.category]}</span>${v.heading !== null ? `<span class="vm-heading" style="transform:rotate(${v.heading}deg)" aria-hidden="true"><i></i></span>` : ""}`;
}
export function markerName(v) { return `${v.label}, ${v.type.label}, ${statusText(v)}, ${v.previousPoint ? "poslední známá poloha, " : ""}${ageText(v)}`; }
export function legendHTML() {
  return `<h2>Ikony a stavy</h2><p>Dodaná sada OpenArt. Popelářský vůz, ramenový nakladač RAM a hákový nosič mají vlastní dodané siluety; typ určuje doložená evidence. Přívěs, neurčená a obecná speciální technika používají neutrální zkratku, protože v sadě nemají vlastní ikonu.</p><div class="vm-legend-art">${Object.entries(TYPES).map(([key, t]) => `<div>${artwork({ key, ...t })}<span>${escape(t.label)}</span></div>`).join("")}</div>
    <p>Typ vychází z doložené evidence. Neurčená nástavba zůstává označená otazníkem.</p><p>› Jede · ■ Stojí · ◷ Stará poloha · ? Neověřeno</p><p>Stará poloha zůstává na mapě s původním časem GPS. Obnova dat neznamená nový GPS vzorek.</p>`;
}
