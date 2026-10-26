# Rychlost vedle SPZ – schválená varianta 2

Verze 0.1.887. Jeden téměř bílý štítek pod vozidlem obsahuje SPZ, tenký svislý oddělovač a rychlost v km/h. Původní PNG, kruh, pulsování, GPS bod a souřadnicová kotva se nemění.

Číslo pochází z existující normalizované rychlosti T-Cars. Zobrazuje se jen u platného aktuálního bodu (stáří nejvýše 120 sekund, bez historické náhradní polohy a s konečnou nezápornou rychlostí). Nula zůstává 0 km/h. Nedostupné nebo staré měření má `— km/h`; skutečný stav a integrační logika se nemění. Zestárnutí se projeví i bez nového načtení dat.

Měření kolizí i vystředění vybraného vozidla používá celý kombinovaný štítek. Stejné písmo se aplikuje na měřicí i skutečný prvek. Cache rozměrů má limit 512 položek; při aktualizaci se nemění původní grafika. Rozbalená skupina rezervuje prostor celé ikony i štítku; oddělený počet zbývajících vozidel nesmí překrýt štítek výběru. Priorita výběru a skrytí štítku při opuštění výřezu zůstávají.

Testy: `speed-label.test.mjs`, `speed-label.browser.test.mjs` (skutečné Google Maps, izolovaná syntetická data, Chrome/WebKit, 1440/768/390/320 px, pohyb/nula/stará/neznámá rychlost, změna šířky po obnově, vypršení aktuálnosti bez obnovy, kolize a vycentrování). Dále stávající browser a marker-visibility testy, původní hash kontrola obrázků a povinný předprodukční guard. Syntetický WebKit není ověření fyzického iPhonu. Produkční commit a živé ověření se ukládají po nasazení do pracovního výstupu `outputs/speed-label`.
