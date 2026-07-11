export const SMART_ODPADY_V2_DEMO_USER = {
  id: "demo-user",
  name: "Demo uživatel",
  role: "readonly",
  active: true,
  department: "Demo provoz",
  permissions: {}
};

export const SMART_ODPADY_V2_DEMO_DASHBOARD = {
  metrics: [
    { label: "Aktivní svozy", value: "12", note: "ukázkové trasy dnes", tone: "green" },
    { label: "Hlášení čeká", value: "3", note: "bez reálných žádostí", tone: "neutral" },
    { label: "Vozidla online", value: "6", note: "simulovaný stav", tone: "neutral" },
    { label: "Upozornění", value: "1", note: "demo priorita", tone: "green" }
  ],
  alerts: [
    {
      title: "Provozní přehled",
      text: "Ukázka používá syntetické hodnoty pro denní provoz. Nic se nenačítá z produkčních API.",
      status: "Demo data"
    },
    {
      title: "Ke kontrole",
      text: "Jedna ukázková trasa má zvýrazněnou odchylku pro prezentaci detailu.",
      status: "Prezentace"
    }
  ],
  actions: [
    { label: "Otevřít Hlášení", target: "reports" },
    { label: "Otevřít Sledování vozidel", target: "vehicle-tracking" },
    { label: "Ukázat demo potvrzení", target: "notice" }
  ],
  modules: [
    {
      id: "dashboard",
      title: "Dashboard",
      description: "Denní přehled provozu, upozornění a rychlé akce.",
      status: "Demo",
      icon: "dashboard"
    },
    {
      id: "reports",
      title: "Hlášení",
      description: "Vizuální ukázka workflow dovolené, nemoci a schvalování.",
      status: "Lokální data",
      icon: "absence"
    },
    {
      id: "vehicle-tracking",
      title: "Sledování vozidel",
      description: "Schválený soft-metal náhled mapy, KPI, filtrů a detailu.",
      status: "Demo mapa",
      icon: "vehicleTracking"
    }
  ]
};

export const SMART_ODPADY_V2_DEMO_REPORTS = {
  requests: [
    {
      id: "demo-report-1",
      employeeName: "Zaměstnanec A",
      type: "Dovolená",
      status: "pending_approval",
      dateFrom: "2026-07-20",
      dateTo: "2026-07-24",
      note: "Ukázková žádost čekající na schválení.",
      department: "Provoz Brno"
    },
    {
      id: "demo-report-2",
      employeeName: "Zaměstnanec B",
      type: "Lékař",
      status: "recorded",
      dateFrom: "2026-07-16",
      dateTo: "2026-07-16",
      startTime: "09:00",
      endTime: "11:00",
      note: "Lokálně evidovaná ukázka krátkého hlášení.",
      department: "Dispečink"
    },
    {
      id: "demo-report-3",
      employeeName: "Řidič A",
      type: "Nemoc",
      status: "approved",
      dateFrom: "2026-07-14",
      dateTo: "2026-07-18",
      note: "Schválená ukázková absence bez vazby na zaměstnance.",
      department: "Svoz"
    }
  ]
};
