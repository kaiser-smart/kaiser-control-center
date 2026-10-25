# SMART ODPADY · sjednocení ikon

Stav: **PŘIPRAVENO KE KONTROLE, NENASAZENO**. Datum: 25. 10. 2026.

Implementace vychází z aktuálního zdroje `work/mobile-app`, základ `1169737c` (verze 0.1.840), větev `codex/unified-2d-icons`. Původní složka `app` není aktuální zdroj a nebyla upravena. Nebyl proveden push, deploy, změna oprávnění ani zápis do produkčních služeb.

## Výsledek

- 69 samostatných SVG, společná mřížka 24 × 24 a oblé linky 2,2 px. Každá ikona obsahuje #243128 a #75BD25; bez rastru, filtrů, gradientů a stínů.
- Jednotné ikony pro všech 20 modulů, navigaci, záhlaví, výběr nepřítomnosti, mapy, ovládací tlačítka a hlasového pomocníka. Domeček se zelenou střechou vedle názvu aplikace na mobilu i desktopu.
- Odstraněny podkladové dlaždice ikon a samostatné CSS/textové symboly. U tlačítek se zeleným podkladem a novou ikonou je použit neutrální povrch, aby zelený akcent nezanikl. Dlouhé názvy mobilního menu se zalamují.
- Mapování 36 dodaných ikon vozidel převedeno na SVG. Zachováno přiřazení SPZ a typů; šest mapových siluet směřuje na sever, proto je odstraněna původní grafická korekce 135°. GPS azimut, zdroje, interakce a stavové popisky se nemění. Známé staré PNG/WebP adresy jsou normalizovány na nové SVG, vlastní uživatelské obrazové URL zůstávají daty.
- SVG jsou dekorativní (`aria-hidden`, `focusable=false`); ovládací prvky zachovávají názvy a původní obsluhu. Neviditelné prvky nezískávají nová oprávnění.

Původní loga, fotografie, avatary a PNG požadované PWA manifestem/Apple touch ikonou nejsou ikony ovládacího rozhraní a zůstávají zachované. Staré rasterové soubory vozidel zůstávají na disku pro kompatibilitu, vestavěná mapa je už nevybírá.

## Schválené vzory

Použity dvě dokončené 2D sady z OpenArt projektu `Se5cXknUSHaom3A8Jq3B` (projekt má historický název „SMART ODPADY | 3D ikony“, ale vybrané vzory jsou výslovně 2D):

- `jBrggqXVTmQUWteApJ9n`: domeček, moduly, nepřítomnost, poloha, zakázky, více.
- `Zw32HlusnZqNioouvOcO`: vozidlo, faktura, tým, dashboard, nastavení, notifikace.

Oba vzory byly načteny z OpenArt a vizuálně zkontrolovány. SVG jsou ručně vytvořené vektorové implementace stejného stylu, nikoli vložené rastrové výřezy. Nebyla spuštěna nová generace návrhu.

## Kontroly

- Build: 49 rout, úspěšný. Syntaxe: 748 JS/MJS souborů, úspěšná.
- 9 testovacích souborů prošlo: sada SVG, zaměstnanci, mapování vozidel, oprávnění hlášení řidičů, auth session, výstupy řidiče, tabletové audio, Šarlota a verzování importů.
- WebKit: 23 obrazovek × 5 šířek = 115 kontrolovaných zobrazení (375, 390, 430, 768 a 1440 px). Bez chyb vykreslení a vodorovného přetečení. Kontrolovány skutečné rozměry ikon 20–28 px, barvy, tloušťka linek, odstranění podkladů a absence vestavěných rastrových ikon.
- Mobilní funkční test: menu a hledání, dotykové cíle, žádost o nepřítomnost a validace časů, seznam a detail vozidel, filtry, historie, seznam mapových poloh, klávesnice, editor oprávnění, odhlášení. Sedm rolí ověřeno také přihlášením přes skutečné auth handlery s mock OTP.
- WebKit mobilní režim: pevné lišty, nezávislé rolování, vstupy 16 px, zachování rozepsaných dat při otočení, simulovaná klávesnice a iOS gesta. Mapa má zachovanou výjimku pro vlastní gesta.
- Chrome: 7 rolí × 3 šířky = 21 kombinací; hledání modulů, seznam zaměstnanců, karta, přepínání záložek, návrat, staré adresy a oprávnění prošly.
- Všechny browserové testy používají lokální server a syntetická data. Externí síť je blokovaná, API odpovědi jsou testovací. Automatické synchronizace se zachytávají lokálně; neposílají se do produkce.

**Fyzický iPhone: NEOVĚŘENO.** Ověření proběhlo v desktopovém WebKitu s profilem iPhonu, nikoli na fyzickém zařízení. Nástroj pro přístup k zařízení (`xcrun devicectl`) není v prostředí dostupný. Reálné GPS, hlasové služby, produkční API a síťový výkon fyzického telefonu nejsou těmito lokálními testy doloženy.

## Kontrast a výkon

- #243128 na bílé: **13,59 : 1**.
- #75BD25 na bílé: **2,32 : 1**. Samotná schválená zelená nesplňuje 3 : 1 proti bílé; slouží jako akcent a identitu/akci doprovází tmavá geometrie a text nebo přístupný název. Barevná paleta nebyla svévolně změněna. Nejde o tvrzení úplné WCAG shody ikon.
- #75BD25 proti #243128: **5,87 : 1**.
- 69 SVG má dohromady **26 784 B**, největší **494 B**. Sdílené definice mají gzip **2 576 B**. Inline vykreslení je cachované a nevyžaduje jednotlivé obrázkové požadavky.
- 36 mapových SVG aliasů má celkem **14 537 B** proti **4 912 151 B** odpovídajících původních PNG. Jde o porovnání souborů, nikoli tvrzení o naměřeném zrychlení na fyzickém iPhonu.

## Podklady ke kontrole

[Galerie před/po](../../../outputs/unified-2d-icons/index.html) obsahuje 118 dvojic (115 obrazovek a 3 mobilní menu). [Celá sada 20/24/28 px](../../../outputs/unified-2d-icons/after-all/icon-catalog.html). Strojové výsledky jsou v `asset-audit.json`, `after-all/audit.json`, `functional/audit.json`, `native-mobile/audit.json` a `desktop-functional/browser-results.json`.

## Existující moduly

| Modul | Adresa | SVG |
|---|---|---|
| Dashboard firmy | `/dashboard` | `dashboard` |
| Vozidla | `/vozovy-park` | `fleet` |
| Poloha vozidel | `/sledovani-vozidel` | `tracking` |
| Datové schránky | `/datove-schranky-plus` | `mail` |
| Hlášení z vozidel | `/hlaseni-ridicu` | `jobs` |
| Servis vozidel | `/servis-udrzba` | `service` |
| Pneumatiky | `/pneumatiky` | `tyres` |
| Svozové trasy | `/trasy-svozu` | `routes` |
| Odběrové trasy | `/trasy-vzorku` | `sampling` |
| Zákazníci / Vistos | `/vistos` | `customers` |
| Náklady | `/naklady` | `costs` |
| Nezaplacené faktury | `/pohledavky` | `invoice` |
| Reporty | `/reporty` | `reports` |
| Zprávy RCS a SMS | `/rcs-sms-konverzace` | `message` |
| Zaměstnanci | `/zamestnanci` | `team` |
| Nepřítomnosti | `/dovolena-nemoc` | `absence` |
| Uživatelé a role | `/uzivatele` | `users` |
| Nastavení | `/nastaveni` | `settings` |
| Stav systému | `/kontrola-systemu` | `system` |
| Samoopravy | `/samoopravy` | `repair` |

Další navigační položky: hlavní stránka/moduly, rychlá nepřítomnost, připomínky a chyby. Výběr modulů na úvodní stránce zůstává stejný jako v základní verzi.

## Údržba

Zdroj: `src/components/icons/definitions.js`, renderer `SmartIcon.js`, mapování `moduleIconNames`, jednotný vzhled `src/icon-system.css`. Veřejné SVG jsou v `public/icons/ui/`; mapové aliasy v `public/vehicles/icons/`.

```sh
npm run icons:export
npm run test:icons
npm run build
npm run test:icons:browser
```

Browserové testy potřebují Playwright a kompatibilní WebKit; lze použít `PLAYWRIGHT_MODULE_PATH` a `PLAYWRIGHT_BROWSERS_PATH`. Bez instalovaného Playwrightu nemění test produkční závislosti aplikace.

## Ukázky uložené přímo v commitu

| Obrazovka | Před | Po |
|---|---|---|
| Hlavní stránka iPhone | [Před](icon-review/before-home-390.png) | [Po](icon-review/after-home-390.png) |
| Mobilní menu | [Před](icon-review/before-menu-390.png) | [Po](icon-review/after-menu-390.png) |
| Nepřítomnost iPhone | [Před](icon-review/before-dovolena-nemoc-rychle-zadani-375.png) | [Po](icon-review/after-dovolena-nemoc-rychle-zadani-375.png) |
| Hlavní stránka desktop | [Před](icon-review/before-home-1440.png) | [Po](icon-review/after-home-1440.png) |
