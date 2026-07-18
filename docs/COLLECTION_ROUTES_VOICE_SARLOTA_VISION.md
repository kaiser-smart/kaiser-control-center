# Hlasová Šarlota ve Svozových trasách

Stav: schválená cílová produktová vize, zatím neimplementovat jako ostrou autonomii  
Aktualizace: 18. 7. 2026 10:20  
Vlastník rozhodnutí: Radim

## Dva oddělené hlasové systémy

Hlas navigace a hlasová Šarlota jsou dva samostatné systémy.

- Hlas navigace používá pouze deterministické české pokyny HERE, například „Za 500 metrů odboč doprava“. Nevede rozhovor a neprovádí provozní úkony.
- Hlasová Šarlota vede přátelský rozhovor, vysvětluje provozní kontext a připravuje povolené úkony v KSO.
- Navigační pokyn má vždy zvukovou prioritu. Při manévru se Šarlota ztiší nebo pozastaví.
- Agentic AI nebo jazykový model nesmí tvořit ani přeformulovávat kritické navigační pokyny.

## Kontext, který smí Šarlota načítat

Šarlota pracuje pouze s ověřenými backendovými zdroji a s oprávněním právě přihlášeného uživatele.

- aktuální počasí a krátká předpověď pro oblast dnešní trasy, včetně času aktualizace,
- seznam vozidel a ověřené přiřazení konkrétního vozidla,
- dnešní přiřazenou trasu, její stav, stanoviště, výsypy a povolené provozní kroky,
- firemní adresář Kaiser pouze v rozsahu jméno, příjmení, funkce a schválený služební telefon a e-mail,
- dostupnost, dovolenou a nadřízeného; u nepřítomnosti nesmí sdělovat diagnózu, soukromý důvod ani jiná HR data,
- stručný přehled aktuálních zpráv z Novinky.cz, pouze z oficiálního nebo smluvně schváleného rozhraní.

Novinky.cz se nesmí neoficiálně scrapovat. Šarlota smí podat krátký souhrn titulku a uvést zdroj; nesmí ukládat nebo předčítat celé chráněné články. Počasí i zprávy musí být označeny časem načtení a při chybě se nesmí vydávat za aktuální.

## Zahájení pracovního dne

1. Řidič otevře tablet a KSO načte pouze jeho dnešní přiřazenou trasu.
2. Obrazovka nabídne jasné potvrzení dnešní trasy.
3. Až po fyzickém klepnutí na potvrzení, úspěšném načtení kontextu a odemčení zvuku smí Šarlota promluvit.
4. Osloví pouze ověřené osoby. Pokud posádka není známá, nesmí si vymyslet „kluci“ ani jména spolujezdců.

Příklad tónu:

> Ahoj Mirku. Trasu máme načtenou a můžeme vyrazit. Svačiny máte? Dnes bude pěkně, tak to bude dobrá jízda. Budu hlídat trasu, počasí i hlášení.

Uvítání má být krátké, lehce vtipné a přirozené. Nesmí zdržovat odjezd, opakovat se po každém obnovení stránky, zesměšňovat zaměstnance ani mluvit přes navigační pokyn.

## Provozní úkony

Šarlota může hlasem zjistit záměr a připravit správnou obrazovku pro:

- hlášení přeplněné nebo poškozené nádoby,
- nepřístupné stanoviště nebo jiný problém,
- pořízení a přidání fotografie,
- přestávku,
- odjezd na výsyp a návrat na trasu,
- dotaz na další stanoviště, kolegu, nadřízeného nebo dostupné vozidlo.

Hlas nesmí sám dokončit zápis, odeslat zprávu, změnit trasu ani označit stanoviště jako hotové. Konečný účinek vyžaduje povolené API, audit a fyzické potvrzení člověka na obrazovce.

## Paměť rozhovorů

Šarlota má mít dlouhodobou paměť vázanou na stabilní KSO user ID a firmu, aby poznala, zda s daným uživatelem již hovořila.

- Paměť ukládá stručné strukturované shrnutí, ne nepřetržitou nahrávku hlasu.
- Paměť jednoho zaměstnance se nesmí zobrazit jinému zaměstnanci.
- Neukládá hesla, soukromé rozhovory, zdravotní informace ani nepotřebné osobní údaje.
- Každý záznam má původ, čas, dobu uchování a možnost bezpečného odstranění.
- Šarlota smí navázat pouze na ověřený pracovní kontext, například preferovanou stručnost nebo minulé dokončené hlášení.

## Implementační hranice

Tento dokument ukládá schválenou produktovou vizi. Neznamená automatické povolení nových integrací, čtení osobních dat, ukládání paměti nebo ostrých hlasových zápisů. Každý zdroj dostane samostatný read-only kontrakt, oprávnění, audit, testy a teprve potom schválené akce.
