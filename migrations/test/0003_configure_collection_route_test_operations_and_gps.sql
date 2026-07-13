CREATE TABLE IF NOT EXISTS collection_route_test_gps_confirmations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  source_row_id TEXT NOT NULL,
  vehicle_code TEXT NOT NULL DEFAULT '',
  driver_user_id TEXT NOT NULL DEFAULT '',
  driver_name TEXT NOT NULL DEFAULT '',
  address_latitude REAL,
  address_longitude REAL,
  measured_latitude REAL NOT NULL,
  measured_longitude REAL NOT NULL,
  accuracy_m REAL NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  speed_mps REAL,
  distance_from_address_m REAL,
  status TEXT NOT NULL DEFAULT 'driver-measured',
  routing_candidate INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'driver-tablet-gps',
  idempotency_key TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  reviewed_by_user_id TEXT NOT NULL DEFAULT '',
  reviewed_by_name TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES collection_daily_route_runs(id),
  FOREIGN KEY (stop_id) REFERENCES collection_daily_route_stops(id),
  FOREIGN KEY (source_row_id) REFERENCES collection_import_rows(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_test_gps_idempotency
  ON collection_route_test_gps_confirmations(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_gps_run
  ON collection_route_test_gps_confirmations(run_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_gps_source
  ON collection_route_test_gps_confirmations(source_row_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_gps_review
  ON collection_route_test_gps_confirmations(status, routing_candidate, captured_at DESC);

UPDATE collection_route_here_settings
SET status = 'test-estimate',
    config_json = '{"configurationMode":"test-estimate","requiredVehicleCodes":["A","B","C"],"depot":{"name":"Kaiser servis - centrální dispečink","address":"Trnkova 3052/137, 628 00 Brno","latitude":49.19125931950087,"longitude":16.670211574110382,"coordinateSource":"GIS Brno - adresní bod","routingPointStatus":"needs-entrance-verification"},"shift":{"start":"06:00","end":"16:00","timezone":"Europe/Prague","dataQuality":"test-estimate"},"gpsCapture":{"minimumSamples":3,"maxAccuracyMeters":30,"routingCandidateAccuracyMeters":15,"stationarySpeedMps":1.5,"reviewDistanceMeters":150},"dumpSites":[{"id":"sako-brno","name":"SAKO Brno","address":"Jedovnická 4247/2, 628 00 Brno","latitude":49.19056218872404,"longitude":16.66621358334898,"coordinateSource":"GIS Brno - adresní bod","routingPointStatus":"needs-entrance-verification","role":"primary","wasteTypes":["SKO"],"serviceMinutes":15,"serviceTimeQuality":"test-estimate","openingHours":"06:00-17:00"},{"id":"hamburger-recycling-brno","name":"Hamburger Recycling CZ","address":"Pratecká 788/12, 620 00 Brno-Tuřany","latitude":49.14649687282897,"longitude":16.671452714143694,"coordinateSource":"GIS Brno - adresní bod","routingPointStatus":"needs-entrance-verification","role":"primary","wasteTypes":["PAPIR"],"serviceMinutes":15,"serviceTimeQuality":"test-estimate","openingHours":"06:00-14:30"},{"id":"fcc-brno","name":"FCC Brno","address":"Líšeňská 2755/35, 636 00 Brno","latitude":49.19774432445633,"longitude":16.664411593633194,"coordinateSource":"GIS Brno - adresní bod","routingPointStatus":"needs-krtinska-gate-verification","role":"primary","wasteTypes":["PLAST"],"serviceMinutes":15,"serviceTimeQuality":"test-estimate","openingHours":"06:00-16:00"},{"id":"fertia-blansko","name":"Fertia - kompostárna Blansko","address":"Blansko 2483, 678 01 Blansko","latitude":49.3476372,"longitude":16.6456418,"coordinateSource":"OpenStreetMap - adresní bod","routingPointStatus":"needs-entrance-verification","role":"bio-blansko-only","wasteTypes":["BIO"],"serviceMinutes":15,"serviceTimeQuality":"test-estimate","openingHours":"PO/ST/PÁ dle letního nebo zimního režimu"},{"id":"skladka-bratcice","name":"Skládka Bratčice","address":"Bratčice 237, 664 67 Bratčice","latitude":49.0590764,"longitude":16.5174123,"coordinateSource":"OpenStreetMap - adresní bod","routingPointStatus":"needs-entrance-verification","role":"fallback","wasteTypes":["SKO"],"serviceMinutes":15,"serviceTimeQuality":"test-estimate","openingHours":"čeká na provozní potvrzení"}],"vehicles":[{"code":"A","registration":"3BN 3558","capacitiesTons":{"SKO":6,"PAPIR":2,"PLAST":1},"truck":{"heightCm":400,"widthCm":255,"lengthCm":1000,"grossWeightKg":26000,"currentWeightKg":18000,"weightPerAxleKg":11500},"technicalDataQuality":"conservative-test-estimate","technicalDataSource":"čeká na technický průkaz nebo potvrzený model nástavby"},{"code":"B","registration":"1BP 8373","capacitiesTons":{"SKO":6,"PAPIR":2,"PLAST":1},"truck":{"heightCm":400,"widthCm":255,"lengthCm":1000,"grossWeightKg":26000,"currentWeightKg":18000,"weightPerAxleKg":11500},"technicalDataQuality":"conservative-test-estimate","technicalDataSource":"čeká na technický průkaz nebo potvrzený model nástavby"},{"code":"C","registration":"3BE 2831","capacitiesTons":{"SKO":8,"PAPIR":2.5,"PLAST":1},"truck":{"heightCm":400,"widthCm":255,"lengthCm":1000,"grossWeightKg":26000,"currentWeightKg":20000,"weightPerAxleKg":11500},"technicalDataQuality":"conservative-test-estimate","technicalDataSource":"čeká na technický průkaz nebo potvrzený model nástavby"}]}' ,
    updated_at = CURRENT_TIMESTAMP
WHERE scope = 'test';
