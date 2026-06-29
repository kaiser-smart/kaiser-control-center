# Šarlota signed-url kontrola

Datum kontroly: 2026-06-29

Auditový soubor `SARLOTA_ELEVENLABS_DIRECT_AUDIT.md` jsem v aktuálním worktree nenašel. Kontrola proto navazuje na zadání auditu a na aktuální zdrojový stav projektu.

Aktualizace: stavový endpoint `GET /api/ai/elevenlabs/sarlota-status` nově při dostupné serverové konfiguraci čte ElevenLabs agenta read-only přes `GET /v1/convai/agents/:agent_id`. Do UI a odpovědi vrací jen odvozené stavy, názvy tools a model, nevrací prompt, API key, signed URL, tokeny ani celý agent config.

## 1. Endpoint existuje

OK. Endpoint existuje v `functions/api/ai/elevenlabs/signed-url.js`.

Kontrolovaná cesta:

```text
GET /api/ai/elevenlabs/signed-url?assistant=sarlota
```

Endpoint je chráněný přes přihlášeného uživatele s oprávněním `dashboard:view`.

Bez konfigurace `ELEVENLABS_API_KEY` nebo Agent ID vrací bezpečný stav:

```text
configured: false
apiStatus: waiting
```

V lokálním mock testu s testovací konfigurací a mockovanou ElevenLabs odpovědí endpoint vrátil:

```text
configured: true
apiStatus: ready
assistantId: sarlota
```

Signed URL nebyla v kontrole vypsaná.

## 2. Endpoint posílá `intro_announcement`

OK. `intro_announcement` se skládá v backendu přes `sarlotaIntroAnnouncementForAi()` ve `functions/_lib/ai-session-announcements.js` a do ElevenLabs signed-url odpovědi se přidává do `dynamicVariables`.

Lokální mock test potvrdil:

```text
introAnnouncementPresent: true
allRequiredVariablesPresent: true
```

## 3. Endpoint posílá vocativ `Radime`

OK. `userDynamicVariablesForAi()` ve `functions/_lib/ai-people-summary.js` obsahuje mapování `radim -> Radime`.

Lokální test potvrdil:

```text
radimVocativeOk: true
```

## 4. Odkud se bere personalizace

Personalizace se bere z přihlášeného uživatele / profilu:

- `requireUserPermission()` načte aktuálního uživatele ze session cookie.
- `currentUser()` skládá uživatele z defaultních, kontaktních, env a uložených uživatelů.
- `userDynamicVariablesForAi(user)` připraví jméno, křestní jméno, vocativ, roli, oprávnění, dostupné moduly, oddělení a pozici.
- `sarlotaIntroAnnouncementForAi(env, user, assistant)` přidá `intro_announcement` a stav jeho zapnutí.

Požadované proměnné jsou připravené:

```text
user_name
user_first_name
user_first_name_vocative
user_role
available_modules
user_permissions
user_department
user_position
time_of_day_greeting
user_greeting
intro_announcement
intro_announcement_enabled
```

## 5. Je pozdrav hardcoded?

NE. Běžný pozdrav není hardcoded v ElevenLabs ani ve first message. First message v ElevenLabs má být:

```text
{{intro_announcement}}
```

Backend skládá pozdrav z denní doby v Praze a vocativu uživatele. Pokud je aktivní provozní oznámení, backend místo běžného pozdravu pošle text oznámení v proměnné `intro_announcement`.

Poznámka: v backendu je do 2026-06-30 připravené časově omezené oznámení k ulici Zaoralova. Není to ElevenLabs hardcode, je to backendová dynamická proměnná řízená KSO.

## 6. Jsou tools ověřené?

ČÁSTEČNĚ.

OK je lokální kontrola názvů tools:

- `src/elevenLabsClientTools.js`
- `docs/ELEVENLABS_SMART_POMOCNIK.md`

Lokálně sedí očekávané názvy:

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

Status endpoint nově umí ověřit skutečné nastavení tools v ElevenLabs přes read-only API, pokud má backend k dispozici `ELEVENLABS_API_KEY` a Agent ID. Pokud API není dostupné, panel ponechá stav `NEOVĚŘENO` nebo `chyba` podle odpovědi API.

## 7. Co je OK

- Endpoint `/api/ai/elevenlabs/signed-url?assistant=sarlota` existuje.
- Endpoint zná asistenta `sarlota`.
- Endpoint vrací `configured: false`, když chybí serverová konfigurace.
- Endpoint v mockované konfiguraci vrací `configured: true`.
- Endpoint skládá `dynamicVariables` server-side.
- `intro_announcement` je součástí `dynamicVariables`.
- Test pro Radima vrací vocativ `Radime`.
- Personalizace jde z přihlášeného uživatele / profilu.
- Pozdrav vzniká v KSO backendu.
- Přidaný stavový endpoint `/api/ai/elevenlabs/sarlota-status` nevrací signed URL ani secrety.
- Přidaný panel `Šarlota` je read-only.
- Lokální tool names sedí mezi kódem a dokumentací.
- Status endpoint má připravené read-only ověření ElevenLabs agenta pro model, first message a tools.

## 8. Co je NEOVĚŘENO

- Živé nastavení agenta `Chytré odpadky – Šarlota` v ElevenLabs dashboardu zůstává závislé na dostupném read-only API volání z backendu.
- Jestli má ElevenLabs agent opravdu model `GPT-5.1` zůstává `NEOVĚŘENO`, dokud produkční status endpoint úspěšně nepřečte agenta.
- Jestli jsou tools v ElevenLabs dashboardu skutečně založené a aktivní zůstává `NEOVĚŘENO`, dokud produkční status endpoint úspěšně nepřečte agenta.
- Jestli produkční Cloudflare secrets obsahují správný `ELEVENLABS_API_KEY`.
- Jestli produkční Cloudflare env obsahuje správné Agent ID pro `ELEVENLABS_AGENT_ID_SARLOTA`.
- Živý call na ElevenLabs signed-url API nebyl proveden, aby se nevypisovala signed URL ani se nemanipulovalo se secret konfigurací.

## 9. Rizika

- Pokud je v produkci špatné Agent ID, backend bude technicky nakonfigurovaný, ale může mířit na jiného ElevenLabs agenta.
- Stav tools je zatím jen lokální porovnání kódu a dokumentace, ne živá dashboard/API kontrola.
- First message `{{intro_announcement}}` je ověřená podle auditu a dokumentace, ne živým read-only exportem agenta.
- Signed-url endpoint vrací do aplikace `dynamicVariables`, které obsahují personalizační hodnoty pro ElevenLabs session. Stavový panel je nevrací, ale samotná hlasová session s nimi počítá.
- Časově omezené provozní oznámení může do 2026-06-30 nahradit běžný pozdrav; je to záměr backendu, ale při testování hlasového úvodu to může působit jako rozdíl proti běžnému pozdravu.
