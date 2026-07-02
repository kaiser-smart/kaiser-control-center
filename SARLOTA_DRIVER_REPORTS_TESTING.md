# Šarlota × Hlášení řidičů – testování bez mikrofonu

Tento dokument popisuje lokální/mock testování Šarloty, vozidel a Hlášení řidičů. Cíl je nahradit opakované ruční hlasové testy Radimem bezpečným test runnerem v repozitáři.

## 1. Test bez mikrofonu

Základní e2e mock test:

```bash
npm run test:sarlota-driver-reports
```

Nebo bez `npm/node` v PATH:

```bash
/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sarlota-driver-reports-e2e-mock.test.mjs
```

Test volá lokální backend handlery/helpery a používá test-only env:

- `APP_ENV=test`
- `NODE_ENV=test`
- `SARLOTA_DRIVER_REPORTS_MOCK_MODE=true`
- `SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON`

Test nevolá Cloudflare, ElevenLabs dashboard, D1 produkci, Twilio ani e-mail.

## 2. Test s test agentem Smart 2

Repo rozlišuje:

| Režim | Assistant key | Env var | Produkční agent | Poznámka |
|---|---|---|---|---|
| Web Šarlota produkce | `sarlota` | `ELEVENLABS_AGENT_ID_SARLOTA` | Ano | Neměnit bez schválení. |
| Web Šarlota test | `sarlota-smart-2` | `ELEVENLABS_AGENT_ID_SARLOTA_SMART_2` | Ne | Má odpovídat agentovi `Kaiser | Šarlota Smart 2 – test`. |
| Telefonní Šarlota | mimo tento test | `VOICE_ASSISTANT_WEBHOOK_TOKEN` / `ELEVENLABS_WEBHOOK_TOKEN` | NEOVĚŘENO | Bez dashboard/API exportu nelze potvrdit, zda jde o stejný agent. |

Lokální smoke test:

```bash
npm run test:sarlota-voice-smoke
```

Ověří:

- `/hlaseni-ridicu` je povolená AI route.
- `driver-reports` i `hlaseni-ridicu` mapují `/hlaseni-ridicu`.
- Existují tool schemas: `open_module`, `get_driver_report_context`, `show_driver_vehicle_picker`, `get_driver_vehicle_picker_selection`, `validate_driver_vehicle_spz`, `create_driver_part_request`, `get_driver_reports_summary`.
- `sarlota-smart-2` používá `ELEVENLABS_AGENT_ID_SARLOTA_SMART_2` a není označená jako produkční.
- signed URL request pro Smart 2 používá `assistant=sarlota-smart-2`, ne `assistant=sarlota`.
- Prompt marker obsahuje pravidlo, že konkrétní vozidlo se smí říct jen při `vehiclesVerified: true` a právě jednom vozidle.

NEOVĚŘENO bez ElevenLabs dashboard/API secrets:

- skutečný live prompt testovacího agenta,
- Tools tab bindingy v ElevenLabs,
- live signed URL proti ElevenLabs API,
- inbound telefonní agent.

## 3. Textový chat harness

Spuštění:

```bash
npm run sarlota:chat-harness
```

Harness vypíše JSON se scénáři:

- „Otevři hlášení řidičů“
- „Jaké mám vozidlo?“
- „Moje SPZ je 1AB2345“
- „Závada je prasklé pravé zadní světlo“
- „Vytvoř hlášení“
- „Ukaž moje poslední hlášení“

Výstup ukazuje route, tool odpovědi, `vehiclesVerified`, confirmation stav, mock create a `notificationsSent:false`. Harness nepoužívá mikrofon a neposílá produkční write.

## 4. Vehicle pairing testy

Pokryto v `scripts/sarlota-driver-reports-e2e-mock.test.mjs`:

- žádné vozidlo: `vehiclesVerified:false`, žádná SPZ v hlasové odpovědi,
- jedno ověřené vozidlo: může vrátit právě jedno bezpečné vozidlo,
- více ověřených vozidel: client tool hlasu nevrátí seznam, názvy ani SPZ a doporučí picker,
- mock/fallback vozidlo: blokováno jako neověřené,
- vozidlo bez driver assignment: blokováno jako neověřené,
- SPZ existuje ve fleet: validace vrátí exact match,
- SPZ neexistuje: validace nevrátí exact match,
- uživatel bez `fleet:view`: context vrátí `K tomu nemáš oprávnění.`,
- uživatel bez `driver-reports:create`: context vrátí `K tomu nemáš oprávnění.`

## 5. Hallucination guardy

Testy selžou, pokud hlasová odpověď obsahuje:

- vymyšlené vozidlo,
- vymyšlenou SPZ,
- full VIN,
- citlivý telefon nebo poznámku v summary,
- falešné potvrzení vytvoření/předání bez backend úspěchu.

Pravidlo:

- `vehiclesVerified !== true`: Šarlota musí říct „Nevidím bezpečně přiřazené vozidlo. Nadiktuj mi prosím SPZ nebo vyber vozidlo v aplikaci.“
- `vehiclesVerified === true` a vozidla jsou dvě nebo více: Šarlota musí otevřít picker nebo požádat o SPZ, nesmí číst seznam.
- konkrétní vozidlo smí zaznít jen při právě jednom bezpečném vozidle.

## 6. Create flow v mock režimu

Mock create testuje:

- bez potvrzení vznikne `needs_confirmation`,
- `confirmed:true` bez `confirmationSource` + `confirmationId` nevytvoří hlášení,
- platné UI confirmation používá `confirmationSource:"kso-ui"` a jednorázové `confirmationId`,
- výsledek je `created_mock`,
- `notificationsSent:false`,
- odpověď neříká, že bylo něco reálně uloženo nebo odesláno.

Telefonní režim bez UI pickeru nesmí používat `kso-ui`; buď musí být oddělený jako `confirmationSource:"voice-explicit"`, nebo write zatím zůstat zakázaný. Live telefonní agent je NEOVĚŘENO bez dashboard/API kontroly.

## 7. Ověření, že se nepoužil produkční agent

Lokálně:

```bash
npm run test:sarlota-voice-smoke
```

Kontrola:

- `sarlota` má `ELEVENLABS_AGENT_ID_SARLOTA`,
- `sarlota-smart-2` má `ELEVENLABS_AGENT_ID_SARLOTA_SMART_2`,
- IDs jsou v testu různé,
- public metadata vrací jen maskované agent id,
- signed URL request pro Smart 2 obsahuje `assistant=sarlota-smart-2`.

Live ověření vyžaduje read-only dashboard/API export testovacího agenta. Bez něj se nesmí tvrdit, že Tools tab v ElevenLabs je správně.

## 8. Scénáře, které už Radim nemusí ručně opakovat

Automaticky/mock se ověřuje:

- otevření modulu Hlášení řidičů,
- načtení kontextu řidiče,
- žádné vozidlo,
- jedno ověřené vozidlo,
- více ověřených vozidel,
- mock/fallback vozidlo,
- vozidlo bez přiřazení k řidiči,
- validní SPZ,
- nevalidní/neexistující SPZ,
- chybějící `fleet:view`,
- chybějící `driver-reports:create`,
- create bez potvrzení,
- create s podvrženým potvrzením,
- create s platným UI confirmation v mock režimu,
- zákaz vymyšlení vozidla/SPZ/VIN,
- read-only poslední hlášení bez full VIN, telefonu a citlivých poznámek.

Ruční nebo live kontrola zůstává jen pro:

- skutečný ElevenLabs hlasový projev,
- live Tools tab bindingy,
- live test agent `Kaiser | Šarlota Smart 2 – test`,
- telefonního agenta,
- reálné D1/handoff/notifikace v bezpečném staging režimu.
