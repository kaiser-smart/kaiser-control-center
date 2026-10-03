# Mail Brain V2: implementace a provozní přechod

V2 odstraňuje jediný společný stav případu jako zdroj přehledu TEĎ. Případ
může obsahovat více prací s různými vlastníky, termíny a podmínkami.
Zprávy poskytují neměnné návrhy faktů a událostí. Teprve ověřené rozhodnutí
vytvoří sdílenou práci; její zařazení do Vyřídit / Čekám odvozuje server
pro konkrétního přihlášeného uživatele. Upozornění zůstávají samostatná.

## Rozhodující pravidla

- Přesná citace a aktuální otisk zdroje jsou nutnou, ale ne dostačující
  podmínkou přijetí. V této verzi přijímá výklad člověk v přihlášeném SO.ai,
  který potvrdí význam i pravomoc autora. MCP ani model se nemohou vydávat
  za toto potvrzení. Automatické firemní schvalovací politiky nejsou aktivní.
- Nová extrakce nemůže vymazat dříve přijatou práci vynecháním. Oprava
  nahrazuje konkrétní předchozí rozhodnutí a výslovně určuje stejnou či
  odlišnou práci. Nejde o zrušení skutečné povinnosti. Nejasná identita čeká
  na ověření; obecné atomické rozdělení nebo sloučení více prací není součástí
  této verze.
- Spor o termín ponechá doloženou práci otevřenou, s prázdným termínem
  a viditelným rozporem. Nejistý vlastník či samotná existence vede k ověření.
- Čekající podmínka je vidět v Informacích a ve vlastním počtu. Dokončení
  předchůdce vyžaduje případný předepsaný kladný výsledek. Relevantní odpověď
  a doručení konkrétního dokumentu jsou různé podmínky. Automatická odpověď
  ani samotný název přílohy nedokazují doručení požadovaného obsahu.
- Ruční založení, delegace, dokončení, zrušení, nahrazení, znovuotevření,
  oprava vlastností a odebrání termínu jsou auditované události. Ruční
  ochranu musí následná oprava výslovně ponechat či uvolnit.
- Odložení a skrytí upozornění je osobní. Sdílená změna vyžaduje oprávnění
  `work.manage`; přijetí výkladu také `facts.review`; společné vyřešení
  upozornění `signals.manage_shared`. Samotný grant write nestačí.
- Celá položka včetně odvozeného textu, počtů a termínu se nezobrazí bez
  přístupu ke všem jejím zdrojům a závislostem. Změna grantů nebo zdrojů
  zneplatní i dříve vydanou stránkovací revizi.
- Projekce se publikuje atomicky s kontrolou zdrojů, revize, souhlasu
  a grantů. Selhání ponechá bezpečnou starší V2 označenou jako zastaralou;
  neplatný zdroj znamená nedostupný výsledek. Po první publikaci V2 se
  příslušný případ nikdy nesmí vrátit ke klasifikaci V1.
- Dokončení má sedmidenní informační zobrazení stejné položky. Hlášení
  vozidel se seskupují podle systému, vozidla a pevného pětiminutového
  intervalu UTC. Počet hlášení není tvrzením o počtu incidentů.

## Implementované cesty

`work-v2-contract.mjs` a `work-v2-extraction.mjs` určují strukturu, identitu
zdrojových výroků a evidence. Vyhodnocování běží přímo v připojené konverzaci
ChatGPT: `list_work_analysis` najde čekající případy, `prepare_work_analysis`
vrátí přesné podklady a `submit_work_analysis` ověří a uloží návrhy. Poté
`case_get` a `render_attention` načtou skutečně uložený stav. Nativní karta
umí předat zadání hostiteli přes standardní `ui/message`.

Příprava má podepsanou patnáctiminutovou vazbu na případ, přihlášenou osobu,
revizi, přesné podklady, ověřené identity a aktuální souhlasy/oprávnění.
Změna podkladů, souběžná úprava, jiný účet nebo expirace vyžadují novou
přípravu. Opakování stejného podání vrátí tentýž výsledek; změněný obsah pod
stejnou vazbou je odmítnut. Návrhy i potvrzení podání se ukládají v jedné
transakci. Serverové ověřování citací nepřijímá model za člověka.

`MAIL_BRAIN_V2_ANALYSIS_MODE=chatgpt` je výchozí i produkční režim.
Nepoužívá samostatné OpenAI API ani jeho denní rozpočet. Sync pouze načte
zprávy; na pozadí nespustí model. Původní serverová API cesta vyžaduje
výslovný režim `api` a nenulový rozpočet; není automatickým fallbackem.
Resolver nevolá model. `work-v2-store.mjs` ukládá neměnné události do D1,
kontroluje oprávnění a spravuje revize a konzistentní stránkování.

SO.ai používá skutečné Pages a Worker handlery pro ověření výkladů, úpravy
práce, osobní odložení, podmínky a podklady. Nativní MCP aplikace TEĎ
používá stejný serverový výběr. Sdílené změny odkazuje do přihlášeného SO.ai;
MCP ukládá návrhy výkladu a dovoluje změny osobního zobrazení. Staré mutace případů a pravidel jsou při
zapnutí V2 odmítnuty i při přímém volání. Starší klient bez uvedené verze
dostane V2, pokud je V2 na serveru zapnutá.

Správa přístupů ukládá explicitní pravomoci a ověřenou osobní identitu.
Adresu bere z aktuálního adresáře aplikace, nikoli z tvrzení klienta.
Neaktivní vazbu identity nelze obejít založením dalšího principálu.

## Ověření a jeho meze

- Regrese používá 20 syntetických, výslovně přijatých vstupů: 17 prací,
  5 aktivních povinností ve 4 případech, 2 čekající podmínky, 1 volitelná
  reakce, 7 upozornění v 6 skupinách a 2 doložené termíny. Kontroluje také
  každou jednotlivou položku a její sekci. Nejde o výsledky nové analýzy
  původních dvaceti e-mailů.
- Integrační testy provádějí migrace i transakce přes skutečný SQLite:
  konkurenční změny, opravy, ruční ochranu, idempotenci, selhání publikace,
  změnu zdroje, odvolání přístupu, stránkování, podmínky a ochranu retence.
- Testy zahrnují skutečný MCP JSON-RPC transport, nativní resource,
  přihlášené Pages forwardery a administraci. Modelový poskytovatel a
  schránka jsou nahrazeni izolovanými testovacími daty.
- `test/work-v2-ui-server.mjs` zpřístupní skutečné komponenty a handlery
  pouze na `127.0.0.1:4179`. Obsahuje syntetickou poštu a žádný produkční
  přístup. Slouží k ověření chování UI na šesti šířkách 320–1440 px,
  administrace a MCP aplikace v simulovaném hostiteli.
- Obsah PDF automaticky nečteme. Splnění dokumentové podmínky vyžaduje
  osobní ověření obsahu, správného odesílatele a znovunačteného otisku přílohy.
  Bezpečný náhled a automatické předávání PDF zůstávají samostatnou funkcí.
- Původní sedmivolací evaluace ani její odvolaný token se neopakují.
  Nový průchod v připojeném ChatGPT a přijetí pilotu mají vlastní
  rozsah a audit; nevyžadují další volání API. Úspěch fixtures není důkaz kvality extrakce.

Ověření 3. 10. 2026: úplná sada po doplnění ChatGPT 371 PASS / 0 FAIL / 1 úmyslně vynechaný
skutečný API test. Devět nových testů ověřuje nativní MCP postup, více než
20 podání bez API rozpočtu, opakování, expiraci, podvrh, změny podkladů a
identity, odvolání přístupu i souhlas změněný těsně při publikaci. Ani jeden
z těchto průchodů nepoužívá placený model. Jde o syntetická data, nikoli
ověření kvality skutečného ChatGPT výkladu.
Kontrola syntaxe 699 souborů, Pages build 49 rout a produkční Worker dry-run
prošly. Šířky 320, 375, 430, 768, 1024 a 1440 px byly ověřeny i s otevřenými
formuláři bez vodorovného přetékání. Přijetí výkladu zachovalo rozepsanou
odpověď; nativní přehled zobrazil stejnou práci a prošel otevřením, návratem
i obnovením. Poslední průchod aplikací a MCP přehledem byl bez chyb konzole.

Migrace prošla na izolované obnovené kopii skutečné databáze: zachováno
36 původních tabulek a jejich počty, přidáno 15 tabulek V2, integrita OK,
cizí klíče bez chyb. Protože D1 neumí přímý export FTS5, záloha obsahuje
export běžných tabulek a úplné schéma; fulltextový index byl v kopii
znovu sestaven z původních zpráv a prošel kontrolou shody obsahu.
Záloha obsahuje neveřejná data a není součástí repozitáře ani příloh PR.
Před nativní aktivací byl bez nového exportu ověřen také aktuální bod
obnovy Cloudflare D1 Time Travel. Přesná upravená migrace prošla znovu
na kopii již existující zálohy; všech 36 původních tabulek zůstalo beze změny.

## Nasazení a aktivace

Schválený produkční cíl má `MAIL_BRAIN_V2_ENABLED=true`,
`MAIL_BRAIN_V2_ANALYSIS_MODE=chatgpt`, `MAIL_BRAIN_V2_DAILY_CALL_LIMIT=0`
a `MAIL_BRAIN_PILOT_READ_ONLY=false`, pouze pro dosavadní pilotní schránku. Migrace `0013` pouze přidává tabulky,
indexy a ochrany neměnnosti; nepřevádí staré výklady na přijaté V2 povinnosti
a nepřiděluje nikomu novou pravomoc. Nasazení nejprve proběhne s dočasně vypnutou V2 a pouze čtecím pilotem;
teprve po nasazení podporujícího rozhraní se použije schválená konfigurace.
Běžný cron Mail Brain zůstává vypnutý. Nové konkrétní pravomoci se ukládají
samostatně pouze pro schválený účet.

1. Ověřit aktuální hlavní větev a CI. Zaznamenat bod obnovy Cloudflare D1
   Time Travel bez exportu dat; nad již existující soukromou zálohou
   znovu ověřit přesnou migraci a integritu. Poté aplikovat
   aditivní migraci do přesně určené produkční D1 a ověřit původní počty.
2. Nasadit Worker s vypnutou V2 a nulovým rozpočtem. Pages nasazovat výhradně
   projektovým `deploy:pages:production` z čisté hlavní větve. Zkontrolovat
   skutečné verze, dostupnost OAuth/MCP a chování původního pilotu.
3. Po schválení aktivace ponechat rozsah na existující pilotní schránce,
   ověřit aktuální souhlas a identitu. Výslovně přidělit konkrétní
   oprávnění konkrétnímu člověku; nerozšířit je na ostatní zaměstnance.
4. Zapnout V2 s režimem `chatgpt` a nulovým API rozpočtem. Ověřit, že sync
   i stará cesta `work_refresh` nevolají serverový model. V ChatGPT projít
   přípravu, odevzdání návrhů a jejich zpětné načtení. Limit počtu položek
   na stránce není denní limit vyhodnocování.
5. Porovnat skutečné zdrojové zprávy, uložené návrhy a výstup v SO.ai i MCP.
   Ověřit přijetí, osobní odložení, opravu a podmínku, následně číst stav
   zpět. Změny skutečných pracovních závazků musí potvrdit oprávněný člověk.
   Tento postup neopravňuje k odesílání e-mailů ani k rozšíření schránek.

Bezpečné pozastavení sdílených změn: ponechat V2 čtení, ponechat režim
`chatgpt` a nulový API rozpočet a zapnout `MAIL_BRAIN_PILOT_READ_ONLY`.
Tím se nezakazují neautoritativní návrhy z připojeného chatu; sdílenou
práci nelze bez příslušné lidské pravomoci měnit. Vypnutí V2 na novém kódu po již
publikované revizi vrátí `WORK_V2_PAUSED`, nikoli starou pravdu. Návrat ke
starému binárnímu kódu vyžaduje vypnutí celého Mail Brain, protože starý
kód tuto ochranu neobsahuje. Nové tabulky ani historii při návratu nemažeme.

Retence nepovažuje nové zprávy, neúplné vyhodnocení, otevřené podmínky,
nevyřešené návrhy nebo aktivní upozornění za uzavřený případ. Pro V2 je
nutné výslovné uzavření, kompletní aktuální projekce a uplynutí 365 dnů;
mazání je podmíněné nezměněnou revizí případu i projekce.
