# Cílová specifikace ručního nastavení SO.ai

Schválený směr od Radima, 25. 9. 2026. Rozsah se realizuje po ověřených etapách; nejde o příslib všech funkcí. Níže je dodaná analýza v původním znění. Tvrzení o jiných produktech jsou převzaté podklady, nikoli nové ověření. Aktuální realizace a provozní hranice: [FORPSI_CONNECTOR.md](FORPSI_CONNECTOR.md).

**Ruční nastavení v SO.ai má být plnohodnotné místo, kde si člověk připojí schránku, upraví pracovní prostředí a spravuje všechny povolené funkce bez pomoci ChatGPT.** Správce firmy musí mít navíc samostatné ovládání společných nastavení, přístupů kolegů a provozu konektoru.

„Ruční“ zde chápu jako **nastavení a ovládání přes formuláře a tlačítka**. Člověk může ručně sestavit i automatické pravidlo; jeho uložení a zapnutí ale musí být dvě rozlišitelné věci.

Porovnal jsem oficiální dokumentaci osmi relevantních řešení a přečetl podklady současného pilotu. Níže odděluji doložené poznatky od vlastního návrhu pro SO.ai. Analýza je k **25. 9. 2026**.

**Co převzít z podobných aplikací**

| Aplikace | Doložený přístup | Co z něj doporučuji pro SO.ai |
|---|---|---|
| **Forpsi Webmail** | Odděluje nastavení účtu od předvoleb webmailu; obsahuje podpisy, filtry, štítky, antispam a nastavení kalendáře. [Nastavení Forpsi](https://support.forpsi.com/kb/a3437/zakladni-nastaveni.aspx?translation-detect=false) | Jasně odlišit skutečnou změnu ve Forpsi od předvolby platné pouze v SO.ai. |
| **Outlook / Microsoft 365** | Rozlišuje sdílenou schránku, sdílené složky a delegování. Odesílání „jako někdo“ a „jménem někoho“ mají odlišný význam. [Sdílení a delegování](https://support.microsoft.com/en-us/outlook/sharing/about-shared-mailboxes-shared-folders-and-shared-calendars-in-outlook) | Samostatná práva pro čtení, úpravy, odesílání, mazání a správu. Pouhé zpřístupnění schránky nesmí znamenat všechna práva. |
| **Gmail** | Filtr lze připravit z vyhledávání nebo konkrétní zprávy; filtry lze upravovat a exportovat. [Filtry Gmailu](https://support.google.com/mail/answer/6579?hl=en) | Stejné podmínky používat pro hledání i pravidla. Před spuštěním ukázat odpovídající zprávy. |
| **Zoho Mail** | Sdružuje nastavení pošty, identit, podpisů a nepřítomnosti; součástí prostředí jsou také úkoly a poznámky. [Nastavení](https://www.zoho.com/mail/help/mail-settings.html), [úkoly](https://www.zoho.com/mail/help/tasks.html), [poznámky](https://www.zoho.com/mail/help/notes.html) | Propojit jednotlivé agendy a sjednotit jejich ovládání, sdílení a upozornění. |
| **Thunderbird** | Podrobně řeší identity, Reply-To, podpisy, ukládání zpráv a předvolby konkrétního účtu. [Nastavení účtů](https://support.mozilla.org/en-US/kb/configuration-options-accounts) | Technické volby zpřístupnit v rozšířeném nastavení. Běžný uživatel má dostat předvyplněné hodnoty a výběr existujících složek. |
| **Fastmail** | Nastavení odesílatele a podpisu váže na konkrétní adresu; rozlišuje složky a štítky a umožňuje jejich správu. [Adresy a identity](https://www.fastmail.help/hc/en-us/articles/1500000280401-Identities), [nastavení](https://www.fastmail.help/hc/en-us/articles/6414132167311-Fastmail-settings) | Výchozí adresu, podpis a chování odpovědí nastavovat pro každou odesílací identitu zvlášť. |
| **Front** | Rozlišuje osobní, týmová a firemní pravidla. Sdílený štítek sám o sobě nezpřístupňuje soukromou konverzaci ostatním. [Rozsah pravidel](https://help.front.com/en/articles/2001), [štítky](https://help.front.com/en/articles/2100) | Oddělit organizaci zpráv od jejich zpřístupnění kolegům. U pravidla vždy uvést, na koho a na které schránky působí. |
| **Nextcloud** | Nabízí samostatná práva ke kalendářům a souborům, včetně odvolatelných odkazů a omezeného sdílení. [Kalendáře](https://docs.nextcloud.com/server/stable/user_manual/en/groupware/calendar.html), [soubory](https://docs.nextcloud.com/server/stable/user_manual/en/files/sharing.html) | Použít jednotné principy vlastnictví, sdílení a obnovy napříč kalendářem, adresářem a soubory. |

Důležitá hranice srovnání: **funkce konkurenční aplikace automaticky neznamená stejnou možnost pro připojenou schránku Forpsi.** Například nový Outlook podle dokumentace nepodporuje svá pravidla pro některé účty třetích stran. Rozsah funkcí závisí na poskytovateli i konkrétním klientovi. [Omezení pravidel Outlooku](https://support.microsoft.com/en-us/outlook/mail/manage-email-messages-by-using-rules-in-outlook)

**Jak nastavení rozdělit**

Doporučuji dvě vstupní obrazovky: **Moje nastavení** a **Správa firmy**. Uvnitř musí být vždy zřejmé, kterou schránku nebo pracovní prostor člověk právě nastavuje.

| Úroveň | Co sem patří | Kdo rozhoduje |
|---|---|---|
| **Osobní předvolby** | Vzhled, řazení, upozornění, oblíbené položky, pracovní doba | Uživatel |
| **Konkrétní schránka / kolekce** | Připojení, složky, odesílací identity, společné podpisy, pravidla | Vlastník nebo pověřený správce |
| **Tým / firma** | Přístupy, závazné šablony, limity, sdílení, uchovávání dat | Firemní správce |
| **Provoz integrace** | Dostupnost služeb, synchronizace, technická diagnostika | Správce integrace |

Firemní nastavení má umožnit **výchozí hodnotu** i **závaznou hodnotu**. Uživatel musí poznat rozdíl mezi „převzato z firmy, můžete změnit“ a „určeno správcem“.

U každého nastavení musí být zřejmé:

- **Pro koho platí:** jen pro mě, pro schránku, pro tým, pro celou firmu.
- **Kde se projeví:** pouze SO.ai, také Forpsi, případně další připojená služba.
- **Kdo jej může změnit.**
- **Zda je uložené, účinné a ověřené.**
- **Jaký má dopad na existující data a naplánované akce.**

Následující katalog je můj návrh požadavků pro SO.ai. Nejde o tvrzení, že všechny tyto možnosti již fungují nebo že je Forpsi poskytuje přes dostupné rozhraní.

1. **Schránky a připojení**

   Každá schránka potřebuje adresu, zobrazovaný název, vlastníka, účel a označení osobní/sdílená. Uživatel má vidět dostupné služby, poslední úspěšné ověření a případnou chybu jednotlivě pro poštu, kalendář a adresář.

   Formulář musí umožnit připojení, bezpečnou změnu uloženého hesla, opětovné ověření, pozastavení a odpojení. **Změna hesla uloženého v konektoru a změna hesla přímo u Forpsi jsou dvě odlišné operace.**

   Odpojení konektoru nesmí vypadat jako zrušení schránky u poskytovatele. Technické parametry patří do rozšířeného nastavení; běžné připojení Forpsi má používat ověřenou předvolbu.

2. **Odesílací adresy a identity**

   Nastavovat jméno odesílatele, výchozí adresu, povolené alternativní adresy, Reply-To a přiřazený podpis. U sdílené schránky musí být patrné, jakého odesílatele uvidí příjemce.

   Odpověď má přednostně použít odpovídající oprávněnou adresu původní komunikace. Uživatel musí mít možnost ji před odesláním změnit.

   Přidání alternativní adresy do SO.ai nesmí předstírat její vytvoření nebo oprávnění k odesílání u Forpsi. Automatickou kopii či skrytou kopii lze nabídnout jako samostatnou, viditelnou předvolbu pod firemní kontrolou.

3. **Vzhled a osobní pracovní prostředí**

   Jazyk, časové pásmo, formát data a času, světlý/tmavý/systémový vzhled, velikost textu, hustota seznamů, umístění náhledu zprávy, výchozí modul a schránka.

   Dále pořadí schránek a oblíbených složek, seskupování do konverzací, řazení, zobrazované sloupce, klávesové zkratky a mobilní gesta.

   Nastavení musí fungovat i s klávesnicí, zvětšeným textem a na telefonu. Barva nesmí být jediným nositelem významu štítku nebo stavu.

4. **Čtení pošty a vyhledávání**

   Volba, kdy se zpráva označí jako přečtená; chování po archivaci nebo smazání; rozbalování konverzací; zobrazování citované historie.

   Samostatně upravit načítání vzdálených obrázků, výjimky pro důvěryhodné odesílatele a reakci na žádosti o potvrzení přečtení.

   Vyhledávání potřebuje rozsah schránek a složek, přepínač zahrnutí spamu/koše, podmínky odesílatel–příjemce–datum–příloha–stav–štítek a uložená hledání. Výsledek musí oznámit, pokud prohledal jen část historie nebo nemohl prohledávat obsah příloh.

5. **Psaní a odesílání**

   Výchozí formát zprávy, písmo, jazyk kontroly pravopisu, způsob citování, odpovědět versus odpovědět všem, přeposlání vložené nebo jako příloha.

   Dále interval ukládání konceptu, výchozí podpis, šablony odpovědí, připomenutí zapomenuté přílohy a upozornění na neobvyklé externí příjemce.

   Před odesláním musí být přehledné **Od, Komu, Kopie, Skrytá kopie a přílohy**. „Vzít zpět odeslání“ lze nabízet jako krátké zdržení před předáním serveru; nesmí slibovat odvolání již předané zprávy.

6. **Plánované odeslání a fronta**

   Datum, čas a časové pásmo; vlastní předvolby typu „zítra ráno“; přehled čekajících zpráv; úprava a zrušení plánu; změna obsahu před odesláním.

   Musí být definováno, co se stane při vypnutí schránky, odchodu zaměstnance, změně oprávnění nebo výpadku poskytovatele. U přechodu letního času musí být zřejmé, který okamžik uživatel zvolil.

   Rozlišovat stavy **čeká, pozastaveno, předává se, přijato serverem, částečně přijato, selhalo, výsledek nejistý, zrušeno**. Nejistý výsledek nesmí vést k automatickému opakování a duplicitní zprávě. Přijetí SMTP serverem není důkaz doručení.

7. **Složky a archivace**

   Vytvořit, přejmenovat, přesunout a odstranit složku; spravovat hierarchii, viditelnost a oblíbené položky. Speciální složky Koncepty, Odeslané, Koš, Spam a Archiv vybírat ze skutečně existujících složek.

   Zobrazit zaplnění, pokud jej poskytovatel zpřístupňuje. Před odstraněním ukázat obsah a závislosti. Archivace musí mít jasně zvolený cíl; nesmí znamenat skryté smazání.

   **Konkrétní nález pro Forpsi:** dokumentace upozorňuje, že přejmenování nebo smazání cílové složky mimo webmail může zanechat neplatné serverové pravidlo a způsobit nedoručitelnost odpovídajících zpráv. Dokud konektor neumí tyto závislosti ověřit, musí takovou operaci omezit nebo nasměrovat do webmailu. [Pravidla a změny složek ve Forpsi](https://support.forpsi.com/kb/a3461/filtrovani-zprav.aspx?translation-detect=false)

8. **Štítky**

   Vytvářet, přejmenovávat, měnit barvu a popis, řadit, slučovat a odstraňovat. Rozlišovat osobní a společné štítky i právo **spravovat definice** oproti právu **přidělovat existující štítky**.

   Podporovat více štítků na zprávě, hromadné přidělení/odebrání a filtrování podle kombinace štítků. Odstranění štítku nesmí odstranit zprávy.

   U každého štítku zobrazit jeho původ. Forpsi má vlastní štítky; dnešní evidence konektoru se s nimi nesmí zaměňovat. [Štítky Forpsi](https://support.forpsi.com/kb/a3458/pouzivani-stitku.aspx?translation-detect=false)

9. **Pravidla**

   Každé pravidlo potřebuje název, popis, vlastníka, rozsah schránek/složek, stav, pořadí, podmínky, výjimky a akce. Podmínky musí podporovat „všechny“ i „alespoň jednu“ a srozumitelně zacházet s diakritikou, velikostí písmen a daty.

   Akce podle skutečných možností: štítek, příznak, označení přečtení, přesun, archivace, přiřazení kolegovi, vytvoření úkolu; přeposlání či odpověď jen s odpovídajícím oprávněním.

   Nezbytné ovládání: **vytvořit, upravit, duplikovat, změnit pořadí, pozastavit, otestovat, spustit nad výběrem, odstranit**. Nabídnout ukončení zpracování dalších pravidel a ukázat konflikty.

   Před spuštěním zobrazit náhled zásahů. Odlišit nové zprávy od zpětného zpracování historie. Uvést místo vykonávání: **Forpsi, SO.ai nebo ruční spuštění**. Historie musí ukázat, které pravidlo udělalo konkrétní změnu.

10. **Spam, blokování, přesměrování a nepřítomnost**

    Správa blokovaných a důvěryhodných adres/domén; cílová složka spamu; výjimky; případné přesměrování s jasnou volbou ponechání kopie.

    Automatická odpověď potřebuje začátek, konec, časové pásmo, text, případně rozdílnou odpověď pro interní a externí adresáty a interval opakování stejnému odesílateli.

    SO.ai musí ukázat, zda tyto funkce běží u Forpsi, nebo v konektoru, a zabránit současnému zapnutí dvou odpovídačů. Přesun zprávy do složky Spam se nesmí vydávat za prokázané učení antispamu poskytovatele.

11. **Podpisy a šablony odpovědí**

    Více podpisů; přiřazení podle schránky a odesílací adresy; samostatné výchozí podpisy pro nové zprávy a odpovědi/přeposlání; umístění vůči citaci.

    Firemní šablona může mít uzamčenou část a povolená osobní pole: jméno, funkce, telefon, pracoviště. Potřebný je náhled HTML i prostého textu, kontrola odkazů a obrázků, verzování a ochrana před dvojím vložením.

    **Nelze předpokládat, že podpis nastavený ve webmailu Forpsi automaticky doplní zprávu vytvořenou v SO.ai.** Pro podpisy SO.ai je potřeba vlastní jasně definované použití.

12. **Kalendář**

    Výběr dostupných kalendářů, jejich viditelnost, barva, pořadí a výchozí kalendář pro nové události. Dále časové pásmo, první den týdne, pracovní dny a hodiny, výchozí délka schůzky, připomínky a zobrazování víkendů.

    Samostatná nastavení soukromí: kdo vidí pouze obsazenost, kdo názvy a podrobnosti, kdo smí upravovat. Oddělit sdílení kalendáře od rozesílání pozvánek.

    Počítat s celodenními a opakovanými událostmi, výjimkami opakování, aktualizací/zrušením schůzky, rezervací místností, importem/exportem a odběrem kalendáře pouze pro čtení. Nepodporované operace označit konkrétně.

    Forpsi vyžaduje výběr kalendářů pro synchronizaci ve webmailu; zjištění dostupného kalendáře ještě neověřuje funkčnost pozvánek. [Aktivace CalDAV ve Forpsi](https://support.forpsi.com/kb/a4479/outlook-calendar-synchronization.aspx)

13. **Adresář**

    Výběr osobních, firemních a sdílených adresářů; výchozí adresář pro nový kontakt; pořadí zdrojů při našeptávání; řazení jméno/příjmení; formát zobrazovaného jména.

    Kontakty mají podporovat více adres a telefonů, firmu, funkci, poštovní adresu, poznámku a skupiny. Správa zahrnuje import/export, mapování polí a kontrolu duplicit před sloučením.

    **Firemní seznam zaměstnanců, zákaznický adresář a „nedávno kontaktovaní“ jsou odlišné zdroje.** Nemají se automaticky slévat. Automatické ukládání adres z komunikace musí být volitelné.

    Forpsi uvádí, že jeho adresáře jsou pro synchronizaci dostupné bez samostatného zapínání každého adresáře; v klientovi se následně vybírá, které používat. [CardDAV ve Forpsi](https://support.forpsi.com/kb/a4471/synchronizace-android-kontaktu.aspx?translation-detect=false)

14. **Soubory a přílohy**

    Zvolený zdroj úložiště, výchozí složka, dostupná kapacita, limity souborů a předvolba „připojit kopii“ versus „vložit odkaz“.

    Správa musí zahrnout složky, přejmenování, přesun, verze, řešení stejného názvu, koš a obnovu. U sdílení uvést příjemce, práva, platnost odkazu a možnost odvolání; veřejné odkazy mají být samostatná volba.

    Uživatel musí rozlišit **přílohu uloženou v e-mailu, samostatně uloženou kopii a sdílený dokument**. Odstranění jedné nemá bez vysvětlení smazat ostatní. Funkce „soubory ve Forpsi“ se nesmí nabízet jako synchronizovaná, dokud není ověřené napojení.

15. **Úkoly**

    Osobní a týmové seznamy, výchozí seznam, stavy, priority, řešitelé, sledovatelé a vlastní předvolby pohledu.

    Nastavení termínů, připomínek, opakování, podúkolů a archivace dokončených úkolů. U opakování určit, zda se další termín počítá od původního data, nebo od dokončení.

    Při vytvoření úkolu ze zprávy zvolit, zda se uloží pouze odkaz, nebo i vybraný obsah. Předání úkolu nesmí automaticky zpřístupnit celou soukromou schránku.

    Podpora kalendáře sama o sobě neprokazuje synchronizaci úkolů Forpsi.

16. **Poznámky**

    Výchozí osobní prostor, zápisníky/složky, šablony, editor, štítky, připnutí, řazení a vyhledávání.

    Samostatně určit čtenáře a editory, podporovat historii verzí, obnovu a řešení souběžných úprav. Poznámku propojit se zprávou, kontaktem, úkolem či událostí bez nechtěného rozšíření přístupu.

    Zásadní je odlišit **soukromou poznámku, týmovou poznámku a interní komentář ke komunikaci**. Interní text se nesmí omylem přidat do odpovědi zákazníkovi.

17. **Kolegové a společná práce**

    Přidělovat oprávnění podle člověka i týmu a pro konkrétní schránku nebo kolekci. Nabídnout pojmenované role, ale také přehled skutečných dílčích práv.

    Oddělit čtení, tvorbu konceptů, úpravy, odesílání, plánování, mazání, export, sdílení a správu nastavení. **Správce připojení nemusí automaticky dostat přístup k obsahu všech schránek.**

    Pro společnou schránku doporučuji přiřazení řešitele, stav vyřízení a upozornění, že kolega právě píše odpověď. Stav přečtení není totéž co stav vyřízení.

    Odchod zaměstnance musí zahrnout odebrání přístupu a rozhodnutí o jeho čekajících zprávách, pravidlech, úkolech a vlastnictví sdílených položek.

18. **Upozornění**

    Nastavení po službách, schránkách a typech událostí: nová zpráva, přiřazení, zmínka, termín, chyba odeslání, ztráta připojení či blížící se zaplnění.

    Volit kanál, okamžité upozornění nebo souhrn, tiché hodiny, výjimky a zobrazování citlivého obsahu v náhledu.

    Předvolby mají zabránit duplicitním upozorněním na stejnou událost. Technický výpadek nemá zaplavit všechny zaměstnance; má mít konkrétního odpovědného správce.

19. **ChatGPT a další AI funkce**

    Samostatná obrazovka má ukázat propojenou identitu, povolené schránky a služby, rozsah přístupu, historii použití a možnost přístup odvolat.

    Uživatel musí umět určit, zda AI smí pouze hledat/číst, připravovat návrhy, nebo vykonávat schválené změny. Zvlášť řešit přístup k přílohám, soukromým složkám a obsahu kalendáře.

    Styl psaní, jazyk a preference odpovědí jsou osobní předvolby; nesmí přepisovat firemní oprávnění. Text nalezený v e-mailu nesmí sám udělit souhlas s další akcí.

    **Ruční ovládání SO.ai musí fungovat i při odpojeném ChatGPT.** Správa kolegů a schránek proto nemá být závislá na tom, zda už je dokončené propojení s ChatGPT.

20. **Synchronizace a uchovávání dat**

    Zvolit synchronizované schránky, složky a kolekce, počáteční rozsah historie a rozsah ukládání obsahu/příloh. Ukazovat poslední úspěšnou synchronizaci a čekající změny.

    Definovat chování při změně ve Forpsi i SO.ai, při konfliktu, odstranění položky a obnovení připojení. Rozlišit „skrýt v SO.ai“, „odpojit zdroj“ a „smazat u poskytovatele“.

    Dobu uchovávání obsahu, indexu, historie a koše musí určovat firemní politika se zobrazením případných limitů poskytovatele. Offline ukládání obsahu má být samostatně povolená schopnost, nikoli skrytý důsledek otevření aplikace.

21. **Import, export, historie změn a diagnostika**

    Import nastavení má mít náhled, kontrolu duplicit a vyznačení nepřenosných částí. Export má rozlišovat předvolby, definice pravidel a skutečný obsah pošty či adresáře; přístupové údaje do běžného exportu nepatří.

    Historie změn má zaznamenat **kdo, co, kdy, kde a s jakým výsledkem změnil**, včetně rozlišení ruční akce, pravidla a AI.

    Obnova předchozí konfigurace musí ukázat svůj dopad. Ne každou už vykonanou akci lze vrátit.

    Diagnostika má sdělit konkrétní problém a další postup: například „příjem funguje, SMTP spojení selhalo“. Uživatel nepotřebuje surové protokolové výpisy ani obecné „něco se nepovedlo“.

**Doporučené výchozí hodnoty**

Tyto hodnoty navrhuji jako startovní politiku, nikoli jako zjištěná současná nastavení:

| Oblast | Výchozí chování |
|---|---|
| Nová schránka | Uložit a ověřit; aktivaci jasně oddělit |
| Časové pásmo | Europe/Prague, s možností osobní změny |
| Osobní data | Nové poznámky a osobní úkoly soukromé |
| AI | Přístup jen k výslovně vybraným zdrojům a činnostem |
| Nové pravidlo | Uložené, nejprve náhled; automatické provádění nezapnout skrytě |
| Mazání zpráv | Přesun do ověřeného Koše; trvalé mazání samostatně |
| Automatické čištění | Nepřidávat vlastní mazání bez nastavené politiky; ukázat pravidla poskytovatele |
| Vzdálené obrázky | Načítání podle zvolené politiky, s možností výjimky |
| Potvrzení přečtení | Neodesílat automaticky bez zvolené předvolby |
| Podpis | Podle skutečně použité odesílací adresy |
| Veřejné sdílení | Vypnuté, zapínat pro konkrétní položku |
| Nejistý výsledek odeslání | Pozastavit další pokus a nabídnout ověření |
| Změna oprávnění | Znovu vyhodnotit dosud neprovedené naplánované akce |

**Jak má vypadat běžné ovládání**

Do základní obrazovky bych dal schránky, dostupnost služeb, osobní předvolby a nejčastější akce. Rozšířené parametry a diagnostiku bych zpřístupnil postupně podle role.

Připojení nové schránky bych vedl v šesti krocích:

1. Vybrat nebo zadat schránku.
2. Bezpečně uložit přihlašovací údaje.
3. Ověřit jednotlivé služby.
4. Vybrat složky, kalendáře a adresáře.
5. Nastavit odesílací identitu, podpis a přístupy.
6. Zobrazit souhrn a výslovně určit, co se aktivuje.

Každý formulář potřebuje srozumitelné uložení, zrušení změn a ochranu rozepsaných údajů. Při souběžné úpravě nesmí tiše přepsat novější nastavení kolegy. **Změna barvy štítku nemá znovu vyžadovat připojení schránky; změna přihlašovacích údajů vyžaduje nové ověření dotčených služeb.**

**Co je proti dnešnímu pilotu potřeba doplnit**

Ve čtené verzi pilotu je především správa připojení a několik přehledů. Pro kompletní ruční nastavení chybí zejména:

- Editace a přidělování oprávnění přímo v SO.ai.
- Plné editory štítků a pravidel včetně náhledu dopadu.
- Správa odesílacích identit, podpisů a šablon.
- Ovládání naplánovaných zpráv včetně úprav a rušení.
- Výběr a nastavení jednotlivých kalendářů a adresářů.
- Osobní předvolby a upozornění.
- Rozhodnutí o zdroji souborů, úkolů a poznámek a následné adaptéry.
- Jednotné zobrazení původu dat, omezení a skutečných oprávnění.

Pro první verzi doporučuji **poštu ponechat autoritativně ve Forpsi**, kalendáře a adresáře napojovat po ověření jejich možností a vlastní funkce SO.ai výslovně označit. U štítků, pravidel, podpisů, souborů, úkolů a poznámek nesmí vzniknout dojem obousměrné synchronizace s webmailem, pokud taková synchronizace není doložená.

**Podmínky, podle kterých má být nastavení přijato jako hotové**

- Každá volba se skutečně uloží a správně načte po obnovení stránky i na jiném zařízení.
- Je zřejmé, na koho změna působí a kde se projeví.
- Oprávnění jsou vynucená serverem, nejen skrytými tlačítky.
- Uživatel pozná firemní výchozí a závazné nastavení.
- Sdílený štítek ani úkol neodhalí soukromou zprávu.
- Pravidlo ukáže náhled a rozliší historii od nově příchozí pošty.
- Přejmenování složky nezanechá neřešené závislosti.
- Souběžná úprava kolegů nezpůsobí tiché přepsání.
- Pozastavení, odpojení a odebrání přístupu mají definovaný dopad na čekající akce.
- Plánované odeslání funguje i bez otevřeného prohlížeče a správně řeší časová pásma.
- Nejasný stav odeslání nezpůsobí duplicitní zprávu.
- Test připojení není označen jako test doručení.
- Ruční práce funguje bez ChatGPT.
- Nepodporovaná funkce má konkrétní vysvětlení, nikoli nefunkční tlačítko nebo falešný úspěch.
- Mobilní i klávesnicové ovládání umožní dokončit stejné základní úkony.

Doporučené pořadí realizace je **nejprve schránky, přístupy, identity, složky a podpisy; potom štítky, pravidla a plánované odesílání; následně kalendář, adresář a navazující spolupráce**. Strukturu nastavení a společný model oprávnění je ale potřeba navrhnout pro celý uvedený rozsah hned na začátku.

Do kódu, nastavení ani probíhajícího vývoje hlavního úkolu jsem v této analýze nezasahoval.
