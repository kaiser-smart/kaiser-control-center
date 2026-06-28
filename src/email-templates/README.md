# E-mailové šablony Smart odpady

Tato složka obsahuje základní HTML e-mailové šablony pro systém Smart odpady / Kaiser.

Šablony jsou určené pro systémové e-maily, například ověřovací kódy, oznámení nebo budoucí notifikace. Nejedná se o běžné stránky aplikace.

## Pravidla

- Styly musí být inline, protože e-mailoví klienti často ignorují externí CSS.
- Font Quicksand je připojený přes Google Fonts, ale nemusí fungovat ve všech e-mailových klientech.
- Každá šablona musí mít fallback font: `Arial, Helvetica, sans-serif`.
- Šablony nesmí obsahovat žádné API klíče, tokeny, hesla ani jiné tajné údaje.
- Proměnné nechávej ve formátu `{{variable_name}}`.
- E-maily se nesmí odesílat přímo z frontendu.
- Odesílání e-mailů musí jít přes backend / cloud API.

## Soubory

- `baseEmailTemplate.html` je obecná základní šablona pro další e-maily.
- `verificationCodeEmail.html` je konkrétní šablona pro ověřovací kód.
- `absenceApprovalRequestEmail.html` je šablona pro novou žádost ke schválení.
- `absenceApprovalReminderEmail.html` je šablona pro připomínku čekající žádosti.

## Proměnné v základní šabloně

- `{{email_title}}`
- `{{headline}}`
- `{{subtitle}}`
- `{{main_label}}`
- `{{main_content}}`
- `{{cta_text}}`
- `{{info_text}}`
- `{{footer_text}}`

## Ověřovací kód

Šablona `verificationCodeEmail.html` používá proměnnou:

- `{{twilio_code}}`

## Schvalování Dovolená / Nemoc

Šablona `absenceApprovalRequestEmail.html` používá proměnné:

- `{{employee_name}}`
- `{{absence_type}}`
- `{{absence_term}}`
- `{{absence_amount}}`
- `{{note}}`
- `{{approval_url}}`

Šablona `absenceApprovalReminderEmail.html` používá proměnné:

- `{{manager_name}}`
- `{{employee_name}}`
- `{{absence_type}}`
- `{{absence_term}}`
- `{{absence_amount}}`
- `{{submitted_at}}`
- `{{approval_url}}`
