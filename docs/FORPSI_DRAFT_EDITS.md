# Úprava existujícího konceptu Forpsi — etapa 3b a ověřená kopie 3c

Stav etapy 3b dne 26. 9. 2026: implementace byla nasazená v SO.ai 0.1.813 a Workeru 0.2.8, ale produkční přepínač `SOAI_DRAFT_EDITS_ENABLED` není nastavený, a proto zůstává editace vypnutá. Přihlášený čtecí test pilotní schránky `oplustil@kaiserservis.cz` v produkční Poště vrátil `supportsReplace=false`: server neohlásil současně `REPLACE` a `UIDPLUS`. Tento výsledek sám neurčuje, která jednotlivá schopnost chybí. Tlačítko **Upravit koncept** se správně nezobrazilo a žádný existující koncept nebyl nahrazen.

## Uživatelský tok

Po výběru schránky Pošta SO.ai ukáže čtecí stav podpory bezpečného nahrazení podle přihlášeného IMAP serveru. Po otevření zprávy ve skutečně nakonfigurované složce Koncepty lze zvolit **Upravit koncept**, pouze pokud má uživatel práva Čtení i Úpravy, je zapnutý samostatný přepínač a server podporuje bezpečné nahrazení. Editor načte pouze textový koncept bez HTML a příloh, se skutečnou adresou schránky v poli From. Jméno odesílatele a dosavadní text včetně podpisu zachová. Změny se uloží ručně; nic se neodešle.

Při souběžné změně obsahu, zmizení původní zprávy nebo změně složky se uložení zastaví. Rozepsaný text zůstane k dispozici, ale opakování stejného pokusu je blokované. Nové načtení původního konceptu chrání potvrzení odchodu z rozepsaného formuláře. Při nejistém výsledku spojení se stejný klíč pokusu nepředá poskytovateli podruhé; uživatel nejprve ověří složku Koncepty.

## API a omezení

`open_draft {mailboxId,reference}` vrací textová pole, zdrojový odkaz, otisk celé původní MIME zprávy a možnost bezpečného nahrazení. `replace_draft {mailboxId,requestId,reference,expectedEtag,message}` kontroluje schránku, aktivitu uživatele, read+write grant, skutečnou složku Koncepty, `\\Draft`, From a nezměněný otisk před jedním IMAP `UID REPLACE`. Návratový odkaz musí obsahovat nové UID z `APPENDUID` (označená i neoznačená odpověď). Chybějící schopnost nebo potvrzení se neobchází APPEND+EXPUNGE. Existující `draft_attempts` eviduje nejvýše jedno volání poskytovatele pro klíč bez uložení obsahu, předmětu či adresátů; nová migrace není potřeba.

Samostatný přepínač není v produkční ani vývojové konfiguraci nastavený, což znamená vypnutou editaci. Stávající nové koncepty zůstávají povolené jen podle `SOAI_DRAFTS_ENABLED` a grantů. MCP, send/delete/schedule, cron, SMTP, podpisy webmailu, CalDAV a CardDAV se nemění. Produkční čtecí diagnostika po přihlášení rozhodla, že bezpečné tlačítko pro tuto schránku zpřístupnit nelze. Veřejná nepřihlášená CAPABILITY odpověď sama o sobě toto rozhodnutí neumožňovala.

## Izolovaný TEST a přijetí

TEST používá stejné Pages API, session, Worker, SQL a validaci jako provozní cesta. SQLite běží výhradně v paměti, poskytovatel IMAP je simulovaný; skutečný Nodemailer skládá MIME. Pozitivní test ověřuje otevření, jediné `UID REPLACE`, nové UID, audit a opakování výsledku bez druhého volání. Negativní test ověřuje zastaralý otisk, nepodporovaný server, HTML/přílohy/cizí From, špatnou složku či příznak, souběžné volání, nejistý výsledek a revokaci během operace. Produkční SMTP/outbox zůstává nedotčený.

Produkční důkaz: PR #204 je sloučený v commitu `05b00d2`; veřejné `https://smart-odpady.ai/src/data/buildMeta.js` vrátilo `0.1.813 / main / 05b00d2` a nasazený Worker má verzi `a56ee460-4f44-49cf-b95c-71e51dc365b3` na 100 %. Přihlášené UI načetlo pilotní schránku, zobrazilo hlášení „server bezpečné nahrazení nehlásí“ a nenabídlo editaci. Nový koncept zůstává samostatně dostupný podle dosavadních práv. Neověřeno: skutečné `UID REPLACE` a úprava skutečného konceptu; při zjištěné nepodpoře se ani neprováděly.

## Navazující cesta pro Forpsi — upravená kopie

Etapa 3c přidala samostatný, srozumitelně označený tok **Uložit upravenou kopii**. Načte jen textový koncept bez HTML/příloh a jeho otisk. Při ukládání znovu ověří stejnou zprávu a jedním IMAP APPEND vytvoří nový koncept s původním jménem odesílatele. Pokud Forpsi vrátí UID, pokusí se novou kopii znovu načíst a porovnat otisk uloženého MIME. Potvrzený APPEND se při neúspěšném zpětném čtení neprovede podruhé; UI rozlišuje potvrzené uložení od neověřeného obsahu. Původní koncept automaticky nemaže ani nepřesouvá; uživatel před uložením vidí, že ve Forpsi budou dvě verze. Po ověření nové může starou odstranit ve webmailu.

Nové `open_draft` pro načtení podporuje samostatný přepínač `SOAI_DRAFT_COPIES_ENABLED`; atomický `replace_draft` zůstává vypnutý. `copy_draft {mailboxId,requestId,reference,expectedEtag,message}` vyžaduje aktivní schránku, práva čtení i úpravy a zapnuté ukládání konceptů. Identifikátor pokusu se uloží před voláním poskytovatele a nejistý výsledek APPEND se stejným klíčem znovu neodesílá. Audit a tabulka pokusů neukládají obsah, předmět ani adresáty. Současná zdrojová zpráva se těsně před APPEND ověří; IMAP však neposkytuje atomickou podmínku vůči změnám provedeným jiným klientem v následujícím okamžiku. Funkce nemění odesílání, mazání, cron ani práva kolegů.

Produkční důkaz 26. 9. 2026: PR #207 je sloučený v commitu `1cb882b`; veřejný `buildMeta.js` vrátil SO.ai `0.1.815 / main / 1cb882b` a Worker `0.2.9` byl nasazen jako verze `983908b1-2af7-4871-ad73-3d67b6b3` na 100 %. V přihlášené Poště pilotní schránky `oplustil@kaiserservis.cz` se otevřel existující testovací koncept **SO.ai – test konceptu**. Jediným uložením vznikla v `INBOX.Drafts` nová kopie s označením `TEST – NEODESLÁNO`; aplikace ji po uložení znovu načetla a ověřila. Čtecí kontrola složky ukázala původní koncept z 8:38:29 bez nového označení a kopii z 15:12:46 s označením. Produkční čtecí SQL kontrola vrátila jeden audit `soai.copy_draft`, dvě položky v `draft_attempts` celkem a nula položek v outboxu; dotaz nic nezapsal. Další skutečná schránka ani hromadné kopírování se netestovaly. Atomické nahrazení původního konceptu zůstává pro tento server nedostupné.

Přepínač `SOAI_DRAFT_EDITS_ENABLED` se pro tuto schránku nezapíná; ani jeho zapnutí by nepřekonalo chybějící podporu serveru. Rollback kódu editace není pro aktuální bezpečný stav nutný, protože nepodporovaná operace zůstává nedostupná. Tabulka pokusů ani obsah schránky se nečistí.
