# Etapy ručního nastavení Forpsi v SO.ai

Cíl schválený 25. 9. 2026: příjemná a výkonná aplikace s potřebnými funkčními volbami. [Dodanou analýzu](FORPSI_SETTINGS_TARGET.md) používat jako směr, ne jako povinnost implementovat každou položku. Užší finální výběr ručních voleb provést až po ověření nastavení a funkčního API. Neskrývat potřebné funkce předem jen kvůli zkrácení nabídky.

## Společný model pro celý rozsah

Navazující etapa 3a (podpisy, jméno odesílatele a nové koncepty) je popsaná v [kontraktu a produkčním přijetí](FORPSI_COMPOSITION.md). SO.ai 0.1.812 / Worker 0.2.7 jsou nasazené. Výslovně schválený pilot má read + write pouze pro vlastníka jedné schránky; jediný skutečný neodeslaný koncept byl uložen a přečten zpět. Neprázdný podpis je zatím ověřený izolovaně. Nová oprávnění kolegů, odesílání ani automatizace se nezapínají.

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
| 2 — firemní přístupy | Správa kolegů přímo v SO.ai, stabilní identita, oddělení administrace od obsahu, revokace | UI → API → databáze: uložení a revokace, stabilní ID kolegy, neaktivní účet, souběh a audit; reálná práva přidělovat konkrétním schránkám a lidem |
| 2b — pracovní čtení | Přihlášený kolega → přiřazená schránka → složky, hledání a text zprávy | Skutečný tok UI/API, revokace i vypnutí uživatele během požadavku, bezpečné zobrazení obsahu a živý pilot bez změny přečtenosti |
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

Přijetí etapy vyžaduje izolovaný test skutečného frontend/backend toku a read-only produkční ověření. Zápis mapování se v produkci bez konkrétní potřeby neprovádí. Historické přijetí etapy 1 proběhlo s pozastavenou schránkou. Na následný výslovný pokyn uživatele k zapnutí byla pilotní schránka po novém úspěšném ověření 25. 9. 2026 v 23:26:12 povolena. MCP/cron/odesílání zatím neběží a neexistují reálné granty; CalDAV pouze Vlastní, Společný vypnutý.

Stav nasazení a živé důkazy jsou vedené v [FORPSI_CONNECTOR.md](FORPSI_CONNECTOR.md). Tento plán nepovoluje provozní aktivaci uvedených etap.

## Etapa 2 — ruční správa přístupů

Administrace umí vybrat konkrétní schránku a kolegu, změnit read/write/send/delete/schedule a všechna práva odebrat. Vyžaduje `settings:manage` i `users:view` pro adresář, `users:edit` pro zápis. Role ani globální výchozí oprávnění se nemění. Výběr je z aktuálního sloučeného adresáře SO.ai; při chybě databáze nebo konfigurace se nesmí použít neověřená náhrada. Do UI jdou jen ID, jméno, e-mail a aktivita účtu.

Identita je `issuer=urn:smart-odpady:session`, `subject=SO.ai user.id`, ve stávající tabulce principals. E-mail není identita. Existující OAuth identity se nepřepisují a editor je pouze zobrazuje. Navazující etapa 2b níže doplňuje pracovní čtení. Propojení OAuth subjektu na účet SO.ai stále není implementované a uložená práva nelze vydávat za dokončené použití ChatGPT.

Zápis nahrazuje výběr práv jednoho kolegy na jedné schránce. Sdílí revizi schránky s ostatní administrací. CAS, vytvoření identity, nastavení pěti grantů a audit před/po jsou v jedné transakci; selhání auditu vše vrátí. Konflikt nic nepřepíše. Uložení nemění aktivitu schránky ani ověření připojení, nepovoluje MCP, cron a neposílá zprávy. Prázdný výběr znamená revokaci, kterou lze provést i u odstraněného nebo vypnutého kolegy. Neaktivní identita konektoru se neaktivuje jako vedlejší účinek. Plánování vyžaduje odesílání.

Formulář chrání neuložené změny a po chybě je zachová; po úspěchu ukazuje skutečně načtený stav. Práva zatím platí pro celou schránku a všechny jí dostupné kolekce. Běžný runtime vždy kontroluje konkrétní grant; naplánovaná zpráva jej kontroluje znovu před SMTP. Již zahájenou operaci nelze revokací odvolat. Pracovní čtení v etapě 2b kontroluje aktuální aktivitu účtu SO.ai před i po požadavku; trvalé smazání grantů není pro odmítnutí neaktivního účtu potřeba.

Živé ověření této etapy čte adresář a uložené přístupy. Zápis/revokace i čekající fronta se testují se syntetickými účty a SQLite bez vnějších účinků. Reálná práva kolegům se bez konkrétního výběru nepřidělují.

## Etapa 2b — pracovní čtení

Pošta je samostatná pracovní položka dostupná i běžnému přihlášenému kolegovi. Správa nastavení nezakládá právo na obsah. Server povoluje jen `list_mailboxes`, `list_folders`, `search_messages` a `read_message`; nesmí přijmout actorId z prohlížeče ani operaci zápisu/odesílání. Adresář se čte striktně před i po požadavku. Soukromý Worker znovu ověřuje grant a aktivitu schránky po čtení poskytovatele. Revokace nebo vypnutí uživatele během načítání zabrání vydání obsahu. Již zobrazenou zprávu nelze revokací zpětně odvolat.

IMAP používá read-only zámek; čtení nemění `Seen`. Datum od je včetně, datum do v UI také včetně; API `before` znamená následující den výlučně. Jde o datum přijetí na serveru, hlavička zprávy může mít jiné datum. Jedna dávka prohledá nejvýše 5000 UID a vrátí nejvýše 20 výsledků v UI. I prázdná dávka může mít pokračování do starší části. Žádné automatické stahování celé schránky.

Zpráva do 2 MiB se zobrazí jako escapovaný text, nejvýše 100000 znaků, bez vykonatelného HTML a externích obrázků. Přílohy mají pouze metadata. Obsah není ukládaný do localStorage ani IndexedDB; změna účtu nebo opuštění modulu vymaže stav a zneplatní čekající odpovědi. Chyba nezanechá starý obsah zprávy.

Samostatný `SOAI_MAIL_ENABLED=true` zapíná jen tento čtecí endpoint. `CONNECTOR_ENABLED=false`, prázdný cron, SMTP a ChatGPT OAuth se tím nemění. Produkční přiřazení pilotního práva `read` se provádí existující administrací konkrétnímu účtu a ověřuje zpětným čtením; ostatním kolegům se práva automaticky nepřidělují.

## Užší výběr nastavení po živém ověření čtení

SO.ai 0.1.811 zjednodušuje administraci na Schránky, Přístupy kolegů a Rozšířené. V hlavním pohledu jsou adresa/název schránky, povolení či pozastavení, výsledek a čas testu příjmu, případné chyby jednotlivých služeb a akce pro připojení, ověření a přístupy. Otevřít poštu zůstává dostupné v hlavičce. Při pozastavené schránce se nabízí zapnutí se stávající serverovou podmínkou úspěšného ověření.

Detaily služeb, načtení složek/kolekcí a pozastavení jsou v rozbalovací části schránky. Mapování speciálních složek je v rozšířené části formuláře. Samostatná záložka Rozšířené obsahuje dostupné funkce/ChatGPT, čtecí přehled štítků/pravidel/fronty, Log událostí a technickou diagnostiku. Žádná dosavadní funkce ani omezení nejsou odstraněné. Chyby připojení zůstávají viditelné i při zavřených detailech.

Jde o UI nad stejným API, nikoli nové preference, práva nebo automatizace. Rozbalení žije pouze v paměti zobrazení, přežije překreslení při požadavku a změna uživatele je vynuluje. Přechod ze schránky přímo na její přístupy používá stejnou ochranu neuložených změn. Produkční přijetí této úpravy pouze čte stávající data; ověření ukládání probíhá se syntetickými daty v izolovaném testu.
