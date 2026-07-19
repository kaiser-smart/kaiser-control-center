# TEST tabletu řidiče

1. Přihlas se oprávněným administrátorským účtem a otevři `https://smart-odpady.ai/trasy-svozu`.
2. V horní části stránky klepni na **TEST TABLETU**.
3. Zkontroluj řidiče **Vašek Miroslav**, vyber jednu z existujících TEST tras a klepni na **SPUSTIT TEST**.
4. Otevře se stejné řidičské UI jako při jízdě. Horní lišta vždy ukazuje **TEST REŽIM · ŘIDIČ: VAŠEK MIROSLAV** a přihlášeného správce.
5. Panel **Stav testu** pravdivě ukazuje načtení řidiče, vozidla, osádky, trasy, počasí, Šarloty, navigace a TEST zápisů. Chybějící funkce nejsou vydávané za hotové.
6. Pro ukončení klepni na **UKONČIT A RESETOVAT TEST** a potvrď reset. Hlas i navigace se ukončí, dočasná GPS a stav zastávek se smažou a trasa se vrátí do stavu připraveného k dalšímu testu.

## Bezpečnost

- TEST relace používá výhradně oddělenou TEST databázi tras.
- Nezapisuje do Vistosu, produkčních tras ani produkční GPS a neposílá zákaznické zprávy, e-maily, SMS nebo RCS.
- Přihlášený účet se nemění. Vašek Miroslav je pouze provozní identita uvnitř aktivní TEST relace.
- Pracovní paměť Šarloty zatím není v tomto TEST režimu dostupná; tablet ji označí jako nedostupnou a nic nezapíše do produkční paměti.
