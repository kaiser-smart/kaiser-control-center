import { ccsScheduled } from '../functions/_lib/ccs-store.js';
export default {
  scheduled(controller, env, ctx) {
    ctx.waitUntil(ccsScheduled(controller, env).then(result => console.log('ccs_runner', { status: result.status, code: result.code || null, loaded: result.loaded || 0, inserted: result.inserted || 0 })).catch(() => console.error('ccs_runner', { status: 'failed', code: 'ccs_runner_unavailable' })));
  },
  fetch() { return new Response('Not found', { status: 404 }); }
};
