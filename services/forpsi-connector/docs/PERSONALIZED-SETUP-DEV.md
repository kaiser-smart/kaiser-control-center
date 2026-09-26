# Personalizovaný průvodce — vývojový důkaz k PR #209

Stav 26. 9. 2026. Vše níže běželo proti syntetickým zprávám a SQLite v paměti. Žádná skutečná schránka, produkční databáze, SO.ai ani ChatGPT nebyly změněny. Testy používají **předem připravené odpovědi modelového adaptéru**; skutečné volání modelu se neprovedlo, protože vývojové prostředí nemá nastavený klíč ani zvolený model. To neprokazuje, že model bude skutečným e-mailům rozumět.

## Průchod A — obchodní schránka

Historie: klient `buyer@example.net` žádá rozhodnutí v „Zakázka“, stejný odesílatel poslal „Nanolab tipy #18“. Dvě novější vlastní odeslané zprávy mají opakovaný podpis `S pozdravem / Alice Nová / Kaiser servis` a oslovení `Dobrý den`. Autor podpisu ve sdílené schránce nebyl automaticky ověřen. Modelový test vrací citaci `Prosím o` k požadavku; závěr je návrh ke kontrole, ne potvrzená skutečnost.

Průvodce navrhl doložený oboustranný kontakt a otázky podle dostupné historie. Na otázku o kontaktech přišla vlastní souhrnná odpověď: „Důležité kontakty buyer@example.net a director@example.net. Načítej poštu každých 15 minut, upozornění jen od 7 do 16, v pátek do 12.“ Z jedné odpovědi se uložily dva kontakty, interval načítání a časové přání. Protože nebyly určeny dny upozornění, průvodce se doptal; odpověď byla `Po–Pá`. Otázku na načítání už neopakoval. U podpisu uživatel výslovně vybral doložený návrh; u zprávy „Nanolab tipy #18“ výslovně schválil **sérii pro přesnou adresu odesílatele a stabilní předmětový kmen**, nikoli celou doménu. Závěrečná kontrola zůstala pouze čtecí.

Před schválením byl dostupný celý návrh, zdroje a prostý ukázkový e-mail. Finální schválení přes simulovanou serverovou cestu vázanou na SO.ai identitu a přesnou verzi uložilo osobní profil. Nová instance průvodce načetla verzi 1, plný podpis `S pozdravem\nAlice Nová\nKaiser servis` a krátký podpis `S pozdravem\nAlice Nová`. Z historii byl doložen i návrh oslovení `Dobrý den`; písmo nebylo z textové historie zjistitelné.

Na **jiných, při nastavování nehodnocených** zprávách: „Nanolab tipy #19“ zůstaly běžné díky schválené sérii, „Faktura za službu“ od téhož partnera byla prioritní, „Nová důležitá poptávka“ od neznámého odesílatele a „Rozhodnutí v kopii“ byly s modelovým návrhem prioritní, novější „Re: Původní požadavek“ s citovaným `Vyřešeno` byla běžná, „Velká akce pro firmy“ byla modelovým návrhem označena jako marketing. Všechny modelové závěry jsou označené jako návrhy s citací, nikoli automatické zásahy do pošty.

Bez modelových odpovědí jsou konkrétní chyby: „Nová důležitá poptávka“ a „Rozhodnutí v kopii“ zůstávají pouze ke kontrole (**přehlédnutá vysoká priorita**), zatímco „Velká akce pro firmy“ od důležitého kontaktu je nesprávně vysoko (**falešná priorita**).

## Průchod B — servisní schránka

Odlišná historie: klient `dispatch@example.net` píše „Zakázka“ a „Servisní novinky #4“. Dvě novější vlastní odpovědi obsahují podpis `S pozdravem / Alice Servis / Kaiser servis` a oslovení `Dobrý den`. Vlastní odpověď v průvodci: „Prioritní kontakt dispatch@example.net. Načítej poštu každých 30 minut. Pracuji Po–Pá 8–17, v pátek do 13.“ Návrh oddělil kontakt, odlišný interval a pracovní dobu s páteční výjimkou. Nenabízel odhad pracovní doby z času odesílání. Uživatel potvrdil doložený podpis a zvlášť schválil sérii „Servisní novinky“ pro konkrétního odesílatele. Návrh a otázky zůstaly pod 20 otázkami včetně vstupního souhlasu a schválení.

Schválená verze 1 se načetla v nové instanci průvodce. Plný podpis: `S pozdravem\nAlice Servis\nKaiser servis`. Krátký podpis: `S pozdravem\nAlice Servis`. Oslovení: `Dobrý den`, z textové historie; písmo a logo nejsou doložené. Následující vydání „Servisní novinky #5“ zůstalo běžné, zatímco faktura od stejného partnera zůstala prioritní. Další čtyři holdout případy měly stejný výsledek a stejná omezení jako v průchodu A. Bez obsahového modelu se znovu projevily dvě přehlédnuté priority a marketing příliš vysoko.

## Rozsah, zapnutí a návrat

- Prioritní seznam zobrazuje nejvýše 20 položek, prohledává nejvýše 200 nejnovějších kandidátů. Skutečně prohledaný počet a příznak starší neprohledané pošty se ukládají se seznamem. Test se 66 zprávami našel prioritní zprávu za prvními 50. Test s 206 zprávami správně ohlásil 200 prohledaných a **konkrétní přehlédnutou** „Neprohledaná důležitá zpráva“ za hranicí; nelze ji označit za nedůležitou.
- Obsahový model, pokud je nakonfigurován, dostane jen omezený vzorek nejvýše 12 zpráv při onboardingu a 24 zpráv při prioritním přehledu. Návrhy se přijímají pouze s existující zdrojovou zprávou a přesnou citací z nově napsané části. Zprávy mimo tento obsahový vzorek nemají sémantickou klasifikaci; jejich pokrytí je uvedeno odděleně od metadatového hledání.
- Serverový cron po explicitním schválení profilu respektuje osobní interval 15–240 minut po krocích 15 minut, individuální granty a zámek běhu. Syntetický test ověřil 30 minut: první běh ano, po 15 minutách ne, po 30 minutách ano, bez otevřeného chatu. Ve vývojové konfiguraci jsou přepínače vypnuté. Přepočet priorit je na vyžádání a upozornění do ChatGPT nejsou implementována ani zapnuta. Uložené přání není vydáváno za aktivní službu.
- Schválení profilu přes modelový MCP nástroj odmítne i `confirmed=true`. Samostatný test syntetické cesty SO.ai session → Pages API → Worker → SQL prokázal vazbu na přihlášenou identitu a přesnou verzi. Stejný argument z jiného původu, s podvrženým `actorId` nebo nesprávnou verzí neprošel. Skutečné kliknutí a vzhled v ChatGPT nebyly ověřeny. Stránka SO.ai je pouze ve vývojové větvi.
- Migrace `0007_personalized_setup.sql` přidává čtyři sloupce k osobním seznamům, jeden ke zprávám v seznamu a tabulku synchronizačních kurzorů. Před jakýmkoli použitím na trvalé D1: obnovitelný export databáze, zkušební import do izolované vývojové kopie, migrace 0005→0006→0007, kontrola starých řádků a funkční testy. Bezpečný návrat dat je obnova tohoto exportu; produkční D1 se zde nemigrovala. Kód lze vrátit na commit před touto etapou a vypnuté příznaky zabrání plánovaným běhům. Záloha Git stavu je mimo repozitář v `backups/forpsi-workflows-before-20260926`; samostatná záloha této etapy je uvedena v závěrečné zprávě.

## Stále neověřeno nebo nedokončeno

Skutečné volání modelu a kvalita interpretace reálných e-mailů; vizuální průchod v ChatGPT; identita ChatGPT uživatele vůči SO.ai a přístup na schvalovací stránku; zapnutí plánovače v jakémkoli nasazeném prostředí; upozornění do ChatGPT; úplné sémantické pokrytí více než 24 zpráv; spolehlivé rozpoznání všech newsletterových sérií z předmětu; podoba HTML v cílových e-mailových klientech. Tyto body blokují tvrzení, že personalizované nastavení je připravené do produkce.

Lokální ověření při této etapě: 118/118 testů konektoru a 19/19 cílených testů SO.ai, kontrola syntaxe 679 JS/MJS souborů, sestavení 49 rout a `wrangler deploy --dry-run`. Přepínače `CONNECTOR_ENABLED` a `WORKFLOW_SYNC_ENABLED` jsou v balíčku stále `false`; příkaz nic nenasadil.
