# Zákaznické RCS/SMS přes Twilio

## Stav a rozsah

Tato vrstva řeší pouze provozní a transakční komunikaci se zákazníky. Není určena pro marketing, newslettery ani hromadné nevyžádané zprávy.

Frontend zprávy neposílá. Odesílání probíhá jen přes backend/API a Cloudflare ENV/secrets.

## ENV proměnné

Povinné pro ostré odesílání:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_MESSAGING_SERVICE_SID
TWILIO_RCS_SENDER_ID
TWILIO_STATUS_CALLBACK_URL
TWILIO_INBOUND_WEBHOOK_SECRET
KSO_CUSTOMER_MESSAGING_MODE=live
```

Bezpečný výchozí režim:

```text
KSO_CUSTOMER_MESSAGING_MODE=off
```

Testovací režim:

```text
KSO_CUSTOMER_MESSAGING_MODE=test
```

V test režimu se vytvoří audit/log, ale zpráva se neodešle do Twilia.

## RCS/SMS fallback

KSO posílá zákaznické zprávy přes `TWILIO_MESSAGING_SERVICE_SID`. V Twiliu musí být ve stejné Messaging Service Sender Poolu:

- schválený RCS Sender,
- SMS capable fallback sender.

Twilio potom provede první pokus přes RCS a při nedostupnosti RCS použije SMS fallback ze Sender Poolu.

`TWILIO_RCS_SENDER_ID` je evidovaný jako kontrolní konfigurace schváleného sendera. Samotné odeslání jde přes Messaging Service.

## Webhook URL

Inbound odpovědi:

```text
POST /api/twilio/inbound
```

Status callback:

```text
POST /api/twilio/status
```

Webhooky validují Twilio podpis `X-Twilio-Signature`, pokud je dostupný. Pokud podpis nejde použít, vyžadují sdílený secret přes `TWILIO_INBOUND_WEBHOOK_SECRET`.

## Opt-out

Každá odchozí šablona musí obsahovat:

```text
Pro odhlášení odpovězte STOP.
```

Inbound webhook ukládá příchozí zprávy do `customer_message_inbound`.

Tyto odpovědi vytvoří opt-out:

```text
STOP
STOP SMS
NEPOSILAT
NEPOSÍLAT
```

Opt-out se ukládá do `customer_message_opt_out`. Pokud je telefon v opt-out seznamu, `sendCustomerMessage` zprávu neodešle a zapíše stav `opted_out`.

Potvrzovací odpověď:

```text
Kaiser servis: Odhlášení potvrzeno. Na toto číslo už nebudeme posílat RCS/SMS zprávy.
```

## DB tabulky

Migrace:

```text
migrations/0032_create_customer_messaging.sql
```

Tabulky:

- `customer_message_log`
- `customer_message_opt_out`
- `customer_message_inbound`

## API

Přehled zpráv:

```text
GET /api/customer-messages
```

Odeslání provozní zákaznické zprávy:

```text
POST /api/customer-messages
```

Opt-out seznam:

```text
GET /api/customer-messages/opt-outs
POST /api/customer-messages/opt-outs
DELETE /api/customer-messages/opt-outs/:phone?confirm=remove-opt-out
```

## Šablony

- `request_received`
- `appointment_confirmed`
- `appointment_changed`
- `dispatch_message`
- `missing_information`

Šablony jsou v `functions/_lib/customer-message-templates.js`.

## Ochrany

`sendCustomerMessage` blokuje:

- chybějící nebo nevalidní telefon,
- prázdnou zprávu,
- chybějící souhlas nebo právní důvod,
- marketingový/neprovozní důvod,
- opt-out číslo,
- duplicitní stejnou zprávu na stejné číslo v krátkém čase,
- chybějící Twilio ENV,
- vypnutý režim.

## Existující komunikační místa v KSO

Aktuální interní komunikační vrstva:

- `functions/_lib/notification-service.js`
  - SendGrid e-maily pro absence, lékařské prohlídky, datovou schránku, připomínky a servisní hlášení.
  - Twilio SMS pro zaměstnance/řidiče v absencích a hlášeních řidičů.
- `functions/_lib/communication-store.js`
  - audit/threading odchozích e-mailů/SMS a příchozích odpovědí.
- `functions/api/communication/twilio/inbound.js`
  - starší obecný inbound SMS webhook.
- `functions/api/communication/twilio/status-callback.js`
  - starší obecný Twilio status callback.
- `functions/_lib/voice-sarlota.js`
  - Šarlota má záměr `sms_link`, ale ostré zákaznické SMS zatím nebyly napojené.

Nová zákaznická RCS/SMS vrstva je oddělená od interních zaměstnaneckých notifikací.

## Testování

```text
node scripts/customer-messaging.test.mjs
npm run lint
npm run build
git diff --check
```

Testy nepoužívají ostré Twilio odeslání.

## Ruční nastavení v Twiliu

Radim musí v Twiliu ručně:

1. Ověřit, že RCS Sender je schválený.
2. Přidat RCS Sender do Sender Poolu vybrané Messaging Service.
3. Přidat SMS capable sender do stejného Sender Poolu pro fallback.
4. Nastavit inbound webhook na `/api/twilio/inbound`.
5. Nastavit status callback na `/api/twilio/status`.
6. Zkontrolovat Advanced Opt-Out keywords proti `STOP`, `STOP SMS`, `NEPOSILAT`.
7. Nastavit Cloudflare secrets z ENV seznamu výše.
