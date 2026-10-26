# Poloha vozidel 2.0 — přejímka vydání 0.1.864

Stav: **redesign 0.1.863 je v produkci; dokončuje se oprava kontrastu hlavní akce 0.1.864 a oficiální CLI upload**.

Větev: `codex/vehicle-location-2`. Výchozí hlavní větev před vydáním: `a34841c9` (0.1.863). Zachovány souběžné změny mobilního auditu a společných ikon.

## Aktuální závazná předloha

Uživatel 26. 10. 2026 odmítl první světlou implementaci a následně výslovně vybral tmavý návrh s limetkovým akcentem, mapou ČR, statistikou, stavem vozidla, posledními událostmi, legendou a řidičem dne:

https://cdn.openart.ai/openart-ai/production/2026-10/create-image/4Uq2ErddY1F6nBa82NGF/gpt-image-2-1_1792962308423_0222f768.png

Tato pozdější instrukce nahrazuje původní světlý návrh a jeho barevné tokeny. Žádná nová hlavní navigace; zachovány stávající odkazy a mobilní navigace aplikace.

## Implementace

- Jedna horní řada navigace, titulku, obnovy a účtu. Vlevo hledání a filtry, uprostřed skutečná tmavá Google mapa, vpravo statistika a kontext vozidla, dole GPS hlášení a tabulka.
- Limetkový akcent `#b4e52b`. Skutečný geografický obrys ČR z Natural Earth (public domain), žádné fiktivní trasy. Na výslovné přání uživatele mapa zobrazuje pouze území ČR. Okolní země překrývá neutrální geografická maska, posun omezuje hranice pracovního výřezu a minimální zoom odpovídá velikosti displeje. GPS záznamy se nemění.
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

## Provedené ověření

- 59/59 Chromium a 59/59 WebKit v opravě 0.1.864 (včetně kontrastu hlavní akce) nad aktuálním main: hledání názvu/SPZ/přiřazeného řidiče, filtry, 200 vozidel, shluky 6 a 20 vozidel, výběr, historie a změna období, obnova, 401/403, expirace, návrat online, odhlášení, klávesnicová dostupnost a zmenšený viewport při otevření klávesnice.
- 15/15 skutečné Google Maps se syntetickými vozidly: skutečný mapový podklad, obrys ČR, ovládání, 4 požadované rozměry, dva skutečné 60sekundové intervaly GPS obnovy a zotavení z výpadku. Výsledky závěrečného běhu jsou v `../outputs/v3-google/verification.json`; syntetická data nejsou produkční přejímka GPS.
- Přihlášený integrační náhled: skutečných 57 vozidel; hledání, výběr, stav/rychlost/čas GPS/adresa, denní analytika, filtry, shluky, ruční obnova, zachování mapy a výpadek/obnova. Dříve ověřené skutečné odhlášení a následné přihlášení uživatelem. Historie staré produkční verze vracela 503; tato chyba se nevydává za úspěch.
- Testy `test:vehicle-tracking`, modelu a dashboardu, ochrany `test:collection-routes`, mobilního auditu, ikon a databázové architektury prošly. Prošly všechny testovací příkazy oficiálního deployment guardu, syntax check a standardní build 52 rout.
- PWA kontrakt: 52 rout + 404, metadata, ikony, stejnooriginová identita, žádná offline cache GPS. WebKit přes lokální HTTPS: iPhone profil, simulované standalone prostředí, desktop a bezpečnostní scénáře relace. Fyzická instalace na iPhone nebyla provedena.
- Vizuální srovnání: tmavé kompaktní panely, limetkový akcent, geografická mapa ČR, legenda, kruhový ukazatel, obraz vozidla, pruhové ukazatele telemetrie, události a tabulka odpovídají vybranému směru. Stávající hlavní navigace nahrazuje duplicitní navigaci z mockupu; data jsou skutečná nebo výslovně nedostupná.

Lokální důkazy mimo Git: `../outputs/v3-861-chromium`, `../outputs/v3-861-webkit`, `../outputs/v3-google`, `../outputs/v3-pwa`, `../outputs/v3-live`. Živé GPS screenshoty 1440 × 900, 1024 × 768, 390 × 844 a 320 × 700 zůstávají mimo veřejný PR. Log předmerge kontrol: `/private/tmp/vehicle-map-release-validation.log`.

## Vydání a následná přejímka

Produkce výhradně z čistého aktuálního main přes `npm run deploy:pages:production`. Před sloučením musí projít závěrečné ověření omezení ČR. Po nasazení ověřit veřejnou buildMeta, chráněný status, opravené čtení historie a mapovou trasu. Pokud skutečný backend opravu nepotvrdí nebo vznikne regrese, vydání se nesmí označit za produkčně ověřené.

Při lokálním sestavení přestal odpovídat generovaný adresář `dist` v původním pracovním checkoutu. Standardní build a kontroly se proto spouští nad přesným exportem zdrojů do `/private/tmp`; produkční guard poběží z čistého skutečného Git checkoutu aktuálního main. Žádný zdrojový soubor, osobní data ani databáze se kvůli tomu nemažou.

## Produkční ověření 0.1.863 a dokončení 0.1.864

PR #264 byl sloučen jako `a34841c93d1ef2849a4337e353606ff090a855d5`. Stávající automatické Pages nasazení `53d8229a-e3b3-43e0-b444-6fcf133bb677` hlásí success; veřejná buildMeta potvrzuje 0.1.863/main/a34841c. Přihlášená produkce načetla 57 skutečných vozidel a opravená historie vrátila 146 GPS bodů.

Oficiální `npm run deploy:pages:production` prošel všemi testy, buildem a PWA kontrolou, ale CLI upload selhal na síťovém `fetch failed`. Tento pokus se neoznačuje za úspěšné dokončení guardu. Produkční kontrola navíc odhalila nedostatečný kontrast hlavní akce při hoveru: obecné hover pozadí překrylo limetkovou plochu. 0.1.864 opravuje jediný scoped CSS selector a přidává prohlížečový regresní test kontrastu alespoň 4.5:1.
