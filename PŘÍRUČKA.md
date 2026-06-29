# PŘÍRUČKA PROJEKTU KAISER SMART / SMART ODPADY

## 1. Hlavní pravidlo

Tento soubor je hlavní pracovní příručka projektu a má přednost před běžným zadáním.

Pokud je zadání v rozporu s tímto souborem, zastav práci a upozorni na rozpor.

## Povinný pracovní postup Codexu / vývojáře

### 1. Před zahájením práce

Před jakoukoli prací musí Codex/vývojář otevřít a přečíst `PŘÍRUČKA.md`.

Bez přečtení `PŘÍRUČKA.md` se nesmí:
- analyzovat změna
- implementovat
- upravovat soubory
- měnit API
- měnit databáze
- měnit Cloudflare
- commitovat
- pushovat
- nasazovat

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

## 16. Šarlota / ElevenLabs – pravidla integrace

### 16.1 Rozlišování stavů

- `microphoneDenied` používat výhradně pro zamítnutý nebo blokovaný mikrofon v prohlížeči.
- `disconnected` používat výhradně pro skutečné přerušení ElevenLabs / WebSocket session.
- `error` používat pro ostatní chyby.
- Při `microphoneDenied` nezobrazovat text `ElevenLabs agent je odpojený`.
- Při `microphoneDenied` nespouštět WebSocket, dokud není mikrofon povolený.
- UI má zobrazit jasnou českou hlášku:
  `Mikrofon není povolený. Povol mikrofon pro tento web a zkus to znovu.`

### 16.2 Dynamic variables

- Každá proměnná použitá v ElevenLabs system promptu, first message nebo tool parametrech musí být vždy posílaná v `conversation_initiation_client_data`.
- Povinné proměnné nesmí být `undefined`, `null` ani prázdný string.
- Pro chybějící hodnoty musí existovat bezpečný fallback.
- Pokud ElevenLabs vrátí chybu `1008 Missing required dynamic variables`, nejdřív zkontrolovat first message a dynamic variables payload.

### 16.3 `intro_announcement`

- `intro_announcement` je kompletní hotový úvodní text pro Šarlotu.
- First message v ElevenLabs má používat pouze:
  `{{intro_announcement}}`
- Do First message nepřidávat současně `{{user_greeting}}` ani další pevný úvodní text.
- Pozdrav a otázka se nesmí skládat dvakrát.

Správně:

```text
intro_announcement = "Dobré odpoledne, Radime. Co potřebuješ?"
```

First message:

```text
{{intro_announcement}}
```

Špatně:

```text
{{user_greeting}} {{intro_announcement}} Co potřebuješ vyřešit?
```

### 16.4 Denní pozdrav

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

### 16.5 Tykání

- Šarlota uživateli tyká.
- Používat:
  - `Co potřebuješ?`
  - `Co mám najít?`
  - `Mám to odeslat?`
  - `K tomu nemáš oprávnění.`
- Nepoužívat:
  - `Co potřebujete?`
  - `Chcete pokračovat?`
  - `K tomu nemáte oprávnění.`

### 16.6 Stručnost

- Šarlota nemá opakovat `Jsem Šarlota`, pokud už ji uživatel spustil z aplikace.
- Běžná odpověď má mít jednu krátkou větu, maximálně dvě.
- Při nejasnosti položit jen jednu otázku.
- Úvod nemá být dlouhý.

### 16.7 Bezpečnost

- ElevenLabs nikdy není zdroj pravdy pro oprávnění.
- Identita = přihlášený uživatel Smart odpady.
- Práva = backend Smart odpady.
- ElevenLabs = hlasová / konverzační vrstva.
- API key, signed URL tokeny ani secrets se nikdy nesmí vypisovat do logu, UI ani debug odpovědi.
- Do ElevenLabs neposílat zbytečná osobní data.

### 16.8 Testovací checklist pro Šarlotu

Při každé změně Šarloty ověřit:

- mikrofon zakázán -> UI ukáže `Mikrofon není povolený`,
- mikrofon povolen -> pokračuje signed URL / WebSocket,
- WebSocket disconnect -> UI ukáže skutečný disconnect,
- nechybí žádná required dynamic variable,
- `intro_announcement` zazní jen jednou,
- Šarlota tyká,
- denní pozdrav odpovídá `Europe/Prague`,
- konzole bez neodchycených chyb,
- build projde,
- `node --check` projde,
- `git diff --check` projde.

## 17. Datová schránka a UI pravidla

### 17.1 Bezpečné předávání hesel / Cloudflare secrets

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

### 17.2 Vzhled modulů

- Při vývoji každého modulu respektovat barevné schéma v Nastavení.
- Nehardcodovat dominantní modulové barvy mimo existující theme proměnné, pokud to není výslovně potvrzené.
- Výchozí font UI je Quicksand.
- Nadpisy mohou být výraznější, ale běžný obsah a tabulkové řádky nemají být zbytečně tučné.
- Před dokončením vizuální změny ověřit desktop, notebook, tablet a mobil.

### 17.3 Datová schránka jako pracovní inbox

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
