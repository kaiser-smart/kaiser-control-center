export const VEHICLE_TRACKING_MANTRA = Object.freeze({
  version: "1.0",
  updatedAt: "26. 7. 2026 14:20",
  updatedAtIso: "2026-07-26T14:20:40+02:00",
  updatedBy: "Codex",
  status: "Produkční read-only GPS modul",
  title: "Sledování vozidel – provozní mantra",
  lastChange: "Oddělené GPS metriky a audit",
  summary: "Sledování vozidel je produkční read-only přehled aktuální polohy a historie firemních vozidel. Aktuální GPS poskytuje T-Cars přes chráněný backend, zatímco Vozový park zůstává zdrojem identity vozidla. GPS body, vypočtené jízdy a denní metriky patří do ARCHIVE; audit a stav cloudových přepočtů patří do AUDIT. Cloudový sběr běží bez otevřeného prohlížeče a otevření dashboardu ani modulu synchronizaci nespouští. Systém nesmí vymýšlet polohu, vzdálenost ani ekonomické hodnoty, při chybě nesmí automaticky přepnout na demo data a žádná read-only obrazovka nesmí zapisovat do T-Cars, měnit oprávnění nebo odesílat notifikace.",
  rules: Object.freeze([
    "Kanonická trasa modulu je /sledovani-vozidel.",
    "T-Cars je zdroj pravdy pro aktuální GPS polohu a technická data, která jeho API skutečně poskytuje.",
    "Vozový park je zdroj pravdy pro identitu vozidla a interní vazbu na firemní evidenci.",
    "T-Cars, jméno řidiče, telefon ani SPZ nejsou zdrojem uživatelských oprávnění.",
    "Přístup se ověřuje na backendu oprávněním vehicle-tracking:view.",
    "GPS body, souhrny jízd a denní metriky se ukládají v DB_ARCHIVE.",
    "Stav, výsledek a historie cloudových přepočtů se ukládají v DB_AUDIT.",
    "Čtecí analytický endpoint vyžaduje DB_ARCHIVE i DB_AUDIT a při chybějícím bindingu selže bezpečně.",
    "Cloudový sběr GPS historie běží každou minutu a analytický přepočet každých pět minut bez otevřeného prohlížeče.",
    "Otevření dashboardu nebo modulu pouze čte existující data a nespouští cloudovou synchronizaci.",
    "Vzdálenost se počítá pouze z platných uložených GPS bodů; demo, odhadované ani dopočítané provozní hodnoty se nesmějí vydávat za skutečnost.",
    "Kvalita, čerstvost, poslední známá GPS hodnota a chyba zdroje se zobrazují pravdivě.",
    "Při výpadku API se demo režim nezapíná automaticky a poslední známá hodnota musí být jasně označená.",
    "Read-only endpointy ani dashboard nesmějí zapisovat do T-Cars, měnit GPS data nebo párování vozidel.",
    "Geofencing, WIM upozornění, SMS a aplikační alerty zůstávají návrhem bez ostrého automatického odesílání, dokud nejsou samostatně schválené.",
    "Provozní GPS data se nesmějí ukládat do localStorage, sessionStorage ani IndexedDB.",
    "Chyba načtení nesmí spustit nekonečné překreslování; ovládání zůstane použitelné a nové načtení je vědomá ruční akce."
  ])
});
