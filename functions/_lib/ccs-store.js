import { getArchiveDatabase, getCoreDatabase } from './databases.js';
import { normalizeCcsMatrix, planCcsImport } from './ccs-import.js';
import { readCcsXlsx } from './ccs-xlsx.js';
export function ccsAccount(env) {
  if (!/^D[0-9]{6}$/.test(env.CCS_ACCOUNT_ID || '')) throw ccsError('ccs_account_not_configured');
  return env.CCS_ACCOUNT_ID;
}
export const CCS_CRON = '7 */4 * * *';
export const CCS_RECOVERY_CRON = '*/15 * * * *';
export const CCS_BLOCKER = 'ccs_automatic_channel_not_verified';
export const CCS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ccs_state (account TEXT PRIMARY KEY, last_success TEXT, covered_to TEXT, last_backfill TEXT, scheduler_seen TEXT, last_error TEXT, failure_since TEXT)`,
  `CREATE TABLE IF NOT EXISTS ccs_jobs (id TEXT PRIMARY KEY, account TEXT NOT NULL, trigger TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','running','retry','blocked','succeeded')), created_at TEXT NOT NULL, due_at TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, owner TEXT, lease_until TEXT, from_date TEXT NOT NULL, to_date TEXT NOT NULL, finished_at TEXT, error_code TEXT, loaded INTEGER NOT NULL DEFAULT 0, inserted INTEGER NOT NULL DEFAULT 0, review INTEGER NOT NULL DEFAULT 0, file_hash TEXT)`,
  `CREATE INDEX IF NOT EXISTS ccs_jobs_due ON ccs_jobs(account,status,due_at)`,
  `CREATE TABLE IF NOT EXISTS ccs_leases (account TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ccs_fence_checks (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1))`,
  `CREATE TABLE IF NOT EXISTS ccs_exports (hash TEXT PRIMARY KEY, account TEXT NOT NULL, object_key TEXT NOT NULL, received_at TEXT NOT NULL, row_count INTEGER NOT NULL, totals_json TEXT NOT NULL, from_date TEXT NOT NULL, to_date TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ccs_observations (id TEXT PRIMARY KEY, account TEXT NOT NULL, export_hash TEXT NOT NULL, source_row INTEGER NOT NULL, day TEXT NOT NULL, card TEXT NOT NULL, plate TEXT NOT NULL, product TEXT NOT NULL, driver_label TEXT, currency TEXT, gross_minor INTEGER NOT NULL, payload_json TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('accepted','review','duplicate')), reason TEXT NOT NULL, linked_to TEXT, vehicle_id TEXT, driver_id TEXT, resolution_evidence TEXT, updated_at TEXT NOT NULL, UNIQUE(export_hash,source_row), FOREIGN KEY(export_hash) REFERENCES ccs_exports(hash))`,
  `CREATE INDEX IF NOT EXISTS ccs_observations_period ON ccs_observations(account,day,state)`,
  `CREATE TABLE IF NOT EXISTS ccs_events (id TEXT PRIMARY KEY, account TEXT NOT NULL, created_at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, subject TEXT NOT NULL, detail_json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ccs_alerts (account TEXT PRIMARY KEY, since_at TEXT NOT NULL, last_seen TEXT NOT NULL, code TEXT NOT NULL, resolved_at TEXT)`
];
export const ccsError = code => Object.assign(new Error(code), { code });
const iso = ms => new Date(ms).toISOString();
const id = () => crypto.randomUUID();
const rows = async stmt => (await stmt.all()).results || [];
const json = s => JSON.parse(s || '{}');
const day = s => s.slice(0, 10);
export async function ccsHash(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export function nextCcsRun(now = Date.now()) {
  const date = new Date(now); date.setUTCSeconds(0, 0); date.setUTCMinutes(7); date.setUTCHours(Math.floor(date.getUTCHours() / 4) * 4);
  if (+date <= now) date.setUTCHours(date.getUTCHours() + 4);
  return date.toISOString();
}
export function ccsWindow(state, now) {
  const full = !state?.last_backfill || now - Date.parse(state.last_backfill) >= 7 * 86400000;
  return { from: full || !state?.covered_to ? '2026-04-01' : day(iso(Math.max(Date.parse('2026-04-01'), Date.parse(state.covered_to) - 45 * 86400000))), to: day(iso(now)), full };
}
export async function enqueueCcs(env, { now = Date.now(), trigger = 'manual', actor = 'system' } = {}) {
  const CCS_ACCOUNT = ccsAccount(env), db = getArchiveDatabase(env), at = iso(now);
  const state = await db.prepare('SELECT * FROM ccs_state WHERE account=?').bind(CCS_ACCOUNT).first();
  const window = ccsWindow(state, now);
  const jobId = trigger === 'scheduled' ? `schedule:${CCS_ACCOUNT}:${nextCcsRun(now - 4 * 3600000)}` : `manual:${CCS_ACCOUNT}:${Math.floor(now / 60000)}`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO ccs_state(account) VALUES(?)`).bind(CCS_ACCOUNT),
    db.prepare(`INSERT OR IGNORE INTO ccs_jobs(id,account,trigger,status,created_at,due_at,from_date,to_date) SELECT ?,?,?,'queued',?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM ccs_jobs WHERE account=? AND status IN ('queued','running','retry'))`).bind(jobId, CCS_ACCOUNT, trigger, at, at, window.from, window.to, CCS_ACCOUNT),
    db.prepare(`INSERT INTO ccs_events VALUES(?,?,?,?,?,?,?)`).bind(id(), CCS_ACCOUNT, at, actor, 'sync_requested', jobId, JSON.stringify({ trigger }))
  ]);
  return { requested: true, jobId, sourceConnected: false };
}
async function acquireLease(db, now, CCS_ACCOUNT) {
  const owner = id();
  const result = await db.prepare(`INSERT INTO ccs_leases(account,owner,expires_at) VALUES(?,?,?) ON CONFLICT(account) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE ccs_leases.expires_at<=?`).bind(CCS_ACCOUNT, owner, iso(now + 10 * 60000), iso(now)).run();
  return result.meta.changes === 1 ? owner : null;
}
function fence(db, owner, now, CCS_ACCOUNT) {
  const check = id(); return [db.prepare(`INSERT INTO ccs_fence_checks VALUES(?,(SELECT COUNT(*) FROM ccs_leases WHERE account=? AND owner=? AND expires_at>?))`).bind(check, CCS_ACCOUNT, owner, iso(now)), db.prepare('DELETE FROM ccs_fence_checks WHERE id=?').bind(check)];
}
export async function loadCcsAliases(env) {
  const found = await rows(getCoreDatabase(env).prepare(`SELECT * FROM fleet_vehicle_external_aliases WHERE external_system='ccs_card' AND status IN ('active','historical')`));
  return found.map(a => { let meta = {}; try { meta = json(a.metadata_json); } catch {} return { id: a.id, accountId: meta.accountId, system: 'ccs_card', key: meta.cardId, vehicleId: a.vehicle_id, driverId: meta.driverId || null, verified: meta.historicalIdentityVerified === true, sourceEvidenceId: meta.sourceEvidenceId, validFrom: a.valid_from, validTo: a.valid_to }; });
}
// The production path deliberately has no guessed CCS endpoint or copied browser session.
export async function acquireCcsExport() { throw ccsError(CCS_BLOCKER); }
export async function ingestCcsExport(env, job, owner, acquisition, now = Date.now()) {
  const CCS_ACCOUNT = ccsAccount(env), db = getArchiveDatabase(env), at = iso(now);
  if (!(acquisition?.bytes instanceof Uint8Array) || acquisition.format !== 'xlsx' || acquisition.from !== job.from_date || acquisition.to !== job.to_date || acquisition.complete !== true) throw ccsError('ccs_incomplete_export');
  if (!env.R2_ARCHIVE) throw ccsError('ccs_archive_unavailable');
  const bytes = acquisition.bytes, hash = await ccsHash(bytes);
  const matrix = await readCcsXlsx(bytes);
  if (matrix.length > 751) throw ccsError('ccs_batch_requires_smaller_window');
  const normalized = normalizeCcsMatrix(matrix, { expectedAccount: CCS_ACCOUNT, sourceFormat: 'xlsx' });
  if (normalized.some(r => r.time.date < job.from_date || r.time.date > job.to_date)) throw ccsError('ccs_export_outside_window');
  // Local wall-clock is source evidence; UTC must remain unknown until CCS documents timezone.
  for (const row of normalized) {
    row.time = { ...row.time, utc: null, from: null, to: null, timezoneVerified: false, timezone: null };
    row.warnings.push('timezone_not_verified');
    row.preciseKey = row.time.local ? JSON.stringify([row.candidateKey, row.time.local]) : null;
  }
  const previous = await db.prepare('SELECT * FROM ccs_exports WHERE hash=? AND account=?').bind(hash, CCS_ACCOUNT).first();
  let loaded = normalized.length, inserted = 0, review = 0;
  const statements = [];
  if (!previous) {
    const old = await rows(db.prepare(`SELECT payload_json FROM ccs_observations WHERE account=? AND day>=? AND day<=? AND state<>'duplicate' LIMIT 20001`).bind(CCS_ACCOUNT, job.from_date, job.to_date));
    if (old.length > 20000) throw ccsError('ccs_reconciliation_limit');
    const plan = planCcsImport(normalized, { fileHash: hash, existingRows: old.map(r => json(r.payload_json)) });
    const objectKey = `ccs/${CCS_ACCOUNT}/${hash}.xlsx`;
    await env.R2_ARCHIVE.put(objectKey, bytes, { httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    const saved = await env.R2_ARCHIVE.get(objectKey);
    if (!saved || await ccsHash(await saved.arrayBuffer()) !== hash) throw ccsError('ccs_archive_readback_failed');
    statements.push(db.prepare('INSERT INTO ccs_exports VALUES(?,?,?,?,?,?,?,?)').bind(hash, CCS_ACCOUNT, objectKey, at, loaded, JSON.stringify(plan.totals), job.from_date, job.to_date));
    for (const row of plan.rows) {
      const accepted = row.action === 'stage_new' && row.currency && !row.warnings.includes('correction_or_transaction_type_requires_review');
      if (accepted) inserted++; else review++;
      statements.push(db.prepare(`INSERT INTO ccs_observations(id,account,export_hash,source_row,day,card,plate,product,driver_label,currency,gross_minor,payload_json,state,reason,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(`${hash}:${row.sourceRow}`, CCS_ACCOUNT, hash, row.sourceRow, row.time.date, row.cardId, row.plate, row.product, row.driverLabel, row.currency, row.grossMinor, JSON.stringify(row), accepted ? 'accepted' : 'review', row.action, at));
    }
  }
  statements.push(
    db.prepare(`UPDATE ccs_jobs SET status='succeeded',finished_at=?,loaded=?,inserted=?,review=?,file_hash=?,error_code=NULL WHERE id=? AND owner=? AND status='running'`).bind(at, loaded, inserted, review, hash, job.id, owner),
    db.prepare(`UPDATE ccs_state SET last_success=?,covered_to=?,last_backfill=CASE WHEN ?='2026-04-01' THEN ? ELSE last_backfill END,last_error=NULL,failure_since=NULL WHERE account=?`).bind(at, job.to_date, job.from_date, at, CCS_ACCOUNT),
    db.prepare(`UPDATE ccs_alerts SET resolved_at=? WHERE account=?`).bind(at, CCS_ACCOUNT),
    db.prepare(`INSERT INTO ccs_events VALUES(?,?,?,?,?,?,?)`).bind(id(), CCS_ACCOUNT, at, 'runner', 'import_committed', job.id, JSON.stringify({ loaded, inserted, review, hash }))
  );
  await db.batch([...fence(db, owner, Math.max(now, Date.now()), CCS_ACCOUNT), ...statements]);
  return { status: 'succeeded', loaded, inserted, review, hash };
}
const SAFE_CODES = new Set([CCS_BLOCKER, 'ccs_incomplete_export', 'ccs_archive_unavailable', 'ccs_archive_readback_failed', 'ccs_reconciliation_limit', 'ccs_export_outside_window', 'schema_changed', 'account_mismatch', 'net_vat_gross_mismatch', 'numeric_card_precision_unsafe', 'ccs_batch_requires_smaller_window']);
export async function runCcsQueue(env, { now = Date.now() } = {}, acquire = acquireCcsExport) {
  const CCS_ACCOUNT = ccsAccount(env), db = getArchiveDatabase(env), owner = await acquireLease(db, now, CCS_ACCOUNT);
  if (!owner) return { status: 'busy' };
  try {
    await db.prepare(`UPDATE ccs_jobs SET status='retry',due_at=?,error_code='ccs_process_interrupted' WHERE account=? AND status='running' AND lease_until<=?`).bind(iso(now), CCS_ACCOUNT, iso(now)).run();
    const job = await db.prepare(`SELECT * FROM ccs_jobs WHERE account=? AND status IN ('queued','retry') AND due_at<=? ORDER BY created_at,id LIMIT 1`).bind(CCS_ACCOUNT, iso(now)).first();
    if (!job) return { status: 'idle' };
    await db.prepare(`UPDATE ccs_jobs SET status='running',owner=?,lease_until=?,attempt=attempt+1 WHERE id=?`).bind(owner, iso(now + 10 * 60000), job.id).run();
    try {
      const acquisition = await acquire({ from: job.from_date, to: job.to_date, account: CCS_ACCOUNT, signal: AbortSignal.timeout(120000) }, env);
      return await ingestCcsExport(env, job, owner, acquisition, Math.max(now, Date.now()));
    } catch (error) {
      const code = SAFE_CODES.has(error.code) ? error.code : 'ccs_sync_failed';
      const blocked = code === CCS_BLOCKER;
      const due = iso(now + Math.min(4 * 3600000, 60000 * 2 ** Math.min(job.attempt, 8)));
      const statements = fence(db, owner, Math.max(now, Date.now()), CCS_ACCOUNT);
      statements.push(
        db.prepare(`UPDATE ccs_jobs SET status=?,finished_at=?,error_code=?,due_at=? WHERE id=? AND owner=?`).bind(blocked ? 'blocked' : 'retry', iso(now), code, blocked ? nextCcsRun(now) : due, job.id, owner),
        db.prepare(`UPDATE ccs_state SET last_error=?,failure_since=COALESCE(failure_since,?) WHERE account=?`).bind(code, iso(now), CCS_ACCOUNT),
        db.prepare(`INSERT INTO ccs_events VALUES(?,?,?,?,?,?,?)`).bind(id(), CCS_ACCOUNT, iso(now), 'runner', blocked ? 'source_blocked' : 'sync_failed', job.id, JSON.stringify({ code })),
        db.prepare(`INSERT INTO ccs_alerts SELECT account,failure_since,?,?,NULL FROM ccs_state WHERE account=? AND failure_since<=? ON CONFLICT(account) DO UPDATE SET last_seen=excluded.last_seen,code=excluded.code,resolved_at=NULL`).bind(iso(now), code, CCS_ACCOUNT, iso(now - 8 * 3600000))
      );
      await db.batch(statements);
      return { status: blocked ? 'blocked' : 'retry', code };
    }
  } finally { await db.prepare('DELETE FROM ccs_leases WHERE account=? AND owner=?').bind(CCS_ACCOUNT, owner).run(); }
}
export async function ccsStatus(env, now = Date.now()) {
  const CCS_ACCOUNT = ccsAccount(env), db = getArchiveDatabase(env);
  const state = await db.prepare('SELECT * FROM ccs_state WHERE account=?').bind(CCS_ACCOUNT).first();
  const jobs = await rows(db.prepare('SELECT id,trigger,status,created_at,due_at,attempt,finished_at,error_code,loaded,inserted,review FROM ccs_jobs WHERE account=? ORDER BY created_at DESC LIMIT 20').bind(CCS_ACCOUNT));
  const alert = await db.prepare('SELECT code,since_at FROM ccs_alerts WHERE account=? AND resolved_at IS NULL').bind(CCS_ACCOUNT).first();
  const seen = state?.scheduler_seen;
  return { sourceConnected: false, channel: null, blocker: CCS_BLOCKER, scheduler: { cron: CCS_CRON, platform: 'Cloudflare Workers', lastSeen: seen || null, verifiedRecent: Boolean(seen && now - Date.parse(seen) < 5 * 3600000), nextRun: seen ? nextCcsRun(now) : null }, lastSuccess: state?.last_success || null, lastError: state?.last_error || CCS_BLOCKER, jobs, alert, timezoneVerified: false, unitsVerified: false };
}
export async function ccsScheduled(controller, env) {
  if (![CCS_CRON, CCS_RECOVERY_CRON].includes(controller.cron)) return { status: 'ignored' };
  const CCS_ACCOUNT = ccsAccount(env), now = controller.scheduledTime || Date.now(), db = getArchiveDatabase(env);
  await db.prepare(`INSERT INTO ccs_state(account,scheduler_seen) VALUES(?,?) ON CONFLICT(account) DO UPDATE SET scheduler_seen=excluded.scheduler_seen`).bind(CCS_ACCOUNT, iso(now)).run();
  if (controller.cron === CCS_CRON) await enqueueCcs(env, { now, trigger: 'scheduled' });
  return runCcsQueue(env, { now });
}
