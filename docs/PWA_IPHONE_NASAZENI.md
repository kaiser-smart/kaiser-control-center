# Nasazení a návrat zpět

**Příprava není schválení. Nic v tomto balíčku se nenasazuje automaticky.**

## Přenos a ověření zdrojů

Balíček je úplná změnová sada pro existující repozitář, nikoli kopie jeho soukromých fixture dat nebo historie. Potřebuje čistý checkout základu `c37cd96b3313ad5d8678e1018f76bf1b9d98f72e`. Obsahuje binární patch s nulovým kontextem, kontrolní součty, přesnou identitu releasu a nástroj `pripravit.mjs`. Ten ověří základ, čistotu a SHA-256 patch souboru, založí samostatnou větev a zrekonstruuje přesný commit ze stejných souborů a metadat. Nikdy nevolá Cloudflare ani GitHub. Již existující připravená větev žádnou aplikaci patch souboru nepotřebuje.

```sh
node /cesta/k/balicku/pripravit.mjs /cesta/k/cistemu/repozitari
node /cesta/k/balicku/nasadit.mjs /cesta/k/repozitari --check
```

Používat Node 24 a pnpm. Existující závislosti Forpsi se instalují jeho zamčeným pnpm-lock.yaml příkazem `pnpm install --frozen-lockfile --ignore-scripts` v `services/forpsi-connector`. Playwright je pouze externí testovací nástroj, není novou závislostí aplikace. WebKit test přijímá `PLAYWRIGHT_MODULE_PATH`, `PLAYWRIGHT_BROWSERS_PATH` a `PWA_TEST_OUTPUT`.

## Jednorázové obnovení CLI přístupu

Při přípravě selhalo čtení dostupného přístupu z macOS Klíčenky (exit 51). Přihlášení Cloudflare v prohlížeči samo nepotvrzuje funkčnost Wrangler. Správce nebo Codex s dostupnou autorizací obnoví běžné přihlášení v terminálu stejného macOS uživatele:

```sh
pnpm dlx wrangler@4.142.0 login
CLOUDFLARE_ACCOUNT_ID=3b25838c1e15dbfe5f3ac0c273826576 pnpm dlx wrangler@4.142.0 pages deployment list --project-name kaiser-control-center-legacy --environment production --json
```

Jde o běžný OAuth login, bez kopírování tokenů do chatu nebo souborů balíčku. Pokud Klíčenka vyžádá odemknutí, uživatel ho provede v systémovém dialogu. Žádné rozšiřování oprávnění, vypínání ochrany Klíčenky ani extrakce cookie z prohlížeče. Pokud OAuth nabídne nová nebo širší oprávnění, jejich udělení vyžaduje samostatný souhlas. Ověření výpisu nesmí změnit projekt. Při trvající chybě se deploy zastaví.

## Jediný příkaz po výslovném schválení

```sh
node /cesta/k/balicku/nasadit.mjs /cesta/k/repozitari --schvaleno
```

Příkaz předá přesný schválený commit do rozšířeného existujícího `scripts/deploy-pages-production.mjs`. Běžné vydávání z main zůstává chráněné původními kontrolami. Lokální režim navíc kontroluje:

1. Přesný HEAD, čistou větev, verzi, výchozí commit a nezměněný wrangler.toml. Git fetch je pouze čtecí; zápis na GitHub ani PR není podmínkou.
2. Povinné historické ochranné commity, syntax, původní regresní sadu deploy guardu, PWA, auth a opravené náhradní díly. Znovu sestaví aplikaci. Zachová veřejnou konfiguraci Maps, identitu skutečné zdrojové větve a verzování všech importů.
3. Aktuální veřejná produkční metadata stále odpovídají schválenému základu. Pokud mezitím vyšla jiná verze, vydání se zastaví a musí se přezkoumat nový základ; starý balíček ji nepřepíše.
4. Cloudflare účet `3b25838c1e15dbfe5f3ac0c273826576`, projekt `kaiser-control-center-legacy`, existující produkční rollback ze stejného zdroje. Při chybě přístupu neproběhne upload.
5. Závěrečnou kontrolu čistoty a HEAD. Až poté spustí připnutý Wrangler 4.142.0: Pages deploy `dist`, projekt výše, produkční branch `main`, přesný commit, `commit-dirty=false`. Functions se zkompilují z existujícího `functions/`; žádné soukromé fixture soubory ze `scripts/` se nevystavují jako assety. Žádné databázové migrace ani změny tajných proměnných.
6. Automaticky zavolá `pwa-postdeploy.mjs`: identita verze/commitu, všech 49 tras a metadata, MIME/no-store manifestu, SHA-256 ikon a důležitých souborů, anonymní 401/no-store na `/api/me` a `/api/users`. Podporuje stávající kanonické redirecty, ale odmítne cizí origin. Kontrola nikdy neposílá OTP ani obchodní požadavky.

Při neúspěšném postdeploy testu není vydání ověřené. Proveďte připravený rollback; nezkoušejte náhodné další uploady. Kontrola se dá spustit samostatně:

```sh
node scripts/pwa-postdeploy.mjs /cesta/k/balicku/release.json
```

Přímé lokální vydání nenahradí historii `main`. Automatické nasazování v Cloudflare zůstává zapnuté. V dalších vydáních je nutné zachovat tuto změnovou sadu v hlavním zdroji; jinak by další automatické vydání obnovilo starší chování PWA. Tento balíček kvůli tomu nemění nastavení účtu ani automaticky neposílá nic na GitHub.

## Rollback

Ověřený cíl před PWA: produkční deployment **863bae5e-a256-4aa9-a6ba-7a6b552512d2**, commit **c37cd96b3313ad5d8678e1018f76bf1b9d98f72e**, verze **0.1.829**. Cloudflare UI potvrzuje úspěšný build. Nevracet se ke starší 0.1.828, tím by se ztratila novější ochrana vozidel.

[Cloudflare – cílový projekt](https://dash.cloudflare.com/3b25838c1e15dbfe5f3ac0c273826576/pages/view/kaiser-control-center-legacy). V Deployments otevřít nabídku uvedeného úspěšného deploymentu → **Rollback to this deployment** → potvrdit. Tento cíl je nyní aktivní; volba návratu se použije po nasazení nové verze. Jde o Pages rollback, nikoli příkaz `wrangler rollback` pro jiný typ Workeru. Jeho účinek je okamžitý a nemění obsah D1/R2.

Po návratu ověřit veřejné buildMeta `0.1.829 / c37cd96`, načtení HTML, anonymní `/api/me` 401 a přihlášení kontrolním účtem. Instalovaná ikona dál otevírá stejnou adresu. Případný úspěšný nový produkční deployment později mění vhodný rollback cíl, proto jej před vydáním pojistka znovu ověřuje. Produkční rollback během přípravy **nebyl spuštěn**; ověřena byla existence a úspěšnost cíle, místní kontrolní logika a reverzibilita patch souboru.

## Závěrečná kontrola na skutečném telefonu

Fyzický telefon nebyl dostupný. Na kontrolovaném firemním iPhonu musí před širším předáním správce ověřit instalaci podle přiloženého návodu, správný název/ikonu a běh bez lišty Safari, OTP a stejná oprávnění, přepínání aplikace/zamknutí/návrat, interní a externí odkazy, požadovanou kameru/GPS/telefon/hlas, logout i offline logout, opětovné přihlášení a načtení nové verze po úplném zavření. Neodesílat zkušební obchodní požadavky a neměnit provozní data. Existující OTP může dorazit skutečnému kontrolnímu zaměstnanci; jeho použití má být součástí schváleného pilotu.

Bez této kontroly lze tvrdit pouze úspěch dostupné automatizace. **Doporučení nyní: NENASADIT do plošného provozu, dokud není obnoven CLI přístup a schválen kontrolovaný pilot s fyzickým ověřením.** Implementace je hotová; další implementační změna není předem potřebná.
