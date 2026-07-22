import { buildMeta } from "./buildMeta.js";

const UNKNOWN = "neuvedeno";

function valueOrUnknown(value, fallback = UNKNOWN) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export const versionInfo = {
  appName: "Smart odpady",
  version: valueOrUnknown(buildMeta.version, "v0.1.683"),
  status: "development",
  backupName: "Pneumatiky v KCC – chráněná evidence",
  backupNote: "Evidence Pneumatik je součástí KCC; data, změny i audit jsou vedené přes chráněné API a D1.",
  tyreModuleStatus: "Funkční v KCC přes chráněné API",
  branch: valueOrUnknown(buildMeta.branch),
  commit: valueOrUnknown(buildMeta.commit),
  backupDate: valueOrUnknown(buildMeta.backupDate)
};

export const versionNews = [
  {
    title: "Vozový park: detail skutečně načítá techniku Vistosu",
    text: "Karta vozidla nově volá chráněný detailový endpoint, který pro otevřený vůz spustí cílené read-only čtení GetByIdParam. Seznam vozidel zůstává beze změny a do Vistosu, tras ani notifikací se nic nezapisuje."
  },
  {
    title: "Vozový park: bezpečná diagnostika detailu Vistosu",
    text: "Chráněný detail vozidla rozlišuje prázdnou nebo jinak strukturovanou odpověď Vistosu pouze podle názvů polí a technického stavu. Hodnoty záznamu, přihlašovací údaje ani session tokeny diagnostika nezveřejňuje; Vistos, trasy a notifikace zůstávají beze změny."
  },
  {
    title: "Vozový park: technické údaje přímo z detailu Vistosu",
    text: "KSO načítá hmotnosti, rozměry, typ vozidla a nástavbu cíleným read-only dotazem z detailu vozidla. Seznam zůstává rychlý, detail se čte pouze pro vůz požadovaný HERE nebo právě otevřenou kartu; Vistos, trasy ani notifikace se nemění."
  },
  {
    title: "Řidičský tablet: nepřehlédnutelná přestávka",
    text: "Zahájená přestávka překryje pracovní tablet výrazným stavem PŘESTÁVKA BĚŽÍ, ukazuje čas zahájení i živou délku a skončí až velkým vědomým tlačítkem. Začátek a konec zůstávají v auditu, takže se aktivní přestávka obnoví i po znovunačtení tabletu."
  },
  {
    title: "Pneumatiky: rychlá evidence, klikací osazení a plovoucí MM",
    text: "Modul má sedm jasných pracovních záložek, kompaktní filtrovatelnou tabulku pro stovky záznamů, detail bez opuštění seznamu, pohled vozidel s klikacími pozicemi kol, mobilní průvodce měřením a obnovené plovoucí okno MM. Jednorázová migrace obnovuje doložené konfigurace pozic všech 28 vozidel; servis, náklady, historie, audit, oprávnění i ukládání dál používají chráněné KCC API a D1."
  },
  {
    title: "Řidičský tablet: spolehlivější zvuk tlačítek",
    text: "Zvuk tlačítka se nyní plánuje až po skutečném odemčení zvuku prohlížeče. Krátké tlumené klepnutí je slyšitelnější v kabině, zůstává bez melodie a lze jej vypnout."
  },
  {
    title: "Řidičský tablet: přestávka neblokuje práci",
    text: "Při kliknutí na jinou pracovní akci během přestávky tablet ukáže neblokující informaci, že přestávka stále běží. Vybraná akce se otevře normálně; přestávka se sama neukončí a audit se nemění."
  },
  {
    title: "Řidičský tablet: jemnější linka voleb",
    text: "Zelený obvod pracovních voleb je nyní jemný 2 px; vybraná volba používá mírně silnější 3 px stav. Noční režim zůstává výchozí a funkce, API i data se nemění."
  },
  {
    title: "Řidičský tablet: akcent na každé volbě v nočních oknech",
    text: "Noční režim je výchozí. Volby hlášení, výsypu a dalších řidičských kroků mají souvislou linku #75bd25 kolem celé plochy; vybraná volba je silnější. Plochy zůstávají tmavě šedé a funkce, API i data se nemění."
  },
  {
    title: "Připomínky: příloha pro management",
    text: "Administrátor a všichni uživatelé role Management mohou v managerském formuláři Připomínek vložit jeden bezpečně uložený soubor do 10 MB. Příloha se zobrazí u připomínky i v detailu Samoopravy a otevře se pouze přihlášenému oprávněnému uživateli. Ostatní role managerské hlášení nevytvoří."
  },
  {
    title: "Řidičský tablet: tmavě šedý režim s jedním akcentem",
    text: "Noční režim tabletu je nyní neutrálně tmavě šedý bez zelených ploch. Jediným zeleným akcentem je #75bd25; žluté hlášení, kontrast, zvuk i všechny pracovní funkce zůstávají stejné."
  },
  {
    title: "Řidičský tablet: antracitový noční režim",
    text: "Noční režim řidičského tabletu používá neutrální antracit místo modrých ploch. Výrazné zelené potvrzení, žluté hlášení, kontrast a všechny pracovní funkce zůstávají stejné."
  },
  {
    title: "Řidičský tablet: jeden vzhled a viditelné nastavení",
    text: "Zdrojový náhled používá stejné rozložení jako skutečný kiosk řidiče. Vpravo nahoře je společné nastavení automatického, denního nebo nočního režimu a zapnutí či vypnutí krátkého zvuku tlačítek. Šarlota je v náhledu i kiosku dočasně skrytá; funkce trasy, API, data a Vistos zůstávají beze změny."
  },
  {
    title: "Denní svoz: jedna jasná práce dispečera",
    text: "Aktuální uložená trasa je vždy první a zřetelně označená. Výběr jiné trasy, dlouhý seznam zastávek a příprava nové trasy jsou oddělené a rozbalí se až podle potřeby. Nejasný technický jazyk nahradily provozní pokyny; funkce, API, data i Vistos zůstávají beze změny."
  },
  {
    title: "Řidičský tablet: jisté ovládání v terénu",
    text: "Ovládací plochy jsou větší a dál od sebe, klepnutí má výraznou odezvu a volitelný krátký zvuk. Přibyl denní, noční a automatický režim. PROBLÉM se mění na prokliknutelné HLÁŠENÍ, z nabídky hlášení mizí Jiný problém a fotografie mají jednoznačné volby. Šarlota je na tabletu dočasně vypnutá; její Prompt, Knowledge Base, API, databáze ani ostatní funkce se nemění."
  },
  {
    title: "Pneumatiky: plnohodnotný modul přímo v KCC",
    text: "Evidence pneumatik, měření dezénu, servisní záznamy, náklady a audit nyní běží přímo v Kaiser Control Center přes chráněné API a D1. Veřejná externí aplikace už není součástí pracovního toku; automatické objednávky, zprávy a jiné autonomní akce zůstávají vypnuté."
  },
  {
    title: "Řidičský displej: nové pracovní rozložení pro terén",
    text: "Řidičský kiosk má novou kontrastní pracovní plochu s dominantním potvrzením stanoviště, jasně odděleným hlášením, provozními volbami a hlasovou pomocí. Administrátorská kontrola TESTU je nově kompaktní a nezakrývá řidiči trasu; všechny funkce, API, role, zápisy i bezpečnostní potvrzení zůstávají beze změny."
  },
  {
    title: "Hlášení tras: dispečerská fronta podle dalšího kroku",
    text: "Pracovní fronta hlášení nyní zvýrazňuje nevyřízené případy, odpovědnou osobu a konkrétní další krok. PROVOZ a TEST zůstávají oddělené; stavový workflow, audit, API a pravidla odesílání se nemění."
  },
  {
    title: "Řidičský displej: velké pracovní volby pro terén",
    text: "Kabinová obrazovka teď řadí beze změny funkcí akce podle práce řidiče: dominantní HOTOVO, hlášení, provozní volby a samostatná pomoc Šarloty. Aktuální firma i adresa se nezkracují, aby zůstaly čitelné ve stresu, dešti, mrazu a při práci v rukavicích; API, zápisy, navigace i fyzická potvrzení zůstávají stejné."
  },
  {
    title: "Svozové trasy: samostatná pracovní fronta Hlášení",
    text: "Horní navigace obsahuje samostatnou záložku Hlášení s výchozím PROVOZEM, výrazně odděleným TESTEM, nízkými řádky a širokým pravým detailem. Převzetí, řešení, povinný výsledek, další kontrola a znovuotevření zapisují audit přes cloudové API; ostrý e-mail a SMS zůstávají vypnuté, zatímco TEST projde bezpečným simulovaným providerem bez kontaktu zákazníka."
  },
  {
    title: "Šarlota: formulář až po skutečném Toolu a přesná adresa",
    text: "Při hlášení poškozené nebo přeplněné nádoby Šarlota nejdřív skutečně otevře správný formulář přes KSO Tool a až potom výsledek potvrdí hlasem. Na dotaz k aktuálnímu stanovišti přečte přesnou backendem ověřenou adresu; nesmí ji popřít ani slibovat neexistující dohledání."
  },
  {
    title: "Šarlota: začátek řeči okamžitě ruší timeout",
    text: "Po automatické závěrečné otázce stačí během pěti sekund začít mluvit. Hologram zruší časovač už podle potvrzené hlasové aktivity, nečeká na opožděný přepis, a běžná konverzace pokračuje ve stejné relaci bez velkého panelu mikrofonu."
  },
  {
    title: "Vozidla: náklady s bezpečným fallbackem a read-only audit párování",
    text: "Pokud T-Cars odmítne individuální čtení nákladů, backend použije oficiální hromadnou metodu a výsledek přesně omezí na stejné T-Cars ID nebo SPZ. Administrace současně ukazuje kandidáty Vistos–T-Cars podle přesné SPZ a dostupné části VIN, ale žádnou vazbu nevytváří ani neukládá."
  },
  {
    title: "Šarlota: po otázce poslouchá ve stejném hologramu",
    text: "Automatický úvod proběhne bez mikrofonu. Teprve po jediné závěrečné otázce se na pět sekund zapne poslech bez velkého panelu mikrofonu. Jakmile řidič promluví, limit se zruší a běžný rozhovor může pokračovat třeba pět minut; bez řeči zazní outro gong. Opravené jsou také tvary jedno stanoviště, stupně Celsia, přirozenější počasí a výslovnost T-Cars jako tý kárs."
  },
  {
    title: "Šarlota: gongy patří hologramu, ne mikrofonu",
    text: "Opravené propojení nyní skutečně zpřístupňuje přehrávač intro a outro gongu. Automatický úvod drží po celou dobu holografickou Šarlotu včetně pětisekundového čekání a závěrečného gongu; mikrofon se zobrazí a zapne až po samostatném fyzickém klepnutí řidiče."
  },
  {
    title: "Vozidla: úplný read-only detail T-Cars",
    text: "Detail vozidla načítá technický profil, aktuální telemetrii, knihu jízd, stav PHM bez domyšlené jednotky, motohodiny, náklady, oblastní události, identifikace řidičů a podklad silniční daně. Otáčky motoru se pravdivě nezobrazují jako hodnota, protože je T-Cars SOAP API neposkytuje."
  },
  {
    title: "Šarlota: osm povinných a srozumitelných částí úvodu",
    text: "TEST tabletu používá ověřené oslovení Mirku a před přehráním vyžaduje pozdrav, počet stanovišť, první firmu, počasí nebo pravdivou nedostupnost, stav nádrže bez vymyšlené jednotky, bezpečný stav dispečinku a závěrečnou otázku s oslovením. Pokud intro gong skutečně nezazní, hlas se bez něj nespustí."
  },
  {
    title: "Šarlota: obnovená úplná KB výslovnosti",
    text: "Jazyková Knowledge Base je znovu sestavená z úplné schválené příručky včetně skloňování, čísel, dat, jednotek, stupňů Celsia, identifikátorů, zkratek a oprav. Synchronizace i editor nově odmítnou zkrácenou verzi nebo verzi bez povinné části, takže se příručka nemůže znovu tiše ořezat."
  },
  {
    title: "Šarlota: neověřený úvod se už nepřehraje",
    text: "KSO nejdřív přijme celé audio do dočasné paměti a porovná text s ověřenou trasou, vozidlem, SPZ, počtem stanovišť a čerstvým počasím. Cizí údaj zablokuje celý zvuk i hologram. Počasí se smí použít jen jako přesné aktuální backendové shrnutí; šablony typu počasí přeje byly odstraněné."
  },
  {
    title: "Šarlota: úvod už není pevná backendová šablona",
    text: "Svozové trasy předávají aktivnímu ElevenLabs agentovi ověřený kontext a slyšitelné intro vytváří skutečný Prompt s připojenou Knowledge Base. Technická First Message se řidiči nepřehraje, pevné věty byly z backendu odstraněné a mikrofon se obnoví až po dohrání celé odpovědi."
  },
  {
    title: "TEST: Šarlota načte správný kontext Toolu",
    text: "Kontextový Tool v administrátorském TESTU nyní předává ID aktivní bezpečné relace a používá TEST scope. Šarlota proto načte simulovaného řidiče, vybranou trasu a testovací vozidlo místo opakování pevné chyby určené pro chybějící kontext. PŘÍRUČKA současně nově vyžaduje skutečný funkční průchod každého TESTU a blokuje jen produkční účinky."
  },
  {
    title: "Šarlota: obnovený TEST znovu spustí hlas",
    text: "Když správce znovu otevře už aktivní TEST tabletu, aplikace po načtení trasy a bezpečného kontextu znovu připojí živou ElevenLabs Šarlotu a spustí modulové úvodní hlášení. Stav už nezůstane bez pokusu na Chybí; případná skutečná chyba se zobrazí přímo v diagnostice."
  },
  {
    title: "Šarlota: povinné čtení aktivního Promptu a KB",
    text: "Před každou prací na Šarlotě musí vývojář vedle PŘÍRUČKY, Mantry a provozního kontraktu read-only načíst a celý přečíst skutečně aktivní Prompt i všechny Knowledge Base připojené ke správnému produkčnímu agentovi. Pouhý stav AKTIVNÍ, počet dokumentů, koncept nebo stará lokální kopie nestačí; bez dostupného živého obsahu se práce zastaví."
  },
  {
    title: "Šarlota: TEST používá živý Prompt a znalosti",
    text: "TEST tabletu připraví mikrofon už při fyzickém spuštění a připojí skutečného ElevenLabs agenta jen po ověření Promptu, první zprávy, Knowledge Base, Tools a modulového kontextu Svozových tras. Diagnostika ukáže přesný stav i chybu. Blackview Active 7 LTE a modulový zdroj intro_announcement jsou nově chráněné provozním kontraktem; vývojář musí před prací číst PŘÍRUČKU i Mantru."
  },
  {
    title: "Šarlota: přehledná správa Promptu a znalostí",
    text: "Editor v KSO ukazuje lidský stav AKTIVNÍ a vždy jen jeden doporučený další krok. Prompt a znalosti mají jasné názvy, postup je rozdělený do tří krátkých kroků a aktualizace funkcí i servisní nástroje jsou schované v pokročilém nastavení pro správce."
  },
  {
    title: "Šarlota: Prompt a Knowledge Base se spravují přímo v KSO",
    text: "Oprávněný správce načte živý Prompt a Knowledge Base skutečně připojenou k agentovi do chráněného editoru, uloží koncept bez dopadu na hlasovou Šarlotu, projde významovou bezpečnostní kontrolou a až samostatným potvrzením publikuje do ElevenLabs. Kontrola přijímá bezpečné české formulace bez vynucování jediné doslovné věty; každá změna má zálohu, historii a bezpečný návrat k předchozí verzi."
  },
  {
    title: "Šarlota: automatický úvod po otevření TEST tabletu",
    text: "Přímé otevření už aktivní izolované TEST trasy na Blackview nyní samo načte bezpečný kontext, spustí ElevenLabs a ukáže holografické úvodní přivítání. Pokus proběhne jen jednou pro danou trasu a stránku; produkční trasy zůstávají vyloučené a nepovolený mikrofon se zobrazí jako pravdivá chyba s ručním pokračováním."
  },
  {
    title: "Svozové trasy: samostatný TEST tabletu řidiče",
    text: "Oprávněný správce spustí z horní části Svozových tras jedním tlačítkem oddělenou TEST relaci řidiče Vašek Miroslav. Vybere existující TEST trasu, otevře stejné řidičské UI se Šarlotou a lidskou diagnostikou a jedním potvrzením relaci ukončí, resetuje a připraví k okamžitému opakování; produkční trasy, Vistos, zákaznické zprávy a ostrá GPS zůstávají mimo tento tok."
  },
  {
    title: "Šarlota: chráněná jazyková KB a výslovnost",
    text: "Správce nejdřív načte read-only plán a až samostatným potvrzením připojí přesně pojmenovanou jazykovou referenci a dostupný aliasový výslovnostní slovník. Backend před i po změně hlídá prompt, první zprávu, model a tools; jiné KB ani slovníky nemaže. Pokud klíč nemá právo ke slovníkům, KB se připojí samostatně a slovník zůstane pravdivě označený jako čekající."
  },
  {
    title: "Šarlota: jazykový manuál bez úniku neověřeného vozidla",
    text: "Úvod i hlasový kontext skryjí název, interní označení a SPZ, dokud backend nepotvrdí bezpečné přiřazení vozidla. Hlavní prompt má výslovně označené bezpečné příklady; očištěná jazyková reference a návrh TTS slovníku zůstávají verzované odděleně a do ElevenLabs se nezapisují bez nového read-only ověření."
  },
  {
    title: "Šarlota: jeden bezpečný hlavní prompt",
    text: "Hlasová Šarlota má kanonický blokově členěný prompt s jazykovým manuálem, pravidly tabletu osádky a jedinou verzí každého provozního toku. Servisní hlášení hlas pouze připraví; finální zápis znovu vyžaduje fyzické potvrzení v KSO."
  },
  {
    title: "Šarlota: automatické obnovení hlasového spojení",
    text: "Když se automatické holografické přivítání přeruší kvůli krátkému výpadku WebSocketu, tablet jednou sám obnoví spojení. Hologram zůstane aktivní a ruční mikrofonový panel se zobrazí až po neúspěšném opakování nebo po výslovném klepnutí řidiče."
  },
  {
    title: "Šarlota: úvod podle promptu osádky",
    text: "Historická verze skládala jediné přivítání v backendu. Aktuální verze tuto pevnou šablonu odstranila a slyšitelný úvod nechává vytvořit aktivní Šarlotu podle publikovaného Promptu, KB a ověřeného modulového kontextu."
  },
  {
    title: "Svozové trasy: správce připraví správný TEST",
    text: "Admin a Management mají v pracovním okně vždy správcovský krok pro trasu přiřazenou Miroslavovi. Starší vlastnictví záznamu už tuto akci neschová a okno se nepřepne na nabídku určenou terénnímu testerovi."
  },
  {
    title: "Svozové trasy: TEST pracoviště se načte jen jednou",
    text: "Zkušební stránka po načtení dat zůstane připravená k práci. Trasy se už při každém překreslení nenačítají znovu a hlavní doporučené tlačítko proto nezůstává zablokované na stavu Načítám."
  },
  {
    title: "Svozové trasy: přehledné pracoviště tabletu",
    text: "Zkušební adresa má vlastní čisté prostředí s jediným doporučeným krokem, viditelným průběhem a technickými podklady schovanými ve sbalených sekcích. Dokončenou zkoušku lze bezpečně připravit pro Miroslava bez zpráv, Vistosu a změn ostrých tras."
  },
  {
    title: "Samoopravy: bezpečný denní audit odezvy tlačítek",
    text: "Produkční kód a CSS se jednou denně načtou pouze přes GET. Kliknutí probíhají výhradně v izolované syntetické stránce bez přihlášení, cookies a síťového přístupu; ostrá tlačítka se nikdy nespouštějí. Vzdálený test čte stav atomicky a má rezervu pro cloudovou prodlevu, aby nevytvářel falešné nálezy."
  },
  {
    title: "Šarlota: ověřený start směny",
    text: "Potvrzení dnešní trasy nyní ukazuje ověřeného řidiče, vozidlo, stav osádky, počet stanovišť a počasí pro směnu. Těsně před startem backend znovu ověří datum, vlastní přiřazení a vozidlo; rozpor start zablokuje, zatímco chybějící osádka nebo počasí zůstanou pravdivě označené bez domýšlení."
  },
  {
    title: "Šarlota: čisté ukončení automatického rozhovoru",
    text: "Ukončení automatické holografické relace nyní zavře i skryté hlasové okno. Mikrofonový panel se po automatickém přivítání neobjeví; zůstává vyhrazený pouze ručnímu spuštění Šarloty."
  },
  {
    title: "Šarlota: přivítání po převzetí trasy",
    text: "Řidič v jednom okně potvrdí převzetí dnešní trasy i volbu pracovní paměti. Jedno finální klepnutí připraví zvuk tabletu, zahájí trasu a otevře plný rozhovor se Šarlotou; automatická relace ukazuje hologram při mluvení, poslouchání i zpracování a mikrofonový panel zůstává jen pro ruční spuštění."
  },
  {
    title: "Samoopravy: hodinová kontrola znovu pokrývá celou aplikaci",
    text: "Monitor bezpečně zvládne současných 49 produkčních cest a build nově zastaví přidání další cesty dřív, než by překročila cloudový limit. Chyba uvádí skutečný počet cest; Codex, nasazení a e-mail zůstávají vypnuté."
  },
  {
    title: "Šarlota: jediný hologram v náhledu tabletu",
    text: "Blackview simulátor zobrazuje mluvící Šarlotu jen uvnitř skutečného 960 × 600 řidičského displeje. Obal náhledu už nevykresluje druhou překryvnou kopii a mapa i ovládání zůstávají čitelné."
  },
  {
    title: "Šarlota: hologram při hlasové odpovědi",
    text: "Když Šarlota na řidičském tabletu přehrává úvod nebo odpověď, technickou plochu mikrofonu nahradí kompaktní animovaný hologram. Mikrofonní stav zůstává jen pro poslouchání, povolení a pravdivou chybu; mapa i ukončení hlasu zůstávají dostupné."
  },
  {
    title: "Řidičský displej: mapa jako hlavní pracovní plocha",
    text: "Na 11palcovém Blackview má HERE mapa garantovanou pracovní výšku. Informace o stanovišti jsou kompaktní, TEST poloha je sbalená a mapové režimy i navigace zůstávají dostupné bez dalšího pevného řádku pod mapou."
  },
  {
    title: "Samoopravy: čistá pracovní fronta bez TEST konzole",
    text: "Hlavní obrazovka ukazuje stručný stav hodinové kontroly, aktivní případy a jasné vyřízení. Staré uzavřené testy se ve výchozí frontě nezobrazují; ruční kontrola, pravidla, automatizace, audit a diagnostika zůstávají bezpečně dostupné ve sbalené Technické správě."
  },
  {
    title: "Šarlota: pravdivý stav zpráv v hlasovém kontextu",
    text: "Hlasový nástroj Svozových tras už správně popisuje oficiální RSS iROZHLAS a do ElevenLabs předává skutečný stav zdroje. Při výpadku vrací nedostupnost bez vymyšlených titulků; read-only kontext nic nezapisuje ani neodesílá."
  },
  {
    title: "Šarlota: náhled promptu oddělený od zápisu",
    text: "Správce nejdřív načte chráněný read-only plán bez textu promptu a bez secretů. Zápis do ElevenLabs má samostatné tlačítko a nové potvrzení; neúspěšné hlasové připojení už nenechá řidičský tablet ve falešném stavu Šarlota poslouchá."
  },
  {
    title: "Svozové trasy: přehledný ostrý modul a sbalená Mantra",
    text: "Ostrá stránka už nezobrazuje testovací dataset ani přepínač režimu. Oddělené prostředí zůstává pouze na přímé testovací adrese s jedním jasným označením; provozní Mantra je výchozí nízký read-only náhled a celý obsah rozbalí až vědomé kliknutí."
  },
  {
    title: "Šarlota: bezpečný náhled synchronizace kontextu tras",
    text: "Chráněná synchronizace promptu nově rozpozná, doplní a po uložení ověří pravidlo Svozových tras pro trasu, počasí, služební kontext, pracovní paměť a titulky iROZHLAS. Read-only náhled před zápisem vyjmenuje chybějící bloky; first message, model ani tools nemění."
  },
  {
    title: "Šarlota: aktuální titulky z oficiálního RSS",
    text: "Řidičská Šarlota načítá nejvýše tři aktuální titulky z oficiálního RSS iROZHLAS. Kontext obsahuje zdroj a čas načtení, nepřebírá popisy ani celé články a při výpadku pravdivě oznámí nedostupnost bez scrapingu nebo vymyšlených zpráv."
  },
  {
    title: "Svoz: bezpečný pracovní kontext Šarloty",
    text: "Řidičská Šarlota načítá vlastní trasu, ověřená vozidla, počasí, omezený služební adresář, dostupnost a nadřízeného. Dobrovolná paměť ukládá jen pracovní témata odděleně podle účtu; zvuk ani celý přepis neukládá a každý provozní zápis dál čeká na fyzické potvrzení."
  },
  {
    title: "Svoz: uložená vize hlasové Šarloty",
    text: "Mantra 1.28 a samostatná produktová specifikace trvale oddělují český hlas HERE navigace od konverzační Šarloty. Vize ukládá budoucí kontext počasí, trasy, vozidel, služebního adresáře, dostupnosti, nadřízených, zpráv a bezpečné paměti rozhovorů bez povolení ostrých autonomních zápisů."
  },
  {
    title: "Svoz: mapa skutečně přes celý displej",
    text: "Režim celé mapy na 11″ tabletu skryje TEST ovládání, provozní tlačítka i legendu. HERE mapa využije celých 960 × 600 CSS px a ponechá jen mapové ovladače a kompaktní navigační pokyn."
  },
  {
    title: "Svoz: bezpečná simulace polohy na PC",
    text: "Izolovaný řidičský TEST s parametrem gps=simulated umí bez systémové GPS přesunout tablet na depo, aktuální nebo následující stanoviště a přehrát jízdu po skutečné HERE geometrii. Simulovaná poloha je výrazně označená, žije jen v otevřené stránce a nikdy nevstoupí do fyzického GPS mapování, Vistosu ani ostrých tras."
  },
  {
    title: "Svoz: trvalý interaktivní simulátor Blackview",
    text: "Izolovaná TEST adresa s parametrem device=blackview zobrazí skutečný řidičský displej ve stabilním interaktivním rámci 960 × 600 CSS px. Simulace zůstává zachovaná i při ručním testování v pravém prohlížeči a nemění API, data ani ostré trasy."
  },
  {
    title: "Svoz: skutečná HERE optimalizace celé přidělené trasy",
    text: "HERE Waypoints Sequence přepočítá pořadí až 200 čekajících stanovišť jednoho vozu podle silnic, živé dopravy a potvrzených rozměrů a hmotnosti. Hotové a problémové body zůstanou v historii, uložení má audit a přehled celé trasy kreslí silniční geometrii po úsecích místo přímých modrých spojnic. Potvrzený profil vozu zůstává bezpečně použitelný i při dočasně nedostupném cloudovém profilovém registru."
  },
  {
    title: "Svoz: displej pro Blackview Active 7",
    text: "Řidičský displej je nově regresně hlídaný pro 11″ Blackview Active 7 LTE v režimu na šířku: fyzicky 1920 × 1200 a cílově 960 × 600 CSS px. Hlavní plocha zůstává bez posouvání, mapa má na nízkém viewportu dostupné všechny ovladače a pracovní volby mají velké plochy pro rukavice."
  },
  {
    title: "Svoz: mapa přes celý tablet a živá navigace",
    text: "Řidič může HERE mapu roztáhnout přes celý 11″ displej, posouvat ji a přibližovat tlačítky, kolečkem i dvěma prsty. Živá navigace vede od aktuální GPS polohy k právě obsluhovanému stanovišti, další zastávka je vidět předem, TEST mapování stanoviště je znovu dostupné a hlášení přijme až pět fotografií."
  },
  {
    title: "Svoz: skutečný pracovní displej řidiče",
    text: "Tablet má ovladatelnou mapu aktuálního úseku i celé trasy, přímou navigaci, adresní seznam, krokové hlášení s povinnou fotografií, přestávku, výsyp a hlasovou Šarlotu. V izolovaném TESTU se všechny zápisy drží pouze v TEST auditu pod přihlášeným Miroslavem; žádná zpráva se neodesílá a Vistos ani ostrá trasa se nemění."
  },
  {
    title: "Svoz: celá trasa na mapě řidiče",
    text: "Řidičský displej zobrazuje výjezd z Trnkovy a všechna přidělená stanoviště barevnými špendlíky. Aktuální bod je oranžový, hotový zelený a problém červený; překrývající se body se rozestoupí. Štítek Optimalizováno HERE se ukáže jen při přesné shodě pořadí s dokončeným HERE výpočtem použitým na trase."
  },
  {
    title: "Svoz: stabilní odkaz na TEST řidiče",
    text: "Samostatná adresa /trasy-svozu/test zachová TEST scope při přihlášení i obnovení stránky. Původní odkaz se scope=test se po přihlášení automaticky převede na stabilní adresu; produkční trasy a oprávnění se nemění."
  },
  {
    title: "Svoz: plnohodnotný izolovaný TEST řidiče",
    text: "Řidičský TEST používá standardní pracovní ovládání včetně přestávky, výsypu a hlášení pro dispečink. Akce se ukládají pouze do odděleného TEST auditu pod přihlášeným řidičem; žádná zpráva, Vistos ani ostrá trasa se nemění."
  },
  {
    title: "Svoz: Řidič vidí jen svůj displej",
    text: "Účet s rolí Řidič se po přihlášení vždy otevře přímo do Řidičského displeje bez HP, menu a administrace. Na tabletu bez hlavního posouvání vidí aktuální stanoviště, HERE mapu a pět velkých pracovních voleb; backend mu podle uživatelského ID povolí pouze vlastní přiřazenou trasu. Management zůstává beze změny."
  },
  {
    title: "Svoz: přehledný TEST tabletu bez záměny testera",
    text: "Tablet zachová výslovně vybraný test a bez výběru nabídne pouze test přihlášeného uživatele. Tomášův dokončený test už nepřepíše Radimův aktivní test; cizí test je jasně označený jako náhled a starší zkoušky jsou uklizené ve sbalené historii mimo hlavní seznam ručních tras."
  },
  {
    title: "Svoz: jednorázové potvrzení hlášení",
    text: "Kontrolní náhled incidentu už nic přímo neodesílá a nejdřív otevře samostatné okno Opravdu odeslat? Finální tlačítko se okamžitě zamkne, backend vrací uložený výsledek i při souběhu a automatický test 100 požadavků potvrzuje právě 1 e-mail a 1 SMS; po výsledku velké tlačítko vrátí tablet na výchozí výběr."
  },
  {
    title: "Datové schránky: interní read-only třídění",
    text: "Radimův interní pilot nahrazuje chatový autopilot třemi srozumitelnými frontami K vyřízení, Předané a Hotové nad aktuálními daty. Pilot pouze čte existující chráněné API, nic neodesílá ani nemění a ostatním uživatelům ponechává dosavadní rozhraní."
  },
  {
    title: "RCS: prokazatelný souhlas zákazníka",
    text: "Veřejný formulář Kaiser ukládá samostatný souhlas s provozní a transakční RCS komunikací do cloudové D1 včetně přesného znění, verze a zdrojové stránky. Formulář sám žádnou RCS ani SMS neposílá; STOP blokaci smí zrušit pouze nový výslovný souhlas."
  },
  {
    title: "Tankování: název vozidla v seznamu",
    text: "Seznam tankování nově zobrazuje vedle SPZ také název vozidla přímo z ORWII. Název je součástí hledání; u transakcí bez přiřazeného vozidla zůstává pravdivá pomlčka. Automatická cloudová synchronizace se nemění."
  },
  {
    title: "Šarlota: jedině serverový hlas ElevenLabs",
    text: "KSO už neobsahuje systémové čtení prohlížeče ani Androidu. Veškeré mluvené pokyny smí vytvářet pouze serverová Šarlota z ElevenLabs; při chybě zůstane viditelný text a rozhraní pravdivě oznámí, že hlas nebyl přehrán."
  },
  {
    title: "Svoz: hlas Šarloty a schválené e-maily",
    text: "Všechny mluvené pokyny Svozových tras používají produkční ElevenLabs hlas Šarloty bez systémového čtení. Incidentní e-mail nově používá schválenou grafiku Smart odpady, uvádí terénního testera z uzamčeného TESTU a interní SMS se vejde do jediného 160znakového segmentu."
  },
  {
    title: "Svozové trasy: interní incident dispečerce",
    text: "Přeplněná nebo poškozená nádoba po fotografii a druhém velkém potvrzení skutečně odešle dostupné aktivní dispečerce ověřené v KSO interní e-mail s fotografií a SMS. Zákazník, nepřístupná firma, ostrá trasa a Vistos zůstávají chráněné a beze změny; každý kanál má audit, provider ID, deduplikaci a pevný limit pilotu."
  },
  {
    title: "Vozidla a trasy: autonomní cloudová příprava",
    text: "T-Cars každou minutu obnovuje v D1 jednoznačné aliasy master flotily a ORWII podle nich automaticky znovu páruje i starší tankování. Po čerstvém Vistos snapshotu cloud bez otevření modulu připraví nepotvrzené návrhy tras pro dnešek a zítřek; nic automaticky nepotvrdí, nespustí, nedokončí ani neodešle."
  },
  {
    title: "Svozové trasy: úplné Adresní místo z Vistosu",
    text: "KSO načítá skutečné Adresní místo pro všechny aktivní řádky Svoz Kaiser ANO v bezpečných dávkách, ne jen pro prvních 150. Chyba čtení KSO se nově nezamění za chybějící údaj ve Vistosu, hlídač ji zachytí a technická svozová adresa ani Stanoviště se nepoužijí jako náhrada."
  },
  {
    title: "Datové schránky: formulář změny a skutečné interní kroky",
    text: "V chatu k datové zprávě je zpět samostatný formulář Provést změnu / úkol. Archivace, označení jako vyřízené a interní předání se po jasném pokynu skutečně zapíší do historie a potvrdí výsledkem; e-mail a odpověď datovou schránkou dál vyžadují samostatné potvrzení."
  },
  {
    title: "Svozové trasy: chráněný TEST incidentního workflow",
    text: "Přeplněná a poškozená nádoba se po fotografii předá logicky dostupné dispečerce; nepřístupná firma ověří náhradní bezplatný TEST svoz do 24 hodin nebo připomínku před standardním termínem. Každý e-mail vyžaduje fyzické potvrzení a míří jen na chráněný TEST kontakt; zákazníci, dispečerky, ostré trasy, Vistos, SMS a RCS zůstávají nedotčené."
  },
  {
    title: "Vozidla: auditované párování GPS jízd a zakázek",
    text: "Cloudový read-only pilot každých 15 minut propojuje stabilní vozidla A/B/C s GPS jízdami a pouze dokončenými denními trasami. Nejisté jízdy zůstávají nezařazené, každý běh má D1 audit a ekonomický dashboard se nezapne, dokud data neprojdou kvalitativní branou."
  },
  {
    title: "Svozové trasy: opakovaný TEST tabletu",
    text: "Když Tomáš vědomě znovu otevře dokončený stacionární TEST na Trnkově, jediný bod se bezpečně vrátí do stavu čeká a zpřístupní tři fotografická hlášení. Uložené GPS měření zůstane v auditu; žádná zpráva se neodešle a trasa ani Vistos se nezmění."
  },
  {
    title: "Poloha vozidel: automatická historie jízd a GPS kilometry",
    text: "Samostatný cloudový běh ukládá skutečné body T-Cars každou minutu a po pěti minutách z nich vytváří auditované jízdy a denní souhrny. Dashboard porovnává skutečné GPS kilometry vozidel, nepřeklene výpadek signálu přímkou a všechny dosud nespárované kilometry drží pravdivě jako nezařazené."
  },
  {
    title: "Svozové trasy: fotografická TEST hlášení z tabletu",
    text: "Stacionární TEST na Trnkově má tři velká tlačítka pro přeplněnou nádobu, poškozenou nádobu a nepřístupnou firmu. Tablet připraví fotografii bez původních metadat, ukáže náhled a uloží hlášení až po velkém fyzickém klepnutí; v této fázi se nic neposílá zákazníkovi ani dispečinku a trasa se nemění."
  },
  {
    title: "Svozové trasy: zrcadlení všech týdenních četností",
    text: "Pokud Vistos u četnosti Nx7 dodá přesně N různých dnů jen pro lichý nebo jen pro sudý týden, KSO dopočítá stejné dny do druhé parity a označí je jako dopočtené. Funguje to i pro 3x7 pondělí, středa, pátek; neúplná, duplicitní ani smíšená data se automaticky nedoplňují."
  },
  {
    title: "Vozidla: automatické tankování a statistiky PHM",
    text: "Vozový park má záložku Tankování s automatickým ORWII přehledem. Skutečné litry a transakční hodnoty ORWII se promítají do Nákladů, Reportů, detailu vozidla a ekonomiky HP; účetní pořizovací náklad zůstává oddělený, nespárované záznamy se nepřiřazují odhadem."
  },
  {
    title: "Datové schránky: klávesnicové posouvání historie chatu",
    text: "Po zaostření historie posouvají šipky řádkově a Page Up/Page Down po stránkách; Home otevře začátek a End poslední zprávu. Myš a trackpad zůstávají beze změny."
  },
  {
    title: "Datové schránky: opravené posouvání historie chatu",
    text: "Historie chatu k datové zprávě používá průběžný flexový tok bublin, takže dlouhé konverzace mají skutečný posuvný rozsah. Starší zprávy jsou dostupné myší, trackpadem i klávesnicí; vlastní odeslání se tím nemění."
  },
  {
    title: "Datové schránky: posouvatelná historie chatu",
    text: "Dlouhá konverzace v chatu k datové zprávě má vlastní skutečně posouvatelný panel. Po otevření se ukáže poslední zpráva, starší zůstanou dostupné kolečkem, trackpadem i klávesnicí."
  },
  {
    title: "Šarlota: GPS bez výběru vozidla",
    text: "Ve Svozových trasách globální hlasová Šarlota po povelu k potvrzení GPS spustí měření aktuálního TEST stanoviště přímo. Neotevře výběr auta ani se neptá na SPZ; samotné uložení dál vyžaduje velké fyzické klepnutí člověka."
  },
  {
    title: "Svozové trasy: kontrola GPS už neblokuje TEST",
    text: "Po uloženém fyzickém měření tablet ukáže obří tlačítko DOKONČIT TEST TABLETU. Bod s horší přesností dál bezpečně čeká na kontrolu a nejde do navigace, ale fyzický test lze uzavřít; funguje to i pro už rozpracované měření na Trnkově."
  },
  {
    title: "Šarlota: kontext Datové schránky",
    text: "Chat při otevření v Datové schránce dostane pouze read-only souhrn skutečného modulu. Rozpozná stav integrace a počty, ale bez bezpečného otevření si nevymýšlí obsah zpráv, příloh ani provedené kroky."
  },
  {
    title: "Datové schránky: skutečný prompt je v Nastavení",
    text: "Nastavení modulu zobrazuje v samostatném read-only okně přesný system prompt, který server posílá do OpenAI Responses API. Frontend nemá vlastní kopii promptu a nemůže ho potichu nahradit."
  },
  {
    title: "Datové schránky: připravený návrh je opravdu vidět",
    text: "Když chat sepíše odvolání, vyjádření nebo jiný návrh odpovědi, zobrazí celý text přímo v konverzaci. Už netvrdí jen, že návrh připravil, aniž by ho uživateli ukázal."
  },
  {
    title: "Datové schránky: chat drží aktuální záměr a čte skutečná data",
    text: "Serverový AI chat už neobnoví zrušenou archivaci ani nevytvoří předání z odpovědi nic, ahoj nebo osiřelého ano. Vlastní profil čte z kanonického přihlášeného uživatele a vozidla podle řidiče dohledává read-only nástrojem z aktuálního Vozového parku s kontrolou oprávnění."
  },
  {
    title: "HP: vždy aktuální verze a novinky",
    text: "Produkční build nově přidává verzi nasazení ke všem vnitřním JavaScript modulům. Po nové verzi se proto okamžitě načte aktuální buildMeta i seznam novinek a prohlížeč nezůstane ve staré čtyřhodinové cache."
  },
  {
    title: "Svozové trasy: stacionární terénní TEST",
    text: "Management může na Trnkově připravit test tabletu pro jediný bod Firma test 501. Přihlášený uživatel se pravdivě uloží jako terénní tester; test nemá řidiče, auto ani jízdu, nezmění uloženou středu svozu a technicky nesmí odeslat SMS ani e-mail."
  },
  {
    title: "Svozové trasy: vždy aktuální Mantra",
    text: "Import provozní Mantry je navázaný na její vlastní verzi. Po další úpravě tak produkční prohlížeč načte nový čas, krátký popis změny i autora a neponechá starý modul v cache."
  },
  {
    title: "Svozové trasy: čitelný kontext HERE mapy",
    text: "Blízký adresní a fyzický GPS bod se zobrazí v pevném uličním přiblížení, takže tablet místo metrového výřezu budovy ukáže i okolní příjezd. U vzdálenější odchylky mapa nadále automaticky zobrazí oba body."
  },
  {
    title: "Poloha vozidel: skutečné skleněné panely",
    text: "Info cedule jsou nyní průsvitné akrylátové panely s viditelnou mapou pod materiálem, světlou hranou a vnitřními skleněnými bloky. Každá varianta zobrazuje název vozidla; rychlost v budíku je bez stupnice výrazně uprostřed a SPZ je větší a čitelná."
  },
  {
    title: "Poloha vozidel: jednotné skleněné cedule a čistá mapa",
    text: "Všechny čtyři varianty info cedule používají společný skleněný materiál, typografii, rámeček a stín. Celorepublikový přehled ukazuje jen vozidla s přesným GPS hrotem; velká cedule se objeví až po kliknutí na vůz nebo při bližším přiblížení mapy."
  },
  {
    title: "Svozové trasy: HERE mapa a Firma test 501",
    text: "Řidičský TEST používá statický HERE mapový výřez načítaný přes chráněný backend, takže API klíč neopouští server. Oddělená sada má nově 501 stanovišť; Firma test 501 na adrese Trnkova 3052/137 je záměrně první středeční bod pro fyzický GPS test tabletu."
  },
  {
    title: "Svozové trasy: přímý TEST řidičského tabletu",
    text: "V horní části TEST Brno 501 je výrazné tlačítko, které otevře samostatný tabletový přehled bez dlouhé tabulky. Přehled bezpečně provede přípravou TEST trasy, přiřazením řidiče a spuštěním a potom zobrazí mapový výřez adresního i fyzicky změřeného bodu, hlasovou Šarlotu a velké GPS tlačítko pro pracovní rukavice."
  },
  {
    title: "Poloha vozidel: osobní prémiové info cedule",
    text: "Každý uživatel si na mapě volí vlastní styl info cedule: hravou Kaiser kartu, SPZ tabuli, analogový budík nebo palubní panel. Palubní panel ukazuje jen reálné hodnoty dostupné z T-Cars; osobní volba se ukládá k účtu. GPS hrot je nově čistá zaoblená vektorová šipka."
  },
  {
    title: "Svozové trasy: Mantra ukazuje poslední změnu",
    text: "Pod provozní Mantrou je vždy vidět přesný čas poslední úpravy, krátké čtyř až pětislovné shrnutí změny a autor. Údaje se spravují společně s verzovaným promptem, takže nezůstanou schované jen v rozbaleném textu."
  },
  {
    title: "Poloha vozidel: stabilní marker GPS",
    text: "Vozidlo na mapě zůstává stále vodorovné bez rotace podle azimutu. Informační cedule je těsně nad vozidlem a samostatná šipka pod vozidlem označuje přesnou GPS polohu; data T-Cars ani výběr vozidla se nemění."
  },
  {
    title: "Svozové trasy: fyzické GPS stanoviště se Šarlotou",
    text: "Oddělený TEST režim umí z tabletu načíst více GPS vzorků u nádob, odmítne pohyb nebo slabou přesnost a připraví auditní bod bez přepsání adresy. Hlasová Šarlota přečte pokyn a rozpozná povel k měření; skutečný zápis vyžaduje jediné velké finální klepnutí vhodné pro déšť, mráz, horko a pracovní rukavice."
  },
  {
    title: "Svozové trasy: TEST depo, výsypy a truck profily",
    text: "TEST D1 má dohledané adresní body depa a výsypů, pracovní směnu, časy výsypu a konzervativní profily vozidel A/B/C. Vjezdy, rozměry a hmotnosti jsou pravdivě označené jako TEST odhady, dokud je nepotvrdí fyzické měření nebo technický průkaz."
  },
  {
    title: "Svozové trasy: HERE silniční read-only pilot",
    text: "TEST trasa má navazující serverový pilot HERE Tour Planning pro nákladní vozidla v ČR. Ověřuje jednu komoditu, souřadnice, směnu, rozměry vozidel, kapacitu a správné místo výsypu; placený výpočet lze spustit jen ručně po doplnění D1 konfigurace a serverového OAuth. Výsledek má audit, nic nepřepisuje v provozní trase a nic neodesílá řidičům ani zákazníkům."
  },
  {
    title: "Svozové trasy: read-only výpočet A/B/C",
    text: "TEST pilot po ověření svozového dne deterministicky rozděluje stanoviště mezi vozy A, B a C podle čistého času obsluhy, odhadované hmotnosti a známých kapacit. Ukazuje provozní okna a chybějící podklady; nic neukládá, nepočítá pořadí ulic ani km a nespouští AI, navigaci nebo komunikaci."
  },
  {
    title: "Svozové trasy: provozní mantra autopilota",
    text: "Záložka Svozové trasy má rozbalitelný read-only prompt s pravidly svozových dnů, kapacit, výsypů, zaměstnanců, komunikace a budoucího učení. TEST denní plán je nově pravdivě označený jako ruční pilot bez AI optimalizace; nic se samo nepřeplánuje ani neodešle."
  },
  {
    title: "Svozové trasy: TEST detail ve stejném tvaru jako Vistos",
    text: "Každé TEST stanoviště má rozbalovací detail se stejnými poli a pořadím jako ostrý detail smlouvy: Od–do, Adresní místo, Stanoviště, Odpad, Nádoba, Interval, Den svozu, Poznámka a Zákaznický manažer. Chybějící platnost se zobrazuje pravdivě jako neurčeno."
  },
  {
    title: "Svozové trasy: TEST řádky ve stejném tvaru jako ostrá data",
    text: "TEST stanoviště i uložená denní trasa zobrazují stejnou pracovní strukturu jako ostré řádky: stav, pořadí, zákazníka, stanoviště, odpad a nádobu, interval, den svozu a smlouvu. Starší uložené TEST trasy z původní sady jsou viditelně označené jako archivní v1."
  },
  {
    title: "Svozové trasy: skutečné dny svozu v TEST datech",
    text: "TEST Brno 501 zrcadlí každý týdenní svoz 1:1 do lichého i sudého týdne, například středa lichá a středa sudá. Četnost 1x14 zůstává v jedné paritě a 1x30 používá pevný pracovní den s pořadím v měsíci, podle kterého lze sestavit denní trasu."
  },
  {
    title: "Svozové trasy: návrat původního rozhraní",
    text: "Rozhraní je vrácené do stavu před zjednodušením dispečerského pohledu. TEST Brno 501, Řidičský tablet, tisk, PDF, offline balíček i původní ovládání tras jsou znovu přímo dostupné; databáze, API, uložené trasy a historie testovacích zpráv zůstaly beze změny."
  },
  {
    title: "Svozové trasy: bezpečné opakování jediného neúspěšného kanálu",
    text: "Částečně dokončená TEST odesílací úloha se po reloadu znovu načte a dovolí zopakovat jen neúspěšnou SMS nebo e-mail bez provider ID. Již odeslaný kanál zůstává nedotčený, nová úplná dávka je v částečném stavu zablokovaná a SMS se nepřipraví, dokud Twilio nemá režim live."
  },
  {
    title: "Pohledávky: důkazní rozpad příchozích úhrad",
    text: "Kontrolní fronta odděluje přesný historický protiúčet, přesný název, konflikty variabilního symbolu, interní kandidáty a položky bez dostatečného důkazu. Jde pouze o read-only podklady k ručnímu potvrzení; automatické párování, ratingy i zákaznická komunikace zůstávají beze změny."
  },
  {
    title: "Svozové trasy: oddělený TEST Brno 501",
    text: "Management a Admin mohou pracovat s 501 testovacími stanovišti na skutečných adresních bodech Brna v samostatné TEST databázi. Firmy, kontakty, odpady, nádoby 120/240/1100 l a četnosti jsou testovací; ostrá data a Vistos zůstávají oddělené. Skutečné testovací SMS a e-maily jdou výhradně na chráněný kontakt po přesném ručním potvrzení počtu zpráv."
  },
  {
    title: "Pohledávky: příchozí pohyby bez záměny směru",
    text: "Kontrolní fronta jasně ukazuje pouze příchozí pohyby. Vratky nákupů, ATM vklady a storna jsou oddělené jako technické kredity mimo pohledávky; pracovní počet a částka k párování zahrnují jen příchozí úhrady."
  },
  {
    title: "Pohledávky: kontrolované dorovnání úhrad",
    text: "Import automaticky zobrazuje read-only porovnání potvrzených spárovaných plateb se stavem faktur. Chráněné backendové dorovnání používá toleranci včetně haléřových odchylek databáze, odmítá zastaralý preview otisk a ukládá původní i nový stav do auditu; ratingy ani zákaznickou komunikaci nespouští."
  },
  {
    title: "Svozové trasy: připravenost na 900 Stanovišť",
    text: "Velké denní trasy se ukládají v menším počtu bezpečných databázových operací a dispečerský i řidičský seznam zobrazuje zastávky postupně po 100. Zátěžové testy pokrývají 60, 300, 900 i 1000 zastávek; Vistos zůstává pouze read-only."
  },
  {
    title: "Svozové trasy: řízené denní jízdy",
    text: "Dispečer může z ověřených řádků uložit neměnný denní návrh, přiřadit řidiče, trasu potvrdit a sledovat průběh. Řidič má vlastní pohled s akcemi HOTOVO, Problém, Výklop a Pauza; stav i audit se ukládají v systému a po obnovení pokračují. Vistos zůstává pouze read-only a nové Stanoviště ovlivní až budoucí návrhy."
  },
  {
    title: "Reporty: funkční levé menu",
    text: "Na stránce Reporty se notifikační a zákaznický přehled načte jen jednou. Neúspěšné API už nespouští nekonečné překreslování stránky, takže odkazy v levém menu zůstávají stabilní a reagují na kliknutí."
  },
  {
    title: "Poloha vozidel: rozšířená sada čistých 3D ikon",
    text: "Přibyly dodané transparentní výřezy pro FUSO, cisterny MAN, Mercedes a DAF, techniku Manitou, dodávky Ford, Mercedes a Toyota i vozy Škoda a Opel. Ikony se přiřazují podle SPZ a názvu/modelu, bez stínu kolem vozidla; limetkový štítek nad vozidlem je větší a čitelnější."
  },
  {
    title: "Hlavní Dashboard: provoz a ekonomika flotily",
    text: "Hlavní stránka je nově skutečný read-only Dashboard firmy. Management vidí prioritní návrhy grafů Produktivní vs. přejezdové km a Výnos/km vs. náklad/km bez vymyšlených hodnot; aktuální provoz používá existující T-Cars, hlášení, trasy a datové zprávy podle oprávnění."
  },
  {
    title: "Poloha vozidel: čisté 3D ikony a limetkový štítek",
    text: "Citigo, Kamiq, Audi A1, Mercedes Abroll, Mercedes ramenáč a Rioned mají čisté průhledné výřezy bez pozadí a bez stínu. Nad každým vozidlem je limetkový štítek s názvem, SPZ a aktuální rychlostí; samotné vozidlo zůstává bez barevné aury i vrženého stínu."
  },
  {
    title: "Poloha vozidel: skutečná historie tras",
    text: "Trasa vybraného vozidla čte pouze uložené GPS body z T-Cars a kreslí je přímo do Google mapy pro dnešek, 24 hodin nebo 7 dní. Body se sbírají cloudovým během po minutě, mají audit posledních běhů a po 30 dnech se automaticky mažou; neexistující trasa se nikdy nedopočítává."
  },
  {
    title: "Poloha vozidel: kalibrovaný směr a ovladač trasy",
    text: "3D ikony nově oddělují skutečný azimut T-Cars pro kameru mapy od vizuální korekce podle typu ikony, takže kabina míří po směru jízdy. Detail vybraného vozidla má tlačítko Trasa s rozsahem dnes, 24 hodin a 7 dní; čára se zapne až po napojení historie skutečných GPS bodů."
  },
  {
    title: "Poloha vozidel: stojící auta zůstávají správně otočená",
    text: "Při rychlosti do 2 km/h mapa už nepoužívá poslední, často zastaralý azimut z GPS jednotky. Stojící 3D vozidlo proto zůstává v jednotné správné orientaci; natočení podle T-Cars se zapne až při skutečném pohybu nad 2 km/h."
  },
  {
    title: "Poloha vozidel: plynulá obnova mapy po 60 sekundách",
    text: "Při otevřené mapě Smart odpady každých 60 sekund znovu načte read-only aktuální polohy z T-Cars. Vybrané vozidlo zůstává ve stejném přiblížení, náklonu a mapovém režimu; střed se jen posune na novou GPS pozici. Skutečná historická čára jízdy čeká na zdroj jednotlivých GPS bodů — dostupná kniha jízd T-Cars obsahuje zatím časy a kilometry, ne trasové body."
  },
  {
    title: "Poloha vozidel: celá 3D flotila a směr z T-Cars",
    text: "Všechny aktuální typy vozidel mají vlastní schválený průhledný izometrický 3D model v limetkové barvě. Ikona se nejdřív přiřadí podle SPZ a jako bezpečný doplněk také podle názvu nebo popisu vozidla. Mapa používá stávající azimut z T-Cars pro natočení vozidla; po výběru je panel SPZ a rychlosti větší a čitelnější i na mobilu."
  },
  {
    title: "Poloha vozidel: jednotná 3D limetková flotila",
    text: "Šest dodaných typů vozidel používá novou sjednocenou sadu čistých izometrických 3D modelů podle schváleného vizuálního vzoru. Po výběru vozidla se vektorová Google mapa přiblíží, nakloní podle směru jízdy a zobrazí kompaktní plovoucí panel SPZ a rychlosti. Přepínač Mapa 3D / Letecký 3D dovolí stejnou jízdu zobrazit na čistém nebo satelitním podkladu; přehled flotily zůstává shora."
  },
  {
    title: "Ostrá doména smart-odpady.ai",
    text: "Aplikace, interní odkazy, cloudové runnery, monitoring a integrační callbacky používají jako hlavní produkční adresu https://smart-odpady.ai. Původní kaiser-control-center.pages.dev zůstává během řízeného přechodu dostupná jako bezpečná záloha."
  },
  {
    title: "Poloha vozidel: realistické markery bez karet",
    text: "Vozidla jsou na Google mapě zobrazená jako samostatné průhledné výřezy se stínem a plovoucí registrační značkou. Původní bílá karta, název a rychlost z markeru zmizely; úplné údaje zůstávají v přístupném popisu a detailu vozidla. Kaiser na Trnkově označuje přepracovaný statický 3D špendlík bez odkazu a bez nechtěného otevření dalšího okna."
  },
  {
    title: "Poloha vozidel: pilot šesti skutečných ikon",
    text: "Mapa a seznam vozidel používají šest dodaných grafických podkladů pro MAN a Mercedes Abroll, Mercedes ramenáč, Škodu Citigo a popelářské vozy Mercedes a MAN. Ikona se vybírá podle přesné normalizované SPZ; ostatní vozidla dál bezpečně používají obecnou ikonu svého typu. Sídlo Kaiser servis na Trnkově je na mapě označené velkým 3D špendlíkem s logem Kaiser."
  },
  {
    title: "Poloha vozidel: WIM vrstva odložena",
    text: "Hlavní provozní mapa už nenačítá ani nezobrazuje body WIM vah. Rozpracované read-only podklady zůstávají pouze v Nastavení, aby je bylo možné později bezpečně dokončit bez zásahu do poloh vozidel."
  },
  {
    title: "Poloha vozidel: čistá mapa a provozní přehled",
    text: "Hlavní obrazovka ukazuje Google mapu, souhrn poloh, hledání, stavové filtry a kompaktní detail vozidla. Mapu lze zvětšit přes celé pracovní okno a zavřít tlačítkem nebo klávesou Escape. Technické údaje T-Cars, párování, API, geofencing, logy a pravidla jsou přesunuté do Nastavení. Google Maps klíč se načítá až po přihlášení přes chráněné API a zůstává mimo repozitář."
  },
  {
    title: "KSO e-maily: jednotná identita Šarloty",
    text: "Systémové e-maily mimo Pohledávky používají jednotně Šarlota Kaiser <sarlota@kaiserservis.cz> jako From i Reply-To. Pohledávky zůstávají samostatnou výjimkou s odesílatelem fakturace@kaiserservis.cz. Chyba SendGrid 403 nově vysvětlí potřebu ověřit Sender Identity místo technického kódu."
  },
  {
    title: "Jednotné rozhraní celé aplikace",
    text: "Přihlášení, hlavní stránka a všechny přihlášené moduly používají společný klidný šedo-zelený design systém, Quicksand a přesnou firemní zelenou #75bd25. Levý brand box používá dodané logo Kaiser a zelená primární tlačítka mají bílý text. Nový shell zachovává stávající oprávnění, API data i pracovní funkce; nemění backend, databázi ani provozní data."
  },
  {
    title: "Datové schránky Plus: jednodušší pracovní navigace",
    text: "Hlavní navigace obsahuje jen Zprávy, Autopilot a Nastavení. Duplicitní pohledy K doplnění a Archiv zmizely, blokované zprávy sdružuje filtr Vyžaduje zásah, archiv zůstává filtrem a manuál je součástí Autopilota. Pravidla a automatizace zůstávají dostupné v technické správě Nastavení."
  },
  {
    title: "Samoopravy: kontrola kanonických produkčních adres",
    text: "Hodinový monitor ověřuje přímo kanonické adresy stránek s koncovým lomítkem. Legitimní přesměrování Cloudflare Pages už nevytváří falešné nálezy a kontrola zůstává v limitu 48 veřejných požadavků."
  },
  {
    title: "Samoopravy: hodinový read-only cloud monitor",
    text: "Cloud Worker každou hodinu ověří nasazené stránky, zapíše a sloučí nálezy a připraví návrh promptu k ruční kontrole. Codex, změny repozitáře, pull request, nasazení a e-mail zůstávají vypnuté."
  },
  {
    title: "Datové schránky Plus: chat skutečně provádí úkony",
    text: "Potvrzený úkon v chatu má vždy skutečný backendový výsledek. Archivace, vyřízení, předání a interní kroky mění provozní stav; e-mail, SMS a odpověď přes datovou schránku volají příslušnou serverovou službu. Návrh vznikne jen na výslovný pokyn a nikdy se nevydává za provedenou akci."
  },
  {
    title: "Trasy svozu: OSVČ adresa a režim Na výzvu",
    text: "Kontrola adres už nezaměňuje jméno OSVČ s IČO za nakládkovou adresu. Poznámky Výzva, Na výzvu, Dle potřeby, Na zavolání, Na vyžádání a Na objednání označí nepravidelný svoz jako Na výzvu, zachovají známý odpad a nádobu a nezařadí položku do pravidelného denního návrhu."
  },
  {
    title: "Samoopravy: bezpečná evidence chyb a úprav",
    text: "Uživatelé mohou v Připomínkách nahlásit chybu nebo drobnou úpravu včetně kontextu stránky. Admin a Management mají modul pro ruční třídění, riziko a audit. Automatická oprava, Codex, nasazení a e-mail zůstávají vypnuté."
  },
  {
    title: "Pohledávky: funkční záložky Zákazníci a Dry-run",
    text: "Záložky Zákazníci a Dry-run v Pohledávkách po kliknutí skutečně posunou stránku na správný blok a zobrazí aktivní stav. Funguje také přímý odkaz a návrat historií."
  },
  {
    title: "Pohledávky: ISIR preview a fronta plateb",
    text: "Detail zákazníka automaticky provede read-only kontrolu probíhajícího insolvenčního řízení podle IČO přes veřejnou službu Ministerstva spravedlnosti. Dashboard zároveň ukazuje úplný rozpad nespárovaných plateb; nic se nezapisuje, rating se nemění a automatizace zůstává blokovaná."
  },
  {
    title: "Datové schránky Plus: GPT chat s potvrzením",
    text: "Každá datová zpráva má vlastní GPT chat s cloudovou historií. Autopilot připraví přesnou akci, vyžádá jednorázové potvrzení a teprve potom může změnit stav, odeslat potvrzený e-mail nebo provozní SMS. Učí se jen z úspěšně potvrzených výsledků."
  },
  {
    title: "Pohledávky: pre-rating bez nulových zůstatků",
    text: "Pre-rating A0/B0/C0/N používá v přehledu skutečný otevřený balíček faktur a nezobrazuje falešné nulové metriky zpoždění."
  },
  {
    title: "Pohledávky: dávkový přepočet ratingů",
    text: "Admin může potvrzeným jednorázovým během přepočítat rating payment-rating-v1 pro celý ledger po malých dávkách. Běh neodesílá komunikaci a nespouští automatizaci."
  },
  {
    title: "Pohledávky: pravdivé částky v přehledu",
    text: "Tabulka zákazníků používá otevřené zůstatky přímo z faktur, dokud není uložený ratingový balíček. Dry-run zákazníci se už nepočítají jako automatický režim."
  },
  {
    title: "Pohledávky: funkční detail zákazníka",
    text: "Detail zákazníka správně rozpozná URL-kódované interní ID a zobrazí faktury i read-only náhled ratingu."
  },
  {
    title: "Pohledávky: kontrola otevřeného zůstatku",
    text: "Import respektuje výslovný stav neuhrazené faktury z Vistosu. Rozporný nulový zůstatek bezpečně dopočítá z částky a úhrad a označí fakturu k ruční kontrole."
  },
  {
    title: "Pohledávky: ověřitelný rating platební morálky",
    text: "Rating rozlišuje bankovní pre-rating a finální výpočet z faktur, splatností a skutečných úhrad. Zobrazuje skóre, confidence, metriky, penalizace a kvalitu dat; celý modul zůstává read-only/dry-run bez komunikace zákazníkům a bez volání bankovního API."
  },
  {
    title: "Dashboard: Log událostí jen v Nastavení",
    text: "Provozní Log událostí pro Dashboard zůstává v Nastavení a nezobrazuje se v hlavním pracovním přehledu. Přehled tak neplete pracovní obsah se servisním stavem."
  },
  {
    title: "Datové schránky Plus: responzivita a příznak modelu",
    text: "DSP má v hlavičce a nastavení viditelný příznak ostrého odděleného modelu. Responzivní rozvržení zpevňuje řádky zpráv, akce, schránkové karty a detail tak, aby se na mobilu nesvíraly vedle sebe."
  },
  {
    title: "Trasy svozu: dopočet 2x7 sudý/lichý",
    text: "Když Vistos u intervalu 2x7 vrátí dva různé svozové dny jen v jedné paritě, Smart bezpečně dopočítá stejné dny i pro druhý týden a nehlásí zbytečnou chybu."
  },
  {
    title: "KSO úklid: produkčnější UI",
    text: "Z hlavní aplikace zmizel oddělený designový experiment, stará DSP demo data a technické statusy modulů. Servisní akce Šarloty jsou přesunuté do rozbalovací servisní části a DSP texty pravdivě rozlišují návrh, ověření a potvrzení člověkem."
  },
  {
    title: "Vývoj: Management na úrovni Admin",
    text: "Během vývoje se role Management řídí stejným full-access oprávněním jako Admin. Ruční admin-only kontroly v Trasách svozu a dev API byly sjednocené přes centrální oprávnění."
  },
  {
    title: "Trasy svozu: Management vidí Vistos snapshot",
    text: "Role Management může načíst Stanoviště a Svozové trasy z read-only Vistos snapshotu. Admin interní importy zůstávají oddělené."
  },
  {
    title: "Trasy svozu: automatický refresh Stanovišť",
    text: "Stanoviště z Vistosu mají funkční odpočet 15:00 do dalšího načtení. Po doběhu se načte aktuální read-only snapshot a stránka se sama obnoví bez ručního klikání."
  },
  {
    title: "Produkce: tvrdá ochrana deploye",
    text: "Produkční Pages deploy má nový guard. Nasazení se zastaví, pokud neběží z aktuálního origin/main, pokud chybí chráněné commity Tras svozu, pokud je repo před buildem špinavé nebo pokud buildMeta a asset verze nesedí."
  },
  {
    title: "KSO komunikace: Šarlota jako jednotný odesílatel",
    text: "Odchozí e-maily KSO se auditují přes backend a uživatelsky používají Šarlota Kaiser <sarlota@kaiserservis.cz> s Reply-To sarlota@kaiserservis.cz. Stavový panel v Nastavení ukazuje e-maily, příchozí odpovědi, Twilio, SMS a webhooky pravdivě jako běží, čeká, test nebo vypnuto."
  },
  {
    title: "Pohledávky: KB ADAA onboarding",
    text: "Import Pohledávek znovu ukazuje read-only stav přípravy KB Account Direct Access API. Panel kontroluje jen přítomnost serverových konfiguračních položek, nezobrazuje secrets, nevolá banku, neukládá transakce a neposílá platby."
  },
  {
    title: "Datové schránky Plus: odstranění staré Datové schránky",
    text: "Datové schránky používají jednotnou provozní trasu Datových schránek Plus."
  },
  {
    title: "Datové schránky Plus: ostrý e-mail",
    text: "DSP má serverové e-mailové předání zprávy přes SendGrid po finálním potvrzení uživatele. Provozní stav nově odděluje cloud načítání, e-mail, DS odesílací bránu, SMS provider a celkový ostrý stav."
  },
  {
    title: "Datové schránky Plus: cloud načítání",
    text: "DSP má ostrý cloud runner pro načítání každých 30 minut. Log událostí rozlišuje čerstvý cloudový běh, stav 7 schránek a ponechává odesílání datovek, e-mailů a SMS vypnuté."
  },
  {
    title: "Datové schránky Plus: Log událostí",
    text: "V Nastavení DSP je nový provozní blok Log událostí. Ukazuje pravdivý stav načítání, cloud automatizace, datových zpráv, e-mailů a SMS; neoznačuje jako běžící nic, co není ověřené nebo zapnuté."
  },
  {
    title: "Datové schránky Plus: odpověď v samostatném okně",
    text: "Odpověď na datovou zprávu se nově otevírá jako samostatný pracovní modal s kroky příjemce, odesílací schránka, text, přílohy a kontrola. Detail zprávy už se po kliknutí na Odpovědět neroztahuje matoucím formulářem."
  },
  {
    title: "Datové schránky Plus: nová zpráva a odpověď",
    text: "DSP má širší mini-pokyn na kartě, první krok průvodce Nová zpráva pro výběr odesílací schránky a v detailu bezpečný návrh Odpovědět. Nic se neodešle bez závěrečné kontroly a potvrzení."
  },
  {
    title: "Trasy svozu: interní runner přes Pages",
    text: "Cloud runner pro Trasy svozu umí spouštět read-only Vistos snapshot přes interní Pages endpoint chráněný tokenem. Vistos přístupy zůstávají v Pages secrets; worker nedostává Vistos heslo a nevytváří ostré trasy."
  },
  {
    title: "Trasy svozu: ochrana posledního platného snapshotu",
    text: "Stanoviště z Vistosu teď ignorují neúspěšné diagnostické batche a berou poslední platný ready snapshot. Cloud runner při chybějící Vistos konfiguraci zapíše jen audit běhu, aby nevznikl prázdný aktuální snapshot."
  },
  {
    title: "Trasy svozu: automatický Vistos snapshot",
    text: "Existující cloud runner nově každých 15 minut vytváří read-only Vistos snapshot pro Trasy svozu a zapisuje audit běhu do D1. UI už nepočítá s ručním klikáním jako běžným provozem; ostré trasy, SMS/e-maily a zápisy do Vistosu zůstávají vypnuté."
  },
  {
    title: "Trasy svozu: oprava načítání Vistos stanovišť",
    text: "Stanoviště z Vistosu nově načítají Svoz Kaiser výřez ze snapshotu robustně podle uložených dat řádku. Pokud rychlý výřez vrátí prázdno, UI použije read-only fallback z uloženého batch detailu bez live Vistos volání."
  },
  {
    title: "Trasy svozu: rychlé Stanoviště ze snapshotu",
    text: "Stanoviště a Svozové trasy při běžném otevření čtou krátký Svoz Kaiser výřez z uloženého D1 snapshotu místo pomalého live Vistos exportu. Snapshot řádky mají kompatibilní Svoz Kaiser příznak, HTML se revaliduje a přibyl filtr Jen s chybou."
  },
  {
    title: "Trasy svozu: skutečné Adresní místo z Vistosu",
    text: "Stanoviště ve svozových trasách při read-only refreshi dočítají detail Vistos Adresního místa podle reference a nepoužívají technická ID ani Stanoviště jako náhradu za Adresní místo."
  },
  {
    title: "Vozový park: pracovní centrum vozidel",
    text: "Stávající modul Vozový park má nový přehled, evidenci vozidel, detail vozidla, termíny, servis, náklady a dokumenty. Související Hlášení řidičů jen zobrazuje a proklikává, bez duplikace jejich workflow."
  },
  {
    title: "Datové schránky Plus: údaje převzaté z DS",
    text: "DSP při zobrazení schránek přebírá názvy a ověřené ID z původní Datové schránky a z jejích metadat zpráv. Login a heslo zůstávají serverově v secrets nebo DSP vaultu, bez ručního přepisování v UI."
  },
  {
    title: "Datové schránky Plus: správa přístupů",
    text: "Nastavení DSP nově ukazuje konkrétní seznam 7 schránek včetně ID, stavu přístupů a posledního načtení. Přibyla editace schránky, změna hesla a přidání schránky přes vlastní šifrovaný DSP vault oddělený od původní Datové schránky."
  },
  {
    title: "Datové schránky Plus: oprava příjmu, odpočet a manuál",
    text: "DSP ukládá nejdřív obálku zprávy a potom přílohy, takže automatické načítání může zapisovat nalezené zprávy. V hlavičce přibyl odpočet do dalšího načtení a samostatná záložka Manuál včetně stavu Nová zpráva / Odpovědět."
  },
  {
    title: "Datové schránky Plus: ostré načítání a počty na HP",
    text: "DSP používá stejné bezpečné přístupy jako původní Datová schránka, ale drží vlastní data odděleně. Automatické načítání běží každých 30 minut a karta na hlavní stránce ukazuje počet nevyřízených zpráv."
  },
  {
    title: "Připomínky jen centrálně",
    text: "Vložené boxy Připomínky k modulu byly odstraněné z modulových obrazovek. Připomínky se dál zadávají a spravují jen na centrální stránce /pripominky."
  },
  {
    title: "Datové schránky Plus: ostrý oddělený backend",
    text: "Datové schránky Plus mají vlastní tabulky, API, audit, pravidla, přílohy a plánované načítání na pozadí. Modul čte přístupy z bezpečných serverových secrets, ale data a akce drží odděleně od původní Datové schránky."
  },
  {
    title: "Datové schránky Plus: nápověda akcí a Autopilot",
    text: "Důležité akce v Datových schránkách Plus nově ukazují lidskou nápovědu pro hover, focus i tapnutí a návrhy mají vysvětlení, proč je Autopilot doporučuje. Starší označení asistenta je napříč KSO sjednocené na Autopilot."
  },
  {
    title: "Datové schránky Plus: nový autonomní pilot",
    text: "Přibyl samostatný modul /datove-schranky-plus jako bezpečný UI/read-only pilot operačního centra pro 7 firemních datových schránek, Autopilot, přílohy, pravidla, potvrzení a auditní hranice. Bez zásahu do původní Datové schránky, databáze, přístupových hesel nebo ostrého automatického běhu."
  },
  {
    title: "Trasy svozu: návrat správné Vistos verze",
    text: "Trasy svozu znovu používají Vistos Adresní místo jako Adresní místo ve Smartu, zobrazují čitelný Den svozu místo interních ID, doplňují zákaznického manažera včetně mobilu/e-mailu a mají funkční read-only refresh snapshotu bez ostrých tras, SMS/e-mailů a automatizací."
  },
  {
    title: "Pohledávky: Customer_FK schema probe",
    text: "Import Pohledávek nově automaticky zobrazuje read-only schema probe pro fakturační vazbu Customer_FK z InvoiceIssued a sjednocuje fakturové tabulky do jednoho bloku po 10 řádcích."
  },
  {
    title: "Pohledávky: přesnější zákaznický lookup",
    text: "Ledger mapping nově při read-only obohacení zákazníka zkouší nejdřív Customer_FK a IČO/RegNumber a teprve potom pobočkový CustomerBranch_FK, aby metadata zákazníka nebyla hledaná jen přes ID pobočky."
  },
  {
    title: "Pohledávky: live kontrola zákaznického manažera",
    text: "Ledger mapping nově bez zápisu kontroluje CustomerManager_FK přímo na fakturách ve Vistosu a ukazuje samostatnou diagnostiku, aby bylo jasné, jestli lze pro kontakt použít zákaznického manažera faktury."
  },
  {
    title: "Pohledávky: manažer faktury a lookup diagnostika",
    text: "Import Pohledávek ukazuje faktury v samostatném bloku po 10 řádcích, do normalizace přidává zákaznického manažera z faktury a v ledger mappingu zobrazuje read-only diagnostiku Vistos lookupů."
  },
  {
    title: "Pohledávky: aktuální HTML pro import route",
    text: "Build nově generuje i přímou route /pohledavky/import, aby produkce na této adrese vždy načítala aktuální app.js a ne starý statický HTML soubor."
  },
  {
    title: "Pohledávky: užší Vistos metadata zákazníků",
    text: "Read-only obohacení zákazníků v ledger mappingu používá užší potvrzenou sadu Vistos polí, aby lookup zákazníků nebyl blokovaný neověřenými sloupci. Bez ledger zápisu, komunikace a cronu."
  },
  {
    title: "Pohledávky: metadata zákazníků pro rating",
    text: "Ledger mapping v importu Pohledávek teď read-only dočítá zákazníky navázané na faktury v aktuálním snapshotu a ukazuje, zda je zákazník obohacený, má chybějící metadata nebo konflikt. Bez ledger zápisu, komunikace a cronu."
  },
  {
    title: "Pohledávky: read-only ledger mapping",
    text: "Import Pohledávek nad plným Vistos snapshotem automaticky seskupuje faktury podle zákaznického klíče, počítá otevřené zůstatky a ukazuje kandidáty do ledgeru bez ostrého zápisu a bez komunikace zákazníkům."
  },
  {
    title: "Pohledávky: dávkový snapshot faktur",
    text: "Vistos faktury se v importu Pohledávek načítají automaticky po bezpečných read-only dávkách do stagingu, bez ledger zápisu, komunikace a automatizace."
  },
  {
    title: "Sjednocení produkce: Šarlota a Vistos faktury",
    text: "Produkční build sjednocuje opravy Šarloty pro hlasová hlášení řidičů, opravený kontrolní voice zápis a read-only mapování Vistos faktur z vedlejší větve. Bez DB migrací, secrets, SMS/e-mailů a bez objednávek dílů."
  },
  {
    title: "Pohledávky: přesné Vistos sloupce faktur",
    text: "Read-only Vistos preview nově zkouší Kaiser invoice sloupcovou sadu s poli InvoiceNumber, BankReference1-3, CustomerBranch_FK, Customer_FK, CustomerRegNumber, CustomerVatNumber, IssuedDate, DueDate, PriceWithoutTax, PriceWithTax, AmountPaid, RemainToPay, Status_FK a IsPaid. Stále bez D1 zápisu a bez komunikace zákazníkům."
  },
  {
    title: "Trasy svozu: denní trasa jako návrh",
    text: "Hlavní filtr Svozových tras má read-only dispečerský panel Denní trasa – návrh. Ukazuje, co je v aktuálním filtru připravené ze 13 Excelů, Vistos mapování a pilotního řidičského auditu, ale nevytváří ostrý denní běh, GPS, T-Cars, SMS/e-maily ani automatizace."
  },
  {
    title: "Šarlota: žádné falešné potvrzení hlášení",
    text: "Hlasová Šarlota má nově přísnější pravidlo: nesmí říct, že vytvořila servisní hlášení, pokud backendový tool nevrátí skutečné číslo hlášení. Bez reportId musí jasně říct, že zápis v aplikaci zatím nevidí."
  },
  {
    title: "Šarlota: opravený kontrolní voice zápis",
    text: "Kontrolní zápis v nastavení nově emuluje dokončený hlasový rozhovor bez poznámky, takže po potvrzení opravdu projde přes backendový voice handler až k vytvoření testovacího hlášení."
  },
  {
    title: "Hlášení řidičů: jedna otázka na poznámku",
    text: "Šarlota po servisním požadavku položí jednu otázku na poznámku a připraví hlášení. Původní voice-intake už finální zápis nepotvrzuje; uložení vyžaduje fyzické potvrzení v KSO."
  },
  {
    title: "Hlášení řidičů: OpenAI náhled není finální handoff",
    text: "UI i lokální preview nově jasně oddělují read-only OpenAI web-search od finálních odkazů pro Patrika. Předání zůstane blokované, dokud nejsou 3 kompatibilní odkazy z oficiálního price provideru."
  },
  {
    title: "Hlášení řidičů: finální odkazy jen z oficiálního provideru",
    text: "Perzistentní cenový průzkum a background handoff už nepoužijí samotný OpenAI web-search jako zdroj finálních 3 odkazů pro Patrika. OpenAI zůstává jen read-only náhled; finální odkazy čekají na oficiální price provider."
  },
  {
    title: "Hlášení řidičů: odkazy jen s důkazem kompatibility",
    text: "Autopilot a e-mail Patrikovi nově počítají mezi 3 nabídky jen položky s OE shodou, VIN/provider fitmentem nebo oficiálním katalogovým důkazem. Pouhá shoda názvu dílu už nestačí."
  },
  {
    title: "Hlášení řidičů: úplnější e-mail Patrikovi",
    text: "Zpráva Patrikovi nově výslovně uvádí typ požadavku, servisní typ, stav hlášení, prioritu a poznámku řidiče. Odkazy v notifikaci se navíc znovu filtrují podle stejné kompatibilitní logiky jako cenový průzkum."
  },
  {
    title: "Hlášení řidičů: VIN metadata pro cenový průzkum",
    text: "Mercedes/Daimler ověření nově čte podle VIN také model, rok a motorizaci, pokud je oficiální provider vrátí. Cenový průzkum tyto údaje předává dál a nic si nedomýšlí, když provider metadata nedodá."
  },
  {
    title: "Hlášení řidičů: přísnější odkazy na díly",
    text: "Cenový průzkum u ověřeného OE čísla počítá pro Patrika jen nabídky, které stejné OE číslo explicitně obsahují. Levný obecný výsledek bez důkazu kompatibility se mezi 3 odkazy nezařadí."
  },
  {
    title: "Hlášení řidičů: stav pozadí po hlasovém zápisu",
    text: "Pozadí po vytvoření hlášení zapisuje, jestli ověřuje díly, hledá ceny, čeká na auto/VIN nebo čeká na rozhodnutí. Když nejsou splněné podmínky pro tři použitelné odkazy, hlášení nezůstane jen v technickém logu."
  },
  {
    title: "Trasy svozu: řidičské akce přes backend",
    text: "Řidičský tablet umí ukládat HOTOVO, Problém, Musím vysypat a Přestávka jako auditované D1 eventy přes backend API. HOTOVO je idempotentní pro jednu zastávku, takže vícenásobný klik neposune trasu o více stanovišť. Nevznikají ostré trasy, SMS/e-maily, T-Cars ani automatizace."
  },
  {
    title: "Hlášení řidičů: rychlý hlasový zápis",
    text: "Šarlota po potvrzení hned vytvoří servisní hlášení a nečeká na díly, ceny ani e-mail. Jasné úkony, nejasné závady a urgentní problémy se rozdělují do samostatných stavů; urgentní hlášení jde Patrikovi přes backendové pozadí."
  },
  {
    title: "Hlášení řidičů: širší pracovní detail",
    text: "Detail hlášení je širší pracovní panel s rychlým přehledem, dvousloupcovým rozložením informací, akcí a historie. Nemění objednávání dílů."
  },
  {
    title: "Pohledávky: Vistos firmy přes smlouvy",
    text: "Read-only preview firem umí jako další fallback použít Vistos Contract a zákazníka z Directory_FK, pokud přímé entity Company/Directory vrátí prázdný výsledek. Slouží jen pro analýzu dostupných firem před ratingem."
  },
  {
    title: "Pohledávky: Vistos preview fallback",
    text: "Read-only preview Pohledávek teď při prázdné entitě pokračuje na další Vistos kandidáty a v UI ukazuje všechny pokusy o čtení firem a vydaných faktur. Data se stále neukládají do ostrého ledgeru a nic se neposílá."
  },
  {
    title: "Pohledávkový kompas AI: Vistos firmy a faktury",
    text: "Fáze 1D přidává read-only preview Vistos Company / InvoiceIssued pro budoucí rating platební morálky. Náhled jen ověřuje firmy, faktury, splatnosti a dostupná pole; nic neukládá do ostrých tabulek, neposílá zprávy a nespouští automatizaci."
  },
  {
    title: "Pohledávkový kompas AI: import preview do D1",
    text: "Fáze 1C přidává staging import preview pro Vistos faktury a KB platby. Data se ukládají do oddělených D1 preview batchů a řádků; ostré faktury, platby, komunikace, cron a autonomie zůstávají vypnuté."
  },
  {
    title: "Pohledávkový kompas AI: dry-run základ",
    text: "Modul Pohledávky má D1 schéma, chráněné API, payment matching, rating platební morálky, KB text parser, náhled Autopilota, settings a detail zákazníka. Ostré odesílání, cron, KB API a dávkové ukládání insolvenčních výsledků zůstávají vypnuté."
  },
  {
    title: "Trasy svozu: jemné zvuky řidičského tabletu",
    text: "Řidičský tablet má session přepínač Zvuky zap/vyp a krátké Web Audio tóny pro klik, HOTOVO, Problém a blokovaný klik. HOTOVO má potvrzení a krátký zámek proti vícenásobnému posunu; stále jde jen o UI/read-only pilot bez ostrých akcí."
  },
  {
    title: "Trasy svozu: ikony řidičského tabletu",
    text: "Řidičský tablet má jednoduché čitelné ikony u hlavních akcí HOTOVO, Navigovat na další stanoviště, Problém, Šarlota a u voleb v problémovém dialogu. Jde jen o UI/read-only pilot bez ostrých akcí."
  },
  {
    title: "Trasy svozu: doladěný řidičský tablet",
    text: "Řidičský tablet má Šarlotu v akční řadě vedle Navigovat a Problém, horní stav už neukazuje dispečerské všechna auta / všechna vozidla a aktuální karta používá jasný label Další stanoviště."
  },
  {
    title: "Trasy svozu: jednodušší řidičský tablet",
    text: "Řidičský tablet nechává v hlavním toku jen HOTOVO, Navigovat na další stanoviště, Problém a Šarlotu. Matoucí sekundární akce zmizely z hlavní obrazovky a pravé KPI boxy nahradil jednoduchý průběh trasy Hotovo X %."
  },
  {
    title: "Trasy svozu: zpřesnění tlačítek řidiče",
    text: "Řidičský tablet dostal srozumitelnější popisky akcí a Šarlota vlastní čitelnou ikonu. Aktuální hlavní tok řidiče je zjednodušený v novince výše."
  },
  {
    title: "Šarlota: výběr vozidla je kliknutelný",
    text: "Popup pro výběr vozidla v hlasovém hlášení je nad ostatními vrstvami aplikace a přijímá kliknutí, aby řidič mohl vozidlo potvrdit přímo v KSO."
  },
  {
    title: "Trasy svozu: jasný tok řidiče",
    text: "Řidičský tablet má jeden hlavní krok HOTOVO, který po dokončení posune zastávku dál. Navigovat a Problém jsou vedlejší akce, Další je nahrazené jasným Přeskočit zastávku a technické texty jsou z kabinového pohledu pryč."
  },
  {
    title: "Hlášení řidičů: formulář netvrdí předání bez e-mailu",
    text: "Po uložení hlášení formulář označí předání Patrikovi jako hotové jen tehdy, když backend vrátí skutečně odeslaný e-mail. Pokud chybí cenové odkazy, zobrazí varování místo falešného úspěchu."
  },
  {
    title: "Hlášení řidičů: náhled e-mailu bez odeslání",
    text: "Kontrolní cenový průzkum Autopilota nově ukáže přesný náhled e-mailu Patrikovi včetně předmětu, adresátů a tří odkazů. Náhled nic neuloží a e-mail neodešle."
  },
  {
    title: "Hlášení řidičů: e-mail Patrikovi má odkazy nahoře",
    text: "Šablona e-mailu pro náhradní díl nově ukazuje souhrn závady a hned pod ním 3 nejlevnější nabídky s odkazy. Interní stav Autopilotu už není hlavní obsah zprávy."
  },
  {
    title: "Hlášení řidičů: Autopilot musí použít web-search",
    text: "Cenový průzkum přes OpenAI Responses API nově vynucuje web-search tool. Autopilot tak nemá jen odpovídat z modelu, ale musí opravdu zkusit dohledat dostupné nabídky na internetu."
  },
  {
    title: "Hlášení řidičů: kontrolní Autopilot bez e-mailu",
    text: "Detail hlášení má read-only kontrolu cenového průzkumu. Spustí stejné vyhledávání Autopilota, ukáže nalezené odkazy, ale nic neuloží do hlášení a neodešle e-mail Patrikovi."
  },
  {
    title: "Hlášení řidičů: Autopilot retry podle rozpoznaného dílu",
    text: "Cenový průzkum lze znovu spustit i pro bezpečně ověřené vozidlo s VIN a jasným AI kandidátem dílu, bez ručního OE čísla. E-mail Patrikovi ale dál projde jen se třemi cenovými odkazy."
  },
  {
    title: "Hlášení řidičů: e-mail bez odkazů se neodešle",
    text: "Notifikační vrstva má tvrdou pojistku: e-mail Patrikovi pro náhradní díl se bez tří cenových nabídek s URL vrátí jako neodeslaný. Prázdný e-mail s textem čeká na ověření už nesmí odejít."
  },
  {
    title: "Hlášení řidičů: kontrola před e-mailem",
    text: "Backend má read-only kontrolu připravenosti předání Patrikovi. Bez zápisu a bez odeslání e-mailu ověří vozidlo, VIN, díl, konfiguraci Autopilotu, počet cenových odkazů a cílový e-mail."
  },
  {
    title: "Hlášení řidičů: e-mail až po 3 odkazech",
    text: "Servisní fronta a detail hlášení už neukazují předání Patrikovi jako připravené, dokud Autopilot nedodá tři cenové nabídky s odkazy. Jedna nebo dvě nabídky se uloží jako neúplný průzkum a e-mail se dál blokuje."
  },
  {
    title: "Náhradní díly: osobní Mercedes ve VIN pilotu",
    text: "VIN pilot nově bezpečně rozpozná jasné osobní modely Mercedes CLS/EQS i když ve Vozovém parku chybí typ vozidla. Explicitně nákladní vozidla zůstávají mimo pilot a e-mail Patrikovi se bez tří cenových odkazů neodešle."
  },
  {
    title: "Hlášení řidičů: e-mail Patrikovi až s odkazy",
    text: "Autopilot už nesmí označit náhradní díl jako předaný Patrikovi, pokud cenový průzkum nedodal tři bezpečné nabídky s odkazy. Hlasové hlášení se zapíše rychle a web-search běží serverově; e-mail odejde až s odkazy a nic se automaticky neobjednává."
  },
  {
    title: "Trasy svozu: klidnější řidičský displej",
    text: "Řidičský tablet má jednodušší kabinový pohled: větší aktuální zastávku, dominantní akce Navigovat / Hotovo / Problém, skrytý problémový panel až po kliknutí a nesmyslný odhad času se nezobrazuje jako dlouhé minuty. Stále jde jen o read-only pilot bez ostrých tras a hlášení."
  },
  {
    title: "Šarlota: KSO výběr vozidla odemyká předání",
    text: "Hlasové hlášení s vozidlem vybraným v KSO popupu se už nevrací do ruční kontroly vozidla. KSO výběr se zapisuje jako aplikační potvrzení, takže jasný díl může pokračovat do Autopilot cen a e-mailu Patrikovi; nic se automaticky neobjednává."
  },
  {
    title: "Trasy svozu: návrh Fáze 2D",
    text: "Checklist a dokumentace popisují budoucí ostrý řidičský tablet: denní trasy, stop audit, offline synchronizaci, GPS/T-Cars brány a dispečerský dohled. Jde jen o návrh bez DB migrací, zápisů, navigace, SMS/e-mailů a automatizací."
  },
  {
    title: "Trasy svozu: řidičský tablet",
    text: "Svozové trasy mají přímo ve filtru tlačítko Řidičský tablet. Otevře kabinový read-only režim aktuální trasy z 13 Excelů bez potvrzování svozu, GPS, T-Cars, navigace, SMS/e-mailů, automatizací a ostrých tras."
  },
  {
    title: "Šarlota: ostrý hlasový průchod Hlášení řidičů",
    text: "Výběr vozidla v KSO popupu bezpečně potvrdí identitu vozidla, ale nenahrazuje finální potvrzení zápisu hlášení. Cenový průzkum, e-mail ani objednávka se nespouštějí bez samostatného oprávněného kroku."
  },
  {
    title: "Trasy svozu: offline balíček pro řidiče",
    text: "Svozové trasy umí z aktuálního filtru stáhnout samostatný HTML offline balíček pro tablet řidiče. Obsahuje souhrn a zastávky ze 13 Excelů bez navigace, GPS, T-Cars, potvrzování svozu, SMS/e-mailů, automatizací a ostrých tras."
  },
  {
    title: "Trasy svozu: opravný sešit 13 Excelů",
    text: "Interní import Svozových tras rozpozná jeden opravný sešit exportovaný ze Smartu, vezme z něj list VSECHNY RADKY a zachová původní zdrojový Excel, list, řádek, den, týden, auto, odpad, nádobu a frekvenci. Vistos match zůstává read-only a nevytváří ostré trasy."
  },
  {
    title: "HP: kompaktnejsi horni lista",
    text: "Logo Smart odpady, popis systemu a prihlaseny admin jsou na homepage v jednom hornim radku, aby uvodni cast zabirala mene vysky."
  },
  {
    title: "Trasy svozu: kombinace odpadu ve filtru",
    text: "Filtr Odpad ve Svozových trasách umí vybrat více odpadů najednou, například SKO + PLAST. Tisk, PDF, řidičský displej i interní CSV export používají stejnou kombinaci bez změny DB, Vistosu nebo ostrých tras."
  },
  {
    title: "Sledovani vozidel: srozumitelnejsi T-Cars UX",
    text: "Panel Sledovani vozidel ma lidstejsi popisky T-Cars GPS zdroje, vysvetleni read-only rezimu a jasnejsi statistiku vozidel bez aktualni polohy."
  },
  {
    title: "Sledovani vozidel: demo/live stabilizace",
    text: "Modul Sledovani vozidel vyrazne oddeluje demo rezim od T-Cars read-only rezimu, zobrazuje bezpecny souhrn zdroje dat, upozorneni na zastarale polohy a pripravuje geofencing 15 km pouze jako navrh bez ostrych notifikaci."
  },
  {
    title: "Šarlota: kontrolní voice zápis",
    text: "Panel Šarloty má chráněný admin test, který přes backend připraví a potvrdí hlasové Hlášení řidičů stejnou logikou jako /api/voice/sarlota. Test používá in-page výběr vozidla, vyžaduje potvrzení kso-ui a už vytvořené hlášení neoznačí jako neúspěch jen kvůli následnému předání."
  },
  {
    title: "Trasy svozu: víkendový chytrý filtr",
    text: "Chytrý filtr už u víkendu nenabízí dnešek nebo zítřek jako běžnou trasu k tisku. Pokud je dnes víkend, Smart rovnou zvýrazní a nastaví nejbližší pracovní svoz z aktuálních 13 Excelů."
  },
  {
    title: "HP: prémiový operační dashboard",
    text: "Homepage má horní operační panel, výrazný blok Dnes v provozu, popsané sekce, sjednocené karty s CTA Otevřít a klidnější changelog."
  },
  {
    title: "HP: operační rozcestník",
    text: "Homepage je rozdělená do bloků Dnes / Rychlý provoz, Vozidla a servis, Zákazníci a trasy, Dokumenty a administrativa, Finance a náklady a Systém. Karty si zachovávají původní routing a stavové badge jsou sjednocené."
  },
  {
    title: "Trasy svozu: uklizené záložky",
    text: "Hlavní navigace modulu je zjednodušená na Svozové trasy, Stanoviště a Pravidla. Importy, diagnostika, Vistos-only pilot a staré preview jsou schované v admin záložce Interní správa."
  },
  {
    title: "Trasy svozu: oprava přepínače Mapa / GPS",
    text: "Přepínač v hlavní záložce Svozové trasy správně otevře read-only pohled Mapa / GPS a už se nevrací zpět na tiskový přehled."
  },
  {
    title: "Trasy svozu: Fáze 2A GPS připravenost",
    text: "Hlavní záložka Svozové trasy má třetí read-only zobrazení Mapa / GPS. Ukazuje GPS připravenost aktuálního filtru, mapovatelné adresy, řádky k ověření a chybějící adresy bez geokódování, T-Cars, navigace, SMS/e-mailů, automatizací a ostrých tras."
  },
  {
    title: "Trasy svozu: návrat řidičského displeje",
    text: "Hlavní záložka Svozové trasy má jasný přepínač Přehled k tisku / Řidičský displej. Řidičský displej zůstává read-only pilot bez potvrzování svozu, navigace, GPS, T-Cars, SMS/e-mailů a ostrých tras."
  },
  {
    title: "Trasy svozu: čistý tiskový pohled",
    text: "Hlavní záložka Svozové trasy je zjednodušená na pracovní filtr Auto / Termín / Odpad / Kontrola, souhrn a tabulku zastávek k tisku. Diagnostika importů a Vistos match zůstává odděleně v Diagnostice tras."
  },
  {
    title: "Trasy svozu: jednodušší kabinový displej",
    text: "Řidičský režim má výraznější kartu TEĎ, kartu DÁL pro následující zastávku, kratší seznam dalších zastávek a méně opakovaných popisků na akčních tlačítkách. Zůstává pouze UI/read-only pilot bez GPS, T-Cars, navigace, potvrzení svozu, SMS/e-mailů a ostrých tras."
  },
  {
    title: "Trasy svozu: tmavý řidičský režim",
    text: "Řidičský displej ve Svozových trasách má tmavý kabinový režim pro tablet: velkou další zastávku, stav trasy, barevné read-only akce, spodní lištu a problémový dialog. Jde jen o UI/read-only pilot bez GPS, T-Cars, navigace, potvrzení svozu, SMS/e-mailů a ostrých tras."
  },
  {
    title: "Šarlota: bezpečnější synchronizace tools",
    text: "ElevenLabs tools sync používá stejnou normalizovanou kontrolu názvu produkční Šarloty jako read-only status panel. Prompt, model, first message, databáze ani secrets se tím nemění."
  },
  {
    title: "Trasy svozu: tabletový řidičský displej",
    text: "Řidičský režim ve Svozových trasách má větší aktuální zastávku, větší dotyková tlačítka a tabletové rozložení pro 11\" 16:10 displej. Zůstává read-only bez navigace, GPS, T-Cars, SMS/e-mailů a ostrých tras."
  },
  {
    title: "Trasy svozu: další pracovní den ve filtru",
    text: "Chytrý filtr v hlavní záložce Svozové trasy doplňuje volbu další pracovní den, když zítra nebo pozítří vychází na víkend. Tisk a řidičský režim zůstávají read-only bez navigace, GPS, T-Cars, SMS/e-mailů a ostrých tras."
  },
  {
    title: "Trasy svozu: uklizený řidičský režim",
    text: "Hlavní záložka Svozové trasy dává řidičský režim hned pod filtr, zkracuje seznam zastávek pro přehlednost a detailní tabulku schovává do rozbalovací kontroly. Zůstává read-only bez navigace, GPS, T-Cars, SMS/e-mailů a ostrých tras."
  },
  {
    title: "Trasy svozu: read-only řidičský režim",
    text: "Svozové trasy mají v aplikaci read-only řidičský režim nad aktuálním filtrem: aktuální zastávka, předchozí/další, seznam zastávek a tisk. Režim nic nepotvrzuje, neukládá, nespouští navigaci, GPS, T-Cars, SMS/e-maily ani ostré trasy."
  },
  {
    title: "Trasy svozu: čitelnější A4 tisk",
    text: "Detailní PDF a Tisk pro řidiče mají kompaktní A4 landscape hlavičku, souhrn trasy, opakovanou hlavičku tabulky a čitelnější rozložení zastávky, odpadu, nádoby, frekvence, poznámky a kontrolního stavu."
  },
  {
    title: "Trasy svozu: Safari tisk bez popupu",
    text: "Detailní PDF a Tisk pro řidiče už netisknou přes nové vyskakovací okno. Smart používá interní tiskový rám, takže Safari nemusí povolovat popup pro read-only tiskovou trasu."
  },
  {
    title: "Trasy svozu: hlavní záložka jen pro tisk",
    text: "Záložka Svozové trasy je uklizená na praktický read-only tiskový filtr Termín / Auto / Odpad, souhrn a řidičský náhled. Technická správa importů, Vistos match a kontrolní tabulky zůstávají v Diagnostice tras."
  },
  {
    title: "Trasy svozu: řidičský tisk obsahuje odpad",
    text: "Řidičský tiskový náhled a tisk do PDF mají samostatný sloupec Odpad, nádobu, frekvenci, poznámku a kontrolní stav bez navigace, GPS, T-Cars, SMS/e-mailů a ostrých tras."
  },
  {
    title: "Trasy svozu: sloupec Odpad v tisku",
    text: "Řidičský náhled a tisk tras mají samostatný sloupec Odpad vedle adresy, nádoby, počtu a poznámky. Jde jen o read-only UI výstup nad aktuálním filtrem."
  },
  {
    title: "Trasy svozu: hlavní filtr pro tisk",
    text: "Hlavní záložka Trasy svozu je uklizená na běžný pracovní filtr termín, vlastní datum, auto, odpad, stav, PDF a tisk pro řidiče. Importy, kontroly a Vistos diagnostika jsou mimo hlavní tiskový pohled."
  },
  {
    title: "Trasy svozu: méně zbylých oprav",
    text: "Parser zdrojových 13 Excelů lépe drží zákazníka/adresu u názvů obsahujících BIO, čistí telefonní poznámky v adrese a bere překlep 1100 tr jako 1100 ltr. Jde o read-only preview bez změny Excelů a bez ostrých tras."
  },
  {
    title: "Trasy svozu: oprava zákazníka a adresy",
    text: "Parser 13 Excelů už u firem s čárkou v názvu nebere právní formu jako adresu a samostatnou adresu začínající městem neukazuje jako zákazníka. Jde o read-only preview import bez změny zdrojových Excelů a bez ostrých tras."
  },
  {
    title: "Trasy svozu: čistý tiskový filtr",
    text: "Hlavní záložka Svozové trasy je uklizená pro uživatele na Termín, Auto, Odpad, Tisk/PDF, provozní souhrn a řidičský náhled. Importy, Vistos match a kontrolní tabulky jsou přesunuté do Diagnostiky tras."
  },
  {
    title: "Trasy svozu: čitelnější chytrý filtr",
    text: "Chytrý filtr pro tisk tras je zjednodušený na Termín, Auto a Odpad místo devíti tlačítek. Odpad se už při chytrém filtrování neresetuje na vše a řidičský tisk používá aktuální odpadový filtr."
  },
  {
    title: "Trasy svozu: chytrý filtr pro tisk",
    text: "Svozové trasy mají read-only chytrý filtr Auto A/B/C dnes, zítra a pozítří. Filtr nastaví den, sudý/lichý týden a auto pro aktuální trasu z 13 Excelů a naváže na řidičský tisk bez navigace a ostrých tras."
  },
  {
    title: "Trasy svozu: řidičský tiskový náhled",
    text: "Svozové trasy mají read-only řidičský tiskový náhled aktuálního filtru s pořadím, zákazníkem, adresou, nádobou, počtem, poznámkou a stavem bez navigace, GPS, T-Cars a ostrých tras."
  },
  {
    title: "Trasy svozu: panel řádků k opravě",
    text: "Svozové trasy mají read-only panel pro chybějící adresy, nádoby, frekvence a nenamapované řádky z aktuálního filtru 13 Excelů včetně doporučené opravy a CSV exportu bez přepsání zdroje."
  },
  {
    title: "Trasy svozu: zkratky obchodníků oddělené od odpadu",
    text: "Parser 13 Excelů bere DPI, PLI, FKU, PČE/PCE, PPA a ROP jako zkratky obchodníků v metadatech řádku, ne jako typ odpadu. Tím se snižuje počet nejasných řádků bez přepsání zdrojové trasy."
  },
  {
    title: "Trasy svozu: PDF náhled z 13 Excelů",
    text: "Svozové trasy mají rozšířený read-only PDF/tiskový náhled aktuálního filtru včetně dne, týdne, auta, batch ID, rozpadů odpadů a mapování, zdrojového Excelu/listu/řádku a Vistos problému bez ostrých tras."
  },
  {
    title: "Trasy svozu: silnější parser a Vistos match",
    text: "Svozové trasy berou den a týden primárně ze zdrojového Excelu/listu, umí lépe rozdělit buňku zákazník + adresa a Vistos match bezpečněji mapuje jasné shody bez vytvoření ostrých tras."
  },
  {
    title: "Šarlota: kratší systémové načtení",
    text: "Prompt Šarloty v Hlášení řidičů používá kratší větu `Rozumím. Podívám se do systému.` a drží pravidlo, že SPZ není hlavní cesta výběru vozidla."
  },
  {
    title: "Šarlota Smart 2: čistý agent bez klonu",
    text: "Automatické založení Smart 2 klonem produkční Šarloty je vypnuté. Testovací Smart 2 se zakládá jen jako nový prázdný ElevenLabs agent a potom se napojí přes Agent ID."
  },
  {
    title: "Šarlota Smart 2: smazání test agenta",
    text: "Nastavení má chráněnou admin akci pro smazání pouze testovacího ElevenLabs agenta Smart 2. Produkční Šarlota se touto akcí nemění."
  },
  {
    title: "Šarlota Smart 2: model podle produkční Šarloty",
    text: "Oprava základu Smart 2 přebírá přesná modelová pole z produkčního agenta Šarloty, aby ElevenLabs nedostal neplatný tvar hodnoty."
  },
  {
    title: "Šarlota Smart 2: přesnější oprava modelu",
    text: "Oprava základu Smart 2 nastavuje model i v poli llm, které ElevenLabs u agenta vrací jako hlavní hodnotu pro kontrolu."
  },
  {
    title: "Šarlota Smart 2: oprava základu",
    text: "Nastavení má chráněnou admin akci pro testovacího agenta Smart 2, která opraví jen first message a LLM model. Produkční Šarlota, prompt ani tools se tímto krokem nemění."
  },
  {
    title: "Šarlota Smart 2: vytvoření test agenta",
    text: "Backend má chráněný admin endpoint pro vytvoření ElevenLabs agenta Šarlota Smart 2 – test z produkční Šarloty. Endpoint nevrací API key ani prompt text a vyžaduje oprávnění Nastavení spravovat."
  },
  {
    title: "Šarlota Smart 2: oddělený testovací agent",
    text: "Nastavení Šarloty umí přepnout mezi produkční Šarlotou, testovací Šarlotou Smart 2 a Markem. Status, signed-url, tools sync, prompt sync i testovací hovor používají vybraný assistant key a vlastní Agent ID."
  },
  {
    title: "Šarlota: ověřený seznam vozidel",
    text: "Hlášení řidičů používá ověřený backend seznam jako první volbu. Když seznam není bezpečný nebo je dlouhý, otevře picker v aplikaci; značka, typ nebo SPZ jsou už jen nouzová cesta."
  },
  {
    title: "Šarlota: picker se opravdu otevírá",
    text: "Tool show_driver_vehicle_picker už vrací úspěch hned po zobrazení UI pickeru, nečeká potichu na kliknutí. Výběr vozidla se ověřuje samostatně a bez potvrzeného vehicleId nebo SPZ vrací jednotný VEHICLE_SPZ_REQUIRED."
  },
  {
    title: "Šarlota: vozidlo se vybírá v aplikaci",
    text: "Hlasové Hlášení řidičů už neříká seznam, počet ani názvy vozidel. Šarlota otevře bezpečný výběr v aplikaci a do zápisu pustí jen ověřené vehicleId nebo ručně ověřenou SPZ."
  },
  {
    title: "Šarlota: diagnostika respektuje fail-safe",
    text: "Panel Nastavení už u běžné signed-url cesty neukazuje předpočítaná vozidla. Diagnostika teď odpovídá produkčnímu fail-safe: driver_report_vehicle_* se do hlasu neposílá."
  },
  {
    title: "Šarlota: vozidla jen po backend ověření",
    text: "Hlasové Hlášení řidičů má tvrdý fail-safe: signed-url už neposílá vozidlové dynamic variables a Šarlota smí nabídnout konkrétní vozidlo jen při backendovém vehiclesVerified: true. Ruční SPZ se ověřuje read-only proti Vozovému parku."
  },
  {
    title: "Šarlota: hlasový test bez vozidel",
    text: "Nastavení Šarloty má dočasný session-only test, který pro novou hlasovou session vynechá driver_report_vehicle dynamic variables. Slouží k izolaci, jestli vozidla vznikají z KSO kontextu, tools, nebo přímo z ElevenLabs agenta."
  },
  {
    title: "Šarlota: detail ElevenLabs diagnostiky",
    text: "Panel Nastavení zobrazuje read-only detail live ElevenLabs tools, Knowledge Base položek a hlasového kontextu vozidel. Diagnostika nevrací signed URL, secrets, cookies ani prompt text a nemění nastavení agenta."
  },
  {
    title: "Šarlota: diagnostické odpojení tools",
    text: "Nastavení Šarloty má chráněný diagnostický režim, který dočasně odpojí ElevenLabs client tools od agenta, nechá identitu přes signed-url dynamic variables a umožní rollback běžnou synchronizací tools."
  },
  {
    title: "Hlášení řidičů: partslink24 VIN pilot",
    text: "Detail hlášení má read-only pilot pro vyhledání náhradních dílů podle VIN přes partslink24 pouze pro osobní vozidla. KSO ukládá audit s maskovaným VIN a nepředstírá plnou automatizaci; pokračování běží ručně přes schválený GitHub Actions runner."
  },
  {
    title: "Šarlota: kontext Hlášení řidičů",
    text: "Šarlota má nový read-only tool get_driver_report_context pro načtení řidiče, oprávnění a přiřazených vozidel z Vozového parku před servisním hlášením. SPZ používá až jako fallback."
  },
  {
    title: "Hlášení řidičů: servisní wording",
    text: "Texty modulu Hlášení řidičů jsou zobecněné na servisní potřeby, údržbu, závady, poškození a další požadavky k vozidlu bez změny logiky, API nebo práv."
  },
  {
    title: "Šarlota: bezpečný sync ElevenLabs tools",
    text: "Backend má chráněný admin endpoint pro read-only návrh a potvrzenou synchronizaci ElevenLabs client tools. Sync nemění prompt, first message ani model a před zápisem ověřuje správného agenta Šarloty."
  },
  {
    title: "Hlášení řidičů: stav Testování",
    text: "Modul Hlášení řidičů je v seznamu modulů označený jako Testování, protože hlasové workflow a ND proces jsou připravené k provoznímu ověření."
  },
  {
    title: "Šarlota: výběr z více vozidel řidiče",
    text: "Když má řidič přiřazených více vozidel, Šarlota nebere první auto ze seznamu. Vyjmenuje možnosti podle typu, značky nebo interního názvu a SPZ používá až jako poslední technický fallback."
  },
  {
    title: "Vozový park: řidič jen ze zaměstnanců",
    text: "Přiřazení řidiče k vozidlu už nepoužívá ruční jméno, telefon ani e-mail. Řidič se vybírá pouze z existujících zaměstnanců a backend volbu ověřuje proti zaměstnaneckému seznamu."
  },
  {
    title: "Hlášení řidičů: Pitstop detail a tykání Šarloty",
    text: "Detail hlášení v modulu Hlášení řidičů má Pitstop box grafiku. Repo-side texty Šarloty a ElevenLabs client tools jsou zpřísněné na tykání a PŘÍRUČKA nově vyžaduje fulltextovou kontrolu vykání u hlasové vrstvy."
  },
  {
    title: "Šarlota: odolnější příprava hlasu",
    text: "ElevenLabs signed-url endpoint nově vrací kontrolovaný JSON i při serverové chybě a volitelné kontexty Šarloty, jako vozidlo řidiče nebo firemní odlehčení, už nesmí shodit hlasovou session."
  },
  {
    title: "Šarlota: přesná diagnostika hlasu",
    text: "Hlasový panel Šarloty nově jasně rozlišuje blokovaný mikrofon, čekání na povolení, nedostupný mikrofon, lokální preview bez ElevenLabs a chybu signed-url session."
  },
  {
    title: "Vozový park: funkční filtry seznamu",
    text: "Seznam vozidel ve Vozovém parku má zapnuté lokální filtrování podle stavu, typu, řidiče, termínů, otevřených závad a fulltextového hledání nad read-only daty z Vistos master seznamu."
  },
  {
    title: "Šarlota: jen ElevenLabs hlas",
    text: "Testovací hlasová větev byla odstraněná. Tlačítko Šarloty teď používá jednu hlasovou cestu přes ElevenLabs signed-url a KSO backend."
  },
  {
    title: "Šarlota: jasná chyba mikrofonu",
    text: "Hlasový panel Šarloty na mobilu rozlišuje blokovaný mikrofon od obecné chyby. Když prohlížeč mikrofon nepovolí, zobrazí konkrétní stav a krátký návod k povolení mikrofonu pro web."
  },
  {
    title: "Hlášení řidičů: Mercedes díly přes API/fallback",
    text: "Servisní hlášení má připravenou backendovou vrstvu pro Mercedes-Benz Trucks díly podle VIN. Bez oficiálně nakonfigurovaného Daimler API systém nastaví ruční ověření ve WebParts/MyPartsHub, dovolí doplnit OE číslo a název dílu a nepředstírá přesný nález."
  },
  {
    title: "Vozový park: Vistos jako master seznam",
    text: "Seznam vozidel ve Vozovém parku používá Vistos Vehicle jako read-only master zdroj. T-Cars zůstává jen doplňkový/GPS zdroj a při nedostupném Vistosu slouží jako fallback."
  },
  {
    title: "Mobil: Vozový park ve dvou sloupcích",
    text: "Mobilní hlavička modulů je sjednocená do jedné lišty. Vozový park má záložky a T-Cars KPI karty ve dvou sloupcích i na 360px mobilu a Připomínky k modulu se na mobilu centrálně nezobrazují."
  },
  {
    title: "Mobil: kompaktní hlavičky modulů",
    text: "Společná mobilní hlavička modulů je nižší a čitelnější. Přihlášený uživatel, odhlášení, logo, návrat na HP a úvodní karta modulu už na telefonu nezaberou zbytečně velkou část první obrazovky."
  },
  {
    title: "Vozový park: filtr Vistos Vehicle podle stavu",
    text: "Read-only Vehicle preview z Vistosu už nepoužívá systémové filtry IsActive, Archived_IsNull ani EliminatedDate_IsNull. Aktivní vozidla se načítají přes ověřený stav Stavvozidla_FK = 16541."
  },
  {
    title: "Hlášení řidičů: Pitstop seznam na mobilu",
    text: "Seznam hlášení v modulu Hlášení řidičů má servisní Pitstop karty se stavem, SPZ, dílem a řidičem. Na mobilu je spodní box Připomínky k modulu schovaný, aby hlavní práce zůstala rychlá a bez zbytečného posunu."
  },
  {
    title: "Vozový park: řidič vozidla pro Šarlotu",
    text: "Detail vozidla má editovatelné pole Řidič. Hlasová Šarlota v Hlášení řidičů umí použít přiřazené vozidlo, SPZ a VIN podle volajícího řidiče a firemní odlehčení drží jen v bezpečném neurgentním kontextu."
  },
  {
    title: "Hlášení řidičů: mobilní Pitstop zadání",
    text: "Mobilní vstup do Hlášení řidičů otevírá rychlý Pitstop formulář se SPZ, popisem závady, potvrzením SPZ a jasnou výzvou k fotce poškození. Zaměstnanci mají nově rychlé klidné založení HR karty přes existující backend."
  },
  {
    title: "Hlášení řidičů: náhradní díly",
    text: "Modul Hlášení řidičů má backendový workflow pro náhradní díly: pravděpodobný díl, předání Patrikovi, SMS servisu, doručení dílu a plán servisu. Šarlota smí oznámit jen stav potvrzený backendem; provozní účinek vyžaduje oprávněný krok v KSO."
  },
  {
    title: "Datová schránka: ukládání konceptů Autopilota",
    text: "Cloud DB akce Datové schránky nově povolují i typy Autopilot a kontrolní návrh, aby se koncepty pro potvrzení ukládaly stejně jako archivace, e-mail a odpověď."
  },
  {
    title: "Vozový park: Vistos Vehicle preview",
    text: "Vozový park má read-only náhled entity Vehicle z Vistosu přes backend API. Modul zůstává master evidencí vozidel a ostatní moduly mají používat vazbu na Vozový park."
  },
  {
    title: "Šarlota: ženské zdrobnělé oslovení",
    text: "KSO backend posílá Šarlotě bezpečné oslovení user_first_name_friendly_vocative. U ověřených žen může zaznít Alenko, Marcelko, Jaruško nebo Lucko, u mužů zůstává běžný vocativ."
  },
  {
    title: "Šarlota: Firemní lidskost v EL",
    text: "Signed-url endpoint pro ElevenLabs posílá bezpečné dynamické proměnné human_touch_enabled, human_touch_suggestion, human_touch_type a human_touch_source, aby Šarlota použila jen ověřené krátké odlehčení z KSO backendu."
  },
  {
    title: "Šarlota: hlasové nepřítomnosti",
    text: "Hlasová Šarlota v modulu Dovolená / Nemoc a Rychlé zadání nově připraví dovolenou, nemoc, OČR, lékaře, náhradní volno, neplacené volno i jinou nepřítomnost a zapisuje až po potvrzení přes KSO backend."
  },
  {
    title: "Datová schránka: jasné Autopilot příznaky",
    text: "Zprávy vyhodnocené Autopilotem mají samostatný příznak Autopilot a oddělené příznaky pro doporučenou akci i stav potvrzení, aby se nemíchalo Hotovo, E-mail, Faktury a Archiv do jedné nesrozumitelné bubliny."
  },
  {
    title: "Šarlota: počasí a svátky",
    text: "Firemní lidskost Šarloty umí backendově načíst aktuální počasí pro Brno, české svátky, bezpečné narozeninové přání a schválené dovolené jako krátké ověřené odlehčení."
  },
  {
    title: "Šarlota: rychlý zápis dovolené z EL",
    text: "Potvrzený ElevenLabs tool create_absence_request má v KSO backendu rychlou větev bez zbytečného LLM rozhodování, aby zápis dovolené nekončil timeoutem v hovoru."
  },
  {
    title: "Šarlota: oprava potvrzení zápisu",
    text: "Hlasový zápis dovolené už nebere confirmed=false jako odmítnutí. Pokud potvrzení chybí, Šarlota se má krátce doptat; technická chyba toolu se vrací jako čitelný stav bez falešného hotovo."
  },
  {
    title: "Šarlota: rychlé krátké odpovědi",
    text: "Centrální pravidla Šarloty nově výslovně drží rychlé věcné odpovědi, jednu krátkou otázku najednou a zákaz opakování stejné otázky dokola."
  },
  {
    title: "Šarlota: EL tool pro zápis dovolené",
    text: "KSO frontend má připravený ElevenLabs client tool create_absence_request. Tool volá bezpečný backend Šarloty, který ověří oprávnění a bez výslovného potvrzení dovolenou nezapíše."
  },
  {
    title: "Šarlota: výchozí hlas zpět na ElevenLabs",
    text: "Tlačítko Spustit hlas spouští stabilní ElevenLabs režim. Testovací hlasová cesta už není v aplikaci."
  },
  {
    title: "Šarlota: velký mikrofon na černém pozadí",
    text: "Hlasový panel Šarloty používá nový dodaný mikrofon a tmavý mikrofonový prostor, aby byla hlavní hlasová akce na mobilu výrazná hned na první pohled."
  },
  {
    title: "HP a Šarlota: mobilní TOP responsive",
    text: "Úvodní stránka má pevnější mobilní rozložení bez horizontálního posunu a panel Šarloty má velké tlačítko Spustit hlas přímo nahoře. Stav připojení je kompaktnější, aby na iPhonu nezabral celé okno."
  },
  {
    title: "Šarlota: rychlý start na iPhonu",
    text: "Po otevření /sarlota z Akčního tlačítka se nahoře zobrazí velké tlačítko Spustit hlas. Mikrofon se dál nespouští automaticky a čeká na klepnutí."
  },
  {
    title: "Šarlota: iPhone Akční tlačítko",
    text: "KSO má deep-link /sarlota a záložní ?open=sarlota pro Apple Zkratku Šarlota. Po otevření se zobrazí panel Šarloty se stavem napojení, ale mikrofon se spustí až po klepnutí na Spustit hlas."
  },
  {
    title: "Šarlota: viditelné spuštění",
    text: "Po přihlášení je vpravo dole viditelné tlačítko Šarlota a otevírá rovnou hlasový panel; mikrofon se dál spouští až po samostatném klepnutí."
  },
  {
    title: "Šarlota: Firemní lidskost",
    text: "Hlasová Šarlota dostala bezpečný blok Firemní lidskost: může použít jednu krátkou odlehčovací poznámku z ověřeného kontextu počasí, svátků, povolených narozenin nebo viditelných schválených dovolených, ale nikdy nezmiňuje nemoc, OČR, lékaře ani citlivé údaje."
  },
  {
    title: "Šarlota: pilot zápisu dovolené",
    text: "Hlasová Šarlota umí jako pilot připravit vlastní žádost o dovolenou, doptat chybějící datum nebo rozsah a zapsat ji přes backend Dovolená/nemoc až po výslovném potvrzení bez odeslání SMS nebo e-mailu."
  },
  {
    title: "Šarlota: read-only ověření ElevenLabs agenta",
    text: "Stavový panel Šarloty umí serverově a read-only ověřit agenta v ElevenLabs přes API, potvrdit first message, model a tool names bez vracení promptu, signed URL, tokenů nebo secretů do UI."
  },
  {
    title: "Šarlota: stav signed-url napojení",
    text: "Nastavení má nový read-only panel Šarlota a chráněný backendový status endpoint pro kontrolu ElevenLabs konfigurace, intro_announcement, personalizace, vocativu a lokálních client tools bez vracení signed URL nebo secretů."
  },
  {
    title: "Šarlota: serverový voice endpoint",
    text: "Hlasová Šarlota má nový backend endpoint /api/voice/sarlota pro ElevenLabs webhook, server-side OpenAI rozhodování, ověření Smart odpady identity a bezpečné připravené nástroje bez ostrých SMS."
  },
  {
    title: "Datová schránka: otevření příloh",
    text: "Tlačítko Otevřít nyní u příloh lépe rozpozná PDF, obrázky, XML a text i při obecném MIME typu a pokusí se je otevřít v nové kartě místo prostého stažení."
  },
  {
    title: "Datová schránka: oprava vyhledávání",
    text: "Vyhledávací pole v inboxu drží celý napsaný text, neztrácí fokus po prvním znaku a dál respektuje aktivní datovou schránku."
  },
  {
    title: "Datová schránka: přílohy a přečtené zprávy",
    text: "Tlačítko Otevřít nyní u příloh se pokusí otevřít podporované soubory v nové kartě a přečtené zprávy jsou v inboxu klidnější než nepřečtené."
  },
  {
    title: "Datová schránka: DS příznak v řádku zprávy",
    text: "Firemní příznak datové schránky je nově na druhém řádku před datem, rozlišuje všechny aktuální DS schránky a nepřidává třetí řádek."
  },
  {
    title: "Datová schránka: mobilní pracovní pohled",
    text: "Na mobilu je Datová schránka zúžená na přepínače DS, seznam zpráv, detail, přílohy a bezpečné akce. Výchozí schránka je KS a režim Všechny DS se nepoužívá."
  },
  {
    title: "Datová schránka: bezpečný detail zprávy",
    text: "Detail zprávy nově hlídá aktuálně vybranou datovou schránku, zobrazuje schránku přímo v hlavičce detailu a přílohy zůstávají hlavní sekcí hned pod ní."
  },
  {
    title: "Datová schránka: stav AI a stránkování",
    text: "AI třídění je přesunuté do boxu Stav a synchronizace a inbox nově začíná na 5 zprávách na stránku s volbami 5/10/20/30/50/100."
  },
  {
    title: "Datová schránka: firemní příznaky ve zprávách",
    text: "Řádky zpráv nově ukazují kompaktní příznak firmy nebo datové schránky, aby bylo hned vidět, zda zpráva patří Kaiseru, Nanolabu nebo další schránce."
  },
  {
    title: "Datová schránka: endpoint příloh",
    text: "Stažení detailu zprávy a příloh používá samostatný ISDS endpoint pro datové zprávy, zatímco seznam obálek zůstává na informační službě."
  },
  {
    title: "Datová schránka: diagnostika příloh",
    text: "Log ruční synchronizace nově ukáže první bezpečnou ISDS chybu při automatickém stažení příloh, bez logování hesel, tokenů nebo obsahu souborů."
  },
  {
    title: "Datová schránka: automatické přílohy",
    text: "Ruční načtení nových zpráv nově automaticky zkusí stáhnout přílohy z ISDS, uložit je do cloudového úložiště a v detailu povolit bezpečné otevření jen u skutečně uložených souborů."
  },
  {
    title: "Datová schránka: přílohy a pravý panel",
    text: "Detail zprávy nově zvýrazňuje přílohy hned pod hlavičkou, inbox má stránkování 10/20/30 a pomocné informace jsou kompaktně v pravém panelu."
  },
  {
    title: "Datová schránka: očištěný pracovní modul",
    text: "Modul Datová schránka má odstraněné rušivé texty, grafiku a speciální rozložení. Zůstávají zachované výběry schránek, přijaté a odeslané zprávy, přílohy, log a ruční read-only synchronizace."
  },
  {
    title: "Datová schránka: třísloupcový glass inbox",
    text: "Modul Datová schránka má světlý třísloupcový pracovní layout: zprávy vlevo, detail uprostřed, návrh vyřízení a stav vpravo. Zůstává čistě read-only."
  },
  {
    title: "Datová schránka: priority a fulltext",
    text: "Inbox Datové schránky má read-only návrh priority, rozšířený fulltext přes odesílatele, předmět, ID, náhled i přílohy, kompaktní filtry a barvy odvozené z Nastavení vzhledu."
  },
  {
    title: "Datová schránka: hezčí pracovní inbox",
    text: "Inbox Datové schránky má užší pracovní kontejner, větší čitelnější písmo, výraznější vybranou zprávu a klidnější detail pro denní práci."
  },
  {
    title: "Datová schránka: rozumná desktopová šířka",
    text: "Inbox Datové schránky má na širokých monitorech centrovaný pracovní kontejner, pevnější šířku seznamu zpráv a čitelnější detail bez extrémně dlouhých řádků."
  },
  {
    title: "Datová schránka: zprávy nahoře",
    text: "Modul je zjednodušený na pracovní inbox: krátká horní lišta, kompaktní schránky, čtyři malé počty a hned seznam zpráv s detailem vedle sebe."
  },
  {
    title: "Datová schránka: pracovní inbox",
    text: "Přijaté zprávy mají KPI, rychlé filtry, pracovní seznam, read-only detail, bezpečné přílohy a responzivní rozložení pro desktop, tablet i mobil."
  },
  {
    title: "Datová schránka: záložky bez skoku stránky",
    text: "Záložky v modulu Datová schránka už nejsou kotvové odkazy; přepínají obsah na místě, takže klik na Přijaté zprávy neposune stránku dolů."
  },
  {
    title: "Datová schránka: čistý chlívek a lehčí písmo",
    text: "Klik na firemní schránku nově otevře samostatný pohled pouze pro tuto DS a texty v modulu používají lehčí Quicksand, aby se data vešla a zůstala čitelná."
  },
  {
    title: "Datová schránka: firemní chlívky",
    text: "Modul Datová schránka má šest klikacích boxů pro Kaiser servis, Kaiser technology, Nanolab plus, Nanolab shop, LeFleur a Kaisermanův nadační fond; klik přepne zprávy i log synchronizace do vybrané schránky."
  },
  {
    title: "Datová schránka: více DS účtů",
    text: "Ruční read-only sync nově projde původní datovou schránku a až pět dalších sad Cloudflare secrets, metadata ukládá odděleně podle schránky a log ukazuje, kterého DS účtu se běh týkal."
  },
  {
    title: "Karta zaměstnance: Pinya dokumenty read-only preview",
    text: "Karta zaměstnance má bezpečný read-only stav pro budoucí napojení dokumentů z Pinya. Endpoint zatím Pinya nevolá, nestahuje soubory a nic neukládá."
  },
  {
    title: "Datová schránka: ruční read-only sync",
    text: "Modul Datová schránka má chráněný backendový endpoint pro ruční synchronizaci seznamu obálek ISDS, zapisuje log běhu do D1 a bez Cloudflare secrets bezpečně skončí stavem konfigurace."
  },
  {
    title: "Karta zaměstnance: potvrzení mazání bez dialogu",
    text: "Smazání dokumentu se potvrzuje druhým kliknutím přímo v řádku dokumentu, aby se úklid nezasekl na systémovém potvrzovacím okně."
  },
  {
    title: "Karta zaměstnance: ruční smazání dokumentu",
    text: "Dokumenty v kartě zaměstnance mají pro oprávněné role malé tlačítko Smazat, které používá chráněné backend API a po potvrzení odstraní soubor i záznam."
  },
  {
    title: "Datová schránka: detail zprávy",
    text: "Přijaté a odeslané zprávy mají read-only detail z interního API, včetně metadat, příloh a posledního AI vyhodnocení bez aktivace ISDS."
  },
  {
    title: "Karta zaměstnance: bezpečné mazání dokumentů",
    text: "Dokumenty zaměstnanců mají chráněný backendový DELETE endpoint, který maže databázový záznam i soubor v cloudovém úložišti a zapisuje auditní stopu."
  },
  {
    title: "Datová schránka: jasný stav pilotu",
    text: "Modul teď jasně rozlišuje existující čtecí API, neaktivní ISDS synchronizaci a blokované odesílání, aby bylo vidět, že jde zatím o read-only pilot."
  },
  {
    title: "Karta zaměstnance: hromadný import dokumentů",
    text: "Dokumenty stažené nebo exportované z Pinya lze hromadně spárovat podle názvu souboru a potvrzené shody uložit do stávajícího cloudového úložiště zaměstnaneckých dokumentů."
  },
  {
    title: "Karta zaměstnance: HR nadpisy v hlavní barvě",
    text: "Nadpisy HR skupin z Excelu používají skutečnou hlavní firemní barvu místo tmavší varianty."
  },
  {
    title: "Karta zaměstnance: kompaktnější HR položky",
    text: "HR položky z Excelu jsou na desktopu uspořádané hustěji do dvou skupinových sloupců a tří sloupců polí uvnitř, aby blok nebyl zbytečně vysoký."
  },
  {
    title: "Karta zaměstnance: čistší HR a schvalování",
    text: "Karta zaměstnance doplňuje bydliště z HR profilu, skrývá zbytečné poznámky a práci s počítačem, používá hlavní barvu u HR bloků a schvalovací karty má na desktopu ve třech sloupcích."
  },
  {
    title: "Dovolená / Nemoc: barvy z Nastavení vzhledu",
    text: "Modul Dovolená / Nemoc nově používá firemní paletu z globálního Nastavení vzhledu i pro záložky, panely, pravidla a Kartu zaměstnance."
  },
  {
    title: "UI: upraveny status badge",
    text: "Status badge na kartach ma posunutou pozici a kompaktnejsi padding podle posledni vizualni kontroly."
  },
  {
    title: "HP: strankovani novinek",
    text: "Sekce Co je noveho na uvodni strance zobrazuje nejvyse 25 zaznamu na stranku a ma jednoduche strankovani pres sdilitelnou URL."
  },
  {
    title: "Dovolená / Nemoc: pravidla prohlídek a stabilní klikání",
    text: "Karta zaměstnance má kompaktnější UI, pravidla lékařských prohlídek jsou vidět v Seznamu pravidel i Nastavení, Šarlota promo je globálně skryté a záložky už nezamrzají při nedostupném API pravidel."
  },
  {
    title: "HP: nizsi header bez zmenseni loga",
    text: "Header homepage je zhruba o tretinu kompaktnejsi diky mensim mezeram, subtitle vedle loga na desktopu a nizsim stavovym kartam; velikost loga zustala stejna."
  },
  {
    title: "HP: sjednoceny padding",
    text: "Homepage shell ma globalni padding 20 px ze vsech stran, aby obsah nebyl nalepeny na okraje a header zustal kompaktni."
  },
  {
    title: "HP: nove kompaktni logo",
    text: "Homepage pouziva dodane obrazkove logo Smart odpady misto samostatneho Kaiser boxu a velkeho textoveho nadpisu, aby uvodni header zabiral mene mista."
  },
  {
    title: "Vzhled: sede povrchy misto zeleneho nadechu",
    text: "Dynamicky theme surface uz nepouziva zelenou primarni barvu v pozadi; stary zelenkavy default #f7f9f4 se meni na neutralni sedy povrch."
  },
  {
    title: "HP: kompaktnejsi uvodni blok",
    text: "Uvodni cast homepage je nizsi diky mensim mezeram, kompaktnimu titulku a mensim stavovym kartam, aby moduly zacinaly vyse."
  },
  {
    title: "HP: vetsi odstup od okraju",
    text: "Homepage ma minimalne 15 px bocni gutter a sirsi hlavni shell, aby obsah nepusobil nalepene na hrany."
  },
  {
    title: "HP: odstraneny zeleny podklad karet",
    text: "Homepage ma sjednocene neutralni sede pozadi i u mekkych kartovych ploch, aby se nevracel zelenkavy odstin typu #e5f0d7."
  },
  {
    title: "HP: neutralni sede pozadi",
    text: "Homepage ma misto zelenkaveho pozadi neutralni sedy gradient, aby uvodni obrazovka pusobila klidneji a firemni zelena zustala jen jako akcni akcent."
  },
  {
    title: "Karta zaměstnance: bez horního přehledu",
    text: "Stránka Zaměstnanci je vrácená do původního rozložení Karty zaměstnance bez nového horního přehledu a filtrů."
  },
  {
    title: "Karta zaměstnance: import HR Excelu",
    text: "Karta zaměstnance má backendový preview import zaměstnaneckého Excelu, HR-only zaměstnance bez loginu, oddělený citlivý HR profil a audit importních batchů."
  },
  {
    title: "Trasy svozu: ruční kontrola nejasných matchů",
    text: "Svozové trasy mají nový read-only panel pro nejasné Vistos match řádky v aktuálním filtru včetně rychlého přepnutí na PO / Auto A, důvodu nejasnosti a návrhu ruční kontroly bez vytvoření ostré trasy."
  },
  {
    title: "Trasy svozu: přesnější jistý Vistos match",
    text: "Vistos match nově umí označit jako namapované i podobné Vistos řádky stejného stanoviště, ale jen když sedí konkrétní zákazník, adresa a svozové parametry. Slabé adresové nebo čerpací-staniční shody zůstávají nejasné."
  },
  {
    title: "Trasy svozu: rychlejší a bezpečnější Vistos match",
    text: "Vistos match pro Svozové trasy počítá nad omezeným indexem kandidátů a staré výsledky čistí až po úspěšném zápisu nové dávky, aby timeout nenechal trasu bez match dat."
  },
  {
    title: "Trasy svozu: dávkové uložení Vistos kandidátů",
    text: "Vistos Komunál preview ukládá kandidátní řádky pro match dávkově do D1, aby se fyzicky uložil celý rozsah pro párování 13 Excelů a odvozené preview tabulky přitom zůstaly omezené."
  },
  {
    title: "Trasy svozu: celý Vistos Komunál preview jako match kandidáti",
    text: "Vistos Komunál preview ukládá do D1 celý read-only kandidátní rozsah pro následný match Svozových tras z 13 Excelů, ne jen prvních 250 preview řádků."
  },
  {
    title: "Trasy svozu: rychlejší Vistos match z uloženého preview",
    text: "Vistos match pro Svozové trasy nejdřív používá poslední uložený read-only Vistos Komunál preview batch v D1, aby se při kliknutí nespouštěl dlouhý živý export a výsledek se rychle propsal do tabulky."
  },
  {
    title: "Trasy svozu: Vistos match nad 13 Excely",
    text: "Svozové trasy mají ruční read-only Vistos match nad importovanými Excel řádky, ukládají výsledek přes backend/D1 a v tabulce ukazují Vistos smlouvu, zákazníka, stanoviště i problém mapování bez přidání dalších zákazníků."
  },
  {
    title: "Trasy svozu: praktická sekce Svozové trasy z 13 Excelů",
    text: "Přidaná read-only sekce Svozové trasy ukládá import 13 historických Excelů přes API/D1, filtruje den/týden/auto/odpad/mapování a připravuje CSV i PDF náhled bez ostrých tras."
  },
  {
    title: "Trasy svozu: Optimalizováno AI z 13 Excelů 1:1",
    text: "Optimalizováno AI nově ukazuje konkrétní trasu podle dne a vozidla z nahraných 13 Excelů, drží původní soubor/řádek/text a odděluje Vistos-only pilot od Excel optimalizace."
  },
  {
    title: "Trasy svozu: 13 Excelů už nevypadá jako mrtvé tlačítko",
    text: "Tlačítko 13 Excelů teď jasně ukáže, že historické Excel podklady nejsou uložené v aplikaci, a bez nahraných dat přesune uživatele rovnou k jednorázové kalibraci."
  },
  {
    title: "Trasy svozu: Optimalizováno AI",
    text: "Vistos Komunál preview používá pro odvozený read-only AI výpočet název Optimalizováno AI v hlavních tlačítkách, tabulkách i exportních popisech."
  },
  {
    title: "Trasy svozu: rychlý export 13 Excelů a Optimalizováno AI",
    text: "Horní tlačítka 13 Excelů a Optimalizováno AI ve Vistos Komunál preview nově rovnou generují Excel-friendly exporty pro historickou kalibraci a read-only AI denní výpočet."
  },
  {
    title: "Trasy svozu: 13 Excelů vs Optimalizováno AI",
    text: "Vistos Komunál preview nově jasně odděluje historický podklad 13 Excelů od odvozeného read-only výpočtu Optimalizováno AI včetně dvou rychlých tlačítek a přesnějších názvů tabulek/exportů."
  },
  {
    title: "Trasy svozu: vzorky stanovišť k dennímu návrhu",
    text: "Denní Vistos-only návrh nově ukazuje dostupné vzorky stanovišť a smluv pod denním kapacitním rozpadem včetně samostatného kontrolního exportu bez vytvoření ostrých tras."
  },
  {
    title: "Trasy svozu: denní Vistos-only návrh",
    text: "Vistos Komunál preview nově skládá read-only denní kapacitní rozpad svozových skupin pro vozidla A 3BN 3558, B 1BP 8373 a C 3BE 2831 bez použití historických Excelů jako provozního vstupu."
  },
  {
    title: "Trasy svozu: Vistos jako hlavní zdroj tras",
    text: "Vistos Komunál preview teď v UI jasně vede hlavní tok jako Vistos → read-only návrh svozových skupin. Dispečerské Excely jsou označené jen jako jednorázová historická kalibrace, ne každodenní provozní vstup."
  },
  {
    title: "Trasy svozu: historická kalibrace Excel tras",
    text: "Jednorázová kalibrace z dispečerských Excelů si načte plný Vistos párovací export, doplní chybějící odpad/objem/počet do paměťového náhledu a exportuje původní, Vistos i výsledné párovací sloupce."
  },
  {
    title: "Trasy svozu: kontrola kvality importu tras",
    text: "Optimalizační read-only náhled rozpozná zápisy kont.1100/kont.240, nepočítá falešné minuty z neznámých objemů a označuje řádky čekající na Vistos nebo ruční kontrolu."
  },
  {
    title: "Trasy svozu: přímé čtení starých .xls tras",
    text: "Optimalizační read-only náhled umí zpracovat i staré binární .xls soubory dispečinku a vícelistové workbooky bez ruční konverze."
  },
  {
    title: "Trasy svozu: read-only historická kalibrace",
    text: "Vistos Komunál preview umí jednorázově porovnat dispečerské trasy jako .xls/.xlsx/CSV s Vistos daty pro oblast Brno/Blansko a vyexportovat párovací sloupce bez vytvoření ostrých tras."
  },
  {
    title: "Trasy svozu: pracovní návrh svozových skupin",
    text: "Vistos Komunál preview z už mapovatelných položek skládá read-only pracovní návrh svozových skupin podle odpadu, četnosti a nádoby včetně exportu do Excelu."
  },
  {
    title: "Trasy svozu: obchodní ceny druhotných surovin mimo trasu",
    text: "Vistos Komunál preview odděluje další řádky, které popisují pohyblivou nebo aktualizovanou cenu druhotné suroviny, VOK, spalovnu/skládku nebo roční jednorázový vývoz, mimo pravidelné svozové trasy."
  },
  {
    title: "Trasy svozu: nesvozové texty mimo aliasy",
    text: "Vistos Komunál preview odděluje další jasně nesvozové obchodní texty jako výkupní cena, skartace, na výzvu, mimořádný vývoz nebo lisované obchodovatelné balíky mimo pravidelné trasy."
  },
  {
    title: "Trasy svozu: objem z textu řádku Vistosu",
    text: "Vistos Komunál preview umí vzít výslovně uvedený objem nádoby přímo z obchodního textu řádku, například 60 ltr nádoba, nádoba 120 ltr nebo výklop nádoby 1100/5000 ltr."
  },
  {
    title: "Trasy svozu: bez falešných objemů z katalogových kódů",
    text: "Parser Vistos Komunál preview už nepoužívá libovolné první číslo v obchodním textu jako objem nádoby, takže kódy odpadu jako 15 01 01 nebo 20 01 08 nevypadají omylem jako litry."
  },
  {
    title: "Trasy svozu: objem nádob z obchodních textů",
    text: "Parser Vistos Komunál preview rozpozná bezpečné zápisy jako 2x240, P240, P120, kont.1100 nebo 1100ltr jako objem a počet nádob bez hádání typu odpadu."
  },
  {
    title: "Trasy svozu: alias GASTRO 30 l",
    text: "Vistos Komunál preview mapuje obchodní text GASTRO 30 l jako svozový BIO odpad 200108 s četností 1x7 a nádobou 30 l."
  },
  {
    title: "Trasy svozu: textový filtr read-only exportu",
    text: "Vistos Komunál preview export umí volitelně zúžit read-only řádky podle obchodního textu, aby šlo připravit přesné Excel výpisy pro párování aliasů."
  },
  {
    title: "Trasy svozu: plný read-only export Vistos diagnostik",
    text: "Backend umí vrátit kompletní řádky Vistos Komunál preview podle typu datového problému bez zápisu do D1, aby šly připravit použitelné Excel výpisy pro párování."
  },
  {
    title: "Trasy svozu: mobilní šířka Vistos panelu",
    text: "Panel Vistos Komunál preview drží své bloky a status štítek uvnitř dostupné šířky, aby na mobilu a tabletu nevznikalo vodorovné přetékání."
  },
  {
    title: "Trasy svozu: odpadní voda mimo trasu",
    text: "Vistos Komunál preview explicitně odděluje odpadní vodu a rozbory mimo aliasy svozových tras, i když mají ve zdrojových datech podobný obchodní text."
  },
  {
    title: "Trasy svozu: aliasy jen pro svozové signály",
    text: "Položky, které samy nevypadají jako pravidelná svozová trasa, se ve Vistos Komunál preview oddělují mimo trasu a nezůstávají v tabulce aliasů."
  },
  {
    title: "Trasy svozu: běžné svozové kódy v aliasech",
    text: "Tabulka aliasů pro Vistos Komunál preview nechává mezi svozovými texty jen běžné komunál/separát odpady; ostatní katalogové odpady se oddělují mimo svozovou trasu."
  },
  {
    title: "Trasy svozu: nesvozové položky mimo aliasy",
    text: "Vistos Komunál preview přesněji vyřazuje jednorázové a nesvozové položky jako pronájmy, dopravu, lapoly, nebezpečné odpady nebo laboratorní služby z tabulky aliasů pro svozové trasy."
  },
  {
    title: "Trasy svozu: aliasy obchodních textů",
    text: "Vistos Komunál preview odděluje položky mimo svozovou trasu od svozových položek, kterým chybí jen alias obchodního textu pro četnost, objem nebo odpad."
  },
  {
    title: "Trasy svozu: viditelné tlačítko exportu",
    text: "Tlačítko Export do Excelu je viditelné i před novým přepočtem vzorků a jasně navede na načtení Vistos preview, pokud zatím není co exportovat."
  },
  {
    title: "Trasy svozu: export vzorků do Excelu",
    text: "Vzorky Vistos položek k namapování lze stáhnout jako Excel-friendly CSV se srozumitelnými českými sloupci."
  },
  {
    title: "Trasy svozu: vzorky položek k namapování",
    text: "Vistos Komunál preview ukazuje nejčastější názvy a texty položek, které nejdou namapovat, aby bylo jasné, jaká pravidla doplnit jako první."
  },
  {
    title: "Trasy svozu: lidský souhrn Vistos problémů",
    text: "Vistos Komunál preview doplňuje jasný závěr, co blokuje, co řešit dál a co je jen diagnostika, aby mapovací problémy nebyly jen technické kódy."
  },
  {
    title: "Příručka: bezpečný samostatný koridor",
    text: "Pracovní pravidla upřesňují, kdy může Codex po potvrzení rozsahu pokračovat samostatně u nízkorizikových změn a kdy musí znovu zastavit."
  },
  {
    title: "Trasy svozu: souhrn problemu podle typu",
    text: "Vistos Komunal preview zobrazuje souhrn datovych problemu podle typu s poctem, prioritou a doporucenym postupem pro dalsi cisteni dat."
  },
  {
    title: "Trasy svozu: rychlejsi ulozeni Vistos preview",
    text: "Komunal preview uklada plne souhrnne pocty do metadata a detailni D1 radky omezuje na bezpecny vzorek, aby produkcni request nedrzel UI ve stavu nacitani."
  },
  {
    title: "Trasy svozu: oprava souhrnu stanovišť ve Vistos preview",
    text: "Backend doplnuje pocitadlo polozek podle stanoviste, aby se nenulove Vistos preview ulozilo a zobrazilo misto padu pri sestaveni souhrnu."
  },
  {
    title: "Trasy svozu: Vistos preview bez tvrdeho datumoveho vyrazeni",
    text: "Komunal preview ponechava Contract i ContractRow datumy jako read-only diagnostiku. Smlouvy a polozky se nemaji vyrazovat jen kvuli StartDate/EndDate nebo IsActive."
  },
  {
    title: "Trasy svozu: navrat funkcniho Vistos Komunal preview",
    text: "Vistos Komunal preview je vracene do posledniho funkcniho chovani pred tvrdym filtrem ContractRow. Nepridava ostre trasy, SMS/e-maily ani automatizace."
  },
  {
    title: "Sledovani vozidel: WIM body v mape",
    text: "Pevne WIM vahy jsou ve vrstve Sledovani vozidel videt jako samostatne klikaci body v mapovem panelu s detailem mista, stavu a poctu smerovych vah."
  },
  {
    title: "Trasy svozu: vycisteni Vistos error stavu",
    text: "Po nacteni pouzitelneho Vistos Komunal batche se sdileny chybovy stav cisti a UI ukazuje varovani k datum problemum misto chyby spusteni."
  },
  {
    title: "Trasy svozu: jasnejsi stav Vistos preview",
    text: "UI uz nerozlisuje datove problemy Vistos Komunal preview jako chybu spusteni. Pri nactenych datech ukazuje varovny stav a problemy zustavaji v tabulce."
  },
  {
    title: "Trasy svozu: odolnejsi Vistos preview",
    text: "Backend Vistos Komunal preview ma tolerantnejsi cteni datumu StartDate/EndDate a pri chybe vraci adminovi bezpecny diagnosticky detail bez secrets."
  },
  {
    title: "Trasy svozu: filtr datumove platnych smluv",
    text: "Vistos Komunal preview po API filtru pousti do read-only nahledu jen smlouvy platne k dnesku podle StartDate a EndDate."
  },
  {
    title: "Trasy svozu: presnejsi mapovani Vistos",
    text: "Read-only Komunal preview mene duplikuje datove problemy, rozlisuje nesvozove polozky a lepe odvozuje odpad, cetnost a objem nadoby z Vistos textu."
  },
  {
    title: "Trasy svozu: tabulky Vistos preview",
    text: "Hotfix nacita ulozene radky a problemy posledniho Vistos Komunal batche, aby se po preview zobrazily tabulky smluv, stanovist a problemu."
  },
  {
    title: "Trasy svozu: oprava Vistos preview",
    text: "Hotfix uklada prazdne vazby pilotniho preview jako NULL, aby read-only Vistos Komunal preview nepadalo na auditovani."
  },
  {
    title: "Trasy svozu: Vistos Komunal preview",
    text: "Faze 1E nacita aktivni Komunal smlouvy z Vistosu pres backend/secrets do read-only preview bez ostrych tras, SMS/e-mailu a automatizaci."
  },
  {
    title: "Trasy svozu: skryti promo Sarloty",
    text: "Bugfix na trase /trasy-svozu vypina samostatnou promo vrstvu Sarloty, aby neprekryvala read-only pilot ani ovladani zalozek."
  },
  {
    title: "Trasy svozu: oprava záložek",
    text: "Bugfix aktivuje záložky modulu Trasy svozu jako skutečné taby bez rozšíření rozsahu pilotu, ostrých tras, SMS/e-mailů nebo automatizací."
  },
  {
    title: "Trasy svozu: Vistos API discovery",
    text: "Fáze 1D doplňuje backendový Vistos API discovery/import preview přes Cloudflare secrets a ukládá jen read-only náhled do pilotních tabulek bez ostrých tras, SMS/e-mailů a automatizací."
  },
  {
    title: "Trasy svozu: ruční import preview",
    text: "Fáze 1C umí přes backend nahrát JSON/CSV, uložit read-only import batch, řádky a datové problémy do pilotních D1 tabulek bez ostrých tras, SMS/e-mailů a automatizací."
  },
  {
    title: "Trasy svozu: Fáze 1A read-only pilot",
    text: "Modul Trasy svozu má bezpečný read-only pilot s Vistos discovery/import preview stavem, pilotními D1 tabulkami, chráněným API a jasným označením bez ostrých tras, SMS/e-mailů a automatizací."
  },
  {
    title: "Sledovani vozidel: WIM vahy v mape",
    text: "T-Cars mapa dostava read-only WIM vrstvu z D1/API, detail pevnych dalnicnich vah a evidovany navrh 15km SMS/app alertu bez ostreho odesilani."
  },
  {
    title: "Branding: firemni barevne schema",
    text: "Nastaveni vzhledu umi automatickou paletu z jedne firemni barvy i rucni doladeni vice barev pro budouci nasazeni aplikace u dalsich firem."
  },
  {
    title: "Datova schranka: cloud API zaklad",
    text: "Modul ma D1 model, chranene read-only API pro status, zpravy a log synchronizaci a UI cte stav z backendu bez ostreho ISDS napojeni."
  },
  {
    title: "Datová schránka: bezpečný pilot",
    text: "Nový modul Datová schránka je přidaný jako UI návrh pro admin/management, jasně ukazuje neaktivní ISDS integraci a připravuje pravidla, audit, API a cloud automatizace bez ostrých dat."
  },
  {
    title: "Pravidla a automatizace: audit cronu",
    text: "Fáze 2A zapisuje každé spuštění cloud runneru do samostatného run-level auditu, takže je vidět dry-run, skipped i chyba bez ostrých e-mailů/SMS."
  },
  {
    title: "Pravidla a automatizace: cloud dry-run",
    text: "Fáze 2A přidává Cloudflare Worker s Cron Triggerem, který zapisuje pouze dry-run běhy automatizací do D1 bez e-mailů, SMS a reálných akcí nad absencemi."
  },
  {
    title: "Dovolená / Nemoc: ostrá cloud pravidla",
    text: "Seznam pravidel a automatizace přechází z read-only návrhů na cloud DB, API, admin editaci a audit log změn."
  },
  {
    title: "Dovolená / Nemoc: kompaktnější tabulka pravidel",
    text: "Read-only pilot pravidel a automatizací má lehčí typografii tabulky, menší písmo a kompaktnější řádky bez změny logiky nebo API."
  },
  {
    title: "Dovolená / Nemoc: read-only vyhledávání pravidel",
    text: "Pilot Seznam pravidel a automatizace má aktivní lokální vyhledávání nad jasně označenými návrhy bez API volání, zápisu nebo editace."
  },
  {
    title: "Dovolená / Nemoc: přímá URL pilotu",
    text: "Záložka Seznam pravidel a automatizace má vlastní produkční routu a přímé otevření přes Cloudflare Pages nepadá na 404."
  },
  {
    title: "Dovolená / Nemoc: pilot pravidel a automatizací",
    text: "Projektová příručka zavádí povinnou záložku Seznam pravidel a automatizace a modul Dovolená / Nemoc má první bezpečný pilot čekající na cloud API."
  },
  {
    title: "Sledování vozidel: spolehlivější klik na T-Cars polohu",
    text: "Výběr markeru i položky seznamu používá úzký pointer handler, aby Google overlay ani layout nepohltily výběr vozidla."
  },
  {
    title: "Sledování vozidel: výběr z T-Cars seznamu",
    text: "Klik na položku v seznamu validních T-Cars poloh okamžitě vybere vozidlo, obnoví detail a zaostří Google mapu."
  },
  {
    title: "Sledování vozidel: čistší T-Cars marker",
    text: "Fallback jednotné ikony už nepřidává do markeru text, takže hlavní popisek zůstává značka/model nebo Vozidlo."
  },
  {
    title: "Sledování vozidel: mapa T-Cars přes celou šířku",
    text: "T-Cars Google mapa je v jednom sloupci nad seznamem, používá jednotný marker vozidla a má přirozené ovládání kolečkem myši."
  },
  {
    title: "Sledování vozidel: neplatné T-Cars polohy mimo mapu",
    text: "Neplatné T-Cars GPS záznamy se vždy zobrazí v samostatné sekci bez aktuální polohy a nepřimíchají se mezi validní Google markery."
  },
  {
    title: "Sledování vozidel: Google mapa T-Cars poloh",
    text: "T-Cars režim odděluje validní GPS polohy od neplatných, validní body zobrazuje nad Google mapou a vozidla bez použitelné polohy drží mimo mapu."
  },
  {
    title: "Sledování vozidel: T-Cars mapa poloh",
    text: "T-Cars režim zobrazuje read-only mapu aktuálních GPS poloh, PNG ikony vozidel, klikací marker a detail vybrané polohy bez zápisu do D1."
  },
  {
    title: "Sledování vozidel: PNG ikony vozidel",
    text: "Mapa vozidel používá dodané PNG ikony pro svozové vozidlo, kontejnerové vozidlo, dodávku, speciální techniku, osobní vozidlo a přívěs/návěs."
  },
  {
    title: "Sledování vozidel: specifikace ikon",
    text: "Modul má připravené mapování PNG/WebP ikon vozidel, CSS fallback marker KS a stavové obrysy pro Google mapu bez generování finálních assetů."
  },
  {
    title: "Vozový park: čitelnější T-Cars seznam",
    text: "Read-only seznam T-Cars vozidel ve Vozovém parku zobrazuje prázdné provozní hodnoty jako pomlčku místo technických hodnot."
  },
  {
    title: "Vozový park: T-Cars seznam read-only",
    text: "Seznam vozidel ve Vozovém parku umí zobrazit všechna vozidla načtená z T-Cars přes chráněné backend API bez zápisu do D1."
  },
  {
    title: "Sledování vozidel: read-only T-Cars SOAP",
    text: "Backend umí přes vlastní Smart odpady API read-only načíst seznam vozidel a aktuální polohy z T-Cars SOAP služby bez ukládání do D1 a bez volání T-Cars z frontendu."
  },
  {
    title: "Sledování vozidel: základ T-Cars režimu",
    text: "Modul rozlišuje demo a T-Cars režim, připravuje vlastní Smart odpady API pro T-Cars a ponechává Android tablet jako vozidlový terminál."
  },
  {
    title: "Sledování vozidel: SVG ikony na mapě",
    text: "Demo mapa používá dodaná SVG vozidla přímo jako mapové ikony v interní fallback mapě i v připraveném Google Maps overlay markeru."
  },
  {
    title: "Sledování vozidel: čitelnější demo mapa",
    text: "Demo mapa už nepřekrývá vozidla velkým hlášením o Google Maps klíči a k demo vozidlům jsou doplněné dodané SVG podklady."
  },
  {
    title: "Sledování vozidel: Google mapa demo",
    text: "Demo modul Sledování vozidel je připravený na Google Maps API key, má 50s smyčku se čtyřmi vozidly, odchylkou KS 204, alertem a bezpečným fallbackem bez bílé obrazovky."
  },
  {
    title: "Sledování vozidel: demo režim",
    text: "Modul Sledování vozidel má jasně označený demo režim s interní mapou, ukázkovými vozidly, pohybem po trasách, filtry, detailem a upozorněním, že nejde o reálná GPS data."
  },
  {
    title: "HP karta Vozový park bez vnitřního tlačítka",
    text: "Homepage karta Vozový park zůstává celá klikací, ale už neobsahuje samostatné tlačítko Otevřít modul."
  },
  {
    title: "Vozový park: oprava záložek",
    text: "Interní záložky Vozového parku mají vlastní handler, přepínají správné panely a nespouštějí úvodní promo video."
  },
  {
    title: "Vozový park: vlastní akce tlačítek",
    text: "Tlačítka ve Vozovém parku mají vlastní mapování akcí, otevírají správnou route nebo zobrazí jasný stav Čeká na API bez spuštění promo videa."
  },
  {
    title: "Sledování vozidel",
    text: "Nový samostatný modul Sledování vozidel připravuje mapový přehled, detail, dnešní trasu a historii jízd pro budoucí cloud GPS API bez lokálního ukládání a bez vymyšlených GPS dat."
  },
  {
    title: "Detail Vozového parku přes Pages Function",
    text: "Produkční detailové odkazy /vozovy-park/:vehicleId mají vlastní Cloudflare Pages Function fallback na aplikaci, aby přímé otevření nevracelo 404."
  },
  {
    title: "Detail Vozového parku bez 404",
    text: "Přímé produkční odkazy na detail vozidla pod /vozovy-park/ se vrací do aplikace přes Cloudflare Pages fallback místo 404."
  },
  {
    title: "Vozový park připravený na API",
    text: "Modul Vozový park má dashboard, seznam, detail vozidla, termíny, závady, servisní historii, dokumenty a číselníky připravené pro chráněné cloud API bez lokálního ukládání provozních dat."
  },
  {
    title: "Vozový park import preview",
    text: "Modul Vozový park má chráněný náhled ručního Vistos exportu s mapováním sloupců a kontrolou duplicit bez automatické synchronizace a bez zápisu do databáze."
  },
  {
    title: "Pneumatiky pod Kaiser Smart",
    text: "Historický mezikrok: evidence Pneumatik byla dočasně otevřená jako samostatná aplikace. Aktuální pracovní verze je přímo v KCC přes chráněné API a D1."
  },
  {
    title: "PDF žádost o zdravotní způsobilost",
    text: "Karta zaměstnance má chráněnou tiskovou šablonu žádosti o posouzení zdravotní způsobilosti k práci s údaji zaměstnance, kategorií prohlídky a auditovaným exportem."
  },
  {
    title: "Lékařské prohlídky v kartě zaměstnance",
    text: "Karta zaměstnance má chráněnou evidenci pracovnělékařských prohlídek, výpočet dalšího termínu a backendové upozornění na blížící se nebo prošlé prohlídky."
  },
  {
    title: "Co je nového e-mailem",
    text: "Backend umí po zápisu novinky poslat stejný text druhé straně přes schválený Opluštil e-mail a zapsat výsledek do Notifikací."
  },
  {
    title: "Šarlota vždy posílá úvodní proměnnou",
    text: "ElevenLabs session má vždy vyplněné intro_announcement, takže WebSocket nespadne na chybějící required dynamic variable."
  },
  {
    title: "Šarlota rozlišuje nepovolený mikrofon",
    text: "Hlasový panel už při blokovaném mikrofonu neukazuje odpojený ElevenLabs agent, ale jasný stav Mikrofon není povolený."
  },
  {
    title: "Čitelnější chyba mikrofonu Šarloty",
    text: "Hlasový panel Šarloty má kompaktnější nápovědu při odpojeném mikrofonu a ukáže bezpečný důvod zavření hlasového spojení."
  },
  {
    title: "Promo video Šarloty nahlas",
    text: "Promo video Šarloty se po každém načtení pokusí odtlumit a nastavit hlasitost přehrávání na maximum bez lokálního ukládání."
  },
  {
    title: "Stabilnější okno Šarloty",
    text: "Promo okno Šarloty už nepřekrývá běžné welcome okno, video není po načtení vynuceně ztlumené a hlasový panel ukazuje jasnější návod při přerušeném spojení."
  },
  {
    title: "Promo Šarloty s fallbackem",
    text: "Pokud prohlížeč nebo síť zablokuje ověření promo API, přihlášenému uživateli se video Šarloty do 30. 6. 2026 zobrazí i tak."
  },
  {
    title: "Spolehlivější promo Šarloty",
    text: "Promo modal Šarloty používá novou neblokovanou API cestu, aby se video zobrazilo i tam, kde klient blokuje původní /api/ai/promo volání."
  },
  {
    title: "Promo Šarloty bez denního blokování",
    text: "Promo modal Šarloty se do 30. 6. 2026 zobrazí podle aktivního období a jeho zobrazení už nezávisí na zápisu denní akce shown."
  },
  {
    title: "Promo Šarloty do konce června",
    text: "Promo video Šarloty se do 30. 6. 2026 už neblokuje denním zobrazením; volby se dál zapisují jen přes cloudový audit."
  },
  {
    title: "Přirozenější pozdrav Šarloty",
    text: "Šarlota používá přesnější denní pozdrav podle času v Praze, takže dopoledne už neříká Dobré ráno a drží kratší tykací úvod."
  },
  {
    title: "Nová připomínka ve správě",
    text: "Admin a management mohou v modulu Připomínky založit novou připomínku přes samostatné cloud API bez změny běžného odesílání připomínek z modulů."
  },
  {
    title: "Hotovo připomínky e-mailem",
    text: "Při přepnutí připomínky na Hotovo odešle backend autorovi e-mail se stručnou zprávou, co bylo vyřešeno, a zapíše výsledek do Notifikací."
  },
  {
    title: "Lékař v hodinách",
    text: "Modul Dovolená / Nemoc umí u typu Lékař zadat datum, čas od/do a zobrazit přesný hodinový rozsah bez změny ostatních typů absencí."
  },
  {
    title: "Oprava startu mikrofonu Šarloty",
    text: "Hlasový režim už nezůstane viset na Připojuji, pokud prohlížeč nevrátí oprávnění mikrofonu nebo přípravu zvuku včas."
  },
  {
    title: "Denní promo video Šarloty",
    text: "Aplikace umí do 30. 6. 2026 zobrazit přihlášenému uživateli video Šarloty s volbou rovnou spustit hlasový režim."
  },
  {
    title: "Osobní uvítání Šarloty",
    text: "ElevenLabs session dostává křestní jméno a bezpečný pozdrav podle denní doby, aby Šarlota mohla začít hovor osobně."
  },
  {
    title: "Šarlota zná přihlášeného uživatele",
    text: "ElevenLabs session dostává bezpečný kontext aktuálního přihlášeného uživatele, jeho role, dostupných modulů a oprávnění bez citlivých údajů."
  },
  {
    title: "Šarlota pro zaměstnance",
    text: "AI asistentka Šarlota má read-only nástroje pro vyhledání zaměstnance, otevření karty, zjištění nadřízeného a souhrn role nebo oprávnění přes bezpečné cloud API."
  },
  {
    title: "Displej během hovoru se Šarlotou",
    text: "Hlasový režim Šarloty během aktivního hovoru používá Screen Wake Lock, pokud ho prohlížeč podporuje, a bezpečně ho uvolní po ukončení."
  },
  {
    title: "Nový mikrofon Šarloty",
    text: "Hlasový panel používá dodaný PNG mikrofon v app-like stylu, jemnější stavové animace a bezpečnou haptickou odezvu tam, kde ji prohlížeč podporuje."
  },
  {
    title: "Šarlota drží hovor při navigaci",
    text: "Hlasová relace Šarloty se při otevření modulu přes AI už neukončí a zůstane viditelná v persistentním stavovém docku."
  },
  {
    title: "Mobilní Šarlota jako appka",
    text: "Hlasový panel Šarloty má mobil-first rozložení, jasné stavy mikrofonu, obnovu odpojeného spojení a bezpečně nastavené mikrofonní audio."
  },
  {
    title: "Stabilnější hlas Šarloty",
    text: "Hlasový režim drží ElevenLabs session otevřenou po odpovědi, jasně ukazuje stav mikrofonu a používá maximální zesílení výstupu s limiterem."
  },
  {
    title: "Hlasitější Šarlota",
    text: "Přehrávání ElevenLabs hlasu Šarloty má zesílený mobilní výstup, aby odpověď nebyla na telefonu příliš potichu."
  },
  {
    title: "Mobilní zvuk Šarloty",
    text: "Hlasový režim Šarloty odemyká mobilní audio a přehrává ElevenLabs zvukovou odpověď z WebSocket audio streamu."
  },
  {
    title: "Nové ElevenLabs spojení pro Šarlotu",
    text: "Textový režim Šarloty nově zavírá starou session a používá čisté ElevenLabs Chat Mode spojení se čtením běžných i streamovaných odpovědí."
  },
  {
    title: "Šarlota textem bez mikrofonu",
    text: "AI asistentka Šarlota má textový diagnostický režim přes ElevenLabs Chat Mode, aby šla ověřit bez mikrofonního oprávnění."
  },
  {
    title: "Šarlota v prémiovém hlasovém režimu",
    text: "Hlasová Smart asistentka Šarlota má jednotnou mobilní obrazovku bez Marka, s novým mikrofonem, jemnější typografií a app-like rozložením pro iPhone."
  },
  {
    title: "Responzivita Smart pomocníka",
    text: "Hlasový panel Šarloty má mobilní zobrazení přes celou obrazovku, vlastní scroll, kompaktnější prvky a stabilnější překreslování bez problikávání."
  },
  {
    title: "AI Smart pomocník",
    text: "Připravená fáze 1 pro ElevenLabs asistentku Šarlotu: bezpečné client tools a cloudové AI API endpointy."
  },
  {
    title: "Reporty a moduly",
    text: "Notifikace zobrazují v tabulce krátký souhrn jen u neodeslaných zpráv a modulové štítky jsou sjednocené na Nový, Rozpracováno a Hotovo."
  },
  {
    title: "Smart pomocník",
    text: "Uvítací okno pomocníka zůstává dostupné, ale při dočtení dat v modulech už znovu nespouští vstupní animaci."
  },
  {
    title: "Dovolená / Nemoc zdroj dat",
    text: "Seed data byla odstraněná z modulu Dovolená / Nemoc, nastavení reportu se ukládá přes cloud API a hluboké routy jsou připravené v buildu."
  },
  {
    title: "Notifikace v Reportech",
    text: "Zápisy v tabulce notifikací mají jemnější netučné písmo pro klidnější čtení."
  },
  {
    title: "Nová žádost Dovolená / Nemoc",
    text: "Výběr zaměstnance v nové žádosti používá úplný cloudový seznam zaměstnanců."
  },
  {
    title: "SMS notifikace",
    text: "Produkční SMS notifikace jsou napojené na Twilio Messaging Service se SMS číslem pro provozní zprávy."
  },
  {
    title: "Centrální notifikace",
    text: "Modul Reporty má centrální přehled e-mailů a SMS napříč aplikací se souhrnem, filtry, detailem a exportem CSV."
  },
  {
    title: "Schvalování Dovolená / Nemoc",
    text: "Hláška u e-mailu a SMS nově rozlišuje chybějící kontakt příjemce od chybějící produkční konfigurace odesílání."
  },
  {
    title: "Schvalování Dovolená / Nemoc",
    text: "Chybová hláška u SMS/e-mailu nově ukáže konkrétního příjemce, kterému chybí telefon nebo e-mail."
  },
  {
    title: "Hlasový pomocník",
    text: "Po klepnutí na mikrofon se spustí ukázková 30s česká zvuková komunikace AI a uživatele Kaiser smart s animovaným obrázkem."
  },
  {
    title: "Schvalování Dovolená / Nemoc",
    text: "Žádosti mají cloudový schvalovací workflow, historii, e-mail nadřízenému, SMS zaměstnanci a logování notifikací."
  },
  {
    title: "Hlasový pomocník",
    text: "Hlasový panel používá nový PNG mikrofon a jemnější texty Hlasový pomocník a Zažij hlasovou interakci."
  },
  {
    title: "Smart pomocník",
    text: "Hlasový režim má nový referenční bílý panel s velkým zeleným mikrofonem bez textového inputu."
  },
  {
    title: "E-mailové šablony",
    text: "Projekt má základní HTML šablonu Smart odpady / Kaiser a konkrétní šablonu pro ověřovací kód."
  },
  {
    title: "Smart pomocník",
    text: "Mobilní hlasový pomocník má nový čistý fullscreen vzhled, kompaktní hlavičku, výrazný mikrofon a texty v tykání."
  },
  {
    title: "Dovolená / Nemoc",
    text: "Navigace z Rychlého zadání nově otevírá skutečné podstránky modulu a nezůstává zamrzlá na rychlém zadání."
  },
  {
    title: "Smart pomocník",
    text: "Vstupní okno, textový chat a hlasový režim mají nový prémiový vzhled bez napojení na externí AI API."
  },
  {
    title: "Rychlé zadání",
    text: "Klik na HP box Rychlé zadání otevře formulář přímo u otázky Co potřebujete nahlásit."
  },
  {
    title: "Smart pomocník",
    text: "Aplikace má první testovací UI pomocníka s textovým chatem, hlasovým ovládáním přes prohlížeč a bez ukládání konverzace."
  },
  {
    title: "Rychlé zadání na HP",
    text: "Na hlavní stránce je nový první box Rychlé zadání pro dovolenou, nemoc nebo lékaře přímo z mobilu."
  },
  {
    title: "Připomínky",
    text: "Modul Připomínky má kompaktní karty, přehledné filtry a ukládání stavu i interní poznámky přes cloud API."
  },
  {
    title: "Schvalování dovolené",
    text: "Box Žádosti čekající na schválení je na dashboardu Dovolená / Nemoc zobrazený přes celou šířku."
  },
  {
    title: "Vyhledávání uživatelů",
    text: "Přehled uživatelů má jednoduché vyhledávání podle jména, kontaktu, role, stavu a nadřízeného."
  },
  {
    title: "Rychlé zadání",
    text: "Dovolená / Nemoc má jednoduchý mobilní režim pro vlastní žádost přes cloudové API."
  },
  {
    title: "Neuložené změny",
    text: "Karta zaměstnance už upozorní jen při skutečné změně hodnot a po chybě API nechá rozpracovaná data ve formuláři."
  },
  {
    title: "Upload dokumentů",
    text: "Karta zaměstnance umí nahrávat a stahovat dokumenty přes cloudové API, D1 metadata a Cloudflare R2 úložiště."
  },
  {
    title: "Karta zaměstnance",
    text: "V modulu Dovolená / Nemoc je přidaná zaměstnanecká karta s údaji, dovolenou, absencemi, nadřízeným, historií a dokumenty přes cloud API."
  },
  {
    title: "Vzhled jen pro moduly",
    text: "Nastavení vzhledu je oddělené od HP a mění pouze vnitřní modulové obrazovky."
  },
  {
    title: "Nadřízený u uživatelů",
    text: "Správa uživatelů má nový sloupec Nadřízený s okamžitým ukládáním přes cloud API."
  },
  {
    title: "Ochrana neuložených změn",
    text: "Správa uživatelů upozorní při odchodu z rozpracovaných změn a ukládá jen přes cloud API."
  },
  {
    title: "Uživatelé přes D1",
    text: "Správa uživatelů je připravená na ukládání přes Cloudflare D1 a serverové API."
  },
  {
    title: "Nový název aplikace",
    text: "Aplikace je sjednocená pod názvem Smart odpady."
  },
  {
    title: "Provozní přehled",
    text: "Na HP je přidaný kompaktní přehled verze, zálohy, branche a commitu."
  },
  {
    title: "Přihlášení a role",
    text: "Připravené passwordless přihlášení, role a seznam povolených uživatelů."
  },
  {
    title: "Pneumatiky",
    text: "Historická informace: samostatná externí aplikace byla nahrazena plnohodnotným modulem v KCC."
  }
];

export function versionStatusText(status) {
  return status === "stable" ? "Stabilní build" : "Vývojová verze";
}

export function versionStatusBadge(status) {
  return status === "stable" ? "STABILNÍ" : "VÝVOJ";
}
