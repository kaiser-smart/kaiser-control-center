# SMART ODPADY — dokončená SVG sada podle originálu

Stav k 26. 10. 2026: **implementováno lokálně, otestováno, NENASAZENO**. Základ 0.1.853 (`2d5668827d439298226d6852901526decb343638`), větev `codex/approved-icon-integration-current`. Nejde o tvrzení, že tato verze je stále nejnovější produkcí; před případným nasazením je nutné znovu ověřit hlavní větev a použít release guard.

## Rozsah a původ

- Zachováno šest přímo schválených ikon z `docs/icon-reference/approved-icons.png`. Hash přílohy: `163caa0d38059e647d40ee9148a5211e56d82464ab6383a0ab1a26a2d4d58c98`. Jejich SVG se při doplnění sady nezměnila.
- Doplněno všech **63 ikon z OpenArt** podle této přílohy. Uživatel výslovně povolil nové generování odpovědí „Ano, vytvořit 63 ikon podle originálu“. Projekt: [OpenArt SMART ODPADY](https://openart.ai/suite/image?projectId=Se5cXknUSHaom3A8Jq3B). Byly použity dokončené výstupy 11 listů; příliš silné první varianty pěti listů byly nahrazeny opravami. Nejde o tvrzení individuálního schválení všech výsledků: `userApprovedExact` zůstává true pouze u původní šestice.
- Výsledek: **69 UI ikon a 36 SVG aliasů vozidel**. Registry pokrývá všech 21 skutečných modulů; veřejné soubory jsou v `public/icons/ui` a `public/vehicles/icons`. SVG mají viewBox 24 × 24 a obě barvy #243128 / #75BD25. Bez rastrových obrázků, gradientů, filtrů, stínů a podkladových dlaždic.
- Ikony se propisují přes stávající `SmartIcon` do navigace, modulů, záhlaví a tlačítek. Textový znak návratu v detailu vozidla byl nahrazen SVG šipkou vlevo; cíl odkazu a obsluha zůstávají stejné.

## Převod a výjimka u pauzy

68 ikon je přímo trasovaných ze zdrojových pixelů (6 z přílohy + 62 z OpenArt) pomocí dvou barevných masek a Potrace 2.1.8. Podkladové černé rožky, které některé generace převzaly z přílohy, jsou před výpočtem výřezu odstraněny jako malé izolované komponenty v rozích. Do obrázku uvnitř ikony se nepřikresluje.

Pauza měla i po opravě generátorem silné svislice. Pro její SVG jsou změřeny osy a svislé meze obou skutečných OpenArt pruhů; export je vyjádří zaoblenými obdélníky o šířce **1 px při velikosti 24 px**. Osy, výška a umístění barev se zachovávají. Jde o výslovnou korekci šířky, nikoli pixelově totožnou stopu. Je zaznamenána jako `vectorAdjustment` v manifestu a ověřena zvlášť; není skrytá v toleranci testu věrnosti.

Zdrojové PNG, ID generací, URL, hashe, výřezy, transformační matice a hashe SVG jsou dohledatelné v `docs/openart-source-input.json` a `docs/icon-provenance.json`. Velké zdrojové PNG slouží pouze přípravě v pracovním výstupu a nejsou vložené do aplikace. Geometrie se neupravuje ručně v `definitions.js`; reprodukuje ji převodní skript.

## Ověření

- Build **52 cest**, cílené testy **21/21**, kontrola syntaxe **811 JS/MJS souborů**, bez chyby. Po doplnění posledních kontrol prošel také samostatný test sady.
- WebKit 26.5, profil iPhone 13 / DPR 3, šířky **375, 390, 430, 768 a 1440 px**: **120 obrazovek** (24 cest × 5 šířek), bez JS chyb, přetečení, rasterových náhrad a podkladových dlaždic ikon.
- **20** podrobných kontrol výsledných stylů pro admina/řidiče, Moduly/Nepřítomnost a pět šířek. Fokus OČR, scroll, disabled, syntetická safe area, OS dark a stávající tmavá paleta mapy prošly. Aplikace nemá nově přidaný dark mode.
- **41** sad funkčních kontrol: sedm rolí, menu, hledání, oprávnění, formuláře Nepřítomnosti a validace, filtry vozidel, detail a skutečné kliknutí na SVG návrat, historie, mapa, klávesnice a změna orientace. API odpovědi a zápisy jsou lokální syntetické; nevznikly produkční záznamy.
- **105/105** samostatných SVG validních a načtených přes skutečný WebKit `<img>`. Původní chyba XML atributu `data-icon-accent` zůstává opravená.
- **68/68** přímých převodů prošlo porovnáním zdroje/SVG při 20/24/28 px. Nejhorší 95. percentil vzdálenosti kontur je **0,141 px při 24 px**. Pauza prošla kontrolou os, výšky, polohy a šířky 1 px odděleně.

Výsledky: `docs/openart-original-family-verification.json`; úplné protokoly a screenshoty jsou v pracovním prostoru `outputs/openart-original-family/` (složky `surfaces`, `styles`, `functional`, `standalone`, `review`).

## Kontrast a velikost

Tmavá na bílé: **13,59 : 1**. Zelená na bílé: **2,32 : 1**, proto zůstává akcentem doprovázeným tmavým tvarem a textovým/přístupným názvem; neuvádí se samostatná WCAG shoda zelené. Schválená paleta se neměnila.

69 SVG má **212,919 B**, největší **7,381 B** (pod 8 KiB); gzip sdílených definic **74,396 B**. Inline vykreslení používá stávající cache. Nejde o měření rychlosti skutečného telefonu.

## Před a po

Reprodukovatelné dvojice používají stejnou roli admin, syntetická data a viewport. Výchozí vzhled je z 0.1.851, výsledná úprava z 0.1.853; relevantní rozložení těchto obrazovek bylo v obou základech shodné.

| Obrazovka | Před | Po |
|---|---|---|
| Moduly, 390 px | [Před](icon-review/original-family/modules-before.png) | [Po](icon-review/original-family/modules-after.png) |
| Nepřítomnost, 390 px | [Před](icon-review/original-family/absence-before.png) | [Po](icon-review/original-family/absence-after.png) |
| Moduly, 1440 px | [Před](icon-review/original-family/desktop-before.png) | [Po](icon-review/original-family/desktop-after.png) |

[SVG návrat v detailu vozidla](icon-review/original-family/vehicle-back-after.png). Úplná lokální galerie: `outputs/openart-original-family/index.html`; zdroj a vektor vedle sebe: `review/index.html`. ZIP obsahuje všech 105 samostatných SVG a provenance.

## Zachované funkce a konkrétní limity

Backend, databáze, oprávnění, verze aplikace, produkční konfigurace, GPS a přiřazení ikon ke konkrétním vozidlům nejsou touto změnou upraveny. Home stále vede na přehled, návratové odkazy zůstávají návratovými odkazy. Dvě položky spodní navigace na Moduly a pět uvnitř modulů jsou doložené kontextové chování, zachované včetně oprávnění.

**Fyzický iPhone/Safari/PWA: NEOVĚŘENO.** Testy jsou emulace WebKitu; syntetická safe area nenahrazuje reálný telefon. Tyrkysové bloky z dodaného fyzického screenshotu se nereprodukovaly a nejsou označeny za opravené. Pixelová analýza ukázala jejich přesah do systémového stavového řádku, konkrétní původ však není doložen. Legitimní zelené zvýraznění OČR zůstává zachované.

## Reprodukce a návrat

```sh
node scripts/export-icons.mjs
node scripts/icon-system.test.mjs
node scripts/build.mjs
node scripts/svg-assets-browser.test.mjs
node scripts/icon-system-browser.test.mjs
node scripts/icon-integration-browser.test.mjs
node scripts/mobile-ux-browser.test.mjs
```

Browserové testy používají `PLAYWRIGHT_MODULE_PATH`, `PLAYWRIGHT_BROWSERS_PATH` a volitelný `PWA_TEST_OUTPUT`. Převod potřebuje Python s Pillow/cv2/numpy a Potrace 2.1.8. Při regeneraci všech 69 zdrojů použít `node scripts/trace-openart-icons.mjs <adresar-zdroju>`; zdroje PNG mají názvy `sources/<historyId>.png`, příloha se čte z commitu. Následuje `render-openart-proof.mjs` a `check-openart-fidelity.py`. Záměrná korekce pauzy se provede automaticky a zůstane dohledatelná.

Změny jsou v samostatném implementačním commitu; přesný hash a příkaz `git revert` je v předávacím `outputs/openart-original-family/REPORT.md`. Pro úplný návrat původní šestice a XML exporteru patří k této větvi i předchozí commit `433a2caf`. Produkce se v tomto běhu neměnila, produkční rollback tedy není potřeba. Nasazení vyžaduje nový výslovný souhlas a aktuální kontrolu hlavní větve.
