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
