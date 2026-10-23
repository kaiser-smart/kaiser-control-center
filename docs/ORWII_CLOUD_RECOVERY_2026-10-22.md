# Cloudové obnovení ORWII — ověřeno 22. 10. 2026

## Skutečně nasazené a nezávisle ověřené

Práce proběhla pouze v GitHubu, GitHub Actions a Cloudflare. Nevznikla lokální kopie zdrojů, databází, sestavení ani testovacího prostředí. Trasy svozu jsou mimo rozsah.

Příčina výpadku: běh orwii-fuel-sync-run-4854d138-7056-4713-b8b7-cc0f52374efe z 16. 9. 2026 14:17:35 UTC zůstal ve stavu running; další plánované běhy jej respektovaly a vynechávaly synchronizaci. Oprava bezpečně ukončuje opuštěné běhy až po 30 minutách, zachovává audit a neposouvá potvrzené období při chybě.

Nasazené změny: [PR 234](https://github.com/kaiser-smart/kaiser-control-center/pull/234), [235](https://github.com/kaiser-smart/kaiser-control-center/pull/235), [236](https://github.com/kaiser-smart/kaiser-control-center/pull/236), [237](https://github.com/kaiser-smart/kaiser-control-center/pull/237). Poslední kód workeru pochází z 1801a894876a03abf5883228a2deb1b9b5de8c19; GitHub Actions run 39790265150 prošel testy i sestavením. Cloudflare nasazení kódu 4bd2db09 bylo potvrzené jako Active; následovaly změny pouze konfigurace.

Obnova používá potvrzený checkpoint, omezená časová okna, dělení zaplněných dávek, opakovatelné upserty podle ID a kontrolu přesného obsahu D1 před potvrzením období. Překročení doložitelného limitu selže, nikdy tiše neořízne zdroj. Cloudové testy pokrývají přes 2 000 transakcí, dlouhý výpadek, přerušený druhý zápis, opakování, souběh a chybějící/přebývající/změněná data.

## Důkaz úplnosti

Původní stav ARCHIVE: 1 224 transakcí, 106 845,39 l, nejnovější 16. 9. 2026 13:34:41 UTC. Po obnově: 1 695 transakcí, 149 087,71 l, nejnovější 22. 10. 2026 13:07:03 UTC. Přibylo 471 ID; v celé firemní evidenci je nyní podle stávajícího párování 851 přiřazených a 844 nepřiřazených transakcí. Tato čísla nejsou dokončeným sjednocením identit.

Samostatný plánovaný běh znovu načetl ORWII pro celé období 16. 9.–22. 10. a porovnal jej s nezávislým čtením ARCHIVE. V AUDIT.audit_events je šest úspěšných záznamů event_type=orwii_fuel_source_verification, phase=historical, s shodným SHA-256 normalizovaného obsahu ID, časů, litrů a cen.

| Období v UTC, včetně obou dnů | ORWII / D1 počet | ORWII / D1 litry | ID a hodnoty |
|---|---:|---:|---|
| 16.–22. 9. | 101 / 101 | 8 354,96 / 8 354,96 | shoda |
| 23.–29. 9. | 87 / 87 | 8 778,60 / 8 778,60 | shoda |
| 30. 9.–6. 10. | 76 / 76 | 6 681,74 / 6 681,74 | shoda |
| 7.–13. 10. | 103 / 103 | 8 117,46 / 8 117,46 | shoda |
| 14.–20. 10. | 88 / 88 | 8 648,29 / 8 648,29 | shoda |
| 21.–22. 10. | 35 / 35 | 3 371,50 / 3 371,50 | shoda |
| Celkem | 490 / 490 | 43 952,55 / 43 952,55 | shoda |

Souhrn 490 a 43 952,55 l byl znovu přečten přímo z ARCHIVE. Produkční GET /api/fleet/orwii-fuel/analytics?period=12m nezávisle potvrdil 1 695 transakcí a 149 087,71 l. Více následných plánovaných cloudových běhů proběhlo bez otevření aplikace; například 13:15 a 13:17 UTC a další dávky až do potvrzení období k dnešku v 13:46 UTC.

Po úspěšném ověření je ORWII_RECOVERY_MODE=disabled a dočasný pětiminutový cron odstraněn; nové načtení konfigurace potvrdilo pouze pravidelný hodinový běh v minutě 17. ORWII_VERIFY_FROM=2026-09-16 a ORWII_VERIFY_TO=2026-10-22 jsou neaktivní kontrolní parametry, protože historické ověření běží jen v zapnutém režimu obnovy. Secrets nebyly zobrazovány ani měněny.

Cloudové zálohy před změnami: ARCHIVE.fleet_orwii_fuel_backup_20261022 (1 224 řádků), AUDIT.fleet_orwii_runs_backup_20261022 (1 523 řádků), CORE.fleet_aliases_backup_20261022 (140 vazeb). Předchozí verze workeru jsou ponechané pro návrat. Návrat k původnímu workeru by obnovil jeho známou chybu; data ani audit se při návratu aplikace nemažou.

## Nedokončené identity a zakázky

3BI 2007: master Vistos ID 151 (frontend vistos-151), T-Cars ID 1220; současné ORWII aliasy i transakce používají 1220. Detail s identitou Vistos proto neodpovídá souhrnu. Producent aliasů při další synchronizaci přepisuje vehicle_id na T-Cars klíč. Jednorázový SQL přepis by nebyl opravou a nebyl proveden. Chybí integrace časově verzovaných vazeb, změna producenta i všech konzumentů a historické ověření identit.

Původních 633 nepřiřazených řádků bylo vyhodnoceno podle dostupných podkladů: 332 bez zdrojových identifikátorů; 72 bez SPZ, s externím ID nebo čipem bez ověřené vazby; 22 s nejednoznačným označením bez běžné SPZ; 207 s přesnou SPZ vyžadující ověření historie. Nejsou prohlášeny za spárované a nedošlo k párování odhadem. Trvalá fronta řešení s vazbou na konkrétní podklady ještě není nasazená.

Živé čtecí ověření Vistos ServiceList potvrdilo 183 073 řádků a existenci polí Auto_FK, AllocatedVehicle, RidicContact_FK, DateStart, DateEnd, DateOfRealization, StartOfResolution, EndOfResolution, IsDone, Status_FK, Currency_FK a cen bez/s DPH. Načtený blok 1 000 řádků není kompletní import ani důkaz správné sémantiky cen, personálních ID nebo časových úseků. ServiceListItem a propojení položek vyžadují živé ověření novým omezeným čtecím auditem.

ORWII ukládá měnu CZK; pole price obsahuje unit a value. Režim DPH a potvrzení interní cenové báze nejsou doložené. Úplný příspěvek po PHM zůstává zablokovaný.

## Připravené, nenenasazené

[Draft PR 238](https://github.com/kaiser-smart/kaiser-control-center/pull/238) obsahuje čisté funkce časových identit, úseky zakázka–vozidlo–řidič, výpočet příspěvku po PHM a rozpočítaného PHM s nerozděleným zbytkem, měsíce Europe/Prague, blokování neúplných podkladů a omezený čtecí audit Vistos ServiceList/ServiceListItem. Cloudové testy prošly. Neobsahuje aktivovaný produkční import, migrace identit ani zapnutý ekonomický výsledek.

Cloudflare Pages kaiser-control-center-legacy hlásí GitHub disconnected; produkce stále používá main 68c9cbc770eb5b35b7cc1c7e8d102fb4ee0849fa, verzi aplikace 0.1.823. Obnovení původního spojení vyžaduje potvrzení přístupu účtu oplustil-prog na GitHubu. Oprávnění k četbě konkrétní ověřovací zprávy je vyžádané zvlášť. Není dovoleno obejít produkční deploy guard.

Do aplikace ještě není doplněn nový ukazatel poslední úspěšné synchronizace, nejnovějšího tankování a mezery. Celý čtyřbodový plán proto není dokončený; dokončená je obnova zdrojových dat s doloženým porovnáním. Zbývá nasadit a ověřit UI čerstvosti, identity, provedené zakázky a vazby, DPH/interní cenu a teprve poté ekonomiku.
