# Čitelnost ikon a SPZ — 26. 10. 2026

Rozsah: výhradně read-only prezentace markerů v `/sledovani-vozidel`. Základ 0.1.868 (`28dc87fd`); další vydání 0.1.869. Google Maps, T-Cars, GPS normalizace, podklad mapy, API, oprávnění a DB se nemění.

## Změny

- `src/styles.css`: kruhový podklad 42 px, tmavá barva s 90% krytím, jemný kontrastní obrys. Původní grafika je nad podkladem. Velikost/ukotvení 48×44px hit targetu, sprite výřez, průhlednost, filtr a barvy obrázku beze změny. Žádné nové obrázky/SVG ani překreslené vozidlo.
- SPZ má `#FAFCFD`, text `#1B262D`, 14 px / 700, řádek 18 px, obrys, radius 7 px. Stejná velikost v klidu i při výběru. Základní odstup 5 px pod markerem včetně případné existující směrové šipky.
- Pouze pseudoelement kruhu vybraného vozidla animuje scale 1 → 1,35 a opacity, cyklus 2,5 s. Samotná grafika a SPZ neanimují. `prefers-reduced-motion: reduce` animaci vypíná.
- `presentation.js` / `google-map.js`: dekorativní pulz vyžaduje platnou současnou polohu, žádnou náhradní minulou polohu, existující kategorii i pohyb `moving` a stáří nejvýše 120 s. Jde o stejnou hranici aktuálnosti jako u existující směrové šipky; klasifikace jízdy/stání/stáří se nemění. Pulz se vypne také při přirozeném stárnutí vzorku bez nové odpovědi serveru.
- `spatial.js`: SPZ drží jedinou pozici pod vozidlem. Při kolizi má vybraný štítek prioritu; méně prioritní se skryje, nepřeskočí na jinou stranu. Kolize používají skutečný rozsah markeru/šipky, zatímco shlukování zachovává původní větší bezpečnostní obálku. Zeměpisná kotva a souřadnice se nemění. Existující posun výřezu při výslovném výběru ponechává nad mobilním detailem prostor i pro celý štítek.

## Ověření

`marker-visibility.test.mjs`: vstupní podmínky pulzu, hranice 120 s, priorita a stabilita štítku, směrová šipka a SHA-256 všech tří PNG. Původní hashe:

- atlas.png: d05712ae2dd761000135e33f8f47b6a84c40bcc005b19330daf0204701ad9f96
- collection-truck.png: 95bd74b192c2cde146fad83e425ff71679447e5430f96bcd6100ae244d20699a
- skip-loader.png: 81e0a59777996d732482463572868963f9acd512f778295acbc645baf7c186ee

`marker-visibility.browser.test.mjs`: skutečné vykreslení Google Maps nad izolovanou flotilou, tmavý i světlý podklad, pohyb/stání/stará/nedostupná/neověřená GPS, jediný pulz, reálná změna animační transformace v čase, reduced-motion, automatické zastavení po zestárnutí GPS, klikání bez změny rozměrů/polohy grafiky a SPZ, posun/zoom, shluk šesti vozidel, žádné kolize SPZ, desktop/tablet/mobil 1440/1024/390/320. Světlý Google styl se nastavuje pouze v izolovaném testu, produkční mapový styl se nemění.

Stávající browser regrese ověřují navíc 20členné skupiny, 200 vozidel, obnovy, autentizaci, expiraci a odhlášení. Jediné přizpůsobení testu výběrového akcentu: měří barvu skutečného obrysu kruhu (`::before`) namísto odstraněného stínu tlačítka.

Výsledky před vydáním: model a GPS kontrakty PASS, marker jednotkové testy PASS, syntax check 838 JS/MJS PASS, standardní build 53 rout PASS. Browser regrese 59/59 Chromium a 59/59 WebKit. Cílená sada skutečných Google Maps prošla v obou enginech. Pro její opakování nastavte `MARKER_GOOGLE_URL` na izolovaný preview-server s `VEHICLE_MAP_GOOGLE_RUNTIME` a spusťte `npm run test:vehicle-map:markers:browser`; případně `VEHICLE_MAP_BROWSER=webkit`. Testovací server nesmí být produkční aplikace. Předchozí vzhled lze zachytit pomocí `MARKER_BEFORE=1 MARKER_BASE_REF=28dc87fd`; zdroje se mění jen v izolovaném browser requestu, pracovní strom zůstává beze změny.

Screenshoty před/po a logy jsou mimo Git v pracovním `outputs/marker-visibility/`. Automatická data nejsou skutečné GPS. Produkční screenshoty se pořizují samostatně nad autorizovaným účtem. Fyzický telefon/PWA instalace nejsou simulací browser viewportu doloženy. Přesný produkční commit a výsledek guardu uvádí závěrečný přejímací report po vydání.

## Dotažení pulzu — 0.1.873

Read-only kontrola produkce 0.1.870 / `16674ac` na vybraném jedoucím vozidle potvrdila aktivní animaci a platnou třídu `has-current-motion`. Kruh nebyl oříznutý ani vypnutý: problém byl jeho slabý vizuální odstup od pevného obrysu. Při 625 ms původní cyklus dosahoval odstupu pouze 2,78 px a opacity 0,388; v 1500 ms už jen 0,136. Pouhý test názvu animace a změny transformace tuto chybu čitelnosti nezachytil.

Cílená změna pouze CSS: kruh začíná na scale 1,12, končí na 1,7, má tenký obrys 1,5 px a pozvolný náběh/útlum (0 → 0,65 → 0,4 → 0). Cyklus zůstává 2,5 s. V 625 ms je odstup 7,13 px při opacity 0,538; v 1500 ms 12,08 px při 0,329. Nemění se barva, filtr, výřez, velikost ani průhlednost grafiky vozidla; statický podklad, SPZ, kotva, normalizace GPS, API, DB a oprávnění jsou beze změny.

Rozšířený browser test pořizuje skutečně vykreslené fáze 625/1500/2250 ms na tmavé i světlé Google mapě a měří viditelný odstup, růst a zeslabování. Zdroj CSS/JS pochází z testovaného checkoutu a je nahrazený jen v izolovaném browser kontextu. Syntetická flotila nikdy není produkční GPS. Šířky: 1440, 1024, 768, 430, 390, 375 a 320 px. Stávající testy zachovávají kontrolu stání, staré/chybějící/neověřené GPS, reduced-motion, kolizí, výběru, posunu a zoomu. Snímky a výsledky tohoto běhu jsou mimo Git v `outputs/pulse-fix/`.

Cílené testy skutečných Google Maps prošly v Chromium i WebKit. Jednotkové testy markerů, modelu a všech sedmi GPS sad, syntax check 838 JS/MJS a build 53 rout prošly. Mobilní vykreslení je ověřované Chromium a WebKit; fyzická instalace PWA na iPhonu není tímto testem doložená. Produkční ověření je samostatný krok po povinném deploy guardu.

## Změna zadání: všechny jedoucí vozy a cílené přiblížení — 0.1.877

Na výslovný požadavek uživatele už pulz není omezený na vybrané vozidlo. Každý samostatně vykreslený marker se skutečně potvrzenou aktuální jízdou má stejný jemný kruh. Skupiny zůstávají skupinami; nerozlišitelná vozidla ve shluku se nezaměňují za samostatné markery. Podmínky platné GPS, skutečného pohybu, stáří nejvýše 120 s a reduced-motion zůstávají beze změny.

Výslovný výběr z mapy, seznamu nebo přehledu přiblíží mapu alespoň na zoom 16 a vystředí zeměpisný bod do využitelné části mapy mimo detail. Bližší pohled se neoddaluje. Opakovaný výběr již vystředěného vozu neposune kameru. Nový výběr ruší čekání na předchozí přiblížení. Obnova GPS ani zvýraznění hoverem kameru nemění. Vozidla se stejnými souřadnicemi zachovávají původní skupiny a rozbalení; vybraná SPZ má prioritu.

Aktualizované testy požadují více současných pulzů i bez výběru, žádný pulz u stojícího/starého/neověřeného bodu, zastavení po zestárnutí, přiblížení z celorepublikového pohledu a zachování ručního zoomu při obnově. Grafika, kotvy, provozní stavová logika, API a DB beze změny.

Doplnění podle dalších připomínek: odstraněna mapová legenda, počítadlo výřezu, volba režimu popisků a běžný časový podpis GPS výpočtu. SPZ se vždy zobrazují automaticky s prioritou výběru a s řešením kolizí. Detail má pouze jednu dostupnostní tečku u GPS; stav Jede/Stojí zůstává textem. Neaktuálnost statistik nebo výpadek se nadále označují pravdivě.

Otevírání shluku je testováno na skutečných Google Maps z celorepublikového pohledu. Výřez skupiny nastavuje střed a zoom společně pomocí moveCamera. Rozměry výřezu vycházejí z Mercatorovy projekce skutečných bodů a velikosti mapy s okrajem 64 px. Tím se odstraňuje reprodukovaný případ, kdy fitBounds změnil zoom, ale ponechal střed mimo vozidla. Souřadnice markerů se nemění; nulové natočení zůstává zachované.

## Kontextové vystředění — 0.1.878

Šipka nad zoomem vrací mapu k vybranému vozidlu (stejné vystředění a minimální zoom 16 jako výběr). Bez výběru přizpůsobí výřez platným polohám filtrované flotily. Název a nápověda odpovídají právě aktivnímu cíli; při výběru bez GPS je tlačítko neaktivní i tehdy, když ostatní vozidla polohu mají. Obnova GPS sama kameru nemění. Regresní test pokrývá oddálení, posunutí, návrat, bližší ruční zoom, chybějící GPS a návrat na celou flotilu. Test skutečných Google Maps ověřuje šipku na desktopu a v mobilních šířkách.
