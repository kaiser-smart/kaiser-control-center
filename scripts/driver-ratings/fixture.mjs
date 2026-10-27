// Synthetic data exclusively for automated tests; never imported by production code.
export const NOW = Date.parse('2026-10-27T15:00:00Z');
export function proof(id = 'test-proof', at = '2026-10-27T15:00:00Z') { return { source: 'synthetic-test', recordId: id, verifiedBy: 'test-admin', verifiedAt: at }; }
export function fixture() {
  const e = proof();
  return {
    version: 1, installation: 'test-installation', companyId: 'test-company', day: '2026-10-27', asOf: '2026-10-27T15:00:00Z', rosterEvidence: e,
    sources: ['jobs', 'shifts', 'assignments', 'quality'].map(id => ({ id, status: 'ready', successAt: '2026-10-27T15:00:00Z', completeThrough: '2026-10-27T15:00:00Z', evidence: e })),
    norms: [{ key: 'norm', category: 'tanker', scope: 'work_and_necessary_travel', cohort: 'Ověřeně srovnatelný testovací rozsah práce včetně přejezdů', evidence: e, samples: [], manual: { seconds: 28800, from: '2026-01-01', evidence: e } }],
    drivers: [{ id: 'test-driver', userId: 'test-driver-user', name: 'TEST · Řidič se záměrně velmi dlouhým jménem', identityEvidence: e,
      shifts: [{ id: 'shift', from: '2026-10-27T07:00:00Z', to: '2026-10-27T15:00:00Z', closed: true, evidence: e, segments: [{ id: 'segment', from: '2026-10-27T07:00:00Z', to: '2026-10-27T15:00:00Z', kind: 'work', activityId: 'activity', driverId: 'test-driver', vehicleId: 'test-vehicle', plate: 'TEST 001', vehicleName: 'Testovací cisterna', category: 'tanker', evidence: e, assignmentEvidence: e }] }],
      activities: [{ id: 'activity', jobId: 'test-job', category: 'tanker', normKey: 'norm', completedAt: '2026-10-27T15:00:00Z', evidence: e, checks: Object.fromEntries(['completion', 'documentation', 'quality'].map(k => [k, { status: 'pass', evidence: e }])) }]
    }]
  };
}
