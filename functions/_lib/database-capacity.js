export const DEFAULT_D1_MAX_BYTES = 10_000_000_000;

export const CAPACITY_THRESHOLDS = Object.freeze({
  information: 60,
  warning: 70,
  reduceLogging: 80,
  accelerateArchive: 85,
  critical: 90,
  blockBulkMigrations: 95
});

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function capacityPercent(sizeBytes, maxBytes = DEFAULT_D1_MAX_BYTES) {
  const maximum = Math.max(1, finiteNumber(maxBytes, DEFAULT_D1_MAX_BYTES));
  return Math.max(0, (finiteNumber(sizeBytes) / maximum) * 100);
}

export function capacityState(sizeBytes, maxBytes = DEFAULT_D1_MAX_BYTES) {
  const percent = capacityPercent(sizeBytes, maxBytes);
  let level = "ok";
  if (percent >= CAPACITY_THRESHOLDS.blockBulkMigrations) level = "blocked";
  else if (percent >= CAPACITY_THRESHOLDS.critical) level = "critical";
  else if (percent >= CAPACITY_THRESHOLDS.accelerateArchive) level = "archive";
  else if (percent >= CAPACITY_THRESHOLDS.reduceLogging) level = "reduced_logging";
  else if (percent >= CAPACITY_THRESHOLDS.warning) level = "warning";
  else if (percent >= CAPACITY_THRESHOLDS.information) level = "information";

  return {
    sizeBytes: finiteNumber(sizeBytes),
    maxBytes: Math.max(1, finiteNumber(maxBytes, DEFAULT_D1_MAX_BYTES)),
    percent,
    level,
    reduceNonEssentialLogging: percent >= CAPACITY_THRESHOLDS.reduceLogging,
    accelerateArchive: percent >= CAPACITY_THRESHOLDS.accelerateArchive,
    criticalIncident: percent >= CAPACITY_THRESHOLDS.critical,
    blockBulkMigrations: percent >= CAPACITY_THRESHOLDS.blockBulkMigrations
  };
}

export function estimateDaysToFull(samples, maxBytes = DEFAULT_D1_MAX_BYTES) {
  const normalized = (Array.isArray(samples) ? samples : [])
    .map((sample) => ({
      at: new Date(sample?.recordedAt || sample?.at || 0).getTime(),
      sizeBytes: finiteNumber(sample?.sizeBytes)
    }))
    .filter((sample) => Number.isFinite(sample.at) && sample.at > 0)
    .sort((left, right) => left.at - right.at);

  if (normalized.length < 2) return null;
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  const elapsedDays = (last.at - first.at) / 86_400_000;
  const growthPerDay = elapsedDays > 0 ? (last.sizeBytes - first.sizeBytes) / elapsedDays : 0;
  if (growthPerDay <= 0) return null;
  return Math.max(0, (maxBytes - last.sizeBytes) / growthPerDay);
}

export function migrationCapacityPreflight({
  currentSizeBytes,
  estimatedTableBytes = 0,
  estimatedIndexBytes = 0,
  indexedRowCount = 0,
  maxBytes = DEFAULT_D1_MAX_BYTES,
  bookmark = "",
  rollbackCommand = ""
} = {}) {
  const projectedSizeBytes = finiteNumber(currentSizeBytes)
    + Math.max(0, finiteNumber(estimatedTableBytes))
    + Math.max(0, finiteNumber(estimatedIndexBytes));
  const current = capacityState(currentSizeBytes, maxBytes);
  const projected = capacityState(projectedSizeBytes, maxBytes);
  const errors = [];

  if (!String(bookmark || "").trim()) errors.push("Chybí Time Travel bookmark.");
  if (!String(rollbackCommand || "").trim()) errors.push("Chybí rollback příkaz.");
  if (current.percent >= CAPACITY_THRESHOLDS.accelerateArchive) {
    errors.push(`Cílová databáze je už zaplněná na ${current.percent.toFixed(2)} %.`);
  }
  if (projected.percent >= CAPACITY_THRESHOLDS.accelerateArchive) {
    errors.push(`Migrace by zvýšila zaplnění na ${projected.percent.toFixed(2)} %.`);
  }
  if (finiteNumber(indexedRowCount) >= 1_000_000) {
    errors.push(`Index by vznikal nad ${Math.trunc(finiteNumber(indexedRowCount)).toLocaleString("cs-CZ")} řádky.`);
  }

  return {
    allowed: errors.length === 0,
    current,
    projected,
    estimatedTableBytes: Math.max(0, finiteNumber(estimatedTableBytes)),
    estimatedIndexBytes: Math.max(0, finiteNumber(estimatedIndexBytes)),
    indexedRowCount: Math.max(0, Math.trunc(finiteNumber(indexedRowCount))),
    bookmarkPresent: Boolean(String(bookmark || "").trim()),
    rollbackPresent: Boolean(String(rollbackCommand || "").trim()),
    errors
  };
}
