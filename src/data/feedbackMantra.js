export const FEEDBACK_MANTRA = Object.freeze({
  version: "1.0",
  updatedAt: "24. 7. 2026",
  updatedAtIso: "2026-07-24T00:00:00+02:00",
  updatedBy: "Codex",
  status: "Ostrý pracovní modul",
  title: "Připomínky a chyby – provozní mantra",
  summary: "Každé odeslané hlášení vytvoří právě jeden dohledatelný případ s uživatelsky čitelným číslem. Přihlášení uživatelé vidí společný seznam všech hlášení a mohou jej přepnout na Svoje. Autor vidí průběh, veřejné zprávy řešitele, může doplnit vyžádané informace a ověřit opravu. Oprávněný řešitel spravuje stav, prioritu, přiřazení, interní poznámky a komunikaci. Předání do Codexu je samostatná, auditovaná administrátorská akce nad konkrétním případem a nikdy se nespustí samotným nahlášením. E-mail autorovi se odešle až při skutečném předání opravy k ověření a UI pravdivě zobrazí výsledek odeslání.",
  rules: Object.freeze([
    "Kanonická uživatelská trasa modulu je /pripominky a detail je /pripominky/:caseId.",
    "Běžný uživatel vidí všechna hlášení a může zapnout filtr Svoje.",
    "Interní poznámky, technický audit a stav automatické opravy vidí pouze oprávněný řešitel.",
    "Nové hlášení ukládá uživatele, čas, modul, URL, zařízení, obrazovku, verzi a dostupný technický kontext automaticky.",
    "Úspěch se zobrazí pouze po potvrzeném databázovém zápisu jediného případu.",
    "Po chybě zůstane formulář vyplněný a lze jej znovu odeslat.",
    "Každé tlačítko Otevřít používá konkrétní caseId a vede na detail případu.",
    "Autor může odpovědět při žádosti o doplnění a ověřit opravu ve stavu Připraveno k ověření.",
    "Při potvrzení opravy se případ uzavře jako Hotovo; při trvajícím problému se vrátí do V řešení.",
    "Důležité změny vytvářejí interní notifikaci autora.",
    "E-mail se odesílá při přechodu do Připraveno k ověření pouze přes skutečně nakonfigurovaného poskytovatele.",
    "Codex se nikdy nespouští vytvořením hlášení.",
    "Předání opravy Codexu vyžaduje oprávnění správce, konkrétní případ, připravené zadání a potvrzený runner.",
    "Nasazení opravy je oddělená schvalovaná akce; stav Codexu ani nasazení se nesmí předstírat.",
    "RBAC se kontroluje v UI i na backendu a každá změna se zapisuje do auditu."
  ])
});
