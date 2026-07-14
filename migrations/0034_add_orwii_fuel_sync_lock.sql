-- Only one cloud ORWII synchronization may write the D1 mirror at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_orwii_fuel_single_running
ON fleet_orwii_fuel_sync_runs(status)
WHERE status = 'running';
