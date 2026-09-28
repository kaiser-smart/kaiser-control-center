# Mail Brain: stav implementace a hranice pilotu

Nasazený pilot přidává případový model vedle dosavadního FORPSI konektoru. Nic
nepřepisuje ve starých pracovních seznamech. Migrace `0012_mail_brain.sql` je
aditivní. Produkční konfigurace této větve zapíná pouze ručně spouštěný pilot
pro schránku `oplustil@kaiserservis.cz` (`MAIL_BRAIN_PILOT_MAILBOX_ID`).
`MAIL_BRAIN_PILOT_READ_ONLY` blokuje případové změny, pravidla a návrhy k
odeslání; `MAIL_BRAIN_SCHEDULED_SYNC_ENABLED` zůstává vypnuté. Radim schválil
nasazení pilotu pro čtení a 90denní analýzu uvedené schránky.

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
3. Hotovo: Worker a Pages běží pro jedinou schránku bez případových změn či
   vnějších akcí a bez automatického synchronizačního cronu. Souhlas s 90 dny
   byl zapsán přihlášenou identitou přes SO.ai a ověřen v D1. První ruční dávka
   načetla 50 zpráv a 15 příloh. Původní velká dávka skončila časovým limitem;
   pozdější oprava ukládá průběžný UID checkpoint a omezuje velikost dávky.
4. Nasazená oprava: analytické volání používá chráněnou Pages cestu s již
   existujícím serverovým OpenAI klíčem. Zpětné vyhodnocení načtených případů
   ověřuje současný grant, souhlas, otisk zdrojové zprávy a přesnou citaci;
   nedoložené případy zůstávají „K ověření“. První produkční průchod této
   verze narazil na časový limit Pages po dvou modelových pokusech; D1 zůstala
   bez doložené klasifikace a checkpoint Doručených se posunul o dvě zprávy.
   Navazující diagnostická oprava omezuje jeden požadavek na jedno modelové
   volání a ukládá pouze bezpečný chybový kód. Příčinu je nutné ověřit živě.
5. Zbývá porovnat TEĎ a osm dotazů z produktového zadání s ručně označeným vzorkem
   skutečné pošty. Každý souhrn, termín a částku kontrolovat proti zdroji.
6. Po nasazení: ověřit podle `PŘÍRUČKA.md` a reálný audit. Zapnutí dalších schránek
   až po přijetí pilotu.

## Dosud nesplněné části plánu

Samostatný vícejazyčný významový index, bezpečnostní skener a náhled PDF,
extrakce polí faktur se zdroji hodnot, automatické učení po pěti schváleních,
autopilot přeposílání, schválené propojení mezi osobními schránkami a hlasový
tok zatím nejsou implementované. Pilot má pouze částečné pokrytí skutečné
pošty; celé 90denní období ani kvalita klasifikace nejsou potvrzené. Tyto
části se nesmějí prezentovat jako hotový
produkt ani zapnout pouhým přepnutím feature flagu.
