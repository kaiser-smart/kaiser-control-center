# Smart odpady

Interní provozní systém pro správu odpadových služeb, vozového parku, servisních hlášení, tras, zákazníků, nákladů a reportů.

## Rozsah první verze

- HP / hlavní rozcestník s 12 moduly.
- Routing pro hlavní modulové stránky.
- Připravené skeleton routy pro budoucí modulové dashboardy.
- Statická konfigurace modulů v `src/data/modules.js`.
- Lokální SVG komponenty ikon v `src/components/icons/`.
- Passwordless přihlášení přes jednorázový kód.
- Cloudflare Pages Functions pro auth API.
- Cloudflare D1 připravené pro trvalé ukládání změn uživatelů a zaměstnaneckých metadat.
- Cloudflare R2 připravené pro soubory dokumentů v kartě zaměstnance.
- Centrální RBAC práva v `src/permissions.js`.
- Filtrování menu a akcí podle role.
- Lokální mock režim bez Twilio účtu.

## Pneumatiky

Modul Pneumatiky není v tomto projektu přepisovaný ani refaktorovaný. V aplikaci je karta se štítkem `HOTOVO` a stránka `/pneumatiky`, která otevírá hotovou externí aplikaci:

https://oplustil-prog.github.io/kaiser-pneu-evidence/

## Spuštění lokálně

```bash
npm run dev
```

Bez správce balíčků lze spustit přímo:

```bash
node scripts/serve.mjs
```

Lokální server obsahuje vývojový mock login nad kontakty z veřejné stránky Kaiser servis:

- `oplustil@kaiserservis.cz` / role admin
- ostatní osobní kontakty z https://www.kaiserservis.cz/kontakty/ podle přiřazené role
- kontakty importované z `Contact.xlsx` v `functions/_lib/contact-users.js`
- vybraní uživatelé převzatí z hotového modulu Pneumatiky
- ověřovací kód `123456`

Mock login je určený jen pro lokální vývoj.

## Přístupová práva

Práva jsou řízená centrálně v `src/permissions.js` přes role:

- `admin`
- `management`
- `kancelar`
- `garazmistr`
- `dispecer`
- `ridic`
- `readonly`

Každé pravidlo má tvar `moduleId:action`, například `absence:approve`, `users:edit` nebo `reports:export`. Helpery `hasPermission`, `canViewModule` a `filterModulesByUser` se používají pro menu, routy a viditelnost akcí. `deniedModules` má přednost před rolí, `allowedModules` umí přidat mimořádný view přístup a staré `modules` dál funguje jako omezení jen na vybrané moduly.

## Build

```bash
npm run build
```

Bez správce balíčků lze build ověřit přímo:

```bash
node scripts/build.mjs
```

Výstup vznikne ve složce `dist/`.

## Cloudflare Pages auth

Frontend nevolá Twilio přímo. API vrstva je připravená ve složce `functions/`:

- `POST /api/auth/start`
- `POST /api/auth/verify`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id` včetně částečné změny nadřízeného přes `{ "managerId": "USER_ID" }`
- `PATCH /api/users/:id/disable`
- `GET /api/employees/:id/documents`
- `POST /api/employees/:id/documents`
- `GET /api/employees/:id/documents/:documentId`
- `GET /api/theme-settings`
- `PATCH /api/theme-settings`
- `GET /api/absence-settings`
- `PATCH /api/absence-settings`
- `GET /api/absence-requests`
- `POST /api/absence-requests`
- `GET /api/absence-requests/:id`
- `POST /api/absence-requests/:id/approve`
- `POST /api/absence-requests/:id/reject`
- `GET /api/absence-requests/pending`
- `POST /api/absence-requests/send-approval-reminders`

Produkční hodnoty patří do Cloudflare Variables / Secrets, ne do GitHubu:

```bash
APP_ENV=production
AUTH_MODE=twilio
AUTH_SESSION_SECRET=...
AUTH_COOKIE_NAME=__Host-smart_odpady_session
APP_BASE_URL=https://smart-odpady.pages.dev
ALLOWED_EMAIL_DOMAIN=kaiserservis.cz
AUTH_USERS_JSON=[{"id":"u1","name":"...","email":"...","phone":"","role":"admin","status":"active","department":"...","position":"...","createdAt":"...","lastLoginAt":null}]
VITE_APP_VERSION=v0.1.0
VITE_APP_BRANCH=main
VITE_APP_COMMIT=abcdef1
VITE_BACKUP_DATE="2026-06-21 22:20"
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=...
TWILIO_MESSAGING_SERVICE_SID=...
SENDGRID_API_KEY=...
EMAIL_PROVIDER=sendgrid
EMAIL_FROM=...
EMAIL_REPLY_TO=...
ABSENCE_APPROVAL_REMINDER_HOURS=24
```

`EMAIL_PROVIDER=sendgrid` je doporučené nastavení. Pokud není vyplněné, backend použije SendGrid automaticky, jakmile existuje `SENDGRID_API_KEY`. `EMAIL_FROM` může být vyplněné samostatně; pokud chybí, použije se `ABSENCE_REPORT_EMAIL`.

V produkci se mock OTP nepovolí na větvi `main`; testovací kód `123456` je pouze pro lokální vývoj nebo neprodukční prostředí s `AUTH_MODE=mock`.

## Centrální přehled notifikací

Modul `Reporty` obsahuje centrální přehled e-mailů a SMS z celé aplikace. Data se načítají pouze přes cloud API:

```text
GET /api/notifications
GET /api/notifications/summary
```

Zdroj pravdy je D1 tabulka `notification_logs`. Frontend žádné e-maily ani SMS neposílá a neobsahuje žádné Twilio, SendGrid ani SMTP tokeny.

## Cloudflare D1 pro uživatele

Trvalé vytváření a úpravy uživatelů používají Cloudflare D1 přes Pages Function binding:

```text
SMART_ODPADY_DB
```

V Cloudflare Pages nastavte binding v projektu:

Workers & Pages -> Smart odpady / kaiser-control-center -> Settings -> Bindings -> Add -> D1 database.

Jméno bindingu musí být přesně `SMART_ODPADY_DB`.

Databázové migrace jsou v:

```text
migrations/0001_create_users.sql
migrations/0002_add_user_manager.sql
migrations/0003_create_theme_settings.sql
migrations/0004_create_employee_cards.sql
migrations/0005_create_employee_document_files.sql
migrations/0006_create_absence_requests.sql
migrations/0007_create_module_feedback.sql
migrations/0008_absence_approval_workflow.sql
migrations/0009_create_absence_settings.sql
migrations/0010_add_notification_log_details.sql
```

Po vytvoření databáze je potřeba migrace spustit proti D1. Aplikace potom čte výchozí kontakty a změny z D1 slučuje podle `id`; úprava uživatele v admin modulu uloží aktuální verzi uživatele do D1.

Pokud D1 binding v produkci chybí, čtení výchozích uživatelů dál funguje, ale vytvoření nebo úprava uživatele vrátí bezpečnou chybu konfigurace. Aplikace nesmí ukládat provozní uživatele do `localStorage`, `sessionStorage` ani jiné prohlížečové databáze.

## Schvalování Dovolená / Nemoc

Žádosti z modulu Dovolená / Nemoc se ukládají přes cloud API do D1 tabulky `absence_requests`.

Nastavení měsíčního reportu Dovolená / Nemoc se ukládá přes:

```text
GET /api/absence-settings
PATCH /api/absence-settings
```

Zdroj pravdy je D1 tabulka `absence_settings`. Pokud D1 binding chybí, čtení vrátí výchozí konfigurační hodnoty se stavem `waiting`, ale zápis vrátí bezpečnou konfigurační chybu a nepředstírá trvalé uložení.

Workflow:

- `Dovolená`, `Lékař`, `OČR` a `Náhradní volno` vznikají ve stavu `pending_approval`.
- `Nemoc` vzniká ve stavu `recorded` bez schvalování.
- Schválení a zamítnutí zapisuje stav do `absence_requests` a historii do `absence_approval_history`.
- Notifikace se logují do `notification_logs`.
- E-mail nadřízenému a SMS zaměstnanci se posílají pouze z backendu přes Cloudflare proměnné/secrets.

Hodinové připomínky jsou připravené endpointem:

```text
POST /api/absence-requests/send-approval-reminders
```

Cron je připravený v API vrstvě a čeká na Cloudflare Cron Trigger / naplánované volání endpointu každou hodinu.

## Cloudflare R2 pro dokumenty zaměstnanců

Soubory v kartě zaměstnance používají Cloudflare R2 přes Pages Function binding:

```text
SMART_ODPADY_DOCUMENTS
```

Doporučený bucket:

```text
smart-odpady-documents
```

Metadata dokumentů zůstávají v D1 tabulkách `employee_documents` a `employee_document_files`. Samotné soubory se ukládají do R2 a stahují se přes chráněný endpoint `/api/employees/:id/documents/:documentId`, aby se ověřilo přihlášení a oprávnění. Pokud R2 binding chybí, upload vrátí bezpečnou konfigurační chybu a nepředstírá uložení.

## Nastavení vzhledu

Modul Nastavení obsahuje box `Vzhled aplikace`. Uložené hodnoty se ukládají přes cloud API do D1 tabulky `theme_settings`.

Theme settings se aplikují pouze na vnitřní modulové stránky přes wrapper `module-theme-scope`. Hlavní stránka HP má wrapper `home-page-fixed-theme` a její karty, grid, badge, logo i hero nejsou řízené nastavením vzhledu.

## Ověření buildu

```bash
npm run preview
```

Náhled používá lokální server nad `dist/`.
