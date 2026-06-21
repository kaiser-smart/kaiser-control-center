import {
  CollectionRoutesIcon,
  CostsIcon,
  DashboardIcon,
  DriverReportsIcon,
  FleetIcon,
  ReportsIcon,
  SamplingRoutesIcon,
  ServiceMaintenanceIcon,
  SettingsIcon,
  TyresIcon,
  UsersRolesIcon,
  VistosIcon
} from "../components/icons/index.js";

export const modules = [
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Celkový přehled provozu, závad, nákladů a tras.",
    route: "/dashboard",
    icon: DashboardIcon,
    status: "připraveno",
    active: true,
    disabled: false,
    order: 1
  },
  {
    id: "fleet",
    title: "Vozový park",
    description: "Evidence vozidel, stav techniky, STK, revize a historie.",
    route: "/vozovy-park",
    dashboardRoute: "/vozovy-park/dashboard",
    icon: FleetIcon,
    status: "skeleton",
    active: true,
    disabled: false,
    order: 2
  },
  {
    id: "driver-reports",
    title: "Hlášení řidičů",
    description: "Rychlé nahlášení závady: fotka, popis, odeslání.",
    route: "/hlaseni-ridicu",
    dashboardRoute: "/hlaseni-ridicu/dashboard",
    icon: DriverReportsIcon,
    status: "skeleton",
    active: true,
    disabled: false,
    order: 3
  },
  {
    id: "service-maintenance",
    title: "Servis a údržba",
    description: "Opravy, údržba, plánované servisy a servisní náklady.",
    route: "/servis-udrzba",
    dashboardRoute: "/servis-udrzba/dashboard",
    icon: ServiceMaintenanceIcon,
    status: "skeleton",
    active: true,
    disabled: false,
    order: 4
  },
  {
    id: "tyres",
    title: "Pneumatiky",
    description: "Hotový modul evidence pneumatik, dezénu, tlaku a nákladů.",
    route: "/pneumatiky",
    icon: TyresIcon,
    status: "HOTOVO",
    active: true,
    disabled: false,
    order: 5
  },
  {
    id: "collection-routes",
    title: "Trasy svozu",
    description: "Denní svozové trasy, zastávky, nádoby a navigace.",
    route: "/trasy-svozu",
    dashboardRoute: "/trasy-svozu/dashboard",
    icon: CollectionRoutesIcon,
    status: "skeleton",
    active: true,
    disabled: false,
    order: 6
  },
  {
    id: "sampling-routes",
    title: "Trasy vzorků",
    description: "Plánování tras pro odběr vzorků odpadních vod.",
    route: "/trasy-vzorku",
    dashboardRoute: "/trasy-vzorku/dashboard",
    icon: SamplingRoutesIcon,
    status: "skeleton",
    active: true,
    disabled: false,
    order: 7
  },
  {
    id: "vistos",
    title: "Zákazníci / Vistos",
    description: "Smlouvy, adresy, služby a budoucí napojení na myvistos.com.",
    route: "/vistos",
    dashboardRoute: "/vistos/dashboard",
    icon: VistosIcon,
    status: "skeleton",
    active: true,
    disabled: false,
    order: 8
  },
  {
    id: "costs",
    title: "Náklady",
    description: "Přehled nákladů podle vozidel, dodavatelů a období.",
    route: "/naklady",
    dashboardRoute: "/naklady/dashboard",
    icon: CostsIcon,
    status: "skeleton",
    active: true,
    disabled: false,
    order: 9
  },
  {
    id: "reports",
    title: "Reporty",
    description: "Provozní reporty, exporty, přehledy a vyhodnocení.",
    route: "/reporty",
    dashboardRoute: "/reporty/dashboard",
    icon: ReportsIcon,
    status: "skeleton",
    active: true,
    disabled: false,
    order: 10
  },
  {
    id: "users",
    title: "Uživatelé a role",
    description: "Řidiči, garážmistři, management, admin a oprávnění.",
    route: "/uzivatele",
    dashboardRoute: "/uzivatele/dashboard",
    icon: UsersRolesIcon,
    status: "skeleton",
    active: true,
    disabled: false,
    order: 11
  },
  {
    id: "settings",
    title: "Nastavení",
    description: "Číselníky, notifikace, integrace, API a audit log.",
    route: "/nastaveni",
    dashboardRoute: "/nastaveni/dashboard",
    icon: SettingsIcon,
    status: "skeleton",
    active: true,
    disabled: false,
    order: 12
  }
];

export const moduleDashboards = modules
  .filter((moduleItem) => Boolean(moduleItem.dashboardRoute))
  .map((moduleItem) => ({
    ...moduleItem,
    route: moduleItem.dashboardRoute,
    pageTitle: `${moduleItem.title} dashboard`,
    description: `Připravená struktura pro budoucí dashboard modulu ${moduleItem.title}.`
  }));
