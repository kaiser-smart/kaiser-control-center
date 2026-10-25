// Pages preview only. Never deploy this transport to the production branch.
import { permitted, relay } from './integration-proxy.mjs';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== 'vehicle-map-v13.kaiser-control-center.pages.dev') {
      return new Response('Use the protected vehicle-map-v13 preview alias.', { status: 403 });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!permitted(request, url.origin)) return Response.json({ error: 'Read-only integration preview: endpoint/method/origin denied.' }, { status: 403 });
      return relay(request);
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Read-only preview', { status: 405 });
    // Pages redirects /index.html to /. Fetch the canonical asset path so the
    // rewritten tracking route cannot redirect back into this worker forever.
    if (['/', '/sledovani-vozidel'].includes(url.pathname)) url.pathname = '/';
    else if (!/^\/(?:src|vehicles|fonts|icons|brand|images)\//.test(url.pathname) && !['/manifest.webmanifest', '/favicon.ico', '/logo-kaiser.png', '/logo-kaiser.svg', '/smart-odpady-logo.png'].includes(url.pathname)) return new Response('Preview is limited to vehicle tracking.', { status: 404 });
    const response = await env.ASSETS.fetch(new Request(url, request));
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return new Response(response.body, { status: response.status, headers });
  }
};
