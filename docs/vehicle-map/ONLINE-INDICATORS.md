# Online / offline místo textového stáří GPS

Úprava na výslovný požadavek uživatele 26. 10. 2026. Od verze 0.1.870 rozhraní nezobrazuje „Stará poloha“, relativní stáří GPS ani čas poslední GPS v detailu a seznamu. Tyto údaje nahrazuje pouze zelený/červený bod s přístupným názvem a tooltipem Online/Offline. Legenda a souhrny používají stejné názvy. Časy skutečných událostí a období historie zůstávají zachované.

- Online: existující normalizace poskytuje platnou polohu, nejde o minulý náhradní vzorek, kategorie není stale/missing a čas je ověřený. Používá se stávající limit stáří z API (`staleAfterSeconds`, výchozí 1800 s), žádná nová GPS klasifikace ani síťový ping.
- Offline: starý, chybějící, neověřený či náhradní minulý vzorek. Zobrazení nezaměňuje chybějící data za online.
- Zelená `#75BD25`, od verze 0.1.880 červená `#EF4444`; pouze indikátor, žádná změna obrázků vozidel.
- Stávající filtr se starým interním klíčem `stale` je ve workspace označen Offline a zahrnuje všechny červené body včetně vozidel bez polohy. Původní normalizace, ostatní filtry a GPS kontrakty se nemění.
- Jede/Stojí a skutečná rychlost zůstávají. Výběr, shlukování, bílé SPZ, zeměpisné kotvy a hranice 120 s pro pulz všech samostatně zobrazených jedoucích vozidel jsou zachované. Mimořádná událost má samostatný původní vykřičník, nepřebarvuje GPS indikátor.
- Puntíky se aktualizují také při stárnutí vzorku bez nového načtení. Neměnný obrázkový DOM zůstává zachovaný.

Testy: jednotkové testy online/offline pro pohyb, stání, starou/chybějící/neověřenou/náhradní polohu; browser kontrola absence textového stáří, skutečných CSS barev, Offline filtru a automatického přechodu po zestárnutí. Existující regrese ověřují shluky, historii, mobile viewporty a autentizaci. Cílená sada skutečného Google SDK ověřuje zachování čitelnosti SPZ, kotvy a pulzu. Produkční výsledek, screenshoty a logy jsou v lokálním přejímacím reportu, nejsou produkčními GPS přidávanými do Gitu.

Bez změny API, DB, oprávnění, ukládání GPS nebo ostatních modulů. Fyzická instalace PWA není browser testem doložena.

Od verze 0.1.880 na požadavek uživatele červený bod nahrazuje oranžový ve všech společných indikátorech GPS (seznam, mapa, shluk, detail a přehled). Jde pouze o změnu barvy; podmínky Online/Offline zůstávají stejné.


## Umístění v detailu — 0.1.882

Indikátor dostupnosti je v záhlaví detailu vedle SPZ. Zachovává barvu, dostupnostní logiku i přístupný název Online/Offline. Původní buňku GPS napravo od rychlosti nahrazuje Poloha; samostatný řádek polohy pod metrikami se odstranil. Dlouhá adresa se zalamuje, při chybějící adrese zůstává původní fallback na souřadnice či Bez ověřené polohy. Výběr, GPS data ani grafika vozidel se nemění.

Doplnění 0.1.883: buňka Polohy zachovává původní SmartIcon tracking (špendlík) vedle adresy. Text se zalamuje ve zbývající šířce; název Poloha je zarovnaný s adresou.
