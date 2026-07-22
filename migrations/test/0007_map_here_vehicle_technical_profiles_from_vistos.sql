-- TEST only: HERE reads the physical vehicle profile from Vistos Vehicle.
-- No record is written back to Vistos and no operational route is created by this migration.
UPDATE collection_route_here_settings
SET config_json = json_set(
      config_json,
      '$.vehicleTechnicalSource', 'vistos-vehicle',
      '$.useVistosHomeDepot', json('true'),
      '$.vehicleTechnicalDataStatus', 'awaiting-vistos-schema-confirmation'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE scope = 'test'
  AND json_valid(config_json);
