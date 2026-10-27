// Evidence-only calculation. GPS speed, ignition and stop duration are never inputs.
export const RATING_VERSION = 'driver-day-1';
export const TIME_ZONE = 'Europe/Prague';
export const CATEGORIES = { tanker: 'Sací cisterny', container: 'Kontejnerová doprava', cleaning: 'Speciální čištění', other: 'Ostatní provozní činnosti' };
export const REASONS = {
  source: 'Chybí úplná a aktuální synchronizace zdrojů.',
  roster: 'Není ověřen úplný seznam směn pro hodnocený den.',
  time: 'Pracovní úseky mají mezeru, překryv nebo neověřený čas.',
  assignment: 'Přiřazení řidiče a vozidla v hodnoceném čase není ověřeno.',
  duplicate: 'Zakázka, etapa nebo směna má duplicitní či konfliktní přiřazení.',
  norm: 'Chybí srovnatelná historická nebo schválená ruční norma.',
  work: 'Část práce nemá ověřenou dokončenou zakázku či etapu.',
  quality: 'Chybí výslovná kontrola dokončení, dokumentace nebo kvality.',
  short: 'Zatím nejsou doloženy alespoň 4 hodiny uznatelného času.',
  empty: 'Nejsou dostupné ověřené směny.',
  review: 'Čeká se na uzavření a kontrolu všech směn.',
  shadow: 'Výsledky jsou v interním kontrolním režimu; historické ověření není dokončeno.'
};
export function instant(value) {
  return typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
}
export function localDay(value) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function previousDay(day) { return new Date(Date.parse(day + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10); }
export function isDay(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
const text = value => typeof value === 'string' && value.trim().length > 0;
export function hasEvidence(value, now = Date.now()) {
  return Boolean(value && text(value.source) && text(value.recordId) && text(value.verifiedBy) && Number.isFinite(instant(value.verifiedAt)) && instant(value.verifiedAt) <= now);
}
const round = value => Math.round(value * 100) / 100;
const unique = values => [...new Set(values)];

export function resolveNorm(norm, day, now) {
  if (!norm || norm.scope !== 'work_and_necessary_travel' || !hasEvidence(norm.evidence, now) || !text(norm.cohort)) return null;
  const boundary = Date.parse(day + 'T00:00:00Z');
  const samples = new Map();
  for (const sample of norm.samples || []) {
    if (!text(sample.id) || !Number.isFinite(instant(sample.completedAt))) continue;
    const sampleDay = localDay(sample.completedAt);
    if (sampleDay >= day || Date.parse(sampleDay + 'T00:00:00Z') < boundary - 90 * 86400000 || !hasEvidence(sample.evidence, now) || sample.comparable !== true || !(Number.isFinite(sample.seconds) && sample.seconds > 0)) continue;
    if (samples.has(sample.id) && JSON.stringify(samples.get(sample.id)) !== JSON.stringify(sample)) return null;
    samples.set(sample.id, sample);
  }
  if (samples.size >= 15) {
    const rows = [...samples.values()].sort((a, b) => a.seconds - b.seconds);
    const middle = Math.floor(rows.length / 2);
    return { seconds: rows.length % 2 ? rows[middle].seconds : (rows[middle - 1].seconds + rows[middle].seconds) / 2, method: 'median90', sampleIds: rows.map(row => row.id), evidence: norm.evidence, cohort: norm.cohort };
  }
  const m = norm.manual;
  if (m && Number.isFinite(m.seconds) && m.seconds > 0 && isDay(m.from) && m.from <= day && (!m.to || (isDay(m.to) && day < m.to)) && hasEvidence(m.evidence, now)) {
    return { seconds: m.seconds, method: 'approved_manual', evidence: m.evidence, cohort: norm.cohort };
  }
  return null;
}

// A night shift belongs to its Prague START date. Never split at midnight or use 24h as a civil day.
export function evaluateDay(input, { now = Date.now(), category = 'all' } = {}) {
  if (!input || input.version !== 1 || !isDay(input.day) || !text(input.installation) || !text(input.companyId) || !Array.isArray(input.drivers) || input.drivers.length > 500 || !Array.isArray(input.norms) || !['all', ...Object.keys(CATEGORIES)].includes(category)) throw new Error('rating_input_invalid');
  const asOf = instant(input.asOf);
  if (!Number.isFinite(asOf) || asOf > now || input.day > localDay(asOf)) throw new Error('rating_cutoff_invalid');
  const globalReasons = [];
  const closeHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));
  const readyToClose = input.day < previousDay(localDay(now)) || (input.day === previousDay(localDay(now)) && closeHour >= 7);
  const closeReviewed = readyToClose && hasEvidence(input.closeEvidence, now) && instant(input.closeEvidence.verifiedAt) >= asOf;
  const sources = input.sources || [];
  // Both actual availability and completeness must be attested; a successful request alone is insufficient.
  if ((!closeReviewed && now - asOf > 30 * 60000) || !['jobs', 'shifts', 'assignments', 'quality'].every(id => sources.some(s => s.id === id && s.status === 'ready' && hasEvidence(s.evidence, now) && instant(s.successAt) <= now && instant(s.successAt) >= instant(s.completeThrough) && instant(s.completeThrough) >= asOf && instant(s.completeThrough) <= now))) globalReasons.push('source');
  if (!hasEvidence(input.rosterEvidence, now)) globalReasons.push('roster');
  const seenDrivers = new Set(), seenShifts = new Map(), seenActivities = new Map(), assignments = [];
  const conflicts = new Set();
  for (const d of input.drivers) {
    if (!text(d.id) || seenDrivers.has(d.id)) conflicts.add(d.id);
    seenDrivers.add(d.id);
    for (const shift of d.shifts || []) {
      if (!text(shift.id) || seenShifts.has(shift.id)) { conflicts.add(d.id); conflicts.add(seenShifts.get(shift.id)); }
      seenShifts.set(shift.id, d.id);
      for (const segment of shift.segments || []) {
        if (['work', 'waste'].includes(segment.kind)) assignments.push({ driverId: d.id, vehicleId: segment.vehicleId, from: instant(segment.from), to: instant(segment.to) });
      }
    }
    for (const activity of d.activities || []) {
      const key = `${activity.jobId}:${activity.stageId || 'whole'}`;
      if (seenActivities.has(key)) { conflicts.add(d.id); conflicts.add(seenActivities.get(key)); }
      seenActivities.set(key, d.id);
    }
  }
  // Whole jobs and their stages cannot both receive the same normative credit.
  for (const d of input.drivers) for (const a of d.activities || []) if (a.stageId && seenActivities.has(`${a.jobId}:whole`)) { conflicts.add(d.id); conflicts.add(seenActivities.get(`${a.jobId}:whole`)); }
  assignments.sort((a, b) => a.from - b.from);
  for (let i = 0; i < assignments.length; i++) for (let j = i + 1; j < assignments.length && assignments[j].from < assignments[i].to; j++) {
    const a = assignments[i], b = assignments[j];
    if (a.driverId === b.driverId || (a.vehicleId && a.vehicleId === b.vehicleId)) { conflicts.add(a.driverId); conflicts.add(b.driverId); }
  }
  const norms = new Map();
  for (const norm of input.norms) { if (norms.has(norm.key)) throw new Error('rating_norm_duplicate'); norms.set(norm.key, norm); }
  const results = input.drivers.filter(driver => category === 'all' || (driver.shifts || []).some(s => (s.segments || []).some(i => i.category === category)) || (driver.activities || []).some(a => a.category === category)).map(driver => {
    const reasons = [...globalReasons];
    if (conflicts.has(driver.id)) reasons.push('duplicate');
    if (!text(driver.name) || !hasEvidence(driver.identityEvidence, now)) reasons.push('assignment');
    const allSegments = [], selectedSegments = [], activityIds = new Set();
    let acceptedSeconds = 0, wasteSeconds = 0, normalizedSeconds = 0;
    const shifts = [...(driver.shifts || [])].sort((a, b) => instant(a.from) - instant(b.from));
    let previousEnd = -Infinity;
    for (const shift of shifts) {
      const start = instant(shift.from), end = instant(shift.to);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < previousEnd || end > asOf || localDay(start) !== input.day || !hasEvidence(shift.evidence, now)) { reasons.push('time'); continue; }
      previousEnd = end;
      let cursor = start;
      const ids = new Set();
      for (const s of [...(shift.segments || [])].sort((a, b) => instant(a.from) - instant(b.from))) {
        const from = instant(s.from), to = instant(s.to);
        if (!text(s.id) || ids.has(s.id) || !Number.isFinite(from) || !Number.isFinite(to) || from !== cursor || to <= from || to > end || !['work', 'waste', 'break', 'external'].includes(s.kind) || !hasEvidence(s.evidence, now)) reasons.push('time');
        ids.add(s.id); cursor = to;
        allSegments.push(s);
        if (['break', 'external', 'waste'].includes(s.kind) && !text(s.reason)) reasons.push('time');
        if (['break', 'external'].includes(s.kind)) continue;
        if (!text(s.vehicleId) || s.driverId !== driver.id || !hasEvidence(s.assignmentEvidence, now)) reasons.push('assignment');
        if (!Object.hasOwn(CATEGORIES, s.category)) reasons.push('work');
        if (category !== 'all' && s.category !== category) continue;
        selectedSegments.push(s);
        const duration = (to - from) / 1000;
        acceptedSeconds += duration;
        if (s.kind === 'waste') wasteSeconds += duration;
        else if (!text(s.activityId)) reasons.push('work');
        else activityIds.add(s.activityId);
      }
      if (cursor !== end) reasons.push('time');
    }
    const activities = [], localIds = new Set();
    for (const activity of driver.activities || []) {
      if (!text(activity.id) || localIds.has(activity.id)) reasons.push('duplicate');
      localIds.add(activity.id);
      if (category !== 'all' && activity.category !== category) continue;
      if (!activityIds.has(activity.id)) { reasons.push('work'); continue; }
      const workSegments = selectedSegments.filter(s => s.kind === 'work' && s.activityId === activity.id);
      if (!text(activity.jobId) || !Object.hasOwn(CATEGORIES, activity.category) || workSegments.some(s => s.category !== activity.category) || !hasEvidence(activity.evidence, now) || !Number.isFinite(instant(activity.completedAt)) || instant(activity.completedAt) > asOf || instant(activity.completedAt) < Math.max(...workSegments.map(s => instant(s.to)))) reasons.push('work');
      const norm = norms.get(activity.normKey);
      const resolved = norm?.category === activity.category ? resolveNorm(norm, input.day, now) : null;
      if (!resolved) reasons.push('norm');
      else normalizedSeconds += resolved.seconds;
      const checks = activity.checks || {};
      for (const key of ['completion', 'documentation', 'quality']) {
        const check = checks[key];
        if (!check || !hasEvidence(check.evidence, now) || !(['pass', 'fail', ...(key === 'documentation' ? ['not_required'] : [])].includes(check.status)) || (check.status === 'fail' && (!text(check.reason) || check.driverResponsible !== true))) reasons.push('quality');
      }
      activities.push({ ...activity, norm: resolved });
    }
    if ([...activityIds].some(id => !activities.some(a => a.id === id)) || !activities.length) reasons.push('work');
    if (!(acceptedSeconds >= 4 * 3600)) reasons.push('short');
    const baseBlocked = reasons.some(r => ['source', 'roster', 'time', 'assignment', 'duplicate'].includes(r));
    const performance = baseBlocked || reasons.includes('work') || reasons.includes('norm') || !(acceptedSeconds > 0) ? null : round(50 * Math.min(1, normalizedSeconds / acceptedSeconds));
    const efficiency = baseBlocked || !(acceptedSeconds > 0) ? null : round(30 * Math.max(0, 1 - wasteSeconds / acceptedSeconds));
    // Weight by normative workload, never by arbitrary splitting into many small orders.
    const qualityParts = {};
    for (const [key, maximum] of [['completion', 10], ['documentation', 5], ['quality', 5]]) qualityParts[key] = baseBlocked || reasons.some(r => ['work', 'norm', 'quality'].includes(r)) || !(normalizedSeconds > 0) ? null : maximum * activities.reduce((sum, a) => sum + (a.checks[key].status !== 'fail' ? a.norm.seconds : 0), 0) / normalizedSeconds;
    const quality = Object.values(qualityParts).some(value => value === null) ? null : round(Object.values(qualityParts).reduce((sum, value) => sum + value, 0));
    const total = reasons.length || [performance, efficiency, quality].some(value => value === null) ? null : round(performance + efficiency + quality);
    return { driverId: driver.id, userId: driver.userId || null, name: driver.name, category, status: total === null ? 'unrated' : 'provisional', performance, efficiency, quality, qualityParts, total, acceptedSeconds, wasteSeconds, normalizedSeconds, reasons: unique(reasons), activities, segments: allSegments, vehicles: unique(selectedSegments.map(s => s.vehicleId)).map(id => ({ id, plate: selectedSegments.find(s => s.vehicleId === id)?.plate || '', name: selectedSegments.find(s => s.vehicleId === id)?.vehicleName || '' })), shiftsClosed: shifts.length > 0 && shifts.every(s => s.closed === true), identityEvidence: driver.identityEvidence };
  });
  const final = category !== 'all' ? evaluateDay(input, { now, category: 'all' }).final : closeReviewed && results.length > 0 && results.every(r => r.shiftsClosed && (r.total !== null || (r.reasons.length === 1 && r.reasons[0] === 'short')));
  const ranked = results.filter(r => r.total !== null).sort((a, b) => b.total - a.total || b.quality - a.quality || b.performance - a.performance || a.driverId.localeCompare(b.driverId));
  for (let i = 0; i < ranked.length; i++) {
    const a = ranked[i], p = ranked[i - 1];
    a.rank = p && p.total === a.total && p.quality === a.quality && p.performance === a.performance ? p.rank : i + 1;
    a.status = final ? 'final' : 'provisional';
  }
  const successfulTimes = sources.filter(s => s.status === 'ready' && Number.isFinite(instant(s.successAt)) && instant(s.successAt) <= now).map(s => instant(s.successAt));
  return { version: RATING_VERSION, day: input.day, category, asOf: input.asOf, lastSynchronizedAt: successfulTimes.length ? new Date(Math.min(...successfulTimes)).toISOString() : null, computedAt: new Date(now).toISOString(), status: final ? 'final' : ranked.length ? 'provisional' : 'waiting', final, results, ranking: ranked.slice(0, 5), tiedFirst: ranked.filter(r => r.rank === 1).length > 1, reasons: unique([...globalReasons, ...(!results.length ? ['empty'] : []), ...(!final && readyToClose ? ['review'] : [])]) };
}
