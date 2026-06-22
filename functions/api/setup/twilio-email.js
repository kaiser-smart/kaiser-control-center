import { requireAdmin } from "../../_lib/auth.js";

const MAILER_SID = "MDda70b4c1cb9222419122cb120239d6fd";

function authHeader(accountSid, authToken) {
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

function page(title, message, status = 200) {
  return new Response(
    `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        font-family: Quicksand, system-ui, sans-serif;
        background: #f6f8f4;
        color: #1f2922;
      }
      main {
        width: min(92vw, 520px);
        padding: 32px;
        border: 1px solid #dfe8d9;
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 18px 50px rgba(31, 41, 34, 0.12);
      }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { margin: 0 0 20px; font-size: 17px; line-height: 1.5; }
      button, a {
        display: inline-flex;
        min-height: 48px;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 12px;
        padding: 0 22px;
        background: #75bd25;
        color: #fff;
        font: 700 16px Quicksand, system-ui, sans-serif;
        text-decoration: none;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
      <form method="post">
        <button type="submit">Připojit e-mail k Twilio Verify</button>
      </form>
    </main>
  </body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireAdmin(env, request);

  if (response) {
    return page("Nejste přihlášený admin", "Nejdřív se přihlaste do Smart odpady jako admin přes SMS.", 401);
  }

  return page("Twilio e-mail", "Tahle dočasná akce připojí připravený SendGrid mailer k Twilio Verify službě.");
}

export async function onRequestPost({ request, env }) {
  const { response } = await requireAdmin(env, request);

  if (response) {
    return page("Nejste přihlášený admin", "Akci může spustit jen přihlášený admin ve Smart odpady.", 401);
  }

  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const serviceSid = env.TWILIO_VERIFY_SERVICE_SID;

  if (!accountSid || !authToken || !serviceSid) {
    return page("Twilio není připravené", "V produkčních proměnných chybí některá hodnota Twilio Verify.", 500);
  }

  const body = new URLSearchParams({
    MailerSid: MAILER_SID
  });

  const response = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(accountSid, authToken),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    return page("Twilio e-mail se nepodařilo připojit", `Twilio vrátilo stav ${response.status}.`, 502);
  }

  return page("Twilio e-mail připojen", `Mailer ${MAILER_SID} je připojený k Verify službě.`);
}
