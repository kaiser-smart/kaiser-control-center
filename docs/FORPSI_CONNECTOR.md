# Forpsi / ChatGPT – administrační pilot v SO.ai

Cílový směr ručního nastavení: [uživatelem dodaná analýza](FORPSI_SETTINGS_TARGET.md) a [ověřované etapy realizace](FORPSI_SETTINGS_DELIVERY.md). Finální užší výběr voleb následuje až po ověření funkčního API; rozsah není požadavkem splnit každou položku katalogu.

Etapa 2 (0.2.5 / SO.ai 0.1.809) doplnila ruční správu přístupů: konkrétní kolega a schránka, pět jednotlivých práv, odebrání, serverová kontrola aktuálního adresáře, revize a atomický audit. Kontrakt a hranice jsou v [plánu etap](FORPSI_SETTINGS_DELIVERY.md#etapa-2--ruční-správa-přístupů). Zápis v izolovaném UI/API/SQLite prošel; v této historické etapě nebylo provedeno produkční přiřazení práv ani pracovní endpoint.

Navazující čtení (0.2.6 / SO.ai 0.1.810) přidává Poštu na `/dashboard?view=forpsi-mail`: výběr přístupné schránky a složky, hledání podle odesílatele, předmětu, nepřečtenosti a obou mezí data, stránkování a bezpečné textové čtení. `/api/forpsi/mail` odvozuje identitu pouze ze session a aktuálního firemního adresáře. Soukromý `/internal/mail` vynucuje grant `read`, aktivitu schránky, identity a firmu; oprávnění znovu ověřuje po odpovědi poskytovatele. Vypnutí uživatele v SO.ai blokuje také rozběhnutý požadavek před vydáním obsahu. Samostatný přepínač `SOAI_MAIL_ENABLED` zpřístupňuje pouze čtení. ChatGPT OAuth, MCP a odesílání zůstávají samostatné nedokončené kroky. Produkční důkaz je veden v dodacím protokolu; lokální test není důkaz nasazení.

Na explicitní pokyn uživatele k zapnutí byla 25. 9. 2026 pilotní schránka po novém ověření všech čtyř služeb (23:26:12 Europe/Prague) povolena; stav „Povolená v konektoru“ byl načten z produkčního UI. To není zapnutí dosud nenakonfigurovaného ChatGPT přihlášení. MCP, cron a odesílání neběží. Výběr prioritních e-mailů nebyl dokončen; uživatel následně vrátil práci k nastavení.

Historicky dokončená etapa 1 (0.2.4 / SO.ai 0.1.808) je nasazená a ověřená. Čtecí API metadat zdrojů a výběr existujících složek mají opětovnou serverovou validaci před uložením. Přihlášené produkční UI dne 25. 9. 2026 v 22:46:50 Europe/Prague načetlo 16 složek, 1 kalendář (DAV jej pojmenovává `personal`) a 1 adresář. Nabídka správně našla automatické cíle `INBOX.Drafts`, `INBOX.Sent Items` a `INBOX.Trash`. Produkční mapování se neukládalo. D1 readback před a po testu byl shodný: revize 8, `active=0`, outbox 0, identity kolegů 0. Dostupnost kalendářů/adresářů není volbou oprávnění ani synchronizací obsahu.

Nasazení etapy 1: commit `c21d6fe3f9957998e2d321bd5f940989a3e6a1a8`, Pages `b7a85c2f`, Worker version `1bc379c1-1b7b-45e5-90a1-e75a15ca32c6` (100 %). Produkční buildMeta uvádí `0.1.808 / main / c21d6fe`; aktuální asset byl ověřen i v přihlášeném prohlížeči. PR #197 je sloučený, obě CI sady prošly. Celkem 63 testů, syntax 672 JS/MJS, build 49 rout, Worker dry-run a produkční deploy guard prošly. Formulář ověřen od 320 do 1440 px. Zápis a následné načtení mapování byly testované v izolovaném UI/API/SQL toku, nikoli změnou ostrých dat. Bez migrací, změn secrets/bindingů/práv nebo aktivace provozu.

Následuje předchozí ověření samotného přihlášení poskytovatele; nezastupuje stav nasazení výše.

Stav: administrační pilot nasazen a ověřen 25. 9. 2026 přes produkční buildMeta, přihlášené UI a zpětné čtení D1.
Tehdy byla pilotní schránka pozastavená. Skutečný test z nasazeného Workeru 0.2.3 dne 25. 9. 2026 v 22:19:24 Europe/Prague potvrdil IMAP včetně podpory MOVE, přihlášení SMTP, dostupný kalendář CalDAV i adresáře CardDAV. Na výslovné schválení uživatele „Jen Vlastní“ byla ve webmailu povolena synchronizace pouze kalendáře Vlastní; Společný zůstal vypnutý. Oba přepínače byly zpětně ověřeny v UI. Následný test zjišťoval pouze dostupnost kolekcí, bez čtení nebo změny událostí. Odeslání ani čtení obsahu nebylo testováno.
Živé nasazení SO.ai se dokládá aktuálním buildMeta a přihlášeným UI, nikoli samotným sloučením PR.
Pilotní účet zadaný uživatelem: `oplustil@kaiserservis.cz`. Tato adresa není automatický grant ani provozní seed.

## Integrovaná cesta

`/nastaveni#forpsi-admin` → SO.ai session + `settings:manage` → `/api/forpsi/admin` →
Cloudflare Service Binding `FORPSI_CONNECTOR` → chráněný Worker `/internal/admin` → samostatná D1.
Stávající autentizace, role a jejich výchozí oprávnění nejsou upravené.

- Přidání a editace schránky, speciální složky, volitelné heslo, pozastavení a povolení.
- Každé uložení nastavení schránku pozastaví. Zapnutí vyžaduje úspěšný IMAP + SMTP test ne starší než 15 minut.
- Test příjmu pouze vypisuje složky; SMTP používá VERIFY, žádnou zprávu neodesílá. Kalendář/adresář zjišťují dostupné kolekce.
- Nové heslo se šifruje AES-GCM s vazbou na firmu, schránku i adresu. Do prohlížeče se nikdy nevrací.
- Uložení konfigurace, hesla a auditu je jedna D1 transakce. Konflikt verze nesmí přepsat novější heslo.
- Přístupy kolegů mají samostatný editor pro SO.ai identity. Štítky, pravidla, fronta a audit jsou zatím čtecí přehledy.
- Globálně vypnutý Worker nic neodesílá, i když je konkrétní schránka povolená. Již rozběhnuté SMTP odesílání nelze odvolat pozastavením.
- Ochrana neuložených změn používá stávající dialog SO.ai. Frontend neukládá data do lokálních úložišť.
- Simulované ověření nelze použít jako oprávnění aktivovat schránku v režimu skutečného poskytovatele.
- Od konektoru 0.2.1 se k neúspěšnému ověření ukládají pouze povolené chybové kódy, fáze a číselné HTTP/SMTP stavy. Text chyb, protokolové odpovědi, adresy a přihlašovací údaje se neukládají. Diagnostika je součástí chráněného administračního readbacku; nezapíná MCP ani odesílání.
- Od 0.2.2 navazuje SMTP TLS přímo přes pevné `smtp.forpsi.com:465` a předává Nodemaileru již ověřený socket. V lokálním Cloudflare runtime původní DNS předzpracování selhalo před přihlášením; přímé TLS a následné anonymní SMTP VERIFY prošly. Certifikát se nadále ověřuje, minimum je TLS 1.2 a připojení má 15s limit. Následné produkční SMTP VERIFY s uloženým heslem prošlo 25. 9. 2026 v 22:00; doručení nebylo testováno.
- Oprava 0.2.3 volá nativní `fetch` bez vazby `this` na instanci DAV. Původní volání vyvolalo v Cloudflare runtime `Illegal invocation` před první HTTP odpovědí. Další nekompatibilita je nepodporované `redirect:error`: nahrazeno `manual` s explicitním odmítnutím všech stavů 3xx, bez následování Location a bez předání hesla jinému serveru. Obě chyby reprodukovány anonymně a pokryty regresními testy. Následně v produkci ověřeno CardDAV a úspěšná CalDAV discovery bez kolekcí.

Předchozí ověřená serverová verze 0.2.3: commit `6ef47e44fb232e72731b4137e87dfdfe56441e77`, Cloudflare version `f25d8685-7119-4fdb-a19c-a3294f6e21f4`. Výsledek potvrzen přihlášeným UI i D1 readbackem, tehdy revize schránky 7, všechny čtyři služby `verified`, `active=0`. Tehdejších 56 testů, syntax/build a CI prošlo. PR #192–194 jsou sloučené. SO.ai frontend byl v této fázi 0.1.807; serverové opravy ani povolení vlastního kalendáře nevyžadovaly nový Pages deploy.

## Nasazení administračního pilotu

Produkční konfigurace Workeru: `services/forpsi-connector/wrangler.production.jsonc`.
Samostatná D1 `forpsi-company-mail` (`76646cc2-deeb-41af-baeb-92159c9e7e5c`) byla vytvořena
25. 9. 2026 v WEUR a migrace `0001`–`0003` byly aplikovány. Soukromý Worker
`forpsi-company-mail` používá tenant `kaiser-servis`. Nemá veřejnou route ani workers.dev,
preview URL ani cron. `CONNECTOR_ENABLED=false`; administrace funguje odděleně od vypnutého MCP.
Produkční Pages binding `FORPSI_CONNECTOR` je definovaný v kořenovém `wrangler.toml`.
Ostatní bindingy a proměnné odpovídaly živé konfiguraci před přidáním tohoto bindingu.

Provozní postup a požadované vazby:

1. Založit samostatnou D1 pro Forpsi, doplnit její skutečné ID do konfigurace Workeru a aplikovat migrace `0001` až `0003`. Nemigrovat DB_CORE/DB_MESSAGES/legacy databáze SO.ai.
2. Ve Workeru nastavit `FORPSI_TENANT_ID` na stabilní ID firmy. Secrets: `CREDENTIALS_KEY` (náhodných 32 bajtů v base64) a `CONNECTOR_ADMIN_TOKEN` (alespoň 32 náhodných znaků). Zachovat `CONNECTOR_ENABLED=false`.
3. Nasadit Worker a SO.ai propojit pomocí Service Binding `FORPSI_CONNECTOR`. SO.ai secret `FORPSI_ADMIN_TOKEN` musí odpovídat Worker `CONNECTOR_ADMIN_TOKEN`. Nic z toho nepatří do veřejného runtime configu.
4. SO.ai publikovat pouze projektovým production guardem podle Příručky. Pro tento pilot uživatel schválil samostatnou D1, Worker, serverové klíče a nasazení administrace. MCP, cron i odesílání zůstávají vypnuté.
5. Správce zadá heslo schránky do chráněného formuláře. Codex heslo nepotřebuje v chatu ani přes prohlížeč číst. Následuje skutečný test z Workeru, ověření auditu a dostupných kolekcí.

Samotný administrační pilot nevyžaduje zapnutí MCP ani plánovaného odesílání. Pro administraci nejsou nutné OAuth secrets.
Před aktivací MCP jsou potřeba ověřený OAuth issuer/JWKS/resource, identitní propojení uživatelů, správa grantů a jejich revokace při odebrání firemního přístupu. Samotný e-mail není autorizační identita.
Pro plánované odesílání je navíc potřeba samostatně zapnout minutový cron (v konfiguraci je prázdný seznam), pro jakékoli odesílání `OUTBOX_KEY` a samostatný konkrétně schválený provozní test. Schválení nasadit administraci není schválení posílat e-maily.

### Rotace klíče a obnova

Klíč hesel se nesmí prostě přepsat: stávající ciphertext by přestal být čitelný. Pilot nepodporuje více verzí klíčů ani automatickou rotaci. Nejprve pozastavit účty, zajistit bezpečnou zálohu starého klíče a DB, připravit a ověřit re-encryption migraci, až pak přepnout. Bez toho lze změnu klíče napravit jen obnovou původního klíče nebo novým zadáním hesel. UI nikdy nevrací staré heslo.

## Aktuální hranice

- IMAP z nasazeného Workeru ověřil přihlášení a výpis složek, SMTP přihlášení bez odeslání, CardDAV dostupné adresáře a CalDAV vlastní kalendář. Navazující etapa přidává pracovní čtení zpráv. Obsah kontaktů/událostí a zápisové operace zůstávají bez produkčního testu. Jedinou změnou ve webmailu bylo schválené povolení CalDAV u kalendáře Vlastní.
- Štítky a pravidla jsou vlastní evidence konektoru. Nejsou nativními štítky a filtry Forpsi. Pravidla se zatím spouštějí ručně nad výběrem zpráv.
- SO.ai umí spravovat granty pro stabilní firemní identity; pracovní endpoint má pouze čtení pošty. Propojení s OAuth ještě zbývá. Editace pravidel, štítků a rušení fronty v administraci jsou další fáze.
- Nativní soubory, úkoly, poznámky a podpisy nemají ověřenou integrační cestu ani implementovaný adaptér. Ve webmailu byly jejich položky nabídky viditelné, to není důkaz dostupného API.
- CardDAV přístup je potvrzený skutečným výpisem adresářů. CalDAV discovery po povolení kalendáře Vlastní vrací dostupnou kolekci; Společný zůstává vypnutý. Konkrétní obchodní tarif nebyl ověřován a samotný úspěšný test jej nedokládá.
- Odesílání zatím neumí přílohy ani editaci existujících konceptů. U kalendáře jsou zápisy omezené na jednoduché události bez účastníků/pozvánek/opakování.
- Přehled administrace má pevné limity (200 schránek; 500 grantů; 200 pravidel/štítků; 50 událostí a položek fronty). Překročení limitu schránek je explicitní chyba, ostatní přehledy oznamují omezení.
- Provozní ochrany pro veřejné nasazení (kvóty/rate limiting, rotace klíčů, revokace podle KSO a koncové OAuth testy) zůstávají otevřené.

## Lokální ověření

`pnpm --dir services/forpsi-connector install --frozen-lockfile --ignore-scripts`

`node --test scripts/forpsi-admin.test.mjs scripts/forpsi-mail.test.mjs scripts/auth-session.test.mjs services/forpsi-connector/test/*.test.mjs`

`node scripts/check-syntax.mjs` · `node scripts/build.mjs` · `pnpm --dir services/forpsi-connector build`

Testy používají skutečnou SQL migraci a skutečné API/auth/validační cesty nad SQLite v paměti; Forpsi je nahrazený simulovanými providery. Žádné ostré zprávy nejsou odeslané, upravené ani smazané.
