# Smart design projekt

Tento dokument je navazovací záznam pro samostatnou designovou větev Smart Odpady. Slouží k tomu, aby šlo příště pokračovat v návrhu vzhledu bez hledání kontextu od nuly.

## Stav

- Název pracovního projektu: Smart design
- Větev v GitHubu: `codex/design-preview-2026-07`
- Produkční `main`: neměnit v rámci designového experimentu
- Veřejný design náhled: https://kaiser-smart-design-preview.pages.dev/
- Cloudflare Pages projekt pro veřejný náhled: `kaiser-smart-design-preview`
- Účel veřejné URL: pouze hodnocení vizuální stránky kolegy, kteří nepracují na kódu
- Zdroj veřejného statického náhledu v repu: `design/smart-design-preview/index.html`
- Build veřejného statického náhledu: `npm run build:smart-design`

## Bezpečnostní hranice

- Neměnit produkci Smart Odpady.
- Neměnit `main` bez samostatného schválení.
- Neměnit API, databázi, Cloudflare bindings, secrets ani oprávnění.
- Nepřidávat provozní data do náhledu.
- Veřejný design náhled musí zůstat statický: HTML/CSS, bez aplikačního JavaScriptu a bez API.
- Náhled může obsahovat ukázkový text a orientační UI prvky, ale nesmí vypadat jako živý provozní systém.

## Co už vzniklo

- Nová CSS vrstva v `src/styles/theme.css`.
- Opt-in design scope přes `.theme-system` a `.smart-tablet-ui`.
- Náhledová route v aplikaci: `/design/theme-system`.
- Build skript zná route `/design/theme-system`.
- Veřejný samostatný Cloudflare Pages náhled bez přihlášení.
- Samostatný statický zdroj veřejného náhledu v `design/smart-design-preview/`.
- Druhá designová iterace podle neumorfních slider/switch/dial referencí.

## Dotčené soubory

- `src/styles/theme.css`
  - centrální theme proměnné
  - light/dark mode
  - komponentové třídy pro karty, panely, tlačítka, navigaci, badge, formuláře, seznamy a rychlé akce
- `src/app.js`
  - route `/design/theme-system`
  - statický náhled tabletového UI
- `scripts/build.mjs`
  - zařazení preview routy do statického buildu
- `index.html`
  - napojení `src/styles/theme.css`
- `design/smart-design-preview/index.html`
  - statický veřejný HTML náhled bez napojení na Smart Odpady aplikaci
- `scripts/build-smart-design-preview.mjs`
  - sestavení veřejného statického náhledu do `dist-smart-design-preview`
- `package.json`
  - příkaz `build:smart-design`

## Aktuální hodnocení

Náhled je zachovaný jako pracovní pokus, ale zatím není finální. Směr je použitelný pro další iteraci, ne pro převzetí do produkční aplikace.

Aktuální směr po druhé iteraci:

- měkčí fyzické ovládací prvky
- slider inspirovaný dodanou Pug/SCSS referencí
- switch prvky inspirované slider v1/v2 referencí
- kruhový dial inspirovaný teplotním ovladačem
- aktivní modrý stav pro ovládací prvky
- Kaiser zelená zůstává spíš jako pozitivní/provozní stav

Co zatím není ono:

- celkový vizuální charakter je pořád pracovní a nemusí být finální Smart Odpady
- ikonografie není dořešená
- layout je spíš demonstrační než produktový
- barvy, kontrasty a karty bude potřeba dál ladit podle reálných obrazovek

## Jak příště navázat

1. Checkout větve:

   ```bash
   git fetch origin
   git checkout codex/design-preview-2026-07
   git pull
   ```

2. Přečíst:

   - `PŘÍRUČKA.md`
   - `docs/SMART_DESIGN_PROJECT.md`

3. Spustit lokálně:

   ```bash
   npm run build
   npm run dev
   ```

4. Otevřít náhled:

   ```text
   /design/theme-system
   ```

5. Po další iteraci znovu nasadit pouze veřejný statický design náhled na:

   ```text
   https://kaiser-smart-design-preview.pages.dev/
   ```

   Sestavení statického náhledu:

   ```bash
   npm run build:smart-design
   ```

## Doporučený další krok

Další iterace by měla řešit pouze vizuální stránku:

- zjednodušit layout
- doladit tvary karet
- připravit reálnější tabletovou obrazovku pro řidiče
- doplnit pracovní sadu ikon vozidel
- porovnat light a dark mode
- zachovat vše jako náhled mimo produkci

## Co nedělat v další iteraci

- nepřepisovat stávající obrazovky Smart Odpady
- neměnit produkční data
- nenapojovat API
- neměnit autentizaci
- nenasazovat do produkce Smart Odpady
- nemazat starý vzhled

## Poznámka k veřejnému náhledu

Veřejná URL slouží jen pro designovou zpětnou vazbu. Pokud bude potřeba náhled aktualizovat, musí zůstat oddělený od hlavního projektu Smart Odpady a nesmí obcházet Cloudflare Access na chráněných preview URL hlavní aplikace.
