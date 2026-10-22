// Pure, read-only rules. Callers supply persisted evidence; no current alias
// or display name is silently substituted for a historical identity.
const SYSTEMS = new Set(["vistos", "tcars", "orwii_vehicle_id", "orwii_fuel_chip", "license_plate"]);
const SOURCES = new Set(["vistos", "tcars", "orwii"]);
const text = value => String(value ?? "").trim();
function key(system, value) {
  const raw = text(value);
  if (system === "license_plate") return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (system === "orwii_fuel_chip") return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return raw;
}
function instant(value) { return typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN; }
function aliasAt(alias, time) {
  const from = instant(alias.valid_from);
  const to = alias.valid_to ? instant(alias.valid_to) : Infinity;
  return SOURCES.has(alias.source_system) && alias.verified === true
    && ["active", "historical"].includes(alias.status)
    && Number.isFinite(from) && to > from && time >= from && time < to
    && text(alias.vehicle_id) && text(alias.id);
}
export function resolveFleetVehicleIdentityAt(aliases = [], signals = [], occurredAt = "") {
  const time = instant(occurredAt);
  if (!Number.isFinite(time)) return { status: "unmatched", vehicleId: null, reasons: ["transaction_time_missing"], evidenceIds: [] };
  const evidence = [];
  const candidates = new Set();
  const missing = [];
  for (const signal of signals) {
    const system = text(signal.system);
    const wanted = key(system, signal.value);
    if (!SYSTEMS.has(system) || !wanted) continue;
    const matches = aliases.filter(alias => alias.external_system === system && key(system, alias.external_key) === wanted && aliasAt(alias, time));
    if (!matches.length) missing.push(system);
    for (const match of matches) { candidates.add(match.vehicle_id); evidence.push(match.id); }
  }
  const evidenceIds = [...new Set(evidence)].sort();
  if (candidates.size > 1) return { status: "ambiguous", vehicleId: null, reasons: ["conflicting_vehicle_identifiers"], candidateVehicleIds: [...candidates].sort(), evidenceIds };
  if (!candidates.size) return { status: "unmatched", vehicleId: null, reasons: ["verified_identity_at_transaction_time_missing"], missingSignals: [...new Set(missing)], evidenceIds };
  return { status: "matched", vehicleId: [...candidates][0], reasons: [], missingSignals: [...new Set(missing)], evidenceIds };
}
export function validateJobAssignmentSegments(input = []) {
  const segments = [];
  const issues = [];
  const seen = new Map();
  for (const row of input) {
    const id = text(row.id);
    const jobId = text(row.jobId);
    const reasons = [];
    if (!id || seen.has(id)) reasons.push("assignment_id_missing_or_duplicate");
    if (seen.has(id)) issues.push({ id, jobId: seen.get(id), reasons: ["assignment_id_missing_or_duplicate"] });
    else seen.set(id, jobId);
    if (!jobId) reasons.push("job_id_missing");
    if (row.sourceSystem !== "vistos" || !text(row.sourceId)) reasons.push("vistos_assignment_evidence_missing");
    if (!text(row.vehicleId) || row.vehicleVerified !== true) reasons.push("vehicle_identity_unverified");
    if (!text(row.driverPersonId) || row.driverVerified !== true) reasons.push("driver_person_id_unverified");
    const from = instant(row.validFrom), to = instant(row.validTo);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) reasons.push("assignment_time_missing_or_invalid");
    if (reasons.length) { issues.push({ id, jobId, reasons }); continue; }
    segments.push({ ...row, id, jobId, vehicleId: text(row.vehicleId), driverPersonId: text(row.driverPersonId), startMs: from, endMs: to });
  }
  segments.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length && segments[j].startMs < segments[i].endMs; j++) {
      const a = segments[i], b = segments[j];
      if (a.vehicleId === b.vehicleId || a.driverPersonId === b.driverPersonId) {
        for (const row of [a, b]) issues.push({ id: row.id, jobId: row.jobId, reasons: ["overlapping_vehicle_or_driver_assignment"], conflictingSegmentId: row === a ? b.id : a.id });
      }
    }
  }
  const blockedJobs = new Set(issues.map(issue => issue.jobId));
  return { segments, issues, blockedJobIds: [...blockedJobs].sort(), complete: issues.length === 0 };
}
