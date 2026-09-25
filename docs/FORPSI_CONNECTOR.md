# Forpsi / ChatGPT – administrační pilot v SO.ai

Stav: implementováno a lokálně testováno; nasazení administračního pilotu schváleno 25. 9. 2026.
Konektor není připojený k ostré schránce. Živé nasazení SO.ai se dokládá aktuálním buildMeta a přihlášeným UI, nikoli samotným sloučením PR.
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
- Oprávnění, štítky, pravidla, fronta a audit jsou v administraci zatím čtecí přehledy.
- Globálně vypnutý Worker nic neodesílá, i když je konkrétní schránka povolená. Již rozběhnuté SMTP odesílání nelze odvolat pozastavením.
- Ochrana neuložených změn používá stávající dialog SO.ai. Frontend neukládá data do lokálních úložišť.
- Simulované ověření nelze použít jako oprávnění aktivovat schránku v režimu skutečného poskytovatele.

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

- Pošta, CalDAV a CardDAV mají implementované adaptéry, ale nejsou ověřené proti ostrému účtu ani z nasazeného Cloudflare Workeru.
- Štítky a pravidla jsou vlastní evidence konektoru. Nejsou nativními štítky a filtry Forpsi. Pravidla se zatím spouštějí ručně nad výběrem zpráv.
- SO.ai zatím neumí přidělovat/editovat granty, pravidla a štítky ani rušit frontu; příslušné MCP operace již existují, administrační ovládání je další fáze.
- Nativní soubory, úkoly, poznámky a podpisy nemají ověřenou integrační cestu ani implementovaný adaptér. Ve webmailu byly jejich položky nabídky viditelné, to není důkaz dostupného API.
- Obchodní tarif a oprávnění CalDAV/CardDAV na pilotním účtu nejsou potvrzené.
- Odesílání zatím neumí přílohy ani editaci existujících konceptů. U kalendáře jsou zápisy omezené na jednoduché události bez účastníků/pozvánek/opakování.
- Přehled administrace má pevné limity (200 schránek; 500 grantů; 200 pravidel/štítků; 50 událostí a položek fronty). Překročení limitu schránek je explicitní chyba, ostatní přehledy oznamují omezení.
- Provozní ochrany pro veřejné nasazení (kvóty/rate limiting, rotace klíčů, revokace podle KSO a koncové OAuth testy) zůstávají otevřené.

## Lokální ověření

`pnpm --dir services/forpsi-connector install --frozen-lockfile --ignore-scripts`

`node --test scripts/forpsi-admin.test.mjs services/forpsi-connector/test/*.test.mjs`

`node scripts/check-syntax.mjs` · `node scripts/build.mjs` · `pnpm --dir services/forpsi-connector build`

Testy používají skutečnou SQL migraci a skutečné API/auth/validační cesty nad SQLite v paměti; Forpsi je nahrazený simulovanými providery. Žádné ostré zprávy nejsou odeslané, upravené ani smazané.
