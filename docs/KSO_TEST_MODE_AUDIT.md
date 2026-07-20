# Audit TEST režimů KSO

Datum statického auditu: 20. 7. 2026

## Závazný závěr

TEST musí dovolit projít skutečnou funkci nad izolovanými daty. Zakázané zůstávají jen produkční účinky. Samotné vypnutí funkce není TEST adaptér.

## Nalezené nedodělky

### 1. Pracovní paměť Šarloty v administrátorském TESTU

Stav: NEHOTOVO

- `functions/api/ai/collection-routes/context.js` nahrazuje paměť stavem `unavailable_test_scope`.
- `functions/api/ai/elevenlabs/signed-url.js` posílá stejný nedostupný stav do hlasové relace.
- `src/app.js` zobrazuje neaktivní tlačítko `PAMĚŤ: NEDOSTUPNÁ V TESTU`.

Potřebná náprava: oddělené TEST úložiště paměti vázané na testovací relaci, simulovaného řidiče a přihlášeného správce. Produkční paměť se nesmí číst ani měnit.

### 2. Pravidla a automatizace ve třech modulech

Stav: NEHOTOVO

- `functions/api/modules/[moduleKey]/rules.js` blokuje vytvoření pravidla pro `collection-routes`, `receivables` a `self-repair`.
- `functions/api/modules/[moduleKey]/rules/[id].js` blokuje změnu.
- Endpointy `activate` a `deactivate` blokují změnu stavu.
- Obecný dry-run runner je napojený pouze pro `data-box`.

Potřebná náprava: TEST namespace pravidel, TEST audit změn a dry-run runner každého dotčeného modulu. Aktivace v TESTU smí měnit jen TEST pravidlo, nikdy produkční automatizaci.

### 3. Automatické založení testovacího agenta Smart 2

Stav: OMEZENÝ SERVISNÍ TEST

- `functions/api/ai/elevenlabs/sarlota-smart-2-create.js` automatické založení vypíná a vyžaduje ruční založení agenta v ElevenLabs.

Nejde o blokaci běžného řidičského tabletu, ale servisní end-to-end test vytvoření agenta proto není z KSO dokončitelný.

### 4. Kontextový Tool Šarloty v administrátorském TESTU

Stav: OPRAVENO V TÉTO ZMĚNĚ

- `get_collection_routes_context` dříve na URL `/trasy-svozu` posílal produkční scope a nepředával ID aktivní testovací relace.
- Backend proto nemohl načíst simulovaného řidiče a Tool vracel stále stejnou pevnou chybu.
- `src/elevenLabsClientTools.js` nyní přebírá ID bezpečné TEST relace z runtime KSO a posílá je do kontextového endpointu.
- Regresní test ověřuje `scope=test` i `tabletTestSession`.

## Správně zakázané produkční účinky

Tyto zákazy se nemají odstraňovat. Funkční krok musí místo nich skončit v TEST adaptéru nebo TEST auditu:

- zápis do produkční trasy a Vistosu,
- produkční GPS bod,
- kontakt skutečného zákazníka nebo dispečinku,
- ostrý e-mail, SMS, RCS a notifikace bez schváleného chráněného TEST příjemce,
- skutečná absence, servisní hlášení, směna, vozidlo nebo jiná provozní změna,
- spuštění produkční automatizace, platby nebo jiné externí akce,
- přístup neautorizované role k TEST správě nebo cizí testovací relaci.

## Správné bezpečnostní podmínky, nikoli chybné zákazy

- TEST tabletu je dostupný jen oprávněnému Admin/Management uživateli.
- Cizí TEST může ovládat jen jeho oprávněný tester; ostatní mají jen náhled.
- GPS lze uložit až po zahájení správného TESTU a dokončení může vyžadovat uložené TEST měření.
- HERE pilot mění pouze pořadí oddělené TEST trasy.
- Potvrzovací tlačítka jsou dočasně neaktivní během probíhajícího požadavku nebo dokud chybí povinný vstup.

## Omezení auditu

Jde o statický audit aktuálního repozitáře a read-only kontrolu aktivního Promptu a připojené Knowledge Base. Neprokazuje stav všech produkčních bindingů, externích providerů ani historických dat v D1. Každý opravovaný nedodělek vyžaduje vlastní integrační a produkční bezpečnostní test.
