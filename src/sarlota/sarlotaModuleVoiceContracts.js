import { COLLECTION_ROUTES_OPERATIONAL_CONTRACT } from "../data/collectionRoutesOperationalContract.js";

const MODULE_VOICE_CONTRACTS = Object.freeze([
  Object.freeze({
    id: COLLECTION_ROUTES_OPERATIONAL_CONTRACT.id,
    ...COLLECTION_ROUTES_OPERATIONAL_CONTRACT.voice
  })
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizedRoute(value) {
  const route = cleanString(value).split(/[?#]/, 1)[0] || "/";
  return route.length > 1 ? route.replace(/\/+$/, "") : route;
}

export function resolveSarlotaModuleVoiceContract(route) {
  const currentRoute = normalizedRoute(route);
  return MODULE_VOICE_CONTRACTS.find((contract) => (
    currentRoute === contract.routePrefix || currentRoute.startsWith(`${contract.routePrefix}/`)
  )) || null;
}

export function validateSarlotaModuleVoiceVariables(route, variables = {}) {
  const contract = resolveSarlotaModuleVoiceContract(route);
  if (!contract) {
    return {
      registered: false,
      ready: true,
      contractId: "",
      introSource: "generic"
    };
  }

  const expectedRoute = normalizedRoute(route);
  const actualRoute = normalizedRoute(variables.current_module_route);
  const moduleMatches = cleanString(variables.current_module) === contract.currentModule;
  const routeMatches = actualRoute === expectedRoute;
  const introPresent = Boolean(cleanString(variables[contract.introVariable]));
  let contextMatches = false;

  try {
    const context = JSON.parse(cleanString(variables.current_module_context) || "{}");
    contextMatches = cleanString(context.module) === contract.currentModule
      && normalizedRoute(context.route) === expectedRoute;
  } catch {
    contextMatches = false;
  }

  return {
    registered: true,
    ready: moduleMatches && routeMatches && introPresent && contextMatches,
    contractId: contract.id,
    introSource: contract.introSource,
    moduleMatches,
    routeMatches,
    introPresent,
    contextMatches
  };
}
