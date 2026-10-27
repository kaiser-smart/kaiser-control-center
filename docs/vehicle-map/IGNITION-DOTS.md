# Tečky zapalování

Schváleno Radimem 27. 10. 2026: zelená = zapalování zapnuto, červená = vypnuto.

Zdroj je explicitní boolean `ignition` z existujícího T-Cars API (`gpsData.zapalovani`). Rychlost ani dostupnost GPS nenahrazují údaj o zapalování. Zachovává se poslední explicitní stav i po zestárnutí GPS. GPS fallback nesmí nahradit novější zapalování: stav i čas jsou ze stejného nejnovějšího vzorku telemetrie. Pokud nový vzorek zapalování neobsahuje, nevydává se starší boolean za jeho stav. Pomlčka znamená „Zapalování nezjištěno“, nikdy automaticky vypnuto.

Nápověda: „Zapalování vypnuto · poslední stav dnes 08:42“. Datum i čas se formátují v Europe/Prague; pro jiný den se zobrazí celé datum včetně roku. Neplatný nebo nepřípustně budoucí čas je nezjištěný, nepřebírá se čas stažení. V detailu lze na tečku klepnout (44 × 44 px) a zobrazit stejný text; rozbalení zůstává při obnově stejného vozidla.

Stejný komponent používá seznam, detail, mapa, události a tabulka (sloupec Zapalování). Skupina má společnou tečku jen pokud je stav všech členů známý a shodný. Dostupnost GPS, její filtr a statistiky zůstávají oddělené. Jízdní stav a pulzování se nadále řídí existující logikou pohybu; stojící auto se zapnutým zapalováním nepulzuje.

Ověření: marker-visibility.test.mjs, browser.test.mjs a ignition.browser.test.mjs (izolovaná data, skutečné Google Maps, Chrome/WebKit). Bez změn API, databází, oprávnění, GPS souřadnic či grafiky vozidel.
