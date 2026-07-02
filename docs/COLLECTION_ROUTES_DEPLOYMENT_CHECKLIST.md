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
- NEZACATO - ostry import do planovacich tabulek.
- BLOKOVANO - kontaktni osoby a SMS pole 15/30/60 jeste nejsou potvrzene.

## Smlouvy Komunal

- HOTOVO - filtr pro preview: `Status_FK = 74`, `Typsmlouvy_FK = [14735]`.
- ROZPRACOVANO - datumova platnost se kontroluje v backend preview.
- NEZACATO - stabilni svozove patterny podle smlouvy.

## Stanoviste

- ROZPRACOVANO - preview uklada stanoviste do pilotnich tabulek.
- ROZPRACOVANO - chybejici poloha jde do datovych problemu.
- ROZPRACOVANO - Svozove trasy maji read-only panel radku k oprave pro chybejici adresy ve zdrojovych 13 Excelech.
- NEZACATO - rucni potvrzeni GPS polohy.

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
- NEZACATO - fronta rucniho potvrzeni polohy.

## Planovani tras

- NEZACATO - Faze 1E neplanuje svozove dny.
- NEZACATO - stabilni tydenni/mesicni patterny.

## Denni trasy

- NEZACATO - zadne denni behy tras.
- NEZACATO - zadne optimalizovane poradi zastavek.

## Ridicsky tablet

- NEZACATO - tabletovy rezim bude samostatna faze.

## T-Cars

- NEZACATO - Faze 1E nevola T-Cars.
- NEZACATO - alert vychyleni z trasy.

## Notifikace

- NEZACATO - zadne SMS ani e-maily.
- NEZACATO - zadne temporary tracking linky.

## Evidence odpadu

- NEZACATO - zadny zapis do Evidence odpadu.

## Vazni listky

- NEZACATO - model a upload vaznich listku bude samostatna faze.

## PDF offline

- ROZPRACOVANO - read-only PDF/tiskovy nahled aktualniho filtru Svozovych tras obsahuje souhrn, zdrojovy Excel/list/radek a Vistos match problem.
- ROZPRACOVANO - read-only ridicsky tiskovy nahled aktualniho filtru ukazuje prakticky seznam zastavek bez navigace, GPS, T-Cars, potvrzovani svozu a ostre trasy.
- ROZPRACOVANO - chytry filtr Auto A/B/C dnes, zitra a pozitri nastavuje den, sudy/lichy tyden a auto pro tiskovy nahled; trasu neplanuje a nic nezapisuje.
- ROZPRACOVANO - chytry filtr pro tisk ma samostatne volby Termin, Auto a Odpad; odpadovy filtr zustava soucasti tiskove trasy.
- NEZACATO - skutecny offline ridicsky balicek pro vypadek internetu bude samostatna faze.

## Automatizace

- NEZACATO - pro Trasy svozu zatim zadny cron/worker/queue.
- NEZACATO - pred ostrou automatizaci musi existovat cloud runner, dedupe a audit.

## Produkce

- ROZPRACOVANO - produkcni read-only pilot existuje.
- OVERENO - Faze 1E read-only import 13 Excelu a Vistos match byly overeny na produkci pro batch z 2026-07-02.
- NEZACATO - produkcni ostry import / planovani / notifikace.
