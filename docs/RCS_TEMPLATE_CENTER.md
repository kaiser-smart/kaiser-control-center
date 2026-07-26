# Centrální RCS šablony

## Provozní stav

Centrální registr obsahuje osm interních klíčů:

- `leave.approved`
- `leave.pending`
- `ds.new`
- `ds.deadline`
- `task.new`
- `vehicle.fault`
- `critical.alert`
- `general.info`

Všech osm šablon používá přesně dodané schválené PNG bannery v
`public/rcs/templates/`. Schválená sada v4 má primární PNG 1200 × 600 px,
stabilní párování `templateKey -> assetFile` a JPG zálohu pro každý banner.
Soubor `ds-new-alt.png` je uložený pouze jako neaktivní alternativa a nesmí se
přiřadit k `ds.new` bez samostatné změny manifestu.

Aktivní párování:

- `general.info` -> `/rcs/templates/general-info.png`
- `critical.alert` -> `/rcs/templates/critical-alert.png`
- `vehicle.fault` -> `/rcs/templates/vehicle-fault.png`
- `task.new` -> `/rcs/templates/task-new.png`
- `ds.deadline` -> `/rcs/templates/ds-deadline.png`
- `ds.new` -> `/rcs/templates/ds-new.png`
- `leave.pending` -> `/rcs/templates/leave-pending.png`
- `leave.approved` -> `/rcs/templates/leave-approved.png`

Každá aktivní šablona obsahuje současně `twilio/card` a textový
`twilio/text` fallback. Karta používá `VERTICAL` a `MEDIUM`. Dynamické hodnoty
jsou pouze v nativním obsahu Twilio; bannery se za běhu negenerují.

## Mobilní text a náhled

Renderer skládá krátký výsledný body na backendu. Pokud zná `firstName`,
začíná text oslovením `Ahoj {{firstName}},`; bez jména použije neutrální
variantu a nikdy nevytvoří `Ahoj ,`.

Odvozené hodnoty `dateRange`, `subjectShort`, `taskTitleShort`,
`faultSummaryShort`, `alertMessageShort`, `messageShort` a `deadlineShort`
vznikají před odesláním. Texty se zkracují po celých Unicode graphemech,
chráněná URL ani HTML entita se nerozdělí a zkrácení končí znakem `…`.
Datum a jméno příjemce se výpustkou nezkracují. Výsledný body nesmí překročit
140 znaků; delší vstup se bezpečně zkrátí, nebo se odeslání a synchronizace
zastaví.

Nastavení zobrazuje banner, nadpis, celý body i akční tlačítko. Přepínač
odděluje orientační náhled pro Android / Google Messages od iOS / Apple
Zpráv. Android ukazuje akce přes dostupnou šířku Rich Card, zatímco iOS
používá užší kartu a systémovou prezentaci akcí. Přesný font, rozměr, barvu
a systémovou ikonu řídí aplikace příjemce a Twilio je neumí přepsat vlastním
CSS. U každé karty je proto vidět počet znaků nadpisu a body a stav
`V pořádku` / `Příliš dlouhé`.

## Backend

- `GET /api/rcs/templates` vrací registr, synchronizační stav a maskovaný audit.
- `POST /api/rcs/templates` provede pouze ručně potvrzenou synchronizaci.
- `POST /api/rcs/message-grants` připraví krátké jednorázové oprávnění pro
  přesný `templateKey`, výsledný obsah a ověřený telefon přihlášeného správce.
- `DELETE /api/rcs/message-grants?grantId=...` zruší nepoužité oprávnění
  stejného správce, když fyzické potvrzení odmítne.
- `POST /api/rcs/messages` přijímá výhradně `grantId` a pevné potvrzení
  `send-one-rcs-template`. Přímý payload šablony, telefonu ani proměnných
  odeslat neumí.

Všechny endpointy vyžadují backendové oprávnění `settings:manage`.
Frontend neposílá vlastní Twilio payload.

Synchronizace ukládá Content SID a otisk přesné definice do
`rcs_template_sync`. Pokud platný SID se stejným otiskem existuje, znovu se
nevytváří. Změněná definice vytvoří nový SID a uloží ho jako jediný aktuální.

Příprava nejdřív vytvoří v `rcs_message_dispatches` stav
`confirmation_pending`. Řádek obsahuje přesný serverem vyrenderovaný obsah,
Content SID, normalizovaný telefon a identitu správce. Klient dostane jen
náhodné `grantId`; telefon, šablonu ani proměnné už při finálním potvrzení
neposílá.

Grant standardně platí tři minuty, lze jej atomicky spotřebovat právě jednou a
jen stejným přihlášeným správcem na jeho vlastní ověřené uživatelské číslo.
Odmítnutí potvrzovacího okna grant okamžitě zruší; při nedostupnosti API
zůstane neodeslaný a automaticky vyprší.
Backend před odesláním znovu ověří opt-out, shodu uloženého textu, aktuální
Content SID a úplnou Twilio konfiguraci. Vytvoření, spotřeba, odmítnutí i
výsledek poskytovatele se auditují v `rcs_sms_events`.

Jednorázová cesta funguje pouze při `KSO_CUSTOMER_MESSAGING_MODE=off`.
Globální `live` okno se pro ruční test centrální RCS šablony nesmí otevírat.
Jedinečný SHA-256 idempotency klíč nad serverovým `eventId + templateKey +
normalizovaný příjemce` zůstává další ochranou proti duplicitě.

## Cloud a automatizace

Jde o funkční backendové API a ručně řízenou administraci. Tato fáze
nevytváří cron, queue ani automatické událostní odesílání. Dovolená, Datová
schránka, úkol nebo závada se samy nezačnou odesílat jen existencí registru.

Produkční funkčnost vyžaduje:

1. aplikovanou migraci `0062_create_rcs_template_center.sql`,
2. existující Twilio ENV/secrets a Messaging Service,
3. veřejně dostupné bannery na `https://smart-odpady.ai/rcs/templates/`,
4. ruční synchronizaci oprávněným administrátorem,
5. přihlášeného správce s ověřeným uživatelským telefonem,
6. samostatně potvrzené jednorázové testovací odeslání.

Po změně grafického banneru se existující aktivní Twilio Content definice
aktualizuje přes ruční synchronizaci v Nastavení. Synchronizace nemění
`templateKey`, texty, proměnné, tlačítka ani SMS fallback. Pokud Twilio pro
změněnou definici vyžaduje nový Content SID, KSO uloží nový SID jako aktuální a
odesílání dál páruje události podle stabilního `templateKey`.

Auth token, API key secret ani webhook token se neukládají do registru,
databáze, klienta ani dokumentace.
