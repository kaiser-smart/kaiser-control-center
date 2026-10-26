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
