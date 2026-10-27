# Řidič dne — implementace a podklady

Stav: implementováno lokálně, **nenasazeno**, produkční bodování nezapnuto.
Kód nevytváří vítěze z GPS ani z pouhého přiřazení ve Vozovém parku.
Nejde o dokončenou integraci skutečných směn. Bez ní není naplněno celé zadání.

## Upřesnění skutečného provozu od uživatele (27. 10. 2026)

Samostatná evidence skutečných směn, přestávek a potvrzených kontrol neexistuje.
Možnými zdroji jsou Zakázky a T-Cars; Zakázky se průběžně doplňují se zpožděním
oproti dni provedení. Nejde tedy pouze o dočasný výpadek importu.

- Dnešní T-Cars může sloužit jako provozní přehled vozidel. Existující parser jízd
  čte začátek/konec, kilometry, soukromou jízdu a případného řidiče ze zdroje.
  Dostupnost těchto polí u konkrétních jízd ani historická identita řidiče tím není ověřena.
- Čas jízdy není délka směny; stání nerozlišuje práci, přestávku či čekání.
  Zakázka ani GPS nepotvrzuje kvalitu, zavinění ztráty nebo úplnost dne.
- Datum provedení, datum příjmu dat a datum výpočtu zůstávají rozdílné.
  Pozdní úplný a ověřený podklad se vyhodnotí zpětně za skutečný den; datum se
  nepřepisuje na den importu. Detail nyní umožňuje vybrat libovolný minulý den.
- Není stanoven umělý pevný odklad D+1/D+7 ani automatické uzavření neúplného dne.
  Čerstvý import nepotvrzuje úplnost; uzávěrka v 07:00 je pouze nejdřívější možnost.
- Původní skóre 50/30/20 se z těchto dvou zdrojů samo nedopočítá. Dokud nejsou
  potřebné skutečnosti doložené, výsledek zůstává nehodnocený, bez vítěze.
  Nové zjednodušené bodování pouze z telemetrie nebylo zavedeno.

Tato úprava přidává podporu opožděných historických výsledků, nikoli hotový automatický
adaptér ani náhradu chybějící evidence. Dnešní provozní údaje zůstávají ve stávající mapě.

## Skutečně ověřené zdroje (27. 10. 2026, přibližně 11:54 Europe/Prague)

Read-only kontrola přes přihlášený Cloudflare Dashboard; účet
`3b25838c1e15dbfe5f3ac0c273826576`, databáze `SMART_ODPADY_ARCHIVE`
`b10566be-ebb1-414c-beab-eac03f1a909b`. Žádný produkční zápis.

| Zdroj | Ověřený výsledek | Význam pro hodnocení |
|---|---|---|
| `vistos_source_records`, ServiceList | 806 záznamů, 20 různých nenulových `driver_id`; poslední `received_at` 2026-10-27T10:45:10.717Z | Zakázky a reference, nikoli důkaz přítomnosti řidiče |
| stejná tabulka, ServiceListItem | 2 550 záznamů, 0 nenulových referencí řidiče; poslední příjem 2026-10-27T10:52:21.502Z | Položky nejsou ověřenými pracovními etapami |
| `job_execution_evidence` | 0 záznamů | Chybí podklady ověřené realizace |
| `vistos_execution_checks` | 0 záznamů | Chybí podklady kontrol realizace |
| názvy tabulek archivu obsahující shift/execution/driver/assignment/norm | pouze dvě výše uvedené tabulky realizací | Archiv nedokládá hotový registr směn a norem; nevylučuje jiný externí zdroj |

Čtení přes CLI se zastavilo na macOS Keychain `exit 51`. Pro omezený audit se podařil
přístup webovým dashboardem. Počty jsou momentální snímek, nikoli potvrzení úplného importu.

Použité existující rozhraní v kódu: `authorizedIntegrationScope` a
`vistos_company_access` pro oprávnění ke konkrétní instalaci a firmě;
`/api/vehicle-tracking/status` pro mapu a kanonické ID vozidla;
`/api/fleet/vistos-job-evidence` a existující čtečky Vistos pro audit významu polí.
Vistos používá `ServiceList.Id`, `RidicContact_FK`, `Auto_FK` / `AllocatedVehicle`,
`DateStart`, `DateEnd`, `StartOfResolution`, `EndOfResolution`, `IsDone`, `Status_FK`
a vazbu `ServiceListItem.ServiceList_FK`. Dostupnost nebo název pole sám o sobě
neprokazuje skutečnou pracovní dobu, dokončení etapy či výsledek kontroly.
`vistos-job-execution.js` výslovně označuje řidiče za neověřeného a GPS za pozorování.

## Provozní přehled bez bodování

Karta při nedostupném skóre nabízí „Provoz podle T-Cars“. Jde o funkční čtení
existujícího `/api/vehicle-tracking/analytics?day=YYYY-MM-DD`, nikoli o nový žebříček.
Databáze `vehicle_tracking_daily_metrics` poskytuje pouze zvolený pražský den:
`vehicle_key`, `license_plate`, `total_km`, `moving_minutes`, `point_count`,
`valid_segment_count`, `rejected_segment_count`, `first_recorded_at`, `last_recorded_at`,
`calculated_at`. Vzdálenost je odvozená z geometrie GPS, nikoli z tachometru;
čas pohybu není délka směny. Podíl přijatých intervalů nedokládá pokrytí celého dne.

Vozidla jsou řazená podle označení, bez bodů, jmen řidičů a domnělého historického
přiřazení ke dnešnímu vozovému parku. Bez použitelného GPS intervalu se ukazuje
pomlčka, nikoli nulový výkon. Čerstvost se odvozuje z výpočtu vybraných podkladů,
nikoli z nesouvisejícího pozdějšího běhu. Změna dne ruší předchozí odpověď v UI;
výpadek odstraní staré výsledky. Dialog se obnoví i po změně mobilního rozložení.

Denní rozhraní vyžaduje aktuálně aktivní účet, `vehicle-tracking:view` a roli
admin/management/dispecer. Řidičské účty nemají přístup k tomuto přehledu flotily.
Jde o stejný rozsah vozidel jako existující GPS analytika, nikoli o firemně oddělené
bodování. Zakázky se čtou samostatně přes stávající oprávnění a firemní rozsah
`/api/jobs?period=all&pageSize=1`; v přehledu se zobrazuje pouze poslední příjem
`importProgress.lastReceivedAt` a odkaz do Zakázek. Tento údaj nepotvrzuje úplnost
vybraného dne. Plánované datum ani příjem zakázky se automaticky nepovažuje za
provedení. Automatické párování zakázky s jízdou není součástí této etapy.

Provozní přehled používá již existující tabulky a synchronizaci. Nevyžaduje aktivaci
bodovací migrace ani workeru; ty zůstávají připravené pro případ doložené evidence.

Read-only kontrola skutečného archivu 27. 10. 2026:
- 27. 10.: 55 denních souhrnů vozidel, 10 651 GPS bodů, 10 507 použitelných intervalů;
  poslední výpočet 2026-10-27T11:57:05.687Z.
- 26. 10.: 55 souhrnů, 14 175 bodů, 13 930 intervalů, stejný poslední výpočet.
- 25. 10.: 54 souhrnů, 4 722 bodů, 4 453 intervalů;
  poslední výpočet 2026-10-26T22:55:22.358Z.
Toto ověřuje dostupnost zdroje. Neprokazuje správnost bodování řidičů ani úplnost
pracovních směn. Dotaz byl pouze čtecí; produkční data nebyla změněna.

## Implementované součásti

- Čistý serverový výpočet `functions/_lib/driver-rating-engine.js`.
- Verzované vstupy, výsledky a schválení historického porovnání v DB_ARCHIVE.
- Chráněné čtení `/api/vehicle-tracking/driver-ratings?period=today|yesterday|YYYY-MM-DD&category=all|tanker|container|cleaning|other`.
- Při oprávnění k více firmám je nutný explicitní `companyId`; bez něj se výsledky různých firem neslučují. Automatická volba je možná jen při jedné oprávněné firmě.
- Správce/vedení mohou přidat `audit=1` pro interní kontrolu výsledků před zveřejněním.
- Příjem doložených podkladů a oprav: POST `/api/vehicle-tracking/driver-rating-evidence`.
- Samostatný cloudový worker `kaiser-driver-rating-runner`, připravený pro 15minutový interval.
- Karta ve stávajícím sloupci, detail 440 px, celostránkový mobilní dialog, filtr dne/kategorie,
  vlastní hodnocení řidiče, zvýraznění vozidla jen přes přesně odpovídající kanonické ID.
- Zveřejnění je standardně blokováno do doloženého historického porovnání. Žádné ukázkové produkční záznamy.

Worker přepočítává **již ověřené přijaté podklady**. Nevyvolává nový hromadný import
Vistos/T-Cars a neoznačuje stávající syrová data automaticky za ověřená.
Automatický adaptér skutečné docházky, časových přiřazení, kontrol a pracovních norem
zbývá napojit po doložení jejich zdrojů a významu. Příjem podkladů není náhrada tohoto adaptéru.

## Přesná pravidla

`T = součet ověřených úseků work + waste` v daném dni a kategorii.
Práce obsahuje nutné přejezdy, přípravu i další nutné provozní činnosti. Jejich náročnost
musí být zahrnuta i v odpovídající normě. Přestávky a doložené nezaviněné překážky se
vyloučí právě jednou. Úseky musí beze zbytku pokrývat směnu, bez mezer a překryvů.
GPS stání, zapalování, kilometry ani rychlost nejsou vstupem výpočtu.

`N = součet norem ověřených dokončených zakázek nebo unikátních dokončených etap`.
`W = součet explicitně potvrzených zbytečných časových ztrát s důvodem a zdrojem`.

- Výkon: `50 × min(1, N/T)`.
- Efektivita: `30 × max(0, 1 − W/T)`.
- Kvalita: `10 × podíl správně dokončené práce + 5 × podíl dokumentované práce + 5 × podíl práce s ověřenou kvalitou`.
  Podíly jsou vážené normovanými sekundami jednotlivých etap, nikoli počtem zakázek.
  Každá ze tří kontrol má doložený stav pass/fail; dokumentace může mít doložené not_required,
  které znamená splnění skutečně platných požadavků. U fail je povinný důvod a potvrzené zavinění řidiče.
  Neuzavřená kontrola nebo nepotvrzené zavinění znamenají nedostupnou kvalitu, nikoli srážku.
- Vzorci zadaná ztráta času může snížit výkon i efektivitu. UI tento vliv vysvětluje;
  nepřidává další paušální srážku.
- Dílčí skóre se zaokrouhlují na 2 desetinná místa, celkové skóre je jejich součet.
- Pořadí: celkové skóre, kvalita, výkon. Při shodě všech tří stejné pořadí a sdílené první místo.
  Stabilní ID určuje pouze pořadí zobrazení. TOP 5 je omezeno na 5 řádků.
- Pro účast je konzervativně vyžadováno nejméně 4 h **uznatelného** času v hodnoceném rozsahu.
  Kratší směna zůstane nehodnocená. Výkon je poměr, takže samotná délka delší směny nepřidává body.
- Chybí-li norma části práce, nedopočítává se celkové skóre ze zbytku.
- Jedna celá zakázka a její etapy se nesmějí započíst současně. Stejná etapa u více řidičů blokuje
  dotčená hodnocení. Práci posádky je nutné předat jako samostatné ověřené a nepřekrývající se
  alokované etapy, ne celou normu každému řidiči.
- Při změně vozidla/řidiče musí časové přiřazení rozdělit úseky. Překryvy blokují obě hodnocení.
- Noční směna se celá přiřazuje dni začátku v Europe/Prague. Čas se počítá ze skutečných okamžiků
  s časovou zónou; rozpracovaný úsek není automaticky dokončenou etapou.
- Normy: medián nejméně 15 unikátních dostatečně ověřených srovnatelných realizací z předchozích
  90 pražských kalendářních dnů. Bez 15 vzorků musí existovat schválená platná ruční norma.
  Definice srovnatelné skupiny a zahrnutí přejezdů vyžadují zdroj a ověření.
- Průběžná data nesmějí být starší než 30 minut. Úplnost všech čtyř zdrojů musí pokrývat asOf.
- Uzávěrka předchozího dne nastává nejdříve v 07:00 Europe/Prague při serverovém běhu,
  až po uzavření směn, kontrole úplnosti a doložené kontrole dne. Chybějící data uzávěrku odloží.
- Opravy přidávají revizi s autorem a důvodem. Původní podklady zůstávají zachované.
  Novější dosud nezpracovaná revize skryje starý výsledek. Stejné výpočty nezaplňují databázi znovu.

## Datový kontrakt pro chybějící zdroje

Kořen dokumentu: `version:1`, `installation`, `companyId`, `day`, `asOf`,
`rosterEvidence`, volitelné `closeEvidence`, `sources`, `drivers`, `norms`.
Každý důkaz má `source`, `recordId`, `verifiedBy`, `verifiedAt` s časovou zónou.
Pravost podkladů potvrzuje oprávněný správce/vedení; samotné API neumí ověřit libovolný externí dokument.

| Objekt | Povinný význam polí |
|---|---|
| sources | id jobs/shifts/assignments/quality, status ready, successAt, completeThrough, evidence |
| driver | stabilní id, skutečné name, ověřené identityEvidence, userId pouze při doloženém propojení účtu; shifts, activities |
| shift | unikátní id, from/to s časovou zónou, closed, evidence, segments |
| segment | id, from/to, kind work/waste/break/external, evidence; u uznatelných úseků driverId, kanonické vehicleId, assignmentEvidence, category; work navíc activityId; výjimky/ztráty reason |
| activity | id, původní jobId, volitelné stageId, category, normKey, completedAt, evidence, checks.completion/documentation/quality |
| check | status pass/fail (dokumentace i not_required), evidence; fail navíc reason a driverResponsible:true |
| norm | key, category, scope work_and_necessary_travel, cohort, evidence, samples a/nebo manual |
| sample | unikátní identita realizace id, completedAt, seconds, comparable:true, evidence |
| manual | seconds, from (včetně), volitelné to (mimo interval), evidence |

POST s `action:save_evidence`, `document`, `expectedRevision` (0 pro první import),
`reason`. Pouze oprávněný správce/vedení v dané firmě, přihlášená relace, JSON a stejný Origin.
Kolize revize vrací 409, chyba podkladů 4xx, chyba datového zdroje 503.

Historické porovnání: `action:validate_history`, `companyId`, `evidence`,
`cases:[{day,revision,driverId,evidence,expected:{performance,efficiency,quality,total}}]`.
Nezávisle ověřené očekávané hodnoty se porovnají s uloženými podklady dané revize.
Schválení platí pouze pro zastoupené kategorie a verzi algoritmu.
Změna některé srovnávací revize zveřejnění znovu blokuje; nové schválení je dalším auditním záznamem.

## Přístup

Vynucený na backendu: aktuální aktivní uživatel + vehicle-tracking:view + role + existující
firemní oprávnění ve vistos_company_access. Admin/management: celý detail; dispecer: pouze
provozní údaje, bez podkladů jednotlivých kontrol; ridic: vlastní ověřená identita, žádný cizí
žebříček ani audit. Jiné role 403. Chybějící adresář uživatelů nebo databáze neotevírá náhradní přístup.

## Testy a nasazení

`npm run test:driver-ratings`, `npm run test:driver-ratings:browser`,
`npm run test:vehicle-map`, `npm run test:vehicle-map:browser`, `npm run lint`, `npm run build`.
Pro lokální WebKit je třeba odpovídající instalace Playwright WebKit.
Testovací data jsou výhradně ve scripts/driver-ratings a izolovaném náhledu, nikdy v produkční migraci.

Nutné před zveřejněním:
1. Doložit a napojit skutečné směny, přestávky, nezaviněné překážky a časové přiřazení řidič–vozidlo.
2. Doložit definice kategorií, 90denní srovnatelné realizace nebo schválené ruční normy.
3. Napojit výslovné kontroly dokončení, dokumentace a zaviněných pochybení.
4. Spustit kontrolní režim na skutečných historických směnách a uložit nezávislé porovnání.
5. Na aktuálním produkčním základu provést migraci pouze do DB_ARCHIVE, nasadit Pages a samostatný
   worker, ověřit skutečné serverové běhy, role a následně veřejný stav aplikace.

Nenasazovat pouhou výměnou klientských souborů: backend, migrace a plánovač jsou součástí změny.
Současný lokální Keychain problém je nutné vyřešit pro standardní ověřovaný CLI deployment.
Tato implementace není dokladem produkčního nasazení ani potvrzením spravedlnosti na reálných směnách.
