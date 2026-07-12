# CHECKLIST NASAZENI - Trasy svozu

Stavy:

- NEZACATO
- ROZPRACOVANO
- HOTOVO
- OVERENO
- BLOKOVANO

Tento checklist hlida, aby modul Trasy svozu nevypadal jako hotova ostra funkce
drive, nez ma DB, API, cloud automatizace, audit, opravneni a produkcni overeni.

## Vistos data

- ROZPRACOVANO - read-only API discovery existuje.
- ROZPRACOVANO - Faze 1E nacita Komunal preview pres backend/secrets.
- ROZPRACOVANO - Vistos Svoz Kaiser ma read-only metadata overeni pole `Svoz Kaiser ANO` pres `GetSchemaEntity` a `DbColumn`; cerveny HP badge a cervene stanoviste se zapnou jen nad potvrzenym Svoz Kaiser rozsahem.
- HOTOVO - Hlidac uz nepocita chyby nad celym aktivnim Komunalem, pokud pole `Svoz Kaiser ANO` neni potvrzene nebo nema zadne radky ANO.
- ROZPRACOVANO - Hlidac Svoz Kaiser kontroluje konzistenci Adresniho mista, intervalu odvozu, svozovych dnu, sudeho/licheho rezimu a platnosti Svoz od/do jen read-only nad radky `Svoz Kaiser ANO`.
- ROZPRACOVANO - Novy cil tras: Vistos API je zdroj svozovych radku, 13 Excelu zustava jen pomocne parovani vozidel A/B/C.
- ROZPRACOVANO - Faze 2D-A kopiruje jen vybrane overene radky do nemenneho denniho D1 navrhu; nejde o zapis zpet do Vistosu ani automaticky import.
- BLOKOVANO - kontaktni osoby a SMS pole 15/30/60 jeste nejsou potvrzene.

## Smlouvy Komunal

- HOTOVO - filtr pro preview: `Status_FK = 74`, `Typsmlouvy_FK = [14735]`.
- ROZPRACOVANO - datumova platnost se kontroluje v backend preview.
- NEZACATO - stabilni svozove patterny podle smlouvy.

## Stanoviste

- HOTOVO - oddelena sada TEST Brno 500 obsahuje 500 jedinecnych verejnych adresnich bodu Brna s GPS; zadny radek se nezapisuje do Vistosu ani hlavni D1.
- ROZPRACOVANO - preview uklada stanoviste do pilotnich tabulek.
- ROZPRACOVANO - zalozka Stanoviste ukazuje radkovy read-only seznam z Vistos Komunal exportu; bez Excel pracovnich textu, bez zapisu do Vistosu a bez ostrych tras.
- ROZPRACOVANO - zalozka Stanoviste nacita Vistos read-only data automaticky bez rucniho refresh workflow pro bezne uzivatele.
- ROZPRACOVANO - chybejici poloha jde do datovych problemu.
- ROZPRACOVANO - Svozove trasy maji read-only panel radku k oprave pro chybejici adresy ve zdrojovych 13 Excelech.
- NEZACATO - rucni potvrzeni GPS polohy.

## Nadoby

- HOTOVO - TEST Brno 500 pouziva vyhradne schvalene objemy 120, 240 a 1100 l.
- ROZPRACOVANO - preview se pokousi odvodit objem a pocet z produktu/polozky.
- ROZPRACOVANO - Svozove trasy maji read-only panel radku k oprave pro chybejici nadoby ve zdrojovych 13 Excelech.
- BLOKOVANO - presne strukturovane pole nadoby musi byt potvrzene na datech.

## Cetnosti

- HOTOVO - TEST Brno 500 obsahuje vsechny schvalene cetnosti `1x7`, `2x7`, `3x7`, `5x7`, `1x14`, `1x30`; `1x30` denni planovac bez konkretniho data zamerne vyradi.
- ROZPRACOVANO - preview odvozuje `1x7`, `2x7`, `3x7`, `5x7`, `1x14`, `1x30`.
- ROZPRACOVANO - Svozove trasy maji read-only panel radku k oprave pro chybejici frekvenci ve zdrojovych 13 Excelech.
- BLOKOVANO - rozpor PAPIR `1x30` vs. "1x tydne" musi potvrdit Radim/Martin.

## Kontakty

- HOTOVO - synteticke firmy TEST maji kontakty `RadimN TestN`; skutecny telefon a e-mail jsou jednotne serverove cile, nehodnoty ve frontendovem kodu.
- BLOKOVANO - presna API vazba kontaktu neni potvrzena.
- NEZACATO - import kontaktu pro notifikace.

## SMS pole 15/30/60

- BLOKOVANO - pole se musi ve Vistosu teprve vytvorit.
- NEZACATO - mapovani SMS priznaku do Kaiser Smart.

## Geokodovani

- NEZACATO - Google geokodovani neni ve Fazi 1E povolene.
- HOTOVO - Faze 2A ukazuje read-only GPS/mapovou pripravenost aktualniho filtru bez geokodovani, bez zapisu GPS a bez navigace.
- NEZACATO - fronta rucniho potvrzeni polohy.

## Planovani tras

- HOTOVO - Faze 2D-A overi rucne zvolene datum proti potvrzenemu dni a sudemu/lichemu tydnu aktualniho snapshotu.
- NEZACATO - stabilni tydenni/mesicni patterny.

## Denni trasy

- HOTOVO - Management/Admin muze prepnout denni planovac do `TEST Brno 500`; behy a zastavky se ukladaji vyhradne v samostatne TEST D1.
- HOTOVO - migrace 0038 a chranene API ukladaji nemenny denni beh, kopii zastavek, vozidlo, ridice, stav a audit udalosti.
- HOTOVO - dispecer muze navrh overit, ulozit, priradit ridice, potvrdit, zahajit, dokoncit a znovu otevrit; hotovou/problemovou zastavku muze vratit do planu.
- HOTOVO - stejny zdrojovy radek nelze zaradit dvakrat ve stejny den a pro jeden den/vuz muze existovat jen jedna trasa.
- HOTOVO - Faze 2D-B uklada 900 zastavek v 236 D1 operacich a 1000 zastavek v 261 operacich; zustava pod internim testovacim stropem 300 operaci.
- HOTOVO - dispecersky detail ukazuje prvnich 10 zastavek, umi hledat podle firmy, ulice, odpadu a stavu a vsechny zastavky rozbali az na vyzadani; ridicsky seznam zustava strankovany po 100.
- HOTOVO - zatezove testy pokryvaji 60, 300, 900 a 1000 zastavek bez zmeny DB schematu, Vistosu nebo opravneni.
- NEZACATO - zadne optimalizovane poradi zastavek.

## Ridicsky tablet

- ROZPRACOVANO - Faze 2C ma v hlavni zalozce Svozove trasy tlacitko Ridicsky tablet a read-only kabinovy rezim aktualniho filtru; nic nepotvrzuje, nezapisuje, nespousti GPS, T-Cars, navigaci, SMS/e-maily, automatizace ani ostre trasy.
- HOTOVO - Faze 2D-A ma samostatny online pohled prirazeneho ridice; role Ridic neziskala pristup k celemu Vistos snapshotu.
- HOTOVO - `HOTOVO`, `Problem`, `Vyklop` a `Pauza` se ukladaji do D1 s idempotency klicem, stavem pred/po, akterem a serverovym casem; reload nacte ulozeny stav.
- NEZACATO - fotky, GPS stopa a offline synchronizace.

## T-Cars

- NEZACATO - Faze 1E nevola T-Cars.
- NEZACATO - Faze 2A stale nevola T-Cars; ukazuje jen pripravenost zastavek z 13 Excelu.
- NEZACATO - alert vychyleni z trasy.

## Notifikace

- HOTOVO - pouze pro TEST Brno 500 existuje rucne potvrzena idempotentni uloha skutecnych SMS a e-mailu na jeden chraneny kontakt; zalozeni dat ani trasy nic neposila.
- HOTOVO - castecna TEST uloha se po reloadu obnovi a muze zopakovat jen failed kanal bez provider ID; jiz odeslany e-mail se znovu neposle a nova uplna davka je zablokovana.
- ROZPRACOVANO - prvni produkcni e-mail odesel a je v auditu; jedina SMS selhala pred Twiliem. Migrace 0032 je aplikovana a provozni rezim SMS je po samostatnem potvrzeni nastaveny na `live`; bezpecne opakovani jedine failed SMS zatim nebylo spustene.
- NEZACATO - ostre zakaznicke SMS a e-maily podle kontaktu z Vistosu.
- NEZACATO - zadne temporary tracking linky.

## Evidence odpadu

- NEZACATO - zadny zapis do Evidence odpadu.

## Vazni listky

- NEZACATO - model a upload vaznich listku bude samostatna faze.

## PDF offline

- HOTOVO - hlavni zalozka Dnesni trasy obsahuje pouze provozni prehled, vytvoreni trasy a detail; tisk, PDF, offline balicek a zdrojovy Vistos prehled jsou schovane pod Dalsi moznosti.
- HOTOVO - read-only PDF/tiskovy nahled aktualniho filtru Svozovych tras obsahuje souhrn, zdrojovy Excel/list/radek a Vistos match problem.
- HOTOVO - read-only ridicsky tiskovy nahled aktualniho filtru ukazuje prakticky seznam zastavek vcetne odpadu, nadoby, frekvence a poznamky bez navigace, GPS, T-Cars, potvrzovani svozu a ostre trasy.
- HOTOVO - chytry filtr Auto A/B/C dnes, zitra a pozitri nastavuje den, sudy/lichy tyden a auto pro tiskovy nahled; trasu neplanuje a nic nezapisuje.
- HOTOVO - chytry filtr pro tisk ma samostatne volby Termin, Auto a Odpad; odpadovy filtr zustava soucasti tiskove trasy.
- OVERENO - Faze 2B ma frontendovy offline ridicsky balicek aktualniho filtru jako samostatny HTML soubor; Radim overil tisk, detailni PDF a offline balicek v produkci 2026-07-05. Bez navigace, GPS, T-Cars, potvrzovani svozu, SMS/e-mailu, automatizaci a ostrych tras.

## Automatizace

- NEZACATO - pro Trasy svozu zatim zadny cron/worker/queue.
- HOTOVO - TEST odesilani je pouze rucni backendova uloha po nejvyse 5 zastavkach na volani; zadny cloudovy casovac ji nemuze spustit.
- NEZACATO - pred ostrou automatizaci musi existovat cloud runner, dedupe a audit.
- HOTOVO - Faze 2D-A byla samostatne potvrzena; D1/API/opravneni/audit jsou implementovane bez cronu, workeru a queue.

## Produkce

- ROZPRACOVANO - produkcni read-only pilot existuje.
- OVERENO - Faze 1E read-only import 13 Excelu a Vistos match byly overeny na produkci pro batch z 2026-07-02.
- OVERENO - Faze 2D-A, migrace 0038 a verze 0.1.519 byly 2026-07-12 overeny v produkci: prihlaseny dispecersky pohled, prazdny vychozi stav, ochrana API a responzivita desktop/tablet/mobil; po overeni zustalo 0 tras, 0 zastavek a 0 udalosti.
- NEZACATO - produkcni overeni Faze 2D-B a verze 0.1.520.
- ROZPRACOVANO - TEST Brno 500 verze 0.1.524 je v produkci v samostatne TEST D1: 500 stanovist, 1 trasa, 198 zastavek a 1 odeslany e-mail jsou overene. Bezpecne opakovani jedine failed SMS je pripraveno ve verzi 0.1.526; rezim `live` je nastaveny, ale opakovani zatim nebylo spustene.
- ROZPRACOVANO - verze 0.1.528 presouva TEST Brno 500, TEST trasy a skutecne testovaci zpravy do samostatne sekce Sprava; hlavni dispecerska zalozka je bez TEST dat a dlouhe Vistos tabulky a detail ukazuje skutecne jen prvnich 10 zastavek.
- NEZACATO - produkcni ostry import / planovani / notifikace.
