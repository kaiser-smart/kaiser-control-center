import { validateJobAssignmentSegments } from "./fleet-temporal-evidence.js";
export const FLEET_FUEL_CALCULATION_VERSION = "performed-price-internal-phm-time-v1";
const text = value => String(value ?? "").trim();
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" });
const ms = value => typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
const money = value => Number.isSafeInteger(value) && value >= 0;
function midnight(date) {
  const center = Date.parse(date + "T00:00:00Z");
  let low = center - 36 * 3600000, high = center + 36 * 3600000;
  while (low < high) { const middle = Math.floor((low + high) / 2); if (dateFormatter.format(new Date(middle)) < date) low = middle + 1; else high = middle; }
  return low;
}
export function fleetFuelMonthWindow(month, asOf) {
  const now = ms(asOf);
  if (!Number.isFinite(now)) throw new TypeError("Explicit calculation time with timezone required");
  const wanted = month || dateFormatter.format(new Date(now)).slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(wanted) || Number(wanted.slice(0, 4)) < 1970) throw new TypeError("Invalid calendar month");
  const next = new Date(Date.UTC(Number(wanted.slice(0, 4)), Number(wanted.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const startMs = midnight(wanted + "-01"), endMs = Math.min(now, midnight(next));
  if (endMs <= startMs) throw new TypeError("Calculation period is in the future or empty");
  return { month: wanted, timeZone: "Europe/Prague", from: new Date(startMs).toISOString(), to: new Date(endMs).toISOString(), startMs, endMs };
}
function coversPeriod(evidence, period) {
  return evidence?.complete === true && ms(evidence.from) <= period.startMs && ms(evidence.to) >= period.endMs;
}
function timeIntervals(evidence, period) {
  if (!coversPeriod(evidence, period) || !Array.isArray(evidence.intervals)) return null;
  const values = [];
  for (const interval of evidence.intervals) {
    const from = ms(interval.from), to = ms(interval.to);
    if (!["vistos", "tcars"].includes(interval.sourceSystem) || !text(interval.sourceId) || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
    if (to > period.startMs && from < period.endMs) values.push([Math.max(from, period.startMs), Math.min(to, period.endMs)]);
  }
  values.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const value of values) { const last = merged.at(-1); if (last && value[0] <= last[1]) last[1] = Math.max(last[1], value[1]); else merged.push([...value]); }
  return merged;
}
function distributeMinor(total, weights) {
  const denominator = weights.reduce((sum, row) => sum + row.duration, 0);
  if (!denominator || !Number.isSafeInteger(denominator)) return null;
  const parts = weights.map(row => { const product = BigInt(total) * BigInt(row.duration); return { ...row, amount: Number(product / BigInt(denominator)), remainder: product % BigInt(denominator) }; });
  let remaining = total - parts.reduce((sum, row) => sum + row.amount, 0);
  parts.sort((a, b) => a.remainder === b.remainder ? a.key.localeCompare(b.key) : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < remaining; i++) parts[i].amount++;
  return parts;
}
export function calculateFleetJobContribution(input = {}) {
  const period = fleetFuelMonthWindow(input.month, input.asOf);
  const currency = text(input.currency), vatBasis = text(input.vatBasis);
  const jobs = Array.isArray(input.jobs) ? input.jobs : [];
  const fuel = (Array.isArray(input.fuel) ? input.fuel : []).filter(row => { const at = ms(row.occurredAt); return !Number.isFinite(at) || at >= period.startMs && at < period.endMs; });
  const reasons = [];
  if (!/^[A-Z]{3}$/.test(currency)) reasons.push("currency_unverified");
  if (!["net", "gross"].includes(vatBasis)) reasons.push("vat_basis_unverified");
  if (!coversPeriod(input.sourceCoverage, period)) reasons.push("orwii_period_incomplete");
  const fuelIds = new Set();
  for (const row of fuel) {
    if (!text(row.id) || fuelIds.has(row.id)) reasons.push("fuel_id_missing_or_duplicate");
    fuelIds.add(row.id);
    if (!Number.isFinite(ms(row.occurredAt))) reasons.push("fuel_time_missing");
    if (!money(row.amountMinor) || row.priceVerified !== true || row.valueBasis !== "orwii_internal") reasons.push("orwii_internal_value_unverified");
    if (row.currency !== currency) reasons.push("fuel_currency_conversion_required");
    if (row.vatBasis !== vatBasis) reasons.push("fuel_vat_basis_mismatch_or_unknown");
  }
  const base = { calculationVersion: FLEET_FUEL_CALCULATION_VERSION, label: "příspěvek po PHM", fuelLabel: "rozpočítané PHM", period, currency, vatBasis, source: { revenue: "vistos_performed_job", fuel: "orwii_internal_value", allocation: "documented_time" }, lastSuccessfulSync: input.sourceCoverage?.lastSuccessfulSync || null };
  if (reasons.length) return { ...base, complete: false, status: "blocked", reasons: [...new Set(reasons)], inputTotalMinor: null, allocatedMinor: null, unallocatedMinor: null, allocations: [], unallocatedFuel: fuel.map(row => ({ id: row.id, amountMinor: row.amountMinor ?? null, currency: row.currency ?? null, vatBasis: row.vatBasis ?? null })), jobs: jobs.map(row => ({ id: row.id, contributionMinor: null, complete: false })) };
  const inputTotalMinor = fuel.reduce((sum, row) => sum + row.amountMinor, 0);
  if (!money(inputTotalMinor)) throw new RangeError("Fuel sum exceeds exact minor-unit range");
  const validated = validateJobAssignmentSegments(input.assignments || []);
  const jobIds = new Set(), duplicateJobs = new Set();
  for (const job of jobs) { if (jobIds.has(job.id) || !text(job.id)) duplicateJobs.add(job.id); jobIds.add(job.id); }
  const blockedJobs = new Set([...validated.blockedJobIds, ...duplicateJobs]);
  const vehicles = new Set([...fuel.map(row => text(row.vehicleId)), ...validated.segments.map(row => row.vehicleId)]);
  const allocations = [], unallocatedFuel = [], unavailableVehicles = new Set();
  for (const vehicleId of vehicles) {
    const total = fuel.filter(row => text(row.vehicleId) === vehicleId).reduce((sum, row) => sum + row.amountMinor, 0);
    const evidence = (input.timeEvidence || []).filter(row => row.vehicleId === vehicleId);
    const intervals = vehicleId && evidence.length === 1 ? timeIntervals(evidence[0], period) : null;
    const duration = intervals?.reduce((sum, row) => sum + row[1] - row[0], 0) || 0;
    const candidates = validated.segments.filter(row => row.vehicleId === vehicleId && jobIds.has(row.jobId) && !blockedJobs.has(row.jobId) && row.endMs > period.startMs && row.startMs < period.endMs);
    const weights = new Map();
    let conflict = false;
    for (const segment of candidates) {
      const from = Math.max(segment.startMs, period.startMs), to = Math.min(segment.endMs, period.endMs);
      const covered = intervals?.reduce((sum, row) => sum + Math.max(0, Math.min(to, row[1]) - Math.max(from, row[0])), 0) || 0;
      if (covered !== to - from) conflict = true;
      weights.set(segment.jobId, (weights.get(segment.jobId) || 0) + covered);
    }
    const assigned = [...weights.values()].reduce((sum, value) => sum + value, 0);
    if (!vehicleId || !duration || conflict || assigned > duration) {
      unavailableVehicles.add(vehicleId);
      unallocatedFuel.push({ vehicleId: vehicleId || null, amountMinor: total, reason: !vehicleId ? "fuel_vehicle_unmatched" : "documented_time_incomplete_or_conflicting" });
      continue;
    }
    const shares = distributeMinor(total, [...weights].map(([key, duration]) => ({ key, duration })).concat([{ key: "~unallocated", duration: duration - assigned }]));
    for (const share of shares) {
      if (share.key === "~unallocated") { if (share.amount) unallocatedFuel.push({ vehicleId, amountMinor: share.amount, reason: "documented_time_without_job" }); }
      else allocations.push({ vehicleId, jobId: share.key, amountMinor: share.amount, documentedMilliseconds: share.duration });
    }
  }
  const allocatedMinor = allocations.reduce((sum, row) => sum + row.amountMinor, 0), unallocatedMinor = unallocatedFuel.reduce((sum, row) => sum + row.amountMinor, 0);
  if (allocatedMinor + unallocatedMinor !== inputTotalMinor) throw new Error("Fuel conservation invariant failed");
  const unknownVehicle = fuel.some(row => !text(row.vehicleId));
  const jobResults = jobs.map(job => {
    const issues = [];
    const segments = validated.segments.filter(row => row.jobId === job.id);
    if (duplicateJobs.has(job.id)) issues.push("job_id_missing_or_duplicate");
    if (job.sourceSystem !== "vistos" || !text(job.sourceId) || job.state !== "performed" || job.priceVerified !== true || !money(job.amountMinor)) issues.push("performed_vistos_price_unverified");
    if (job.currency !== currency || job.vatBasis !== vatBasis) issues.push("job_currency_or_vat_basis_unverified");
    if (job.assignmentsComplete !== true || !segments.length || blockedJobs.has(job.id) || segments.some(row => unavailableVehicles.has(row.vehicleId))) issues.push("job_assignment_time_incomplete_or_conflicting");
    if (unknownVehicle) issues.push("unmatched_fuel_may_affect_job");
    const allocatedFuelMinor = allocations.filter(row => row.jobId === job.id).reduce((sum, row) => sum + row.amountMinor, 0);
    return { id: job.id, revenueMinor: money(job.amountMinor) ? job.amountMinor : null, allocatedFuelMinor, contributionMinor: issues.length ? null : job.amountMinor - allocatedFuelMinor, complete: issues.length === 0, reasons: issues };
  });
  const complete = jobResults.every(row => row.complete) && unallocatedMinor === 0 && validated.complete;
  return { ...base, status: complete ? "complete" : "incomplete", complete, reasons: [...new Set([...(unallocatedMinor ? ["fuel_remains_unallocated"] : []), ...jobResults.flatMap(row => row.reasons)])], inputTotalMinor, allocatedMinor, unallocatedMinor, allocations, unallocatedFuel, assignmentIssues: validated.issues, jobs: jobResults };
}
