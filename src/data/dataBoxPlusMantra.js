export const DATA_BOX_PLUS_MANTRA = Object.freeze({
  version: "1.0",
  updatedAt: "23. 7. 2026 18:10",
  updatedAtIso: "2026-07-23T18:10:00+02:00",
  updatedBy: "Codex",
  status: "Ostrý pracovní modul",
  title: "Datové schránky – provozní mantra",
  lastChange: "Bezpečné automatizace, odpovědi a správa přístupů",
  summary: "Datové schránky jsou ostrý pracovní inbox sedmi firemních schránek. Přijaté zprávy se automaticky načítají z ISDS každou celou hodinu a mohou vstupovat do pracovního třídění, doporučení AI a auditovaných interních akcí. Odeslané datové zprávy jsou pouze neměnná historie; AI, doporučení ani automatizace se nad nimi nespouštějí. E-mail, odpověď přes ISDS ani nová datová zpráva se nikdy neodešlou automaticky: systém je smí připravit, ale člověk musí zkontrolovat adresáta, předmět, text a přílohy a samostatně fyzicky potvrdit odeslání. Automatická archivace je povolená jen u pravidla výslovně označeného jako čistě informační. Přístupy se ukládají pouze šifrovaně na serveru v DSP vaultu nebo v Cloudflare secrets; frontend heslo nikdy nečte ani nezobrazuje.",
  rules: Object.freeze([
    "Kanonická trasa modulu je /datove-schranky-plus.",
    "Běžná práce probíhá v kontextu jedné vybrané datové schránky.",
    "AI a automatizace zpracovávají pouze přijaté zprávy.",
    "Odeslané zprávy jsou pouze historie bez AI a pracovních akcí.",
    "Načítání ISDS běží cloudově každou celou hodinu bez otevřeného prohlížeče.",
    "E-mail, odpověď přes ISDS a nová DS vyžadují závěrečnou kontrolu a fyzické potvrzení.",
    "Automatické přeposílání e-mailů a automatické odpovědi přes ISDS jsou zakázané.",
    "Automatická archivace je povolená jen explicitnímu čistě informačnímu pravidlu.",
    "Každá citlivá akce má audit a idempotency klíč proti duplicitě.",
    "Přístupy spravuje pouze oprávněný uživatel přes backend a šifrovaný DSP vault.",
    "Hesla se nikdy nezobrazují, nevracejí z API ani neukládají v prohlížeči.",
    "PDF příloha má vždy viditelné Otevřít náhled; všechny přílohy lze jednotlivě i hromadně stáhnout.",
    "Hlavní akce Odpovědět zůstává viditelná bez rolování a otevře skutečný editor.",
    "Technická diagnostika, confidence a raw serverové údaje nepatří do běžného pracovního pohledu."
  ])
});
