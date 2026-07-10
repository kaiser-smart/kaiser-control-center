# Datove schranky GPT - predavaci souhrn

Datum: 2026-07-10

Commit s implementaci:

```text
2c36dff feat: add confirmed GPT actions to data boxes
```

## Cil prace

Cilem bylo napojit OpenAI API (GPT) do modulu Datove schranky tak, aby mel
kazdy prijaty zaznam vlastni chat nad konkretni datovou zpravou.

Chat ma:

- pracovat s kontextem aktualni datove zpravy,
- pouzivat historii chatu nad danou zpravou,
- pripravit navrh dalsiho kroku,
- pred provedenim akce se zeptat `Mam provest?`,
- provest akci az po potvrzeni uzivatelem,
- ukladat zpetnou vazbu pro Autopilota.

Hlasovy rezim nebyl soucasti teto faze.

## Stav funkce

- UI navrh: NE
- Read-only pilot: NE
- Funkcni pres API: ANO v kodu a lokalnich testech
- Cloud automatizace: NE
- Produkcne overeno: NE

Funkce je pripravena v kodu a na GitHubu. Neni overena v produkci, protoze
produkci se nepodarilo nasadit bez Cloudflare API tokenu.

## Hlavni tok

1. Uzivatel otevrenou prijatou datovou zpravu.
2. Nad detailem zpravy je vlozeny chat.
3. Uzivatel napise, co chce se zpravou udelat.
4. Backend sestavi kontext:
   - aktualni datova zprava,
   - dosavadni chat historie,
   - pravidla a pouceni Autopilota,
   - stav dostupnych provideru pro e-mail/SMS.
5. Backend zavola OpenAI Responses API.
6. GPT vrati strukturovany plan a lidskou odpoved.
7. Pokud plan obsahuje akci, ulozi se jako cekajici potvrzeni.
8. UI zobrazi kartu s dotazem `Mam provest?`.
9. Az po potvrzeni se provede interni akce, priprava odpovedi, e-mail nebo SMS.
10. Po uspesnem provedeni se udalost zapise do historie a muze slouzit pro
    dalsi uceni Autopilota.

## Bezpecnostni pravidla

- GPT nikdy nema primo provadet ostrou akci bez potvrzeni.
- Potvrzeni je vazane na `confirmationId`.
- Potvrzeni ma omezenou platnost.
- Opakovane pouziti stejneho potvrzeni se odmita.
- Stary nebo zruseny navrh se neprovede.
- Nepovedena akce se neuklada jako uspesne pouceni.
- Obsah datove zpravy, priloh, historie i pravidel je pro GPT neduveryhodny
  vstup.
- Prompt obsahuje ochranu proti prompt injection.
- Frontend neposila e-maily ani SMS samostatne.
- Zdroj pravdy pro provedeni akce zustava backend/API.

## OpenAI integrace

Novy helper:

```text
functions/_lib/data-box-plus-openai.js
```

Pouziva OpenAI Responses API:

```text
https://api.openai.com/v1/responses
```

Vychozi model v teto fazi:

```text
gpt-5.4-mini
```

Poznamka: skutecny model lze menit pres prostredi:

```text
DATA_BOX_PLUS_OPENAI_MODEL
DATA_BOX_PLUS_OPENAI_TIMEOUT_MS
OPENAI_API_KEY
```

Do repozitare se neuklada zadna skutecna hodnota API klice.

## Povolené typy akci

GPT smi navrhovat jen akce z povoleneho seznamu:

- `none`
- `archive_info`
- `mark_done`
- `need_more_info`
- `mark_cannot_execute`
- `internal_note`
- `create_task`
- `prepare_reply`
- `send_email`
- `send_sms`
- `set_reminder`
- `assign_to_user`

Odeslani e-mailu nebo SMS probiha az po potvrzeni uzivatelem a pres existujici
backendove providery.

## Uloziste historie a uceni

Historie chatu nad zpravou se sklada z akci a udalosti v:

```text
data_box_plus_action_log
```

Pravidla a pouceni Autopilota se berou z:

```text
data_box_plus_rules
```

Tato faze nepridala novou DB migraci. Vyuziwa existujici tabulky a existujici
backendovy tok modulu Datove schranky Plus.

## Frontend

Hlavni zmeny:

```text
src/app.js
src/data/dataBoxPlusChat.js
src/styles.css
src/data/versionInfo.js
```

Chat je vlozeny do detailu kazde prijate datove zpravy. Nepatri do compose
overlay. UI zobrazuje potvrzovaci kartu s volbami:

- `Provest`
- `Zrusit`

Pouzita potvrzeni se v historii znovu neukazuji jako aktivni.

## Backend

Hlavni zmeny:

```text
functions/_lib/data-box-plus-store.js
functions/_lib/data-box-plus-openai.js
functions/_lib/customer-message-templates.js
functions/_lib/customer-messaging-service.js
functions/_lib/notification-service.js
```

Backend resi:

- sestaveni kontextu pro GPT,
- ulozeni navrhu do cekajiciho potvrzeni,
- provedeni akce az po potvrzeni,
- ochranu proti duplicitam,
- napojeni na e-mail a SMS providery,
- audit udalosti,
- bezpecne selhani bez falesneho oznaceni uspesne akce jako selhani.

## Testy

Pridane nebo upravene testy:

```text
scripts/data-box-plus-openai.test.mjs
scripts/data-box-plus-confirmation.test.mjs
scripts/data-box-plus-chat-ui.test.mjs
scripts/data-box-plus-instruction-flow.test.mjs
scripts/customer-messaging.test.mjs
```

Overene scenare:

- GPT vraci strukturovany plan.
- Navrh akce sam o sobe nic neodesle.
- Potvrzeni provede akci jednou.
- Duplicitni potvrzeni se odmitne.
- Neuspesna akce se nenauci jako uspesne pravidlo.
- Chat historie se rekonstruuje v UI.
- Potvrzovaci karta se po pouziti schova.
- Frontend uz netvrdi, ze chat nikdy neposila e-mail/SMS.

## Co jeste neni produkcne overene

- Produkcni volani OpenAI API s realnym `OPENAI_API_KEY`.
- Produkcni potvrzeni a provedeni e-mailu/SMS.
- Produkcni readiness pro SMS provider v live rezimu.
- Produkcni UI na `https://kaiser-control-center.pages.dev`.

Produkce pri poslednim overeni stale ukazovala:

```text
version: 0.1.489
commit: f830707
```

Kod s touto funkci je na GitHubu na:

```text
main / 2c36dff
```

## Blokace nasazeni

Produkcnimu deployi brani chybejici Cloudflare API token v neinteraktivnim
prostredi:

```text
CLOUDFLARE_API_TOKEN
```

Token se nesmi ukladat do repozitare, do sdilene slozky ani do dokumentace.
Ma byt nastaven jako lokalni prostredi nebo bezpecny Cloudflare/GitHub secret.

## Doporuceny dalsi krok

1. Pripravit Cloudflare prihlaseni nebo `CLOUDFLARE_API_TOKEN` mimo projekt.
2. Spustit povoleny produkcni guard:

```text
npm run deploy:pages:production
```

3. Po nasazeni overit:
   - produkcni `buildMeta`,
   - verzi `0.1.490`,
   - commit `2c36dff`,
   - otevreni detailu datove zpravy,
   - zobrazeni chatu nad zpravu,
   - bezpecny potvrzovaci flow.

## Co se nesmi delat

- Neukladat `OPENAI_API_KEY` ani `CLOUDFLARE_API_TOKEN` do Gitu.
- Neobchazet produkcni guard primym Wrangler deployem.
- Netvrdit, ze je funkce v produkci, dokud `buildMeta` neukaze commit
  `2c36dff`.
- Nespoustet e-mail/SMS testy proti produkcnim kontaktum bez vyslovneho
  potvrzeni.
