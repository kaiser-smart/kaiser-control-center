# Svozové trasy – interní pilot incidentního workflow

## Rozsah verze 0.1.570

Tato fáze ověřuje celý uživatelský a serverový tok na jediném stacionárním stanovišti Firma test 501, Trnkova 3052/137, Brno. Nejde o ostré řízení svozu.

Řidičský tablet umí:

- přehrávat všechny pokyny produkčním hlasem Šarloty z ElevenLabs bez systémového `speechSynthesis`; při výpadku zůstává text a viditelná chyba, nikoli náhradní strojový hlas;
- otevřít hlasem Šarloty nebo velkým tlačítkem přeplněnou nádobu, poškozenou nádobu a nepřístupnou firmu;
- vyfotit stav zadním fotoaparátem, odstranit původní metadata, zobrazit náhled a uložit fotografii do chráněného R2;
- po uložení fotografie zobrazit samostatný náhled účinku, dostupnou dispečerku, logického příjemce, text zprávy a větev plánování;
- u přeplněné nebo poškozené nádoby skutečně odeslat interní e-mail se schválenou grafikou Smart odpady, fotografií a SMS dostupné dispečerce KSO až po druhém velkém fyzickém potvrzení;
- u nepřístupné firmy dál odesílat pouze na chráněný TEST e-mail a nikdy nekontaktovat zákazníka;
- zobrazit auditovaný výsledek přímo v tabletu;
- u nepřístupné firmy simulovat klidnou a vyhrocenou odpověď zákazníka.

## Pevné bezpečnostní hranice

- Skutečný zákazník se v této fázi nikdy nekontaktuje.
- Přeplněná a poškozená nádoba smí po velkém potvrzení kontaktovat pouze backendem ověřenou aktivní uživatelku KSO, která je propojená s Kartou zaměstnance, je v práci a má v KSO e-mail i telefon.
- Samostatný databázový guard povolí nejvýše 12 ostrých interních dvojic e-mail + SMS. Jedno fyzické potvrzení spotřebuje právě jednu dvojici; opakování stejného workflow nic dalšího neodešle.
- Nepřístupná firma, zákaznické odpovědi, eskalace a připomínky zůstávají chráněný TEST. Jejich skutečný e-mailový příjemce se musí přesně shodovat s tajným `COLLECTION_ROUTES_TEST_EMAIL_TO` a společný guard povolí nejvýše šest pokusů.
- Zákaznická SMS a veškeré RCS jsou technicky vypnuté. Interní SMS je povolená jen u přeplněné nebo poškozené nádoby.
- Hlasová Šarlota jen otevře formulář. Neuloží fotografii, neodešle e-mail a nezmění plán. Pevné hlasové pokyny používají ElevenLabs bez oprávnění k mikrofonu; systémové čtení je zakázané.
- Incident nemění produkční `collection_daily_route_stops`, Vistos ani ostrou denní trasu.
- Náhradní bezplatný svoz vzniká pouze v `collection_route_test_recovery_stops` jako zřetelný TEST route overlay.
- Všechny akce mají deduplikační klíč, auditní stav a poskytovatelský výsledek.

## Výběr dispečerky

Backend čte propojené `SMART_ODPADY_DB.users`, `employee_cards` a `absence_requests`. Kandidátky jsou výhradně:

- Lenka Kouřilová;
- Ulyana Bartošová;
- Simona Šefčíková.

Vyřadí neaktivní osobu, osobu bez trvalého propojení uživatele a Karty zaměstnance, osobu bez e-mailu či telefonu v KSO a osobu s aktuální schválenou nebo evidovanou nepřítomností. Simona se nepoužije, dokud takové trvalé propojení nemá. Z dostupných kandidátek backend vybere stabilně nejméně zatíženou podle otevřených TEST workflow. Když není dostupná žádná, odeslání se zablokuje.

E-mail používá schválenou grafiku `src/email-templates/baseEmailTemplate.html`: značku **kaiser.**, bílou kartu širokou nejvýše 640 px, Quicksand s bezpečným fallbackem a zelené informační bloky. Má viditelný štítek **OVĚŘOVACÍ TEST KSO · INTERNÍ ZPRÁVA**, přiloženou fotografii a údaje stanoviště. Oznamovatel se přebírá z uzamčeného stacionárního TESTU, nikoli z případného jiného jména potvrzující session. SMS je bez diakritiky, nejvýše 160 znaků, vejde se do jediného segmentu, neobsahuje fotografii a odkazuje na e-mail. Obě zprávy výslovně uvádějí, že zákazník nebyl kontaktován a trasa ani Vistos se nemění.

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

Migrace `migrations/test/0006_create_collection_route_test_incident_workflows.sql` obsahuje:

- řízené TEST scénáře;
- workflow incidentu;
- jednotlivé odchozí a plánované akce;
- TEST route overlay náhradního svozu;
- simulovanou konverzaci;
- chráněný e-mailový guard; ostrý interní guard se bezpečně založí při prvním potvrzení.

## Tomáš – pořadí fyzického testu

Test probíhá pouze na Trnkově. Tomáš nikam nejede a před zahájením stránku obnoví.

1. Otevře Řidičský tablet a aktivní stacionární TEST Firma test 501.
2. Zvolí **POŠKOZENÁ NÁDOBA**, vyfotí libovolný bezpečný TEST předmět a klepne na **PŘIPRAVIT TEST HLÁŠENÍ**.
3. Ověří, že se ukáže dostupná dispečerka s textem, že jde o skutečný interní e-mail a SMS. Pokud se ukáže blokace, nic neposílá a předá přesné znění Radimovi.
4. Klepne na **ODESLAT E-MAIL + SMS DISPEČERCE**. Toto je skutečné interní odeslání. Kladný výsledek: e-mail `sent`, SMS `sent`, jméno skutečné dispečerky zobrazené, zákazník nekontaktován, RCS vypnuté, trasa a Vistos beze změny.
5. Založí nový incident **NELZE SE DOSTAT DO FIRMY**, zvolí **TEST A · jedeme kolem do 24 h**, pořídí fotografii a oba kroky fyzicky potvrdí. Kladný výsledek: vůz B, bezplatný TEST overlay, ETA a výslovně žádná změna ostré trasy.
6. Založí další incident **NELZE SE DOSTAT DO FIRMY**, zvolí **TEST B · nejedeme kolem do 24 h** a oba kroky potvrdí. Kladný výsledek: další standardní svoz, pravidlo 30 minut a zrychlená TEST připomínka.
7. U posledního výsledku klepne na **KLIDNÁ ODPOVĚĎ**. Kladný výsledek: serverová TEST odpověď, bez eskalace.
8. Potom klepne na **VYHROCENÁ ODPOVĚĎ**. Kladný výsledek: automatická odpověď zákazníkovi se zastaví a komunikace se předá zobrazené dispečerce.
9. Nic dalšího už neposílá. Interní hlášení neopakuje; backend sice chrání duplicitu, ale skutečnou dispečerku nemáme zbytečně zatěžovat.

Pokud některý guard ukáže nulu, Tomáš test neopakuje. Jde o očekávanou ochranu, nikoli chybu.
