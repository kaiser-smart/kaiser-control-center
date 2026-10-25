# Integrační přejímka mapy vozidel v1.3

25. 10. 2026. Navazuje na commit `1689d262`. **Produkční aplikace nebyla nasazena ani změněna.** Tato přejímka již obsahuje skutečnou Google mapu a přihlášený T-Cars backend; původní report je zachován v [PREJIMKA_1689d262.md](../../../outputs/PREJIMKA_1689d262.md).

## Dostupný chráněný náhled

**[Vzdálený náhled pro Radima](https://vehicle-map-v13.kaiser-control-center.pages.dev/sledovani-vozidel)**

Samostatná Cloudflare Pages preview větev `vehicle-map-v13`, prostředí `preview`. Anonymní návštěva stránky i `/api/vehicle-tracking/status` vrací 302 do existující Cloudflare Access ochrany. Za ní zůstává běžné přihlášení Smart odpady a autorizace stávajícího backendu. Žádné nové účty, klíče, databázové vazby ani rozšíření Access politiky. [Důkaz ochrany](../../../outputs/remote-preview-access.png), [ověření deploymentu](../../../outputs/remote-preview-verification.json).

Testovací transport dovoluje pouze konkrétní čtecí endpointy a běžný login/logout. Business zápisy jsou zakázané. Neobsahuje GPS snímky, modelový fallback, cookies ani privátní klíče. Odpovědi se necachují. Přesný preview host je kontrolován také ve workeru; náhodná hashová adresa není určena k použití.

Lokální chráněná integrace byla provedena na `http://127.0.0.1:5173/sledovani-vozidel`. Po požadovaném testu odhlášení zůstává odhlášená. Vzdálený náhled nevyžaduje běh lokálního serveru.

**Rozsah vzdáleného ověření:** deployment a Access ochrana jsou ověřené. Dokončení přihlášení a následný runtime readback přímo na vzdálené adrese zatím čeká na přihlášení uživatele. Následující živé testy byly skutečně provedeny v chráněném lokálním náhledu proti současnému produkčnímu backendu, nikoli proti mocku.

## Google klíč

Ověřený existující klíč `Kaiser Control Center Maps`, projekt `inbound-byway-309319`. Lokální porty 5173 a 53000 již byly povolené; dříve odmítnutý port 5190 se nepoužívá.

Po výslovném souhlasu Radima byl uložen jediný nový referrer:

`https://vehicle-map-v13.kaiser-control-center.pages.dev/*`

Opětovné otevření uloženého klíče potvrdilo všech sedm adres. Původních šest zůstalo beze změny:

- `http://127.0.0.1:5173/*`
- `http://127.0.0.1:53000/*`
- `http://localhost:5173/*`
- `http://localhost:53000/*`
- `https://kaiser-control-center.pages.dev/*`
- `https://smart-odpady.ai/*`

Omezení aplikace zůstalo **Websites**, povolená API pouze **Maps JavaScript API**. Klíč nebyl rotován ani kopírován do nového souboru. [Uložená omezení API](../../../outputs/google-referrer-saved.png), [uložený seznam referrerů](../../../outputs/google-referrers-saved-list.png). Samotné uložení není vydáváno za runtime ověření vzdáleného přihlášeného náhledu.

## Skutečná Google mapa

[Automatické výsledky](../../../outputs/integration-google/verification.json): **14/14 PASS**, skutečný Maps JavaScript SDK a raster roadmap, existující klíč, syntetická vozidla. [Zátěž a tmavý motiv](../../../outputs/integration-google/scale-verification.json): další **2/2 PASS**.

- Značky a všechny čtyři dodané obrázky se načetly, podklad a atribuce jsou skutečné Google. Žádný `RefererNotAllowedMapError` ani neošetřená runtime chyba.
- Viditelný výběr zachoval skutečný Google střed/zoom; posun a tlačítko zoomu fungují, sever a nulový náklon zůstávají.
- Šest shodných bodů: jeden shluk → šest dostupných vozidel se spojnicemi. Dvacet shodných bodů: úplný skupinový seznam, po výběru jeden marker a zbývajících 19; žádné dvojí započtení.
- Stará poloha 47 minut zůstává na mapě bez směrové šipky. Ve tmavém motivu obrázek zůstává barevný na bílé dlaždici.
- Detail v šířkách 320, 390, 412, 768 a 1024 px, přehled 1440 px. Bez horizontálního přetečení; mapa nejméně 220 px, skutečná atribuce viditelná.
- Dvě skutečně odčekané minutové obnovy nad Google mapou se syntetickými odpověďmi zachovaly přesný střed/zoom, počet kamerových zásahů a výběr.
- Hustých 200 vozidel: každé započteno právě jednou, žádný průnik aktivních obdélníků.

| Měření nad skutečnou Google mapou, 200 syntetických vozidel | Vzorků | Medián | p95 | Maximum |
|---|---:|---:|---:|---:|
| pan + dvě animation frames | 30 | 33,4 ms | 34,1 ms | 67,1 ms |
| zoom + dvě animation frames | 30 | 33,3 ms | 34,0 ms | 78,1 ms |

Měří se odezva operace přes dvě animation frames, nikoli úplné stažení mapových dlaždic, fyzické mobilní FPS ani srovnávací výkon původní produkční mapy. Neregresi proti staré produkční UI tímto měřením nelze tvrdit.

Snímky s výhradně syntetickými vozidly na skutečné mapě: [přehled](../../../outputs/integration-google/overview-desktop.png), [výběr](../../../outputs/integration-google/selected-desktop.png), [6 vozidel](../../../outputs/integration-google/group-six.png), [20 vozidel](../../../outputs/integration-google/group-twenty.png), [stará poloha](../../../outputs/integration-google/stale-desktop.png), [mobil 390](../../../outputs/integration-google/detail-390.png), [200 vozidel](../../../outputs/integration-google/dense200.png), [tmavý motiv](../../../outputs/integration-google/dark-selected-stale.png).

## Skutečná T-Cars data a obnova

Přihlášený aktuální backend vrátil **57 vozidel**, `provider=tcars`, `isLive=true`, `isDemo=false`, `fallback.enabled=false`. API ani jeho konfigurace se neměnily. Přehled a filtry se počítají z nového normalizovaného modelu, nikoli z původního API summary.

U doložené cisterny byly přímo proti autorizované JSON odpovědi ověřeny stabilní externí vehicle ID, SPZ, individuální mapování na obrázek cisterny, originální čas GPS, `speedKmh=0`, `ignition=false` a platnost GPS. Výslovné „Zobrazit polohu“ vystředilo bod shodný se zdrojem do 0,000001 stupně a zachovalo zoom. Souřadnice ani odpověď API nebyly uloženy do testovacích fixtures nebo veřejného reportu. Řidič zůstává „Neověřeno“.

Skutečný shluk 34 vozidel otevřel právě 34 řádků. Mobilní rámec 390 × 844 se stejnou přihlášenou relací zobrazil skutečnou cisternu, obrázek, stav a Google atribuci. Fyzický telefon ani softwarová klávesnice tímto testem nejsou simulovány.

| Událost | Europe/Prague, 25. 10. 2026 | Doložený výsledek |
|---|---|---|
| Výchozí úspěšná obnova | 03:31:47 | Vybraná cisterna, střed a zoom zaznamenány z Google UI. |
| První automatická obnova | 03:32:48 | HTTP 200; interval 60,730 s; výběr a kamera beze změny. |
| Druhá automatická obnova | 03:33:49 | HTTP 200; interval 60,941 s; výběr a kamera beze změny. |
| Řízené přerušení transportu | 03:34:21 | HTTP 503; všech 57 vozidel a výběr zůstaly, stav „Obnova se nezdařila“, žádné TEST/modelové vozidlo. |
| Návrat spojení | 03:34:31 | HTTP 200; úspěšná obnova skutečných dat, výběr zachován. |
| Odhlášení | 03:36:58–59 | Logout HTTP 200, následné `/api/me` 401; markery i seznam odstraněny, přihlášení zobrazeno v desktopové i mobilní kartě. |

Živý výpadek byl řízený HTTP 503 v testovacím transportu; síť počítače ani produkční T-Cars služba nebyly vypínány. Skutečné browser offline/online události byly zvlášť ověřeny v izolovaných Chrome/WebKit testech.

**Soukromé snímky skutečných provozních dat** jsou pouze lokálně mimo Git, veřejný reportový balíček a vzdálené nasazení: [galerie](../../../outputs/../private-integration/index.html), [přehled](../../../outputs/../private-integration/overview-live.png), [finální výběr a stará poloha](../../../outputs/../private-integration/selected-live-final.png), [hustá skupina](../../../outputs/../private-integration/group-live.png), [mobilní detail](../../../outputs/../private-integration/mobile-detail-live.png), [výpadek](../../../outputs/../private-integration/connection-failure-live.png), [odhlášení](../../../outputs/../private-integration/logout-live.png), [obnovy](../../../outputs/../private-integration/refresh-verification.json).

## Nalezené odchylky a omezení

1. **Budoucí GPS časy ve zdroji:** první kontrolovaná odpověď obsahovala 11 vzorků více než 120 s v budoucnosti. Parser předává `datumCas` jako `lastGpsAt` bez přepočtu. Příčina u poskytovatele není potvrzena; možná souvislost se změnou času není doložená. UI správně ukáže neověřený čas a „Bez polohy“, případně původní doloženou poslední známou polohu. Čas se neopravuje odhadem. Po restartu bez předchozí paměti proto může být více vozidel bez polohy než během nepřerušené relace.
2. **Vzdálený runtime po přihlášení zatím čeká na přihlášení uživatele.** Nasazení, Access přesměrování a uložený Google referrer jsou ověřené; přihlášený transport/Google runtime na této konkrétní vzdálené adrese zatím ne.
3. **Fyzický mobil, klávesnice a srovnávací výkon staré produkční mapy zůstávají neověřené.** Syntetické viewport testy a skutečný Google výkon jsou doloženy výše; nejsou náhradou těchto kontrol.
4. **Opravena chyba posunu detailu:** výběr jiného auta již nepřebírá posun předchozího detailu. Obnova stejného vozidla posun zachovává. Nový smysluplný browser scénář prošel v Chrome i WebKitu.
5. V této noční kontrole nebylo v normalizované čerstvé kategorii jedoucí vozidlo; aktuální pohyb a čerstvý heading byly ověřeny synteticky, nikoli jízdou skutečného vozu.

Nové grafické varianty, náhradní obrázky ani provozní funkce nevznikly. Pro mapu se používají menší WebP, pro seznam/detail větší; osm souborů dohromady 57 874 B.

## Zdroj, izolace a regresní kontroly

Zachován commit `1689d262`; merge `3f023c17` přidal přesnou aktuálně nasazenou PWA 0.1.831 (`ef07b8e4297a8402c751ec72160ee51495f6f0a4`) bez zásahu do cizího rozpracovaného checkoutu. Produkční deployment před/po preview zůstal `b8ba2579-42dd-4060-bf58-7a133de07c4d`. Preview nemá D1/R2 ani produkční secret bindings.

- [Chrome](../../../outputs/integration-regression-chrome/browser-verification.json): **47/47 PASS**.
- [WebKit](../../../outputs/integration-regression-webkit/browser-verification.json): **47/47 PASS**. Online test nyní čeká na skutečné dokončení reautorizace, ne na pevnou nedostatečnou pauzu 180 ms.
- [Existující tracking/auth/PWA/build kontroly](../../../outputs/integration-regression.json): **14 sad PASS**.
- [Finální PWA browser gate](../../../outputs/integration-pwa.log): PASS, včetně cross-tab logout a ochrany při opožděné odpovědi. Fyzická iOS instalace netestována.
- [Transportní kontrakt](../../../outputs/integration-proxy-final.log): přesné hosty/endpointy/metody/origin, zachované 401 a Secure/HttpOnly cookie, žádné cizí cookies, přesměrování backendu odmítnuto, 503 bez modelových dat, business writes zakázány.
- [Syntax](../../../outputs/integration-syntax-final.log), [build](../../../outputs/integration-build-final.log): PASS, 49 rout.

Přesný seznam změn a diff tohoto kola: [integration-changed-files.txt](../../../outputs/integration-changed-files.txt), [integration.patch](../../../outputs/integration.patch). Aktuální zdrojový commit je uveden v [integration-delivery.json](../../../outputs/integration-delivery.json). Produkční nasazení vyžaduje samostatné schválení.


## Doplnění 25. 10. 2026: skrytí modulu Firemní pošta

Na výslovné upřesnění Radima je odstraněn vstup Pošta z hlavní navigace i odkaz Otevřít poštu z nastavení Forpsi. Jde o skrytí vstupů v UI; přímá chráněná cesta, schránky, zprávy, API a oprávnění zůstávají zachované. Změna je určena pro izolovaný náhled, nikoli produkční nasazení.

Soubory: `src/app.js`, `src/components/ForpsiAdminPanel.js`. Ověření: dashboard test prošel, 27/27 existujících testů Forpsi administrace a čtení pošty prošlo, 755 souborů prošlo kontrolou syntaxe, build 49 rout prošel. Spuštění skutečné funkce sestavující navigaci potvrdilo nepřítomnost pošty a zachování sledování vozidel i nastavení. Nejde o nové ověření přihlášeného vzdáleného UI.

Pokus otevřít vlastní schránku přes přihlášené SO.ai pro dokončení OTP byl automatickou kontrolou zamítnut: posoudila přístup k soukromým zprávám jako nepovolený v rámci pokynu ke skrytí modulu. Zprávy tímto pokusem nebyly přečteny. Ochrana náhledu se neobchází; konečné přihlášené ověření vzdálené adresy zůstává nehotové.
