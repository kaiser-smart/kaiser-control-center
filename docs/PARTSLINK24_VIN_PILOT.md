# partslink24 VIN pilot

Stav: Read-only pilot / AI Boost pilot.

Tento dokument popisuje pilotní ověření vyhledání náhradních dílů podle VIN přes partslink24 pro modul Hlášení řidičů. Nejde o běžné API napojení. partslink24 nemá v projektu dostupné API, proto se pilot ověřuje přes server-side browser automation.

## Rozsah vozidel

Pilot partslink24 je povolený jen pro osobní vozidla.

Nákladní vozidla jsou mimo tento pilot. Pro nákladní auta je potřeba samostatné ověřené řešení, aby KSO nevytvářelo dojem, že partslink24 umí pokrýt i nákladní workflow.

Runner proto vyžaduje typ vozidla. Pokud typ chybí nebo není osobní, vrátí bezpečný stav `blocked` a nespustí přihlášení do partslink24.

## Co pilot smí dělat

- Přihlásit se do partslink24.
- Vyhledat VIN na úvodní stránce po přihlášení.
- Vrátit stav, URL a krátký redigovaný textový náhled výsledku.
- Označit výsledek jako vyžadující ruční kontrolu.

## Co pilot nesmí dělat

- Objednat náhradní díl.
- Potvrdit jakoukoliv placenou nebo provozní akci.
- Měnit data v partslink24.
- Automaticky číst e-mailovou schránku kvůli 2FA kódu.
- Automaticky zadávat 2FA kód.
- Ukládat heslo, cookies nebo session tokeny do repozitáře, UI, logu nebo artefaktu.
- Pořizovat screenshoty s přihlášenými údaji bez samostatného potvrzení.
- Tvrdit, že je integrace produkčně hotová.

## Secrets

Navržené secrets:

```text
PARTSLINK24_COMPANY_ID
PARTSLINK24_USERNAME
PARTSLINK24_PASSWORD
```

Pilotní hodnoty:

```text
PARTSLINK24_COMPANY_ID=cz-879576
PARTSLINK24_USERNAME=admin
PARTSLINK24_PASSWORD=vloží Radim bezpečně mimo chat a mimo repozitář
```

Heslo se nesmí zadat do kódu, chatu, workflow inputu ani logu.

## Spuštění Fáze 0

Ruční GitHub Actions workflow:

```text
.github/workflows/partslink24-vin-pilot.yml
```

Výchozí režim je `dry_run=true`, tedy bez přihlášení do partslink24. Skutečné přihlášování se spustí jen pokud jsou současně splněné podmínky:

```text
dry_run=false
allow_live_login=true
vehicle_kind=osobni
PARTSLINK24_COMPANY_ID/USERNAME/PASSWORD jsou nastavené jako GitHub secrets
```

Pozor: hodnota zadaná do `workflow_dispatch` inputu může být vidět v GitHub UI běhu. Pro ostrý VIN používej tento režim až po schválení pilotního testu; produkční Fáze 1 má přijímat VIN přes backend KSO, ne přes ručně vyplňovaný workflow input.

## 2FA přes e-mail

Pokud partslink24 po přihlášení vyžádá 2FA / ověřovací kód z e-mailu, runner musí skončit bezpečným stavem:

```text
status=manual_action_required
errorCode=PARTSLINK24_2FA_REQUIRED
```

Runner nesmí číst e-mail, ukládat 2FA kód, zadávat 2FA kód ani ukládat session cookies bez samostatně schváleného řešení.

Dokud nebude 2FA postup ověřený, live pilot nesmí tvrdit, že partslink24 vyhledání funguje stabilně.

## Bezpečná diagnostika live pilotu

Pokud live pilot nenajde login formulář, login tlačítko nebo VIN pole, vrátí redigovanou diagnostiku:

- title a URL stránky,
- krátký textový náhled stránky,
- počet frame/iframe,
- metadata viditelných ovládacích prvků.

Diagnostika nesmí obsahovat hodnoty polí, heslo, cookies, session tokeny, screenshoty ani celé HTML stránky. Hodnoty `PARTSLINK24_COMPANY_ID`, `PARTSLINK24_USERNAME`, `PARTSLINK24_PASSWORD` a VIN se před výpisem redigují.

partslink24 může před loginem zobrazit mezistránku `Attention - Please read carefully` s odkazem `Reload`. Runner ji smí v read-only pilotu bezpečně překročit přes `Reload`, maximálně dvakrát. Pokud po tom login formulář stále není dostupný, běh skončí chybou `PARTSLINK24_RELOAD_GATE_NOT_RESOLVED` nebo `PARTSLINK24_LOGIN_FORM_NOT_FOUND`.

Lokální preflight bez přihlášení:

```bash
PARTSLINK24_COMPANY_ID=cz-879576 \
PARTSLINK24_USERNAME=admin \
PARTSLINK24_PASSWORD=placeholder \
PARTSLINK24_TEST_VIN=WDB12345678901234 \
PARTSLINK24_TEST_VEHICLE_KIND=osobni \
PARTSLINK24_PILOT_DRY_RUN=true \
node scripts/partslink24_vin_pilot.mjs
```

## Doporučená architektura po ověření

Fáze 1 má být až po ověřeném Fáze 0 loginu a vyhledání:

- Frontend v Hlášení řidičů zobrazí sekci `Náhradní díly podle VIN`.
- Sekce se zobrazí jen pro osobní vozidlo, nebo jasně řekne, že nákladní vozidla jsou mimo partslink24 pilot.
- Frontend nezná heslo a nevolá partslink24 přímo.
- Backend endpoint přijme `vehicleId` nebo `requestId`, ověří přihlášení a oprávnění.
- Backend ověří VIN proti Vozovému parku.
- Backend ověří, že vozidlo je osobní.
- Backend založí auditní záznam a spustí server-side runner.
- Runner vrátí stav `Nalezeno`, `Vyžaduje ruční kontrolu` nebo `Chyba`.

Navržený endpoint:

```text
POST /api/driver-reports/partslink24/search-by-vin
```

Navržené oprávnění pro ostrou fázi:

```text
driver-reports:parts-search
```

Protože aktuální permission matrix používá pevný seznam akcí `view/create/edit/delete/approve/export/manage`, doporučený bezpečný pilot může dočasně použít `driver-reports:manage`. Nové právo `parts-search` vyžaduje samostatně potvrzený zásah do oprávnění.

## Doporučený běhový prostor

Cloudflare Pages Function není vhodné místo pro běžný Playwright browser. Možné varianty:

1. GitHub Actions `workflow_dispatch` pro Fázi 0.
2. Samostatný Cloudflare Browser Run Worker pro Fázi 1.
3. Externí Playwright runner mimo Cloudflare Pages/Workers, pokud partslink24 nebude stabilní v Cloudflare Browser Run.

Cloudflare Browser Run podporuje headless browser sessions přes Puppeteer/Playwright/CDP, ale má limity běhu a souběžnosti. Pilot proto nesmí být označený jako produkčně hotový, dokud se reálně neověří stabilita loginu, session a vyhledání.

## Auditní model pro Fázi 1

Doporučená tabulka až po samostatném potvrzení migrace:

```text
driver_partslink24_lookup_runs
- id
- driver_report_id
- vehicle_id
- requested_by_user_id
- vin_masked
- status
- error_code
- provider
- runner
- started_at
- finished_at
- duration_ms
- result_url
- result_summary
- created_at
```

Do auditu neukládat celé VIN, heslo, cookies, session tokeny ani HTML stránky.

## VIN ochrana

VIN v logu maskovat jako:

```text
WDB**********1234
```

Celý VIN smí být použit jen uvnitř server-side runneru pro vyhledání.

## Spam a duplicity

Pro Fázi 1 doporučeno:

- lock podle `vehicleId + vin`,
- minimálně 10 minut cooldown na stejné VIN,
- timeout běhu,
- žádný nekonečný retry,
- jasný stav `Vyžaduje ruční kontrolu`, pokud partslink24 změní UI nebo blokuje automatizaci.

## Licence

partslink24 licence je pilotní měsíční licence. Pokud se pilot osvědčí, je potřeba obnovit platbu.

Nepřidávat žádnou automatickou platbu.
