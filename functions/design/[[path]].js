export async function onRequestGet({ request, env }) {
  const indexUrl = new URL("/index.html", request.url);

  if (env?.ASSETS?.fetch) {
    return env.ASSETS.fetch(indexUrl);
  }

  return fetch(indexUrl);
}
