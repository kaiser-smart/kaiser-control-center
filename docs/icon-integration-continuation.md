# Pokračování kontroly a nové zadání

Oprava z commitu ac6e5e01 byla beze konfliktů přenesena na produkční základ 0.1.853, `2d5668827d439298226d6852901526decb343638`. Aktuální implementační commit je `433a2caf071522e113a600c91715b927dc48e169`, větev `codex/approved-icon-integration-current`. Produkce nebyla změněna. Rozdíl 0.1.851 → 0.1.853 neobsahuje změny kontrolovaných komponent ikon, mobilního CSS ani navigace.

Nově ověřeno na aktuálním základu: build 52 cest, 21 cílených testů bez chyb, 20 WebKit obrazovek (dvě role, dvě obrazovky, pět šířek) bez JS chyb, všech 105 SVG načtených a validních. Znovu prověřeny focus/disabled/scroll, syntetická safe area a existující chování při OS dark a tmavé paletě mapy. Důkazy: `current-base/` a `work/icon-integration-fix/output/current-base-*.log` v pracovním prostoru.

## Původ ostatních symbolů

Katalog `source-catalog.html` a `source-catalog.json` obsahuje všech 69 ikon, 6 s doloženým schváleným zdrojem a 63 dosavadních generovaných symbolů. V OpenArt byly živě ověřeny reprezentativní záznamy obou historických generací (4 záznamy, `openart-followup-readback.json`). Jejich existence ani stav COMPLETED nedokládají schválení konkrétní kresby.

Uživatel nyní výslovně odpověděl: **„Ano, vytvořit 63 ikon podle originálu“**. Tím je znovu povoleno generování těchto 63 ikon. Zákaz produkčního nasazení trvá. Plán generování je v `regeneration-plan.json`: 11 listů, reference přímo schválená příloha, žádný odvozený tenký master. Nové výsledky musejí projít kontrolou, vektorizací a testy před začleněním; nelze je předem označovat za hotové nebo schválené.

## Tyrkysové plochy

V dodaném JPEG 945 × 2048 je tyrkysový nádech skutečně obsažen v pixelech. Hranice přibližně x=504 prochází i systémovým stavovým řádkem nad záhlavím aplikace; další přechody jsou u y=504 a y=1512 a neodpovídají hranicím karet. Naměřené vzorky jsou v `cyan-pixel-evidence.json`. Toto oslabuje hypotézu běžného pozadí konkrétní karty, ale neprokazuje konkrétní chybu zařízení, kompozitoru ani přenosu obrázku. CSS nebylo na základě domněnky měněno. Fyzický iPhone/PWA zůstává neověřený a tento bod není uzavřen.

## Návrat izolované implementace

Na větvi obsahující aktuální implementaci: `git revert 433a2caf071522e113a600c91715b927dc48e169`. Produkční rollback není potřebný, protože k nasazení nedošlo. Před budoucím nasazením znovu ověřit aktuální hlavní větev a release guard.
