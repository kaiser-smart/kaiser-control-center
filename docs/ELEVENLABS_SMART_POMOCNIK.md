# ElevenLabs Smart pomocník

Fáze 1 připravuje dvě identity:

- `Šarlota` - výchozí Smart pomocník
- `Marek` - zástupce Smart pomocníka

## Assety

Finální assety dodá Radim nebo Martin:

- `public/avatars/sarlota.png`
- `public/avatars/marek.png`

Pokud soubory chybí, aplikace zobrazí `Čeká na avatar od Radima/Martina`.

## Proměnné prostředí

Ve frontendu mohou být jen veřejná Agent ID:

```env
VITE_ELEVENLABS_AGENT_ID_SARLOTA=
VITE_ELEVENLABS_AGENT_ID_MAREK=
```

Backend / Cloudflare Secrets:

```env
ELEVENLABS_AGENT_ID_SARLOTA=
ELEVENLABS_AGENT_ID_MAREK=
ELEVENLABS_API_KEY=
AI_TOOLS_API_BASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=
VOICE_ASSISTANT_OPENAI_MODEL=gpt-4o-mini
VOICE_ASSISTANT_WEBHOOK_TOKEN=
SARLOTA_BUSINESS_HOURS_JSON=
```

`ELEVENLABS_API_KEY`, `OPENAI_API_KEY` ani `VOICE_ASSISTANT_WEBHOOK_TOKEN`
nesmí být ve frontendu. Nastavují se jako Cloudflare Pages secrets nebo
server-side env hodnoty.

## ElevenLabs agent Šarlota

Název:

```text
Chytré odpadky – Šarlota
```

Popis:

```text
Hlavní hlasová asistentka interní aplikace Smart odpady. Pomáhá uživatelům najít správný modul, vyhledat informace a bezpečně spouštět povolené akce.
```

Jazyk: `cs-CZ`

První zpráva:

```text
{{intro_announcement}}
```

Šarlota tyká, mluví v ženském rodě a odpovídá stručně. First message nesmí
skládat pozdrav dvakrát; `intro_announcement` posílá aplikace přes dynamic
variables.

## ElevenLabs agent Marek

Název:

```text
Smart odpady - Marek
```

Popis:

```text
Zástupce hlavní hlasové asistentky Šarloty v interní aplikaci Smart odpady. Pomáhá uživatelům ve stejném rozsahu jako Šarlota.
```

Jazyk: `cs-CZ`

První zpráva:

```text
Jsem Marek. Zastupuji Šarlotu, když je potřeba.
```

## Client tools

V ElevenLabs dashboardu založit client tools se stejnými názvy a parametry:

- `navigate_to`: `route`
- `open_module`: `moduleId`
- `show_confirmation`: `title`, `message`, `confirmLabel`, `cancelLabel`
- `show_toast`: `type`, `message`
- `highlight_element`: `selector`, `message`
- `search_employee`: `query`, `limit`
- `get_employee_detail`: `employeeId`, `query`
- `open_employee_card`: `employeeId`, `query`
- `get_employee_manager`: `employeeId`, `query`
- `get_employee_absence_summary`: `employeeId`, `query`
- `search_user`: `query`, `limit`
- `get_user_access_summary`: `userId`, `query`

Názvy toolů i parametrů jsou case-sensitive.

## Webhook tools

Webhook tools směřovat na produkční API:

- `GET /api/ai/search?q={q}`
- `GET /api/ai/absence/pending`
- `GET /api/ai/employees/search?q={q}`
- `GET /api/ai/employees/{id}/summary`
- `GET /api/ai/users/search?q={q}`
- `GET /api/ai/users/{id}/summary`
- `GET /api/ai/user/me`
- `POST /api/ai/absence/{id}/approve`
- `POST /api/ai/absence/{id}/reject`
- `POST /api/ai/feedback`
- `POST /api/voice/sarlota`

Personální nástroje jsou read-only. ElevenLabs nemá přímý přístup do databáze;
všechna data jdou přes backend endpointy a jejich oprávnění podle přihlášeného
uživatele. Do odpovědí pro Šarlotu se neposílají API klíče, signed URL tokeny,
dokumenty zaměstnanců, interní poznámky ani kontaktní údaje, pokud nejsou pro
konkrétní potvrzený scénář nutné.

### Serverový webhook Šarloty

Endpoint:

```text
POST /api/voice/sarlota
```

Produkční URL:

```text
https://kaiser-control-center.pages.dev/api/voice/sarlota
```

Webhook z ElevenLabs musí posílat jeden z těchto autentizačních údajů:

- přihlášenou Smart odpady session cookie, pokud volání jde z aplikace,
- nebo serverový header `Authorization: Bearer <VOICE_ASSISTANT_WEBHOOK_TOKEN>`.

Při serverovém webhooku musí payload obsahovat identitu Smart odpady uživatele:

```json
{
  "user_id": "{{user_id}}",
  "message": "{{user_message}}"
}
```

`user_id` se posílá v dynamic variables z endpointu signed URL. ElevenLabs není
zdroj pravdy pro oprávnění; backend si uživatele znovu ověří.

Základní payload pro ElevenLabs tool:

```json
{
  "user_id": "{{user_id}}",
  "conversation_id": "{{conversation_id}}",
  "message": "{{user_message}}",
  "intent": "{{intent}}",
  "parameters": {
    "orderNumber": "{{order_number}}",
    "trackingNumber": "{{tracking_number}}",
    "phone": "{{phone}}",
    "link": "{{link}}",
    "smsConsent": false,
    "product": "{{product}}",
    "issue": "{{issue}}"
  }
}
```

Endpoint vrací `text` / `reply` pro ElevenLabs a současně stav nástroje:
`verified`, `preparedActions`, `missingInternalApi`, `businessHours` a `callLog`.
Stav objednávky, tracking, SMS, reklamace a předání Jarce jsou vedené jako
backend nástroje; pokud pro danou akci ještě neexistuje ověřené interní API,
Šarlota to označí jako neověřené a připraví předání kolegyni Jarce.

Zápisové endpointy vyžadují potvrzení:

```json
{
  "confirmed": true,
  "confirmationSource": "ai_ui"
}
```

Bez potvrzení vrátí `409 ai_confirmation_required`.

## Signed URL

Aplikace má backend endpoint:

```text
GET /api/ai/elevenlabs/signed-url?assistant=sarlota
GET /api/ai/elevenlabs/signed-url?assistant=marek
GET /api/ai/elevenlabs/sarlota-status
```

Endpoint používá `ELEVENLABS_API_KEY` pouze na backendu a vrací dočasný `signedUrl`.
Dynamic variables obsahují i `user_id`, aby serverový webhook `/api/voice/sarlota`
mohl ověřit identitu přihlášeného uživatele Smart odpady.

`sarlota-status` je interní read-only kontrola pro panel v Nastavení. Nevrací
signed URL, API klíče, tokeny, prompt ani hodnoty osobních dynamic variables.
Pokud má backend `ELEVENLABS_API_KEY` a Agent ID, ověří agenta read-only přes
ElevenLabs API a vrátí pouze odvozené stavy pro first message, model a tools.

## Log AI akcí

Datový model je v migraci:

```text
migrations/0011_create_ai_action_logs.sql
```

Neukládá celé audio ani tokeny.
