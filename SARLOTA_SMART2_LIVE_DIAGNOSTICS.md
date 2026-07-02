# Šarlota Smart 2 – live diagnostics

Datum: 2026-07-02

Rozsah: bezpečná read-only diagnostika repo/env konfigurace a příprava live ElevenLabs kontroly pro testovacího agenta `Kaiser | Šarlota Smart 2 – test`. Nebyl proveden deploy, nebyl změněn ElevenLabs dashboard, nebyly změněny secrets, nebyla volána signed URL a nebyla provedena žádná produkční write akce.

## 1. Výsledek

**NEOVĚŘENO**

Repo konfigurace pro `sarlota-smart-2` existuje a je označená jako testovací. Live ElevenLabs agent ale nebyl ověřen, protože v lokálním prostředí chybí `ELEVENLABS_API_KEY` i `ELEVENLABS_AGENT_ID_SARLOTA_SMART_2` / `VITE_ELEVENLABS_AGENT_ID_SARLOTA_SMART_2`.

Použitý příkaz:

```bash
/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sarlota-smart2-diagnostics.mjs
```

Explicitní live režim bez secrets skončil bezpečně jako `NEOVERENO`:

```bash
SARLOTA_LIVE_DIAGNOSTICS=1 /Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sarlota-smart2-diagnostics.mjs
```

## 2. Agent

| Položka | Hodnota |
|---|---|
| agent key | `sarlota-smart-2` |
| očekávaný agent | `Kaiser | Šarlota Smart 2 – test` |
| env var | `ELEVENLABS_AGENT_ID_SARLOTA_SMART_2` |
| masked agent id | prázdné, lokální env neobsahuje Smart 2 agent id |
| test agent | ANO podle repo konfigurace |
| produkční agent | NE podle repo konfigurace |
| shoda s produkčním agent id | NEOVĚŘENO, lokální env nemá produkční ani test agent id |

## 3. Tools tab

| tool | expected in repo | present live | status | poznámka |
|---|---:|---:|---|---|
| `open_module` | ANO | NEOVĚŘENO | NEOVĚŘENO | Live Tools tab nebyl ověřen bez ElevenLabs API/exportu. |
| `get_driver_report_context` | ANO | NEOVĚŘENO | NEOVĚŘENO | Live Tools tab nebyl ověřen bez ElevenLabs API/exportu. |
| `show_driver_vehicle_picker` | ANO | NEOVĚŘENO | NEOVĚŘENO | Live Tools tab nebyl ověřen bez ElevenLabs API/exportu. |
| `get_driver_vehicle_picker_selection` | ANO | NEOVĚŘENO | NEOVĚŘENO | Live Tools tab nebyl ověřen bez ElevenLabs API/exportu. |
| `validate_driver_vehicle_spz` | ANO | NEOVĚŘENO | NEOVĚŘENO | Live Tools tab nebyl ověřen bez ElevenLabs API/exportu. |
| `create_driver_part_request` | ANO | NEOVĚŘENO | NEOVĚŘENO | Live Tools tab nebyl ověřen bez ElevenLabs API/exportu. |
| `get_driver_reports_summary` | ANO | NEOVĚŘENO | NEOVĚŘENO | Repo tool existuje; live binding je NEOVĚŘENO. |

Repo aktuálně obsahuje 19 ElevenLabs client tool schémat. Diagnostický script porovnává minimálně výše uvedené Hlášení řidičů tools.

## 4. Prompt marker

- Přítomen live: NEOVĚŘENO.
- Očekávaný marker/obsah v repo: pravidlo Hlášení řidičů obsahuje `HLÁŠENÍ ŘIDIČŮ` a větu `Konkrétní vozidlo smíš v hlasu říct pouze tehdy`.
- Celý prompt se nevypisuje a diagnostický script ho nikdy neloguje.

## 5. Model/voice

| Položka | Stav |
|---|---|
| model | NEOVĚŘENO |
| voice | NEOVĚŘENO |
| live agent name | NEOVĚŘENO |
| live Tools tab | NEOVĚŘENO |

Bez read-only ElevenLabs API/exportu nelze potvrdit skutečný model, voice ani Tools tab testovacího agenta.

## 6. Bezpečnost

- Žádná produkční write akce: ANO.
- Žádný deploy: ANO.
- Žádné secrets v logu: ANO.
- Žádná signed URL v logu: ANO.
- Produkční agent nezměněn: ANO.
- ElevenLabs dashboard nezměněn: ANO.
- SMS/e-mail neodeslán: ANO.

Diagnostický script:

- live ElevenLabs API volá jen při `SARLOTA_LIVE_DIAGNOSTICS=1`,
- používá pouze `GET`,
- nemění agenta,
- nevypisuje API key,
- nevypisuje signed URL,
- nevypisuje celý prompt,
- maskuje agent/voice id.

## 7. Doporučení

Deploy zatím **NE**.

Chybí read-only ověření live ElevenLabs Smart 2 agenta:

1. dodat bezpečný read-only export agent konfigurace z ElevenLabs dashboardu, nebo
2. spustit script s read-only env:

```bash
SARLOTA_LIVE_DIAGNOSTICS=1 ELEVENLABS_AGENT_ID_SARLOTA_SMART_2=<agent-id> ELEVENLABS_API_KEY=<read-only-key> node scripts/sarlota-smart2-diagnostics.mjs
```

Po live ověření musí být potvrzené:

- Smart 2 agent id neodpovídá produkčnímu agentovi,
- Tools tab obsahuje minimálně požadované Hlášení řidičů tools,
- prompt marker je přítomen,
- model/voice konfigurace je ověřená,
- žádný live write bez potvrzení není dostupný mimo KSO guardy.
