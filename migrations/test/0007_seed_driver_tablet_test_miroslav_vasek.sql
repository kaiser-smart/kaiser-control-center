-- Izolovaný řidičský TEST s oddělenou přihlašovací a fyzickou TEST identitou.
-- Tato migrace patří výhradně do COLLECTION_ROUTES_TEST_DB.

INSERT OR IGNORE INTO collection_daily_route_runs (
  id,
  route_key,
  source_batch_id,
  source_mode,
  route_date,
  route_day_code,
  route_week_mode,
  vehicle_code,
  vehicle_registration,
  vehicle_label,
  driver_user_id,
  driver_name,
  title,
  status,
  stop_count,
  excluded_count,
  metadata_json,
  created_by_user_id,
  created_by_name,
  confirmed_by_user_id,
  confirmed_by_name,
  confirmed_at,
  created_at,
  updated_at
)
SELECT
  'collection-daily-route-test-tablet-miroslav-vasek-20260717',
  '2026-07-17|FIELD|driver-tablet-test|pneumatiky-miroslav-vasek',
  batch.id,
  'synthetic-brno-test',
  '2026-07-17',
  'PÁ',
  'lichý týden',
  'FIELD',
  '',
  'Stacionární TEST tabletu · bez jízdy',
  'pneumatiky-miroslav-vasek',
  'Miroslav Vašek',
  'IZOLOVANÝ TEST tabletu · Firma test 501 · bez jízdy',
  'confirmed',
  1,
  0,
  json_object(
    'dataScope', 'test',
    'testMode', 'stationary-field-test',
    'fieldTestSourceId', 'test-field-site-501',
    'physicalTesterName', 'Tomáš Gaží',
    'driverAddressingName', 'Miroslave',
    'testAccessPolicy', 'assigned-driver-only',
    'stationaryNoDrive', json('true'),
    'createsOperationalRoute', json('false'),
    'externalEffectsDisabled', json('true'),
    'notificationsDisabled', json('true'),
    'sendsNotifications', json('false'),
    'customerCommunication', 'disabled',
    'dispatcherCommunication', 'disabled',
    'sms', 'disabled',
    'email', 'disabled',
    'rcs', 'disabled',
    'vistosWritesDisabled', json('true'),
    'productionRouteWritesDisabled', json('true')
  ),
  'pneumatiky-miroslav-vasek',
  'Miroslav Vašek',
  'pneumatiky-miroslav-vasek',
  'Miroslav Vašek',
  '2026-07-17T08:00:00.000Z',
  '2026-07-17T08:00:00.000Z',
  '2026-07-17T08:00:00.000Z'
FROM collection_import_batches AS batch
WHERE batch.id = 'collection-import-batch-test-brno-500-v2'
  AND EXISTS (
    SELECT 1
    FROM collection_import_rows
    WHERE id = 'collection-import-row-test-brno-v2-0501'
      AND batch_id = batch.id
      AND source_id = 'test-field-site-501'
  );

INSERT OR IGNORE INTO collection_daily_route_stops (
  id,
  run_id,
  route_date,
  source_batch_id,
  source_row_id,
  route_order,
  customer_name,
  address_text,
  station_name,
  waste_type,
  waste_code,
  container_volume,
  container_count,
  container_type,
  frequency,
  pickup_days_text,
  contract_number,
  source_contract_id,
  note,
  status,
  source_summary_json,
  created_at,
  updated_at
)
SELECT
  'collection-daily-stop-test-tablet-miroslav-vasek-501',
  run.id,
  run.route_date,
  source.batch_id,
  source.id,
  1,
  COALESCE(json_extract(source.summary_json, '$.customerName'), 'Firma test 501'),
  'Trnkova 3052/137, 628 00 Brno',
  COALESCE(json_extract(source.summary_json, '$.stationName'), 'Firma test 501 · stanoviště Trnkova'),
  COALESCE(json_extract(source.summary_json, '$.wasteType'), 'SKO'),
  COALESCE(json_extract(source.summary_json, '$.wasteCode'), '200301'),
  COALESCE(json_extract(source.summary_json, '$.containerVolume'), 120),
  COALESCE(json_extract(source.summary_json, '$.containerCount'), 1),
  COALESCE(json_extract(source.summary_json, '$.containerType'), 'nádoba'),
  COALESCE(json_extract(source.summary_json, '$.frequency'), '1x7'),
  COALESCE(json_extract(source.summary_json, '$.pickupDaysText'), 'středa lichá, středa sudá'),
  COALESCE(json_extract(source.summary_json, '$.contractNumber'), 'TEST-501'),
  COALESCE(json_extract(source.summary_json, '$.sourceContractId'), 'test-contract-field-501'),
  'IZOLOVANÝ TEST · bez jízdy · nic se neodesílá a Vistos ani ostré trasy se nemění.',
  'planned',
  source.summary_json,
  '2026-07-17T08:00:00.000Z',
  '2026-07-17T08:00:00.000Z'
FROM collection_daily_route_runs AS run
JOIN collection_import_rows AS source
  ON source.id = 'collection-import-row-test-brno-v2-0501'
 AND source.batch_id = run.source_batch_id
 AND source.source_id = 'test-field-site-501'
WHERE run.id = 'collection-daily-route-test-tablet-miroslav-vasek-20260717';

INSERT OR IGNORE INTO collection_daily_route_events (
  id,
  run_id,
  event_type,
  before_status,
  after_status,
  reason,
  note,
  idempotency_key,
  actor_user_id,
  actor_name,
  created_at,
  payload_json
)
SELECT
  'collection-daily-event-test-tablet-miroslav-vasek-created',
  run.id,
  'route_created',
  '',
  'confirmed',
  'isolated-driver-tablet-test',
  'Jeden izolovaný TEST bod byl připraven bez jízdy a bez externích dopadů.',
  'seed:test-tablet:miroslav-vasek:20260717',
  'pneumatiky-miroslav-vasek',
  'Miroslav Vašek',
  '2026-07-17T08:00:00.000Z',
  json_object(
    'dataScope', 'test',
    'externalEffectsDisabled', json('true'),
    'notificationsDisabled', json('true'),
    'vistosWritesDisabled', json('true'),
    'productionRouteWritesDisabled', json('true')
  )
FROM collection_daily_route_runs AS run
WHERE run.id = 'collection-daily-route-test-tablet-miroslav-vasek-20260717';
