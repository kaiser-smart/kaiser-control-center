import { handleAdmin } from './admin.mjs';
import { handleSoaiMail } from './soai-mail.mjs';
import { authenticate, authConfig, metadata, challenge } from './auth.mjs';
import { Store } from './store.mjs';
import { Forpsi } from './forpsi.mjs';
import { Organizer } from './organize.mjs';
import { Outbox } from './outbox.mjs';
import { handleMcp } from './mcp.mjs';
import { handleSoaiPersonalSettings } from './soai-personal-settings.mjs';
import { CalDav } from './caldav.mjs';
import { CardDav } from './carddav.mjs';
import { Onboarding } from './onboarding.mjs';
import { handleSoaiSetup } from './soai-setup.mjs';
import { handleSoaiSend } from './soai-send.mjs';
import { runPersonalSync } from './personal-sync.mjs';
import { handleSoaiBrain } from './soai-brain.mjs';
import { runBrainSync, purgeClosedBrainCases } from './brain-sync.mjs';

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
      if (url.pathname === '/internal/mail') return handleSoaiMail(request,env,{providerFactory,verificationMode:dependencies.verificationMode ?? 'provider'});
      if (url.pathname === '/internal/brain') return handleSoaiBrain(request,env,{providerFactory});
      if (url.pathname === '/internal/setup') return handleSoaiSetup(request,env,{providerFactory});
      if (url.pathname === '/internal/personal-settings') return handleSoaiPersonalSettings(request,env);
      if (url.pathname === '/internal/send') return handleSoaiSend(request,env,{providerFactory});
      if (url.pathname === '/health' && request.method === 'GET') return json({ service: 'forpsi-company-mail', version: '0.3.0-dev.1', enabled: env.CONNECTOR_ENABLED === 'true' });
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
      if(env.PERSONAL_PILOT_READ_ONLY==='true' &&
        (!env.PERSONAL_PILOT_PRINCIPAL_ID || !env.PERSONAL_PILOT_MAILBOX_ID ||
          principal.id!==env.PERSONAL_PILOT_PRINCIPAL_ID))return json({error:'PILOT_ACCESS_DENIED'},403);
      try {
        const response = await handleMcp(request, { store, principal, providerFactory, calendarFactory, contactFactory, env,
          semanticAnalyzer: dependencies.semanticAnalyzer ?? null,
          organizer: new Organizer(store), outbox: new Outbox(store, env, providerFactory) });
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', 'no-store');
        return new Response(response.body, { status: response.status, headers });
      } catch { return json({ error: 'CONNECTOR_UNAVAILABLE' }, 503); }
    },
    async scheduled(_event, env) {
      if(env.PERSONAL_PILOT_READ_ONLY==='true')return;
      if (env.CONNECTOR_ENABLED !== 'true' || !env.DB) return;
      const store=new Store(env.DB);
      await new Onboarding({store,principal:{id:'system',scopes:[]},providerFactory,env}).cleanupExpired();
      await runPersonalSync({store,providerFactory,env});
      await runBrainSync({store,providerFactory,env});
      await purgeClosedBrainCases({store,env});
      // The read-only pilot must not drain historical queued mail if its cron is enabled.
      if (env.SEND_ENABLED === 'true') await new Outbox(store, env, providerFactory).tick();
    },
  };
}
const legacyWorker=createWorker();
let oauthPilot;
export default {
  async fetch(request,env,ctx){
    if(env.CONNECTOR_OAUTH==='true'||env.PERSONAL_PILOT_OAUTH==='true'){
      if(!env.OAUTH_KV){
        const path=new URL(request.url).pathname;
        if((path.startsWith('/internal/')&&path!=='/internal/oauth/access')||path==='/health')
          return legacyWorker.fetch(request,env,ctx);
        return Response.json({error:'OAUTH_NOT_CONFIGURED'},{status:503});
      }
      oauthPilot??=import('./oauth-pilot.mjs').then(module=>module.createOAuthPilot(legacyWorker));
      return (await oauthPilot).fetch(request,env,ctx);
    }
    return legacyWorker.fetch(request,env,ctx);
  },
  scheduled(event,env,ctx){return legacyWorker.scheduled(event,env,ctx);},
};
