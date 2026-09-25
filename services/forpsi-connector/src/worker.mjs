import { handleAdmin } from './admin.mjs';
import { authenticate, authConfig, metadata, challenge } from './auth.mjs';
import { Store } from './store.mjs';
import { Forpsi } from './forpsi.mjs';
import { Organizer } from './organize.mjs';
import { Outbox } from './outbox.mjs';
import { handleMcp } from './mcp.mjs';
import { CalDav } from './caldav.mjs';
import { CardDav } from './carddav.mjs';

export function createWorker(dependencies = {}) {
  const providerFactory = dependencies.providerFactory ?? ((env, mailbox) => new Forpsi(env, mailbox));
  const calendarFactory = dependencies.calendarFactory ?? ((env, mailbox) => new CalDav(env, mailbox));
  const contactFactory = dependencies.contactFactory ?? ((env, mailbox) => new CardDav(env, mailbox));
  const verify = dependencies.authenticate ?? authenticate;
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const json = (body, status = 200, extra = {}) => Response.json(body, { status,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
      if (url.pathname === '/internal/admin') return handleAdmin(request,env,{providerFactory,calendarFactory,contactFactory,verificationMode:dependencies.verificationMode ?? 'provider'});
      if (url.pathname === '/health' && request.method === 'GET') return json({ service: 'forpsi-company-mail', version: '0.2.0', enabled: env.CONNECTOR_ENABLED === 'true' });
      if (env.CONNECTOR_ENABLED !== 'true') return json({ error: 'CONNECTOR_DISABLED' }, 503);
      try { authConfig(env); } catch { return json({ error: 'AUTH_NOT_CONFIGURED' }, 503); }
      if (['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'].includes(url.pathname) && request.method === 'GET') return json(metadata(env));
      if (url.pathname !== '/mcp') return json({ error: 'NOT_FOUND' }, 404);
      const origin = request.headers.get('origin');
      const allowed = new Set([new URL(env.MCP_RESOURCE).origin, 'https://chatgpt.com']);
      if (origin && !allowed.has(origin)) return json({ error: 'ORIGIN_DENIED' }, 403);
      if (!env.DB) return json({ error: 'DATABASE_NOT_CONFIGURED' }, 503);
      const store = new Store(env.DB);
      let principal;
      try { principal = await verify(request, env, store); }
      catch { return json({ error: 'AUTH_REQUIRED' }, 401, { 'WWW-Authenticate': challenge(env) }); }
      try {
        const response = await handleMcp(request, { store, principal, providerFactory, calendarFactory, contactFactory, env,
          organizer: new Organizer(store), outbox: new Outbox(store, env, providerFactory) });
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', 'no-store');
        return new Response(response.body, { status: response.status, headers });
      } catch { return json({ error: 'CONNECTOR_UNAVAILABLE' }, 503); }
    },
    async scheduled(_event, env) {
      if (env.CONNECTOR_ENABLED !== 'true' || !env.DB) return;
      await new Outbox(new Store(env.DB), env, providerFactory).tick();
    },
  };
}
export default createWorker();
