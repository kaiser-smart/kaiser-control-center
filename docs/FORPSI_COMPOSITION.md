# Podpisy a nové koncepty SO.ai — etapa 3a

Stav 26. 9. 2026: implementace a izolované ověření pro SO.ai 0.1.812 / Worker 0.2.7. **Nenasazeno.** Produkční hranice se tímto dokumentem ani PR nemění. První rozsah má jeden společný textový podpis pro každou schránku a jméno odesílatele. Alternativní adresy, Reply-To, HTML, přílohy, odpovědi/přeposlání, editace existujících konceptů a odesílání nejsou součástí této etapy.

## Zdroj pravdy a ovládání

- `Nastavení → Forpsi → Schránky → Podpis a odesílatel` používá stávající přihlášení a aktuální `settings:manage`. Správa podpisu sama nezpřístupní obsah pošty.
- Nová `composition_profiles` v samostatné Forpsi D1 ukládá jméno, prostý text podpisu, revizi, autora a čas. Audit neobsahuje text podpisu. Optimistická revize brání přepsání jiné změny. Uložení nepozastavuje schránku ani nemění připojení či heslo.
- Podpis je vlastní nastavení SO.ai. Nemění podpisy ve webmailu Forpsi. Adresa From je vždy serverem načtená adresa schránky; libovolný From nebo alias v požadavku se odmítne.
- `Pošta → vybraná schránka → Nový koncept` načte profil a práva. Uživatel vyplní Komu, volitelně kopie/skryté kopie, předmět a text. Náhled používá stejný oddělovač podpisu jako server. Podpis lze pro konkrétní koncept vynechat.
- První verze vyžaduje aspoň jednoho platného příjemce a neprázdný text, celkem nejvýše 50 adres. Text včetně podpisu má limit 100 000 znaků, podpis 4 000, jméno 100. UI rezervuje v textu místo pro podpis; API hlídá také bajtový limit.
- Uložení vytvoří jeden nový MIME koncept pomocí IMAP APPEND do explicitně zvolené či jednoznačně označené existující složky Koncepty. Bcc zůstává v konceptu. Nepoužije SMTP ani outbox a nepřejmenuje či nesmaže zprávy.
- Rozepsaný text je jen v paměti formuláře až do ručního uložení ve Forpsi. Není v localStorage, cache ani D1. Odchod chrání dialog SO.ai včetně „Uložit a odejít“. Při chybě uložení zůstává formulář otevřený. Odebrání přístupu odstraní obsah z obrazovky; nejde o autosave.

## API a bezpečnostní hranice

- `/api/forpsi/admin`: `composition_get {id}`, `composition_save {id,revision,senderName,signatureText}`. Aktuální firemní adresář musí potvrdit správce; výpadek zdroje se nesmí nahradit výchozím administrátorem.
- `/api/forpsi/mail`: `composition_context {mailboxId}` a `create_draft {mailboxId,requestId,profileRevision,useSignature,message}`. Identitu odvozuje pouze session, nikoli argumenty klienta. Vyžaduje vlastní origin a JSON.
- Soukromý Worker zachovává autentizaci, aktivní tenant/identitu/schránku. Koncept vyžaduje **read i write**, nikoli send. `SOAI_MAIL_ENABLED=true` a nový **`SOAI_DRAFTS_ENABLED=true`** jsou nutné současně. Nový přepínač je v obou konfiguracích **false**.
- Stávající `write` je širší grant „Úpravy“, používaný také jinými adaptéry. Tato SO.ai cesta zpřístupňuje jen nový koncept. Samostatné jemné právo pouze ke konceptům se nezavádí. MCP zůstává vypnuté.
- Změna revize podpisu vyžádá jeho nové načtení a kontrolu náhledu; text ve formuláři zůstane zachovaný.
- Nová `draft_attempts` ukládá pouze vazbu na uživatele/schránku, náhodné ID pokusu, otisk vstupu, stav, čas a výsledný odkaz na koncept. Neukládá adresáty, předmět ani tělo. Otisk zahrnuje náhodné ID pokusu.
- Rezervace vznikne před voláním poskytovatele. Stejný pokus po potvrzeném úspěchu vrací uložený výsledek; změněný obsah pod stejným ID se odmítne. Souběžný nebo nejistý pokus se poskytovateli nepředá znovu. Timeout klienta zachová zmrazený obsah a stejné ID pro ověření/dokončení.
- Při nejistém výsledku uživatel zkontroluje Koncepty ve Forpsi. Automatická rekonciliace podle Message-ID ani odstranění duplicit není implementované. Přesně jednou nelze garantovat mezi D1 a IMAP; řešení zajistí nejvýše jedno volání poskytovatele pro zachovaný klíč pokusu.
- Práva se znovu ověří bezprostředně před předáním a před vrácením obsahu. Revokace nedokáže odvolat již běžící APPEND. Nejistý výsledek nesmí vést k automatickému opakování.
- SMTP, send/delete/schedule granty, cron, secrets, ostatní bindingy, CalDAV a CardDAV se nemění. HTML v podpisu se nespouští, hlavičky odmítají řídicí znaky. Výchozí MIME nástroj MCP se tímto nepřepíná na nové podpisy SO.ai.

## Izolované ověření

Testy používají skutečné SQL migrace, Pages API, session/permission kontroly a Worker nad SQLite v paměti; poskytovatel je simulovaný. MIME test používá skutečný Nodemailer a parser; IMAP je simulovaný a SMTP nesmí být voláno.

Pokryto: uložení/načtení profilu, tenantová izolace, souběh editace, správce vs čtenář, odmítnutí From a hlavičkové injekce, limity, Unicode, Bcc, vynechání podpisu, zastaralá revize, vypnutá funkce, chybějící/odvolané granty, souběžný pokus, nejistý APPEND, opakování úspěchu, zmrazení neověřeného formuláře, přepnutí uživatele a nulový SMTP/outbox.

V místním prohlížeči prošel tok podpis → náhled → uložení konceptu → SQL/audit readback. Také „Zůstat na stránce“, změna podpisu ve druhé kartě, obnovení profilu při zachování textu a „Uložit a odejít“. Testovací výstupy jsou v paměti izolovaného serveru, syntetické důkazy mimo repo. Ostatní služby místního SO.ai jsou explicitně nedostupné; jejich diagnostické chyby nejsou důkaz chyby ani ověření produkce těchto modulů.

## Navržené nasazení — čeká na konkrétní schválení

1. Ověřit aktuální produkční stav a aplikované migrace. Po schválení aplikovat **jen migraci 0004** do již existující samostatné Forpsi D1 `forpsi-company-mail`. Vzniknou dvě tabulky, existující provozní data se nepřepisují.
2. Nasadit Worker 0.2.7 s MCP/cron/odesíláním stále vypnutými. Poté publikovat SO.ai pouze projektovým Pages guardem. Potvrdit přesnou živou verzi a UI/API readback.
3. Při potvrzeném rozšíření pilotu zapnout `SOAI_DRAFTS_ENABLED` a přidat pouze existující `write` k `read` pro uživatele `radim-oplustil` a schránku `oplustil@kaiserservis.cz`. Žádní kolegové ani další schránky nedostanou nová práva. Send/delete/schedule zůstanou odebrané.
4. Pokud schválení zahrnuje živý test, vytvořit jediný zřetelný testovací koncept ve vlastní schránce, s předmětem `SO.ai – test konceptu` a příjemcem shodným s vlastní adresou. Přečíst zpět, ověřit MIME, audit a nulové SMTP/outbox; nic neodesílat ani nemazat. Finální podpis uživatele nevymýšlet; prázdný podpis je platný počáteční stav.

Rollback: vypnout nový přepínač a vrátit Pages/Worker na předchozí ověřenou verzi. Tabulky i koncepty zachovat. Záznamy pokusů se nesmí vyprázdnit jako „reset“ — zanikla by ochrana před opakováním.

Následující produktový krok po živém přijetí: bezpečná editace existujícího konceptu s ochranou souběhu. Opakované APPEND není editace a nesmí za ni být vydáváno.
