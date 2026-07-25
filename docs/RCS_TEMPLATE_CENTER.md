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
- `POST /api/rcs/messages` přijímá výhradně `templateKey`, `recipient`,
  `variables` a `eventId`.

Všechny endpointy vyžadují backendové oprávnění `settings:manage`.
Frontend neposílá vlastní Twilio payload.

Synchronizace ukládá Content SID a otisk přesné definice do
`rcs_template_sync`. Pokud platný SID se stejným otiskem existuje, znovu se
nevytváří. Změněná definice vytvoří nový SID a uloží ho jako jediný aktuální.

Odeslání nejdřív vytvoří rezervaci v `rcs_message_dispatches`. Jedinečný
SHA-256 idempotency klíč vychází z `eventId + templateKey + normalizovaný
příjemce`. Opakování stejné události proto poskytovatele znovu nezavolá.
Telefon se v tomto auditu neukládá; eviduje se pouze maskovaná podoba a
jednosměrný hash.

## Cloud a automatizace

Jde o funkční backendové API a ručně řízenou administraci. Tato fáze
nevytváří cron, queue ani automatické událostní odesílání. Dovolená, Datová
schránka, úkol nebo závada se samy nezačnou odesílat jen existencí registru.

Produkční funkčnost vyžaduje:

1. aplikovanou migraci `0062_create_rcs_template_center.sql`,
2. existující Twilio ENV/secrets a Messaging Service,
3. veřejně dostupné bannery na `https://smart-odpady.ai/rcs/templates/`,
4. ruční synchronizaci oprávněným administrátorem,
5. samostatně potvrzené testovací odeslání.

Po změně grafického banneru se existující aktivní Twilio Content definice
aktualizuje přes ruční synchronizaci v Nastavení. Synchronizace nemění
`templateKey`, texty, proměnné, tlačítka ani SMS fallback. Pokud Twilio pro
změněnou definici vyžaduje nový Content SID, KSO uloží nový SID jako aktuální a
odesílání dál páruje události podle stabilního `templateKey`.

Auth token, API key secret ani webhook token se neukládají do registru,
databáze, klienta ani dokumentace.
