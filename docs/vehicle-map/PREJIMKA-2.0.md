# Poloha vozidel 2.0 — pracovní přejímka

Stav: **rozpracované ověření; není nasazeno do produkce**.

## Aktuální závazná předloha

Uživatel 26. 10. 2026 odmítl první světlou implementaci a následně výslovně vybral tmavý návrh s limetkovým akcentem, mapou ČR, statistikou, stavem vozidla, posledními událostmi, legendou a řidičem dne:

https://cdn.openart.ai/openart-ai/production/2026-10/create-image/4Uq2ErddY1F6nBa82NGF/gpt-image-2-1_1792962308423_0222f768.png

Tato pozdější instrukce nahrazuje původní světlý návrh a jeho barevné tokeny. Žádná nová hlavní navigace; zachovány stávající odkazy a mobilní navigace aplikace.

## Implementace

- Jedna horní řada navigace, titulku, obnovy a účtu. Vlevo hledání a filtry, uprostřed skutečná tmavá Google mapa, vpravo statistika a kontext vozidla, dole GPS hlášení a tabulka.
- Limetkový akcent `#b4e52b`. Skutečný geografický obrys ČR z Natural Earth (public domain), žádné fiktivní trasy. Úvodní výřez zahrnuje ČR i případné oprávněné polohy mimo ni.
- Originální uživatelem dodané obrázky OpenArt pro jednotlivé kategorie, samostatný popelářský vůz a RAM. Hákový nosič je odlišný. Zdrojové PNG zůstávají beze změny; výřez a odstranění bílého podkladu probíhá při vykreslení. Provenience v `public/vehicles/openart-2/provenance.json`.
- Detail: identita, doložený typ, stav, rychlost, skutečný čas GPS, adresa, historie a trasa. Existující ilustrace nástavby je označena jako ilustrační typ, nikoli fotografie konkrétního vozidla.
- Mobil: Mapa / Vozidla / Přehled, kontextový spodní detail, bezpečné okraje a původní mobilní navigace. Telemetrie je rozbalovací, hlavní GPS údaje a akce mají přednost.
- Vyhledávání, filtry, stabilní identita, shlukování, poslední známá poloha, původní GPS čas, zachování kamery při obnově a bezpečnost relace zůstávají zachované.

## Význam a dostupnost dat

- Kruhový ukazatel zobrazuje skutečný podíl vozidel s čerstvou GPS, nikoli smyšlené „využití flotily“.
- Dnešní kilometry a jízdy čte existující chráněná analytika `?period=today`. Nulový výsledek se zobrazí pouze při doložených bodech; nedostupná analytika není nula.
- „Poslední události“ obsahují označená GPS hlášení s původními časy vzorků. Netvrdí servis, tankování, rychlostní přestupky ani brzdění, které zdroj neposkytuje.
- „Řidič dne“ bez ověřeného přiřazení zůstává neověřen. Přiřazení z Vozového parku se nevydává za přítomnost řidiče ve vozidle. Hodnocení bezpečné jízdy není dostupné.
- Palivo a AdBlue nemají v používaném status kontraktu doložené hodnoty/jednotky. Zobrazují nedostupnost, nikoli vymyšlených 75/60 % z vizuální předlohy.
- Chybějící typy nejsou odhadovány z přezdívek. Neurčené vozidlo má neutrální značku.

## Zjištěná a opravená chyba historie

Původní produkční GET historie vracel 503. Nový test s odděleným ARCHIVE a AUDIT reprodukoval chybu `no such table: vehicle_tracking_history_runs`: endpoint posílal dotaz na audit do ARCHIVE. Čtecí endpoint nyní používá existující scoped router pro ARCHIVE/AUDIT, stejně jako analytika a sběr historie. Žádná migrace, změna bindingů, dat, oprávnění ani odpovědního kontraktu.

Test prokázal původní 503, poté 200, načtení bodu a auditu ze správných databází, pouze SELECT, 503 při chybějícím bindingu a 401 bez přihlášení. Opravený backend dosud musí projít chráněným vzdáleným ověřením; lokální integrační proxy nadále čte starou produkční verzi.

## Dosavadní důkazy

- Před převzetím souběžného main 0.1.858: 58/58 Chromium a 58/58 WebKit, včetně hledání, filtrů, 200 vozidel, shluků, výběru, historie, obnovy, 401/403, expirace, návratu online a odhlášení.
- 14/14 skutečné Google Maps se syntetickými vozidly: skutečný mapový podklad, obrys ČR, ovládání, 4 požadované rozměry, dva skutečné 60sekundové intervaly GPS obnovy a zotavení z výpadku. Syntetická data nejsou produkční přejímka GPS.
- Přihlášený integrační náhled: skutečných 57 vozidel; hledání, výběr, čas GPS, denní analytika. Stará produkční historie stále vrací 503; výsledek se nevydává za úspěch.
- Poslední úpravy mobilní priority údajů a převzetí společných ikon vyžadují závěrečné opakování dotčených vizuálních kontrol.

Lokální důkazy (mimo Git, neobsahují přihlašovací údaje): `../outputs/v3-chrome`, `../outputs/v3-webkit`, `../outputs/v3-google`. Živé GPS screenshoty zůstávají mimo veřejný PR.

## Před vydáním zbývá

Dokončit mobilní vizuální kontrolu, převzít aktuální main bez ztráty souběžných změn, opakovat relevantní testy/syntax/build, vzdáleně ověřit opravenou historii a připravit finální PR/release. Produkce výhradně z čistého aktuálního main přes `npm run deploy:pages:production`, po splnění všech povinných bran. Nenasazovat neověřenou opravu ani vydávat chybějící provozní data za dostupná.
