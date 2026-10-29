# CCS BBS: doložený alternativní zdroj, zatím neaktivní

Stav ověření: 27. 10. 2026. Tento přírůstek obsahuje transport a parser pro ověření zdroje. Neaktivuje synchronizaci, nemění produkční data ani nenahrazuje dosavadní blokaci `ccs_automatic_channel_not_verified`.

## Ověřené veřejné podklady

- [Oficiální CCS BBS](https://bbs.ccs.cz/) výslovně popisuje automatické stahování pomocí cURL a vlastní přihlašovací údaje, odlišné od jiných serverů CCS. Stránka uvádí datum 21. 7. 2011.
- [Soukromý adresář](https://bbs.ccs.cz/cgi-bbs/bbsuser/) obsahuje podle popisu měsíční vyúčtování a některé průběžné informace.
- [Čerpání před vyúčtováním](https://bbs.ccs.cz/cgi-bbs/cerpani/) je samostatná dokumentovaná část. Její skutečný strojový formát a dostupnost pro konkrétní účet dosud nejsou ověřeny.
- [Návod](https://bbs.ccs.cz/info/navod.txt) popisuje TXE a jeho gzip variantu `.f-z`.
- [Popis datových souborů](https://bbs.ccs.cz/info/popis_dt.txt), aktualizovaný 1. 7. 2008, definuje TXE, kódování PC Latin 2, délku 283 bajtů a kontrolní větu.
- Veřejné stránky odpověděly přes HTTPS. Obě soukromé cesty bez přihlašovacích údajů vrátily HTTP 401 a autentizační schéma Basic. To nepotvrzuje existenci ani aktivaci zákaznického přístupu.

Stáří dokumentace je důvodem pro ověření aktuálního účtu a dat, nikoliv důkazem nefunkčnosti služby. Žádné přihlašovací údaje nového portálu nebyly zkoušeny na BBS.

## Co je implementováno

`functions/_lib/ccs-bbs.js` provádí GET pouze na doložený HTTPS adresář. Čte `CCS_BBS_USERNAME` a `CCS_BBS_PASSWORD` z předaného serverového prostředí. Nezapisuje je do URL ani logů, nesleduje přesměrování a neopakuje zamítnutou autentizaci. Jiná než ověřená ASCII reprezentace údajů vyžaduje doplnění kontraktu. Odpověď má limit 10 MiB a časový limit 15 sekund.

Stahování souboru vyžaduje výslovný odkaz z načteného adresáře na `.txe` nebo `.f-z`, stejný HTTPS server a cestu pod soukromým adresářem. Parser odkazů záměrně přijímá jen jednoduché kotvy s prvním atributem `href` v uvozovkách. Nepodporovaný HTML výpis je třeba prohlédnout a parser upravit podle skutečného vzorku. Názvy měsíčních souborů se neodhadují.

`functions/_lib/ccs-bbs-txe.js` rozbaluje gzip s kontrolou integrity a omezením velikosti. TXE čte po bajtech v CP852, vyžaduje očekávané šestiznakové zákaznické číslo, odesílatele `10008`, pořadí H/B/T, počet řádků a kontrolní součet CZK. Zachovává celé číslo karty, kódy produktu a stanice, místní datum/čas, originální částky, DPH, množství, tachometr i připojené sloupce. Nulová karta označuje poplatek účtu; záporné opravy se nezahazují. Původní řádky zůstávají soukromým podkladem pro audit.

HTTP 200, validní TXE ani prázdný TXE soubor samy neznamenají připojený nebo úplný zdroj. Výsledky zůstávají `sourceConnected: false` a `coverageVerified: false`. Úspěšná kontrola zákazníka neprokazuje aktuálnost ani úplnost dat.

## Co ještě musí být ověřeno před zapojením

1. CCS potvrdí existenci nebo postup získání přístupu pro účet a aktuální podporu služby; případné placené zřízení vyžaduje samostatné schválení.
2. Údaje budou vloženy do serverového úložiště tajemství; ne do chatu, repozitáře či argumentů příkazové řádky. Očekávané zákaznické číslo se získá z potvrzeného kontraktu, ne odvozením z identifikátoru nového portálu.
3. S oprávněným přístupem se ověří adresář a skutečný formát čerpání před vyúčtováním. Soukromé soubory zůstanou mimo Git a veřejná CI data.
4. Porovnají se účty, karty, počty, období, částky a opravy proti současnému MyFleetcor XLSX. Vyjasní se význam ceny s/bez DPH, měny, časové pásmo a jednotky. Parser tyto závěry nedoplňuje odhadem.
5. Ověří se frekvence aktualizace a povolený interval čtení. Požadavek každé čtyři hodiny není zatím potvrzenou vlastností BBS.
6. Teprve potom se připojí serverový plánovač, audit běhů, evidence pokrytí období a import. Ověření musí zahrnout opakovaný běh, opravy a přechod nevyfakturované položky do vyúčtování bez zdvojení.

## Navazující implementace ve SMART ODPADY

Zachovat původní zdroj, účet, hash souboru, číslo řádku a surové hodnoty. Hash souboru řeší opakované stažení stejného souboru; shoda složeného klíče mezi různými soubory je pouze kandidát na duplicitu. Bez stabilního identifikátoru se nejednoznačné shody předají ke kontrole. Import BBS a MyFleetcor stejného období nesmí probíhat bez ověřeného párování a sjednocení zdrojů.

Karty se mapují na vozidla s dobou platnosti. Pole „SPZ/jméno“ je nejednoznačné a samo nestačí pro přiřazení řidiče; pracovní přiřazení řidiče se řeší zvlášť. Poplatky účtu, parkovné a nabíjení se nesmějí zahrnout do litrů PHM. Nákup paliva není měřená spotřeba: ta se čerpá z ověřeného Sledování vozidel se shodou vozidla a období, kvalitou signálu a doloženou vzdáleností. UI zobrazuje stav zdroje, poslední úspěšný přenos, pokryté období, nerozpoznané položky a důvod blokace. Nepotvrzená veličina zůstane nedostupná, nikoli nulová.

Podrobnější cílový model, oprávnění, importní evidence a obrazovka jsou popsány v [CCS_INTEGRATION_SPEC.md](CCS_INTEGRATION_SPEC.md). Tento dokument zpřesňuje dostupný zdroj, neoznačuje integraci za dokončenou.

## Ověření kódu

`node --test scripts/ccs-import.test.mjs scripts/ccs-server.test.mjs scripts/ccs-bbs.test.mjs`

Testy BBS používají výhradně syntetické údaje. Pokrývají kódování, kontrolní součty, účet, chybné datum/čas, strukturu, poplatky, storna, gzip integritu a velikost, odmítnuté přihlášení, přesměrování, sanitaci chyb a výběr odkazů. Neprokazují funkční přístup zákazníka ani data z BBS.
