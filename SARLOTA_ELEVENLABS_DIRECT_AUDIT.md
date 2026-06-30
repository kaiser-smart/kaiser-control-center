# Sarlota - primy audit ElevenLabs

Datum auditu: 2026-06-29

Rozsah: read-only kontrola v ElevenLabs dashboardu pres prihlaseny prohlizec. Nebyly meneny zadne hodnoty, nebylo kliknuto na ulozeni/publikovani, nebyly cteny ani vypisovany secrety.

## Shrnutí

V ElevenLabs existuje agent `Chytré odpadky – Šarlota`, který odpovídá KSO / Smart odpady. Tento agent má první zprávu nastavenou bezpečně přes proměnnou:

```text
{{intro_announcement}}
```

To znamená, že pozdrav typu `Ahoj Radime` / `Radime` není u KSO agenta natvrdo zapsaný v ElevenLabs jako pevná první věta. Má přicházet z KSO přes dynamickou proměnnou `intro_announcement`.

Telefonní agent `Šarlota_3` je oddělený Nanolab agent. Podle Radimova pokynu se dál neřeší jako směr pro KSO.

## Co bylo ověřeno přímo v ElevenLabs

| Oblast | Zjištění | Stav |
|---|---|---|
| Agent pro KSO | `Chytré odpadky – Šarlota` | Existuje |
| Typ / viditelnost | Public | Existuje |
| První zpráva | `{{intro_announcement}}` | Správně pro KSO |
| System prompt | Obsahuje Smart odpady, Kaiser servis, dynamické proměnné uživatele, oprávnění, modulů a pozdravu | Existuje |
| Dynamické proměnné | `user_name`, `user_role`, `available_modules`, `user_permissions`, `user_department`, `user_position`, `user_first_name`, `user_first_name_vocative`, `time_of_day_greeting`, `user_greeting`, `intro_announcement`, `intro_announcement_enabled` | Existují |
| Jazyk | čeština | Nastaveno |
| Hlas | Anet | Nastaveno |
| LLM | GPT-5.1 | Nastaveno |
| Tools tab | Záložka v ElevenLabs spadla chybou UI | Neověřeno z dashboardu |
| Telefonní čísla | Viditelně přiřazená k jinému agentovi `Šarlota_3` | Odděleno, neřešit pro KSO |

## Kde vzniká pozdrav Radimovi

### ElevenLabs

U agenta `Chytré odpadky – Šarlota` není první zpráva pevně:

```text
Ahoj Radime
```

ale:

```text
{{intro_announcement}}
```

ElevenLabs tedy jen přečte hodnotu, kterou dostane při startu konverzace.

### KSO backend

Podle repozitáře KSO vzniká hodnota `intro_announcement` v backendu z přihlášeného uživatele:

- `functions/_lib/ai-people-summary.js`
- `functions/_lib/ai-session-announcements.js`
- `functions/api/ai/elevenlabs/signed-url.js`

Pro Radima se používá vocativ `Radime`. To je správný zdroj personalizace pro webovou Šarlotu v KSO.

## Co z toho plyne

1. KSO agent v ElevenLabs není od nuly. Už je připravený.
2. Pozdrav není u KSO agenta tvrdě napsaný v první zprávě.
3. První zpráva správně čeká na `intro_announcement` z KSO.
4. OpenAI / GPT model je v ElevenLabs u KSO agenta nastavený jako GPT-5.1.
5. Oprávnění a identita mají být zdrojovaná z KSO backendu, ne z ElevenLabs.
6. Nástroje KSO agenta se z ElevenLabs dashboardu nepodařilo ověřit, protože záložka Tools spadla chybou UI.
7. Telefonní `Šarlota_3` je jiný agent a podle aktuálního pokynu se nemá řešit jako KSO směr.

## Rizika

| Riziko | Dopad | Doporučení |
|---|---|---|
| Tools tab u KSO agenta v EL padá | Nelze z dashboardu potvrdit, jestli jsou všechny tools správně založené | Ověřit přes KSO backend a případně přes ElevenLabs API read-only, bez vypisování secretů |
| Telefonní agent je jiný než KSO agent | Hrozí záměna závěrů mezi Nanolab telefonní Šarlotou a KSO webovou Šarlotou | V dokumentaci jasně oddělit KSO `Chytré odpadky – Šarlota` od Nanolab `Šarlota_3` |
| Dynamic variables v EL test panelu jsou prázdné | V samotném EL preview bez KSO mohou chybět osobní hodnoty | Testovat KSO agenta přes aplikaci, ne jen přes EL preview |
| KSO agent spoléhá na backendové proměnné | Pokud signed-url endpoint neposílá správná data, pozdrav nebude správný | Ověřit `/api/ai/elevenlabs/signed-url?assistant=sarlota` jako přihlášený uživatel |

## Doporučený další postup

### 1. Ověřit KSO signed-url endpoint

Cíl: potvrdit, že KSO skutečně posílá `intro_announcement`, `user_first_name_vocative`, oprávnění a moduly.

Bezpečný výstup:

- nevypsat signed URL,
- nevypsat API key,
- nevypsat tokeny,
- ukázat jen stav `configured`, `assistantName`, názvy proměnných a maskované hodnoty.

### 2. Doplnit stavový panel Šarloty v KSO

Malý interní stav:

```text
Šarlota
ElevenLabs: nakonfigurováno / chyba
Agent: Chytré odpadky – Šarlota
První zpráva: intro_announcement
OpenAI model v EL: GPT-5.1
Tools: ověřit
```

Bez secretů a bez možnosti měnit nastavení z UI.

### 3. Ověřit tools přes bezpečný zdroj

Protože Tools tab v EL padá, nejbezpečnější další krok je:

- buď read-only ElevenLabs API výpis tools,
- nebo porovnání KSO `src/elevenLabsClientTools.js` s očekávanými tool names v dokumentaci.

Bez potvrzení neměnit EL agenta.

## Co se nesmí dělat jako další krok

- neměnit `Šarlota_3`,
- neměnit ElevenLabs first message bez samostatného potvrzení,
- neměnit system prompt v EL bez samostatného potvrzení,
- nepublikovat EL agenta,
- nevypisovat secrety,
- neposílat testovací SMS/e-maily,
- nevolat ostré tools,
- nepřepojovat telefonní čísla.

## Krátký závěr

KSO směr je správný: agent `Chytré odpadky – Šarlota` má první zprávu přes `{{intro_announcement}}`, takže personalizace má jít z KSO backendu. Není potřeba řešit `Šarlota_3`, protože ta patří k Nanolab telefonnímu toku a není cílový agent pro Smart odpady.
