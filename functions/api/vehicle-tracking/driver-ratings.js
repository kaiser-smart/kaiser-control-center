import { json, currentUser } from '../../_lib/auth.js';
import { hasPermission, normalizeRole } from '../../../src/permissions.js';
import { authorizedIntegrationScope } from '../../_lib/vistos-integration-store.js';
import { localDay, previousDay, CATEGORIES } from '../../_lib/driver-rating-engine.js';
import { ratingDb, readRatings } from '../../_lib/driver-rating-store.js';

export async function ratingScope(env, request, write = false) {
  const user = await currentUser(env, request, { strict: true });
  if (!user) throw Object.assign(new Error('Nepřihlášeno.'), { status: 401 });
  const role = normalizeRole(user.role);
  if (!hasPermission(user, 'vehicle-tracking', 'view') || !(write ? ['admin', 'management'] : ['admin', 'management', 'dispecer', 'ridic']).includes(role)) throw Object.assign(new Error('Nemáte oprávnění k hodnocení řidičů.'), { status: 403 });
  return authorizedIntegrationScope(env, { ...user, role }, { companyId: new URL(request.url).searchParams.get('companyId') || null });
}
export async function onRequestGet({ request, env }) {
  try {
    const scope = await ratingScope(env, request);
    if (scope.companies.length !== 1) return json({ status: 'waiting', reasons: ['company'], categories: CATEGORIES, ranking: [], drivers: [], scope: scope.user.role === 'ridic' ? 'own' : 'audit' });
    const url = new URL(request.url), period = url.searchParams.get('period') || 'today', category = url.searchParams.get('category') || 'all';
    if (!['today', 'yesterday'].includes(period) || !['all', ...Object.keys(CATEGORIES)].includes(category)) return json({ error: 'Neplatné období nebo kategorie.' }, 400);
    const today = localDay(Date.now());
    return json(await readRatings(ratingDb(env), scope, period === 'today' ? today : previousDay(today), category, { audit: url.searchParams.get('audit') === '1' }));
  } catch (error) {
    const status = [401, 403].includes(error.status) ? error.status : 503;
    return json({ status: 'unavailable', error: status === 503 ? 'Hodnocení není dostupné. Chybí ověřené podklady nebo připojení datového zdroje.' : error.message }, status);
  }
}
