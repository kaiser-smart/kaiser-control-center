# Šarlota OpenAI Realtime pilot

Datum: 2026-06-29

Stav: pilotní OpenAI-only hlasová vrstva vedle existující ElevenLabs integrace.

## Co se spouští

Panel `/sarlota` používá tlačítko `Spustit hlas` pro OpenAI Realtime WebRTC režim.

Tok:

```text
iPhone/Safari mikrofon
-> KSO frontend
-> KSO backend /api/sarlota/realtime-session
-> OpenAI Realtime API
-> KSO tools
-> hlasová odpověď zpět v prohlížeči
```

Mikrofon se nespouští automaticky. Uživatel musí klepnout na `Spustit hlas`.

## Backend endpoint

```text
POST /api/sarlota/realtime-session
```

Endpoint:

- vyžaduje přihlášeného uživatele s `dashboard:view`,
- používá server-side `OPENAI_API_KEY`,
- vrací jen krátkodobý OpenAI Realtime `clientSecret`,
- nevrací hlavní API key,
- nevrací signed URL ElevenLabs,
- nevrací žádné Cloudflare secrets.

## Env / secrets

Povinné:

```text
OPENAI_API_KEY
```

Volitelné:

```text
SARLOTA_OPENAI_REALTIME_MODEL
OPENAI_REALTIME_MODEL
VOICE_ASSISTANT_OPENAI_REALTIME_MODEL
SARLOTA_OPENAI_REALTIME_VOICE
OPENAI_REALTIME_VOICE
```

Výchozí model:

```text
gpt-realtime-2
```

Výchozí hlas:

```text
marin
```

Pokud model nebo hlas není ve workspace dostupný, endpoint vrátí chybu z OpenAI a UI nesmí ukazovat falešné OK živého hovoru.

## Prompt

Repo prompt je v:

```text
src/sarlota/sarlotaSystemPrompt.js
```

Používá se pro:

- OpenAI Realtime hlas,
- server-side `/api/voice/sarlota`.

ElevenLabs dashboard prompt tím zatím není automaticky přepsaný.

## Tools v pilotu

Připravené Realtime tools:

```text
create_absence_request
open_kso_module
```

`create_absence_request` volá existující backend:

```text
POST /api/voice/sarlota
```

Tím zůstávají zachovaná oprávnění, potvrzení a bezpečnost zápisu Dovolená/nemoc.

## Bezpečnost

- OpenAI API key není ve frontendu.
- Frontend dostává jen krátkodobý client secret.
- Žádná SMS ani e-mail se neodesílá.
- Nové DB migrace nejsou součástí pilotu.
- ElevenLabs agent se nemění.
- Zápis dovolené nesmí říct `hotovo`, dokud backend nevrátí úspěšný stav.

## Co je hotové

- Backend endpoint pro OpenAI Realtime session.
- Frontend WebRTC klient.
- Přepnutí tlačítka `Spustit hlas` na OpenAI hlas.
- Pilotní tool pro zápis dovolené přes stávající KSO backend.
- Prompt verzovaný v repozitáři.

## Co je neověřené

- Živé OpenAI Realtime spojení v produkci.
- Dostupnost modelu `gpt-realtime-2` v účtu.
- Dostupnost hlasu `marin` v účtu.
- Chování na konkrétním iPhonu/Safari po nasazení.
