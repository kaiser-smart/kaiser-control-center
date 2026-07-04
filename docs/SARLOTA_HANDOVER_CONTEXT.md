# Šarlota Smart 2 × Hlášení řidičů – předávací kontext

## 1. Aktuální stav

- Cílem práce bylo odstranit závislost na ručním testování Radimem a připravit ověřitelný režim pro Šarlotu v modulu Hlášení řidičů.
- Řešilo se hlavně to, aby Šarlota nehalucinovala vozidla, SPZ, VIN, vytvoření hlášení ani předání dál.
- Hlavní selhání není jen prompt v ElevenLabs. Hlavní selhání je runtime vazba volajícího na jeho reálnou KSO identitu a přiřazená vozidla.
- Klíčový problém je tok:
  `volající / telefon / KSO user_id -> zaměstnanec / řidič -> přiřazená vozidla -> get_driver_report_context -> hlasová odpověď / picker / SPZ fallback`.
- Samotný ElevenLabs preview nestačí, protože nemá reálné caller ID, telefon, KSO session ani ověřený `user_id`. Umí ověřit prompt/tool selection, ale ne reálné mapování volajícího na vozidla.

## 2. Commity

- `cd96697 fix(sarlota): add driver reports voice test harness and vehicle guards`
- `687d9de chore(sarlota): add Smart 2 live diagnostics`

## 3. Co bylo změněno

- Test harnessy: přidané mock/e2e testy pro hlasový flow Hlášení řidičů bez ručního testování Radimem.
- Voice smoke test: přidaný bezpečný smoke test pro Šarlotu a Smart 2 konfiguraci.
- Chat harness: přidaný textový režim pro testování scénářů bez mikrofonu.
- Smart 2 diagnostika: přidaný read-only diagnostický skript a dokumentace pro test agenta.
- Vehicle pairing guardy: zpřísněné párování vozidel, blokace mock/fallback/cizích vozidel a bezpečné ověřování SPZ proti fleet zdroji.
- Hallucination guardy: Šarlota nesmí tvrdit, že našla vozidlo, SPZ, VIN nebo vytvořila hlášení bez backend potvrzení.
- Confirmation guardy: vytvoření hlášení přes voice flow nesmí projít bez potvrzovacího režimu.
- Dokumentace: doplněné auditní, testovací, fixační a diagnostické dokumenty.

## 4. Co funguje lokálně

V rámci verifikační fáze byly ověřené tyto bezpečné lokální testy / skripty:

- `scripts/sarlota-driver-reports-e2e-mock.test.mjs`
- `scripts/sarlota-voice-smoke.test.mjs`
- `scripts/sarlota-chat-harness.mjs`
- `scripts/sarlota-smart2-diagnostics.mjs`
- `scripts/driver-report-context.test.mjs`
- `scripts/elevenlabs-signed-url-options.test.mjs`
- `scripts/elevenlabs-assistant-config.test.mjs`
- `scripts/build.mjs`
- `git diff --check`

Poznámka: tyto testy ověřují repo/mock režim a guardy. Neověřují samy o sobě reálné caller ID z ElevenLabs telefonního/runtime prostředí.

## 5. ElevenLabs Smart 2 live stav

- Agent: `Kaiser | Šarlota Smart 2 – test`
- Agent ID maskovaně: `agent_0101...z6zfw7`
- Model: `Qwen3.5-397B-A17B`
- Voice: `Eric - Smooth, Trustworthy`
- Tools tab byl doplněn.
- `get_driver_reports_summary` byl doplněn.
- Produkční agent nebyl změněn.
- KSO deploy nebyl proveden.
- Smart 2 test agent byl použit jen pro testovací ověření, ne jako produkční změna.

## 6. Hlavní nevyřešený problém

Hlavní problém není jen prompt. Hlavní problém je ověřit reálný runtime flow:

`caller ID / telefon / KSO user_id -> employee / driver mapping -> přiřazená vozidla -> get_driver_report_context -> hlasová odpověď / picker / SPZ fallback`

ElevenLabs preview samo o sobě nestačí, protože neumí reálně simulovat volajícího. Preview může ukázat, zda agent volí tool, ale neprokáže, že backend správně rozpozná konkrétního volajícího a jeho vozidla.

## 7. Co musí nový vývojář udělat jako první

1. Netestovat pouze v ElevenLabs preview.
2. Ověřit caller identity mapping.
3. Vytvořit nebo použít runtime harness pro:
   - caller phone number
   - KSO `user_id`
   - employee id
   - driver assignment
   - fleet vehicles
   - permissions
4. Ověřit scénáře:
   - volající má jedno vozidlo
   - volající má více vozidel
   - volající nemá vozidlo
   - volající není namapovaný na zaměstnance
   - volající nemá `fleet:view`
   - volající nadiktuje SPZ

## 8. Správné chování Šarloty

- Pro dotazy na vozidla volat `get_driver_report_context`.
- Pro poslední hlášení volat `get_driver_reports_summary`.
- Nikdy nedomýšlet vozidlo.
- Nikdy nedomýšlet SPZ.
- Nikdy nedomýšlet VIN.
- Nikdy nevytvářet hlášení bez potvrzení.
- Při více vozidlech nevybírat sama.
- Při žádném vozidle požádat o SPZ.
- Při chybě oprávnění říct: „K tomu nemáš oprávnění.“

## 9. Co se nesmí dělat

- Žádný deploy bez schválení.
- Neměnit produkčního agenta.
- Neměnit model/voice bez schválení.
- Neklikat Publish/Deploy produkce.
- Neposílat SMS/e-mail.
- Nevolat produkční write endpointy.
- Nemíchat starou lokální kopii `docs/ELEVENLABS_SMART_POMOCNIK (kopie).md` do repo jako zdroj pravdy.
- Nesahat na `functions/api/ai/elevenlabs/sarlota-prompt-sync.js` bez samostatného schválení.

## 10. Aktuální git stav

- Původní zdrojový stav před předáním byl na větvi `codex/partslink24-kso-phase1`.
- Relevantní commity z původního předání:
  - `687d9de chore(sarlota): add Smart 2 live diagnostics`
  - `cd96697 fix(sarlota): add driver reports voice test harness and vehicle guards`
- Dokument byl následně uklizen do `docs/SARLOTA_HANDOVER_CONTEXT.md`, aby nezůstal jako volný soubor v rootu projektu.
- Lokální soubor `docs/ELEVENLABS_SMART_POMOCNIK (kopie).md` je starší kopie existující dokumentace a nemá se commitovat jako nový zdroj pravdy.

Historický `git status --short` před vytvořením původního handover souboru:

```text
 M functions/api/ai/elevenlabs/sarlota-prompt-sync.js
?? "docs/ELEVENLABS_SMART_POMOCNIK (kopie).md"
```

Na starší cizí změny se nesahá.

## 11. Přesný další doporučený krok

Další vývojář má převzít práci od runtime caller identity testu. Ne od dalšího ladění promptu v ElevenLabs preview.

## Stav k předání

- Hotové: repo guardy, mock/e2e testy, voice smoke test, chat harness, Smart 2 diagnostika, Smart 2 test agent Tools tab včetně `get_driver_reports_summary`, základní dokumentace a potvrzení, že produkční agent nebyl měněn.
- Není hotové: realistický runtime harness, který prokáže `caller ID / telefon / KSO user_id -> přiřazená vozidla` přes KSO backend.
- Blokátor: bez caller identity harnessu nelze tvrdit, že Hlasová Šarlota spolehlivě načte vozidla konkrétního volajícího.
- Doporučení: nejdřív doplnit a spustit runtime/mock test caller identity mappingu, pak teprve řešit PR/push/deploy review.
