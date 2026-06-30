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
SARLOTA_WEATHER_DISABLED=false
SARLOTA_WEATHER_LOCATION_NAME=Brno
SARLOTA_WEATHER_LATITUDE=49.1951
SARLOTA_WEATHER_LONGITUDE=16.6068
SARLOTA_WEATHER_TIMEOUT_MS=900
SARLOTA_NAMEDAYS_JSON=
SARLOTA_HUMAN_TOUCH_JSON=
```

`ELEVENLABS_API_KEY`, `OPENAI_API_KEY` ani `VOICE_ASSISTANT_WEBHOOK_TOKEN`
nesmí být ve frontendu. Nastavují se jako Cloudflare Pages secrets nebo
server-side env hodnoty.

Počasí pro Šarlotu se načítá server-side přes Open-Meteo bez API klíče.
Výchozí poloha je Brno. Pokud počasí není dostupné do krátkého timeoutu,
Šarlota ho v hovoru nepoužije a nesmí si ho domýšlet. `SARLOTA_NAMEDAYS_JSON`
může přepsat lokální český kalendář svátků; `SARLOTA_HUMAN_TOUCH_JSON` může
dodat jen výslovně povolené veřejné narozeniny nebo statický ověřený kontext.

## ElevenLabs agent Šarlota

Název:

```text
Šarlota – Smart odpady
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

### Firemní lidskost - dynamické proměnné

KSO signed-url endpoint posílá pro Šarlotu bezpečný read-only kontext:

```text
{{human_touch_enabled}}
{{human_touch_suggestion}}
{{human_touch_type}}
{{human_touch_source}}
```

`human_touch_enabled` je `ano` jen tehdy, když backend našel ověřený bezpečný
návrh. `human_touch_suggestion` může být prázdné; v takovém případě Šarlota
nesmí odlehčení domýšlet. Hodnoty nikdy neobsahují API klíče, signed URL ani
tokeny.

Prompt blok pro ElevenLabs:

```text
FIREMNÍ LIDSKOST

KSO backend ti může poslat ověřené odlehčení v těchto dynamických proměnných:

human_touch_enabled: {{human_touch_enabled}}
human_touch_suggestion: {{human_touch_suggestion}}
human_touch_type: {{human_touch_type}}
human_touch_source: {{human_touch_source}}

Pokud {{human_touch_enabled}} není „ano“, „true“ nebo „1“, Firemní lidskost vůbec nepoužívej.
Pokud je {{human_touch_enabled}} zapnuté a {{human_touch_suggestion}} není prázdná, můžeš během hovoru použít maximálně jednu krátkou lidskou poznámku.
Použij pouze ověřený návrh z {{human_touch_suggestion}}. Nevymýšlej si počasí, svátky, narozeniny, dovolené ani žádné osobní údaje.
Poznámku řekni přirozeně, krátce a jen když se hodí do kontextu. Práce má vždy přednost.
Firemní lidskost nepoužívej, pokud uživatel řeší problém, reklamaci, chybu, nemoc, OČR, lékaře, stres nebo spěchá.
Nikdy nezmiňuj nemoc, OČR, lékaře, věk, důvod absence ani soukromé informace.
Pokud si nejsi jistá, poznámku nepoužívej a pokračuj v úkolu.
```

Šarlota tyká, mluví v ženském rodě a odpovídá stručně. Má být rychlá, věcná,
lidská a má pokládat vždy jen jednu krátkou otázku. Stejnou otázku neopakuje
dokola; po odpovědi uživatele navazuje dalším krokem. First message nesmí
skládat pozdrav dvakrát; `intro_announcement` posílá aplikace přes dynamic
variables.

Bezpečný rychlý profil v ElevenLabs:

- first message: `{{intro_announcement}}`
- language: Czech
- LLM model: `Qwen3.5-397B-A17B`
- LLM temperature: `0.25`
- reasoning effort: `Low`
- token limit: `180`
- turn model: `Turn V3`
- take turn after silence: `3 s`
- end conversation after silence: `10 s`
- max conversation duration: `600 s`
- system tool `Skip turn`: zapnuto
- voice: český ženský hlas na `V3 Conversational`

U V3 Conversational dashboard neumožňuje nastavovat `Speed`, `Stability` ani
`Similarity`; tyto hodnoty se proto neberou jako ověřené nastavení.

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
- `create_absence_request`: `dateFrom`, `dateTo`, `dayPart`, `confirmed`, `note`, `spokenSummary`
- `search_user`: `query`, `limit`
- `get_user_access_summary`: `userId`, `query`

Názvy toolů i parametrů jsou case-sensitive.

`create_absence_request` je zápisový client tool. Musí být nastavený tak, aby
vracel výsledek zpět agentovi. KSO frontend jím volá `POST /api/voice/sarlota`
a backend znovu ověřuje přihlášeného uživatele, oprávnění `absence:create`,
datum, rozsah a potvrzení. Bez `confirmed: true` nesmí vzniknout zápis; backend
vrátí jen potvrzovací otázku.

Parametr `dayPart` používat jako:

```text
full_day
half_day
```

Příklad parametrů pro potvrzený zápis:

```json
{
  "dateFrom": "2026-07-01",
  "dateTo": "2026-07-01",
  "dayPart": "full_day",
  "confirmed": true,
  "note": "Zadáno hlasově přes Šarlotu.",
  "spokenSummary": "Zapiš mi dovolenou 1. 7. na celý den."
}
```

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
