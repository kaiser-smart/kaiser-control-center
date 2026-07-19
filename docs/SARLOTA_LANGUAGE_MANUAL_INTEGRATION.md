# Jazykový a výslovnostní manuál Šarloty – integrační záznam

## Zdroj

- Vstup: `Sarlota_kompletni_jazykovy_a_vyslovnostni_manual.txt`
- Autor vstupu: Radim Opluštil
- Verze zdroje: 1.0
- Rozsah zdroje: 1 553 řádků
- Datum integrace: 19. 7. 2026
- Kanonický runtime prompt: `src/sarlota/sarlotaSystemPrompt.js`

## Co je v hlavním promptu aktivní

- český ženský rod Šarloty;
- tykání interním ověřeným uživatelům a bezpečné vykání zákazníkům;
- jedna až dvě krátké věty a nejvýše jedna otázka;
- správný 5. pád jen při ověřeném tvaru jména;
- správný rod, číslo, pád, shoda a tvary `bys`, `kdybys`, `abys`;
- pomalejší čtení čísel, dat, časů, jednotek, kontaktů a identifikátorů;
- zachování počátečních nul a zákaz domýšlení znaků;
- přirozené čtení data, času, rozsahu a jednotek;
- bezpečné diktování e-mailu, telefonu, SPZ a dlouhých identifikátorů;
- zopakování nejistého údaje a přechod na vizuální výběr po druhém neúspěchu;
- okamžité opuštění staré hodnoty po opravě uživatelem;
- zákaz automatického výběru při rozporných backendových údajích;
- bezpečné přerušení nebo dokončení rozpracovaného zápisu při změně tématu;
- oddělení oficiálního zápisu od výslovnostního aliasu;
- krátké aktivní věty bez interního technického žargonu;
- bezpečnostní sdělení bez humoru a bez neověřené diagnózy;
- rozlišení připravené a skutečně provedené akce;
- fyzické potvrzení v KSO pro provozní účinky.

## Co se do runtime promptu nekopíruje doslova

- dlouhá učebnicová pravidla pravopisu, která zvyšují latenci bez přímého provozního přínosu;
- příkladová jména, vozidla, SPZ, počasí, trasy a počty stanovišť jako možná fakta;
- příklady, které tvrdí uložení, odeslání nebo předání bez potvrzeného výsledku backendu;
- navigační věty, které by mohly být zaměněny za pokyn HERE navigace;
- zdravotní důvody nepřítomnosti;
- automatické ukončení rozhovoru po dokončení jednoho kroku.

## Výslovnostní slovník

Zdroj doporučuje aliasy například pro Kaiser, kAIser, ElevenLabs, Twilio, Cloudflare a firemní zkratky. Tyto aliasy patří pouze do TTS výslovnostního slovníku ElevenLabs. Nesmějí se ukládat do databáze, e-mailu, dokumentu, UI ani do textového přepisu odpovědi.

Hlavní prompt proto obsahuje pravidlo pro oddělení oficiálního zápisu a TTS výslovnosti, ale nevynucuje fonetický přepis v textové odpovědi. Samotné připojení výslovnostního slovníku k produkčnímu hlasu je samostatná konfigurační změna a musí být ověřené read-only náhledem agenta.

## Opravené rozpory

1. Výběr vozidla v pickeru potvrzuje vozidlo, ne finální zápis servisního hlášení.
2. `voice-intake` už není důvěryhodný zdroj finálního potvrzení zápisu.
3. Trasu řidič fyzicky potvrzuje před spuštěním hlasu; Šarlota čte `{{intro_announcement}}` jednou a potvrzení neopakuje.
4. Veřejné zprávy jsou nejvýše dva ověřené titulky z iROZHLAS, ne provozní zdroj dopravních omezení.
5. Paměť používá jen `memory.consent: true` a `memory.summary`; neukládá celý přepis.
6. Firemní lidskost používá jen backendový návrh a nejvýše jednou za hovor.
