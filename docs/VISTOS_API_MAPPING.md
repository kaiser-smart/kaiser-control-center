# Vistos API mapping

Stav: read-only pruzkum Vistos API pro Kaiser Smart / Smart odpady.

Posledni aktualizace: 2026-06-27.

Tento dokument je pracovni zdroj pravdy pro mapovani Vistos poli do modulu
Trasy svozu a dalsich budoucich modulu. Neobsahuje hesla, tokeny ani secrets.

## Bezpecnostni pravidla

- Vistos API se smi volat pouze z backendu / Cloudflare Functions / Workeru.
- Frontend nesmi volat Vistos primo.
- Prihlasovaci udaje nesmi byt v repozitari, logu, konzoli ani frontendu.
- Prihlasovaci udaje patri pouze do Cloudflare secrets nebo jineho schvaleneho secret store.
- Vystupy importu musi byt read-only preview, dokud neni schvalen ostry import.
- Zadny import z Vistosu nesmi sam vytvaret ostre trasy bez samostatne schvalene faze.

## API poznamky

Zakladni API endpoint:

```text
https://KaiserServis.myvistos.com/API/VistosAPI
```

Overene volani:

- prihlaseni: `POST /Execute?LoginParam`
- cteni gridu/entity: `POST /Execute?GetPageParam`
- detail zaznamu: `POST /Execute?GetByIdParam`

Dulezite technicke poznamky:

- `Device` musi byt string, napr. `Browser`.
- Login vraci tokeny, ale dalsi API volani musi bezet ve stejne cookie session.
  Vistos web klient pouziva `credentials: include` a cookies:
  - `VistosAccessToken`
  - `VistosRefreshToken`
- `Columns: null` muze vracet chybu `ERROR_LOAD_DATAGRID_RECORDS`.
- Bezpecnejsi je posilat explicitni `Columns`.
- `Columns` musi byt pole objektu, ne pole stringu:

```json
[
  { "ColumnName": "Id", "Status": 1 },
  { "ColumnName": "ContractNumber", "Status": 1 }
]
```

- Filtr u `GetPageParam` musi byt v poli `Filter`.
- Varianta `Filters` byla API prijata s `status: OK`, ale filtr se ignoroval.
  Tohle je dulezite: pri `Filters` se vratily nefiltrovane radky.
- U multiselect FK poli je potreba filter jako pole, napr. `Typsmlouvy_FK: [14735]`.
- U FK poli API vraci i doplnkova pole:
  - `<field>_MainProjection`
  - `<field>_RecordId`
  - `<field>_Deleted`
  - nekdy `<field>_Lat`
  - nekdy `<field>_Long`

## Overene entity

| Entita | Vistos API entity | Poznamka |
| --- | --- | --- |
| Smlouvy | `Contract` | Hlavni zdroj smluv |
| Polozky smlouvy | `ContractRow` | Vazba na smlouvu a produkt |
| Produkty / sluzby / nadoby | `Product` | Typ odpadu, nadoba, cetnost, ks |
| Zakazkovy list | `ServiceList` | API vratilo 0 radku; uzitecnejsi je `ServiceListItem` |
| Polozky zakazkoveho listu | `ServiceListItem` | Vazby na `ContractRow` a `Product` |
| Adresar | `Directory` | Zakaznik, firma, pobocka, kontakt pres projekce |
| Objekty DB | `DbObject` | Metadata entit |
| Sloupce DB | `DbColumn` | Metadata sloupcu |
| Zakaznicke ceny | `ProductAccountPrice` | Ceny pro produkt + zakaznika |
| Ceny produktu | `ProductPrice` | Ceny produktu / pasma |
| Prodejni ceniky | `ProductSellingPrice` | Hlavicky ceniku |

## DbObject ID

| Entity | DbObject ID |
| --- | ---: |
| `Contract` | 47 |
| `ContractRow` | 48 |
| `Directory` | 49 |
| `Product` | 65 |
| `ProductAccountPrice` | 66 |
| `ProductBundle` | 67 |
| `ProductItem` | 68 |
| `ProductPrice` | 69 |
| `ProductSellingPrice` | 70 |
| `ProductTemplate` | 72 |
| `ServiceList` | 137 |
| `ServiceListItem` | 138 |
| `vwDirectoryGPS` | 161 |

## Contract - smlouva

| UI / vyznam | API pole | Stav |
| --- | --- | --- |
| ID smlouvy | `Contract.Id` | overeno |
| Cislo smlouvy | `Contract.ContractNumber` | overeno |
| Nazev smlouvy | `Contract.Name` | overeno |
| Stav | `Contract.Status_FK` | overeno |
| Typ | `Contract.Type_FK` | overeno |
| Typ smlouvy | `Contract.Typsmlouvy_FK` | overeno |
| Zacatek | `Contract.StartDate` | overeno |
| Konec | `Contract.EndDate` | overeno |
| Zakaznik / firma | `Contract.Directory_FK` | overeno |
| Firma nebo pobocka | `Contract.DirectoryBranch_FK` | overeno |
| Nakladkova adresa | `Contract.Nakladkovaadresa_FK` | overeno |
| Sidlo | `Contract.Sidlo_FK` | existuje, ve vzorku bylo prazdne |
| Zakaznicky manazer | `Contract.DirectoryManager_FK` | existuje, ve vzorku bylo prazdne |
| Prirazen k | `Contract.AssignedToCompany_FK` | existuje, ve vzorku bylo prazdne |
| Vytvoril | `Contract.CreatedBy_FK` | auditni pole, ne obchodnik |
| Schvalil | `Contract.ApprovedBy_FK` | auditni pole, ne obchodnik |
| Zmenil | `Contract.ModifiedBy_FK` | auditni pole |

### Stav smlouvy

Overene hodnoty `Contract.Status_FK`:

| ID | Vyznam |
| ---: | --- |
| 72 | Proposed / navrh |
| 73 | Rejected |
| 74 | SignedActive / aktivni podepsana |
| 75 | SignedClosed |
| 14641 | Pozastavene smlouvy |

### Typ smlouvy

Overene hodnoty `Contract.Typsmlouvy_FK`:

| ID | Vyznam |
| ---: | --- |
| 14735 | Komunal |
| 14737 | Ostatni cinnosti mesicne |
| 14738 | Prumysl |

Overene hodnoty `Contract.Type_FK`:

| ID | Vyznam |
| ---: | --- |
| 77 | Komunal |
| 15840 | Prumysl |
| 15957 | Kombinovana |

### Filtry smluv

Doporuceny zaklad pro aktivni Komunal smlouvy:

```json
{
  "Status_FK": 74,
  "Typsmlouvy_FK": [14735]
}
```

Overeny vysledek k 2026-06-27:

- aktivni Komunal podle filtru: 768 smluv
- po validaci datumu backendem: 759 platnych
- budouci zacatek: 2
- ukonceno podle `EndDate`: 7
- spravny API parametr je `Filter`, ne `Filters`

Kvalita zakladnich poli u 759 datumove platnych smluv:

- chybejici `Nakladkovaadresa_FK_RecordId`: 32 smluv
- u techto 32 smluv existoval fallback na `DirectoryBranch_FK_RecordId`
- GPS u `Nakladkovaadresa_FK_Lat/Long`: 3 smlouvy
- rozpad `Type_FK` ve filtru aktivni Komunal:
  - `77`: 480
  - `15840`: 44
  - `15957`: 232
  - `15953`: 1
  - `76`: 2

Zaver:

- Trasy svozu nesmi spolehat na to, ze Vistos uz ma GPS.
- Vetsina mist bude muset jit do fronty `K doplneni polohy`.
- `Typsmlouvy_FK = 14735` je pro vyber Komunal sirsi a vhodnejsi start nez samotne `Type_FK = 77`.

Volitelne zpřesneni:

```json
{
  "Status_FK": 74,
  "Type_FK": 77,
  "Typsmlouvy_FK": [14735]
}
```

Toto vratilo 488 smluv. Pro Trasy svozu je bezpecnejsi zacit s sirsi variantou
`Status_FK = 74` + `Typsmlouvy_FK = [14735]` a `Type_FK = 77` pouzit jen jako
doplnujici kontrolu.

Datumovou platnost ve Fazi 1E jen diagnostikovat v read-only preview:

```text
StartDate <= today AND (EndDate is null OR EndDate >= today)
```

Jednoduche range filtry pres Vistos API nebyly potvrzene jako spolehlive.
`Contract.StartDate` / `Contract.EndDate` ani `ContractRow.IsActive` / `ContractRow.StartDate` / `ContractRow.EndDate`
nesmi byt ve Fazi 1E tvrdy filtr pro vyrazeni preview. Pokud datum nebo priznak nevychazi,
radek zustava v preview jako `needs_review`.

## Faze 1E - read-only Vistos Komunal preview

Stav: implementacni cil pro modul Trasy svozu.

Faze 1E nacita aktivni Komunal smlouvy z Vistosu pouze pres backend a uklada
jen read-only import preview do pilotnich tabulek modulu Trasy svozu.

Nepovoli:

- ostre trasy,
- planovani svozovych dnu,
- optimalizaci,
- SMS/e-mail notifikace,
- T-Cars alerty,
- Waze/Google geokodovani,
- zapis do Evidence odpadu,
- cloud automatizace pro Trasy svozu.

### Pouzite entity

- `Contract`
- `ContractRow`
- `Product`

### Filtr

```json
{
  "Status_FK": 74,
  "Typsmlouvy_FK": [14735]
}
```

Filtr znamena:

- `Status_FK = 74` = aktivni podepsana smlouva,
- `Typsmlouvy_FK = [14735]` = Komunal.

Datumova platnost se ma kontrolovat az v backend mapovani, protoze range filtr
pres Vistos API neni potvrzeny jako spolehlivy.

### Zdrojova pole pro preview

| Preview pole | Zdroj |
| --- | --- |
| Cislo smlouvy | `Contract.ContractNumber` |
| Zacatek smlouvy | `Contract.StartDate`, diagnostika; neni tvrdy filtr preview |
| Konec smlouvy | `Contract.EndDate`, diagnostika; neni tvrdy filtr preview |
| Zakaznik | `Contract.Directory_FK` |
| Pobocka | `Contract.DirectoryBranch_FK` |
| Nakladkova adresa / stanoviste | `Contract.Nakladkovaadresa_FK`, fallback `DirectoryBranch_FK` |
| Polozka smlouvy | `ContractRow.Name`, `ContractRow.Description` |
| Produkt/sluzba | `ContractRow.Product_FK` -> `Product.Name` / `Product.Caption` |
| Interni Vistos ID smlouvy | `Contract.Id` |
| Interni Vistos ID polozky | `ContractRow.Id` |
| Interni Vistos ID produktu | `Product.Id` |
| Typ odpadu | odvozeni z `Product` a textu produktu |
| Cetnost | odvozeni z `Product` a textu produktu |
| Nadoba/objem/pocet | odvozeni z `Product.Quantity`, nazvu produktu a popisu polozky |

### Pilotni ulozeni v Kaiser Smart

Faze 1E pouziva existujici pilotni tabulky:

- `collection_import_batches`
- `collection_import_rows`
- `collection_customer_sites`
- `collection_site_locations`
- `collection_contract_services`
- `collection_containers`
- `collection_data_issues`

Batch musi mit `source_mode = vistos-komunal-preview`.

### Povinne datove problemy

Preview ma detekovat a zobrazit minimalne:

- chybi zakaznik,
- chybi nakladkova adresa,
- chybi polozky smlouvy,
- neznamy produkt,
- neznamy typ odpadu,
- neznama cetnost,
- chybi nadoba/objem,
- mozna duplicita stanoviste,
- smlouva bez aktivniho rozsahu,
- vice stanovist u jedne smlouvy,
- polozka neni mapovatelna na svoz.

### Secrets a provozni pravidla

- `VISTOS_API_BASE_URL`, `VISTOS_API_USERNAME` a `VISTOS_API_PASSWORD` patri pouze
  do Cloudflare secrets / backend secret store.
- Secrets nesmi byt ve frontendu, dokumentaci, logu ani commitu.
- Pokud secrets chybi, API vrati stav `Vistos API neni nakonfigurovano`.
- Bez konfigurace se nesmi zobrazit fake zakaznicka data.
- Frontend nikdy nevola Vistos primo.

## Zakaznik, pobocka, adresa

| Vyznam | API pole | Doporucene pouziti |
| --- | --- | --- |
| Zakaznik / firma | `Contract.Directory_FK` | hlavni zakaznik |
| Firma nebo pobocka | `Contract.DirectoryBranch_FK` | pobocka / misto zakaznika |
| Nakladkova adresa | `Contract.Nakladkovaadresa_FK` | primarni svozove misto |
| Sidlo | `Contract.Sidlo_FK` | evidencni sidlo, ne route point |

Doporucene mapovani pro Trasy svozu:

- `customerVistosId` = `Directory_FK_RecordId`
- `customerName` = `Directory_FK`
- `siteVistosId` = `Nakladkovaadresa_FK_RecordId`
- `siteName` = `Nakladkovaadresa_FK`
- fallback `siteVistosId` = `DirectoryBranch_FK_RecordId`
- fallback `siteName` = `DirectoryBranch_FK`

GPS:

- Pokud `Nakladkovaadresa_FK_Lat` a `Nakladkovaadresa_FK_Long` existuji, pouzit jako neoverenou polohu z Vistosu.
- Pokud GPS chybi, dat zaznam do fronty `K doplneni polohy`.
- Body bez potvrzene polohy se nesmi vydavat za GPS pravdu.

## ContractRow - polozky smlouvy

| Vyznam | API pole | Stav |
| --- | --- | --- |
| ID polozky smlouvy | `ContractRow.Id` | overeno |
| Vazba na smlouvu | `ContractRow.Contract_FK_RecordId` | overeno |
| Vazba na produkt | `ContractRow.Product_FK_RecordId` | overeno |
| Nazev polozky | `ContractRow.Name` | overeno |
| Popis | `ContractRow.Description` | overeno |
| Mnozstvi | `ContractRow.Quantity` | existuje, ne vzdy vraceno |
| Jednotka | `ContractRow.UOM_FK` | overeno |
| Typ polozky | `ContractRow.Typpolozky_FK` | overeno |
| Interval odvozu | `ContractRow.Intervalodvozu_FK` | existuje, ve vzorku nevyplneno |
| Kategorie odpadu | `ContractRow.Kategorieodpadu_FK` | existuje, ve vzorku nevyplneno |
| Stanoviste | `ContractRow.Stanoviste` | existuje, ve vzorku nevyplneno |
| Zacatek | `ContractRow.StartDate` | existuje, ve vzorku nevyplneno |
| Aktivni | `ContractRow.IsActive` | existuje, ve vzorku nevyplneno |
| Zakazkovy list | `ContractRow.ServiceList_FK` | existuje, ve vzorku nevyplneno |

Priklad overene smlouvy:

- `Contract.Id = 7750`
- `Contract.ContractNumber = SM20260002`
- `Contract.Status_FK = 72` - navrh
- `ContractRow.Id = 34772`
- `ContractRow.Product_FK_RecordId = 5570`
- `ContractRow.Name = 120 ltr SKO 1 x 14 ANO`

Poznamka k filtrovani polozek:

- `GetPageParam` + `Filter: { "Contract_FK": 7750 }` vratil 1 polozku.
- `GetPageParam` + `Filters: { "Contract_FK": 7750 }` vratil nefiltrovany grid.
- Pro import pouzivat vyhradne `Filter`.
- U prvnich 20 datumove platnych aktivnich Komunal smluv vratil `ContractRow`
  pouze 2 polozky u 2 smluv.
- 18 z prvnich 20 smluv nemelo pres `ContractRow` zadnou polozku.
- `ContractRow` proto zatim nepovazovat za jediny zdroj svozovych polozek.

## Product - produkt / nadoba / sluzba

| Vyznam | API pole | Stav |
| --- | --- | --- |
| ID produktu | `Product.Id` | overeno |
| Nazev | `Product.Name` | overeno |
| Popisek | `Product.Caption` | overeno |
| Pocet / ks | `Product.Quantity` | overeno |
| Merna jednotka | `Product.UOM_FK` | overeno |
| Mena | `Product.Currency_FK` | overeno |
| Nakladova cena | `Product.CostPrice` | existuje |
| Cenikova cena | `Product.ListPrice` | existuje |
| Vazena nakladova cena | `Product.WeightedCostPrice` | existuje |
| Sleva / diskont cena | `Product.DiscountPrice` | existuje |
| Velikost | `Product.Size` | existuje |
| Hmotnost | `Product.Weight` | existuje |
| Typ odpadu | `Product.Typodpadu_FK` | existuje |
| Typ odpadu popelnice | `Product.Typodpadupopelnice_FK` | existuje |
| Typ nadoby | `Product.Typnadoby` | existuje |
| Cetnost svozu odpadu | `Product.Cetnostsvozuodpadu_FK` | existuje |
| Service cycle | `Product.ServiceCycle_FK` | existuje |
| Kod druhotnych surovin | `Product.Kod_druhotnych_surovin` | existuje |
| Waste | `Product.Waste` | overeno |

Priklad produktu:

- `Product.Id = 5570`
- `Product.Caption = SKO - 120 ltr SKO 1 x 14 ANO`
- `Product.Name = 120 ltr SKO 1 x 14 ANO`
- `Product.Quantity = 1.0`
- `Product.UOM_FK = 14550`
- `Product.Currency_FK = 970`
- `Product.CostPrice = null`
- `Product.ListPrice = null`
- `Product.WeightedCostPrice = null`

Dalsi vzorek z aktivnich Komunal smluv:

- U 2 nalezenych produktu byly vyplnene:
  - `Product.Quantity`
  - `Product.ListPrice`
  - `Product.Typodpadupopelnice_FK`
  - `Product.Typnadoby`
  - `Product.Cetnostsvozuodpadu_FK`
  - `Product.Waste`
- Pro parser to znamena, ze strukturovana produktova pole existuji a maji prednost
  pred parsovanim nazvu produktu.

Doporuceni:

- Pro pocet ks brat primarne `Product.Quantity`.
- U smluvni polozky si ulozit i `ContractRow.Quantity`, pokud se u jinych smluv zacne vracet.
- Cetnost a objem zatim parsovat i z `Product.Name`, ale preferovat strukturovana pole, pokud budou vyplnena.

## Ceny produktu

Ceny nemusi byt primo v `Product`. Overene cenove entity:

### ProductAccountPrice

Zakaznicka cena pro konkretni produkt a subjekt.

| Vyznam | API pole |
| --- | --- |
| Produkt | `Product_FK` |
| Zakaznik / adresar | `Directory_FK` |
| Fixni cena | `FixedPrice` |
| Cenikova cena | `ListPrice` |
| Sleva procentem | `DiscountPercentage` |
| Sleva castkou | `DiscountAmount` |
| Mena | `Currency_FK` |
| Cena vcetne dane | `TaxIncluded` |

Pro produkt `5570` nebyl nalezen zaznam.

### ProductPrice

Ceny produktu / cenova pasma.

| Vyznam | API pole |
| --- | --- |
| Produkt | `Product_FK` |
| Cenik | `ProductSellingPrice_FK` |
| Cenikova cena | `ListPrice` |
| Pocet od | `ItemsCountFrom` |
| Pocet do | `ItemsCountTo` |
| Mena | `Currency_FK` |
| Cena vcetne dane | `TaxIncluded` |

Pro produkt `5570` nebyl nalezen zaznam.

### ProductSellingPrice

Hlavicka prodejniho ceniku.

| Vyznam | API pole |
| --- | --- |
| Nazev ceniku | `Name` |
| Platnost od | `DateFrom` |
| Platnost do | `DateTill` |
| Mena | `Currency_FK` |
| Sazba dane | `TaxRate_FK` |
| Typ ceny | `PriceType_FK` |
| Sleva procentem | `DiscountPercentage` |
| Marze | `Margin` |
| Rabat | `Rebate` |

Ve vzorku nebyly vraceny radky bez dalsiho filtru.

## ServiceList a ServiceListItem

| Entita | Stav |
| --- | --- |
| `ServiceList` | entita dostupna, ale pro prvnich 10 aktivnich Komunal smluv nevratila vazbu pres `Contract_FK` |
| `ServiceListItem` | dostupne, total pri pruzkumu 390291 |

Doporuceni:

- Pro trasovy import zatim vychazet ze `Contract` + `ContractRow` + `Product`.
- `ServiceListItem` obsahuje prakticka pole pro mnozstvi a ceny:
  - `Quantity`
  - `c_OrderedQuantity`
  - `UnitPrice`
  - `ListPrice`
  - `UnitPriceDiscount`
  - `UnitPriceDiscountPercentage`
- `ServiceList` obsahuje prakticka pole pro zakazku / adresu / kontakt:
  - `Contract_FK`
  - `CustomerCompany_FK`
  - `CustomerBranch_FK`
  - `CustomerContact_FK`
  - `Nakladkovaadresa_FK`
  - `Stanoviste`
  - `Phone`
  - `DateOfServiceList`
  - `DateStart`
  - `DateEnd`
  - `DateOfRealization`
  - `Waste`
- Vazba `Contract -> ServiceList -> ServiceListItem` se ale na vzorku prvnich
  10 aktivnich Komunal smluv nepotvrdila.
- `ServiceListItem` proto pouzit jen jako doplnujici zdroj, dokud Eurosoftworks
  nebo dalsi discovery nepotvrdi spravnou vazbu pro pravidelne svozy.

## Kontakty a kontaktni osoby

Stav: castecne overeno, aktualni API profil zatim nestaci pro spolehlive
cteni kontaktnich osob.

Poznatky:

- V UI existuje URL ve tvaru `#/Contact/edit/<id>`.
- Konkretni UI URL testovana pri pruzkumu: `Contact/edit/117428`.
- `GetPageParam` s `Filter: { "Id": 117428 }` vratil:
  - `Directory`: 0 radku
  - `Contact`: 0 radku
- `GetByIdParam` pro `Directory` a `Contact` s ID `117428` vratil `status: OK`,
  ale prazdna `data`.
- V `DbObject` existuji:
  - `ContactList`
  - `ContactListRow`
  - `Directory`
- `ContactList` a `ContactListRow` maji podle `DbColumn` metadata dostupna.
- Cteni `ContactList` a `ContactListRow` pres `GetPageParam` ale vratilo HTTP 215
  `Unauthorized`.
- Kontakt z URL `Contact/edit/<id>` je tedy pravdepodobne projekce / specialni pohled,
  ktery neni pro aktualni read-only API profil zatim dostupny bez dalsiho nastaveni.

Relevantni pole v `Directory`:

- `FirstName`
- `LastName`
- `MiddleName`
- `Name`
- `Email1`
- `EmailInvoicing`
- `Phone`
- `PhoneNumber`
- `Mobile`
- `SendMailEnabled`
- `Kontaktovatsms`
- `Souhlassezaslanimemailuksvatku`
- `Parent_FK`
- `MasterParent_FK`
- `MainProjection_FK`
- `IsCompany`

Relevantni pole v `ContactList` podle `DbColumn`:

- `Id`
- `MainProjection_FK`
- `Name`
- `SenderEmail`
- `SenderName`

Relevantni pole v `ContactListRow` podle `DbColumn`:

- `Id`
- `Directory_FK`
- `Email1`
- `MainProjection_FK`
- `MasterParent_FK`
- `Name`
- `SendMailEnabled`

Doporuceni:

- Kontakty zatim mapovat jako samostatny neovereny blok.
- Pro SMS/e-mail notifikace nepouzivat kontaktni data ostre, dokud nebude potvrzena vazba:
  - kontakt -> zakaznik
  - kontakt -> pobocka
  - kontakt -> konkretni smlouva nebo sluzba
  - souhlas / typ komunikace
- Od Eurosoftworks potrebujeme potvrdit, jak API cte `Contact/edit/<id>`, nebo doplnit
  read-only opravneni pro `ContactList` / `ContactListRow` / prislusnou projekci.

## Upozornovaci SMS 15/30/60 minut predem

Stav: budouci pozadavek na Vistos, zatim neexistujici pole.

Upresneni od Radima:

- Pole pro upozornovaci SMS 15/30/60 minut predem se musi ve Vistosu teprve vytvorit.
- Aktualne se nesmi mapovat jako existujici nebo overene Vistos pole.
- Kaiser Smart s tim ma pocitat jako s budoucim zdrojem dat.

Doporuceny cilovy model ve Vistosu:

- priznak, zda zakaznik/sluzba chce upozornovaci SMS,
- typ upozorneni: 15 / 30 / 60 minut predem,
- kontaktni telefon pro SMS,
- kontaktni osoba,
- vazba na smlouvu, sluzbu nebo konkretni stanoviste,
- informace, zda je kontakt opravnene pouzit pro provozni SMS,
- datum posledni zmeny,
- kdo pole naposledy zmenil.

Doporucene rozhodnuti pred implementaci:

- Pokud je SMS nastaveni spolecne pro celou smlouvu, ulozit ho na `Contract`.
- Pokud se SMS nastaveni lisi podle mista nebo sluzby, ulozit ho radeji na uroven `ContractRow` nebo stanoviste.
- Pokud se ma SMS posilat ruznym osobam podle stanoviste, musi byt vazba na kontaktni osobu / telefon primo u stanoviste nebo sluzby.

Kaiser Smart mapovani zatim:

- `sms_notice_enabled` = zatim neexistuje ve Vistosu
- `sms_notice_minutes_json` = zatim neexistuje ve Vistosu
- `sms_notice_contact_vistos_id` = zatim neexistuje ve Vistosu
- `sms_notice_phone` = zatim neexistuje jako schvalene zdrojove pole pro tento ucel

Zakazane interpretace:

- Nepouzivat automaticky `Kontaktovatsms` jako potvrzeni pro 15/30/60 minut predem.
- Nepouzivat libovolny `Mobile` nebo `Phone` bez potvrzene vazby a souhlasu.
- Netvrdit, ze SMS upozorneni je napojene na Vistos, dokud pole nevznikne a nebude overeno.

## Zakaznicky manazer a prirazeni

| UI / vyznam | API pole | Poznamka |
| --- | --- | --- |
| Zakaznicky manazer | `Contract.DirectoryManager_FK` | reference na `dbo.Directory`; ve vzorcich prazdne |
| Prirazen k | `Contract.AssignedToCompany_FK` | reference na `crm.User`; ve vzorcich prazdne |
| Vytvoril | `Contract.CreatedBy_FK` | auditni pole |
| Schvalil | `Contract.ApprovedBy_FK` | auditni pole |
| Zmenil | `Contract.ModifiedBy_FK` | auditni pole |

U aktivnich Komunal smluv bylo:

- `DirectoryManager_FK`: 0 vyplnenych ve vzorku
- `AssignedToCompany_FK`: 0 vyplnenych ve vzorku

Proto tato pole zatim nepovazovat za povinna.

## Doporucene DB mapovani v Kaiser Smart

### Smlouva

- `contract_vistos_id` <- `Contract.Id`
- `contract_number` <- `Contract.ContractNumber`
- `contract_name` <- `Contract.Name`
- `contract_status_id` <- `Contract.Status_FK`
- `contract_type_id` <- `Contract.Type_FK`
- `contract_type_ids_json` <- `Contract.Typsmlouvy_FK`
- `valid_from` <- `Contract.StartDate` nebo `ContractRow.StartDate` podle dostupneho detailu; ve Fazi 1E diagnostika, ne tvrdy filtr
- `valid_to` <- `Contract.EndDate` nebo `ContractRow.EndDate` podle dostupneho detailu; ve Fazi 1E diagnostika, ne tvrdy filtr

### Zakaznik a stanoviste

- `customer_vistos_id` <- `Contract.Directory_FK_RecordId`
- `customer_name` <- `Contract.Directory_FK`
- `branch_vistos_id` <- `Contract.DirectoryBranch_FK_RecordId`
- `branch_name` <- `Contract.DirectoryBranch_FK`
- `site_vistos_id` <- `Contract.Nakladkovaadresa_FK_RecordId`
- `site_name` <- `Contract.Nakladkovaadresa_FK`
- `site_lat` <- `Nakladkovaadresa_FK_Lat`
- `site_lng` <- `Nakladkovaadresa_FK_Long`
- `site_location_status` <- `vistos_unverified` nebo `missing`

### Polozka smlouvy

- `contract_row_vistos_id` <- `ContractRow.Id`
- `contract_vistos_id` <- `ContractRow.Contract_FK_RecordId`
- `product_vistos_id` <- `ContractRow.Product_FK_RecordId`
- `row_name` <- `ContractRow.Name`
- `row_description` <- `ContractRow.Description`
- `row_quantity` <- `ContractRow.Quantity`
- `row_uom_id` <- `ContractRow.UOM_FK`
- `row_type_id` <- `ContractRow.Typpolozky_FK`

### Produkt / nadoba / sluzba

- `product_vistos_id` <- `Product.Id`
- `product_name` <- `Product.Name`
- `product_caption` <- `Product.Caption`
- `container_count` <- `Product.Quantity`
- `uom_id` <- `Product.UOM_FK`
- `currency_id` <- `Product.Currency_FK`
- `waste_type_id` <- `Product.Typodpadu_FK`
- `container_waste_type_id` <- `Product.Typodpadupopelnice_FK`
- `container_type_raw` <- `Product.Typnadoby`
- `service_frequency_id` <- `Product.Cetnostsvozuodpadu_FK`
- `service_cycle_id` <- `Product.ServiceCycle_FK`
- `secondary_material_code` <- `Product.Kod_druhotnych_surovin`
- `list_price` <- `Product.ListPrice`
- `cost_price` <- `Product.CostPrice`
- `weighted_cost_price` <- `Product.WeightedCostPrice`

### Ceny

- `account_price_vistos_id` <- `ProductAccountPrice.Id`
- `product_vistos_id` <- `ProductAccountPrice.Product_FK_RecordId`
- `directory_vistos_id` <- `ProductAccountPrice.Directory_FK_RecordId`
- `fixed_price` <- `ProductAccountPrice.FixedPrice`
- `list_price` <- `ProductAccountPrice.ListPrice`
- `discount_percentage` <- `ProductAccountPrice.DiscountPercentage`
- `discount_amount` <- `ProductAccountPrice.DiscountAmount`
- `currency_id` <- `ProductAccountPrice.Currency_FK`
- `tax_included` <- `ProductAccountPrice.TaxIncluded`

## Co je overene

- Login a read-only grid dotazy pres `GetPageParam`.
- Vistos API vyzaduje stejnou cookie session po loginu.
- `GetPageParam` filtruje pres `Filter`; `Filters` se ignoruje.
- `GetByIdParam` funguje pro detail entity, pokud je entita a zaznam dostupny profilu.
- `Contract` dostupny a obsahuje smlouvy.
- Aktivni Komunal filtr pres `Status_FK = 74` a `Typsmlouvy_FK = [14735]`; datumova platnost `Contract.StartDate` / `Contract.EndDate` a `ContractRow.IsActive` / `ContractRow.StartDate` / `ContractRow.EndDate` je ve Fazi 1E diagnostika, ne tvrde vyrazeni preview.
- `Contract.ContractNumber` je cislo smlouvy.
- `ContractRow` vraci polozky smlouvy pres `Contract_FK`.
- `ContractRow.Product_FK_RecordId` vede na `Product`.
- `Product.Quantity` vraci pocet / ks u overeneho produktu.
- `Nakladkovaadresa_FK` je nejlepsi kandidat pro svozove misto.
- FK pole mohou vracet `Lat` a `Long`.

## Co neni overene

- Presna vazba kontaktu z URL `Contact/edit/<id>` do API.
- Cteni `ContactList` a `ContactListRow` je pro aktualni API profil blokovane
  stavem `Unauthorized`.
- Prime cteni `Directory` / `Contact` pro testovane ID z UI vratilo prazdna data.
- Kde jsou vyplnene kontaktni osoby pro SMS/e-mail notifikace.
- Pole pro upozornovaci SMS 15/30/60 minut predem. Podle Radima se musi ve Vistosu teprve vytvorit.
- Ktera cenova tabulka je v praxi zdrojem ceny u vsech typu smluv.
- Zda se cetnost vzdy spolehlive vraci ve strukturovanem poli, nebo se musi parsovat z nazvu produktu.
- Zda `ServiceListItem` lepe odpovida realnym svozovym polozkam nez `ContractRow` u vsech smluv.

## Doporuceny dalsi discovery postup

1. Vybrat smlouvu, kde je ve Vistos UI jasne videt cena.
2. Overit `ContractRow`, `Product`, `ProductAccountPrice`, `ProductPrice`.
3. Vybrat kontaktni osobu z UI `Contact/edit/<id>`.
4. Nechat potvrdit od Eurosoftworks presne API mapovani `Contact/edit/<id>` nebo
   doplnit read-only opravneni na kontaktni projekci.
5. Overit smlouvu s vice polozkami a vice stanovisti.
6. Overit aktivni smlouvy Komunal s plnou sadou poli pro svoz.
7. Po vytvoreni SMS poli ve Vistosu overit jejich technicke nazvy pres `DbColumn`.

## Zakazane pouziti

- Netahat Vistos data z frontendu.
- Necommitovat hesla, tokeny, API klice ani exporty s osobnimi/provoznimi daty.
- Nedelat ostry import bez auditovatelneho backend procesu.
- Neposilat SMS/e-mail na zaklade techto dat bez samostatne schvalene cloud automatizace.
- Neoznacovat read-only discovery jako hotove napojeni.
