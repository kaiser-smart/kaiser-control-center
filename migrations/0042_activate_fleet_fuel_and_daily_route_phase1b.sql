ALTER TABLE vehicle_tracking_history_runs ADD COLUMN fleet_aliases_seen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vehicle_tracking_history_runs ADD COLUMN fleet_aliases_written INTEGER NOT NULL DEFAULT 0;

ALTER TABLE fleet_orwii_fuel_sync_runs ADD COLUMN reprocessed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fleet_orwii_fuel_sync_runs ADD COLUMN stored_transaction_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fleet_orwii_fuel_sync_runs ADD COLUMN stored_matched_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_external_aliases_plate
  ON fleet_vehicle_external_aliases(normalized_license_plate, external_system, status);

INSERT OR IGNORE INTO module_rules (
  id, module_key, title, description, type, status, conditions_json, actions_json,
  is_automation, trigger_type, schedule_cron, event_name, cloud_runner,
  last_run_at, next_run_at, last_run_status, last_run_message,
  created_by_user_id, created_at, updated_by_user_id, updated_at
) VALUES
(
  'collection-routes-vistos-snapshot-15m',
  'collection-routes',
  'Read-only Vistos snapshot každých 15 minut',
  'Cloudový runner načte Vistos pouze pro čtení a uloží auditovaný snapshot do D1. Nic nezapisuje do Vistosu.',
  'automation', 'active',
  '{"source":"vistos-komunal","readOnly":true,"maxIntervalMinutes":15}',
  '{"writesD1Snapshot":true,"writesVistos":false,"sendsNotifications":false}',
  1, 'time', '*/15 * * * *', '', 'kaiser-module-automation-runner',
  NULL, NULL, NULL, 'Cloudový read-only snapshot je aktivní.',
  'migration-0042', strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0042', strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'collection-routes-daily-draft-preparation-phase1b',
  'collection-routes',
  'Automatická příprava návrhů denních tras',
  'Po čerstvém Vistos snapshotu připraví cloud pro dnešek a zítřek pouze nepotvrzené návrhy A/B/C. Trasy automaticky nepotvrdí, nespustí ani nedokončí.',
  'automation', 'active',
  '{"source":"latest-vistos-snapshot","dates":["today","tomorrow"],"maxSnapshotAgeMinutes":60,"requiresEligibleStops":true}',
  '{"createsDrafts":true,"autoConfirm":false,"autoStart":false,"autoComplete":false,"sendsNotifications":false,"writesExternalSystems":false}',
  1, 'time', '*/15 * * * *', '', 'kaiser-module-automation-runner',
  NULL, NULL, NULL, 'Fáze 1B čeká na první cloudový běh po nasazení.',
  'migration-0042', strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0042', strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'vehicle-tracking-fleet-master-alias-sync-phase1b',
  'vehicle-tracking',
  'Read-only master aliasy vozidel z T-Cars',
  'Každý GPS cloudový běh uloží do D1 jednoznačný technický klíč vozidla a normalizovanou SPZ pro serverové párování. T-Cars zůstává pouze čtecí zdroj.',
  'automation', 'active',
  '{"source":"tcars","readOnly":true,"requiresVehicleKey":true,"requiresLicensePlate":true}',
  '{"writesD1Aliases":true,"writesTcars":false,"changesPermissions":false}',
  1, 'time', '* * * * *', '', 'kaiser-vehicle-tracking-history-runner',
  NULL, NULL, NULL, 'Fáze 1B čeká na první GPS cloudový běh po nasazení.',
  'migration-0042', strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0042', strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'fleet-orwii-automatic-matching-phase1b',
  'fleet',
  'Automatické párování ORWII tankování na master flotilu',
  'Hodinový ORWII worker páruje pouze jednoznačně podle ORWII ID, palivového čipu nebo normalizované SPZ z D1 master aliasů a znovu vyhodnotí dříve nespárované transakce.',
  'automation', 'active',
  '{"priority":["orwiiVehicleId","fuelChipId","uniqueLicensePlate"],"requiresUniqueVehicle":true}',
  '{"writesD1Matches":true,"writesOrwii":false,"reprocessesStoredTransactions":true,"ambiguousRemainsUnmatched":true}',
  1, 'time', '17 * * * *', '', 'kaiser-orwii-fuel-sync-runner',
  NULL, NULL, NULL, 'Fáze 1B čeká na první ORWII cloudový běh po nasazení.',
  'migration-0042', strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0042', strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR IGNORE INTO module_rule_audit_log (
  id, rule_id, module_key, action, changed_by_user_id, changed_at, before_json, after_json, note
) VALUES
(
  'collection-routes-vistos-snapshot-15m-created-0042',
  'collection-routes-vistos-snapshot-15m', 'collection-routes', 'created', 'migration-0042',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL,
  '{"status":"active","readOnly":true,"cron":"*/15 * * * *"}',
  'Doplněna pravdivá evidence již běžícího snapshotu.'
),
(
  'collection-routes-daily-draft-preparation-phase1b-created',
  'collection-routes-daily-draft-preparation-phase1b', 'collection-routes', 'created', 'migration-0042',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL,
  '{"status":"active","phase":"cloud-draft-preparation","autoConfirm":false}',
  'Schválená Fáze 1B. Automatizace vytváří pouze nepotvrzené návrhy.'
),
(
  'vehicle-tracking-fleet-master-alias-sync-phase1b-created',
  'vehicle-tracking-fleet-master-alias-sync-phase1b', 'vehicle-tracking', 'created', 'migration-0042',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL,
  '{"status":"active","readOnlySource":true,"writesD1Aliases":true}',
  'Schválená Fáze 1B. T-Cars zůstává read-only.'
),
(
  'fleet-orwii-automatic-matching-phase1b-created',
  'fleet-orwii-automatic-matching-phase1b', 'fleet', 'created', 'migration-0042',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL,
  '{"status":"active","priority":["orwiiVehicleId","fuelChipId","uniqueLicensePlate"],"externalWrites":false}',
  'Schválená Fáze 1B. Nejednoznačné tankování zůstává nespárované.'
);
