# Sarlota - navrh dalsich kroku

Datum: 2026-06-29

Princip: nezacinat od nuly. Zachovat existujici webovou ElevenLabs integraci i funkcni telefonicky pozdrav, ktery Radim prakticky overil. Neprovadet zmeny v ElevenLabs agentovi bez samostatneho potvrzeni.

## 1. Co zachovat

- Zachovat endpoint `GET /api/ai/elevenlabs/signed-url?assistant=sarlota`.
- Zachovat server-side `ELEVENLABS_API_KEY`, nikdy ho neposilat do frontendu.
- Zachovat dynamic variables:
  - `intro_announcement`
  - `user_name`
  - `user_first_name`
  - `user_first_name_vocative`
  - `user_greeting`
  - `user_role`
  - `available_modules`
  - `user_permissions`
- Zachovat pravidlo z `PŘÍRUČKA.md`: ElevenLabs first message ma byt pouze `{{intro_announcement}}`.
- Zachovat client tools a jejich permission guardy.
- Zachovat stavove rozliseni mikrofonu: `microphoneDenied` neni `disconnected`.
- Zachovat telefonicky pozdrav `Ahoj Radime`, dokud nebude presne zmapovane, odkud prichazi.

## 2. Co doplnit bez rizika

### Dokumentacni doplneni

- Zapsat presny provozni diagram:
  1. uzivatel otevře panel Sarloty,
  2. frontend zavola signed URL endpoint,
  3. backend overi prihlaseneho uzivatele,
  4. backend sestavi dynamic variables,
  5. backend ziska signed URL od ElevenLabs,
  6. frontend otevre ElevenLabs WebSocket,
  7. ElevenLabs vola client tools,
  8. KSO overuje opravneni a vraci vysledek.

### Read-only stavovy endpoint

Pripravit az po potvrzeni:

```text
GET /api/ai/sarlota/status
```

Vraci pouze:

- `elevenLabsConfigured: true/false`
- `sarlotaAgentConfigured: true/false`
- `openAiConfigured: true/false`
- `webVoiceReady: true/false`
- `phoneVoiceKnown: true/false/neovereno`
- `lastAiActionAt`
- `apiStatus`

Bez secretu, bez tokenu, bez signed URL.

## 3. Co napojit na OpenAI API

Aktualni stav: OpenAI je v repu napojene pro Datovou schranku AI Boost, ne pro Sarlotu.

Doporuceni:

- Neprehazovat Sarlotu hned na OpenAI, pokud ElevenLabs agent uz odpovida.
- OpenAI pouzit az jako server-side reasoning vrstvu pro konkretni interni akce:
  - shrnout dotaz,
  - vybrat bezpecny intent,
  - navrhnout dalsi krok,
  - pripravit odpoved / koncept.
- Ostrou akci vzdy resit pres KSO backend a potvrzeni.

Bezpecny model:

```text
ElevenLabs = hlas a konverzacni vrstva
KSO backend = identita, prava, tools, audit
OpenAI = volitelne rozumeni/klasifikace, nikdy zdroj pravdy
```

## 4. Co napojit na interni KSO API

Uz existuje:

- vyhledani zamestnance,
- detail zamestnance,
- otevreni karty,
- nadrizeny,
- dovolena/nepritomnost,
- vyhledani uzivatele,
- souhrn roli/opravneni,
- navigace a UI potvrzeni.

Dalsi vhodne moduly:

- Datova schranka read-only:
  - najdi zpravu,
  - otevri zpravu,
  - najdi priloha,
  - ukaz AI Boost koncepty.
- Pravidla a automatizace:
  - zobraz stav,
  - zobraz chyby,
  - spust dry-run.
- Reporty:
  - posledni odeslane e-maily,
  - historie AI akci.

Zakaz pro prvni fazi:

- neposilat e-maily hlasem bez UI potvrzeni,
- nearchivovat bez UI potvrzeni,
- neposilat DS odpoved bez UI potvrzeni,
- nemenit prava uzivatelu hlasem.

## 5. UI KSO: Ucho Sarloty

### Cil

Viditelny, ale nerusivy vstup do Sarloty. Neprekryvat Datovou schranku ani akcni tlacitka.

### Navrh UI

Plovouci tlacitko vpravo dole:

```text
Sarlota
```

Ikona:

- mikrofon nebo ucho,
- pouzit existujici `/avatars/sarlota-microphone.png`, pokud je dostupny.

Panel po kliknuti:

```text
Sarlota
Telefonicka Sarlota: neovereno / aktivni
Webove spusteni: pripraveno / chyba
ElevenLabs: OK / chyba / neovereno
OpenAI: jen DS AI Boost / nenapojeno pro Sarlotu
KSO backend: OK

[Spustit hlas]
[Zastavit]
[Textovy dotaz]
Posledni odpoved
```

### Mobil

- tlacitko nesmi prekryt DS zpravy, prilohy ani potvrzeni AI Boost,
- panel jako bottom sheet,
- velke tlacitko `Spustit hlas`,
- jasny stav mikrofonu.

## 6. Logovani hovoru

Uz existuje `ai_action_logs`.

Doporuceni doplnit po potvrzeni:

- `session_started`
- `session_ended`
- `tool_called`
- `tool_failed`
- `confirmation_requested`
- `confirmation_accepted`
- `confirmation_declined`

Neukladat:

- audio,
- cele prepisy s citlivymi daty,
- API keys,
- signed URL,
- telefonni cislo v plnem tvaru.

## 7. Jak zajistit, ze Sarlota nebude lhat

Pravidla:

- Kdyz nema data z KSO API, rekne, ze to nevi.
- Kdyz chce provest akci, musi si vyzadat potvrzeni.
- Kdyz jde o DS/e-mail/SMS/archivaci, musi otevrit UI potvrzeni.
- Kdyz je mimo opravneni uzivatele, rekne kratce: `K tomu nemas opravneni.`
- Nepouzivat neoverene terminy.
- Nerikat, ze neco odeslala, pokud backend nevratil uspech.

## 8. System prompt Sarloty

V repu neni nalezen plny aktualni ElevenLabs system prompt. Existuje dokumentacni navrh a pravidla v `PŘÍRUČKA.md`.

Navrh pravidel pro kontrolu v ElevenLabs dashboardu:

```text
Jsi Sarlota, hlasova asistentka Kaiser Smart Odpady.
Mluvis cesky, strucne a vecne.
Radimovi tykas, pokud je overeny uzivatel.
Zakaznikum vykas.
Nikdy nelzes. Pokud nemas data z KSO, reknes, ze to nevis.
Neodesilas e-maily, SMS, datove zpravy, archivace ani zmeny bez potvrzeni v KSO.
Nikdy nerikas ticket ani SupportBox.
Pri predani reknes: predam to kolegyni Jarce.
E-maily nehlaskuj.
Pouzivej jen data z poskytnutych tools.
```

Nenasazovat bez kontroly, protoze aktualni ElevenLabs agent muze uz obsahovat funkcni telefonicky tok.

## 9. Testovani

### Read-only testy

1. Otevrit KSO a panel Sarloty.
2. Overit stav mikrofonu bez povoleni.
3. Overit, ze UI nerika `ElevenLabs odpojeny`, kdyz je jen zakazany mikrofon.
4. Zavolat signed URL endpoint jako prihlaseny uzivatel.
5. Overit, ze response obsahuje `configured`, `assistantName`, `dynamicVariables`.
6. Overit, ze response neobsahuje API key.
7. Overit, ze `intro_announcement` neni prazdny.
8. Overit, ze `user_first_name_vocative` pro Radima je `Radime`.

### Telefonicky test mimo repo

1. Radim zavola Sarlote.
2. Overit pozdrav.
3. Zavolat z neznameho cisla.
4. Overit, ze neznamy volajici nedostane `Ahoj Radime`.
5. Overit, odkud se bere identita volajiciho v ElevenLabs/telefonii.

### Bezpecnostni testy

1. Secret neni ve frontendu.
2. Signed URL neni logovana.
3. Agent ID je maskovane v debug payloadu.
4. Tool zapisove akce vyzaduji potvrzeni.
5. Konzole bez unhandled erroru.

## 10. Doporuceny postup implementace

### Krok 1 - overit produkcni stav bez zmen

- Cloudflare secrets: jen existence, ne hodnota.
- ElevenLabs agent: read-only kontrola first message, dynamic variables, tools.
- Telefonie: zjistit, zda inbound telefon vola KSO endpoint, ElevenLabs agent primo, nebo jiny backend.

### Krok 2 - pridat stavove UI bez zmeny hlasu

- panel `Sarlota / Stav napojeni`,
- nezasahovat do hlasove logiky,
- zobrazit `Telefonicka Sarlota: neovereno`, dokud nebude dolozen tok.

### Krok 3 - sjednotit konfiguraci

- ElevenLabs first message = `{{intro_announcement}}`,
- tools v ElevenLabs dashboardu sjednotit podle `src/elevenLabsClientTools.js`,
- zapsat zdroj truth do docs.

### Krok 4 - rozsireni interniho API

- read-only tools pro Datovou schranku,
- zadne odesilani bez UI potvrzeni,
- audit kazde tool akce.

## 11. Co se nesmi delat jako dalsi krok

- Nemenit ElevenLabs agenta naslepo.
- Neprepisovat first message bez exportu / screenshotu aktualniho nastaveni.
- Nenasazovat novy prompt bez potvrzeni.
- Nezapinat automaticke SMS/e-mail/DS akce.
- Nelogovat audio ani cele citlive prepisy.
- Nezobrazovat secrets.
- Nepredstirat, ze telefonicky tok je v KSO, dokud neni dolozeny.
