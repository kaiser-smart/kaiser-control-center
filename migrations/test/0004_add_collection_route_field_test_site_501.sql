INSERT OR IGNORE INTO collection_import_rows (
  id,
  batch_id,
  row_number,
  source_entity,
  source_id,
  status,
  summary_json,
  issues_json,
  created_at
)
SELECT
  'collection-import-row-test-brno-v2-0501',
  'collection-import-batch-test-brno-500-v2',
  501,
  'synthetic-field-test-site',
  'test-field-site-501',
  'preview',
  json_object(
    'rowNumber', 501,
    'sourceEntity', 'synthetic-field-test-site',
    'sourceId', 'test-field-site-501',
    'sourceContractId', 'test-contract-field-501',
    'sourceCustomerId', 'test-company-field-501',
    'sourceSiteId', 'test-site-field-501',
    'contractId', 'test-contract-field-501',
    'contractRowId', 'test-contract-row-501',
    'contractNumber', 'TEST-501',
    'customerName', 'Firma test 501',
    'branchName', 'Firma test 501',
    'addressRaw', 'Trnkova 3052/137, 628 00 Brno',
    'addressPlaceRaw', 'Trnkova 3052/137, 628 00 Brno',
    'addressStreet', 'Trnkova 3052/137',
    'addressCity', 'Brno',
    'addressRegion', 'Líšeň',
    'addressCountry', 'Česko',
    'addressPostalCode', '62800',
    'stationName', 'Firma test 501 · stanoviště Trnkova',
    'siteName', 'Firma test 501 · stanoviště Trnkova',
    'productId', 'test-product-200301',
    'productName', 'SKO 120 l',
    'rowName', 'SKO · 120 l · 1x7',
    'wasteType', 'SKO',
    'wasteCode', '200301',
    'frequency', '1x7',
    'pickupDaysText', 'středa lichá, středa sudá',
    'pickupSchedule', json('{"mode":"weekly","dayCodes":["ST"],"parities":["odd","even"]}'),
    'containerVolume', 120,
    'containerCount', 1,
    'containerType', 'nádoba',
    'serviceMode', 'regular',
    'onDemand', json('false'),
    'mappingStatus', 'test-ready',
    'note', 'TESTOVACÍ DATA · výchozí stanoviště pro fyzický GPS test tabletu · bez vazby na skutečného zákazníka.',
    'contact', 'Radim · TEST 501',
    'phone', COALESCE((SELECT json_extract(metadata_json, '$.recipientPhone') FROM collection_route_test_datasets WHERE dataset_key = 'brno-500-v2' LIMIT 1), ''),
    'email', COALESCE((SELECT json_extract(metadata_json, '$.recipientEmail') FROM collection_route_test_datasets WHERE dataset_key = 'brno-500-v2' LIMIT 1), ''),
    'customerManagerName', 'Radim · TEST 501',
    'customerManagerMobile', COALESCE((SELECT json_extract(metadata_json, '$.recipientPhone') FROM collection_route_test_datasets WHERE dataset_key = 'brno-500-v2' LIMIT 1), ''),
    'customerManagerEmail', COALESCE((SELECT json_extract(metadata_json, '$.recipientEmail') FROM collection_route_test_datasets WHERE dataset_key = 'brno-500-v2' LIMIT 1), ''),
    'rowKey', 'brno-500-v2|row|501',
    'siteKey', 'brno-500-v2|site|field-501',
    'locationQuality', 'confirmed-test-open-data',
    'latitude', 49.19125931950087,
    'longitude', 16.670211574110382,
    'svozKaiserValue', 'TEST',
    'svozKaiserIncluded', json('true'),
    'issueCount', 0,
    'issues', json('[]'),
    'dataScope', 'test',
    'testDatasetKey', 'brno-500-v2',
    'addressSourceId', 'gis-brno-trnkova-3052-137',
    'addressSource', 'GIS Brno - adresní body, export 2026-07-11',
    'fieldTestPriority', json('true')
  ),
  '[]',
  CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM collection_import_batches
  WHERE id = 'collection-import-batch-test-brno-500-v2'
);

UPDATE collection_import_batches
SET row_count = 501,
    message = 'Oddělená testovací sada 501 stanovišť Brna včetně fyzického GPS testu na Trnkově.',
    metadata_json = json_set(
      CASE WHEN json_valid(metadata_json) THEN metadata_json ELSE '{}' END,
      '$.phase', 'TEST-Brno-501',
      '$.datasetName', 'TEST Brno 501',
      '$.companyCount', 101,
      '$.siteCount', 501,
      '$.summary.companyCount', 101,
      '$.summary.siteCount', 501,
      '$.summary.wasteCounts.SKO', 351,
      '$.summary.frequencyCounts.1x7', 176,
      '$.summary.containerVolumeCounts.120', 226
    )
WHERE id = 'collection-import-batch-test-brno-500-v2'
  AND EXISTS (
    SELECT 1 FROM collection_import_rows WHERE source_id = 'test-field-site-501'
  );

UPDATE collection_route_test_datasets
SET name = 'TEST Brno 501',
    company_count = 101,
    site_count = 501,
    metadata_json = json_set(
      CASE WHEN json_valid(metadata_json) THEN metadata_json ELSE '{}' END,
      '$.summary.companyCount', 101,
      '$.summary.siteCount', 501,
      '$.summary.wasteCounts.SKO', 351,
      '$.summary.frequencyCounts.1x7', 176,
      '$.summary.containerVolumeCounts.120', 226
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE dataset_key = 'brno-500-v2'
  AND EXISTS (
    SELECT 1 FROM collection_import_rows WHERE source_id = 'test-field-site-501'
  );
