# Audit Kaiser Smart Odpady

Datum auditu: 2026-06-23
Vetev: `audit/kaiser-smart-odpady-stav-aplikace`
Rozsah: lokalni repo + lokalni preview buildu. Produkcni Cloudflare konfigurace nebyla menena ani zive overovana.

## 1. Shrnutí

- Stav aplikace: aplikace jde lokalne sestavit a po mock prihlaseni se v prohlizeci nacita bez bile obrazovky a bez konzolovych `error/warn` na kontrolovanych routach.
- Nejvetsi rizika: cast modulu Dovolena / Nemoc stale pouziva seed/mock/runtime stav pro provozne pusobici data a nastaveni; vice modulu je porad jen skeleton; nektere hluboke routy nejsou ve statickem buildu jako samostatne `index.html`.
- Doporuceni: nejdriv vyjasnit zdroj pravdy pro Dovolena / Nemoc a produkcni D1/R2 bindingy, potom doplnit chybejici routy a az potom resit UX/detailni moduly.
- P0 chyby: 0.
- P1 chyby: 1.

## 2. Git stav

- Branch: `audit/kaiser-smart-odpady-stav-aplikace`
- `git status --short --branch`: `## audit/kaiser-smart-odpady-stav-aplikace`, pred zapisem auditu jen `?? Audit/`.
- Posledni commity:
  - `cec9d6b Soften notification table typography`
  - `6059423 Use full employee list for absence requests`
  - `e30967f Configure production SMS notifications`
  - `7995dff Add central notification report center`
  - `8f4ecfc Clarify email notification configuration errors`
- Zmenene soubory auditem: pridan tento soubor `Audit/AUDIT_KAISER_SMART_ODPADY.md`.
- Push / deploy: neproveden.

## 3. Build / lint / typecheck

| Kontrola | Vysledek | Poznamka |
|---|---|---|
| `npm` | Neprosel / neni dostupny | `command -v npm` vratil prazdny vystup, exit 1. |
| `npm run build` | Nelze spustit pres npm | `npm` neni dostupny v prostredi. |
| Bundlovany build | Prosel | `/Users/radimoplustil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/build.mjs` -> `Build hotov: 27 rout, vystup ve slozce dist.` |
| `npm run lint` | Neprosel / neni definovan | `package.json` obsahuje jen `dev`, `build`, `build:sites`, `preview`; `lint` chybi. |
| `npm run typecheck` | Neprosel / neni definovan | `package.json` nema `typecheck`. |
| `node --check` | Prosel | Dodatecna syntax kontrola 75 `.js/.mjs` souboru prosla; nenahrazuje lint/typecheck. |

## 4. Kritické chyby

| Priorita | Modul | Soubor | Popis | Doporucena oprava |
|---|---|---|---|---|
| P1 | Dovolena / Nemoc | `src/data/absence.js`, `src/app.js`, `functions/api/absence-settings.js` | Puvodni nalez: modul inicializoval seed/mock stav a nastaveni reportu zustavalo jen v runtime. Po souhlasu k bodu 10 bylo nastaveni reportu presunuto na cloud API a frontend uz neukazuje seed/mock provozni data jako zdroj pravdy. | Produkcne potvrdit D1 binding a spustit migraci `0009`; bez toho nenasazovat. |
| P2 | Routing / Dovolena | `scripts/build.mjs`, `src/app.js`, `functions/_lib/notification-service.js` | Puvodni nalez: hluboke routy nebyly ve `dist`. Po souhlasu k bodu 10 build generuje hluboke routy vcetne `/dovolena-nemoc/ke-schvaleni`. | Pred nasazenim overit Pages po deployi na verejne URL. |
| P2 | Dovolena / Notifikace | `src/app.js` | Puvodni nalez: `/dovolena-nemoc/notifikace` vracela `Nenalezeno`. Po souhlasu k bodu 10 je to alias na `/reporty`. | Po nasazeni overit redirect na produkci. |
| P2 | Produkcni konfigurace | `.openai/hosting.json:1` | Lokani hosting metadata maji `d1: null` a `r2: null`, pritom README i backend vyzaduji `SMART_ODPADY_DB` a `SMART_ODPADY_DOCUMENTS`. Repo stav tedy sam o sobe nepotvrzuje produkcni zdroj pravdy. | Pred opravami/nasazenim potvrdit aktualni Cloudflare Pages D1/R2 bindingy a migrace. Bez potvrzeni nenasazovat. |

## 5. Chyby podle modulů

### Homepage

- Browser: `/` po prihlaseni funguje, bez bile obrazovky, bez konzolovych chyb.
- HP zobrazuje rozcestnik a box verze/zaloha; build meta v `dist/src/data/buildMeta.js` doplnil branch `audit/kaiser-smart-odpady-stav-aplikace`, commit `cec9d6b`, backup date `2026-06-23 15:27`.
- Riziko P2: mnoho karet je aktivnich, ale ma stav `skeleton` v `src/data/modules.js`. Uživatel muze cekat hotovy modul.

### Dovolená / Nemoc

- Browser routy funkcni: `/dovolena-nemoc`, `/rychle-zadani`, `/moje-zadosti`, `/nova-zadost`, `/ke-schvaleni`, `/kalendar`.
- Po oprave: `/dovolena-nemoc/notifikace` presmeruje na `/reporty`.
- Po oprave: seed/mock/runtime data v `src/data/absence.js` uz nejsou provozni zdroj pravdy.
- Po oprave: `ABSENCE_STORAGE_KEY` byl odstranen.
- Po oprave: nastaveni reportu se nacita a uklada pres `GET/PATCH /api/absence-settings`.
- Po oprave: schvalovaci routa pouzivana v e-mailu je samostatna staticka route v `dist`.

### Smart pomocník

- ElevenLabs napojeni v repu nalezeno nebylo (`ElevenLabs`, `ELEVEN`, webhook tools bez nalezu).
- Aktualni hlas pouziva browser API: `src/useSpeechRecognition.js` a `window.speechSynthesis` v `src/app.js:715` az `src/app.js:786`.
- P2: text ve `src/data/versionInfo.js:49` mluvi o „ukazkove 30s ceske zvukove komunikaci AI“, ale implementace je lokalni demo/browser speech, ne realne AI/ElevenLabs.
- Asset `src/assets/smart-helper-microphone.png` je v repu. Podle predani je grafika od Radima; audit neoveroval puvod souboru.

### Uživatelé a role

- Browser: `/uzivatele` funguje, bez konzolovych chyb, bez horizontalniho overflow v kontrolovanych sirich.
- Backend: `GET/POST /api/users`, `PATCH /api/users/:id`, `PATCH /api/users/:id/disable`.
- D1: cteni uzivatelu slucuje default/contact/D1; zapis vyzaduje `SMART_ODPADY_DB` a pri chybejicim bindingu vraci bezpecnou chybu.
- Ochrana neulozenych zmen existuje pres `useUnsavedChangesGuard`.

### Nastavení

- Browser: `/nastaveni` funguje.
- Vzhled aplikace se uklada pres `GET/PATCH /api/theme-settings`.
- P2: `logoUrl` v `src/data/themeSettings.js:60` az `src/data/themeSettings.js:68` povoli i externi `http://` / `https://` URL. Neni to primo generovani grafiky, ale pro produkci je vhodne potvrdit pravidla pro externi assety.
- Ochrana neulozenych zmen pro vzhled existuje.

### Připomínky

- Browser: `/pripominky` funguje.
- API: `GET/POST /api/module-feedback`, `PATCH /api/module-feedback/:id`.
- D1 binding je povinny pro realne ulozeni; lokalni dev server ma jen in-memory mock.

### Pneumatiky

- Browser: `/pneumatiky` funguje a ukazuje externi odkaz `https://oplustil-prog.github.io/kaiser-pneu-evidence/`.
- V repu je modul oznacen `HOTOVO` v `src/data/modules.js:73`.
- Nebyl nalezen navrat loginu ani lokalni pneu data v tomto modulu.
- Neměnit funkcne bez potvrzeni Radima/Martina.

### Reporty / Notifikace

- Centralni notifikace jsou v `/reporty`; `/dovolena-nemoc/notifikace` je po oprave alias na `/reporty`.
- API: `GET /api/notifications`, `GET /api/notifications/summary`.
- D1 tabulka `notification_logs` existuje v migraci `0008`.
- Po oprave: migrace `0010_add_notification_log_details.sql` doplnuje detaily jako `provider`, `attempts`, `subject`, `message_preview` a provider id.

## 6. Lokální ukládání / mocky / placeholdery

| Soubor | Nalez | Riziko | Doporuceni |
|---|---|---|---|
| `src/data/absence.js` | Puvodne `ABSENCE_STORAGE_KEY` | Po oprave odstraneno; realne `localStorage` volani nenalezeno. | Bez dalsi akce. |
| `src/data/absence.js` | Puvodne `MOCK_EMPLOYEES` | Po oprave odstraneno z provozniho fallbacku. | Produkcne potvrdit API/D1 zdroj zamestnancu. |
| `src/data/absence.js` | Puvodne `seededRequests()` | Po oprave odstraneno. | Pri chybe API ukazovat prazdny/chybovy stav, ne seed data. |
| `src/data/absence.js` | `loadAbsenceState()` vraci prazdny inicialni stav | OK pro frontend fallback; provozni data se nacitaji pres API. | Produkcne potvrdit D1. |
| `src/app.js` + `functions/api/absence-settings.js` | `saveAbsenceSettings()` uklada pres `PATCH /api/absence-settings` | OK v lokalu; produkce potrebuje D1 migraci `0009`. | Spustit migraci pred deployem. |
| `scripts/serve.mjs:21` az `scripts/serve.mjs:29` | Lokalni in-memory mock data | P2: v poradku pro dev, nesmi byt produkcni zdroj pravdy. | Ponechat jen pro lokalni preview a jasne dokumentovat. |
| `functions/_lib/auth.js:90` | Mock auth jen `AUTH_MODE === "mock"` a ne produkce | OK/P3 | Zachovat; produkcne nesmi byt `AUTH_MODE=mock`. |
| `src/data/modules.js:36` a dalsi | `status: "skeleton"` u vice modulu | P2: UI ukazuje aktivni moduly, ktere nejsou hotove. | V HP/menu jasne oddelit hotove vs pripravene moduly. |

Vyhledavani `localStorage`, `sessionStorage`, `IndexedDB`, `indexedDB` nenaslo realne browser ukladani v `src`, `functions` ani `scripts` mimo dokumentaci/podminky.

## 7. API endpointy

| Endpoint | Soubor | Stav | Riziko | Doporuceni |
|---|---|---|---|---|
| `POST /api/auth/start` | `functions/api/auth/start.js` | Existuje; Twilio nebo mock mimo produkci. | P2 pri chybejici Twilio konfiguraci. | Produkcne potvrdit env. |
| `POST /api/auth/verify` | `functions/api/auth/verify.js` | Existuje; nastavuje session cookie. | P2 pri chybejici Twilio konfiguraci. | Produkcne potvrdit env. |
| `POST /api/auth/logout` | `functions/api/auth/logout.js` | Existuje. | Nizke. | Bez zmen. |
| `GET /api/me` | `functions/api/me.js` | Existuje. | Nizke. | Bez zmen. |
| `GET/POST /api/users` | `functions/api/users.js` | Existuje. | P2/P1 pokud chybi D1 pro zapis. | Potvrdit `SMART_ODPADY_DB`. |
| `PATCH /api/users/:id` | `functions/api/users/[id].js` | Existuje. | P2/P1 pokud chybi D1. | Potvrdit migrace. |
| `PATCH /api/users/:id/disable` | `functions/api/users/[id]/disable.js` | Existuje. | P2/P1 pokud chybi D1. | Potvrdit migrace. |
| `GET/PATCH /api/theme-settings` | `functions/api/theme-settings.js` | Existuje; read fallback default, write D1. | P2 pri chybejici D1. | Potvrdit D1. |
| `GET/POST /api/absence-requests` | `functions/api/absence-requests.js` | Existuje; D1 povinne. | P2 pri chybejici D1. | Potvrdit `SMART_ODPADY_DB`. |
| `GET/DELETE /api/absence-requests/:id` | `functions/api/absence-requests/[id].js` | Existuje. | Nizke; store resi viditelnost/zruseni. | Bez zmen pred potvrzenim. |
| `POST /api/absence-requests/:id/approve` | `functions/api/absence-requests/[id]/approve.js` | Po oprave vyzaduje `absence:approve`. | Nizke. | Overit produkcni RBAC po deployi. |
| `POST /api/absence-requests/:id/reject` | `functions/api/absence-requests/[id]/reject.js` | Po oprave vyzaduje `absence:approve`. | Nizke. | Overit produkcni RBAC po deployi. |
| `GET/PATCH /api/absence-settings` | `functions/api/absence-settings.js` | Po oprave existuje; read fallback default, write D1. | P2 pri chybejici D1/migraci `0009`. | Spustit migraci a potvrdit `SMART_ODPADY_DB`. |
| `GET /api/absence-requests/pending` | `functions/api/absence-requests/pending.js` | Existuje. | D1 povinne. | Potvrdit D1. |
| `POST /api/absence-requests/send-approval-reminders` | `functions/api/absence-requests/send-approval-reminders.js` | Existuje. | Ceka na Cloudflare Cron / naplanovane volani. | Potvrdit produkcni planovac. |
| `GET /api/employees` a podendpointy | `functions/api/employees*.js` | Existuji; D1/R2 dle akce. | P2/P1 pri chybejicim D1/R2. | Potvrdit `SMART_ODPADY_DB` a `SMART_ODPADY_DOCUMENTS`. |
| `GET/POST/PATCH /api/module-feedback` | `functions/api/module-feedback*.js` | Existuje; D1 povinne. | P2 pri chybejici D1. | Potvrdit D1. |
| `GET /api/notifications` | `functions/api/notifications.js` | Existuje; RBAC reports + full/kancelar. | P2 pri chybejici D1/log schema detailu. | Potvrdit migraci `0008`. |
| `GET /api/notifications/summary` | `functions/api/notifications/summary.js` | Existuje. | P2 pri chybejici D1. | Potvrdit D1. |

## 8. Práva a bezpečnost

- RBAC: centralne v `src/permissions.js`; UI i API pouzivaji `hasPermission` / `requireUserPermission`.
- Citlive akce: uzivatele, zamestnanci, absence a notifikace jdou pres serverove functions.
- Tokeny: Twilio/SendGrid tokeny nejsou ve frontendu; jsou jen nazvy env promennych v README/.env example a server code.
- Mock auth: `AUTH_MODE=mock` je povolen jen mimo produkci (`functions/_lib/auth.js:90`).
- API: pri chybejicim D1/R2 backend vetsinou vraci bezpecnou konfiguracni chybu nebo read fallback, neuklada do browser storage.
- Riziko: `.openai/hosting.json` ma `d1: null`, `r2: null`; produkcni Cloudflare stav nutno potvrdit mimo repo.

## 9. Responzivita

Otestovano v prohlizeci na sirich 320, 375, 430, 768, 1024, 1440 px pres lokalni preview `http://127.0.0.1:6200/`.

- Mobil: bez bile obrazovky a bez horizontalniho overflow na kontrolovanych routach.
- Tablet: bez horizontalniho overflow.
- Desktop: bez horizontalniho overflow.
- Konzole: po prochodu rout nebyly zaznamenany `error/warn`.
- Po oprave: `/dovolena-nemoc/notifikace` se na vsech sirich presmeruje na `/reporty`.

Kontrolovane routy:

- `/`
- `/dovolena-nemoc`
- `/dovolena-nemoc/rychle-zadani`
- `/dovolena-nemoc/moje-zadosti`
- `/dovolena-nemoc/nova-zadost`
- `/dovolena-nemoc/ke-schvaleni`
- `/dovolena-nemoc/kalendar`
- `/dovolena-nemoc/zamestnanci`
- `/dovolena-nemoc/notifikace`
- `/pneumatiky`
- `/uzivatele`
- `/nastaveni`
- `/pripominky`

## 10. Doporučené pořadí oprav

1. Vyresit Dovolena / Nemoc zdroj pravdy: odstranit provozne pusobici seed/runtime data a doplnit cloud API pro nastaveni reportu.
2. Potvrdit a zdokumentovat aktualni produkcni Cloudflare bindingy `SMART_ODPADY_DB` a `SMART_ODPADY_DOCUMENTS`, vcetne migraci.
3. Doplnit staticke hluboke routy do buildu, hlavne `/dovolena-nemoc/ke-schvaleni` kvuli e-mailum.
4. Vyresit `/dovolena-nemoc/notifikace`: alias na `/reporty`, nebo odstranit z dokumentace/test listu.
5. Zpresnit stavy modulu na HP/menu: hotove, rozpracovane, skeleton, demo/mock.
6. Doplnit oficialni `lint` a `typecheck` skripty, aby se audit neopiral jen o build a `node --check`.
7. Zkontrolovat migraci `0008` pro opakovatelnost a schema detailu notifikaci.

## 11. Co neopravovat bez potvrzení

- Modul Pneumatiky, vcetne externi aplikace a routingu.
- ElevenLabs integrace, webhook tools, client tools a tokeny.
- Produkcni e-mail/SMS workflow a Cloudflare secrets.
- Produkcni D1/R2 bindingy, migrace a nasazeni.
- HP boxy mimo pripadny schvaleny zaznam verze.
- Produkcni graficke assety, SVG, logo, ilustrace, mikrofon nebo obrazky.
- Git push / deploy / Sites verze.

## 12. Závěr

Aplikace je po poslednich upravach spustitelna a zakladni lokalni browser audit neukazal P0 problem. Nejdulezitejsi neni UI kosmetika, ale sjednoceni Dovolena / Nemoc na realny cloudovy zdroj pravdy a potvrzeni produkcnich D1/R2 bindingu. Dalsi opravy vyzaduji potvrzeni Radima nebo Martina, protoze se mohou dotknout zdroje dat, produkcni konfigurace nebo funkcniho modulu Pneumatiky.

## 13. Dodatek po souhlasu k bodu 10

Po souhlasu k `10. Doporučené pořadí oprav` byly lokálně provedeny jen opravy z bezpečného rozsahu bez pushe a bez nasazení:

- Dovolena / Nemoc uz nepouziva provozne pusobici seed/runtime data jako zdroj pravdy ve frontendu.
- Nastaveni mesicniho reportu ma nove cloud API `GET/PATCH /api/absence-settings` a D1 migraci `0009_create_absence_settings.sql`.
- Build generuje hluboke routy Dovolena / Nemoc vcetne `/dovolena-nemoc/ke-schvaleni`.
- `/dovolena-nemoc/notifikace` je alias na centralni `/reporty`.
- Stavove stitky modulu jsou uzivatelske (`HOTOVO`, `CEKA NA API`, `ROZPRACOVAN`, `PRIPRAVENO`) misto technickych hodnot typu `skeleton`.
- `lint` a `typecheck` skripty byly doplneny jako JS syntax fallback pres `node --check`.
- API gate approve/reject zadosti je pritvrzena na `absence:approve`.
- Notifikacni log ma doplnenou migraci `0010_add_notification_log_details.sql` pro detaily zpravy/provideru.

Overeni po upravach:

- `node scripts/check-syntax.mjs`: proslo.
- `node scripts/check-syntax.mjs --typecheck`: proslo jako fallback, projekt zatim nema TypeScript typecheck.
- `node scripts/build.mjs`: proslo, build hotov: 35 rout.
- Browser kontrola na 320, 375, 430, 768, 1024 a 1440 px: bez bile obrazovky, bez 404 na kontrolovanych routach, bez horizontalniho overflow a bez console erroru.
- `/dovolena-nemoc/nastaveni` po reloadu ukazuje `API AKTIVNI`.
- `/dovolena-nemoc/notifikace` presmeruje na `/reporty`.
- Ochrana neulozenych zmen na nastaveni reportu zobrazi modal s volbami `Ulozit a odejit`, `Odejit bez ulozeni`, `Zustat na strance`.
- Modul Pneumatiky nebyl funkcne menen.

Stale ceka na potvrzeni Radima nebo Martina:

- Produkcni Cloudflare D1/R2 bindingy a spusteni migraci `0009` a `0010`.
- Povoleni push/deploy.
- Jakekoliv dalsi zmeny v modulu Pneumatiky, ElevenLabs, produkcnich secrets nebo grafickych assetech.
