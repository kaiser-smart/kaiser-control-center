# Ověření vývojové verze 0.2.0

25. 9. 2026. Lokální vývoj, nikoli produkční akceptace.

- 43 testů konektoru + 4 testy skutečné cesty SO.ai auth → API → Worker → SQLite: 47 prošlo.
- Testy obsahují všechny původní OAuth/MCP/IMAP/SMTP/DAV testy a navíc vault, atomičnost auditu,
  konflikty revizí, oddělení firem, zneplatnění testu po změně hesla, CSRF, odmítnutí neprivilegovaného uživatele,
  redakci chyb a odmítnutí simulovaného ověření v ostrém režimu.
- Sestavení KCC: 49 rout. Syntax check: 672 souborů. Worker: Wrangler dry-run úspěšný.
- Všechny tři migrace prošly proti samostatné místní D1. Produkční DB nebyla použita.
- V prohlížeči ověřeno: sekce v Nastavení skutečné aplikace, vytvoření schránky, uložení,
  upozornění na neuložené změny, odmítnutí aktivace bez testu, test a následné zapnutí.
- Responzivita přehledu i formuláře ověřena v reálném browseru přes šest iframe viewportů 320/375/430/768/1024/1440 px;
  dokument ani modul nepřetékaly. Vizuální kontrola desktopu a mobilního formuláře.
- Živý webmail: přihlášený účet oplustil@kaiserservis.cz; nabídka adresáře/kalendáře/souborů/úkolů/poznámek;
  uživatelské instrukce přímo potvrdily imap.forpsi.com:993 TLS a smtp.forpsi.com:465 TLS.

## Testovací izolace

SQLite v paměti zaniká s procesem. Záznamy testovacích providerů jsou pouze v paměti.
Prohlížeč běží nad stejnými auth/API/validačními moduly; Forpsi poskytovatelé jsou výslovně simulovaní.
Žádná ostrá zpráva nebyla odeslaná, označená, přesunutá ani smazaná. Připojení webmailu není připojení MCP.

## Zbývá

Cloudflare serverové připojení k Forpsi; skutečné účtové schopnosti IMAP/DAV; SMTP doručení; nasazení a konfigurace;
OAuth přihlášení z ChatGPT; granty propojené s firemními identitami a jejich revokací;
administrační editory štítků/pravidel/podpisů; nativní soubory/úkoly/poznámky/podpisy.
Tyto neimplementované služby nemají funkční TEST adaptér a nejsou započtené jako splněné.
