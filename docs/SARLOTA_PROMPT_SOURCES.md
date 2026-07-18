# Evidence zdrojových promptů Šarloty

Tento seznam uchovává produktové vstupy odděleně od živého runtime promptu. Záznam v tomto seznamu neznamená, že je funkce implementovaná, synchronizovaná do ElevenLabs nebo produkčně ověřená.

## Hlasová Šarlota – tablet osádky svozového vozidla

- Dokument: [SARLOTA_COLLECTION_CREW_TABLET_SOURCE_PROMPT.md](./SARLOTA_COLLECTION_CREW_TABLET_SOURCE_PROMPT.md)
- Autor vstupu: Radim Opluštil
- Datum uložení: 18. 7. 2026
- Stav: uložený úplný zdroj; bezpečný provozní výtah aktivní
- Živý ElevenLabs prompt změněn: ANO, minimálním merge blokem `SVOZOVÉ TRASY / TABLET OSÁDKY A ÚVODNÍ HLÁŠENÍ`
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

Před každou další změnou živého agenta je nutné načíst aktuální ElevenLabs konfiguraci read-only, připravit minimální merge plán a samostatně potvrdit `apply: true`.
