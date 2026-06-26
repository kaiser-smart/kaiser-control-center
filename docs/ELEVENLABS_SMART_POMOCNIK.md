# ElevenLabs Smart pomocník - Šarlota

Tento dokument popisuje čisté nastavení agenta Šarlota pro Kaiser Smart / Smart odpady.

## Stav integrace

- Agent: `Šarlota`
- ElevenLabs je pouze hlasová a konverzační vrstva.
- Identita uživatele a oprávnění jsou vždy z aplikace Smart odpady.
- API key a signed URL se nikdy neposílají do frontendu ani do promptu.
- Pilotní modul: `Sledování vozidel`.
- Automatické 15km WIM SMS/app alerty zatím nejsou cloud automatizace. Neexistuje pro ně cron ani queue runner.

## Proměnné prostředí

Ve frontendu smí být pouze veřejné Agent ID:

```env
VITE_ELEVENLABS_AGENT_ID_SARLOTA=
```

Backend / Cloudflare Secrets:

```env
ELEVENLABS_AGENT_ID_SARLOTA=
ELEVENLABS_API_KEY=
```

Notifikační kanály používají stávající produkční nastavení:

```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
EMAIL_PROVIDER=sendgrid
EMAIL_FROM=
SENDGRID_API_KEY=
EMAIL_REPLY_TO=
```

## ElevenLabs agent Šarlota

Název:

```text
Smart odpady - Šarlota
```

Jazyk: `cs-CZ`

First message:

```text
{{intro_announcement}}
```

Nepřidávat žádný další pevný pozdrav. `intro_announcement` už obsahuje celý úvod.

## Doporučený system prompt pro Radima

```text
Jsi Šarlota, hlasová asistentka interní aplikace Kaiser Smart / Smart odpady.

Mluvíš česky, přirozeně a stručně. Uživateli tykáš. Běžná odpověď má mít jednu až dvě věty. Když je zadání nejasné, polož jen jednu doplňující otázku.

Buď kreativní v formulaci odpovědí, ale nikdy si nevymýšlej provozní data, oprávnění, odeslání zprávy ani výsledek API. Když něco nevíš, řekni to a nabídni bezpečný další krok.

Neříkej znovu „Jsem Šarlota“, pokud už hovor začal z aplikace.

Smart odpady jsou zdroj pravdy. ElevenLabs není zdroj pravdy pro práva ani data. Všechna data čti jen přes poskytnuté nástroje aplikace. Nikdy nevyžaduj ani nezobrazuj API klíče, signed URL tokeny, secrets nebo technické interní tokeny.

Respektuj uživatelská práva. Pokud API vrátí chybu oprávnění, řekni stručně: „K tomu nemáš oprávnění.“ Nenabízej obcházení práv.

Pilotní modul je Sledování vozidel. Pro stav vozidel a WIM vah používej nástroj get_vehicle_tracking_summary. Vysvětluj jasně, že WIM 15km automatizace zatím není cloud automatizace, pokud se na ni uživatel zeptá.

SMS nebo e-mail smíš poslat jen přes nástroj send_vehicle_tracking_message. Nikdy neříkej, že zpráva byla odeslaná, dokud nástroj nevrátí stav sent. Pokud nástroj vrátí skipped nebo failed, řekni proč a nenaznačuj úspěch.

Před odesláním SMS/e-mailu musí být v aplikaci potvrzení uživatele. Pokud uživatel zadá příkaz k odeslání, nejdřív zformuluj krátký návrh zprávy, ověř příjemce a pak použij nástroj send_vehicle_tracking_message. Nástroj sám vyvolá potvrzení v UI.

Nepoužívej webový embed ani externí webové propojení mimo aplikaci Kaiser Smart. Pracuj pouze přes interní client tools a backend API aplikace.
```

## Client tools v ElevenLabs

Názvy toolů i parametrů jsou case-sensitive.

Základní navigace:

- `navigate_to`: `route`
- `open_module`: `moduleId`
- `show_confirmation`: `title`, `message`, `confirmLabel`, `cancelLabel`
- `show_toast`: `type`, `message`
- `highlight_element`: `selector`, `message`

Lidé a práva:

- `search_employee`: `query`, `limit`
- `get_employee_detail`: `employeeId`, `query`
- `open_employee_card`: `employeeId`, `query`
- `get_employee_manager`: `employeeId`, `query`
- `get_employee_absence_summary`: `employeeId`, `query`
- `search_user`: `query`, `limit`
- `get_user_access_summary`: `userId`, `query`

Pilot Sledování vozidel:

- `get_vehicle_tracking_summary`: `assistantId`, `assistantName`
- `send_vehicle_tracking_message`: `channel`, `recipient`, `message`, `subject`, `recipientName`, `vehicleId`, `licensePlate`, `wimSiteId`, `reason`

`send_vehicle_tracking_message` podporuje:

- `channel = sms`
- `channel = email`

Nástroj vždy zobrazí potvrzení v aplikaci a až potom zavolá backend.

## Backend API pro Šarlotu

Signed URL:

```text
GET /api/ai/elevenlabs/signed-url?assistant=sarlota
```

Pilot Sledování vozidel:

```text
GET /api/ai/vehicle-tracking/summary
POST /api/ai/vehicle-tracking/notify
```

Oprávnění:

- `GET /api/ai/vehicle-tracking/summary` vyžaduje `vehicle-tracking:view`.
- `POST /api/ai/vehicle-tracking/notify` vyžaduje `vehicle-tracking:manage`.

Odeslání zprávy vyžaduje potvrzení:

```json
{
  "confirmed": true,
  "confirmationSource": "ai_ui"
}
```

Bez potvrzení backend vrátí `409 ai_confirmation_required`.

## Audit a notifikace

- AI akce se zapisují do `ai_action_logs`.
- SMS/e-mail se zapisují do `notification_logs`.
- Odesílání používá stávající backendové kanály SendGrid/Twilio.
- Frontend SMS ani e-mail neposílá.
- API brání duplicitnímu odeslání stejné zprávy v krátkém intervalu přes `dedupeKey` uložený v logu notifikací.

## Co funguje po této fázi

- Šarlota umí přes backend načíst read-only souhrn Sledování vozidel.
- Šarlota umí po potvrzení v aplikaci požádat backend o odeslání SMS/e-mailu.
- Backend ověřuje práva a loguje AI i notifikační akce.

## Co ještě není hotové

- Není hotová cloud automatizace přiblížení vozidla k WIM váze 15 km předem.
- Není cron/queue/worker, který by sám pravidelně vyhodnocoval GPS polohy.
- Pokud nikdo neotevře aplikaci a Šarlotu nespustí, pilotní nástroje samy nic neposílají.
- ElevenLabs dashboard musí mít ručně doplněné tool definitions podle tohoto dokumentu.

## Testovací checklist

- Mikrofon zakázán -> UI ukáže hlášku o mikrofonu.
- Mikrofon povolen -> backend vrátí signed URL.
- First message je pouze `{{intro_announcement}}`.
- Šarlota tyká.
- `get_vehicle_tracking_summary` vrátí data jen s právem `vehicle-tracking:view`.
- `send_vehicle_tracking_message` bez potvrzení neodešle nic.
- `send_vehicle_tracking_message` bez `vehicle-tracking:manage` vrátí chybu oprávnění.
- Výsledek SMS/e-mailu je vidět v Notifikacích.
- Build projde.
- `git diff --check` projde.
