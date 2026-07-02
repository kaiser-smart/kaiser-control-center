# Šarlota × Hlášení řidičů – fix plán

## 1. Problém

- Hlasová Šarlota v modulu Hlášení řidičů nebyla dostatečně ověřitelná bez ručního testování Radimem.
- Párování vozidel nebylo pokryté automatickými scénáři pro žádné, jedno, více, mock ani cizí vozidlo.
- Šarlota mohla v hlasové vrstvě pracovat s více vozidly jako se seznamem pro odpověď; bezpečnější chování je říct konkrétní vozidlo jen při právě jednom ověřeném vozidle.
- Chyběl mock write flow, který ověří potvrzení vytvoření hlášení bez D1 zápisu a bez notifikací.
- Chyběl read-only hlasový tool pro scénář „Ukaž moje poslední hlášení“.
- Live ElevenLabs Tools tab a prompt testovacího agenta nejsou plně verzované v repozitáři, takže bez dashboard exportu/API secrets zůstávají NEOVĚŘENO.

## 2. Cílový stav

- Codex/test runner umí lokálně ověřit hlavní scénáře bez mikrofonu a bez Radimova ručního hlasového testu.
- Vozidla se nikdy nedomýšlí: konkrétní vozidlo se smí říct jen při `vehiclesVerified: true` a právě jednom bezpečném vozidle.
- Write akce přes hlas nejdou provést jen s `confirmed: true`; musí projít připravenou confirmation větví a validním `confirmationSource` + `confirmationId`.
- Test agent `Kaiser | Šarlota Smart 2 – test` je v repu oddělený přes assistant key `sarlota-smart-2` a env var `ELEVENLABS_AGENT_ID_SARLOTA_SMART_2`.
- Chat/test harness používá stejné backend guardy jako voice create flow a běží v mock režimu bez produkčních write akcí.

## 3. Architektura testování

```text
Codex / node script
  -> sarlota-chat-harness nebo e2e mock test
  -> ElevenLabs client tools bez mikrofonu
  -> KSO backend helpery a /api/ai/driver-reports/context handler
  -> test fleet fixture přes SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON
  -> mock driver report create bez D1 zápisu a bez notifikací
  -> assertions: vozidlo nehalucinuje, write vyžaduje potvrzení, summary je read-only
```

Testovací data jsou povolená jen mimo produkci (`APP_ENV=test`, `NODE_ENV=test` nebo `SARLOTA_DRIVER_REPORTS_MOCK_MODE=true`). Produkce fixture ignoruje.

## 4. Opravy podle priority

| Priorita | Oblast | Stav | Důvod |
|---|---|---|---|
| P0 | Zápis hlášení přes hlas | Hotovo lokálně | `confirmed:true` bez `confirmationSource` + `confirmationId` neprojde. |
| P0 | Halucinace vozidla | Hotovo lokálně | Client tool neřekne seznam ani SPZ, pokud není právě jedno bezpečně ověřené vozidlo. |
| P0 | Mock/fallback vozidla | Hotovo lokálně | Context blokuje mock/fallback vozidla pro hlas a test to ověřuje. |
| P1 | Automatické testování bez Radima | Hotovo lokálně | Přibyly e2e mock, voice smoke a chat harness scripts. |
| P1 | Test agent Smart 2 | Částečně | Repo ověřuje key/env/metadata/signed-url option; live dashboard binding zůstává NEOVĚŘENO. |
| P1 | Poslední hlášení | Hotovo lokálně | Přibyl read-only client tool `get_driver_reports_summary` nad `GET /api/driver-reports`. |
| P2 | Dokumentace režimů | Hotovo | Přibyly fix plán a testovací návod. |

## 5. Přesné změny v souborech

| Soubor | Změna | Důvod | Test |
|---|---|---|---|
| `functions/_lib/fleet-vehicles-store.js` | Test-only fleet fixture z env `SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON`. | Umožnit mock párování vozidel bez D1/produkce. | `scripts/sarlota-driver-reports-e2e-mock.test.mjs` |
| `functions/api/ai/driver-reports/context.js` | VIN se maskuje, full VIN se nevrací; message jmenuje vozidlo jen při jednom bezpečném vozidle. | Zabránit úniku VIN a halucinaci/nevhodnému čtení seznamu. | `scripts/driver-report-context.test.mjs`, e2e mock |
| `functions/api/driver-reports/license-plate.js` | SPZ ověření vyžaduje kromě `driver-reports:create` také `fleet:view`. | Ověření SPZ čte Vozový park, proto nesmí obejít fleet permission. | e2e mock |
| `src/elevenLabsClientTools.js` | Guard pro jeden hlasově vystavitelný vůz, picker pro více vozidel, read-only `get_driver_reports_summary`, UI confirmation source/id. | Hlasová vrstva nesmí domýšlet vozidlo ani obejít potvrzení. | e2e mock, voice smoke |
| `functions/_lib/voice-sarlota.js` | Confirmation nonce, `kso-ui`/`voice-explicit` source check, mock create režim, bezpečná hláška bez vozidla. | Zabránit write bez potvrzení a umožnit lokální ověření create flow. | e2e mock, chat harness |
| `src/sarlota/sarlotaSystemPrompt.js` | Zpřísněná pravidla pro vozidla, nehotové write akce a handoff. | Agent nesmí tvrdit neověřené stavy. | voice smoke |
| `functions/api/ai/elevenlabs/sarlota-status.js` | Aktualizovaný prompt marker pro nový guard. | Diagnostika má hledat aktuální pravidlo. | syntax/build |
| `scripts/driver-report-context.test.mjs` | Aktualizované očekávání pro více vozidel: nečíst seznam/SPZ. | Testuje bezpečnou hlasovou hranici. | `scripts/driver-report-context.test.mjs` |
| `scripts/sarlota-driver-reports-e2e-mock.test.mjs` | Nový e2e mock test pro vehicle pairing, SPZ, confirmation a summary. | Nahradit opakované ruční testy. | přímý script / npm alias |
| `scripts/sarlota-voice-smoke.test.mjs` | Nový smoke test pro route, tools, Smart 2 config a prompt marker. | Ověřit konfiguraci bez ElevenLabs secrets. | přímý script / npm alias |
| `scripts/sarlota-chat-harness.mjs` | Textový mock harness bez mikrofonu. | Poloautomaticky projet scénáře jako chat. | `npm run sarlota:chat-harness` |
| `package.json` | Nové npm scripts pro testy a harness. | Testování jedním příkazem v repu. | npm/node |

## 6. Jak spustit testy

Pokud je `node` v PATH:

```bash
npm run test:sarlota-driver-reports
npm run test:sarlota-voice-smoke
npm run sarlota:chat-harness
npm run test:driver-reports
npm run test:elevenlabs
npm run test:elevenlabs-assistants
npm run lint
npm run typecheck
npm run build
```

V Codex desktop prostředí, kde `node` nemusí být v PATH:

```bash
/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sarlota-driver-reports-e2e-mock.test.mjs
/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sarlota-voice-smoke.test.mjs
/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sarlota-chat-harness.mjs
```

## 7. Co zůstává neověřené

- NEOVĚŘENO: live ElevenLabs dashboard agent `Kaiser | Šarlota Smart 2 – test`, jeho aktuální prompt a Tools tab bindingy.
- NEOVĚŘENO: zda `ELEVENLABS_AGENT_ID_SARLOTA_SMART_2` v produkčním/preview Cloudflare env opravdu míří na správného test agenta.
- NEOVĚŘENO: telefonní inbound agent `Šarlota_3`, pokud je jiný než webový agent.
- NEOVĚŘENO: skutečná live signed URL generace proti ElevenLabs API bez secrets.
- NEOVĚŘENO: reálný D1 write/handoff/notifikace; lokální test používá mock create a nic neposílá.
