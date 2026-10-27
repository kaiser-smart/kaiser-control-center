import { json, requireUserPermission, requireAdmin } from '../../_lib/auth.js';
import { ccsStatus, enqueueCcs, runCcsQueue, ccsError } from '../../_lib/ccs-store.js';
import { ccsReport, ccsDetail, ccsOptions, ccsCsv, resolveCcsObservation, saveCcsCardAssignment } from '../../_lib/ccs-report.js';
const safeErrors = new Set(['ccs_invalid_query','ccs_not_found','ccs_resolution_evidence_required','ccs_resolution_conflict','ccs_vehicle_not_found','ccs_driver_not_found','ccs_duplicate_target_invalid','ccs_assignment_overlap','ccs_invalid_interval','ccs_export_limit','ccs_sum_overflow']);
function failure(error) { const code = safeErrors.has(error.code) ? error.code : 'ccs_storage_unavailable'; return json({ error: code === 'ccs_storage_unavailable' ? 'Úložiště CCS není připravené nebo dostupné.' : 'Požadavek CCS nelze dokončit. Obnovte údaje a zkontrolujte zadání.', code }, code === 'ccs_not_found' ? 404 : code === 'ccs_storage_unavailable' ? 503 : 409); }
export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams, view = params.get('view') || 'report';
  const { response } = await requireUserPermission(env, request, 'ccs-fuel', view === 'csv' ? 'export' : 'view');
  if (response) return response;
  try {
    if (view === 'status') return json(await ccsStatus(env));
    if (view === 'detail') return json(await ccsDetail(env, params.get('id') || ''));
    if (view === 'options') return json(await ccsOptions(env));
    if (view === 'csv') return new Response(await ccsCsv(env, params), { headers: { 'Content-Type':'text/csv; charset=utf-8', 'Content-Disposition':'attachment; filename="tankovani-ccs.csv"', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
    if (view !== 'report') return json({ error: 'Neznámý přehled.' }, 400);
    return json(await ccsReport(env, params));
  } catch (e) { return failure(e); }
}
export async function onRequestPost({ request, env, waitUntil }) {
  const { user, response } = await requireAdmin(env, request);
  if (response) return response;
  if (request.headers.get('Origin') !== new URL(request.url).origin || !request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Neplatný původ požadavku.' }, 403);
  try {
    const reader = request.body?.getReader(); if (!reader) throw ccsError('ccs_invalid_query');
    let size = 0; const chunks = [];
    for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 8192) { await reader.cancel(); return json({ error:'Příliš velký požadavek.' }, 413); } chunks.push(next.value); }
    const bytes = new Uint8Array(size); let off = 0; for (const chunk of chunks) { bytes.set(chunk, off); off += chunk.length; }
    let input; try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error:'Neplatné zadání.' }, 400); }
    if (input.action === 'sync') { const result = await enqueueCcs(env, { actor: user.id }); waitUntil(runCcsQueue(env).catch(() => {})); return json(result, 202); }
    if (input.action === 'card_assignment') return json(await saveCcsCardAssignment(env, input, user.id));
    return json(await resolveCcsObservation(env, input, user.id));
  } catch (e) { return failure(e); }
}
