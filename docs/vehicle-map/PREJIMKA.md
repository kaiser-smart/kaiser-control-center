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


### Nezávislé ověření souběžné produkce

Readback Cloudflare a přihlášeného prohlížeče potvrzuje produkci 0.1.832 / `1c503a285b94b9a3cfd02a3252d09e4577b31c97`, deployment `385830a9-f075-43b2-9e87-465546a88b07`. Tato větev jej nenasazovala. Po obnovení původní stránky pošty aplikace přesměrovala na hlavní přehled; v hlavní navigaci ani přehledu modulů není pošta. Soukromý screenshot: `private-integration/mail-hidden-production.png` ve workspace; není součástí veřejného ZIPu ani preview payloadu. Tím je skrytí pošty ověřeno i v aktuální produkci, nezávisle na izolovaném commitu `fd509c1d`. Novější produkční mobilní změny z 1c503a2 nejsou do mapové větve automaticky převzaté; před případným budoucím produkčním merge je nutné je porovnat a zachovat.


### Pokracovani bez Forpsi, 25. 10. 2026

Forpsi se na pokyn uzivatele nepouziva zadnym rozhranim. Novy pokus v existujicim Chrome nepotvrdil Access relaci: nabehne pouze formular e-mailoveho kodu. Zadny novy kod nebyl odeslan. Smart odpady podporuje telefonni OTP, ale tim se neresi predrazena Cloudflare Access brana.

Prihlasena administrace Cloudflare opakovane selhala chybou removeChild. Pravdepodobnou pricinou je automaticky preklad Chrome; volba puvodniho jazyka pro aktualni stranku po reloadu nevydrzela. Globalni nastaveni prekladace se nemenilo. Read-only pokus o precteni Access konfigurace pres existujici Wrangler autentizaci vratil HTTP 403. Zadna politika, poskytovatel identity, ucet, cookie ani autentizace nebyly zmeneny.

Dalsi ovladani prohlizece zastavil nastroj: Mac je zamceny a automaticke odemceni selhalo. Je nutne mistni odemceni Macu. To samo o sobe nezarucuje prihlaseni nahledu bez Forpsi. Vzdalena prihlasena prejimka zustava NEOVERENO; predchozi dolozene lokalni integracni vysledky se nemeni. Produkcni nasazeni v tomto pokracovani neprobehlo.


### Ověření přístupové brány po odemčení, 25. 10. 2026

Prohlížeč je znovu ovladatelný; předchozí blokace zamčeným Macem již neplatí. Přihlášená administrace Cloudflare nyní umožnila přímo přečíst nastavení:

- Pro `*.kaiser-control-center.pages.dev` platí aplikace `smart-odpady - Cloudflare Pages`, ID `e61c79ea-9062-49eb-80a9-12401816f376`.
- Zásada `Allow Members - Cloudflare Pages` obsahuje jedinou povolenou e-mailovou identitu **linkedin@nanolab.cz**. Dříve použitá adresa oplustil@kaiserservis.cz v této zásadě není. To je konkrétní překážka předchozího přihlášení, nikoli chyba mapy.
- Jediný nastavený poskytovatel identity je **One-time PIN**; existující alternativní SSO nebylo nalezeno.
- Formulář zásady byl pouze přečten a zavřen tlačítkem Zrušit. Žádné pravidlo, identita, délka relace ani poskytovatel nebyly změněny. Forpsi nebylo použito.

Důkazy: `outputs/access-identity-providers.png` a `outputs/access-allowed-identity.png` ve workspace. Vzdálená přihlášená přejímka zůstává **NEOVĚŘENO**, dokud neproběhne standardní přihlášení povolené identity. Pro případné vyhledání pouze přihlašovací zprávy v jiném připojeném Gmail účtu je vyžádán samostatný úzký souhlas; původní souhlas pro jinou schránku se na něj nepřenáší.


### Přihlášení přes schválený Gmail, 25. 10. 2026

Uživatel výslovně povolil v připojeném Gmailu radim@nanolab.cz pouze vyhledání přihlašovací zprávy Cloudflare pro linkedin@nanolab.cz a použití jejího kódu pro náhled. Cloudflare po odeslání správné adresy potvrdil odeslání kódu s platností 10 minut.

Vyhledání omezené na příjemce linkedin@nanolab.cz, odesílatele cloudflareaccess.com a poslední den selhalo chybou Gmail `failedPrecondition` / `search_failed_precondition`. Profil konektoru potvrzuje radim@nanolab.cz; žádný obsah zprávy nebyl vrácen. Webový Gmail nejprve vrátil Temporary Error (404), po jeho tlačítku Try Again přešel k nabídce přidání Gmailu pro jiný přihlášený Google účet. Formulář nebyl vyplněn ani odeslán.

Následující navigaci na Google Account za účelem volby správného účtu zastavila automatická kontrola: vyhodnotila ji jako rozšíření nad souhlas s jedinou zprávou. Bylo vyžádáno samostatné úzké povolení přepnout na radim@nanolab.cz bez změn nastavení nebo oprávnění. Žádný kód nebyl přečten ani zadán, Forpsi nebylo použito a ochrana náhledu zůstala beze změny. Vzdálená přihlášená přejímka je nadále NEOVĚŘENO.


### Oprava přihlášení vzdáleného náhledu, 25. 10. 2026

V postranním panelu byl vložený šestimístný Cloudflare PIN doplněný koncovou mezerou. Nativní validace formuláře proto bránila odeslání. Byla odstraněna pouze mezera; kód uživatele byl odeslán do původního Cloudflare formuláře. Kód ani přihlašovací cookies se do důkazů neukládají. Nebylo potřeba otevírat poštu ani přepínat Google účet.

Po odeslání byla poprvé dostupná chráněná aplikace, ale skončila chybou `ERR_TOO_MANY_REDIRECTS`. Preview Worker přepisoval `/` i `/sledovani-vozidel` na `/index.html`, který Pages kanonizuje zpět na `/`. Commit `dd20f131` přepisuje interní asset cestu na `/` a zpřístupňuje již balené soubory loga; seznam hostů, API, metody a oprávnění zůstávají stejné. Regresní test napodobuje skutečnou kanonizaci Pages a ověřuje odpověď 200 bez Location pro obě vstupní cesty.

První upload čekal na duplicitní soubor `icons/icon-512 2.png`, který měl lokální příznak `dataless` (iCloud). Proces byl ukončen. Commit `c75ddb36` dovoluje explicitní místní staging a odmítá neprázdný výstup, aby se nebalily staré nebo cloudové zbytky. Čistý balíček vznikl v `/private/tmp`; kontrola neprázdného výstupu i absence duplicitních názvů prošla.

Po této opravě se na skutečné vzdálené adrese v existující Access relaci načetl formulář Smart odpady včetně loga a banneru chráněného integračního náhledu. Cloudflare ověření je tedy potvrzené, nikoli odvozené jen z HTTP 302. Telefonní auth POST následně odhalil další chybu preview transportu: `Buffer.byteLength` není bez nodejs_compat ve Workeru dostupné. Commit `82fcfbdb` používá Web API TextEncoder a zachovává limit 4096 UTF-8 bajtů. Samostatný VM test bez Node globálů ověřil úspěšné předání auth POST i odmítnutí nadlimitního multibajtového těla. Existující ochrany 401/403/503, cookies a read-only kontrakt prošly také.

Finální preview upload oznámil úspěch na aliasu vehicle-map-v13, krátké deployment ID `20eae5c9`. Po opravě se skutečný formulář přepnul na zadání ověřovacího kódu Smart odpady. API z bezpečnostních důvodů potvrzuje pouze „Pokud je účet povolený, kód byl odeslán“; doručení SMS a přihlášení do aplikace zatím nejsou potvrzené. Formulář byl ponechán uživateli v panelu. Vzdálená Google mapa a skutečná GPS data v této relaci zůstávají NEOVĚŘENO do dokončení tohoto přihlášení.

Kontroly: build 49 rout PASS; syntaxe 755 JS/MJS PASS; transportní/regresní test PASS včetně kanonizace Pages a Worker prostředí bez Buffer. Důkaz otevřeného chráněného náhledu je soukromě v `private-integration/remote-login-after-fix.png`. Forpsi nebylo použito, Access politika a Google klíč se neměnily, produkce nebyla touto prací nasazena.

Readback Cloudflare 2026-10-25T09:06:29.144Z: preview `20eae5c9-36dd-4b8e-b042-5c6faf908488`, environment preview, status success, commit `82fcfbdb`. Současná produkce je `00e2a589-6ad4-4840-bd6e-7b9873d20dfe` / `b5e5a1c53a56f7e26a8225fa1e513f9cc35b0398`; vznikla mimo tuto preview práci. Před případným produkčním merge je nutné zachovat i tyto novější změny.
