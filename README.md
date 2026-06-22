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
- uživatelé převzatí z hotového modulu Pneumatiky s přístupem pouze k modulu Pneumatiky
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
- `PATCH /api/users/:id`
- `PATCH /api/users/:id/disable`

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
SENDGRID_API_KEY=...
```

V produkci se mock OTP nepovolí na větvi `main`; testovací kód `123456` je pouze pro lokální vývoj nebo neprodukční prostředí s `AUTH_MODE=mock`.

Trvalé vytváření a úpravy uživatelů v admin modulu vyžadují další krok s databází, například Cloudflare D1. Aktuální první verze umí povolené uživatele bezpečně číst ze serverové konfigurace; `AUTH_USERS_JSON` doplňuje nebo přepisuje výchozí kontakty Kaiser servis a uživatele převzaté z modulu Pneumatiky.

## Ověření buildu

```bash
npm run preview
```

Náhled používá lokální server nad `dist/`.
