# Zakázky — přejímací report UI/UX, 26. 10. 2026

Výchozí main: `ef271e7d360a20e95611117d31e1f1738beaff9e`, obsahuje PR #245, #263 a #267. Před vydáním se připojují novější změny main; nedochází k návratu starých ikon nebo mobilního shellu.

Autorita: uživatelem dodané `ZADANI_PRO_CODEX.md` v1.1, část 3.3 a pravidla dostupnosti, a `SMART_VISTOS_UI.html`; Provedení také podle `SLEDOVANI_VOZIDEL_CASY_ZAKAZEK.md`. Rozsah tohoto vydání je UI/UX Zakázek a čtení existující historie. Původní širší účetní/importní zadání není prohlášeno za dokončené.

## Přejímací výsledek

| Oblast | Implementace a ověření |
|---|---|
| Priorita 2026010094 | Živá předchozí verze potvrdila právě dvě položky: 557315 / 14 06 03 / 0.018 a 557316 / 06 05 02 / 0.215. Nový desktop má jeden řádek pro každou položku, mobil dvě karty. Technická pole jsou zavřená v Podrobnostech položky. |
| Přehled | Zákazník/kontakt, místo/služba, termín/stav, lidé/technika. Dva sloupce, na telefonu jeden. Chybějící osobní právo není vydáváno za chybějícího řidiče. Odkazy tel/mailto jen pro poskytnuté ověřené a validované hodnoty. |
| Provedení | Oddělený plán a skutečnost T-Cars; podmínky identity/místa/jednoznačnosti, oddělené přiřazení/pokrytí, čtyři metriky, podklady a mezery. Nedostupné údaje nejsou 0 min. Původní časy v rozbalení, žádný výpočet mzdy nebo technologie z GPS. |
| Položky | Popis produktu, lokalizované přesné množství, doložená jednotka nebo „Nedoložena“. Finanční sloupce jen s právem. Ceny hlavičky zvlášť a bez odvozeného součtu. Původní přesnost i nulové hodnoty zachované. |
| Doklady | Samostatné karty dostupných smluvních/objednávkových/fakturačních referencí, faktury jen s finančním právem. Žádné vymyšlené odkazy nebo stav úhrady. Dostupnost příloh výslovně oddělena od prázdného seznamu. |
| Všechna data | Čtyři sloupce, hledání v označeném záznamu, volba hlavičky nebo položky, stránkování položek. Role filtrované stávajícím serverovým pravidlem. Filtrovaný JSON jen integrační správce. |
| Historie | Časová osa, zdroj, dostupný autor a rozbalení změněných polí. Server vydá názvy změn pouze ze zpřístupněných polí; autor jen při osobním právu. Zachované stránkování, nové bezpečné opakování čtení při chybě. |
| Mobil a klávesnice | Detail na celou obrazovku, pevný nadpis/taby, posuvný obsah, 44px ovladače. Role tab/tabpanel, šipky/Home/End, focus trap, Escape a návrat focusu. URL zachovává filtr i aktivní záložku při reloadu. |
| Zdrojová data | Bez migrace, změny kontraktu, změny disclosure, účetního zápisu či mutace ve Vistosu. Otevření záložek dělá pouze GET. Existující ruční čtecí import z #267 zůstává výslovnou akcí správce. |

## Ověření

- Datové/backend testy: přesná desetinná čísla, nula/null/chybějící/odmítnuté/chyba, XSS, firemní izolace, finanční a osobní práva, filtrace názvů polí v historii, existující importní a účetní ochrany.
- Regrese #263/#267: WebKit 390/1440, 101 položek / druhá stránka, aktuální načtení při vstupu, explicitní čtecí import, přímé otevření, ignorování opožděné odpovědi a prázdný/chybový stav.
- Nová UI matice: WebKit i Chromium, 375/390/768/1440 px; všech šest záložek, produkční CSS, dvě položky, žádné horizontální přetečení, klávesnice/focus, URL/reload, zákaz tracking přístupu + opakování, chyba historie + opakování, rozlišení nedokončeného importu od prázdného zdroje, finanční nula/měna.
- Kontrast textových párů ověřen na minimálně 4,5 : 1. Syntetické náhledy jsou v `docs/evidence/jobs-ui-2026-10-26/` a výslovně označeny syntetickým zákazníkem. Nenahrazují živé ověření produkce.
- Produkční nasazení a ověření se zaznamenává samostatně v lokálním předávacím reportu po sloučení; v tomto PR zatím není tvrzeno.

## Známé meze zdroje

Jednotka u dvou cílových položek není v autorizované odpovědi doložená; hodnoty se nepřevádějí na tuny, kilogramy ani objem. Název produktu je zdrojový text, ne nové potvrzení účetní či odpadové sémantiky. Význam množství není automaticky „provedeno“.

Toto vydání nedoplňuje neověřené GPS identity, historii zdroje, chybějící přílohové rozhraní, finanční oprávnění ani nové vazby faktur. UI jejich nedostupnost ukazuje konkrétně. Mobilní ověření proběhlo emulací viewportu v obou enginech, nikoli na fyzickém telefonu.
