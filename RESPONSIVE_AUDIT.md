# Responsive audit Kaiser Control Center / Smart odpady

Datum: 2026-06-30
Rozsah: frontend responsivita, hlavne mobil 360-430 px, tablet 768 px, desktop 1280+ px.
Produkce pro audit: https://kaiser-control-center.pages.dev/
Lokální náhled: http://127.0.0.1:6021/

## Shrnutí

Audit se zaměřil na použitelnost v terénu: Datová schránka, seznam zpráv, detail zprávy, přílohy, tabulky, formuláře, navigace, spodní/akční prvky, modaly a prázdné/chybové stavy.

Lokální preview Datové schránky vrací bez produkčních ISDS secretů prázdný seznam zpráv. Reálný detail zprávy s přílohou tedy nebyl otevřen z live dat. Markup a CSS pro seznam, detail a přílohy byly ověřeny v kódu a opraveny systémově.

Po opravě proběhlo lokální DOM měření přes prohlížeč:

- Datová schránka: 360 / 390 / 430 / 768 / 1440 px, horizontální overflow 0-1 px, hledání a rychlé filtry viditelné, kontrolované dotykové prvky bez malých výšek.
- Dovolená/nemoc: 390 / 768 px, horizontální overflow 0 px, kontrolované dotykové prvky bez malých výšek.
- Nastavení: 390 px, horizontální overflow 0 px, kontrolované dotykové prvky bez malých výšek.
- Homepage: 390 / 1440 px, horizontální overflow 0-1 px.

## Nálezy

| Priorita | Modul / stránka | Viewport | Problém | Proč je to problém | Návrh opravy | Dotčené soubory | Stav |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | Datová schránka / seznam zpráv | 360-430 px | Mobilní CSS skrývalo `Příloha` badge a priority v kartě zprávy. | Uživatel v terénu nevidí hned, že zpráva má přílohu. | Nechat přílohu viditelnou, rozdělit kartu na odesílatel / název / metadata. | `src/styles.css` | Hotovo |
| P1 | Datová schránka / hledání a filtry | 360-430 px | Hledání a rychlé filtry byly na mobilu skryté. | U dlouhého seznamu zpráv nejde rychle najít odesílatele, název nebo přílohu. | Zobrazit hledání a rychlé filtry jako kompaktní mobilní grid. | `src/styles.css` | Hotovo |
| P1 | Datová schránka / přílohy | 360-430 px | Dlouhé názvy příloh byly zkrácené ellipsis a akce nebyly vždy dotykově pohodlné. | Příloha je nejdůležitější část zprávy a musí být čitelná bez hledání. | Přílohy zvýraznit, zalamovat dlouhé názvy, dát otevřít/stáhnout na plnou šířku. | `src/styles.css` | Hotovo |
| P1 | Datová schránka / detail zprávy | 360-430 px | Modal používal výšku bez plného safe-area doladění a akce mohly být stísněné. | Na iPhonu může detail působit natěsno a spodní akce se hůř používají. | Upravit `100dvh`, safe-area padding, grid akce a plnou šířku tlačítek. | `src/styles.css` | Hotovo |
| P1 | Dovolená/nemoc / tabulky | 360-430 px | Kartový layout tabulek používal absolutně pozicované štítky vlevo. | U delších jmen/poznámek se štítek a hodnota překrývaly. | Přepnout buňky na label nahoře, hodnota pod ním, bez absolutního odsazení. | `src/styles.css` | Hotovo |
| P1 | Tabulky / uživatelé a DS sync log | 360-430 px | Některé tabulky spoléhaly na horizontální scroll nebo neměly mobilní labely. | Široká tabulka je na mobilu v terénu špatně čitelná. | Převést tabulky s `data-label` na karty, doplnit labely pro DS sync log. | `src/app.js`, `src/styles.css` | Hotovo |
| P2 | Dotykové prvky | 360-768 px | Některé taby, filtry a stránkovací tlačítka měly 30-36 px výšku. | Hůř se ovládají prstem. | Nastavit klíčové mobilní prvky na cca 44 px. | `src/styles.css` | Hotovo |
| P2 | Datová schránka / prázdný stav | 360-430 px | Lokální mock bez zpráv zobrazuje hlavně stránkování, seznam je prázdný. | Není to blokace, ale horší testovatelnost detailu a příloh. | Doplnit později bezpečná mock data pro UI test příloh bez produkce. | `scripts/serve.mjs` | Neopraveno |
| P2 | Produkční live detail příloh | produkce | Bez přihlášeného produkčního stavu nebyl otevřen reálný detail s přílohou. | Nelze potvrdit reálný soubor a dlouhé názvy z produkčních dat. | Po nasazení ověřit produkční přijatou zprávu s přílohou. | produkce | Neověřeno |

## Co bylo opraveno

- Mobilní Datová schránka má viditelné hledání a rychlé filtry.
- Mobilní karta datové zprávy upřednostňuje odesílatele a název, metadata jsou pod nimi.
- Badge `Příloha` zůstává na mobilu viditelný.
- Sekce příloh je výraznější, dlouhé názvy se zalamují.
- Tlačítka příloh jsou na mobilu velká a na plnou šířku.
- Detail datové zprávy respektuje `100dvh` a safe-area lépe než předtím.
- Tabulky Dovolená/nemoc, uživatelé a DS sync log se na mobilu chovají jako karty.
- DS sync log má `data-label` pro mobilní zobrazení.
- Klíčové mobilní akce mají dotykovou výšku cca 44 px.

## Co zůstává neověřené

- Reálný produkční seznam datových zpráv s přílohami, protože lokální dev server vrací prázdný seznam a produkční přihlášení nebylo v tomto běhu použito.
- Reálné otevření/stáhnutí produkční přílohy z Datové schránky.
- Screenshotová dokumentace po opravě. Místo toho proběhlo lokální DOM měření viewportů a HTTP smoke.

## Rizika

- CSS používá cílené override bloky na konci souboru. Je to záměr, protože soubor už obsahuje pozdní DS bezpečnostní override vrstvy.
- Pokud se později přidá nová tabulka bez `data-label`, mobilní card layout nebude mít popisek hodnoty.
- Produkční DS data mohou mít extrémně dlouhé názvy nebo nestandardní metadata, která je potřeba ještě ověřit na živém vzorku.

## Doporučený další krok

Po nasazení ověřit na produkci jednu přijatou datovou zprávu s přílohou na šířkách 390 px a 430 px: seznam, detail, příloha otevřít/stáhnout, žádný horizontální scroll.
