# CCS server integration — source acquisition blocked

This is an additive integration package, not a claim of a live CCS connection. No production CCS API URL, credentials, cookies, private export, account identifier, employee data or private control totals belong in this repository.

## Implemented contract

- Cloudflare Worker `workers/ccs-sync-runner.js`: regular acquisition queue every four hours (`7 */4 * * *`, UTC), recovery pump every 15 minutes. No desktop scheduler, browser session or local process is used by the intended production architecture.
- `DB_ARCHIVE`: durable jobs, account lease, fencing checks, immutable export receipts, observations, audit events, persistent administrator alerts. Migration is additive and touches only `ccs_*` tables.
- `R2_ARCHIVE`: original XLSX, named by account and SHA-256; read-back hash must match before the database transaction commits. Failed database commits may leave an unreferenced private R2 object; retain it for reconciliation, do not silently delete source evidence.
- Explicit `CCS_ACCOUNT_ID` configuration required in both Pages and Worker. No hardcoded customer account. Verify it privately against the export contract before deployment.
- Acquisition boundary `acquireCcsExport`: intentionally fails with `ccs_automatic_channel_not_verified`. There is no fake HTTP endpoint, no generic arbitrary URL fetch and no copied browser credential. A future verified connector must provide original bytes, XLSX format, requested inclusive dates and a proven complete-export flag. It must honor the provided timeout signal.
- Bounded Worker-compatible XLSX reader, ZIP size/count/CRC checks, rejecting formulas, macros, external links, numeric card identifiers and unexpected schemas. Text card IDs remain exact. CSV stays a historical review tool, not the production input.
- Exact integer monetary amounts, explicit currency, original 23 fields, minute-resolution wall clock. Production UTC and quantity units stay unknown until documented by CCS; no implicit midnight, litre or kWh conversion.
- Identical file hashes are idempotent. Separate files with matching/comparable rows create review observations; they do not silently delete real equal purchases or add duplicate costs. Changed billing and financial revisions remain auditable review records. A separate row is accepted only after a clearly new source candidate or explicit administrator review. Both source observations remain stored.
- Manual resolution uses optimistic concurrency, evidence and an audit transaction. It can confirm a separate purchase, link a duplicate, or associate an existing vehicle/driver. Current card labels are not proof of the driver at purchase time.
- Historical card assignments reuse `fleet_vehicle_external_aliases` with `external_system=ccs_card`, documented validity intervals, account and card in metadata. Overlap is rejected atomically. Existing aliases, vehicle and user records are not overwritten. Automatic use of these mappings remains blocked by the unverified source timezone.
- `/api/ccs`: permission-controlled reports/detail/status/options/CSV; administrator-only writes, same-origin JSON, bounded body, no-store responses and formula-safe CSV cells. No public import/upload endpoint. `ccs-fuel` is a separate permission scope; no new rights are granted to drivers or office roles.
- `/tankovani-ccs`: summary, filters, 100-row pagination, source detail, review/assignment form, export, grouped vehicle/driver/month costs, scheduler status/history, persistent failure alert and manual queue action. Existing application design and icons are reused. Mobile transactions render as cards.
- Purchased quantities are not presented as measured consumption. Litres, price/litre, consumption and historical automatic matching are explicitly unavailable until their evidence exists. Existing ORWII fuel/economics calculations are untouched.

## Reliability and current limits

Only a transactionally committed complete file advances last success and coverage. Failure retains the requested window. Retries back off to four hours; an expired ten-minute lease allows recovery of an interrupted job. A stale owner cannot commit. New normal requests use a 45-day overlap; a weekly full replay starts at the initial historical boundary in `ccsWindow`. Reconcile that boundary with the approved account history before enabling a connector.

The import is deliberately bounded to 750 rows per atomic D1 batch; a larger response fails with `ccs_batch_requires_smaller_window`, preserves the watermark and alerts after prolonged failure. A production connector must split acquisition into verified complete smaller windows before this limit can be reached. This splitting is NOT implemented by the blocked source adapter. Similarly, a reconciliation window over 20,000 existing observations fails closed. CSV output is capped at 20,000 and is never silently truncated.

The alert is persistent inside the CCS module, not an email/SMS dispatch or a newly wired global notification. A scheduler heartbeat proves only handler execution, not successful data acquisition. `lastSuccess` is not populated on a blocked/error run.

## Staged Pages release

The module can be released before account/storage activation. With no valid `CCS_ACCOUNT_ID`, authenticated status returns `storageReady: false` without reading or creating any tables. The UI displays the blocked source, no successful run, no next run and disabled transaction controls; it makes no report/options requests and offers no synchronization action. This stage changes neither database data nor Worker configuration and is not a working sync. A failed report request must not overwrite independently verified source status. Account configuration remains a separate prerequisite for storage activation.

## Required source evidence before activation

1. Official account-specific API/data-delivery contract, credentials scope and complete sample, or supported SFTP/dedicated-mail delivery with confirmed format and frequency.
2. If only portal automation is available: verify provider terms, authorized server login and MFA behavior; obtain credentials through the platform secret store. Stop on interactive MFA/CAPTCHA, never bypass it or reuse the user's browser cookies. Only the login form has been observed in a fresh browser; unattended authentication is not verified.
3. Confirm source timezone (including DST), product units, timestamp precision, reversals/credits, invoiced revisions and identifier/occurrence semantics.
4. Implement and test the actual adapter, window splitting, empty-period representation and coverage proof. Until then, the acquisition gate must remain blocked.
5. Bind measured telemetry over a complete matching vehicle/time interval before enabling consumption or operational cost-per-distance calculations. Do not reuse purchased litres as consumed litres.

## Public source research (2026-10-27)

- [MyFleetcor overview](https://fleetcor.eu/cs-cz/podpora/myfleetcor) describes portal management and documents; it does not establish an API contract for this installation.
- [Official electronic-document request](https://www.ccs.cz/files/3formulare/zadost_o_elektronicke_dokumenty_edit_v1.pdf) offers invoice plus attachment by email and billing notifications. It does not establish a four-hour transaction feed, an attachment schema, or activation for this customer.
- [Product groups](https://www.ccs.cz/files/3formulare/20200629_skupiny_zbozi.pdf) lists product categories but does not document units of the new transaction export.
- [CCS card terms](https://www.ccs.cz/files/3obchodni-podminky-a-ceniky/op-ccs-limit_limit-plus-a-limit-exclusive_platne-od-25-10-2026.pdf) are not a verified portal-automation agreement.
- Carnet API/reporting features apply to a different product and are not used here. A historic BBS search result mentions automatic downloads, but current availability and customer entitlement are unverified; it is not an integration channel in this implementation.

## Validation

`node --test scripts/ccs-import.test.mjs scripts/ccs-server.test.mjs`

`python3 scripts/ccs-read-export.test.py`

Private historical validation additionally sets `CCS_TEST_XLSX` and `CCS_TEST_EXPECTED_JSON` to files outside this repository. The JSON holds `account`, `rows`, `cards`, `grossMinor`, `netMinor`, `vatMinor`. Do not upload these inputs or their contents to CI/public artifacts. Synthetic SQLite/R2 tests cover commit, file repeat, equal purchases, source outage, lease recovery, stale owner, archive failure, identity resolution, overlap, filtering, anonymous access and alerts. They do not prove a deployed Worker or real server authentication.

## Deployment and rollback

1. Read the actual live Pages deployment/commit and existing Worker state with authorized Cloudflare access; save the rollback deployment ID privately. Confirm account, bindings, database capacity, private R2 access and worker plan/query limits. Allocate a fresh release version after merging with current main.
2. Apply only `migrations/modular/archive/0004_ccs_integration.sql` to the bound archive database, after testing against a staging database. Do not blindly apply unrelated pending migrations. Set `CCS_ACCOUNT_ID` in Pages and Worker from verified private account evidence. Source credentials are not needed while acquisition is blocked.
3. Use the existing guarded Pages production release script from clean current main, including its required regressions/build checks. Deploy the dedicated Worker with its reviewed configuration only after Pages and storage validation. This package does not change the existing Pages bindings or other worker triggers.
4. Verify anonymous API 401/no-store, authenticated module and permissions, direct route assets, administrator manual run and persisted blocked state. Wait for actual cron/recovery events and inspect D1 job/status rows and sanitized logs. Do not equate a configured cron or a synthetic test with a real scheduled run.
5. When acquisition is enabled later, require two real consecutive unattended downloads, exact provider count/amount reconciliation, repeated-window idempotency and outage recovery before declaring the main acceptance criterion satisfied.
6. Rollback: stop this Worker's triggers; restore the saved Pages deployment using the existing guarded rollback path; verify original commit/assets and anonymous auth checks. Retain new tables and private originals for evidence. Do not drop imported records or modify ORWII/vehicle tables. Restoring Pages alone does not stop Worker execution.

Deployment is NOT recorded as complete by this document. Private delivery evidence must name the actual release, migration result, worker version, schedule invocation, last successful import and rollback identity.
