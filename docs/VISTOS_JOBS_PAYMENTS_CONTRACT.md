# Zakázky a úhrady Vistos — implementační kontrakt

Stav 25. 10. 2026: pouze vývojová větev, NENASAZENO. Výchozí aktuálně načtený main je `c37cd96b3313ad5d8678e1018f76bf1b9d98f72e`, shodný se zadáním. Neznamená to ověřenou produkční verzi. Repozitář: `kaiser-smart/kaiser-control-center`. Zápis Payment v main nebyl nalezen; otevřené PR hledání „Vistos Payment“ nevrátilo konkurující implementaci. Existující čtecí audit, klient, bankovní matches, identity vozidel a GPS collector se zachovávají.

## Důkaz a omezení

Autorizovaný pokus o čtení `https://smart-odpady.ai/api/fleet/vistos-job-evidence?sample=1` skončil odpovědí `Nepřihlášeno.` Žádná produkční přihlášení, schema/list/detail, kapacita D1 ani testovací účetní operace nebyly doloženy. Bylo načteno **0 živých řádků**, provedeno **0 zápisů do Vistosu**. Původní přílohy jsou podklady; jejich historická tvrzení nejsou vydávána za aktuální ověření.

Registr obsahuje 144 požadovaných polí. Aktuální dostupnost zdrojů není ověřena u 144/144 položek (100 % z hlediska nového živého auditu). To neznamená, že všechna pole chybějí; část je dokumentovaná manuálem nebo historickým auditem a část je lokální metadata. M = manuál, H = historicky pozorované pole, K = kandidát v kódu, P = požadavek bez doložené cesty, L = lokální metadata. Jejich původní klasifikace zůstává v JSON registru.

Následující cesty jsou **kandidáti, nikoli nově ověřené skutečné cesty**. `runtime_verification.actual_path` zůstává null. Význam určuje dodaný registr; konfigurace nesmí zaměnit schema existenci za sémantické potvrzení. Nové neklasifikované pole se uloží serverově, ale nevydá ani technickému správci. Rozbalené FK objekty se omezují na ID, aby přes provozní pole neunikla vnořená osobní nebo finanční data.

| Požadované pole | Význam | Kandidátní cesta | Očekávaný typ | List / detail nyní | Důkaz | Klasifikace |
|---|---|---|---|---|---|---|
| job.id | ID zakázkového listu | Id | source_id | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job.number | Číslo zakázkového listu | Number | string | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job.source_status | Původní stav | Status_FK | reference | NEOVĚŘENO / NEOVĚŘENO | H | operational |
| job.is_done | Příznak dokončení | IsDone | boolean | NEOVĚŘENO / NEOVĚŘENO | H | operational |
| job.parent | Nadřazený dokument | MasterParent_FK | reference | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job.created | Vytvořeno ve Vistosu | Created | source_datetime | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job.modified | Změněno ve Vistosu | Modified | source_datetime | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job.document_date | Datum zakázkového listu | DateOfServiceList | source_date_or_datetime | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job.realization_date | Datum realizace ze zdroje | DateOfRealization | source_date_or_datetime | NEOVĚŘENO / NEOVĚŘENO | H | operational |
| job.date_start | DateStart ze zdroje | DateStart | source_datetime | NEOVĚŘENO / NEOVĚŘENO | H | operational |
| job.date_end | DateEnd ze zdroje | DateEnd | source_datetime | NEOVĚŘENO / NEOVĚŘENO | H | operational |
| job.resolution_start | StartOfResolution ze zdroje | StartOfResolution | source_datetime | NEOVĚŘENO / NEOVĚŘENO | H | operational |
| job.resolution_end | EndOfResolution ze zdroje | EndOfResolution | source_datetime | NEOVĚŘENO / NEOVĚŘENO | H | operational |
| job.customer | Zákazník | CustomerCompany_FK | reference | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job.branch | Provozovna zákazníka | CustomerBranch_FK | reference | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job.contact | Kontaktní osoba zákazníka | CustomerContact_FK | reference | NEOVĚŘENO / NEOVĚŘENO | K | personal |
| job.phone | Telefon u zakázky | Phone | string | NEOVĚŘENO / NEOVĚŘENO | K | personal |
| job.service_address | Nakládková / servisní adresa | Nakladkovaadresa_FK | reference | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job.site | Stanoviště | Stanoviste | source_value | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job.contract | Smlouva | Contract_FK | reference | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job.waste | Odpad ze zdroje | Waste | source_value | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job.vehicle | Vozidlo ze zdroje | Auto_FK | reference | NEOVĚŘENO / NEOVĚŘENO | H | operational |
| job.allocated_vehicles | Přidělená vozidla | AllocatedVehicle | reference_or_reference_array | NEOVĚŘENO / NEOVĚŘENO | H | operational |
| job.driver_contact | Řidič ze zdroje | RidicContact_FK | reference | NEOVĚŘENO / NEOVĚŘENO | H | personal |
| job.finance.Currency_FK | Měna zakázky | Currency_FK | reference | NEOVĚŘENO / NEOVĚŘENO | H | financial |
| job.finance.PriceWithoutTax | Cena zakázky bez DPH | PriceWithoutTax | decimal | NEOVĚŘENO / NEOVĚŘENO | H | financial |
| job.finance.PriceTax | DPH zakázky | PriceTax | decimal | NEOVĚŘENO / NEOVĚŘENO | H | financial |
| job.finance.PriceWithTax | Cena zakázky s DPH | PriceWithTax | decimal | NEOVĚŘENO / NEOVĚŘENO | H | financial |
| job.finance.TransferredTaxLiability | Přenesená daňová povinnost | TransferredTaxLiability | boolean | NEOVĚŘENO / NEOVĚŘENO | K | financial |
| job.company | Právnická osoba / firma KAISER | Není doložena | reference | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.kind | Typ služby | Není doložena | reference_or_string | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.description | Popis práce | Není doložena | string | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.customer_ico | IČO zákazníka | Není doložena | string | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.customer_dic | DIČ zákazníka | Není doložena | string | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.customer_email | E-mail zákazníka | Není doložena | string | NEOVĚŘENO / NEOVĚŘENO | P | personal |
| job.other_stops | Další místa / zastávky | Není doložena | array | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.coordinates | Souřadnice servisního místa | Není doložena | coordinates | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.crew | Další členové posádky | Není doložena | reference_array | NEOVĚŘENO / NEOVĚŘENO | P | personal |
| job.planned_duration | Potvrzená plánovaná délka | Není doložena | duration | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.actual_segments | Skutečné úseky práce | Není doložena | array | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.waste_code | Katalogové číslo odpadu | Není doložena | string | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.waste_category | Kategorie odpadu | Není doložena | string | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.measured_weight | Skutečně naměřená hmotnost | Není doložena | quantity_with_unit | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.measured_volume | Skutečně naměřený objem | Není doložena | quantity_with_unit | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.order_link | Obchodní objednávka | Není doložena | reference_array | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.invoice_links | Vazby na faktury | Není doložena | reference_array | NEOVĚŘENO / NEOVĚŘENO | P | financial |
| job.invoice_allocations | Doložená alokace částky k faktuře | Není doložena | array | NEOVĚŘENO / NEOVĚŘENO | P | financial |
| job.instructions | Pokyny k provedení | Není doložena | sanitized_text | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.notes | Poznámky | Není doložena | sanitized_text | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job.attachments | Metadata příloh / dokumentů / fotek | Není doložena | array | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| job_item.Id | ID položky | Id | source_id | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job_item.ServiceList_FK | Zakázkový list položky | ServiceList_FK | reference | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job_item.MasterParent_FK | Nadřazený záznam položky | MasterParent_FK | reference | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job_item.ContractRow_FK | Smluvní položka | ContractRow_FK | reference | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job_item.Product_FK | Produkt / služba položky | Product_FK | reference | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job_item.Quantity | Množství ze zdroje | Quantity | decimal | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job_item.c_OrderedQuantity | Objednané množství ze zdroje | c_OrderedQuantity | decimal | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job_item.Status_FK | Stav položky | Status_FK | reference | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job_item.IsDone | Příznak dokončení položky | IsDone | boolean | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job_item.DateOfRealization | Datum realizace položky | DateOfRealization | source_date_or_datetime | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job_item.Created | Vytvoření položky | Created | source_datetime | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job_item.Modified | Změna položky | Modified | source_datetime | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| job_item.finance.UnitPrice | Jednotková cena | UnitPrice | decimal | NEOVĚŘENO / NEOVĚŘENO | K | financial |
| job_item.finance.ListPrice | Ceníková cena | ListPrice | decimal | NEOVĚŘENO / NEOVĚŘENO | K | financial |
| job_item.finance.UnitPriceDiscount | Sleva na jednotku | UnitPriceDiscount | decimal | NEOVĚŘENO / NEOVĚŘENO | K | financial |
| job_item.finance.UnitPriceDiscountPercentage | Sleva v procentech | UnitPriceDiscountPercentage | decimal | NEOVĚŘENO / NEOVĚŘENO | K | financial |
| job_item.finance.TaxIncluded | Daň zahrnuta v ceně | TaxIncluded | boolean | NEOVĚŘENO / NEOVĚŘENO | K | financial |
| job_item.finance.TaxRate_FK | Sazba DPH | TaxRate_FK | reference | NEOVĚŘENO / NEOVĚŘENO | K | financial |
| job_item.finance.PriceWithoutTax | Položka bez DPH | PriceWithoutTax | decimal | NEOVĚŘENO / NEOVĚŘENO | K | financial |
| job_item.finance.PriceTax | DPH položky | PriceTax | decimal | NEOVĚŘENO / NEOVĚŘENO | K | financial |
| job_item.finance.PriceWithTax | Položka s DPH | PriceWithTax | decimal | NEOVĚŘENO / NEOVĚŘENO | K | financial |
| job_item.finance.Currency_FK | Měna položky | Currency_FK | reference | NEOVĚŘENO / NEOVĚŘENO | K | financial |
| job_item.unit | Jednotka množství | Není doložena | reference_or_string | NEOVĚŘENO / NEOVĚŘENO | P | unclassified |
| invoice.Id | ID faktury Vistos | Id | source_id | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| invoice.InvoiceNumber | Číslo faktury | InvoiceNumber | string | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| invoice.Currency_FK | Měna faktury | Currency_FK | reference | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| invoice.PriceWithTax | Částka faktury s DPH | PriceWithTax | decimal_nullable | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| invoice.AmountPaid | Evidované úhrady Vistos | AmountPaid | decimal_nullable | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| invoice.AmountPaidProformaInvoice | Odpočet zálohových faktur | AmountPaidProformaInvoice | decimal_nullable | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| invoice.RemainToPay | Zůstatek Vistos | RemainToPay | decimal | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| invoice.IsPaid | Příznak úhrady Vistos | IsPaid | boolean | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| invoice.InAccounting | Evidence v účetnictví | InAccounting | boolean | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| invoice.Modified | Změna faktury ve Vistosu | Modified | source_datetime | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| invoice.company | Firma vystavitele | Není doložena | source_value | NEOVĚŘENO / NEOVĚŘENO | P | financial |
| invoice.customer | Zákazník faktury | Není doložena | source_value | NEOVĚŘENO / NEOVĚŘENO | P | financial |
| invoice.money_id | Identita faktury v Money | Není doložena | source_value | NEOVĚŘENO / NEOVĚŘENO | P | financial |
| invoice.fully_paid_date | Autoritativní datum úplného doplacení | Není doložena | source_value | NEOVĚŘENO / NEOVĚŘENO | P | financial |
| payment.Id | ID Payment ve Vistosu | Id | source_id | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| payment.InvoiceIssued_FK | Faktura úhrady | InvoiceIssued_FK | reference | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| payment.Amount | Částka alokace | Amount | decimal_nullable | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| payment.Date | Datum evidence Vistos | Date | source_date | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| payment.Currency_FK | Měna úhrady | Currency_FK | reference | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| payment.PaymentType_FK | Směr platby | PaymentType_FK | reference | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| payment.Type_FK | Způsob platby | Type_FK | reference_nullable | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| payment.Ext_ID | Externí ID podle Vistosu | Ext_ID | string_nullable | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| payment.AdvancedPayment | Příznak zálohové platby | AdvancedPayment | boolean | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| payment.BusinessUnit_FK | Firma platby | BusinessUnit_FK | reference_nullable | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| payment.Directory_FK | Adresářová vazba | Directory_FK | reference_nullable | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| payment.Modified | Změna Payment | Modified | source_datetime | NEOVĚŘENO / NEOVĚŘENO | M | financial |
| meta.source_installation | Instalace zdroje | Není doložena | string | NEOVĚŘENO / NEOVĚŘENO | L | operational |
| meta.imported_at | Načteno do Smartu | Není doložena | instant | NEOVĚŘENO / NEOVĚŘENO | L | operational |
| meta.mapping_version | Verze mapování | Není doložena | string | NEOVĚŘENO / NEOVĚŘENO | L | operational |
| meta.source_hash | Fingerprint zdrojových hodnot | Není doložena | string | NEOVĚŘENO / NEOVĚŘENO | L | operational |
| meta.availability | Dostupnost jednotlivých polí | Není doložena | enum | NEOVĚŘENO / NEOVĚŘENO | L | operational |
| meta.extensions | Další dostupné oborové údaje | Není doložena | object | NEOVĚŘENO / NEOVĚŘENO | L | unclassified |
| allocation.id | Stálé ID alokace Smart | Není doložena | string | NEOVĚŘENO / NEOVĚŘENO | L | financial |
| allocation.bank_transaction_id | ID bankovní transakce | Není doložena | string | NEOVĚŘENO / NEOVĚŘENO | L | financial |
| allocation.booking_date | Datum zaúčtování v bance | Není doložena | date | NEOVĚŘENO / NEOVĚŘENO | L | financial |
| allocation.revision | Neměnná revize alokace | Není doložena | integer | NEOVĚŘENO / NEOVĚŘENO | L | financial |
| allocation.export_authority | Výlučný zapisovatel | Není doložena | enum | NEOVĚŘENO / NEOVĚŘENO | L | financial |
| allocation.vistos_payment_id | Výsledek zápisu Vistos | Není doložena | source_id_nullable | NEOVĚŘENO / NEOVĚŘENO | L | financial |
| allocation.transfer_status | Stav přenosu | Není doložena | enum | NEOVĚŘENO / NEOVĚŘENO | L | financial |
| allocation.confirmation_method | Způsob potvrzení alokace | Není doložena | enum | NEOVĚŘENO / NEOVĚŘENO | L | financial |
| allocation.confirmation_evidence | Důkaz potvrzení alokace | Není doložena | object | NEOVĚŘENO / NEOVĚŘENO | L | financial |
| allocation.operation_kind | Druh účetního příkazu | Není doložena | enum | NEOVĚŘENO / NEOVĚŘENO | L | financial |
| allocation.reservation | Rezervace bankovní částky | Není doložena | object | NEOVĚŘENO / NEOVĚŘENO | L | financial |
| tracking.trip.id | ID jízdy T-Cars | jizdaId | source_id | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.trip.started_at | Začátek jízdy T-Cars | jizdaOd | source_datetime | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.trip.ended_at | Konec jízdy T-Cars | jizdaDo | source_datetime | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.trip.origin | Počáteční místo ze zdroje | jizdaOdkud | string | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.trip.destination | Cílové místo ze zdroje | jizdaKam | string | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.trip.distance | Vzdálenost jízdy | jizdaDelkaKm | decimal | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.trip.odometer_start | Počáteční stav tachometru | jizdaStavKmPocatek | decimal | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.trip.odometer_end | Koncový stav tachometru | jizdaStavKmKonec | decimal | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.trip.engine_hours_start | Počáteční stav motohodin | jizdaStavMthPocatek | decimal | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.trip.engine_hours_end | Koncový stav motohodin | jizdaStavMthKonec | decimal | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.trip.driver | Řidič podle T-Cars | jizdaRidic | provider_person_reference | NEOVĚŘENO / NEOVĚŘENO | K | personal |
| tracking.trip.responsible | Odpovědná osoba podle T-Cars | jizdaOdpovedny | provider_person_reference | NEOVĚŘENO / NEOVĚŘENO | K | personal |
| tracking.trip.private | Soukromá jízda | jizdaSoukroma | boolean | NEOVĚŘENO / NEOVĚŘENO | K | personal |
| tracking.gps.point_id | ID bodu poskytovatele | id | source_id | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.gps.observed_at | Původní GPS čas | datumCas | source_datetime | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.gps.valid | Platnost GPS fixu | gpsValid | boolean_nullable | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.gps.latitude | Zeměpisná šířka | latitude | decimal | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.gps.longitude | Zeměpisná délka | longitude | decimal | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.gps.speed | Rychlost ze zdroje | rychlost | decimal_nullable | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.gps.ignition | Zapalování | zapalovani | boolean_nullable | NEOVĚŘENO / NEOVĚŘENO | K | operational |
| tracking.gps.switch | Přepínač bez potvrzeného významu | prepinac | boolean_nullable | NEOVĚŘENO / NEOVĚŘENO | K | unclassified |
| execution.arrival_bounds | Časové rozmezí příjezdu | Není doložena | datetime_interval | NEOVĚŘENO / NEOVĚŘENO | L | operational |
| execution.departure_bounds | Časové rozmezí odjezdu | Není doložena | datetime_interval | NEOVĚŘENO / NEOVĚŘENO | L | operational |
| execution.visit_duration_bounds | Rozmezí pozorované doby na místě | Není doložena | duration_interval | NEOVĚŘENO / NEOVĚŘENO | L | operational |
| execution.association | Stav přiřazení | Není doložena | enum | NEOVĚŘENO / NEOVĚŘENO | L | operational |
| execution.coverage | Pokrytí a mezery časových dat | Není doložena | object | NEOVĚŘENO / NEOVĚŘENO | L | operational |
| execution.evidence | Podklady a verze časového odvození | Není doložena | object | NEOVĚŘENO / NEOVĚŘENO | L | operational |
| execution.technology_time | Doložený chod technologie | Není doložena | duration_nullable | NEOVĚŘENO / NEOVĚŘENO | P | operational |

## Ukládání a autorita

- `vistos_source_records` v ARCHIVE je společný zdrojový snímek pro ServiceList, ServiceListItem, InvoiceIssued a Payment. Nahrazuje navržené samostatné `vistos_jobs` / `vistos_job_items`; entity + installation + source_id je unikátní klíč. `parent_id`, pole FK/RecordId, `vehicle_ids_json` a informace o dostupnosti tvoří zdrojové vazby, nikoli odhadnuté HR přiřazení.
- `fields_json` zachovává poslední hodnotu, datum jejího pozorování, list/detail a stav dostupnosti. Missing nesmaže detail. Autoritativní detail null vyprázdní hodnotu. Starší Modified, ani detail bez verze nad známou novější verzí, nepřepíše uložený stav.
- CORE obsahuje explicitní firemní přístupy, schválený kontrakt, potvrzení existujících bankovních matches, příkazy a zámky. Potvrzená alokace nevzniká ze skóre `matched`.
- AUDIT obsahuje běhy a přechody; ARCHIVE a CORE mají transakční frontu pro doručení auditu. Replay podle event ID je idempotentní. Detaily i souhrny mají atomický zápis s lokální událostí.
- `job_execution_evidence` je verzovaný odvozený podklad. Potvrzení člověka je samostatné v CORE, vždy k konkrétní revizi. Nikdy nevytváří mzdu nebo chybějící čas.
- Finanční čtení v nové záložce používá přímo aktuální zdrojové souhrny a jednotlivé Payment; nepoužívá legacy `max(old,new)`. Starý návrh bankovního párování zůstává oddělen. Odkaz v existujícím detailu faktury vede na zdrojový účetní stav. Staré dashboardové agregace nebyly předefinovány na nový instalační kontrakt.

## Podmínky instalace

Žádný instalační kontrakt ani firemní grant není seedován. Správce musí doložit `companyIds`, u každé entity `readVerified`, `orderVerified`, `idOrder`, `columns`, ověřené významy `verifiedFields`, firemní cestu nebo doložený fixní firemní rozsah. `plannedField` / `plannedEndField` se zapnou jen pro potvrzenou bázi termínu. `modifiedFilterVerified` je samostatné pro každou entitu. Detail vyžaduje `detailVerified` a `detailColumns`; položky `parentField`.

Přiřazení lidí zůstává „nepřiřazeno“, dokud není doložen historický HR kontrakt. Všechny zdrojové vazby vozidel se uchovávají. T-Cars obohacení používá existující `fleet_vehicle_external_aliases`, pouze explicitní `metadata_json.verified=true` a `source_system`, platnost v celém intervalu. Současná SPZ ani automatický master alias nejsou historický důkaz.

Tracking kontrakt vyžaduje doloženou úplnost a soukromost knihy jízd, zdrojové pásmo a důkaz (`tripCompletenessVerified`, `tripPrivacyVerified`, `timeZone`, `timeZoneEvidenceId`). `siteField` + `siteLinks` odkazují na konkrétní potvrzenou `collection_site_locations`, ověřený radius/polygon, důkaz a explicitní vyloučení překryvu. Není výchozí univerzální radius. Více vozidel zůstává viditelně ke kontrole; žádné první vozidlo se nevybere potichu. Související jízda bez ověřené identity cílového místa se nepřiřadí jen podle popisku.

Writer má oddělené podmínky: ověřené oprávnění, accounting model, přepočet, externí klíč a filtr, směr přijaté úhrady, měna/přesnost, test template a desetinného wire formátu, testy jednotlivých operací, částečné/vícenásobné/poslední storno, politika jediného zapisovatele pro firmu+KB účet+časový interval. Bez všech podmínek je blokovaný. To jsou doklady instalace, ne přepínače k vyplnění odhadem.

## Časová jistota

Pražský den respektuje DST. Nejednoznačný opakovaný lokální čas se nepřevádí odhadem. Hledání použije ověřený interval ±2 h nebo ověřený místní den. Minutový collector zůstává jediným zdrojem GPS; doplněna validita, původní timestamp/ID, ignition a null rychlost. Historie se čte klíčovým kurzorem, nejvýše 7 dnů na interval; překročený limit dávky znamená explicitní neúplnost. Retence zůstává 30 dnů.

Pobyt vyžaduje tři různé validní body nejméně dvě minuty, známou rychlost 0–5 km/h, ověřené místo, celé historické přiřazení a jedinou kandidátní zakázku. Příjezd/odjezd jsou intervaly mezi zdrojovými body. Mezery >2 min, chybějící odjezd nebo neúplný kurzor nedovolí dokončenou dobu. Soukromé překrytí nevydá body návštěvy. GPS neurčuje řidiče, práci čerpadla ani odpracované hodiny.
