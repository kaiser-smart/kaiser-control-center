# D1 modular architecture

Stav dokumentu: 2026-07-25. Zdrojová databáze `SMART_ODPADY_DB` se nemaže ani nepřejmenovává. Všechny její původní tabulky zůstávají během rollback období jako legacy kopie.

## Databáze a bindings

| Doména | Binding | Fyzický název | UUID |
| --- | --- | --- | --- |
| Legacy zdroj / rollback | `SMART_ODPADY_DB` | `smart-odpady` | `6d9ab099-fa10-4245-b06b-e146b63450a9` |
| Provozní data | `DB_CORE` | `SMART_ODPADY_CORE` | `7babb37a-dc19-4bbc-b4f8-3346f4e1aa23` |
| Komunikace | `DB_MESSAGES` | `SMART_ODPADY_MESSAGES` | `8aeb65e8-9f53-4c93-869e-1f58484b1319` |
| Audit a diagnostika | `DB_AUDIT` | `SMART_ODPADY_AUDIT` | `5abc8fa4-c155-4bf0-9c46-2db73d6d98e0` |
| Historický archiv | `DB_ARCHIVE` | `SMART_ODPADY_ARCHIVE` | `b10566be-ebb1-414c-beab-eac03f1a909b` |
| Velké objekty | `R2_ARCHIVE` | `smart-odpady-archive` | R2 bucket |

Kód používá pouze centrální funkce v `functions/_lib/databases.js`. Chybějící nový binding je pravdivá chyba 503; neexistuje tichý fallback do legacy databáze.

## Cílové vlastnictví tabulek

Index patří vždy do stejné databáze jako jeho tabulka. Následující mapa pokrývá všechny aplikační tabulky nalezené v legacy D1 dne 2026-07-25; `_cf_KV` je interní tabulka Cloudflare a nemigruje se ručně.

### CORE

Aktivní identita, konfigurace a provozní stav:

- `users`
- `theme_settings`
- `absence_requests`, `absence_settings`
- `collection_containers`, `collection_contract_services`, `collection_customer_sites`, `collection_site_locations`, `collection_data_issues`
- `collection_daily_route_runs`, `collection_daily_route_stops`
- `collection_route_driver_problem_reports`, `collection_route_driver_runs`, `collection_route_driver_tablet_preferences`
- `collection_route_incident_workflows`
- `data_boxes`, `data_box_plus_mailboxes`, `data_box_plus_credentials`, `data_box_plus_rules`, `data_box_plus_recommendations`
- `driver_part_requests`
- `employee_cards`, `employee_documents`, `employee_document_files`, `employee_hr_profiles`, `employee_medical_exams`
- `fleet_vehicle_assignments`, `fleet_vehicle_external_aliases`
- `module_feedback`, `module_rules`
- `receivable_customer_payment_ratings`, `receivable_customers`, `receivable_invoices`, `receivable_insolvency_checks`, `receivable_packages`, `receivable_payment_matches`, `receivable_payment_transactions`, `receivable_promises_to_pay`, `receivable_settings`
- `sarlota_content_documents`, `sarlota_user_memory`
- `self_repair_cases`
- `tyre_inventory`, `tyre_vehicle_profiles`
- `vehicle_tracking_user_preferences`
- `vehicle_wim_devices`, `vehicle_wim_sites`

Nové řídicí tabulky:

- `database_migration_log`
- `cross_database_workflows`
- `retention_policies`

### MESSAGES

Veškerá zprávová agenda, idempotence providerů a stav doručení:

- `communication_events`, `communication_messages`, `communication_threads`, `communication_unmatched_replies`
- `customer_message_consent`, `customer_message_inbound`, `customer_message_log`, `customer_message_opt_out`
- `notification_logs`
- `rcs_message_dispatches`, `rcs_template_sync`, `rcs_template_sync_locks`
- `data_box_actions`, `data_box_messages`, `data_box_attachments`
- `data_box_plus_action_log`, `data_box_plus_attachments`, `data_box_plus_draft_attachments`, `data_box_plus_drafts`, `data_box_plus_messages`, `data_box_plus_rcs_notification_events`, `data_box_plus_rcs_notifications`, `data_box_plus_send_jobs`
- `feedback_case_notifications`
- `receivable_communication_events`, `receivable_inbox_messages`
- `self_repair_case_messages`

Nové RCS/SMS tabulky, které se nesmějí vytvořit v CORE ani legacy:

- `rcs_sms_conversations`
- `rcs_sms_messages`
- `rcs_sms_requests`
- `rcs_sms_action_grants`
- `rcs_sms_tool_runs`
- `rcs_sms_webhook_events`
- `rcs_sms_events`
- `rcs_sms_idempotency_keys`
- `rcs_sms_runtime_config`

### AUDIT

Technická historie, diagnostika, AI a stavové události:

- `absence_approval_history`
- `collection_daily_route_events`, `collection_route_driver_stop_events`, `collection_route_driver_tablet_audio_events`
- `collection_route_incident_audit`
- `data_box_ai_evaluations`, `data_box_audit_log`, `data_box_plus_sync_runs`, `data_box_sync_runs`
- `driver_part_request_events`, `driver_report_partslink24_searches`
- `employee_document_audit_logs`
- `fleet_orwii_fuel_sync_runs`, `fleet_trip_job_pairing_runs`
- `module_automation_runner_runs`, `module_automation_runs`, `module_rule_audit_log`
- `receivable_ai_decisions`, `receivable_audit_log`
- `sarlota_content_audit_log`
- `self_repair_case_audit_log`, `self_repair_codex_jobs`
- `tyre_audit_log`, `tyre_import_runs`
- `vehicle_tracking_analytics_runs`, `vehicle_tracking_history_runs`
- `vehicle_wim_alert_events`

Nové auditní tabulky:

- `audit_events`
- `workflow_attempts`
- `database_capacity_snapshots`
- `database_capacity_objects`
- `migration_preflight_runs`
- `archive_runs`

### ARCHIVE a R2

Uzavřená historická data a metadata objektů:

- `collection_import_batches`, `collection_import_rows`
- `collection_route_source_batches`, `collection_route_source_files`, `collection_route_source_rows`, `collection_route_vistos_matches`
- `data_box_plus_archive_backfills`, `data_box_plus_archive_objects`
- `employee_import_batches`, `employee_import_batch_rows`, `employee_work_history`
- `fleet_orwii_fuel_transactions`, `fleet_trip_job_allocations`
- `receivable_import_batches`, `receivable_import_rows`, `receivable_legal_handoff_packages`
- `sarlota_content_versions`
- `self_repair_case_attachments`, `self_repair_case_evidence`
- `tyre_measurements`, `tyre_service_record_tyres`, `tyre_service_records`
- `vehicle_tracking_daily_metrics`, `vehicle_tracking_gps_points`, `vehicle_tracking_trip_summaries`

Tabulky `collection_route_incident_communications` patří do MESSAGES; aktuální provozní incident je v CORE. `d1_migrations` zůstává lokální evidencí každé fyzické databáze a nekopíruje se jako provozní tabulka.

PDF, fotografie, audio, přílohy, zdrojové soubory, kompletní payloady a exporty jsou fyzicky v R2. D1 uchovává metadata, kontrolní součet a `r2_object_key`.

## Stav fází

1. Inventura legacy: dokončena; 128 tabulek, 10 GB limit, největší logická data jsou opakované svozové a pohledávkové snapshoty.
2. Nové databáze a základní schémata: dokončeno.
3. Stabilizace: produkční objemové snapshoty jsou kapacitní pojistkou zastavené.
4. MESSAGES write-first: obecná komunikace a Data Box RCS jsou připravené na `DB_MESSAGES`; legacy kopie zůstávají.
5. Backfill MESSAGES: dokončen pro obecné komunikační tabulky a Data Box RCS, počty a vazby ověřeny.
6. Copy-only archivace: běží po 500 řádcích, R2 a SHA-256 se ověřují, mazání zdroje je zakázané.
7. CORE/AUDIT/ARCHIVE migrace zbývajících modulů: připravená cílová mapa, nikoli big-bang přepnutí.
8. Destruktivní cleanup: nezačal; vyžaduje nový Time Travel bookmark, kontrolní počty a samostatné potvrzení.

## Retence

- technické auditní události: 60 dní, konfigurovatelné 30–90 dní
- webhook payloady: 30 dní
- AI tool runs: 90 dní
- doručovací události SMS/RCS: 365 dní
- uzavřené svozové importní snapshoty: copy-only archivace po 2 dnech
- jedna dávka: 500, tvrdé maximum 1 000 záznamů

Archivace nikdy nemaže zdroj při chybě. Aktuální Worker je záměrně pouze `copy-verify-only`.

## Rollback

Rollback aplikace je změna bindings/repository zpět na legacy a nasazení posledního stabilního Pages commitu. Není to tichý runtime fallback.

Rollback fyzické databáze:

```bash
wrangler d1 time-travel restore SMART_ODPADY_CORE --bookmark=<bookmark>
wrangler d1 time-travel restore SMART_ODPADY_MESSAGES --bookmark=<bookmark>
wrangler d1 time-travel restore SMART_ODPADY_AUDIT --bookmark=<bookmark>
wrangler d1 time-travel restore SMART_ODPADY_ARCHIVE --bookmark=<bookmark>
```

Před každou destruktivní změnou se musí získat nový bookmark příkazem:

```bash
wrangler d1 time-travel info <DATABASE> --env production
```

Legacy tabulky se během rollback období nemažou. `DROP TABLE`, Time Travel restore nebo první zdrojové `DELETE` jsou samostatný destruktivní checkpoint a nesmějí být součástí běžného deploye.
