import { TYPES, statusText } from "./model.js";
export function escape(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
// Exact pixels supplied by the user in OpenArt. These bounds only select each
// item from the unchanged atlas; no drawing, recoloring or generated replacement.
export const VEHICLE_SPRITES = Object.freeze({
  collection: [103, 303, 768, 380], skip: [53, 131, 502, 296],
  container_compact: [60, 190, 620, 380], van_passenger: [43, 80, 260, 150], tanker_compact: [155, 76, 840, 420],
  truck: [173, 107, 273, 178], hook: [560, 72, 314, 213],
  tanker: [143, 340, 333, 161], container: [556, 340, 331, 161],
  car: [174, 569, 259, 118], van: [567, 544, 302, 144],
  excavator: [167, 707, 319, 216], forklift: [575, 730, 261, 187]
});
const typeSprite = { box_body_compact: "container_compact", van_passenger: "van_passenger", tanker_compact: "tanker_compact", box_body: "container", collection_truck: "collection", truck: "truck", tanker: "tanker", skip_loader: "skip", container_truck: "hook", car: "car", van: "van", excavator: "excavator", forklift: "forklift" };
// Remove the supplied near-white canvas at render time, including white wheel
// and window openings. The original atlas remains byte-for-byte unchanged.
export const artworkFilterHTML = `<svg class="vm-art-filters" aria-hidden="true"><defs><filter id="vm-white-canvas" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 -1.4 0 1.33"/></filter></defs></svg>`;
export function artwork(type, size = "list") {
  const key = typeSprite[type.key], crop = VEHICLE_SPRITES[key];
  if (!crop) return `<span class="vm-art vm-art--${size} vm-art-neutral" aria-hidden="true">${escape(type.monogram || TYPES[type.key]?.monogram || "?")}</span>`;
  const suppliedSources = { container_compact: ["container-compact.png",698,642], van_passenger: ["van-passenger.png",308,280], tanker_compact: ["tanker-compact.png",1074,636] };
  const source = suppliedSources[key] || (key === "collection" ? ["collection-truck.png",934,882] : key === "skip" ? ["skip-loader.png",584,520] : ["atlas.png",1024,1024]);
  const [x,y,w,h] = crop, scale = Math.min((size === "map" ? 36 : 64) / w, (size === "map" ? 24 : 43) / h);
  return `<span class="vm-art vm-art--${size}" aria-hidden="true"><span class="vm-sprite" data-vm-artwork="${key}" style="width:${w*scale}px;height:${h*scale}px"><img src="vehicles/openart-2/${source[0]}" alt="" width="${source[1]}" height="${source[2]}" decoding="async" style="width:${source[1]*scale}px;height:${source[2]*scale}px;left:${-x*scale}px;top:${-y*scale}px"></span></span>`;
}

// Availability is presentation only; the normalized GPS category remains unchanged.
export function isOnline(v) {
  return Boolean(v.point && !v.previousPoint && v.category !== "stale" && v.category !== "missing" && Number.isFinite(v.age) && v.age >= 0);
}
// An explicit last known ignition state does not expire with the GPS position.
// Never infer ignition from speed, connectivity, or a missing provider value.
export function ignitionState(v) {
  return typeof v.ignition === "boolean" ? v.ignition : null;
}
const ignitionDayFormat = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Prague" });
const ignitionTimeFormat = new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Prague" });
export function ignitionName(v, now = Date.now()) {
  const state = ignitionState(v);
  if (state === null) return "Zapalování nezjištěno";
  const label = `Zapalování ${state ? "zapnuto" : "vypnuto"}`;
  const time = Date.parse(v.ignitionAt);
  if (!Number.isFinite(time) || time <= Date.UTC(1900, 0, 1) || time > now + 120000) return `${label} · čas posledního stavu nezjištěn`;
  const day = ignitionDayFormat.format(time), today = ignitionDayFormat.format(now);
  return `${label} · poslední stav ${day === today ? "dnes" : day} ${ignitionTimeFormat.format(time)}`;
}
export function ignitionHTML(v, extraClass = "") {
  const state = ignitionState(v);
  return `<span class="vm-ignition vm-ignition-${state === null ? "unknown" : state ? "on" : "off"} ${extraClass}" data-vm-ignition="${escape(v.id)}" role="img" aria-label="${ignitionName(v)}" title="${ignitionName(v)}">${state === null ? "—" : ""}</span>`;
}
export function clusterIgnition(members) {
  const states = members.map(ignitionState), on = states.filter(s => s === true).length, off = states.filter(s => s === false).length;
  const uniform = on === states.length ? true : off === states.length ? false : null;
  return { html: states.length && uniform !== null ? `<span class="vm-cluster-clock vm-ignition vm-ignition-${uniform ? "on" : "off"}" aria-hidden="true"></span>` : "",
    label: `Zapalování: ${on} zapnuto, ${off} vypnuto, ${states.length - on - off} neověřeno.` };
}
export function movementText(v) { return ["stale", "missing"].includes(v.category) ? "" : statusText(v); }
export function stateHTML(v, speed = false) {
  return `<span class="vm-state">${ignitionHTML(v)}${escape(movementText(v))}${speed && v.speed !== null && v.category === "moving" ? ` · ${v.speed} km/h` : ""}</span>`;
}
export function vehicleArtworkType(v) { return v.artworkKey ? { key: v.artworkKey } : v.type; }
export function markerHTML(v) {
  return `${artwork(vehicleArtworkType(v), "map")}${ignitionHTML(v, "vm-badge")}${v.emergency ? '<span class="vm-emergency-badge" aria-label="Mimořádná událost">!</span>' : ""}${v.heading !== null ? `<span class="vm-heading" style="transform:rotate(${v.heading}deg)" aria-hidden="true"><i></i></span>` : ""}`;
}
// A speed label is current only within the existing 120 s GPS window.
// Never present the last known historical speed as a current reading.
export function currentSpeed(v) {
  return v.point && !v.previousPoint && !["stale", "missing"].includes(v.category)
    && Number.isFinite(v.age) && v.age >= 0 && v.age <= 120
    && Number.isFinite(v.speed) && v.speed >= 0 ? v.speed : null;
}
export function markerLabelHTML(v) {
  const speed = currentSpeed(v);
  return `<span class="vm-label-plate">${escape(v.label)}</span><span class="vm-label-speed" title="${speed === null ? "Aktuální rychlost není dostupná" : "Aktuální rychlost"}">${speed === null ? "—" : escape(speed)}<span class="vm-label-unit"> km/h</span></span>`;
}
export function markerName(v) { return [v.label, v.type.label, movementText(v), currentSpeed(v) === null ? "" : `${currentSpeed(v)} km/h`, ignitionName(v)].filter(Boolean).join(", "); }
export function legendHTML() {
  return `<h2>Ikony a stavy</h2><p>Dodaná sada OpenArt. Popelářský vůz, ramenový nakladač RAM a hákový nosič mají vlastní dodané siluety; typ určuje doložená evidence. Přívěs, neurčená a obecná speciální technika používají neutrální zkratku, protože v sadě nemají vlastní ikonu.</p><div class="vm-legend-art">${Object.entries(TYPES).map(([key, t]) => `<div>${artwork({ key, ...t })}<span>${escape(t.label)}</span></div>`).join("")}</div>
    <p>Typ vychází z doložené evidence. Neurčená nástavba zůstává označená otazníkem.</p><p><span class="vm-ignition vm-ignition-on" aria-hidden="true"></span> Zapalování zapnuto · <span class="vm-ignition vm-ignition-off" aria-hidden="true"></span> Zapalování vypnuto</p><p>Tečka ukazuje poslední známé zapalování. Čas stavu zjistíte najetím na tečku nebo klepnutím na tečku v detailu. Pomlčka znamená, že zapalování nebylo zjištěno.</p>`;
}

// Presentation eligibility only: reuse the existing 120 s current-GPS window
// used by heading/detail; never change the underlying movement/category.
export function hasCurrentMotion(v) {
  return Boolean(v.point && !v.previousPoint && v.category === "moving" && v.movement === "moving"
    && Number.isFinite(v.age) && v.age >= 0 && v.age <= 120);
}
