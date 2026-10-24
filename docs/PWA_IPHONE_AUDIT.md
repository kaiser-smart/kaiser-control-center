# SMART ODPADY – závěrečný audit PWA

Stav: připraveno lokálně, **NENASAZENO**. Kontrola 24. 10. 2026. Větev `codex/smart-odpady-iphone-pwa`, verze 0.1.830. Přesný finální commit a kontrolní součty jsou v `release.json` a `SHA256SUMS` finálního balíčku.

## Technologie a skutečný hosting

Stávající aplikace je JavaScript s nativními ES moduly a CSS; build zajišťuje Node bez nového frameworku. Zachovaný Quicksand, navigace a 49 generovaných tras. API běží jako Cloudflare Pages Functions. Existují oddělené D1 databáze, R2, servisní vazby a samostatné plánované workery; PWA je nepřenastavuje a nezavádí migrace.

V přihlášeném Cloudflare Dashboardu byl ověřen účet `3b25838c1e15dbfe5f3ac0c273826576`, projekt `kaiser-control-center-legacy`, domény `smart-odpady.ai`, `www.smart-odpady.ai` a `kaiser-control-center.pages.dev`. Účet se v UI jmenuje `Linkedin@nanolab.cz's Account`. Produkční větev `main`, automatické nasazování zapnuté, Git repozitář `kaiser-smart/kaiser-control-center`. Gitový build používá `node scripts/pages-cloud-build.mjs`, výstup `dist`; ten volá existující produkční kontrolní skript. Překlad stránky v prohlížeči zobrazoval přeložené názvy příkazu a adresáře; originální zápis potvrzuje zdroj konfigurace.

Ověřená běžící verze: **0.1.829 / c37cd96**, celý commit `c37cd96b3313ad5d8678e1018f76bf1b9d98f72e`. Úspěšné produkční nasazení **863bae5e-a256-4aa9-a6ba-7a6b552512d2**, dokončeno podle UI 24. 10. 2026 v 10:09. Novější změna vozového parku byla převzata rebasem, nikoli přepsána. Původní pracovní adresář uživatele nebyl měněn.

## Implementované změny

- Manifest: SMART ODPADY, jazyk cs, standalone, stabilní identita a scope na kořeni domény. Funguje také při existujícím hostování pod cestou repozitáře díky původnímu dynamickému base URL.
- Ikony: neprůhledné PNG 180×180 pro Apple, 192×192 a 512×512, poslední s bezpečnou zónou pro maskování; zdroj SVG. Zelený podklad a bílý monogram SO. Metadata jsou ve všech 49 trasách i 404.
- Manifest má explicitní MIME a no-store, původní HTML hlavičky no-cache zůstávají. Existující verzování všech vnořených JS/CSS importů dostává verzi 0.1.830.
- Žádný service worker, Cache Storage, offline datový sklad, nová knihovna ani placená služba. iOS webovou aplikaci lze instalovat bez service workeru. Offline start může skončit systémovou chybou Safari; otevřená aplikace ukáže vlastní stav bez zpřístupnění dat.
- Aktivní UI se skryje při výpadku spojení, opuštění aplikace a kontrole relace. Po návratu se ověří aktuální účet a oprávnění. Selhání kontroly data neodkryje. Vypršení relace ukončí zobrazení i bez dalšího kliknutí.
- Odhlášení bez odpovědi serveru se nevydává za dokončené. Uchová se pouze příznak požadavku na odhlášení; spojení, opětovné spuštění nebo tlačítko opakování dokončí mazání cookie. Příznak má localStorage a neidentifikační cookie jako zálohu. Změna se přenese do dalších otevřených oken stejného úložiště.
- API přihlášení a `/api/me` vracejí čas vypršení podepsané relace; chybný formát a přesná hranice expirace jsou ošetřeny. Stávající token, účty, role a serverové kontroly zůstávají. Logout i nadále maže host-only Secure/HttpOnly/SameSite=Lax cookie. Standardní platnost je 12 hodin; explicitní „Pamatuj si mě“ 30 dní.

## Regrese nalezené při úplném testu

Dva starší testy měly po rozdělení databází zastaralé vazby. Testovací prostředí bylo opraveno pro současné DB_CORE/DB_ARCHIVE/DB_MESSAGES/DB_AUDIT. Tím se odhalila skutečná dřívější chyba v `driver-part-requests-store`: kombinovaný D1 batch přes core a audit byl správně odmítnut ochranou databází. Úzká oprava používá existující `runCrossDatabaseBatch`, zachovává oddělené domény a zapisuje stav workflow; chybu auditu netají. Žádné změny schématu, produkčních dat ani pravidel přístupu. Regresní test ověřuje dokončení workflow a obě databázové domény.

## Bezpečnostní prověření distribuce

Dřívější automatická kontrola odmítla nahrání celého vývojového `scripts/serve.mjs` do veřejného GitHubu kvůli kontaktním a provozním testovacím údajům. Nešlo o nutnou součást veřejného PWA buildu. Místo celého souboru nebo git bundle finální balíček obsahuje binární patch s nulovým okolním kontextem; u tohoto souboru pouze doplnění MIME typu. Původní kontaktní seznamy, historii repozitáře, tajné proměnné, .env, testovací TLS klíče a kompletní serverové fixture soubory balíček neobsahuje. Žádná produkční nebo uživatelská data nebyla smazána. GitHub zápis 403 nebyl opakován.

Build statické části a kompilace všech Pages Functions byly provedeny lokálně. Serverový bundle zůstává v pracovních souborech; nezveřejňuje se jako statický asset ani jako součást přenosového archivu. Patch obsahuje veškeré změny serveru a přesně se aplikuje na uvedený základ. Veřejný browserový klíč map nebyl považován za serverové tajemství ani odstraněn; jeho shoda s aktuální produkční konfigurací byla ověřena bez vypsání hodnoty.

Produkční anonymní GET `/api/me` a `/api/users`: 401 a Cache-Control no-store. Kořenové HTML: 200/no-cache. Některé JS zdroje na vlastní doméně mají max-age=14400; nové JS importy proto používají změněné verzované URL a kontrola nasazení čerstvý query parametr. Živé hlavičky nového manifestu budou ověřeny až po schváleném nasazení. PWA nijak nezpřístupňuje neveřejné API bez přihlášení. Již načtená paměť stránky není kryptograficky vymazána samotným skrytím při offline stavu; reload/ukončení relace ji uvolní.

## Výsledky ověření

- 176 testovacích souborů v `scripts` a `services/forpsi-connector/test`: všechny prošly. První běh odhalil chybějící lokálně nainstalované zamčené závislosti Forpsi a výše popsané regrese; finální běh bez selhání. Delší Vistos test prošel s přiměřeným limitem běhu, bez změny jeho asercí.
- Syntaxe: 725 JS/MJS souborů před finálními dokumentačními úpravami prošlo Node --check; finální kontrolní skript provádí syntax znovu.
- Build: všech 49 tras, 404, manifest, tři neprůhledné PNG, stejné scope/identity, metadata a verzované moduly.
- Cloudflare Wrangler 4.142.0: všechny Functions úspěšně zkompilovány. Neproveden upload ani migrace.
- Lokální HTTPS, WebKit 26.5: mobilní profil iPhone 13, desktop, profil se simulovaným navigator.standalone a display-mode. Přihlášení přes skutečné obsluhy API se syntetickými účty/mock OTP, cookie flagy, reload, navigace/historie, orientace, logout, odmítnutí oprávnění a aktualizované HTML prošly. Žádné horizontální přetečení v ověřených obrazovkách.
- Regrese: skrytí offline dat, reconnect, 503 při logoutu a restart, záložní cookie pro pending logout, dokončení offline logoutu, idle expirace, deaktivovaný účet při návratu, nedostupné `/api/me`, odhlášení mezi okny. Cache Storage a registrace service workerů prázdné.
- Pojistky vydání a automatické kontroly po nasazení mají lokální negativní testy pro jiný commit, účet, projekt, změněnou produkci, nevhodný rollback, změněný asset a nechráněné API.

## Co dosud není prokázáno

Skutečná instalace na fyzickém iPhonu, systémový Home Screen/app switcher, jeho snapshoty, zamknutí telefonu, push/telefon/GPS/kamera a reálné doručení OTP nebyly tímto testem ověřeny. WebKit s mobilním viewportem a simulovaným standalone není fyzický iPhone ani kompletní Safari. Krátký seznam závěrečných kroků je v návodu nasazení. Nebyl dostupný Xcode simulátor ani připojený telefon; správce má test provést v kontrolovaném pilotu, nikoli poskytnout veřejné firemní údaje.

Izolované cloudové testovací prostředí s prokazatelně oddělenými datovými vazbami nebylo doloženo; žádný preview s firemními databázemi nebyl zveřejněn. Automatické načtení CLI oprávnění z macOS Klíčenky selhalo kódem 51. Webový účet byl ověřen, oprávnění skutečného CLI uploadu proto zůstává NEOVĚŘENO. Připraven je jednorázový postup obnovení běžného přihlášení Wrangler, nikoli obcházení Klíčenky nebo získávání tokenu z prohlížeče.

## Zdroje

[Apple – přidání webové aplikace na iPhone](https://support.apple.com/en-gb/guide/iphone/iphea86e5236/ios), [WebKit – Safari 26 a web apps](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [Cloudflare – Pages deploy a deployment list](https://developers.cloudflare.com/workers/wrangler/commands/pages/), [Cloudflare – Pages rollback](https://developers.cloudflare.com/pages/configuration/rollbacks/). Nasazení potvrzuje až následná kontrola domény, nikoli úspěšný lokální build.
