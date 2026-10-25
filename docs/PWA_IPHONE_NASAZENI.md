# SMART ODPADY PWA 0.1.831 — nasazení a rollback

Příprava není schválení. Produkce nebyla změněna. Balíček je soukromá změnová sada pro existující repozitář, nikoli celý repozitář. Přesná identita a kontrolní součty jsou v `release.json` a `SHA256SUMS`.

## Cíl a předpoklady

- Cloudflare účet `3b25838c1e15dbfe5f3ac0c273826576`, Pages projekt `kaiser-control-center-legacy`, produkční větev `main`, doména `https://smart-odpady.ai`.
- Živě ověřený základ 25. 10. 2026: `0.1.829`, commit `c37cd96b3313ad5d8678e1018f76bf1b9d98f72e`, úspěšný aktivní deployment `863bae5e-a256-4aa9-a6ba-7a6b552512d2`.
- Existující cloudový build: `node scripts/pages-cloud-build.mjs`, výstup `dist`. PWA lokální režim používá stejný produkční guard; běžné ochrany main se nemění.
- Node 24, pnpm, Git a dostupný Wrangler 4.142.0. `node` musí být v PATH. Lokální zdrojová větev `codex/smart-odpady-iphone-pwa`, čistá a s přesným HEAD z balíčku.
- Pro přenos je nutný soukromý čistý checkout přesného základu s jeho historií; balíček nezahrnuje soukromé fixture adresáře, tajné proměnné ani historii Git.

## Příprava a kontrola bez uploadu

Příkazy spouští Codex nebo správce. Již připravený pracovní checkout nepotřebuje znovu aplikovat patch.

```sh
node /cesta/k/balicku/pripravit.mjs /cesta/k/cistemu/repozitari
node /cesta/k/balicku/nasadit.mjs /cesta/k/repozitari --check
node /cesta/k/balicku/nasadit.mjs /cesta/k/repozitari --preflight
```

`pripravit.mjs` ověří celý archiv, základ, patch a výsledný Git tree; zrekonstruuje přesný commit. Nepoužívá GitHub ani Cloudflare. Při odlišnosti zastaví. `--check` provede místní guard, testy a reprodukovatelný build; `--preflight` navíc pouze čte aktuální produkci a Cloudflare.

Pro úplnou testovací sadu jsou původní závislosti instalovány `pnpm install --frozen-lockfile --ignore-scripts` v kořeni a v `services/forpsi-connector`. Playwright/WebKit je externí testovací nástroj; do aplikace se nepřidává. `scripts/pwa-run-tests.mjs` spouští místní sadu s blokováním externích HTTP požadavků. Placený Forpsi pilot zůstává vypnutý. Browser test přijímá `PLAYWRIGHT_MODULE_PATH`, `PLAYWRIGHT_BROWSERS_PATH`, `PWA_PREVIOUS_DIST` a `PWA_TEST_OUTPUT`.

## Jediný deploy příkaz po schválení přesného releasu

```sh
node /cesta/k/balicku/nasadit.mjs /cesta/k/repozitari --schvaleno=<head-z-release.json>
```

Před uploadem se ověří:

1. Kompletnost a součty všech souborů balíčku, přesný HEAD, čistota větve, chráněné historické commity a nezměněný `wrangler.toml`.
2. Existující regresní guard, PWA/auth testy, syntax a build. Všechny soubory buildu musí přesně odpovídat schválenému inventáři; extra, chybějící nebo změněný soubor blokuje vydání. Datum buildu je pevně dané releasem.
3. Aktuální verze a commit na doméně stále odpovídají základu. Lokální režim nevyžaduje `git fetch`, remote ani PR.
4. Cloudflare účet, projekt, doména, produkční větev, přesný aktivní deployment a rollback. Rozhoduje strukturované API `latest_stage.name=deploy`, `status=success`, čas dokončení a celý commit; neurčitý textový stav se odmítá.
5. Závěrečná čistota a HEAD, opakovaná identita produkce a součty buildu. Teprve potom připnutý Wrangler nahraje `dist` a Pages Functions. Nemění D1/R2, bindingy, tajné proměnné ani plánované workery.

Wrangler čte stávající oprávnění přes podporovaný příkaz `auth token --json`; výsledek se drží pouze v paměti. Nikdy se neukládá do balíčku ani nevypisuje. `PWA_WRANGLER_PATH` slouží pro existující lokální instalaci přesně verze 4.142.0; jinak se použije `pnpm dlx wrangler@4.142.0`.

Čtecí přístup byl v této přípravě funkční. Úspěšný upload zůstává nepotvrzený do schváleného nasazení. Pokud se vrátí chyba Klíčenky, zastavit bez dalších OAuth pokusů. Jednorázově je nutné nechat správcem opravit přístup přihlášeného macOS uživatele ke Klíčence a poté zopakovat pouze `--preflight`. Neexportovat tokeny do chatu, nevypínat ochrany ani neměnit způsob jejich ukládání.

## Kontroly po nasazení

Skript ověří úspěšný aktivní deployment s přesným celým commitem, veřejnou verzi, všech 49 tras, manifest MIME/cache/scope, vybrané klíčové assety včetně ikon a session guardu a anonymní `/api/me` a `/api/users` (401/no-store). Neposílá OTP ani obchodní požadavky. Kontrolu lze opakovat:

```sh
node /cesta/k/balicku/tools/pwa-postdeploy.mjs /cesta/k/balicku/release.json
```

Neúspěšný postdeploy výsledek znamená NEOVĚŘENO, nikoli úspěch. Zkontrolovat výstup a použít schválený rollback; nedělat náhodné opakované uploady.

Automatická Git integrace zůstává beze změny. Přímý upload nezapíše změny do GitHub main. Před příštím běžným vydáním musí jeho zdroj zahrnovat tuto změnovou sadu, jinak by odstranil PWA změny. Tento balíček se kvůli tomu nevystavuje veřejně ani nemění automatické nasazování.

## Rollback

```sh
node /cesta/k/balicku/vratit.mjs --schvaleno=<head-z-release.json>
```

Příkaz je samostatně chráněný schválením. Odmítne návrat, pokud aktuální produkce už neodpovídá tomuto releasu. Znovu ověří úspěšný původní deployment, provede Pages rollback a ověří vrácenou identitu, HTML a anonymní API. Nemění databáze. Během přípravy nebyl produkční rollback spuštěn; ověřen byl jeho cíl, ochranná logika a rekonstrukce balíčku. Přihlášení po rollbacku je závěrečná kontrola správce.

Nouzově lze použít [Cloudflare Deployments](https://dash.cloudflare.com/3b25838c1e15dbfe5f3ac0c273826576/pages/view/kaiser-control-center-legacy) → odpovídající úspěšný deployment → Rollback to this deployment. [Dokumentace Pages rollbacku](https://developers.cloudflare.com/pages/configuration/rollbacks/).

## Fyzický pilot před širším předáním

Na skutečném firemním iPhonu po schváleném nasazení ověřit Přidat na plochu, název a ikonu, standalone, skutečné OTP, stejná oprávnění, navigaci, přepnutí aplikace/zamknutí/návrat, systémový náhled, online i offline logout, opětovné přihlášení a novou verzi po úplném zavření. Podle používaných modulů ověřit GPS, kameru, telefon a hlas bez zkušebních obchodních zápisů. WebKit tento fyzický test nenahrazuje.
