# Mobilní pracovní rozhraní · pevný návrh před implementací

Základ: 0.1.830 / 758685ac; aktuální produkční kód 0.1.831 / ef07b8e (vizuálně shodný). Audit WebKit 26.5, syntetický administrátor a izolované API. Nejde o měření četnosti uživatelů: priority vycházejí z existující skupiny Hlavní práce, oprávnění a konkrétních workflow.

375×667, sjednocené testovací podklady: úvodní stránka 12 112 px, první obrazovka bez KPI; vozidla 5753 px, poloha 3385 px, svozy 4104 px, datové schránky 3081 px, pohledávky 4995 px. Na 390×844 a 430×932 stejný problém. Existující horizontální modulová navigace a velké úvodní karty oddalují práci.

## Závazný návrh
- Mobilní breakpoint 720 px; desktop beze změny pořadí a funkcí. Quicksand, stávající zelená #75bd25, text #11191d, bílé pracovní plochy, šedé pozadí. Žádné velké stíny, radius 12 px, mezery 8/12/16 px.
- Horní lišta 52 px + bezpečný okraj; název aktuální agendy, návrat na přehled, nabídka. Dolní navigace 60 px + bezpečný okraj: Dnes, Vozidla, Trasy, Hlášení, Více. Každá položka pouze při existujícím oprávnění. Pořadí stabilní; další agendy v prohledávatelném menu včetně účtu a odhlášení.
- Dnes: tři aktuální KPI, čtyři povolené rychlé akce (poloha, hlášení, nepřítomnost, datové schránky), pracovní upozornění. Ekonomika a úplný provozní přehled na samostatné volbě Přehledy; nepřidávat neověřená čísla ani skrývat nedostupnost dat.
- Modulová navigace: jeden výběr sekce místo dlouhé řady záložek. Vždy stejný mechanismus. Úvodní popisy a pomocné informace sbalitelné, hlavní akce zachované.
- Seznamy: maximálně 8 záznamů na stránku, ne nekonečný posun. Klíčová identita a stav v kompaktním řádku, další pole po rozbalení nebo otevření původního detailu. Žádná ztráta záznamů či akcí. Filtry v rozbalovacím panelu, zachovat hodnoty i stav po překreslení.
- Poloha: přepínač Mapa / Vozidla, mapa využije dostupnou výšku. Ovládání mapy v rozbalení nad mapou; seznam a detail nepřidávat pod mapu. Chybějící poskytovatel mapy musí zůstat pravdivě označený.
- Formuláře: jedno sloupcové ovládání, vstupy 16 px (bez iOS zoomu), cíle nejméně 44 px, klávesnice nesmí zakrýt aktivní pole. Jediný scroll dokumentu; menu/modální dialog je samostatná aktivní plocha se zamčeným pozadím.
- Grafický vzor Rychlého hlášení: bílé pracovní plochy, jednotný zelený primární ovladač, stejné formuláře a rozbalování ve všech modulech. Správa uživatelů používá kompaktní seznam a samostatně otevíraný editor; původní checkboxy oprávnění zůstávají ve formuláři, po modulech a se stránkováním. Kalendář zůstává věcně beze změny.
- Žádné změny API, serverových oprávnění, databází ani business akcí. Původní handlery ovládají také nové mobilní vstupy.

## Akceptace
Screenshoty původní a nové aplikace na 375×667, 390×844, 430×932; horní lišta 52 px, KPI a rychlé akce nad foldem, přepínání modulů, stránkování všech vozidel, dostupnost detailu a filtrů, správné role, návrat, klávesnice (simulace změny viewportu), desktop 1440×1000, autentizace/expirace/offline logout. Fyzický iPhone a živé napojení mapových podkladů uvést zvlášť, nepředstírat ověření.

## Upřesnění uživatele před vydáním
Referencí je již mobilní Rychlé hlášení: jedna úloha, jedno sloupcové pracovní zobrazení, přímo dostupné hlavní ovládání a velké dotykové cíle. Stejný princip platí ve všech agendách. Nevymýšlet nové pracovní postupy; rozbalení mění pouze prezentaci původního obsahu. Zahrnout také zbývající moduly z reálné navigace do vizuální kontroly. Firemní poštu skrýt v navigaci i nastavení, starý odkaz vracet na přehled; plovoucí hlasovou ikonu skrýt na mobilu i desktopu, zachovat ovládání případného aktivního hovoru.
