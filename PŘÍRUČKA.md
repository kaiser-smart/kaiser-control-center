# PŘÍRUČKA PROJEKTU KAISER SMART / SMART ODPADY

## 1. Hlavní pravidlo

Tento soubor je hlavní pracovní příručka projektu a má přednost před běžným zadáním.

Pro každý modul je současně závazným provozním zdrojem pravdy jeho aktuální Mantra v repozitáři. `PŘÍRUČKA.md` určuje pracovní a bezpečnostní pravidla; Mantra určuje schválený účel, zařízení, datové zdroje, chování a provozní hranice konkrétního modulu. Vývojář nesmí Mantru nahradit vlastní domněnkou, obecnou best practice, podobným modulem ani externě dohledaným zařízením.

Pokud je zadání v rozporu s tímto souborem, zastav práci a upozorni na rozpor.

## Povinný pracovní postup Codexu / vývojáře

### Obecný kontrakt TEST režimu pro celé KSO

- TEST musí dovolit skutečně projít funkci; zakázané mají být jen produkční účinky.
- TEST používá stejnou aplikační, backendovou, validační, oprávněnostní a integrační logiku jako produkce, ale pracuje výhradně s izolovanými TEST daty a TEST identitou podle schváleného kontraktu modulu.
- Produkční účinek se v TESTU nesmí pouze vypnout tak, že funkci nelze dokončit. Musí být nahrazený bezpečným TEST adaptérem: odděleným TEST úložištěm, TEST auditem, simulovaným providerem, chráněným TEST příjemcem nebo jiným prokazatelně izolovaným výstupem.
- Produkční data, ostré trasy, Vistos, skutečné GPS body, skutečné absence a servisní záznamy, produkční vozidla, zákaznické kontakty, ostré e-maily, SMS, RCS, notifikace, platby a jiné vnější provozní účinky zůstávají bez výslovného schválení zakázané.
- Zakázaný produkční účinek nesmí zablokovat otestování formuláře, validace, oprávnění, výpočtu, hlasu, Promptu, Knowledge Base, Tools, navigační přípravy, potvrzení, zápisu do TEST auditu, chybové větve ani resetu.
- Text `Tato funkce zatím není v testovacím režimu dostupná.`, neaktivní tlačítko bez TEST adaptéru, hardcoded úspěch, mock vydávaný za skutečnou integraci nebo návrat `forbidden` jen proto, že jde o TEST, znamená otevřený nedodělek. Nesmí být vykázaný jako úspěšný test ani splněná akceptace.
- Každý TEST musí ověřit pozitivní funkční průchod i negativní bezpečnostní hranici: funkce v TESTU skutečně proběhne a současně se prokáže, že nevznikl produkční účinek.
- Závěrečný report každého TESTU musí samostatně uvést: co je funkční, kam se ukládají TEST výsledky, které produkční účinky jsou nahrazené, které funkce ještě nemají TEST adaptér a jaké akceptační kroky proto zůstávají nehotové.
- Kvůli průchodu TESTU je zakázané dočasně povolit produkční zápis, produkčního příjemce, ostrý secret nebo obejít backendové oprávnění.

### 1. Před zahájením práce

Před jakoukoli prací musí Codex/vývojář otevřít a přečíst:
- celou `PŘÍRUČKA.md`,
- aktuální Mantru každého modulu, kterého se práce týká,
- existující strojově čitelný provozní kontrakt daného modulu, pokud existuje.

Při jakékoli práci, která se týká Šarloty, ElevenLabs, hlasu, chatu, `intro_announcement`, dynamic variables, Tools, pracovního kontextu nebo správy jejího obsahu, musí Codex/vývojář před analýzou a úpravami navíc přečíst:
- celý skutečně aktivní system Prompt přesně toho produkčního ElevenLabs agenta, kterého se práce týká, načtený read-only z produkčního zdroje,
- celý obsah všech Knowledge Base dokumentů skutečně připojených k tomuto agentovi, načtený read-only z produkčního zdroje,
- kanonický repo prompt `src/sarlota/sarlotaSystemPrompt.js`,
- evidenci zdrojů `docs/SARLOTA_PROMPT_SOURCES.md`,
- všechny modulové Prompt a Knowledge Base podklady, na které evidence zdrojů pro dotčený modul odkazuje.

Nestačí přečíst název agenta, počet KB dokumentů, stav `AKTIVNÍ`, diagnostický přehled, uložený koncept ani starou lokální kopii. Musí být ověřená identita agenta a přečtený aktuální aktivní obsah Promptu i každého připojeného KB dokumentu. Koncept v KSO a aktivní obsah v ElevenLabs jsou dvě různé verze; pokud se práce týká editoru nebo publikace, musí vývojář načíst a porovnat obě.

Pokud aktuální aktivní Prompt nebo obsah některé připojené Knowledge Base nelze bezpečně načíst read-only, práce na Šarlotě se nesmí zahájit ani pokračovat. Vývojář musí zastavit, uvést přesně, co nebylo dostupné, a nesmí chybějící obsah nahradit domněnkou, starým exportem, lokálním návrhem ani mockem.

U Svozových tras je povinným zdrojem Mantry `src/data/collectionRoutesMantra.js` a strojově čitelným kontraktem `src/data/collectionRoutesOperationalContract.js`.

Bez přečtení Příručky, dotčené Mantry, existujícího kontraktu a u práce na Šarlotě také jejího aktuálního aktivního Promptu a všech připojených Knowledge Base se nesmí:
- analyzovat změna
- implementovat
- upravovat soubory
- měnit API
- měnit databáze
- měnit Cloudflare
- commitovat
- pushovat
- nasazovat

Pokud jsou Příručka, Mantra, kontrakt, zadání nebo stávající implementace v rozporu, práce se musí zastavit a rozpor se musí pravdivě pojmenovat. Vývojář nesmí zvolit jednu variantu potichu.

### 2. Návrh před implementací

Před implementací musí Codex/vývojář stručně a srozumitelně napsat návrh.

Návrh musí obsahovat:
- pochopení zadání
- přesný rozsah změny
- soubory, kterých se změna pravděpodobně dotkne
- zda se mění frontend
- zda se mění backend/API
- zda se mění databáze/migrace
- zda se mění Cloudflare/Workers/D1/R2/secrets
- zda se mění externí integrace
- rizika
- testovací plán

Po návrhu musí napsat:
`Čekám na potvrzení před implementací.`

Bez potvrzení Radima/Martina nesmí implementovat.

#### Bezpečný samostatný koridor po potvrzení

Pokud Radim/Martin po návrhu výslovně potvrdí konkrétní bezpečný cíl, například `souhlas`, `ano`, `pokračuj`, `uprav` nebo `nastav to`, může Codex/vývojář pokračovat samostatně v jednom logickém programovacím celku.

#### Význam potvrzení `ano`

Radimovo/Martinovo `ano` znamená potvrzení aktuálně navrženého nebo právě položeného kroku v daném kontextu.

Pokud Codex/vývojář čeká na potvrzení a Radim/Martin odpoví `ano`, bere se to jako:
- souhlasím,
- pokračuj,
- oprav,
- nastav,
- spusť povolené kontroly/testy/build,
- commitni,
- pushni,
- zveřejni/nasaď, pokud se Codex/vývojář ptal na zveřejnění nebo pokud je zveřejnění výslovnou součástí schváleného kroku.

Codex/vývojář se po `ano` nesmí znovu ptát na totéž potvrzení jinými slovy.

`Ano` ale samo o sobě neruší bezpečnostní zákazy této příručky. Pokud krok obsahuje DB/migrace, Cloudflare secrets/bindings, ostré odesílání datových zpráv/e-mailů/SMS, mazání produkčních dat, cron/automatizace/worker, hard reset nebo force push, musí být tato riziková akce v návrhu výslovně pojmenovaná a potvrzená.

Platí jen pro:
- read-only analýzu, diagnostiku a ověření,
- UI nebo textové úpravy bez změny oprávnění,
- frontend napojení na existující API bez změny API smlouvy,
- backend/API diagnostiku bez zápisu do produkčních dat,
- dokumentaci, verzi, changelog a build metadata,
- commit, push, deploy a ověření buildMeta, pokud prošly kontroly a repo obsahuje jen změny daného úkolu.

Podmínky:
- cíl a rozsah jsou schválené,
- nemění se DB/migrace,
- nemění se Cloudflare secrets/bindings ani citlivé proměnné,
- nevzniká zápis, mazání ani přepis produkčních/provozních dat,
- neposílají se SMS/e-maily ani jiné notifikace,
- nespouští se automatizace, cron, worker, queue ani ostré trasy,
- nemění se auth, role ani oprávnění,
- testy/build projdou,
- repo je před pushem čisté kromě vlastních změn Codexu/vývojáře.

Codex/vývojář musí zastavit a znovu chtít potvrzení, pokud narazí na:
- DB/migrace,
- Cloudflare secrets/bindings nebo citlivé proměnné,
- zápis, mazání nebo přepis produkčních/provozních dat,
- SMS/e-maily/notifikace,
- automatizace, cron, worker, queue nebo ostré trasy,
- auth, role nebo oprávnění,
- nejasný zdroj pravdy,
- konflikt v gitu nebo cizí necommitnuté změny,
- neprošlý test/build,
- rozpor s touto příručkou.

Mini návrh pro bezpečný koridor:

```text
Rozsah: read-only/UI/API diagnostika
Mění DB/secrets/produkční data: NE
Riziko: nízké
Test: git diff --check, syntax, build, buildMeta
Pokračuji samostatně v bezpečném koridoru.
```

### 3. Zákaz implementace naslepo

Codex/vývojář nesmí:
- implementovat bez návrhu
- měnit soubory bez potvrzení
- mazat soubory bez potvrzení
- měnit produkční data bez potvrzení
- měnit Cloudflare secrets bez potvrzení
- měnit DB/migrace bez potvrzení
- pushovat bez jasného ukončení práce
- nasazovat bez informace Radimovi/Martinovi

### 4. Kontrola před commitem

Těsně před každým commitem musí Codex/vývojář znovu otevřít `PŘÍRUČKA.md`.

Musí ověřit:
- že změny neporušují pravidla projektu
- že nejsou použita lokální úložiště jako databáze
- že nejsou v repozitáři secrets
- že nejsou commitnuté citlivé dokumenty
- že se neposílají e-maily/SMS z frontendu
- že backend/cloud/API zůstává zdroj pravdy
- že nebyly změněny zakázané části projektu
- že proběhl `git diff --check`

### 5. Povinný závěrečný report

Po dokončení práce musí Codex/vývojář napsat srozumitelný report.

Report musí obsahovat:

- `Hotovo / nehotovo`
- `Changed files`
- `Co bylo změněno`
- `Co bylo testováno`
- `Co nebylo testováno`
- `Build výsledek`
- `git diff --check výsledek`
- `Commit`
- `Branch`
- `Push`
- `Produkce`
- `Doporučený další krok`
- `Proč právě tento krok`
- `Předpoklady / blokace`
- `Typ dalšího kroku`
- `Potřebuje potvrzení Radima/Martina: ANO/NE`
- `Bezpečné pokračovat samostatně: ANO/NE`
- `Největší bezpečný programovací celek`
- `Co se nesmí dělat jako další krok`

U produkce musí být jasně uvedeno:

Pokud je zveřejněno:
- `Zveřejněno: ANO`
- URL produkce
- verze
- commit

Pokud není zveřejněno:
- `Zveřejněno: NE`
- důvod
- co je potřeba pro zveřejnění
- otázku `Mohu zveřejnit?`

### 6. Povinná formulace po ukončení

Na konci každé práce musí být věta:

`Zveřejněno: ANO/NE.`

A dále:

`Repo je čisté / Repo není čisté.`

Pokud repo není čisté, musí vypsat:
- změněné soubory
- nesledované soubory
- co s nimi doporučuje udělat

### 7. Produkce a nasazení

Codex/vývojář nesmí tvrdit, že je změna v produkci, pokud to neověřil.

Pokud produkci neověřil, musí napsat:
`Produkci jsem neověřil.`

Pokud produkci ověřil, musí napsat:
- URL
- verzi
- commit
- co přesně ověřil

Pokud Codex/vývojář práci dokončí bez zveřejnění, musí se vždy zeptat:
`Mohu zveřejnit?`

#### 7.1 Tvrdá ochrana produkčního Pages deploye

Produkční Cloudflare Pages deploy pro Kaiser Control Center se nesmí spouštět přímým příkazem:

```bash
wrangler pages deploy dist --project-name kaiser-control-center-legacy
```

Produkční deploy se smí spustit pouze přes projektový guard:

```bash
npm run deploy:pages:production
```

Guard musí povinně zastavit nasazení, pokud:
- aktuální větev není `main`,
- `HEAD` přesně neodpovídá `origin/main`,
- pracovní strom není před buildem čistý,
- nasazovaný commit neobsahuje chráněné commity modulu `Svozové trasy`,
- neprojde syntax check,
- neprojde test Tras svozu,
- neprojde build,
- `buildMeta` nemá správnou verzi, branch a commit,
- HTML pro `/trasy-svozu` nemá aktuální asset cache-buster.

Chráněné commity modulu `Svozové trasy`, které nesmí z produkce zmizet:
- `16074246` - automatický read-only Vistos snapshot,
- `322469e3` - ochrana posledního platného snapshotu,
- `1c309113` - internal Pages runner přes token.

Pokud je potřeba nasadit hotfix z jiné větve, musí se nejdřív převést do `main` tak, aby `origin/main` obsahoval i chráněné commity Tras svozu. Obcházet guard přímým deployem je zakázané.

### 8. Pravdivost

Codex/vývojář nesmí psát, že něco testoval, pokud to netestoval.

Musí rozlišovat:
- ověřeno
- neověřeno
- domněnka

### 9. Povinná kontrola provozní reality

Před každou implementací musí Codex/vývojář jasně rozlišit:
- UI / vzhled
- data
- backend/API
- databázi
- cloud běh / worker / cron
- oprávnění
- audit/log
- notifikace
- produkční nasazení
- co bez další fáze nebude fungovat

Codex/vývojář nesmí vytvořit dojem, že funkce funguje, pokud existuje pouze UI.

Před implementací musí v návrhu vždy odpovědět na otázky:
- Je to jen UI, nebo skutečně funkční proces?
- Kde budou data uložená?
- Existuje pro to DB tabulka?
- Existuje pro to API?
- Existuje backendová logika?
- Pokud je to automatizace, kde se spouští?
- Běží to v cloudu nezávisle na lokálním PC?
- Má to worker/cron/queue?
- Má to audit log?
- Má to log posledního běhu?
- Má to oprávnění ověřené backendem?
- Co se stane, když nikdo neotevře aplikaci?
- Co se stane, když frontend neběží?
- Co se stane, když API selže?
- Co bude fungovat po této fázi?
- Co nebude fungovat po této fázi?
- Jaká další fáze je nutná, aby to bylo opravdu ostré?

Každá nová funkce musí být v návrhu označená jedním z těchto stavů:

1. `UI návrh`
   - pouze vzhled
   - bez ostrých dat
   - bez backendu
   - bez produkční funkčnosti

2. `Read-only pilot`
   - zobrazuje data nebo návrhy
   - nic nemění
   - může být bez ostrého backendu
   - musí být jasně označený v UI

3. `Funkční přes API`
   - čte/zapisuje přes backend/API
   - data jsou v cloud DB
   - oprávnění ověřuje backend

4. `Cloud automatizace`
   - běží sama v cloudu
   - má worker/cron/queue
   - má log běhů
   - nezávisí na lokálním PC ani browseru

5. `Produkčně ověřeno`
   - nasazeno
   - ověřeno na produkci
   - jasně uvedená URL/verze/commit/buildMeta

Zakázané formulace bez upřesnění:
- `hotovo`
- `automatizace hotová`
- `funguje`
- `napojeno`
- `připraveno`
- `běží`

Pokud Codex/vývojář tyto formulace použije, musí vždy dodat:
- v jakém rozsahu
- zda jde o UI, API, DB, cloud runner nebo produkční stav
- co ještě nefunguje
- co je neověřené

Povinný závěrečný report musí obsahovat:

#### Stav funkce
- UI návrh: ANO/NE
- Read-only pilot: ANO/NE
- Funkční přes API: ANO/NE
- Cloud automatizace: ANO/NE
- Produkčně ověřeno: ANO/NE

#### Co opravdu funguje
Konkrétní seznam ověřených částí.

#### Co zatím nefunguje
Konkrétní seznam chybějících nebo neověřených částí.

#### Na čem je to závislé
Například:
- cloud DB
- API
- worker
- cron
- secrets
- oprávnění
- ruční spuštění
- OTP
- produkční binding

#### Riziko falešného dojmu
Codex/vývojář musí výslovně napsat, zda hrozí, že UI vypadá jako hotová funkce, ale ve skutečnosti ještě nemá backend/cloud část.

#### Doporučený další krok
Každý report musí obsahovat:
- Doporučený další krok
- Proč právě tento krok
- Předpoklady / blokace
- Typ dalšího kroku: implementace / test / nasazení / analýza / oprava / čekání na data
- Potřebuje potvrzení Radima/Martina: ANO/NE
- Bezpečné pokračovat samostatně: ANO/NE
- Největší bezpečný programovací celek
- Co se nesmí dělat jako další krok

Příklad správného reportu:

```text
Záložka je hotová pouze jako read-only pilot. Nejde o ostré automatizace. Automatizace se zatím nikde nespouští. Neexistuje cloud runner ani cron. Pro produkční funkčnost je potřeba Fáze 2.
```

Příklad špatného reportu:

```text
Automatizace hotové.
```

### 10. Povinná otázka u automatizací

Kdykoli zadání obsahuje slovo nebo význam:
- automatizace
- automaticky
- hlídat
- upozornit
- připomenout
- poslat e-mail
- poslat SMS
- pravidelně
- denně
- po termínu
- za 24 hodin

Codex/vývojář musí před implementací odpovědět:

1. Kde přesně se to bude spouštět?
2. Je to cloud, backend, worker, cron, queue, nebo frontend?
3. Poběží to bez otevřeného PC / bez otevřené aplikace / bez lokálního běhu vývojáře?
4. Poběží to, když nikdo nemá otevřenou aplikaci?
5. Kde se uloží výsledek běhu?
6. Jak zabrání duplicitám?
7. Jak pozná poslední běh?
8. Kde je audit/log?
9. Kdo má oprávnění to měnit?
10. Co se stane při chybě?
11. Co je pouze návrh a co je ostrá automatizace?

Pokud automatizace neběží v cloudu, nesmí se označit jako hotová automatizace.

Pokud chybí worker/cron/queue nebo jiný cloudový runner, musí být funkce označená jako nehotová, `UI návrh`, `Read-only pilot` nebo návrh další fáze.

Zakázané:
- neoznačit UI pilot jako nehotovou nebo omezenou funkci
- nazvat automatizací něco, co běží jen ve frontendu
- tvrdit `funguje`, pokud funguje jen vizuální část
- tvrdit `hotovo`, pokud chybí DB/API/cloud runner
- skrýt omezení do poznámky na konec
- nechat Radima/Martina domýšlet technické dopady
- implementovat bez vysvětlení, co nebude fungovat

### 11. Povinný návrh dalšího kroku a práce ve větších bezpečných celcích

Po každém dokončeném úkolu, kroku, fázi, testu, nasazení nebo závěrečném reportu musí Codex/vývojář uvést jasný návrh dalšího postupu.

Codex/vývojář nesmí skončit pouze reportem typu `hotovo/nehotovo` bez doporučení, co má následovat.

Pokud se Radim/Martin zeptá `co dál`, `další krok`, `dle checklistu`, `pokračujme podle checklistu` nebo podobně, musí Codex/vývojář odpovědět nejdřív konkrétním doporučeným dalším krokem, ne obecným shrnutím. Odpověď musí říct, zda jde o implementaci, test, nasazení, analýzu, opravu nebo čekání, a zda krok potřebuje potvrzení.

Codex/vývojář musí další krok navrhnout vždy i v krátké odpovědi mimo závěrečný report, pokud právě dokončil práci, ověřil produkci, našel blokaci nebo předává řízení zpět Radimovi/Martinovi.

Povinný návrh dalšího kroku musí obsahovat:

1. Doporučený další krok
2. Proč je to další krok
3. Co je před tím potřeba ověřit nebo dodat
4. Zda se má pokračovat implementací, testem, nasazením, analýzou, opravou nebo čekáním
5. Zda je potřeba potvrzení Radima/Martina
6. Co se nesmí dělat jako další krok
7. Zda je další krok bezpečný pro samostatné pokračování
8. Jaký největší bezpečný programovací celek lze udělat najednou

Povinná formulace v reportu:

```text
Doporučený další krok:
...
Proč:
...
Předpoklady / blokace:
...
Typ dalšího kroku:
implementace / test / nasazení / analýza / oprava / čekání na data
Potřebuje potvrzení Radima/Martina: ANO/NE
Bezpečné pokračovat samostatně: ANO/NE
Největší bezpečný programovací celek:
...
Nesmí se teď dělat:
...
```

Návrh dalšího kroku nesmí automaticky znamenat povolení pokračovat.

Výjimkou z opakovaného čekání je bezpečný samostatný koridor z části `2. Návrh před implementací`, pokud Radim/Martin už potvrdil konkrétní bezpečný cíl a nejsou splněné žádné stop signály.

Pokud další krok mění API, DB, Cloudflare, secrets, produkční data, provozní data, oprávnění, notifikace nebo automatizace, musí Codex/vývojář vyžadovat potvrzení Radima/Martina.

Pokud další krok znamená pouze bezpečnou implementaci už schváleného rozsahu, bez destruktivních změn, bez zásahu do secrets, bez ostrých dat a bez rizika ztráty dat, má Codex/vývojář pokračovat samostatně v co největším logickém programovacím celku.

Codex/vývojář se nemá ptát na každý malý technický krok, pokud už je schválený cíl, rozsah a bezpečnostní mantinely.

Codex/vývojář musí zastavit a chtít potvrzení, pokud narazí na:
- riziko ztráty dat,
- změnu produkčních dat,
- změnu secrets,
- změnu Cloudflare/D1/R2/Workers,
- nejasný zdroj pravdy,
- zásah do cizí práce nebo necommitnutých změn,
- konflikt s `PŘÍRUČKA.md`,
- potřebu bezpečnostního nebo provozního rozhodnutí.

Pokud je další krok jen čtení, analýza, bezpečné ověření, UI úprava nebo implementace v rámci schváleného rozsahu, může být označený jako bezpečný pokračovací krok.

Pokud existuje riziko falešného dojmu hotové funkce, musí být UI i report jasně označený podle stavů:
- `UI návrh`
- `Read-only pilot`
- `Funkční přes API`
- `Cloud automatizace`
- `Produkčně ověřeno`

Příklad správného dalšího kroku:

```text
Doporučený další krok:
Implementovat Fázi 1C – ruční import preview JSON/CSV.
Proč:
Nečekáme na Vistos API a potřebujeme začít pracovat s reálnou strukturou dat.
Předpoklady / blokace:
Není potřeba secret ani ostré Vistos API. Import preview nesmí vytvářet ostré trasy.
Typ dalšího kroku:
implementace
Potřebuje potvrzení Radima/Martina: ANO, protože vzniká nové API a případně migrace.
Bezpečné pokračovat samostatně: ANO po potvrzení rozsahu.
Největší bezpečný programovací celek:
Frontend upload + backend parser + pilotní uložení batch/rows/issues + UI náhled + základní testy.
Nesmí se teď dělat:
Ostré trasy, SMS/e-maily, T-Cars alerty, Waze/Apify, Evidence odpadů, cloud automatizace.
```

Příklad špatného reportu:

```text
Hotovo. Co dál?
```

Nebo:

```text
Další krok je něco otestovat.
```

### 12. Svozové trasy: zákaz odstraňování pracovních funkcí při úklidu dat

Při úklidu dat, změně zdroje dat nebo přepnutí toku v modulu `Svozové trasy` se nesmí jako vedlejší efekt odstranit, schovat nebo rozpojit pracovní funkce trasy:
- `Řidičský tablet`
- `Tisk pro řidiče`
- `Detailní PDF` / PDF trasy
- `Offline balíček`
- filtr dne, týdne, odpadu a stavu
- rozklik detailu položek smlouvy

Úklid dat znamená odstranit nebo přesunout matoucí datové bloky, ne odstranit uživatelské ovládání trasy.

Pokud má být některá z těchto funkcí odstraněna nebo schována, musí to být výslovně pojmenováno v návrhu a potvrzeno Radimem/Martinem.

Adresní a provozní pole se nesmí zaměňovat:
- `Adresní místo` smí zobrazovat pouze skutečné pole Adresní místo z Vistosu.
- `Stanoviště` smí být pouze ve vlastním sloupci Stanoviště.
- `Svozová/nakládková adresa` je samostatný kontrolní údaj a nesmí se potichu vydávat za Adresní místo.
- Provozní svozová adresa pro trasu se primárně skládá ze skutečného `Adresní místo`; technické části `Svozová adresa - ulice/město/PSČ` jsou jen pomocný rozpad a nesmí přebít správné Adresní místo.
- Pokud skutečné Adresní místo chybí, Smart musí ukázat chybu k opravě, ne doplnit náhradu z jiného pole.

### 12.1 Řidičský displej a oprávnění role Řidič

- Závazné referenční zařízení je výhradně `Blackview Active 7 LTE`, 11″, Android 15, na šířku; fyzické rozlišení `1920 × 1200`, poměr `16:10` a akceptační viewport `960 × 600 CSS px`. Samsung ani obecný 11palcový tablet nesmí být použit jako náhrada bez předchozí výslovné změny Mantry potvrzené Radimem/Martinem.
- Aktivní uživatel s rolí `Řidič` se po přihlášení i při pokusu otevřít jiný interní modul vždy vrací přímo na `/trasy-svozu`.
- Řidič nesmí vidět HP, postranní menu, administraci, Mantru, TEST management ani dispečerský pohled Svozových tras.
- Řidičský displej je na tabletu jediná uzamčená pracovní obrazovka bez hlavního posouvání; vyskakovací hlášení a přehled celé trasy mají vlastní posun a zřetelné zavření.
- Hlavní pracovní plocha obsahuje aktuální stanoviště, adresu, odpad a nádoby, poznámku, read-only HERE mapu, stav trasy, Šarlotu a velké akce `HOTOVO`, `HLÁŠENÍ PRO DISPEČINK`, `MUSÍM JET VYSYPAT`, `PŘESTÁVKA` a `CELÁ TRASA`.
- Přístup se nesmí řídit jménem řidiče. Backend vždy porovnává stabilní ID přihlášeného uživatele s `driver_user_id` denní trasy.
- Oprávnění `collection-routes:view` dává řidiči pouze vstup do vlastního Řidičského displeje. Nesmí otevřít seznam tras, dispečerskou správu ani trasu jiného řidiče ani přes přímé API URL.
- Role Management, Admin a Dispečer si zachovávají svůj dosavadní pracovní pohled; nesmějí být přesměrovány do řidičského kiosku.

## 2. Ukládání dat

Aplikace běží a ukládá data pouze přes cloud / API.

Provozní data se nesmí ukládat lokálně.

Zakázané:
- localStorage
- sessionStorage
- IndexedDB
- browser cache jako databáze
- mock databáze v produkci
- hardcoded provozní data v komponentách

Provozní data musí jít přes API / backend / cloud databázi.

## Log událostí

Každý nový modul musí mít v Nastavení povinný blok „Log událostí“.

Log událostí ukazuje pravdivý provozní stav modulu:
- co skutečně běží,
- co je ověřené,
- co je vypnuté,
- co je jen návrh,
- co je dry-run,
- co selhalo,
- co čeká na ověření.

Log událostí nesmí být marketingový popis. Musí být pravdivý provozní stav.

Pokud funkce není ověřená, nesmí být označená jako běžící.
Pokud funkce nic neposílá mimo systém, musí to být jasně napsané.
Pokud je funkce jen návrh, musí být označená jako „jen návrh“.
Pokud je modul v pilotu, musí být označený jako pilot / dry-run.

Log událostí patří do:
Nastavení → Log událostí

Technické podrobnosti patří pouze do rozbalené části:
Zobrazit diagnostiku

Každý Log událostí musí minimálně obsahovat:
- pravdivý provozní stav,
- stav hlavních funkcí,
- stav napojení,
- stav automatizace,
- stav odesílání mimo systém,
- poslední události,
- případné chyby,
- rozbalenou diagnostiku.

Cíl:
Uživatel musí vždy vědět, co modul opravdu dělá a co se pouze tváří jako připravené.

## Povinná záložka v každém modulu: Seznam pravidel a automatizace

Každý modul v Kaiser Smart / Smart odpady musí mít samostatnou záložku:

```text
Seznam pravidel a automatizace
```

Záložka musí obsahovat:
- seznam pravidel platných pro daný modul,
- seznam automatizací platných pro daný modul,
- vyhledávací pole,
- filtrování podle typu,
- filtrování podle stavu,
- informaci, zda je pravidlo nebo automatizace aktivní,
- informaci, kdo pravidlo vytvořil,
- informaci, kdy bylo pravidlo vytvořeno,
- informaci, kdo pravidlo naposledy upravil,
- informaci, kdy bylo pravidlo naposledy upraveno,
- popis dopadu pravidla nebo automatizace,
- audit změn.

Admin / management / oprávněný správce modulu musí mít možnost:
- pravidlo vytvořit,
- pravidlo upravit,
- pravidlo deaktivovat,
- pravidlo znovu aktivovat,
- automatizaci vytvořit,
- automatizaci upravit,
- automatizaci deaktivovat,
- automatizaci znovu aktivovat,
- zobrazit historii změn.

Běžný uživatel může pravidla a automatizace pouze číst, pokud mu to dovoluje oprávnění modulu.

Automatizace:
- musí běžet v cloudu,
- nesmí záviset na lokálním PC,
- nesmí záviset na otevřeném prohlížeči,
- nesmí záviset na lokálním běhu vývojáře,
- nesmí záviset na `localStorage`, `sessionStorage` ani `IndexedDB`,
- musí být spouštěna backendem, workerem, cronem, queue nebo jinou cloudovou službou,
- musí být auditovatelná,
- musí mít log posledního běhu,
- musí mít stav posledního běhu,
- musí mít čas dalšího běhu, pokud je plánovaná,
- musí mít bezpečné ošetření chyb,
- musí zabránit duplicitnímu spuštění, pokud by duplicitní běh mohl způsobit škodu.

Zakázané:
- automatizace spuštěné pouze ve frontendu,
- automatizace závislé na lokálním PC,
- automatizace závislé na otevřeném browseru,
- ukládání pravidel nebo automatizací do `localStorage`, `sessionStorage` nebo `IndexedDB`,
- mock/runtime produkční pravidla,
- skryté automatizace bez záznamu v seznamu,
- změny pravidel bez audit logu,
- posílání e-mailů/SMS z frontendu,
- provádění citlivých akcí bez backendového ověření oprávnění.

Doporučené sloupce v seznamu:
- Název,
- Typ: pravidlo / automatizace,
- Modul,
- Stav: aktivní / neaktivní / návrh / chyba,
- Spouštění: ručně / časově / událostí / webhookem,
- Poslední běh,
- Další běh,
- Vytvořil,
- Upravil,
- Dopad,
- Akce.

Vyhledávání musí hledat minimálně v:
- názvu,
- popisu,
- modulu,
- typu,
- stavu,
- autorovi,
- poznámce.

Detail pravidla / automatizace musí obsahovat:
- název,
- modul,
- typ,
- popis,
- podmínky,
- akce,
- oprávnění,
- stav,
- historii změn,
- poslední běh,
- další běh,
- log posledních běhů,
- poznámku,
- bezpečnostní dopad.

Doporučený jednotný datový model:

```text
module_rules
- id
- moduleKey
- title
- description
- type
- status
- conditionsJson
- actionsJson
- isAutomation
- triggerType
- scheduleCron
- eventName
- cloudRunner
- lastRunAt
- nextRunAt
- lastRunStatus
- lastRunMessage
- createdByUserId
- createdAt
- updatedByUserId
- updatedAt

module_rule_audit_log
- id
- ruleId
- moduleKey
- action
- changedByUserId
- changedAt
- beforeJson
- afterJson
- note

module_automation_runs
- id
- ruleId
- moduleKey
- startedAt
- finishedAt
- status
- message
- errorCode
- triggeredBy
- dedupeKey
```

Doporučené API:
- `GET /api/modules/:moduleKey/rules`,
- `GET /api/modules/:moduleKey/rules/:id`,
- `POST /api/modules/:moduleKey/rules`,
- `PATCH /api/modules/:moduleKey/rules/:id`,
- `POST /api/modules/:moduleKey/rules/:id/activate`,
- `POST /api/modules/:moduleKey/rules/:id/deactivate`,
- `GET /api/modules/:moduleKey/rules/:id/audit`,
- `GET /api/modules/:moduleKey/automation-runs`.

Cloudové spouštění automatizací:
- preferovat Cloudflare Workers,
- Cloudflare Cron Triggers,
- queue / scheduled worker,
- backend job,
- jinou cloudovou službu pouze pokud je schválená jako zdroj pravdy projektu.

Automatizace nesmí být:
- `setInterval` ve frontendu,
- timeout v prohlížeči,
- závislá na přihlášeném uživateli,
- závislá na otevřeném PC,
- závislá na lokálním běhu.

Nejdřív vždy vytvořit společný komponent / pattern, společné API a pilotní modul. Neimplementovat záložku plošně do všech modulů bez schváleného pilotu.

## 3. Veřejná adresa aplikace

Veřejná adresa aplikace je:

https://smart-odpady.ai/

Dočasná záložní adresa během řízeného přechodu:

https://kaiser-control-center.pages.dev/

Veřejná adresa evidence Pneumatiky je:

https://kaiser-smart.github.io/kaiser-pneu-evidence/

## 4. Verze aplikace

Při každé významné změně:
- změň verzi aplikace,
- zaznamenej změnu,
- aktualizuj box Verze / Záloha na HP.

Na HP musí být vidět:
- aktuální verze,
- poslední změna,
- datum změny,
- stav aplikace.

## 5. Responzivita

Responzivita je povinná.

Kontrolovat minimálně:
- mobil
- tablet
- desktop

Minimální šířky:
- 320 px
- 375 px
- 430 px
- 768 px
- 1024 px
- 1440 px

Nesmí vznikat:
- bílé obrazovky,
- horizontální přetékání,
- nečitelné tabulky,
- tlačítka mimo obrazovku,
- rozbité mobilní menu.

### Povinné barevné schéma, písmo a čitelnost modulů

Při vývoji každého modulu je nutné respektovat barevné schéma z Nastavení aplikace.

Moduly mají používat existující theme proměnné / `module-theme-scope` a hlavní firemní barvy z nastavení. Nový modul nesmí zavádět náhodnou vlastní paletu, pokud to Radim/Martin výslovně neschválí.

Výchozí font Kaiser Control Center je Quicksand.

Quicksand se nesmí přetěžovat tučným řezem. Tučné písmo používat jen pro:
- hlavní nadpisy,
- krátké štítky,
- důležitý status,
- primární akce.

Netučné nebo jen lehce zvýrazněné mají být:
- vysvětlující texty pod nadpisy,
- popisy karet,
- odstavce typu provozní realita / chráněné čtecí API,
- tabulkové řádky s provozními daty,
- data přijatých a odeslaných zpráv.

Správný vzor:

```text
Provozní realita
Rozpad na fáze a cílové cloudové části, aby UI nevypadalo jako ostré ISDS napojení.

Chráněné čtecí API
Frontend čte stav, metadata zpráv a log běhů přes backend. Data jsou pouze v D1, pokud je binding a migrace v produkci hotová.
```

Nadpis může být tučný. Popis pod ním má být netučný a čitelný.

V Datové schránce jsou firemní boxy samostatné chlívky. Po kliknutí na konkrétní schránku, například `KS`, musí uživatel zůstat čistě v kontextu této jedné DS. Nemá zůstat v nejasném pohledu všech boxů, pokud je vybraná jedna schránka.

## 6. GitHub

Hlavní firemní GitHub organizace je:

```text
kaiser-smart
```

Kaiser repozitáře:

```text
https://github.com/kaiser-smart/kaiser-control-center.git
https://github.com/kaiser-smart/kaiser-pneu-evidence.git
```

Nanolab / Shoptet repozitáře ve stejné organizaci:

```text
https://github.com/kaiser-smart/prostuduj-shoptet-vs-nanolab-cz-a.git
https://github.com/kaiser-smart/nanolab-shoptet-blog-automat.git
```

Radim i Martin jsou vlastníci organizace `kaiser-smart`.

Osobní účet `oplustil-prog` už není hlavní zdroj pravdy pro pracovní repozitáře.

Staré GitHub adresy mohou dočasně fungovat přes redirect, ale pro novou práci se musí používat adresy v `kaiser-smart`.

Důležité rozlišení:
- `kaiser-smart` je GitHub organizace / owner repozitáře, ne přihlašovací účet.
- GitHub CLI se přihlašuje osobním GitHub účtem.
- Osobní účet musí mít práva k organizaci `kaiser-smart` a konkrétnímu repozitáři.
- Nestačí být přihlášený do GitHubu obecně; před pushem je nutné ověřit právo k repozitáři.

Po přesunu repozitáře nebo změně ownera vždy ověř:
- lokální `origin`,
- GitHub práva,
- napojení Cloudflare Pages / GitHub Pages,
- produkční deploy po dalším bezpečném commitu.

Přes jaký nástroj / příkaz se data posílají do GitHubu:

Přes Git příkazem:

```bash
git push origin <nazev-vetve>
```

Povinný bezpečný postup při problému s GitHub přihlášením / pushem:

```bash
git remote -v
git status --short --branch
gh auth status
gh auth login --hostname github.com --git-protocol https --web --scopes repo
gh auth setup-git
gh repo view kaiser-smart/kaiser-control-center --json nameWithOwner,viewerPermission
```

Pokračovat v pushi je dovoleno jen pokud:
- `origin` míří na `https://github.com/kaiser-smart/kaiser-control-center.git`,
- `gh auth status` ukazuje přihlášený osobní účet,
- `gh repo view ... viewerPermission` vrací `WRITE`, `MAINTAIN` nebo `ADMIN`.

Pokud se při přihlášení otevře špatný osobní účet, neautorizovat ho naslepo. Nejdřív se v GitHubu odhlásit / přepnout účet a přihlášení spustit znovu.

Zakázané při GitHub přihlášení:
- nevkládat GitHub token do chatu,
- nevkládat GitHub token do shell příkazu,
- nevkládat token do remote URL,
- neukládat token, heslo ani cookie do repozitáře,
- nepoužívat `oplustil-prog` jako owner repozitáře Kaiser Smart,
- nepoužívat `git push --force`, pokud to Radim/Martin výslovně neschválili,
- nepřepisovat lokálně divergentní `main` bez zálohy.

Pokud lokální `main` obsahuje vlastní commit, který není na `origin/main`, nejdřív vytvořit záložní větev, například:

```bash
git branch backup/local-main-<sha>
```

Až potom řešit sladění s `origin/main`.

Produkční větev / nasazení po úspěšném ověření posílej automaticky.

Automatické nasazení platí, pokud:
- build prošel,
- ověření v prohlížeči prošlo,
- nejsou chyby v konzoli,
- není zjištěné riziko ztráty dat,
- změna nevyžaduje tajný token, heslo nebo bezpečnostní rozhodnutí,
- Radim výslovně neřekl, že se nasazovat nemá.

Pokud automatické nasazení není bezpečné nebo není úplně ověřené, napiš Radimovi přesně:

```text
Mohu nasadit...?
```

a stručně doplň důvod, proč je potřeba potvrzení.

Po nasazení proveď automaticky i navazující produkční kroky, které jsou nutné pro funkčnost nasazené změny:
- vytvoření nebo nastavení Cloudflare D1 / KV / R2,
- spuštění databázové migrace,
- přidání Pages bindingu,
- nastavení běžných ne-tajných produkčních proměnných,
- ověření ostré URL v prohlížeči.

Nečekej na samostatné potvrzení pro každý technický krok, pokud je krok bezpečný a navazuje na ověřené nasazení.

Zastav se pouze tehdy, když:
- chybí oprávnění,
- chybí tajný token nebo heslo,
- krok může smazat nebo přepsat produkční data,
- není jasné, která produkční služba je zdroj pravdy,
- Cloudflare / GitHub vyžaduje ruční potvrzení vlastníka účtu.

### Bezpečné předávání hesel a Cloudflare secrets

Pokud je potřeba nastavit heslo, token nebo jiný secret:
- nikdy ho nevkládat do chatu,
- nikdy ho nevkládat přímo do shell příkazu,
- nikdy ho neukládat do repozitáře, `.env` souboru nebo logu,
- nepoužívat hromadný `.env` import, pokud není opravdu nutný a předem schválený,
- preferovat ukládání po jednom přes `wrangler pages secret put <NAME> --project-name <PROJECT>`,
- hodnotu zadá Radim/Martin do skrytého macOS dialogu nebo interaktivního promptu,
- Codex smí ve výstupu ukázat pouze název secretu a potvrzení uložení, nikdy hodnotu,
- po uložení ověřit jen seznam názvů přes `wrangler pages secret list`,
- po změně Cloudflare Pages secrets udělat redeploy produkce,
- po redeploy ověřit `buildMeta` a relevantní chráněné endpointy.

Bezpečný vzor pro více secrets:

```text
1. Codex připraví přesný seznam názvů secrets.
2. Radim/Martin potvrdí změnu secrets.
3. Codex spustí ukládání po jednom.
4. Pro každý secret vyskočí skrytý dialog / prompt.
5. Radim/Martin vloží hodnotu mimo chat.
6. Codex ověří pouze název secretu jako uložený.
7. Po všech secrets Codex spustí redeploy.
8. Codex ověří produkci.
```

Pokud se Cloudflare UI chová nespolehlivě, nepokračovat opakováním stejného formuláře. Přepnout na výše uvedený CLI postup.

## 7. Na projektu pracují

Na projektu pracují:
- Radim
- Martin

Nepřepisuj cizí necommitnuté změny.

Pokud existují cizí změny, zastav se a upozorni.

## 8. Samostatnost

Pracuj samostatně.

Nečekej na potvrzení u každého drobného kroku, pokud zadání není nejasné.

Po potvrzení bezpečného cíle používej bezpečný samostatný koridor z části `2. Návrh před implementací` a dokonči celý ověřitelný celek včetně testů, commitu, pushe a ověření produkční buildMeta, pokud to rozsah umožňuje.

Zastav se pouze když:
- hrozí ztráta dat,
- zadání je v rozporu s tímto souborem,
- chybí API,
- změna vyžaduje bezpečnostní rozhodnutí,
- může dojít k rozbití funkční části aplikace,
- není jasné, co má být zdroj pravdy.

## 9. Myslet dopředu

Při každé změně mysli minimálně 15 kroků dopředu.

Před implementací zvaž:
- dopad na API,
- dopad na ukládání dat,
- dopad na práva,
- dopad na responzivitu,
- dopad na ostatní moduly,
- dopad na build,
- dopad na budoucí rozšiřování,
- riziko bílé obrazovky,
- riziko nefunkčních tlačítek,
- riziko ztráty dat.

## 10. Když je zadání špatně

Pokud Radim nebo Martin zadá špatný, nebezpečný nebo nelogický pokyn, neboj se ozvat.

Neprováděj slepě pokyn, který:
- porušuje tento soubor,
- ukládá data lokálně,
- obchází API,
- rozbíjí bezpečnost,
- rozbíjí responzivitu,
- vrací hotové věci zpět,
- přidává tokeny do frontendu,
- může způsobit ztrátu dat.

Napiš stručně:
- co je problém,
- proč je to problém,
- jaké je bezpečné řešení.

## 11. Pokud si nejsi jistý

Pokud si nejsi jistý:
- nehádej,
- nevymýšlej si,
- nezaváděj hacky,
- neukládej data lokálně,
- nezjednodušuj bezpečnost,
- zastav se a napiš otázku.

## 12. Ochrana neuložených změn

Aplikace nesmí dovolit ztrátu neuložených změn bez potvrzení uživatele.

Každý editační formulář musí:
- detekovat neuložené změny,
- upozornit při odchodu,
- nabídnout Uložit a odejít,
- nabídnout Odejít bez uložení,
- nabídnout Zůstat na stránce,
- ukládat pouze přes cloud API,
- při chybě uložení zůstat na stránce.

Zakázané:
- opustit stránku bez varování,
- zahodit změny potichu,
- předstírat uložení bez API,
- ukládat provozní data lokálně.

## 13. Obrázky, SVG a grafické assety

Codex nesmí sám generovat finální obrázky, loga, ilustrace, SVG ikony ani jiné grafické assety pro produkční použití.

Pokud úprava vyžaduje obrázek, SVG, logo, ikonu, ilustraci, pozadí nebo jiný grafický asset, Codex se musí zastavit a vyžádat si podklad od Radima nebo Martina.

Codex může:
- připravit přesné zadání pro grafiku,
- popsat potřebné rozměry,
- popsat formát souboru,
- navrhnout název souboru,
- připravit místo v kódu pro vložení assetu,
- použít dočasný placeholder jasně označený jako placeholder.

Codex nesmí:
- vymýšlet finální logo,
- generovat finální SVG ikony,
- kreslit finální ilustrace,
- vytvářet produkční obrázky,
- používat náhodné externí obrázky,
- stahovat grafiku z internetu bez potvrzení,
- nahrazovat schválený design vlastním návrhem.

Povolené dočasné řešení:
- placeholder bez produkčního významu,
- jednoduchý box s textem `Čeká na grafiku`,
- dočasná ikona pouze pokud je jasně označená jako placeholder.

Pravidlo:
Finální grafické assety dodává Radim nebo Martin.

Pokud asset chybí, Codex má napsat:
`Chybí grafický podklad. Prosím dodat obrázek/SVG od Radima nebo Martina.`

## 14. Ověření produkčních notifikací

### 14.1 Povinná schválená grafika e-mailů

- Každý e-mail odesílaný z KSO musí použít schválený kanonický vzor ze `src/email-templates/baseEmailTemplate.html` nebo serverový renderer, který je s tímto vzorem prokazatelně graficky shodný.
- Schválený vzhled tvoří zelené logo `kaiser.`, bílá karta s maximální šířkou 640 px, schválené barvy, písmo Quicksand s bezpečným fallbackem, inline styly a responzivní sazba pro mobilní zobrazení.
- Modul nesmí vytvářet vlastní provizorní grafiku e-mailu, barevný rám, tmavý testovací pruh ani jinou odchylku od schváleného vzoru.
- Pokud schválená šablona nebo její serverový renderer není dostupný, e-mail se nesmí odeslat v náhradní grafice. Systém musí odeslání bezpečně zastavit a zobrazit chybu.
- Novou grafickou variantu lze nasadit pouze po výslovném schválení Radimem nebo Martinem a po úpravě kanonického vzoru; teprve potom ji smějí převzít jednotlivé moduly.

Pokud Radim zadá nastavení nebo opravu odesílání e-mailů / SMS a zároveň požádá o odeslání, Codex má po nastavení provést jeden kontrolní ostrý test přes existující produkční API / backend aplikace.

Kontrolní test musí:
- jít přes stejné produkční flow jako běžná zpráva,
- být jasně rozpoznatelný jako test, pokud aplikace umožňuje poznámku nebo popis,
- být ověřený v Reportech / Notifikacích podle stavu odeslání,
- nepoužívat lokální úložiště, mock data ani obejití backendu,
- nezapisovat tajné tokeny do kódu, frontendu ani lokálních souborů.

Codex se má zastavit pouze tehdy, když:
- chybí přihlášení nebo oprávnění,
- chybí tajný token / heslo,
- není jasný příjemce nebo zdroj pravdy,
- test může smazat, přepsat nebo poškodit produkční data,
- odeslání vyžaduje bezpečnostní rozhodnutí mimo už daný pokyn Radima.

## 15. Souběžná práce Radim / Martin / Codex

Na projektu může současně pracovat více lidí nebo více Codex vláken.

Tato pravidla platí stejně pro Radima, Martina i všechna Codex vlákna.

Radim a Martin mají v GitHub organizaci roli `Owner`.

Vyšší práva neznamenají obcházení pravidel v tomto souboru. I Owner musí před změnou ověřit stav repozitáře a nezasahovat do rozpracované práce druhého.

Zdroj pravdy pro GitHub je organizace:

```text
kaiser-smart
```

Před prací ověř, že lokální `origin` míří na správný repozitář v `kaiser-smart`.

Správné remotes:

```text
Kaiser Control Center:
https://github.com/kaiser-smart/kaiser-control-center.git

Pneumatiky:
https://github.com/kaiser-smart/kaiser-pneu-evidence.git

Nanolab / Shoptet:
https://github.com/kaiser-smart/prostuduj-shoptet-vs-nanolab-cz-a.git
https://github.com/kaiser-smart/nanolab-shoptet-blog-automat.git
```

Před každou prací musí Codex:
- přečíst `PŘÍRUČKA.md`,
- spustit `git status --short --branch`,
- ověřit, zda existují necommitnuté změny.

Před každou prací musí Radim i Martin:
- načíst aktuální stav z GitHubu,
- ověřit aktuální větev,
- ověřit, že nezačínají práci nad cizími necommitnutými změnami,
- u většího úkolu založit samostatnou větev.

Pokud existují necommitnuté změny:
- Codex nesmí předpokládat, že jsou jeho,
- nesmí je přepisovat,
- nesmí je revertovat,
- musí určit, zda souvisí s aktuálním úkolem,
- pokud nejsou jeho nebo není jisté vlastnictví, musí se zastavit a upozornit Radima / Martina.

Pro souběžnou práci platí:
- každý větší úkol má mít vlastní větev,
- u souběžné práce se preferuje samostatný `git worktree`,
- jeden člověk / Codex je vždy vlastník konkrétního rozpracovaného úkolu,
- dva lidé nesmí současně měnit stejné soubory bez domluvy,
- společné soubory jako `src/app.js`, `src/styles.css`, `package.json`, `src/data/versionInfo.js` a `PŘÍRUČKA.md` vyžadují zvýšenou opatrnost,
- `PŘÍRUČKA.md` je společný pracovní kontrakt pro Radima i Martina,
- pokud někdo změní `PŘÍRUČKA.md`, druhý musí před další prací načíst aktuální verzi z GitHubu.

Doporučený začátek práce pro Radima i Martina:

```bash
git fetch origin
git status --short --branch
git remote -v
```

Pokud lokální větev není aktuální vůči `origin/main`, nejdřív sladit stav a teprve potom začít novou práci.

Větev `main` je produkční / hlavní větev.

Na `main` se nemá dělat větší přímá práce. Větší úkol patří do samostatné větve, například:

```text
radim/<kratky-popis>
martin/<kratky-popis>
codex/<kratky-popis>
```

Před pushem:
- spustit build / testy podle úkolu,
- ověřit `git diff --check`,
- ověřit, že commit obsahuje jen změny daného úkolu,
- nepushovat cizí rozpracované změny.

Před commitem:
- zkontrolovat `git diff`,
- zkontrolovat `git status --short`,
- necommitovat soubory, které s úkolem nesouvisí,
- necommitovat dočasné soubory, exporty, tokeny, logy ani osobní data.

Před mergem nebo nasazením:
- ověřit, že změna není v konfliktu s prací druhého člověka,
- ověřit produkční dopad,
- ověřit Cloudflare Pages / GitHub Pages napojení, pokud se měnil GitHub owner, remote, branch nebo deploy konfigurace.

Po každém přesunu repozitáře nebo změně GitHub organizace:
- aktualizovat lokální `origin`,
- ověřit `git fetch origin`,
- ověřit, že GitHub zobrazuje správného ownera,
- ověřit, že Martin i Radim mají očekávaná práva,
- ověřit produkční deploy kanál.

Pokud je workspace špinavý a změny patří druhému člověku:
- vytvořit nový worktree,
- nebo počkat na commit / stash vlastníka změn,
- nebo si výslovně potvrdit převzetí konkrétních souborů.

Pokud si Radim nebo Martin nejsou jistí, kdo vlastní rozpracovanou změnu:
- nepokračovat naslepo,
- neposouvat ani nepřepisovat cizí branch,
- nejdřív si napsat krátké předání: větev, soubory, stav, další krok.

Minimální předání práce mezi Radimem a Martinem má obsahovat:
- název větve,
- stručný cíl,
- změněné soubory,
- co je hotovo,
- co není otestované,
- jestli se měnilo API / DB / secrets / produkční nastavení,
- doporučený další krok.

## 16. Jednotná identita osob, uživatelů, zaměstnanců, řidičů a oprávnění

V Kaiser Smart musí být jasně oddělené tyto identity:

- `Uživatel` = přihlášení do aplikace, OTP, role, oprávnění a přístup do modulů.
- `Zaměstnanec` = skutečná osoba v HR evidenci, karta zaměstnance, dovolená/nemoc, lékařské prohlídky a pracovní údaje.
- `Řidič` = zaměstnanec s řidičskou/provozní rolí nebo přiřazením k vozidlu.
- `Vozidlo` = záznam ve Vozovém parku.
- `Vistos osoba/řidič` = externí údaj z Vistosu, nikdy ne primární zdroj oprávnění.
- `T-Cars vozidlo/GPS` = externí zdroj polohy a technických dat, nikdy ne zdroj oprávnění.

### 16.1 Zdroje pravdy

- Zdroj pravdy pro oprávnění je vždy `Uživatel`.
- Zdroj pravdy pro osobu je `Zaměstnanec`.
- Zdroj pravdy pro vozidlo je `Vozový park`.
- Zdroj pravdy pro aktuální GPS/polohu vozidla je T-Cars.
- Vistos je externí zdroj obchodních/provozních dat a může pomáhat s mapováním, ale nesmí řídit oprávnění v Kaiser Smart.

#### 16.1.1 Potvrzená provozní data nesmí zůstat jen v chatu nebo Mantře

- Potvrzený provozní údaj, který používá backend, integrace nebo bezpečnostní výpočet, musí být ve stejném schváleném celku uložený do strukturovaného cloudového zdroje pravdy příslušného modulu.
- Chat, Mantra, komentář, úkol ani popis pull requestu nejsou samy o sobě provozní databáze.
- Mantra shrnuje pravidla a hodnoty pro člověka; backend je musí načítat ze strukturovaného zdroje pravdy, ne parsovat z textu Mantry.
- Každá změna potvrzeného master údaje musí mít původ, autora, čas, audit a regresní test. Odvozená TEST konfigurace musí odkazovat na master zdroj a nesmí potvrzenou hodnotu nahradit odhadem.
- Pokud pro potvrzený údaj ještě neexistuje vhodné strukturované pole nebo tabulka, musí návrh výslovně zahrnout jejich bezpečné doplnění. Není dovoleno údaj pouze přepsat do dalšího promptu a prohlásit jej za uložený.

### 16.2 Povinná vazba

Dlouhodobý správný model je:

`user.id -> user.employeeId -> employee.id -> vehicle assignment -> vehicle.id`

Aplikace nesmí dlouhodobě spoléhat pouze na jméno, telefon nebo textové pole řidiče.

### 16.3 Oprávnění

Oprávnění se vždy ověřují přes:

- `user.role`
- `user.permissions`
- backendové permission checky

Nikdy se nesmí rozhodovat oprávnění podle:

- názvu pracovní pozice,
- textu ve Vistosu,
- přiřazeného vozidla,
- jména řidiče,
- telefonního čísla,
- pouze frontendového stavu.

### 16.4 Vozový park a řidiči

Vozový park je master evidence vozidel.

Potvrzené rozměry, prázdná a nejvyšší povolená hmotnost a nosnost svozových vozidel patří do technického profilu Vozového parku. HERE a jiné bezpečnostní výpočty je načítají z tohoto profilu. Neznámé zatížení náprav se nesmí odhadovat; parametr se vynechá a údaj zůstane viditelně nepotvrzený.

Přiřazení řidiče k vozidlu má směřovat na zaměstnance, ne pouze na textové jméno nebo uživatele.

Pokud má řidič přístup do aplikace, musí být propojen:

- jako `Uživatel` kvůli přihlášení a oprávněním,
- jako `Zaměstnanec` kvůli HR/provozní osobě,
- jako `Řidič` přes přiřazení k vozidlu.

### 16.5 Šarlota

Šarlota musí používat přihlášeného uživatele jako zdroj oprávnění.

Pro provozní kontext má Šarlota dohledat:

1. přihlášeného uživatele,
2. navázaného zaměstnance,
3. případné přiřazené vozidlo z Vozového parku.

Šarlota nesmí provádět akce jen podle toho, že někdo řekl jméno řidiče nebo SPZ.

Pokud vazba `user -> employee -> vehicle` není jednoznačná, Šarlota se musí doptat nebo předat akci k ručnímu potvrzení.

Pokud má jeden řidič přiřazených více vozidel, Šarlota nesmí automaticky vybrat první vozidlo ze seznamu.

V takovém případě má vozidla vyjmenovat lidsky podle typu, značky, interního názvu nebo popisu vozidla.

SPZ je pouze technický fallback. Šarlota se na SPZ ptá až tehdy, když řidič neumí vozidlo jednoznačně vybrat podle typu, značky nebo interního názvu.

### 16.6 Externí systémy

Vistos `Ridic_FK`, T-Cars řidič, telefon, SPZ nebo jméno lze používat jen jako pomocné mapovací údaje.

Nesmí se z nich odvozovat role, oprávnění ani právo provést citlivou akci.

## 17. Šarlota / ElevenLabs – pravidla integrace

### 17.0 Dva oddělené hlasové systémy

- Hlas navigace a hlasová Šarlota jsou dva samostatné systémy a nesmějí si vzájemně přebírat odpovědnost.
- Hlas navigace používá pouze deterministické české pokyny navigačního systému HERE, například vzdálenost k manévru, odbočení nebo změnu trasy. Nevede rozhovor, nepoužívá agentic AI a neprovádí provozní úkony.
- Navigační pokyn má vždy zvukovou prioritu. Při manévru se hlasová Šarlota ztiší nebo pozastaví.
- Hlasová Šarlota používá serverovou konverzační vrstvu ElevenLabs. Vysvětluje pracovní kontext a přes KSO client tools smí pouze připravit povolený krok; provozní účinek vyžaduje backendové oprávnění, audit a fyzické potvrzení člověka.
- Web Speech API, `speechSynthesis`, `SpeechSynthesisUtterance`, systémové čtení prohlížeče nebo Androidu a lokální TTS jsou zakázané jako náhrada hlasové Šarloty. Toto pravidlo nezakazuje samostatný deterministický hlas skutečné HERE navigace.
- Při nedostupnosti ElevenLabs musí rozhraní zobrazit čitelný text a pravdivou chybu. Nesmí tiše přepnout na jinou konverzační Šarlotu ani předstírat úspěšné přehrání.
- Pevný hlasový pokyn Šarloty nesmí přes client tools vyvolat provozní akci; akci vždy potvrzuje člověk samostatným ovládacím prvkem.
- ElevenLabs API klíč zůstává pouze na backendu. Frontend smí získat jen bezpečný serverový signed URL nebo serverem připravený zvukový tok.

### 17.1 Rozlišování stavů

- `microphoneDenied` používat výhradně pro zamítnutý nebo blokovaný mikrofon v prohlížeči.
- `disconnected` používat výhradně pro skutečné přerušení ElevenLabs / WebSocket session.
- `error` používat pro ostatní chyby.
- Při `microphoneDenied` nezobrazovat text `ElevenLabs agent je odpojený`.
- Při `microphoneDenied` nespouštět WebSocket, dokud není mikrofon povolený.
- UI má zobrazit jasnou českou hlášku:
  `Mikrofon není povolený. Povol mikrofon pro tento web a zkus to znovu.`

### 17.2 Dynamic variables

- Každá proměnná použitá v ElevenLabs system promptu, first message nebo tool parametrech musí být vždy posílaná v `conversation_initiation_client_data`.
- Povinné proměnné nesmí být `undefined`, `null` ani prázdný string.
- Pro chybějící hodnoty musí existovat bezpečný fallback.
- Pokud ElevenLabs vrátí chybu `1008 Missing required dynamic variables`, nejdřív zkontrolovat first message a dynamic variables payload.

### 17.3 `intro_announcement`

- Význam `intro_announcement` určuje hlasový kontrakt konkrétního modulu. U běžných modulů může být kompletním hotovým úvodním textem; nesmí se však automaticky předpokládat, že stejný způsob platí pro všechny moduly.
- `intro_announcement` není jeden globální text pro všechny moduly. Každý modul vlastní svůj zdroj úvodu a musí být zaregistrovaný ve strojově čitelném hlasovém kontraktu.
- Ve `Svozových trasách` je `intro_announcement` výhradně technický marker `KSO_INTRO_GENERATION_PENDING`. KSO technickou First Message řidiči nesmí přehrát ani zobrazit jako odpověď.
- Slyšitelný úvod `Svozových tras` vytváří až skutečně aktivní ElevenLabs agent na interní požadavek KSO podle publikovaného system Promptu, všech připojených Knowledge Base a ověřených dynamic variables stejné testovací nebo produkční relace.
- `Svozové trasy` nesmějí obsahovat pevnou backendovou ani frontendovou šablonu slyšitelného přivítání, lokálně napsanou náhradní hlášku, obecný mock ani úvod jiného modulu. Backend dodává fakta a bezpečnostní stav, nikoli hotovou lidskou větu.
- Technický marker a interní požadavek KSO se nikdy nevyslovují. Mikrofon zůstává pozastavený, dokud technická First Message neskončí a nedohraje agentem vytvořený skutečný úvod.
- Úvod aktivního agenta musí být krátký, přirozený, bez opakování stejného údaje a nesmí znovu žádat potvrzení již fyzicky potvrzené trasy.
- Automatický úvod se před přehráním celý přijme do dočasné paměti a KSO jej porovná s backendem ověřenými fakty aktuální relace. Cizí osoba, název trasy, počet nebo první stanoviště, vozidlo, model, SPZ, počasí, palivo nebo pracovní dostupnost zablokují celý zvuk; chybná věta se nesmí ani částečně přehrát.
- Hologram smí ukázat stav `Mluvím` až po úspěšné kontrole faktů a skutečném naplánování zvuku v běžícím `AudioContextu`. Stav `suspended`, zakázané automatické přehrávání, čekání na audio ani pouhé přijetí textu nejsou přehrávání.
- Po obnovení stránky bez uživatelského gesta musí tablet nabídnout konkrétní tlačítko `SPUSTIT HOLOGRAFICKOU ŠARLOTU` a nesmí předstírat hlas.
- Počasí v automatickém úvodu musí být backendem ověřené, obsahovat čas pozorování a při přehrání nesmí být starší než 45 minut. Šarlota smí použít pouze přesné ověřené shrnutí; nesmí vytvářet obecné hodnocení typu `počasí přeje`. Chybějící nebo zastaralé počasí v úvodu úplně vynechá. Příklady v Promptu nebo Knowledge Base nikdy nejsou aktuální počasí.
- Stav nádrže smí pocházet pouze z read-only T-Cars `knihaJizdVozidlo.jizdaStavPhm`, z poslední čerstvé jízdy přesně shodného vozidla. Protože WSDL neurčuje jednotku, KSO ani Šarlota ji nesmějí domyslet. Zastaralá, chybějící nebo neshodná hodnota se vynechá.
- Automaticky spuštěná Šarlota smí po potvrzení trasy říct právě jeden úvod za ID produkční jízdy nebo aktivní TEST relace. Jednorázovost je serverový auditovaný stav, nikoli jen proměnná frontendu; návrat na obrazovku, remount, refresh, reconnect ani souběžná karta nesmějí úvod spustit znovu.
- Každé automatické promluvení Holografické Šarloty začíná schváleným intro gongem. Běžná odpověď na uživatelovu řeč gong nemá. Gong se přehrává ve stejném odemčeném `AudioContextu` jako ElevenLabs audio, aby fungoval v Safari, Chrome i na Blackview.
- Celý automatický tok — příprava, intro gong, agentovo mluvení, pětisekundové okno a outro gong — patří výhradně Holografické Šarlotě. Běžný hlasový nebo mikrofonní panel se v žádné z těchto fází nesmí zobrazit.
- Hlasový provider musí aplikaci povinně předat funkční přehrávač intro/outro gongu. Chybějící metoda, `undefined` nebo tiché přeskočení přes optional chaining jsou blokující chyba; bez potvrzeného dohrání intro gongu nesmí automatická řeč začít.
- Úvod musí v pořadí použít dostupné ověřené údaje: vokativ řidiče, počet stanovišť, první firmu, čerstvé počasí, stav nádrže T-Cars a nepřítomné dispečery jen jménem a bezpečným pracovním stavem. Chybějící údaj se přirozeně vynechá; soukromý nebo zdravotní důvod se nikdy nevysloví.
- Automatický úvod musí skončit právě jednou otázkou ve významu `[ověřený vokativ], potřebuješ něco upřesnit?`; bez bezpečného vokativu použije jen `Potřebuješ něco upřesnit?`. Během celého úvodu KSO nesmí požádat o mikrofon, volat `getUserMedia`, připravovat hlasový vstup ani zobrazit stav poslouchání.
- Teprve po dohrání závěrečné otázky KSO ve stejné hlasové relaci a stejném hologramu zapne mikrofon a pět sekund čeká na první řeč řidiče. Velký obrázek, dok nebo panel mikrofonu se nezobrazí. Bez řeči KSO přehraje krátký outro gong, zavře hologram a relaci ukončí.
- Jakmile se řidič během prvních pěti sekund ozve, pětisekundový časovač se zruší. Šarlota pokračuje v běžné obousměrné konverzaci ve stejném hologramu bez nového intro gongu; rozhovor může trvat libovolně dlouho až do běžného ručního ukončení nebo bezpečnostního ukončení spojení. Pět sekund nikdy není limit již zahájeného rozhovoru.
- Během pětisekundového okna Šarlota nesmí sama říct `Jste stále zde`, nabízet další krok ani jinak prodlužovat relaci. Fyzické tlačítko mikrofonu není podmínkou první odpovědi řidiče.
- Ruční `ZAPNOUT ŠARLOTU` je samostatná pozdější hlasová relace. Zahájí ji jednou krátkou otázkou ve významu `Mirku, s čím mohu pomoct?`, přičemž oslovení smí použít jen z ověřeného vokativu. Poslech trvá do ručního ukončení nebo bezpečnostního ukončení spojení.
- `current_module`, `current_module_route`, `current_module_context` a `intro_announcement` musí patřit ke stejné trase a stejnému modulovému kontraktu; rozpor hlasovou relaci zablokuje.
- TEST tabletu smí získat signed URL až po read-only ověření skutečného ElevenLabs agenta, neprázdného Promptu, First Message `{{intro_announcement}}`, připojené Knowledge Base a všech očekávaných Tools.
- Nový modul nebo změna zdroje úvodu vyžaduje úpravu kontraktu a automatický regresní test. Nestačí změnit pouze frontendový text.
- First message v ElevenLabs má používat pouze:
  `{{intro_announcement}}`
- Do First message nepřidávat současně `{{user_greeting}}` ani další pevný úvodní text.
- Pozdrav a otázka se nesmí skládat dvakrát.

Správně pro modul s kontraktem hotového textu:

```text
intro_announcement = "Dobré odpoledne, Radime. Co potřebuješ?"
```

First message:

```text
{{intro_announcement}}
```

Správně pro `Svozové trasy`:

```text
intro_announcement = "KSO_INTRO_GENERATION_PENDING"
```

Marker se nepřehraje. KSO po jeho dokončení pošle interní požadavek aktivnímu agentovi a řidič slyší pouze odpověď vytvořenou z publikovaného Promptu, připojené KB a ověřeného kontextu Svozových tras.

Špatně:

```text
{{user_greeting}} {{intro_announcement}} Co potřebuješ vyřešit?
```

### 17.4 Denní pozdrav

- Denní pozdrav generovat serverově nebo v aplikaci podle `Europe/Prague`.
- Nepoužívat UTC bez převodu.
- Pravidla:
  - 05:00-08:59 -> `Dobré ráno`
  - 09:00-11:59 -> `Dobré dopoledne`
  - 12:00-17:59 -> `Dobré odpoledne`
  - 18:00-22:59 -> `Dobrý večer`
  - 23:00-04:59 -> raději neutrální fallback
- V 10:26 Šarlota nesmí říkat `Dobré ráno`.
- Ve 13:07 má říkat `Dobré odpoledne`.

### 17.5 Tykání

- Šarlota uživateli tyká.
- Tykání platí pro všechny repo-side texty, které může Šarlota říct nebo poslat do hlasové vrstvy: `introVoiceLine`, `intro_announcement`, system prompt, first message, tool odpovědi, fallback chyby, potvrzovací modal a toast připravený hlasovým nástrojem.
- Oslovení bere z KSO backendu, neháda ho v ElevenLabs promptu.
- Pokud backend pošle `user_first_name_addressing_style = female_diminutive`, jde o ověřené ženské zdrobnělé oslovení a Šarlota ho může přirozeně použít.
- Ženské zdrobnělé oslovení platí jen pro ověřené ženy, například `Alenko`, `Marcelko`, `Jaruško`, `Lucko`.
- Mužům Šarlota zdrobněle neříká; používá běžný vocativ, například `Radime`.
- Používat:
  - `Co potřebuješ?`
  - `Co mám najít?`
  - `Mám to odeslat?`
  - `K tomu nemáš oprávnění.`
- Nepoužívat:
  - `Co potřebujete?`
  - `Chcete pokračovat?`
  - `K tomu nemáte oprávnění.`
- Při každé změně Šarloty udělat fulltextovou kontrolu vykání minimálně na tvary `vám`, `vás`, `máte`, `nemáte`, `chcete`, `potřebujete`, `řekněte`, `potvrďte` v souborech Šarloty a ElevenLabs client tools. Pokud jde o běžnou UI hlášku mimo Šarlotu, nemění se automaticky; pokud text může mluvit Šarlota, musí být v tykání.

### 17.6 Stručnost

- Šarlota nemá opakovat `Jsem Šarlota`, pokud už ji uživatel spustil z aplikace.
- Běžná odpověď má mít jednu krátkou větu, maximálně dvě.
- Při nejasnosti položit jen jednu krátkou otázku.
- Rozhodování má být rychlé, věcné a bez dlouhého vysvětlování.
- Stejnou otázku neopakovat dokola; po odpovědi uživatele navázat dalším krokem.
- Úvod nemá být dlouhý.

### 17.7 Bezpečnost

- ElevenLabs nikdy není zdroj pravdy pro oprávnění.
- Identita = přihlášený uživatel Smart odpady.
- Práva = backend Smart odpady.
- ElevenLabs = hlasová / konverzační vrstva.
- API key, signed URL tokeny ani secrets se nikdy nesmí vypisovat do logu, UI ani debug odpovědi.
- Do ElevenLabs neposílat zbytečná osobní data.
- U hlasových akcí, které ukládají data, mění stav, posílají e-mail/SMS/notifikaci, spouští automatizaci nebo mají jiný provozní dopad, nesmí být finální potvrzení pouze hlasové.
- Šarlota musí před provedením takové akce otevřít v aplikaci potvrzovací vyskakovací okno / modal.
- Potvrzovací okno musí jasně ukázat, co se provede, pro koho, s jakými údaji, komu se případně odešle zpráva a jaký bude výsledek.
- Hlasové `ano` smí připravit návrh a otevřít potvrzovací okno, ale akce se provede až po kliknutí nebo tapnutí na potvrzovací tlačítko v UI.
- Pokud potvrzovací okno nejde zobrazit, Šarlota nesmí akci provést; musí ji ponechat jako návrh nebo říct, že čeká na ruční potvrzení.
- Potvrzovací okno musí být použitelné na mobilu a nesmí skrýt důležité údaje ani hlavní riziko akce.
- U hlasu počítat s tím, že řidič si obvykle pamatuje svoje RČ, datum narození nebo telefonní číslo, ale často si nepamatuje SPZ. SPZ proto nesmí být hlavní cesta výběru vozidla.

### 17.7.1 Kontextové načtení dat před akcí

- Když Šarlota z hlasu detekuje, co volající potřebuje, má nejdřív krátce potvrdit, že si načte relevantní data, například:
  `Rozumím. Podívám se do systému.`
- Potom si má přes backend KSO načíst zdroj pravdy pro daný modul a až následně pokračovat v dialogu.
- Pro Hlášení řidičů platí: pokud volající řekne, že chce opravu, servis nebo má něco rozbité/polámané na autě, jde o možné Hlášení řidičů.
- Šarlota v takovém případě načítá Vozový park a přiřazená vozidla řidiče přes backend.
- Hlavní cesta je bezpečně ověřený backend seznam s `vehiclesVerified: true`.
- Pokud jsou ověřená maximálně 3 vozidla, Šarlota je může stručně vyjmenovat podle ověřeného názvu a SPZ.
- Pokud jsou ověřená více než 3 vozidla, Šarlota nečte dlouhý seznam a otevře výběr vozidla v aplikaci.
- Pokud seznam není bezpečně ověřený, Šarlota nesmí říct žádné konkrétní vozidlo a otevře výběr v aplikaci.
- Pokud výběr v aplikaci nejde použít, náhradní cesta je ruční značka, typ nebo SPZ.
- Pokud má řidič více vozidel, Šarlota nesmí automaticky vybrat první vozidlo.
- Pokud relevantní data nejdou načíst, Šarlota to řekne stručně a nespustí zápis ani notifikaci bez ručního potvrzení.

### 17.8 Testovací checklist pro Šarlotu

- TEST režim slouží k otestování skutečné funkce, ne k jejímu plošnému vypnutí. Prompt, Knowledge Base, Tools, modulový kontext, úvodní hlášení, obousměrný hlas, navigační příprava a ostatní uživatelské kroky musí běžet stejnou logikou jako v produkci nad izolovanými TEST daty.
- V TESTU se blokují nebo nahrazují výhradně produkční účinky: zápis do ostré trasy, Vistosu, produkční GPS, skutečný kontakt zákazníka, e-mail, SMS, RCS, absence, servisní hlášení a jiné provozní změny. Místo nich musí existovat TEST adaptér, TEST audit nebo bezpečný testovací příjemce podle schváleného kontraktu.
- Ochrana produkce nesmí být záminkou pro stav, ve kterém nelze otestovat hlas, Prompt, Knowledge Base, Tools, pracovní kontext nebo celý uživatelský scénář. Funkce označená `Tato funkce zatím není v testovacím režimu dostupná.` je otevřený nedodělek a nesmí být započítaná jako úspěšně otestovaná ani jako splněná akceptace.
- Ve schváleném TESTU Svozových tras se nikdy nekontaktuje skutečný zákazník. Interní TEST e-mail nebo SMS dispečerce se ale nesmí plošně zakázat: smí projít pouze přes chráněný backend, po samostatném fyzickém potvrzení, na bezpečného interního TEST příjemce a s TEST auditem podle Mantry a provozního kontraktu modulu.

Při každé změně Šarloty ověřit:

- automatický úvod nevyžádá oprávnění mikrofonu, neotevře mikrofon a nezobrazí stav poslouchání před dohráním závěrečné otázky,
- ruční zapnutí mikrofonu se zakázaným oprávněním -> UI ukáže `Mikrofon není povolený`,
- ruční zapnutí s povoleným mikrofonem -> pokračuje signed URL / WebSocket,
- WebSocket disconnect -> UI ukáže skutečný disconnect,
- nechybí žádná required dynamic variable,
- u modulů s hotovým textem `intro_announcement` zazní jen jednou; ve Svozových trasách technický marker nezazní vůbec a slyšitelný agentem vytvořený úvod zazní jen jednou,
- jednorázovost úvodu je potvrzená serverovým stavem při obnovení stránky, remountu, reconnectu i souběžném pokusu,
- před automatickým úvodem zazní intro gong; před běžnou odpovědí uživateli nezazní,
- příprava, intro gong, agentovo mluvení, pětisekundové čekání i outro gong zobrazují pouze hologram; běžný mikrofonní panel se neobjeví,
- provider skutečně předává přehrávač gongu aplikaci a test selže při chybějící nebo `undefined` metodě,
- úvod používá jen ověřený vokativ, počet a první stanoviště, čerstvé počasí, čerstvou hodnotu T-Cars bez domyšlené jednotky a bezpečný stav nepřítomných dispečerů,
- automatický úvod skončí jedinou otázkou; až potom se ve stejném hologramu zapne mikrofon a bez řeči po pěti sekundách zazní outro gong,
- první řeč řidiče během pěti sekund zruší časovač a otevře libovolně dlouhý běžný rozhovor ve stejné relaci; velký mikrofonní panel se v tomto toku nikdy neukáže,
- Šarlota tyká,
- denní pozdrav odpovídá `Europe/Prague`,
- hlasová akce se zápisem, změnou stavu, notifikací nebo externím dopadem vyžaduje potvrzovací popup v UI,
- samotné hlasové `ano` bez potvrzení v popupu nic neodešle ani neuloží jako hotovou akci,
- konzole bez neodchycených chyb,
- build projde,
- `node --check` projde,
- `git diff --check` projde.

### 17.9 Úpravy promptu v ElevenLabs / externím AI nástroji

- Před úpravou system promptu, first message, tool promptu nebo Knowledge Base v ElevenLabs / externím AI nástroji se musí nejdřív načíst aktuální nastavení z produkčního zdroje.
- Prompt se nesmí přepsat naslepo lokální verzí ani novým textem bez merge s aktuálním obsahem.
- Změna musí být minimální doplnění nebo cílená úprava, aby nezmizela existující pravidla, nástroje, dynamic variables ani bezpečnostní pokyny.
- Po uložení se musí ověřit, že agent stále používá správné dynamic variables, first message, nástroje a model.
- Pokud není dostupný bezpečný read/write přístup k ElevenLabs, změnu neprovádět naslepo; připravit repo-side prompt/dynamic variables a jasně napsat, že upstream prompt v ElevenLabs nebyl uložen.
- Synchronizace ElevenLabs client tools smí proběhnout jen přes chráněný backendový postup: nejdřív read-only návrh, potom explicitní `apply: true`, kontrola správného agenta Šarloty a ověření, že se nemění system prompt, first message ani model.
- Synchronizace doplňkového prompt bloku smí proběhnout jen přes chráněný backendový postup: nejdřív read-only návrh, potom explicitní `apply: true`, kontrola správného agenta Šarloty a append pouze schváleného bloku bez změny first message, modelu a tools.

### 17.10 Povinnost testovat na straně Codexu

- Radim není tester. Po každé úpravě Šarloty, ElevenLabs, hlasu, chatu nebo Datových schránek provede Codex sám přiměřený test UI, API, produkce a přesně dotčeného toku.
- Test nesmí být předán Radimovi větou typu `řekni testovací větu`, `zkus to prosím` ani jiným požadavkem na ruční ověření, pokud existuje bezpečný způsob, jak jej provést z Codexu.
- U chatu s dlouhou historií Codex ověří skutečné posouvání myší nebo trackpadem, klávesnicí a programové přesunutí na poslední zprávu. Nestačí ověřit, že je v CSS uvedeno `overflow-y: auto`.
- Hlasový test používá pouze bezpečný nesenzitivní pokyn, neprovádí akci nad zprávou, a ověřuje minimálně povolení mikrofonu, signed URL, WebSocket, předání dynamic variables, audio vstup, přepis a odpověď. Po testu se relace zavře.
- Pokud zařízení Codexu nemá audio-loopback pro skutečný vstup do mikrofonu, Codex ověří produkční připojení i deterministický integrační tok s emulovaným PCM vstupem a odpovědí. Výsledek musí poctivě označit jako omezený hardwarem; nesmí tvrdit, že skutečný přepis byl ověřen.
- U citlivých nebo zapisujících akcí zůstává test read-only, dokud uživatel výslovně neschválí konkrétní ostrý dopad. Tato hranice nikdy není důvodem přenést testování na Radima.

## 18. Obecná pravidla UI/UX všech modulů

### 18.1 Vzhled modulů

- Při vývoji každého modulu respektovat barevné schéma v Nastavení.
- Nehardcodovat dominantní modulové barvy mimo existující theme proměnné, pokud to není výslovně potvrzené.
- Výchozí font UI je Quicksand.
- Nadpisy mohou být výraznější, ale běžný obsah a tabulkové řádky nemají být zbytečně tučné.
- Před dokončením vizuální změny ověřit desktop, notebook, tablet a mobil.

### 18.2 Precizní UI/UX

Každý modul musí mít precizní UI/UX.
Precizní znamená, že uživatel okamžitě chápe, co vidí, co je důležité a co má udělat.

Precizní UI/UX není jen hezký vzhled. Je to kombinace přehlednosti, jednoduchosti, správné pracovní logiky, čitelnosti a jasných akcí.

#### 18.2.1 Základní pravidlo

Uživatel se nesmí v modulu ztratit.

Každá obrazovka musí během několika sekund odpovědět na otázky:

- Co je tady nejdůležitější?
- Co je v pořádku?
- Co je problém?
- Co čeká na mě?
- Co už je vyřešené?
- Jaký je další krok?

#### 18.2.2 Co znamená „precizní“

Precizní znamená:

- žádná důležitá informace není schovaná mimo obraz,
- žádný řádek, karta ani tlačítko není useknuté,
- žádné tlačítko se neláme do svislého textu,
- uživatel vždy vidí hlavní stav položky,
- uživatel vždy vidí jasnou akci,
- texty jsou krátké a lidské,
- tabulky nejsou přeplácané,
- dlouhé údaje nerozbíjejí layout,
- technické informace nejsou v hlavním pohledu,
- hlavní přehled není návod ani dokumentace,
- detail slouží k rozhodnutí,
- akce odpovídají aktuálnímu stavu položky.

#### 18.2.3 Zakázané chování UI

V produkčním UI nesmí být:

- useknutá pravá část obrazovky,
- horizontálně rozbitá tabulka,
- akce mimo viditelnou část obrazovky,
- svisle zalomené tlačítko typu „O t e v ř í t“,
- dlouhé technické texty v hlavním pohledu,
- obecná tlačítka bez významu,
- opakované vysvětlující bloky pod každou položkou,
- příliš mnoho štítků vedle sebe,
- debug informace v běžném pracovním toku,
- nejasné stavy typu „Zkontrolovat“ bez vysvětlení, co přesně se má kontrolovat.

#### 18.2.4 Pravidla pro přehled

Přehled má být krátký a pracovní.

Na přehledu zobrazit pouze:

- stav,
- název / subjekt,
- nejdůležitější informaci,
- další krok,
- jednu hlavní akci.

Na přehledu nezobrazovat všechno.
Detailní informace patří do detailu nebo rozbalené karty.

#### 18.2.5 Pravidla pro tabulky

Tabulka smí být použita jen tehdy, pokud zůstane čitelná.

Pokud má tabulka moc sloupců:

- zmenšit počet sloupců,
- přesunout detail do rozbalené karty,
- zkrátit dlouhé texty,
- použít dvouřádkové buňky,
- ponechat akce vždy viditelné.

Nikdy nesmí nastat stav, že část řádku není vidět.

#### 18.2.6 Pravidla pro tlačítka

Každé tlačítko musí být konkrétní.

Špatně:

- Zkontrolovat
- Zamítnout
- Potvrdit návrh
- Zobrazit
- Provést

Správně:

- Otevřít zprávu
- Potvrdit předání
- Detail archivace
- Ověřit přílohu
- Označit jako vyřešené
- Předat fakturám
- Opravit den svozu

Tlačítko musí říkat, co se stane po kliknutí.

#### 18.2.6.1 Řidičský tablet a terénní obsluha

Řidičský tablet je pracovní zařízení pro řidiče ve stresu, zimě, dešti a mrazu. Obsluha proto musí být jednoduchá, rychlá a bezpečně použitelná i v pracovních rukavicích.

- Hlavní pracovní akce musí mít velkou, snadno zasažitelnou dotykovou plochu; nesmí vyžadovat přesné míření na malý prvek.
- Kritická nebo častá akce, například potvrzení obsloužení, hlášení problému, výsyp, přestávka nebo fyzické potvrzení, musí být vizuálně jednoznačná a mít přednost před pomocnými volbami.
- Na jedné pracovní obrazovce musí řidič během několika sekund poznat aktuální stav, další krok a jednu hlavní akci; technické informace, dlouhé vysvětlování a administrátorské prvky do tohoto toku nepatří.
- Tlačítka musí mít dostatečné rozestupy pro ovládání mokrou rukou nebo v rukavicích a nesmí se lámat, překrývat ani mizet mimo obrazovku.
- Riziková akce zůstává dvoukroková a s fyzickým potvrzením, ale každá její obrazovka smí požadovat jen jeden krátký, srozumitelný krok.

#### 18.2.7 Nápověda u akcí

U nejasných nebo rizikových akcí musí být krátká lidská nápověda.

Nápověda má říct:

- co se stane,
- co se nestane,
- zda se něco odešle,
- zda se něco smaže,
- zda se akce zapíše do historie.

Příklad:

Tlačítko:
`Potvrdit předání`

Nápověda:
`Zpráva se označí jako předaná účetnímu oddělení. Nic se neodešle mimo systém a akce se zapíše do historie.`

#### 18.2.8 Pravidlo pro technické informace

Technické informace nepatří do hlavního UI.

Do hlavního UI nepatří:

- JSON,
- cron,
- runner,
- raw metadata,
- interní ID,
- debug log,
- technické chyby bez lidského vysvětlení.

Technické informace smí být pouze v:

- Diagnostice,
- rozbalené servisní sekci,
- detailu pro administrátora.

#### 18.2.9 Akceptační pravidlo

UI je hotové až ve chvíli, kdy běžný uživatel bez vysvětlení pochopí:

- co je stav,
- co je problém,
- co je hotové,
- co má udělat,
- kde má kliknout.

Pokud uživatel musí přemýšlet, co tlačítko znamená, nebo nevidí celou informaci, UI není precizní.

## 19. Datová schránka a UI pravidla

### 19.1 Bezpečné předávání hesel / Cloudflare secrets

- Hesla, tokeny a secrets se nikdy nevypisují do chatu, shellu, logu ani screenshotu.
- U Datové schránky je bezpečný postup zadávání Cloudflare secrets po jednom:
  1. Cloudflare Pages projekt.
  2. Add variable.
  3. Secret.
  4. Název proměnné.
  5. Radim vloží hodnotu sám.
  6. Save.
- Tento postup opakovat pro `DATA_BOX_ISDS_USERNAME_2` až `DATA_BOX_ISDS_USERNAME_6` a `DATA_BOX_ISDS_PASSWORD_2` až `DATA_BOX_ISDS_PASSWORD_6`.
- Hromadný `.env` import nepoužívat, pokud Radim výslovně nepotvrdí konkrétní bezpečný postup.
- Po změně Cloudflare secrets je nutný nový deployment, jinak se změny nemusí projevit v produkci.

### 19.2 Datová schránka jako pracovní inbox

- Datová schránka není obyčejná tabulka.
- Firemní datové schránky mají být klikací boxy vedle sebe:
  - Kaiser servis,
  - Kaiser technology,
  - Nanolab plus,
  - Nanolab shop,
  - LeFleur,
  - Kaisermanův nadační fond.
- Po kliknutí na konkrétní box je uživatel v chlívku dané DS a vidí jen data této schránky.
- Detail zprávy má být pracovní read-only detail nebo okno pro řešení zprávy.
- Bez potvrzeného API nesmí UI předstírat funkční odpověď, přeposlání, mazání, změnu stavu ani stahování příloh.

### 19.3 Canonická trasa modulu

- Pro Datové schránky se používá výhradně trasa `/datove-schranky-plus`.
- Trasa `/datova-schranka` se nepoužívá v navigaci, aplikaci, testech ani v integracích.
- Pokud zadání říká `vytvoř chat` nebo `chat k datové zprávě`, znamená to serverový AI chat nad konkrétní zprávou, jejími přílohami, historií a kanonickým adresářem kontaktů. Nesmí se vytvořit lokální simulátor, pevně napsané větvení podle klíčových slov ani chat, který si vymýšlí kontakty nebo stav provedení akce.
- Prompt takového chatu patří do chráněného Nastavení daného modulu; frontend jej nesmí nahrazovat vlastním promptem. Akce mimo systém, zejména e-mail, zůstávají serverové a vyžadují potvrzení uživatele.

### 19.4 Chatový formulář a přímé interní pokyny

- V dialogu chatu musí vždy zůstat samostatný formulář `Provést změnu / úkol`; chatová historie a rychlé návrhy jej nenahrazují.
- Jednoznačný bezpečný interní pokyn, například archivace, označení jako vyřízené, vytvoření interního úkolu nebo interní předání se po odeslání formuláře skutečně provede, zapíše do historie a vrátí přesné `Hotovo.`. Nesmí odpovědět jen `připravím` ani čekat na druhé potvrzení.
- Odeslání mimo systém (e-mail, SMS, odpověď datovou schránkou) zůstává samostatným návrhem s konkrétním potvrzením.
- Frontend nesmí přepsat konkrétní serverovou otázku či výsledek obecnou frází. Když u předání chybí adresát, musí se přesně zeptat, komu má být zpráva interně předána.
