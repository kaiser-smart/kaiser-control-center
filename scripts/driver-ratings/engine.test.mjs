import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDay, resolveNorm, localDay, previousDay } from '../../functions/_lib/driver-rating-engine.js';
import { fixture, proof, NOW } from './fixture.mjs';
const result = (input, options = {}) => evaluateDay(input, { now: NOW, ...options }).results[0];
test('50/30/20 and 100-point ceiling, no bonus for extra normalized work', () => {
  const f = fixture(); assert.deepEqual([result(f).performance, result(f).efficiency, result(f).quality, result(f).total], [50, 30, 20, 100]);
  f.norms[0].manual.seconds *= 4; assert.equal(result(f).total, 100);
});
test('verified waste affects exact two specified formulas, never more penalties', () => {
  const f = fixture(), shift = f.drivers[0].shifts[0], first = shift.segments[0];
  first.to = '2026-10-27T13:00:00Z';
  shift.segments.push({ ...first, id: 'waste', from: first.to, to: shift.to, kind: 'waste', activityId: undefined, reason: 'Testovací potvrzená zbytečná ztráta' });
  f.norms[0].manual.seconds = 21600;
  assert.deepEqual([result(f).performance, result(f).efficiency, result(f).quality, result(f).total], [37.5, 22.5, 20, 80]);
  shift.segments[1].reason = ''; assert.equal(result(f).total, null);
});
for (const kind of ['break', 'external']) test(`${kind} excluded once from denominator, not a deduction`, () => {
  const f = fixture(), shift = f.drivers[0].shifts[0], first = shift.segments[0];
  first.to = '2026-10-27T14:00:00Z';
  shift.segments.push({ ...first, id: kind, from: first.to, to: shift.to, kind, reason: 'Doložený důvod' });
  f.norms[0].manual.seconds = 25200;
  assert.equal(result(f).total, 100); assert.equal(result(f).acceptedSeconds, 25200);
});
test('equal normalized fulfillment across job categories and shorter >=4h shifts', () => {
  const full = result(fixture());
  const f = fixture(); f.drivers[0].shifts[0].from = f.drivers[0].shifts[0].segments[0].from = '2026-10-27T11:00:00Z';
  f.norms[0].manual.seconds = 14400;
  f.norms[0].category = f.drivers[0].activities[0].category = f.drivers[0].shifts[0].segments[0].category = 'container';
  assert.equal(result(f).total, full.total);
  f.drivers[0].shifts[0].from = f.drivers[0].shifts[0].segments[0].from = '2026-10-27T12:00:00Z';
  assert.equal(result(f).total, null); assert(result(f).reasons.includes('short'));
});
test('median needs 15 distinct verified comparable samples within previous 90 days', () => {
  const f = fixture(), n = f.norms[0]; delete n.manual;
  n.samples = Array.from({ length: 15 }, (_, i) => ({ id: String(i), seconds: (i + 1) * 1000, completedAt: '2026-10-01T12:00:00Z', comparable: true, evidence: proof() }));
  assert.equal(resolveNorm(n, f.day, NOW).seconds, 8000);
  n.samples.pop(); assert.equal(resolveNorm(n, f.day, NOW), null);
  n.samples.push(n.samples[0]); assert.equal(resolveNorm(n, f.day, NOW), null);
  n.samples[14] = { ...n.samples[0], id: 'new', completedAt: f.asOf }; assert.equal(resolveNorm(n, f.day, NOW), null);
  n.samples[14].completedAt = '2026-01-01T12:00:00Z'; assert.equal(resolveNorm(n, f.day, NOW), null);
});
test('no partial-score extrapolation when a norm or quality check is missing', () => {
  for (const field of ['norm', 'quality', 'work', 'assignment']) {
    const f = fixture();
    if (field === 'norm') f.norms = [];
    if (field === 'quality') delete f.drivers[0].activities[0].checks.quality;
    if (field === 'work') f.drivers[0].activities[0].completedAt = null;
    if (field === 'assignment') delete f.drivers[0].shifts[0].segments[0].assignmentEvidence;
    assert.equal(result(f).total, null, field); assert(result(f).reasons.includes(field));
  }
});
test('quality failures need positive attribution; missing complaints never imply quality', () => {
  const f = fixture(), check = f.drivers[0].activities[0].checks.quality;
  check.status = 'fail'; check.reason = 'Potvrzený testovací nedostatek'; assert.equal(result(f).quality, null);
  check.driverResponsible = true; assert.equal(result(f).quality, 15); assert.equal(result(f).total, 95);
});
test('quality uses workload, not count of small jobs', () => {
  const f = fixture(), d = f.drivers[0], s = d.shifts[0], a = d.activities[0];
  s.segments[0].to = '2026-10-27T14:00:00Z'; a.completedAt = s.segments[0].to;
  f.norms[0].manual.seconds = 25200;
  f.norms.push({ ...structuredClone(f.norms[0]), key: 'small', manual: { ...f.norms[0].manual, seconds: 3600 } });
  s.segments.push({ ...s.segments[0], id: 'small', from: s.segments[0].to, to: s.to, activityId: 'small' });
  d.activities.push({ ...structuredClone(a), id: 'small', jobId: 'small-job', normKey: 'small', completedAt: s.to });
  d.activities[1].checks.quality = { status: 'fail', driverResponsible: true, reason: 'Doložený nedostatek', evidence: proof() };
  assert.equal(result(f).quality, 19.38);
});
for (const change of ['gap', 'overlap', 'future', 'ambiguous_time', 'unknown_kind', 'missing_shift']) test(`invalid timeline ${change} is unrated`, () => {
  const f = fixture(), s = f.drivers[0].shifts[0];
  if (change === 'gap') s.segments[0].from = '2026-10-27T08:00:00Z';
  if (change === 'overlap') s.segments.push({ ...s.segments[0], id: 'overlap' });
  if (change === 'future') s.to = s.segments[0].to = '2026-10-27T16:00:00Z';
  if (change === 'ambiguous_time') s.from = '2026-10-27T07:00:00';
  if (change === 'unknown_kind') s.segments[0].kind = 'ignition';
  if (change === 'missing_shift') delete f.drivers[0].shifts;
  assert.equal(result(f).total, null);
});
test('duplicate whole job/stage/driver and conflicting driver change are blocked', () => {
  for (const type of ['job', 'stage', 'driver', 'vehicle']) {
    const f = fixture(), other = structuredClone(f.drivers[0]);
    other.id = type === 'driver' ? f.drivers[0].id : 'other'; other.shifts[0].id = 'other-shift';
    other.shifts[0].segments[0].driverId = other.id;
    other.shifts[0].segments[0].vehicleId = type === 'vehicle' ? 'test-vehicle' : 'other-vehicle';
    if (type === 'stage') other.activities[0].stageId = 'stage';
    if (type === 'vehicle') other.activities[0].jobId = 'other-job';
    f.drivers.push(other);
    assert(evaluateDay(f, { now: NOW }).results.every(d => d.total === null));
  }
});
test('verified non-overlapping driver handover can rank both drivers', () => {
  const f = fixture(), d = f.drivers[0], other = structuredClone(d);
  d.shifts[0].to = d.shifts[0].segments[0].to = d.activities[0].completedAt = '2026-10-27T11:00:00Z';
  other.id = 'other'; other.shifts[0].id = 'other-shift'; other.shifts[0].from = other.shifts[0].segments[0].from = d.shifts[0].to; other.shifts[0].segments[0].driverId = other.id; other.activities[0].jobId = 'other-job';
  f.norms[0].manual.seconds = 14400; f.drivers.push(other);
  assert.deepEqual(evaluateDay(f, { now: NOW }).ranking.map(d => d.total), [100, 100]);
  assert.equal(evaluateDay(f, { now: NOW }).tiedFirst, true);
});
test('night shift belongs to start day; closure after Prague 07:00 only', () => {
  const f = fixture(), s = f.drivers[0].shifts[0], cutoff = '2026-10-28T06:00:00Z';
  s.from = s.segments[0].from = '2026-10-27T21:00:00Z'; s.to = s.segments[0].to = f.drivers[0].activities[0].completedAt = '2026-10-28T05:00:00Z';
  f.asOf = cutoff; f.closeEvidence = proof('closed', cutoff);
  f.sources.forEach(s => { s.successAt = s.completeThrough = cutoff; });
  const now = Date.parse(cutoff); assert.equal(evaluateDay(f, { now }).final, true);
  delete f.closeEvidence; assert.equal(evaluateDay(f, { now }).final, false);
  assert.equal(localDay('2026-10-25T22:30:00Z'), '2026-10-25'); assert.equal(previousDay('2026-03-30'), '2026-03-29');
});
test('delayed / failed / incomplete source and incomplete roster block total', () => {
  for (const change of ['late', 'failed', 'incomplete', 'roster']) {
    const f = fixture();
    if (change === 'failed') f.sources[0].status = 'error';
    if (change === 'incomplete') f.sources[0].completeThrough = '2026-10-27T14:59:00Z';
    if (change === 'roster') f.rosterEvidence = null;
    assert.equal(result(f, change === 'late' ? { now: NOW + 31 * 60000 } : {}).total, null);
  }
});
test('category filter cannot count work in another category', () => {
  assert.equal(evaluateDay(fixture(), { now: NOW, category: 'container' }).results.length, 0);
  assert.equal(result(fixture(), { category: 'tanker' }).total, 100);
});
