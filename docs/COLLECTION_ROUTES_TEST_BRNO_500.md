# Svozove trasy - TEST Brno 500

Stav: produkcni TEST sada a jedna trasa overeny; prvni e-mail odeslan, prvni SMS
zustala zablokovana pred Twiliem kvuli chybejici komunikacni migraci a vypnutemu
rezimu zakaznickych SMS.

Aktualizace: 2026-07-12

## Cil

Samostatna synteticka sada umozni testovat Svozove trasy ve velikosti blizke
budoucimu ostrému provozu, aniz by se testovaci firmy, stanoviste, trasy nebo
odesilaci ulohy smichaly s Vistosem a hlavni produkcni D1.

TEST sada je viditelna pouze aktivnim uzivatelum s roli `management` nebo
`admin`, kteri maji opravneni `collection-routes:manage`.

## Data

- 100 firem `Test 1 s.r.o.` az `Test 100 s.r.o.`.
- Kazda firma ma 5 stanovist, celkem presne 500.
- Kontakt firmy N je `RadimN TestN`.
- Telefon a e-mail se nacitaji pouze ze serverovych promennych
  `COLLECTION_ROUTES_TEST_SMS_TO` a `COLLECTION_ROUTES_TEST_EMAIL_TO`.
- Nadoby jsou pouze 120, 240 a 1100 litru.
- Odpady: presne 350 SKO, 60 PAPIR, 45 PLAST, 25 BIO a 20 SKLO.
- Cetnosti: `1x7`, `2x7`, `3x7`, `5x7`, `1x14` a `1x30`.
- Adresy a GPS jsou 500 jedinecnych verejnych adresnich bodu Brna z
  [GIS Brno - adresni mista](https://gis.brno.cz/ags1/rest/services/Hosted/OD_adresni_mista_Brno/FeatureServer/0).
- Generovani je deterministicke se seedem `20260712`; aktualizace adres se dela
  pouze skriptem `scripts/generate-collection-routes-brno-addresses.mjs`.

Cetnost `1x30` je v datech zastoupena, ale denni planovac ji bez potvrzeneho
konkretniho data stejne jako v ostrem rezimu bezpecne vyradi. Tim TEST sada
soucasne hlida tuto znamou funkcni mezeru.

## Fyzicke oddeleni

Hlavni produkcni D1 zustava pod bindingem `SMART_ODPADY_DB`.

TEST data, testovaci denni trasy a jejich odesilaci ulohy pouzivaji vyhradne
samostatny binding `COLLECTION_ROUTES_TEST_DB`. Do teto databaze se aplikuji v
poradi:

1. `migrations/0017_create_collection_routes_phase1a.sql`
2. `migrations/0038_create_collection_daily_routes.sql`
3. `migrations/test/0001_create_collection_routes_test_control.sql`
4. `migrations/test/0002_create_collection_route_here_optimization.sql`
5. `migrations/test/0003_configure_collection_route_test_operations_and_gps.sql`

Zadna migrace z `migrations/test` se nesmi aplikovat do hlavni produkcni D1.

Backend pri `scope=test` vzdy znovu overi roli Management/Admin a vybere TEST
binding. Pouhe ID trasy nebo zmena dotazu proto neumozni precist ani zapsat TEST
trasu pres hlavni databazi.

## Fyzicke GPS stanoviste

Ridicsky TEST nahled u aktivni trasy umi nacist vice GPS vzorku a pripravi
fyzicky bod u nadob. Hlasova Sarlota muze mereni spustit, ale ulozeni vzdy
vyzaduje jedno rucni finalni potvrzeni na velkem tlacitku. Tlacitko ma na
uzkem displeji minimalni vysku 132 px a na vetsim displeji 120 px.

Backend prijme bod pouze pri alespon trech vzorcich, presnosti nejvyse 30 m a
rychlosti nejvyse 1,5 m/s. Vyrazne odchylena poloha se ulozi jako
`needs-review` a bez kontroly neni navigacnim cilem. Puvodni adresa ani jeji GPS
se fyzickym merenim nikdy neprepisuji. Historie obsahuje trasu, zastavku,
ridice, vozidlo, presnost, pocet vzorku, rychlost, vzdalenost od adresniho bodu,
stav a idempotencni klic.

Migrace `0003` soucasne uklada pouze TEST provozni podklady depa, vysypu,
smeny a konzervativnich truck profilu A/B/C. Rozmery, hmotnosti, cas vysypu a
nektere vjezdy jsou oznacene jako odhad a pred ostrym pouzitim vyzaduji
technicky prukaz nebo fyzicke overeni.

## Skutecne SMS a e-maily

Zalozeni 500 stanovist ani ulozeni TEST trasy neposila zadnou zpravu.

Skutecne odeslani ma samostatny tok:

1. Manager/Admin zvoli jednu zastavku nebo celou TEST trasu.
2. Backend vrati presny pocet SMS, e-mailu a skutecne prijemce.
3. Uzivatel potvrdi presny pocet zprav.
4. Backend vytvori idempotentni odesilaci ulohu v TEST D1.
5. Zpravy se zpracovavaji rucne po nejvyse 5 zastavkach na jedno volani.

SMS pouziva existujici produkcni Twilio tok vcetne STOP textu, opt-out kontroly,
transakcniho duvodu, deduplikace a auditu v hlavni komunikacni evidenci. E-mail
pouziva existujici SendGrid tok a notifikacni audit. Obe zpravy jsou vyrazne
oznacene `TEST SVOZ` a upozornuji, ze nejde o skutecneho zakaznika ani svoz.

Kazdy kanal se pred volanim poskytovatele atomicky oznaci jako `sending`. Pokud
by worker spadl po prijeti zpravy poskytovatelem, polozka se automaticky
neopakuje, aby nevznikla duplicitni zprava.

Pokud kanal skonci jako `failed` bez provider ID, Manager/Admin muze po novem
explicitnim potvrzeni vratit do fronty pouze tento konkretni kanal. Odeslany
e-mail nebo SMS se stavem `sent` zustane nedotceny. Kanal s provider ID se
automaticky neopakuje. Rozpracovana nebo castecna uloha se nacte z TEST D1 i po
obnoveni stranky a UI v tomto stavu nenabidne zalozeni nove uplne davky.

Opakovani SMS backend povoli jen pri kompletnim Twilio ENV a rezimu `live`.
Migrace `0032_create_customer_messaging.sql` byla do hlavni produkcni D1
aplikovana 2026-07-12; vytvorila tri prazdne komunikacni tabulky. Samotny prechod
z rezimu `off` na `live` vyzaduje samostatne provozni potvrzeni.

Neexistuje cron, worker ani queue, ktera by zpravy spustila automaticky.

## API

- `GET|POST /api/collection-routes/test-dataset`
- `POST /api/collection-routes/test-notifications/preview`
- `POST /api/collection-routes/test-notifications`
- `GET /api/collection-routes/test-notifications?runId=:runId`
- `GET /api/collection-routes/test-notifications/:jobId`
- `POST /api/collection-routes/test-notifications/:jobId/process`
- `POST /api/collection-routes/test-notifications/:jobId/retry-failures`
- `GET /api/collection-routes/test-operational-config`
- `GET|POST /api/collection-routes/test-gps-confirmations`
- Stavajici denni trasy prijimaji `scope=test` v query nebo JSON body.

## Akceptacni kontrola

- Datovy generator vrati presne 500 radku a 100 firem po 5 stanovistich.
- Presne 350 radku je SKO a zadna nadoba nema jiny objem nez 120/240/1100 l.
- Vsechny adresy maji jedinecne zdrojove ID a GPS v rozsahu Brna.
- Chyba uprostred zalozeni vrati celou TEST davku zpet.
- TEST trasa nevytvori zadny beh v hlavni produkcni D1.
- Fyzicke GPS mereni neprepise zdrojovou adresu ani jeji souradnice.
- Pohybujici se vozidlo, malo vzorku nebo slaba presnost se odmitnou pred zapisem.
- Hlasovy povel sam nedokonci zapis bez velkeho finalniho tlacitka.
- Dispecer, Ridic a Readonly nedostanou TEST data ani pres prime API.
- Opakovane zpracovani dokoncene ulohy neodesle SMS ani e-mail podruhe.
- Castecna uloha s odeslanym e-mailem zopakuje jen failed SMS bez provider ID;
  puvodni e-mailove provider ID zustane beze zmeny.
- Prvni produkcni smoke test odeslal 1 e-mail na chraneny testovaci kontakt.
  Opakovani jedine SMS ceka na samostatne potvrzeni rezimu `live`; cela trasa se
  pri nasazeni nespousti.
