# Přiřazení ikon vozidlům

Uživatelský požadavek: online přehled, ve kterém Radim přiřadí správnou dodanou ikonu konkrétnímu autu a předá výsledek k zapracování.

Vstup je v modulu Poloha vozidel přes **Přiřadit ikony**, případně `/sledovani-vozidel?ikony=1`. Seznam vychází výhradně z právě oprávněné flotily s ověřenou stabilní identitou. Zahrnuje hledání podle názvu/SPZ, 13 dodaných siluet, tři pravdivě označené možnosti bez samostatného obrázku, filtr nevybraných a přechod na další vozidlo. Žádná ikona není předem potvrzena za uživatele.

## Ukládání a předání

Jde o skutečný editor předávacího dokumentu, nikoli nové cloudové nastavení. Volby zůstávají v paměti otevřené karty. Tlačítko **Stáhnout návrh** vytvoří JSON, který uživatel přiloží do chatu. Tlačítko **Načíst návrh** obnoví rozpracovanou práci ze souboru. UI tuto hranici výslovně uvádí a před neexportovaným odchodem používá standardní varování prohlížeče; po odhlášení nebo ztrátě oprávnění se paměť vyčistí. Zavření dialogu a běžné GPS aktualizace návrh zachovávají.

JSON obsahuje pouze formát/verzi, účel proposal, čas vytvoření a explicitní přiřazení stabilního ID, SPZ, názvu a klíče ikony. Neobsahuje GPS ani samostatné údaje řidiče nebo relaci. Import kontroluje formát, klíče, duplicity, velikost do 1 MB / 1 000 řádků, aktuální oprávněná ID i SPZ. Nepáruje automaticky podle podobného názvu nebo SPZ. Konfliktní rozpracovanou volbu nepřepíše. Není použita localStorage/sessionStorage/IndexedDB ani API zápis.

Zůstává beze změny backend, DB, oprávnění, autentizace, GPS, typ vozidla, ostatní moduly. Původní PNG jsou beze změny; chybějící ikony se negenerují.

## Ověření

- `npm run test:vehicle-map:icons`: import/export, oddělení identit, změněná SPZ, vadný soubor, duplicity, nepovolený klíč, limit, vyloučení GPS/řidiče.
- `npm run test:vehicle-map:icons:browser`: skutečné ovládání, stažení souboru, opětovný import, konflikty, hledání, další auto, zavření/otevření, 1440×900 / 1024×768 / 390×844 / 320×700, cíle 44 px, žádný API zápis. Spouští se v Chromium a WebKit.
- Stávající 59 kontrol mapy v Chromium, syntax check, model a standardní build.
- Chráníme dialog při přepnutí existujícího mobilního obalu (přesun DOM musí obnovit modální vrstvu). Automatický test respektuje stávající 400ms ochranu proti dvojímu klepnutí.

Testovací flotila v automatických scénářích je izolovaná. Živý náhled potvrdil načtení 57 vozidel, žádné skutečné přiřazení není automaticky zvoleno. Fyzický iPhone nebyl použit. Produkční stav ověřit při vydání přes skutečný buildMeta a otevření chráněného přehledu.

## Doplnění 26. 10. 2026 — 0.1.871

Přidány tři samostatné volby z příloh uživatele: `box_body_compact` (Vůz s kontejnerem – 2 nápravy), `van_passenger` (Dodávka / minibus) a `tanker_compact` (Cisterna – 2 nápravy). Celkem 16 možností včetně tří neutrálních zástupných voleb. Původní klíče a jejich obrázky nejsou nahrazené. Nové klíče patří pouze do prezentační nabídky a předávacího dokumentu; nemění fleet enumy ani automaticky nepřiřazují vozidla.

PNG jsou přesné kopie dodaných screenshotů. CSS vybírá siluetu bez okolního okraje/části sousedního obrázku, používá dosavadní renderer a jeho průhledné vykreslení bílého plátna. Provenance uvádí původ, rozměry, výřez a SHA-256. Jednotkové testy ověřují shodu souborů a import/export každého nového klíče; browser testy ověřují dekódování, výběr, stažení a mobilní ovládání ve dvou enginech.

## Zapracovaný návrh 26. 10. 2026

Verze 0.1.871 zapracovává 42 explicitních voleb ze souboru předaného uživatelem (čas exportu 2026-10-26T06:41:07.451Z). `approved-icons.js` obsahuje pouze minimální prezentační vazby: T-Cars ID + SPZ + klíč grafiky. Žádné názvy, řidiče ani GPS. Názvy ani značky aut se nepoužívají k odhadu. Prefix ID v exportu je scope přihlášeného recenzenta, proto se nepoužívá jako identita organizace.

Vazba se aplikuje pouze na stabilní vozidlo z aktuální oprávněné odpovědi API. Musí souhlasit externí ID a SPZ; rozporná identita mezi evidencí a GPS vzorkem vazbu odmítne. Ostatní vozidla zachovávají dosavadní grafiku. Jde o oddělený `artworkKey`, nikoli změnu doloženého typu vozidla. Stejná volba se vykreslí na mapě, v seznamu, detailu, přehledu a současné ikoně v editoru. Editor stále exportuje jen nové explicitní volby uživatele.

Žádný z 42 řádků nevybral novou kompaktní variantu; všechny původní zvolené klíče se proto zachovávají přesně. Tři doplněné varianty jsou dostupné pro další návrhy. Žádný zápis DB/API, přenos GPS ani změna oprávnění není součástí této implementace.
