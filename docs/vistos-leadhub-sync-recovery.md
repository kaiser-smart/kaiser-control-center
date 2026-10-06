# Vistos → LeadHub Kaiser: obnova synchronizace

## Příčina opakovaného zastavení

Zámek R2 původně neměl lhůtu ani kontrolu vlastníka před dalším zápisem. Pád požadavku mohl přeskočit `finally` a nechat neterminální zámek. Částečná obnova požadovala buď příznak `terminal`, nebo ručně nastavený konkrétní `RECOVERY_OWNER`. Nová náhodná dávka proto stejný problém zopakovala. Samotná fáze `RECONCILING` rovněž neměla obnovitelný claim. Jeden nepotvrzený kontakt navíc blokoval uzavření celé dávky.

Při auditu 5. 10. byl v deníku přerušené dávky doložen stav pěti `READBACK_CONFIRMED` a jednoho `TAG_ACCEPTED`. To dokládá přerušení před závěrečným potvrzením/commitem, nikoli přesnou příčinu ukončení procesu. Historický log infrastruktury nebyl k dispozici; konkrétní timeout či překročení paměti nelze vydávat za prokázaný fakt.

Produkční ověření 6. 10. navíc odhalilo chybu nového úklidu: `finally` předával do `releaseWriter` již přečtený `R2ObjectBody`, jehož `.json()` nelze zavolat podruhé. Dávka mohla být úspěšně potvrzená, ale zámek zůstal až do automatické obnovy. Uvolnění nyní načítá vlastní čerstvé tělo, znovu ověřuje generaci a používá jeho ETag. Testovací R2 používá skutečně jednorázové tělo `Response`; před opravou test selhal na `Body has already been read`, po opravě ověřuje okamžité uvolnění úspěšné i prázdné dávky a bezpečnost souběhu.

## Hranice změny

Zůstává jeden Durable Object, stávající R2 ledger, zdrojové snímky, deník operací, kontrola identity a limitování API. Není zavedena nová databáze ani druhý importér. Velký společný stav zůstává výkonovým rizikem, které je vhodné měřit před případným samostatným návrhem rozdělení dat.

## Lifecycle

1. Získání zámku je podmíněný R2 zápis `If-None-Match: *` nebo `If-Match` nad uvolněnou verzí s náhodným ID a lhůtou 100 sekund.
2. Zdrojový snímek a celá fronta se uloží před jakýmkoli zápisem profilu. Změny zdroje mají desetiminutový překryv.
3. Kontakt prochází `INTENT → WRITE_INTENT → PROFILE_ACCEPTED/TAG_ACCEPTED → READBACK_CONFIRMED`. Každý externí zápis předchází trvalý záměr.
4. Zápis do profilu, tagu i R2 kontroluje platnou lhůtu a vlastnictví. Sdílený ledger se ukládá přes ETag načtené verze. Opožděný zapisovatel nesmí přepsat novější commit.
5. Úspěšně dočtené operace se potvrdí jedním společným commitem. Potom se zámek podmíněně označí `RELEASED`. Nepoužívá se nepodmíněné mazání, které by při opožděném dokončení mohlo odstranit nového vlastníka.
6. Po přerušení následuje lhůta plus 120 sekund klidu. Stará verze zámku bez lhůty vyžaduje deset minut. Expirace povoluje pouze obnovu čtením, nikdy opakování nejasného zápisu.
7. Obnova získá vlastní podmíněný claim `RECONCILING`, opět se lhůtou. Ověří úplný a stabilní deník, aktuální profily, identity, tagy a odběry.
8. Potvrzené operace převezme jednou přes `reconciledOperations`; již zapsané výsledky znovu nepočítá. Prokazatelně přijatý samostatný profil může pokračovat pouze chybějícím tagem po nové kontrole zdroje. Nejasný výsledek jde do chráněné karantény.
9. Chyba čtení nebo úložiště ponechá `RECOVERY_RETRY` s odstupem 1–15 minut; `Retry-After` může čekání prodloužit. Pád obnovy před/po commitu nebo při uvolnění zámku je obnovitelný stejným postupem.

## Chyby jednotlivých kontaktů

- Prokazatelně nezahájené/nepřijaté operace mají vlastní počítadlo a odstup opakování. Zbytek dávky pokračuje.
- Opakovaná deterministická chyba se po třech pokusech oddělí pro danou verzi zdroje. Změna zdroje umožní nové ověření.
- Přijatý nebo nejasný zápis se nikdy nepovažuje za bezpečný k opakování jen kvůli chybě spojení.
- Opakovaně nečitelný jednotlivý profil lze po třech READ pokusech izolovat, pokud nezávislé čtení odběrů funguje. Výpadek poskytovatele nezpůsobí plošnou karanténu.
- Globální problém s přihlášením, limity API, úplností dat nebo skutečným bezpečnostním incidentem zůstává viditelnou blokací; nic se neobchází.
- Export pro kontrolu nových identit má limit 15 minut. Selhaná či zaniklá READ úloha se nahradí s odstupem, při zachování všech čekajících identit a kontroly kolizí.

## Idempotence a checkpoint

Profil používá stabilní `vistos-contact-<Id>` a ověřený normalizovaný e-mail. Cizí identity se neslučují. Pro propojení existujícího profilu bez vlastního ID se zachovává režim pouze přes integrační tag. Opakovaný stejný výsledný profil a tag nevyvolá další zápis.

`checkpoint` / `capturedCheckpoint` znamená bezpečně načtený zdroj společně s trvalou frontou, nikoli potvrzení doručení. `appliedCheckpoint` se posune až po vyprázdnění fronty i ověření identit, bez chyb a nevyřešené karantény. `lastConfirmedContact` eviduje poslední skutečný readback jednotlivého zdrojového záznamu. Převzetí deníku samo checkpoint neposouvá.

## Scheduler a diagnostika

Cron každou minutu kontroluje Durable Object. Alarm před síťovým požadavkem uloží náhradní probuzení za tři minuty. Souběžné doručení sdílí jediný běh; nová instance počká na konec lhůty předchozího požadavku. Po úspěchu, dílčí chybě i výjimce vzniká další alarm. Úspěšný HTTP návrat obnovy není označen jako úspěšná synchronizace profilů.

Chráněný stav `/api/receivables/vistos/leadhub-sync-status` a rozbalená diagnostika na `/vistos/` uvádí ID a fázi dávky, počty, chybu, opakování, lhůtu, další pokus a čas posledního úspěšného běhu. R2 ukládá `attempts/<batchId>.json`, `last-attempt.json`, deník kontaktů a doklady `reconciliation/<batchId>/`. Běžné logy neobsahují adresy, jména ani tajné hodnoty.

Základní vlastnosti platformy: [alarmy Durable Objects](https://developers.cloudflare.com/durable-objects/api/alarms/), [konzistence R2](https://developers.cloudflare.com/r2/reference/consistency/).

## Souhlasy

Import nikdy neposílá požadavek na změnu odběru newsletteru nebo svátků ani na odeslání zprávy. Zápisy na `/subscriptions/` jsou výslovně zakázané. Před a po změně profilu se porovnávají odběry a suppression. Později zjištěná změna souhlasu se automaticky nevrací do původního stavu; nejasná identita se izoluje.

## Ověření a nasazení

`npm run test:vistos-contacts` obsahuje výběr kontaktů, původní integrační testy, CSV, diagnostiku a novou matici spolehlivosti. Pokrývá úspěch, prázdnou/dílčí dávku, chybný kontakt, obě API, chybu úložiště, skutečný abort, přijatý zápis bez odpovědi, přerušený proces, restart, opakování, ETag konflikt, souběžné běhy/obnovy/alarmy, starý claim, checkpoint a zachování obou typů souhlasů.

Produkční Pages se nasazují pouze stávajícím `npm run deploy:pages:production` z čistého aktuálního `main`. Poté se nasadí konfigurace `wrangler.vistos-leadhub-profile-sync-runner.toml`; incidentní `RECOVERY_OWNER` už není potřebný. Doložit se musí doklad obnovy aktuální dávky a nejméně dva následující automatické běhy. Lokální test ani zelené CI toto nenahrazuje.

Při návratu starší verze je nutné nejprve ověřit, že neběží obnova; starý backend neumí nové opakované claimy ani stav `RELEASED`. Návrat proto vyžaduje koordinované převedení stavu, nikoli pouhé přepnutí verze. Zámek se ručně nemaže a neověřené kontakty se znovu nespouštějí.
