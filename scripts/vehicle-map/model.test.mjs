import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { reconcile, normalize, filterVehicles, presentationType, validateSample } from '../../src/vehicle-map/model.js';
import { clusterPoints, overlaps, markerRect, labelMarkerRect, placeLabels, spreadPoints } from '../../src/vehicle-map/spatial.js';
const now = Date.parse('2026-10-25T10:00:00Z');
const sample = (id, overrides = {}) => ({ id: `tcars-position-${id}-sample`, externalProvider: 'tcars', externalVehicleId: id, latitude: 49.2, longitude: 16.6, lastGpsAt: new Date(now - 60000).toISOString(), gpsValid: true, speedKmh: 30, heading: 0, ignition: false, ...overrides });
const model = (locations, previous, opts = {}) => normalize(reconcile({ locations }, previous, { now }), { now, ...opts });
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
test('47 minute valid point retained with stale category and no heading', () => { const [v] = model([sample('a', { lastGpsAt: new Date(now - 47 * 60000).toISOString() })]); assert(v.point); assert.equal(v.category, 'stale'); assert.equal(v.heading, null); });
test('null/empty/negative speed never means stopped; ignition tri-state', () => {
  for (const speedKmh of [null, '', ' ', undefined, -1, NaN]) for (const ignition of [null, false, true]) {
    const [v] = model([sample('a', { speedKmh, ignition })]); assert.equal(v.category, 'unknown'); assert.equal(v.ignition, ignition);
  }
  for (const speedKmh of [0, 2, '0']) assert.equal(model([sample('a', { speedKmh })])[0].category, 'stopped');
  assert.equal(model([sample('a', { speedKmh: 2.1 })])[0].category, 'moving');
});
test('invalid position/time/clock cannot create live points; receipt time ignored', () => {
  for (const patch of [{ gpsValid: false }, { latitude: null }, { longitude: '' }, { latitude: 0 }, { longitude: 0 }, { latitude: 91 }, { longitude: Infinity }, { lastGpsAt: '' }, { lastGpsAt: 'bad' }, { lastGpsAt: new Date(now + 121000).toISOString() }]) {
    const [v] = model([sample('a', { ...patch, receivedAt: new Date(now).toISOString() })]); assert.equal(v.point, null, JSON.stringify(patch)); assert.equal(v.category, 'missing');
  }
  const [v] = model([sample('a', { lastGpsAt: new Date(now + 120000).toISOString() })]); assert.equal(v.age, 0); assert.equal(v.clockSkew, true); assert.equal(v.heading, 0);
});
test('120 second direction/age boundary and configurable stale threshold', () => {
  assert.equal(model([sample('a', { lastGpsAt: new Date(now - 120000).toISOString() })])[0].heading, 0);
  assert.equal(model([sample('a', { lastGpsAt: new Date(now - 120001).toISOString() })])[0].heading, null);
  assert.equal(model([sample('a')], undefined, { staleAfterSeconds: 30 })[0].category, 'stale');
});
test('new invalid sample retains genuine earlier valid point and time', () => {
  const old = reconcile({ locations: [sample('a')] }, undefined, { now });
  const [v] = model([sample('a', { id: 'tcars-position-new', latitude: 10, gpsValid: false, lastGpsAt: new Date(now).toISOString() })], old);
  assert.equal(v.point.lat, 49.2); assert.equal(v.lastGpsAt, sample('a').lastGpsAt); assert.equal(v.previousPoint, true); assert.equal(v.heading, null);
});
test('sample ID changes preserve identity, dedup, latest GPS wins and old responses cannot roll back', () => {
  const first = sample('a'); const second = sample('a', { id: 'different-sample', lastGpsAt: new Date(now).toISOString(), longitude: 16.7 });
  const state = reconcile({ locations: [first, second] }, undefined, { now });
  assert.equal(state.size, 1); const id = [...state.keys()][0];
  const next = reconcile({ locations: [first] }, state, { now });
  assert.equal([...next.keys()][0], id); assert.equal(normalize(next, { now })[0].point.lng, 16.7);
});
test('roster-only rows survive; removed authorized IDs do not survive', () => {
  const old = reconcile({ locations: [sample('a'), sample('b')] }, undefined, { now });
  const state = reconcile({ vehicles: [{ externalVehicleId: 'a' }, { externalVehicleId: 'c' }], locations: [sample('a')] }, old, { now });
  assert.equal(state.size, 2); assert.equal(normalize(state, { now }).filter((v) => v.category === 'missing').length, 1);
});
test('missing stable identity does not fall back to registration or GPS sample id', () => {
  const [v] = model([sample('', { externalVehicleId: '', licensePlate: 'TEST 001' })]); assert.equal(v.stable, false); assert.equal(v.point, null);
});
test('scope isolates provider IDs and canonical alias merges roster and samples', () => {
  const state = reconcile({ vehicles: [{ vehicleId: 'canonical', externalVehicleId: 'a' }], locations: [sample('a')] }, undefined, { now, scope: 'org1' });
  assert.equal(state.size, 1); assert.equal([...state.keys()][0], 'org1:vehicle:canonical');
  assert.notEqual([...reconcile({ locations: [sample('a')] }, undefined, { now, scope: 'org1' }).keys()][0], [...reconcile({ locations: [sample('a')] }, undefined, { now, scope: 'org2' }).keys()][0]);
});
test('verified artwork assignments override enum; unknown container is never HAK', () => {
  assert.equal(presentationType({ licensePlate: '1BI 4520', type: 'collection_truck' }).key, 'tanker');
  assert.equal(presentationType({ licensePlate: '3BH 5548' }).key, 'skip_loader');
  assert.equal(presentationType({ type: 'container_truck' }).monogram, '?');
  assert.equal(presentationType({ type: 'hook_loader' }).monogram, 'HÁK');
  assert.equal(presentationType({ name: 'MAN cisterna', iconType: 'collection_truck' }).key, 'unknown');
});
test('search and category counts form disjoint union including missing/stale/unknown', () => {
  const fleet = model([sample('1', { licensePlate: 'TEST 001' }), sample('2', { licensePlate: 'TEST 002', speedKmh: 0 }), sample('3', { licensePlate: 'TEST 003', speedKmh: null }), sample('4', { licensePlate: 'TEST 004', gpsValid: false }), sample('5', { licensePlate: 'TEST 005', lastGpsAt: new Date(now - 4000000).toISOString() })]);
  const { counts } = filterVehicles(fleet); assert.equal(counts.all, Object.entries(counts).filter(([k]) => k !== 'all').reduce((s, [, n]) => s + n, 0));
  assert.equal(filterVehicles(fleet, 'test001').vehicles.length, 1); assert.equal(filterVehicles(fleet, 't e s t 001').vehicles.length, 1);
});
const points = (count, identical = true) => Array.from({ length: count }, (_, i) => ({ id: `test-${i}`, x: identical ? 500 : 50 + (i % 20) * 21, y: identical ? 350 : 50 + Math.floor(i / 20) * 19, vehicle: { label: `Very long test label ${i}`, heading: null, age: i * 30 } }));
test('6,20,200 coincident points counted once and spiderfy limit respected', () => {
  for (const n of [6, 20, 200]) { const groups = clusterPoints(points(n)); assert.equal(groups.length, 1); assert.equal(groups[0].members.length, n); }
  const bounds = { left: 0, top: 0, right: 1000, bottom: 700 };
  const spread = spreadPoints(points(6), { x: 500, y: 350 }, bounds); assert.equal(spread.length, 6);
  for (let i = 0; i < spread.length; i++) for (let j = i + 1; j < spread.length; j++) assert(!overlaps(markerRect(spread[i]), markerRect(spread[j])));
  assert.equal(spreadPoints(points(20), { x: 500, y: 350 }, bounds), null);
});
test('rectangle threshold independent of fleet count, secondary cluster collisions converge', () => {
  assert.equal(clusterPoints([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 71, y: 63 }]).length, 1);
  assert.equal(clusterPoints([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 100 }]).length, 2);
  const groups = clusterPoints(points(200, false));
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) assert(!overlaps(groups[i].bounds, groups[j].bounds, 6));
  assert.equal(groups.reduce((s, g) => s + g.members.length, 0), 200);
});
test('label priority, actual measured widths and control exclusion', () => {
  const ps = points(3).map((p, i) => ({ ...p, x: 100 + i * 100, y: 150 }));
  const control = { left: 0, right: 700, top: 0, bottom: 80 };
  const occupied = [control, ...ps.map(labelMarkerRect)];
  const result = placeLabels(ps, occupied, { left: 0, top: 0, right: 700, bottom: 400 }, (text) => ({ width: text.length * 8 + 16, height: 26 }), ps[1].id);
  assert(result.has(ps[1].id)); const placed = [...result.values()];
  placed.forEach((r) => occupied.forEach((o) => assert(!overlaps(r, o))));
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) assert(!overlaps(placed[i], placed[j], 3));
});
test('new supplied equipment artwork uses explicit declared type, never nickname', () => {
 for (const [declared,expected] of [['Bagr','excavator'],['VZV','forklift'],['Nákladní vůz','truck']]) assert.equal(presentationType({vehicleType:declared}).key,expected);
 assert.equal(presentationType({name:'VZV Bagr'}).key,'unknown');
 assert.equal(presentationType({name:'VZV',vehicleType:'car'}).key,'car');
});
const timings = [];
for (let i = 0; i < 100; i++) { const start = performance.now(); clusterPoints(points(200, false)); timings.push(performance.now() - start); }
timings.sort((a, b) => a - b);
console.log(JSON.stringify({ checks, spatial200ms: { median: timings[50], p95: timings[95], max: timings[99] } }, null, 2));
