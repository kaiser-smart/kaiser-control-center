# Přiřazení ikon vozidlům

Uživatelský požadavek: online přehled, ve kterém Radim přiřadí správnou dodanou ikonu konkrétnímu autu a předá výsledek k zapracování.

Vstup je v modulu Poloha vozidel přes **Přiřadit ikony**, případně `/sledovani-vozidel?ikony=1`. Seznam vychází výhradně z právě oprávněné flotily s ověřenou stabilní identitou. Zahrnuje hledání podle názvu/SPZ, 10 dodaných siluet, tři pravdivě označené možnosti bez samostatného obrázku, filtr nevybraných a přechod na další vozidlo. Žádná ikona není předem potvrzena za uživatele.

## Ukládání a předání

Jde o skutečný editor předávacího dokumentu, nikoli nové cloudové nastavení. Volby zůstávají v paměti otevřené karty. Tlačítko **Stáhnout návrh** vytvoří JSON, který uživatel přiloží do chatu. Tlačítko **Načíst návrh** obnoví rozpracovanou práci ze souboru. UI tuto hranici výslovně uvádí a před neexportovaným odchodem používá standardní varování prohlížeče; po odhlášení nebo ztrátě oprávnění se paměť vyčistí. Zavření dialogu a běžné GPS aktualizace návrh zachovávají.

JSON obsahuje pouze formát/verzi, účel proposal, čas vytvoření a explicitní přiřazení stabilního ID, SPZ, názvu a klíče ikony. Neobsahuje GPS ani samostatné údaje řidiče nebo relaci. Import kontroluje formát, klíče, duplicity, velikost do 1 MB / 1 000 řádků, aktuální oprávněná ID i SPZ. Nepáruje automaticky podle podobného názvu nebo SPZ. Konfliktní rozpracovanou volbu nepřepíše. Není použita localStorage/sessionStorage/IndexedDB ani API zápis.

Zůstává beze změny backend, DB, oprávnění, autentizace, GPS, typ vozidla, současné přiřazení mapových ikon i ostatní moduly. Původní PNG jsou beze změny; chybějící ikony se negenerují.

## Ověření

- `npm run test:vehicle-map:icons`: import/export, oddělení identit, změněná SPZ, vadný soubor, duplicity, nepovolený klíč, limit, vyloučení GPS/řidiče.
- `npm run test:vehicle-map:icons:browser`: skutečné ovládání, stažení souboru, opětovný import, konflikty, hledání, další auto, zavření/otevření, 1440×900 / 1024×768 / 390×844 / 320×700, cíle 44 px, žádný API zápis. Spouští se v Chromium a WebKit.
- Stávající 59 kontrol mapy v Chromium, syntax check, model a standardní build.
- Chráníme dialog při přepnutí existujícího mobilního obalu (přesun DOM musí obnovit modální vrstvu). Automatický test respektuje stávající 400ms ochranu proti dvojímu klepnutí.

Testovací flotila v automatických scénářích je izolovaná. Živý náhled potvrdil načtení 57 vozidel, žádné skutečné přiřazení není automaticky zvoleno. Fyzický iPhone nebyl použit. Produkční stav ověřit při vydání přes skutečný buildMeta a otevření chráněného přehledu.
