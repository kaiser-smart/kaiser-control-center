# Tečky zapalování

Schváleno Radimem 27. 10. 2026: zelená = zapalování zapnuto, červená = vypnuto.

Zdroj je explicitní boolean `ignition` z existujícího T-Cars API (`gpsData.zapalovani`). Rychlost ani dostupnost GPS nenahrazují údaj o zapalování. Používá se poslední platný, nezastaralý vzorek podle existujícího limitu zdroje (výchozí 30 minut). Chybějící, neplatná nebo zastaralá hodnota nemá barevnou tečku; pomlčka a popisek oznámí nedostupnost. Nejde o třetí barvu ani odhad vypnutého zapalování.

Stejný komponent používá seznam, detail, mapa, události a tabulka (sloupec Zapalování). Skupina má společnou tečku jen pokud je stav všech členů známý a shodný. Dostupnost GPS, její filtr a statistiky zůstávají oddělené. Jízdní stav a pulzování se nadále řídí existující logikou pohybu; stojící auto se zapnutým zapalováním nepulzuje.

Ověření: marker-visibility.test.mjs, browser.test.mjs a ignition.browser.test.mjs (izolovaná data, skutečné Google Maps, Chrome/WebKit). Bez změn API, databází, oprávnění, GPS souřadnic či grafiky vozidel.
