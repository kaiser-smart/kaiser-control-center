# Svozove trasy - Faze 2D ridicsky tablet, navrh ostreho rezimu

Stav: navrh architektury, bez implementace ostrych zapisu.

Datum: 2026-07-05

## Cil

Faze 2D ma pripravit rozhodnuti, jak se z dnesniho read-only ridicskeho tabletu stane provozni rezim pro svozova auta.

Tento dokument neni migrace, neni API smlouva a nespousti ostrou trasu. Popisuje pouze navrh dalsi faze.

## Aktualni stav

- Zdroj trasy je aktualni import 13 Excelu nebo opravny sesit.
- Vistos match je read-only overeni radku.
- UI umi filtr den / tyden / auto / odpad / kontrola.
- UI umi tisk pro ridice, detailni PDF, offline HTML balicek a read-only ridicsky tablet.
- Ridicsky tablet dnes nic nepotvrzuje, neuklada a neposila.
- Neexistuje DB model pro denni beh trasy, stop audit, GPS stopu, fotky ani offline synchronizaci.

## Hlavni principy ostreho rezimu

- 13 Excelu zustava zdroj puvodniho rozsahu trasy.
- Vistos se pouziva jen pro overeni a doplneni, ne pro pridani dalsich zakazniku.
- Ostra denni trasa smi vzniknout jen ze schvaleneho importu a schvaleneho filtru.
- Ridic na tabletu smi potvrzovat jen zastavky v prirazene trase.
- Kazda akce ridice musi mit audit: kdo, kdy, auto, trasa, zastavka, stav pred/po.
- Offline rezim smi uklada lokalni frontu jen jako docasny cache pro synchronizaci, ne jako zdroj pravdy.
- Zdroj pravdy po synchronizaci musi byt backend DB.

## Co bude znamenat Hotovo na zastavce

Navrh stavu zastavky:

- `planned` - zastavka je v denni trase, ridic ji jeste neresil.
- `arrived` - ridic je na miste nebo ji otevrel v tabletu.
- `collected` - svoz potvrzen.
- `skipped` - nesvezeno s duvodem.
- `problem` - problem vyzaduje kontrolu dispecera.
- `reopened` - dispecer nebo opravnena role vratila zastavku k reseni.

Minimalni potvrzeni `collected`:

- stop id,
- route run id,
- user id ridice,
- timestamp v tabletu,
- timestamp prijeti backendem,
- aktualni stav,
- predchozi stav,
- volitelna poznamka,
- volitelna GPS poloha, pokud bude povolena a dostupna.

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

## Navrh DB modelu

Nutne nove tabulky v dalsi schvalene fazi:

### `collection_route_runs`

Denni beh trasy.

Pole navrh:

- `id`
- `source_batch_id`
- `day_code`
- `week_mode`
- `vehicle_code`
- `route_date`
- `status`
- `created_by_user_id`
- `assigned_driver_user_id`
- `created_at`
- `started_at`
- `finished_at`
- `metadata_json`

### `collection_route_run_stops`

Kopie zdrojovych radku do konkretni denni trasy.

Pole navrh:

- `id`
- `route_run_id`
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
- `problem_code`
- `problem_note`
- `visited_at`
- `completed_at`
- `metadata_json`

### `collection_route_stop_events`

Audit vsech akci.

Pole navrh:

- `id`
- `route_run_id`
- `stop_id`
- `event_type`
- `before_status`
- `after_status`
- `user_id`
- `client_timestamp`
- `server_timestamp`
- `latitude`
- `longitude`
- `gps_accuracy_m`
- `source`
- `note`
- `metadata_json`

### `collection_route_sync_batches`

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

### `collection_route_stop_attachments`

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

## Navrh API

Bez migrace a implementace. Jen navrh.

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
