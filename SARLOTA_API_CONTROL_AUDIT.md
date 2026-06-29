# Šarlota API control audit

Datum: 2026-06-29

Rozsah: read-only audit repozitáře Kaiser Smart Odpady a veřejné dokumentace ElevenLabs API. Nebyly vypsané ani použité žádné API klíče, signed URL, tokeny ani jiné secrety. ElevenLabs agent nebyl změněný.

Kontrolovaný ElevenLabs agent: `Chytré odpadky – Šarlota`.

Nekontrolovaný agent: telefonní Nanolab agent `Šarlota_3`.

## Shrnutí

Šarlota je dnes řízená částečně z ElevenLabs dashboardu a částečně z KSO backendu. ElevenLabs je živá hlasová vrstva a drží minimálně konfiguraci agenta, hlasu, modelu, first message, turn nastavení a navázané tools. KSO backend už drží signed-url endpoint, dynamické proměnné, personalizaci, vocativ, bezpečný status panel, server-side OpenAI endpoint `/api/voice/sarlota`, audit log a první ostrý zápis do modulu Dovolená/nemoc.

Hlavní riziko: hlavní prompt pro živého ElevenLabs agenta není plně verzovaný v repozitáři. Je ručně v dashboardu. KSO má svůj vlastní server-side prompt v `functions/_lib/voice-sarlota.js`, ale ten neznamená, že živý ElevenLabs dashboard prompt je automaticky stejný.

## Kde je prompt Šarloty

### ElevenLabs dashboard

Výchozí prompt živého ElevenLabs agenta je v dashboardu ElevenLabs. Podle dodaného textu začíná:

```text
Jsi Šarlota, hlasová AI asistentka aplikace Smart odpady pro firmu Kaiser servis.
```

Tento prompt není teď v repozitáři jako zdroj pravdy. Je to ručně spravovaný stav v ElevenLabs.

Stav: NEOVĚŘENO live API exportem v tomto běhu.

### KSO backend

KSO backend má samostatný server-side prompt ve funkci `systemPrompt()`:

```text
functions/_lib/voice-sarlota.js
```

Tento prompt se používá pro backendový endpoint:

```text
POST /api/voice/sarlota
```

Prompt v KSO dnes říká mimo jiné:

- ElevenLabs je jen hlasová vrstva.
- KSO backend provádí ověřené kroky.
- Šarlota mluví česky, žensky, stručně.
- Nepoužívá slova `ticket`, `tiket`, `SupportBox`.
- Nezapisuje dovolenou bez potvrzení.
- Používá blok `Firemní lidskost`.
- Vrací JSON pro rozhodnutí backendu.

Stav: OK v repozitáři, ale není to zatím jednotný zdroj pravdy pro dashboardového agenta.

## Co je nastavené v ElevenLabs dashboardu

Z repo a předchozí signed-url kontroly vyplývá:

- Agent má být `Chytré odpadky – Šarlota`.
- First message má být `{{intro_announcement}}`.
- Tools mají být navázané na lokální client tools ze `src/elevenLabsClientTools.js`.
- Model v panelu se dnes sleduje jako `GPT-5.1 / NEOVĚŘENO`.
- Dashboard obsahuje vlastní systémový prompt.

Co zůstává NEOVĚŘENO bez živého read-only exportu agenta:

- přesný aktuální dashboard prompt,
- skutečný model,
- hlas a TTS model,
- turn timeout/eagerness/speculative turn,
- jestli jsou všechny tools opravdu aktivní v agentovi,
- token limity a další konverzační limity.

## Co jde číst / měnit přes ElevenLabs API

Veřejná dokumentace ElevenLabs API ukazuje tyto použitelné možnosti:

- `GET /v1/convai/agents/:agent_id` - read-only čtení agenta.
- `PATCH /v1/convai/agents/:agent_id` - změna nastavení agenta.
- `GET /v1/convai/tools` - seznam tools.
- API pro vytvoření, čtení, update a smazání tools.
- `GET /v1/convai/conversation/get-signed-url` - vytvoření signed URL pro autorizovanou konverzaci.
- `GET /v1/convai/llm/list` - seznam dostupných LLM modelů pro workspace.
- API části pro branches, drafts, versions a deployments.

Podle dokumentace lze přes agent update spravovat zejména:

- `conversation_config.agent.first_message`,
- prompt / LLM část agenta,
- turn nastavení,
- TTS konfiguraci,
- workflow,
- tools,
- platform settings.

Zdroj:

- https://elevenlabs.io/docs/api-reference/agents/get
- https://elevenlabs.io/docs/api-reference/agents/update
- https://elevenlabs.io/docs/api-reference/tools/list
- https://elevenlabs.io/docs/api-reference/conversations/get-signed-url
- https://elevenlabs.io/docs/api-reference/llm/list
- https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables
- https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides

Stav: API možnosti ověřené z veřejné dokumentace. Živý agent nebyl změněný.

## Kde vzniká `intro_announcement`

`intro_announcement` vzniká v KSO backendu:

```text
functions/_lib/ai-session-announcements.js
```

Hlavní funkce:

```text
sarlotaIntroAnnouncementForAi()
introAnnouncementFallbackForAi()
recordSarlotaIntroAnnouncement()
```

Signed-url endpoint přidává hodnotu do dynamic variables:

```text
functions/api/ai/elevenlabs/signed-url.js
```

Když není aktivní provozní oznámení, fallback skládá pozdrav z uživatele:

```text
Ahoj/Dobré ráno/Dobrý den, <vocativ>. Co potřebuješ?
```

Když je aktivní provozní oznámení, `intro_announcement` může obsahovat provozní zprávu. Aktuálně je v backendu časově omezené oznámení k ulici Zaoralova do 2026-06-30.

Stav: OK v KSO backendu.

## Kde vzniká vocativ `Radime`

Vocativ vzniká v:

```text
functions/_lib/ai-people-summary.js
```

Hlavní cesta:

```text
userDynamicVariablesForAi(user)
firstNameVocativeForAi(user?.name)
```

`userDynamicVariablesForAi()` vrací mimo jiné:

- `user_name`,
- `user_first_name`,
- `user_first_name_vocative`,
- `user_role`,
- `available_modules`,
- `user_permissions`,
- `user_department`,
- `user_position`,
- `time_of_day_greeting`,
- `user_greeting`.

Existující status endpoint má fixture kontrolu:

```text
Radim -> Radime
```

Stav: OK v repozitáři a dříve lokálně ověřeno v signed-url kontrole.

## Jaké tools existují

### ElevenLabs client tools v KSO

Definice:

```text
src/elevenLabsClientTools.js
```

Aktuální tool names:

```text
navigate_to
open_module
show_confirmation
show_toast
highlight_element
search_employee
get_employee_detail
open_employee_card
get_employee_manager
get_employee_absence_summary
search_user
get_user_access_summary
```

Charakter:

- převážně client-side navigace, UI stav a read-only dotazy,
- `show_confirmation` jen zobrazí potvrzení,
- neumí sama o sobě bezpečně zapsat ostrou akci do systému.

### Backend voice tools v KSO

Definice:

```text
functions/_lib/voice-sarlota.js
```

Aktuální intent/tool logika:

```text
order_status
tracking
sms_link
handoff_jarka
product_advice
complaint_return
absence_vacation_request
call_log
business_hours
general
unsupported
```

## Které tools zapisují

### Reálný zápis dnes

`absence_vacation_request` umí po potvrzení vytvořit žádost o dovolenou:

```text
createAbsenceRequestRecord()
functions/_lib/absence-requests-store.js
```

Podmínky:

- uživatel musí být ověřený,
- musí mít oprávnění `absence:create`,
- musí být jasné datum,
- musí být jasný rozsah celý den/půlden,
- před zápisem musí proběhnout potvrzení,
- úspěch se řekne až po návratu backendu.

Stav: OK, první ostrý write path existuje.

### Připravené, ale bez ostrého odeslání

`sms_link` dnes připravuje akci, ale neodesílá ostrou SMS:

```text
status: prepared_not_sent
missingInternalApi: voice_sms_sender
```

`handoff_jarka`, `order_status`, `tracking`, `complaint_return` připravují předání nebo odpověď, ale nemají plné interní write/API napojení pro reálnou akci.

Stav: ČÁSTEČNĚ PŘIPRAVENO.

## Které tools jsou read-only

Read-only / bez ostrého zápisu:

- `navigate_to`,
- `open_module`,
- `highlight_element`,
- `search_employee`,
- `get_employee_detail`,
- `open_employee_card`,
- `get_employee_manager`,
- `get_employee_absence_summary`,
- `search_user`,
- `get_user_access_summary`,
- `order_status` v aktuálním stavu,
- `tracking` v aktuálním stavu,
- `product_advice`,
- `business_hours`,
- `sarlotaHumanTouchContext()`.

`call_log` zapisuje auditní záznam o hovoru, ale není to provozní akce typu SMS, e-mail, servisní hlášení nebo dovolená.

## Kde se ověřují oprávnění

### Signed-url a status

Signed-url endpoint:

```text
functions/api/ai/elevenlabs/signed-url.js
```

Vyžaduje:

```text
dashboard:view
```

Stavový endpoint:

```text
functions/api/ai/elevenlabs/sarlota-status.js
```

Vyžaduje:

```text
settings:manage
```

Panelový status endpoint:

```text
functions/api/ai/elevenlabs/sarlota-panel-status.js
```

Vyžaduje:

```text
dashboard:view
```

### Backend hlas

Endpoint:

```text
functions/api/voice/sarlota.js
```

Ověření:

- buď přihlášená session,
- nebo serverový webhook token a user ID z payloadu,
- aktivní uživatel,
- oprávnění `dashboard:view`.

### Zápis dovolené

`absenceVacationTool()` vyžaduje:

```text
absence:create
```

Stav: OK pro aktuální write path. Do budoucna je potřeba sjednotit oprávnění v tool registry.

## Co je hardcoded

V repozitáři je hardcoded:

- server-side prompt ve `functions/_lib/voice-sarlota.js`,
- allowed intents v `requestOpenAiDecision()`,
- fallback odpovědi typu `K tomu nemáš oprávnění.`,
- sanitizer odpovědi Šarloty,
- očekávaný model v panelu `GPT-5.1`,
- expected client tool names ve `sarlota-status.js`,
- first message template `{{intro_announcement}}`,
- časově omezené oznámení Zaoralova,
- názvy endpointů a agent env klíče.

V dashboardu je hardcoded nebo ručně nastavené:

- dashboard prompt,
- LLM/TTS/turn konfigurace,
- voice,
- first message,
- tools binding,
- případně token limity a další provozní parametry.

## Co je v repozitáři

Repo obsahuje:

- `/api/voice/sarlota`,
- `/api/ai/elevenlabs/signed-url?assistant=sarlota`,
- `/api/ai/elevenlabs/sarlota-status`,
- `/api/ai/elevenlabs/sarlota-panel-status`,
- server-side OpenAI rozhodování,
- dynamic variables pro ElevenLabs,
- personalizaci uživatele,
- vocativ,
- status panel,
- lokální client tools,
- audit log přes `recordAiAction()`,
- první write path pro Dovolená/nemoc.

## Co je jen v ElevenLabs dashboardu

Jen v dashboardu nebo live ElevenLabs konfiguraci je zatím:

- výchozí prompt živého agenta,
- přesné nastavení LLM modelu agenta,
- přesné TTS a voice nastavení,
- turn timeout, eagerness, speculative turn,
- aktivní tools workflow,
- případné versions/drafts/deployments agenta.

## Bezpečnostní stav

OK:

- OpenAI klíč je používán server-side přes `OPENAI_API_KEY`.
- Signed URL se generuje server-side.
- Status panel nevrací signed URL ani secret hodnoty.
- Dynamic variable values se ve stavovém panelu nevrací.
- Voice endpoint ověřuje session nebo webhook token.
- Absence write vyžaduje oprávnění a potvrzení.

Rizika:

- Dashboard prompt není verzovaný v repozitáři.
- KSO a dashboard prompt se mohou rozjet.
- Neexistuje jednotný tool registry s read/write/permission metadaty.
- Neexistuje oddělený `/api/sarlota/message` a `/api/sarlota/action`.
- Ne všechny zápisové tools mají dry-run/test režim.
- Není jedna tabulka nebo endpoint pro prompt versions a test runs.

## Závěr auditu

Dnes je možné bezpečně pokračovat návrhem API vrstvy v KSO bez změny živého agenta. Další krok má být repo-verzovaný prompt, status endpoint `/api/sarlota/status`, read-only prompt endpoint, message/action endpoints, tool registry a testovací režim bez ostrých zápisů. Změny v ElevenLabs dashboardu přes API mají přijít až po samostatném potvrzení.
