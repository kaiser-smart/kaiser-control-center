# DS completion audit

Datum: 2026-06-29

## Shrnutí

Modul Datová schránka není jen statické UI. V kódu existují serverové endpointy pro zprávy, přílohy, AI Boost, potvrzované akce, e-mail, archivaci, odpověď a pravidlový runner. Bezpečnostní režim je nastavený tak, že ostré akce vyžadují potvrzení uživatele a konfiguraci serverových secrets.

## Stav hlavních oblastí

| Oblast | Stav | Důkaz v kódu | Poznámka |
|---|---|---|---|
| Výchozí DS KS | HOTOVO | `src/app.js` `DATA_BOX_DEFAULT_ACCOUNT_ID` | Výchozí schránka je `kaiser-primary`. |
| Jedna aktivní DS | HOTOVO | `src/app.js` `selectedDataBoxId` | Přepínač drží jednu aktivní schránku, ne režim všechny. |
| Filtr zpráv podle DS | HOTOVO | `src/app.js` `dataBoxMessagesForDirection` | Frontend filtruje přes `message.dataBoxId === selectedAccount.id`. |
| Příznak DS před datem | HOTOVO | `src/app.js` `dataBoxMessageCard` | Badge DS je na druhém řádku před datem. |
| Stránkování default 5 | HOTOVO | `src/app.js` `DATA_BOX_PAGE_SIZES` | Volby jsou 5 / 10 / 20 / 30 / 50 / 100. |
| Vyhledávání | HOTOVO | `src/app.js` search stav | Search je samostatný stav a neresetuje aktivní DS. |
| Přečtené/nepřečtené | HOTOVO | `src/app.js` `dataBoxMessageCard` | Nepřečtené používají stav `new`, tečku a tučnější řádek. |
| Otevřít nyní vs Stáhnout | HOTOVO | `src/app.js` `openDataBoxAttachment` | Otevřít používá blob/object URL, stáhnout používá `download`. |
| Přílohy nahoře | HOTOVO | `src/app.js` `dataBoxAttachmentsSection` | Přílohy jsou před obsahem a technickými údaji. |
| Trezor kompaktně nahoře | HOTOVO | `src/app.js` `dataBoxVaultInfo` | Samostatná karta byla nahrazena řádkem v `Stav a synchronizace`. |
| AI třídění nahoře | HOTOVO | `src/app.js` `dataBoxAiSortingInfo` | AI třídění je součástí `Stav a synchronizace`. |
| Metadata detailu | HOTOVO | `src/app.js` `dataBoxReadingPane` | Duplicitní metadata jsou v zavřených `Technické údaje`. |
| E-mail ze zprávy | ČÁSTEČNĚ | `functions/_lib/data-box-actions-store.js` | Endpoint existuje a vyžaduje potvrzení; ostré odeslání závisí na SendGrid secrets. |
| Archivace zprávy | HOTOVO | `functions/_lib/data-box-actions-store.js` | Serverová archivace vyžaduje `confirmed: true` a zapisuje akci. |
| Odpověď na DS | ČÁSTEČNĚ | `functions/_lib/data-box-actions-store.js` | Endpoint existuje; ostré odeslání vyžaduje serverový KNF/DS endpoint a API key. |
| AI Boost pracovní centrum | HOTOVO | `src/app.js` `dataBoxAiBoostPanel` | Koncepty jsou skupinově potvrzované, nic se nespouští bez potvrzení. |
| Pravidla v cloud DB | ČÁSTEČNĚ | `functions/api/ds/rules.js` | API existuje; skutečný počet a běh musí potvrdit produkční data. |
| Cloud runner automatizací | ČÁSTEČNĚ | `functions/_lib/data-box-automation-runner.js` | Runner existuje; cloud cron/binding je nutné ověřit v produkci. |
| Bezpečnost hesel | HOTOVO v UI/API kontrole | `functions/api/data-box/secrets.js` | API vrací stav, ne hodnotu hesla. |
| Mobilní schování techniky | HOTOVO | `src/styles.css` mobilní media query | Stavové/technické bloky se na mobilu schovávají mimo hlavní práci. |

## Co zůstává závislé na produkční konfiguraci

- OpenAI API secret pro AI Boost.
- SendGrid / e-mail secrets pro ostré e-mailové odeslání.
- KNF/DS reply endpoint a API key pro ostrou odpověď na datovou zprávu.
- Cloudflare cron / scheduled trigger pro automatický runner.
- Živá kontrola, že Nanolab Plus a KS mají oddělená reálná produkční data podle mailboxId.

## Bezpečnost

Tento audit a UI oprava nemění DB, nemění API kontrakt, nemění Cloudflare secrets, neposílá datové zprávy, neposílá e-maily, nemaže zprávy a nespouští automatizace.
