# Šarlota – zdroj výslovnostního slovníku

## Stav a bezpečnost

- Zdroj: jazykový a výslovnostní manuál Šarloty, verze 1.0.
- Stav: připojeno k živému ElevenLabs agentovi; pravidla se aktualizují pouze přes auditovaný synchronizační endpoint a následný poslechový test.
- Alias smí ovlivnit pouze TTS výstup.
- Oficiální zápis v databázi, e-mailu, dokumentu, UI a přepisu se nikdy nemění.
- Před připojením je nutný read-only audit aktuálního hlasu, modelu a existujících pronunciation dictionaries.
- Každý alias musí projít poslechovým testem v české větě; nevyhovující alias se nepoužije.

## Navržené aliasy

| Oficiální zápis | Navržená výslovnost | Poznámka |
| --- | --- | --- |
| Kaiser Smart odpady | kajzr smart odpady | Celý firemní název; delší pravidlo má přednost |
| Kaiser servis | kajzr servis | Celý firemní název; delší pravidlo má přednost |
| Kaiser | kajzr | Firemní výslovnost |
| kAIser | kajzr | Grafická hra `AI` se samostatně nečte |
| Šarlota | šarlota | České jméno |
| ElevenLabs | ileven labs | Před ostrým použitím poslechnout v české větě |
| Twilio | tvilio | Před ostrým použitím poslechnout |
| Vistos | vistos | Beze změny pravopisu |
| Partslink24 | partslink dvacet čtyři | Číslo číst jako číslo |
| Cloudflare | klaudflér | Pouze TTS alias |
| GitHub | githab | Pouze TTS alias |
| Codex | kodex | Pouze TTS alias |
| Money S4 | many es čtyři | Ověřit proti firemní výslovnosti |
| Apple Pay | epl pej | Pouze TTS alias |
| Google | gůgl | Pouze TTS alias |
| AI | á í | Hláskovaná zkratka |
| API | á pé í | Hláskovaná zkratka |
| KSO | ká es ó | Hláskovaná zkratka |
| GPS | gé, pé, es | Hláskovaná zkratka s krátkými TTS pauzami |
| SMS | es em es | Hláskovaná zkratka |
| RCS | er cé es | Hláskovaná zkratka |
| SPZ | es pé zet | Hláskovaná zkratka |
| IČO | í čé ó | Hláskovaná zkratka |
| DIČ | dé í čé | Hláskovaná zkratka |
| DPH | dé pé há | Hláskovaná zkratka |
| PDF | pé dé ef | Hláskovaná zkratka |
| CSV | cé es vé | Hláskovaná zkratka |

## Povinná poslechová sada

Před připojením slovníku ověřit nejméně:

1. `Kaiser servis používá Kaiser Smart odpady.`
2. `Šarlota načetla ověřený kontext.`
3. `SPZ potvrď na displeji.`
4. `GPS bod zatím není uložený.`
5. `RCS ani SMS se neposlala.`
6. `Data z Vistosu jsou pouze ověřený pracovní kontext.`
7. `Partslink24 je externí pracovní nástroj.`

Výsledek testu musí u každé položky uvést použitý hlas, model, verzi slovníku, datum, výsledek a případnou opravu aliasu.
