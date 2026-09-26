# Forpsi pracovní pošta — vývojová etapa 0.3.0-dev.1

Tato etapa mění pouze vývojovou větev. Produkční Worker, SO.ai, D1, pošta a napojení ChatGPT se neměnily. Testy používají SQLite v paměti a simulovaného poskytovatele. Nové MCP nástroje jsou součástí stávajícího `/mcp`; nevzniká druhý konektor.

## Co funguje

- `start_worklist` uloží na serveru až 20 pevných čísel a přesných referencí `folder + UID + UIDVALIDITY`. Nová zpráva význam čísla nezmění. Režim `priority` posoudí nejvýše 50 posledních kandidátů, ukáže schválený důležitý kontakt a ostatní ponechá ke kontrole; neslibuje úplné pokrytí starší pošty.
- `process_worklist_command` rozloží číslovaný český povel na nezávislé výsledky. Hotovo, Čekám a Odloženo jsou osobní stavy v D1; nepřepisují IMAP příznak přečtení, složku ani zprávu. Termín je konkrétní datum v uloženém pásmu. Přeposlání ukládá jen šifrovaný, neodeslatelný návrh; nerozpoznaný alias vyžaduje upřesnění.
- `review_worklist` ukládá pozici. Další jen přejde na další zprávu; odpověď připraví šifrovaný návrh. `resume_worklist`, `preview_workflow_draft` a `update_workflow_draft` fungují po novém chatu a restartu. Úprava návrhu zvýší revizi a ruší případné budoucí potvrzení.
- `refresh_workflow_states` znovu otevře osobní Hotovo/Čekám/Odloženo až při doložené nové příchozí odpovědi ve stejném vlákně. Stejný Message-ID, starší odpověď a odpověď z adresy schránky stav neobnoví. Prioritní seznam rozpozná novou odpověď také při prvním otevření. Staré číslo zůstává navázané na původní zprávu, ukáže odkaz na novou odpověď, ale nemůže ji omylem označit Hotovo. Dev-only cron handler umí čtení provést bez otevřeného chatu; v konfiguraci je přepínač vypnutý. Produkční cron zůstává prázdný.
- Zkratky se ukládají odděleně podle firmy, uživatele a schránky. Návrh není aktivní; schválení vyžaduje přesnou verzi. Úprava zkratku zase vypne. Faktura vyžaduje potvrzení konkrétního PDF kandidáta: konektor ověřuje formát z bajtů, ale význam dokumentu nedokáže spolehlivě potvrdit z názvu. Vybranou přílohu eviduje jako index a otisk v šifrovaném návrhu; nic neodesílá.
- MCP Apps karta `ui://forpsi/worklist-v1.html` zobrazuje přehled a seznam–detail. Je pouze pro čtení a při otevření řádku volá stávající `read_message`. Data se získávají samostatnými nástroji a `render_worklist` jen vykresluje. `get_worklist` je textová alternativa. Lokální protokolový test ověřuje zveřejnění HTML zdroje a syntetický průchod `start_worklist → render_worklist → read_message` bez zápisu do pošty.
- Vstupní proces `begin_mail_setup` vyžaduje zvolený rozsah a souhlas, dovoluje odložení bez čtení historie. Bounded metadata vzorek pokrývá tři časová okna až za 90 dní a zaznamená skutečné pokrytí. Návrh profilu, pozorování, odpovědi a schválené verze jsou uložené odděleně. Otázky nepřekročí 20 včetně rozsahu a finálního schválení. Schválený textový podpis je osobní pro odesílací schránku, má plnou/krátkou podobu a bezpečný jednoduchý HTML náhled; vkládá se jednou do nové části návrhu.
- Praktická kontrola nyní ukáže až čtyři různé doložené zprávy z povoleného vzorku. Jednorázové označení priority, schválený důležitý odesílatel nebo úzké pravidlo newsletteru (přesná adresa a přesný předmět) se zapíše do **návrhu** profilu. Teprve finální schválení verze změní následný prioritní přehled. Newsletter zůstává dostupný v poště; nikam se nepřesouvá.
- Odvozená pozorování mají životnost 30 dní a plánovaný handler je poté odstraní spolu s rozpracovanou relací. `delete_derived_mail_profile` na výslovné potvrzení odstraní osobní odvozený profil a jeho podklady dříve; e-maily ani ručně schválený podpis nemaže.
- Původní přímé MCP `send_message` a `schedule_message` v této vývojové větvi vracejí `SEND_CONFIRMATION_REQUIRED`. Pro nové návrhy zatím neexistuje odesílací krok. Odesílání nelze vyvolat z karty ani krátkým povelem.

## Omezení, která nesmí být skryta

- MCP/OAuth pro ChatGPT není živě připojený; kartu jsme zatím ověřili protokolově a syntetickými daty, ne v účtu ChatGPT.
- Priorita zatím používá uživatelem schválený kontakt, výslovné opravy jednotlivých zpráv, úzké označení newsletteru a přímé adresování. Nevyvozuje požadavek, termín ani důsledky z textu bez ověření. Neznámý odesílatel zůstane v přehledu ke kontrole. Starší část mimo 50 kandidátů je označená jako neprohledaná.
- Úvodní analýza ukládá metadata v omezeném vzorku; neprovádí hlubokou analýzu vláken, newsletterů ani odeslaných podpisů. Proto nenavrhuje podepsaný kontaktní údaj nebo automatická newsletterová pravidla. Chybějící odeslaná pošta se projeví vynecháním otázky na oboustranné kontakty.
- Poznání vláken závisí na skutečném `Message-ID` / `References` / `In-Reply-To`. Neúplná hlavička může vyžadovat ruční kontrolu. Obnova nové odpovědi zkoumá nejvýše 50 posledních zpráv v INBOX a vrací údaj o neúplném pokrytí.
- PDF obsah faktury není strojově sémanticky ověřený. Při jednom i více PDF se před přípravou faktury žádá potvrzení konkrétního dokumentu. Současný outbox nepodporuje odeslání příloh, takže návrh zůstává neodeslatelný.
- Obecné ruční výběry příloh a volná aplikace uživatelského textového stylu u zkratek nejsou hotové. Zkratky přijímají jen podporované pravidlo PDF faktury nebo žádné přílohy; nemají tichou výjimku, která by připojila jiné soubory.
- Podpisový HTML náhled je jednoduché vykreslení textu, nikoli pixelově věrný náhled skutečného e-mailového klienta. Logo se nevkládá. Zkratka nikdy nepovoluje automatické odesílání.
- Schválení profilu, zkratky a podpisu je zatím vyjádřené přesnými argumenty nástroje a auditovanou uživatelskou identitou; pro ostrý provoz je potřeba dokončit samostatné uživatelské potvrzení v hostitelském rozhraní. Proto tato etapa zůstává vývojová.
- Pravidelné přepočítávání priorit, upozornění do ChatGPT, úplné zpracování celé historie, pozdější úpravy schváleného profilu a schvalovací odesílací tok jsou navazující etapy. Výchozí profil nastavuje ruční načítání, žádná upozornění, žádné automatické přesuny a žádné automatické odeslání.

## Dva syntetické průchody

1. Schránka s příchozí zprávou a odpovědí v Odeslaných: metadata vytvoří kandidáta na oboustranný kontakt. První otázka se ptá přímo na doloženou adresu. Až po odpovědích a finálním schválení vznikne aktivní osobní profil.
2. Schránka bez Odeslaných: žádný oboustranný kontakt se nevymýšlí a otázka na něj se přeskočí. První otázka řeší doložený rozdíl mezi přímým adresátem a kopií. Obě varianty používají stejný limit 20 otázek a stejné oddělení firemních identit.

## Lokální ověření

Vývojová sada `node --test test/*.test.mjs` prošla se 109/109 testy. Obsahuje pevné číslování, složený povel, návrhy bez odeslání, nový chat a restart, osobní oddělení, novou odpověď i při opakovaném synchronizačním běhu, výběr PDF podle obsahu, průvodce s odlišnými syntetickými historiemi, praktické opravy priority a protokolový test MCP Apps. `wrangler deploy --dry-run` vytvořil balíček s `CONNECTOR_ENABLED=false` a `WORKFLOW_SYNC_ENABLED=false`; příkaz nic nenahrál. Vizuální vykreslení v účtu ChatGPT a chování se skutečnou schránkou ověřené nejsou.

## Migrace a návrat

`0005_workflow.sql` a `0006_onboarding.sql` vytvářejí jen nové tabulky/indexy; nemění existující tabulky, hesla ani obsah schránky. Před jakoukoli budoucí aplikací do trvalé D1 je nutné vytvořit její obnovitelný export a zkušební import do jiné dev databáze, aplikovat migrace 0005 a 0006 v pořadí a ověřit testy i počet původních řádků. Produkční migrace a nasazení vyžadují samostatné schválení.

Kód se vrátí přepnutím na předchozí commit `cb68183`. Nové tabulky mohou zůstat bez používání. Chceme-li je v **kopii vývojové databáze** odstranit, nejdřív exportovat jejich data a pak odstraňovat v opačném pořadí: `workflow_signatures`, `workflow_profile_versions`, `workflow_proposals`, `workflow_observations`, `workflow_onboarding`, `workflow_shortcuts`, `workflow_drafts`, `workflow_states`, `workflow_list_items`, `workflow_lists`. Produkční tabulky ani poštu tento postup automaticky nemaže.

Lokální záloha před změnami je mimo Git v `backups/forpsi-workflows-before-20260926` v nadřazené pracovní složce: ověřené Git bundles všech tří checkoutů, prázdné patche čistých sledovaných souborů a archiv dvou nesledovaných souborů hlavní kopie. Práva souborů jsou 600. V záloze není export živé D1 ani obsah schránky; těch jsme se v této etapě nedotkli.

## Vývojové povely pro budoucí připojení

Po připojení této vývojové verze k testovací OAuth identitě a syntetické schránce: „Ukaž moje schránky“, „Začni čtecí prioritní seznam“, „Ukaž přehled seznam–detail“, „1 vyřízeno. 2 přepošli účetní. 3 odlož na pondělí“, „Projdeme poštu“, „Další“, „Připrav odpověď“, „Pokračuj, kde jsme skončili“, „Ukaž moje zkratky“, „Pokračuj v nastavení“, „Ukaž můj podpis“. Přímé odeslání není v této verzi dostupné.
