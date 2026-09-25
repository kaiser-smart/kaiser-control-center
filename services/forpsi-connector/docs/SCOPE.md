# Konsolidované zadání

Zdroj: postupné požadavky uživatele v tomto úkolu. Žádná pozdější položka nenahrazuje předchozí.

Požadované oblasti:

1. Pošta: hledat, číst, odesílat, psát, třídit, mazat, vytvářet složky, plánovat odeslání.
2. Štítky a pravidla: vytvářet, editovat, přidělovat.
3. Kalendář.
4. Soubory.
5. Úkoly.
6. Poznámky.
7. Podpisy.
8. Adresář.

Cílové prostředí: firemní použití v ChatGPT pro Radima a kolegy; smart-odpady.ai / GitHub / Cloudflare.

## Pracovní návrh dalších operací, dosud neimplementovaných

Tento seznam rozvíjí obecně pojmenované oblasti; není tvrzením, že uživatel schválil konkrétní ostrou akci.

- Soubory: přehled, hledání, čtení/stažení, nahrání, složky, přesun, přejmenování a smazání.
- Úkoly: seznamy, termíny, priority, přiřazení, vytvoření, změna, dokončení a smazání.
- Poznámky: hledání, čtení, vytvoření, změna a smazání.
- Podpisy: seznam, vytvoření, změna, výběr pro schránku a vložení do konkrétní zprávy.
- Pošta: úprava existujícího konceptu, přílohy, odpovědi a přeposílání se zachováním vláken.
- Štítky/pravidla: ověřit požadovanou interoperabilitu s nativním webmailem Forpsi a automatický běh pravidel.
- Kalendář: případné opakování, celodenní události, účastníci a pozvánky vyžadují samostatné rozšíření.

Pro nativní data je zdrojem pravdy Forpsi. Vlastní data konektoru se vždy označují
`storage: connector`; nejde o skrytou náhradu nativních modulů Forpsi.
