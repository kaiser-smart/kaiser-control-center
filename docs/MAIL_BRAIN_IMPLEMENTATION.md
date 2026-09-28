# Mail Brain: stav implementace a hranice pilotu

Tato větev přidává případový model vedle dosavadního FORPSI konektoru. Nic
nepřepisuje ve starých pracovních seznamech. Migrace `0012_mail_brain.sql` je
aditivní. V produkční konfiguraci jsou `MAIL_BRAIN_ENABLED` a
`MAIL_BRAIN_SCHEDULED_SYNC_ENABLED` vypnuté.

## Hotové v této větvi

- Samostatný souhlas uživatele s analýzou až 90 dnů Doručených a Odeslaných.
  Synchronizace je stránkovaná, ukládá stav obou složek, chyby a poslední úplný
  průchod. Chybějící nastavení Odeslaných se doplní jen tehdy, když IMAP vrátí
  právě jednu dostupnou složku s příznakem `\\Sent`. TEĎ neoznačí zbytek pošty
  za nepodstatný při neúplném pokrytí.
- Trvalé případy, zdrojové zprávy, pět stavů, odložení, závazky s citací,
  časová osa, audit akcí a ručně potvrzované spojení nebo rozdělení případů
  jedné schránky. Cizí schránka a chybějící grant zůstávají nepřístupné.
- TEĎ v SO.ai a osm doménových MCP nástrojů. Přesné hledání běží přes FTS5;
  výsledky se znovu kontrolují proti aktuálním grantům. Staré MCP nástroje
  zůstávají dostupné.
- Firemní pravidla mají přednost a mění společný případ. Osobní pravidlo
  `prioritize` nebo `deprioritize` mění pouze pohled jeho vlastníka. Zapnutí
  osobního pravidla vyžaduje přihlášenou stránku SO.ai; právo úprav se ověřuje
  při každé změně. Příchozí e-mail nemůže sám schválit pravidlo ani uzavřít případ.
- Odpověď k případu ukládá přesný šifrovaný návrh. Následuje idempotentní
  žádost o schválení celého obsahu v SO.ai. Teprve stávající schvalovací postup
  smí vyvolat SMTP; nejistý SMTP výsledek se automaticky neopakuje.
- Příloha má metadata, typ a SHA-256, je-li možné PDF načíst. Při otevření se
  PDF načte z FORPSI znovu a otisk se porovná. Náhled i přeposlání jsou zatím
  blokované, protože bezpečnostní skener a extrakce dokumentů nejsou hotové.
- Uzavřené případy a jejich FTS záznamy se po 365 dnech mažou; otevřené ne.

## Před zapnutím pilotu

1. Zálohovat Git a produkční D1, aplikovat migraci nejprve na kopii exportu.
2. Ověřit živé OAuth identity, granty, schránku, její složku Odeslané a stav
   synchronizace. Připojení schránky samo není souhlasem s analýzou historie.
3. Zajistit aktivní účet a přístup k Cloudflare; spustit pilot jen s jednou
   výslovně odsouhlasenou schránkou a nejprve bez vnějších akcí.
4. Porovnat TEĎ a osm dotazů z produktového zadání s ručně označeným vzorkem
   skutečné pošty. Každý souhrn, termín a částku kontrolovat proti zdroji.
5. Ověřit nasazení podle `PŘÍRUČKA.md` a reálný audit. Zapnutí dalších schránek
   až po přijetí pilotu.

## Dosud nesplněné části plánu

Samostatný vícejazyčný významový index, bezpečnostní skener a náhled PDF,
extrakce polí faktur se zdroji hodnot, automatické učení po pěti schváleních,
autopilot přeposílání, schválené propojení mezi osobními schránkami a hlasový
tok zatím nejsou implementované. Pilot na skutečné poště, produkční migrace a
nasazení nejsou provedené. Tyto části se nesmějí prezentovat jako hotový
produkt ani zapnout pouhým přepnutím feature flagu.
