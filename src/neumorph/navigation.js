export const NEUMORPH_NAV_GROUPS = [
  {
    id: "overview",
    label: "Prehled",
    items: [
      {
        id: "system-preview",
        label: "Systemovy nahled",
        href: "/neumorph",
        icon: "dashboard",
        active: true
      },
      {
        id: "components",
        label: "Komponenty",
        href: "/neumorph#components",
        icon: "components",
        active: false
      }
    ]
  },
  {
    id: "pilots",
    label: "Pripravene piloty",
    items: [
      {
        id: "collection-routes",
        label: "Trasy svozu",
        icon: "route",
        planned: true
      },
      {
        id: "dashboard",
        label: "Dashboard",
        icon: "chart",
        planned: true
      }
    ]
  }
];
