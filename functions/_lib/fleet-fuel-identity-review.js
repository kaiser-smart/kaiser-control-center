import { getCoreDatabase, getArchiveDatabase } from "./databases.js";
import { resolveFleetVehicleIdentityAt } from "./fleet-temporal-evidence.js";
const text = value => String(value ?? "").trim();
const plate = value => text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
const chip = value => text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
const MAX_ROWS = 20000;
export const FUEL_IDENTITY_REVIEW_VERSION = "1";
function metadata(row) {
  try { return JSON.parse(row.metadata_json || "{}"); } catch { return {}; }
}
function identityError(code, status = 503) {
  return Object.assign(new Error("Podklady pro kontrolu identit nejsou úplné."), { code, status });
}
function matches(row, tx) {
  return (row.external_system === "orwii_vehicle_id" && text(tx.orwii_vehicle_id) && text(row.external_key) === text(tx.orwii_vehicle_id))
    || (row.external_system === "orwii_fuel_chip" && chip(tx.fuel_chip_id) && chip(row.external_key) === chip(tx.fuel_chip_id))
    || (plate(tx.license_plate) && plate(row.normalized_license_plate) === plate(tx.license_plate));
}
export function reviewFuelIdentityRows(transactions = [], aliases = [], originalIds = null) {
  const verified = aliases.flatMap(row => {
    const meta = metadata(row);
    // A high legacy confidence or a current plate is not historical evidence.
    if (meta.historicalIdentityVerified !== true || !text(meta.sourceEvidenceId)
      || !["vistos", "tcars", "orwii"].includes(meta.sourceSystem)) return [];
    const alias = { ...row, verified: true, source_system: meta.sourceSystem };
    return [alias, ...(plate(row.normalized_license_plate) ? [{ ...alias, external_system: "license_plate", external_key: plate(row.normalized_license_plate) }] : [])];
  });
  const rows = transactions.map(tx => {
    const candidates = [...new Set(aliases.filter(row => row.status === "active" && matches(row, tx)).map(row => text(row.vehicle_id)).filter(Boolean))].sort();
    const signals = [
      { system: "orwii_vehicle_id", value: tx.orwii_vehicle_id },
      { system: "orwii_fuel_chip", value: tx.fuel_chip_id },
      { system: "license_plate", value: tx.license_plate }
    ];
    const resolved = resolveFleetVehicleIdentityAt(verified, signals, text(tx.occurred_at));
    const strong = resolveFleetVehicleIdentityAt(verified, signals.slice(0, 2), text(tx.occurred_at));
    const reasons = [];
    let status = "needs_evidence";
    if (resolved.status === "ambiguous" || candidates.length > 1) {
      status = "conflict"; reasons.push("conflicting_vehicle_identifiers");
    } else if (resolved.status === "matched" && strong.status === "matched" && resolved.vehicleId === strong.vehicleId) {
      status = "verified";
    } else {
      if (!text(tx.orwii_vehicle_id) && !chip(tx.fuel_chip_id)) reasons.push("source_vehicle_or_chip_missing");
      if (!plate(tx.license_plate) && !text(tx.orwii_vehicle_id) && !chip(tx.fuel_chip_id)) {
        status = "unidentifiable"; reasons.push("all_vehicle_identifiers_missing");
      } else if (!candidates.length) reasons.push("identity_reference_missing");
      reasons.push(...resolved.reasons);
      if (resolved.status === "matched" && strong.status !== "matched") reasons.push("plate_only_evidence_insufficient");
      if (candidates.length) reasons.push("source_evidence_and_validity_required");
    }
    if (status === "verified" && text(tx.matched_vehicle_id) && text(tx.matched_vehicle_id) !== resolved.vehicleId) {
      status = "conflict"; reasons.push("stored_match_disagrees_with_verified_identity");
    }
    return {
      transactionId: text(tx.external_id), occurredAt: text(tx.occurred_at), licensePlate: text(tx.license_plate),
      storedMatchStatus: text(tx.match_status), storedVehicleId: text(tx.matched_vehicle_id),
      reviewStatus: status, proposedVehicleId: status === "verified" ? resolved.vehicleId : null,
      candidateVehicleIds: candidates, reasons: [...new Set(reasons)], evidenceIds: resolved.evidenceIds,
      originalUnmatched: originalIds ? originalIds.has(text(tx.external_id)) : null
    };
  });
  const count = items => items.reduce((result, row) => {
    result[row.reviewStatus] = (result[row.reviewStatus] || 0) + 1; return result;
  }, { total: items.length, verified: 0, conflict: 0, needs_evidence: 0, unidentifiable: 0 });
  const reasons = {};
  for (const row of rows) for (const reason of row.reasons) reasons[reason] = (reasons[reason] || 0) + 1;
  const present = new Set(rows.map(row => row.transactionId));
  return { rows, summary: count(rows), reasons,
    originalCohort: originalIds ? { available: true, expected: originalIds.size,
      missing: [...originalIds].filter(id => !present.has(id)).length,
      summary: count(rows.filter(row => row.originalUnmatched)) } : { available: false }
  };
}
export async function loadFuelIdentityReview(env = {}, options = {}) {
  const core = getCoreDatabase(env), archive = getArchiveDatabase(env);
  const [aliasResult, transactionResult] = await Promise.all([
    core.prepare("SELECT id,vehicle_id,external_system,external_key,normalized_license_plate,status,match_method,valid_from,valid_to,metadata_json,updated_at FROM fleet_vehicle_external_aliases WHERE external_system IN ('tcars','vistos','orwii_vehicle_id','orwii_fuel_chip') ORDER BY id LIMIT 20001").all(),
    archive.prepare("SELECT external_id,occurred_at,license_plate,orwii_vehicle_id,fuel_chip_id,matched_vehicle_id,match_status,updated_at FROM fleet_orwii_fuel_transactions ORDER BY external_id LIMIT 20001").all()
  ]);
  if (aliasResult.success === false || transactionResult.success === false || !Array.isArray(aliasResult.results) || !Array.isArray(transactionResult.results)) throw identityError("identity_review_read_failed");
  if (aliasResult.results.length > MAX_ROWS || transactionResult.results.length > MAX_ROWS) throw identityError("identity_review_scan_limit", 422);
  let originalIds = null;
  try {
    const backup = await archive.prepare("SELECT external_id FROM fleet_orwii_fuel_backup_20261022 WHERE COALESCE(match_status,'unmatched') <> 'matched' ORDER BY external_id LIMIT 20001").all();
    if (backup.success === false || !Array.isArray(backup.results)) throw identityError("identity_review_backup_read_failed");
    if (backup.results.length > MAX_ROWS) throw identityError("identity_review_scan_limit", 422);
    originalIds = new Set(backup.results.map(row => text(row.external_id)));
  } catch (error) {
    if (!/no such table.*fleet_orwii_fuel_backup_20261022/i.test(String(error.message))) throw error;
  }
  const review = reviewFuelIdentityRows(transactionResult.results, aliasResult.results, originalIds);
  const filtered = options.cohort === "original" ? review.rows.filter(row => row.originalUnmatched === true) : review.rows;
  const offset = options.offset || 0, limit = options.limit || 100;
  return { ...review, rows: filtered.slice(offset, offset + limit),
    pagination: { offset, limit, total: filtered.length, nextOffset: offset + limit < filtered.length ? offset + limit : null },
    apiStatus: "ready", readOnly: true, writes: false, completeScan: true, crossDatabaseAtomicSnapshot: false,
    calculationVersion: FUEL_IDENTITY_REVIEW_VERSION, generatedAt: new Date().toISOString(),
    source: { identities: "CORE", transactions: "ARCHIVE", originalCohort: "fleet_orwii_fuel_backup_20261022" },
    message: "Čtecí kontrola nepřepisuje uložená přiřazení. Ověření vyžaduje zdrojový doklad a časovou platnost; samotná dnešní SPZ nestačí."
  };
}
