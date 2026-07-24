# RCS šablona nové datové zprávy

## Provozní stav

Repo očekává schválenou Twilio Content šablonu v serverové proměnné
`TWILIO_DATA_BOX_RCS_CONTENT_SID`. Bez ní se upozornění bezpečně neodešle a
důvod se uloží jako `data_box_rcs_template_missing`.

## Kanonická šablona

- interní klíč: `data_box_new_message`
- doporučený Twilio friendly name: `kaiser_data_box_new_message_v1`
- ověřený RCS sender / značka: `Kaiser servis`
- typ: `twilio/card`
- orientace: `VERTICAL`
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

Média karty musí používat schválenou obecnou grafiku Kaiser se Šarlotou,
firemní zelenou a čistým bílým pozadím. Obrázek nesmí obsahovat odesílatele,
předmět, ID zprávy ani jiné dynamické nebo citlivé údaje.

Finální vektorovou Šarlotu dodává Radim nebo Martin podle `PŘÍRUČKA.md`.
Dodaný referenční PNG není v repozitáři použitý jako produkční asset.

Quicksand lze zaručit v dodaném grafickém podkladu. Nativní dynamický text a
tlačítka RCS vykresluje klient telefonu a Twilio karta nepodporuje vložení
vlastního webfontu; aplikace proto nesmí tvrdit, že jejich font umí vynutit.
