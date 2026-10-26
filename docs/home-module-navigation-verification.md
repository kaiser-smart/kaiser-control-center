# Přímý přístup k modulům z HP — 0.1.861

Příčina: HP vykreslovala pouze tři explicitní karty (Zakázky, Nepřítomnost, Zaměstnanci), zatímco její desktopová postranní nabídka je skrytá. Ostatní agendy bylo nutné hledat (na mobilu byly také pod Více).

Oprava: pod stávajícími kartami přibyl viditelný přehled Další moduly. Vychází ze stávajícího menuModules(user), vynechává už uvedené moduly a neaktivní nebo zakázané položky. Používá skutečné cílové trasy — zejména Dashboard firmy vede na /dashboard. Oprávnění se nemění. Přehled obsahuje také dosavadní Připomínky a chyby; ikony používají stávající registr. Kompaktní karty jsou ve dvou sloupcích na mobilu a třech na desktopu. Při hledání se přehled skryje a po vymazání dotazu obnoví.

Ověření WebKit 26.5 se syntetickými účty a izolovanými API:
- Rozšířený mobile-ux-browser.test.mjs: 41 výsledků bez chyb, sedm rolí, 375/390/430/1440 px. Úplnost všech povolených modulů a správnost tras, absence nepovolených, ikony, skrytí/obnovení přehledu při vyhledávání, přihlášení a navigace.
- Skutečné kliknutí na všech 19 dalších odkazů správce z HP při 375 i 1440 px: 38 otevření a návratů, bez chyb JavaScriptu či přetečení. Návrat použil existující domeček nebo odkaz Zpět na HP podle konkrétní stránky. Tablet 768 px má samostatný screenshot.
- Regresní test mobilního auditu prošel. Produkční guard a readback následují při vydání.

Podklady: outputs/home-module-navigation v hlavním pracovním prostoru. Fyzický iPhone nebyl tímto ověřen. Backend, oprávnění a konfigurace zůstávají beze změny. Výchozí produkce: 0.1.860 / 7f092b72ff07d27325db49b415dcd802ccbc30d7.
