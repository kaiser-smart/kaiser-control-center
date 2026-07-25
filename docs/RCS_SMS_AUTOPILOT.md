# RCS/SMS Autopilot Šarlota

## Bezpečný stav

Autopilot slučuje příchozí RCS i SMS odpovědi do jednoho serverového toku a jedné D1 konverzace. Frontend zprávy nezpracovává ani neodesílá.

Výchozí režim je vždy:

```text
RCS_SMS_AUTOPILOT_MODE=off
```

V tomto režimu webhook platnou příchozí zprávu idempotentně uloží, ale nespustí OpenAI, nástroj ani odchozí odpověď. Pevné STOP pravidlo zůstává aktivní nezávisle na režimu.

Další režimy:

```text
RCS_SMS_AUTOPILOT_MODE=review
RCS_SMS_AUTOPILOT_MODE=live
```

- `review`: OpenAI uloží strukturovaný návrh, nic neprovede ani neodešle.
- `live`: server smí po vlastní validaci provést povolený nástroj a odpovědět přes existující zákaznickou messaging vrstvu.

Samotná aktivace pravidla v UI režim ENV nemění. Pro jakýkoli AI provoz musí být současně nastavený ENV režim a aktivní automatizace `rcs-sms-autopilot-async-processing`; retry navíc vyžaduje aktivní `rcs-sms-autopilot-retry-runner`. Vše se při chybě ověření zavře do bezpečného stavu bez účinku.

## Serverový tok

1. `POST /api/twilio/inbound` ověří Twilio podpis nebo schválený serverový webhook secret.
2. Původní inbound log uloží zprávu a jednou vyřídí STOP.
3. Autopilot zprávu uloží podle unikátního Twilio Message SID.
4. Telefon se porovná s aktivním uživatelem, zákazníkem a opt-out evidencí. Telefon je pouze zdroj kontextu, nikdy oprávnění.
5. Dohledá se původní odchozí `Twilio Message SID`, `templateKey`, `eventId`, vazba, proměnné a čas.
6. STOP, prázdná zpráva, duplicita, opt-out a možné bezprostřední nebezpečí se vyhodnotí před OpenAI.
7. OpenAI Responses API vrátí právě jeden striktní `function_call` z pevného allowlistu.
8. Backend znovu ověří název nástroje, jeho přesné argumenty, identitu, serverové oprávnění, idempotenci a potřebu člověka.
9. Odpověď jde pouze přes `sendCustomerMessage`; stav Twilia, OpenAI i nástroje se auditují.

Webhook vrací rychlé prázdné TwiML. Další zpracování používá Cloudflare `waitUntil`. Uložené nedokončené zprávy může obnovit cloudový runner nejvýše třikrát.

## Pevná pravidla

- `STOP`, `STOP SMS`, `KONEC`, `ODHLÁSIT`, `NECHCI`, `NEPOSÍLAT`: trvalý opt-out a jediné potvrzení.
- Duplicitní Twilio webhook: bez opakovaného nástroje a bez opakované odpovědi.
- Prázdná zpráva nebo samotná příloha: krátká žádost o vysvětlení; pouze v `live`.
- Odhlášený kontakt: bez obchodní odpovědi.
- Možné bezprostřední nebezpečí: lidské převzetí bez OpenAI a bez provozní akce.

Pravidla ověření webhooku a pořadí bezpečnostních kontrol jsou systémová a nelze je přes API deaktivovat.

## OpenAI

Serverové proměnné:

```text
RCS_SMS_AUTOPILOT_OPENAI_API_KEY=
RCS_SMS_AUTOPILOT_OPENAI_MODEL=gpt-5.4-mini
RCS_SMS_AUTOPILOT_OPENAI_TIMEOUT_MS=15000
```

Pokud samostatný API klíč chybí, používá se serverový `OPENAI_API_KEY`. Žádná z těchto hodnot nesmí mít prefix `VITE_`.

Model nemůže zapisovat do D1 ani volat Twilio. Responses API dostává povolené nástroje v parametru `tools`, `tool_choice=required`, `parallel_tool_calls=false` a u každého nástroje `strict=true`. Function call je pouze strukturovaný návrh pro server. Vrací:

- název jednoho nástroje z allowlistu,
- záměr,
- jistotu,
- režim odpovědi,
- krátký návrh odpovědi,
- přesné argumenty daného nástroje,
- příznak lidského zásahu a důvod.

Typ odesílatele do function call nevstupuje; backend jej vždy doplní ze svého ověřeného kontextu. Jistota pod `0.75` vždy vynutí lidské převzetí. Backend navíc znovu odmítne nepovolený nástroj, neznámé pole, chybějící či chybně typovaný argument a více function calls.

## Nástroje a MVP

Automatické a idempotentní:

- konverzační a ověřený uživatelský/zákaznický kontext,
- běžný zákaznický nebo interní požadavek,
- hlášení neprovedeného svozu,
- hlášení závady vozidla,
- žádost o zpětné zavolání,
- STOP,
- předání člověku.

Jen s jednorázovým serverovým grantem navázaným na původní Message SID, telefon, akci, objekt a expiraci:

- přijetí úkolu,
- odmítnutí úkolu,
- doplnění poznámky k úkolu.

Centrální odesílání `task.new` může granty vytvořit až po úspěšném přijetí zprávy Twiliem, pouze pokud server předá `relatedEntityType=task` a konkrétní `relatedEntityId`. Vzniknou oddělené granty pro přijetí, odmítnutí a poznámku; každý nese pevný `taskId`, výchozí expiraci 48 hodin a lze jej použít jen jednou. Bez této vazby nebo při chybě zápisu zůstane odpověď fail-closed a čeká na člověka.

Čtení termínu svozu a otevřených úkolů zůstává fail-closed, dokud nebude připojený jednoznačný ověřený produkční zdroj. Autopilot v takovém případě netvrdí výsledek a předá dotaz člověku.

Změny termínů, rušení, objednávky, změny zákaznických údajů, ceny, právní spory, náhrady škody a citlivé údaje nejsou v MVP autonomní.

## D1 a API

Migrace:

```text
migrations/0063_create_rcs_sms_autopilot.sql
```

Migrace také doplní do `rcs_message_dispatches` serverové vazby na příjemce, uživatele/zákazníka, původní proměnné, text a související objekt. Autopilot tak porovnává poslední odchozí záznam ze zákaznického logu, centrálních RCS šablon i notifikačního logu; pokud inbound obsahuje SID původní zprávy, má přesná SID vazba přednost.

Tabulky:

- `rcs_sms_conversations`
- `rcs_sms_messages`
- `rcs_sms_action_grants`
- `rcs_sms_requests`
- `rcs_sms_tool_runs`
- `rcs_sms_events`

Chráněná API:

```text
GET /api/rcs-sms-autopilot
GET /api/rcs-sms-autopilot/:id
POST /api/rcs-sms-autopilot/:id
```

Role `admin` a `management` mají plný přístup. `kancelar` a `dispecer` mohou konverzace spravovat, `garazmistr` má read-only přehled. Řidič a readonly role přístup nemají.

## Modul KSO

Trasa:

```text
/rcs-sms-konverzace
```

Modul ukazuje společnou schránku, původní odchozí zprávu, rozpoznaný záměr, stav konverzace, požadavky, nástroje, lidské převzetí, Twilio/OpenAI stav, Event Log a seznam pravidel a automatizací.

## Ověření

Bez ostrého Twilia a bez externích účinků:

```text
npm run test:rcs-sms-autopilot
npm run test:customer-messaging
npm run lint
npm run build
git diff --check
```

Před zapnutím `review` nebo `live` je nutné samostatně ověřit produkční D1 migraci, Twilio podpis na skutečné URL, ENV secrets, status callback, oprávnění rolí a pravdivý audit. `live` se nesmí zapnout jen změnou UI pravidla.
