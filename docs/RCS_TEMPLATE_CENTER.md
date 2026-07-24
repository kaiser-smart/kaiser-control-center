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

Sedm šablon používá přesně dodané schválené PNG bannery v
`public/rcs/templates/`. Pro `leave.pending` schválený motiv v dodávce chybí,
proto má stav `asset_missing`, nemá Content SID a nelze ji odeslat.

Každá aktivní šablona obsahuje současně `twilio/card` a textový
`twilio/text` fallback. Karta používá `VERTICAL` a `MEDIUM`. Dynamické hodnoty
jsou pouze v nativním obsahu Twilio; bannery se za běhu negenerují.

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

Auth token, API key secret ani webhook token se neukládají do registru,
databáze, klienta ani dokumentace.
