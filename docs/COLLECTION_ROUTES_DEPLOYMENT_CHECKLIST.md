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
- ROZPRACOVANO - Vistos Svoz Kaiser ma read-only hlidace dat; cerveny HP badge a cervene stanoviste se zapnou az po potvrzenem API poli `Svoz Kaiser ANO`. Do te doby se sirsi Komunal kontrola zobrazuje jen jako diagnostika bez cervene chyby.
- ROZPRACOVANO - Novy cil tras: Vistos API je zdroj svozovych radku, 13 Excelu zustava jen pomocne parovani vozidel A/B/C.
- NEZACATO - ostry import do planovacich tabulek.
- BLOKOVANO - kontaktni osoby a SMS pole 15/30/60 jeste nejsou potvrzene.

## Smlouvy Komunal

- HOTOVO - filtr pro preview: `Status_FK = 74`, `Typsmlouvy_FK = [14735]`.
- ROZPRACOVANO - datumova platnost se kontroluje v backend preview.
- NEZACATO - stabilni svozove patterny podle smlouvy.

## Stanoviste

- ROZPRACOVANO - preview uklada stanoviste do pilotnich tabulek.
- ROZPRACOVANO - zalozka Stanoviste ukazuje radkovy read-only seznam z Vistos Komunal exportu; bez Excel pracovnich textu, bez zapisu do Vistosu a bez ostrych tras.
- ROZPRACOVANO - chybejici poloha jde do datovych problemu.
- ROZPRACOVANO - Svozove trasy maji read-only panel radku k oprave pro chybejici adresy ve zdrojovych 13 Excelech.
- ROZPRACOVANO - Svozove trasy maji read-only frontu rucniho potvrzeni polohy v Mapa / GPS; bez geokodovani, bez zapisu GPS a bez navigace.

## Nadoby

- ROZPRACOVANO - preview se pokousi odvodit objem a pocet z produktu/polozky.
- ROZPRACOVANO - Svozove trasy maji read-only panel radku k oprave pro chybejici nadoby ve zdrojovych 13 Excelech.
- BLOKOVANO - presne strukturovane pole nadoby musi byt potvrzene na datech.

## Cetnosti

- ROZPRACOVANO - preview odvozuje `1x7`, `2x7`, `3x7`, `5x7`, `1x14`, `1x30`.
- ROZPRACOVANO - Svozove trasy maji read-only panel radku k oprave pro chybejici frekvenci ve zdrojovych 13 Excelech.
- BLOKOVANO - rozpor PAPIR `1x30` vs. "1x tydne" musi potvrdit Radim/Martin.

## Kontakty

- BLOKOVANO - presna API vazba kontaktu neni potvrzena.
- NEZACATO - import kontaktu pro notifikace.

## SMS pole 15/30/60

- BLOKOVANO - pole se musi ve Vistosu teprve vytvorit.
- NEZACATO - mapovani SMS priznaku do Kaiser Smart.

## Geokodovani

- NEZACATO - Google geokodovani neni ve Fazi 1E povolene.
- HOTOVO - Faze 2A ukazuje read-only GPS/mapovou pripravenost aktualniho filtru bez geokodovani, bez zapisu GPS a bez navigace.
- ROZPRACOVANO - fronta rucniho potvrzeni polohy ukazuje stanoviste k overeni podle aktualniho filtru; nic neuklada a nespousti geokodovani.

## Planovani tras

- NEZACATO - Faze 1E neplanuje svozove dny.
- NEZACATO - stabilni tydenni/mesicni patterny.

## Denni trasy

- NEZACATO - zadne denni behy tras.
- ROZPRACOVANO - Svozove trasy maji read-only navrh idealniho poradi nad aktualnim filtrem; Smart sklada navrh, Google/Waze zustava jen budouci navigace na dalsi stanoviste.
- NEZACATO - zadne ostre optimalizovane poradi zastavek.

## Ridicsky tablet

- ROZPRACOVANO - Faze 2C ma v hlavni zalozce Svozove trasy tlacitko Ridicsky tablet a read-only kabinovy rezim aktualniho filtru; nic nepotvrzuje, nezapisuje, nespousti GPS, T-Cars, navigaci, SMS/e-maily, automatizace ani ostre trasy.
- ROZPRACOVANO - Faze 2D ma dokumentovany navrh ostreho tabletoveho rezimu vcetne DB/API/auditu/offline sync/GPS/T-Cars bran, ale bez implementace zapisu.
- NEZACATO - ostry tabletovy rezim s potvrzovanim svozu, fotkami, GPS stopou, offline synchronizaci a dispecerskym auditem.

## T-Cars

- NEZACATO - Faze 1E nevola T-Cars.
- NEZACATO - Faze 2A stale nevola T-Cars; ukazuje jen pripravenost zastavek z 13 Excelu.
- NEZACATO - alert vychyleni z trasy.

## Notifikace

- NEZACATO - zadne SMS ani e-maily.
- NEZACATO - zadne temporary tracking linky.

## Evidence odpadu

- NEZACATO - zadny zapis do Evidence odpadu.

## Vazni listky

- NEZACATO - model a upload vaznich listku bude samostatna faze.

## PDF offline

- HOTOVO - hlavni zalozka Svozove trasy je uklizena na read-only tiskovy filtr, souhrn a ridicsky nahled; technicka sprava je v zalozce Sprava dat tras.
- HOTOVO - read-only PDF/tiskovy nahled aktualniho filtru Svozovych tras obsahuje souhrn, zdrojovy Excel/list/radek a Vistos match problem.
- HOTOVO - read-only ridicsky tiskovy nahled aktualniho filtru ukazuje prakticky seznam zastavek vcetne odpadu, nadoby, frekvence a poznamky bez navigace, GPS, T-Cars, potvrzovani svozu a ostre trasy.
- HOTOVO - chytry filtr Auto A/B/C dnes, zitra a pozitri nastavuje den, sudy/lichy tyden a auto pro tiskovy nahled; trasu neplanuje a nic nezapisuje.
- HOTOVO - chytry filtr pro tisk ma samostatne volby Termin, Auto a Odpad; odpadovy filtr zustava soucasti tiskove trasy.
- OVERENO - Faze 2B ma frontendovy offline ridicsky balicek aktualniho filtru jako samostatny HTML soubor; Radim overil tisk, detailni PDF a offline balicek v produkci 2026-07-05. Bez navigace, GPS, T-Cars, potvrzovani svozu, SMS/e-mailu, automatizaci a ostrych tras.

## Automatizace

- NEZACATO - pro Trasy svozu zatim zadny cron/worker/queue.
- NEZACATO - pred ostrou automatizaci musi existovat cloud runner, dedupe a audit.
- BLOKOVANO - Faze 2D ostrych zapisu vyzaduje samostatne potvrzeni DB migraci, API smlouvy, roli, auditnich pravidel a konfliktni logiky.

## Produkce

- ROZPRACOVANO - produkcni read-only pilot existuje.
- OVERENO - Faze 1E read-only import 13 Excelu a Vistos match byly overeny na produkci pro batch z 2026-07-02.
- NEZACATO - produkcni ostry import / planovani / notifikace.
