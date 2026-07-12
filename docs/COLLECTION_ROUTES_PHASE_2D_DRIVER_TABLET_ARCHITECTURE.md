# Svozove trasy - Faze 2D ridicsky tablet

Stav: Faze 2D-A nasazena a overena v produkci; Faze 2D-B implementovana a otestovana v kodu, produkcni overeni ceka na nasazeni.

Aktualizace: 2026-07-12

## Cil

Faze 2D-A meni read-only tablet na rizeny online provozni pilot pro svozova auta.

Migrace 0038, API a UI pokryvaji jen schvaleny minimalni rozsah. Offline sync, GPS, T-Cars, navigace, fotky, notifikace, optimalizace a automaticke vytvareni tras zustavaji dalsi samostatnou fazi.

## Implementovany rozsah Faze 2D-A

- Dispecer overi budouci denni trasu nad aktualnim ulozenym Vistos Komunal snapshotem.
- Do navrhu se zaradi jen radky `Svoz Kaiser ANO` bez otevrene datove kontroly, s potvrzenym Adresnim mistem, odpadem, nadobou, cetnosti a jednoznacnym dnem/tydnem.
- `1x30` se zatim bez konkretniho potvrzeneho data bezpecne vyradi.
- Ulozeny navrh je nemennou kopii zdrojovych radku. Pozdeji doplnene Stanoviste ovlivni az budouci navrh.
- Dispecer priradi aktivniho uzivatele s roli Ridic, trasu potvrdi, sleduje prubeh, dokonci nebo znovu otevre.
- Ridic vidi jen svoji prirazenou trasu. Muze ji zahajit a online zapsat `HOTOVO`, `Problem`, `Vyklop` a `Pauza`.
- D1 je zdroj pravdy. Obnoveni stranky nacte ulozeny stav a audit.
- Vistos zustava pouze read-only a frontend ho nikdy nevola primo.

## Implementovany rozsah Faze 2D-B

- Ukladani zastavek pouziva vicenasobne `INSERT` dotazy po nejvyse 4 radcich, tedy pod limitem 100 D1 parametru na dotaz.
- Jedna nemenne transakcni davka porad obsahuje beh, vsechny zastavky a auditni udalost; chyba vrati celou davku zpet.
- Zatezovy test 900 zastavek pouziva 236 D1 operaci misto puvodnich 911; hranicnich 1000 zastavek pouziva 261 operaci.
- Dispecersky i ridicsky seznam vlozi do DOM nejprve 100 zastavek a dalsi odkryva po 100. Aktualni ridicska zastavka a souhrnne pocty zustavaji viditelne nezavisle na seznamu.
- Samostatny test pokryva 60, 300, 900 a 1000 zastavek vcetne poradi, poctu ulozenych radku, auditu a limitu databazovych operaci.
- Faze 2D-B nemeni DB schema, opravneni, Vistos, automatizace ani externi integrace.

## Aktualni stav

- Pro novy denni beh je zdrojem aktualni ulozeny Vistos Komunal snapshot; 13 Excelu zustavaji v diagnosticke vrstve.
- Vistos je read-only zdroj a nove denni tabulky jsou oddelene od importniho snapshotu.
- UI umi filtr den / tyden / odpad / kontrola, tiskove podklady a novy dispecersky D1 panel.
- Ridicsky pohled online uklada povolene akce do D1 a po reloadu je znovu nacte.
- DB model existuje pro denni beh, nemenne zastavky a udalosti.
- GPS stopa, fotky a offline synchronizace stale neexistuji.

## Hlavni principy ostreho rezimu

- Faze 2D-A pouziva aktualni ulozeny Vistos Komunal snapshot omezeny na `Svoz Kaiser ANO`; 13 Excelu zustava v diagnostice.
- Vistos se pouze cte. Provozni zmeny se ukladaji vyhradne do D1.
- Denni trasa smi vzniknout jen z aktualniho snapshotu, rucne zvoleneho data/vozu a radku, ktere projdou backend kontrolou.
- Ridic na tabletu smi potvrzovat jen zastavky v prirazene trase.
- Kazda akce ridice musi mit audit: kdo, kdy, auto, trasa, zastavka, stav pred/po.
- Offline rezim ve Fazi 2D-A neni. Pokud bude pozdeji schvalen, lokalni fronta smi byt jen docasny cache.
- Zdroj pravdy je backend D1.

## Co bude znamenat Hotovo na zastavce

Implementovane stavy zastavky:

- `planned` - zastavka je v denni trase, ridic ji jeste neresil.
- `done` - ridic potvrdil HOTOVO.
- `problem` - problem vyzaduje kontrolu dispecera.

Navrat zastavky do planu je auditni udalost `stop_reopened`; vysledny stav je znovu `planned`.

Minimalni potvrzeni `done`:

- stop id,
- route run id,
- user id ridice,
- serverovy timestamp prijeti backendem,
- aktualni stav,
- predchozi stav,
- volitelna poznamka,
- idempotency klic.

Klientske casy a GPS nejsou ve Fazi 2D-A zdroj pravdy ani soucasti zapisu.

## Problemove stavy

Preddefinovane duvody:

- nadoba neni venku,
- preplneno,
- prekazka,
- spatna adresa,
- zakaznik odmitl,
- zamceno / nelze se dostat,
- jina poznamka.

Fotka:

- smi byt jen volitelna prilohu problemu,
- musi mit limit velikosti,
- nesmi se posilat mimo KSO bez schvaleni,
- musi mit vazbu na stop audit.

## Implementovany DB model Faze 2D-A

Migrace: `migrations/0038_create_collection_daily_routes.sql`.

### `collection_daily_route_runs`

Denni beh trasy.

Hlavni implementovana pole:

- `id`
- `source_batch_id`
- `route_day_code`
- `route_week_mode`
- `vehicle_code`
- `route_date`
- `status`
- `created_by_user_id`
- `driver_user_id`
- `driver_name`
- `created_at`
- `started_at`
- `confirmed_at`
- `completed_at`
- `reopened_at`
- `metadata_json`

### `collection_daily_route_stops`

Kopie zdrojovych radku do konkretni denni trasy.

Hlavni implementovana pole:

- `id`
- `run_id`
- `source_row_id`
- `route_order`
- `customer_name`
- `address_text`
- `waste_type`
- `container_volume`
- `container_count`
- `frequency`
- `note`
- `status`
- `problem_reason`
- `problem_note`
- `completed_at`
- `source_summary_json`

### `collection_daily_route_events`

Audit vsech akci.

Hlavni implementovana pole:

- `id`
- `run_id`
- `stop_id`
- `event_type`
- `before_status`
- `after_status`
- `actor_user_id`
- `actor_name`
- `created_at`
- `idempotency_key`
- `reason`
- `note`
- `payload_json`

Nasledujici tabulky jsou pouze budouci navrh a ve Fazi 2D-A nevznikaji.

### `collection_route_sync_batches` (budouci)

Synchronizacni davka z tabletu.

Pole navrh:

- `id`
- `route_run_id`
- `device_id`
- `driver_user_id`
- `status`
- `event_count`
- `accepted_count`
- `rejected_count`
- `created_at`
- `metadata_json`

### `collection_route_stop_attachments` (budouci)

Fotky nebo prilohy problemu.

Pole navrh:

- `id`
- `stop_id`
- `event_id`
- `storage_key`
- `mime_type`
- `file_size`
- `created_by_user_id`
- `created_at`
- `metadata_json`

## Implementovane API Faze 2D-A

- `POST /api/collection-routes/daily-routes/preview`
- `GET|POST /api/collection-routes/daily-routes`
- `GET|PATCH /api/collection-routes/daily-routes/:runId`
- `POST /api/collection-routes/daily-routes/:runId/transition`
- `POST /api/collection-routes/daily-routes/:runId/stops/:stopId/events`
- `GET /api/collection-routes/daily-routes/drivers`
- `GET /api/collection-routes/daily-routes/my`

Vsechny dispecerske zapisy vyzaduji `collection-routes:manage`. Ridicske endpointy overuji prihlaseneho uzivatele proti `driver_user_id` konkretni trasy a nedavaji roli Ridic obecne opravneni `collection-routes:view`.

## Puvodni navrh rozsireneho API

Nasledujici body zustavaji jen jako hranice budouci faze s offline synchronizaci, prilohami a GPS.

### Dispecer

- `POST /api/collection-routes/runs/preview`
  - vytvori nahled budouci denni trasy bez zapisu.
- `POST /api/collection-routes/runs`
  - vytvori denni trasu ze schvaleneho filtru.
  - vyzaduje explicitni potvrzeni a audit.
- `GET /api/collection-routes/runs`
  - seznam dennich tras.
- `GET /api/collection-routes/runs/:id`
  - detail trasy pro dispecera.
- `PATCH /api/collection-routes/runs/:id`
  - jen opravnena role, napriklad prirazeni ridice nebo uzavreni trasy.

### Tablet

- `GET /api/collection-routes/runs/:id/tablet`
  - trasa pro ridice.
- `POST /api/collection-routes/runs/:id/sync`
  - posle frontu udalosti z tabletu.
- `POST /api/collection-routes/stops/:id/events`
  - online potvrzeni jedne zastavky.
- `POST /api/collection-routes/stops/:id/attachments`
  - volitelna fotka problemu.

## Opravneni

Role navrh:

- admin: vse.
- dispecer: vytvoreni a uzavreni denni trasy, prirazeni ridice, kontrola problemu.
- garaz / provoz: nahled a kontrola, bez mazani.
- ridic: pouze vlastni prirazena trasa, potvrzeni vlastnich zastavek.

Zakazy:

- ridic nesmi menit zdrojovy Excel radek,
- ridic nesmi menit poradi trasy,
- ridic nesmi vytvorit novou trasu,
- tablet nesmi mazat audit,
- frontend nesmi volat Vistos primo.

## Offline synchronizace

Navrh:

- Tablet dostane snapshot trasy.
- Akce ridice se ukladaji do fronty udalosti.
- Pri obnoveni internetu tablet posle davku na backend.
- Backend kazdou udalost validuje podle aktualniho stavu.
- Konflikty se neprepisuji automaticky; jdou do kontroly dispecera.

Konflikt nastane, kdyz:

- stop uz ma jiny konecny stav,
- trasa byla uzavrena,
- ridic neni prirazeny k trase,
- timestamp je podezrely,
- stop nepatri do route run.

## GPS a T-Cars

Navrh pro dalsi schvalenou fazi:

- GPS z tabletu je doplnkovy signal k udalosti ridice.
- T-Cars zustava primarni zdroj pohybu vozidla.
- Backend muze porovnat udalost ridice s posledni T-Cars polohou auta.
- Nesoulad se nema automaticky trestat; ma jit do auditniho upozorneni.
- Bez samostatne schvalene faze se nesmi spustit navigace ani live dohled.

## Dispecersky pohled

Dispecer potrebuje:

- seznam dnesnich tras,
- stav auta a ridice,
- pocet hotovo / zbyva / problem,
- posledni synchronizaci tabletu,
- problemove zastavky,
- audit konkretni zastavky,
- export / tisk po skonceni.

## Bezpecnostni brany pred implementaci

Pred jakoukoliv ostrou implementaci musi Radim/Martin potvrdit:

- DB migrace,
- API smlouvu,
- role a opravneni,
- auditni pole,
- jak dlouho se drzi fotky,
- zda se povoli GPS z tabletu,
- zda se povoli T-Cars porovnani,
- zda se povoli offline fronta,
- jak se resi konflikty,
- kdo smi uzavrit trasu.

## Co se nesmi udelat bez dalsiho potvrzeni

- Vytvorit ostrou denni trasu.
- Zapisovat potvrzeni svozu.
- Spustit GPS z tabletu.
- Spustit T-Cars trasovani.
- Posilat SMS/e-maily.
- Spustit notifikace.
- Spustit automatizace, cron, worker nebo queue.
- Menit DB migrace.
- Menit Cloudflare secrets/bindings.
- Mazat nebo prepisovat produkcni data.

## Navrzeny dalsi bezpecny programovaci celek

Nejvetsi bezpecny dalsi celek je pouze UI prototyp dispecerskeho nahledu `Denni trasa - navrh`, ktery:

- cte aktualni filtr,
- zobrazi jak by vypadal route run,
- ukaze potrebna DB/API pole,
- nic neuklada,
- nema tlacitko pro ostre vytvoreni.

Ostry zapis muze prijit az po schvaleni DB modelu a API smlouvy.
