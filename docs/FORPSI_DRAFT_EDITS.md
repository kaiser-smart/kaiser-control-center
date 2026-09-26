# Úprava existujícího konceptu Forpsi — připravená etapa 3b

Stav 26. 9. 2026: pouze izolovaná implementace. Produkční přepínač `SOAI_DRAFT_EDITS_ENABLED` není nastavený, a proto zůstává vypnutý. Schopnost `REPLACE` a `UIDPLUS` konkrétní schránky Forpsi po přihlášení ještě není ověřená. Žádný existující koncept nebyl nahrazen.

## Uživatelský tok

V Poště SO.ai lze po otevření zprávy ve skutečně nakonfigurované složce Koncepty zvolit **Upravit koncept**, pouze pokud má uživatel práva Čtení i Úpravy, je zapnutý samostatný přepínač a přihlášený server podporuje bezpečné nahrazení. Editor načte pouze textový koncept bez HTML a příloh, se skutečnou adresou schránky v poli From. Jméno odesílatele a dosavadní text včetně podpisu zachová. Změny se uloží ručně; nic se neodešle.

Při souběžné změně obsahu, zmizení původní zprávy nebo změně složky se uložení zastaví. Rozepsaný text zůstane k dispozici, ale opakování stejného pokusu je blokované. Nové načtení původního konceptu chrání potvrzení odchodu z rozepsaného formuláře. Při nejistém výsledku spojení se stejný klíč pokusu nepředá poskytovateli podruhé; uživatel nejprve ověří složku Koncepty.

## API a omezení

`open_draft {mailboxId,reference}` vrací textová pole, zdrojový odkaz, otisk celé původní MIME zprávy a možnost bezpečného nahrazení. `replace_draft {mailboxId,requestId,reference,expectedEtag,message}` kontroluje schránku, aktivitu uživatele, read+write grant, skutečnou složku Koncepty, `\\Draft`, From a nezměněný otisk před jedním IMAP `UID REPLACE`. Návratový odkaz musí obsahovat nové UID z `APPENDUID` (označená i neoznačená odpověď). Chybějící schopnost nebo potvrzení se neobchází APPEND+EXPUNGE. Existující `draft_attempts` eviduje nejvýše jedno volání poskytovatele pro klíč bez uložení obsahu, předmětu či adresátů; nová migrace není potřeba.

Samostatný přepínač není v produkční ani vývojové konfiguraci nastavený, což znamená vypnutou editaci. Stávající nové koncepty zůstávají povolené jen podle `SOAI_DRAFTS_ENABLED` a grantů. MCP, send/delete/schedule, cron, SMTP, podpisy webmailu, CalDAV a CardDAV se nemění. Pro první produkční ověření je třeba nejprve získat po přihlášení pouze seznam IMAP schopností Forpsi a až potom rozhodnout, zda je bezpečné tlačítko zpřístupnit. Veřejná nepřihlášená CAPABILITY odpověď sama o sobě rozhodnutí neumožňuje.

## Izolovaný TEST a přijetí

TEST používá stejné Pages API, session, Worker, SQL a validaci jako provozní cesta. SQLite běží výhradně v paměti, poskytovatel IMAP je simulovaný; skutečný Nodemailer skládá MIME. Pozitivní test ověřuje otevření, jediné `UID REPLACE`, nové UID, audit a opakování výsledku bez druhého volání. Negativní test ověřuje zastaralý otisk, nepodporovaný server, HTML/přílohy/cizí From, špatnou složku či příznak, souběžné volání, nejistý výsledek a revokaci během operace. Produkční SMTP/outbox zůstává nedotčený.

Neověřeno: schopnosti po přihlášení do konkrétní Forpsi schránky, skutečné `UID REPLACE`, uživatelský tok v produkčním prohlížeči a výsledek na skutečném pilotním konceptu. Bez těchto důkazů není etapa přijatá jako funkční produkční editace.

Možné nasazení vyžaduje konkrétní schválení Worker/API verze a případného nahrazení testovacího konceptu. Nejdřív se může nasadit verze se stále vypnutou editací a provést jen čtecí diagnostika schopností. Zapnutí přepínače a změna produkční zprávy jsou další samostatně doložené kroky. Rollback vypne přepínač; tabulka pokusů ani obsah schránky se nečistí.
