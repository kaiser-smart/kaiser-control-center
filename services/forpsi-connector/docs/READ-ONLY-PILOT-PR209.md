# PR #209: ověřitelný čtecí pilot a kontrola A–G

**Změna zadání 26. 9. 2026:** níže uvedený samostatný placený test OpenAI API již není podmínkou osobního pilotu. Aktuální návrh interaktivní cesty, její ověřené hranice a otevřený problém přihlášení jsou v [CHATGPT-INTERACTIVE-PILOT.md](CHATGPT-INTERACTIVE-PILOT.md). Tato stránka uchovává historický rozsah kontroly A–G a původního izolovaného testu.

**Historický stav před osobním nasazením:** tato stránka zachycuje původní kontrolu A–G a tehdejší izolovaný test. Aktuální stav produkčního osobního pilotu včetně provedených aditivních migrací a otevřené chyby OAuth je v [CHATGPT-INTERACTIVE-PILOT.md](CHATGPT-INTERACTIVE-PILOT.md). Vývojová konfigurace nadále ponechává `SEND_ENABLED=false`, `CONNECTOR_ENABLED=false` a `WORKFLOW_SYNC_ENABLED=false`.

## Reprodukce a opravy A–G

| Nález | Reprodukční test | Opravené chování |
| --- | --- | --- |
| A | `model receives verified mailbox perspective…`, `only server-verified alias…`, `priority checks bounded Sent context…`, `priority explicitly reports unavailable Sent context…` | Model dostává serverově ověřenou adresu schránky, aktivní doložené aliasy z oddělené tabulky, role To/Cc/odesílatel a omezený relevantní kontext Odeslaných. Neověřený či deaktivovaný alias se neposílá jako vlastní identita. Nedostupný a omezený kontext se uvádí v uloženém seznamu. |
| B | `priority uses all findings independent of their order…` | Všechny doložené závěry ke zprávě zůstávají zachované. Otevřený individuální požadavek ve stejné zprávě vítězí nad marketingovým nebo starším vyřešeným tématem. Novější doložené vyřešení ve vlákně může starší požadavek uzavřít; výslovná osobní oprava konkrétní zprávy má přednost. |
| C | `negated and removed contacts…`, `notification window retains partial answer…`, `different custom work days…` | Negace odebírá kontakt, neúplné validní časové přání se ukládá a otázka se vrátí jen k chybějícím dnům. Vlastní rozsahy dnů a výjimky rozlišují pracovní dobu a upozornění. Nejednoznačná kombinace více kontaktů s negací zůstává k upřesnění. |
| D | `same metadata with different supported agenda content…` | Doložené obsahové návrhy agend s přesnou citací se zobrazí v průvodci jako nejvýše dvě cílené otázky. Zůstávají neaktivními návrhy, dokud je uživatel neposoudí; ani poté samy netvoří pravidlo priority. |
| E | `personal sync resumes past 50…`, `sync resets the saved UID page…` | Server ukládá postup po UID dávkách, zvládne přerušení a pokračování, po změně UIDVALIDITY zahájí nové procházení. Nová pošta během dohánění se zkontroluje v následujícím průchodu. Stav načítání rozlišuje `caughtUp` a pouhé běžící dohánění. |
| F | `CI runs the setup approval test…` + GitHub Actions | CI obsahuje `scripts/forpsi-setup.test.mjs` a spouští se při změně `public/forpsi-setup/**`. Oprávnění zůstává `contents: read`. |
| G | `approved no-signature removes active signature…` | Schválení profilu, výslovné odstranění podpisu a návrat verze mění profil i používanou šablonu v jedné transakci. Přeskočení podpisu zachová dosavadní schválenou variantu a materializuje ji v nové verzi profilu. |

## Dva oddělené testy

`test/read-only-pilot.test.mjs` vede dvě odlišné syntetické schránky přes dvě kryptograficky ověřené syntetické OAuth identity, jejich výslovné vazby na oddělené SO.ai identity, osobní read grant, souhlas s omezeným vzorkem, analýzu, vlastní odpovědi, návrhy podpisů, odmítnutí modelového `confirmed=true`, serverově ověřené schválení přes syntetickou SO.ai cestu, nový Worker se stejným úložištěm, prioritní seznam a detail protokolem MCP. Křížový přístup k seznamu, profilu i zprávě je odmítnut. Adaptér modelu v běžném CI testu vrací **předem připravené odpovědi**. Test zkontroluje nulový outbox a jen operace search/read nad syntetickým providerem. Protokolové ověření zdroje MCP Apps není vykreslením karty v ChatGPT.

Samostatný opt-in test v témže souboru používá skutečný `openAiEvidenceAnalyzer`. Bez `FORPSI_PAID_SYNTHETIC_PILOT=APPROVED_4_CALLS` se vždy přeskočí. Před spuštěním musí být samostatně schválen placený test a bezpečně nastavena hodnota `FORPSI_ANALYSIS_API_KEY` mimo Git. Test přijímá výhradně model `gpt-5-mini`, nejvýše čtyři volání na dvou syntetických schránkách; adaptér omezuje vstup na 60 000 bajtů na volání a výstup na 1 800 tokenů. Odesílání je vypnuté. Skutečné volání dosud **neproběhlo**; jeho úspěch ani kvalita porozumění nejsou prokázané.

Navržený strop pro tento jeden běh je **0,10 USD**. Při současné ceně `gpt-5-mini` 0,25 USD za milion vstupních a 2 USD za milion výstupních textových tokenů je teoretické maximum čtyř volání s uvedenými limity pod 0,10 USD. Model a cenu znovu ověřit těsně před schváleným spuštěním. Nejde o obecný limit účtu OpenAI ani o povolení dalších běhů.

## Zjištěné vstupy vývojového prostředí

- GitHub PR a Cloudflare CLI jsou dostupné. V účtu použitém produkční konfigurací existuje pouze produkční D1 `forpsi-company-mail`; izolovaná D1 `forpsi-company-mail-dev` ani Worker `forpsi-company-mail-dev` zatím neexistují. Vývojová konfigurace má nulové placeholder ID databáze a výchozí vypnuté přepínače.
- Vývojový Worker má v kódu zvolený neplacený konfigurační údaj `FORPSI_ANALYSIS_MODEL=gpt-5-mini`, ale žádný model se nespouští. V lokálním procesu nejsou nastavené `FORPSI_ANALYSIS_API_KEY`, `FORPSI_ANALYSIS_MODEL`, `MCP_RESOURCE`, `OAUTH_ISSUER`, `OAUTH_JWKS_URL`, `SOAI_PUBLIC_URL` ani `CONNECTOR_ADMIN_TOKEN`. Žádný `.dev.vars` ani `.env` v balíčku není. Hodnoty secretů se nevypisovaly.
- ChatGPT v tomto prostředí neukazuje připojený nástroj Forpsi. MCP Apps karta není v ChatGPT vizuálně ověřená.
- `principal_identity_links` v migraci 0008 umí výslovně propojit ověřený OAuth issuer+subject s předem existující osobní SO.ai identitou. Nevytváří vazbu podle e-mailu. `mailbox_verified_aliases` přijímá pouze serverově evidované aktivní aliasy s datem a zdrojem ověření; žádný skutečný alias se zde nezapisoval. Reálný poskytovatel OAuth, párovací ceremonie a dvě testovací identity dosud nejsou zřízené.

## Přesný rozsah případného izolovaného testovacího nasazení

Po samostatném schválení: vytvořit pouze `forpsi-company-mail-dev` D1 a Worker v odděleném vývojovém namespace, exportovat prázdnou nebo syntetickou databázi před migrací, aplikovat 0001–0008 pouze tam, nahrát syntetické schránky bez Forpsi hesel, dvě testovací identity a jejich výslovné read granty, vázat read-only OAuth a SO.ai testovací schvalovací stránku na testovací Worker, zaregistrovat testovací MCP App v ChatGPT a provést omezený čtecí průchod. Žádný skutečný IMAP/SMTP účet, skutečný příjemce, odeslání, produkční D1, produkční Pages, merge ani produkční route. Návrat: vypnout test Worker, odpojit test App a obnovit export izolované testovací D1; produkce je nedotčená.

## Jediný seznam konkrétních blokací

| Co chybí / blokovaný důkaz | Co připraví vývojář | Přesný úkon Radima | Bezpečné místo |
| --- | --- | --- | --- |
| API klíč pro skutečný model; blokuje čtyři reálná volání a důkaz, že model chápe syntetické zprávy. Model `gpt-5-mini` a limity jsou připravené. | Spustí výše popsaný opt-in test až po samostatném schválení a zaznamená skutečné výsledky, chyby klasifikace a náklad. | Schválí jeden běh nejvýše čtyř volání s maximálním navrženým nákladem 0,10 USD; vytvoří či vybere omezený projektový API klíč a vloží jej přímo do zabezpečeného nastavení testu. | Pro lokální běh pouze do chráněné procesní proměnné `FORPSI_ANALYSIS_API_KEY` mimo Git; při pozdějším test Workeru do Cloudflare secret stejného jména pro `forpsi-company-mail-dev`. Nikdy do chatu ani PR. |
| Izolovaná D1 a Worker dosud neexistují; blokuje veřejný HTTPS MCP endpoint, trvalost po restartu a skutečné spojení ChatGPT. | Po schválení vytvoří jen testovací zdroje, export před migrací, aplikuje 0001–0008 v izolaci, zapne read-only testovací Worker a provede readback. | Schválí přesně vymezené testovací vytvoření zdrojů a migraci pouze nové izolované D1. | Cloudflare účet uvedený ve vývojové konfiguraci, nové názvy `forpsi-company-mail-dev`; žádná produkční databáze ani route. |
| Není určený testovací OAuth issuer, JWKS ani registrace klienta; blokuje skutečné přihlášení z ChatGPT. | Nastaví `MCP_RESOURCE`, `OAUTH_ISSUER`, `OAUTH_JWKS_URL` na testovacím Workeru, ověří issuer/audience/podpis a jen read scope. | Vybere nebo zpřístupní firemní testovací poskytovatel identity a dovolí registraci testovací aplikace; případný administrátorský souhlas provede v jeho UI. | Konfigurace testovacího IdP a proměnné pouze u test Workeru; žádné tokeny v chatu. |
| Neexistují dvě skutečné spárované identity SO.ai ↔ OAuth ani testovací SO.ai stránka se Service Binding; blokuje skutečné schválení profilu a izolaci dvou uživatelů v nasazené cestě. | Připraví testovací Pages preview, vazbu a granty pouze na syntetické schránky, ověří přesné OAuth subject ↔ SO.ai user ID bez párování podle e-mailu. | Oba testovací uživatelé se jednou přihlásí do SO.ai a zvoleného IdP k ověření páru, pokud je párování vyžádá; Radim schválí použití testovacích účtů. | Izolovaná D1 tabulka `principal_identity_links`, testovací SO.ai session a IdP; žádná identita v PR. |
| Forpsi testovací MCP App není připojená v ChatGPT; blokuje skutečný vizuální důkaz karty seznam–detail. | Po zřízení endpointu provede připojení, dvě oddělená přihlášení, průchod a screenshot nebo záznam výsledku. | Pokud ChatGPT vyžádá roli vlastníka pracovního prostoru nebo souhlas s aplikací, potvrdí pouze testovací App s oprávněním `forpsi:read`. | Nastavení aplikací v testovacím pracovním prostoru ChatGPT; nikoli produkční konektor. |

## Co stále brání označení „ověřená čtecí verze v ChatGPT“

Skutečné placené volání modelu; izolované veřejné HTTPS MCP URL a testovací D1; zvolený OAuth issuer/JWKS s vazbou na SO.ai identity; připojení testovací App v ChatGPT a skutečný vizuální průchod; živé kliknutí na schválení profilu. Tyto kroky nesmějí být nahrazené lokálním mockem ani HTML zdrojem widgetu.
