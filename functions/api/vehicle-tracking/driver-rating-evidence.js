import { json } from '../../_lib/auth.js';
import { ratingScope } from './driver-ratings.js';
import { ratingDb, saveInput, latestInput, calculateInput, validateHistoricalResults } from '../../_lib/driver-rating-store.js';

export async function onRequestPost({ request, env }) {
  try {
    // Cookie-authenticated writes require a same-origin browser request.
    if (request.headers.get('Origin') !== new URL(request.url).origin || !request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Neplatný původ požadavku.' }, 403);
    const scope = await ratingScope(env, request, true);
    const raw = await request.text();
    if (raw.length > 2000000) return json({ error: 'Příliš velký podklad.' }, 413);
    const input = JSON.parse(raw), db = ratingDb(env);
    if (input.action === 'validate_history') return json(await validateHistoricalResults(db, scope, input));
    if (input.action !== 'save_evidence') return json({ error: 'Neznámá operace.' }, 400);
    const result = await saveInput(db, scope, input.document, input);
    try { await calculateInput(db, await latestInput(db, scope.installation, input.document.companyId, input.document.day)); }
    catch { return json({ ...result, calculation: 'pending', message: 'Podklady jsou uloženy; výpočet čeká na opakování.' }, 202); }
    return json(result, 201);
  } catch (error) {
    const status = [400, 401, 403, 409, 422].includes(error.status) ? error.status : error instanceof SyntaxError || error instanceof TypeError || error.message?.startsWith('rating_input') || error.message?.startsWith('rating_cutoff') ? 422 : 503;
    return json({ error: status === 503 ? 'Podklady se nepodařilo zpracovat.' : error.message }, status);
  }
}
