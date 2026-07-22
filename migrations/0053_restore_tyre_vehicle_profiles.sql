-- Obnova doložených profilů a klikacích pozic kol z původního modulu
-- Evidence pneumatik a z aktuálního vozového parku. Existující ručně
-- doplněné hodnoty mají vždy přednost.
WITH restored_profiles (
  normalized_license_plate,
  vehicle_type,
  driver_label,
  odometer_km,
  depot,
  wheel_positions_json
) AS (
  VALUES
    ('1BC3390', 'MAN cisterna 12 m3', 'Bronislav Ondrášek', 252901, 'ROP', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('1BF9638', 'MINI Cooper 2017', 'bez řidiče', 0, '', '["L","P","ZL","ZP"]'),
    ('1BM1150', 'MAN TGL 12.180_malý Abroll', 'Jan Kozumplík', 382562, 'LJE', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější"]'),
    ('1BM3239', 'Iveco Daily_skříň 2017', 'Martin Bravenec', 265605, 'LJE', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější"]'),
    ('1BR6359', 'Mercedes_Abroll nosič kontejnerů Meiller 2017', 'bez řidiče', 413842, 'ROP', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('1BV6295', 'Mercedes se skříňovou nástavbou Ivacar', 'Martin Macejka', 482276, 'ROP', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější"]'),
    ('2BD8835', 'Mercedes_Abroll nosič kontejnerů Meiller 2019', 'Roman Drdlík', 317849, 'ROP', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('2BD9834', 'MAN Abroll nosič kontejnerů 2016', '', 0, '', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('2BE2247', 'Mercedes 12t_skříň', 'bez řidiče', 235919, 'ROP', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější"]'),
    ('2BK7741', 'Mercedes - Benz Vito', 'bez řidiče', 0, '', '["L","P","ZL","ZP"]'),
    ('2BR0904', 'MAN ramenáč s nástavbou PAK 13 - HAMER', 'Martin Ištvánek', 389232, 'LJE', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('3BE2831', 'Popeláři Mercedes s nástavbou Hanes', 'Jakub Kozlíček', 0, 'LJE', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('3BH3767', 'ACTROS 2551 tahač vleku', 'Martin Pinkava', 134485, 'JOL', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('3BH5548', 'Mercedes Benz- AROCS 2646 LK', 'Radek Pich', 86314, 'JOL', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('3BI2007', 'DAF- nosič kontejneru KUHN', 'Martin Bartoš', 73324, 'JOL', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('4K19933', 'BMW_X6- koupil Andrej Novák', 'bez řidiče', 0, '', '["L","P","ZL","ZP"]'),
    ('5B14417', 'MAN cisterna 12 m3', 'Libor Ferbar', 676765, 'ROP', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('5B43409', 'DAF ramenový nakladač Palfinger PAK13', '', 0, '', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('5B80857', 'Mercedes_nosič vanových kontejnerů PAK13', 'Radek Pich', 279721, 'ROP', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('5E73753', 'MAN cisterna 12 m3', 'Ondřej Hanzlíček', 330609, 'LJE', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('6B93840', 'MAN popelářské vozidlo KOBIT', 'Miroslav Florián', 372249, 'ROP', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('8B20908', 'MAN cisterna_12 m3', 'Jan Kovařík', 562987, 'ROP', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('8B43007', 'MAN Abroll nosič kontejnerů', 'Martin Bartoš', 604243, 'ROP', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('8B75380', 'vlek Hüffermann HKA 24.70', 'bez řidiče', 0, 'ROP', '["L","P","VL","VP","ZL","ZP"]'),
    ('8B76637', 'vlek Hüffermann HSA 2470 - roller', 'bez řidiče', 0, 'ROP', '["L","P","VL","VP","ZL","ZP"]'),
    ('8C92714', 'Návěs Milcom', 'bez řidiče', 0, 'JOL', '["L","P","VL","VP","ZL","ZP"]'),
    ('9C83570', 'Mercedes cisterna AROCS /IBOS', 'Milan Popelár', 135034, 'JOL', '["L","P","HL vnitřní","HL vnější","HP vnitřní","HP vnější","VL vnitřní","VL vnější","VP vnitřní","VP vnější"]'),
    ('EL129BX', 'Mercedes- AMG EQS 53', 'Milan Gaží', 0, '', '["L","P","ZL","ZP"]')
)
UPDATE tyre_vehicle_profiles AS current
SET
  vehicle_type = CASE
    WHEN current.vehicle_type = '' THEN restored_profiles.vehicle_type
    ELSE current.vehicle_type
  END,
  driver_label = CASE
    WHEN current.driver_label = '' THEN restored_profiles.driver_label
    ELSE current.driver_label
  END,
  odometer_km = CASE
    WHEN current.odometer_km = 0 THEN restored_profiles.odometer_km
    ELSE current.odometer_km
  END,
  depot = CASE
    WHEN current.depot = '' THEN restored_profiles.depot
    ELSE current.depot
  END,
  wheel_positions_json = CASE
    WHEN current.wheel_positions_json = '' OR current.wheel_positions_json = '[]'
      THEN restored_profiles.wheel_positions_json
    ELSE current.wheel_positions_json
  END,
  updated_at = CURRENT_TIMESTAMP
FROM restored_profiles
WHERE current.normalized_license_plate = restored_profiles.normalized_license_plate;
