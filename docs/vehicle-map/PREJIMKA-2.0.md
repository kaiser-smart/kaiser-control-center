# Poloha vozidel 2.0 — přejímka 26. 10. 2026

**Verdikt: NEHOTOVO K PRODUKČNÍMU NASAZENÍ.** Nové funkční rozhraní je implementované a ověřené v izolovaném i živém chráněném náhledu. Finální realistická rodina ikon chybí a živý endpoint historie vrací HTTP 503 také ve stávající produkci. PR musí zůstat draft; merge a deploy nesmí proběhnout, dokud nejsou obě blokace vyřešené a opakovaně ověřené.

## Zdroj a rozsah

- Větev `codex/vehicle-location-2`. Výchozí `origin/main` při zahájení `2d566882`, během práce bezpečný fast-forward na `150eb725` (0.1.855). Souběžné změny Zakázek z PR #255/#256 zachované.
- Produkční veřejná buildMeta při kontrole: verze **0.1.855**, branch `main`, commit `150eb72`, datum buildu `2026-10-26 01:46`. To je existující produkce, nikoli vydání tohoto redesignu.
- Číslo nové produkční verze zatím nebylo přiděleno. `package.json` zůstává na převzaté verzi 0.1.855; branch a commit identifikují pracovní implementaci.
- [Nová předloha OpenArt](https://openart.ai/suite/create-image/gpt-image-2?projectId=US8UZpz2nvEkuGgKgli7), [přesný PNG návrh](https://cdn.openart.ai/openart-ai/production/2026-10/create-image/4Uq2ErddY1F6nBa82NGF/gpt-image-2.5-sunburst-1_1792961574255_aed644d2.png). Návrh byl skutečně otevřen a vizuálně prostudován. Není vložen do aplikace jako pozadí.
- Povinné zdroje: `PŘÍRUČKA.md`, `vehicleTrackingMantra.js`, původní README a přejímka mapy, `ICON_SYSTEM.md`, `MOBILE_UX_SPEC.md`, model, prostorové algoritmy, Google renderer, session guard a kontrakt historie.
- Žádné změny backendu, DB, migrací, Cloudflare konfigurace, uživatelských oprávnění, GPS zdrojů ani obchodních dat. Testovací fixture/adapter je pouze v `scripts/`, build jej nezahrnuje.

## Implementováno

- Nová kompozice: samostatný kompaktní seznam vlevo 320 px (288 px na menším desktopu), mapa přes zbytek pracovní plochy, kontextový detail vpravo nad mapou. Seznam zůstává při detailu dostupný.
- Bílá / `#F6F8F8`, grafit `#263238`, border `#DFE5E5`, akcent `#75BD25`, Quicksand. Žádné KPI karty ani nová globální navigace.
- Okamžité hledání podle názvu, SPZ, interního čísla, typu a doloženého přiřazeného řidiče. Filtry Všechna/Jede/Stojí/Bez GPS; zachované samostatné staré a neznámé stavy v rozbalení.
- Názvy a SPZ, skutečné GPS stáří, dostupná rychlost a explicitní historický stav. Aktuální řidič se neodvozuje ze jména vozidla; přiřazený řidič se takto označuje.
- Transparentní malé mapové značky 36 × 24 px, dotykový cíl 48 × 44 px, neutrální shluky. Typy nadále určuje původní model z evidence. Neurčená nástavba zůstává neurčená, neodhaduje se z názvu.
- Google Maps s jemnější paletou, zachované vrstvy, zoom, vystředění, clustering, spiderfy, měřené kolize popisků, heading a stáří dat.
- Výběr posune pouze značku mimo zakrytou část mapy. Obnova GPS a zavření detailu necentrují mapu. Ovládání mapy je při desktopovém detailu posunuté vlevo, aby nezakrývalo obsah.
- Mobil: plná mapa mezi existujícími navigacemi, Mapa/Vozidla, samostatný seznam po osmi řádcích, dolní detail jedním klepnutím, safe-area a visualViewport. Pole má 16 px kvůli automatickému zoomu iOS. Změna období historie používá podporované API hodnoty `24h`, `7d`, `today`; dřívější nepodporované `30d` odstraněno pouze z UI.
- Zachování rolování a rozbalení detailu při obnově, klávesového fokusu po změně skupiny, Escape i ochrany před opožděnou odpovědí historie pro jiné vozidlo.

## Automatické testy — skutečně provedené

| Kontrola | Výsledek a omezení |
|---|---|
| Syntaxe po převzetí aktuálního main | PASS, 811 JS/MJS souborů |
| Build | PASS, 52 rout |
| `git diff --check` | PASS |
| `model.test.mjs` | PASS, 14 scénářů: identita, neplatné/staré/future GPS, shluky a stabilita |
| Chrome `browser.test.mjs` | PASS, 57/57 scénářů |
| WebKit `browser.test.mjs` | PASS, 57/57 scénářů |
| Skutečný Google SDK `google-integration.test.mjs` | PASS, 13/13 scénářů; včetně dvou skutečně vyčkaných 60s obnov. Vozidla v této sadě jsou syntetická. |
| Backendové regresní sady sledování | PASS: tcars-vehicle-detail, tcars-pairing-audit, maps-config, history, analytics, fleet-trip-job-pairing, preferences |
| Bezpečnost a integrace | PASS: auth-session, integration-server, pwa, icon-system |
| PWA WebKit nad finálním buildem | PASS: iPhone profil, simulovaný standalone, desktop, 11 scénářů offline/expiry/logout/změna práv. Skutečné auth handlery s mock OTP pouze v lokálním testu. |

Sada 57 testů zahrnuje všechny požadované rozměry plus 412 a 768 px, hledání včetně řidiče, filtry, stránkování, změnu vozidla, skutečný čas GPS proti času obnovy, 6/20 shodných poloh, 200 vozidel, kolize, zachování DOM značky/kamery, scroll/fokus, historii a odmítnutí opožděné odpovědi, 401/403, expiraci, resume, offline a odhlášení. Test historie ověřil 2 platné body, vyřazení neplatného bodu, změnu období a odstranění trasy po zavření.

První běhy našly chyby fokusování u skupiny, obnovy scrollu a mobilního rychlého stránkování; byly opraveny a celé sady znovu prošly. Testovací čekání na start velké aplikace/odhlášení bylo upraveno na odpovídající časový limit. Původní neúspěšné běhy nejsou vykazovány jako PASS.

## Živý chráněný náhled

Přihlášení dokončil uživatel na `http://127.0.0.1:5173/sledovani-vozidel`. Relace z produkce nebyla kopírována. Náhled používá existující omezený transport, stejný backend a autorizaci. Uloženy jsou jen screenshoty požadované uživatelem, souhrny a metadata požadavků; žádné cookies, klíče ani export GPS do Git.

| Scénář | Pozorování |
|---|---|
| Flotila a mapa | 57 skutečných vozidel, 56 s mapovou polohou, 1 bez ověřené GPS. Skutečné Google Maps a atribuce, žádná chyba oprávnění SDK. |
| Hledání | SPZ bez mezer dala 1 z 57 a jednu značku. Hledání názvu cisterna dalo 8 z 57. |
| Jede / Bez GPS | V době kontroly žádné jedoucí vozidlo — korektní prázdný stav. Bez GPS jedno vozidlo, žádná značka, deaktivované vystředění, důvod neplatného GPS vzorku. |
| Shluk | Kliknutí na skutečný shluk otevřelo přesně 40 členů. |
| Detail | Ověřené jméno, SPZ, deklarovaný typ, rychlost 0, skutečná adresa a GPS čas. Žádný domyšlený aktuální řidič. |
| Obnova a kamera | Ruční obnova i následující GPS aktualizace ponechaly vybranou značku a shodný Google odkaz s centrem/zoomem. Zavření detailu zachovalo kameru. |
| Řízený výpadek | Pouze lokální transport vrátil 503. Zůstala mapa, výběr i kamera a zpráva s poslední úspěšnou obnovou. Po návratu transportu skutečné GPS znovu načteny. Produkční API nebylo vypínáno. |
| Mobil | Živá mapa i seznam na 390 × 844, detail jedním klepnutím; na 320 × 700 scrollWidth=320 a spodní hrana mapy nad existující navigací. |
| Historie | **FAIL / BLOKACE:** skutečný GET `/api/vehicle-tracking/history` vrátil HTTP 503. Stejná historie selhala i přímo v původní produkční aplikaci. Není to důkaz nové UI regrese, ale požadovaná funkce end-to-end neprošla. |
| Odhlášení | Skutečný logout v náhledu provedl POST, data byla skrytá a následně odstraněná. `/api/me` a `/api/vehicle-tracking/status` poté zobrazily `Nepřihlášeno.`; nové otevření modulu zůstalo na přihlášení. |

Čtecí diagnostika existence dvou tabulek historie přes Wrangler skončila chybou Cloudflare Authentication 10000. Dotaz žádné schéma ani data nezměnil. **Příčina HTTP 503 proto není určena**; chybějící tabulka nebo binding nejsou potvrzeným faktem. Změny DB/API/config nejsou v tomto zadání povolené.

## Vizuální porovnání a zbývající grafika

Kompozice nového návrhu je převedena do funkčních komponent: levý seznam, dominantní světlá mapa, jemné hranice, střídmý akcent, malý kontextový detail. Stávající hlavní navigace je zachována podle zadání. Mobil má samostatné pracovní uspořádání.

**Věrnost finálním realistickým ikonám NEPROŠLA.** Celkový PNG návrh neobsahuje samostatné průhledné produkční exporty. Dočasné siluety jsou byte-for-byte převzaté z dříve dodaného konstrukčního archivu `SMART_MAPA_VOZIDEL_v1_3/assets/icons`. Jsou jasně označené jako dočasné v legendě a v `public/vehicles/silhouettes/provenance.json`. Nejde o schválenou finální rodinu 2.0. Nebyly nově generované ani ručně překreslené. Původní 1.3 dokumentace výslovně označuje tyto konstrukční SVG za nefinální.

Podle `PŘÍRUČKA.md` část 13 finální assety dodává Radim nebo Martin. Potřeba: cisterna, svozový vůz, hákový nosič, ramenový nosič, dodávka, osobní vůz, přívěs, speciální technika a neutrální neurčený typ. SVG nebo kvalitní průhledné PNG/WebP, společné měřítko a orientace, bez bílé dlaždice. Čitelná silueta při 36 × 24 px na mapě a 64 × 43 px v seznamu/detailu. Nová sada musí následně projít porovnáním s přesným OpenArt návrhem v obou motivech.

## Důkazy a screenshoty

Lokální důkazy jsou ve workspace vedle repozitáře, nikoli v Git:

- `outputs/v2-chrome/browser-verification.json` a screenshoty adapteru: syntetický regresní test, nepovažovat za Google mapu.
- `outputs/v2-webkit/browser-verification.json`.
- `outputs/v2-google/verification.json`, `overview-desktop.png`, `detail-1440.png`, `detail-1024.png`, `detail-390.png`, `detail-320.png`: skutečný Google podklad, syntetická vozidla, finální rozmístění ovládání.
- `outputs/v2-live/overview-1440x900.jpg`, `detail-1440x900.jpg`, `detail-1024x768.jpg`, `detail-390x844.jpg`, `detail-320x700.jpg`, `list-390x844.jpg`: skutečný backend a skutečná vozidla. Tyto snímky vznikly před posledním přesunutím desktopového zoomu vlevo od detailu; finální rozmístění potvrzuje následná Google sada. Původní snímky nejsou retušované.
- `outputs/v2-unit-tests.log`, `outputs/v2-check-syntax.mjs.log`, `outputs/v2-build.mjs.log`, `outputs/v2-pwa/`.

## Neověřeno / nepřijato

- Úspěšné načtení skutečné historické trasy (HTTP 503).
- Finální realistické ikony a úplná vizuální shoda.
- Fyzická instalace na konkrétní iPhone, hardwarová klávesnice/softwarová klávesnice a bezpečné okraje na reálném zařízení. Ověřeny browser viewporty a WebKit profily; to není fyzický pilot.
- Kompletní správnost zdrojové kategorizace flotily: některé názvy naznačují jiný druh vozidla než deklarovaný typ. Název není důkaz, identita se v tomto redesignu neopravovala ani nepřepárovávala.
- Nový redesign v produkci, deployment guard a následná produkční přejímka: **neprovedeno**, neboť podmínky přijetí nejsou splněné. Oprávnění k pozdějšímu nasazení již uživatel udělil, rutinní souhlas se znovu nevyžaduje.

## Další bezpečný postup

Dodat finální samostatnou rodinu ikon; obnovit oprávněný čtecí přístup k diagnostice historie a určit příčinu 503. Případná oprava DB nebo Cloudflare je nový zásah mimo schválený rozsah tohoto redesignu. Po nápravě zopakovat skutečnou trasu a vizuální přejímku, aktualizovat aktuální `origin/main`, přidělit release verzi a dokončit PR. Teprve po přijetí všech bodů použít čistý přesný `main` a `npm run deploy:pages:production`, pak ověřit skutečnou produkci.

Zveřejněno: NE. Produkční schválení nebylo využito; není dovoleno je zaměnit za schválení nedokončeného vzhledu nebo obcházení selhaného testu.
