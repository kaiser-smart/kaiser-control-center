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
```

`ELEVENLABS_API_KEY` nesmí být ve frontendu.

## ElevenLabs agent Šarlota

Název:

```text
Smart odpady - Šarlota
```

Popis:

```text
Hlavní hlasová asistentka interní aplikace Smart odpady. Pomáhá uživatelům najít správný modul, vyhledat informace a bezpečně spouštět povolené akce.
```

Jazyk: `cs-CZ`

První zpráva:

```text
Jsem Šarlota. Pomůžu vám ve Smart odpadech.
```

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

Personální nástroje jsou read-only. ElevenLabs nemá přímý přístup do databáze;
všechna data jdou přes backend endpointy a jejich oprávnění podle přihlášeného
uživatele. Do odpovědí pro Šarlotu se neposílají API klíče, signed URL tokeny,
dokumenty zaměstnanců, interní poznámky ani kontaktní údaje, pokud nejsou pro
konkrétní potvrzený scénář nutné.

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
```

Endpoint používá `ELEVENLABS_API_KEY` pouze na backendu a vrací dočasný `signedUrl`.

## Log AI akcí

Datový model je v migraci:

```text
migrations/0011_create_ai_action_logs.sql
```

Neukládá celé audio ani tokeny.
