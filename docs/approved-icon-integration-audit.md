# Oprava integrace schválených ikon — 25. 10. 2026

Stav: připraveno ke kontrole, NENASAZENO. Navazující zadání „Opravit ikony SMART ODPADY“ nahrazuje původní generování a nasazení: použít schválené podklady, žádné nové návrhy, produkce až po novém souhlasu.

## Výchozí stav a rozsah

Izolovaná větev `codex/approved-icon-integration` vychází z produkční revize `a0760a8f44df1ab13047a9cf558fe3fe161e35a5`, verze 0.1.851. Veřejné soubory aplikace, definice ikon, sdílená komponenta, CSS a vzorové SVG byly staženy pouze pro čtení a jejich SHA-256 porovnány s výchozím buildem; shoda je v `live/readback.json`. Metadata buildu jsou zaznamenána samostatně. Souběžné změny PWA a Nepřítomnosti zůstaly zachovány.

Schválený zdroj je skutečná uživatelská příloha `docs/icon-reference/approved-icons.png` (758 × 502), SHA-256 `163caa0d38059e647d40ee9148a5211e56d82464ab6383a0ab1a26a2d4d58c98`. Obsahuje právě šest ikon: home, modules, absence, tracking, jobs, more. Dalších 63 UI symbolů nemá doložený přesný schválený originál. Jejich geometrie se nemění a manifest je neoznačuje za schválené. Historický záznam generování OpenArt není důkaz schválení.

## Doložené příčiny a opravy

1. Nasazená šestice pocházela z novější velmi tenké generace OpenArt `WBQuydSLHFxFXvYBRwLR`, nikoli z přiloženého originálu. Odlišná je například dutá místo plné komínové části. Přibližná normalizovaná tmavá linka při 24 px byla 0,33–0,42 px; příloha má přibližně 0,8–1,0 px. Výsledné CSS mělo správné barvy, opacity 1 na ikonách i rodičích, bez filtru či blur. Příčinou tohoto rozdílu byla zdrojová geometrie a antialiasing, ne průhlednost CSS.
2. Původní manifest přisuzoval schválení podle názvu ikony. Nyní je navázané na skutečný typ zdroje a hash přílohy. Šestice byla vektorizována přímo z přílohy, bez nového generování a bez přikreslování detailů. Převod používá barevné masky, interpolaci zdrojového RGB před prahováním, Potrace 2.1.8 a jednotné proporční osazení do viewBox 24. Odstraněny jsou pouze komponenty dotýkající se hranic výřezů (rohy podkladového obrázku). Cílová paleta zůstává #243128 / #75BD25. Kontury jsou vyplněné cesty, nepřidává se další stroke. Zdroj je nízkého rozlišení: nejde o původní autorské SVG ani o bezeztrátovou shodu všech pixelů.
3. Export používal neplatný XML zápis `<g data-icon-accent ...>`. Inline HTML jej tolerovalo, samostatné SVG v obrazovém prvku nikoli. Oprava na `data-icon-accent=""` odstranila chybu u všech 105 souborů (69 UI + 36 vozidel). Skutečný WebKit test před opravou: 105 chyb; po opravě: 105 načtených a XML-validních SVG. U 99 souborů je toto jediná změna.
4. Tyrkysové průsvitné obdélníky z fyzického iPhonu se v lokálním WebKitu před opravou ani po ní nereprodukovaly. Prověřeny výsledné styly, rodiče, pseudoelementy, focus/hover, scroll a OS dark. Doložená příčina není známa; žádná spekulativní změna vrstev nebo pozadí nebyla provedena. Zelené zvýraznění OČR je legitimní stav a zůstává zachováno. Tento bod není označen za opravený.
5. Dvě položky na Moduly a pět uvnitř modulů jsou záměrná kontextová navigace odvozená z povolených položek sidebaru. Pro admina a řidiče byla ověřena stejná pravidla, cíle a dotykové plochy (nejméně 44 px). Struktura ani oprávnění se nemění.

## Změněné soubory

- `src/components/icons/definitions.js`: geometrie pouze šesti doložených ikon.
- `src/components/icons/SmartIcon.js`: platná XML serializace akcentové skupiny.
- `public/icons/ui/*.svg`, `public/vehicles/icons/*.svg`: regenerované samostatné exporty; 99 pouze oprava atributu.
- `docs/icon-reference/approved-icons.png`, `docs/openart-source-input.json`, `docs/icon-provenance.json`: skutečný zdroj, vazby, hashe a pravdivý stav schválení.
- `scripts/prepare-openart-masks.py`, `scripts/trace-openart-icons.mjs`: reprodukovatelný částečný převod přílohy se zachováním ostatních definic.
- `scripts/icon-system.test.mjs`, nové `scripts/svg-assets-browser.test.mjs` a `scripts/icon-integration-browser.test.mjs`: zdrojová identita, skutečné načítání SVG a cílená kontrola výsledného UI.

Beze změny zůstávají aplikační logika, CSS, role/oprávnění, backend, databáze, konfigurace nasazení a verze aplikace.

## Ověření a důkazy

Důkazy jsou v pracovním prostoru `outputs/icon-integration-audit/`; `index.html` je přehled pro kontrolu. Uživatelské fyzické screenshoty v `reference/` jsou odlišeny od reprodukovatelné lokální dvojice.

- WebKit 26.5, emulace iPhone 13 / DPR 3; šířky 375, 390, 430, 768 a 1440. Nejde o test na fyzickém iPhonu.
- `before/` a `after/`: shodné syntetické API/role/data, 24 cest × 5 šířek = 120 případů na každé straně, bez JS chyb a horizontálního přetečení. Desktopová šířka je testována v tomto stejném browser contextu.
- `styles-before/` a `styles-after/`: 20 shodných obrazovek (admin/řidič, Moduly/Nepřítomnost, pět šířek), výsledné styly, focus, scroll, dotykové plochy; po opravě navíc syntetická safe area a disabled.
- `functional/audit.json`: 41 sad kontrol, sedm rolí, navigace, otevření modulů, formuláře Nepřítomnosti a jejich validace, klávesnice/landscape/scroll. Zápisy jsou mockované, nevznikly produkční záznamy. Funkční test proběhl po opravě exporteru; následná finální změna se týkala pouze kontur šestice.
- `theme-audit/`: OS dark zachovává existující světlý aplikační shell; podporovaná tmavá paleta mapy ověřena při 390 a 1440 px. Nový dark mode se nepřidává. Safe area byla injektována synteticky, nenahrazuje fyzický PWA test.
- 23 cílených testů prošlo, 0 chyb; kontrola syntaxe 810 JS/MJS; build 52 cest. Protokoly v `work/icon-integration-fix/output/`.
- `review/fidelity.json`: šest zdrojových ikon porovnáno s finálními SVG při 20/24/28 px; 95. percentil vzdálenosti kontur nejvýše 0,141 px při 24 px. Antialiasing rastru a SVG se liší. `comparison/` obsahuje zdroj i výsledek vedle sebe.
- 69 UI SVG: celkem 245 540 B, maximum 8 105 B; gzip knihovny 85 170 B. Vykreslované ikony jsou vektorové, bez rastrových dlaždic. Tmavá na bílé má kontrast 13,59:1, schválená zelená 2,32:1; zelená je akcent doplněný tmavým tvarem/popiskem, nikoli samostatný kontrastní nositel informace.

## Reprodukce

Z kořene checkoutu, Node s podporou ES modules a Playwright s nainstalovaným WebKitem:

```sh
node scripts/build.mjs
node scripts/icon-system.test.mjs
node scripts/svg-assets-browser.test.mjs
node scripts/icon-system-browser.test.mjs
node scripts/icon-integration-browser.test.mjs
AUDIT_THEME_ONLY=1 node scripts/icon-integration-browser.test.mjs
node scripts/mobile-ux-browser.test.mjs
node scripts/check-syntax.mjs
```

`PLAYWRIGHT_MODULE_PATH` a `PLAYWRIGHT_BROWSERS_PATH` umožňují použití existujícího runtime; `PWA_TEST_OUTPUT` určuje adresář důkazů. Pro srovnání před opravou použít samostatný checkout výchozí revize a `ICONS_BASELINE=1`. Převod šestice: Python s cv2/numpy a Potrace 2.1.8 dostupný přes `PYTHON` / `PYTHONPATH` / `POTRACE_MODULE_PATH`, poté `node scripts/trace-openart-icons.mjs <adresar-dukazu> --only=home,modules,absence,tracking,jobs,more`.

## Limity a návrat

NENASAZENO. Přesné schválené originály dalších 63 symbolů nejsou k dispozici, proto se jejich geometrie nemění. Tyrkysové bloky z fyzického screenshotu zůstávají nereprodukované; jejich opravu ani fyzický iPhone/Safari/PWA nelze potvrdit. Kompletní sjednocení všech symbolů proto není uzavřeno.

Návrat izolované opravy je `git revert <commit-opravy>` z čisté větve. Přesný hash a příkaz je v externím předávacím `outputs/icon-integration-audit/REPORT.md`. Produkce se tímto během neměnila, takže produkční rollback není potřebný. Případné budoucí nasazení musí znovu ověřit aktuální hlavní větev a použít běžný release guard; tento checkout se nesmí nasadit naslepo přes novější souběžnou verzi.
