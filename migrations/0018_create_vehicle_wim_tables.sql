CREATE TABLE IF NOT EXISTS vehicle_wim_sites (
  id TEXT PRIMARY KEY NOT NULL,
  road TEXT NOT NULL,
  km_label TEXT NOT NULL,
  location_label TEXT NOT NULL,
  orp TEXT,
  side_label TEXT NOT NULL,
  status TEXT NOT NULL,
  status_label TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  device_count INTEGER NOT NULL DEFAULT 0,
  source_label TEXT,
  source_date TEXT,
  coordinate_quality TEXT NOT NULL DEFAULT 'approximate-needs-verification',
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicle_wim_sites_road
  ON vehicle_wim_sites(road, km_label);

CREATE INDEX IF NOT EXISTS idx_vehicle_wim_sites_status
  ON vehicle_wim_sites(status);

CREATE TABLE IF NOT EXISTS vehicle_wim_devices (
  id TEXT PRIMARY KEY NOT NULL,
  site_id TEXT NOT NULL,
  side TEXT NOT NULL,
  km_value REAL,
  status TEXT NOT NULL,
  status_label TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicle_wim_devices_site
  ON vehicle_wim_devices(site_id);

CREATE TABLE IF NOT EXISTS vehicle_wim_alert_events (
  id TEXT PRIMARY KEY NOT NULL,
  site_id TEXT NOT NULL,
  vehicle_id TEXT,
  driver_id TEXT,
  license_plate TEXT,
  driver_phone_masked TEXT,
  distance_km REAL,
  heading_degrees REAL,
  approach_side TEXT,
  alert_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  error_code TEXT,
  dedupe_key TEXT,
  triggered_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicle_wim_alert_events_site
  ON vehicle_wim_alert_events(site_id, triggered_at);

CREATE INDEX IF NOT EXISTS idx_vehicle_wim_alert_events_vehicle
  ON vehicle_wim_alert_events(vehicle_id, triggered_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_wim_alert_events_dedupe
  ON vehicle_wim_alert_events(dedupe_key)
  WHERE dedupe_key IS NOT NULL AND dedupe_key <> '';

INSERT OR IGNORE INTO vehicle_wim_sites (
  id,
  road,
  km_label,
  location_label,
  orp,
  side_label,
  status,
  status_label,
  latitude,
  longitude,
  device_count,
  source_label,
  source_date,
  coordinate_quality,
  note,
  created_at,
  updated_at
) VALUES
('wim-d0-0781-modletice-jesenice', 'D0', 'km 78,1 / cca km 79', 'mezi Modleticemi a Jesenici', 'Cernosice', 'vpravo + vlevo', 'active', 'v provozu', 49.9706, 14.5288, 2, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'Pozn.: vpravo/vlevo podle dalnicniho staniceni. GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d1-1228-jihlava', 'D1', 'km 122,8-122,9', 'u Jihlavy', 'Jihlava', 'vlevo 122,8; vpravo 122,9', 'maintenance', 'oprava do 15. 6. 2025', 49.4298, 15.6395, 2, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d2-0083-zidlochovice', 'D2', 'km 8,3', 'u Brna / Zidlochovic', 'Zidlochovice', 'vpravo + vlevo', 'active', 'v provozu', 49.0907, 16.6422, 2, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d3-0919-sobeslav', 'D3', 'km 91,9', 'u Sobeslavi', 'Sobeslav', 'vpravo + vlevo', 'active', 'v provozu', 49.2595, 14.7196, 2, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d4-0096-jiloviste', 'D4', 'km 9,6', 'u Jiloviste', 'Cernosice', 'vpravo + vlevo', 'active', 'v provozu', 49.9224, 14.3461, 2, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d4-0599-pribram', 'D4', 'km 59,9', 'u Pribrami', 'Pribram', 'vpravo', 'active', 'v provozu', 49.6746, 14.0498, 1, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d4-0884-pisek', 'D4', 'km 88,4', 'u Pisku', 'Pisek', 'vlevo', 'active', 'v provozu', 49.3532, 14.0952, 1, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d5-0233-beroun', 'D5', 'km 23,3', 'u Berouna', 'Beroun', 'vlevo', 'planned', 'vystavba 3Q/4Q 2025', 49.9794, 14.0499, 1, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d5-1062-nyrany', 'D5', 'km 106,2', 'u Plzne / Nyran', 'Nyrany', 'vpravo', 'active', 'v provozu', 49.7155, 13.2147, 1, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d6-0112-unhost', 'D6', 'km 11,2', 'u Unhoste', 'Kladno', 'vpravo + vlevo', 'active', 'v provozu', 50.0867, 14.1876, 2, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d7-0670-louny', 'D7', 'km 67,0', 'u Loun', 'Louny', 'vpravo + vlevo', 'preselection', 'predvyber', 50.3402, 13.8182, 2, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d8-0050-brandys', 'D8', 'km 5,0', 'u Prahy / Brandysa', 'Brandys n. L. - St. Boleslav', 'vlevo', 'upgrade', 'technologicky upgrade', 50.1583, 14.4773, 1, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d8-0488-lovosice', 'D8', 'km 48,8', 'u Lovosic', 'Lovosice', 'vpravo + vlevo', 'active', 'v provozu', 50.5295, 14.0410, 2, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d10-0067-svemyslice', 'D10', 'km 6,7 / RSD km 5,70-5,75', 'u Svemyslic', 'Brandys n. L. - St. Boleslav', 'vpravo + vlevo', 'active', 'v provozu / ostry provoz planovan od 6/2025', 50.1282, 14.6167, 2, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d11-0782-hradec-kralove', 'D11', 'km 78,2', 'u Hradce Kralove', 'Hradec Kralove', 'vpravo + vlevo', 'active', 'v provozu', 50.1986, 15.7358, 2, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d35-2880-olomouc', 'D35', 'km 288,0', 'u Olomouce', 'Olomouc', 'vpravo + vlevo', 'active', 'v provozu', 49.5992, 17.2342, 2, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d48-0489-frydek-mistek', 'D48', 'km 48,9-49,8', 'u Frydku-Mistku', 'Frydek-Mistek', 'vlevo 48,9; vpravo 49,8', 'active', 'v provozu', 49.6870, 18.3509, 2, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-d55-0610-veseli-nad-moravou', 'D55', 'km 61,0', 'u Veseli nad Moravou', 'Veseli nad Moravou', 'vpravo + vlevo', 'planned', 'vystavba 3Q/4Q 2025', 48.9607, 17.3805, 2, 'MD/RSD PDF mapa, stav k 30. 6. 2025, prepsano ze zadani Radima', '2025-06-30', 'approximate-needs-verification', 'GPS bod je orientacni a potrebuje overit proti oficialni PDF mape.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO vehicle_wim_devices (
  id,
  site_id,
  side,
  km_value,
  status,
  status_label,
  note,
  created_at,
  updated_at
) VALUES
('wim-device-d0-0781-right', 'wim-d0-0781-modletice-jesenice', 'vpravo', 78.1, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d0-0781-left', 'wim-d0-0781-modletice-jesenice', 'vlevo', 78.1, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d1-1228-left', 'wim-d1-1228-jihlava', 'vlevo', 122.8, 'maintenance', 'oprava do 15. 6. 2025', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d1-1229-right', 'wim-d1-1228-jihlava', 'vpravo', 122.9, 'maintenance', 'oprava do 15. 6. 2025', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d2-0083-right', 'wim-d2-0083-zidlochovice', 'vpravo', 8.3, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d2-0083-left', 'wim-d2-0083-zidlochovice', 'vlevo', 8.3, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d3-0919-right', 'wim-d3-0919-sobeslav', 'vpravo', 91.9, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d3-0919-left', 'wim-d3-0919-sobeslav', 'vlevo', 91.9, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d4-0096-right', 'wim-d4-0096-jiloviste', 'vpravo', 9.6, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d4-0096-left', 'wim-d4-0096-jiloviste', 'vlevo', 9.6, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d4-0599-right', 'wim-d4-0599-pribram', 'vpravo', 59.9, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d4-0884-left', 'wim-d4-0884-pisek', 'vlevo', 88.4, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d5-0233-left', 'wim-d5-0233-beroun', 'vlevo', 23.3, 'planned', 'vystavba 3Q/4Q 2025', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d5-1062-right', 'wim-d5-1062-nyrany', 'vpravo', 106.2, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d6-0112-right', 'wim-d6-0112-unhost', 'vpravo', 11.2, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d6-0112-left', 'wim-d6-0112-unhost', 'vlevo', 11.2, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d7-0670-right', 'wim-d7-0670-louny', 'vpravo', 67.0, 'preselection', 'predvyber', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d7-0670-left', 'wim-d7-0670-louny', 'vlevo', 67.0, 'preselection', 'predvyber', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d8-0050-left', 'wim-d8-0050-brandys', 'vlevo', 5.0, 'upgrade', 'technologicky upgrade', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d8-0488-right', 'wim-d8-0488-lovosice', 'vpravo', 48.8, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d8-0488-left', 'wim-d8-0488-lovosice', 'vlevo', 48.8, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d10-0067-right', 'wim-d10-0067-svemyslice', 'vpravo', 6.7, 'active', 'v provozu / ostry provoz planovan od 6/2025', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d10-0067-left', 'wim-d10-0067-svemyslice', 'vlevo', 6.7, 'active', 'v provozu / ostry provoz planovan od 6/2025', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d11-0782-right', 'wim-d11-0782-hradec-kralove', 'vpravo', 78.2, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d11-0782-left', 'wim-d11-0782-hradec-kralove', 'vlevo', 78.2, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d35-2880-right', 'wim-d35-2880-olomouc', 'vpravo', 288.0, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d35-2880-left', 'wim-d35-2880-olomouc', 'vlevo', 288.0, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d48-0489-left', 'wim-d48-0489-frydek-mistek', 'vlevo', 48.9, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d48-0498-right', 'wim-d48-0489-frydek-mistek', 'vpravo', 49.8, 'active', 'v provozu', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d55-0610-right', 'wim-d55-0610-veseli-nad-moravou', 'vpravo', 61.0, 'planned', 'vystavba 3Q/4Q 2025', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('wim-device-d55-0610-left', 'wim-d55-0610-veseli-nad-moravou', 'vlevo', 61.0, 'planned', 'vystavba 3Q/4Q 2025', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO module_rules (
  id,
  module_key,
  title,
  description,
  type,
  status,
  conditions_json,
  actions_json,
  is_automation,
  trigger_type,
  schedule_cron,
  event_name,
  cloud_runner,
  last_run_at,
  next_run_at,
  last_run_status,
  last_run_message,
  created_by_user_id,
  created_at,
  updated_by_user_id,
  updated_at
) VALUES
(
  'vehicle-tracking-wim-layer-readonly',
  'vehicle-tracking',
  'WIM vahy v mape sledovani',
  'Read-only pravidlo pro zobrazeni pevnych vysokorychlostnich kontrolnich vah WIM ve sledovani vozidel.',
  'rule',
  'active',
  '{"source":"vehicle_wim_sites","sourceDate":"2025-06-30","coordinateQuality":"approximate-needs-verification"}',
  '{"display":"google_map_layer","icon":"placeholder-awaiting-asset","frontendSend":false}',
  0,
  'manual',
  '',
  '',
  '',
  NULL,
  NULL,
  NULL,
  'Vrstva je read-only z D1 pres API. Souradnice potrebuji finalni overeni.',
  'migration-0018',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0018',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'vehicle-tracking-wim-approach-15km',
  'vehicle-tracking',
  'Upozorneni 15 km pred WIM vahou',
  'Navrh automatizace: pokud se vozidlo blizi k pevne WIM vaze, pripravit SMS ridici a alert v aplikaci 15 km predem.',
  'automation',
  'draft',
  '{"source":"vehicle_positions","target":"vehicle_wim_sites","distanceKm":15,"directionAware":true,"requiresTelemetry":true,"requiresRoadMatching":true}',
  '{"channels":["sms_driver","app_alert"],"frontendSend":false,"requiresSmsProvider":true,"dedupe":"vehicle_id+site_id+approach_side+time_window"}',
  1,
  'event',
  '',
  'vehicle_position_received',
  'future-cloud-geofence-runner',
  NULL,
  NULL,
  NULL,
  'Zatim pouze navrh/evidence. SMS provider, smerove vyhodnoceni a cloud runner nejsou aktivni.',
  'migration-0018',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0018',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR IGNORE INTO module_rule_audit_log (
  id,
  rule_id,
  module_key,
  action,
  changed_by_user_id,
  changed_at,
  before_json,
  after_json,
  note
)
SELECT
  'audit-seed-' || id,
  id,
  module_key,
  'seed',
  'migration-0018',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  NULL,
  '{"status":"seeded"}',
  'Pravidla Sledovani vozidel pro WIM vrstvu a budouci 15km alert.'
FROM module_rules
WHERE module_key = 'vehicle-tracking'
  AND id IN (
    'vehicle-tracking-wim-layer-readonly',
    'vehicle-tracking-wim-approach-15km'
  );
