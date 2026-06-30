# UI/UX analyza Kaiser Smart: vse dulezite na 2-3 kliky

Stav analyzy: navrh bez implementace.

Zdroj kontroly: aktualni kod aplikace ve verzi 0.1.213, zejmena `src/data/modules.js`, `src/app.js`, `src/styles.css` a pravidla z `PŘÍRUČKA.md`.

Hlavni zasada: dulezity provozni ukon nesmi byt schovany v hluboke zalozce, dole na strance ani v technickem detailu. Uživatel musi do 2-3 kliku vedet, kde je, co resi a co ma udelat.

## 1. Shrnutí hlavních problémů

1. Aplikace ma hodne modulu na HP, ale ne vsechny jsou stejne dulezite. Hlavni provozni trasy nejsou oddelene od skeletonu a pripravovanych modulu.
2. Datova schranka je spravne hlavni provozni inbox, ale potrebuje jeste jasnejsi tok: firma -> zprava -> priloha -> akce.
3. U datovych zprav jsou prilohy nejdulezitejsi obsah. Musi zustat hned pod hlavickou detailu a otevrit se na 1 klik.
4. Filtr podle firmy/datove schranky musi byt absolutne jednoznacny. Pokud je vybrany Nanolab, nesmi byt videt Kaiser zpravy ani v seznamu, ani v detailu, ani v akcich.
5. AI Boost nesmi byt dalsi obecny chatbot. V Datovce ma byt konkretni pracovni doporuceni nad vybranou zpravou.
6. Akce jako archivace, e-mail, SMS, predani na faktury nebo dispecink zatim nesmi vypadat jako hotove, pokud nemaji backend, audit a potvrzeni.
7. Trasy svozu maji v kodu prilis mnoho zalozek na jedne urovni. To zveda mentalni zatez a pocet hledacich kliku.
8. Mobil musi mit vlastni logiku priorit: seznam -> detail -> prilohy -> hlavni akce. Ne jen zmenseny desktop.

## 2. Největší brzdy v UI

### Brzda 1: modulova HP nema provozni priority

Aktualni stav z kodu: HP sklada moduly z `src/data/modules.js`. Vedle dulezitych modulu jako Datova schranka, Trasy svozu, Vozovy park a Zakaznici/Vistos jsou videt i skeletony nebo rozpracovane moduly.

Problem: uzivatel musi premyslet, co je hotove, co je pilot a co je jen priprava.

Navrh:

- Hlavni menu: Datova schranka, Trasy svozu, Zakaznici/Vistos, Vozovy park, Reporty.
- Sekundarni menu: Uzivatele a role, Nastaveni, Pravidla a automatizace.
- Pripravovane: Hlaseni ridicu, Servis a udrzba, Trasy vzorku, Naklady, pokud nejsou aktivni provozni tok.
- Na HP pridat sekci "Dnes resit" s primarnimi akcemi: Datove zpravy, Urgentni DS, Trasy svozu, Zakaznici, Reporty.

### Brzda 2: Datovka ma dobrou strukturu, ale akce nejsou jeste 2-3 kliky

Aktualni stav z kodu:

- radek zpravy je dvouradkovy,
- ma odesilatele, predmet, datum, badge firmy, prioritu a prilohu,
- klikaci prvek je button,
- detail a modal existuji,
- prilohy jsou v detailu nad obsahem,
- odpoved je jen pracovni navrh a odeslani je disabled.

Problem: hlavni provozni tok musi byt jeste ostrejsi:

1. klik na firmu/datovou schranku,
2. klik na zpravu,
3. klik na prilohu nebo jasnou akci.

Navrh:

- po vyberu firmy zobrazit jasny kontext "NANOLAB / Kaiser / vsechny schranky",
- v radku nechat jen 2 radky,
- prilohu oznacit jako hlavni akci v detailu,
- v detailu mit primarni akce: Otevrit prilohu, AI Boost, Odpovedet, Predat,
- nehotove akce musi byt read-only/disabled s vysvetlenim.

### Brzda 3: Trasy svozu maji moc zalozek na jedne urovni

Aktualni stav z kodu: `COLLECTION_ROUTES_TABS` obsahuje Dashboard, Svozove trasy, Vistos Komunal preview, Rucni import preview, Import preview, Seznam stanovist, K doplneni polohy, Detail stanoviste, Seznam pravidel a automatizace.

Problem: uzivatel musi prochazet dlouhy seznam zalozek a hledat, co je realna prace a co je technicka priprava.

Navrh:

- Primarni zalozky: Trasy, Stanoviste, Kontrola, Import, Pravidla.
- Dashboard sloucit do prehledu nad taby nebo jako prvni panel v Trasy.
- Detail stanoviste ne jako zalozka, ale jako detail otevreny ze seznamu.
- Vistos Komunal preview a Import preview sloucit pod jednu zalozku Import.

### Brzda 4: AI je globalni, ale provozni AI Boost musi byt kontextovy

Aktualni stav z kodu: existuje AI asistent a backendove AI endpointy s potvrzovanim u citlivych akci. V Datovce existuje informacni AI trideni.

Problem: AI Boost musi byt blizko konkretni zpravy, ne obecne mimo kontext.

Navrh:

- v Datovce dat AI Boost do praveho panelu a do detailu zpravy,
- tlacitko "AI Boost" spusti jen analyzu/doporuceni,
- odeslani e-mailu/SMS nebo archivace musi mit samostatne potvrzeni a audit,
- historie "Odeslano AI Boostem" musi byt filtrovana v Reportech nebo v prave karte detailu zpravy.

## 3. Návrh nové logiky 2-3 kliků

### Globalni navigace

Hlavni struktura:

1. Prace dnes
2. Datova schranka
3. Trasy svozu
4. Zakaznici / Vistos
5. Vozovy park
6. Reporty
7. Sprava

Co patri do hlavniho menu:

- Datova schranka
- Trasy svozu
- Zakaznici / Vistos
- Vozovy park
- Reporty

Co patri do sekundarnich akci:

- Pravidla a automatizace
- Importy
- Nastaveni
- Uzivatele a role
- Technicke logy
- Build/verze

Co schovat nebo zmensit:

- skeleton moduly bez provozni funkce,
- velke technicke popisy,
- duplicitni dashboardy, pokud jen opakuji modul,
- detailove technicke informace bez okamzite akce.

### Univerzalni pravidlo pro detail

Kazdy modul ma mit stejnou logiku:

1. seznam / fronta,
2. detail vybrane veci,
3. primarni akce,
4. sekundarni informace.

Na desktopu:

- seznam vlevo,
- detail uprostred,
- akce/stav vpravo.

Na mobilu:

- seznam jako prvni obrazovka,
- detail jako full-screen/modal,
- sticky akce dole: primarni akce, zpet, dalsi.

## 4. Analýza Datové schránky

### Co je aktualne spravne

- Modul je top-level route `/datova-schranka`.
- Zpravy jsou filtrovane podle vybrane datove schranky ve frontend stavu.
- Radek zpravy je dvouradkovy.
- Prvni radek obsahuje odesilatele a firemni badge.
- Druhy radek obsahuje predmet a metadata.
- Neprectene zpravy maji puntik.
- Prilohy jsou vyrazna sekce v detailu nad textem zpravy.
- Modal detailu existuje.
- Odpoved je pripravena jen jako navrh; odeslani je disabled.
- Strankovani a volba 10/20/30 jsou v inboxu.

### Rizika a mezery

1. Firma/datova schranka musi byt zdroj pravdy pro cely tok. Nesmime mit stav, kdy UI ukaze Nanolab a detail/akce pracuji se zpravou Kaiser.
2. Pokud se data nacitaji globalne a teprve pak filtruje frontend, je to UX ok, ale provozne krehke. Lepsi je podporit i API dotaz podle `dataBoxId`, pokud to backend uz umi nebo bude potvrzeno.
3. Tlacitko "Nacist detail" muze pridavat zbytecny krok. Pro dulezitou zpravu ma klik na radek rovnou otevrit detail nebo naplnit stredovy panel bez dalsiho hledani.
4. Otevreni prilohy je hlavni cil. V detailu musi byt videt primarni priloha bez scrollu.
5. Odeslat e-mailem, archivovat, predat na faktury a predat dispecinku nejsou jen UI akce. Potrebuji backend, audit a potvrzeni.

### Idealni dvouradkovy radek zpravy

Radek zustava dvouradkovy:

```text
ODESILATEL                                   [KAISER] [URGENTNI] [Příloha 2]
Predmet zpravy                               29. 6. 2026 10:12
```

Pravidla:

- prvni radek: odesilatel tucne, firemni badge vpravo,
- druhy radek: predmet, datum, pripadne mala informace o prilohach,
- zadny treti radek,
- urgentni stav nesmi vytlacit predmet,
- na mobilu se skryji sekundarni badge, ale firma a predmet zustanou.

### Detail zpravy

Cilove poradi:

1. odesilatel, predmet, firma, datum, stav,
2. Prilohy,
3. obsah/nahled zpravy,
4. AI Boost doporuceni,
5. technicke detaily ve sbalitelnem bloku.

Primarni akce v detailu:

- Otevrit prilohu,
- AI Boost,
- Odpovedet,
- Predat,
- Archivovat.

Bezpecnost:

- Odpovedet muze otevrit navrh.
- Odeslat datovou zpravu nesmi byt dostupne bez potvrzeneho backendu.
- Poslat e-mail/SMS nesmi byt finalni jeden klik.
- Archivace nesmi byt jen frontend stav.

### Filtry

Prioritni filtry:

- firma/datova schranka,
- prijate/odeslane,
- urgentni,
- s prilohou,
- neprectene,
- chyba.

Rozsirene filtry:

- stav,
- priorita,
- lhuta,
- typ,
- odpovedna osoba,
- datum.

Firma/datova schranka ma byt samostatny primarni filtr, ne jen jedna volba mezi ostatnimi.

## 5. Analýza AI Boost

AI Boost nema byt dalsi chat, ale kontextova provozni vrstva.

### Umisteni

V Datovce:

- v prave karte "AI Boost doporucuje",
- v detailu zpravy pod hlavickou a prilohami,
- u urgentnich/pravnich zprav zvyraznit jen strucne doporuceni.

Na HP:

- ne samostatne jako hlavni cil, ale jako pomocnik u provoznich front.

V Reportech:

- historie AI akci,
- filtr "odeslano AI Boostem",
- datum, uzivatel, modul, potvrzena akce, stav.

### Tok AI Boost

Bezpecny tok:

1. klik "AI Boost",
2. zobrazit doporuceni a duvod,
3. vybrat akci,
4. kontrola,
5. potvrzeni,
6. provedeni pres backend,
7. audit a historie.

Zakazane UX:

- "Odeslat e-mail" bez potvrzeni,
- "Archivovat" jen zmenou CSS,
- historie jen ve frontend stavu,
- AI doporuceni bez vysvetleni duvodu.

### Minimalni UI texty

- "AI Boost doporucuje: predat na faktury."
- "Duvod: zprava obsahuje fakturacni podklady a PDF prilohu."
- "Akce neni odeslana. Vyžaduje potvrzeni."
- "Historie AI akci je dostupna v Reportech."

## 6. Analýza mobilního zobrazení

Mobilni priorita:

1. seznam zprav,
2. otevreni zpravy,
3. prilohy,
4. primarni akce,
5. stavove informace.

Navrh pro Datovku:

- radek zpravy zustane dvouradkovy,
- firemni badge zkracene: KAI / NANO,
- detail otevrit jako full-screen modal,
- prilohy hned po hlavicce,
- dole sticky lista: Otevrit prilohu, AI Boost, Odpovedet,
- technicke detaily sbalit.

Navrh pro Trasy svozu:

- taby zmenit na segmentovane menu nebo vyber sekce,
- detail trasy otevrit ze seznamu,
- hlavni akce "Otevrit trasu" a "Zpet na seznam" musi byt stale viditelne.

Navrh pro HP:

- prvni obrazovka: Prace dnes + 4 hlavni moduly,
- skeleton moduly az niz nebo pod "Dalsi moduly",
- zadny horizontalni scroll.

## 7. Tabulka úkonů a počtu kliků

Poznamka: aktualni pocet kliku je odhad z aktualni struktury kodu, pokud nebyl dany tok v teto analyze rucne proklikan v produkci.

| Ukon | Soucasny pocet kliku | Cilovy pocet kliku | Problem | Navrh zmeny | Priorita |
|---|---:|---:|---|---|---|
| Otevrit datovou zpravu | 1-2 | 1 | Klik na radek vybira zpravu, ale detail muze byt vnimany jako dalsi krok pres "Nacist detail". | Klik na radek rovnou otevira detail/panel; na mobilu full-screen detail. | P0 |
| Otevrit prilohu | 2-3 | 2 | Priloha je v detailu, ale musi byt vzdy nad textem a hlavni akce. | V detailu primarni tlacitko "Otevrit" u kazde prilohy, hlavni priloha nahore. | P0 |
| Archivovat zpravu | Nejasne / nehotove | 2-3 | Archivace nesmi byt jen UI, potrebuje backend a audit. | Dat "Archivovat" jako disabled/read-only, po potvrzeni backendu tok: navrh -> potvrzeni -> archiv. | P0 |
| Poslat zpravu e-mailem | Nejasne / nehotove | 3 | Odeslani e-mailu je citliva akce. | "Pripravit e-mail" v detailu, pak kontrola a potvrzeni. Zadny jeden klik. | P0 |
| Spustit AI Boost | 1-2 | 1 | AI existuje globalne, v Datovce musi byt kontextovy. | Tlacitko "AI Boost" primo v detailu a pravem panelu. | P1 |
| Zobrazit zpravy jen pro jednu firmu | 1 | 1 | Vyber schranky existuje, ale musi byt neprehlédnutelny a konzistentni v detailu. | Firma jako primarni filtr + vybrany kontext v hlavicce a v kazdem radku. | P0 |
| Zobrazit urgentni zpravy | 1 | 1 | Rychly filtr existuje, ale musi zustat viditelny i po vyberu firmy. | Pill "Urgentni" vzdy nad seznamem. | P1 |
| Prejit na Trasy svozu | 1 z HP | 1 | Modul existuje, ale HP nema jasne provozni priority. | Dat Trasy mezi hlavni provozni moduly / Prace dnes. | P1 |
| Otevrit detail trasy | 2-3 | 2 | Detail stanoviste je tab, ne prirozeny detail ze seznamu. | Klik na trasu/stanoviste otevira detail, ne samostatna zalozka. | P1 |
| Predat zpravu na faktury | Nehotove | 2-3 | Chybi jasny potvrzeny workflow a backend/audit. | Akce v detailu DS: "Predat na faktury" jako navrh, po potvrzeni backend fronta ukolu. | P0 |
| Predat zpravu na dispecink | Nehotove | 2-3 | Stejne riziko jako faktury. | Akce v detailu DS: "Predat dispecinku" s potvrzenim a audit logem. | P0 |
| Najit odeslane e-maily/SMS AI Boostem | Nejasne | 2 | Historie AI/odeslanych notifikaci neni v Datovce jasne viditelna. | Reporty -> AI Boost historie, filtr podle modulu a typu zpravy. | P1 |
| Najit zakaznika | 1-2 | 2 | Zakaznici/Vistos je skeleton; realny tok neni jasny. | Z hlavni navigace primo do Zakaznici, search jako prvni prvek. | P1 |
| Otevrit ukol | Nejasne | 2 | Uloha neni samostatny hlavni modul/tok. | Zavest pracovni frontu "Ukoly" nebo modulove fronty v pravem panelu. | P1 |
| Predat na fakturaci z DS prilohy | Nehotove | 3 | Fakturace musi mit backend a vazbu na soubor. | Z priloha karty: "Predat na faktury" -> kontrola -> potvrzeni. | P0 |

## 8. Priority P0/P1/P2/P3

### P0 - Kriticke

1. Firma/datova schranka jako pevny kontext pro seznam, detail, prilohy i akce.
2. Prilohy viditelne hned po otevreni zpravy a otevreni na 1 klik z detailu.
3. Zadna finalni akce bez backendu: archivace, e-mail, SMS, predani na faktury/dispecink.
4. Klik na zpravu musi okamzite vest k detailu, ne k nenapadnemu stavu nekde dole.
5. AI Boost nesmi predstirat odeslani, archivaci ani predani bez potvrzeneho backendu a auditu.

### P1 - Vysoka priorita

1. Kompaktni hlavni navigace s provoznimi moduly nahore.
2. Datovka: primarni akce v detailu a pravem panelu.
3. Trasy svozu: zmensit pocet top-level zalozek.
4. Mobilni Datovka: full-screen detail a sticky akce.
5. Historie AI Boost/e-mail/SMS dostupna na 2 kliky z Reportu nebo Datovky.

### P2 - Stredni priorita

1. Lepsi prazdne stavy podle kontextu firmy.
2. Tooltipy u badge a stavu.
3. Klavesove zkratky pro dalsi/predchozi zpravu.
4. Kratsi mikrotexty u technickych stavu.
5. Sbalitelne technicke informace v Datovce a Trasach.

### P3 - Pozdeji

1. Personalizovany dashboard podle role.
2. Pokrocile nastaveni poradi modulu.
3. Vlastni ulozene pohledy filtru.
4. Vetsi redesign navigace cele aplikace.
5. Pokrocile AI workflow napric moduly.

## 9. Doporučený plán implementace

### Faze 1: Datovka 2-3 kliky bez backend zmen

Rozsah:

- zkontrolovat a pripadne doladit klik radku -> detail,
- zvyraznit vybrany firemni kontext,
- udrzet prilohy nad obsahem,
- zviditelnit primarni akci Otevrit prilohu,
- sjednotit pravou kartu: AI Boost, stav, predani, historie.

Bez DB/API zmen, pokud se jen upravuje UI nad existujicimi daty.

### Faze 2: Bezpecny navrh backend workflow pro akce

Rozsah:

- archivace zpravy,
- pripravit e-mail,
- predat na faktury,
- predat dispecinku,
- historie AI Boost/e-mail/SMS.

Tahle faze potrebuje samostatne potvrzeni, protoze meni provozni proces, pravdepodobne API/DB/audit.

### Faze 3: Zjednoduseni navigace a Tras svozu

Rozsah:

- hlavni menu podle provoznich priorit,
- Trasy svozu z 9 zalozek na 5 logickych sekci,
- detail trasy/stanoviste jako detail ze seznamu,
- mobilni navigace bez horizontalniho zmatku.

### Faze 4: Mobilni akce

Rozsah:

- Datovka full-screen detail,
- sticky akce,
- zkracene badge firmy,
- test 320/375/430/768/1024/1440 px.

## 10. Seznam konkrétních změn pro další prompt

### Prompt 1 - Datovka: otevreni, prilohy, kontext firmy

Udelat UI opravu Datovky bez DB/API zmen:

- klik na zpravu otevira detail/panel okamzite,
- vybrana firma/datova schranka je stale viditelna,
- detail nesmi ukazat zpravu z jine schranky,
- prilohy zustanou hned pod hlavickou,
- tlacitko Otevrit prilohu je primarni,
- pokud priloha nema platny odkaz, tlacitko disabled s jasnou hlaskou,
- zadne odesilani, mazani, archivace ani automatizace.

### Prompt 2 - Datovka: AI Boost read-only

Pridat read-only AI Boost kartu:

- doporuceni dalsi akce,
- duvod doporuceni,
- stav "nic se neposila",
- tlacitka akci disabled, pokud chybi backend,
- historie jako odkaz na budouci Reporty/AI historie.

### Prompt 3 - Backend workflow pro akce DS

Navrhnout, ne implementovat bez potvrzeni:

- archivace,
- odeslani e-mailem,
- predani na faktury,
- predani dispecinku,
- audit log,
- opravneni,
- historie.

### Prompt 4 - Trasy svozu: zjednoduseni zalozek

Upravit jen UI navigaci Tras svozu:

- Trasy,
- Stanoviste,
- Kontrola,
- Import,
- Pravidla,
- detail stanoviste otevrit ze seznamu,
- zachovat read-only pilot.

### Prompt 5 - Mobilni 2-3 kliky

Samostatne otestovat mobil:

- Datovka,
- Trasy svozu,
- Zakaznici/Vistos,
- Reporty,
- 320/375/430/768 px,
- zadny horizontalni scroll,
- hlavni akce v dosahu palce.

## Bezpečnostní poznámka

Tato analyza nenavrhuje posilat datove zpravy, e-maily ani SMS z frontendu. Kazda citliva akce musi jit pres schvaleny backend, opravneni, potvrzeni a audit log.
