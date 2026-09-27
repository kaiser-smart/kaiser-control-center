# Forpsi: přechod z osobního čtecího pilotu

Produkční OAuth je stále navázaný na přihlášení SO.ai. Identita je stabilní ID uživatele
z ověřené relace, nikoli e-mailová adresa dodaná ChatGPT. Každý OAuth rozsah musí mít
aktivní grant ke schránce v téže firmě a grant se ověřuje při každém volání. Staré
pilotní tokeny zůstávají omezené na původní schránku a `forpsi:read` až do expirace.

Rozsahy: `forpsi:read`, `forpsi:write`, `forpsi:send`, `forpsi:delete`,
`forpsi:schedule`. Rozšíření souhlasu v ChatGPT vyžaduje nový OAuth průchod a
výslovné schválení zobrazených rozsahů. Samotný OAuth souhlas nezakládá grant
ke schránce. Kolegové potřebují své vlastní SO.ai identity a vlastní granty.

`send_message` a `schedule_message` pouze uloží šifrovaný návrh. Vrací přesný
odesílací účet, To, Cc, Bcc, předmět, celý text, přílohy (současné rozhraní
podporuje jen text, proto žádné) a odkaz na `/forpsi-send/`. Odeslání vyvolá
až potvrzení stejné verze návrhu přihlášeným uživatelem v SO.ai. Návrh platí
24 hodin. ID návrhu je idempotentním klíčem outboxu; nejistý výsledek SMTP se
nikdy automaticky neopakuje. `sent` označuje přijetí serverem SMTP, nikoli
doručení do cílové schránky.

Před nasazením: uchovat Git bundle a export D1 mimo Git s právy 0600;
aplikovat pouze aditivní `0009_send_approvals.sql` nejprve na kopii exportu;
ověřit prázdnou frontu `outbox`; nastavit nový 32bajtový `OUTBOX_KEY` jako
Worker secret bez vypsání hodnoty. Migrace 0009 nemění starší tabulky.

Po nasazení ověřit OAuth metadata, odmítnutí neověřené identity, `tools/list`,
`list_mailboxes` pro vlastní účet a odmítnutí cizí schránky. Před reálným
odesláním otevřít návrh v SO.ai a zkontrolovat úplný obsah. Rozvrh Workera
obsluhuje pouze schválené intervalové profily a potvrzené naplánované zprávy;
neposílá notifikace do ChatGPT.

Okamžité vypnutí: nastavit `CONNECTOR_ENABLED=false` nebo přepnout na předchozí
Worker deployment. Tím se zastaví MCP; `SEND_ENABLED=false` navíc zastaví
potvrzení nových odchozích zpráv i plánovač outboxu. Při rollbacku ponechat
aditivní tabulku D1 beze změny kvůli dohledání již potvrzených návrhů a stavu
odeslání. Pages vrátit na předchozí deployment. Odeslaný e-mail nelze vrátit
rollbackem kódu.
