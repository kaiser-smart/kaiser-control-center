# Tenké ikony OpenArt — 0.1.849

Produkce používala silnou ručně kreslenou sadu i po dokončení nové generace. Tato změna nahrazuje geometrii všech 69 sdílených ikon přímo trasovanými výstupy OpenArt. Předlohou je šestice WBQuydSLHFxFXvYBRwLR a 11 navazujících listů; identitu každého zdroje, výřez a SHA-256 zaznamenávají openart-source-input.json a icon-provenance.json.

SVG používají vyplněné obrysy bez přidaného tahu, jinak by se tenká kresba znovu zesílila. Zůstává grafitová #243128 a zelená #75BD25, textové popisky a systémové vysokokontrastní barvy. Aplikace nepřidává běhové závislosti.

Převod: scripts/trace-openart-icons.mjs se zdrojovou složkou obsahující sources/<historyId>.png; build-time Potrace 2.1.8, Python Pillow/numpy/opencv. Kontrola: scripts/icon-system.test.mjs, scripts/render-openart-proof.mjs a scripts/check-openart-fidelity.py. Všech 69 porovnání prošlo: nejhorší 95. percentil odchylky hran je 0.09375 px při velikosti 24 px, maximální průměrná RGB odchylka v rozměrech 20/24/28 px je 3.484 z 255.

Základem je produkční main a33f135a (0.1.848). Změna neupravuje backend, oprávnění, databázi, Zakázky ani samostatné rozložení mapy. Mapový modul má vlastní vizuální sadu vozidel a zůstává zachovaný. Fyzický iPhone nebyl testován; mobilní kontroly používají WebKit.
