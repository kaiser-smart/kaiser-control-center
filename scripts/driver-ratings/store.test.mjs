import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fixture, NOW, proof } from './fixture.mjs';
import { saveInput, latestInput, calculateInput, readRatings, validateHistoricalResults, runDriverRatings } from '../../functions/_lib/driver-rating-store.js';
import { createSessionCookie } from '../../functions/_lib/auth.js';
import { onRequestGet } from '../../functions/api/vehicle-tracking/driver-ratings.js';
import { onRequestPost } from '../../functions/api/vehicle-tracking/driver-rating-evidence.js';
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../../migrations/modular/archive/0004_driver_ratings.sql', import.meta.url), 'utf8'));
  sqlite.exec(`CREATE TABLE vistos_company_access(user_id TEXT,installation TEXT,company_id TEXT);
    CREATE TABLE users(id TEXT,name TEXT,email TEXT,phone TEXT,role TEXT,status TEXT,active INTEGER,department TEXT,position TEXT,manager_id TEXT,manager_name TEXT,permissions_json TEXT,modules_json TEXT,allowed_modules_json TEXT,denied_modules_json TEXT,created_at TEXT,updated_at TEXT,last_login_at TEXT);`);
  const db = { sqlite, prepare(sql) { let values = []; return { bind(...v) { values = v; return this; }, async first() { return sqlite.prepare(sql).get(...values) || null; }, async all() { return { results: sqlite.prepare(sql).all(...values) }; }, async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; } }; }, async batch(statements) { sqlite.exec('BEGIN'); try { const output = []; for (const stmt of statements) output.push(await stmt.run()); sqlite.exec('COMMIT'); return output; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
  const scope = { installation: 'test-installation', companies: ['test-company'], user: { id: 'test-admin', name: 'Test admin', email: 'test-admin@example.test', role: 'admin', active: true } };
  return { db, scope };
}
async function store(db, scope, f = fixture(), revision = 0, now = NOW) {
  await saveInput(db, scope, f, { expectedRevision: revision, reason: 'Ověřený testovací podklad', now });
  const row = await latestInput(db, f.installation, f.companyId, f.day); await calculateInput(db, row, now); return row;
}
async function validate(db, scope) {
  return validateHistoricalResults(db, scope, { companyId: 'test-company', evidence: proof(), cases: [{ day: '2026-10-27', revision: 1, driverId: 'test-driver', evidence: proof(), expected: { performance: 50, efficiency: 30, quality: 20, total: 100 } }] }, NOW + 86400000);
}
test('default shadow hides scores; explicit admin audit can inspect internal results', async () => {
  const { db, scope } = setup(); await store(db, scope);
  const hidden = await readRatings(db, scope, '2026-10-27', 'all', { now: NOW });
  assert.equal(hidden.mode, 'shadow'); assert.deepEqual(hidden.drivers, []); assert.deepEqual(hidden.ranking, []);
  const audit = await readRatings(db, scope, '2026-10-27', 'all', { audit: true, now: NOW }); assert.equal(audit.ranking[0].total, 100);
  const dispatcher = await readRatings(db, { ...scope, user: { ...scope.user, role: 'dispecer' } }, '2026-10-27', 'all', { audit: true, now: NOW }); assert.deepEqual(dispatcher.ranking, []);
});
test('compare exact historical scores, reject wrong expected values and preserve immutable revisions', async () => {
  const { db, scope } = setup(); await store(db, scope); await validate(db, scope);
  const visible = await readRatings(db, scope, '2026-10-27', 'all', { now: NOW }); assert.equal(visible.ranking[0].total, 100);
  await assert.rejects(saveInput(db, scope, fixture(), { expectedRevision: 0, reason: 'stale', now: NOW }), /revision_conflict/);
  const f = fixture(); f.norms[0].manual.seconds /= 2; await store(db, scope, f, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM driver_rating_inputs').get().n, 2);
  assert.equal((await readRatings(db, scope, f.day, 'all', { now: NOW })).mode, 'shadow');
  await assert.rejects(validate(db, scope), /revision_changed/);
});
test('scheduled retries are idempotent within a 15 minute slot; no browser is needed', async () => {
  const { db, scope } = setup(); await store(db, scope);
  await runDriverRatings({ DB_ARCHIVE: db }, NOW); await runDriverRatings({ DB_ARCHIVE: db }, NOW + 1000);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM driver_rating_results').get().n, 5);
  await runDriverRatings({ DB_ARCHIVE: db }, NOW + 900000); assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM driver_rating_results').get().n, 5);
  await runDriverRatings({ DB_ARCHIVE: db }, NOW + 2700000); assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM driver_rating_results').get().n, 10);
});
test('driver only sees own verified identity, no other ranking or counts; dispatcher gets no audit details', async () => {
  const { db, scope } = setup(); await store(db, scope); await validate(db, scope);
  const own = await readRatings(db, { ...scope, user: { id: 'test-driver-user', role: 'ridic' } }, '2026-10-27', 'all', { now: NOW });
  assert.equal(own.drivers.length, 1); assert.deepEqual(own.ranking, []); assert.equal(own.drivers[0].userId, undefined);
  const other = await readRatings(db, { ...scope, user: { id: 'someone-else', role: 'ridic' } }, '2026-10-27', 'all', { now: NOW }); assert.deepEqual(other.drivers, []);
  const dispatcher = await readRatings(db, { ...scope, user: { id: 'dispatcher', role: 'dispecer' } }, '2026-10-27', 'all', { now: NOW }); assert.equal(dispatcher.ranking[0].activities, undefined); assert.equal(dispatcher.ranking[0].segments, undefined);
  const foreign = await readRatings(db, { ...scope, companies: ['foreign-company'] }, '2026-10-27', 'all', { audit: true, now: NOW }); assert.deepEqual(foreign.drivers, []);
});
test('stale computations and newer pending evidence never display old winners', async () => {
  const { db, scope } = setup(); await store(db, scope); await validate(db, scope);
  assert.deepEqual((await readRatings(db, scope, '2026-10-27', 'all', { now: NOW + 31 * 60000 })).ranking, []);
  await saveInput(db, scope, fixture(), { expectedRevision: 1, reason: 'Oprava čekající na výpočet', now: NOW });
  assert.deepEqual((await readRatings(db, scope, '2026-10-27', 'all', { now: NOW })).ranking, []);
});
test('endpoint denies anonymous, unknown role, revoked rights, foreign companies and cross-origin writes', async () => {
  const { db, scope } = setup();
  const env = { APP_ENV: 'test', AUTH_MODE: 'mock', AUTH_USERS_JSON: JSON.stringify([scope.user]), DB_CORE: db, DB_ARCHIVE: db, DB_AUDIT: db };
  const url = 'https://example.test/api/vehicle-tracking/driver-ratings';
  assert.equal((await onRequestGet({ env, request: new Request(url) })).status, 401);
  const cookie = await createSessionCookie(env, scope.user);
  const request = new Request(url, { headers: { Cookie: cookie } });
  assert.equal((await onRequestGet({ env, request })).status, 403);
  db.sqlite.prepare('INSERT INTO vistos_company_access VALUES(?,?,?)').run(scope.user.id, scope.installation, scope.companies[0]);
  assert.equal((await onRequestGet({ env, request })).status, 200);
  assert.equal((await onRequestGet({ env, request: new Request(url + '?period=2000', { headers: { Cookie: cookie } }) })).status, 400);
  env.AUTH_USERS_JSON = JSON.stringify([{ ...scope.user, role: 'readonly' }]); assert.equal((await onRequestGet({ env, request })).status, 403);
  env.AUTH_USERS_JSON = JSON.stringify([{ ...scope.user, role: 'ridic', deniedModules: ['vehicle-tracking'] }]); assert.equal((await onRequestGet({ env, request })).status, 403);
  env.AUTH_USERS_JSON = JSON.stringify([scope.user]);
  assert.equal((await onRequestPost({ env, request: new Request(url, { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.test', 'Content-Type': 'application/json' }, body: '{}' }) })).status, 403);
  env.DB_ARCHIVE = null; assert.equal((await onRequestGet({ env, request })).status, 503);
});
