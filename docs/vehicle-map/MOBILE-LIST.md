# Mobilní seznam vozidel – 0.1.884

Oprava izolovaná na `/sledovani-vozidel`. Na produkční verzi 0.1.883 při 315 × 500 px zůstávalo seznamu 27 px, přestože řádek měl 75 px. Obecné vnitřní okraje panelu a pevná výška mezi filtry a stránkováním znemožňovaly přečíst celé vozidlo.

Na mobilu se nyní posouvá celý panel: hledání, filtry, osm vozidel dané stránky a stránkování. Změna filtru nebo hledání vrací první stránku a začátek panelu. Návrat z mapy/detailu zachovává místo v seznamu. Obnova dat zachovává posun aktivní rolovací plochy. Desktop používá nadále původní samostatně posouvaný seznam.

Vyhledávání respektuje tmavé pozadí modulu a čitelný text; na nízkém displeji naležato ovladače mapy nepřekrývají zavření detailu. Ikony, indikátory GPS, telemetrie, integrace a datové filtry se nemění.

Regresní test `scripts/vehicle-map/mobile-list.browser.test.mjs` používá izolovanou syntetickou flotilu 57 vozidel (12 jedoucích, 23 stojících, 21 se starou GPS, jedno bez GPS). Před opravou selhal na zakrytém prvním řádku. Kontroluje skutečnou viditelnost a zásah dotykem každého řádku všech osmi stránek, obě stránky jedoucích, přepínání filtrů z poslední stránky, hledání, návrat z detailu, mapu, zavření detailu naležato a zmenšený viewport při psaní.

Rozměry: 315 × 500, 390 × 580, 390 × 664, 430 × 750, 844 × 390, hledání 390 × 360. Chrome a WebKit se spouštějí přes `VEHICLE_MAP_BROWSER`, výstup řídí `VEHICLE_MAP_OUTPUT`. Tato emulace nenahrazuje ověření fyzické iOS klávesnice nebo instalace PWA na iPhonu. Živá produkční kontrola a přesný nasazený commit se evidují až po vydání v pracovních výstupech `outputs/mobile-list`.
