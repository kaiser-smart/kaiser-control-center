# Předání a provoz — Zakázky / úhrady Vistos

## Stav předání

Původní implementace `codex/vistos-jobs-payments` vycházela z `c37cd96b3313ad5d8678e1018f76bf1b9d98f72e`. Při autorizovaném nasazení 25. 10. 2026 byla zjištěna novější běžící produkce 0.1.844 / `b5e5a1c53a56f7e26a8225fa1e513f9cc35b0398`. Integrační větev ji zachovává a přidává Zakázky ve verzi 0.1.845. Přesný výsledný SHA a skutečný stav Pages jsou v PR; číslo balíku samo nepotvrzuje nasazení.

Cloudové migrace ARCHIVE 0003, CORE 0006/0007 a AUDIT 0005 byly aplikovány přes přihlášenou D1 konzoli a nezávisle přečteny. ARCHIVE má devět nových tabulek a pět GPS sloupců, CORE devět tabulek a tři pravidla `inactive`, AUDIT dvě tabulky a index historie. Kapacita před změnou: CORE 266,92 MB, ARCHIVE 2,36 GB, AUDIT 1,23 GB. Původní legacy databáze má 10 GB; globální kapacitní ochrana zůstává zapnutá.

Kompatibilní monitor je nasazen jako `9a32e44c-9df6-48db-8ca1-a8c5aa9afde9`; readback potvrdil zachování všech původních bindingů a čtyři nové přepínače `false`. Předchozí worker: `20e87053-71df-452f-98bf-4b8ff3c119fc`. Nový import, časové obohacení ani účetní writer nebyly aktivovány.

Body obnovy před migracemi (pouze evidence, ne pokyn k obnově celé živé DB): ARCHIVE `00000a57-000000a0-0000510f-b1010e17fc0a234d7aaa68bb245772ee`, CORE `0000066a-00000466-0000510f-cb9d5744bb57c14426fbb52e1bc99c64`, AUDIT `00000a5e-0000009a-0000510f-12ceb868608686e9b46bcb784c77d0dd`. Pro frontend je ověřený předchozí deployment 0.1.844 `00e2a589-6ad4-4840-bd6e-7b9873d20dfe`.

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
| Schéma a aktuální kapacita ověřeny; rozpočet hromadného importu dosud ne | Správce Cloudflare | Před aktivací importu doložit objem, retenci a kapacitu; globální ochranu nevypínat |
| Výhradní účetní zapisovatel NEOVĚŘENO | Účetní správce Money/Vistos | Potvrzení konkrétní firmy, bankovního zdroje a období bez dvojího zápisu |
| Účetní API kontrakt NEOVĚŘENO | Správce Vistos + implementátor | Povolené testovací doklady a výsledky Create/Save/Remove/přepočtu; žádné skutečné faktury jako test |
| Historické identity, lokality a T-Cars práva NEOVĚŘENO | Správa vozidel/T-Cars + implementátor | Platné aliasy, intervaly, soukromí, zóna a doložený geofence; nikoli odhad podle řidiče |

Nejbližší krok je review tohoto PR a autorizovaný čtecí audit pro doplnění kontraktu. Aktivace se z tohoto předání neodvozuje. Načteno 0 živých řádků, zápisů do Vistosu 0, živě neověřeno 144/144 položek registru. Není doloženo procento automatického zpracování.

## Dokončení Zakázek — ověřování 25. 10. 2026

Aktuální pokyn uživatele omezuje práci na Zakázky. Faktury a přijaté platby se nyní neaktivují ani nemění.

Produkční čtecí audit verze 0.1.848 ověřil `SortOrder: Id asc` na prvních dvou stránkách a opakování první stránky: 183131 hlaviček hlášených zdrojem. Jde o zdrojový počet, nikoli dokončený import. Readiness 2026-10-25T16:28:45Z: CORE 267251712 B, ARCHIVE 2361659392 B, AUDIT 1238274048 B, žádný instalační kontrakt, grant ani importovaný záznam. Nové tři automatizační pravidla jsou neaktivní.

Původní úplná obálka polí měla ve vzorku hlaviček přibližně 28,7 KB na řádek při zdrojovém JSON okolo 3,4 KB. Nový formát `fields_json` v1 sdílí opakovanou dostupnost, původ a čas pozorování uvnitř jednoho záznamu. Hodnoty, explicitní null/prázdná hodnota/nula a nepřítomnost hodnoty zůstávají rozlišené. Třída zpřístupnění je uložená, nikoli odvozovaná při čtení z novějšího registru. Staré záznamy zůstávají čitelné. Živou velikost nového formátu měří diagnostika `compactFieldBytes`; kapacitní odhad musí zahrnout také detaily, položky, indexy a audit.

`detailOnImport` je volba ověřeného kontraktu: nejvýše 20 hlaviček v dávce a detail pro každou, sdílené přihlášení/rozpočet, ověřené ID, deadline 90 s. Selhání detailu neposune checkpoint ani neuloží část stránky. `inheritCompanyFromParent` pro ServiceListItem přebírá pouze ověřenou firmu hlavičky se shodnou instalací a zdrojovým ID; chybějící rodič ponechá položku bez firemního přístupu. `AssignedToCompany_FK` se nesmí použít jako firma podle názvu: existující metadata smluv jej popisují jako přiřazeného uživatele. Význam hlaviček je třeba doložit metadaty DbObject/DbColumn a zdrojovým detailem.

Samostatný přepínač `VISTOS_JOBS_BULK_IMPORT_APPROVED` umožňuje pouze ServiceList/ServiceListItem s vlastním kapacitním plánem. Není to opt-in faktur. Globální stop zůstává pro ostatní toky. Každá dávka před čtením a před zápisem měří všechny tři cílové domény; vyžaduje `capacityEvidence.estimateEvidenceId`, `approvedAt` a `domains.{core,archive,audit}.maxSizeBytes` nejvýše 85 % stávajícího limitu. Chybějící měření, překročení stropu nebo chybějící doklad import zastaví. Přepínač není tímto vydáním zapnutý.

Zbývá živě ověřit firemní a časový kontrakt, velikost detailů/položek, přidělit schválený firemní rozsah, provést obnovitelný import a ověřit nezávislé plánované běhy a UI se skutečnými daty. Modul není dosud předaný jako plně funkční.

### Rozlišení chyby načítání a prázdného výsledku

Chyba oprávnění nebo načtení Zakázek zobrazuje konkrétní důvod a bezpečné opakování GET. Nepředstírá prázdný seznam, nulové počty ani potvrzenou historii. Chyba po změně filtru odstraní staré výsledky, které neodpovídají novému dotazu. Zavření detailu vrací focus na skutečné viditelné tlačítko, včetně mobilních karet.

Izolovaný WebKit test `scripts/vistos-jobs-browser.test.mjs` ověřuje 390 a 1440 px: 403 vs. prázdný úspěšný výsledek, opakované načtení, chybu nového filtru, opožděnou odpověď, bezpečné zobrazení zdrojového HTML jako textu, Escape a návrat focusu, vodorovné přetékání. Používá syntetická data a blokuje externí síť; nedokazuje produkční import ani fyzický iPhone. Spuštění přes `npm run test:vistos-jobs-browser`, s dostupným Playwright/WebKit; alternativní modul/binárky lze určit `PLAYWRIGHT_MODULE_PATH` a `PLAYWRIGHT_BROWSERS_PATH`.

## Živé mapování 2026-10-25 / 0.1.852

Přihlášený read-audit (20:31 UTC) potvrzuje ServiceList 183131 a ServiceListItem 403480; oba stabilní vzorky Id asc. Metadata DbObject 137/138 a všechny rodiče DbColumn byly ověřeny. Issuer_FK odkazuje na dbo.Directory (49), AssignedToCompany_FK na crm.User (35), Vozidlo_FK na dbo.Vehicle (172). Auto_FK a AllocatedVehicle odkazují na crm.Enumeration (11); jejich ID nelze slučovat s ID vozidel.

Nezávislé čtení uživatelského rozhraní Vistos 3.3.9.10, ServiceList 181458, potvrdilo výstavce Company/1, Kaiser servis, IČO 26274906; datum realizace 23.9.2026; Začátek/Konec 23.9.2026 13:03–14:03; vozidlo Vehicle/113. Vistos UI i API ukazují stejné lokální hodnoty. To samo nedokazuje časové pásmo ani skutečnou dobu práce. Status 14525 je v tomto záznamu „Vyfakturovaná“; není bez dalšího důkazem GPS provedení. Produkční zdroj nebyl změněn.

Readiness 20:42 UTC: CORE 267366400 B, ARCHIVE 2361745408 B, AUDIT 1240596480 B. Kontrakty, granty, zdrojové záznamy a checkpointy stále prázdné. Pravidla neaktivní. Kompaktní listové vzorky: hlavičky 5749–5843 B, položky 3472–3574 B. Odhad detailů, ověření filtrů a aktivace stále zbývají.

Audit podporuje omezené čtení podle Modified_From/To (max. 92 dní, doslovné lokální časy) nebo jedné rodičovské zakázky ServiceList_FK. Každý vrácený řádek je kontrolován proti filtru. Prázdná odpověď ani správný vzorek se neoznačují za úplný důkaz filtru. Přibyla velikost sloučeného detailu. Opraven chybějící import časového resolveru při průchodu sousedními zakázkami; integrační test nyní projde skutečnou větví obohacení v izolované databázi.
