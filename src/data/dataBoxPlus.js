export const DATA_BOX_PLUS_MAILBOXES = [
  { id: "dbp-kaiser-servis", name: "Kaiser servis", company: "Kaiser servis", status: "aktivní", lastSync: "2026-07-07T08:35:00+02:00", newCount: 4, dueCount: 3, problemCount: 1 },
  { id: "dbp-kaiser-technology", name: "Kaiser technology", company: "Kaiser technology", status: "aktivní", lastSync: "2026-07-07T08:34:00+02:00", newCount: 2, dueCount: 1, problemCount: 0 },
  { id: "dbp-nanolab-plus", name: "Nanolab plus", company: "Nanolab plus", status: "aktivní", lastSync: "2026-07-07T08:33:00+02:00", newCount: 1, dueCount: 0, problemCount: 0 },
  { id: "dbp-nanolab-shop", name: "Nanolab shop", company: "Nanolab shop", status: "aktivní", lastSync: "2026-07-07T08:32:00+02:00", newCount: 3, dueCount: 1, problemCount: 0 },
  { id: "dbp-lefleur", name: "LeFleur", company: "LeFleur", status: "aktivní", lastSync: "2026-07-07T08:31:00+02:00", newCount: 0, dueCount: 0, problemCount: 0 },
  { id: "dbp-kaiserman-fond", name: "Kaisermanův nadační fond", company: "Kaisermanův nadační fond", status: "aktivní", lastSync: "2026-07-07T08:30:00+02:00", newCount: 1, dueCount: 0, problemCount: 0 },
  { id: "dbp-kaiser-holding", name: "Kaiser holding", company: "Kaiser holding", status: "čeká na přístup", lastSync: "", newCount: 0, dueCount: 0, problemCount: 1 }
];

export const DATA_BOX_PLUS_MESSAGES = [
  {
    id: "dbp-msg-brno",
    priority: "urgent",
    senderName: "Statutární město Brno",
    senderBoxId: "a7kbrrn",
    recipientBoxId: "dbp-kaiser-servis",
    subject: "Výzva k uhrazení určené částky",
    deliveredAt: "2026-07-07T07:42:00+02:00",
    receivedAt: "2026-07-07T07:44:00+02:00",
    mailboxId: "dbp-kaiser-servis",
    type: "Výzvy / pokuty",
    status: "Dnes k vyřízení",
    riskLevel: "Vysoké",
    dueDate: "2026-07-12",
    amount: "1 500 Kč",
    variableSymbol: "61245078",
    referenceNumber: "MMB/31722/2026",
    plateNumber: "3BN 3558",
    legalSubject: "Kaiser servis, spol. s r.o.",
    attachmentStatus: "Text načtený",
    recommendedAction: "Otevřít PDF a ověřit částku, lhůtu a důvod výzvy.",
    priorityReason: "Finanční požadavek a krátká lhůta.",
    primaryAction: "Otevřít PDF",
    summaryLoaded: true,
    summarySource: "Shrnutí vychází z přílohy vyzva-brno.pdf.",
    summary: "Úřad žádá úhradu určené částky za vozidlo 3BN 3558. Dokument uvádí částku 1 500 Kč, variabilní symbol 61245078 a lhůtu do 12. 7. 2026.",
    facts: [
      ["Částka", "1 500 Kč"],
      ["Lhůta", "12. 7. 2026"],
      ["Variabilní symbol", "61245078"],
      ["Značka vozidla", "3BN 3558"],
      ["Číslo jednací", "MMB/31722/2026"]
    ],
    attachments: [
      { id: "att-brno-1", fileName: "vyzva-brno.pdf", mimeType: "PDF", size: "482 kB", storageStatus: "Stažená", textExtractionStatus: "Text načtený", extractedText: "Výzva k uhrazení určené částky. Částka 1 500 Kč. Lhůta do 12. 7. 2026. Vozidlo 3BN 3558." }
    ]
  },
  {
    id: "dbp-msg-culligan",
    priority: "high",
    senderName: "Culligan Water Czech s.r.o.",
    senderBoxId: "4p8v6mh",
    recipientBoxId: "dbp-nanolab-shop",
    subject: "Předžalobní upomínka k faktuře 240119",
    deliveredAt: "2026-07-07T08:05:00+02:00",
    receivedAt: "2026-07-07T08:06:00+02:00",
    mailboxId: "dbp-nanolab-shop",
    type: "Upomínky",
    status: "Čeká na potvrzení",
    riskLevel: "Střední",
    dueDate: "2026-07-10",
    amount: "3 842 Kč",
    variableSymbol: "240119",
    legalSubject: "Nanolab shop",
    attachmentStatus: "Text načtený",
    recommendedAction: "Pravděpodobně upomínka. Připravit e-mail pro faktury.",
    priorityReason: "Finanční požadavek čeká na předání účetnímu oddělení.",
    primaryAction: "Připravit e-mail",
    summaryLoaded: true,
    summarySource: "Shrnutí vychází z přílohy upominka-culligan.pdf.",
    summary: "Dodavatel připomíná neuhrazenou fakturu 240119. Zpráva patří účetnímu oddělení a nemá se archivovat bez potvrzení.",
    facts: [
      ["Částka", "3 842 Kč"],
      ["Variabilní symbol", "240119"],
      ["Právní subjekt", "Nanolab shop"],
      ["Kontakt", "faktury@kaiserservis.cz"]
    ],
    attachments: [
      { id: "att-culligan-1", fileName: "upominka-culligan.pdf", mimeType: "PDF", size: "318 kB", storageStatus: "Stažená", textExtractionStatus: "Text načtený", extractedText: "Předžalobní upomínka. Faktura 240119. Částka 3 842 Kč." }
    ]
  },
  {
    id: "dbp-msg-exekutor",
    priority: "legal",
    senderName: "Soudní exekutor Lukáš Jícha",
    senderBoxId: "f2e9pza",
    recipientBoxId: "dbp-kaiser-technology",
    subject: "Usnesení o zrušení exekučního příkazu",
    deliveredAt: "2026-07-06T16:18:00+02:00",
    receivedAt: "2026-07-06T16:20:00+02:00",
    mailboxId: "dbp-kaiser-technology",
    type: "Exekuce / právní",
    status: "Dnes k vyřízení",
    riskLevel: "Vysoké",
    dueDate: "2026-07-09",
    referenceNumber: "203 Ex 441/24",
    legalSubject: "Kaiser technology",
    attachmentStatus: "Stažená",
    recommendedAction: "Exekuční dokument. Předat právníkovi / GT Brno.",
    priorityReason: "Právní dokument vyžaduje auditní stopu předání.",
    primaryAction: "Předat",
    summaryLoaded: true,
    summarySource: "Shrnutí vychází z přílohy usneseni-203-ex.pdf.",
    summary: "Dokument se týká exekuční věci 203 Ex 441/24. Autopilot ji nepřevezme sám a doporučuje předání právníkovi nebo GT Brno.",
    facts: [
      ["Spisová značka", "203 Ex 441/24"],
      ["Typ dokumentu", "Usnesení"],
      ["Právní subjekt", "Kaiser technology"],
      ["Doporučený příjemce", "GT Brno"]
    ],
    attachments: [
      { id: "att-ex-1", fileName: "usneseni-203-ex.pdf", mimeType: "PDF", size: "724 kB", storageStatus: "Stažená", textExtractionStatus: "Text načtený", extractedText: "Usnesení o zrušení exekučního příkazu ve věci 203 Ex 441/24." }
    ]
  },
  {
    id: "dbp-msg-registr",
    priority: "low",
    senderName: "Registr smluv",
    senderBoxId: "whqia86",
    recipientBoxId: "dbp-kaiser-servis",
    subject: "Potvrzení o zveřejnění smlouvy",
    deliveredAt: "2026-07-07T06:31:00+02:00",
    receivedAt: "2026-07-07T06:32:00+02:00",
    mailboxId: "dbp-kaiser-servis",
    type: "Registr smluv",
    status: "Bezpečně stranou",
    riskLevel: "Nízké",
    dueDate: "",
    attachmentStatus: "Dostupná",
    recommendedAction: "Informace z Registru smluv. Pravděpodobně archivovat.",
    priorityReason: "Známý informační typ podle schváleného playbooku.",
    primaryAction: "Archivovat",
    summaryLoaded: true,
    summarySource: "Shrnutí vychází z textu zprávy a potvrzení v příloze.",
    summary: "Registr smluv potvrzuje zveřejnění smlouvy. Zpráva neobsahuje finanční požadavek ani lhůtu.",
    facts: [
      ["Typ dokumentu", "Potvrzení"],
      ["Název úřadu", "Registr smluv"],
      ["Riziko", "Nízké"]
    ],
    attachments: [
      { id: "att-registr-1", fileName: "potvrzeni.xml", mimeType: "XML", size: "26 kB", storageStatus: "Dostupná", textExtractionStatus: "Text načtený", extractedText: "Potvrzení o zveřejnění smlouvy v registru smluv." }
    ]
  },
  {
    id: "dbp-msg-stk",
    priority: "high",
    senderName: "Ministerstvo dopravy",
    senderBoxId: "n75aau3",
    recipientBoxId: "dbp-kaiser-servis",
    subject: "Upozornění na končící technickou prohlídku vozidla",
    deliveredAt: "2026-07-07T09:12:00+02:00",
    receivedAt: "2026-07-07T09:14:00+02:00",
    mailboxId: "dbp-kaiser-servis",
    type: "Vozidla",
    status: "Dnes k vyřízení",
    riskLevel: "Vysoké",
    dueDate: "2026-07-19",
    plateNumber: "1BP 8373",
    attachmentStatus: "Čeká na zpracování",
    recommendedAction: "Zapsat lhůtu do kalendáře a předat garážmistrovi.",
    priorityReason: "Provozní dopad na vozidlo a termín za 12 dní.",
    primaryAction: "Zadat lhůtu",
    summaryLoaded: false,
    summarySource: "",
    summary: "",
    facts: [
      ["Značka vozidla", "1BP 8373"],
      ["Lhůta", "19. 7. 2026"],
      ["Typ dokumentu", "Oznámení k vozidlu"]
    ],
    attachments: [
      { id: "att-stk-1", fileName: "upozorneni-stk.pdf", mimeType: "PDF", size: "410 kB", storageStatus: "Stažená", textExtractionStatus: "Čeká na zpracování", extractedText: "" }
    ]
  },
  {
    id: "dbp-msg-priloha",
    priority: "problem",
    senderName: "Finanční úřad pro Jihomoravský kraj",
    senderBoxId: "q2i9p2e",
    recipientBoxId: "dbp-kaiser-holding",
    subject: "Oznámení ve věci daňového podání",
    deliveredAt: "2026-07-07T08:55:00+02:00",
    receivedAt: "2026-07-07T08:56:00+02:00",
    mailboxId: "dbp-kaiser-holding",
    type: "Úřady",
    status: "Problém",
    riskLevel: "Vysoké",
    dueDate: "",
    attachmentStatus: "Nepodařilo se stáhnout",
    recommendedAction: "Příloha není načtená. Zkusit znovu.",
    priorityReason: "Daňová zpráva bez dostupné přílohy.",
    primaryAction: "Zkusit znovu načíst",
    summaryLoaded: false,
    summarySource: "",
    summary: "",
    facts: [
      ["Název úřadu", "Finanční úřad pro Jihomoravský kraj"],
      ["Typ dokumentu", "Oznámení"],
      ["Stav přílohy", "Nepodařilo se stáhnout"]
    ],
    attachments: [
      { id: "att-fu-1", fileName: "oznameni-fu.pdf", mimeType: "PDF", size: "neznámá", storageStatus: "Nepodařilo se stáhnout", textExtractionStatus: "Nepodařilo se přečíst", extractedText: "", errorReason: "Přístup k příloze vyžaduje opakované serverové stažení." }
    ]
  },
  {
    id: "dbp-msg-csu",
    priority: "low",
    senderName: "Český statistický úřad",
    senderBoxId: "2gfaasy",
    recipientBoxId: "dbp-nanolab-plus",
    subject: "Odeslání urgence k výkazu EP 5-01",
    deliveredAt: "2026-07-06T10:45:00+02:00",
    receivedAt: "2026-07-06T10:46:00+02:00",
    mailboxId: "dbp-nanolab-plus",
    type: "Úřady",
    status: "Archivované",
    riskLevel: "Nízké",
    dueDate: "",
    attachmentStatus: "Text načtený",
    recommendedAction: "Tuhle zprávu pravděpodobně stačí archivovat.",
    priorityReason: "Opakované informační potvrzení bez nové povinnosti.",
    primaryAction: "Archivovat",
    summaryLoaded: true,
    summarySource: "Shrnutí vychází z přílohy urgence-ep.pdf.",
    summary: "Zpráva potvrzuje odeslání urgence k výkazu. Neobsahuje novou částku ani právní lhůtu.",
    facts: [
      ["Typ dokumentu", "Urgence výkazu"],
      ["Název úřadu", "Český statistický úřad"]
    ],
    attachments: [
      { id: "att-csu-1", fileName: "urgence-ep.pdf", mimeType: "PDF", size: "190 kB", storageStatus: "Stažená", textExtractionStatus: "Text načtený", extractedText: "Odeslání urgence k výkazu EP 5-01." }
    ]
  }
];

export const DATA_BOX_PLUS_RECOMMENDATIONS = [
  {
    id: "dbp-rec-culligan",
    messageId: "dbp-msg-culligan",
    text: "Zpráva od Culligan vypadá jako upomínka. Doporučuji připravit e-mail na faktury@kaiserservis.cz.",
    action: "Připravit e-mail",
    evidence: "Odesílatel Culligan, slovo upomínka a variabilní symbol faktury.",
    risk: "Finanční požadavek čeká na člověka."
  },
  {
    id: "dbp-rec-registr",
    messageId: "dbp-msg-registr",
    text: "Oznámení z Registru smluv vypadá jako informativní zpráva. Doporučuji archivovat.",
    action: "Archivovat",
    evidence: "Známý odesílatel a potvrzení o zveřejnění smlouvy.",
    risk: "Nízké riziko podle schváleného playbooku."
  },
  {
    id: "dbp-rec-exekutor",
    messageId: "dbp-msg-exekutor",
    text: "Exekuční dokument vyžaduje právní kontrolu. Doporučuji předat právníkovi / GT Brno.",
    action: "Předat",
    evidence: "Odesílatel je soudní exekutor a příloha obsahuje spisovou značku.",
    risk: "Právní dokument nelze uzavřít samostatně."
  }
];

export const DATA_BOX_PLUS_AUTOPILOT_DONE = [
  "Autopilot dnes zařadil 8 informačních zpráv z Registru smluv do archivu k potvrzenému playbooku.",
  "Autopilot připravil 2 předání účetnímu oddělení a ponechal je ke schválení.",
  "Autopilot označil 3 technická oznámení jako nízkou prioritu."
];

export const DATA_BOX_PLUS_RULES = [
  {
    id: "dbp-rule-culligan",
    type: "Pravidlo",
    status: "Učí se",
    name: "Culligan upomínky na faktury",
    description: "Pokud přijde zpráva od Culligan a obsahuje slovo upomínka, připrav e-mail na faktury@kaiserservis.cz.",
    looksFor: "Odesílatel Culligan, upomínka, faktura, variabilní symbol.",
    proposes: "Připravit e-mail pro faktury.",
    autonomous: "Nic neodesílá samo.",
    confirmation: "E-mail vždy čeká na potvrzení.",
    used: 4,
    confirmed: 3,
    edited: 1,
    lastUsed: "2026-07-07T08:05:00+02:00",
    trust: "Učí se"
  },
  {
    id: "dbp-rule-registr",
    type: "Automatizace",
    status: "Spolehlivé",
    name: "Registr smluv bez akce",
    description: "Pokud přijde potvrzení o zveřejnění smlouvy, označ ho jako informativní a připrav archivaci.",
    looksFor: "Registr smluv, zveřejnění smlouvy, potvrzení.",
    proposes: "Archivovat jako informativní zprávu.",
    autonomous: "Po schválení může archivovat opakované potvrzení.",
    confirmation: "Nový typ smlouvy nebo finanční požadavek vždy čeká.",
    used: 28,
    confirmed: 26,
    edited: 2,
    lastUsed: "2026-07-07T06:31:00+02:00",
    trust: "Spolehlivé"
  },
  {
    id: "dbp-rule-legal",
    type: "Pravidlo",
    status: "Rizikové",
    name: "Právní dokumenty a exekuce",
    description: "Pokud přijde dokument od soudu nebo exekutora, označ ho jako urgentní a předlož člověku ke kontrole.",
    looksFor: "Soud, exekutor, spisová značka, právní řízení.",
    proposes: "Předat právníkovi / GT Brno.",
    autonomous: "Samostatně nesmí uzavřít ani archivovat.",
    confirmation: "Vždy vyžaduje potvrzení.",
    used: 6,
    confirmed: 6,
    edited: 0,
    lastUsed: "2026-07-06T16:18:00+02:00",
    trust: "Rizikové"
  },
  {
    id: "dbp-rule-vehicle",
    type: "Pravidlo",
    status: "Nové pravidlo",
    name: "Vozidla a termíny",
    description: "Pokud zpráva obsahuje registrační značku vozidla a lhůtu, připrav zápis termínu a předání garážmistrovi.",
    looksFor: "Registrační značka, STK, termín, technická prohlídka.",
    proposes: "Zapsat lhůtu do kalendáře a přiřadit osobu.",
    autonomous: "Samostatně jen označí riziko.",
    confirmation: "Zápis termínu čeká na potvrzení.",
    used: 1,
    confirmed: 0,
    edited: 0,
    lastUsed: "2026-07-07T09:12:00+02:00",
    trust: "Nové pravidlo"
  }
];

export const DATA_BOX_PLUS_LEARNING_PLAN = [
  ["Den 1-7", "Režim Pozorování", "Autopilot sleduje otevírání zpráv, archivaci, předání, práci s přílohami a neprovádí samostatné akce."],
  ["Den 8-14", "Režim Návrhů", "Autopilot doporučuje kategorii, další krok, předání a archivaci. Vše potvrzuje člověk."],
  ["Den 15-21", "Režim Asistenta", "Autopilot připravuje konkrétní akce, návrhy pravidel a hromadné nízkorizikové případy k potvrzení."],
  ["Den 22-30", "Režim Autopilota", "Autopilot samostatně řeší schválené nízkorizikové typy a citlivé zprávy nechává člověku."],
  ["Po 30 dnech", "Rutina stranou", "Uživatel řeší výjimky, právní a finanční věci zůstávají pod kontrolou a vše má auditní stopu."]
];

export const DATA_BOX_PLUS_ENTITY_MODEL = [
  "Mailbox",
  "DataMessage",
  "Attachment",
  "AiObservation",
  "AiRecommendation",
  "AutopilotRule",
  "ActionLog",
  "SyncRun"
];
