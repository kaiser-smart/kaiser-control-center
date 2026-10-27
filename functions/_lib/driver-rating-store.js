import { evaluateDay, localDay, previousDay, RATING_VERSION, CATEGORIES, hasEvidence } from './driver-rating-engine.js';

export function ratingDb(env) {
  if (!env.DB_ARCHIVE) throw Object.assign(new Error('rating_database_unavailable'), { status: 503 });
  return env.DB_ARCHIVE;
}
export async function latestInput(db, installation, company, day) {
  return db.prepare('SELECT * FROM driver_rating_inputs WHERE installation=? AND company_id=? AND day=? ORDER BY revision DESC LIMIT 1').bind(installation, company, day).first();
}
export async function saveInput(db, scope, document, { expectedRevision, reason, now = Date.now() }) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || typeof reason !== 'string' || !reason.trim() || reason.length > 1000 || document.installation !== scope.installation || !scope.companies.includes(document.companyId)) throw Object.assign(new Error('rating_evidence_invalid'), { status: 400 });
  // Malformed data is rejected. Incomplete but well-formed evidence can be stored as unrated.
  evaluateDay(document, { now });
  const previous = await latestInput(db, document.installation, document.companyId, document.day);
  if ((previous?.revision || 0) !== expectedRevision) throw Object.assign(new Error('rating_revision_conflict'), { status: 409 });
  const revision = expectedRevision + 1;
  try {
    await db.prepare('INSERT INTO driver_rating_inputs(installation,company_id,day,revision,document_json,actor,reason,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(document.installation, document.companyId, document.day, revision, JSON.stringify(document), scope.user.id, reason.trim(), new Date(now).toISOString()).run();
  } catch (error) { if (/UNIQUE|constraint/i.test(error.message)) throw Object.assign(new Error('rating_revision_conflict'), { status: 409 }); throw error; }
  return { revision, status: 'evidence_saved', publication: 'requires_historical_validation' };
}
export async function calculateInput(db, row, now = Date.now()) {
  const input = JSON.parse(row.document_json);
  const slot = new Date(Math.floor(now / 900000) * 900000).toISOString();
  const outputs = ['all', ...Object.keys(CATEGORIES)].map(category => evaluateDay(input, { now, category }));
  const changed = [];
  for (const result of outputs) {
    const previous = await db.prepare('SELECT document_json FROM driver_rating_results WHERE installation=? AND company_id=? AND day=? AND input_revision=? AND category=? ORDER BY slot DESC LIMIT 1').bind(row.installation, row.company_id, row.day, row.revision, result.category).first();
    const comparable = value => JSON.stringify({ ...value, computedAt: null });
    if (!previous || comparable(JSON.parse(previous.document_json)) !== comparable(result)) changed.push(result);
  }
  if (changed.length) await db.batch(changed.map(result => db.prepare('INSERT INTO driver_rating_results(installation,company_id,day,input_revision,slot,category,document_json,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING')
    .bind(row.installation, row.company_id, row.day, row.revision, slot, result.category, JSON.stringify(result), result.computedAt)));
  return outputs[0];
}
export async function runDriverRatings(env, now = Date.now()) {
  const db = ratingDb(env);
  // Bounded to new evidence and daily closure. Old corrections get an immediate calculation on ingestion.
  const rows = (await db.prepare(`SELECT i.* FROM driver_rating_inputs i WHERE ((i.day>=? AND i.day<=?) OR NOT EXISTS(SELECT 1 FROM driver_rating_results r WHERE r.installation=i.installation AND r.company_id=i.company_id AND r.day=i.day AND r.input_revision=i.revision AND r.category='all'))
    AND i.revision=(SELECT MAX(n.revision) FROM driver_rating_inputs n WHERE n.installation=i.installation AND n.company_id=i.company_id AND n.day=i.day)
    ORDER BY i.day,i.installation,i.company_id LIMIT 101`).bind(previousDay(localDay(now)), localDay(now)).all()).results || [];
  if (rows.length > 100) throw new Error('rating_scope_capacity_exceeded');
  let calculated = 0;
  for (const row of rows) { await calculateInput(db, row, now); calculated++; }
  return { status: calculated ? 'calculated' : 'waiting_for_verified_evidence', calculated, at: new Date(now).toISOString() };
}

export async function validateHistoricalResults(db, scope, input, now = Date.now()) {
  if (!scope.companies.includes(input.companyId) || !Array.isArray(input.cases) || !input.cases.length || input.cases.length > 100 || !hasEvidence(input.evidence, now) || input.evidence.verifiedBy !== scope.user.id) throw Object.assign(new Error('rating_validation_invalid'), { status: 400 });
  const categories = new Set();
  for (const item of input.cases) {
    if (item.day >= localDay(now) || !hasEvidence(item.evidence, now)) throw Object.assign(new Error('rating_historical_evidence_required'), { status: 422 });
    const row = await latestInput(db, scope.installation, input.companyId, item.day);
    if (!row || row.revision !== item.revision) throw Object.assign(new Error('rating_historical_revision_changed'), { status: 409 });
    const document = JSON.parse(row.document_json);
    // Use the stored evaluation instant, never make old inputs fresh by rewriting their timestamps.
    const result = evaluateDay(document, { now: Date.parse(row.created_at) });
    const driver = result.results.find(d => d.driverId === item.driverId);
    if (!driver || driver.total === null || !['performance', 'efficiency', 'quality', 'total'].every(key => Number.isFinite(item.expected?.[key]) && item.expected[key] === driver[key])) throw Object.assign(new Error('rating_historical_comparison_failed'), { status: 422 });
    for (const a of driver.activities) categories.add(a.category);
  }
  const validation = { ...input, categories: [...categories], version: RATING_VERSION, approvedAt: new Date(now).toISOString() };
  await db.prepare('INSERT INTO driver_rating_validations(installation,company_id,version,document_json,actor,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING')
    .bind(scope.installation, input.companyId, RATING_VERSION, JSON.stringify(validation), scope.user.id, validation.approvedAt).run();
  return { status: 'historically_validated', categories: validation.categories };
}

export async function readRatings(db, scope, day, category, { audit = false, now = Date.now() } = {}) {
  const own = scope.user.role === 'ridic';
  const rows = [];
  let latest = null, sync = null, mode = 'live', final = true;
  const reasons = new Set();
  for (const company of scope.companies) {
    const input = await latestInput(db, scope.installation, company, day);
    if (!input) { reasons.add('empty'); final = false; continue; }
    const result = await db.prepare('SELECT * FROM driver_rating_results WHERE installation=? AND company_id=? AND day=? AND input_revision=? AND category=? ORDER BY slot DESC LIMIT 1').bind(scope.installation, company, day, input.revision, category).first();
    if (!result) { reasons.add('source'); final = false; continue; }
    const data = JSON.parse(result.document_json);
    if (!data.final && now - Date.parse(result.created_at) > 30 * 60000) { reasons.add('source'); final = false; continue; }
    const validation = await db.prepare('SELECT document_json FROM driver_rating_validations WHERE installation=? AND company_id=? AND version=? ORDER BY created_at DESC LIMIT 1').bind(scope.installation, company, RATING_VERSION).first();
    const verified = validation ? JSON.parse(validation.document_json) : null;
    // Historical revisions corrected after validation invalidate publication until revalidation.
    let valid = Boolean(verified);
    for (const c of verified?.cases || []) { const current = await latestInput(db, scope.installation, company, c.day); if (current?.revision !== c.revision) valid = false; }
    const usedCategories = new Set(data.results.flatMap(d => d.activities.map(a => a.category)));
    if (!valid || [...usedCategories].some(c => !verified.categories.includes(c))) { mode = 'shadow'; reasons.add('shadow'); }
    const visible = own ? data.results.filter(d => d.userId === scope.user.id && hasEvidence(d.identityEvidence, now)) : data.results;
    for (const d of visible) rows.push({ ...d, companyId: company, revision: input.revision });
    for (const reason of data.reasons) reasons.add(reason);
    latest = !latest || result.created_at < latest ? result.created_at : latest;
    if (data.lastSynchronizedAt) sync = !sync || data.lastSynchronizedAt < sync ? data.lastSynchronizedAt : sync;
    final &&= data.final;
  }
  const maySeeShadow = audit && ['admin', 'management'].includes(scope.user.role);
  const disclosed = mode === 'shadow' && !maySeeShadow ? [] : rows;
  const sorted = disclosed.filter(d => d.total !== null).sort((a, b) => b.total - a.total || b.quality - a.quality || b.performance - a.performance || a.driverId.localeCompare(b.driverId));
  for (let i = 0; i < sorted.length; i++) { const d = sorted[i], p = sorted[i - 1]; d.rank = p && p.total === d.total && p.quality === d.quality && p.performance === d.performance ? p.rank : i + 1; }
  const operational = scope.user.role === 'dispecer';
  const project = d => operational ? { driverId: d.driverId, companyId: d.companyId, name: d.name, vehicles: d.vehicles, status: d.status, total: d.total, performance: d.performance, efficiency: d.efficiency, quality: d.quality, rank: d.rank, reasons: d.reasons } : { ...d, rank: own ? undefined : d.rank, userId: undefined, identityEvidence: undefined };
  return { day, category, mode, scope: own ? 'own' : operational ? 'operational' : 'audit', status: mode === 'shadow' && !maySeeShadow ? 'waiting' : sorted.length ? final ? 'final' : 'provisional' : 'unrated', final: final && mode === 'live', lastCalculatedAt: latest, lastSynchronizedAt: sync, reasons: [...reasons], categories: CATEGORIES, ranking: own ? [] : sorted.slice(0, 5).map(project), drivers: disclosed.map(project), tiedFirst: !own && sorted.filter(d => d.rank === 1).length > 1 };
}
