-- Potvrzené technické profily nahrazují dřívější konzervativní TEST odhady.
-- Zatížení náprav zůstává záměrně neuvedené: nebylo potvrzeno a nesmí se odhadovat.

UPDATE collection_route_here_settings
SET status = 'ready',
    config_json = json_set(
      config_json,
      '$.configurationMode', 'confirmed-vehicle-profiles',
      '$.vehicles[0].truck.heightCm', 350,
      '$.vehicles[0].truck.widthCm', 240,
      '$.vehicles[0].truck.lengthCm', 850,
      '$.vehicles[0].truck.grossWeightKg', 19000,
      '$.vehicles[0].truck.currentWeightKg', 19000,
      '$.vehicles[0].truck.weightPerAxleKg', NULL,
      '$.vehicles[0].emptyWeightKg', 13500,
      '$.vehicles[0].payloadCapacityKg', 5500,
      '$.vehicles[0].technicalDataQuality', 'owner-confirmed',
      '$.vehicles[0].technicalDataSource', 'fleet_vehicle_technical_profiles:3BN3558',
      '$.vehicles[1].truck.heightCm', 350,
      '$.vehicles[1].truck.widthCm', 240,
      '$.vehicles[1].truck.lengthCm', 850,
      '$.vehicles[1].truck.grossWeightKg', 19000,
      '$.vehicles[1].truck.currentWeightKg', 19000,
      '$.vehicles[1].truck.weightPerAxleKg', NULL,
      '$.vehicles[1].emptyWeightKg', 13200,
      '$.vehicles[1].payloadCapacityKg', 5800,
      '$.vehicles[1].technicalDataQuality', 'owner-confirmed',
      '$.vehicles[1].technicalDataSource', 'fleet_vehicle_technical_profiles:1BP8373',
      '$.vehicles[2].truck.heightCm', 350,
      '$.vehicles[2].truck.widthCm', 240,
      '$.vehicles[2].truck.lengthCm', 940,
      '$.vehicles[2].truck.grossWeightKg', 25000,
      '$.vehicles[2].truck.currentWeightKg', 25000,
      '$.vehicles[2].truck.weightPerAxleKg', NULL,
      '$.vehicles[2].emptyWeightKg', 15400,
      '$.vehicles[2].payloadCapacityKg', 9600,
      '$.vehicles[2].technicalDataQuality', 'owner-confirmed',
      '$.vehicles[2].technicalDataSource', 'fleet_vehicle_technical_profiles:3BE2831'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE scope = 'test';
