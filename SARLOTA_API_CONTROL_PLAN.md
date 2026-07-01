# Šarlota API control plan

Datum: 2026-06-29

Cíl: přesunout řízení Šarloty z ručního ladění v ElevenLabs dashboardu do bezpečné API vrstvy Kaiser Smart Odpady. ElevenLabs má zůstat hlasová vrstva. KSO backend má být zdroj pravdy pro prompt, identitu, oprávnění, dostupné moduly, zápisy, potvrzení, audit a stav.

## Cílová architektura

```text
ElevenLabs agent
-> KSO backend
-> OpenAI API / LLM vrstva
-> KSO tools
-> odpověď zpět do ElevenLabs
```

Princip:

- ElevenLabs zachytí hlas a přehraje odpověď.
- ElevenLabs neposuzuje oprávnění.
- ElevenLabs neprovádí ostré provozní akce.
- KSO backend rozhoduje, co je dovoleno.
- KSO backend loguje akce.
- KSO backend potvrzuje zápisy až po úspěchu toolu.

## Navržené endpointy

### `GET /api/sarlota/status`

Účel: jeden bezpečný stavový endpoint pro UI, audit a pilotní provoz.

Vrací:

```json
{
  "elevenLabs": {
    "configured": true,
    "status": "ok",
    "agentName": "Chytré odpadky – Šarlota",
    "agentIdMasked": "agent_1234…abcd"
  },
  "signedUrlEndpoint": {
    "status": "ok",
    "path": "/api/ai/elevenlabs/signed-url?assistant=sarlota"
  },
  "openAi": {
    "configured": true,
    "status": "ok"
  },
  "tools": {
    "total": 0,
    "readOnly": 0,
    "write": 0,
    "writeStatus": "unverified"
  },
  "prompt": {
    "source": "repo",
    "version": "sarlota-2026-06-29",
    "status": "ok"
  },
  "personalization": {
    "status": "ok"
  },
  "lastTest": {
    "time": null,
    "status": "unverified"
  }
}
```

Bezpečnost:

- nevracet API key,
- nevracet signed URL,
- nevracet tokeny,
- agent ID jen maskovaně,
- osobní údaje jen agregovaně nebo maskovaně.

Vazba na dnešní stav:

- použít existující logiku ze `functions/api/ai/elevenlabs/sarlota-status.js`,
- přidat alias nebo novou route `functions/api/sarlota/status.js`.

### `GET /api/sarlota/prompt`

Účel: vracet aktuální prompt z repozitáře nebo backend konfigurace.

Vrací:

```json
{
  "source": "repo",
  "version": "sarlota-2026-06-29",
  "prompt": "...",
  "dashboardWrapperExpected": true,
  "secretsOmitted": true
}
```

Pravidlo:

- prompt nesmí obsahovat secrety,
- endpoint vyžaduje minimálně `settings:manage`,
- běžným uživatelům lze vracet jen version/hash a stav.

### `POST /api/sarlota/message`

Účel: textový nebo transkriptový vstup vyhodnotit v KSO backendu.

Input:

```json
{
  "sessionId": "sarlota-session-id",
  "userId": "user-id",
  "transcript": "Zapiš závadu, auto brzdí divně.",
  "currentModule": "vozovy-park",
  "metadata": {
    "source": "elevenlabs",
    "conversationId": "masked-or-internal"
  }
}
```

Output:

```json
{
  "answerText": "Rozumím. Podívám se do Smart systému.",
  "intent": "create_vehicle_issue",
  "action": "prepare",
  "requiresConfirmation": true,
  "toolCall": {
    "name": "create_vehicle_issue",
    "mode": "write",
    "status": "prepared"
  },
  "status": "needs_confirmation"
}
```

Pravidlo:

- tady se připravuje rozhodnutí a návrh akce,
- ostré akce se neprovedou bez potvrzení,
- odpověď nesmí tvrdit `hotovo`, dokud tool nevrátil úspěch.

### `POST /api/sarlota/action`

Účel: provést potvrzenou akci.

Input:

```json
{
  "sessionId": "sarlota-session-id",
  "confirmationId": "confirm-id",
  "toolName": "create_vehicle_issue",
  "confirmed": true,
  "payload": {
    "vehicleId": "3",
    "severity": "safety",
    "text": "Auto špatně brzdí."
  }
}
```

Output:

```json
{
  "answerText": "Hotovo, závada je zapsaná.",
  "status": "created",
  "toolCall": {
    "name": "create_vehicle_issue",
    "result": "success"
  }
}
```

Povinné kontroly:

- přihlášený uživatel nebo ověřený webhook token,
- aktivní uživatel,
- oprávnění k toolu,
- potvrzení u citlivé akce,
- validace payloadu,
- audit log,
- idempotency key proti duplicitě.

### Volitelně `POST /api/sarlota/test`

Účel: testovací režim bez ostrých zápisů.

Input:

```json
{
  "scenario": "vehicle_issue",
  "transcript": "Zapiš závadu na vozidle.",
  "dryRun": true
}
```

Output:

```json
{
  "answerText": "...",
  "intent": "...",
  "toolStatus": "dry_run",
  "checks": {
    "friendly": true,
    "concise": true,
    "noFakeWrite": true,
    "permissionsRespected": true
  }
}
```

## Prompt verzovaný v repozitáři

Navržený soubor:

```text
src/sarlota/sarlotaSystemPrompt.js
```

Projekt je dnes JavaScript/ESM, proto je vhodnější `.js` než `.ts`, pokud se nezavede TypeScript build.

Exporty:

```js
export const SARLOTA_PROMPT_VERSION = "sarlota-2026-06-29";
export const SARLOTA_SYSTEM_PROMPT = "...";
export const SARLOTA_ELEVENLABS_WRAPPER_PROMPT = "...";
```

Hlavní prompt v repo má obsahovat:

- identitu Šarloty,
- tón: lidská, příjemná, klidná, stručná,
- zákaz lhaní a neověřených termínů,
- pravidlo `předám to kolegyni Jarce`,
- zákaz slov `ticket`, `tiket`, `SupportBox`,
- pravidla pro zápisy,
- pravidlo potvrzení citlivých akcí,
- pravidlo `hotovo` až po úspěchu backendu,
- blok `Firemní lidskost`,
- pravidla pro zákazníky vs. interní ověřené uživatele,
- pravidla pro SMS/e-maily,
- pravidla pro nemoc, OČR, soukromí.

ElevenLabs dashboard má mít jen wrapper:

```text
Jsi hlasová vrstva Šarloty. Řiď se odpověďmi a rozhodnutím KSO backendu.
First message používej z {{intro_announcement}}.
Reálné akce neprováděj mimo KSO tools.
```

## Tool registry v KSO

Navržený soubor:

```text
functions/_lib/sarlota-tools.js
```

Každý tool má mít metadata:

```js
{
  name: "create_vehicle_issue",
  mode: "write",
  permission: ["fleet", "edit"],
  requiresConfirmation: true,
  dryRunSupported: true,
  auditActionType: "sarlota_tool",
  sensitive: true
}
```

### Read-only tools

Navržené:

```text
get_vehicle_tracking_summary
get_module_status
search_records
get_employee_absence_summary
get_user_access_summary
business_hours
human_touch_context
```

Pravidlo:

- bez ostrého zápisu,
- odpověď musí říct NEOVĚŘENO, pokud zdroj není ověřený.

### Write tools

Navržené:

```text
create_vehicle_issue
create_service_note
create_task
create_reminder
prepare_sms
send_vehicle_tracking_message
create_absence_request
create_driver_report
create_customer_note
create_next_step_proposal
```

Pravidlo:

- `prepare_sms` jen připraví návrh,
- `send_vehicle_tracking_message` vyžaduje potvrzení,
- `create_absence_request` vyžaduje `absence:create`,
- bezpečnostní závady na vozidle vyžadují potvrzení,
- e-mail/SMS nikdy bez potvrzení,
- žádný tool nesmí vrátit `hotovo`, pokud backend nevrátil success.

## Zápisový tok

1. Uživatel řekne požadavek.
2. `POST /api/sarlota/message` rozpozná intent.
3. Backend vybere tool z registry.
4. Backend ověří oprávnění.
5. Backend zjistí jen nutné informace.
6. Backend položí vždy jen jednu otázku.
7. Backend připraví návrh akce.
8. U citlivé akce vrátí `requiresConfirmation: true`.
9. Uživatel potvrdí.
10. `POST /api/sarlota/action` provede tool.
11. Tool vrátí `success`, `failed`, `forbidden`, `needs_input` nebo `requires_approval`.
12. Šarlota řekne výsledek podle skutečného stavu.
13. Audit log uloží vstup, intent, tool, stav a výsledek bez secretů.

Příklad:

```text
Uživatel: Zapiš závadu, auto brzdí divně.
Šarlota: Rozumím. Podívám se do Smart systému.
Backend: tool get_driver_report_context -> vehiclesVerified true, 2 vozidla
Šarlota: Máš pod sebou Mercedes Atego, SPZ 1A1 1111, Mercedes Sprinter, SPZ 2A2 2222. Kterého vozidla se závada týká?
Uživatel: Sprinter.
Šarlota: Zapíšu závadu: vozidlo má problém s brzdami. Potvrzuješ?
Uživatel: Ano.
Backend: tool create_driver_part_request -> requires_confirmation
Šarlota: Otevřela jsem potvrzení v aplikaci.
```

Když tool selže:

```text
Šarlota: Zápis se nepodařil. Nic jsem nezapsala.
```

Když chybí oprávnění:

```text
Šarlota: K tomu nemáš oprávnění. Můžu to předat kolegyni Jarce.
```

## Oprávnění

Zdroj pravdy:

```text
src/permissions.js
```

Pravidla:

- oprávnění ověřuje jen KSO backend,
- ElevenLabs prompt nesmí rozhodovat o oprávnění,
- každá write akce má vlastní permission metadata,
- UI confirmation nestačí bez server-side kontroly,
- webhook token nestačí bez user ID a aktivního uživatele,
- u externích volajících musí být identita výslovně omezená.

Mapování příkladů:

```text
create_absence_request -> absence:create
create_vehicle_issue -> fleet:edit nebo fleet:manage
create_service_note -> service-maintenance:edit
create_task -> feedback:create nebo module-specific task permission
create_reminder -> feedback:create nebo reminders:create
prepare_sms -> dashboard:view
send_vehicle_tracking_message -> vehicle-tracking:edit + explicit confirmation
search_records -> daný modul:view
```

## Audit a logování

Dnes existuje:

```text
recordAiAction()
ai_action_logs
```

Doporučené rozšíření:

```text
sarlota_sessions
sarlota_messages
sarlota_tool_calls
sarlota_prompt_versions
sarlota_test_runs
```

Minimum bez nové migrace:

- pokračovat přes `recordAiAction()`,
- logovat `sessionId`, `conversationId`, `intent`, `toolName`, `status`, `verified`, `requiresConfirmation`,
- neukládat API klíče, signed URL, tokeny ani celé osobní payloady,
- text transcriptu krátit,
- citlivé hodnoty maskovat.

Migrace pro nové tabulky vyžaduje samostatné potvrzení.

## ElevenLabs API konfigurace

Bezpečný postup:

1. Read-only export živého agenta přes `GET /v1/convai/agents/:agent_id`.
2. Porovnání s repo konfigurací.
3. Vygenerování návrhu patch payloadu.
4. Ruční review diffu bez secretů.
5. Teprve po potvrzení `PATCH /v1/convai/agents/:agent_id`.
6. Pokud je agent versioned, použít draft/branch/version flow podle dostupnosti.
7. Po změně read-only ověření.

Spravovat přes API lze navrhnout:

- LLM model,
- prompt wrapper,
- first message `{{intro_announcement}}`,
- token limit,
- turn timeout,
- turn eagerness,
- speculative turn,
- TTS model,
- voice,
- client events,
- tools,
- workflow.

Zakázané bez potvrzení:

- měnit agenta,
- publikovat agenta,
- měnit first message,
- měnit system prompt,
- měnit voice,
- měnit tools.

## Cílový profil rychlé Šarloty

Stav: návrh, zatím NEOVĚŘENO proti živému ElevenLabs workspace.

LLM:

- preferovat nejrychlejší ověřený model v `GET /v1/convai/llm/list`,
- cílově testovat `Qwen3.6-35B-A3B`, jen pokud ho workspace opravdu nabízí,
- fallback: nejrychlejší dostupný model s dobrou češtinou,
- reasoning low,
- reasoning summary off,
- max tokens 180 až 220.

Conversation:

- Turn V3,
- eagerness nejdřív `normal`, pak test `high`,
- take turn after silence 2 až 3 s,
- speculative turn testovat ON,
- přerušení uživatelem musí mít přednost.

TTS:

- rychlý real-time model,
- hlas Anet,
- bez rušivých pauz,
- žádné background sound,
- rychlost jen mírně nad 1.0, pokud je srozumitelná.

## UI v KSO

Dnešní základ:

```text
src/components/SarlotaStatusPanel.js
src/components/AiVoiceAssistantPanel.js
```

Navržený panel:

```text
Šarlota – stav
```

Zobrazit:

- ElevenLabs OK / chyba / neověřeno,
- OpenAI OK / chyba / neověřeno,
- prompt source: repo / dashboard / neověřeno,
- prompt version,
- tools počet,
- read-only tools počet,
- write tools počet,
- poslední test,
- poslední chyba,
- stav zápisů,
- stav oprávnění,
- signed-url endpoint,
- personalizace / intro_announcement.

Pravidlo:

- neukazovat falešné OK,
- neukazovat secrety,
- neukazovat signed URL,
- read-only panel nesmí měnit agenta ani spouštět ostré tools.

## Testovací režim bez ostrých zápisů

Scénáře:

1. `Ahoj Šarloto.`
2. `Otevři Servis.`
3. `Zapiš závadu na vozidle.`
4. `Auto špatně brzdí.`
5. `Pošli SMS garážmistrovi.`
6. `Nemám oprávnění.`
7. Backend odmítne akci.
8. Tool vrátí `failed`.
9. Tool vrátí `sent`.
10. Přerušení uživatelem během řeči.

Výstup každého testu:

```json
{
  "scenario": "vehicle_issue",
  "answerText": "...",
  "intent": "...",
  "tool": "...",
  "status": "...",
  "checks": {
    "friendly": true,
    "concise": true,
    "noFakeWrite": true,
    "permissionsRespected": true,
    "needsConfirmationWhenSensitive": true
  }
}
```

Testovací pravidla:

- dry-run default,
- žádná SMS,
- žádný e-mail,
- žádný ostrý zápis do provozních modulů,
- výjimkou může být auditní log testu,
- ostrý pilot povolit až po potvrzení.

## Fázování

### Fáze 0 - dokumentace

Hotovo tímto plánem:

- audit současného stavu,
- návrh endpointů,
- návrh prompt source of truth,
- návrh tool registry,
- návrh testovacího režimu.

### Fáze 1 - repo prompt a status

Bezpečné udělat hned po potvrzení:

- vytvořit `src/sarlota/sarlotaSystemPrompt.js`,
- přesměrovat `voice-sarlota.js` na repo prompt,
- přidat `GET /api/sarlota/status`,
- přidat `GET /api/sarlota/prompt`,
- rozšířit panel o prompt source/version.

Žádný ElevenLabs dashboard write.

### Fáze 2 - message/action API

Po potvrzení:

- přidat `POST /api/sarlota/message`,
- přidat `POST /api/sarlota/action`,
- zavést tool registry,
- přidat dry-run režim,
- pokrýt testovací scénáře.

### Fáze 3 - zápisové tools

Po potvrzení pro každý modul:

- servisní hlášení,
- závada na vozidle,
- poznámka k vozidlu,
- hlášení řidiče,
- připomínka,
- úkol,
- provozní poznámka k zákazníkovi,
- návrh dalšího kroku,
- SMS/e-mail jen po potvrzení.

### Fáze 4 - ElevenLabs API správa

Jen po výslovném potvrzení:

- read-only export agenta,
- návrh patch payloadu,
- test na draft/branch,
- update agenta,
- read-only kontrola,
- případné publikování.

## Co je bezpečné udělat hned

- Přidat repo prompt.
- Přidat nové read-only endpointy.
- Přidat tool registry bez ostrých write implementací.
- Přidat dry-run test endpoint.
- Rozšířit stavový panel.
- Porovnat live ElevenLabs agenta read-only, pokud jsou secrets dostupné v backendu.

## Co vyžaduje potvrzení

- Jakýkoliv `PATCH` do ElevenLabs agenta.
- Změna dashboard promptu.
- Změna first message.
- Změna modelu, TTS, voice nebo turn nastavení.
- Publikování agenta.
- Nové DB migrace.
- Ostré zápisové tools.
- Odeslání SMS nebo e-mailu.
- Ostrý pilot se skutečnými zápisy mimo již potvrzený modul Dovolená/nemoc.

## Doporučený nejbližší technický krok

1. Přidat `src/sarlota/sarlotaSystemPrompt.js`.
2. Upravit `functions/_lib/voice-sarlota.js`, aby používal prompt z tohoto souboru.
3. Přidat `functions/api/sarlota/status.js`.
4. Přidat `functions/api/sarlota/prompt.js`.
5. Přidat první verzi `functions/_lib/sarlota-tools.js`.
6. Přidat dry-run testy pro 10 scénářů.
7. Až potom řešit ElevenLabs API patch.

Tohle přesune zdroj pravdy do KSO bez rizika, že se rozbije živý hlasový agent.
