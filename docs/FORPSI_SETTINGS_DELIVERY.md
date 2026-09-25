# Etapy ručního nastavení Forpsi v SO.ai

Cíl schválený 25. 9. 2026: příjemná a výkonná aplikace s potřebnými funkčními volbami. [Dodanou analýzu](FORPSI_SETTINGS_TARGET.md) používat jako směr, ne jako povinnost implementovat každou položku. Užší finální výběr ručních voleb provést až po ověření nastavení a funkčního API. Neskrývat potřebné funkce předem jen kvůli zkrácení nabídky.

## Společný model pro celý rozsah

- Oddělit osobní předvolby, nastavení schránky/kolekce a správu firmy. Přihlášený uživatel SO.ai je zdrojem identity; vlastníkem obsahu se nestává tím, že spravuje připojení.
- Každá volba má rozsah, vlastníka/správce, zdroj pravdy, dopad, stav uložení a stav ověření. Označit firemní výchozí hodnotu odděleně od závazné hodnoty. Stávající UI připojení je zatím dostupné přes `settings:manage`, nikoli osobní samoobsluhu.
- Ruční práce v SO.ai musí fungovat bez ChatGPT. Integrace s ChatGPT dostane samostatné přihlášení a odvolatelné granty; e-mailová adresa sama není identita.
- Pošta, kalendáře a kontakty mají zdroj ve Forpsi. Vlastní štítky, pravidla a budoucí podpisy SO.ai nesmějí tvrdit synchronizaci s webmailem.
- Oprávnění pro čtení, návrhy, změny, odeslání, plánování, mazání, export a správu vynucovat serverem. Dnešní model má pouze read/write/send/delete/schedule; jemnější práva a vazby na firemní uživatele vyžadují další návrh a testy před použitím.
- Data a nastavení ukládat přes API do příslušného cloudového úložiště. Žádné provozní localStorage/IndexedDB. Souběh řešit verzemi, citlivé údaje nevystavovat v přehledu/exportu/logu.
- Uložení, ověření a aktivace jsou samostatné kroky. Nejasné odeslání neopakovat automaticky. Účinky pravidel nejprve ukázat v náhledu.

## Pořadí realizace

| Etapa | Funkční celek | Přijetí |
|---|---|---|
| 1 — připojení a zdroje | Stavy služeb, existující složky a metadata dostupných kolekcí, bezpečná změna uložených údajů | Test UI → API → úložiště; výběr existující složky, odmítnutí nedostupné složky, ochrana rozepsaných změn, souběhu a tenantů, desktop/tablet/mobil |
| 2 — firemní přístupy | Správa kolegů přímo v SO.ai, stabilní identita, oddělení administrace od obsahu, revokace | Lokální end-to-end testy bez reálných grantů; před produkčním zpřístupněním ověřit firemní vazby a konkrétní rozsah práv |
| 3 — identity a podpisy | Skutečně povolený odesílatel, Reply-To, vlastní podpisy a šablony SO.ai, textový náhled | MIME testy bez odeslání, izolace schránek, sanitace HTML, žádné nepodložené aliasy |
| 4 — štítky a pravidla | Editory, rozsah a původ, preview, ruční aplikace, audit a verze | Před spuštěním shodný náhled zásahů, odstranění štítku nesmaže zprávu, žádné skryté spouštění |
| 5 — plánované zprávy | Přehled, úprava/zrušení plánu, timezone/DST, oprávnění před vykonáním | Stejná backendová logika se simulovaným SMTP; nejistý výsledek bez duplicit; ostrý cron a odeslání vyžadují vlastní schválení |
| 6 — kolekce a pracovní prostředí | Výběr kalendářů/adresářů, výchozí kolekce, účelné osobní předvolby | Omezení kolekcí se uplatňuje serverem; pozvánky/opakování nepředstírat; předvolby ověřit po opětovném přihlášení |
| 7 — navazující agendy | Soubory, úkoly a poznámky podle ověřené integrační cesty nebo výslovně vlastního úložiště SO.ai | Nejprve doložit zdroj, oprávnění, sdílení a obnovu; existence nabídky Forpsi není důkaz API |
| Závěr — zjednodušení | Užší výběr opravdu potřebných ručních voleb | Zařadit jen ověřené funkce. Časté volby do základního pohledu, vzácné do rozšířeného, techniku do diagnostiky. Každá viditelná akce musí vést k výsledku. |

## Etapa 1 — kontrakt

Administrace čte `resources` přes SO.ai session a stejné `settings:manage`, soukromý Service Binding a tenantově omezený Worker. Odpověď vrací jen názvy složek, kalendářů a adresářů, čas a revizi. Nečte obsah; nedává nová práva, nepovoluje kalendáře a nic nesynchronizuje na pozadí. Výpis je omezen na 500 položek každého druhu a větší výpis explicitně selže.

Složky Koncepty/Odeslané/Koš se vybírají z načtených existujících složek. Nevybraná hodnota znamená použití příznaku poskytovatele, nikoli vytvoření složky. `\\Noselect` není cíl pro zprávy. Změněné mapování server znovu ověří před zápisem. Změnu hesla a mapování provést ve dvou krocích, aby se složky neověřovaly starými údaji. Uložení i nadále pozastaví schránku a zneplatní dosavadní test.

Kalendáře a adresáře jsou v této etapě pouze přehled dostupnosti. Neexistuje ještě ukládání výchozí kolekce ani omezení přístupu na kolekci. Jednotlivé chyby se zobrazí odděleně, bez surových protokolových výpisů. Čtení zdrojů nevymaže rozepsaný formulář.

Přijetí etapy vyžaduje izolovaný test skutečného frontend/backend toku a read-only produkční ověření. Zápis mapování se v produkci bez konkrétní potřeby neprovádí. Schválené dosavadní hranice platí: pilot pozastavený, MCP/cron/odesílání vypnuté, žádné reálné granty; CalDAV pouze Vlastní, Společný vypnutý.

Stav nasazení a živé důkazy jsou vedené v [FORPSI_CONNECTOR.md](FORPSI_CONNECTOR.md). Tento plán nepovoluje provozní aktivaci uvedených etap.
