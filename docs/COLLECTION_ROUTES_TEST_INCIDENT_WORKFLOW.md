# Svozové trasy – chráněný TEST incidentního workflow

## Rozsah verze 0.1.564

Tato fáze ověřuje celý uživatelský a serverový tok na jediném stacionárním stanovišti Firma test 501, Trnkova 3052/137, Brno. Nejde o ostré řízení svozu.

Řidičský tablet umí:

- otevřít hlasem Šarloty nebo velkým tlačítkem přeplněnou nádobu, poškozenou nádobu a nepřístupnou firmu;
- vyfotit stav zadním fotoaparátem, odstranit původní metadata, zobrazit náhled a uložit fotografii do chráněného R2;
- po uložení fotografie zobrazit samostatný náhled účinku, dostupnou dispečerku, logického příjemce, text zprávy a větev plánování;
- odeslat e-mail až po druhém velkém fyzickém potvrzení;
- zobrazit auditovaný výsledek přímo v tabletu;
- u nepřístupné firmy simulovat klidnou a vyhrocenou odpověď zákazníka.

## Pevné bezpečnostní hranice

- Skutečný příjemce každého e-mailu se musí přesně shodovat s tajným `COLLECTION_ROUTES_TEST_EMAIL_TO`.
- Skutečný zákazník ani skutečná dispečerka se v této fázi nekontaktují.
- Společný databázový guard povolí nejvýše šest e-mailových pokusů pro schválený polní test. Limit se u neúspěšného pokusu nevrací, aby opakování nemohlo způsobit spam.
- SMS a RCS jsou technicky vypnuté.
- Hlasová Šarlota jen otevře formulář. Neuloží fotografii, neodešle e-mail a nezmění plán.
- Incident nemění produkční `collection_daily_route_stops`, Vistos ani ostrou denní trasu.
- Náhradní bezplatný svoz vzniká pouze v `collection_route_test_recovery_stops` jako zřetelný TEST route overlay.
- Všechny akce mají deduplikační klíč, auditní stav a poskytovatelský výsledek.

## Výběr dispečerky

Backend čte `SMART_ODPADY_DB.employee_cards` a `absence_requests`. Kandidátky jsou výhradně:

- Lenka Kouřilová;
- Ulyana Bartošová;
- Simona Šefčíková.

Vyřadí neaktivní osobu, osobu bez e-mailu a osobu s aktuální schválenou nebo evidovanou nepřítomností. Z dostupných kandidátek vybere stabilně nejméně zatíženou podle otevřených TEST workflow. Když není dostupná žádná, odeslání se zablokuje.

## Nepřístupná firma

Výsledek nevolí jazykový model. Pro fyzický test existují dvě pevná datová zadání:

1. `route_within_24h`: TEST kandidát vozu B splní limit 24 hodin, shodu odpadu a TEST kapacitní podmínku. Vznikne bezplatný TEST overlay s přibližným ETA.
2. `next_standard_pickup`: vhodný TEST kandidát není. Workflow zachová standardní termín a uloží produkční pravidlo připomínky 30 minut před příjezdem. Pro ověření na tabletu je současně uložený zrychlený TEST čas dvě minuty po potvrzení.

Cloudflare Worker každých pět minut volá chráněný Pages endpoint a vybírá splatné TEST připomínky. Běh nezávisí na otevřené aplikaci a používá existující `COLLECTION_ROUTES_RUNNER_TOKEN`.

## Serverová AI a eskalace

OpenAI Responses API smí pouze:

- upravit milé a stručné české znění při zachování všech faktů;
- klasifikovat simulovanou přijatou odpověď.

Při chybě, timeoutu nebo chybějícím klíči se použije pevná bezpečná šablona. Výrazy týkající se právníka, soudu, policie, inspekce, médií, stížnosti, náhrady škody nebo zjevného vyhrocení mají deterministickou přednost před AI. Automatická zákaznická odpověď se zastaví a chráněný TEST e-mail se logicky předá vybrané dispečerce.

## Datové objekty

Migrace `migrations/test/0006_create_collection_route_test_incident_workflows.sql` přidává:

- řízené TEST scénáře;
- workflow incidentu;
- jednotlivé odchozí a plánované akce;
- TEST route overlay náhradního svozu;
- simulovanou konverzaci;
- pevný e-mailový guard.

## Tomáš – pořadí fyzického testu

Test probíhá pouze na Trnkově. Tomáš nikam nejede a před zahájením stránku obnoví.

1. Otevře Řidičský tablet a aktivní stacionární TEST Firma test 501.
2. Zvolí **POŠKOZENÁ NÁDOBA**, vyfotí libovolný bezpečný TEST předmět a klepne na **PŘIPRAVIT TEST HLÁŠENÍ**.
3. Ověří, že se ukáže Lenka, Ulyana nebo Simona jako dostupná dispečerka, náhled zprávy a informace, že skutečný příjemce je jen chráněný TEST e-mail.
4. Klepne na **POTVRDIT TEST E-MAIL A PLÁN**. Kladný výsledek: stav dokončený, e-mail `sent`, žádný zákazník ani dispečerka kontaktováni, SMS/RCS vypnuté.
5. Založí nový incident **NELZE SE DOSTAT DO FIRMY**, zvolí **TEST A · jedeme kolem do 24 h**, pořídí fotografii a oba kroky fyzicky potvrdí. Kladný výsledek: vůz B, bezplatný TEST overlay, ETA a výslovně žádná změna ostré trasy.
6. Založí další incident **NELZE SE DOSTAT DO FIRMY**, zvolí **TEST B · nejedeme kolem do 24 h** a oba kroky potvrdí. Kladný výsledek: další standardní svoz, pravidlo 30 minut a zrychlená TEST připomínka.
7. U posledního výsledku klepne na **KLIDNÁ ODPOVĚĎ**. Kladný výsledek: serverová TEST odpověď, bez eskalace.
8. Potom klepne na **VYHROCENÁ ODPOVĚĎ**. Kladný výsledek: automatická odpověď zákazníkovi se zastaví a komunikace se předá zobrazené dispečerce.
9. Nic dalšího už neposílá. Tím se využije nejvýše schválených šest e-mailových pokusů včetně automatické TEST připomínky.

Pokud e-mailový guard ukáže nulu, Tomáš test neopakuje. Jde o očekávanou ochranu, nikoli chybu.
