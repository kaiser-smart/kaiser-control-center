# Integrace a chybějící provozní vstupy

Tento dokument popisuje další práci. Příkazy pro produkční provisioning nebyly spuštěny.

## Co ještě není nakonfigurované

1. Testovací schránka Forpsi a ověření dostupných IMAP rozšíření, speciálních složek,
   Business Mail a povolených kalendářů/adresářů.
2. OAuth poskytovatel identity pro zaměstnance s podporou MCP discovery a authorization-code + PKCE S256.
   Worker ověřuje tokeny, ale není autorizační server a nevytváří přihlašovací účty.
3. Mapování jednotlivých kolegů a sdílených schránek v tabulkách `principals`, `mailboxes`, `grants`.
4. Samostatná Cloudflare D1 databáze pro konektor, její migrace a Worker binding.
5. Produkční endpoint/doména, přesný callback z nastavení ChatGPT a registrace aplikace v pracovním prostoru.
6. Schválené nasazení administrace již začleněné do KCC. Stávající auth je znovu použitý, role ani produkční databáze nejsou měněné.

## Konfigurace Workeru

| Proměnná/binding | Význam |
|---|---|
| `DB` | Samostatná D1 databáze se třemi přiloženými migracemi |
| `MCP_RESOURCE` | Kanonické HTTPS resource ID, například budoucí URL endpointu `/mcp`; musí souhlasit s audience tokenu |
| `OAUTH_ISSUER` | Přesný issuer zavedeného poskytovatele identity |
| `OAUTH_JWKS_URL` | HTTPS URL jeho podpisových klíčů |
| `FORPSI_TENANT_ID` | Stabilní identifikátor firmy pro administrační rozhraní |
| `CONNECTOR_ADMIN_TOKEN` | Secret pro serverové propojení s KCC |
| `CREDENTIALS_KEY` | Secret: 32 náhodných bajtů v base64 pro hesla uložená z administrace |
| `MAILBOX_CREDENTIALS` | Secret: JSON mapa interního credential_key na heslo konkrétní schránky |
| `OUTBOX_KEY` | Secret: 32 náhodných bytů ve standardním base64; klíč chrání čekající odeslání |
| `CONNECTOR_ENABLED` | Výchozí `false`; `true` dovolí MCP a plánovači práci |

Hodnoty secretů nezapisovat do těchto dokumentů, PR, logů ani do chatu.
Změna `OUTBOX_KEY` bez migrace obsahu zablokuje dešifrování čekajících úloh;
rotaci řešit s verzovanými klíči před ostrým používáním. Nová databáze není existující KSO databáze.

## Ověření před zpřístupněním kolegům

- Izolovaný testovací tenant a schránka: skutečný IMAP/SMTP průchod s kontrolovaným příjemcem,
  readback konceptu, složky, koše a odeslané kopie. Ostré zprávy nelze nahrazovat simulací a nazývat je ověřenými.
- OAuth link z ChatGPT, odhlášení, vypršení a obnovení tokenu, zrušení práv kolegovi.
- Skutečný Cloudflare runtime → Forpsi TCP/TLS; úspěšný build nepotvrzuje průchod firewallu poskytovatele.
- V D1 a cronu doložit plánovaný čas, souběh runnerů, zrušení úlohy a nejasný SMTP výsledek.
- CalDAV/CardDAV na reálném účtu: načíst kolekce, vytvořit TEST událost/kontakt,
  upravit s ETag a ověřit odmítnutí zastaralé verze. Pozvánky nejsou součástí první verze.
- Doplnit provozní monitoring, limity/rate limiting, retenční pravidla auditu a metadat,
  obnovu po chybě a schválený proces správy hesel.
- Zvlášť ověřit API pro zbývající groupware části. `get_capabilities` nesmí po nasazení tvrdit ověření účtu,
  dokud není nahrazen skutečnými uloženými výsledky ověření.

## Primární dokumentace ověřená při vývoji

- [OpenAI: autentizace MCP](https://developers.openai.com/plugins/build/auth)
- [OpenAI: deklarace nástrojů](https://developers.openai.com/plugins/reference)
- [Forpsi: IMAP/SMTP nastavení](https://support.forpsi.com/kb/a3969/email-clients-settings.aspx)
- [Forpsi: synchronizace kalendáře](https://support.forpsi.com/kb/a4465/synchronizace-android-kalendare.aspx?translation-detect=false)
- [Forpsi: nastavení serveru CalDAV/CardDAV](https://support.forpsi.com/kb/a4474/automaticke-nastaveni-synchronizace-kalendaru-a-adresaru.aspx)
- [Forpsi: synchronizace a Business Mail](https://support.forpsi.com/kb/a2851/synchronizace-udalosti-kontaktu-a-ukolu.aspx?translation-detect=false)
- [Forpsi: štítky](https://support.forpsi.com/kb/a3458/pouzivani-stitku.aspx?translation-detect=false)
- [Forpsi: pravidla](https://support.forpsi.com/kb/a3461/filtrovani-zprav.aspx?translation-detect=false)
- [Forpsi: soubory](https://support.forpsi.com/kb/a4010/sprava-souboru.aspx)
- [Forpsi: podpisy](https://support.forpsi.com/kb/a3861/nastaveni-podpisu.aspx?translation-detect=false)
- [Cloudflare: TLS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/tls/)
- [Cloudflare: TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)

Webmailová dokumentace popisující tlačítka sama o sobě nepotvrzuje dostupnost podporovaného integračního API.
