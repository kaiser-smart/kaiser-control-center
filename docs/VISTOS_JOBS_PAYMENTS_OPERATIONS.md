# Předání a provoz — Zakázky / úhrady Vistos

## Stav předání

Vývojová větev `codex/vistos-jobs-payments`, základ `c37cd96b3313ad5d8678e1018f76bf1b9d98f72e`, verze balíku 0.1.830. Přesný výsledný SHA je v PR. **NENASAZENO; migrace nebyly spuštěny v cloudu, žádný nový runner ani účetní writer nebyl aktivován.** Ověřená produkční verze se z tohoto build čísla neodvozuje.

Vzdálené větve s názvem payment zahrnují existující KB import, účetní párování a čtecí audit. Kontrola main nenašla druhou implementaci Create/Save/Remove Payment. To není důkaz, že Money nebo jiný systém v provozu nezapisuje. Výhradní zapisovatel musí být doložen samostatně pro firmu, bankovní účet, zdroj a období.

## Datové hranice

- ARCHIVE: zdrojové entity, checkpointy, porovnání ID/hashů, historie GPS a jízd, verze časových důkazů, fronta doručení auditu.
- CORE: explicitní firemní přístupy, verzovaný ověřený kontrakt, potvrzení alokací, příkazy a zámky, společný limit požadavků, preference a neaktivní pravidla.
- AUDIT: běhy a události; archivní/frontové události se doručují idempotentně. Domény nejsou předstíranou mezidatabázovou transakcí.
- Nové přesné zdrojové zůstatky jsou dostupné v Úhrady → Účetní stav faktur a odkazem z existujícího detailu. Starý lokální ledger, rating a jeho historická logika bankovního párování nejsou přepsány na nový účetní model. Nový writer z nich nesmí přebírat autoritativní zůstatek. Před případným úplným přepnutím starého dashboardu je nutná samostatná migrace a porovnání živých dat.
- Import může hlásit `partial` nebo `compared`; offsetový průchod nikdy sám nepotvrdí úplnou historii. Porovnání má počty added/changed/missing, chybějící ID znamená „nepozorováno“, nikoli smazání/storno. Delta má vlastní checkpoint a hodinový překryv.
- Neznámý nebo zakázaný údaj není nula. Přílohy bez ověřeného rozhraní jsou nedostupné; položky nad 100 v detailu výslovně označeny jako částečné.
- Časové důkazy vyžadují ověřený termín, umístění, soukromí jízd a identitu vozidla po celý interval. Samotný popisek koncového místa jízdy se nepovažuje za ověřenou vazbu. Zůstává konzervativně nedostupný, dokud není doložen identifikátor místa. Chybějící odjezd/mezeru nelze uzavřít pracovním časem; žádná mzdová metrika.

## Podmínky budoucího nasazení

Toto je postup pro navazující schválené nasazení, nikoli záznam provedeného nasazení.

1. Správce prostředí ověří D1 kapacitu všech dotčených domén, zálohu a produkční guard. `D1_CAPACITY_BLOCK_BULK_WRITES` zůstává true; tento PR jej nevypíná. Nejdříve použít povolené testovací prostředí.
2. Použít existující migrační postup po doménách: ARCHIVE `0003_vistos_jobs_payments.sql`, CORE `0006_vistos_integration_controls.sql` a `0007_vistos_module_rules.sql`, AUDIT `0005_vistos_jobs_payments_audit.sql`. Pět nových GPS sloupců vyžaduje migraci před novým collectorem. Všechny předcházející migrace musí být aplikované.
3. Monitor zachovává limit 49 rout na běh. Build má 52 rout, proto nový manifest schema 2 rozděluje kontroly do dvou hodinových dávek. **Nejdříve nasadit kompatibilní self-repair monitor worker, potom Pages s manifestem schema 2.** Starý worker jej neumí; neobcházet limit zvýšením počtu externích requestů.
4. Nasadit přes existující schválený build/production deploy postup se všemi novými přepínači false. Žádný přímý upload jako náhrada deploy guardu. Migrace sama vloží tři pravidla jako inactive.
5. Omezeným přihlášeným čtením doplnit kontrakt v `vistos_integration_contracts`: skutečný `apiOrigin`, stabilní installation, verzi, firmy, seznam/detail, pole a jejich význam, řazení Id, Modified filtr a časové zóny. `VISTOS_INSTALLATION_ID` a origin `VISTOS_API_BASE_URL` musí přesně odpovídat kontraktu. K žádnému kontraktu nelze mlčky použít přihlašovací údaje jiné instalace.
6. Přidělit výslovně oprávnění stávajícím permission mechanismem a odpovídající řádky `vistos_company_access`. Admin automaticky nezískává finance, osobní údaje ani nový writer. Doplnit schválený `VISTOS_SHARED_REQUESTS_PER_MINUTE` ve všech používajících runnerech; nové čtení/zápisy bez společného budgetu odmítnou provoz.
7. Čtení spouštět až s důkazem kapacity a kontraktu: `VISTOS_JOBS_RUNNER_ENABLED`, `VISTOS_READ_SYNC_ENABLED` a pravidlo `jobs-vistos-read`. Tracking nezávisle vyžaduje `VISTOS_JOB_EXECUTION_ENABLED` a `jobs-tcars-evidence`, platné historické aliasy a geofence. Zkontrolovat audit, uložené checkpointy a UI po zavřeném prohlížeči.
8. Writer až po testech na povolených testovacích fakturách: přesný decimal wire format, template, identita firmy/měny, Create/Save/Remove, unikátní Ext_ID lookup, úplný seznam Payment pro fakturu, částečné a vícenásobné úhrady, přepočet a odstranění poslední platby. Odděleně doložit koordinaci s Money. Potom konkrétní potvrzené alokace, `receivables/vistos_write`, pravidlo `receivables-vistos-writer` a `VISTOS_PAYMENT_WRITE_ENABLED`. Pouhý souhlas nenahradí tyto důkazy.

## Rollback a nejasné účetní výsledky

Nejdříve vypnout `VISTOS_PAYMENT_WRITE_ENABLED` a pravidlo nového odesílání. Runner ponechat pro ověřování `sending`, `verifying`, `outcome_unknown`, `recalculation_pending`; vypnutí writeru ověřování nezastaví. Nepřepnout nejistý příkaz zpět na ready a nevytvářet druhou alokaci jako náhradu.

Po timeoutu Create/Save/Remove se provádí pouze lookup/readback. Chybějící záznam sám není důkaz zrušení; potřebná je ověřená sémantika NotFound a účetní přepočet. Zámky finančních zdrojů nevyprší automaticky. Opuštěný zámek nebo rezervace po chybě opravy vyžaduje auditovanou kontrolu uloženého příkazu, skutečných Payment a obou dotčených faktur, nikoli slepé smazání zámku. Vlastní oprava je samostatný příkaz s očekávaným fingerprintem; cizí Payment nelze touto cestou měnit.

Frontend lze vrátit na předchozí schválený build, ale nemažte outbox, alokace, audit, zdrojová data ani nové sloupce. Návrat frontendu nevrací účetní operace ve Vistosu. Čtecí import a tracking lze zastavit nezávisle. Neměnit ostatní runnery ani jejich oprávnění.

## Neuzavřené provozní podmínky

| Podmínka | Odpovědná strana | Konkrétní potřebný důkaz |
|---|---|---|
| Živé čtení nyní nedostupné: endpoint v aktuální browser relaci vrátil `Nepřihlášeno.` | Správa přístupu Smart/Vistos + implementátor | Přihlášené povolené čtení schema/list/detail; skutečné vzorky požadovaných stavů a vazeb |
| Kapacita a migrace D1 NEOVĚŘENO | Správce Cloudflare | Aktuální kapacita, záloha, migrační/readback výstup po doménách |
| Výhradní účetní zapisovatel NEOVĚŘENO | Účetní správce Money/Vistos | Potvrzení konkrétní firmy, bankovního zdroje a období bez dvojího zápisu |
| Účetní API kontrakt NEOVĚŘENO | Správce Vistos + implementátor | Povolené testovací doklady a výsledky Create/Save/Remove/přepočtu; žádné skutečné faktury jako test |
| Historické identity, lokality a T-Cars práva NEOVĚŘENO | Správa vozidel/T-Cars + implementátor | Platné aliasy, intervaly, soukromí, zóna a doložený geofence; nikoli odhad podle řidiče |

Nejbližší krok je review tohoto PR a autorizovaný čtecí audit pro doplnění kontraktu. Aktivace se z tohoto předání neodvozuje. Načteno 0 živých řádků, zápisů do Vistosu 0, živě neověřeno 144/144 položek registru. Není doloženo procento automatického zpracování.
