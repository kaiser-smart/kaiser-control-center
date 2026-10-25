// Existing bookmarks retain the employee ID, query and fragment at the new module.
export function onRequestGet({ request }) {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/dovolena-nemoc\/zamestnanci(?=\/|$)/, '/zamestnanci');
  return new Response(null, { status: 302, headers: { Location: url.href, 'Cache-Control': 'no-store' } });
}
