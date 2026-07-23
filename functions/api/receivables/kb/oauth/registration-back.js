import { requireUserPermission } from "../../../../_lib/auth.js";

const HTML = `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Registrace KB dokončena</title>
</head>
<body>
  <main>
    <h1>Registrace se vrátila do Smart odpadů</h1>
    <p>Zašifrovaný výsledek bude bezpečně dokončen na serveru. Tuto stránku nezavírej.</p>
  </main>
</body>
</html>`;

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'none'; img-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff"
};

function encryptedRegistrationPayloadPresent(request) {
  const url = new URL(request.url);
  const salt = String(url.searchParams.get("salt") || "").trim();
  const encryptedData = String(url.searchParams.get("encryptedData") || "").trim();
  return /^[A-Za-z0-9_+/=-]{8,512}$/.test(salt)
    && /^[A-Za-z0-9_+/=-]{32,20000}$/.test(encryptedData);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;
  if (!encryptedRegistrationPayloadPresent(request)) {
    return new Response("Registrace KB neobsahuje platný zašifrovaný výsledek.", {
      status: 400,
      headers: HEADERS
    });
  }
  return new Response(HTML, { status: 200, headers: HEADERS });
}

export async function onRequestPost() {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { ...HEADERS, Allow: "GET" }
  });
}
