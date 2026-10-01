import assert from 'node:assert/strict';
import { dataBoxPlusSyncHealth as health, installDataBoxPlusViewRecovery as install } from '../src/data/dataBoxPlusRefresh.js';
const now = Date.parse('2026-10-01T06:05:00Z');
const good = { lastSync: '2026-10-01T06:02:00Z', lastSyncStatus: 'success' };
const base = { now, lastLoadedAt: now, mailboxes: [good], background: { enabled: true } };
assert.equal(health(base).warning, false);
for (const change of [
  { error: 'network' }, { lastLoadedAt: now - 100_000 }, { background: { enabled: false } },
  { mailboxes: [] }, { mailboxes: [{ ...good, lastSync: '2026-09-28T07:02:00Z' }] },
  { mailboxes: [{ ...good, lastSyncStatus: 'failed' }] }, { mailboxes: [{ ...good, lastSyncStatus: 'running' }] }
]) assert.equal(health({ ...base, ...change }).warning, true);
const events = new Map();
let clock = 0, active = true, blocked = false, calls = 0, updates = 0, interval, resolve;
const window = {
  setInterval(fn) { interval = fn; return 1; }, clearInterval() { interval = null; },
  addEventListener(k, v) { events.set(k, v); }, removeEventListener(k) { events.delete(k); }
};
const document = { visibilityState: 'visible', addEventListener: window.addEventListener, removeEventListener: window.removeEventListener };
let fail = false, hold = false;
const controller = install({ window, document, now: () => clock, active: () => active, blocked: () => blocked,
  updateStatus: () => updates++, refresh: async () => { calls++; if (hold) await new Promise(r => { resolve = r; }); if (fail) throw new Error('offline'); }
});
await controller.tick(); assert.equal(calls, 1);
await events.get('focus')(); assert.equal(calls, 1, 'focus must not duplicate recent fetch');
clock += 60_000; blocked = true; await controller.tick(); assert.equal(calls, 1, 'form protected');
blocked = false; document.visibilityState = 'hidden'; await controller.tick(); assert.equal(calls, 1);
document.visibilityState = 'visible'; await events.get('visibilitychange')(); assert.equal(calls, 2);
clock += 60_000; hold = true; const pending = controller.tick(); await events.get('online')(); assert.equal(calls, 3, 'inflight deduplicated'); resolve(); await pending; hold = false;
clock += 60_000; fail = true; await controller.tick(); assert.equal(calls, 4);
clock += 60_000; fail = false; await events.get('online')(); assert.equal(calls, 5, 'retry recovers after error');
clock += 60_000; active = false; await controller.tick(); assert.equal(calls, 5, 'other routes excluded');
assert.ok(updates > calls); controller.stop(); assert.equal(interval, null); assert.equal(events.size, 0);
console.log('PASS: DS view health, stale detection, network recovery, edit protection, visibility and inflight guards');

// Exercise the real loader: hanging requests are abortable, retries bounded and all reads uncached.
const { readFileSync } = await import('node:fs');
const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const loaderText = source.slice(source.indexOf('async function loadDataBoxPlusData(options = {})'), source.indexOf('let dataBoxPlusViewRecovery;'));
const state = { loading: false, loaded: false, error: '', lastAttemptAt: 0 };
let abortTimer, cleared = false, fetchCalls = 0, shouldFail = true;
const loader = new Function('dataBoxPlusState','window','apiJson','readDataBoxPlusTriageSnapshot','dataBoxPlusWorkingInboxActive','dataBoxPlusHumanError','applyDataBoxPlusMessageDeepLink','render','updateDataBoxPlusCountdownNodes','updateDataBoxPlusHealthNodes', `${loaderText}; return loadDataBoxPlusData;`)(
  state, { setTimeout(fn, ms) { assert.equal(ms,25000); abortTimer=fn; return 1; }, clearTimeout() { cleared=true; } },
  async (path, options) => { fetchCalls++; assert.equal(options.cache,'no-store'); assert.ok(options.signal); if(shouldFail) throw new Error('offline'); return {}; },
  async request => { await request('/api/data-box-plus/status', {method:'GET'}); return [{mailboxes:[],background:{enabled:true}}, {messages:[]}, {recommendations:[]}, {rules:[]}, {syncRuns:[]}, {drafts:[]}]; },
  () => true, x => x, async () => {}, () => {}, () => {}, () => {}
);
await loader(); assert.equal(state.loading,false); assert.equal(state.error,'offline'); assert.ok(cleared);
await loader(); assert.equal(fetchCalls,1,'failure render must not create a retry loop');
shouldFail=false; await loader({force:true,renderAfter:false}); assert.equal(state.error,''); assert.equal(state.loaded,true); assert.ok(state.lastLoadedAt > 0);
console.log('PASS: actual snapshot loader read-only cache policy and bounded error recovery');
