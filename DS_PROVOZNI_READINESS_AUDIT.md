# DS provozni readiness audit

Datum: 2026-06-29

Rozsah: Datova schranka, SendGrid e-mail, cloud runner/cron automatizaci, zive oddeleni DS schranek.

Bezpecnostni rezim: provedeno pouze read-only overeni produkcni D1 a kodu. Nebyly poslany e-maily, nebyly poslany datove zpravy, nebyla menena DB, nebyly meneny Cloudflare secrets/bindings.

## Shrnutí

| Oblast | Stav | Důkaz | Co chybí |
|---|---|---|---|
| Cloud runner DS automatizaci | HOTOVO / bezi | `module_automation_runner_runs`, posledni beh `2026-06-29T14:30:49.544Z`, `triggered_by=cloudflare-cron`, `status=processed`, `cron=*/30 * * * *` | Nic pro bezny beh pravidel. |
| Pravidla DS | HOTOVO | `module_rules`: 7 aktivnich pravidel pro `module_key=data-box`, vsechna `last_run_status=processed` | Prubezne hlidat chyby behu. |
| Archivace pravidly | HOTOVO / ostra akce | `data_box_actions`: `archive/archived = 24` | Auditovat, ze pravidla jsou spravne obsahove. |
| E-maily z pravidel | HOTOVO jako priprava, NE automaticke odeslani | `data_box_actions`: `email/requires_confirmation = 18`; runner hlasi "E-maily jsou pripravené k rucnimu potvrzeni." | Rucni potvrzeni v AI Boost / akcich, pripadne zivy test konkretniho potvrzeneho e-mailu. |
| SendGrid backend | FUNKCNI PRES API obecne | `functions/_lib/notification-service.js` pouziva SendGrid a `notification_logs` ma historicke odeslane e-maily. | DS e-mail nebyl v tomto auditu odeslan. |
| DS odpoved | CASTECNE | `functions/_lib/data-box-actions-store.js` obsahuje `sendDataBoxReply` pres server-side `DATA_BOX_REPLY_ENDPOINT` / `KNF_DATA_BOX_REPLY_ENDPOINT`. | Bez overeneho KNF/DS endpointu a API key se odpoved zablokuje. Nebyl poslan zadny DS reply. |
| Oddeleni DS schranek | HOTOVO pro 3 funkcni schranky | `data_box_messages`: `kaiser-primary` 36 zpr., `kaiser-data-box-2` 16 zpr., `kaiser-data-box-3` 16 zpr.; duplicity `isds_message_id` pres schranky: 0. | Schranky 4-6 nefunguji kvuli ISDS SOAP/credentials, cekaji na spravne udaje. |
| Schranky s chybou | CHYBI udaje | `data_boxes`: `kaiser-data-box-4/5/6` status `error`, `isds_id` prazdne, `last_sync_status=failed`, SOAP endpoint nevratil uspesnou odpoved. | Dodat/opravit prihlaseni/hesla/ID pro DS 4-6. |
| Notification log schema | CASTECNE | Produkcni `notification_logs` nema nove sloupce `provider`, `subject`, `message_preview`; kod je umi pouzit jen pokud existuji. | Volitelna migrace 0010 pro bohatsi e-mail audit; neni nutna pro DS runner, ale zlepsi transparentnost. |

## Produkcni data overena read-only

### Posledni behy DS runneru

| Cas UTC | Spusteno | Stav | Pravidel | Shod | Chyby | Cron |
|---|---|---|---:|---:|---:|---|
| 2026-06-29T14:30:49.544Z | cloudflare-cron | processed | 7 | 27 | 0 | `*/30 * * * *` |
| 2026-06-29T14:00:49.542Z | cloudflare-cron | processed | 7 | 27 | 0 | `*/30 * * * *` |
| 2026-06-29T13:30:49.542Z | cloudflare-cron | processed | 7 | 27 | 0 | `*/30 * * * *` |
| 2026-06-29T13:00:49.542Z | cloudflare-cron | processed | 7 | 42 | 0 | `*/30 * * * *` |
| 2026-06-29T12:30:49.533Z | cloudflare-cron | processed | 7 | 32 | 0 | `*/30 * * * *` |

Zaver: cloud runner bezi nezavisle na lokálním PC i browseru.

### Aktivni pravidla

| Rule ID | Nazev | Stav | Posledni stav |
|---|---|---|---|
| `data-box-cssz-epodani-archive` | e-podani CSSZ archivovat | active | processed |
| `data-box-csu-urgence-archive` | CSU urgence archivovat | active | processed |
| `data-box-culligan-send-faktury` | Culligan poslat na faktury | active | processed |
| `data-box-exekutor-jicha-send-gt-brno` | Exekutor Jicha poslat GT Brno | active | processed |
| `data-box-jmhz-send-gt-brno` | JMHZ poslat GT Brno | active | processed |
| `data-box-podebrady-send-dispecer` | Podebrady poslat dispecerovi | active | processed |
| `data-box-registr-smluv-archive` | Registr smluv archivovat | active | processed |

### Akce automatizaci

| Typ | Stav | Pocet | Vyklad |
|---|---|---:|---|
| archive | archived | 24 | Archivace byla provedena automatizaci. |
| email | requires_confirmation | 18 | E-maily jsou jen pripravene a cekaji na rucni potvrzeni. |

Zaver: e-mailova cast je zamerne bezpecna. Nic se neposila potichu.

### Oddeleni datovych schranek

| Mailbox ID | Label | ISDS ID | Zprav | Distinct ISDS zprav | Posledni ulozeni |
|---|---|---|---:|---:|---|
| `kaiser-primary` | Kaiser Smart Datova schranka | `56zeuyq` | 36 | 36 | 2026-06-29 13:31:05 |
| `kaiser-data-box-2` | Datova schranka 2 | `prjeuzd` | 16 | 16 | 2026-06-29 12:47:54 |
| `kaiser-data-box-3` | Datova schranka 3 | `v3h6as3` | 16 | 16 | 2026-06-29 12:48:02 |

Kontrola duplicit `isds_message_id` pres ruzne `data_box_id`: 0 nalezu.

Zaver: u funkcni trojice schranek neni dukaz, ze by Nanolab Plus/box 3 zobrazoval zpravy KS. Data jsou oddelena pres `data_box_id`.

### DS ucty se selhanim

| Mailbox ID | Label | ISDS ID | Stav | Posledni sync | Zprava |
|---|---|---|---|---|---|
| `kaiser-data-box-4` | Datova schranka 4 | prazdne | error | failed | ISDS SOAP endpoint nevratil uspesnou odpoved. |
| `kaiser-data-box-5` | Datova schranka 5 | prazdne | error | failed | ISDS SOAP endpoint nevratil uspesnou odpoved. |
| `kaiser-data-box-6` | Datova schranka 6 | prazdne | error | failed | ISDS SOAP endpoint nevratil uspesnou odpoved. |

Zaver: tady se ceka na spravne prihlasovaci udaje / hesla / ID schranek. Bez nich je nelze bezpecne rozbehnout.

## Kde se co spousti

- Runner: `workers/data-box-automation-runner.js`
- Logika runneru: `functions/_lib/data-box-automation-runner.js`
- Konfigurace workeru: `wrangler.data-box-automation-runner.toml`
- Cron: `*/30 * * * *`
- DB binding: `SMART_ODPADY_DB`
- D1 databaze: `smart-odpady`
- Pravidla: `module_rules`
- Behy runneru: `module_automation_runner_runs`
- Akce automatizaci: `data_box_actions`

## SendGrid

Backend pro odeslani e-mailu je v `functions/_lib/notification-service.js`.

Pouziva:

- `EMAIL_PROVIDER=sendgrid`
- `EMAIL_FROM`
- `SENDGRID_API_KEY` nebo `EMAIL_API_KEY`

Pokud nastaveni chybi, backend nepredstira uspech. Zapise `skipped` a vrati chybu.

Produkce ma historicke odeslane e-maily v `notification_logs`, napriklad `absence_approval_request` a `module_feedback_resolved_email`. DS e-maily z pravidel jsou ale v `data_box_actions` ve stavu `requires_confirmation`, takze nebyly potichu odeslany.

## DS odpoved pres KNF/DS

Endpoint pro odpoved je pripraveny v `functions/_lib/data-box-actions-store.js` jako `sendDataBoxReply`.

Vyžaduje server-side nastaveni:

- `DATA_BOX_REPLY_ENDPOINT` nebo `DATA_BOX_SEND_REPLY_ENDPOINT` nebo `KNF_DATA_BOX_REPLY_ENDPOINT`
- `DATA_BOX_REPLY_API_KEY` nebo `KNF_DATA_BOX_REPLY_API_KEY`

Pokud chybi endpoint nebo API key, odpoved se zablokuje chybou:

`Odpověď se nepodařilo odeslat: chybí server-side KNF/DS endpoint pro odesílání odpovědí.`

V tomto auditu nebyla odeslana zadna datova zprava.

## Rizika a blokace

1. Schranky 4-6 nemaji funkcni ISDS sync. Je potreba dodat/opravit spravne credentials a pravdepodobne ISDS ID.
2. DS e-maily jsou pripravene k potvrzeni. Reálný SendGrid test pro DS akci nebyl proveden, protoze by poslal e-mail.
3. DS odpoved je pripravena pres server-side endpoint, ale bez overeneho KNF/DS endpointu/API key neni produkcne kompletni.
4. Produkcni `notification_logs` nema rozsirene sloupce z migrace 0010. To neblokuje runner, ale omezuje detailni audit e-mailu.

## Co se nesmi delat bez dalsiho potvrzeni

- neposilat hromadne pripravene e-maily,
- neposilat DS odpovedi,
- nemenit Cloudflare secrets,
- nepoustet DB migrace,
- nemenit credentials DS uctu,
- nespoustet destruktivni mazani/archivaci mimo potvrzeny runner rezim.

## Doporučený další krok

1. Doplnit nebo opravit hesla/ID pro DS 4-6.
2. Po doplneni credentials spustit jen read-only sync overeni techto schranek.
3. Potom potvrdit jeden testovaci DS e-mail z AI Boost konceptu a overit `notification_logs`.
4. Az nasledne resit DS odpoved pres KNF/DS endpoint.

Proč: runner a pravidla uz bezi. Nejvetsi provozni mezera nejsou pravidla, ale nefunkcni DS ucty 4-6 a neovereny ostry e-mail/DS reply.
