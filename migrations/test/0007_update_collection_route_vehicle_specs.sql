UPDATE collection_route_here_settings
SET config_json = json_set(
      config_json,
      '$.vehicleTechnicalDataVersion', 'confirmed-2026-07-17',
      '$.vehicleTechnicalDataStatus', 'confirmed-with-axle-data-missing',
      '$.vehicles', json('[
        {
          "code":"A",
          "registration":"3BN 3558",
          "capacitiesTons":{"SKO":5.5,"PAPIR":2,"PLAST":1},
          "truck":{"heightCm":350,"widthCm":240,"lengthCm":850,"emptyWeightKg":13500,"grossWeightKg":19000,"currentWeightKg":19000,"payloadCapacityKg":5500,"weightPerAxleKg":null},
          "technicalDataQuality":"confirmed",
          "technicalDataSource":"Radim Opluštil · 17. 7. 2026",
          "axleDataQuality":"missing"
        },
        {
          "code":"B",
          "registration":"1BP 8373",
          "capacitiesTons":{"SKO":5.8,"PAPIR":2,"PLAST":1},
          "truck":{"heightCm":350,"widthCm":240,"lengthCm":850,"emptyWeightKg":13200,"grossWeightKg":19000,"currentWeightKg":19000,"payloadCapacityKg":5800,"weightPerAxleKg":null},
          "technicalDataQuality":"confirmed",
          "technicalDataSource":"Radim Opluštil · 17. 7. 2026",
          "axleDataQuality":"missing"
        },
        {
          "code":"C",
          "registration":"3BE 2831",
          "capacitiesTons":{"SKO":9.6,"PAPIR":2.5,"PLAST":1},
          "truck":{"heightCm":350,"widthCm":240,"lengthCm":940,"emptyWeightKg":15400,"grossWeightKg":25000,"currentWeightKg":25000,"payloadCapacityKg":9600,"weightPerAxleKg":null},
          "technicalDataQuality":"confirmed",
          "technicalDataSource":"Radim Opluštil · 17. 7. 2026",
          "axleDataQuality":"missing"
        }
      ]')
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE scope = 'test'
  AND json_valid(config_json);
