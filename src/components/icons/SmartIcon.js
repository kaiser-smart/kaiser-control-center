import { iconDefinitions } from "./definitions.js";
import { createSvgIcon } from "./createSvgIcon.js";

const cache = new Map();
// Names are application-owned constants. Never interpolate user HTML into an icon.
export function SmartIcon(name) {
  if (!Object.hasOwn(iconDefinitions, name)) throw new Error(`Unknown SMART ODPADY icon: ${name}`);
  if (!cache.has(name)) {
    const [outline, accent] = iconDefinitions[name];
    cache.set(name, createSvgIcon(`${outline}<g data-icon-accent fill="#75BD25">${accent}</g>`, name));
  }
  return cache.get(name);
}

export const moduleIconNames = Object.freeze({
  dashboard: "dashboard", fleet: "fleet", jobs: "jobs", "vehicle-tracking": "tracking",
  "data-box-plus": "mail", "driver-reports": "jobs", "service-maintenance": "service",
  tyres: "tyres", "collection-routes": "routes", "sampling-routes": "sampling",
  vistos: "customers", costs: "costs", receivables: "invoice", reports: "reports",
  "rcs-sms-autopilot": "message", employees: "team", absence: "absence",
  users: "users", settings: "settings", "system-check": "system",
  "self-repair": "repair", feedback: "warning", "quick-absence": "absence"
});
export function ModuleIcon(id) { return SmartIcon(moduleIconNames[id] || "modules"); }
