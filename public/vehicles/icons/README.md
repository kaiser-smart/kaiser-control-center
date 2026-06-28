# Ikony vozidel pro mapu

Finální ikony dodává Radim nebo Martin. Codex nesmí generovat finální obrázky, SVG ikony ani stahovat cizí assety.

## Formát

- primárně PNG s transparentním pozadím
- volitelně WebP s transparentním pozadím
- 3D-look je povolený
- skutečné 3D modely nejsou povolené
- nepoužívat GLB, GLTF, OBJ, animované GIFy, video ani WebGL objekty

## Rozměry

- ideálně 256 x 256 px
- minimálně 128 x 128 px
- v mapě se ikona zobrazuje přibližně 36-48 px
- doporučená velikost souboru do 100 KB na ikonu

## Vzhled

- horní šikmý pohled cca 45 stupňů
- transparentní pozadí
- vozidlo uprostřed
- dostatečný kontrast
- bez SPZ, malých textů a drobných nápisů
- stejný úhel pohledu u všech ikon
- stav vozidla řeší aplikace CSS obrysem a badge, ne samotná ikona

## Očekávané názvy

```text
svozove-vozidlo.png
kontejnerove-vozidlo.png
dodavka.png
specialni-technika.png
osobni-vozidlo.png
prives-naves.png
```

Volitelně lze dodat stejné soubory také jako WebP:

```text
svozove-vozidlo.webp
kontejnerove-vozidlo.webp
dodavka.webp
specialni-technika.webp
osobni-vozidlo.webp
prives-naves.webp
```

Pokud ikona chybí nebo se nenačte, aplikace použije bezpečný CSS fallback marker s textem `KS`.
