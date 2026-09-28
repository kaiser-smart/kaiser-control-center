# Mail Brain: stav implementace a hranice pilotu

Tato větev přidává případový model vedle dosavadního FORPSI konektoru. Nic
nepřepisuje ve starých pracovních seznamech. Migrace `0012_mail_brain.sql` je
aditivní. Produkční konfigurace této větve zapíná pouze ručně spouštěný pilot
pro schránku `oplustil@kaiserservis.cz` (`MAIL_BRAIN_PILOT_MAILBOX_ID`).
`MAIL_BRAIN_PILOT_READ_ONLY` blokuje případové změny, pravidla a návrhy k
odeslání; `MAIL_BRAIN_SCHEDULED_SYNC_ENABLED` zůstává vypnuté. K nasazení této
konfigurace je nutné samostatné schválení produkčního Workeru a Pages.

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

## Produkční příprava a ověření pilotu

1. Hotovo: soukromá úplná záloha produkční D1 a Git bundle. Obnovená kopie
   prošla kontrolou integrity a migrací. Samostatně schválená aditivní migrace
   `0012` byla aplikována do produkční D1; následné čtení potvrdilo 15 nových
   tabulek včetně FTS stínových tabulek, žádný případ ani souhlas a zachovaný
   počet schránek, identit a grantů.
2. Hotovo: živé metadata OAuth identity, grantů a vybrané schránky. Její složka
   Odeslané se ověří podle IMAP příznaku `\\Sent` při zápisu souhlasu. Připojení
   schránky samo není souhlasem s analýzou historie.
3. Čeká na schválení: nasazení Workeru a Pages. Worker poběží jen pro jednu
   schránku, v režimu bez případových změn či vnějších akcí a bez automatického
   synchronizačního cronu. Souhlas udělený v chatu se musí svázat s ověřenou
   identitou v backendu; zatím není v D1 zapsán.
4. Po nasazení: porovnat TEĎ a osm dotazů z produktového zadání s ručně označeným vzorkem
   skutečné pošty. Každý souhrn, termín a částku kontrolovat proti zdroji.
5. Po nasazení: ověřit podle `PŘÍRUČKA.md` a reálný audit. Zapnutí dalších schránek
   až po přijetí pilotu.

## Dosud nesplněné části plánu

Samostatný vícejazyčný významový index, bezpečnostní skener a náhled PDF,
extrakce polí faktur se zdroji hodnot, automatické učení po pěti schváleních,
autopilot přeposílání, schválené propojení mezi osobními schránkami a hlasový
tok zatím nejsou implementované. Pilot na skutečné poště a nasazení nejsou
provedené. Tyto části se nesmějí prezentovat jako hotový
produkt ani zapnout pouhým přepnutím feature flagu.
