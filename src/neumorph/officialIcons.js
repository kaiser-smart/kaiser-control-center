const OFFICIAL_ICON_FILES = {
  dashboard: "001.svg",
  "quick-entry": "002.svg",
  route: "003.svg",
  driver: "004.svg",
  fleet: "005.svg",
  location: "006.svg",
  service: "007.svg",
  tyre: "008.svg",
  users: "009.svg",
  sampling: "010.svg",
  mail: "011.svg",
  absence: "012.svg",
  reports: "013.svg",
  alerts: "014.svg",
  costs: "015.svg",
  customers: "016.svg",
  settings: "017.svg",
  tracking: "018.svg",
  "system-check": "019.svg",
  components: "020.svg",
  module: "020.svg",
  feedback: "013.svg"
};

export function officialIconFile(name) {
  return OFFICIAL_ICON_FILES[name] || "";
}

export function renderOfficialIconAsset(name, className = "module-icon__svg") {
  const file = officialIconFile(name);

  if (!file) {
    return "";
  }

  return `<img class="${className}" src="/design-icons/${file}" alt="" aria-hidden="true" loading="lazy">`;
}

