# BIBLE PROJEKTU KAISER SMART / SMART ODPADY

## 1. Hlavní pravidlo

Tento soubor je hlavní pracovní bible projektu a má přednost před běžným zadáním.

Pokud je zadání v rozporu s tímto souborem, zastav práci a upozorni na rozpor.

## Povinný pracovní postup Codexu / vývojáře

### 1. Před zahájením práce

Před jakoukoli prací musí Codex/vývojář otevřít a přečíst `BIBLE.md`.

Bez přečtení `BIBLE.md` se nesmí:
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

Těsně před každým commitem musí Codex/vývojář znovu otevřít `BIBLE.md`.

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

### 8. Pravdivost

Codex/vývojář nesmí psát, že něco testoval, pokud to netestoval.

Musí rozlišovat:
- ověřeno
- neověřeno
- domněnka

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

## 7. Na projektu pracují

Na projektu pracují:
- Radim
- Martin

Nepřepisuj cizí necommitnuté změny.

Pokud existují cizí změny, zastav se a upozorni.

## 8. Samostatnost

Pracuj samostatně.

Nečekej na potvrzení u každého drobného kroku, pokud zadání není nejasné.

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
- přečíst `BIBLE.md`,
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
- společné soubory jako `src/app.js`, `src/styles.css`, `package.json`, `src/data/versionInfo.js` a `BIBLE.md` vyžadují zvýšenou opatrnost,
- `BIBLE.md` je společný pracovní kontrakt pro Radima i Martina,
- pokud někdo změní `BIBLE.md`, druhý musí před další prací načíst aktuální verzi z GitHubu.

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
