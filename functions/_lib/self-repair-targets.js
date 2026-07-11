const DEFAULT_TARGET = Object.freeze({
  moduleKey: "dashboard",
  moduleName: "Hlavní aplikace",
  repoKey: "kaiser-control-center",
  productionUrl: "https://smart-odpady.ai/"
});

const TARGETS = Object.freeze({
  dashboard: DEFAULT_TARGET,
  fleet: { moduleKey: "fleet", moduleName: "Vozidla", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  "vehicle-tracking": { moduleKey: "vehicle-tracking", moduleName: "Poloha vozidel", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  "data-box-plus": { moduleKey: "data-box-plus", moduleName: "Datové schránky", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  "driver-reports": { moduleKey: "driver-reports", moduleName: "Hlášení z vozidel", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  "service-maintenance": { moduleKey: "service-maintenance", moduleName: "Servis vozidel", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  tyres: { moduleKey: "tyres", moduleName: "Pneumatiky", repoKey: "kaiser-pneu-evidence", productionUrl: "https://kaiser-smart.github.io/kaiser-pneu-evidence/" },
  "collection-routes": { moduleKey: "collection-routes", moduleName: "Svozové trasy", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  "sampling-routes": { moduleKey: "sampling-routes", moduleName: "Odběrové trasy", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  vistos: { moduleKey: "vistos", moduleName: "Zákazníci / Vistos", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  costs: { moduleKey: "costs", moduleName: "Náklady", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  receivables: { moduleKey: "receivables", moduleName: "Nezaplacené faktury", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  reports: { moduleKey: "reports", moduleName: "Reporty", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  users: { moduleKey: "users", moduleName: "Uživatelé a role", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  settings: { moduleKey: "settings", moduleName: "Nastavení", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  "system-check": { moduleKey: "system-check", moduleName: "Stav systému", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  "self-repair": { moduleKey: "self-repair", moduleName: "Samoopravy", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  absence: { moduleKey: "absence", moduleName: "Nepřítomnosti", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl },
  feedback: { moduleKey: "feedback", moduleName: "Úkoly a připomínky", repoKey: "kaiser-control-center", productionUrl: DEFAULT_TARGET.productionUrl }
});

const ALIASES = Object.freeze({
  "vozovy-park": "fleet",
  "sledovani-vozidel": "vehicle-tracking",
  "datove-schranky-plus": "data-box-plus",
  "hlaseni-ridicu": "driver-reports",
  "servis-udrzba": "service-maintenance",
  pneumatiky: "tyres",
  "trasy-svozu": "collection-routes",
  "trasy-vzorku": "sampling-routes",
  zakaznici: "vistos",
  naklady: "costs",
  pohledavky: "receivables",
  reporty: "reports",
  uzivatele: "users",
  nastaveni: "settings",
  "kontrola-systemu": "system-check",
  samoopravy: "self-repair",
  "dovolena-nemoc": "absence",
  pripominky: "feedback"
});

function cleanKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function selfRepairTargetOptions() {
  return Object.values(TARGETS).map((target) => ({ ...target }));
}

export function resolveSelfRepairTarget(value) {
  const cleaned = cleanKey(value);
  const moduleKey = ALIASES[cleaned] || cleaned;
  const target = TARGETS[moduleKey];

  if (!target) {
    return null;
  }

  return { ...target };
}

export function targetForSelfRepairReport(value) {
  return resolveSelfRepairTarget(value) || null;
}
