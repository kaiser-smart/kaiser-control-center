# SMART ODPADY — finální PWA 0.1.831

Stav: dokončená lokální příprava, **NENASAZENO**. Datum 25. 10. 2026. Přesný commit, základ, strom a součty uvádí `release.json`; aktuální výsledky jsou v `verification/` finálního balíčku.

## Implementace a zachovaný rozsah

Navazuje na místní implementaci 758685ac / 0.1.830, která rozšířila původní e26e6ff9. Produkční základ c37cd96 / 0.1.829 zachovává novější opravy vozového parku. Původní checkout zůstal nedotčený; finální větev je v aktuálním pracovním prostoru.

PWA má stabilní identitu/scope/start URL, standalone, česká metadata na 49 trasách a 404, neprůhledné ikony Apple 180 a PWA 192/512 a maskovatelnou ikonu. Zachovává Quicksand a stávající UI. Bez service workeru, offline cache, nové aplikační knihovny nebo placené služby.

API verify/me vrací `sessionExpiresAt`. Podepsaná relace a Secure/HttpOnly/SameSite cookie zůstávají. UI se uzamkne při offline stavu, při odchodu a ověřování návratu; expirace, zneplatnění účtu a změna oprávnění respektují server. Logout bez potvrzení serveru zůstává čekající; ukládá jen příznak, ne token/identitu/data. Po reconnectu se dokončí i přes restart. Skrytí UI není kryptografické smazání paměti a není důkaz skrytí systémového snapshotu iOS.

Verze 0.1.831 dokončuje release nástroje: bez závislosti na GitHub fetch, přesný inventář všech souborů před uploadem, reprodukovatelná identita/datum buildu, strukturované ověření Cloudflare projektu/aktivního deploymentu/rollbacku, kontrola serverového stavu po uploadu, bezpečná rekonstrukce zdrojového commitu a samostatně schvalovaný rollback. Původní main guard zůstává chráněný.

Žádná migrace, změna účtů, oprávnění, konfigurace Cloudflare, tajných proměnných ani produkčních dat. Dříve převzatá úzká oprava zápisu náhradních dílů mezi databázovými doménami zůstává v původním PWA commitu; nevznikl další refaktoring.

## Bezpečnost

Původní nález v `scripts/serve.mjs` zahrnuje testovací/provozní kontaktní údaje, nikoli důvod veřejně publikovat server. Kompletní server, adresáře účtů, .env, privátní klíče, historie Git ani produkční exporty nejsou v archivu. Změny se přenášejí binárním patchem s nulovým kontextem; konkrétní změnou serve.mjs je pouze MIME pro manifest.

Veřejný build neobsahuje Functions ani zdrojový testovací server. Kompilovaný server je pouze v soukromých pracovních výstupech a při nasazení jde do Pages Functions, nikoli do statických assetů. Účty nutné pro existující autentizaci se nemažou. Tři existující provozní kontaktní řetězce ve frontendových modulech odpovídají produkčnímu základu; nejde o nově přidaný seznam testovacích účtů. Veřejná konfigurace Maps zůstala zachována, její hodnota se nevypisuje; omezení klíče u poskytovatele nejsou tímto auditem potvrzena.

Kontrola pokrývá statické soubory, serverové zdroje a zkompilované Functions, běžné formáty tajných klíčů, přenos citlivých fixture kontaktů a inventář archivu. Výsledky v security.json neobsahují hodnoty nálezů. Jde o konkrétní kontrolu distribuce, nikoli absolutní důkaz absence každé možné zranitelnosti. Produkční mock autentizace a fallback vývojové tajemství jsou testem zakázány.

## Ověření

- Úplná lokální sada: viz tests.json; externí HTTP je blokované, používají se mocky. Placený opt-in Forpsi test zůstává záměrně přeskočený.
- Zastaralá data jednoho read-only Forpsi testu byla mimo skutečné třicetidenní okno. Opravena pouze syntetická data na relativní datum; produkční logika zůstala stejná.
- Syntaxe všech JS/MJS a kompilace všech Pages Functions přes Wrangler 4.142.0.
- Build 49 tras a 404, PWA metadata, ikony, MIME, scope a nulové registrace service workeru/Cache Storage.
- WebKit 26.5: mobilní iPhone profil, simulovaný standalone a desktop. Lokální HTTPS, skutečné auth obsluhy, syntetické účty/mock OTP, zakázané externí požadavky. Login/logout, cookie flagy, historie, reload, orientace, oprávnění, expirace, offline/reconnect a čekající logout.
- Aktualizace mezi dvěma skutečnými buildy 0.1.830 → 0.1.831 s cacheovatelnými JS soubory: nový entrypoint, vnořený import a build identita. Další regrese ověřují změnu oprávnění při návratu a opožděnou odpověď kontroly relace po logoutu.
- Negativní release testy: chybný účet/projekt, změněná produkce, neúspěšný/neznámý rollback stav, jiný HEAD, špinavý strom, poškozený/chybějící/extra soubor a symlink. Přesná rekonstrukce z balíčku probíhá v druhém čistém checkoutu bez síťového remote.

## Nasazení a omezení

Čtecí Cloudflare API přístup byl aktuálně funkční; dřívější Keychain blok se neopakoval. Ověřen projekt, domény, produkční build příkaz a úspěšný aktivní rollback cíl 863bae5e-a256-4aa9-a6ba-7a6b552512d2 / c37cd96. Veřejné API bez cookie vrací 401. Nový manifest dosud není nasazený. Upload ani produkční rollback nebyly provedeny.

Izolované cloudové prostředí s oddělenými bindingy nebylo doloženo, proto nevznikl veřejný preview. Fyzický iPhone, Home Screen, systémové snapshoty, skutečné OTP a hardwarová oprávnění zatím nejsou ověřeny. Příprava směřuje ke schválenému kontrolovanému pilotu; plošné předání až po fyzickém ověření.

Zdroje: [Apple instalace webové aplikace](https://support.apple.com/en-gb/guide/iphone/iphea86e5236/ios), [Cloudflare Pages API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/get/), [Wrangler credential interface](https://developers.cloudflare.com/workers/wrangler/commands/general/#auth-token), [Pages rollback](https://developers.cloudflare.com/pages/configuration/rollbacks/).
