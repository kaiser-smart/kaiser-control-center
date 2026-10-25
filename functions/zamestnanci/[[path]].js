// Serve the application shell for direct employee-card links and reloads.
export async function onRequestGet({ request, env }) {
  const indexUrl = new URL('/index.html', request.url);
  return env.ASSETS.fetch(indexUrl);
}
