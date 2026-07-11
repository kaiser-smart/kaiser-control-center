export const dashboardParityContract = {
  id: "dashboard-home",
  sourceRoute: "/",
  neumorphRoute: "/neumorph/",
  requiredSectionOrder: [
    "hero",
    "module-grid",
    "version-news",
    "version-backup"
  ],
  requiredActions: [
    "module-card-links",
    "logout"
  ],
  requiredLinks: [
    "moduleItem.route",
    "quickAbsenceMenuItem.route",
    "feedbackMenuItem.route"
  ],
  requiredPermissions: [
    "filterModulesByUser",
    "canViewModule",
    "hasPermission(absence:create)",
    "canViewModule(feedback)"
  ],
  requiredDataSources: [
    "modules",
    "quickAbsenceMenuItem",
    "feedbackMenuItem",
    "dataBoxTotalUnreadCount",
    "VersionNewsInfo",
    "VersionBackupInfo"
  ]
};

function missingItems(source = [], expected = []) {
  const sourceSet = new Set(source);
  return expected.filter((item) => !sourceSet.has(item));
}

export function validateDashboardParityContract(contract = dashboardParityContract) {
  const errors = [];

  if (contract.sourceRoute !== "/") {
    errors.push("Dashboard parity source route must be /.");
  }

  if (contract.neumorphRoute !== "/neumorph/") {
    errors.push("Dashboard parity neumorph route must be /neumorph/.");
  }

  const requiredSections = ["hero", "module-grid", "version-news", "version-backup"];
  const missingSections = missingItems(contract.requiredSectionOrder, requiredSections);

  if (missingSections.length) {
    errors.push(`Dashboard parity contract is missing sections: ${missingSections.join(", ")}.`);
  }

  const requiredActions = ["module-card-links", "logout"];
  const missingActions = missingItems(contract.requiredActions, requiredActions);

  if (missingActions.length) {
    errors.push(`Dashboard parity contract is missing actions: ${missingActions.join(", ")}.`);
  }

  const requiredDataSources = ["modules", "VersionNewsInfo", "VersionBackupInfo"];
  const missingDataSources = missingItems(contract.requiredDataSources, requiredDataSources);

  if (missingDataSources.length) {
    errors.push(`Dashboard parity contract is missing data sources: ${missingDataSources.join(", ")}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    contract
  };
}

export function validateDashboardParityViewModel(viewModel = {}) {
  const baseValidation = validateDashboardParityContract();
  const errors = [...baseValidation.errors];
  const expectedOrder = dashboardParityContract.requiredSectionOrder;
  const sectionOrder = Array.isArray(viewModel.sectionOrder) ? viewModel.sectionOrder : [];

  if (sectionOrder.join("|") !== expectedOrder.join("|")) {
    errors.push("Dashboard parity section order does not match the original home flow.");
  }

  if (!Array.isArray(viewModel.moduleCards) || !viewModel.moduleCards.length) {
    errors.push("Dashboard parity requires module cards sourced from the original home dashboard.");
  }

  if (viewModel.moduleCards?.some((card) => !card.sourceRoute || !card.href)) {
    errors.push("Dashboard parity module cards must keep original source routes and rendered links.");
  }

  if (viewModel.moduleCards?.some((card) => String(card.sourceRoute || "").startsWith("/neumorph"))) {
    errors.push("Dashboard parity module cards must not replace original targets with neumorph routes.");
  }

  if (Number(viewModel.moduleCount) !== Number(viewModel.moduleCards?.length || 0)) {
    errors.push("Dashboard parity module count must match rendered original module cards.");
  }

  return {
    ok: errors.length === 0,
    errors,
    contract: dashboardParityContract
  };
}

export function assertDashboardParityViewModel(viewModel) {
  const validation = validateDashboardParityViewModel(viewModel);

  if (!validation.ok) {
    throw new Error(`Dashboard parity validation failed: ${validation.errors.join(" ")}`);
  }

  return validation;
}
