# Šarlota × Hlášení řidičů – audit

Datum auditu: 2026-07-02

Rozsah: read-only audit repozitáře, existující dokumentace, lokálních/mock testů a pasivní produkční kontroly přes `GET`/`HEAD`. Nebyly provedené žádné změny v produkci, Cloudflare, ElevenLabs dashboardu, OpenAI, Twiliu ani secrets. Nebyl volaný žádný produkční write endpoint.

## 1. Shrnutí pro vedení

Co funguje:

- Modul `/hlaseni-ridicu` bez hlasu má reálné frontend i backend napojení: formulář, seznam, vyhledávání, detail, stavové akce, handoff Patrikovi/Kamilovi, D1 store, auditní historii a partslink24 VIN pilot.
- API pro Hlášení řidičů používá oprávnění `driver-reports:view`, `driver-reports:create`, `driver-reports:edit/manage` a ukládá do D1 tabulek `driver_part_requests`, `driver_part_request_events` a `driver_report_partslink24_searches`.
- Webová Šarlota má v repozitáři signed URL flow, client tools pro otevření modulu, bezpečný picker vozidla, read-only kontext řidiče/vozidla, read-only validaci SPZ a potvrzovací modal před hlasovým vytvořením hlášení.
- Backend signed URL je chráněný přes `dashboard:view`, API key zůstává server-side a status endpointy nevrací signed URL, tokeny ani prompt text.

Co je částečné:

- Hlasové vytvoření hlášení je v kódu připravené, ale v tomto auditu nebylo ostře provedeno. Lokální testy ověřují guardy, picker a fallbacky, ne reálný D1 zápis s notifikacemi.
- Live ElevenLabs prompt, model a Tools binding nejsou v tomto běhu ověřené dashboard exportem ani read-only produkčním statusem přihlášeného uživatele. Repo má očekávaný prompt a status kontrolu, ale samotný live agent je NEOVĚŘENO.
- Telefonní Šarlota není z repozitáře jednoznačně doložená jako stejný KSO web agent. Starší audit rozlišuje KSO agenta `Chytré odpadky – Šarlota` a telefonní `Šarlota_3`.

Co je riziko:

- Největší technické riziko je rozdíl mezi verzovaným kódem a live ElevenLabs dashboardem: prompt/tools mohou být mimo repo a voice scénáře pak mohou selhat nebo používat stará pravidla.
- Hlasový write flow přes `/api/voice/sarlota` spoléhá na `confirmed: true` v payloadu. Webový client tool to posílá až po UI potvrzení, ale přímý webhook binding v ElevenLabs dashboardu je NEOVĚŘENO.
- `ai_action_logs` ukládá zkrácený transcript excerpt do 500 znaků. Není to celý transcript, ale u závad může jít o citlivý obsah.
- Kontext a store vrací oprávněnému uživateli plný VIN. Hlasová vrstva ho dál filtruje, ale pro přísnější minimalizaci by šel v hlasových/context odpovědích maskovat.

Co opravit jako první:

1. Read-only ověřit živého ElevenLabs agenta: model, first message, prompt marker pro Hlášení řidičů a skutečné tool bindings.
2. Přidat mock test `/api/voice/sarlota` pro `create_driver_part_request`: bez potvrzení žádný zápis, s potvrzením jen přes očekávaný UI/webhook kontrakt.
3. Zpřísnit citlivé výstupy: maskovat VIN ve voice contextu a snížit/redigovat transcript excerpt v AI action logu.

## 2. Architektura toku

Základní směr:

```text
Uživatel
  -> /hlaseni-ridicu
  -> Šarlota UI v KSO
  -> GET /api/ai/elevenlabs/signed-url?assistant=sarlota
  -> ElevenLabs agent
  -> client tools v prohlížeči
  -> KSO backend API
  -> driver reports D1 store / audit / notifikace
```

Detail toku:

```text
[Přihlášený uživatel]
  |
  | otevře modul nebo hlasový panel
  v
[src/app.js / ElevenLabsAssistantProvider]
  |
  | signed URL bez API key ve frontendu
  v
[functions/api/ai/elevenlabs/signed-url.js]
  |
  | ověří dashboard:view, sestaví dynamic variables, zavolá ElevenLabs server-side
  v
[ElevenLabs agent]
  |
  | tool call: open_module / get_driver_report_context / show_driver_vehicle_picker / create_driver_part_request
  v
[src/elevenLabsClientTools.js]
  |
  | read-only context nebo potvrzený write přes KSO backend
  v
[functions/api/ai/driver-reports/context.js]
[functions/api/voice/sarlota.js]
[functions/api/driver-reports.js]
  |
  v
[functions/_lib/driver-part-requests-store.js]
  |
  v
[D1: driver_part_requests, events, notification_logs]
```

Princip je v kódu dodržený: ElevenLabs je hlasová/konverzační vrstva; identita, oprávnění, validace, nástroje, audit a write akce jsou v KSO backendu.

## 3. Funkční matice

| Scénář | Status | Frontend soubor | Backend endpoint | Oprávnění | Riziko | Doporučení |
|---|---|---|---|---|---|---|
| Otevřít `/hlaseni-ridicu` bez hlasu | Funguje | `src/app.js`, `src/data/modules.js` | `GET /hlaseni-ridicu/` jako statická route | `driver-reports:view` pro obsah modulu | Authenticated UI nebylo v produkci proklikáno | Doplnit Playwright smoke s přihlášenou session |
| Vytvořit hlášení z formuláře | Funguje podle kódu, ostrý zápis netestován | `src/app.js` | `POST /api/driver-reports` | `driver-reports:create` | `handoffAfterCreate` může spustit e-mail/SMS po vytvoření | V UI ponechat jasné potvrzení, v testu ověřit payload |
| Seznam hlášení | Funguje podle kódu | `src/app.js` | `GET /api/driver-reports?search=` | `driver-reports:view` | Řidič vidí jen vlastní záznamy podle store | Přidat regresní test omezení non-manage uživatele |
| Vyhledávání v seznamu | Funguje podle kódu | `src/app.js` | `GET /api/driver-reports?search=` | `driver-reports:view` | Bez D1 migrace vrátí waiting | Testovat s fixture D1 |
| Detail hlášení | Funguje podle kódu | `src/app.js` | `GET /api/driver-reports/:id` | `driver-reports:view` | Vrací telefon/VIN oprávněnému uživateli | Zvážit maskování podle role |
| Stavové akce | Funguje podle kódu | `src/app.js` | `POST /api/driver-reports/:id/*` | `driver-reports:edit/manage` | Ne všechny UI akce mají extra confirm, jen `cancel` | Přidat potvrzení pro handoff/complete/arrived |
| Předání Patrikovi/Kamilovi | Funguje podle kódu, ostré notifikace netestovány | `src/app.js` | `POST /api/driver-reports/:id/handoff-patrik` | `driver-reports:edit`, nebo creator handoff uvnitř create flow | Posílá e-mail a SMS, pokud jsou secrets nastavené | V testu oddělit create potvrzení od handoff potvrzení |
| partslink24 VIN pilot | Částečně | `src/app.js` | `POST /api/driver-reports/partslink24/search-by-vin` | Route `view`, store `parts-search/manage/edit` | Endpoint response může obsahovat full VIN ve workflow inputs pro oprávněného uživatele | Route zpřísnit na `parts-search`, response maskovat |
| „Šarloto, otevři hlášení řidičů“ | Částečně | `src/elevenLabsClientTools.js`, `src/app.js` | žádný write endpoint | route view přes `canViewModule` | Live tool binding v ElevenLabs NEOVĚŘENO | Read-only ověřit tools v live agentovi |
| „Chci nahlásit závadu“ | Částečně | `src/elevenLabsClientTools.js`, `src/sarlota/sarlotaSystemPrompt.js` | `GET /api/ai/driver-reports/context` | `driver-reports:view/create` + `fleet:view` | Live prompt může být starší | Ověřit prompt marker v live agentovi |
| „Najdi moje přiřazené vozidlo“ | Částečně | `src/elevenLabsClientTools.js` | `GET /api/ai/driver-reports/context` | `driver-reports:view/create`, `fleet:view` | Vrací vozidla jen při `vehiclesVerified`; produkční data NEOVĚŘENA | Test s fixture fleet daty a jedním/mnoha vozidly |
| „Otevři výběr vozidla“ | Funguje lokálně | `src/elevenLabsClientTools.js` | `GET /api/ai/driver-reports/context` | stejné jako context | Picker se otevře jen ve web UI, telefon bez UI ne | Pro telefon mít bezpečnou SPZ cestu nebo odmítnutí |
| „Vybral jsem vozidlo, pokračuj“ | Funguje lokálně | `src/elevenLabsClientTools.js` | žádný backend call | UI session picker | Tool vrací jen `vehicleId`, ne název/SPZ | Zachovat minimalizaci dat |
| „Závada je ...“ | Částečně | ElevenLabs prompt + `src/elevenLabsClientTools.js` | až při create přes `/api/voice/sarlota` | create až později | Samotné zachycení textu závisí na live agentovi | Ověřit end-to-end v lokálním mocku text režimu |
| „Vytvoř hlášení“ | Částečně | `src/elevenLabsClientTools.js` | `POST /api/voice/sarlota` -> store | `dashboard:view`, `driver-reports:create` | Přímý dashboard webhook s `confirmed:true` NEOVĚŘEN | Přidat server test confirmation source |
| „Předej to dál“ | Částečně | `src/app.js`, `src/elevenLabsClientTools.js` | create flow volá handoff; existující záznam přes `handoff-patrik` | create nebo edit/manage podle cesty | Hlas nemá samostatný tool pro handoff existujícího hlášení | Buď držet jen create+handoff, nebo přidat potvrzený tool |
| „Ukaž moje poslední hlášení“ | Nefunguje jako hlasový read tool | `src/app.js` umí seznam | `GET /api/driver-reports` | `driver-reports:view` | Šarlota nemá dedicated client tool pro poslední hlášení | Přidat read-only `get_driver_reports_summary` |
| Chyba oprávnění | Funguje v hlasovém context/create flow | `src/elevenLabsClientTools.js` | context, `/api/voice/sarlota` | podle endpointu | Generic API hlásí `Nemáte oprávnění.`, hlasové cesty používají `K tomu nemáš oprávnění.` | Sjednotit hlasové mapování chyb |
| Chyba mikrofonu | Funguje podle kódu | `src/useElevenLabsAssistant.js`, `src/app.js` | žádný backend | žádné | NEOVĚŘENO v reálném prohlížeči | Přidat UI smoke pro denied/unavailable/timeout |
| Chyba signed URL | Funguje podle kódu | `src/useElevenLabsAssistant.js` | `GET /api/ai/elevenlabs/signed-url` | `dashboard:view` | Live secrets NEOVĚŘENO | Přihlášeně ověřit status bez vypsání signed URL |
| Neověřené vozidlo | Funguje lokálně | `src/elevenLabsClientTools.js` | context, license-plate | create/fleet | Nesmí si domyslet SPZ; testy to hlídají | Rozšířit testy i na backend context endpoint |

## 4. Napojení Hlasové Šarloty

### Web voice

Webový hlas běží přes `src/useElevenLabsAssistant.js` a `src/ElevenLabsAssistantProvider.js`. Frontend si vyžádá serverovou signed URL, otevře ElevenLabs WebSocket a obsluhuje client tool calls. Mikrofon se řeší před signed URL voláním a kód rozlišuje zamítnutý mikrofon, timeout, nedostupný mikrofon, chybu signed URL i odpojení socketu.

`/hlaseni-ridicu` je v `AI_ALLOWED_ROUTES` a `driver-reports` i `hlaseni-ridicu` mapují na `/hlaseni-ridicu`. Navigace ještě prochází přes `canUseAiRoute()`, tedy přes `canViewModule()` aktuálního uživatele.

### Backend `/api/voice/sarlota`

`functions/api/voice/sarlota.js` přijímá POST buď z přihlášené session, nebo přes webhook token `VOICE_ASSISTANT_WEBHOOK_TOKEN` / `ELEVENLABS_WEBHOOK_TOKEN` a `user_id` v payloadu. Potom vyžaduje aktivního uživatele a `dashboard:view`.

Vlastní rozhodování a write guardy jsou ve `functions/_lib/voice-sarlota.js`. Pro Hlášení řidičů existuje deterministická větev `driver_part_request`, která:

- vyžaduje `driver-reports:create`,
- bez vozidla nebo ověřené SPZ vrací `VEHICLE_SPZ_REQUIRED`,
- validuje SPZ proti Vozovému parku,
- při cizí, ale existující SPZ nastaví ruční kontrolu dispečera,
- bez `confirmed` vrací `needs_confirmation`,
- po potvrzení vytvoří hlášení a pokusí se o handoff.

### Driver reports context endpoint

`functions/api/ai/driver-reports/context.js` je read-only. Vyžaduje přihlášení a současně:

- `driver-reports:view`,
- `driver-reports:create`,
- `fleet:view`.

Vozidla vrací jen pokud je řidič namapovaný, vozidla jsou aktivní, přiřazená aktuálnímu řidiči, nejsou mock/fallback, mají `source: fleet_db` a `vehiclesVerified: true`. Pokud je cokoliv nejisté, vrací prázdný seznam a fallback na picker/SPZ.

### Client tools

Relevantní tools v `src/elevenLabsClientTools.js`:

- `open_module` / `navigate_to`: UI navigace, read-only/UI akce.
- `get_driver_report_context`: read-only backend context.
- `show_driver_vehicle_picker`: UI picker, v hlasové odpovědi nevrací názvy vozidel.
- `get_driver_vehicle_picker_selection`: read-only vrací pouze `vehicleId`.
- `validate_driver_vehicle_spz`: read-only ověření SPZ.
- `create_driver_part_request`: write akce přes UI potvrzení a `/api/voice/sarlota`.

Write akce je oddělená od read-only akcí: `create_driver_part_request` nejdřív vyžádá serverový `needs_confirmation`, zobrazí modal a až po potvrzení pošle `confirmed: true`.

### Status panel

`src/components/SarlotaStatusPanel.js`, `functions/api/ai/elevenlabs/sarlota-status.js` a `functions/api/ai/elevenlabs/sarlota-panel-status.js` vrací bezpečné stavy: configured, model status, first message status, tool names, prompt marker a diagnostiku bez prompt textu, signed URL, tokenů a secretů. Panelový status vyžaduje `dashboard:view`, detailnější status `settings:manage`.

Pozor: v UI existují i akce pro sync/repair/delete/prompt sync. V tomto auditu nebyly spouštěné. Nejsou součást read-only ověření.

### Dynamic variables

Signed-url endpoint posílá dynamic variables z přihlášeného profilu: `user_name`, `user_first_name_vocative`, `available_modules`, `user_permissions`, `intro_announcement`, firemní lidskost a metadata asistenta. Běžná signed-url cesta pro Šarlotu neposílá `driver_report_vehicle_*`; status uvádí, že vozidlový kontext je ve signed-url defaultně vynechaný.

Oslovení typu `Radime` vzniká v KSO backendu přes `functions/_lib/ai-people-summary.js` a `functions/_lib/ai-session-announcements.js`, ne ve frontendu.

### Co je v repo

- Signed URL endpoint.
- Webový ElevenLabs WebSocket flow.
- Client tools.
- Backend `/api/voice/sarlota`.
- Driver reports context endpoint.
- Repo-verzovaný prompt blok v `src/sarlota/sarlotaSystemPrompt.js`.
- Status endpoints pro read-only kontrolu agenta.
- Store, D1 migrace, audit log a notifikace.

### Co je jen v ElevenLabs dashboardu

- Skutečně aktivní system prompt live agenta.
- Skutečné Tools tab bindings.
- Skutečný model/TTS/hlas/turn konfigurace.
- Versions/drafts/deployments agenta.
- Případné telefonní/SIP/Twilio napojení.

Bez dashboard exportu nebo úspěšného read-only agent API checku je toto NEOVĚŘENO.

## 5. Hlášení řidičů bez hlasu

### Formulář

Formulář „Nové hlášení“ je v `src/app.js`. Povinné jsou SPZ a popis závady. Další pole:

- řidič,
- telefon,
- vozidlo,
- VIN,
- značka,
- poznámka,
- `handoffAfterCreate`,
- manažerský override neověřené SPZ s povinnou poznámkou.

Frontend před odesláním ověřuje SPZ lokálně a přes `GET /api/driver-reports/license-plate?value=...`. Submit je povolený jen při nalezené/validní SPZ nebo při manažerském override.

### Data a API

POST payload do `/api/driver-reports` obsahuje:

```json
{
  "driverName": "...",
  "driverPhone": "...",
  "vehicleName": "...",
  "vehicleId": "...",
  "licensePlate": "...",
  "vin": "...",
  "vehicleBrand": "...",
  "defectDescription": "...",
  "note": "...",
  "handoffAfterCreate": true,
  "licensePlateUnverified": false,
  "licensePlateOverrideNote": "",
  "source": "manual"
}
```

`functions/api/driver-reports.js`:

- `GET` vyžaduje `driver-reports:view` a vrací list, permissions a `apiStatus`.
- `POST` vyžaduje `driver-reports:create`, ukládá přes `createDriverPartRequest()` a při `handoffAfterCreate === true` volá `handoffDriverPartRequest(..., { allowCreatorHandoff: true })`.

### Oprávnění

Role podle `src/permissions.js`:

- `ridic`: `driver-reports:view/create`,
- `dispecer`: `driver-reports:view/parts-search`,
- `garazmistr`: `driver-reports:view/edit/manage/parts-search`,
- `readonly`: `driver-reports:view`.

Store dál omezuje non-manage uživatele na jejich vlastní `driver_user_id`.

### Store

`functions/_lib/driver-part-requests-store.js` ukládá do D1. Při chybě DB/migrace vrací bezpečný stav `waiting`/503 a nepředstírá úspěch. Create flow:

- vyžaduje popis, SPZ a řidiče,
- pro hlasový zdroj vyžaduje explicitní `vehicleId` nebo ověřenou SPZ,
- validuje SPZ proti fleet source,
- neověřenou SPZ dovolí jen manažerské roli s poznámkou,
- uloží historii události `create`.

### Stavové akce

Akce v detailu:

- `handoff-patrik`: e-mail Patrikovi + SMS Kamilovi, stav `handed_to_ordering` jen když odejde obojí,
- `manual-part` / `ordered`: ruční ověření/objednání,
- `verify-mercedes-part`: Mercedes/Daimler ověření dílu,
- `part-arrived`: díl dorazil,
- `schedule-service`: naplánování servisu + SMS řidiči,
- `complete`: vyřízeno,
- `cancel`: zrušeno.

Všechny status/write endpointy používají `driver-reports:edit`; store pro většinu vyžaduje manage/edit.

### Handoff a notifikace

Notifikace jdou server-side přes `functions/_lib/notification-service.js`. Frontend neposílá e-maily ani SMS. Pokud SendGrid/Twilio config chybí, notifikace se loguje jako `skipped` a store neshodí tajné hodnoty do UI.

### VIN / partslink24

partslink24 je pouze read-only / AI Boost pilot. Kód a dokumentace říkají:

- jen pro osobní vozidla,
- bez objednávání,
- bez změn v partslink24,
- bez ukládání hesel/cookies/screenshotů se secrets,
- audit ukládá maskovaný VIN.

Riziko: endpoint může autorizovanému uživateli vrátit workflow inputs s plným VIN. Pro hlas a audit je vhodnější full VIN z response odstranit nebo maskovat.

## 6. Hlasové scénáře

| Scénář | Očekávaný výsledek | Tok | Typ akce | Potvrzení | Chování při chybě |
|---|---|---|---|---|---|
| Otevření modulu | Šarlota otevře `/hlaseni-ridicu`, pokud uživatel modul vidí | `open_module` -> route map -> `navigateFromAiAssistant()` | UI akce | Ne | Toast/tool chyba bez zápisu |
| Načtení řidiče | Context se pokusí namapovat current user na employee/driver | `get_driver_report_context` -> `/api/ai/driver-reports/context` | Read-only | Ne | `UNAUTHENTICATED`, `FORBIDDEN`, `VEHICLES_UNAVAILABLE` |
| Ověření vozidel | Vrátit vozidla jen při `vehiclesVerified: true` | context -> `resolveFleetVehiclesForDriver(strictDriverAssignment)` | Read-only | Ne | Prázdný seznam + picker/SPZ fallback |
| Picker vozidla | Otevře modal v aplikaci, voice neříká seznam | `show_driver_vehicle_picker` | UI akce | Ne | „Výběr se mi nepodařilo otevřít...“ |
| Výběr vozidla | Po výběru vrátí jen `vehicleId` | `get_driver_vehicle_picker_selection` | Read-only/UI state | Ne | `VEHICLE_SPZ_REQUIRED`, znovu picker/SPZ |
| Nahlášení závady | Šarlota sbírá popis a ověřený vehicleId/SPZ | prompt + client tools | Příprava | Ne | Doptá se na jednu chybějící informaci |
| Vytvoření hlášení | Bez potvrzení nic nezapíše; po potvrzení volá backend | `create_driver_part_request` -> `/api/voice/sarlota` | Write | Ano | „Nic jsem neodeslala.“ |
| Handoff | Create flow po potvrzení může zkusit předat Patrikovi/Kamilovi | `/api/voice/sarlota` -> `handoffDriverPartRequest(... allowCreatorHandoff)` | Write + notifikace | Ano, jako součást create potvrzení | Když notifikace selže, hlášení může být zapsané, předání není hotové |
| Chyba oprávnění | Říct česky „K tomu nemáš oprávnění.“ | context/create voice paths | Read/write podle scénáře | Ne | `403`, žádný write |
| Chyba mikrofonu | UI má říct konkrétně mikrofon, ne obecné odpojeno | `src/useElevenLabsAssistant.js` | Lokální UI | Ne | denied/timeout/unavailable/start failed |
| Chyba signed URL | Hlas se nespustí, žádná signed URL se neloguje | `GET /api/ai/elevenlabs/signed-url` | Read-only session setup | Ne | `configured:false` nebo `waiting`, stream se uklidí |
| Neověřené vozidlo | Neříkat konkrétní vůz, otevřít picker nebo žádat SPZ | context/client filters | Read-only/UI | Ne | prázdné `vehicles`, fallback otázka |

Konkrétní fráze:

- „Šarloto, otevři hlášení řidičů“: v repo podporováno přes `open_module`, live binding NEOVĚŘENO.
- „Chci nahlásit závadu“: v repo podporováno prompt pravidlem a context tool, live prompt NEOVĚŘENO.
- „Najdi moje přiřazené vozidlo“: context tool existuje, ale vrátí seznam jen při bezpečném ověření.
- „Otevři výběr vozidla“: lokální test prošel.
- „Vybral jsem vozidlo, pokračuj“: lokální test prošel, vrací jen `vehicleId`.
- „Závada je ...“: závisí na live agentovi, backend zpracuje až při create.
- „Vytvoř hlášení“: kód podporuje potvrzený write, ostrý zápis nebyl testován.
- „Předej to dál“: jako součást create flow částečně podporováno; samostatný hlasový handoff existujícího hlášení není hotový.
- „Ukaž moje poslední hlášení“: bez dedicated voice read toolu nefunguje; lze jen otevřít modul/seznam.

## 7. Rizika a priority

### P0

Aktuálně jsem v kódu ani lokálních testech nepotvrdil P0 typu API key ve frontendu, signed URL ve status panelu nebo write bez backend oprávnění. Přesto zůstává P0 podmíněné riziko, pokud by live ElevenLabs dashboard měl nástroj nastavený tak, že posílá `confirmed: true` bez prokazatelného uživatelského potvrzení. To v repo nelze ověřit.

### P1

- Live ElevenLabs prompt/tools nejsou plně verzované ani v tomto běhu potvrzené z dashboardu. Dopad: hlasový flow může být nefunkční nebo používat stará pravidla.
- Telefonní Šarlota může být jiný agent než webová KSO Šarlota. Dopad: nelze přebírat závěry z webového toku do telefonu.
- `/api/voice/sarlota` webhook token fallback věří `user_id` v payloadu, pokud sedí serverový token. Dopad: token musí zůstat výhradně server-side a dashboard binding nesmí umožnit libovolné user id.
- Voice create flow po potvrzení rovnou zkouší handoff/notifikace. Dopad: potvrzovací text musí jasně říct „uložit a předat“.
- `show_driver_vehicle_picker` je web UI; telefonní hovor bez UI musí skončit bezpečnou SPZ cestou nebo odmítnutím, ne domýšlením vozidla.

### P2

- `recordVoiceActionSafely()` ukládá až 500 znaků transcript excerpt. Zkrátit a redigovat SPZ/telefon/VIN.
- Full VIN se v autorizovaných context/detail odpovědích vyskytuje. Pro hlasové endpointy stačí `vinPresent` nebo maska.
- partslink24 endpoint by měl route-level vyžadovat `driver-reports:parts-search`, ne až store-level.
- UI status texty mikrofonu mají dobré kódové větve, ale chybí browser smoke test.
- Existing audit dokumenty se liší v modelu: starší přímý audit uvádí GPT-5.1, aktuální kód/status očekává `Qwen3.5-397B-A17B`. Live model je NEOVĚŘENO.

## 8. Doporučené opravy

| Soubor | Změna | Důvod | Riziko | Test |
|---|---|---|---|---|
| `functions/_lib/voice-sarlota.js` | U driver reports write vyžadovat a logovat bezpečný `confirmationSource` / `confirmationId`, ne jen boolean `confirmed` | Sníží riziko dashboard webhooku s předvyplněným `confirmed:true` | Střední, může změnit EL tool contract | Nový mock test pro `confirmed:false`, `confirmed:true` bez source, UI source |
| `src/elevenLabsClientTools.js` | Do potvrzovacího modalu explicitně uvést, zda se hlášení jen uloží, nebo uloží a předá | `handoffAfterCreate` posílá e-mail/SMS | Nízké | Unit test payloadu a textu potvrzení |
| `functions/api/ai/driver-reports/context.js` | V hlasovém contextu vracet `vinPresent` nebo masku, ne full VIN | Minimalizace citlivých údajů | Nízké až střední, UI picker možná používá info o VIN | `driver-report-context.test.mjs` |
| `functions/_lib/partslink24-search-store.js` | V API response maskovat/odebrat full VIN z `workflow.inputs` | Audit už ukládá maskovaný VIN, response by měla být stejně opatrná | Nízké | `partslink24_kso_phase1.test.mjs` |
| `functions/api/driver-reports/partslink24/search-by-vin.js` | Route-level permission změnit z `view` na `parts-search` | Jasnější 403 a menší blast radius | Nízké, ověřit role `dispecer`/`garazmistr` | partslink24 testy + permissions smoke |
| `functions/_lib/voice-sarlota.js` | Zkrátit/redigovat `transcriptExcerpt` v AI action logu | Neuchovávat citlivé řeči řidičů zbytečně dlouhé | Nízké | Test redakce SPZ/VIN/telefonu |
| `scripts/driver-report-context.test.mjs` nebo nový test | Přidat mock backend test celého voice create flow bez D1 write | Dnes testy kryjí guardy, ale ne `/api/voice/sarlota` kontrakt | Nízké | Přímý node test |
| `SARLOTA_SIGNED_URL_CHECK.md` / status docs | Aktualizovat rozdíl GPT-5.1 vs Qwen a označit live model NEOVĚŘENO | Snížení provozního zmatku | Nízké | Doc review |
| `src/components/SarlotaStatusPanel.js` | Oddělit read-only status od tlačítek sync/repair/delete nebo přidat výrazný guard text | Auditní panel nemá působit jako bezpečně read-only, když obsahuje write akce | Nízké | UI smoke |

## 9. Testy

Spuštěné lokálně přes bundled Node, protože `npm` v shellu nebyl na PATH:

```text
/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-syntax.mjs
```

Výsledek: prošlo, `241 JS/MJS souboru proslo node --check`.

```text
/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-syntax.mjs --typecheck
```

Výsledek: prošlo, `241 JS/MJS souboru proslo node --check`.

```text
/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/driver-report-context.test.mjs
```

Výsledek: prošlo. Ověřuje strict driver assignment, blokaci mock dat, client-side odstranění neověřených vozidel, picker, `vehicleId` selection a zákaz highlight výběru vozidla.

```text
/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/elevenlabs-signed-url-options.test.mjs
```

Výsledek: prošlo. Ověřuje signed-url volby pro Šarlotu/Smart 2 a diagnostic mode bez posílání vozidlového kontextu.

```text
/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/elevenlabs-assistant-config.test.mjs
```

Výsledek: prošlo. Ověřuje assistant key routing a maskování Agent ID v public metadata.

```text
/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/partslink24_vin_pilot.test.mjs
/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/partslink24_kso_phase1.test.mjs
```

Výsledek: oba prošly. Ověřují pilotní/read-only partslink24 ochrany.

```text
/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/build.mjs
```

Výsledek: prošlo, `Build hotov: 41 rout, vystup ve slozce dist.` Git status se po buildu nezměnil.

Pasivní produkční kontroly:

```text
HEAD https://kaiser-control-center.pages.dev/hlaseni-ridicu/
```

Výsledek: `200`.

```text
GET https://kaiser-control-center.pages.dev/api/driver-reports
GET https://kaiser-control-center.pages.dev/api/ai/driver-reports/context
GET https://kaiser-control-center.pages.dev/api/ai/elevenlabs/signed-url?assistant=sarlota
```

Výsledek: bez session bezpečné `401`. Context endpoint vrátil bezpečný unauthenticated payload bez vozidel a bez signed URL.

Bezpečnostní grep:

- `rg` v `src`, `dist`, `index.html`, `public` nenašel `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `TWILIO_AUTH_TOKEN`, `SENDGRID_API_KEY`, `VOICE_ASSISTANT_WEBHOOK_TOKEN`.
- Výskyty `signedUrl` ve frontendu jsou názvy proměnných a WebSocket flow, ne konkrétní signed URL ani secret.

Co nebylo testováno:

- Přihlášené produkční UI, mikrofon a reálný ElevenLabs WebSocket hovor.
- Read-only live export ElevenLabs agenta přes produkční status endpoint.
- Ostrý POST `/api/driver-reports`, `/api/voice/sarlota` nebo jakýkoliv write/notifikační endpoint.
- Produkční Twilio/SendGrid/Cloudflare secrets.
- Telefonní inbound webhook a agent `Šarlota_3`.

Pokud test nejde spustit bez secrets:

- Signed URL live flow potřebuje přihlášenou session, správné Cloudflare secrets a vrací citlivou signed URL. Bezpečný mock test už běží; další krok má být status endpoint, který vrací jen stav a tool names, ne signed URL.
- Voice create flow s D1 write a notifikacemi nesmí být v produkci zkoušen bez explicitního schválení. Doporučený mock test má nahradit D1 a notification service fixture objekty.
