# Poloha vozidel – izolovaná implementace zadání 1.3

Stav: implementováno v pracovní větvi, NENASAZENO. Estetické schválení Radimem není doloženo. Syntetický náhled ani automatické testy nejsou ověřením produkčního Google Maps / T-Cars spojení.

Výchozí audit zadání: `c37cd96b3313ad5d8678e1018f76bf1b9d98f72e` (0.1.829). Při zahájení odpovídal načtenému `origin/main`. Implementace vychází z novějšího izolovaného PWA commitu `758685ac6ec89ff26b5ead1447e6c6757da5a4be` (0.1.830). Původní rozpracovaný checkout nebyl upraven. PWA soubory, produkční konfigurace a backend zůstávají zachované; úzká výjimka pro dočasný výpadek viditelné mapy je popsána níže. Číslo 0.1.830 zde není tvrzením o produkční verzi této úpravy.

## Implementace

- `src/vehicle-map/model.js`: čistá normalizace a slučování podle kanonického / poskytovatelova ID, platnost času a souřadnic, poslední známý platný bod pouze v aktuální paměti, disjunktní filtry, přiřazený a neověřený aktuální řidič odděleně. Význam `tcars-position-${gps.id}` byl ověřen v parseru jako ID vzorku, nikoli vozidla. Původní nulové sentinel podmínky backendu se nemění.
- `spatial.js`: obrazovkové prahy 72 × 64, následné slučování kolizí skutečných rezervovaných obdélníků, nejvýše osm roztažených ikon a měřené popisky. V rezervě je zahrnutý prstenec, focus, stavový odznak, šipka i text pod shlukem.
- `google-map.js`: existující Google Maps JS loader, `OverlayView`, klíčované značky, měření po idle/resize/filtru. Bez automatického fit při obnově. Časové změny nemění obrázkový DOM. Výběr zůstává samostatným vozidlem; počet zbylé skupiny ho znovu nezapočítává.
- `workspace.js` a scoped CSS: zachovaný user bar, kaiser., HP a oprávněné odkazy; žádná nová boční navigace. Panel 328/304 px, mobilní spodní panel 168 px, detail ve stejném panelu, klávesnicové ovládání, světlo/tma, bílé obrazové dlaždice. Mapový pohled je vždy 2D. Historie a satelit jsou přístupné kompaktně.
- Původní animace společných tlačítek měnila při stisku jejich `transform`. U značek je potlačená, aby geografický kotevní bod během kliknutí neposkočil.
- `src/data/sessionGuard.js`: jen již viditelná a odemčená mapa s platnou známou expirací a oprávněním může během dočasného výpadku ponechat paměťový obsah. Expirace, 401, potvrzené 403, odhlášení a návrat do skryté relace ochranu neobcházejí. Ostatní obrazovky nadále používají původní offline zamčení. Návrat z pozadí znovu ověřuje relaci.

Mapa používá raster roadmap a lokální tlumené styly. V existující inicializaci tohoto modulu není `mapId`, proto se nekombinuje cloud styling s ignorovaným polem `styles`. Nalezená existující browser konfigurace byla vyzkoušena v izolovaném náhledu. Google ji pro místní adresu odmítl chybou `RefererNotAllowedMapError`; restrikce klíče nebyly měněny. Skutečný styl tak zůstává neověřen. Podklad v izolovaném náhledu je otevřeně označený testovací adaptér, nikoli jiný produkční provider. Žádný nový klíč ani placená služba nejsou zavedené.

## Obrazové podklady a typy

Z balíčku `SMART_MAPA_VOZIDEL_v1_3.zip` jsou převzaty pouze osm dodaných WebP exportů, `DESIGN_TOKENS.json` a manifest původu. Zdroj OpenArt `RFjR59F0v68BkvJ6Avpl`, Nano Banana 2.1, 4800 × 3584 px. Atlas a staré konstrukční SVG nejsou součástí nové produkční rodiny. Atlas zůstává v původním referenčním balíčku mimo produkční payload. Barvy rastru se nemění. Přesné #75BD25 / #202821 se používají v UI.

Mapové exporty mají dohromady 14 334 B, větší exporty 43 540 B; celkem 57 874 B. Stejná rodina se sdílí mezi vozidly. Původní sdílené assety jiných modulů nejsou smazané.

Přiřazení podtypů vychází výhradně z existujícího `VEHICLE_TRACKING_CUSTOM_ICON_BY_LICENSE_PLATE` v `src/data/vehicleTracking.js`, nikoli z názvu nebo značky:

| Podtyp | Existující jednoznačná přiřazení SPZ |
|---|---|
| tanker | 1BI4520, 9C83570, 5B14417, 5E73753, 1BC3390 |
| skip_loader | 3BH5548, 5B80857, 3BP2836, 2BR0904 |
| ověřený hákový nosič (prezentační container_truck) | 8B43007, 1BM1150, 3BF1394, 1BR6359, 2BD8835, 3BP5305, 3BI2007 |

Obecný `container_truck` bez podtypu má „Kontejnerové vozidlo“ a `?`. Jinak je použit pouze doložený typ evidence; starý odvozený `iconType` a fallback na collection_truck se nepřebírají. Nové fleet enumy ani provozní záznamy se nezapisují. Pět neobrazových typů má neutrální monogramy.

## Spuštění a testy

- `npm run preview:vehicle-map` – localhost `http://127.0.0.1:5188/sledovani-vozidel`, skutečný aplikační UI kód, syntetické odpovědi API, oddělený testovací mapový adaptér. Žádné připojení na produkční GPS. Náhled neposkytuje zápisové endpointy a naslouchá pouze na 127.0.0.1.
- Volitelně `VEHICLE_MAP_GOOGLE_RUNTIME=/cesta/k/existujici/runtimeConfig.js npm run preview:vehicle-map` použije již existující browser klíč a skutečný Google SDK, stále výhradně se syntetickými vozidly. Klíč se nekopíruje do zdrojů ani reportu. Místní origin musí být povolený existující konfigurací; náhled restrikce neobchází a při odmítnutí nepřepne tiše na adaptér.
- `npm run test:vehicle-map` – datová normalizace, deduplikace, hraniční hodnoty, počty a geometrie.
- `npm run test:vehicle-map:browser` – vyžaduje externě dostupný Playwright a Chrome. `PLAYWRIGHT_MODULE_PATH` může ukazovat na instalaci Playwright. Není přidána produkční závislost. Test v samostatném kontextu blokuje externí HTTPS a používá dočasný lokální server. `VEHICLE_MAP_BROWSER=webkit` spustí stejné scénáře v dostupném WebKitu; `VEHICLE_MAP_OUTPUT` volí samostatný adresář výsledků. Oba enginy prošly 46/46 kontrolami.
- `node scripts/vehicle-map/asset-audit.mjs /cesta/k/SMART_MAPA_VOZIDEL_v1_3` – shoda hashů s dodanými exporty, velikosti a měření textového kontrastu.
- Stávající gate: syntax, build 49 rout a související tracking/auth/PWA/build testy.

Testovací skripty a syntetická data jsou mimo `src` a `public`, tedy mimo produkční build. GPS data ani historie se nezapisují do localStorage, sessionStorage nebo IndexedDB. Nejsou aktivované SMS, oznámení, geofencing, PTO/práce ani žádný zápis T-Cars.

## Známé limity a nutné odchylky

1. Přihlášená produkční mapa není dostupná. Existující Chrome ukázal přihlašovací obrazovku; samostatné GET konfigurace v tomto prostředí vracely 403. Nebyl odeslán OTP ani vytvořen nový klíč. Následně byla nalezena browser konfigurace v existujícím lokálním PWA buildu. Skutečný Google SDK v izolovaném náhledu odpověděl `RefererNotAllowedMapError` pro `http://127.0.0.1:5190/sledovani-vozidel`. Restrikce klíče nebyly změněny. Náhled proto používá viditelně označenou neutrální mřížku; geografický podklad, skutečné atribuce a integrace OverlayView zůstávají NEOVĚŘENO.
2. Pokud se ani osm roztažených ikon fyzicky nevejde bez kolizí (například úzký mobil s mapou 220 px a ovladači), zůstává kompletní seznam skupiny. Vybraný člen se zobrazuje samostatně. Toto je minimální prostorová odchylka, nikoli změna souřadnic nebo skrytí členů seznamu.
3. Chybějící podtypy jsou schválené monogramy, nikoli odchylka. Přesný mapový styl a estetické schválení dosud potvrzené nejsou.
4. Syntetická sada 18 vozidel není tvrzením o aktuální velikosti flotily. Časy 200vozidlového testu měří místní renderování adaptéru; skutečný pan/zoom Google a neregrese proti původní přihlášené mapě nejsou doložené.
5. Mobilní klávesnice je ověřena zmenšením viewportu. Fyzická iOS/Android klávesnice a instalovaná PWA nejsou tímto simulovány. Po instalaci odpovídajícího testovacího runtime 2336 prošel existující PWA browser gate ve WebKitu 26.5 (iPhone, simulovaný standalone, desktop a regresní scénáře relace). Také 46/46 scénářů nové mapy prošlo ve WebKitu. Fyzickou instalaci na iOS to nenahrazuje.

Přejímací výsledky, screenshoty a přesný diff jsou v doprovodném adresáři `outputs` pracovního zadání. Produkční nasazení vyžaduje samostatné schválení. Tato větev nebyla nasazena ani sloučena.
