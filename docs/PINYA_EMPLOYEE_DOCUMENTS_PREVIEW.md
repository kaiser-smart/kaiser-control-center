# Pinya employee documents preview

Stav: navrh Faze 1, read-only kontrakt bez volani Pinya a bez ukladani HR dokumentu.

Posledni aktualizace: 2026-06-28.

Tento dokument popisuje bezpecny postup pro budouci napojeni dokumentu zamestnancu
z Pinya do Karty zamestnance ve Smart odpadech. Neobsahuje hesla, cookies, tokeny,
Pinya session data ani zadne HR dokumenty.

## Bezpecnostni pravidla

- Pinya se smi volat pouze z backendu / Cloudflare Functions / Workeru.
- Frontend nesmi obsahovat Pinya token, cookie, prihlasovaci udaje ani primy Pinya download link.
- HR dokumenty nesmi byt verejne dostupne pres URL.
- Dokumenty se nesmi ukladat do repozitare, `public/`, lokaliho browser storage ani logu.
- Ostre stahovani z Pinya, DB migrace, secrets, bindingy a produkcni sync potrebuji samostatne potvrzeni Radima.
- Preview muze zobrazit metadata, ale nesmi zverejnit soubor ani obejit opravneni.
- Kazde otevreni nebo stazeni ostreho dokumentu ma byt auditovatelne.

## Soucasny stav ve Smart odpadech

Karta zamestnance je v modulu `Dovolena / Nemoc` na trase:

```text
/dovolena-nemoc/zamestnanci/:id
```

Frontend nacita detail zamestnance a souvisejici data pres:

```text
GET /api/employees/:id
GET /api/employees/:id/vacation-balance
GET /api/employees/:id/absence
GET /api/employees/:id/work-history
GET /api/employees/:id/documents
```

Dokumenty zamestnance uz maji zakladni uloziste:

- D1 metadata: `employee_documents`
- D1 vazba na soubor: `employee_document_files`
- R2 bucket binding: `SMART_ODPADY_DOCUMENTS`
- chranene stazeni: `GET /api/employees/:id/documents/:documentId`

Import z Pinya dnes neni prime napojeni. Stavajici import pracuje jen se soubory,
ktere uzivatel rucne stahne nebo exportuje z Pinya, a paruje je podle nazvu souboru.

## Soucasne identifikatory zamestnance

Ve Smartu jsou dnes dostupne tyto identifikatory:

| Klic | Zdroj | Stav pro parovani |
| --- | --- | --- |
| `employee.id` | interni karta zamestnance | stabilni interni klic Smartu |
| `employee.userId` | vazba na prihlaseneho uzivatele | stabilni pro uzivatele s loginem |
| `firstName`, `lastName` | karta zamestnance | pouzitelne, ale neni unikatni |
| `email` | karta zamestnance | dobry kandidat, pokud odpovida Pinya |
| `hrProfile.personalNumber` | HR profil z Excel importu | dobry kandidat, pokud je v Pinya dostupny |
| `sourceSystem`, `sourceEmployeeKey` | HR-only import | zatim obecny zdrojovy klic, ne potvrzeny Pinya ID |
| `pinyaEmployeeId` | neni v DB | chybi, doporuceny budouci klic |

Bez samostatneho `pinyaEmployeeId` nesmi ostry sync spolehat jen na jmeno.

## Navrh parovani

Faze 1 preview ma ukazat stav parovani bez zapisu:

1. Presna shoda podle `pinyaEmployeeId`, az bude existovat.
2. Presna shoda podle osobniho cisla, pokud Pinya metadata osobni cislo poskytne.
3. Presna shoda podle e-mailu.
4. Kontrolovana shoda podle jmena + dalsiho signalu, napr. datum nastupu nebo datum narozeni.
5. Pokud existuje vice kandidatu, stav `duplicita`.
6. Pokud chybi Pinya zaznam, stav `chybi_v_pinya`.
7. Pokud Pinya zamestnanec nema Smart kartu, stav `chybi_ve_smartu`.

Navrhovane stavy parovani:

```text
matched
unmatched
duplicate
missing_in_pinya
missing_in_smart
needs_review
```

## Navrh datoveho modelu

Toto je pouze navrh, ne migrace.

```text
employee_pinya_links
- id
- employee_id
- pinya_employee_id
- pinya_display_name
- pinya_personal_number
- pinya_email
- match_status
- match_method
- match_score
- reviewed_by_user_id
- reviewed_at
- created_at
- updated_at

employee_pinya_document_metadata
- id
- employee_id
- pinya_employee_id
- pinya_document_id
- pinya_file_guid
- folder_name
- document_type
- document_name
- created_at_pinya
- changed_at_pinya
- valid_from
- expires_at
- size_bytes
- content_type
- sync_status
- last_seen_at
- last_synced_at
- issue_code
- issue_message
- created_at
- updated_at

employee_pinya_sync_runs
- id
- mode
- status
- started_at
- finished_at
- triggered_by_user_id
- matched_count
- unmatched_count
- duplicate_count
- document_count
- error_count
- message
```

Soubor samotny by se ukladal az v dalsi schvalene fazi do R2 pres existujici
`SMART_ODPADY_DOCUMENTS`, nebo by se proxyoval pres backend endpoint. Oboji vyzaduje
samostatne potvrzeni bezpecnostniho modelu.

## Navrh API kontraktu

Toto je pouze kontrakt, ne implementace.

```text
GET /api/employees/pinya-documents/preview-status
POST /api/employees/pinya-documents/preview-sync
GET /api/employees/pinya-match-review
GET /api/employees/:id/pinya-documents
GET /api/employees/:id/pinya-documents/:documentId/download
```

### `POST /api/employees/pinya-documents/preview-sync`

Ucel: read-only nacteni zamestnancu a metadat dokumentu, bez ulozeni souboru.

Zakazy ve Fazi 1:

- nestahovat soubory,
- nezapisovat ostre dokumenty,
- nemenit Pinya,
- neukladat secrets,
- nepoustet hromadny produkcni sync bez potvrzeni.

Navrhovana odpoved:

```json
{
  "run": {
    "id": "preview-run-...",
    "mode": "read-only-preview",
    "status": "completed",
    "startedAt": "2026-06-28T00:00:00.000Z",
    "finishedAt": "2026-06-28T00:00:02.000Z"
  },
  "summary": {
    "smartEmployeeCount": 78,
    "pinyaEmployeeCount": 78,
    "matchedCount": 70,
    "unmatchedCount": 3,
    "duplicateCount": 1,
    "missingInPinyaCount": 4,
    "missingInSmartCount": 0,
    "documentCount": 0
  },
  "rows": [
    {
      "employeeId": "employee-...",
      "employeeName": "Jmeno Prijmeni",
      "pinyaEmployeeId": "60223",
      "pinyaName": "Prijmeni Jmeno",
      "matchStatus": "matched",
      "matchMethod": "email",
      "matchScore": 100,
      "documents": [
        {
          "pinyaDocumentId": "147050",
          "pinyaFileGuid": "b93751dc-...",
          "name": "GDPR- Jmeno Prijmeni.pdf",
          "type": "Souhlasy GDPR",
          "createdAtPinya": "2025-04-11T15:46:00.000Z",
          "changedAtPinya": "2026-06-28T12:10:00.000Z",
          "expiresAt": "",
          "sizeBytes": 811395,
          "syncStatus": "metadata_only",
          "issue": ""
        }
      ]
    }
  ],
  "apiStatus": "ready"
}
```

## Navrh UI

### Karta zamestnance

Sekce `Dokumenty z Pinya` ma byt jasne oznacena jako preview, dokud nejde o
schvalene ostre ulozeni nebo proxy:

- pocet dokumentu,
- posledni preview sync,
- stav parovani,
- tabulka metadat dokumentu,
- stav dokumentu,
- typ dokumentu,
- platnost / expirace,
- prazdny stav: `Zamestnanec nema v Pinya zadne dokumenty.`,
- nesparovany stav: `Zamestnanec zatim neni sparovany s Pinya.`,
- chybovy stav: `Dokumenty z Pinya se nepodarilo nacist.`

Tlacitko pro stazeni nebo otevreni souboru se nesmi zobrazit, dokud neni schvaleny
bezpecny R2 import nebo backend proxy.

### Admin / HR prehled

Samostatny prehled `Pinya dokumenty - kontrola parovani`:

- vsichni zamestnanci,
- stav parovani,
- pocet dokumentu,
- problemove zaznamy,
- posledni synchronizace,
- filtr podle stavu,
- akce pouze pro manualni kontrolu parovani.

## Opravneni

Soucasne role `absence:view` jsou pro HR dokumenty prilis siroke. Navrh:

| Role | Metadata preview | Otevreni/stazeni dokumentu |
| --- | --- | --- |
| admin | ano | ano, auditovane |
| management | ano, pokud schvaleno | ano, auditovane, pokud schvaleno |
| kancelar / HR | ano | ano, auditovane |
| dispecer | ne, dokud neni schvaleno | ne |
| garazmistr / vedouci | jen vlastni tym po schvaleni | ne nebo jen vybrane typy po schvaleni |
| ridic | jen vlastni povolene dokumenty po schvaleni | ne bez samostatneho rozhodnuti |
| readonly | ne | ne |

Pred ostrou implementaci je potreba samostatne rozhodnout, jestli vznikne modulove
opravneni napr. `employee-documents:view`, `employee-documents:download`,
`employee-documents:manage`.

## Pinya discovery

Z webu Pinya bylo pri rucnim pruzkumu videt, ze dokumenty zamestnance jsou v detailu:

```text
https://kaiser.pinya.hr/Employees/Detail/:pinyaEmployeeId#documents
```

Odkazy na soubory pouzivaji Pinya endpoint ve tvaru:

```text
/FileManager/Db?guid=...
```

Hromadne stazeni vybranych dokumentu v UI vytvari odkaz ve tvaru:

```text
/Documents/Zip?type=1&guid=...&ids=...
```

Tohle neni schvalene API. Pred produkcnim napojenim je potreba potvrdit, zda Pinya
poskytuje oficialni API pro seznam zamestnancu a dokumentu. Pokud ne, scraping nebo
vyuziti internich web endpointu potrebuje samostatne potvrzeni Radima.

## Aktualizace dokumentu

Faze 1 smi jen zjistit rozdily v metadatech:

- novy dokument v Pinya,
- dokument zmizel z Pinya,
- zmenena velikost nebo datum zmeny,
- zmeneny typ/slozka,
- dokument bez data platnosti,
- expirovany dokument,
- dokument konci platnost.

Ostre smazani dokumentu ve Smartu podle Pinya nesmi byt automaticke.

## Bezpecne faze

1. Read-only analyza a kontrakt - tento dokument.
2. Read-only preview bez souboru - metadata a parovani, zadne stazeni.
3. UI preview v karte zamestnance a admin prehledu - jasne oznacene jako preview.
4. Schvaleny storage/proxy model - R2 import nebo backend proxy, audit pristupu.
5. Ostry sync - jen po potvrzeni secrets, runneru, audit logu, opravneni a rollbacku.

## Nesmi se delat v dalsim kroku

- hromadne stahovat dokumenty z Pinya,
- ukladat soubory do repozitare nebo `public/`,
- pridavat Pinya secrets bez potvrzeni,
- menit Cloudflare bindingy bez potvrzeni,
- delat DB migrace bez potvrzeni,
- menit role/opravneni bez potvrzeni,
- zpristupnit HR dokumenty pres verejne URL,
- tvrdit, ze jde o hotove napojeni, pokud existuje jen preview.
