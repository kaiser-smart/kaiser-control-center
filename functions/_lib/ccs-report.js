import { getArchiveDatabase, getCoreDatabase } from './databases.js';
import { ccsAccount, ccsError } from './ccs-store.js';
const all = async stmt => (await stmt.all()).results || [];
export function ccsQuery(params, CCS_ACCOUNT) {
  const conditions = ['account=?'], args = [CCS_ACCOUNT];
  for (const [key, column, op] of [['from','day','>='],['to','day','<='],['plate','plate','='],['product','product','='],['driver','driver_id','=']]) {
    const value = params.get(key); if (!value) continue;
    if (value.length > 160 || (['from','to'].includes(key) && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))))) throw ccsError('ccs_invalid_query');
    conditions.push(`${column}${op}?`); args.push(value);
  }
  if (params.get('from') && params.get('to') && params.get('from') > params.get('to')) throw ccsError('ccs_invalid_query');
  const card = params.get('card');
  if (card) { if (!/^\d{4,19}$/.test(card)) throw ccsError('ccs_invalid_query'); conditions.push('card LIKE ?'); args.push('%' + card); }
  const state = params.get('state'); if (state) { if (!['accepted','review','duplicate'].includes(state)) throw ccsError('ccs_invalid_query'); conditions.push('state=?'); args.push(state); }
  const offset = Number(params.get('offset') || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw ccsError('ccs_invalid_query');
  return { where: conditions.join(' AND '), args, offset };
}
function publicRow(record, detail = false) {
  const p = JSON.parse(record.payload_json);
  const { card, payload_json, ...r } = record;
  return { ...r, cardDisplay: '•••• ' + card.slice(-4), localTime: p.time.local, timezoneVerified: p.time.timezoneVerified === true, quantityMicros: p.quantityMicros, unit: p.unit, category: p.category, netMinor: p.netMinor, vatMinor: p.vatMinor, invoiceId: p.invoiceId, billing: p.billing, merchant: p.merchant, ...(detail ? { source: { ...p.raw, 'Číslo karty': '•••• ' + card.slice(-4) }, warnings: p.warnings, odometer: p.odometer, merchantAddress: p.merchantAddress } : {}) };
}
export async function ccsReport(env, params) {
  const CCS_ACCOUNT = ccsAccount(env), db = getArchiveDatabase(env), q = ccsQuery(params, CCS_ACCOUNT);
  const list = await all(db.prepare(`SELECT * FROM ccs_observations WHERE ${q.where} ORDER BY day DESC,id LIMIT 100 OFFSET ?`).bind(...q.args, q.offset));
  const total = await db.prepare(`SELECT COUNT(*) AS n FROM ccs_observations WHERE ${q.where}`).bind(...q.args).first();
  const accepted = q.where + " AND state='accepted'";
  const totals = await all(db.prepare(`SELECT currency,COUNT(*) AS count,SUM(gross_minor) AS grossMinor,SUM(json_extract(payload_json,'$.netMinor')) AS netMinor,SUM(json_extract(payload_json,'$.vatMinor')) AS vatMinor FROM ccs_observations WHERE ${accepted} GROUP BY currency`).bind(...q.args));
  for (const t of totals) for (const f of ['grossMinor','netMinor','vatMinor']) if (!Number.isSafeInteger(t[f])) throw ccsError('ccs_sum_overflow');
  const groups = {};
  for (const [key, column] of [['vehicles', 'vehicle_id'], ['drivers','driver_id'], ['months','substr(day,1,7)']]) groups[key] = await all(db.prepare(`SELECT ${column} AS key,currency,COUNT(*) AS count,SUM(gross_minor) AS grossMinor FROM ccs_observations WHERE ${accepted} GROUP BY ${column},currency ORDER BY grossMinor DESC LIMIT 200`).bind(...q.args));
  const review = await db.prepare(`SELECT COUNT(*) AS n FROM ccs_observations WHERE ${q.where} AND state='review'`).bind(...q.args).first();
  return { rows: list.map(r => publicRow(r)), total: total.n, nextOffset: q.offset + list.length < total.n ? q.offset + list.length : null, totals, groups, pendingReview: review.n, fuelLitres: null, averagePricePerLitre: null, consumption: { available: false, reason: 'Chybí ověřené jednotky a měřená spotřeba ve stejném období. Nákup paliva není měřená spotřeba.' } };
}
export async function ccsDetail(env, recordId) {
  const CCS_ACCOUNT = ccsAccount(env);
  const row = await getArchiveDatabase(env).prepare('SELECT * FROM ccs_observations WHERE account=? AND id=?').bind(CCS_ACCOUNT, recordId).first();
  if (!row) throw ccsError('ccs_not_found');
  return publicRow(row, true);
}
export async function ccsOptions(env) {
  const db = getCoreDatabase(env);
  const vehicles = await all(db.prepare(`SELECT vehicle_id AS id,MAX(normalized_license_plate) AS plate FROM fleet_vehicle_external_aliases WHERE status IN ('active','historical') GROUP BY vehicle_id ORDER BY plate LIMIT 2000`));
  const drivers = await all(db.prepare(`SELECT id,name FROM users WHERE role IN ('ridic','driver') ORDER BY name LIMIT 2000`));
  return { vehicles, drivers };
}
export async function resolveCcsObservation(env, input, actor, now = Date.now()) {
  const CCS_ACCOUNT = ccsAccount(env), db = getArchiveDatabase(env), core = getCoreDatabase(env);
  if (!input || !['accept_new','duplicate','assign'].includes(input.action) || typeof input.evidence !== 'string' || input.evidence.trim().length < 8 || input.evidence.length > 2000) throw ccsError('ccs_resolution_evidence_required');
  const row = await db.prepare('SELECT * FROM ccs_observations WHERE account=? AND id=?').bind(CCS_ACCOUNT, input.id).first();
  if (!row) throw ccsError('ccs_not_found');
  if (input.expectedUpdatedAt !== row.updated_at) throw ccsError('ccs_resolution_conflict');
  let vehicle = row.vehicle_id, driver = row.driver_id, state = row.state, linked = row.linked_to;
  if (input.action === 'assign') {
    if (!input.vehicleId || !(await core.prepare(`SELECT vehicle_id FROM fleet_vehicle_external_aliases WHERE vehicle_id=? LIMIT 1`).bind(input.vehicleId).first())) throw ccsError('ccs_vehicle_not_found');
    if (input.driverId && !(await core.prepare(`SELECT id FROM users WHERE id=? AND role IN ('ridic','driver')`).bind(input.driverId).first())) throw ccsError('ccs_driver_not_found');
    vehicle = input.vehicleId; driver = input.driverId || null;
  } else {
    if (row.state !== 'review') throw ccsError('ccs_resolution_conflict');
    if (input.action === 'duplicate') {
      const target = await db.prepare(`SELECT id FROM ccs_observations WHERE account=? AND id=? AND state='accepted' AND id<>?`).bind(CCS_ACCOUNT, input.targetId || '', row.id).first();
      if (!target) throw ccsError('ccs_duplicate_target_invalid');
      linked = target.id; state = 'duplicate';
    } else { state = 'accepted'; }
  }
  const event = crypto.randomUUID(), at = new Date(Math.max(now, Date.parse(row.updated_at) + 1)).toISOString();
  // A failed optimistic update must roll back its audit as well.
  await db.batch([
    db.prepare(`UPDATE ccs_observations SET state=?,linked_to=?,vehicle_id=?,driver_id=?,resolution_evidence=?,updated_at=? WHERE id=? AND account=? AND updated_at=?`).bind(state, linked, vehicle, driver, input.evidence.trim(), at, row.id, CCS_ACCOUNT, row.updated_at),
    db.prepare(`INSERT INTO ccs_fence_checks VALUES(?,changes())`).bind(event),
    db.prepare(`INSERT INTO ccs_events VALUES(?,?,?,?,?,?,?)`).bind(event, CCS_ACCOUNT, at, actor, input.action, row.id, JSON.stringify({ evidence: input.evidence.trim(), before: { state: row.state, vehicle: row.vehicle_id, driver: row.driver_id }, after: { state, vehicle, driver, linked } })),
    db.prepare(`DELETE FROM ccs_fence_checks WHERE id=?`).bind(event)
  ]);
  return ccsDetail(env, row.id);
}
export async function saveCcsCardAssignment(env, input, actor) {
  const CCS_ACCOUNT = ccsAccount(env);
  const db = getCoreDatabase(env);
  if (!/^\d{19}$/.test(input.cardId || '') || typeof input.evidence !== 'string' || input.evidence.trim().length < 8 || input.evidence.length > 2000) throw ccsError('ccs_resolution_evidence_required');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.validFrom || '') || (input.validTo && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.validTo))) throw ccsError('ccs_invalid_interval');
  const from = new Date(input.validFrom), to = input.validTo ? new Date(input.validTo) : null;
  if (!Number.isFinite(+from) || (to && (!Number.isFinite(+to) || +to <= +from))) throw ccsError('ccs_invalid_interval');
  if (!(await db.prepare('SELECT vehicle_id FROM fleet_vehicle_external_aliases WHERE vehicle_id=? LIMIT 1').bind(input.vehicleId).first())) throw ccsError('ccs_vehicle_not_found');
  const at = new Date().toISOString(), aliasId = crypto.randomUUID();
  const result = await db.prepare(`INSERT INTO fleet_vehicle_external_aliases(id,vehicle_id,external_system,external_key,status,match_method,confidence,valid_from,valid_to,metadata_json,created_at,updated_at) SELECT ?,?,'ccs_card',?,'active','documented_ccs_assignment','verified',?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM fleet_vehicle_external_aliases WHERE external_system='ccs_card' AND json_extract(metadata_json,'$.accountId')=? AND json_extract(metadata_json,'$.cardId')=? AND status IN ('active','historical') AND valid_from<? AND (valid_to IS NULL OR valid_to>?))`).bind(aliasId, input.vehicleId, `${CCS_ACCOUNT}:${input.cardId}:${from.toISOString()}`, from.toISOString(), to?.toISOString() || null, JSON.stringify({ accountId: CCS_ACCOUNT, cardId: input.cardId, sourceEvidenceId: input.evidence.trim(), historicalIdentityVerified: true, createdBy: actor, sourceSystem: 'ccs' }), at, at, CCS_ACCOUNT, input.cardId, to?.toISOString() || '9999-12-31', from.toISOString()).run();
  if (result.meta.changes !== 1) throw ccsError('ccs_assignment_overlap');
  return { id: aliasId, saved: true, automaticMatching: false, reason: 'Časové pásmo CCS dosud není ověřeno.' };
}
export function ccsCsvCell(value) { const s = String(value ?? ''); return '"' + (/^[\s]*[=+@-]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'; }
export async function ccsCsv(env, params) {
  const CCS_ACCOUNT = ccsAccount(env), db = getArchiveDatabase(env), q = ccsQuery(params, CCS_ACCOUNT);
  const found = await all(db.prepare(`SELECT * FROM ccs_observations WHERE ${q.where} ORDER BY day DESC,id LIMIT 20001`).bind(...q.args));
  if (found.length > 20000) throw ccsError('ccs_export_limit');
  const matrix = [['ID','Datum','Čas dle CCS (pásmo neověřeno)','Karta','SPZ','Jméno dle CCS','Vozidlo ID','Řidič ID','Produkt','Množství (jednotka neověřena)','Bez DPH','DPH','Celkem','Měna','Stav','Faktura']];
  for (const r of found) { const p = publicRow(r); matrix.push([r.id,r.day,p.localTime,p.cardDisplay,r.plate,r.driver_label,r.vehicle_id,r.driver_id,r.product,p.quantityMicros/1e6,p.netMinor/100,p.vatMinor/100,r.gross_minor/100,r.currency,r.state,p.invoiceId]); }
  return '\uFEFF' + matrix.map(r => r.map(ccsCsvCell).join(';')).join('\r\n');
}
