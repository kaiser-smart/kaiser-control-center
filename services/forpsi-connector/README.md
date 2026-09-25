# Firemní konektor Forpsi ↔ ChatGPT

**Vývojová verze 0.2.0, 25. 9. 2026.** Backend pro Cloudflare Workers, se správou schránek v SO.ai.
Obsahuje 35 MCP nástrojů. Nejde zatím o nasazené ani připojené rozšíření ChatGPT.

## Rozsah a skutečný stav

| Oblast | Implementace v této verzi | Omezení |
|---|---|---|
| Pošta | Hledání, čtení, nový koncept, odeslání, složky, přesuny, přečteno/nepřečteno, hvězdička, přesun do koše | Adaptér IMAP/SMTP; účet Forpsi neověřen. Přílohy pouze jako metadata, textové zprávy bez HTML podpisu. Čtení zpráv do 2 MiB. |
| Plánování odeslání | Šifrovaná D1 fronta, cron, stav, zrušení, kontrola oprávnění před odesláním | Cloudová fronta ani cron nejsou nasazené. Minutová kontrola, nikoli garance přesného času. |
| Štítky | Vytvoření, změna názvu/barvy, přiřazení a odebrání | Uložené v konektoru. Synchronizace nativních štítků Forpsi není potvrzená. |
| Pravidla | Vytvoření, editace, přiřazení zdrojové složky, náhled a aplikace na vybrané zprávy | Vlastní pravidla konektoru. Nespouštějí se automaticky při příchodu zprávy a neupravují filtry webmailu. |
| Kalendář | CalDAV discovery, přehled, čtení, vytvoření, změna a smazání jednoduché události | Vyžaduje Business Mail a zapnutou synchronizaci. Bez pozvánek a změn opakovaných událostí. Účet neověřen. |
| Adresář | CardDAV discovery, hledání, čtení, vytvoření, úprava a smazání kontaktu | Účet a jeho synchronizace neověřeny. Úpravy chrání ETag. |
| Soubory | Zahrnuto do zadání | **Neimplementováno:** není potvrzené podporované rozhraní souborů Forpsi. |
| Úkoly | Zahrnuto do zadání | **Neimplementováno:** nelze předpokládat podporu VTODO jen z existence CalDAV. |
| Poznámky | Zahrnuto do zadání | **Neimplementováno:** není potvrzený integrační kontrakt. |
| Podpisy | Zahrnuto do zadání | **Neimplementováno:** není potvrzené rozhraní správy podpisů Forpsi. SMTP nepřebírá podpis webmailu automaticky. |

## Spuštění a ověření

Vyžaduje Node.js 24 a pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm run build
pnpm run dev
```

`build` provádí pouze `wrangler deploy --dry-run`. Konfigurace má `CONNECTOR_ENABLED=false`,
vypnuté workers.dev a prázdnou cílovou D1 identitu. `/health` uvádí skutečný stav;
`/mcp` vrací při vypnutí HTTP 503. Aktivace vyžaduje konkrétní infrastrukturu a účet.

## Architektura

ChatGPT → OAuth token → MCP Worker → aktuální oprávnění uživatele → IMAP/SMTP nebo CalDAV/CardDAV Forpsi.

- Databáze mapuje ověřenou dvojici issuer/subject na stálé ID kolegy a firmu.
- Každá schránka má explicitní práva `read`, `write`, `send`, `delete`, `schedule`.
  V této verzi se vztahují i na kalendář a adresář vybrané schránky.
- OAuth podpis, issuer, audience, exp a scopes se ověřují na serveru. Tenant nepřebíráme z parametrů modelu.
- Schránky spravuje chráněná administrace SO.ai. Přidělování OAuth identit a grantů v UI zatím není implementované.
- Hesla nových schránek se ukládají šifrovaně do D1, master klíč `CREDENTIALS_KEY` je Worker secret. Původní `MAILBOX_CREDENTIALS` zůstává podporovaný pro starší účty.
- Obsah odložených zpráv je šifrovaný pomocí AES-GCM a klíče `OUTBOX_KEY`. Dokončené a zrušené úlohy obsah mažou.
- Audit neukládá těla zpráv, hesla, vyhledávací dotazy ani obsah kontaktů.
- IMAP operace používají UID a UIDVALIDITY. Přesun vyžaduje nativní MOVE, aby se nepoužil nebezpečný obecný EXPUNGE.
- Kalendáře a adresáře se zjišťují z účtu. Přístupové údaje se odesílají jen na pevně povolený server Forpsi, bez přesměrování.
- Změny událostí, kontaktů, štítků a pravidel kontrolují aktuální verzi.

## Chování při chybě odesílání

`requestId` identifikuje konkrétní zprávu. Stejný požadavek s týmž ID nevytvoří další úlohu;
změněný obsah se stejným ID se odmítne. D1 atomicky rezervuje úlohu před SMTP voláním.

Výsledek `sent` znamená přijetí SMTP serverem, nikoli potvrzení doručení do schránky příjemce.
Při částečném přijetí se vrací `partial`. Nejasný výsledek nebo přerušený proces končí
`uncertain` a **automaticky se neopakuje**. SMTP nezaručuje exactly-once doručení;
tento návrh upřednostňuje zabránění automatickým duplicitám za cenu ručního dořešení nejasných případů.
Chyba ukládání kopie do Odeslané nikdy sama nevyvolá nové SMTP odeslání.

## Další hranice první verze

- Vyhledávání prochází nejvýše 5 000 UID v jednom kroku; pro další stránky vrací kurzor.
- Pravidla používají průnik podmínek obsahuje, bez regulárních výrazů. Akce: štítky, příznaky, přesun.
  Výsledky jsou po zprávách včetně dokončených kroků při částečném selhání.
- Štítky následují přesun přes konektor jen při známém mapování nových UID. Přesuny provedené
  jiným poštovním klientem vyžadují budoucí synchronizační mechanismus.
- `create_draft` vytváří nový koncept; editace existujícího konceptu není zatím implementovaná.
- Chybí přílohy při odesílání, automatické skládání vláken odpovědí, HTML podpisy, trvalé smazání pošty,
  automatický běh pravidel a pokročilé plánování schůzek. Nejsou vydávány za hotové funkce.
- Nativní administrace souborů, úkolů, poznámek, podpisů, štítků a pravidel potřebuje další ověření.

## GitHub a nasazení

Přes GitHub CLI byl ověřen repozitář
[kaiser-smart/kaiser-control-center](https://github.com/kaiser-smart/kaiser-control-center).
Konektor je součástí repozitáře v `services/forpsi-connector`. Administrace je v Nastavení SO.ai.
Nasazení, skutečné secrets a OAuth připojení zatím neproběhly. CI je v `.github/workflows/forpsi-connector.yml`.
Podmínky a omezení: [Administrace SO.ai](../../docs/FORPSI_CONNECTOR.md).

[Integrační kroky](docs/INTEGRATION.md) · [Rozsah všech požadovaných modulů](docs/SCOPE.md) · [Ověření](docs/VERIFICATION.md)
