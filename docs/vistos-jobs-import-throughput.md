# Zakázky: průběžné doplňování dat

Původní běh po deseti minutách načetl dvacet hlaviček a položky jediného rodiče. Počet zakázek bez položek proto rostl. Nový minutový běh pod jedním zámkem instalace zpracuje nejvýše dvanáct krátkých dávek v rozpočtu osmdesáti sekund. Při osmdesáti čekajících zakázkách dočasně upřednostní položky. Zachovává atomické stránky, zámky entit, společný limit požadavků Vistosu a dosavadní kapacitní plán.

Položky se znovu načtou po změně otisku rodiče nebo nejpozději po dni od posledního porovnání. Staré checkpointy bez otisku rodiče se jednorázově ověří znovu. Souběh minutových běhů nezakládá duplicitní frontu; vypršení času, limit poskytovatele nebo kapacity zastaví přidávání práce.

Přehled rozlišuje poslední uloženou změnu od úplnosti historie, ukazuje počet již načtených zakázek a rodičů s čekajícími položkami. Prázdný filtr nabízí všechny načtené zakázky. Souhrn je omezen na povolené firmy uživatele.

Ověřeno lokálně: 34 cílených testů včetně souběhu, časového rozpočtu, zastavení na limitu, obnovy položek a izolace firem. WebKit 390/1440 px: načtení, chyba a obnova, bezpečné hodnoty zdroje, filtry, návrat focusu, žádný horizontální přetok. Jde o syntetické testy; produkční rychlost je nutné změřit po nasazení.

Zůstává omezený kapacitní pilot, pevné prioritní období a neúplná historie. Změna neschvaluje celou historickou kapacitu, neposouvá časové nebo stavové mapování na ověřené a nezapíná žádnou účetní operaci. Ostatní cron rozvrhy jsou zachovány. Pro rollback vraťte předchozí Pages commit i worker a jeho desetiminutový cron; data ani checkpointy nemažte.
