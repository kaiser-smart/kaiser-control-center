# PODMÍNKY PROJEKTU SMART ODPADY

## 1. Hlavní pravidlo

Tento soubor má přednost před běžným zadáním.

Pokud je zadání v rozporu s tímto souborem, zastav práci a upozorni na rozpor.

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

Přes jaký nástroj / příkaz se data posílají do GitHubu:

Přes Git příkazem:

```bash
git push origin <nazev-vetve>
```

Produkční větev / nasazení posílat až po výslovném potvrzení Radima.

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
