import { runDriverRatings } from '../functions/_lib/driver-rating-store.js';
export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runDriverRatings(env, controller.scheduledTime).then(result => console.log('driver_ratings', result)).catch(error => { console.error('driver_ratings_failed', { code: error.code || 'source_unavailable' }); throw error; }));
  }
};
