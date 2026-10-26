import { approvedArtworkKey } from "./approved-icons.js";
// Pure presentation model. No storage, network, GPS inference or fleet enum mutation.
export const TYPES = Object.freeze({
  collection_truck: { label: "Svozové vozidlo", image: true },
  tanker: { label: "Cisterna", image: true },
  skip_loader: { label: "Ramenový nosič", image: true },
  van: { label: "Dodávka", image: true },
  container_truck: { label: "Hákový nosič", monogram: "HÁK" },
  car: { label: "Osobní vůz", monogram: "OS" },
  trailer: { label: "Přívěs / návěs", monogram: "PŘ" },
  special: { label: "Speciální technika", monogram: "SP" },
  truck: { label: "Nákladní vůz", image: true },
  excavator: { label: "Bagr", image: true },
  forklift: { label: "Vysokozdvižný vozík", image: true },
  unknown: { label: "Neurčený typ", monogram: "?" }
});
// Exact individual artwork assignments already present at c37cd96 in
// VEHICLE_TRACKING_CUSTOM_ICON_BY_LICENSE_PLATE. Never use the text/brand regexes.
export const VERIFIED_BODY_BY_PLATE = Object.freeze({
  "1BI4520": "tanker", "9C83570": "tanker", "5B14417": "tanker", "5E73753": "tanker", "1BC3390": "tanker",
  "3BH5548": "skip_loader", "5B80857": "skip_loader", "3BP2836": "skip_loader", "2BR0904": "skip_loader",
  "8B43007": "container_truck", "1BM1150": "container_truck", "3BF1394": "container_truck",
  "1BR6359": "container_truck", "2BD8835": "container_truck", "3BP5305": "container_truck", "3BI2007": "container_truck"
});
export const CATEGORIES = Object.freeze({ all: "Všechna", moving: "Jede", stopped: "Stojí", stale: "Stará poloha", missing: "Bez polohy", unknown: "Stav neznámý" });
export const SYMBOLS = Object.freeze({ moving: "›", stopped: "■", stale: "◷", missing: "?", unknown: "?" });
export function number(value) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function searchKey(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f\s]/g, "").toLowerCase(); }
const text = (value) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const first = (...values) => values.map(text).find(Boolean) || "";
export function vehicleKey(item, scope = "authorized") {
  const v = item.vehicle || {};
  const canonical = first(item.vehicleId, item.canonicalVehicleId, v.vehicleId, v.canonicalVehicleId);
  if (canonical) return `${scope}:vehicle:${canonical}`;
  const provider = first(item.externalProvider, item.gpsProvider, v.externalProvider, "tcars");
  const org = first(item.organizationId, v.organizationId, scope);
  const external = first(item.externalVehicleId, item.tcarsVehicleId, v.externalVehicleId, v.tcarsVehicleId);
  if (external) return `${org}:${provider}:vehicle:${external}`;
  const unit = first(item.externalUnitId, item.tcarsUnitId, v.externalUnitId, v.tcarsUnitId);
  return unit ? `${org}:${provider}:unit:${unit}` : "";
}
export function presentationType(item) {
  const v = item.vehicle || item;
  const plate = searchKey(first(item.licensePlate, v.licensePlate)).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const individual = VERIFIED_BODY_BY_PLATE[plate];
  if (individual) return { key: individual, ...TYPES[individual] };
  // Only explicit evidence fields, never a derived iconType or a nickname.
  const declared = first(v.bodyType, v.vehicleType, typeof v.type === "object" ? v.type?.name : v.type);
  const aliases = { "nakladnivuz": "truck", "bagr": "excavator", "vzv": "forklift", "vysokozdviznyvozik": "forklift", "svozovevozidlo": "collection_truck", "dodavka": "van", "osobnivozidlo": "car", "specialnitechnika": "special", "prives/naves": "trailer", "kontejnerovevozidlo": "container_truck", "hakovynosic": "hook_loader", "ramenovynosic": "skip_loader", "ramenovynakladac": "skip_loader", "ram": "skip_loader", "popelarskyvuz": "collection_truck", "cisterna": "tanker" };
  let key = aliases[searchKey(declared)] || declared;
  if (key === "hook_loader") key = "container_truck";
  else if (key === "container_truck") return { key: "unknown", label: "Kontejnerové vozidlo", monogram: "?" };
  return { key: TYPES[key] ? key : "unknown", ...(TYPES[key] || TYPES.unknown) };
}
export function validateSample(sample, now) {
  if (!sample) return { valid: false, reason: "GPS vzorek není dostupný", time: null };
  const latitude = number(sample.latitude), longitude = number(sample.longitude);
  const time = typeof sample.lastGpsAt === "string" && sample.lastGpsAt.trim() ? Date.parse(sample.lastGpsAt) : NaN;
  let reason = "";
  if (sample.gpsValid === false) reason = "Poskytovatel označil GPS vzorek jako neplatný";
  else if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) reason = "Chybějící nebo neplatné souřadnice";
  // Preserve the existing T-Cars sentinel policy. Zero is not globally invalid geography.
  else if (latitude === 0 || longitude === 0) reason = "Nulová souřadnice – význam T-Cars není ověřen";
  else if (!Number.isFinite(time) || time <= Date.UTC(1900, 0, 1)) reason = "Chybějící nebo neplatný čas GPS";
  else if (time > now + 120000) reason = "Čas GPS je více než 120 s v budoucnosti";
  return { valid: !reason, reason, time: Number.isFinite(time) ? time : null, latitude, longitude, clockSkew: time > now && time <= now + 120000 };
}
const timeOrder = (s, now) => {
  const t = validateSample(s, now).time;
  // An invalid future clock must not permanently poison later valid updates.
  return t !== null && t <= now + 120000 ? t : -Infinity;
};
/** Merge an authoritative authorized response; only records in this response survive.
 * `previous` is current-session memory, never browser persistence. */
export function reconcile(payload, previous = new Map(), { now = Date.now(), scope = "authorized" } = {}) {
  const records = new Map(), aliases = new Map();
  const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];
  const locations = Array.isArray(payload.locations) ? payload.locations : [];
  for (const v of [...vehicles, ...locations]) {
    const key = vehicleKey(v, scope);
    if (!key) continue;
    const externalKey = vehicleKey({ ...v, vehicleId: "", canonicalVehicleId: "", vehicle: { ...(v.vehicle || {}), vehicleId: "", canonicalVehicleId: "" } }, scope);
    if (key.includes(`${scope}:vehicle:`) && externalKey) aliases.set(externalKey, key);
  }
  const keyOf = (v) => { const k = vehicleKey(v, scope); return aliases.get(k) || k; };
  const add = (v, index) => {
    const stable = keyOf(v);
    const key = stable || `unverified:${index}`;
    if (!records.has(key)) records.set(key, { key, stable: !!stable, vehicle: v.vehicle || v, incoming: [] });
    return records.get(key);
  };
  vehicles.forEach((v, i) => add(v, i));
  locations.forEach((s, i) => add(s, vehicles.length + i).incoming.push(s));
  const known = Array.isArray(payload.lastKnownLocations) ? payload.lastKnownLocations : [];
  for (const record of records.values()) {
    const old = previous.get(record.key);
    const incoming = record.incoming.sort((a, b) => timeOrder(b, now) - timeOrder(a, now));
    const latestIncoming = incoming[0];
    // Invalid undated samples are explicitly reported, not silently promoted by receipt time.
    let latest = latestIncoming || old?.latest || null;
    if (old?.latest && latestIncoming && timeOrder(latestIncoming, now) !== -Infinity && timeOrder(old.latest, now) > timeOrder(latestIncoming, now)) latest = old.latest;
    const valid = [...incoming, ...known.filter((s) => keyOf(s) === record.key), old?.lastValid]
      .filter((s) => s && validateSample(s, now).valid).sort((a, b) => timeOrder(b, now) - timeOrder(a, now));
    record.latest = latest;
    record.lastValid = record.stable ? valid[0] || null : null;
    delete record.incoming;
  }
  return records;
}
export function normalize(records, { now = Date.now(), staleAfterSeconds = 1800 } = {}) {
  const threshold = number(staleAfterSeconds) > 0 ? Number(staleAfterSeconds) : 1800;
  const result = [...records.values()].map((record) => {
    const latest = record.latest, check = validateSample(latest, now);
    const pointSample = record.stable ? (check.valid ? latest : record.lastValid) : null;
    const pointCheck = validateSample(pointSample, now);
    const hasPoint = pointCheck.valid;
    const previousPoint = hasPoint && !check.valid;
    const sample = previousPoint ? pointSample : latest || {};
    const speedRaw = number(sample.speedKmh), speed = speedRaw !== null && speedRaw >= 0 ? speedRaw : null;
    const movement = speed === null ? "unknown" : speed > 2 ? "moving" : "stopped";
    const age = hasPoint ? Math.max(0, (now - pointCheck.time) / 1000) : null;
    const category = !hasPoint ? "missing" : age > threshold ? "stale" : movement;
    const v = record.vehicle || {}, s = latest || {};
    const type = presentationType({ ...s, vehicle: v });
    const plate = first(s.licensePlate, v.licensePlate), internal = first(s.internalNumber, v.internalNumber);
    const name = first(v.name, v.model, s.name, s.model);
    const heading = number(sample.heading);
    return {
      id: record.key, stable: record.stable, type, artworkKey: approvedArtworkKey(record), plate, internal, name,
      label: plate || internal || name || "Vozidlo bez označení",
      category, movement, speed, ignition: typeof sample.ignition === "boolean" ? sample.ignition : null,
      emergency: sample.emergency === true, previousPoint, age, clockSkew: pointCheck.clockSkew,
      point: hasPoint ? { lat: pointCheck.latitude, lng: pointCheck.longitude } : null,
      lastGpsAt: hasPoint ? pointSample.lastGpsAt : first(latest?.lastGpsAt),
      reason: !record.stable ? "Chybí ověřené stabilní ID vozidla" : check.reason,
      heading: hasPoint && !previousPoint && age <= 120 && movement === "moving" && heading !== null && heading >= 0 && heading <= 360 ? heading % 360 : null,
      address: hasPoint ? first(pointSample.address) : "",
      assignedDriver: first(v.assignedDriverName, v.responsiblePerson?.name),
      historyKey: first(s.externalVehicleId, v.externalVehicleId, s.tcarsVehicleId, v.tcarsVehicleId, s.vehicleId),
      odometer: number(sample.odometerKm), voltage: number(sample.voltage)
    };
  });
  const duplicateLabels = new Map();
  result.forEach((v) => duplicateLabels.set(v.label, (duplicateLabels.get(v.label) || 0) + 1));
  result.forEach((v) => { if (duplicateLabels.get(v.label) > 1 || !v.plate && !v.internal) v.label += ` · ${v.id}`; });
  return result.sort((a, b) => a.id.localeCompare(b.id, "cs", { numeric: true }));
}
export function filterVehicles(vehicles, query = "", category = "all") {
  const q = searchKey(query);
  const searched = vehicles.filter((v) => searchKey([v.plate, v.internal, v.name, v.type.label, v.assignedDriver].join(" ")).includes(q));
  const counts = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, 0]));
  searched.forEach((v) => { counts.all++; counts[v.category]++; });
  return { counts, vehicles: searched.filter((v) => category === "all" || category === v.category) };
}
export function ageText(v) {
  if (v.age === null) return "Čas GPS neověřen";
  if (v.age < 60) return "právě přijatý";
  if (v.age < 3600) return `před ${Math.floor(v.age / 60)} min`;
  if (v.age < 86400) return `před ${Math.floor(v.age / 3600)} h`;
  return `před ${Math.floor(v.age / 86400)} d`;
}
export function statusText(v) {
  return `${CATEGORIES[v.category]}${v.category === "stopped" && v.ignition === true ? " · zapalování zapnuto" : ""}`;
}
export function gpsTime(v) {
  const ms = Date.parse(v.lastGpsAt);
  return Number.isFinite(ms) ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Prague" }).format(ms) : "Neověřeno";
}
