# RCS šablona nové datové zprávy

## Provozní stav

Repo očekává schválenou Twilio Content šablonu v serverové proměnné
`TWILIO_DATA_BOX_RCS_CONTENT_SID`. Bez ní se upozornění bezpečně neodešle a
důvod se uloží jako `data_box_rcs_template_missing`.

Testovací grafický kandidát je uložený v repozitáři. Produkční použití stále
vyžaduje zveřejnění assetu, vytvoření Content šablony a kontrolní RCS na
skutečném telefonu.

## Kanonická šablona

- interní klíč: `data_box_new_message`
- doporučený Twilio friendly name: `kaiser_data_box_new_message_v1`
- ověřený RCS sender / značka: `Kaiser servis`
- typ: `twilio/card`
- orientace: `VERTICAL`
- výška média: `MEDIUM`
- médium:
  `https://smart-odpady.ai/notifications/kaiser-sarlota-rcs-data-message-v1.png`
- nadpis: `Nová datová zpráva`
- tělo:
  `Šarlota přijala novou datovou zprávu do schránky {{1}}.`
  `Odesílatel: {{2}}`
  `Předmět: {{3}}`
  `Doručeno: {{4}}`
  `Pro odhlášení odpovězte STOP.`
- hlavní URL tlačítko: `Zobrazit zprávu` → `{{5}}`
- vedlejší URL tlačítko: `Otevřít Datové zprávy` → `{{6}}`

Proměnné:

1. název schránky,
2. odesílatel zprávy,
3. předmět,
4. datum a čas doručení v `Europe/Prague`,
5. chráněný deep-link konkrétní zprávy,
6. kanonická trasa `/datove-schranky-plus`.

Šablona musí mít vedle RCS karty také textový SMS fallback se stejnými
minimálními údaji, oběma odkazy a větou `Pro odhlášení odpovězte STOP.`.
Routing probíhá přes existující Twilio Messaging Service; aplikace neposílá
na `rcs:` adresu, protože tím by se automatický fallback vypnul.

## Grafický podklad

Média karty používají obecnou grafiku Kaiser se Šarlotou,
firemní zelenou a čistým bílým pozadím. Obrázek nesmí obsahovat odesílatele,
předmět, ID zprávy ani jiné dynamické nebo citlivé údaje.

Testovací PNG kandidát schválený pro ladicí RCS:

- repo cesta:
  `public/notifications/kaiser-sarlota-rcs-data-message-v1.png`,
- rozměr: `1200 × 600 px`,
- poměr stran: `2:1`,
- barevný prostor: `sRGB`,
- bez dynamických údajů a interních identifikátorů.

Po kontrolním RCS Radim rozhodne, zda se kandidát schválí jako finální, nebo
se upraví podle skutečného ořezu a vykreslení v telefonu.

Logo je součástí grafického podkladu. Nativní dynamický text a
tlačítka RCS vykresluje klient telefonu a Twilio karta nepodporuje vložení
vlastního webfontu; aplikace proto nesmí tvrdit, že jejich font umí vynutit.
