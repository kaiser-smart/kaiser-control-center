# Audit existujici integrace Sarloty v KSO

Datum auditu: 2026-06-29

Rozsah: read-only audit kodu a konfiguracnich stop v repozitari. Nebylo volano ElevenLabs, OpenAI, Cloudflare ani produkcni webhooky. Nebyly cteny ani vypisovany hodnoty secretu.

## Shrnutí

Sarlota v Kaiser Smart Odpady neni od nuly. V repozitari existuje webova ElevenLabs integrace pres signed URL endpoint, hlasovy/textovy panel v aplikaci, client tools, bezpecne dynamic variables a auditni log AI akci. Pozdrav s tvarem `Radime` vzniká v KSO backendu z prihlaseneho uzivatele, ne z telefonniho cisla. Telefonicke napojeni, ktere Radim slysi pri zavolani, neni v tomto repozitari primo dolozene jako inbound telefonni webhook. Je mozne, ze je nastavene primo v ElevenLabs/telefonii mimo repo.

## Auditni tabulka

| Oblast | Stav | Dukaz v kodu / konfiguraci | Co funguje | Co chybi |
|---|---|---|---|---|
| ElevenLabs signed URL endpoint | HOTOVO | `functions/api/ai/elevenlabs/signed-url.js` | Backend vytvari ElevenLabs signed URL pres serverovy `ELEVENLABS_API_KEY` a agent ID. Vraci `signedUrl`, `conversationId`, `dynamicVariables`. | Neovereno zivym volanim produkce. |
| ElevenLabs secrets | CASTECNE | `.env.example`, `docs/ELEVENLABS_SMART_POMOCNIK.md`, `functions/api/ai/elevenlabs/signed-url.js` | Kod ocekava `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID_SARLOTA`, pripadne `VITE_ELEVENLABS_AGENT_ID_SARLOTA`. Hodnoty se nemaji vracet do frontendu. | V repu nelze overit, zda jsou produkcni secrets skutecne nastavene. |
| ElevenLabs agent Sarlota | CASTECNE | `docs/ELEVENLABS_SMART_POMOCNIK.md`, `src/data/aiAssistants.js` | Existuje navrh agenta `Smart odpady - Sarlota`, `cs-CZ`, verejna identita v UI, microphone asset. | Neovereno, jak presne je agent nastaven v ElevenLabs dashboardu. |
| ElevenLabs WebSocket hlas/text | HOTOVO | `src/useElevenLabsAssistant.js`, `src/ElevenLabsAssistantProvider.js` | Frontend umi pripravit signed URL, otevrit textovou i hlasovou session, posilat `conversation_initiation_client_data`, prijimat text/audio a obsluhovat client tool calls. | Neovereno na zivem mikrofonu v tomto auditu. |
| ElevenLabs client tools | HOTOVO | `src/elevenLabsClientTools.js`, `docs/ELEVENLABS_SMART_POMOCNIK.md` | Pripraveny nastroje pro navigaci, otevreni modulu, potvrzeni, toast, highlight, vyhledani zamestnance/uzivatele a souhrny. | Musi byt stejne zalozene v ElevenLabs dashboardu, to repo samo nepotvrdi. |
| ElevenLabs webhook tools | CASTECNE | `docs/ELEVENLABS_SMART_POMOCNIK.md`, `functions/api/ai/*` | Existuji API endpointy pro search, absence, employees, users, feedback. | Neovereno, zda jsou webhook tools skutecne nakonfigurovane v ElevenLabs. |
| Personalizace `Radime` | HOTOVO pro webovou Sarlotu | `functions/_lib/ai-people-summary.js` | `Radime` vzniká z `currentUser.name` pres mapu vocativu `radim -> Radime`. Neni to globalni hardcoded pozdrav pro vsechny. | Neni dolozene, ze telefonicky hovor pouziva stejny KSO signed-url/dynamic variables tok. |
| `Ahoj Radime` / denni pozdrav | HOTOVO pro webovou Sarlotu | `functions/_lib/ai-people-summary.js`, `functions/_lib/ai-session-announcements.js`, `PŘÍRUČKA.md` | Backend sklada `intro_announcement`: podle casu v Praze bud `Dobre rano/dopoledne/odpoledne/vecer, Radime. Co potrebujes?`, nebo fallback `Ahoj, Radime. Co potrebujes?`. | Pokud telefon slysi presne `Ahoj Radime`, muze to byt mimo repo v ElevenLabs first message nebo telefonni konfiguraci. |
| Identifikace podle telefonniho cisla | NEJASNE / CHYBI v repu | hledani `phone/call/webhook` nenaslo inbound Sarlota telefonni mapovani | V KSO webu identita vychazi z prihlaseneho uzivatele. | Neni nalezen endpoint pro inbound telefonni hovor, caller ID nebo mapovani telefon -> Radim pro Sarlotu. |
| OpenAI pro Sarlotu | CHYBI / NEPROKAZANO | OpenAI volani nalezeno jen v `functions/_lib/data-box-ai-boost.js` | OpenAI API je napojene pro Datovou schranku / AI Boost. | Neni nalezeno OpenAI generovani odpovedi Sarloty ani system prompt Sarloty v KSO kodu. Hlasova Sarlota pravdepodobne odpovida pres ElevenLabs agenta. |
| OpenAI API obecne | HOTOVO pro DS AI Boost | `functions/_lib/data-box-ai-boost.js` | Server-side OpenAI API key se hleda jako `OPENAI_API_KEY` / `AI_BOOST_OPENAI_API_KEY` / `DATA_BOX_AI_OPENAI_API_KEY`; vola se OpenAI chat completions. | Neni soucast Sarloty. |
| Backend endpoint Sarloty | CASTECNE | `functions/api/ai/elevenlabs/signed-url.js`, `functions/api/ai/sarlota-promo.js` | Existuje endpoint pro webovou ElevenLabs session a promo stav. | Neni nalezen endpoint typu `/api/voice/sarlota` pro telefonicky inbound call nebo callback z telefonie. |
| Logovani AI akci | CASTECNE | `functions/_lib/ai-action-log-store.js`, `migrations/0011_create_ai_action_logs.sql`, `functions/api/ai/elevenlabs/signed-url.js` | Signed URL session a intro announcement se zapisuje do `ai_action_logs`, pokud je DB dostupna. Neuklada cele audio ani tokeny. | Neovereno, zda migrace je v produkci aplikovana a zda se telefonicke hovory loguji. |
| UI Sarloty v KSO | HOTOVO | `src/components/AiVoiceAssistantPanel.js`, `src/components/AiAssistantLauncher.js`, `src/app.js`, `src/data/aiAssistants.js` | Existuje launcher/panel s hlasem, textem, mikrofonem, stavem spojeni, prepisem, odpovedi a stavy mikrofonu. | Neni to samostatne auditni centrum pro telefonickou Sarlotu; nezobrazuje jasne "Telefonicka Sarlota: aktivni". |
| Bezpecnost secrets | HOTOVO v kodu signed-url | `functions/api/ai/elevenlabs/signed-url.js` | Debug payload maskuje signed URL, signature, API key a agent ID. API key zustava server-side. | Produkcni nastaveni secretu nebylo overeno. |
| Opravneni | HOTOVO pro web | `functions/api/ai/elevenlabs/signed-url.js`, `src/elevenLabsClientTools.js`, `PŘÍRUČKA.md` | Signed URL vyzaduje `dashboard:view`; client tools overuji povolene routes a prava pres aplikaci/backend. | Telefonicky tok mimo prihlasene UI neni v repu dohledany. |
| Telefonicke volani Radim -> Sarlota | NEJASNE | v repu neni nalezen inbound telefonni endpoint pro Sarlotu | Radim prakticky overil, ze po zavolani zazni `Ahoj Radime`. | Neni jasne, zda to obsluhuje KSO, ElevenLabs konfigurace, telefonie/Twilio/SIP, nebo jiny projekt. |

## Kde vzniká `Ahoj Radime` / `Radime`

### Webova Sarlota v KSO

V KSO backendu se bere `currentUser` z prihlasene session. Funkce `userDynamicVariablesForAi(user)` v `functions/_lib/ai-people-summary.js` posila do ElevenLabs mimo jine:

- `user_name`
- `user_first_name`
- `user_first_name_vocative`
- `time_of_day_greeting`
- `user_greeting`

Vocativ je resen mapou:

```text
radim -> Radime
```

Samotny uvod sklada `introAnnouncementFallbackForAi(user)`:

```text
{denni pozdrav}, {vocativ}. Co potrebujes?
```

nebo mimo denni interval:

```text
Ahoj, Radime. Co potrebujes?
```

Endpoint `functions/api/ai/elevenlabs/signed-url.js` prida tyto dynamic variables k ElevenLabs session. Podle `PŘÍRUČKA.md` ma ElevenLabs first message pouzivat pouze:

```text
{{intro_announcement}}
```

### Co z toho plyne

- `Radime` neni v KSO webove casti pevny hardcoded pozdrav pro vsechny volajici.
- Je to odvozeno z prihlaseneho uzivatele `user.name`.
- V KSO repu neni nalezene mapovani telefonni cislo -> Radim pro hlasovy inbound call.
- Pokud telefonicka Sarlota rika `Ahoj Radime`, muze pouzivat stejne dynamic variables jen tehdy, pokud telefonicky tok vola tento KSO endpoint s identitou Radima. To v repu neni dolozene.
- Alternativne muze byt `Ahoj Radime` nastaveno primo v ElevenLabs agentovi / telefonii mimo repo. To je potreba overit v ElevenLabs dashboardu.

## Stav podle kategorii

### HOTOVO

- Webovy AI panel Sarloty existuje.
- ElevenLabs signed URL endpoint existuje.
- Server-side `ELEVENLABS_API_KEY` je podporovany.
- Agent ID Sarloty je podporovane pres backend env.
- WebSocket textovy/hlasovy tok je implementovany.
- Dynamic variables pro uzivatele, opravneni a pozdrav existuji.
- `Radime` je generovane z prihlaseneho uzivatele ve webove casti.
- Client tools pro navigaci a read-only dotazy existuji.
- AI action log tabulka je popsana migraci.

### CASTECNE

- ElevenLabs agent je popsany v dokumentaci, ale realne nastaveni dashboardu neni overene.
- Webhook tools jsou popsane a cast backend endpointu existuje, ale realne napojeni v ElevenLabs neni overene.
- Logovani existuje pro signed URL / intro, ale neni overeno v produkci.
- UI existuje, ale neukazuje samostatne stav "Telefonicka Sarlota: aktivni".

### CHYBI

- V repu neni dolozen telefonicky inbound endpoint pro Sarlotu.
- Neni dolozene mapovani caller ID / telefonni cislo -> Radim.
- Neni nalezen OpenAI system prompt pro Sarlotu.
- Neni nalezene OpenAI generovani odpovedi Sarloty v KSO.
- Neni nalezena integrace SMS po souhlasu pro Sarlotu.
- Neni samostatna diagnostika ElevenLabs/OpenAI/KSO v UI.

### RIZIKO

- Telefonicke `Ahoj Radime` muze byt mimo KSO a muze byt hardcoded v ElevenLabs/telefonii; repo to nepotvrzuje ani nevyvraci.
- Pokud ElevenLabs dashboard nepouziva pouze `{{intro_announcement}}`, muze se pozdrav skládat dvakrat.
- Pokud telefonicky tok neni svazan s prihlasenou identitou, nesmi dostavat stejna opravneni jako webovy uzivatel.
- Pokud webhook tools v ElevenLabs nejsou synchronni s `src/elevenLabsClientTools.js`, tool calls mohou selhat.
- Produkcni existence secretu `ELEVENLABS_API_KEY` a agent ID nebyla v tomto auditu overena.

## Odpovedi na povinne otazky

1. Co presne uz dnes funguje: podle kodu webovy panel, signed URL endpoint, ElevenLabs WebSocket flow, dynamic variables, client tools, logovani AI session; podle Radimova praktickeho overeni telefonicky pozdrav `Ahoj Radime`.
2. Kde je implementovane `Ahoj Radime`: ve webovem KSO toku vzniká v `functions/_lib/ai-people-summary.js` pres `introAnnouncementFallbackForAi`; telefonicky presny zdroj neni v repu dolozen.
3. Hardcoded nebo podle identity: ve webovem KSO neni globalne hardcoded, je podle `currentUser.name`; telefonicky zdroj je nejasny.
4. ElevenLabs napojeny: ano pro webovou session pres signed URL endpoint; produkcni nastaveni nebylo overeno.
5. OpenAI API napojene: ano pro Datova schranka AI Boost; pro Sarlotu v KSO kodu neni nalezeno.
6. Backend endpoint existuje: ano `GET /api/ai/elevenlabs/signed-url?assistant=sarlota`; telefonicky inbound endpoint nalezen nebyl.
7. UI Sarloty v KSO existuje: ano, launcher/panel pro hlas a text.
8. Co chybi: overit telefonicky tok, ElevenLabs dashboard, realne secrets, tool konfiguraci, stavove UI, logy hovoru.
9. Co je rizikove: nejasny puvod telefonicke identity a mozny hardcoded pozdrav mimo repo.
10. Doporuceny dalsi krok: overit ElevenLabs agenta/dashboard read-only a doplnit KSO stavovy panel "Sarlota" bez zasahu do existujiciho telefonickeho chovani.
