# Evidence zdrojových promptů Šarloty

Tento seznam uchovává produktové vstupy odděleně od živého runtime promptu. Záznam v tomto seznamu neznamená, že je funkce implementovaná, synchronizovaná do ElevenLabs nebo produkčně ověřená.

## Hlasová Šarlota – tablet osádky svozového vozidla

- Dokument: [SARLOTA_COLLECTION_CREW_TABLET_SOURCE_PROMPT.md](./SARLOTA_COLLECTION_CREW_TABLET_SOURCE_PROMPT.md)
- Autor vstupu: Radim Opluštil
- Datum uložení: 18. 7. 2026
- Stav: uložený úplný zdroj; bezpečný provozní výtah aktivní
- Kanonická repo verze: ANO, jako součást jediného blokově členěného hlavního promptu
- Živý ElevenLabs prompt změněn: NE v rámci tohoto záznamu; produkční zápis vyžaduje nový read-only náhled a shodný otisk
- Runtime implementace všech požadavků: ČÁSTEČNÁ; aktivní funkce a otevřené body jsou přesně uvedené ve zdrojovém dokumentu
- Některé údaje mohou být neaktuální nebo nepřesné: ANO
- Vyžaduje bezpečný rozpad na ověřené API zdroje a samostatně schvalované implementační kroky: ANO

## Zdroje pravdy pro současnou implementaci

- Repo-side pravidla: `src/sarlota/sarlotaSystemPrompt.js`
- Bezpečnostní kontrakt: `PŘÍRUČKA.md`, zejména kapitoly 16 a 17
- Svozová Mantra: `src/data/collectionRoutesMantra.js`
- Počasí: ověřovaný backendový adaptér `functions/_lib/sarlota-weather.js`
- Veřejné zprávy: oficiální RSS adaptér `functions/_lib/sarlota-news.js`
- Pracovní paměť: consent-first strukturovaná témata v `functions/_lib/sarlota-user-memory.js`
- Jazykový manuál: [SARLOTA_LANGUAGE_MANUAL_INTEGRATION.md](./SARLOTA_LANGUAGE_MANUAL_INTEGRATION.md)
- Očištěný KB podklad: [SARLOTA_LANGUAGE_REFERENCE_KB.md](./SARLOTA_LANGUAGE_REFERENCE_KB.md)
- Zdroj TTS výslovnosti: [SARLOTA_PRONUNCIATION_DICTIONARY_SOURCE.md](./SARLOTA_PRONUNCIATION_DICTIONARY_SOURCE.md)

Před každou další změnou živého agenta je nutné načíst aktuální ElevenLabs konfiguraci read-only, ověřit název agenta, `{{intro_announcement}}`, cestu promptu a otisk aktuální verze a samostatně potvrdit `apply: true`. Zápis mění pouze text promptu; first message, model a tools zůstávají beze změny.
