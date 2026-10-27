-- Account 3b25838c1e15dbfe5f3ac0c273826576, SMART_ODPADY_CORE only.
-- User requested production recovery and bounded automatic repair on 2026-10-27.
-- Live measurements: core 268607488, archive 2407587840, audit 1273753600.
-- No source rows, credentials, permissions, financial flags or checkpoints change.
UPDATE vistos_integration_contracts
SET contract_json=json_set(contract_json,
 '$.capacityEvidence.domains.archive.maxSizeBytes',2800000000,
 '$.capacityEvidence.domains.audit.maxSizeBytes',1600000000,
 '$.capacityEvidence.scope','jobs import recovery; bounded by live measurements and hard ceilings',
 '$.capacityEvidence.autoRecovery',json('{"approvedAt":"2026-10-27","evidenceId":"jobs-recovery-20261027-806","maxSizeBytes":{"core":500000000,"archive":7000000000,"audit":3000000000}}')),
 revision='jobs-recovery-2026-10-27-v1'
WHERE installation='kaiserservis.myvistos.com'
 AND revision='jobs-pilot-2026-10-26-v1'
 AND json_extract(contract_json,'$.capacityEvidence.domains.archive.maxSizeBytes')=2400000000
 AND json_extract(contract_json,'$.capacityEvidence.domains.audit.maxSizeBytes')=1270000000;
