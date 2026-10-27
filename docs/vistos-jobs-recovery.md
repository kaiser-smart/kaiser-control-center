# Obnova zastaveného importu 27. října 2026

Při 806 zakázkách a 2137 položkách přestalo načítání pokračovat: archiv měl
2407587840 B při pilotním limitu 2400000000 B, audit 1273753600 B při limitu
1270000000 B. Kontrola kapacity probíhala před založením záznamu běhu, takže
rozhraní nedokázalo uvést skutečný důvod. Čekalo 85 rodičů a fronta proto
pozastavila hlavičky, dokud nedoplní jejich položky.

V CORE byl cíleně aktualizován jediný kontrakt kaiserservis.myvistos.com;
SQL s podmínkou původní revize a původních limitů je v evidence/jobs-recovery-20261027.
Dočasná rezerva archivu je 2.8 GB a auditu 1.6 GB. Čtení zpět potvrdilo revizi
jobs-recovery-2026-10-27-v1. Automatické běhy položek byly následně vidět
27.10.2026 v 11:28 a 11:29 Europe/Prague, bez ručního spouštění importu.

Nový kód používá explicitní capacityEvidence.autoRecovery s datem a identifikací
měření. Efektivní rezervu přepočítává podle aktuální fyzické velikosti před každou
dávkou i před jejím uložením v krocích 100 MB s 25 MB rezervou. Nezvyšuje D1
limit ani oprávnění. Aktuální pevné stropy: CORE 0.5 GB, ARCHIVE 7 GB, AUDIT 3 GB.
Žádný automatický strop nesmí přesáhnout 70 % standardní 10 GB databáze.
Chybějící měření, neschválený plán nebo dosažení stropu dál zastaví zápis.
Plán není příslibem, že celá historická databáze se do limitu vejde.

Po obnovení se zdrojový počet změnil z 183131 na 183219 a původní mechanismus
vrátil počáteční průchod z offsetu 300 na 0. Nově se při růstu neomezené historie
hlaviček ověří jediným dodatečným čtením ID bezprostředně před checkpointem.
Jen pokud je stále na stejné pozici a souhlasí aktuální počet obou odpovědí,
pokračuje dávka dál. Pokles počtu, posunuté ID, souběžná změna počtu a omezené
průchody si zachovávají restart. Ani stabilní offset sám nepotvrzuje úplnost historie.

Stávající minutový plánovač pokračuje z checkpointů, používá časově omezené
zámky a společný limit poskytovatele. Zápisy do Vistosu a účetní operace zůstávají
vypnuté. Kapacitní chyby se nově zapisují do běhů a checkpointů; interní endpoint
rozlišuje blokovaný běh od úspěšné odpovědi. Přehled upozorní i na více než
15 minut bez úspěšného běhu. Zdraví je omezené na firmy a instalaci uživatele.

Ověření: 34 cílených testů, včetně reprodukce produkčních hodnot, všech tří
pevných stropů, chybějícího měření, zachování finančních ochran, záznamu chyby
před prvním voláním zdroje, obnovení bez duplicit a oddělení firem. Syntaxe a build
prošly. Produkční nasazení a růst počtu hlaviček se ověřují samostatně.

Rollback: vraťte předchozí Pages nasazení. Zvýšené dočasné rezervy mohou zůstat;
starší kód autoRecovery ignoruje. Pokud je nutné import znovu zastavit, deaktivujte
pouze pravidlo jobs-vistos-read. Nemažte checkpointy ani zakázky a nesnižujte
limity pod aktuální velikost, pokud cílem není záměrné zastavení importu.
